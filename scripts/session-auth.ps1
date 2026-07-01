# Session-start authentication preflight (Windows, INTERACTIVE - the owner runs this).
#
# Run it with:   npm run auth:session
#   (or direct:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\session-auth.ps1)
#
# Why this exists: on the pmikcmetro.com managed org, Google reauth (RAPT) is INTERACTIVE-ONLY. The
# agent's non-interactive shell can never satisfy it, so a stale gcloud CLI login (cost-bearing gcloud)
# or stale ADC (live Sheets/Firestore/Vertex reads) silently fails mid-run - the recurring stall. This
# refreshes the CLI login + ADC ONLY when they are actually stale, then confirms the RentVine env.
#
# IMPORTANT gcloud interaction rules (learned the hard way):
#   - CHECK commands run with CLOUDSDK_CORE_DISABLE_PROMPTS=1 so a stale token FAILS FAST (never hangs
#     or errors on "cannot prompt"); their stderr is discarded.
#   - REAUTH commands (auth login / application-default login) run with NO redirect and prompts ENABLED
#     so gcloud sees the console and OPENS THE BROWSER. Redirecting their stderr makes gcloud think it
#     is non-interactive and refuse to prompt.
# ASCII-only + Windows PowerShell 5.1 compatible. See docs/facts.md (F-SESSION-AUTH).

# Native gcloud writes to stderr on non-zero exit; do NOT let that terminate the script (we branch on
# $LASTEXITCODE ourselves).
$ErrorActionPreference = "Continue"
$Account = "josiah@pmikcmetro.com"
$ready = $true

function Show-Ok   { param($m) Write-Host "OK   $m" -ForegroundColor Green }
function Show-Warn { param($m) Write-Host "..   $m" -ForegroundColor Yellow }
function Show-Bad  { param($m) Write-Host "XX   $m" -ForegroundColor Red }

function Test-CliToken {
  # True when the gcloud CLI token is valid. Prompts disabled -> a stale token fails fast, no prompt.
  $env:CLOUDSDK_CORE_DISABLE_PROMPTS = "1"
  gcloud auth print-access-token 1>$null 2>$null
  $okCode = $LASTEXITCODE
  Remove-Item Env:\CLOUDSDK_CORE_DISABLE_PROMPTS -ErrorAction SilentlyContinue
  return ($okCode -eq 0)
}

Write-Host "== Session auth preflight ($Account) ==" -ForegroundColor Cyan

# 1. gcloud present.
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  Show-Bad "gcloud is not on PATH. Install the Google Cloud SDK, then re-run."
  exit 1
}

# 2. Identity (local read, no token needed) - must be a pmikcmetro.com account, never a personal one.
$active = (gcloud config get-value account 2>$null)
if ($active -like "*@pmikcmetro.com") {
  Show-Ok "identity is $active"
} else {
  Show-Warn "active account is '$active' - the login below will set it to $Account"
}

# 3. gcloud CLI token (for cost-bearing gcloud: deploy/secrets). Reauth interactively only if stale.
if (Test-CliToken) {
  Show-Ok "gcloud CLI token is valid."
} else {
  Show-Warn "gcloud CLI reauth needed - a browser will open; sign in as $Account and finish the flow."
  gcloud auth login $Account
  if (Test-CliToken) {
    Show-Ok "gcloud CLI token refreshed."
  } else {
    Show-Bad "gcloud CLI login did not take - re-run 'npm run auth:session' and complete the browser flow."
    $ready = $false
  }
}

# 4. ADC freshness (the recurring stall for live Sheets/Firestore/Vertex reads). preflight:adc is a
#    read-only node check; reauth interactively only if it fails.
node scripts/preflight-adc.mjs
if ($LASTEXITCODE -ne 0) {
  Show-Warn "ADC reauth needed - a browser will open; sign in as $Account (do NOT pass --scopes)."
  gcloud auth application-default login
  node scripts/preflight-adc.mjs
  if ($LASTEXITCODE -ne 0) {
    Show-Bad "ADC still stale - re-run 'npm run auth:session' and complete the browser flow as $Account."
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
