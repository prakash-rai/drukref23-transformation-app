import { createFileRoute } from '@tanstack/react-router'
import { readArcGISConfig } from '#/server/arcgis-config'
import { arcgis, failure, json, withUploadedPackage } from '#/server/arcgis-service'

/** Receives the browser-built ZIP, uploads it to ArcGIS and submits the GP job. */
export const Route = createFileRoute('/api/jobs')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const jobId = await withUploadedPackage(request, readArcGISConfig().maxUploadBytes, async (file) => {
            const itemId = await arcgis().upload(file)
            return arcgis().submit(itemId)
          })
          return json({ jobId }, 201)
        } catch (cause) {
          return failure(cause)
        }
      },
    },
  },
})
