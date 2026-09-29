import { AlertTriangle, FilePlus2, FolderOpen } from 'lucide-react'
import { sourceCoordinateSystem } from '#/lib/transformation'

/** Which add action to use for each kind of data, kept visible above the dataset list. */
export function UploadInstructions() {
  return (
    <section aria-labelledby="upload-instructions-title" className="mb-5 rounded-xl border border-[#c9dccb] bg-[#f2f6ef] px-5 py-4 text-[#17251f]">
      <h2 id="upload-instructions-title" className="text-sm font-semibold text-[#173c34]">What you can add</h2>
      <p className="mt-0.5 text-xs leading-5 text-[#56655c]">All data must be in <strong className="font-semibold text-[#173c34]">{sourceCoordinateSystem}</strong>. Datasets in any other coordinate system are rejected.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-[#d7ddd5] bg-white px-4 py-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-[#173c34]"><FilePlus2 size={14} aria-hidden="true" />Add files</h3>
          <p className="mt-0.5 text-xs text-[#56655c]">For GeoPackages and ZIP files</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-[#56655c]">
            <li>A GeoPackage (.gpkg)</li>
            <li>A ZIP of GeoPackages or Shapefiles. The files can be at the top of the ZIP or inside one folder.</li>
          </ul>
        </div>
        <div className="min-w-0 rounded-lg border border-[#d7ddd5] bg-white px-4 py-3">
          <h3 className="flex items-center gap-2 text-xs font-semibold text-[#173c34]"><FolderOpen size={14} aria-hidden="true" />Add folder</h3>
          <p className="mt-0.5 text-xs text-[#56655c]">For Shapefiles that aren’t zipped</p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-[#56655c]">
            <li>Choose the folder that holds the Shapefiles. Each one needs its .shp, .shx, .dbf and .prj files.</li>
            <li>Subfolders aren’t read. Add each one separately.</li>
          </ul>
        </div>
      </div>
      <p className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" /><span><strong className="font-semibold">GeoJSON isn’t supported.</strong> It doesn’t record which coordinate system it uses, so the data can’t be checked. Export it as a GeoPackage or Shapefile in DrukRef03 first.</span></p>
    </section>
  )
}
