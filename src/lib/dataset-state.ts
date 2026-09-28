import type { DatasetEntry, DatasetItem } from './upload-package'

export type DatasetAction =
  | { type: 'add'; entry: DatasetEntry }
  | { type: 'remove'; entryId: string }
  | { type: 'toggle-inclusion'; entryId: string; datasetId: string }
  | { type: 'clear' }

export function datasetReducer(state: DatasetEntry[], action: DatasetAction): DatasetEntry[] {
  switch (action.type) {
    case 'add':
      return [...state, action.entry]
    case 'remove':
      return state.filter((entry) => entry.id !== action.entryId)
    case 'toggle-inclusion':
      return state.map((entry) => {
        if (entry.id !== action.entryId || entry.kind !== 'collection') return entry
        const datasets: DatasetItem[] = entry.datasets.map((dataset) => dataset.id === action.datasetId && dataset.status === 'accepted' ? { ...dataset, included: !dataset.included } : dataset)
        return { ...entry, datasets }
      })
    case 'clear':
      return []
  }
}

export function includedDatasetCount(entries: DatasetEntry[]) {
  return entries.reduce((total, entry) => total + (entry.kind === 'collection' ? entry.datasets.filter((dataset) => dataset.status === 'accepted' && dataset.included).length : 1), 0)
}
