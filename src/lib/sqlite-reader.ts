/**
 * Minimal read-only SQLite table reader (https://www.sqlite.org/fileformat.html).
 * It reads only the pages it needs through `readBytes`, so small metadata tables in a large
 * GeoPackage cost a few kilobytes regardless of the file size. Supports rowid tables in UTF-8
 * databases, which covers the GeoPackage metadata tables.
 */
export type ReadBytes = (offset: number, length: number) => Promise<Uint8Array>
export type SqliteValue = null | number | string | Uint8Array
export type SqliteRow = Record<string, SqliteValue>

const MAX_PAGES = 10_000

export function readBytesFromBlob(blob: Blob): ReadBytes {
  return async (offset, length) => new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer())
}

function varint(bytes: Uint8Array, start: number): [value: number, next: number] {
  let value = 0
  for (let index = 0; index < 8; index++) {
    const byte = bytes[start + index]
    if (byte === undefined) throw new Error('Truncated SQLite varint.')
    value = value * 128 + (byte & 0x7f)
    if (byte < 0x80) return [value, start + index + 1]
  }
  const last = bytes[start + 8]
  if (last === undefined) throw new Error('Truncated SQLite varint.')
  return [value * 256 + last, start + 9]
}

const uint16 = (bytes: Uint8Array, at: number) => (bytes[at]! << 8) | bytes[at + 1]!
const uint32 = (bytes: Uint8Array, at: number) => ((bytes[at]! << 24) >>> 0) + (bytes[at + 1]! << 16) + (bytes[at + 2]! << 8) + bytes[at + 3]!

function decodeRecord(payload: Uint8Array): SqliteValue[] {
  const [headerSize, first] = varint(payload, 0)
  const types: number[] = []
  for (let at = first; at < headerSize;) { const [type, next] = varint(payload, at); types.push(type); at = next }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const decoder = new TextDecoder()
  const values: SqliteValue[] = []
  let at = headerSize
  for (const type of types) {
    if (type === 0) values.push(null)
    else if (type >= 1 && type <= 6) {
      const size = [0, 1, 2, 3, 4, 6, 8][type]!
      let value = 0
      for (let index = 0; index < size; index++) value = value * 256 + payload[at + index]!
      if (payload[at]! & 0x80) value -= 2 ** (size * 8)
      values.push(value)
      at += size
    } else if (type === 7) { values.push(view.getFloat64(at)); at += 8 }
    else if (type === 8 || type === 9) values.push(type - 8)
    else if (type >= 12) {
      const size = type % 2 === 0 ? (type - 12) / 2 : (type - 13) / 2
      const bytes = payload.subarray(at, at + size)
      values.push(type % 2 === 0 ? bytes.slice() : decoder.decode(bytes))
      at += size
    } else throw new Error('Unsupported SQLite serial type.')
  }
  return values
}

/** Column names from a CREATE TABLE statement, plus the INTEGER PRIMARY KEY column that aliases the rowid. */
export function parseCreateTable(sql: string) {
  const body = sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(')'))
  const definitions: string[] = []
  let depth = 0
  let current = ''
  let quote = ''
  for (const char of body) {
    if (quote) { if (char === quote) quote = ''; current += char; continue }
    if (char === '"' || char === '\'' || char === '`' || char === '[') { quote = char === '[' ? ']' : char; current += char; continue }
    if (char === '(') depth++
    if (char === ')') depth--
    if (char === ',' && depth === 0) { definitions.push(current.trim()); current = ''; continue }
    current += char
  }
  if (current.trim()) definitions.push(current.trim())
  const columns: string[] = []
  let rowidAlias: string | undefined
  for (const definition of definitions) {
    if (/^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN)\b/i.test(definition)) continue
    const match = /^(?:"((?:[^"]|"")*)"|`([^`]*)`|\[([^\]]*)\]|'([^']*)'|(\S+))/.exec(definition)
    if (!match) continue
    const name = match[1]?.replace(/""/g, '"') ?? match[2] ?? match[3] ?? match[4] ?? match[5]!
    columns.push(name)
    if (/^\S+\s+INTEGER\s+(NOT\s+NULL\s+)?PRIMARY\s+KEY\b/i.test(definition.replace(/^("(?:[^"]|"")*"|`[^`]*`|\[[^\]]*\]|'[^']*')/, 'x'))) rowidAlias = name
  }
  return { columns, rowidAlias }
}

