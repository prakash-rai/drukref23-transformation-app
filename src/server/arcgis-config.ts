/**
 * Server-only ArcGIS configuration. Values come from environment variables
 * (loaded from `.env`: the project folder in development, C:\apps\drukref in production).
 * Never import this module from browser code: it holds the service credentials.
 */
export type ArcGISConfig = {
  /** ArcGIS Server web adaptor root, e.g. https://cadastral.systems.gov.bt/server */
  serverUrl: string
  username: string
  password: string
  /** Service path below /rest/services, e.g. project/ProjectUploadPackage */
  gpService: string
  /** Task name inside the GP service. */
  gpTask: string
  /** Referer the token is bound to; sent on every ArcGIS request. */
  tokenReferer: string
  /** Requested token lifetime in minutes. */
  tokenMinutes: number
  /** Largest accepted upload package, in bytes. */
  maxUploadBytes: number
}

let envLoaded = false

function loadDotEnv() {
  if (envLoaded) return
  envLoaded = true
  try {
    // Node >= 20.12: loads ./.env without overriding variables already set (e.g. by the Windows service).
    process.loadEnvFile?.()
  } catch {
    // No .env file: rely on the process environment.
  }
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, '')
}

export function readArcGISConfig(env: Record<string, string | undefined> = (loadDotEnv(), process.env)): ArcGISConfig {
  const serverUrl = (env.ARCGIS_SERVER_URL ?? 'https://cadastral.systems.gov.bt/server').replace(/\/+$/, '')
  const tokenMinutes = Number(env.ARCGIS_TOKEN_MINUTES ?? 60)
  const maxUploadMb = Number(env.MAX_UPLOAD_MB ?? 2048)
  return {
    serverUrl,
    username: env.ARCGIS_USERNAME ?? '',
    password: env.ARCGIS_PASSWORD ?? '',
    gpService: trimSlashes(env.ARCGIS_GP_SERVICE ?? 'project/ProjectUploadPackage'),
    gpTask: trimSlashes(env.ARCGIS_GP_TASK ?? 'ProjectUploadPackage'),
    tokenReferer: env.ARCGIS_TOKEN_REFERER ?? 'https://cadastral.systems.gov.bt/drukref/',
    tokenMinutes: Number.isFinite(tokenMinutes) && tokenMinutes > 0 ? tokenMinutes : 60,
    maxUploadBytes: (Number.isFinite(maxUploadMb) && maxUploadMb > 0 ? maxUploadMb : 2048) * 1024 * 1024,
  }
}

export function missingCredentials(config: ArcGISConfig) {
  return [!config.username && 'ARCGIS_USERNAME', !config.password && 'ARCGIS_PASSWORD'].filter((name): name is string => Boolean(name))
}
