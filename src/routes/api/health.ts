import { createFileRoute } from '@tanstack/react-router'
import { arcgis, explain, json } from '#/server/arcgis-service'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const service = await arcgis().health()
          return json({ status: 'online', service: service.name })
        } catch (cause) {
          return json({ status: 'offline', error: explain(cause).message }, 503)
        }
      },
    },
  },
})
