import { SOURCE_WKID, TARGET_WKID, sourceCoordinateSystem } from './transformation'

/**
 * Client-side pre-check of a dataset's coordinate system. The GP service stays the final authority
 * (it requires factory code 5266); this only catches clear mismatches before upload.
 * - match: confirmed DrukRef03 by authority code, or by name plus parameters.
 * - probable: looks like DrukRef03 but could not be confirmed; the service decides.
 * - mismatch: a different or missing coordinate system; the service would reject it.
 * - unverified: the definition could not be read.
 */
export type CrsCheck =
  | { status: 'match'; name: string }
  | { status: 'probable'; name: string }
  | { status: 'mismatch'; name: string; alreadyTarget?: boolean }
  | { status: 'undefined' }
  | { status: 'unverified' }

type WktNode = { keyword: string; args: WktValue[] }
type WktValue = WktNode | string | number

/** Parses WKT1 (ESRI and OGC) and WKT2 into a keyword tree. Throws on malformed input. */
export function parseWkt(text: string): WktNode {
  let index = 0
  const skip = () => { while (index < text.length && /[\s,]/.test(text[index]!)) index++ }
  function value(): WktValue {
    skip()
    const char = text[index]
    if (char === '"') {
      let result = ''
      index++
      while (index < text.length) {
        if (text[index] === '"') {
          if (text[index + 1] === '"') { result += '"'; index += 2; continue }
          index++
          return result
        }
        result += text[index++]
      }
      throw new Error('Unterminated string in WKT.')
    }
    const token = /^[A-Za-z_][A-Za-z0-9_]*|^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(text.slice(index))
    if (!token) throw new Error('Unexpected character in WKT.')
    index += token[0].length
    if (/^[-+.\d]/.test(token[0])) return Number(token[0])
    skip()
    if (text[index] !== '[' && text[index] !== '(') return token[0]
    const close = text[index] === '[' ? ']' : ')'
    index++
    const args: WktValue[] = []
    for (;;) {
      skip()
      if (index >= text.length) throw new Error('Unterminated WKT node.')
      if (text[index] === close) { index++; return { keyword: token[0].toUpperCase(), args } }
      args.push(value())
    }
  }
  const root = value()
  if (typeof root !== 'object') throw new Error('WKT does not start with a node.')
  return root
}

const isNode = (value: WktValue | undefined): value is WktNode => typeof value === 'object'
const children = (node: WktNode, ...keywords: string[]) => node.args.filter((arg): arg is WktNode => isNode(arg) && keywords.includes(arg.keyword))
const child = (node: WktNode, ...keywords: string[]) => children(node, ...keywords)[0]
const nameOf = (node: WktNode) => typeof node.args[0] === 'string' ? node.args[0] : ''
function descendants(node: WktNode, keyword: string): WktNode[] {
  return node.args.filter(isNode).flatMap((arg) => [...(arg.keyword === keyword ? [arg] : []), ...descendants(arg, keyword)])
}

/** Uppercase words only, so `DRUKREF_03_Bhutan_National_Grid` and `DRUKREF 03 / Bhutan National Grid` compare equal. */
export function normalizeCrsName(name: string) {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}

const projectedKeywords = ['PROJCS', 'PROJCRS', 'PROJECTEDCRS']
const geographicKeywords = ['GEOGCS', 'GEOGCRS', 'GEOGRAPHICCRS', 'GEODCRS', 'GEODETICCRS', 'GEOCCS', 'BASEGEOGCRS']

/** Unwraps WKT2 BOUNDCRS and compound CRSs to the horizontal CRS a GIS reports. */
function horizontalCrs(node: WktNode): WktNode {
  if (node.keyword === 'BOUNDCRS') {
    const source = child(node, 'SOURCECRS')
    const inner = source?.args.find(isNode)
    return inner ? horizontalCrs(inner) : node
  }
  if (node.keyword === 'COMPD_CS' || node.keyword === 'COMPOUNDCRS') {
    const inner = node.args.filter(isNode).find((arg) => [...projectedKeywords, ...geographicKeywords].includes(arg.keyword))
    return inner ? horizontalCrs(inner) : node
  }
  return node
}

function authorityCode(node: WktNode) {
  const authority = child(node, 'AUTHORITY', 'ID')
  if (!authority || typeof authority.args[0] !== 'string' || authority.args[0].toUpperCase() !== 'EPSG') return undefined
  const code = Number(authority.args[1])
  return Number.isFinite(code) ? code : undefined
}

// EPSG:5266 DRUKREF 03 / Bhutan National Grid: Transverse Mercator on GRS 1980.
const drukref03 = { lat0: 0, lon0: 90, k: 1, fe: 250000, fn: -2500000, a: 6378137, invf: 298.257222101 }
const parameterAliases: Record<string, keyof typeof drukref03> = {
  latitudeoforigin: 'lat0', latitudeofnaturalorigin: 'lat0', latitudeofcenter: 'lat0',
  centralmeridian: 'lon0', longitudeofnaturalorigin: 'lon0', longitudeofcenter: 'lon0',
  scalefactor: 'k', scalefactoratnaturalorigin: 'k',
  falseeasting: 'fe', falsenorthing: 'fn',
}

