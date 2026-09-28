import { describe, expect, it } from 'vitest'
import { ArcGISClient, ArcGISError, assertJobId, resolveResultUrl } from './arcgis-client'
import { missingCredentials, readArcGISConfig } from './arcgis-config'

const config = readArcGISConfig({ ARCGIS_SERVER_URL: 'https://gis.example/server/', ARCGIS_USERNAME: 'svc', ARCGIS_PASSWORD: 'secret', ARCGIS_TOKEN_REFERER: 'https://gis.example/drukref/' })
const taskUrl = 'https://gis.example/server/rest/services/project/ProjectUploadPackage/GPServer/ProjectUploadPackage'
const uploadUrl = 'https://gis.example/server/rest/services/project/ProjectUploadPackage/GPServer/uploads/upload'
const tokenUrl = 'https://gis.example/server/tokens/generateToken'
const resultFile = 'https://public.example/server/rest/directories/arcgisjobs/project/projectuploadpackage_gpserver/j42/scratch/projected-output.zip'

type Call = { url: string; init?: RequestInit }
type Route = (call: Call) => Response | Promise<Response | undefined> | undefined

/** Fake fetch that records calls and answers from the first matching route. */
function fakeFetch(...routes: Route[]) {
  const calls: Call[] = []
  const impl = async (url: string, init?: RequestInit) => {
    const call = { url, init }
    calls.push(call)
    for (const route of routes) { const response = await route(call); if (response) return response }
    throw new Error(`Unexpected request ${url}`)
  }
  return { impl, calls, count: (fragment: string) => calls.filter((call) => call.url.includes(fragment)).length }
}
const body = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'text/plain;charset=utf-8' } })
const header = (call: Call, name: string) => (call.init?.headers as Record<string, string>)[name]
const taskMetadata = { name: 'ProjectUploadPackage', executionType: 'esriExecutionTypeAsynchronous', parameters: [{ name: 'in_package', dataType: 'GPDataFile' }, { name: 'out_package', dataType: 'GPDataFile' }] }

/** Issues tokens t1, t2, … valid for `validMs` from the (fake) clock. */
function tokens(now: () => number = Date.now, validMs = 3_600_000): Route {
  let count = 0
  return (call) => call.url === tokenUrl ? body({ token: `t${++count}`, expires: now() + validMs }) : undefined
}
const at = (url: string, response: () => Response): Route => (call) => call.url.startsWith(url) ? response() : undefined

describe('readArcGISConfig', () => {
  it('uses the cadastral server and sub-path referer by default', () => {
    const defaults = readArcGISConfig({})
    expect(defaults).toMatchObject({ serverUrl: 'https://cadastral.systems.gov.bt/server', tokenReferer: 'https://cadastral.systems.gov.bt/drukref/', gpService: 'project/ProjectUploadPackage', gpTask: 'ProjectUploadPackage', tokenMinutes: 60, maxUploadBytes: 2048 * 1024 * 1024 })
  })

  it('normalizes slashes and falls back when numbers are invalid', () => {
    const parsed = readArcGISConfig({ ARCGIS_SERVER_URL: 'https://x/server///', ARCGIS_GP_SERVICE: '/Folder/Service/', ARCGIS_GP_TASK: '/Task/', ARCGIS_TOKEN_MINUTES: 'soon', MAX_UPLOAD_MB: '-5' })
    expect(parsed).toMatchObject({ serverUrl: 'https://x/server', gpService: 'Folder/Service', gpTask: 'Task', tokenMinutes: 60, maxUploadBytes: 2048 * 1024 * 1024 })
    expect(readArcGISConfig({ MAX_UPLOAD_MB: '10', ARCGIS_TOKEN_MINUTES: '15' })).toMatchObject({ maxUploadBytes: 10 * 1024 * 1024, tokenMinutes: 15 })
  })

  it('lists missing credentials', () => {
    expect(missingCredentials(readArcGISConfig({}))).toEqual(['ARCGIS_USERNAME', 'ARCGIS_PASSWORD'])
    expect(missingCredentials(readArcGISConfig({ ARCGIS_USERNAME: 'svc' }))).toEqual(['ARCGIS_PASSWORD'])
    expect(missingCredentials(config)).toEqual([])
  })
})

