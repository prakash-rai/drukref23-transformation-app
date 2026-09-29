import type { IgnoredFile } from './upload-package'

/** A message about selected files that could not be added as they are. */
export type FileNotice = { kind: 'shapefile-part' | 'unsupported'; files: string[]; message: string }

const requiredSidecars = ['.shp', '.shx', '.dbf', '.prj']
const shapefilePart = /\.(shp|shx|dbf|prj|cpg|sbn|sbx)$/i
const extension = (name: string) => /\.[^.]+$/.exec(name)?.[0].toLowerCase() ?? ''
const stem = (name: string) => name.replace(/\.[^.]+$/, '').toLowerCase()
const list = (names: string[]) => names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

export function unsupportedMessage(name: string) {
  const ext = extension(name)
  if (ext === '.geojson' || ext === '.json') return 'GeoJSON isn’t supported because it doesn’t record its source projection. Export the data as a GeoPackage or Shapefile in DrukRef03.'
  if (ext === '.kml' || ext === '.kmz') return 'KML isn’t supported because it is always in WGS 84, not DrukRef03.'
  return 'This format isn’t supported. Add a GeoPackage (.gpkg), a ZIP package, or a Shapefile folder.'
}

/**
 * Sorts files chosen with Add files. ZIPs are inspected one by one; GeoPackages and complete
 * Shapefile sets are inspected together; incomplete Shapefile sets and unsupported formats become
 * notices so the user learns how to add them instead of seeing a rejected dataset.
 */
export function classifySelection(files: File[]) {
  const zips: File[] = []
  const datasetFiles: File[] = []
  const notices: FileNotice[] = []
  const shapefileParts = new Map<string, File[]>()
  const unsupported = new Map<string, string[]>()

  for (const file of files) {
    const name = file.name.toLowerCase()
    if (name === 'project-manifest.json') continue
    if (name.endsWith('.zip')) zips.push(file)
    else if (name.endsWith('.gpkg')) datasetFiles.push(file)
    else if (shapefilePart.test(name)) shapefileParts.set(stem(file.name), [...(shapefileParts.get(stem(file.name)) ?? []), file])
    else {
      const message = unsupportedMessage(file.name)
      unsupported.set(message, [...(unsupported.get(message) ?? []), file.name])
    }
  }

  for (const parts of shapefileParts.values()) {
    const present = new Set(parts.map((file) => extension(file.name)))
    const missing = requiredSidecars.filter((ext) => !present.has(ext))
    if (!missing.length) { datasetFiles.push(...parts); continue }
    const names = parts.map((file) => file.name)
    notices.push({
      kind: 'shapefile-part',
      files: names,
      message: `${list(names)} ${names.length === 1 ? 'is' : 'are'} part of a Shapefile (missing ${missing.join(', ')}). Zip all of its files (${requiredSidecars.join(', ')}) and add the ZIP, or use Add folder to pick them up automatically.`,
    })
  }
  for (const [message, names] of unsupported) notices.push({ kind: 'unsupported', files: names, message })

  return { zips, datasetFiles, notices }
}

/**
 * Splits a folder chosen through `<input webkitdirectory>` (browsers without showDirectoryPicker)
 * into its immediate files, keeping the same "immediate files only" rule as the folder picker.
 */
export function splitDirectorySelection(files: File[]) {
  const withPath = files.map((file) => ({ file, parts: (file.webkitRelativePath || file.name).split('/') }))
  const folderName = withPath[0]?.parts.length && withPath[0].parts.length > 1 ? withPath[0].parts[0]! : 'Selected folder'
  const rootFiles = withPath.filter(({ parts }) => parts.length <= 2).map(({ file }) => file)
  const subfolders = Array.from(new Set(withPath.filter(({ parts }) => parts.length > 2).map(({ parts }) => `${parts[1]}/`)))
  const ignoredFiles: IgnoredFile[] = subfolders.map((name) => ({ name, reason: 'subfolder' }))
  return { folderName, rootFiles, ignoredFiles }
}
