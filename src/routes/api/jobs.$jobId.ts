import { createFileRoute } from '@tanstack/react-router'
import { arcgis, failure, json } from '#/server/arcgis-service'

export const Route = createFileRoute('/api/jobs/$jobId')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          return json(await arcgis().jobStatus(params.jobId))
        } catch (cause) {
          return failure(cause)
        }
      },
    },
  },
})
