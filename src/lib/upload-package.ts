import JSZip from 'jszip'
import { applyProjectionCheck } from './projection-check'
import { CUSTOM_TRANSFORMATION, SOURCE_WKID, TARGET_WKID } from './transformation'

export type DatasetItem = {
  id: string
  name: string
  kind: 'shapefile' | 'geopackage'
  files: File[]
  size: number
  status: 'accepted' | 'rejected'
  reason?: string
  /** Accepted, but the coordinate system could not be confirmed as DrukRef03 before upload. */
  caution?: string
  included: boolean
}

export type IgnoredReason = 'subfolder' | 'zip' | 'unsupported'
export type IgnoredFile = { name: string; reason: IgnoredReason }

export type DatasetEntry = { id: string; file: File; kind: 'collection'; datasets: DatasetItem[]; ignoredFiles: IgnoredFile[]; sourceName: string }

function fileName(name: string) { return name.split(/[\\/]/).pop() ?? name }
function stem(name: string) { return fileName(name).replace(/\.[^.]+$/, '').toLowerCase() }
function safeName(name: string) { return name.replace(/[^a-zA-Z0-9._-]/g, '_') }
function mb(size: number) { return `${(size / 1024 / 1024).toFixed(2)} MB` }

const standalone = /\.gpkg$/i
const sidecar = /\.(shp|shx|dbf|prj|cpg|sbn|sbx)$/i

export function validateShapefile(files: File[]) {
  const names = new Set(files.map((file) => fileName(file.name).toLowerCase()))
  const shp = files.find((file) => fileName(file.name).toLowerCase().endsWith('.shp'))
  if (!shp) throw new Error('Missing .shp file.')
  const name = stem(shp.name)
  const missing = ['.shp', '.shx', '.dbf', '.prj'].filter((extension) => !names.has(`${name}${extension}`))
  if (missing.length) throw new Error(`Missing required files: ${missing.join(', ')}`)
}

const manifestName = 'project-manifest.json'
const isNested = (name: string) => name.includes('/') || name.includes('\\')
const normalizePath = (name: string) => name.replace(/\\/g, '/')

function uniqueIgnored(files: IgnoredFile[]) {
  const seen = new Set<string>()
  return files.filter((file) => { const key = `${file.reason}:${file.name}`; if (seen.has(key)) return false; seen.add(key); return true })
}

/** Scans only files at the selected package root. Nested folders are intentionally ignored. */
export function inspectRootFiles(files: File[], sourceName: string) {
  const ignoredFiles: IgnoredFile[] = files.filter((file) => isNested(file.name)).map((file) => ({ name: normalizePath(file.name), reason: 'subfolder' }))
  const rootFiles = files.filter((file) => !isNested(file.name) && file.name.toLowerCase() !== manifestName)
  ignoredFiles.push(...rootFiles.filter((file) => file.name.toLowerCase().endsWith('.zip')).map((file): IgnoredFile => ({ name: file.name, reason: 'zip' })))
  const dataFiles = rootFiles.filter((file) => !file.name.toLowerCase().endsWith('.zip'))
  const datasets: DatasetItem[] = []
  const shapefileNames = Array.from(new Set(dataFiles.filter((file) => file.name.toLowerCase().endsWith('.shp')).map((file) => stem(file.name))))

  for (const name of shapefileNames) {
    const filesForShape = dataFiles.filter((file) => sidecar.test(file.name) && stem(file.name) === name)
    const shp = filesForShape.find((file) => file.name.toLowerCase().endsWith('.shp'))!
    let reason: string | undefined
    try { validateShapefile(filesForShape) } catch (cause) { reason = cause instanceof Error ? cause.message : 'Incomplete Shapefile.' }
    datasets.push({ id: crypto.randomUUID(), name: shp.name, kind: 'shapefile', files: filesForShape, size: filesForShape.reduce((sum, file) => sum + file.size, 0), status: reason ? 'rejected' : 'accepted', reason, included: !reason })
  }

  for (const file of dataFiles) {
    if (!standalone.test(file.name)) continue
    datasets.push({ id: crypto.randomUUID(), name: file.name, kind: 'geopackage', files: [file], size: file.size, status: 'accepted', included: true })
  }

  const recognized = new Set(datasets.flatMap((dataset) => dataset.files))
  ignoredFiles.push(...dataFiles.filter((file) => !recognized.has(file)).map((file): IgnoredFile => ({ name: file.name, reason: 'unsupported' })))
  return { datasets, ignoredFiles: uniqueIgnored(ignoredFiles), sourceName }
}

/**
 * Archive paths to read as the package root. A ZIP made by compressing a folder holds everything
 * under one top-level folder, so that folder is treated as the root. OS metadata is skipped.
 */
export function zipRootPaths(paths: string[]) {
  const entries = paths.map(normalizePath).filter((path) => !path.startsWith('__MACOSX/') && fileName(path) !== '.DS_Store')
  const first = entries[0]?.split('/')[0]
  const wrapped = first !== undefined && entries.every((path) => path.includes('/') && path.split('/')[0] === first)
  return entries.map((path) => ({ path, relative: wrapped ? path.slice(first.length + 1) : path }))
}

export async function inspectZip(file: File) {
  const archive = await JSZip.loadAsync(await file.arrayBuffer())
  const files: File[] = []
  const ignoredFiles: IgnoredFile[] = []
  for (const { path, relative } of zipRootPaths(Object.values(archive.files).filter((entry) => !entry.dir).map((entry) => entry.name))) {
    if (isNested(relative)) { ignoredFiles.push({ name: relative, reason: 'subfolder' }); continue }
    if (relative.toLowerCase().endsWith('.zip')) { ignoredFiles.push({ name: relative, reason: 'zip' }); continue }
    files.push(new File([await archive.file(path)!.async('blob')], relative))
  }
  const inspected = inspectRootFiles(files, file.name)
  return { ...inspected, ignoredFiles: uniqueIgnored([...inspected.ignoredFiles, ...ignoredFiles]) }
}

/** Runs the DrukRef03 pre-check on every dataset of an inspection result. */
export async function checkProjections<T extends { datasets: DatasetItem[] }>(result: T, check: (dataset: DatasetItem) => Promise<DatasetItem> = applyProjectionCheck): Promise<T> {
  return { ...result, datasets: await Promise.all(result.datasets.map((dataset) => check(dataset))) }
}

export async function createSubmissionPackage(entries: DatasetEntry[]) {
  const zip = new JSZip()
  const manifest: Array<Record<string, unknown>> = []
  for (const entry of entries) {
    for (const dataset of entry.datasets.filter((item) => item.status === 'accepted' && item.included)) {
      const folder = `${safeName(entry.sourceName)}/${safeName(stem(dataset.name))}`
      for (const file of dataset.files) zip.file(`${folder}/${fileName(file.name)}`, await file.arrayBuffer())
      manifest.push({ name: dataset.name, format: dataset.kind, files: dataset.files.map((file) => fileName(file.name)) })
    }
  }
  zip.file('project-manifest.json', JSON.stringify({ version: 2, sourceWkid: SOURCE_WKID, targetWkid: TARGET_WKID, transformation: CUSTOM_TRANSFORMATION, datasets: manifest }, null, 2))
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

export { fileName, mb }
