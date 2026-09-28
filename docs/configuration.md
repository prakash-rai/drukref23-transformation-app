# Configuration

For whoever sets up `.env` on a development machine or the production server.

Copy [`.env.example`](../.env.example) to `.env` and fill it in. `.env` is ignored by git. In production it is `C:\apps\drukref\.env`, loaded by the DrukRef service when it starts ([deployment.md](deployment.md#2-create-the-folders-and-env)). In development `pnpm dev` loads it from the project folder.

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
| `APP_BASE_PATH` | no | `/drukref/` | build (Vite, Nitro) | Public sub-path. Applied **at build time**: production builds take it from the [GitHub variable](#github-variables) of the same name, not from the server's `.env`. |
| `APP_PORT` | no | `8080` | Windows service (`deployment/windows/start.mjs`) | Port on `127.0.0.1` that the app listens on and IIS proxies to. |

## Values with special characters

Wrap values that contain `$`, `#`, spaces or quotes in **single quotes**, for example `ARCGIS_PASSWORD='pa$$w#rd'`. Otherwise `#` starts a comment and the rest of the value is lost.

## GitHub variables

Production is built and deployed by GitHub Actions ([deployment.md](deployment.md#automatic-deployment)). Set these under **Settings → Secrets and variables → Actions → Variables** only when production differs from the default. Never put credentials in GitHub: they stay in the server's `.env`.

| Variable | Default | Used by |
| --- | --- | --- |
| APP_BASE_PATH | `/drukref/` | the build, and the deploy's health checks |
| APP_PORT | `8080` | the deploy's health checks; keep equal to `APP_PORT` in the server's `.env` |
| ARCGIS_SERVER_URL | `https://cadastral.systems.gov.bt/server` | the deploy's check whether ArcGIS itself is answering |

## Changing settings

| Setting changed | Action needed |
| --- | --- |
| Any `ARCGIS_*` or `MAX_UPLOAD_MB` | `Restart-Service DrukRef` |
| `APP_BASE_PATH` | Set the GitHub variable and redeploy (**Actions → Deploy → Run workflow**); update `deployment/iis/web.config` and `ARCGIS_TOKEN_REFERER` |
| `APP_PORT` | Change it in `.env` and the GitHub variable, update the port in `C:\inetpub\drukref\web.config`, then `Restart-Service DrukRef` |

In development, restart `pnpm dev` after editing `.env`.
