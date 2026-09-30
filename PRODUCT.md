# DrukRef Transformation Tool

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

NLCS GIS staff preparing spatial datasets for projection and delivery.

## Product Purpose

A desktop-browser utility for packaging DrukRef03 spatial datasets and transforming them to Bhutan's DrukRef23 coordinate reference system through the ArcGIS geoprocessing service.

## Positioning

The utility lets users review multiple datasets, include or exclude folder contents, and receive a downloadable projected package rather than manually preparing individual service requests.

## Operating Context

Users select DrukRef03 GeoPackages or ZIP packages with Add files, or select folders containing DrukRef03 Shapefile sidecars with Add folder. The app packages selected datasets, submits them asynchronously to the ProjectUploadPackage GP service, displays NTv2 transformation activity, and downloads the result.

## Capabilities and Constraints

- Source data must use DrukRef03, EPSG:5266.
- Target coordinate system is fixed to DrukRef23, WKID 11341.
- The server applies `DrukRef03_To_DrukRef23_NTv2.gtf`.
- Supported inputs are GeoPackage, Shapefile folders, and ZIP packages. A ZIP may hold its datasets at the top level or inside one folder.
- GeoJSON and KML are not supported because they don't support DrukRef03 (both formats only allow WGS 84 coordinates).
- Folder scans inspect immediate files only.
- Shapefiles require .shp, .shx, .dbf, and .prj files. Selecting only some Shapefile parts with Add files explains how to add them (zip them, or use Add folder).
- The browser pre-checks each dataset's coordinate system. Datasets clearly not in DrukRef03 are rejected with the detected system; unconfirmed ones stay included with a caution, and the GP service makes the final check.
- Ignored files are grouped by reason: in a subfolder, a ZIP inside a folder or ZIP, or an unsupported format.
- Users can include or exclude accepted datasets before projection.
- Projection runs asynchronously through ArcGIS Server and returns a downloadable ZIP package.

## Brand Commitments

The interface uses NLCS branding and a professional, bold, light visual theme.

## Evidence on Hand

- NLCS logo: src/assets/nlcs-logo.svg
- ArcGIS GP service integration: src/server/arcgis-client.ts (server side), src/lib/arcgis-upload.ts (browser)
- Deployment tool: deployment/ProjectUploadPackage.py

## Product Principles

- Make spatial packaging safe and transparent.
- Keep projection decisions visible to the user.
- Preserve dataset-level control before submission.
- Prefer clear recovery guidance over silent failure.

## Accessibility & Inclusion

Controls must remain keyboard accessible, provide visible focus states, and support reduced motion.
