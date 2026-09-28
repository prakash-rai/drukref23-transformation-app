# Production deployment

Runbook for administrators who install and operate the app on the Windows server that hosts IIS and ArcGIS Server for `cadastral.systems.gov.bt`. For how the pieces fit together, see [architecture.md](architecture.md).

**Result:** staff open `https://cadastral.systems.gov.bt/drukref/`. IIS forwards `/drukref/*` to a Docker container on `127.0.0.1:8080`, and the container calls ArcGIS at `https://cadastral.systems.gov.bt/server`. The existing `/server` web adaptor is not changed.

## Before you start

- [ ] The GP service `project/ProjectUploadPackage` is published, asynchronous, and has **Uploads** enabled. See [arcgis-gp-service.md](arcgis-gp-service.md).
- [ ] A dedicated ArcGIS Server user exists and has access to that service.
- [ ] IIS on the server has **URL Rewrite 2.1** and **Application Request Routing (ARR) 3.0** installed.
- [ ] You have administrator rights on the server.
- [ ] `pnpm check` passes for the version you are deploying, and `pnpm test:live` passes from a machine on the network.

## 1. Install the container runtime

Choose one option.

**A. Docker Desktop** (Windows 10/11 hosts, or where your organisation supports it). Install it with the WSL 2 backend and Linux containers. In *Settings → General*, enable *Start Docker Desktop when you sign in*. Docker Desktop only runs while a user is signed in, so either configure automatic sign-in for a service account or use option B. Check that your organisation's Docker Desktop licence covers this use.

**B. Docker Engine inside WSL 2** (Windows Server 2022/2025, where Docker Desktop is not supported):

```powershell
wsl --install -d Ubuntu-24.04
```

Then, inside Ubuntu:

1. Install Docker Engine and the Compose plugin by following Docker's instructions for Ubuntu.
2. Enable systemd in `/etc/wsl.conf` (`[boot]` then `systemd=true`), run `sudo systemctl enable docker`, and restart WSL with `wsl --shutdown`.
3. Create a Task Scheduler task that runs `wsl.exe -d Ubuntu-24.04 -u root -- systemctl start docker` at system start-up, so the engine runs without anyone signed in.

WSL 2 forwards `127.0.0.1:8080` inside WSL to `127.0.0.1:8080` on Windows, which IIS uses. Run the remaining `docker` commands inside Ubuntu.

## 2. Put the application on the server

Clone the repository, or copy the project folder without `node_modules`, `.output` and `dist`. Use a fixed location, for example `C:\apps\drukref` (option A) or `~/drukref` inside Ubuntu (option B).

## 3. Create `.env`

```powershell
cd C:\apps\drukref
copy .env.example .env
notepad .env        # set ARCGIS_USERNAME and ARCGIS_PASSWORD; quote values containing $ or #
icacls .env /inheritance:r /grant:r "Administrators:F" "SYSTEM:F"
```

Every setting is described in [configuration.md](configuration.md).

## 4. Build and start the container

```powershell
docker compose build            # also runs the unit tests; the build fails if any test fails
docker compose up -d
docker compose ps               # STATUS should become "healthy" within a minute
curl.exe http://127.0.0.1:8080/drukref/api/health
```

