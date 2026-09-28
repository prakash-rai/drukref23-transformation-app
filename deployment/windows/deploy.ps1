<#
.SYNOPSIS
  Installs a release of the DrukRef app on the Windows server, switches the service to it, and rolls back if it is broken.

.DESCRIPTION
  Run by .github/workflows/deploy.yml on the self-hosted runner, or by hand (docs/deployment.md, "Roll back").
  Windows PowerShell 5.1 compatible.

  1. Copies the release to C:\apps\drukref\app\releases\<release> (skipped if it is already there).
  2. Stops the service, points the app\current junction at the release, starts the service.
  3. App check: /api/live must answer within LiveSeconds, otherwise roll back.
  4. ArcGIS check: waits up to ArcGISWaitMinutes for /api/health.
     - online                                  -> success.
     - ArcGIS answers but the app stays offline -> the release is broken -> roll back.
     - ArcGIS itself does not answer            -> keep the release, finish with a warning
                                                   (the app connects once ArcGIS is ready).
  5. Deletes old releases, keeping the newest KeepReleases plus the previous one.

.EXAMPLE
  # Roll back to a release that is still on the server
  powershell -ExecutionPolicy Bypass -File C:\apps\drukref\app\current\deploy.ps1 -Release 1a2b3c4d5e6f
#>
[CmdletBinding()]
param(
  # Folder with start.mjs, server\ and public\. Not needed when the release is already on the server.
  [string] $Source,
  [Parameter(Mandatory = $true)] [string] $Release,
  [string] $Root = 'C:\apps\drukref',
  [string] $ServiceName = 'DrukRef',
  [int] $Port = 8080,
  [string] $BasePath = '/drukref/',
  [string] $ArcGISUrl = 'https://cadastral.systems.gov.bt/server',
  [int] $LiveSeconds = 60,
  [int] $ArcGISWaitMinutes = 10,
  [int] $KeepReleases = 5
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$app = Join-Path $Root 'app'
$releases = Join-Path $app 'releases'
$current = Join-Path $app 'current'
$target = Join-Path $releases $Release
$appUrl = "http://127.0.0.1:$Port/$($BasePath.Trim('/'))/"
# ArcGIS reachable but the app still offline for this many consecutive 15 s checks (2 minutes) means a broken release.
$brokenAfterChecks = 8

function Write-Summary([string] $text) {
  Write-Host $text
  if ($env:GITHUB_STEP_SUMMARY) { Add-Content -Path $env:GITHUB_STEP_SUMMARY -Value $text }
}

# GET a URL and return @{ Status; Body; Text }. Status 0 means no HTTP answer (connection refused, time-out).
function Invoke-Json([string] $url) {
  $status = 0; $text = ''
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15 -Headers @{ 'Cache-Control' = 'no-cache' }
    $status = [int] $response.StatusCode
    # Windows PowerShell 5.1 returns bytes instead of text when the response has no text content type.
    $text = if ($response.Content -is [byte[]]) { [System.Text.Encoding]::UTF8.GetString($response.Content) } else { $response.Content }
  } catch [System.Net.WebException] {
    $response = $_.Exception.Response
    if ($response) {
      $status = [int] $response.StatusCode
      $text = (New-Object System.IO.StreamReader($response.GetResponseStream())).ReadToEnd()
    } else { $text = $_.Exception.Message }
  } catch { $text = $_.Exception.Message }
  $body = $null
  try { $body = $text | ConvertFrom-Json } catch { }
  return @{ Status = $status; Body = $body; Text = $text }
}

function Get-CurrentLink {
  Get-ChildItem -LiteralPath $app -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'current' } | Select-Object -First 1
}

function Stop-App {
  # A crashing release may be between automatic restarts; keep trying until the service is stopped.
  $service = Get-Service -Name $ServiceName
  for ($attempt = 0; $attempt -lt 30 -and $service.Status -ne 'Stopped'; $attempt += 1) {
    try { Stop-Service -Name $ServiceName -ErrorAction Stop } catch { Start-Sleep -Seconds 2 }
    $service.Refresh()
  }
  if ($service.Status -ne 'Stopped') { throw "Could not stop the $ServiceName service." }
}

