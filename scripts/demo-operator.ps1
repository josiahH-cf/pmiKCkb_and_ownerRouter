param(
  [ValidateSet("TestRun", "Showtime", "Teardown")]
  [string]$Mode = "TestRun",
  [string]$BaseUrl = "http://localhost:3000",
  [string]$HostedBaseUrl = "https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app",
  [int]$TimeoutMs = 90000,
  [switch]$SkipInstall,
  [switch]$UseExistingServer,
  [switch]$IncludeHostedReadiness,
  [switch]$OfflineLocal,
  [switch]$NoOpenBrowser,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")
$nodeArgs = @(
  "scripts/demo-operator.mjs",
  "--mode=$Mode",
  "--base-url=$BaseUrl",
  "--hosted-base-url=$HostedBaseUrl",
  "--timeout-ms=$TimeoutMs"
)

if ($SkipInstall) {
  $nodeArgs += "--skip-install"
}

if ($UseExistingServer) {
  $nodeArgs += "--use-existing-server"
}

if ($IncludeHostedReadiness) {
  $nodeArgs += "--include-hosted-readiness"
}

if ($OfflineLocal) {
  $nodeArgs += "--offline-local"
}

if ($NoOpenBrowser) {
  $nodeArgs += "--no-open-browser"
}

if ($DryRun) {
  $nodeArgs += "--dry-run"
}

Push-Location $repoRoot
try {
  & node @nodeArgs
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
