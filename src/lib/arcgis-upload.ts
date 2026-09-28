/**
 * Browser client for the app's own `/api` endpoints. The app server holds the
 * ArcGIS credentials and token; the browser never talks to ArcGIS directly.
 */
export type JobStatus = { jobStatus?: string; messages?: Array<{ type?: string; description?: string }> }
export type ServiceCheck = { online: true } | { online: false; reason: string }

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
type Dependencies = { fetch?: FetchLike; sleep?: (ms: number) => Promise<void>; download?: (url: string) => void }

export const POLL_INTERVAL_MS = 2000
export const MAX_POLL_MINUTES = 60
/** How long polling rides out an app restart (deploy) or ArcGIS outage before giving up. */
export const MAX_POLL_OUTAGE_MINUTES = 3
const MAX_CONSECUTIVE_POLL_ERRORS = 5
const MAX_OUTAGE_POLLS = Math.ceil((MAX_POLL_OUTAGE_MINUTES * 60_000) / POLL_INTERVAL_MS)
/** IIS/ARR (app restarting) and the app server (ArcGIS unavailable) answer with these while a restart is in progress. */
const TRANSIENT_STATUS = new Set([502, 503, 504])

/** Resolves an API path under the app's base path (e.g. /drukref/api/health). */
export function apiUrl(path: string, base: string = import.meta.env.BASE_URL ?? '/') {
  return `${base.endsWith('/') ? base : `${base}/`}api/${path.replace(/^\/+/, '')}`
}

async function readError(response: Response, fallback: string) {
  try {
    const body = await response.json() as { error?: string }
    return body.error || fallback
  } catch {
    return `${fallback} (HTTP ${response.status})`
  }
}

export async function checkUploadService({ fetch: fetchImpl = fetch }: Dependencies = {}): Promise<ServiceCheck> {
  try {
    const response = await fetchImpl(apiUrl('health'), { cache: 'no-store' })
    if (response.ok) return { online: true }
    return { online: false, reason: await readError(response, 'The transformation service is unavailable.') }
  } catch {
    return { online: false, reason: 'The app server could not be reached.' }
  }
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const defaultDownload = (url: string) => window.location.assign(url)

export async function submitUploadPackage(blob: Blob, onStatus: (status: JobStatus) => void, dependencies: Dependencies = {}) {
  const { fetch: fetchImpl = fetch, sleep = defaultSleep, download = defaultDownload } = dependencies

  onStatus({ jobStatus: 'uploading' })
  const submitted = await fetchImpl(apiUrl('jobs'), { method: 'POST', body: blob, headers: { 'Content-Type': 'application/zip' } })
  if (!submitted.ok) throw new Error(await readError(submitted, 'The package could not be submitted.'))
  const { jobId } = await submitted.json() as { jobId?: string }
  if (!jobId) throw new Error('The app server did not return a job ID.')
  onStatus({ jobStatus: 'submitted' })

  const attempts = Math.ceil((MAX_POLL_MINUTES * 60_000) / POLL_INTERVAL_MS)
  let consecutiveErrors = 0
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await sleep(POLL_INTERVAL_MS)
    let status: JobStatus
    let transient = true
    let reason = 'The app server could not be reached.'
    try {
      const response = await fetchImpl(apiUrl(`jobs/${encodeURIComponent(jobId)}`), { cache: 'no-store' })
      if (!response.ok) {
        transient = TRANSIENT_STATUS.has(response.status)
        reason = await readError(response, 'The job status could not be read.')
        throw new Error(reason)
      }
      status = await response.json() as JobStatus
      consecutiveErrors = 0
    } catch {
      consecutiveErrors += 1
      if (!transient && consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) throw new Error(reason)
      if (consecutiveErrors >= MAX_OUTAGE_POLLS) throw new Error(`The job status could not be read for ${MAX_POLL_OUTAGE_MINUTES} minutes. ${reason}`)
      continue
    }
    onStatus(status)

    if (status.jobStatus === 'esriJobSucceeded') {
      onStatus({ jobStatus: 'downloading' })
      download(apiUrl(`jobs/${encodeURIComponent(jobId)}/result`))
      return
    }
    if (status.jobStatus === 'esriJobFailed' || status.jobStatus === 'esriJobCancelled' || status.jobStatus === 'esriJobTimedOut') {
      const failures = status.messages?.map((message) => message.description).filter((message): message is string => Boolean(message && /failed to transform|no datasets could be transformed|error/i.test(message)))
      throw new Error(failures?.join(' ') || `Job ${status.jobStatus}.`)
    }
  }
  throw new Error(`The transformation job did not finish within ${MAX_POLL_MINUTES} minutes.`)
}
