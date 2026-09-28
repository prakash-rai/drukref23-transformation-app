# 0002: Serve the app at `/drukref/` behind IIS on the ArcGIS host

**Status:** Accepted (2026-09-25)

## Context

The app is deployed on the same Windows server as ArcGIS Server. IIS already terminates HTTPS for `cadastral.systems.gov.bt` and hosts the `/server` web adaptor. A separate host name would need new DNS records and certificates.

## Decision

Publish the app at `https://cadastral.systems.gov.bt/drukref/` through an IIS application that uses URL Rewrite + ARR to proxy to the container on `127.0.0.1:8080`. The app is built with `APP_BASE_PATH=/drukref/` (Vite `base`, TanStack router basepath and Nitro `baseURL`), so the `/drukref` prefix is preserved end to end.

## Consequences

- No new DNS or certificate is needed, and HTTPS is handled by the existing IIS binding.
- The base path is fixed at build time; changing it means a rebuild plus updates to `web.config` and `ARCGIS_TOKEN_REFERER`.
- IIS limits (request size, ARR time-out, response buffering) apply to uploads and downloads and must be set as documented.
