# Session-start authentication preflight (Windows, INTERACTIVE - the owner runs this).
#
# Run it with:   npm run auth:session
#   (or direct:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\session-auth.ps1)
#
# Why this exists: on the pmikcmetro.com managed org, Google reauth (RAPT) is INTERACTIVE-ONLY. The
# agent's non-interactive shell can never satisfy it, so a stale gcloud CLI login (cost-bearing gcloud)
# or stale ADC (live Sheets/Firestore/Vertex reads) silently fails mid-run - the recurring stall. This
# refreshes the CLI login + ADC ONLY when they are actually stale, then confirms the RentVine env.
# Idempotent + safe. ASCII-only + Windows PowerShell 5.1 compatible. See docs/facts.md (F-SESSION-AUTH).

$ErrorActionPreference = "Stop"
$Account = "josiah@pmikcmetro.com"
$Project = "pmi-kc-kb-prod"
$ready = $true

function Show-Ok   { param($m) Write-Host "OK   $m" -ForegroundColor Green }
function Show-Warn { param($m) Write-Host "..   $m" -ForegroundColor Yellow }
function Show-Bad  { param($m) Write-Host "XX   $m" -ForegroundColor Red }

Write-Host "== Session auth preflight ($Account / $Project) ==" -ForegroundColor Cyan

# 1. gcloud present.
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  Show-Bad "gcloud is not on PATH. Install the Google Cloud SDK, then re-run."
  exit 1
}

# 2. Identity: must be a pmikcmetro.com account, never a personal one.
$active = (gcloud config get-value account 2>$null)
if ($active -notlike "*@pmikcmetro.com") {
  Show-Warn "active account is '$active' - selecting $Account"
  gcloud config set account $Account 2>$null
  $active = (gcloud config get-value account 2>$null)
}
gcloud config set project $Project 2>$null | Out-Null
if ($active -eq $Account) {
  Show-Ok "identity is $Account"
} else {
  Show-Warn "identity is '$active' (the login below will fix it)"
}

# 3. gcloud CLI token - satisfies reauth for cost-bearing gcloud (deploy/secrets). A stale RAPT makes
#    print-access-token fail; refresh interactively only then.
gcloud auth print-access-token > $null 2>&1
if ($LASTEXITCODE -ne 0) {
  Show-Warn "gcloud CLI reauth needed - launching 'gcloud auth login' (finish the browser flow as $Account)"
  gcloud auth login $Account
  gcloud auth print-access-token > $null 2>&1
  if ($LASTEXITCODE -ne 0) {
    Show-Bad "gcloud CLI login did not take - re-run and complete the browser flow."
    $ready = $false
  } else {
    Show-Ok "gcloud CLI token refreshed."
  }
} else {
  Show-Ok "gcloud CLI token is valid."
}

# 4. ADC freshness - the recurring stall for live Sheets/Firestore/Vertex reads. preflight:adc is the
#    read-only check; reauth interactively only if it fails.
node scripts/preflight-adc.mjs
if ($LASTEXITCODE -ne 0) {
  Show-Warn "ADC reauth needed - launching 'gcloud auth application-default login' (sign in as $Account, NO --scopes)"
  gcloud auth application-default login
  node scripts/preflight-adc.mjs
  if ($LASTEXITCODE -ne 0) {
    Show-Bad "ADC still stale - re-run and complete the browser flow as $Account."
    $ready = $false
  }
}

# 5. RentVine env - HTTP Basic from .env.local (NOT gcloud), so reads are unaffected by reauth.
$envLocal = Join-Path (Get-Location) ".env.local"
$rvOk = $false
if (Test-Path $envLocal) {
  $content = Get-Content $envLocal -Raw
  $rvOk = (
    ($content -match "(?m)^\s*RENTVINE_API_KEY\s*=\s*\S") -and
    ($content -match "(?m)^\s*RENTVINE_API_SECRET\s*=\s*\S") -and
    ($content -match "(?m)^\s*RENTVINE_API_BASE_URL\s*=\s*\S")
  )
}
if ($rvOk) {
  Show-Ok "RentVine env present in .env.local."
} else {
  Show-Warn "RentVine env missing/incomplete in .env.local (live RentVine reads will degrade)."
}

Write-Host ""
if ($ready) {
  Write-Host "READY - live reads (ADC) and any owner-run gcloud won't stall on stale auth this session." -ForegroundColor Green
  exit 0
} else {
  Write-Host "NOT READY - resolve the red items above, then re-run:  npm run auth:session" -ForegroundColor Red
  exit 1
}
