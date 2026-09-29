import { Ban, FilePlus2, FolderOpen } from 'lucide-react'
import { sourceCoordinateSystem } from '#/lib/transformation'

const actions = [
  { Icon: FilePlus2, label: 'Add files', detail: 'A GeoPackage (.gpkg), or a ZIP of GeoPackages or Shapefiles' },
  { Icon: FolderOpen, label: 'Add folder', detail: 'Unzipped Shapefiles (.shp, .shx, .dbf, .prj). Subfolders aren’t read.' },
]

/** Which add action takes which data, kept visible above the dataset list. */
export function UploadInstructions() {
  return (
    <ul aria-label="What each add action accepts" className="mb-6 grid gap-4 sm:grid-cols-2 sm:gap-6">
      {actions.map(({ Icon, label, detail }) => (
        <li key={label} className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e5eee4] text-[#2f6958]"><Icon size={18} /></span>
          <div className="min-w-0">
            <p className="text-[0.9375rem] font-semibold leading-6 text-[#173c34]">{label}</p>
            <p className="text-[0.9375rem] leading-[1.6] text-[#56655c]">{detail}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function SourceRequirement() {
  return <p className="mt-1 text-xs leading-5 text-[#56655c]">Data must be in <strong className="whitespace-nowrap font-semibold text-[#173c34]">{sourceCoordinateSystem}</strong>.</p>
}

export function UnsupportedFormats() {
  return <p className="flex gap-1.5 text-xs leading-5 text-amber-900"><Ban size={13} className="mt-1 shrink-0 text-amber-600" aria-hidden="true" /><span><strong className="font-semibold text-amber-800">Not supported:</strong> GeoJSON, which doesn’t record its coordinate system</span></p>
}
