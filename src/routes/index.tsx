import { useRef } from 'react'
import type { ChangeEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Loader2 } from 'lucide-react'
import nlcsLogo from '#/assets/nlcs-logo.svg'
import { Button } from '#/components/ui/button'
import { DatasetCollection } from '#/components/dataset-collection'
import { ServiceAlert, ServiceStatus } from '#/components/service-status'
import { UploadInstructions } from '#/components/upload-instructions'
import { includedDatasetCount } from '#/lib/dataset-state'
import { targetCoordinateSystem } from '#/lib/transformation'
import { useUploadWorkflow } from '#/lib/upload-workflow'

export const Route = createFileRoute('/')({ component: ProjectApp })

type WindowWithPicker = Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }

function ProjectApp() {
  const { state, checkHealth, addFiles, addFolder, addDirectoryInput, clearActivity, removeEntry, toggleDataset, project } = useUploadWorkflow()
  const { entries, busy, health, healthReason, messages, notices, error } = state
  const included = includedDatasetCount(entries)
  const transformHint = busy ? '' : !entries.length ? 'Add a dataset to transform.' : !included ? 'Include at least one accepted dataset to transform.' : health === 'offline' ? 'The service is unavailable, so the transformation will fail until it is back.' : ''
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
      <header className="border-b border-[#2f5145] bg-[#173c34] text-[#f8f5ed]"><div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5"><div className="flex items-center gap-3"><img src={nlcsLogo} alt="NLCS" className="h-10 w-10 rounded-lg shadow-lg shadow-black/10" /><h1 className="text-lg font-semibold tracking-tight">DrukRef Transformation Tool</h1></div><ServiceStatus health={health} /></div></header>
      <div className="mx-auto max-w-3xl px-6 py-12">{health === 'offline' && <ServiceAlert reason={healthReason} onRetry={() => void checkHealth()} />}<UploadInstructions /><DatasetCollection entries={entries} inputRef={inputRef} onFile={handleFile} onFolder={handleFolder} onDirectoryFiles={(files) => void addDirectoryInput(files)} onStartAdding={clearActivity} onRemove={removeEntry} onToggle={toggleDataset} messages={messages} notices={notices} error={error} busy={busy} /><div className="mt-5 flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-4"><p id="transform-hint" className="text-right text-xs leading-5 text-[#56655c]">{transformHint || `You’ll download one ZIP with each dataset projected to ${targetCoordinateSystem}, named with a _DrukRef23 suffix.`}</p><Button aria-describedby="transform-hint" className="project-action min-w-48 bg-[#e76f51] text-white shadow-lg shadow-[#e76f51]/20 hover:bg-[#d95f42]" onClick={project} disabled={!included || busy}>{busy && <Loader2 size={16} className="animate-spin" />}{busy ? 'Transforming…' : 'Transform to DrukRef23'}</Button></div>
        <p className="mt-8 text-center text-xs font-medium tracking-[0.16em] text-[#68766d]">DEVELOPED BY NLCS</p></div>
    </main>
  )
}
