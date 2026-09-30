import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { checkProjections, createSubmissionPackage, inspectRootFiles, inspectZip, zipRootPaths, type DatasetEntry, validateShapefile } from './upload-package'
import { CUSTOM_TRANSFORMATION, SOURCE_WKID, TARGET_WKID } from './transformation'

function file(name: string, size = 1) { return new File([new Uint8Array(size)], name) }

describe('Shapefile inspection', () => {
  it('accepts a complete Shapefile with normalized paths', () => {
    expect(() => validateShapefile([file('survey\\roads.shp'), file('survey/roads.shx'), file('roads.dbf'), file('roads.prj')])).not.toThrow()
  })

  it('reports missing required sidecars', () => {
    expect(() => validateShapefile([file('roads.shp'), file('roads.dbf')])).toThrow('Missing required files: .shx, .prj')
  })

  it('scans immediate files and reports why nested, ZIP, and GeoJSON files are ignored', () => {
    const result = inspectRootFiles([file('roads.shp'), file('roads.shx'), file('roads.dbf'), file('roads.prj'), file('notes.txt'), file('locations.geojson'), file('nested/other.shp'), file('more.zip'), file('project-manifest.json')], 'survey')
    expect(result.datasets).toHaveLength(1)
    expect(result.ignoredFiles).toEqual([
      { name: 'nested/other.shp', reason: 'subfolder' },
      { name: 'more.zip', reason: 'zip' },
      { name: 'notes.txt', reason: 'unsupported' },
      { name: 'locations.geojson', reason: 'unsupported' },
    ])
  })
})

describe('ZIP inspection', () => {
  it('treats a single top-level folder as the package root and skips OS metadata', () => {
    expect(zipRootPaths(['roads/roads.shp', 'roads/old/a.shp', '__MACOSX/roads/._roads.shp', 'roads/.DS_Store']).map((entry) => entry.relative)).toEqual(['roads.shp', 'old/a.shp'])
    expect(zipRootPaths(['roads.shp', 'old/a.shp']).map((entry) => entry.relative)).toEqual(['roads.shp', 'old/a.shp'])
    expect(zipRootPaths(['a/roads.shp', 'b/rivers.shp']).map((entry) => entry.relative)).toEqual(['a/roads.shp', 'b/rivers.shp'])
  })

  it('finds a Shapefile in a compressed folder and reports deeper files', async () => {
    const zip = new JSZip()
    for (const ext of ['shp', 'shx', 'dbf', 'prj']) zip.file(`roads/roads.${ext}`, 'x')
    zip.file('roads/archive/old.shp', 'x')
    zip.file('roads/extra.zip', 'x')
    const result = await inspectZip(new File([await zip.generateAsync({ type: 'blob' })], 'roads.zip'))
    expect(result.datasets.map((dataset) => [dataset.name, dataset.status])).toEqual([['roads.shp', 'accepted']])
    expect(result.ignoredFiles).toEqual([{ name: 'archive/old.shp', reason: 'subfolder' }, { name: 'extra.zip', reason: 'zip' }])
  })

  it('rejects a Shapefile whose .prj is not DrukRef03 with the default check', async () => {
    const utm = 'PROJCS["WGS_1984_UTM_Zone_45N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]]],PROJECTION["Transverse_Mercator"],UNIT["Meter",1.0]]'
    const files = [file('roads.shp'), file('roads.shx'), file('roads.dbf'), new File([utm], 'roads.prj')]
    const [dataset] = (await checkProjections(inspectRootFiles(files, 'roads'))).datasets
    expect(dataset).toMatchObject({ status: 'rejected', included: false, reason: 'Defined as WGS_1984_UTM_Zone_45N. Source data must be DrukRef03 (EPSG:5266).' })
  })

  it('applies the projection check to every dataset', async () => {
    const result = await checkProjections(inspectRootFiles([file('a.gpkg'), file('b.gpkg')], 'x'), async (dataset) => dataset.name === 'a.gpkg' ? { ...dataset, status: 'rejected', reason: 'Defined as WGS 84.', included: false } : dataset)
    expect(result.datasets.map((dataset) => dataset.status)).toEqual(['rejected', 'accepted'])
  })
})

describe('submission package', () => {

  it('declares the fixed DrukRef03 to DrukRef23 transformation in the upload manifest', async () => {
    const files = [file('roads.shp'), file('roads.shx'), file('roads.dbf'), file('roads.prj')]
    const entries: DatasetEntry[] = [{
      id: 'entry-1',
      kind: 'collection',
      file: files[0]!,
      sourceName: 'roads',
      ignoredFiles: [],
      datasets: [{ id: 'dataset-1', name: 'roads.shp', kind: 'shapefile', files, size: 4, status: 'accepted', included: true }],
    }]

    const packageBlob = await createSubmissionPackage(entries)
    const archive = await JSZip.loadAsync(await packageBlob.arrayBuffer())
    const manifest = JSON.parse(await archive.file('project-manifest.json')!.async('text'))

    expect(manifest).toMatchObject({
      version: 2,
      sourceWkid: SOURCE_WKID,
      targetWkid: TARGET_WKID,
      transformation: CUSTOM_TRANSFORMATION,
    })
  })
})
