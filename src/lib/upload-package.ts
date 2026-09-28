import JSZip from 'jszip'
import { CUSTOM_TRANSFORMATION, SOURCE_WKID, TARGET_WKID } from './transformation'

export type DatasetItem = {
  id: string
  name: string
  kind: 'shapefile' | 'geopackage'
  files: File[]
  size: number
  status: 'accepted' | 'rejected'
  reason?: string
  included: boolean
}

export type DatasetEntry =
  | { id: string; file: File; kind: 'file' }
  | { id: string; file: File; kind: 'collection'; datasets: DatasetItem[]; ignoredFiles: string[]; sourceName: string }

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

/** Scans only files at the selected package root. Nested folders are intentionally ignored. */
export function inspectRootFiles(files: File[], sourceName: string) {
  const rootFiles = files.filter((file) => !file.name.includes('/') && !file.name.includes('\\'))
  const ignoredFiles = files.filter((file) => file.name.includes('/') || file.name.includes('\\') || file.name.toLowerCase().endsWith('.zip')).map((file) => fileName(file.name))
  const dataFiles = rootFiles.filter((file) => !file.name.toLowerCase().endsWith('.zip'))
  const datasets: DatasetItem[] = []
  const shapefileNames = Array.from(new Set(dataFiles.filter((file) => fileName(file.name).toLowerCase().endsWith('.shp')).map((file) => stem(file.name))))

  for (const name of shapefileNames) {
    const filesForShape = dataFiles.filter((file) => sidecar.test(fileName(file.name)) && stem(file.name) === name)
    const shp = filesForShape.find((file) => fileName(file.name).toLowerCase().endsWith('.shp'))!
    let reason: string | undefined
    try { validateShapefile(filesForShape) } catch (cause) { reason = cause instanceof Error ? cause.message : 'Incomplete Shapefile.' }
    datasets.push({ id: crypto.randomUUID(), name: fileName(shp.name), kind: 'shapefile', files: filesForShape, size: filesForShape.reduce((sum, file) => sum + file.size, 0), status: reason ? 'rejected' : 'accepted', reason, included: !reason })
  }

  for (const file of dataFiles) {
    const name = fileName(file.name)
    if (!standalone.test(name) || name.toLowerCase().endsWith('.json') && name === 'project-manifest.json' || sidecar.test(name)) continue
    datasets.push({ id: crypto.randomUUID(), name, kind: 'geopackage', files: [file], size: file.size, status: 'accepted', included: true })
  }

  const recognized = new Set(datasets.flatMap((dataset) => dataset.files.map((file) => file.name)))
  ignoredFiles.push(...dataFiles.filter((file) => !recognized.has(file.name)).map((file) => fileName(file.name)))
  return { datasets, ignoredFiles: Array.from(new Set(ignoredFiles)), sourceName }
}

export async function inspectZip(file: File) {
  const archive = await JSZip.loadAsync(await file.arrayBuffer())
  const files: File[] = []
  const ignoredFiles: string[] = []
  for (const [path, entry] of Object.entries(archive.files)) {
    if (entry.dir) continue
    const parts = path.split(/[\\/]/)
    if (parts.length !== 1) continue
    if (path.toLowerCase().endsWith('.zip')) { ignoredFiles.push(fileName(path)); continue }
    files.push(new File([await entry.async('blob')], fileName(path)))
  }
  const inspected = inspectRootFiles(files, file.name)
  return { ...inspected, ignoredFiles: Array.from(new Set([...inspected.ignoredFiles, ...ignoredFiles])) }
}

export async function createSubmissionPackage(entries: DatasetEntry[]) {
  const zip = new JSZip()
  const manifest: Array<Record<string, unknown>> = []
  for (const entry of entries) {
    if (entry.kind === 'collection') {
      for (const dataset of entry.datasets.filter((item) => item.status === 'accepted' && item.included)) {
        const folder = `${safeName(entry.sourceName)}/${safeName(stem(dataset.name))}`
        for (const file of dataset.files) zip.file(`${folder}/${fileName(file.name)}`, await file.arrayBuffer())
        manifest.push({ name: dataset.name, format: dataset.kind, files: dataset.files.map((file) => fileName(file.name)) })
      }
    } else {
      zip.file(safeName(entry.file.name), await entry.file.arrayBuffer())
      manifest.push({ name: entry.file.name, format: entry.file.name.split('.').pop()?.toLowerCase() })
    }
  }
  zip.file('project-manifest.json', JSON.stringify({ version: 2, sourceWkid: SOURCE_WKID, targetWkid: TARGET_WKID, transformation: CUSTOM_TRANSFORMATION, datasets: manifest }, null, 2))
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

export { fileName, mb }
