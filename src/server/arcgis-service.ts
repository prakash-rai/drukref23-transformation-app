import { createWriteStream, openAsBlob } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import { ArcGISClient, ArcGISError } from './arcgis-client'
import { readArcGISConfig } from './arcgis-config'

let client: ArcGISClient | undefined
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04])

/** One client per server process so the ArcGIS token is shared and cached. */
export function arcgis() {
  client ??= new ArcGISClient(readArcGISConfig())
  return client
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
}

export function explain(cause: unknown) {
  if (cause instanceof ArcGISError) return { message: cause.message, status: cause.status }
  console.error('[arcgis] unexpected error', cause)
  return { message: 'The app server hit an unexpected error. Check the container logs.', status: 500 }
}

export function failure(cause: unknown) {
  const { message, status } = explain(cause)
  return json({ error: message }, status)
}

/**
 * Streams the request body to a temporary file (never buffering the whole
 * package in memory), enforcing the configured size limit.
 */
export async function withUploadedPackage<T>(request: Request, maxBytes: number, use: (file: Blob) => Promise<T>) {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > maxBytes) throw new ArcGISError(`The package is larger than the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`, 413)
  if (!request.body) throw new ArcGISError('The request contained no upload package.', 400)

  const directory = await mkdtemp(join(tmpdir(), 'drukref-upload-'))
  const path = join(directory, 'project-upload.zip')
  try {
    let received = 0
    let signature = Buffer.alloc(0)
    const limit = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        if (signature.length < 4) signature = Buffer.concat([signature, chunk.subarray(0, 4 - signature.length)])
        received += chunk.length
        if (received > maxBytes) callback(new ArcGISError(`The package is larger than the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`, 413))
        else callback(null, chunk)
      },
    })
    await pipeline(Readable.fromWeb(request.body as unknown as NodeReadableStream<Uint8Array>), limit, createWriteStream(path))
    if (!received) throw new ArcGISError('The upload package is empty.', 400)
    if (!signature.equals(ZIP_SIGNATURE)) throw new ArcGISError('The upload is not a ZIP package.', 400)
    return await use(await openAsBlob(path, { type: 'application/zip' }))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
