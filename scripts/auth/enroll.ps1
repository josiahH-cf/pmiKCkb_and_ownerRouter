# Owner enrollment for the Windows credential store (S112). INTERACTIVE: the owner completes each
# Google sign-in in the browser. Nothing here reads, stores, or types a password or one-time code,
# and no token is printed. Run it once; with the Automation OU's session policy in place the
# resulting logins do not expire, and `npm run auth:ensure` keeps them usable unattended.
#
#   npm run auth:enroll                                   # unattended identity: pmi-runner@ impersonating the automation SA
#   npm run auth:enroll -- -Attended                      # the old auth:session behavior: refresh the active managed account
#   npm run auth:enroll -- -Attended -Account you@pmikcmetro.com
#
# The WSL store is separate (the Google client libraries read ADC from each shell's own home);
# enroll it with `bash scripts/auth/enroll.sh` from WSL. ASCII-only, Windows PowerShell 5.1 compatible.

param(
  [string]$Account = "pmi-runner@pmikcmetro.com",
  [string]$ImpersonateServiceAccount = "pmi-kc-automation@pmi-kc-kb-prod.iam.gserviceaccount.com",
  [string]$Project = "pmi-kc-kb-prod",
  [switch]$Attended
)

# Native gcloud writes to stderr on non-zero exit; branch on $LASTEXITCODE instead of terminating.
$ErrorActionPreference = "Continue"
$ManagedDomain = "pmikcmetro.com"

function Show-Ok   { param($m) Write-Host "OK   $m" -ForegroundColor Green }
function Show-Warn { param($m) Write-Host "..   $m" -ForegroundColor Yellow }
function Show-Bad  { param($m) Write-Host "XX   $m" -ForegroundColor Red }

function Test-CliToken {
  # True when the active gcloud credential mints a token. Prompts disabled, output discarded.
  $env:CLOUDSDK_CORE_DISABLE_PROMPTS = "1"
  gcloud auth print-access-token 1>$null 2>$null
  $code = $LASTEXITCODE
  Remove-Item Env:\CLOUDSDK_CORE_DISABLE_PROMPTS -ErrorAction SilentlyContinue
  return ($code -eq 0)
}

function Get-StoreAccounts {
  $raw = (gcloud auth list --format="value(account)" 2>$null)
  if ($null -eq $raw) { return @() }
  return @($raw | ForEach-Object { "$_".Trim() } | Where-Object { $_ -like "*@*" })
}

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  Show-Bad "gcloud is not on PATH. Install the Google Cloud SDK, then re-run."
  exit 1
}

if ($Attended) {
  if ($PSBoundParameters.ContainsKey("Account") -eq $false) {
    $current = (gcloud config get-value account 2>$null)
    if ("$current" -like "*@$ManagedDomain") { $Account = "$current".Trim() }
  }
  if ($Account -notlike "*@$ManagedDomain") {
    Show-Bad "Attended enrollment needs a managed account: -Account you@$ManagedDomain (never a personal account)."
    exit 1
  }
  $ImpersonateServiceAccount = ""
  Write-Host "== Attended enrollment ($Account, no impersonation) ==" -ForegroundColor Cyan
} else {
  Write-Host "== Unattended enrollment ($Account impersonating $ImpersonateServiceAccount) ==" -ForegroundColor Cyan
}

# 1. CLI login for the account (interactive only when it is absent or its token is stale).
$accounts = Get-StoreAccounts
if ($accounts -contains $Account) {
  gcloud config set account $Account 1>$null 2>$null
  Show-Ok "$Account is in this store and is now the active account."
} else {
  Show-Warn "$Account is not signed in here - a browser opens; sign in as $Account and finish the flow."
  gcloud auth login $Account
  gcloud config set account $Account 1>$null 2>$null
}

# 2. Impersonation for every gcloud call (unattended) or none (attended).
if ($ImpersonateServiceAccount -ne "") {
  gcloud config set auth/impersonate_service_account $ImpersonateServiceAccount 1>$null 2>$null
  Show-Ok "gcloud impersonates $ImpersonateServiceAccount."
} else {
  gcloud config unset auth/impersonate_service_account 1>$null 2>$null
  Show-Ok "gcloud impersonation cleared (attended)."
}

if (Test-CliToken) {
  Show-Ok "gcloud CLI token mints."
} else {
  Show-Warn "gcloud CLI token did not mint - a browser opens; sign in as $Account and finish the flow."
  gcloud auth login $Account
  if (-not (Test-CliToken)) {
    Show-Bad "gcloud CLI login did not take. If impersonation is configured, the account may lack roles/iam.serviceAccountTokenCreator on the service account (owner IAM step)."
  }
}

# 3. Application Default Credentials for the libraries: impersonated for unattended, plain for attended.
if ($ImpersonateServiceAccount -ne "") {
  $adcCheck = (node scripts/auth/ensure.mjs --need=adc --unattended --json 2>$null | Out-String)
  $adcOk = ($LASTEXITCODE -eq 0)
} else {
  node scripts/preflight-adc.mjs 1>$null 2>$null
  $adcOk = ($LASTEXITCODE -eq 0)
}
if ($adcOk) {
  Show-Ok "Application Default Credentials are fresh for this enrollment."
} else {
  Show-Warn "ADC needs the interactive login - a browser opens; sign in as $Account (do NOT pass --scopes)."
  if ($ImpersonateServiceAccount -ne "") {
    gcloud auth application-default login --impersonate-service-account=$ImpersonateServiceAccount
  } else {
    gcloud auth application-default login
  }
  gcloud auth application-default set-quota-project $Project 1>$null 2>$null
}

# 4. Read back through the unattended-safe path and exit with its verdict.
Write-Host ""
if ($ImpersonateServiceAccount -ne "") {
  node scripts/auth/ensure.mjs --need=gcloud,adc,env,gh --unattended
} else {
  node scripts/auth/ensure.mjs --need=gcloud,adc,env,gh
}
$verdict = $LASTEXITCODE
if ($verdict -eq 0) {
  Write-Host "READY - this Windows store is enrolled. Enroll the WSL store too: wsl -e bash -lc 'cd /mnt/c/Users/josia/Documents/github-windows/pmiKCkb_and_ownerRouter && bash scripts/auth/enroll.sh'" -ForegroundColor Green
} else {
  Write-Host "NOT READY - resolve the step named above, then re-run npm run auth:enroll" -ForegroundColor Red
}
exit $verdict
