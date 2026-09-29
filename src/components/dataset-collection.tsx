import { useRef } from 'react'
import { AlertTriangle, FilePlus2, FolderOpen, UploadCloud } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { ActivityPanel } from '#/components/activity-panel'
import { DatasetCard } from '#/components/dataset-card'
import type { FileNotice } from '#/lib/file-check'
import type { DatasetEntry } from '#/lib/upload-package'

type Props = {
  entries: DatasetEntry[]
  inputRef: React.RefObject<HTMLInputElement | null>
  onFile: React.ChangeEventHandler<HTMLInputElement>
  onFolder: () => void
  onDirectoryFiles: (files: File[]) => void
  onStartAdding: () => void
  onRemove: (id: string) => void
  onToggle: (entryId: string, datasetId: string) => void
  messages: string[]
  notices: FileNotice[]
  error: string
  busy: boolean
}

// Folder picking uses showDirectoryPicker (Chrome, Edge) and falls back to <input webkitdirectory> (Firefox, Safari).
const hasDirectoryPicker = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window
// Shapefile parts are selectable so a partial set can be explained instead of silently hidden by the picker.
const acceptedFiles = '.gpkg,.zip,.shp,.shx,.dbf,.prj,.cpg,.sbn,.sbx'

export function DatasetCollection({ entries, inputRef, onFile, onFolder, onDirectoryFiles, onStartAdding, onRemove, onToggle, messages, notices, error, busy }: Props) {
  const folderInputRef = useRef<HTMLInputElement>(null)
  function pickFolder() {
    onStartAdding()
    if (hasDirectoryPicker()) onFolder()
    else folderInputRef.current?.click()
  }
  function handleDirectoryInput(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    onDirectoryFiles(files)
  }

  return (
    <Card className="border-[#d7ddd5] shadow-[0_14px_40px_rgba(23,60,52,0.08)]">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle>Datasets</CardTitle>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => { onStartAdding(); inputRef.current?.click() }}><FilePlus2 size={16} />Add files</Button>
            <Button variant="outline" onClick={pickFolder}><FolderOpen size={16} />Add folder</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <input ref={inputRef} className="sr-only" type="file" accept={acceptedFiles} multiple onChange={onFile} tabIndex={-1} aria-hidden="true" />
        <input ref={folderInputRef} className="sr-only" type="file" {...{ webkitdirectory: '' }} onChange={handleDirectoryInput} tabIndex={-1} aria-hidden="true" />
        {notices.length > 0 && <div role="status" className="space-y-2">{notices.map((notice) => (
          <div key={notice.message} className="dataset-arrive flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              {notice.kind === 'unsupported' && <p className="break-all font-semibold">{notice.files.join(', ')}</p>}
              <p>{notice.message}</p>
            </div>
            {notice.kind === 'shapefile-part' && <Button variant="outline" className="h-8 shrink-0 bg-white px-3 text-xs" onClick={pickFolder}><FolderOpen size={14} />Add folder</Button>}
          </div>
        ))}</div>}
        {!entries.length && <div className="rounded-xl border border-dashed border-[#b9cbbd] bg-[#f2f6ef] px-5 py-10 text-center"><UploadCloud className="mx-auto mb-3 text-[#68766d]" size={24} aria-hidden="true" /><p className="text-sm font-medium text-[#173c34]">No datasets added yet</p><p className="mt-1 text-xs text-[#56655c]">Use Add files or Add folder to start.</p></div>}
        <div className="space-y-2">{entries.map((entry) => <DatasetCard key={entry.id} entry={entry} onRemove={() => onRemove(entry.id)} onChange={(datasetId) => onToggle(entry.id, datasetId)} />)}</div>
        {messages.length || error || busy ? <ActivityPanel messages={messages} error={error} busy={busy} /> : null}
      </CardContent>
    </Card>
  )
}
