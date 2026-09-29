import { describe, expect, it } from 'vitest'
import { checkSpatialRefSys, checkWkt, crsMessage, normalizeCrsName, parseWkt } from './crs'

// Representative definitions; replace or extend with real NLCS exports when available.
const esriDrukref03 = 'PROJCS["DRUKREF_03_Bhutan_National_Grid",GEOGCS["GCS_DRUKREF_03",DATUM["D_DRUKREF_03",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",250000.0],PARAMETER["False_Northing",-2500000.0],PARAMETER["Central_Meridian",90.0],PARAMETER["Scale_Factor",1.0],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]'
const ogcDrukref03 = 'PROJCS["DRUKREF 03 / Bhutan National Grid",GEOGCS["DRUKREF 03",DATUM["Bhutan_National_Geodetic_Datum",SPHEROID["GRS 1980",6378137,298.257222101,AUTHORITY["EPSG","7019"]],AUTHORITY["EPSG","1058"]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433],AUTHORITY["EPSG","5264"]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",90],PARAMETER["scale_factor",1],PARAMETER["false_easting",250000],PARAMETER["false_northing",-2500000],UNIT["metre",1],AUTHORITY["EPSG","5266"]]'
const wkt2Drukref03 = 'PROJCRS["DRUKREF 03 / Bhutan National Grid",BASEGEOGCRS["DRUKREF 03",DATUM["Bhutan National Geodetic Datum",ELLIPSOID["GRS 1980",6378137,298.257222101,LENGTHUNIT["metre",1]]],PRIMEM["Greenwich",0,ANGLEUNIT["degree",0.0174532925199433]],ID["EPSG",5264]],CONVERSION["Bhutan National Grid",METHOD["Transverse Mercator",ID["EPSG",9807]],PARAMETER["Latitude of natural origin",0,ANGLEUNIT["degree",0.0174532925199433]],PARAMETER["Longitude of natural origin",90,ANGLEUNIT["degree",0.0174532925199433]],PARAMETER["Scale factor at natural origin",1,SCALEUNIT["unity",1]],PARAMETER["False easting",250000,LENGTHUNIT["metre",1]],PARAMETER["False northing",-2500000,LENGTHUNIT["metre",1]]],CS[Cartesian,2],AXIS["easting (X)",east,ORDER[1],LENGTHUNIT["metre",1]],AXIS["northing (Y)",north,ORDER[2],LENGTHUNIT["metre",1]],USAGE[SCOPE["Topographic mapping."],AREA["Bhutan."],BBOX[26.7,88.74,28.33,92.13]],ID["EPSG",5266]]'
const utm45 = 'PROJCS["WGS_1984_UTM_Zone_45N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",87.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]'
const wgs84 = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]'

describe('WKT parsing', () => {
  it('reads nested nodes, strings with escaped quotes and numbers', () => {
    const node = parseWkt('PROJCS["A ""quoted"" name",PARAMETER["x",-2.5e3],AXIS["E",EAST]]')
    expect(node).toEqual({ keyword: 'PROJCS', args: ['A "quoted" name', { keyword: 'PARAMETER', args: ['x', -2500] }, { keyword: 'AXIS', args: ['E', 'EAST'] }] })
  })

  it('rejects malformed input', () => {
    expect(() => parseWkt('PROJCS["x",')).toThrow()
  })

  it('normalizes ArcGIS and EPSG spellings to the same name', () => {
    expect(normalizeCrsName('DRUKREF_03_Bhutan_National_Grid')).toBe(normalizeCrsName('DRUKREF 03 / Bhutan National Grid'))
  })
})

