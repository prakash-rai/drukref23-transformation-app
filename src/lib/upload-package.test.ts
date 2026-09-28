import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { createSubmissionPackage, inspectRootFiles, type DatasetEntry, validateShapefile } from './upload-package'
import { CUSTOM_TRANSFORMATION, SOURCE_WKID, TARGET_WKID } from './transformation'

function file(name: string, size = 1) { return new File([new Uint8Array(size)], name) }

describe('Shapefile inspection', () => {
  it('accepts a complete Shapefile with normalized paths', () => {
    expect(() => validateShapefile([file('survey\\roads.shp'), file('survey/roads.shx'), file('roads.dbf'), file('roads.prj')])).not.toThrow()
  })

  it('reports missing required sidecars', () => {
    expect(() => validateShapefile([file('roads.shp'), file('roads.dbf')])).toThrow('Missing required files: .shx, .prj')
  })

  it('scans immediate files and reports nested, ZIP, and GeoJSON files as ignored', () => {
    const result = inspectRootFiles([file('roads.shp'), file('roads.shx'), file('roads.dbf'), file('roads.prj'), file('notes.txt'), file('locations.geojson'), file('nested/other.shp'), file('more.zip')], 'survey')
    expect(result.datasets).toHaveLength(1)
    expect(result.ignoredFiles).toEqual(expect.arrayContaining(['notes.txt', 'locations.geojson', 'other.shp', 'more.zip']))
  })

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
