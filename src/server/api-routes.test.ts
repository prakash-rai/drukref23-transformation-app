import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ArcGISError } from '#/server/arcgis-client'

const client = { health: vi.fn(), upload: vi.fn(), submit: vi.fn(), jobStatus: vi.fn(), result: vi.fn() }
vi.mock('#/server/arcgis-service', async (importOriginal) => ({ ...await importOriginal<typeof import('#/server/arcgis-service')>(), arcgis: () => client }))

const { Route: Health } = await import('#/routes/api/health')
const { Route: Live } = await import('#/routes/api/live')
const { Route: Jobs } = await import('#/routes/api/jobs')
const { Route: JobStatus } = await import('#/routes/api/jobs.$jobId')
const { Route: JobResult } = await import('#/routes/api/jobs.$jobId.result')

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>
const handler = (route: { options: unknown }, method: 'GET' | 'POST') => (route.options as { server: { handlers: Record<string, Handler> } }).server.handlers[method]!
const get = (route: { options: unknown }, params: Record<string, string> = {}) => handler(route, 'GET')({ request: new Request('http://app/drukref/api'), params })
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 9])

beforeEach(() => Object.values(client).forEach((fn) => fn.mockReset()))

describe('GET /api/health', () => {
  it('reports online with the service name', async () => {
    client.health.mockResolvedValue({ name: 'ProjectUploadPackage' })
    const response = await get(Health)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'online', service: 'ProjectUploadPackage' })
  })

  it('reports offline with the reason and HTTP 503', async () => {
    client.health.mockRejectedValue(new ArcGISError('ArcGIS sign-in failed: bad password.', 502))
    const response = await get(Health)
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: 'offline', error: 'ArcGIS sign-in failed: bad password.' })
  })
})

describe('GET /api/live', () => {
  it('reports the app as running without contacting ArcGIS', async () => {
    client.health.mockRejectedValue(new ArcGISError('Cannot reach ArcGIS Server.', 503))
    const response = await get(Live)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ status: 'live' })
    expect(client.health).not.toHaveBeenCalled()
  })
})

describe('POST /api/jobs', () => {
  const submit = (body: BodyInit) => handler(Jobs, 'POST')({ request: new Request('http://app/drukref/api/jobs', { method: 'POST', body }), params: {} })

  it('uploads the package and submits the job', async () => {
    client.upload.mockResolvedValue('item-1')
    client.submit.mockResolvedValue('job-1')
    const response = await submit(ZIP)
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ jobId: 'job-1' })
    expect(client.submit).toHaveBeenCalledWith('item-1')
    expect((client.upload.mock.calls[0]![0] as Blob).size).toBe(ZIP.length)
  })

  it('returns ArcGIS upload errors without submitting', async () => {
    client.upload.mockRejectedValue(new ArcGISError('Upload: the Uploads capability is not enabled.', 502))
    const response = await submit(ZIP)
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Upload: the Uploads capability is not enabled.' })
    expect(client.submit).not.toHaveBeenCalled()
  })

  it('rejects non-ZIP uploads before contacting ArcGIS', async () => {
    const response = await submit('hello')
    expect(response.status).toBe(400)
    expect(client.upload).not.toHaveBeenCalled()
  })
})

describe('GET /api/jobs/:jobId', () => {
  it('returns the job status', async () => {
    client.jobStatus.mockResolvedValue({ jobId: 'j1', jobStatus: 'esriJobExecuting', messages: [] })
    const response = await get(JobStatus, { jobId: 'j1' })
    expect(await response.json()).toMatchObject({ jobStatus: 'esriJobExecuting' })
    expect(client.jobStatus).toHaveBeenCalledWith('j1')
  })

  it('maps invalid job IDs to HTTP 400', async () => {
    client.jobStatus.mockRejectedValue(new ArcGISError('Invalid job ID.', 400))
    expect((await get(JobStatus, { jobId: '..' })).status).toBe(400)
  })
})

describe('GET /api/jobs/:jobId/result', () => {
  it('streams the package as a ZIP attachment with a safe file name', async () => {
    client.result.mockResolvedValue({ response: new Response('zip-bytes', { headers: { 'Content-Length': '9' } }), fileName: 'roads "DrukRef23"\r\n.zip' })
    const response = await get(JobResult, { jobId: 'j1' })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/zip')
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="roads__DrukRef23___.zip"')
    expect(response.headers.get('content-length')).toBe('9')
    expect(await response.text()).toBe('zip-bytes')
  })

  it('drops the upstream length when ArcGIS compressed the response', async () => {
    client.result.mockResolvedValue({ response: new Response('zip-bytes', { headers: { 'Content-Length': '4', 'Content-Encoding': 'gzip' } }), fileName: 'out.zip' })
    expect((await get(JobResult, { jobId: 'j1' })).headers.get('content-length')).toBeNull()
  })

  it('returns a JSON error when the result is unavailable', async () => {
    client.result.mockRejectedValue(new ArcGISError('Result: the job finished without a downloadable package.', 502))
    const response = await get(JobResult, { jobId: 'j1' })
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Result: the job finished without a downloadable package.' })
  })
})
