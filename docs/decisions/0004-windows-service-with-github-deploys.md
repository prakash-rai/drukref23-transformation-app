# 0004: Run the app as a Windows service; deploy from GitHub through a self-hosted runner

**Status:** Accepted (2026-09-28). Supersedes the container part of [0003](0003-single-container-without-nginx.md).

## Context

The app ran as a Linux Docker container on the Windows server that hosts IIS and ArcGIS Server. Docker Desktop is not supported on Windows Server, so the container needed Docker Engine inside WSL 2. That requires Windows Server 2022 or later and nested virtualization on a VM, and it adds a Linux distribution, an idle-shutdown workaround and a start-up task to maintain. Releases were built and started by hand.

Merged pull requests should now reach production automatically. The server is on the government network, and the repository is public.

## Decision

- Run the Nitro build directly on Node.js 24 LTS as the **DrukRef** Windows service (WinSW 2.12, `deployment/windows/DrukRef.xml`), under the virtual account `NT SERVICE\DrukRef`, bound to `127.0.0.1`. IIS remains the only public entry point.
- Build and test on GitHub-hosted runners. Deploy with a **self-hosted GitHub Actions runner** on the server, running as the local account `gh-runner`. The runner only makes outbound HTTPS connections, so no inbound port or SSH is opened, and `.env` never leaves the server.
- Keep each release in its own folder and switch a junction (`app\current`), so a rollback is a switch, not a rebuild.
- Treat the app and ArcGIS separately: `/api/live` decides whether a release starts; ArcGIS being unavailable never rolls a release back (`deployment/windows/deploy.ps1`).
- The service does not depend on the ArcGIS Server service. It starts delayed, connects to ArcGIS on demand, and recovers when ArcGIS finishes starting.

## Consequences

- No WSL, virtualization or Docker to maintain; works on Windows Server 2019 and later.
- Node.js security updates must be installed on the server by hand (step 1 of [deployment.md](../deployment.md#1-install-nodejs)); the container image used to carry them.
- Less isolation than a container: the service account can read the app folder and `.env`, and write only `logs\` and `tmp\`.
- A self-hosted runner on a public repository can be targeted by pull requests from forks. Mitigations: only `deploy.yml` targets the runner's `drukref-production` label, only for pushes to `main` in the `production` environment; fork pull requests need approval before any workflow runs; `gh-runner` can manage releases and the DrukRef service but cannot read `.env` or administer the server.
- Each deploy stops the app for a few seconds; uploads in progress at that moment fail and must be restarted.
