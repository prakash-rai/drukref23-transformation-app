# 0001: Call ArcGIS from the app server with a server-held token

**Status:** Accepted (2026-09-25)

## Context

ArcGIS Server at `cadastral.systems.gov.bt` uses token security; every GP request without a token returns `499 Token Required`. The first version called the GP service from the browser through an unauthenticated proxy, so it could never pass the service check. Putting a shared ArcGIS account in the browser would expose the password or a token to every user, and download links would point browsers at ArcGIS directly.

## Decision

The browser talks only to the app's own `/api/*` routes. The app server signs in with `ARCGIS_USERNAME`/`ARCGIS_PASSWORD` from `.env` (`generateToken`, `client=referer`) and caches the token per process. It renews the token before expiry and once on `498`/`499`, and sends it in the `X-Esri-Authorization` header. Uploads are streamed to a temporary file and forwarded. Results are streamed back through the app.

## Consequences

- No credential or token reaches the browser, and there are no browser CORS or certificate problems.
- All ArcGIS activity runs as one service account. Access to the app must therefore be restricted in IIS, and the account should have access only to the `project` services.
- Upload and download traffic passes through the container. This needs enough temporary disk for the largest package and an ARR time-out long enough for large uploads.
