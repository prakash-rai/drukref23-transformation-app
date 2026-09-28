import { readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { ArcGISError } from './arcgis-client'
import { explain, failure, withUploadedPackage } from './arcgis-service'

const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4])
const post = (body: BodyInit | null, headers: Record<string, string> = {}) => new Request('http://app/drukref/api/jobs', { method: 'POST', body, headers, duplex: 'half' } as RequestInit)
const leftovers = async () => (await readdir(tmpdir())).filter((name) => name.startsWith('drukref-upload-'))

/** A body that arrives in chunks without a Content-Length header. */
function chunked(...chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({ start(controller) { chunks.forEach((chunk) => controller.enqueue(chunk)); controller.close() } })
}

describe('withUploadedPackage', () => {
  it('passes the streamed package to the callback as a file-backed blob and cleans up', async () => {
    const before = await leftovers()
    const size = await withUploadedPackage(post(chunked(ZIP.subarray(0, 2), ZIP.subarray(2))), 1024, async (file) => {
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(ZIP)
      return file.size
    })
    expect(size).toBe(ZIP.length)
    expect(await leftovers()).toEqual(before)
  })

  it('rejects a declared size over the limit before reading the body', async () => {
    const use = vi.fn()
    await expect(withUploadedPackage(post(ZIP, { 'Content-Length': String(10 * 1024 * 1024) }), 1024 * 1024, use)).rejects.toMatchObject({ status: 413, message: 'The package is larger than the 1 MB limit.' })
    expect(use).not.toHaveBeenCalled()
  })

  it('stops a streamed body that exceeds the limit and removes the partial file', async () => {
    const before = await leftovers()
    const use = vi.fn()
    await expect(withUploadedPackage(post(chunked(ZIP, new Uint8Array(2048))), 1024, use)).rejects.toMatchObject({ status: 413 })
    expect(use).not.toHaveBeenCalled()
    expect(await leftovers()).toEqual(before)
  })

  it.each([
    ['a missing body', null, 'The request contained no upload package.'],
    ['an empty body', chunked(), 'The upload package is empty.'],
    ['a non-ZIP body', chunked(new TextEncoder().encode('{"not":"zip"}')), 'The upload is not a ZIP package.'],
  ])('rejects %s', async (_label, body, message) => {
    await expect(withUploadedPackage(post(body), 1024, vi.fn())).rejects.toMatchObject({ status: 400, message })
  })

  it('cleans up when the ArcGIS upload fails', async () => {
    const before = await leftovers()
    await expect(withUploadedPackage(post(ZIP), 1024, async () => { throw new ArcGISError('Upload: boom', 502) })).rejects.toThrow('Upload: boom')
    expect(await leftovers()).toEqual(before)
  })

  it('cleans up when the browser aborts mid-upload', async () => {
    const before = await leftovers()
    const aborted = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(ZIP); controller.error(new Error('client aborted')) } })
    await expect(withUploadedPackage(post(aborted), 1024, vi.fn())).rejects.toThrow('client aborted')
    expect(await leftovers()).toEqual(before)
  })
})

describe('error responses', () => {
  it('passes safe ArcGIS messages through with their status', async () => {
    const response = failure(new ArcGISError('Upload: too big', 413))
    expect(response.status).toBe(413)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ error: 'Upload: too big' })
  })

  it('hides unexpected internal errors', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(explain(new Error('ECONNRESET at /internal/path with password=secret'))).toEqual({ message: 'The app server hit an unexpected error. Check the service logs.', status: 500 })
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })
})
