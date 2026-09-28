# DrukRef Transformation Tool

NLCS web utility that transforms DrukRef03 datasets (EPSG:5266) to DrukRef23 (WKID 11341). Staff add GeoPackages, Shapefile folders or ZIP packages in the browser. The app submits them to the token-secured ArcGIS `ProjectUploadPackage` geoprocessing service, which applies the approved NTv2 transformation, and returns a projected ZIP.

Production: `https://cadastral.systems.gov.bt/drukref/`

## Quick start (development)

```bash
pnpm install
cp .env.example .env     # add ARCGIS_USERNAME and ARCGIS_PASSWORD
pnpm dev                 # http://localhost:3000/drukref/
pnpm check               # typecheck + tests + build; must pass before merging or deploying
```

## Documentation

| Topic | Document |
| --- | --- |
| How it works and where the security boundary is | [docs/architecture.md](docs/architecture.md) |
| `.env` settings | [docs/configuration.md](docs/configuration.md) |
| Local development and tests (including `pnpm test:live`) | [docs/development.md](docs/development.md) |
| **Production install, upgrade, rollback, troubleshooting** | [docs/deployment.md](docs/deployment.md) |
| Publishing the ArcGIS GP service | [docs/arcgis-gp-service.md](docs/arcgis-gp-service.md) |
| Design decisions | [docs/decisions/](docs/decisions/README.md) |
| Release history | [CHANGELOG.md](CHANGELOG.md) |
| Product scope and visual design | [PRODUCT.md](PRODUCT.md), [DESIGN.md](DESIGN.md) |
| Rules for contributors and coding agents | [AGENTS.md](AGENTS.md) |

[docs/README.md](docs/README.md) explains how the documentation is organised and kept current.
