<#
  CI test for deploy.ps1 (.github/workflows/ci.yml, job "Windows deploy script"). Needs Administrator, so it only runs
  on a throwaway GitHub-hosted Windows runner, never on the production server. Expects `pnpm build` to have run.

  Installs DrukRef.xml as a real Windows service, then checks that deploy.ps1:
    - keeps a release (with a warning) while ArcGIS is unreachable,
    - rolls back a release that does not start,
    - redeploys a release that is already on disk,
    - rolls back a release that stays offline while ArcGIS answers.
#>
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path "$PSScriptRoot\..\..").Path
$root = 'C:\apps\drukref'
New-Item -ItemType Directory -Force -Path $root, "$root\logs", "$root\tmp" | Out-Null

# Service wrapper, pointed at this runner's node.exe instead of C:\Program Files\nodejs.
Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe' -OutFile "$root\DrukRef.exe"
(Get-Content "$PSScriptRoot\DrukRef.xml" -Raw).Replace('C:\Program Files\nodejs\node.exe', (Get-Command node).Source) | Set-Content "$root\DrukRef.xml"
& "$root\DrukRef.exe" install
if ($LASTEXITCODE -ne 0) { throw 'Installing the service failed.' }

$good = Join-Path $env:RUNNER_TEMP 'release-good'
Copy-Item -LiteralPath "$repo\.output" -Destination $good -Recurse
Copy-Item -LiteralPath "$PSScriptRoot\start.mjs", "$PSScriptRoot\deploy.ps1" -Destination $good
$broken = Join-Path $env:RUNNER_TEMP 'release-broken'
Copy-Item -LiteralPath $good -Destination $broken -Recurse
Set-Content -LiteralPath "$broken\start.mjs" -Value 'process.exit(1)'

# Stand-in for ArcGIS Server's unauthenticated rest/info endpoint.
$fakeArcGIS = Join-Path $env:RUNNER_TEMP 'fake-arcgis.mjs'
Set-Content -LiteralPath $fakeArcGIS -Value "import { createServer } from 'node:http'; createServer((_, res) => res.writeHead(200, { 'Content-Type': 'application/json' }).end('{""currentVersion"":12.1}')).listen(9100, '127.0.0.1')"
$fake = Start-Process -FilePath (Get-Command node).Source -ArgumentList "`"$fakeArcGIS`"" -PassThru -WindowStyle Hidden

function Invoke-Deploy([string] $release, [string] $source, [string] $arcgisUrl = 'http://127.0.0.1:9/server') {
  $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "$PSScriptRoot\deploy.ps1", '-Release', $release,
    '-ArcGISUrl', $arcgisUrl, '-ArcGISWaitMinutes', '1', '-LiveSeconds', '30')
  if ($source) { $arguments += @('-Source', $source) }
  & powershell @arguments | Out-Host
  return $LASTEXITCODE
}
function Get-Current { Split-Path -Leaf @((Get-ChildItem -LiteralPath "$root\app" -Force | Where-Object { $_.Name -eq 'current' }).Target)[0] }
function Test-Live { try { (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/drukref/api/live').StatusCode -eq 200 } catch { $false } }
function Assert([bool] $condition, [string] $message) { if (-not $condition) { throw "FAILED: $message" }; Write-Host "ok - $message" }

try {
  Assert ((Invoke-Deploy 'release-a' $good) -eq 0) 'first deploy succeeds while ArcGIS is unreachable'
  Assert ((Get-Current) -eq 'release-a') 'current points to release-a'
  Assert (Test-Live) 'release-a answers api/live'

  Assert ((Invoke-Deploy 'release-b' $broken) -eq 1) 'a release that does not start fails the deploy'
  Assert ((Get-Current) -eq 'release-a') 'rolled back to release-a'
  Assert (Test-Live) 'release-a answers api/live after the rollback'

  Assert ((Invoke-Deploy 'release-a' $null) -eq 0) 'redeploying a release already on disk needs no source'

  Assert ((Invoke-Deploy 'release-c' $good 'http://127.0.0.1:9100/server') -eq 1) 'a release that stays offline while ArcGIS answers fails the deploy'
  Assert ((Get-Current) -eq 'release-a') 'rolled back to release-a again'
  Assert (Test-Live) 'release-a answers api/live after the second rollback'
} finally {
  Stop-Process -Id $fake.Id -ErrorAction SilentlyContinue
  Get-ChildItem -LiteralPath "$root\logs" -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "--- $($_.Name)"; Get-Content -LiteralPath $_.FullName -Tail 20 }
}
