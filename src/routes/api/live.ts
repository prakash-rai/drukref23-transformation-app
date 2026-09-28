import { createFileRoute } from '@tanstack/react-router'
import { json } from '#/server/arcgis-service'

/** App-only liveness: answers whenever the app server runs, without contacting ArcGIS (see /api/health). */
export const Route = createFileRoute('/api/live')({
  server: {
    handlers: {
      GET: async () => json({ status: 'live' }),
    },
  },
})
