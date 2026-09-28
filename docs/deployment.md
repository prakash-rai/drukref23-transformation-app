# Production deployment

Runbook for administrators who install and operate the app on the Windows server that hosts IIS and ArcGIS Server for `cadastral.systems.gov.bt`. For how the pieces fit together, see [architecture.md](architecture.md); for why it is deployed this way, see [ADR 0004](decisions/0004-windows-service-with-github-deploys.md).

**Result:** staff open `https://cadastral.systems.gov.bt/drukref/`. IIS forwards `/drukref/*` to the **DrukRef** Windows service (Node.js) on `127.0.0.1:8080`, which calls ArcGIS at `https://cadastral.systems.gov.bt/server`. Every pull request merged to `main` is deployed automatically by GitHub Actions. The existing `/server` web adaptor is not changed.

```text
C:\apps\drukref\
├── .env                  ArcGIS credentials and settings (configuration.md); readable by the service only
├── DrukRef.exe           WinSW service wrapper
├── DrukRef.xml           service definition (deployment/windows/DrukRef.xml)
├── app\
│   ├── current\          junction to the active release; switched by deploy.ps1
│   └── releases\<commit>\  start.mjs, deploy.ps1, server\, public\  (newest 5 are kept)
├── logs\                 service logs, rotated (8 × 10 MB)
└── tmp\                  upload packages while they are forwarded to ArcGIS
C:\actions-runner\        GitHub Actions self-hosted runner (runs deploys)
```

## Before you start

