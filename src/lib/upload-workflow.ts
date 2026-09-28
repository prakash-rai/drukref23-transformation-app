import { useCallback, useEffect, useReducer, useRef } from 'react'
import { checkUploadService, submitUploadPackage, type JobStatus } from './arcgis-upload'
import { createSubmissionPackage, inspectRootFiles, inspectZip, type DatasetEntry } from './upload-package'
import { datasetReducer } from './dataset-state'

export type ServiceHealth = 'checking' | 'online' | 'offline'
export type WorkflowState = { entries: DatasetEntry[]; busy: boolean; health: ServiceHealth; healthReason: string; messages: string[]; error: string }

export type WorkflowAction =
  | { type: 'health'; value: ServiceHealth; reason?: string }
  | { type: 'busy'; value: boolean }
  | { type: 'message'; value: string }
  | { type: 'error'; value: string }
  | { type: 'clear-error' }
  | { type: 'add'; entry: DatasetEntry }
  | { type: 'remove'; entryId: string }
  | { type: 'toggle'; entryId: string; datasetId: string }
  | { type: 'clear-activity' }

export const initialState: WorkflowState = { entries: [], busy: false, health: 'checking', healthReason: '', messages: [], error: '' }

export function workflowReducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  if (action.type === 'add') return { ...state, entries: datasetReducer(state.entries, { type: 'add', entry: action.entry }), error: '' }
  if (action.type === 'remove') return { ...state, entries: datasetReducer(state.entries, { type: 'remove', entryId: action.entryId }) }
  if (action.type === 'toggle') return { ...state, entries: datasetReducer(state.entries, { type: 'toggle-inclusion', entryId: action.entryId, datasetId: action.datasetId }) }
  if (action.type === 'clear-activity') return { ...state, messages: [], error: '' }
  if (action.type === 'health') return { ...state, health: action.value, healthReason: action.reason ?? '' }
  if (action.type === 'busy') return { ...state, busy: action.value }
  if (action.type === 'message') return { ...state, messages: state.messages.includes(action.value) ? state.messages : [...state.messages, action.value] }
  if (action.type === 'error') return { ...state, error: action.value }
  if (action.type === 'clear-error') return { ...state, error: '' }
  return state
}

export function useUploadWorkflow() {
  const [state, dispatch] = useReducer(workflowReducer, initialState)
  const mounted = useRef(true)

  useEffect(() => () => { mounted.current = false }, [])
  const checkHealth = useCallback(async () => {
    dispatch({ type: 'health', value: 'checking' })
    const result = await checkUploadService()
    if (!mounted.current) return
    dispatch(result.online ? { type: 'health', value: 'online' } : { type: 'health', value: 'offline', reason: result.reason })
  }, [])

  useEffect(() => {
    mounted.current = true
    void checkHealth()
  }, [checkHealth])

  const addFiles = useCallback(async (files: File[]) => {
    dispatch({ type: 'clear-activity' })
    if (!files.length) return
    try {
      if (files.length === 1 && files[0]!.name.toLowerCase().endsWith('.zip')) {
        const file = files[0]!
        const result = await inspectZip(file)
        dispatch({ type: 'add', entry: { id: crypto.randomUUID(), file, kind: 'collection', datasets: result.datasets, ignoredFiles: result.ignoredFiles, sourceName: file.name } })
        return
      }
      const hasShapefilePart = files.some((file) => /\.(shp|shx|dbf|prj|cpg|sbn|sbx)$/i.test(file.name))
      if (files.length > 1 || hasShapefilePart) {
        const sourceName = files.length === 1 ? files[0]!.name : 'Selected files'
        const result = inspectRootFiles(files, sourceName)
        if (!result.datasets.length) throw new Error('No supported datasets were found in the selected files.')
        dispatch({ type: 'add', entry: { id: crypto.randomUUID(), file: result.datasets[0]?.files[0] ?? files[0]!, kind: 'collection', datasets: result.datasets, ignoredFiles: result.ignoredFiles, sourceName } })
        return
      }
      dispatch({ type: 'add', entry: { id: crypto.randomUUID(), file: files[0]! , kind: 'file' } })
    } catch (cause) { dispatch({ type: 'error', value: cause instanceof Error ? cause.message : 'The selected files could not be inspected.' }) }
  }, [])

  const addFolder = useCallback(async (directory: FileSystemDirectoryHandle) => {
    dispatch({ type: 'clear-activity' })
    try {
      const files: File[] = []
      for await (const entry of directory.values()) if (entry.kind === 'file') files.push(await entry.getFile())
      const result = inspectRootFiles(files, directory.name)
      if (!result.datasets.length) throw new Error('No supported datasets were found in the selected folder.')
      dispatch({ type: 'add', entry: { id: crypto.randomUUID(), file: result.datasets[0]?.files[0] ?? files[0]!, kind: 'collection', datasets: result.datasets, ignoredFiles: result.ignoredFiles, sourceName: directory.name } })
    } catch (cause) { dispatch({ type: 'error', value: cause instanceof Error ? cause.message : 'The folder could not be inspected.' }) }
  }, [])

  const project = useCallback(async () => {
    if (!state.entries.length || state.busy) return
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

  return { state, checkHealth, addFiles, addFolder, clearActivity, removeEntry: (entryId: string) => dispatch({ type: 'remove', entryId }), toggleDataset, project }
}
