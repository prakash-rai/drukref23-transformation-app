/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import { configDefaults } from 'vitest/config'
import { devtools } from '@tanstack/devtools-vite'
import { nitro } from 'nitro/vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Normalizes APP_BASE_PATH to the "/segment/" form Vite expects. */
function basePath(value: string | undefined) {
  const trimmed = (value ?? '/drukref/').trim().replace(/^\/+|\/+$/g, '')
  return trimmed ? `/${trimmed}/` : '/'
}

const config = defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const base = basePath(env.APP_BASE_PATH)
  return {
    // The app is served under a sub-path behind IIS (https://cadastral.systems.gov.bt/drukref/).
    // Change APP_BASE_PATH at build time if IIS publishes it elsewhere.
    base,
    resolve: { tsconfigPaths: true },
    test: {
      // *.live.test.ts talk to the real ArcGIS Server; run them with `pnpm test:live`.
      exclude: [...configDefaults.exclude, '**/*.live.test.ts'],
    },
    plugins: [devtools(), tailwindcss(), tanstackStart(), ...(command === 'build' ? [nitro({ preset: 'node-server', baseURL: base })] : []), viteReact()],
  }
})

export default config
