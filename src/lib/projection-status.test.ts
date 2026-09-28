import { describe, expect, it } from 'vitest'
import { getProjectionStatus, getTransformationOutcome } from './projection-status'

describe('projection status', () => {
  it('starts with package preparation and progresses through upload and projection', () => {
    expect(getProjectionStatus({ busy: true, messages: ['Preparing DrukRef03 upload package…'], error: '' }).activeStep).toBe('prepare')
    expect(getProjectionStatus({ busy: true, messages: ['Uploading package to ArcGIS…'], error: '' }).activeStep).toBe('upload')
    expect(getProjectionStatus({ busy: true, messages: ['esriJobExecuting'], error: '' }).activeStep).toBe('project')
  })

  it('reports a download-ready completion state', () => {
    expect(getProjectionStatus({ busy: false, messages: ['Transformation completed. Your result download should begin shortly.'], error: '' })).toMatchObject({ activeStep: 'download', complete: true })
  })

  it('reports failures without claiming a completed projection', () => {
    expect(getProjectionStatus({ busy: false, messages: ['esriJobFailed'], error: 'ArcGIS Server rejected the job.' })).toMatchObject({ failed: true, complete: false })
  })

  it('counts successful and failed datasets from the service messages', () => {
    expect(getTransformationOutcome([
      'GPS Stations.shp successfully transformed.',
      'Roads.shp failed to transform: Input must use DrukRef03.',
      'Parcels.shp successfully transformed.',
    ])).toEqual({ successful: 2, failed: 1 })
  })
})
