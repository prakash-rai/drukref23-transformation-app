import { Ban, FilePlus2, FolderOpen } from 'lucide-react'
import { sourceCoordinateSystem } from '#/lib/transformation'

const term = 'flex items-center gap-1.5 self-start whitespace-nowrap font-semibold text-[#173c34]'

/** Which add action takes which data, kept visible above the dataset list. */
export function UploadInstructions() {
  return (
    <section aria-labelledby="upload-instructions-title" className="mb-5 text-xs leading-5 text-[#56655c]">
      <h2 id="upload-instructions-title" className="text-sm font-semibold text-[#173c34]">What you can add</h2>
      <p>Data must be in <strong className="font-semibold text-[#173c34]">{sourceCoordinateSystem}</strong>.</p>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
        <dt className={term}><FilePlus2 size={13} aria-hidden="true" />Add files</dt>
        <dd>GeoPackage (.gpkg), or a ZIP of GeoPackages or Shapefiles</dd>
        <dt className={term}><FolderOpen size={13} aria-hidden="true" />Add folder</dt>
        <dd>Unzipped Shapefiles (.shp, .shx, .dbf, .prj). Subfolders aren’t read.</dd>
        <dt className={`${term} text-amber-800`}><Ban size={13} className="text-amber-600" aria-hidden="true" />Not supported</dt>
        <dd className="text-amber-900">GeoJSON, which doesn’t record its coordinate system</dd>
      </dl>
    </section>
  )
}
