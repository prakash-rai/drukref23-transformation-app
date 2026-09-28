# 0003: Run a single container; remove the Nginx gateway

**Status:** Superseded by [0004](0004-windows-service-with-github-deploys.md) for how the app runs (2026-09-28). IIS as the only reverse proxy still applies. Originally accepted 2026-09-25.

## Context

The first deployment used an Nginx container to forward same-origin `/arcgis-*` paths to ArcGIS at an internal IP address, with certificate verification disabled. With [0001](0001-server-side-arcgis-token-proxy.md) the app server calls ArcGIS itself, and with [0002](0002-serve-under-iis-sub-path.md) IIS is the reverse proxy.

## Decision

Deploy one container, the Node/Nitro app, bound to `127.0.0.1`. IIS is the only public entry point. The app server verifies ArcGIS TLS certificates normally.

## Consequences

- There is one less component to configure and patch, and TLS verification is no longer disabled.
- If an internal CA is used, its certificate must be supplied to the container (`NODE_EXTRA_CA_CERTS`).
