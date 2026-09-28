import { missingCredentials, type ArcGISConfig } from './arcgis-config'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type ArcGISMessage = { type?: string; description?: string }
export type ArcGISJobStatus = { jobId: string; jobStatus: string; messages: ArcGISMessage[] }

/** Error with a message that is safe to show to staff in the browser. */
export class ArcGISError extends Error {
  constructor(message: string, readonly status = 502) {
    super(message)
    this.name = 'ArcGISError'
  }
}

const TOKEN_ERROR_CODES = new Set([498, 499])
const REFRESH_MARGIN_MS = 5 * 60 * 1000
const JOB_ID = /^[A-Za-z0-9_-]{1,64}$/

type ArcGISErrorBody = { error?: { code?: number; message?: string; details?: string[] } }

function describe(body: ArcGISErrorBody, fallback: string) {
  const detail = body.error?.details?.filter(Boolean).join(' ')
  return [body.error?.message ?? fallback, detail].filter(Boolean).map((part) => String(part).replace(/\.+$/, '')).join(' — ')
}

/**
 * Talks to a token-secured ArcGIS Server on behalf of the browser.
 * The token is generated from server-side credentials, cached, refreshed before
 * expiry, and renewed once automatically if ArcGIS reports it invalid.
 */
export class ArcGISClient {
  private token?: { value: string; expires: number }
  private pendingToken?: Promise<string>

  constructor(
    private readonly config: ArcGISConfig,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
    private readonly now: () => number = () => Date.now(),
  ) {}

  get taskUrl() {
    return `${this.config.serverUrl}/rest/services/${this.config.gpService}/GPServer/${this.config.gpTask}`
  }

  get uploadsUrl() {
    return `${this.config.serverUrl}/rest/services/${this.config.gpService}/GPServer/uploads`
  }

  private async send(url: string, init: RequestInit = {}) {
    try {
      return await this.fetchImpl(url, { ...init, headers: { Referer: this.config.tokenReferer, ...(init.headers as Record<string, string> | undefined) } })
    } catch (cause) {
      const reason = cause instanceof Error ? (cause.cause instanceof Error ? cause.cause.message : cause.message) : 'network error'
      throw new ArcGISError(`Cannot reach ArcGIS Server at ${this.config.serverUrl} (${reason}).`, 503)
    }
  }

  private async readJson<T>(response: Response, context: string): Promise<T & ArcGISErrorBody> {
    const text = await response.text()
    try {
      return JSON.parse(text) as T & ArcGISErrorBody
    } catch {
      throw new ArcGISError(`${context}: ArcGIS Server returned HTTP ${response.status} with a non-JSON response.`, 502)
    }
  }

