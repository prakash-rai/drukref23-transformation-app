import { useCallback, useEffect, useReducer, useRef } from 'react'
import { checkUploadService, submitUploadPackage, type JobStatus } from './arcgis-upload'
import { checkProjections, createSubmissionPackage, inspectRootFiles, inspectZip, type DatasetEntry, type DatasetItem, type IgnoredFile } from './upload-package'
import { classifySelection, splitDirectorySelection, unsupportedMessage, type FileNotice } from './file-check'
import { datasetReducer, includedDatasetCount } from './dataset-state'

export type ServiceHealth = 'checking' | 'online' | 'offline'
export type WorkflowState = { entries: DatasetEntry[]; busy: boolean; health: ServiceHealth; healthReason: string; messages: string[]; notices: FileNotice[]; error: string }

export type WorkflowAction =
  | { type: 'health'; value: ServiceHealth; reason?: string }
  | { type: 'busy'; value: boolean }
  | { type: 'message'; value: string }
  | { type: 'error'; value: string }
  | { type: 'notices'; value: FileNotice[] }
  | { type: 'clear-error' }
  | { type: 'add'; entry: DatasetEntry }
  | { type: 'remove'; entryId: string }
  | { type: 'toggle'; entryId: string; datasetId: string }
  | { type: 'clear-activity' }

/** While the service is unavailable (for example ArcGIS still starting after a reboot), check again this often. */
export const HEALTH_RECHECK_MS = 30_000

export function healthRecheckDelay(health: ServiceHealth) {
  return health === 'offline' ? HEALTH_RECHECK_MS : null
}

export const initialState: WorkflowState = { entries: [], busy: false, health: 'checking', healthReason: '', messages: [], notices: [], error: '' }

export function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  if (action.type === 'add') return { ...state, entries: datasetReducer(state.entries, { type: 'add', entry: action.entry }), error: '' }
  if (action.type === 'remove') return { ...state, entries: datasetReducer(state.entries, { type: 'remove', entryId: action.entryId }) }
  if (action.type === 'toggle') return { ...state, entries: datasetReducer(state.entries, { type: 'toggle-inclusion', entryId: action.entryId, datasetId: action.datasetId }) }
  if (action.type === 'clear-activity') return { ...state, messages: [], notices: [], error: '' }
  if (action.type === 'notices') return { ...state, notices: action.value }
  if (action.type === 'health') return { ...state, health: action.value, healthReason: action.reason ?? '' }
  if (action.type === 'busy') return { ...state, busy: action.value }
  if (action.type === 'message') return { ...state, messages: state.messages.includes(action.value) ? state.messages : [...state.messages, action.value] }
  if (action.type === 'error') return { ...state, error: action.value }
  if (action.type === 'clear-error') return { ...state, error: '' }
  return state
}

function collectionEntry(result: { datasets: DatasetItem[]; ignoredFiles: IgnoredFile[]; sourceName: string }, fallbackFile: File): DatasetEntry {
  return { id: crypto.randomUUID(), file: result.datasets[0]?.files[0] ?? fallbackFile, kind: 'collection', datasets: result.datasets, ignoredFiles: result.ignoredFiles, sourceName: result.sourceName }
}