describe('DrukRef03 check', () => {
  it('confirms EPSG authority codes in WKT1 and WKT2', () => {
    expect(checkWkt(ogcDrukref03)).toEqual({ status: 'match', name: 'DRUKREF 03 / Bhutan National Grid' })
    expect(checkWkt(wkt2Drukref03)).toEqual({ status: 'match', name: 'DRUKREF 03 / Bhutan National Grid' })
  })

  it('confirms an ArcGIS .prj without an authority code by name and parameters', () => {
    expect(checkWkt(esriDrukref03)).toEqual({ status: 'match', name: 'DRUKREF_03_Bhutan_National_Grid' })
  })

  it('unwraps a WKT2 BOUNDCRS to its source CRS', () => {
    expect(checkWkt(`BOUNDCRS[SOURCECRS[${wkt2Drukref03}],TARGETCRS[GEOGCRS["WGS 84"]],ABRIDGEDTRANSFORMATION["x",METHOD["Geocentric translations"]]]`).status).toBe('match')
  })

  it('treats matching parameters under another name as probable', () => {
    expect(checkWkt(esriDrukref03.replace('DRUKREF_03_Bhutan_National_Grid', 'Custom_Bhutan_TM'))).toEqual({ status: 'probable', name: 'Custom_Bhutan_TM' })
  })

  it('treats the DrukRef03 name with different parameters as probable', () => {
    expect(checkWkt(esriDrukref03.replace('-2500000.0', '0.0')).status).toBe('probable')
  })

  it('rejects other projected and geographic systems with their name', () => {
    expect(checkWkt(utm45)).toEqual({ status: 'mismatch', name: 'WGS_1984_UTM_Zone_45N' })
    expect(checkWkt(wgs84)).toEqual({ status: 'mismatch', name: 'GCS_WGS_1984' })
    expect(checkWkt(ogcDrukref03.replace('AUTHORITY["EPSG","5266"]]', 'AUTHORITY["EPSG","32645"]]')).status).toBe('mismatch')
  })

  it('recognizes data that is already DrukRef23', () => {
    expect(checkWkt(esriDrukref03.replace('DRUKREF_03_Bhutan_National_Grid', 'DRUKREF_23_Bhutan_National_Grid'))).toMatchObject({ status: 'mismatch', alreadyTarget: true })
  })

  it('reports empty and unreadable definitions separately', () => {
    expect(checkWkt('  ')).toEqual({ status: 'undefined' })
    expect(checkWkt('not wkt at all ]')).toEqual({ status: 'unverified' })
  })
})

describe('GeoPackage spatial reference rows', () => {
  it('uses the organization code before the definition', () => {
    expect(checkSpatialRefSys({ srsId: 5266, organization: 'EPSG', organizationCoordsysId: 5266, name: 'DRUKREF 03 / Bhutan National Grid', definition: 'undefined' }).status).toBe('match')
    expect(checkSpatialRefSys({ srsId: 11341, organization: 'epsg', organizationCoordsysId: 11341, name: 'DRUKREF 23' })).toMatchObject({ status: 'mismatch', alreadyTarget: true })
  })

  it('treats the reserved undefined systems as missing', () => {
    expect(checkSpatialRefSys({ srsId: 0, organization: 'NONE', organizationCoordsysId: 0, definition: 'undefined' })).toEqual({ status: 'undefined' })
    expect(checkSpatialRefSys({ srsId: -1, organization: 'NONE', organizationCoordsysId: -1, definition: 'undefined' })).toEqual({ status: 'undefined' })
  })

  it('falls back to the definition, then the name', () => {
    expect(checkSpatialRefSys({ srsId: 100000, organization: 'ESRI', organizationCoordsysId: 100000, definition: esriDrukref03 }).status).toBe('match')
    expect(checkSpatialRefSys({ srsId: 100001, organization: 'NONE', organizationCoordsysId: 100001, name: 'WGS 84 / UTM zone 45N', definition: 'undefined' })).toEqual({ status: 'mismatch', name: 'WGS 84 / UTM zone 45N' })
  })
})

describe('user-visible projection messages', () => {
  it('explains a rejection with the detected system and the requirement', () => {
    expect(crsMessage({ status: 'mismatch', name: 'WGS_1984_UTM_Zone_45N' }).rejection).toBe('Defined as WGS_1984_UTM_Zone_45N. Source data must be DrukRef03 (EPSG:5266).')
    expect(crsMessage({ status: 'mismatch', name: 'DRUKREF 23', alreadyTarget: true }).rejection).toMatch(/Already in DrukRef23/)
    expect(crsMessage({ status: 'undefined' }).rejection).toMatch(/No coordinate system is defined/)
  })

  it('cautions without rejecting when the result is not confirmed', () => {
    expect(crsMessage({ status: 'probable', name: 'Custom_Bhutan_TM' })).toEqual({ caution: expect.stringContaining('could not be confirmed') })
    expect(crsMessage({ status: 'unverified' })).toEqual({ caution: expect.stringContaining('service will check') })
    expect(crsMessage({ status: 'match', name: 'x' })).toEqual({})
  })
})
