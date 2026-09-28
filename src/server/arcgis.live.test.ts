/**
 * Live checks against the real ArcGIS Server, using the credentials in .env.
 * Excluded from `pnpm test`; run with `pnpm test:live` on a machine that can reach
 * ARCGIS_SERVER_URL (your office machine or the production server).
 *
 * Set ARCGIS_LIVE_SKIP_JOB=1 to only check sign-in and the service (no job is submitted).
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ArcGISClient } from './arcgis-client'
import { missingCredentials, readArcGISConfig } from './arcgis-config'

const config = readArcGISConfig()
const missing = missingCredentials(config)
if (missing.length) throw new Error(`Live tests need ${missing.join(' and ')} in .env`)

const client = new ArcGISClient(config)
const TEST_PACKAGE = resolve('deployment/data/drukref03-test-upload.zip')
const POLL_MS = 3000
const MAX_WAIT_MS = 10 * 60_000

describe(`ArcGIS Server at ${config.serverUrl}`, () => {
  it('signs in with the configured account', async () => {
    const token = await client.getToken()
    expect(token).not.toHaveLength(0)
  })

  it(`exposes ${config.gpService}/${config.gpTask} as an asynchronous upload-package task`, async () => {
    const service = await client.health()
    expect(service.executionType).toBe('esriExecutionTypeAsynchronous')
  })

  it.skipIf(process.env.ARCGIS_LIVE_SKIP_JOB === '1')('transforms the DrukRef03 test package end to end', async () => {
    const itemId = await client.upload(new Blob([await readFile(TEST_PACKAGE)], { type: 'application/zip' }), 'drukref03-test-upload.zip')
    const jobId = await client.submit(itemId)
    console.info(`[live] submitted job ${jobId}`)

    const started = Date.now()
    let status = await client.jobStatus(jobId)
    while (!/Succeeded|Failed|Cancelled|TimedOut/.test(status.jobStatus)) {
      if (Date.now() - started > MAX_WAIT_MS) throw new Error(`Job ${jobId} still ${status.jobStatus} after ${MAX_WAIT_MS / 60_000} minutes`)
      await new Promise((done) => setTimeout(done, POLL_MS))
      status = await client.jobStatus(jobId)
    }
    const messages = status.messages.map((message) => message.description).join('\n')
    expect(status.jobStatus, messages).toBe('esriJobSucceeded')
    expect(messages).toMatch(/successfully transformed/)

    const { response, fileName } = await client.result(jobId)
    const bytes = new Uint8Array(await response.arrayBuffer())
    console.info(`[live] downloaded ${fileName} (${bytes.length} bytes)`)
    expect(bytes.length).toBeGreaterThan(100)
    expect([...bytes.subarray(0, 2)]).toEqual([0x50, 0x4b])
  })
})
