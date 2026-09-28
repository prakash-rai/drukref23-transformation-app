# Configuration

For whoever sets up `.env` on a development machine or the production server.

Copy [`.env.example`](../.env.example) to `.env` and fill it in. `.env` is ignored by git and excluded from the Docker image. In production it is passed to the container at start-up (`env_file` in `docker-compose.yml`). In development `pnpm dev` loads it automatically.

## Variables

| Variable | Required | Default | Used by | Description |
| --- | --- | --- | --- | --- |
| `ARCGIS_USERNAME` | yes | — | app server | ArcGIS Server user the app signs in as. Use a dedicated account that only has access to the `project` folder services. |
| `ARCGIS_PASSWORD` | yes | — | app server | Password for that user. |
| `ARCGIS_SERVER_URL` | no | `https://cadastral.systems.gov.bt/server` | app server | ArcGIS web adaptor root. Tokens come from `<url>/tokens/generateToken`. |
| `ARCGIS_GP_SERVICE` | no | `project/ProjectUploadPackage` | app server | GP service path below `/rest/services`. |
| `ARCGIS_GP_TASK` | no | `ProjectUploadPackage` | app server | Task name inside the GP service. |
| `ARCGIS_TOKEN_REFERER` | no | `https://cadastral.systems.gov.bt/drukref/` | app server | Referer the token is bound to (`client=referer`). Keep it equal to the public app URL. |
| `ARCGIS_TOKEN_MINUTES` | no | `60` | app server | Requested token lifetime. The server may cap it (short-lived tokens are 60 minutes on this server). |
| `MAX_UPLOAD_MB` | no | `2048` | app server | Largest accepted package. Keep at or below the IIS and ArcGIS upload limits. |
| `APP_BASE_PATH` | no | `/drukref/` | build (Vite), container health check | Public sub-path. Applied **at build time**, so rebuild after changing it. |
| `APP_PORT` | no | `8080` | `docker-compose.yml` | Host port on `127.0.0.1` that IIS proxies to. |
| `IMAGE_TAG` | no | `latest` | `docker-compose.yml` | Docker image tag. Set it to the release version so you can roll back. |

## Values with special characters

Wrap values that contain `$`, `#`, spaces or quotes in **single quotes**, for example `ARCGIS_PASSWORD='pa$$w#rd'`. Docker Compose would otherwise expand `$…` as a variable, and `#` can start a comment.

## Changing settings

| Setting changed | Action needed |
| --- | --- |
| Any `ARCGIS_*` or `MAX_UPLOAD_MB` | `docker compose up -d --force-recreate` (a plain `restart` does not re-read `.env`) |
| `APP_BASE_PATH` | `docker compose up -d --build`, and update `deployment/iis/web.config` and `ARCGIS_TOKEN_REFERER` |
| `APP_PORT` | `docker compose up -d`, and update the port in `deployment/iis/web.config` |

In development, restart `pnpm dev` after editing `.env`.
