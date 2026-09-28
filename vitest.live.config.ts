import { defineConfig } from 'vitest/config'

/** Live ArcGIS checks (`pnpm test:live`). Uses real credentials from .env; never run in CI or Docker builds. */
export default defineConfig({
  test: {
    include: ['src/**/*.live.test.ts'],
    testTimeout: 15 * 60_000,
    fileParallelism: false,
  },
})
