import { Ban, FilePlus2, FolderOpen, UploadCloud } from 'lucide-react'
import { sourceCoordinateSystem } from '#/lib/transformation'

const actions = [
  { key: 'files', Icon: FilePlus2, label: 'Add files', detail: 'A GeoPackage (.gpkg), or a ZIP of GeoPackages or Shapefiles' },
  { key: 'folder', Icon: FolderOpen, label: 'Add folder', detail: 'Unzipped Shapefiles (.shp, .shx, .dbf, .prj). Subfolders aren’t read.' },
] as const

/** Empty dataset list: explains which add action takes which data, and doubles as the first call to action. */
export function UploadInstructions({ onAddFiles, onAddFolder }: { onAddFiles: () => void; onAddFolder: () => void }) {
  const handlers = { files: onAddFiles, folder: onAddFolder }
  return (
    <div className="rounded-xl border border-dashed border-[#b9cbbd] bg-[#f2f6ef] px-4 py-6 sm:px-6">
      <div className="text-center">
        <span aria-hidden="true" className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#2f6958] shadow-sm ring-1 ring-[#d7ddd5]"><UploadCloud size={17} /></span>
        <p className="mt-2.5 text-sm font-semibold text-[#173c34]">No datasets added yet</p>
        <p className="mt-0.5 text-xs text-[#56655c]">Pick the option that matches your data.</p>
      </div>
      <div className="mx-auto mt-4 grid max-w-2xl gap-2.5 sm:grid-cols-2">
        {actions.map(({ key, Icon, label, detail }) => (
          <button key={key} type="button" onClick={handlers[key]} className="group flex min-w-0 items-start gap-2.5 rounded-lg border border-[#d7ddd5] bg-white px-3 py-2.5 text-left transition hover:border-[#2f6958] hover:shadow-[0_6px_18px_rgba(23,60,52,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e76f51]">
            <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#e5eee4] text-[#2f6958] transition-colors group-hover:bg-[#2f6958] group-hover:text-white"><Icon size={15} /></span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold leading-5 text-[#173c34]">{label}</span>
              <span className="block text-xs leading-5 text-[#56655c]">{detail}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function SourceRequirement() {
  return <p className="mt-1 text-xs leading-5 text-[#56655c]">Data must be in <strong className="whitespace-nowrap font-semibold text-[#173c34]">{sourceCoordinateSystem}</strong>.</p>
}

export function UnsupportedFormats() {
  return <p className="flex gap-1.5 text-xs leading-5 text-amber-900"><Ban size={13} className="mt-1 shrink-0 text-amber-600" aria-hidden="true" /><span><strong className="font-semibold text-amber-800">Not supported:</strong> GeoJSON, which doesn’t record its coordinate system</span></p>
}
