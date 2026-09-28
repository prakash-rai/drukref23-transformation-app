// Windows service entry point (see DrukRef.xml and docs/deployment.md). Each release folder holds this file next to
// the Nitro build (server/, public/). The service's working directory is C:\apps\drukref, which holds .env.
try {
  // Node >= 20.12. Loads .env without overriding variables the service already sets.
  process.loadEnvFile()
} catch {
  // No .env file: rely on the service environment. /api/health then reports the missing credentials.
}

process.env.NODE_ENV ??= 'production'
// Loopback only: the app is reachable solely through IIS (deployment/iis/web.config).
process.env.NITRO_HOST ??= '127.0.0.1'
process.env.NITRO_PORT ??= process.env.APP_PORT ?? '8080'

await import(new URL('./server/index.mjs', import.meta.url).href)
