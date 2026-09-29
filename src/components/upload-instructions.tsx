import { AlertTriangle, FilePlus2, FolderOpen } from 'lucide-react'
import { sourceCoordinateSystem } from '#/lib/transformation'

/** What each add action accepts, shown before any dataset is added. */
export function UploadInstructions() {
  return (
    <div className="rounded-xl border border-dashed border-[#b9cbbd] bg-[#f2f6ef] px-5 py-6 text-sm text-[#17251f]">
      <p className="font-semibold text-[#173c34]">No datasets added</p>
      <p className="mt-1 text-xs text-[#56655c]">Source data must be in <strong className="font-semibold text-[#173c34]">{sourceCoordinateSystem}</strong>.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <section className="min-w-0 rounded-lg border border-[#d7ddd5] bg-white px-4 py-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-[#173c34]"><FilePlus2 size={14} />Add files</h3>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-[#56655c]">
            <li>GeoPackage (.gpkg)</li>
            <li>ZIP containing GeoPackages or complete Shapefiles, at the top level or in one folder</li>
          </ul>
        </section>
        <section className="min-w-0 rounded-lg border border-[#d7ddd5] bg-white px-4 py-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-[#173c34]"><FolderOpen size={14} />Add folder</h3>
          <ul className="mt-2 space-y-1 text-xs leading-5 text-[#56655c]">
            <li>Shapefiles with .shp, .shx, .dbf and .prj</li>
            <li>Only files directly in the folder are read; add subfolders separately</li>
          </ul>
        </section>
      </div>
      <p className="mt-3 flex gap-1.5 text-xs leading-5 text-amber-800"><AlertTriangle size={13} className="mt-1 shrink-0 text-amber-600" />GeoJSON isn’t supported because it doesn’t record its source projection.</p>
    </div>
  )
}