  async getToken(force = false): Promise<string> {
    if (!force && this.token && this.token.expires - REFRESH_MARGIN_MS > this.now()) return this.token.value
    if (!force && this.pendingToken) return this.pendingToken
    const missing = missingCredentials(this.config)
    if (missing.length) throw new ArcGISError(`The app server is missing ${missing.join(' and ')}. Add them to the .env file and restart.`, 500)

    this.pendingToken = (async () => {
      const body = new URLSearchParams({
        username: this.config.username,
        password: this.config.password,
        client: 'referer',
        referer: this.config.tokenReferer,
        expiration: String(this.config.tokenMinutes),
        f: 'json',
      })
      const response = await this.send(`${this.config.serverUrl}/tokens/generateToken`, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
      const data = await this.readJson<{ token?: string; expires?: number }>(response, 'Sign-in')
      if (data.error || !data.token) throw new ArcGISError(`ArcGIS sign-in failed: ${describe(data, 'no token returned')}. Check ARCGIS_USERNAME and ARCGIS_PASSWORD.`, 502)
      this.token = { value: data.token, expires: data.expires ?? this.now() + this.config.tokenMinutes * 60_000 }
      return data.token
    })()

    try {
      return await this.pendingToken
    } finally {
      this.pendingToken = undefined
    }
  }

  /**
   * Sends an authenticated request; renews the token once on 498/499.
   * For binary downloads the body is only inspected when ArcGIS answers with text/JSON,
   * so a large package is never read into memory.
   */
  private async authorized(url: string, init: RequestInit = {}, options: { binary?: boolean } = {}, isRetry = false): Promise<Response> {
    const token = await this.getToken(isRetry)
    let body = init.body
    if (body instanceof URLSearchParams) { body = new URLSearchParams(body); body.set('token', token) }
    else if (body instanceof FormData) { const copy = new FormData(); body.forEach((value, key) => copy.append(key, value)); copy.set('token', token); body = copy }
    const response = await this.send(url, { ...init, body, headers: { ...(init.headers as Record<string, string> | undefined), 'X-Esri-Authorization': `Bearer ${token}` } })
    if (isRetry) return response
    if (response.status === 498 || response.status === 499) return this.authorized(url, init, options, true)
    // ArcGIS reports expired tokens as HTTP 200 with a JSON error body (often served as text/plain).
    const contentType = response.headers.get('content-type') ?? ''
    const textual = /json|text|html/i.test(contentType) || (!contentType && !options.binary)
    if (textual) {
      const peek = await response.clone().text()
      if (/"code"\s*:\s*49[89]\b/.test(peek.slice(0, 500))) return this.authorized(url, init, options, true)
    }
    return response
  }

  private async json<T>(url: string, init: RequestInit, context: string) {
    const response = await this.authorized(url, init)
    const data = await this.readJson<T>(response, context)
    if (data.error) {
      const code = data.error.code ?? response.status
      if (TOKEN_ERROR_CODES.has(code)) throw new ArcGISError(`${context}: ArcGIS rejected a freshly generated token (${describe(data, 'token rejected')}). Check that the account can use ${this.config.gpService} and that ARCGIS_TOKEN_REFERER matches the server's allowed referers.`, 502)
      if (code === 403) throw new ArcGISError(`${context}: the ArcGIS account is not permitted to use ${this.config.gpService} (${describe(data, 'forbidden')}). Grant it access in ArcGIS Server Manager.`, 502)
      if (code === 404) throw new ArcGISError(`${context}: ${this.config.gpService}/${this.config.gpTask} was not found on ArcGIS Server (${describe(data, 'not found')}). Check ARCGIS_GP_SERVICE and ARCGIS_GP_TASK.`, 502)
      throw new ArcGISError(`${context}: ${describe(data, 'ArcGIS Server returned an error')}.`, 502)
    }
    if (!response.ok) throw new ArcGISError(`${context}: ArcGIS Server returned HTTP ${response.status}.`, 502)
    return data
  }

  /** Confirms the configured task exists, is accessible, and accepts a file package. */
  async health() {
    const metadata = await this.json<{ name?: string; executionType?: string; parameters?: Array<{ name?: string; dataType?: string }> }>(`${this.taskUrl}?f=json`, {}, 'Service check')
    if (!metadata.parameters?.some((parameter) => parameter.name === 'in_package' && parameter.dataType === 'GPDataFile')) {
      throw new ArcGISError(`Service check: ${this.config.gpService}/${this.config.gpTask} is reachable but has no GPDataFile parameter named in_package.`, 502)
    }
    return { name: metadata.name ?? this.config.gpTask, executionType: metadata.executionType }
  }

  async upload(file: Blob, fileName = 'project-upload.zip') {
    const form = new FormData()
    form.append('f', 'json')
    form.append('file', file, fileName)
    const data = await this.json<{ item?: { itemID?: string }; itemID?: string; parameters?: unknown[] }>(`${this.uploadsUrl}/upload`, { method: 'POST', body: form }, 'Upload')
    if (data.parameters) throw new ArcGISError('Upload: the Uploads capability is not enabled for this GP service. Enable Uploads in ArcGIS Server Manager and restart the service.', 502)
    const itemId = data.item?.itemID ?? data.itemID
    if (!itemId) throw new ArcGISError('Upload: ArcGIS Server returned no upload item ID. Verify that the Uploads capability is enabled.', 502)
    return itemId
  }

  async submit(itemId: string) {
    const body = new URLSearchParams({ f: 'json', in_package: JSON.stringify({ itemID: itemId }) })
    const data = await this.json<{ jobId?: string }>(`${this.taskUrl}/submitJob`, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, 'Job submission')
    if (!data.jobId) throw new ArcGISError('Job submission: ArcGIS Server did not return a job ID.', 502)
    return data.jobId
  }

  async jobStatus(jobId: string): Promise<ArcGISJobStatus> {
    assertJobId(jobId)
    const data = await this.json<{ jobStatus?: string; messages?: ArcGISMessage[] }>(`${this.taskUrl}/jobs/${jobId}?f=json&returnMessages=true`, {}, 'Job status')
    return { jobId, jobStatus: data.jobStatus ?? 'esriJobUnknown', messages: (data.messages ?? []).map(({ type, description }) => ({ type, description })) }
  }

  /** Returns the projected package as a streaming Response from ArcGIS Server. */
  async result(jobId: string) {
    assertJobId(jobId)
    const data = await this.json<{ value?: { url?: string } | string }>(`${this.taskUrl}/jobs/${jobId}/results/out_package?f=json`, {}, 'Result')
    const rawUrl = typeof data.value === 'string' ? data.value : data.value?.url
    if (!rawUrl) throw new ArcGISError('Result: the job finished without a downloadable package.', 502)
    const fileUrl = resolveResultUrl(this.config.serverUrl, rawUrl)
    const response = await this.authorized(fileUrl, {}, { binary: true })
    if (!response.ok || !response.body) throw new ArcGISError(`Result: downloading the projected package failed with HTTP ${response.status}.`, 502)
    return { response, fileName: decodeURIComponent(new URL(fileUrl).pathname.split('/').pop() || 'projected-output.zip') }
  }
}

export function assertJobId(jobId: string) {
  if (!JOB_ID.test(jobId)) throw new ArcGISError('Invalid job ID.', 400)
}

/**
 * ArcGIS returns result URLs using its public host name. Re-root them on the
 * configured server URL (which may be an internal address) and only allow the
 * job output directory, so a crafted value can never make the app fetch arbitrary URLs.
 */
export function resolveResultUrl(serverUrl: string, rawUrl: string) {
  let pathname: string
  try {
    pathname = new URL(rawUrl, `${serverUrl}/`).pathname
  } catch {
    throw new ArcGISError('Result: ArcGIS returned an invalid result URL.', 502)
  }
  const marker = pathname.indexOf('/rest/directories/arcgisjobs/')
  if (marker < 0 || pathname.includes('..')) throw new ArcGISError('Result: ArcGIS returned a result outside the job output directory.', 502)
  return `${serverUrl}${pathname.slice(marker)}`
}
