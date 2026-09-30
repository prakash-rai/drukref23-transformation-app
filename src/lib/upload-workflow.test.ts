import { describe, expect, it } from 'vitest'
import { HEALTH_RECHECK_MS, healthRecheckDelay, initialState, workflowReducer } from './upload-workflow'

describe('workflow state', () => {
  it('starts by checking the service', () => {
    expect(initialState).toMatchObject({ health: 'checking', healthReason: '', busy: false, entries: [] })
  })

  it('keeps the offline reason and clears it when the service recovers', () => {
    const offline = workflowReducer(initialState, { type: 'health', value: 'offline', reason: 'ArcGIS sign-in failed.' })
    expect(offline).toMatchObject({ health: 'offline', healthReason: 'ArcGIS sign-in failed.' })
    expect(workflowReducer(offline, { type: 'health', value: 'online' })).toMatchObject({ health: 'online', healthReason: '' })
  })

  it('records each activity message once and clears activity with its error', () => {
    let state = workflowReducer(initialState, { type: 'message', value: 'uploading' })
    state = workflowReducer(state, { type: 'message', value: 'uploading' })
    state = workflowReducer(state, { type: 'error', value: 'Upload failed.' })
    expect(state).toMatchObject({ messages: ['uploading'], error: 'Upload failed.' })
    expect(workflowReducer(state, { type: 'clear-activity' })).toMatchObject({ messages: [], error: '' })
  })

  it('keeps file notices until the next add clears activity', () => {
    const notice = { kind: 'shapefile-part' as const, files: ['roads.shp'], message: 'roads.shp is part of a Shapefile.' }
    const state = workflowReducer(initialState, { type: 'notices', value: [notice] })
    expect(state.notices).toEqual([notice])
    expect(workflowReducer(state, { type: 'clear-activity' }).notices).toEqual([])
  })
})

describe('automatic service re-check', () => {
  it('re-checks every 30 seconds only while the service is unavailable', () => {
    expect(HEALTH_RECHECK_MS).toBe(30_000)
    expect(healthRecheckDelay('offline')).toBe(HEALTH_RECHECK_MS)
    expect(healthRecheckDelay('online')).toBeNull()
    expect(healthRecheckDelay('checking')).toBeNull()
  })
})
