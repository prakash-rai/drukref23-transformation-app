# Architecture decision records

Short records of significant decisions: what was decided, why, and what it costs. Add one when you change hosting, security, a core dependency, or anything a future maintainer would otherwise have to rediscover.

- File name: `NNNN-short-title.md`, numbered in order.
- Sections: **Status** (Proposed / Accepted / Superseded by NNNN), **Context**, **Decision**, **Consequences**.
- Don't rewrite an accepted record. Write a new one that supersedes it.

| No. | Decision | Status |
| --- | --- | --- |
| [0001](0001-server-side-arcgis-token-proxy.md) | Call ArcGIS from the app server with a server-held token | Accepted |
| [0002](0002-serve-under-iis-sub-path.md) | Serve the app at `/drukref/` behind IIS on the ArcGIS host | Accepted |
| [0003](0003-single-container-without-nginx.md) | Run a single container; remove the Nginx gateway | Accepted |