- [ ] Windows Server 2019, 2022 or 2025, with administrator rights.
- [ ] The server can open outbound HTTPS (port 443) connections to GitHub: `github.com`, `api.github.com`, `*.actions.githubusercontent.com`, `*.githubusercontent.com` and `*.blob.core.windows.net` (artifact downloads). GitHub keeps the [full list](https://docs.github.com/en/actions/reference/runners/self-hosted-runners#communication-requirements). No inbound port is needed. Ask for a firewall or proxy rule if these are blocked.
- [ ] The GP service `project/ProjectUploadPackage` is published, asynchronous, and has **Uploads** enabled. See [arcgis-gp-service.md](arcgis-gp-service.md).
- [ ] A dedicated ArcGIS Server user exists and has access to that service.
- [ ] IIS has **URL Rewrite 2.1** and **Application Request Routing (ARR) 3.0** installed.
- [ ] `pnpm test:live` passes from a machine on the network.

If an earlier Docker-based version is running on the server, stop it first (`docker compose down` in its folder) so port 8080 is free.

Run every command below in **PowerShell as Administrator**.

## 1. Install Node.js

Download the **Windows Installer (.msi), x64** for **Node.js 24 LTS** from <https://nodejs.org/en/download> and install it with the default options, so that it lands in `C:\Program Files\nodejs`. Then check:

```powershell
node -v    # v24.x
```

Install Node.js security updates the same way (a newer 24.x MSI over the old one), then run `Restart-Service DrukRef`.

## 2. Create the folders and `.env`

```powershell
$root = 'C:\apps\drukref'
New-Item -ItemType Directory -Force "$root\app\releases", "$root\logs", "$root\tmp" | Out-Null
$repo = 'https://raw.githubusercontent.com/prakash-rai/drukref23-transformation-app/main'
Invoke-WebRequest -UseBasicParsing "$repo/.env.example" -OutFile "$root\.env"
Invoke-WebRequest -UseBasicParsing "$repo/deployment/windows/DrukRef.xml" -OutFile "$root\DrukRef.xml"
Invoke-WebRequest -UseBasicParsing 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe' -OutFile "$root\DrukRef.exe"
notepad "$root\.env"    # set ARCGIS_USERNAME and ARCGIS_PASSWORD; quote values containing $ or #
```

Every setting is described in [configuration.md](configuration.md).

## 3. Install the DrukRef service

```powershell
cd C:\apps\drukref
.\DrukRef.exe install
# Run as its own low-privilege virtual account instead of LocalSystem.
sc.exe config DrukRef obj= "NT SERVICE\DrukRef"
```

The service starts **Automatic (Delayed Start)** and restarts itself after a crash (10 s, 30 s, then every 60 s). It does not start yet: there is no release until the first deploy (step 6).

## 4. Create the runner account and set permissions

The GitHub runner runs as a dedicated local account, `gh-runner`, that can install releases and restart the DrukRef service, and nothing else. It cannot read `.env`.

```powershell
$password = Read-Host -AsSecureString 'New password for gh-runner'
New-LocalUser -Name gh-runner -Password $password -PasswordNeverExpires -Description 'GitHub Actions runner for DrukRef deploys'

$root = 'C:\apps\drukref'
# Administrators and SYSTEM: full control. The service: read everything (including .env), write logs and tmp.
icacls $root /inheritance:r /grant:r "Administrators:(OI)(CI)F" "SYSTEM:(OI)(CI)F" "NT SERVICE\DrukRef:(OI)(CI)RX"
icacls "$root\logs" /grant "NT SERVICE\DrukRef:(OI)(CI)M"
icacls "$root\tmp" /grant "NT SERVICE\DrukRef:(OI)(CI)M"
# The runner: manage releases only.
icacls "$root\app" /grant "gh-runner:(OI)(CI)M"

# Allow gh-runner to query, start and stop the DrukRef service.
$sid = (New-Object System.Security.Principal.NTAccount('gh-runner')).Translate([System.Security.Principal.SecurityIdentifier]).Value
$sd = (sc.exe sdshow DrukRef | Where-Object { $_ }) -join ''
$ace = "(A;;CCLCSWRPWPLORC;;;$sid)"
$new = if ($sd -match 'S:') { $sd -replace 'S:', "${ace}S:" } else { $sd + $ace }
sc.exe sdset DrukRef $new
```

## 5. Install the GitHub runner

1. On GitHub, open the repository → **Settings → Actions → Runners → New self-hosted runner**, choose **Windows / x64**, and run its **Download** commands in `C:\actions-runner`.
2. Run the **Configure** command it shows (`.\config.cmd --url … --token …`) and answer:
   - Runner group: press Enter.
   - Runner name: `drukref-prod`.
   - Additional labels: `drukref-production` (the deploy workflow only runs on a runner with this label).
   - Work folder: press Enter.
   - Run as service: `Y`. User account: `.\gh-runner`, and its password from step 4.
3. The runner page on GitHub now lists `drukref-prod` as **Idle**.

If the server reaches the internet through a proxy, add `https_proxy=http://proxy:port` to `C:\actions-runner\.env` and restart the runner service.

## 6. First deploy

On GitHub, open **Actions → Deploy → Run workflow** on `main`. The run builds the release on GitHub, then the runner installs it and starts the service. A green run means the app and ArcGIS are both online; a yellow warning means the app runs but ArcGIS did not answer within 10 minutes (see [Server restarts](#server-restarts-and-arcgis)).

```powershell
curl.exe http://127.0.0.1:8080/drukref/api/live      # {"status":"live"}
curl.exe http://127.0.0.1:8080/drukref/api/health    # {"status":"online","service":"ProjectUploadPackage"}
```

If `api/health` shows `"status":"offline"`, the `error` text says why; look it up under [Troubleshooting](#troubleshooting).

## 7. Configure IIS

1. In IIS Manager, select the server node and open **Application Request Routing Cache → Server Proxy Settings**. Set:
   - **Enable proxy**: ticked.
   - **Time-out (seconds)**: `1800`. The upload request stays open while the app forwards the package to ArcGIS.
   - **Response buffer threshold (KB)**: `0`, so result packages stream instead of buffering.
   - **Reverse rewrite host in response headers**: leave ticked.
2. Create the folder `C:\inetpub\drukref` and copy [`deployment/iis/web.config`](../deployment/iis/web.config) into it.
3. Under the site that serves `cadastral.systems.gov.bt` (the one containing `/server`), choose **Add Application**:
   - Alias: `drukref`
   - Physical path: `C:\inetpub\drukref`
   - Application pool: any pool (No Managed Code is fine)
4. If `APP_PORT` in `.env` is not `8080`, change the port in `C:\inetpub\drukref\web.config` to match.

## 8. Restrict access

Anyone who can open `/drukref/` can run jobs as the ArcGIS service account. On the `drukref` application, do one of the following:

- **Authentication**: enable *Windows Authentication* and disable *Anonymous Authentication*.
- **IP Address and Domain Restrictions**: allow only approved staff networks.

## 9. Verify

1. `curl.exe https://cadastral.systems.gov.bt/drukref/api/health` returns `"status":"online"`.
2. In a browser, open `https://cadastral.systems.gov.bt/drukref/`. The header shows **Service online**.
3. Add `deployment/data/drukref03-test-upload.zip`, run **Transform to DrukRef23**, and confirm that the projected ZIP downloads.
4. Restart the server and don't sign in. After about 10 minutes, repeat step 1 from another machine, so you know the service, the runner and ArcGIS come back without manual steps.

## Automatic deployment

```text
Pull request ──► CI (GitHub-hosted): pnpm check + Windows deploy-script test ──► required to merge
Merge to main ──► Deploy: build on GitHub (pnpm check, pnpm build)
                    └─► runner on this server: deploy.ps1
                          copy release → stop service → switch app\current → start service
                          /api/live within 60 s?                 no  → roll back, run fails
                          /api/health online within 10 min?      yes → done
                            ArcGIS answers but app stays offline → roll back, run fails
                            ArcGIS itself not answering          → keep release, run warns
```

- Workflows: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) and [`deploy.yml`](../.github/workflows/deploy.yml); the install step is [`deployment/windows/deploy.ps1`](../deployment/windows/deploy.ps1).
- One deploy runs at a time. A merge during a deploy waits for it.
- Deploying stops the service for a few seconds. Staff whose job is running keep waiting: the page rides out up to 3 minutes of outage. An upload that is being sent at that moment fails and must be started again, so avoid merging while colleagues are uploading large packages.
- If the runner is offline, the deploy waits in the queue (up to 24 hours) and starts when the runner reconnects.

### GitHub settings

Set once by the repository owner:

| Setting | Value | Why |
| --- | --- | --- |
| **Settings → Environments → `production`** | Deployment branches: `main` only | Only `main` can be deployed |
| **Settings → Actions → General → Fork pull request workflows** | *Require approval for all external contributors* | The repository is public; a stranger's pull request must never run on the server's runner |
| **Settings → Branches → `main`** | Require a pull request and the status checks **pnpm check** and **Windows deploy script** | Nothing untested reaches `main` |
| **Settings → Secrets and variables → Actions → Variables** (optional) | `APP_BASE_PATH`, `APP_PORT`, `ARCGIS_SERVER_URL` | Only when production differs from the defaults ([configuration.md](configuration.md#github-variables)) |

## Server restarts and ArcGIS

After a reboot the pieces come back in this order, without anyone signing in:

| Time after boot | What happens | What staff see |
| --- | --- | --- |
| < 1 min | IIS starts | IIS `502.3` for `/drukref/` |
| about 2 min | **DrukRef** (delayed start) and the runner start | Page loads; banner: *The transformation service is unavailable* with ArcGIS's reason |
| about 4–6 min | ArcGIS Server (delayed start) finishes starting | Within 30 s the page turns **Service online** by itself |

The app does not depend on ArcGIS to start. It connects on the first request and signs in again after ArcGIS restarts. The page re-checks every 30 seconds while the service is unavailable, with no time limit.

Recommended once on the server: in `services.msc`, open **ArcGIS Server → Recovery** and set *First failure* and *Second failure* to **Restart the Service**. ArcGIS occasionally fails to start after a reboot.

To measure how long ArcGIS takes on this server, run this right after signing in following a reboot:

```powershell
$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime; $url = 'https://cadastral.systems.gov.bt/server/rest/info?f=json'; while ($true) { try { if ((Invoke-RestMethod $url -TimeoutSec 10).currentVersion) { break } } catch {}; Start-Sleep 10 }; 'ArcGIS ready {0:N1} minutes after boot' -f ((Get-Date) - $boot).TotalMinutes
```

A deploy waits up to 10 minutes for ArcGIS (`-ArcGISWaitMinutes` in `deploy.ps1`).

## Operations

### Roll back

- **From GitHub** (releases up to 30 days old): open **Actions → Deploy**, pick the run of the commit you want, and choose **Re-run all jobs**.
- **On the server** (any of the last 5 releases):

  ```powershell
  Get-ChildItem C:\apps\drukref\app\releases | Sort-Object LastWriteTime -Descending   # folder names are commit IDs
  powershell -ExecutionPolicy Bypass -File C:\apps\drukref\app\current\deploy.ps1 -Release <folder>
  ```

The next merge to `main` deploys the newest code again. To stop that, revert the change in a pull request.

### Change a setting or the ArcGIS password

1. For the password: change it in ArcGIS Server first.
2. Edit `C:\apps\drukref\.env`.
3. `Restart-Service DrukRef`, then check `api/health`. Tokens issued before a password change keep working until they expire, so running jobs are not interrupted.

Settings that also need other changes are listed in [configuration.md](configuration.md#changing-settings).

### Change the service definition

After a change to `deployment/windows/DrukRef.xml`, copy it to `C:\apps\drukref\DrukRef.xml`, then:

```powershell
Stop-Service DrukRef; C:\apps\drukref\DrukRef.exe refresh; Start-Service DrukRef
```

### Logs and monitoring

- Logs: `C:\apps\drukref\logs\DrukRef.out.log` (app), `DrukRef.err.log` (errors) and `DrukRef.wrapper.log` (starts, stops, restarts). Follow one with `Get-Content C:\apps\drukref\logs\DrukRef.out.log -Tail 200 -Wait`.
- Deploy history: the repository's **Actions → Deploy** page, or **Deployments** on the repository home page.
- Monitoring: poll `https://cadastral.systems.gov.bt/drukref/api/health`. It returns HTTP 200 when ArcGIS is usable and 503 with a reason otherwise. `api/live` only confirms the app is running.
- State: the app keeps nothing between requests. Temporary uploads in `tmp\` are deleted after each submission. ArcGIS keeps job outputs according to the GP service's result retention setting.
- Backup: keep a secure copy of `.env`; everything else is rebuilt from the repository.

## Troubleshooting

Start with `curl.exe http://127.0.0.1:8080/drukref/api/health` on the server. It bypasses IIS and shows the app's own diagnosis.

| Symptom or message | Likely cause | Fix |
| --- | --- | --- |
| `The app server is missing ARCGIS_USERNAME and ARCGIS_PASSWORD` | `.env` missing, empty, or not re-read | Fill `C:\apps\drukref\.env`, then `Restart-Service DrukRef` |
| `ArcGIS sign-in failed: … Invalid username or password` | Wrong credentials, or a `$`/`#` in the password was not quoted | Correct `.env`; wrap the value in single quotes |
| `Cannot reach ArcGIS Server at … (getaddrinfo ENOTFOUND …)` or `(… ETIMEDOUT)` | The server can't resolve or reach its own public name (DNS or hairpin NAT) | Add `<LAN IP> cadastral.systems.gov.bt` (from `ipconfig`) to `C:\Windows\System32\drivers\etc\hosts`, then `Restart-Service DrukRef` |
| `Cannot reach ArcGIS Server at … (unable to verify the first certificate / self-signed certificate)` | The certificate is issued by an internal CA that Node.js doesn't trust | Export the CA certificate as PEM to `C:\apps\drukref\ca.pem`, add `<env name="NODE_EXTRA_CA_CERTS" value="%BASE%\ca.pem" />` to `DrukRef.xml`, and [refresh the service](#change-the-service-definition) |
| `ArcGIS rejected a freshly generated token …` | The account can't use the service, or ArcGIS restricts allowed referers | Grant the account access; make `ARCGIS_TOKEN_REFERER` match an allowed referer |
| `… not permitted to use project/ProjectUploadPackage` | Service security | In ArcGIS Server Manager, give the account's role access to the service |
| `… was not found on ArcGIS Server` | Wrong service or task name | Check `ARCGIS_GP_SERVICE` and `ARCGIS_GP_TASK` against `…/rest/services` |
| `Upload: the Uploads capability is not enabled …` | GP service setting | Enable **Uploads** on the service and restart it |
| `The package is larger than the N MB limit` | `MAX_UPLOAD_MB` | Raise it, keeping it within the IIS and ArcGIS limits |
| IIS `404` for `/drukref/` | The `drukref` application is missing, or ARR proxy is disabled | Repeat [step 7](#7-configure-iis) |
| IIS `404.13` on upload | Request size limit | Check `requestLimits` in the application's `web.config` |
| IIS `502.3` | Service not running, wrong port, or ARR time-out | `Get-Service DrukRef`; read `logs\DrukRef.err.log`; check `APP_PORT` and the ARR time-out |
| Service starts and stops again | The release or `.env` is broken, or `node.exe` isn't in `C:\Program Files\nodejs` | Read `logs\DrukRef.err.log` and `DrukRef.wrapper.log`; roll back if a deploy caused it |
| Deploy run waits with *Waiting for a runner* | The runner service is stopped or can't reach GitHub | `Get-Service actions.runner.*`; check outbound HTTPS and the proxy ([step 5](#5-install-the-github-runner)) |
| Deploy fails with *Access is denied* or *Could not stop the DrukRef service* | `gh-runner` permissions missing | Repeat [step 4](#4-create-the-runner-account-and-set-permissions) |
| Deploy rolled back: *did not answer … api/live* | The new release doesn't start | Read `logs\DrukRef.err.log`; fix in a pull request |
| Deploy rolled back: *ArcGIS Server is answering, but release … reports: …* | The new release can't use ArcGIS | Look up the reported message in this table |
| Deploy warning: *ArcGIS Server did not answer within 10 minutes* | ArcGIS is down or still starting | Check the ArcGIS Server service; the app connects once ArcGIS is ready |
| Job ends with `<dataset> failed to transform: …` | Source data problem, for example not EPSG:5266 | Fix the data; see [arcgis-gp-service.md](arcgis-gp-service.md) |

To check ArcGIS from a workstation instead, run `pnpm test:live` ([development.md](development.md#live-test)).