describe('ArcGISClient tokens', () => {
  it('generates a referer-bound token from server credentials and sends it only in headers and form bodies', async () => {
    const fake = fakeFetch(tokens(), at(taskUrl, () => body(taskMetadata)))
    const client = new ArcGISClient(config, fake.impl)
    await client.health()
    await client.health()
    expect(fake.count('/generateToken')).toBe(1)
    const form = new URLSearchParams(String(fake.calls[0]!.init?.body))
    expect(Object.fromEntries(form)).toMatchObject({ username: 'svc', password: 'secret', client: 'referer', referer: 'https://gis.example/drukref/', expiration: '60', f: 'json' })
    const serviceCall = fake.calls.find((call) => call.url.startsWith(taskUrl))!
    expect(header(serviceCall, 'X-Esri-Authorization')).toBe('Bearer t1')
    expect(header(serviceCall, 'Referer')).toBe('https://gis.example/drukref/')
    expect(fake.calls.every((call) => !call.url.includes('token=') && !call.url.includes('secret'))).toBe(true)
  })

  it('refreshes the token five minutes before it expires', async () => {
    let clock = 1_000_000
    const now = () => clock
    const fake = fakeFetch(tokens(now, 10 * 60_000), at(taskUrl, () => body(taskMetadata)))
    const client = new ArcGISClient(config, fake.impl, now)
    await client.health()
    clock += 4 * 60_000
    await client.health()
    expect(fake.count('/generateToken')).toBe(1)
    clock += 2 * 60_000
    await client.health()
    expect(fake.count('/generateToken')).toBe(2)
  })

  it('falls back to the configured lifetime when ArcGIS omits the expiry', async () => {
    let clock = 0
    const fake = fakeFetch((call) => call.url === tokenUrl ? body({ token: 'no-expiry' }) : undefined, at(taskUrl, () => body(taskMetadata)))
    const client = new ArcGISClient(readArcGISConfig({ ARCGIS_USERNAME: 'u', ARCGIS_PASSWORD: 'p', ARCGIS_SERVER_URL: 'https://gis.example/server', ARCGIS_TOKEN_MINUTES: '30' }), fake.impl, () => clock)
    await client.health()
    clock = 24 * 60_000
    await client.health()
    expect(fake.count('/generateToken')).toBe(1)
    clock = 26 * 60_000
    await client.health()
    expect(fake.count('/generateToken')).toBe(2)
  })

  it('shares one sign-in between concurrent requests', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const fake = fakeFetch(async (call) => { if (call.url !== tokenUrl) return undefined; await gate; return body({ token: 'shared', expires: Date.now() + 3_600_000 }) }, at(taskUrl, () => body(taskMetadata)))
    const client = new ArcGISClient(config, fake.impl)
    const checks = Promise.all([client.health(), client.health(), client.health()])
    release()
    await checks
    expect(fake.count('/generateToken')).toBe(1)
  })

  it.each([
    ['a JSON 498 error', () => body({ error: { code: 498, message: 'Invalid Token' } })],
    ['a JSON 499 error', () => body({ error: { code: 499, message: 'Token Required' } })],
    ['HTTP status 498', () => new Response('Invalid token', { status: 498 })],
  ])('renews the token once after %s', async (_label, expired) => {
    let serviceCalls = 0
    const fake = fakeFetch(tokens(), (call) => call.url.startsWith(taskUrl) ? (++serviceCalls === 1 ? expired() : body(taskMetadata)) : undefined)
    await expect(new ArcGISClient(config, fake.impl).health()).resolves.toMatchObject({ name: 'ProjectUploadPackage' })
    expect(fake.count('/generateToken')).toBe(2)
    expect(header(fake.calls.at(-1)!, 'X-Esri-Authorization')).toBe('Bearer t2')
  })

  it('gives up after one renewal and points at permissions and the referer', async () => {
    const fake = fakeFetch(tokens(), at(taskUrl, () => body({ error: { code: 498, message: 'Invalid Token' } })))
    await expect(new ArcGISClient(config, fake.impl).health()).rejects.toThrow(/rejected a freshly generated token .*ARCGIS_TOKEN_REFERER/)
    expect(fake.count('/generateToken')).toBe(2)
    expect(fake.count(taskUrl)).toBe(2)
  })

  it('explains sign-in failures', async () => {
    const fake = fakeFetch(at(tokenUrl, () => body({ error: { code: 400, message: 'Unable to generate token.', details: ['Invalid username or password.'] } })))
    await expect(new ArcGISClient(config, fake.impl).health()).rejects.toThrow('ArcGIS sign-in failed: Unable to generate token — Invalid username or password. Check ARCGIS_USERNAME and ARCGIS_PASSWORD.')
  })

  it('does not contact ArcGIS when credentials are missing', async () => {
    const fake = fakeFetch()
    await expect(new ArcGISClient(readArcGISConfig({}), fake.impl).health()).rejects.toMatchObject({ status: 500, message: expect.stringContaining('missing ARCGIS_USERNAME and ARCGIS_PASSWORD') })
    expect(fake.calls).toHaveLength(0)
  })

  it('retries sign-in on the next request after a failed sign-in', async () => {
    let attempts = 0
    const fake = fakeFetch((call) => call.url === tokenUrl ? (++attempts === 1 ? new Response('<html>Bad gateway</html>', { status: 502 }) : body({ token: 'ok', expires: Date.now() + 3_600_000 })) : undefined, at(taskUrl, () => body(taskMetadata)))
    const client = new ArcGISClient(config, fake.impl)
    await expect(client.health()).rejects.toThrow('Sign-in: ArcGIS Server returned HTTP 502 with a non-JSON response.')
    await expect(client.health()).resolves.toBeTruthy()
  })
})

