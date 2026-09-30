import { describe, expect, it } from 'vitest'
import { classifySelection, splitDirectorySelection } from './file-check'

function file(name: string, relativePath?: string) {
  const result = new File([''], name)
  if (relativePath) Object.defineProperty(result, 'webkitRelativePath', { value: relativePath })
  return result
}
const names = (files: File[]) => files.map((item) => item.name)

describe('Add files selection', () => {
  it('routes ZIPs, GeoPackages and complete Shapefile sets to inspection', () => {
    const result = classifySelection([file('a.zip'), file('b.gpkg'), file('roads.shp'), file('roads.shx'), file('roads.dbf'), file('roads.prj'), file('roads.cpg')])
    expect(names(result.zips)).toEqual(['a.zip'])
    expect(names(result.datasetFiles)).toEqual(['b.gpkg', 'roads.shp', 'roads.shx', 'roads.dbf', 'roads.prj', 'roads.cpg'])
    expect(result.notices).toEqual([])
  })

  it('explains an incomplete Shapefile and how to add it', () => {
    const { datasetFiles, notices } = classifySelection([file('roads.shp'), file('roads.dbf')])
    expect(datasetFiles).toEqual([])
    expect(notices).toEqual([{ kind: 'shapefile-part', files: ['roads.shp', 'roads.dbf'], message: 'roads.shp and roads.dbf are part of a Shapefile (missing .shx, .prj). Zip all of its files (.shp, .shx, .dbf, .prj) and add the ZIP, or use Add folder to pick them up automatically.' }])
  })

  it('explains a single sidecar without its .shp', () => {
    expect(classifySelection([file('roads.prj')]).notices[0]).toMatchObject({ kind: 'shapefile-part', message: expect.stringMatching(/^roads\.prj is part of a Shapefile \(missing \.shp, \.shx, \.dbf\)/) })
  })

  it('groups unsupported files by reason', () => {
    const { notices } = classifySelection([file('a.geojson'), file('b.json'), file('c.kml'), file('e.kmz'), file('d.csv')])
    expect(notices).toEqual([
      { kind: 'unsupported', files: ['a.geojson', 'b.json'], message: 'GeoJSON isn’t supported because it doesn’t support DrukRef03. Export it as a GeoPackage or Shapefile in DrukRef03 first.' },
      { kind: 'unsupported', files: ['c.kml', 'e.kmz'], message: 'KML isn’t supported because it doesn’t support DrukRef03. Export it as a GeoPackage or Shapefile in DrukRef03 first.' },
      { kind: 'unsupported', files: ['d.csv'], message: expect.stringContaining('This format isn’t supported') },
    ])
  })

  it('never treats project-manifest.json as input', () => {
    expect(classifySelection([file('project-manifest.json')])).toEqual({ zips: [], datasetFiles: [], notices: [] })
  })
})

describe('folder fallback selection', () => {
  it('keeps immediate files and reports each child folder once', () => {
    const result = splitDirectorySelection([file('roads.shp', 'survey/roads.shp'), file('a.shp', 'survey/old/a.shp'), file('b.shp', 'survey/old/deep/b.shp')])
    expect(result.folderName).toBe('survey')
    expect(names(result.rootFiles)).toEqual(['roads.shp'])
    expect(result.ignoredFiles).toEqual([{ name: 'old/', reason: 'subfolder' }])
  })
})
