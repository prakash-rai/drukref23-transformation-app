import { FilePlus2, FolderOpen, UploadCloud } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { ActivityPanel } from '#/components/activity-panel'
import { DatasetCard } from '#/components/dataset-card'
import type { DatasetEntry } from '#/lib/upload-package'

type Props = {
  entries: DatasetEntry[]
  inputRef: React.RefObject<HTMLInputElement | null>
  onFile: React.ChangeEventHandler<HTMLInputElement>
  onFolder: () => void
  onStartAdding: () => void
  onRemove: (id: string) => void
  onToggle: (entryId: string, datasetId: string) => void
  messages: string[]
  error: string
  busy: boolean
}

export function DatasetCollection({ entries, inputRef, onFile, onFolder, onStartAdding, onRemove, onToggle, messages, error, busy }: Props) {
  return (
    <Card className="border-[#d7ddd5] shadow-[0_14px_40px_rgba(23,60,52,0.08)]">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>Datasets</CardTitle>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => { onStartAdding(); inputRef.current?.click() }}><FilePlus2 size={16} />Add files</Button>
            <Button variant="outline" onClick={() => { onStartAdding(); onFolder() }}><FolderOpen size={16} />Add folder</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <Input ref={inputRef} className="sr-only" type="file" accept=".gpkg,.zip" multiple onChange={onFile} />
        {!entries.length && <div className="rounded-xl border border-dashed border-[#b9cbbd] bg-[#f2f6ef] px-5 py-10 text-center"><UploadCloud className="mx-auto mb-3 text-slate-400" size={24} /><p className="text-sm font-medium text-slate-700">No datasets added</p><p className="mt-1 text-xs text-slate-500">Select DrukRef03 data with Add files or Add folder.</p></div>}
        <div className="space-y-2">{entries.map((entry) => <DatasetCard key={entry.id} entry={entry} onRemove={() => onRemove(entry.id)} onChange={(datasetId) => onToggle(entry.id, datasetId)} />)}</div>
        {messages.length || error || busy ? <ActivityPanel messages={messages} error={error} busy={busy} /> : null}
      </CardContent>
    </Card>
  )
}