describe('ArcGISClient errors', () => {
  it('reports unreachable servers with the configured address and cause', async () => {
    const client = new ArcGISClient(config, async () => { throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND gis.example') }) })
    await expect(client.health()).rejects.toMatchObject({ status: 503, message: 'Cannot reach ArcGIS Server at https://gis.example/server (getaddrinfo ENOTFOUND gis.example).' })
  })

  it('reports HTML error pages from IIS or the web adaptor', async () => {
    const fake = fakeFetch(tokens(), at(taskUrl, () => new Response('<html>502.3 Bad Gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } })))
    await expect(new ArcGISClient(config, fake.impl).health()).rejects.toThrow('Service check: ArcGIS Server returned HTTP 502 with a non-JSON response.')
  })

  it('reports HTTP failures even when the body is JSON without an error', async () => {
    const fake = fakeFetch(tokens(), at(taskUrl, () => body({}, 500)))
    await expect(new ArcGISClient(config, fake.impl).health()).rejects.toThrow('Service check: ArcGIS Server returned HTTP 500.')
  })

  it.each([
    [403, 'not permitted to use project/ProjectUploadPackage'],
    [404, 'project/ProjectUploadPackage/ProjectUploadPackage was not found'],
    [500, 'Service check: Something broke'],
  ])('translates ArcGIS error code %i into guidance', async (code, message) => {
    const fake = fakeFetch(tokens(), at(taskUrl, () => body({ error: { code, message: 'Something broke' } })))
    await expect(new ArcGISClient(config, fake.impl).health()).rejects.toThrow(message)
  })

  it('rejects a task that is not the upload-package service', async () => {
    const fake = fakeFetch(tokens(), at(taskUrl, () => body({ name: 'Other', parameters: [{ name: 'in_features', dataType: 'GPFeatureRecordSetLayer' }] })))
    await expect(new ArcGISClient(config, fake.impl).health()).rejects.toThrow('has no GPDataFile parameter named in_package')
  })
})

describe('ArcGISClient jobs', () => {
  it('uploads, submits and reads job status with the token', async () => {
    const fake = fakeFetch(
      tokens(),
      at(uploadUrl, () => body({ success: true, item: { itemID: 'i123' } })),
      at(`${taskUrl}/submitJob`, () => body({ jobId: 'j42', jobStatus: 'esriJobSubmitted' })),
      at(`${taskUrl}/jobs/j42?`, () => body({ jobStatus: 'esriJobExecuting', messages: [{ type: 'esriJobMessageTypeInformative', description: 'Processing dataset 1 of 1', extra: 'dropped' }] })),
    )
    const client = new ArcGISClient(config, fake.impl)
    const itemId = await client.upload(new Blob(['zip']))
    expect(itemId).toBe('i123')
    const uploadForm = fake.calls.find((call) => call.url === uploadUrl)!.init?.body as FormData
    expect(uploadForm.get('token')).toBe('t1')
    expect(uploadForm.get('f')).toBe('json')
    expect((uploadForm.get('file') as File).name).toBe('project-upload.zip')
    expect(await client.submit(itemId)).toBe('j42')
    const submitForm = fake.calls.find((call) => call.url.endsWith('/submitJob'))!.init?.body as URLSearchParams
    expect(JSON.parse(submitForm.get('in_package')!)).toEqual({ itemID: 'i123' })
    expect(submitForm.get('token')).toBe('t1')
    await expect(client.jobStatus('j42')).resolves.toEqual({ jobId: 'j42', jobStatus: 'esriJobExecuting', messages: [{ type: 'esriJobMessageTypeInformative', description: 'Processing dataset 1 of 1' }] })
    expect(fake.calls.at(-1)!.url).toContain('returnMessages=true')
  })

  it('re-sends the upload file after a token renewal', async () => {
    let uploads = 0
    const fake = fakeFetch(tokens(), (call) => call.url === uploadUrl ? (++uploads === 1 ? body({ error: { code: 498, message: 'Invalid Token' } }) : body({ item: { itemID: 'i2' } })) : undefined)
    await expect(new ArcGISClient(config, fake.impl).upload(new Blob(['zip-bytes']))).resolves.toBe('i2')
    const retried = fake.calls.filter((call) => call.url === uploadUrl).at(-1)!.init?.body as FormData
    expect(retried.get('token')).toBe('t2')
    expect(await (retried.get('file') as File).text()).toBe('zip-bytes')
  })

  it('accepts the legacy top-level itemID upload response', async () => {
    const fake = fakeFetch(tokens(), at(uploadUrl, () => body({ itemID: 'legacy' })))
    await expect(new ArcGISClient(config, fake.impl).upload(new Blob(['zip']))).resolves.toBe('legacy')
  })

  it('explains a disabled Uploads capability', async () => {
    const fake = fakeFetch(tokens(), at(uploadUrl, () => body(taskMetadata)))
    await expect(new ArcGISClient(config, fake.impl).upload(new Blob(['zip']))).rejects.toThrow('Uploads capability is not enabled')
  })

  it('reports missing upload item and job IDs', async () => {
    const fake = fakeFetch(tokens(), at(uploadUrl, () => body({ success: false })), at(`${taskUrl}/submitJob`, () => body({ jobStatus: 'esriJobFailed' })))
    const client = new ArcGISClient(config, fake.impl)
    await expect(client.upload(new Blob(['zip']))).rejects.toThrow('returned no upload item ID')
    await expect(client.submit('i1')).rejects.toThrow('did not return a job ID')
  })

  it('surfaces submitJob parameter errors', async () => {
    const fake = fakeFetch(tokens(), at(`${taskUrl}/submitJob`, () => body({ error: { code: 400, message: 'Unable to complete operation.', details: ['Invalid value for parameter in_package'] } })))
    await expect(new ArcGISClient(config, fake.impl).submit('i1')).rejects.toThrow('Job submission: Unable to complete operation — Invalid value for parameter in_package.')
  })

  it('treats a status without jobStatus as unknown', async () => {
    const fake = fakeFetch(tokens(), at(`${taskUrl}/jobs/j1?`, () => body({})))
    await expect(new ArcGISClient(config, fake.impl).jobStatus('j1')).resolves.toEqual({ jobId: 'j1', jobStatus: 'esriJobUnknown', messages: [] })
  })

  it.each(['../../admin', 'j1?f=json', 'j 1', '', 'x'.repeat(65)])('rejects the malformed job ID %j before contacting ArcGIS', async (jobId) => {
    const fake = fakeFetch()
    await expect(new ArcGISClient(config, fake.impl).jobStatus(jobId)).rejects.toMatchObject({ status: 400 })
    await expect(new ArcGISClient(config, fake.impl).result(jobId)).rejects.toBeInstanceOf(ArcGISError)
    expect(fake.calls).toHaveLength(0)
  })

  it('accepts ArcGIS job IDs', () => {
    expect(() => assertJobId('j9f1c0a2b3d4e5f60718293a4b5c6d7e8')).not.toThrow()
  })
})

describe('ArcGISClient results', () => {
  it('downloads the result through the configured server without reading it into memory', async () => {
    const zip = new Response('zip-bytes', { headers: { 'Content-Type': 'application/x-zip-compressed' } })
    const fake = fakeFetch(tokens(), at(`${taskUrl}/jobs/j42/results/out_package`, () => body({ paramName: 'out_package', value: { url: resultFile } })), (call) => call.url.endsWith('projected-output.zip') ? zip : undefined)
    const { response, fileName } = await new ArcGISClient(config, fake.impl).result('j42')
    expect(fileName).toBe('projected-output.zip')
    expect(response.bodyUsed).toBe(false)
    expect(await response.text()).toBe('zip-bytes')
    expect(fake.calls.at(-1)!.url).toBe('https://gis.example/server/rest/directories/arcgisjobs/project/projectuploadpackage_gpserver/j42/scratch/projected-output.zip')
    expect(header(fake.calls.at(-1)!, 'X-Esri-Authorization')).toBe('Bearer t1')
  })

  it('accepts a relative or string result value and decodes the file name', async () => {
    const fake = fakeFetch(tokens(), at(`${taskUrl}/jobs/j1/results/out_package`, () => body({ value: '/server/rest/directories/arcgisjobs/p/j1/scratch/roads%20DrukRef23.zip' })), (call) => call.url.includes('/scratch/') ? new Response('z', { headers: { 'Content-Type': 'application/octet-stream' } }) : undefined)
    await expect(new ArcGISClient(config, fake.impl).result('j1')).resolves.toMatchObject({ fileName: 'roads DrukRef23.zip' })
  })

  it('renews the token when the result download is rejected as JSON', async () => {
    let downloads = 0
    const fake = fakeFetch(tokens(), at(`${taskUrl}/jobs/j42/results/out_package`, () => body({ value: { url: resultFile } })), (call) => call.url.endsWith('.zip') ? (++downloads === 1 ? body({ error: { code: 498, message: 'Invalid Token' } }) : new Response('zip', { headers: { 'Content-Type': 'application/zip' } })) : undefined)
    const { response } = await new ArcGISClient(config, fake.impl).result('j42')
    expect(await response.text()).toBe('zip')
    expect(downloads).toBe(2)
  })

  it('reports jobs without a package and failed downloads', async () => {
    const empty = fakeFetch(tokens(), at(`${taskUrl}/jobs/j1/results/out_package`, () => body({ paramName: 'out_package' })))
    await expect(new ArcGISClient(config, empty.impl).result('j1')).rejects.toThrow('finished without a downloadable package')
    const missing = fakeFetch(tokens(), at(`${taskUrl}/jobs/j1/results/out_package`, () => body({ value: { url: resultFile } })), (call) => call.url.endsWith('.zip') ? new Response('gone', { status: 404, headers: { 'Content-Type': 'application/zip' } }) : undefined)
    await expect(new ArcGISClient(config, missing.impl).result('j1')).rejects.toThrow('failed with HTTP 404')
  })
})

describe('resolveResultUrl', () => {
  it('re-roots job output URLs on the configured server', () => {
    expect(resolveResultUrl('https://internal:6443/arcgis', resultFile)).toBe('https://internal:6443/arcgis/rest/directories/arcgisjobs/project/projectuploadpackage_gpserver/j42/scratch/projected-output.zip')
  })

  it.each([
    'https://evil.example/steal',
    'https://gis.example/server/rest/services/admin?f=json',
    'https://gis.example/server/rest/directories/arcgisoutput/other.zip',
    'https://gis.example/server/rest/directories/arcgisjobs/%2e%2e/%2e%2e/admin',
    'https://gis.example/server/rest/directories/arcgisjobs/j/..%2F..%2Fadmin',
  ])('refuses %s', (url) => {
    expect(() => resolveResultUrl('https://gis.example/server', url)).toThrow(ArcGISError)
  })
})