export async function openSqlite(readBytes: ReadBytes) {
  const header = await readBytes(0, 100)
  if (header.length < 100 || new TextDecoder().decode(header.subarray(0, 15)) !== 'SQLite format 3') throw new Error('Not a SQLite database.')
  const rawPageSize = uint16(header, 16)
  const pageSize = rawPageSize === 1 ? 65536 : rawPageSize
  const usable = pageSize - header[20]!
  if (uint32(header, 56) > 1) throw new Error('Only UTF-8 SQLite databases are supported.')
  const cache = new Map<number, Uint8Array>()
  let pagesRead = 0

  async function page(number: number) {
    const cached = cache.get(number)
    if (cached) return cached
    if (++pagesRead > MAX_PAGES) throw new Error('SQLite table is too large to inspect.')
    const bytes = await readBytes((number - 1) * pageSize, pageSize)
    if (bytes.length < pageSize) throw new Error('Truncated SQLite database.')
    cache.set(number, bytes)
    return bytes
  }

  async function payloadOf(bytes: Uint8Array, cellStart: number): Promise<[rowid: number, payload: Uint8Array]> {
    const [size, afterSize] = varint(bytes, cellStart)
    const [rowid, start] = varint(bytes, afterSize)
    const maxLocal = usable - 35
    if (size <= maxLocal) return [rowid, bytes.subarray(start, start + size)]
    const minLocal = Math.floor(((usable - 12) * 32) / 255) - 23
    const spill = minLocal + ((size - minLocal) % (usable - 4))
    const local = spill <= maxLocal ? spill : minLocal
    const payload = new Uint8Array(size)
    payload.set(bytes.subarray(start, start + local))
    let filled = local
    let next = uint32(bytes, start + local)
    while (filled < size) {
      if (!next) throw new Error('Truncated SQLite overflow chain.')
      const overflow = await page(next)
      const chunk = Math.min(usable - 4, size - filled)
      payload.set(overflow.subarray(4, 4 + chunk), filled)
      filled += chunk
      next = uint32(overflow, 0)
    }
    return [rowid, payload]
  }

  /** Every row of the table b-tree rooted at `rootPage`, in rowid order. */
  async function scan(rootPage: number) {
    const rows: Array<{ rowid: number; values: SqliteValue[] }> = []
    const visited = new Set<number>()
    async function visit(number: number) {
      if (visited.has(number)) throw new Error('Corrupt SQLite b-tree.')
      visited.add(number)
      const bytes = await page(number)
      const headerAt = number === 1 ? 100 : 0
      const type = bytes[headerAt]
      const cells = uint16(bytes, headerAt + 3)
      if (type === 0x0d) {
        for (let index = 0; index < cells; index++) {
          const [rowid, payload] = await payloadOf(bytes, uint16(bytes, headerAt + 8 + index * 2))
          rows.push({ rowid, values: decodeRecord(payload) })
        }
      } else if (type === 0x05) {
        for (let index = 0; index < cells; index++) await visit(uint32(bytes, uint16(bytes, headerAt + 12 + index * 2)))
        await visit(uint32(bytes, headerAt + 8))
      } else throw new Error('Not a SQLite rowid table.')
    }
    await visit(rootPage)
    return rows
  }

  const schema = (await scan(1)).map(({ values }) => ({ type: values[0], name: values[1], rootPage: values[3], sql: values[4] }))

  /** Rows of `table` keyed by column name, or undefined when the table does not exist. */
  async function readTable(table: string): Promise<SqliteRow[] | undefined> {
    const entry = schema.find((item) => item.type === 'table' && typeof item.name === 'string' && item.name.toLowerCase() === table.toLowerCase())
    if (!entry || typeof entry.rootPage !== 'number' || typeof entry.sql !== 'string') return undefined
    if (/\bWITHOUT\s+ROWID\b/i.test(entry.sql)) throw new Error('WITHOUT ROWID tables are not supported.')
    const { columns, rowidAlias } = parseCreateTable(entry.sql)
    return (await scan(entry.rootPage)).map(({ rowid, values }) => Object.fromEntries(columns.map((column, index) => [column, column === rowidAlias && values[index] == null ? rowid : values[index] ?? null])))
  }

  return { readTable }
}
