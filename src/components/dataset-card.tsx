import { useState } from 'react'
import { AlertTriangle, FileArchive, Trash2 } from 'lucide-react'
import type { DatasetEntry, DatasetItem, IgnoredReason } from '#/lib/upload-package'

const ignoredGroups: Array<{ reason: IgnoredReason; title: string; help: string }> = [
  { reason: 'subfolder', title: 'In a subfolder', help: 'Only files directly inside the selected folder or ZIP are read. Add the subfolder separately with Add folder, or zip it on its own.' },
  { reason: 'zip', title: 'ZIP inside a folder or ZIP', help: 'ZIPs are not opened when they sit inside something else. Add the ZIP separately with Add files.' },
  { reason: 'unsupported', title: 'Not a supported format', help: 'Only GeoPackage (.gpkg) and Shapefile datasets are read.' },
]

const kindLabel = (dataset: DatasetItem) => dataset.kind === 'shapefile' ? 'Shapefile' : 'GeoPackage'

function DatasetNotes({ dataset }: { dataset: DatasetItem }) {
  return <>
    {dataset.reason && <p className="mt-1 text-xs text-amber-700">Rejected · {dataset.reason}</p>}
    {dataset.caution && <p className="mt-1 flex gap-1.5 text-xs text-amber-800"><AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-600" />{dataset.caution}</p>}
  </>
}

type Props = { entry: DatasetEntry; onRemove: () => void; onChange: (datasetId: string) => void }

export function DatasetCard({ entry, onRemove, onChange }: Props) {
  const [expanded, setExpanded] = useState(false)

  const included = entry.datasets.filter((item) => item.status === 'accepted' && item.included).length
  const excluded = entry.datasets.filter((item) => item.status === 'accepted' && !item.included).length
  const rejected = entry.datasets.filter((item) => item.status === 'rejected').length
  const ignored = entry.ignoredFiles.length
  const includedSize = entry.datasets.filter((item) => item.status === 'accepted' && item.included).reduce((sum, item) => sum + item.size, 0)
  const cautions = entry.datasets.filter((item) => item.status === 'accepted' && item.caution).length
  const single = entry.datasets.length === 1
  const only = single ? entry.datasets[0] : undefined
  const countLabel = (count: number, singular: string) => `${count} ${singular}${count === 1 ? '' : 's'}`
  const collectionSummary = [
    `${countLabel(included, 'dataset')} selected`,
    excluded > 0 ? `${countLabel(excluded, 'dataset')} not selected` : '',
    rejected > 0 ? `${countLabel(rejected, 'dataset')} rejected` : '',
    cautions > 0 ? `${countLabel(cautions, 'dataset')} to check` : '',
    ignored > 0 ? `${countLabel(ignored, 'file')} ignored` : '',
  ].filter(Boolean).join(' · ')
  const collectionTitle = only ? only.name : `${countLabel(included, 'dataset')} selected from ${entry.sourceName}`
  const displaySize = single ? entry.datasets[0]?.size ?? 0 : includedSize

  return (
    <div className="dataset-arrive rounded-lg border border-slate-200 bg-white px-3 py-3">
      <div className="flex items-center gap-3">
        <FileArchive className="shrink-0 text-slate-500" size={18} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{collectionTitle}</p>
          <p className="text-xs text-slate-500">
            {displaySize / 1024 / 1024 > 0 ? `${(displaySize / 1024 / 1024).toFixed(2)} MB` : '0 MB'}
            {only ? ` · ${kindLabel(only)}${only.name !== entry.sourceName ? ` from ${entry.sourceName}` : ''}${ignored > 0 ? ` · ${countLabel(ignored, 'file')} ignored` : ''}` : ` · ${collectionSummary}`}
          </p>
          {only && <DatasetNotes dataset={only} />}
        </div>
        {(!single || ignored > 0) && <button type="button" className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100" onClick={() => setExpanded(!expanded)}>{expanded ? 'Hide details' : 'Review details'}</button>}
        <button type="button" aria-label={`Remove ${entry.sourceName}`} className="flex min-h-10 min-w-10 items-center justify-center rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600" onClick={onRemove}>
          <Trash2 size={16} />
        </button>
      </div>
      {expanded && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          {entry.datasets.length > 1 && <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Datasets</h3>
            <div className="space-y-2">
              {entry.datasets.map((dataset) => (
                <div key={dataset.id} className={`flex items-start gap-3 rounded-md border px-3 py-2.5 text-xs ${dataset.status === 'rejected' ? 'border-amber-200 bg-amber-50/60 text-[#6b4a28]' : dataset.included ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-800">{dataset.name}</p>
                    <p className="mt-0.5 text-slate-400">{(dataset.size / 1024 / 1024).toFixed(2)} MB</p>
                    <DatasetNotes dataset={dataset} />
                  </div>
                  {dataset.status === 'rejected' ? <span className="shrink-0 font-medium text-amber-700">Rejected</span> : <button type="button" className="min-h-10 shrink-0 rounded-md border border-slate-200 bg-white px-3 py-1 font-medium text-slate-600 hover:bg-slate-100" onClick={() => onChange(dataset.id)}>{dataset.included ? 'Exclude' : 'Include'}</button>}
                </div>
              ))}
            </div>
          </section>}
          {ignoredGroups.map((group) => {
            const files = entry.ignoredFiles.filter((file) => file.reason === group.reason)
            if (!files.length) return null
            return <section key={group.reason} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
              <h3 className="text-xs font-semibold text-slate-600">{group.title} · ignored</h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">{group.help}</p>
              <ul className="mt-2 list-inside list-disc text-xs text-slate-500">{files.map((file) => <li key={file.name} className="break-all">{file.name}</li>)}</ul>
            </section>
          })}
        </div>
      )}
    </div>
  )
}
