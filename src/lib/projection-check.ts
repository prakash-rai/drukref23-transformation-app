import { checkSpatialRefSys, checkWkt, crsMessage, type CrsCheck } from './crs'
import { openSqlite, readBytesFromBlob, type ReadBytes } from './sqlite-reader'
import type { DatasetItem } from './upload-package'

const severity: Record<CrsCheck['status'], number> = { match: 0, probable: 1, unverified: 2, mismatch: 3, undefined: 4 }

/** Reports the least DrukRef03-like layer, so one wrong layer is never hidden by the others. */
function worst(checks: CrsCheck[]): CrsCheck {
  return checks.reduce((current, check) => severity[check.status] > severity[current.status] ? check : current)
}

/** Checks every geometry layer of a GeoPackage against DrukRef03 using its metadata tables. */
export async function checkGeoPackage(readBytes: ReadBytes): Promise<CrsCheck> {
  let database: Awaited<ReturnType<typeof openSqlite>>
  try { database = await openSqlite(readBytes) } catch { return { status: 'unverified' } }
  try {
    const [layers, systems] = await Promise.all([database.readTable('gpkg_geometry_columns'), database.readTable('gpkg_spatial_ref_sys')])
    if (!layers?.length || !systems) return { status: 'unverified' }
    return worst(layers.map((layer) => {
      const system = systems.find((row) => row.srs_id === layer.srs_id)
      if (typeof layer.srs_id !== 'number') return { status: 'unverified' }
      if (!system) return layer.srs_id === 0 || layer.srs_id === -1 ? { status: 'undefined' } : { status: 'unverified' }
      return checkSpatialRefSys({
        srsId: layer.srs_id,
        organization: typeof system.organization === 'string' ? system.organization : undefined,
        organizationCoordsysId: typeof system.organization_coordsys_id === 'number' ? system.organization_coordsys_id : undefined,
        name: typeof system.srs_name === 'string' ? system.srs_name : undefined,
        definition: typeof system.definition === 'string' ? system.definition : undefined,
      })
    }))
  } catch { return { status: 'unverified' } }
}

export async function checkDatasetCrs(dataset: DatasetItem): Promise<CrsCheck> {
  if (dataset.kind === 'geopackage') return checkGeoPackage(readBytesFromBlob(dataset.files[0]!))
  const prj = dataset.files.find((file) => file.name.toLowerCase().endsWith('.prj'))
  if (!prj) return { status: 'undefined' }
  try { return checkWkt(await prj.text()) } catch { return { status: 'unverified' } }
}

/** Rejects datasets that are clearly not DrukRef03 and flags the ones that could not be confirmed. */
export async function applyProjectionCheck(dataset: DatasetItem, check: (dataset: DatasetItem) => Promise<CrsCheck> = checkDatasetCrs): Promise<DatasetItem> {
  if (dataset.status === 'rejected') return dataset
  const { rejection, caution } = crsMessage(await check(dataset))
  if (rejection) return { ...dataset, status: 'rejected', reason: rejection, included: false }
  return caution ? { ...dataset, caution } : dataset
}