function hasDrukref03Parameters(crs: WktNode) {
  const conversion = child(crs, 'CONVERSION') ?? crs
  const method = child(conversion, 'PROJECTION', 'METHOD')
  if (!method || normalizeCrsName(nameOf(method)).replace(/ /g, '') !== 'TRANSVERSEMERCATOR') return false
  const values: Partial<Record<keyof typeof drukref03, number>> = {}
  for (const parameter of children(conversion, 'PARAMETER')) {
    const key = parameterAliases[nameOf(parameter).toLowerCase().replace(/[^a-z]/g, '')]
    if (key && typeof parameter.args[1] === 'number') values[key] = parameter.args[1]
  }
  const ellipsoid = descendants(crs, 'SPHEROID')[0] ?? descendants(crs, 'ELLIPSOID')[0]
  if (ellipsoid && typeof ellipsoid.args[1] === 'number' && typeof ellipsoid.args[2] === 'number') { values.a = ellipsoid.args[1]; values.invf = ellipsoid.args[2] }
  const close = (key: keyof typeof drukref03, tolerance: number) => values[key] !== undefined && Math.abs(values[key]! - drukref03[key]) <= tolerance
  return close('lon0', 1e-9) && close('k', 1e-9) && close('fe', 1e-3) && close('fn', 1e-3) && close('a', 1e-3) && close('invf', 1e-8) && (values.lat0 === undefined || close('lat0', 1e-9))
}

/** Classifies a WKT definition (a `.prj` file or a GeoPackage `definition` column) against DrukRef03. */
export function checkWkt(text: string): CrsCheck {
  if (!text.trim()) return { status: 'undefined' }
  let crs: WktNode
  try { crs = horizontalCrs(parseWkt(text)) } catch { return { status: 'unverified' } }
  const name = nameOf(crs) || 'an unnamed coordinate system'
  const code = authorityCode(crs)
  const normalized = normalizeCrsName(name)
  if (code === SOURCE_WKID) return { status: 'match', name }
  if (code === TARGET_WKID || /\bDRUKREF 23\b/.test(normalized)) return { status: 'mismatch', name, alreadyTarget: true }
  if (code !== undefined) return { status: 'mismatch', name }
  if (!projectedKeywords.includes(crs.keyword)) return { status: 'mismatch', name }
  const namedDrukref03 = /\bDRUKREF 03\b/.test(normalized) && normalized.includes('BHUTAN NATIONAL GRID')
  const parameters = hasDrukref03Parameters(crs)
  if (namedDrukref03 && parameters) return { status: 'match', name }
  if (namedDrukref03 || parameters) return { status: 'probable', name }
  return { status: 'mismatch', name }
}

/** Classifies a GeoPackage `gpkg_spatial_ref_sys` row. */
export function checkSpatialRefSys(row: { srsId: number; organization?: string; organizationCoordsysId?: number; name?: string; definition?: string }): CrsCheck {
  // GeoPackage reserves -1 (undefined Cartesian) and 0 (undefined geographic).
  if (row.srsId === -1 || row.srsId === 0) return { status: 'undefined' }
  if (row.organization?.toUpperCase() === 'EPSG' && row.organizationCoordsysId === SOURCE_WKID) return { status: 'match', name: row.name || sourceCoordinateSystem }
  if (row.organization?.toUpperCase() === 'EPSG' && row.organizationCoordsysId === TARGET_WKID) return { status: 'mismatch', name: row.name || 'DrukRef23', alreadyTarget: true }
  const fromDefinition = checkWkt(row.definition ?? '')
  if (fromDefinition.status === 'undefined' || fromDefinition.status === 'unverified') {
    if (!row.name) return fromDefinition
    const normalized = normalizeCrsName(row.name)
    return /\bDRUKREF 03\b/.test(normalized) && normalized.includes('BHUTAN NATIONAL GRID') ? { status: 'probable', name: row.name } : { status: 'mismatch', name: row.name }
  }
  return fromDefinition
}

/** The dataset rejection (for mismatches) or caution (for unconfirmed results) shown to the user. */
export function crsMessage(check: CrsCheck): { rejection?: string; caution?: string } {
  switch (check.status) {
    case 'match': return {}
    case 'probable': return { caution: `Defined as ${check.name}, which looks like DrukRef03 but could not be confirmed. The service will check it during transformation.` }
    case 'unverified': return { caution: 'The coordinate system could not be read here. The service will check it during transformation.' }
    case 'undefined': return { rejection: `No coordinate system is defined. Define it as ${sourceCoordinateSystem} and add the dataset again.` }
    case 'mismatch': return { rejection: check.alreadyTarget ? `Already in DrukRef23 (${check.name}). No transformation is needed.` : `Defined as ${check.name}. Source data must be ${sourceCoordinateSystem}.` }
  }
}
