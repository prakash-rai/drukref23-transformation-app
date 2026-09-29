import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, describe, expect, it } from 'vitest'
import { applyProjectionCheck, checkDatasetCrs, checkGeoPackage } from './projection-check'
import { openSqlite, parseCreateTable, readBytesFromBlob, type ReadBytes } from './sqlite-reader'
import type { DatasetItem } from './upload-package'

const esriDrukref03 = 'PROJCS["DRUKREF_03_Bhutan_National_Grid",GEOGCS["GCS_DRUKREF_03",DATUM["D_DRUKREF_03",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",250000.0],PARAMETER["False_Northing",-2500000.0],PARAMETER["Central_Meridian",90.0],PARAMETER["Scale_Factor",1.0],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]'
const utm45 = 'PROJCS["WGS 84 / UTM zone 45N",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["central_meridian",87],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",0],UNIT["metre",1],AUTHORITY["EPSG","32645"]]'

const directory = mkdtempSync(join(tmpdir(), 'gpkg-test-'))
afterAll(() => rmSync(directory, { recursive: true, force: true }))
let counter = 0

type Srs = { id: number; name: string; organization: string; code: number; definition: string; description?: string }
/** Builds a GeoPackage with the metadata tables from the GeoPackage 1.3 specification. */
function geoPackage(systems: Srs[], layers: Array<{ table: string; srsId: number }>, options: { pageSize?: number; featureRows?: number } = {}) {
  const path = join(directory, `test-${counter++}.gpkg`)
  const db = new DatabaseSync(path)
  if (options.pageSize) db.exec(`PRAGMA page_size = ${options.pageSize}`)
  db.exec(`CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER NOT NULL PRIMARY KEY, organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT);
    CREATE TABLE gpkg_contents (table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE, description TEXT DEFAULT '', last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER, CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id));
    CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL, CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name));`)
  const insertSrs = db.prepare('INSERT INTO gpkg_spatial_ref_sys VALUES (?, ?, ?, ?, ?, ?)')
  for (const srs of [{ id: -1, name: 'Undefined cartesian SRS', organization: 'NONE', code: -1, definition: 'undefined' }, { id: 0, name: 'Undefined geographic SRS', organization: 'NONE', code: 0, definition: 'undefined' }, ...systems]) insertSrs.run(srs.name, srs.id, srs.organization, srs.code, srs.definition, srs.description ?? null)
  for (const layer of layers) {
    db.exec(`CREATE TABLE "${layer.table}" (fid INTEGER PRIMARY KEY AUTOINCREMENT, geom BLOB, name TEXT)`)
    db.prepare('INSERT INTO gpkg_geometry_columns VALUES (?, ?, ?, ?, 0, 0)').run(layer.table, 'geom', 'POINT', layer.srsId)
    const insertFeature = db.prepare(`INSERT INTO "${layer.table}" (geom, name) VALUES (?, ?)`)
    db.exec('BEGIN')
    for (let row = 0; row < (options.featureRows ?? 0); row++) insertFeature.run(new Uint8Array(200), `feature ${row}`)
    db.exec('COMMIT')
  }
  db.close()
  return new File([readFileSync(path)], 'test.gpkg')
}

function countingReader(file: File) {
  const read = readBytesFromBlob(file)
  const counter = { bytes: 0 }
  const reader: ReadBytes = async (offset, length) => { counter.bytes += length; return read(offset, length) }
  return { reader, counter }
}

const drukref03 = { id: 5266, name: 'DRUKREF 03 / Bhutan National Grid', organization: 'EPSG', code: 5266, definition: esriDrukref03 }
const utm = { id: 32645, name: 'WGS 84 / UTM zone 45N', organization: 'EPSG', code: 32645, definition: utm45 }

