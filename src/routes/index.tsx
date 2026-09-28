import { useRef } from 'react'
import type { ChangeEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import nlcsLogo from '#/assets/nlcs-logo.svg'
import { Button } from '#/components/ui/button'
import { DatasetCollection } from '#/components/dataset-collection'
import { ServiceAlert, ServiceStatus } from '#/components/service-status'
import { useUploadWorkflow } from '#/lib/upload-workflow'

export const Route = createFileRoute('/')({ component: ProjectApp })

type WindowWithPicker = Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }

function ProjectApp() {
  const { state, checkHealth, addFiles, addFolder, clearActivity, removeEntry, toggleDataset, project } = useUploadWorkflow()
  const { entries, busy, health, healthReason, messages, error } = state
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!files.length) return
    void addFiles(files)
  }

  function handleFolder() {
    const picker = (window as WindowWithPicker).showDirectoryPicker
    if (!picker) return
    void picker().then(addFolder).catch(() => undefined)
  }



  return (
    <main className="min-h-screen bg-[#f4f1e9] text-[#17251f] selection:bg-[#f4a261] selection:text-[#17251f]">
      <header className="border-b border-[#2f5145] bg-[#173c34] text-[#f8f5ed]"><div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5"><div className="flex items-center gap-3"><img src={nlcsLogo} alt="NLCS" className="h-10 w-10 rounded-lg shadow-lg shadow-black/10" /><h1 className="text-lg font-semibold tracking-tight">DrukRef Transformation Tool</h1></div><ServiceStatus health={health} reason={healthReason} /></div></header>
      <div className="mx-auto max-w-3xl px-6 py-12">{health === 'offline' && <ServiceAlert reason={healthReason} onRetry={() => void checkHealth()} />}<p className="mb-4 text-sm font-medium text-[#2f6958]">Use <span className="font-semibold text-[#173c34]">Add folder</span> for uncompressed Shapefiles.</p><DatasetCollection entries={entries} inputRef={inputRef} onFile={handleFile} onFolder={handleFolder} onStartAdding={clearActivity} onRemove={removeEntry} onToggle={toggleDataset} messages={messages} error={error} busy={busy} /><div className="mt-5 flex justify-end"><Button className="project-action min-w-48 bg-[#e76f51] text-white shadow-lg shadow-[#e76f51]/20 hover:bg-[#d95f42]" onClick={project} disabled={!entries.length || busy}>{busy && <Loader2 size={16} className="animate-spin" />}{busy ? 'Transforming…' : 'Transform to DrukRef23'}</Button></div>
        <p className="mt-8 text-center text-xs font-medium tracking-[0.16em] text-[#68766d]">DEVELOPED BY NLCS</p></div>
    </main>
  )
}