function Switch-Release([string] $releasePath) {
  Stop-App
  if (Get-CurrentLink) {
    # rmdir removes the junction only, never the release it points to.
    cmd /c rmdir "$current"
    if ($LASTEXITCODE -ne 0) { throw "Could not remove the junction $current." }
  }
  New-Item -ItemType Junction -Path $current -Target $releasePath | Out-Null
  # A release that cannot start is caught by the app check, which then rolls back.
  try { Start-Service -Name $ServiceName -ErrorAction Stop } catch { Write-Host "::warning::Starting $ServiceName failed: $($_.Exception.Message)" }
}

function Wait-Live {
  $deadline = (Get-Date).AddSeconds($LiveSeconds)
  do {
    if ((Invoke-Json "${appUrl}api/live").Status -eq 200) { return $true }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Test-ArcGIS {
  $info = Invoke-Json "$($ArcGISUrl.TrimEnd('/'))/rest/info?f=json"
  return ($info.Status -eq 200 -and $info.Body -and $info.Body.currentVersion)
}

function Undo-Release([string] $reason) {
  Write-Host "::error::$reason"
  if ($previous -and (Test-Path -LiteralPath (Join-Path $previous 'start.mjs'))) {
    Write-Summary "Rolled back to $(Split-Path $previous -Leaf): $reason"
    Switch-Release $previous
    if (-not (Wait-Live)) { Write-Host "::error::The previous release did not start either. Check C:\apps\drukref\logs." }
  } else {
    Write-Summary "Deploy failed and there is no previous release to roll back to: $reason"
  }
  exit 1
}

# 1. Put the release on disk.
New-Item -ItemType Directory -Force -Path $releases | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $target 'start.mjs'))) {
  if (-not $Source) { throw "Release $Release is not on the server; pass -Source." }
  $staging = "$target.staging"
  foreach ($path in @($staging, $target)) { if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force } }
  Copy-Item -LiteralPath $Source -Destination $staging -Recurse
  Rename-Item -LiteralPath $staging -NewName $Release
}

$link = Get-CurrentLink
$previous = if ($link) { @($link.Target)[0] } else { $null }
if ($previous -eq $target) { $previous = $null }

# 2. Switch.
Write-Host "Switching $ServiceName to release $Release (previous: $(if ($previous) { Split-Path $previous -Leaf } else { 'none' }))."
Switch-Release $target

# 3. App check.
if (-not (Wait-Live)) { Undo-Release "Release $Release did not answer ${appUrl}api/live within $LiveSeconds seconds. Check C:\apps\drukref\logs." }

# 4. ArcGIS check.
$deadline = (Get-Date).AddMinutes($ArcGISWaitMinutes)
$offlineWhileArcGISUp = 0
$outcome = 'online'
while ($true) {
  $health = Invoke-Json "${appUrl}api/health"
  if ($health.Status -eq 200) { break }
  $reason = if ($health.Body -and $health.Body.error) { $health.Body.error } else { "HTTP $($health.Status) $($health.Text)" }

  if (Test-ArcGIS) { $offlineWhileArcGISUp += 1 } else { $offlineWhileArcGISUp = 0 }
  if ($offlineWhileArcGISUp -ge $brokenAfterChecks) { Undo-Release "ArcGIS Server is answering, but release $Release reports: $reason" }
  if ((Get-Date) -ge $deadline) {
    if ($offlineWhileArcGISUp -gt 0) { Undo-Release "ArcGIS Server is answering, but release $Release reports: $reason" }
    Write-Host "::warning::ArcGIS Server did not answer within $ArcGISWaitMinutes minutes. Release $Release is live and connects once ArcGIS is ready. Last reason: $reason"
    $outcome = 'waiting for ArcGIS'
    break
  }
  Write-Host "Waiting for ArcGIS: $reason"
  Start-Sleep -Seconds 15
}

# 5. Clean up old releases.
$keep = @($target, $previous) | Where-Object { $_ }
Get-ChildItem -LiteralPath $releases -Directory |
  Where-Object { $_.Name -notlike '*.staging' } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $KeepReleases |
  Where-Object { $keep -notcontains $_.FullName } |
  ForEach-Object { Write-Host "Removing old release $($_.Name)"; Remove-Item -LiteralPath $_.FullName -Recurse -Force }

Write-Summary "Deployed release $Release to $ServiceName (ArcGIS: $outcome)."