describe('SQLite reader', () => {
  it('parses column names and the rowid alias from CREATE TABLE', () => {
    expect(parseCreateTable('CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, "srs_id" INTEGER NOT NULL PRIMARY KEY, definition TEXT CHECK (length(definition) > 0), CONSTRAINT x UNIQUE (srs_name))')).toEqual({ columns: ['srs_name', 'srs_id', 'definition'], rowidAlias: 'srs_id' })
  })

  it('reads rows through interior pages and overflow chains', async () => {
    const systems = Array.from({ length: 60 }, (_, index) => ({ ...utm, id: 100000 + index, code: 100000 + index, description: 'x'.repeat(index === 42 ? 3000 : 20) }))
    const file = geoPackage(systems, [], { pageSize: 512 })
    const rows = await (await openSqlite(readBytesFromBlob(file))).readTable('gpkg_spatial_ref_sys')
    expect(rows).toHaveLength(62)
    const long = rows!.find((row) => row.srs_id === 100042)!
    expect(long).toMatchObject({ organization: 'EPSG', definition: utm45 })
    expect((long.description as string).length).toBe(3000)
  })

  it('returns undefined for a missing table and rejects non-SQLite files', async () => {
    const database = await openSqlite(readBytesFromBlob(geoPackage([], [])))
    expect(await database.readTable('missing')).toBeUndefined()
    await expect(openSqlite(readBytesFromBlob(new File(['not sqlite'.repeat(20)], 'x.gpkg')))).rejects.toThrow('Not a SQLite database.')
  })
})

describe('GeoPackage projection check', () => {
  it('confirms a DrukRef03 layer', async () => {
    expect(await checkGeoPackage(readBytesFromBlob(geoPackage([drukref03], [{ table: 'roads', srsId: 5266 }])))).toMatchObject({ status: 'match' })
  })

  it('reports a mismatch when any layer is not DrukRef03', async () => {
    expect(await checkGeoPackage(readBytesFromBlob(geoPackage([drukref03, utm], [{ table: 'roads', srsId: 5266 }, { table: 'rivers', srsId: 32645 }])))).toEqual({ status: 'mismatch', name: 'WGS 84 / UTM zone 45N' })
  })

  it('reports layers on the reserved undefined system', async () => {
    expect(await checkGeoPackage(readBytesFromBlob(geoPackage([], [{ table: 'roads', srsId: 0 }])))).toEqual({ status: 'undefined' })
  })

  it('is unverified when the file is not a GeoPackage or has no layers', async () => {
    expect(await checkGeoPackage(readBytesFromBlob(new File([new Uint8Array(512)], 'x.gpkg')))).toEqual({ status: 'unverified' })
    expect(await checkGeoPackage(readBytesFromBlob(geoPackage([drukref03], [])))).toEqual({ status: 'unverified' })
  })

  it('reads only metadata pages of a large GeoPackage', async () => {
    const file = geoPackage([drukref03], [{ table: 'parcels', srsId: 5266 }], { featureRows: 20000 })
    const { reader, counter } = countingReader(file)
    expect((await checkGeoPackage(reader)).status).toBe('match')
    expect(file.size).toBeGreaterThan(4_000_000)
    expect(counter.bytes).toBeLessThan(64 * 1024)
  })
})

describe('dataset projection check', () => {
  const shapefile = (prj: string | null): DatasetItem => {
    const files = [new File([''], 'roads.shp'), new File([''], 'roads.shx'), new File([''], 'roads.dbf'), ...(prj === null ? [] : [new File([prj], 'roads.prj')])]
    return { id: 'roads', name: 'roads.shp', kind: 'shapefile', files, size: 0, status: 'accepted', included: true }
  }

  it('reads the Shapefile .prj', async () => {
    expect(await checkDatasetCrs(shapefile(esriDrukref03))).toMatchObject({ status: 'match' })
    expect(await checkDatasetCrs(shapefile(utm45))).toMatchObject({ status: 'mismatch' })
  })

  it('rejects and excludes a dataset in another coordinate system', async () => {
    expect(await applyProjectionCheck(shapefile(utm45))).toMatchObject({ status: 'rejected', included: false, reason: 'Defined as WGS 84 / UTM zone 45N. Source data must be DrukRef03 (EPSG:5266).' })
  })

  it('keeps an unconfirmed dataset included with a caution', async () => {
    const result = await applyProjectionCheck(shapefile('garbage ]'))
    expect(result).toMatchObject({ status: 'accepted', included: true, caution: expect.stringContaining('service will check') })
  })

  it('leaves already rejected datasets unchanged', async () => {
    const rejected: DatasetItem = { ...shapefile(null), status: 'rejected', reason: 'Missing required files: .prj', included: false }
    expect(await applyProjectionCheck(rejected)).toBe(rejected)
  })
})
