# Documentation

Start with the [project README](../README.md). This folder holds the detailed documentation.

| Document | Read it when you… | Owner of the facts |
| --- | --- | --- |
| [architecture.md](architecture.md) | need to understand how the browser, app server, IIS and ArcGIS fit together | `src/server`, `src/routes/api` |
| [configuration.md](configuration.md) | set up `.env` or change a setting | `src/server/arcgis-config.ts`, `.env.example` |
| [development.md](development.md) | run, change or test the app locally | `package.json`, tests |
| [deployment.md](deployment.md) | install, upgrade, roll back or troubleshoot production | `Dockerfile`, `docker-compose.yml`, `deployment/iis/web.config` |
| [arcgis-gp-service.md](arcgis-gp-service.md) | publish or change the ArcGIS `ProjectUploadPackage` GP service | `deployment/ProjectUploadPackage.py` |
| [decisions/](decisions/README.md) | want to know *why* something is built the way it is | — |
| [../CHANGELOG.md](../CHANGELOG.md) | want to know what changed in a release | — |

`PRODUCT.md` and `DESIGN.md` at the repository root describe product scope and visual design. The design tooling reads them there, so they stay at the root.

## How documentation is maintained

The documentation lives in the repository and is reviewed and versioned together with the code (docs-as-code).

1. **One home per fact.** Each topic has exactly one document, listed above. Other documents link to it instead of repeating it. Examples: environment variables are described only in `configuration.md`; IIS steps only in `deployment.md`.
2. **Update docs in the same change as the code.** A change is not complete until the documents that describe it are updated. [AGENTS.md](../AGENTS.md) lists which document to update for each kind of change.
3. **Record the change** under `## [Unreleased]` in [CHANGELOG.md](../CHANGELOG.md). Use the *Added / Changed / Fixed / Removed / Security* headings. When you deploy a release, rename `Unreleased` to the version and date.
4. **Record significant decisions** as a short ADR in [decisions/](decisions/README.md): a new dependency, a hosting change, or a security trade-off. Don't edit an accepted ADR; supersede it with a new one.
5. **Drift is tested.** `pnpm test` runs [`tests/docs.test.ts`](../tests/docs.test.ts). It fails when:
   - an environment variable the code reads is missing from `.env.example` or `configuration.md` (or the reverse);
   - a relative link in any Markdown file points to a missing file;
   - the IIS `web.config` rewrite target no longer matches the default port and base path;
   - `CHANGELOG.md` has no `Unreleased` section.
6. **Write for the reader's task.** Begin each document with who it is for. Prefer numbered steps and copy-paste commands. Put secrets only in `.env`, never in documents.
