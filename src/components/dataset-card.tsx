import { useState } from 'react'
import { FileArchive, Trash2 } from 'lucide-react'
import type { DatasetEntry } from '#/lib/upload-package'

type Props = { entry: DatasetEntry; onRemove: () => void; onChange: (datasetId: string) => void }

export function DatasetCard({ entry, onRemove, onChange }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (entry.kind === 'file') {
    return (
      <div className="dataset-arrive flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
        <FileArchive className="shrink-0 text-slate-500" size={18} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800">{entry.file.name}</p>
          <p className="text-xs text-slate-500">{(entry.file.size / 1024 / 1024).toFixed(2)} MB</p>
        </div>
        <button type="button" className="flex min-h-10 min-w-10 items-center justify-center rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600" onClick={onRemove}>
          <Trash2 size={16} />
        </button>
      </div>
    )
  }

  const included = entry.datasets.filter((item) => item.status === 'accepted' && item.included).length
  const excluded = entry.datasets.filter((item) => item.status === 'accepted' && !item.included).length
  const rejected = entry.datasets.filter((item) => item.status === 'rejected').length
  const ignored = entry.ignoredFiles.length
  const includedSize = entry.datasets.filter((item) => item.status === 'accepted' && item.included).reduce((sum, item) => sum + item.size, 0)
  const single = entry.datasets.length === 1
  const countLabel = (count: number, singular: string) => `${count} ${singular}${count === 1 ? '' : 's'}`
  const collectionSummary = [
    `${countLabel(included, 'dataset')} selected`,
    excluded > 0 ? `${countLabel(excluded, 'dataset')} not selected` : '',
    rejected > 0 ? `${countLabel(rejected, 'dataset')} rejected` : '',
    ignored > 0 ? `${countLabel(ignored, 'file')} ignored` : '',
  ].filter(Boolean).join(' · ')
  const collectionTitle = `${countLabel(included, 'dataset')} selected from ${entry.sourceName}`
  const displaySize = single ? entry.datasets[0]?.size ?? 0 : includedSize

  return (
    <div className="dataset-arrive rounded-lg border border-slate-200 bg-white px-3 py-3">
      <div className="flex items-center gap-3">
        <FileArchive className="shrink-0 text-slate-500" size={18} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-800">{collectionTitle}</p>
          <p className="text-xs text-slate-500">
            {displaySize / 1024 / 1024 > 0 ? `${(displaySize / 1024 / 1024).toFixed(2)} MB` : '0 MB'}
            {single ? ' · Shapefile package' : ` · ${collectionSummary}`}
          </p>
        </div>
        {!single && <button type="button" className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100" onClick={() => setExpanded(!expanded)}>{expanded ? 'Hide details' : 'Review details'}</button>}
        <button type="button" aria-label={`Remove ${entry.sourceName}`} className="flex min-h-10 min-w-10 items-center justify-center rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600" onClick={onRemove}>
          <Trash2 size={16} />
        </button>
      </div>
      {expanded && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Datasets</h3>
            <div className="space-y-2">
              {entry.datasets.map((dataset) => (
                <div key={dataset.id} className={`flex items-start gap-3 rounded-md border px-3 py-2.5 text-xs ${dataset.status === 'rejected' ? 'border-amber-200 bg-amber-50/60 text-[#6b4a28]' : dataset.included ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-800">{dataset.name}</p>
                    <p className="mt-0.5 text-slate-400">{(dataset.size / 1024 / 1024).toFixed(2)} MB</p>
                    {dataset.reason && <p className="mt-1 text-amber-700">Rejected · {dataset.reason}</p>}
                  </div>
                  {dataset.status === 'rejected' ? <span className="shrink-0 font-medium text-amber-700">Rejected</span> : <button type="button" className="min-h-10 shrink-0 rounded-md border border-slate-200 bg-white px-3 py-1 font-medium text-slate-600 hover:bg-slate-100" onClick={() => onChange(dataset.id)}>{dataset.included ? 'Exclude' : 'Include'}</button>}
                </div>
              ))}
            </div>
          </section>
          {entry.ignoredFiles.length > 0 && (
            <section className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
              <h3 className="text-xs font-semibold text-slate-600">Ignored files</h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">These files are not supported as standalone datasets. <strong className="font-semibold text-slate-800">Add the ZIP or child folder separately</strong> if you want to include its contents.</p>
              <ul className="mt-2 list-inside list-disc text-xs text-slate-500">{entry.ignoredFiles.map((file) => <li key={file}>{file}</li>)}</ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