export function useUploadWorkflow() {
  const [state, dispatch] = useReducer(workflowReducer, initialState)
  const mounted = useRef(true)

  useEffect(() => () => { mounted.current = false }, [])
  const checkHealth = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) dispatch({ type: 'health', value: 'checking' })
    const result = await checkUploadService()
    if (!mounted.current) return
    dispatch(result.online ? { type: 'health', value: 'online' } : { type: 'health', value: 'offline', reason: result.reason })
  }, [])

  useEffect(() => {
    mounted.current = true
    void checkHealth()
  }, [checkHealth])

  const addInspected = useCallback(async (inspected: { datasets: DatasetItem[]; ignoredFiles: IgnoredFile[]; sourceName: string }, fallbackFile: File) => {
    const result = await checkProjections(inspected)
    dispatch({ type: 'add', entry: collectionEntry(result, fallbackFile) })
  }, [])

  // Re-check quietly so the banner stays in place instead of flickering to "Checking service".
  useEffect(() => {
    const delay = healthRecheckDelay(state.health)
    if (delay === null) return
    const timer = setInterval(() => void checkHealth({ quiet: true }), delay)
    return () => clearInterval(timer)
  }, [state.health, checkHealth])

  const addFiles = useCallback(async (files: File[]) => {
    dispatch({ type: 'clear-activity' })
    if (!files.length) return
    const { zips, datasetFiles, notices } = classifySelection(files)
    try {
      for (const zip of zips) {
        let inspected: Awaited<ReturnType<typeof inspectZip>>
        try { inspected = await inspectZip(zip) } catch { notices.push({ kind: 'unsupported', files: [zip.name], message: `${zip.name} could not be opened as a ZIP file.` }); continue }
        await addInspected(inspected, zip)
      }
      if (datasetFiles.length) {
        const single = datasetFiles.length === 1 || new Set(datasetFiles.map((file) => file.name.replace(/\.[^.]+$/, '').toLowerCase())).size === 1
        const sourceName = single ? (datasetFiles.find((file) => /\.(gpkg|shp)$/i.test(file.name)) ?? datasetFiles[0]!).name : 'Selected files'
        await addInspected(inspectRootFiles(datasetFiles, sourceName), datasetFiles[0]!)
      }
      if (notices.length) dispatch({ type: 'notices', value: notices })
    } catch (cause) { dispatch({ type: 'error', value: cause instanceof Error ? cause.message : 'The selected files could not be inspected.' }) }
  }, [addInspected])

  /** Adds a folder's immediate files; `ignoredFiles` lists child folders, which are never scanned. */
  const addFolderFiles = useCallback(async (files: File[], folderName: string, ignoredFiles: IgnoredFile[]) => {
    const inspected = inspectRootFiles(files, folderName)
    if (!inspected.datasets.length) {
      const unsupported = inspected.ignoredFiles.filter((file) => file.reason === 'unsupported').map((file) => file.name)
      throw new Error(`No GeoPackage or Shapefile was found directly in ${folderName}.${ignoredFiles.length ? ' Child folders are not scanned; add them with Add folder.' : ''}${unsupported.length ? ` ${unsupportedMessage(unsupported[0]!)}` : ''}`)
    }
    await addInspected({ ...inspected, ignoredFiles: [...inspected.ignoredFiles, ...ignoredFiles] }, files[0]!)
  }, [addInspected])

  const addFolder = useCallback(async (directory: FileSystemDirectoryHandle) => {
    dispatch({ type: 'clear-activity' })
    try {
      const files: File[] = []
      const ignoredFiles: IgnoredFile[] = []
      for await (const entry of directory.values()) {
        if (entry.kind === 'file') files.push(await entry.getFile())
        else ignoredFiles.push({ name: `${entry.name}/`, reason: 'subfolder' })
      }
      await addFolderFiles(files, directory.name, ignoredFiles)
    } catch (cause) { dispatch({ type: 'error', value: cause instanceof Error ? cause.message : 'The folder could not be inspected.' }) }
  }, [addFolderFiles])

  /** Fallback for browsers without showDirectoryPicker: a folder chosen with `<input webkitdirectory>`. */
  const addDirectoryInput = useCallback(async (files: File[]) => {
    dispatch({ type: 'clear-activity' })
    if (!files.length) return
    try {
      const { folderName, rootFiles, ignoredFiles } = splitDirectorySelection(files)
      await addFolderFiles(rootFiles, folderName, ignoredFiles)
    } catch (cause) { dispatch({ type: 'error', value: cause instanceof Error ? cause.message : 'The folder could not be inspected.' }) }
  }, [addFolderFiles])

  const project = useCallback(async () => {
    if (!includedDatasetCount(state.entries) || state.busy) return
    dispatch({ type: 'busy', value: true })
    dispatch({ type: 'clear-error' })
    dispatch({ type: 'message', value: 'Preparing upload package…' })
    const onStatus = (status: JobStatus) => { status.messages?.forEach((message) => message.description && dispatch({ type: 'message', value: message.description })); if (status.jobStatus) dispatch({ type: 'message', value: status.jobStatus }) }
    try {
      await submitUploadPackage(await createSubmissionPackage(state.entries), onStatus)
    } catch (cause) {
      dispatch({ type: 'error', value: cause instanceof Error ? cause.message : 'Projection failed.' })
    } finally { dispatch({ type: 'busy', value: false }) }
  }, [state.busy, state.entries])

  const clearActivity = useCallback(() => dispatch({ type: 'clear-activity' }), [])
  const toggleDataset = useCallback((entryId: string, datasetId: string) => {
    clearActivity()
    dispatch({ type: 'toggle', entryId, datasetId })
  }, [clearActivity])

  return { state, checkHealth, addFiles, addFolder, addDirectoryInput, clearActivity, removeEntry: (entryId: string) => dispatch({ type: 'remove', entryId }), toggleDataset, project }
}
