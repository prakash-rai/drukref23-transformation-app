import { describe, expect, it } from 'vitest'
import { datasetReducer } from './dataset-state'
import type { DatasetEntry } from './upload-package'

const entry: DatasetEntry = { id: 'folder', kind: 'collection', file: new File([''], 'roads.shp'), sourceName: 'survey', ignoredFiles: [], datasets: [{ id: 'roads', name: 'roads.shp', kind: 'shapefile', files: [], size: 10, status: 'accepted', included: true }] }

describe('dataset reducer', () => {
  it('toggles inclusion without changing the collection identity', () => {
    const next = datasetReducer([entry], { type: 'toggle-inclusion', entryId: 'folder', datasetId: 'roads' })
    expect(next[0]).not.toBe(entry)
    expect(next[0]?.kind === 'collection' && next[0].datasets[0]?.included).toBe(false)
  })

  it('removes an entry', () => {
    expect(datasetReducer([entry], { type: 'remove', entryId: 'folder' })).toEqual([])
  })
})