Expected output: `{"status":"online","service":"ProjectUploadPackage"}`. If you see `"status":"offline"`, the `error` text says why; look it up under [Troubleshooting](#troubleshooting).

To tag the image with the release version (useful for rollback), set `IMAGE_TAG=1.2.0` in `.env` before building.

## 5. Configure IIS

1. In IIS Manager, select the server node and open **Application Request Routing Cache → Server Proxy Settings**. Set:
   - **Enable proxy**: ticked.
   - **Time-out (seconds)**: `1800`. The upload request stays open while the container forwards the package to ArcGIS.
   - **Response buffer threshold (KB)**: `0`, so result packages stream instead of buffering.
   - **Reverse rewrite host in response headers**: leave ticked.
2. Create the folder `C:\inetpub\drukref` and copy [`deployment/iis/web.config`](../deployment/iis/web.config) into it.
3. Under the site that serves `cadastral.systems.gov.bt` (the one containing `/server`), choose **Add Application**:
   - Alias: `drukref`
   - Physical path: `C:\inetpub\drukref`
   - Application pool: any pool (No Managed Code is fine)
4. If `APP_PORT` in `.env` is not `8080`, change the port in `C:\inetpub\drukref\web.config` to match.

## 6. Restrict access

Anyone who can open `/drukref/` can run jobs as the ArcGIS service account. On the `drukref` application, do one of the following:

- **Authentication**: enable *Windows Authentication* and disable *Anonymous Authentication*.
- **IP Address and Domain Restrictions**: allow only approved staff networks.

## 7. Verify

1. `curl.exe https://cadastral.systems.gov.bt/drukref/api/health` returns `"status":"online"`.
2. In a browser, open `https://cadastral.systems.gov.bt/drukref/`. The header shows **Service online**.
3. Add `deployment/data/drukref03-test-upload.zip`, run **Transform to DrukRef23**, and confirm that the projected ZIP downloads.
4. Restart the server and repeat step 1, so you know the container and IIS come back without manual steps.

## Operations

### Upgrade

```powershell
git pull                             # or copy the new release
# set IMAGE_TAG in .env to the new version
docker compose build
docker compose up -d
curl.exe http://127.0.0.1:8080/drukref/api/health
```

Add the release to [CHANGELOG.md](../CHANGELOG.md) if it isn't there already.

### Roll back

Set `IMAGE_TAG` in `.env` back to the previous version, then run `docker compose up -d --no-build`. Previous images stay on the server until you remove them (`docker image ls drukref-transformation-tool`).

### Change the ArcGIS password

1. Change the password in ArcGIS Server.
2. Update `ARCGIS_PASSWORD` in `.env`.
3. Run `docker compose up -d --force-recreate`. A plain `restart` does not re-read `.env`.
4. Check `api/health`. Tokens issued before the change keep working until they expire, so running jobs are not interrupted.

### Logs and monitoring

- Logs: `docker compose logs -f --tail 200 web`. They are rotated automatically (5 × 10 MB).
- Monitoring: poll `https://cadastral.systems.gov.bt/drukref/api/health`. It returns HTTP 200 when ArcGIS is usable and 503 with a reason otherwise. The container's own health check only confirms that the app is running.
- State: the container keeps nothing between requests. Temporary uploads are deleted after each submission. ArcGIS keeps job outputs according to the GP service's result retention setting.
- Backup: keep a secure copy of `.env`; everything else is rebuilt from the repository.

## Troubleshooting

Start with `curl.exe http://127.0.0.1:8080/drukref/api/health` on the server. It bypasses IIS and shows the app's own diagnosis.

| Symptom or message | Likely cause | Fix |
| --- | --- | --- |
| `The app server is missing ARCGIS_USERNAME and ARCGIS_PASSWORD` | `.env` missing, empty, or not re-read | Fill `.env`, then `docker compose up -d --force-recreate` |
| `ArcGIS sign-in failed: … Invalid username or password` | Wrong credentials, or a `$`/`#` in the password was not quoted | Correct `.env`; wrap the value in single quotes |
| `Cannot reach ArcGIS Server at … (getaddrinfo ENOTFOUND …)` or `(… ETIMEDOUT)` | The container can't resolve or reach the public host name (DNS or hairpin NAT) | In `docker-compose.yml`, enable `extra_hosts` with the server's LAN IP (`ipconfig`), then `docker compose up -d`. Allow the Docker/WSL network to reach port 443 in Windows Firewall. |
| `Cannot reach ArcGIS Server at … (unable to verify the first certificate / self-signed certificate)` | The certificate isn't trusted inside the container (internal CA) | Mount the CA certificate into the container and set `NODE_EXTRA_CA_CERTS` to its path in `docker-compose.yml` |
| `ArcGIS rejected a freshly generated token …` | The account can't use the service, or ArcGIS restricts allowed referers | Grant the account access; make `ARCGIS_TOKEN_REFERER` match an allowed referer |
| `… not permitted to use project/ProjectUploadPackage` | Service security | In ArcGIS Server Manager, give the account's role access to the service |
| `… was not found on ArcGIS Server` | Wrong service or task name | Check `ARCGIS_GP_SERVICE` and `ARCGIS_GP_TASK` against `…/rest/services` |
| `Upload: the Uploads capability is not enabled …` | GP service setting | Enable **Uploads** on the service and restart it |
| `The package is larger than the N MB limit` | `MAX_UPLOAD_MB` | Raise it, keeping it within the IIS and ArcGIS limits |
| IIS `404` for `/drukref/` | The `drukref` application is missing, or ARR proxy is disabled | Repeat [step 5](#5-configure-iis) |
| IIS `404.13` on upload | Request size limit | Check `requestLimits` in the application's `web.config` |
| IIS `502.3` | Container not running, wrong port, or ARR time-out | Check `docker compose ps`, `APP_PORT`, and the ARR time-out |
| Job ends with `<dataset> failed to transform: …` | Source data problem, for example not EPSG:5266 | Fix the data; see [arcgis-gp-service.md](arcgis-gp-service.md) |

To check ArcGIS from a workstation instead, run `pnpm test:live` ([development.md](development.md#live-test)).
