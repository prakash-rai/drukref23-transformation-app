/**
 * Documentation drift checks (see docs/README.md, "How documentation is maintained").
 * They keep configuration docs, links and the IIS rule in step with the code.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '..')
const read = (path: string) => readFileSync(join(root, path), 'utf8')
const IGNORED_DIRS = new Set(['node_modules', '.git', '.output', 'dist', '.tanstack', '.nitro', '.impeccable', '.codex', 'data'])

function markdownFiles(dir = root): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return IGNORED_DIRS.has(name) ? [] : markdownFiles(path)
    return name.endsWith('.md') ? [path] : []
  })
}

/** Environment variables read by the code, the Windows service entry point, or the Vite build. */
function variablesUsedByCode() {
  const config = read('src/server/arcgis-config.ts')
  const fromConfig = [...config.matchAll(/env\.([A-Z][A-Z0-9_]+)/g)].map((match) => match[1]!)
  // start.mjs also sets Nitro's own variables (`process.env.NAME ??= …`); only the ones it reads belong in .env.
  const start = read('deployment/windows/start.mjs')
  const setByStart = new Set([...start.matchAll(/process\.env\.([A-Z][A-Z0-9_]+) \?\?=/g)].map((match) => match[1]!))
  const fromStart = [...start.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)].map((match) => match[1]!).filter((name) => !setByStart.has(name))
  const fromVite = [...read('vite.config.ts').matchAll(/env\.([A-Z][A-Z0-9_]+)/g)].map((match) => match[1]!)
  return new Set([...fromConfig, ...fromStart, ...fromVite])
}

const exampleVariables = new Set([...read('.env.example').matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((match) => match[1]!))
const documentedVariables = new Set([...read('docs/configuration.md').matchAll(/^\| `([A-Z][A-Z0-9_]+)` \|/gm)].map((match) => match[1]!))

describe('configuration documentation', () => {
  it.each([...variablesUsedByCode()])('%s is in .env.example and docs/configuration.md', (name) => {
    expect(exampleVariables, '.env.example').toContain(name)
    expect(documentedVariables, 'docs/configuration.md').toContain(name)
  })

  it('documents exactly the variables in .env.example', () => {
    expect([...documentedVariables].sort()).toEqual([...exampleVariables].sort())
  })

  it('keeps .env.example free of real credentials', () => {
    expect(read('.env.example')).toMatch(/^ARCGIS_USERNAME=$/m)
    expect(read('.env.example')).toMatch(/^ARCGIS_PASSWORD=$/m)
  })
})

describe('Markdown links', () => {
  const links = markdownFiles().flatMap((file) =>
    [...readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '').matchAll(/\]\(([^)\s]+)\)/g)]
      .map((match) => match[1]!)
      .filter((target) => !/^(https?:|mailto:|#)/.test(target))
      .map((target) => ({ file: relative(root, file), target })),
  )

  it('finds documentation to check', () => {
    expect(links.length).toBeGreaterThan(20)
  })

  it.each(links)('$file → $target exists', ({ file, target }) => {
    expect(existsSync(resolve(root, dirname(file), decodeURIComponent(target.split('#')[0]!)))).toBe(true)
  })
})

describe('deployment configuration', () => {
  const example = Object.fromEntries([...read('.env.example').matchAll(/^([A-Z_]+)=(.*)$/gm)].map((match) => [match[1], match[2]]))

  it('IIS forwards to the default port and base path', () => {
    const base = example.APP_BASE_PATH!
    expect(read('deployment/iis/web.config')).toContain(`url="http://127.0.0.1:${example.APP_PORT}${base}{R:1}"`)
    expect(read('deployment/iis/web.config')).toContain(`url="${base}"`)
    expect(example.ARCGIS_TOKEN_REFERER).toBe(`https://cadastral.systems.gov.bt${base}`)
  })

  it('the Windows service runs the release that deploy.ps1 switches', () => {
    expect(read('deployment/windows/DrukRef.xml')).toContain('%BASE%\\app\\current\\start.mjs')
    expect(read('deployment/windows/deploy.ps1')).toMatch(/\$current = Join-Path \$app 'current'/)
  })

  it('changelog has an Unreleased section', () => {
    expect(read('CHANGELOG.md')).toMatch(/^## \[Unreleased\]$/m)
  })
})
