# Project App

## Purpose

This TanStack Start application packages spatial datasets in the browser and submits them to the ArcGIS `ProjectUploadPackage` geoprocessing service for projection to DrukRef23 (WKID 11341).

## Development

- Use pnpm.
- Run `pnpm check` before considering a change complete. CI runs it on every pull request; merging to `main` deploys to production. Run `pnpm test:live` when ArcGIS integration changes (needs `.env` and network access to the server).
- Run `pnpm dev` for local development.
- Keep file inspection and ZIP packaging logic in `src/lib` rather than route components.
- Keep dataset state transitions pure and testable.
- Do not treat a file named `project-manifest.json` as an input dataset.

## Dataset rules

- Folder scans inspect immediate files only.
- Child folders are ignored unless selected separately.
- ZIP files inside a folder are informationally ignored and must be added separately.
- A Shapefile requires matching `.shp`, `.shx`, `.dbf`, and `.prj` files.
- Only included and accepted datasets enter the submission ZIP.
- The GP service always applies the fixed NTv2 transformation `DrukRef03_To_DrukRef23_NTv2.gtf`; it never chooses a transformation automatically.

## ArcGIS integration

- ArcGIS Server uses token security. Credentials live only in `.env` and are read by server code in `src/server`; never expose them through `VITE_` variables or import `src/server` from browser code.
- The browser calls only the app's own `/api/*` routes (`src/routes/api`); the app server generates, caches and renews the token and streams uploads and results.
- The app is served under the `APP_BASE_PATH` sub-path (default `/drukref/`) behind IIS; build browser URLs with `apiUrl()`.
- The upload service is asynchronous and must be polled through its job endpoint.
- The target coordinate system is fixed at WKID 11341.
- Keep service health, upload, polling, and result retrieval independently testable.

## Testing

- Add or update tests before changing dataset validation, inclusion state, packaging, or service polling.
- Prefer pure functions and injected fetch implementations over browser globals.
- Test user-visible rejection and ignored-file reasons, not only happy paths.
- Name tests that call the real ArcGIS Server `*.live.test.ts`; they are excluded from `pnpm test`.

## Documentation

Docs live in `docs/` (index and maintenance rules in `docs/README.md`). Update them in the same change as the code, add an entry under `## [Unreleased]` in `CHANGELOG.md`, and keep one home per fact:

| When you change… | Update |
| --- | --- |
| An environment variable (added, renamed, default) | `.env.example` and `docs/configuration.md` (enforced by `tests/docs.test.ts`) |
| Request flow, API routes, token handling, security | `docs/architecture.md` |
| Scripts, tooling, test layout | `docs/development.md` |
| `deployment/windows/`, GitHub workflows, IIS config, ports, base path | `docs/deployment.md` (and `deployment/iis/web.config`) |
| `deployment/ProjectUploadPackage.py` or GP publishing | `docs/arcgis-gp-service.md` |
| Hosting, security trade-offs, core dependencies | a new ADR in `docs/decisions/` |
| User-facing behaviour or scope | `PRODUCT.md`; visual design: `DESIGN.md` |
