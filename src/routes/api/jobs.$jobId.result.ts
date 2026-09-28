import { createFileRoute } from '@tanstack/react-router'
import { arcgis, failure } from '#/server/arcgis-service'

/** Streams the projected package from ArcGIS so the browser never needs a token or direct ArcGIS access. */
export const Route = createFileRoute('/api/jobs/$jobId/result')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { response, fileName } = await arcgis().result(params.jobId)
          const headers = new Headers({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${fileName.replace(/[^\w.-]/g, '_')}"`,
            'Cache-Control': 'no-store',
          })
          // fetch() transparently decompresses gzip/br, so the upstream length only applies to identity encoding.
          const length = response.headers.get('content-length')
          if (length && !response.headers.get('content-encoding')) headers.set('Content-Length', length)
          return new Response(response.body, { status: 200, headers })
        } catch (cause) {
          return failure(cause)
        }
      },
    },
  },
})
