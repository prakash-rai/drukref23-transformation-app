import { Ban, FilePlus2, FolderOpen } from 'lucide-react'
import { sourceCoordinateSystem } from '#/lib/transformation'

const term = 'flex items-center gap-1.5 self-start whitespace-nowrap font-semibold text-[#173c34]'

/** Which add action takes which data, kept visible above the dataset list. */
export function UploadInstructions() {
  return (
    <dl aria-label="What each add action accepts" className="mb-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs leading-5 text-[#56655c]">
      <dt className={term}><FilePlus2 size={13} aria-hidden="true" />Add files</dt>
      <dd>GeoPackage (.gpkg), or a ZIP of GeoPackages or Shapefiles</dd>
      <dt className={term}><FolderOpen size={13} aria-hidden="true" />Add folder</dt>
      <dd>Unzipped Shapefiles (.shp, .shx, .dbf, .prj). Subfolders aren’t read.</dd>
    </dl>
  )
}

export function SourceRequirement() {
  return <p className="mt-1 text-xs leading-5 text-[#56655c]">Data must be in <strong className="whitespace-nowrap font-semibold text-[#173c34]">{sourceCoordinateSystem}</strong>.</p>
}

export function UnsupportedFormats() {
  return <p className="flex gap-1.5 text-xs leading-5 text-amber-900"><Ban size={13} className="mt-1 shrink-0 text-amber-600" aria-hidden="true" /><span><strong className="font-semibold text-amber-800">Not supported:</strong> GeoJSON, which doesn’t record its coordinate system</span></p>
}
