import { describe, expect, it } from 'vitest'
import { MAX_POLL_MINUTES, POLL_INTERVAL_MS, apiUrl, checkUploadService, submitUploadPackage, type JobStatus } from './arcgis-upload'

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
const noSleep = async () => undefined

/** Fake app server: POST /api/jobs answers `submit`, each status poll takes the next item from `polls`. */
function server(polls: Array<Response | Error>, submit: Response = json({ jobId: 'j42' }, 201)) {
  const requests: Array<{ method: string; url: string; init?: RequestInit }> = []
  const fetch = async (url: string, init?: RequestInit) => {
    requests.push({ method: init?.method ?? 'GET', url, init })
    if (init?.method === 'POST') return submit
    const next = polls.shift() ?? json({ jobStatus: 'esriJobExecuting' })
    if (next instanceof Error) throw next
    return next
  }
  return { fetch, requests }
}

describe('apiUrl', () => {
  it('resolves API routes under the deployment base path', () => {
    expect(apiUrl('health', '/drukref/')).toBe('/drukref/api/health')
    expect(apiUrl('/jobs/j1', '/drukref')).toBe('/drukref/api/jobs/j1')
    expect(apiUrl('health', '/')).toBe('/api/health')
  })
})

describe('checkUploadService', () => {
  it('reports an online service', async () => {
    expect(await checkUploadService({ fetch: async () => json({ status: 'online' }) })).toEqual({ online: true })
  })

  it('surfaces the server-side reason when the service is offline', async () => {
    const result = await checkUploadService({ fetch: async () => json({ status: 'offline', error: 'ArcGIS sign-in failed: Invalid username or password.' }, 503) })
    expect(result).toEqual({ online: false, reason: 'ArcGIS sign-in failed: Invalid username or password.' })
  })

  it('explains a non-JSON failure such as an IIS error page', async () => {
    expect(await checkUploadService({ fetch: async () => new Response('<html>502.3</html>', { status: 502 }) })).toEqual({ online: false, reason: 'The transformation service is unavailable. (HTTP 502)' })
  })

  it('reports an unreachable app server', async () => {
    expect(await checkUploadService({ fetch: async () => { throw new TypeError('Failed to fetch') } })).toEqual({ online: false, reason: 'The app server could not be reached.' })
  })
})

describe('submitUploadPackage', () => {
  it('submits the ZIP, polls the job and downloads through the app server', async () => {
    const app = server([json({ jobStatus: 'esriJobExecuting', messages: [] }), json({ jobStatus: 'esriJobSucceeded', messages: [] })])
    const downloads: string[] = []
    const seen: JobStatus[] = []
    const waits: number[] = []
    const blob = new Blob(['zip'])
    await submitUploadPackage(blob, (status) => seen.push(status), { fetch: app.fetch, sleep: async (ms) => { waits.push(ms) }, download: (url) => downloads.push(url) })
    expect(app.requests[0]).toMatchObject({ method: 'POST', url: '/api/jobs', init: { body: blob, headers: { 'Content-Type': 'application/zip' } } })
    expect(app.requests.slice(1).map((request) => request.url)).toEqual(['/api/jobs/j42', '/api/jobs/j42'])
    expect(waits.every((ms) => ms === POLL_INTERVAL_MS)).toBe(true)
    expect(downloads).toEqual(['/api/jobs/j42/result'])
    expect(seen.map((status) => status.jobStatus)).toEqual(['uploading', 'submitted', 'esriJobExecuting', 'esriJobSucceeded', 'downloading'])
  })

  it('encodes the job ID in status and result URLs', async () => {
    const app = server([json({ jobStatus: 'esriJobSucceeded' })], json({ jobId: 'a/b' }, 201))
    const downloads: string[] = []
    await submitUploadPackage(new Blob(['zip']), () => undefined, { fetch: app.fetch, sleep: noSleep, download: (url) => downloads.push(url) })
    expect(app.requests[1]!.url).toBe('/api/jobs/a%2Fb')
    expect(downloads).toEqual(['/api/jobs/a%2Fb/result'])
  })

  it.each([
    ['a JSON error', () => json({ error: 'The package is larger than the 2048 MB limit.' }, 413), 'larger than the 2048 MB limit'],
    ['a non-JSON error page', () => new Response('<html>413 Request Entity Too Large</html>', { status: 413 }), 'The package could not be submitted. (HTTP 413)'],
    ['a response without a job ID', () => json({}, 201), 'did not return a job ID'],
  ])('reports submission failure from %s', async (_label, submit, message) => {
    await expect(submitUploadPackage(new Blob(['zip']), () => undefined, { fetch: server([], submit()).fetch, sleep: noSleep })).rejects.toThrow(message)
  })

  it('reports dataset failures from a failed job', async () => {
    const app = server([json({ jobStatus: 'esriJobFailed', messages: [{ description: 'Processing dataset 1 of 1: roads.shp' }, { description: 'roads.shp failed to transform: not DrukRef03' }] })])
    await expect(submitUploadPackage(new Blob(['zip']), () => undefined, { fetch: app.fetch, sleep: noSleep })).rejects.toThrow(/^roads.shp failed to transform: not DrukRef03$/)
  })

  it.each(['esriJobFailed', 'esriJobCancelled', 'esriJobTimedOut'])('falls back to the job status when %s has no failure messages', async (jobStatus) => {
    const app = server([json({ jobStatus, messages: [{ description: 'Submitted.' }] })])
    await expect(submitUploadPackage(new Blob(['zip']), () => undefined, { fetch: app.fetch, sleep: noSleep })).rejects.toThrow(`Job ${jobStatus}.`)
  })

  it('tolerates brief polling failures', async () => {
    const app = server([new TypeError('Failed to fetch'), json({ error: 'Job status: ArcGIS Server returned HTTP 502.' }, 502), json({ jobStatus: 'esriJobSucceeded' })])
    const downloads: string[] = []
    await submitUploadPackage(new Blob(['zip']), () => undefined, { fetch: app.fetch, sleep: noSleep, download: (url) => downloads.push(url) })
    expect(downloads).toHaveLength(1)
  })

  it('gives up after five consecutive polling failures with the last reason', async () => {
    const failures = Array.from({ length: 5 }, () => json({ error: 'Job status: Cannot reach ArcGIS Server.' }, 503))
    await expect(submitUploadPackage(new Blob(['zip']), () => undefined, { fetch: server(failures).fetch, sleep: noSleep })).rejects.toThrow('Job status: Cannot reach ArcGIS Server.')
  })

  it('stops polling after the maximum wait', async () => {
    const app = server([])
    await expect(submitUploadPackage(new Blob(['zip']), () => undefined, { fetch: app.fetch, sleep: noSleep })).rejects.toThrow(`did not finish within ${MAX_POLL_MINUTES} minutes`)
    expect(app.requests.length - 1).toBe(Math.ceil((MAX_POLL_MINUTES * 60_000) / POLL_INTERVAL_MS))
  })
})
