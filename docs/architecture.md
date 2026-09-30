# Architecture

For developers and administrators who need to understand how requests flow and where the security boundary is.

## Overview

```text
Staff browser
  │ HTTPS  https://cadastral.systems.gov.bt/drukref/
  ▼
IIS (Windows server) ── /server/*  → ArcGIS Web Adaptor → ArcGIS Server 12.1 (token security)
  │ URL Rewrite + ARR: /drukref/* → http://127.0.0.1:8080/drukref/*
  ▼
DrukRef Windows service: Node.js 24 / Nitro (TanStack Start), C:\apps\drukref\app\current
  ├── /drukref/            UI (React), built with base path /drukref/
  └── /drukref/api/*       server routes (src/routes/api)
         │ token + REST (src/server/arcgis-client.ts)
         ▼
      https://cadastral.systems.gov.bt/server/rest/services/project/ProjectUploadPackage/GPServer
```

## Request flow

| Step | Browser calls | App server does |
| --- | --- | --- |
| Service check | `GET api/health` on page load, then every 30 s while it fails | Signs in (if no cached token) and reads the GP task metadata. Returns `503` with a readable reason when anything fails. |
| App check | — (deploys and monitoring only) | `GET api/live` answers `200` whenever the app runs, without contacting ArcGIS. |
| Submit | `POST api/jobs` with the ZIP as the body | Streams the body to a temp file (size limit, ZIP signature check), uploads it to `GPServer/uploads/upload`, calls `submitJob`, deletes the temp file, returns `{ jobId }`. |
| Progress | `GET api/jobs/:jobId` every 2 s | Returns `jobStatus` and messages from `jobs/:jobId?returnMessages=true`. The browser rides out up to 3 minutes of `502`/`503`/`504` or network errors (an app restart or ArcGIS outage); other errors end the wait after 5 attempts. |
| Download | Browser navigates to `api/jobs/:jobId/result` | Reads the `out_package` result, re-roots its URL on `ARCGIS_SERVER_URL`, and streams the ZIP back as an attachment. |

Restarts: the app does not need ArcGIS to start. It signs in on the first request, does not remember a failed sign-in, and renews a token ArcGIS no longer accepts, so it recovers by itself after ArcGIS restarts ([deployment.md](deployment.md#server-restarts-and-arcgis)).

The browser builds the ZIP locally (`src/lib/upload-package.ts`); the GP service (see [arcgis-gp-service.md](arcgis-gp-service.md)) does the NTv2 transformation.

Before upload, the browser pre-checks each dataset's coordinate system: it reads the Shapefile `.prj`, or the GeoPackage `gpkg_geometry_columns` and `gpkg_spatial_ref_sys` tables (only those pages are read, so large files cost a few kilobytes). Datasets that are clearly not DrukRef03 are rejected; ones that look like DrukRef03 but cannot be confirmed stay included with a caution. The GP service's factory-code check (`5266`) remains the final authority.

## Security boundary

- ArcGIS credentials exist only in `.env` on the server. They are read by `src/server/arcgis-config.ts`, which is never imported by browser code. The built client bundle is checked to contain no sign-in code.
- Tokens are generated with `client=referer` (`ARCGIS_TOKEN_REFERER`). They are sent in the `X-Esri-Authorization` header and in POST bodies, never in URLs, so they don't appear in IIS or ArcGIS access logs.
- The token is cached per app process. It is renewed 5 minutes before expiry, and renewed once immediately if ArcGIS answers `498`/`499`.
- Result downloads can only fetch paths under `/rest/directories/arcgisjobs/` on the configured server. A manipulated result URL cannot make the app fetch other resources.
- Job IDs are validated before use; error responses never include stack traces or credentials.
- The app listens on `127.0.0.1` only, so it is reachable only through IIS. **The app has no login of its own.** Restrict the IIS `drukref` application to staff (see [deployment.md](deployment.md#6-restrict-access)).

## Code map

| Path | Responsibility |
| --- | --- |
| `src/lib/upload-package.ts` | Inspect selected files, folders and ZIPs; build the submission ZIP |
| `src/lib/file-check.ts` | Sort Add files selections; notices for incomplete Shapefiles and unsupported formats |
| `src/lib/crs.ts`, `src/lib/projection-check.ts` | Client-side DrukRef03 pre-check of WKT and GeoPackage spatial reference rows |
| `src/lib/sqlite-reader.ts` | Minimal read-only SQLite reader used for GeoPackage metadata |
| `src/lib/arcgis-upload.ts` | Browser client for `/api/*` (health, submit, poll, download) |
| `src/lib/upload-workflow.ts` | UI state (React reducer + hook) |
| `src/server/arcgis-config.ts` | Environment → configuration |
| `src/server/arcgis-client.ts` | ArcGIS REST client: tokens, upload, submit, status, result |
| `src/server/arcgis-service.ts` | Shared client instance, JSON/error responses, streamed upload handling |
| `src/routes/api/*.ts` | HTTP endpoints |
| `deployment/iis/web.config` | IIS reverse-proxy rule |
| `deployment/windows/` | Windows service definition (`DrukRef.xml`), service entry point (`start.mjs`), deploy and rollback (`deploy.ps1`) and its CI test |
| `.github/workflows/` | CI for pull requests; build and deploy of `main` ([deployment.md](deployment.md#automatic-deployment)) |
| `deployment/ProjectUploadPackage.py` | ArcGIS GP script tool |

Background for these choices is in [decisions/](decisions/README.md).
