param(
  [string]$ProjectId = "pmi-kc-kb-prod",
  [string]$ProjectName = "PMI KC KB",
  [switch]$EnableApis,
  [switch]$CheckOnly
)

$ErrorActionPreference = "Continue"

$requiredApis = @(
  "cloudresourcemanager.googleapis.com",
  "serviceusage.googleapis.com",
  "firestore.googleapis.com",
  "firebase.googleapis.com",
  "identitytoolkit.googleapis.com",
  "drive.googleapis.com",
  "gmail.googleapis.com"
)

function Add-UserPathEntry {
  param([string]$PathEntry)

  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $parts = @()
  if ($userPath) {
    $parts = $userPath -split ";" | Where-Object { $_ -ne "" }
  }

  if ($parts -notcontains $PathEntry) {
    $parts += $PathEntry
    [Environment]::SetEnvironmentVariable("Path", ($parts -join ";"), "User")
  }
}

function Set-UserEnv {
  param(
    [string]$Name,
    [string]$Value
  )

  [Environment]::SetEnvironmentVariable($Name, $Value, "User")
  Set-Item -Path "Env:$Name" -Value $Value
}

function Set-CurrentUserExecutionPolicy {
  $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey("Software\Microsoft\PowerShell\1\ShellIds\Microsoft.PowerShell")
  $key.SetValue("ExecutionPolicy", "RemoteSigned", [Microsoft.Win32.RegistryValueKind]::String)
  $key.Close()
}

function Get-CurrentUserExecutionPolicy {
  $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("Software\Microsoft\PowerShell\1\ShellIds\Microsoft.PowerShell")
  if (-not $key) {
    return "Undefined"
  }

  $value = $key.GetValue("ExecutionPolicy", "Undefined")
  $key.Close()
  return $value
}

function Find-JavaHome {
  $candidatePatterns = @(
    "C:\Program Files\Eclipse Adoptium\jdk-*\bin\java.exe",
    "C:\Program Files\Java\jdk-*\bin\java.exe",
    (Join-Path $env:LOCALAPPDATA "Codex\jdks\temurin-21\jdk-*\bin\java.exe")
  )

  foreach ($pattern in $candidatePatterns) {
    $javaExe = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue |
      Sort-Object -Property FullName -Descending |
      Select-Object -First 1

    if ($javaExe) {
      return Split-Path (Split-Path $javaExe.FullName -Parent) -Parent
    }
  }

  $configuredHomes = @(
    [Environment]::GetEnvironmentVariable("JAVA_HOME", "User"),
    [Environment]::GetEnvironmentVariable("JAVA_HOME", "Machine"),
    $env:JAVA_HOME
  ) | Where-Object { $_ }

  foreach ($candidateHome in $configuredHomes) {
    if (Test-Path (Join-Path $candidateHome "bin\java.exe")) {
      return $candidateHome
    }
  }

  return $null
}

function Write-CommandShim {
  param(
    [string]$ShimPath,
    [string]$TargetPath
  )

  $shimContent = @"
@echo off
"$TargetPath" %*
"@
  Set-Content -LiteralPath $ShimPath -Value $shimContent -Encoding ASCII
}

function Invoke-Gcloud {
  param([string[]]$Arguments)

  & $script:GcloudCmd @Arguments
  return $LASTEXITCODE
}

$gcloudBin = Join-Path $env:LOCALAPPDATA "Google\Cloud SDK\google-cloud-sdk\bin"
$script:GcloudCmd = Join-Path $gcloudBin "gcloud.cmd"
$windowsApps = Join-Path $env:LOCALAPPDATA "Microsoft\WindowsApps"

if (-not (Test-Path $script:GcloudCmd)) {
  Write-Error "Google Cloud SDK was not found at $script:GcloudCmd"
  exit 1
}

if (-not (Test-Path $windowsApps)) {
  New-Item -ItemType Directory -Path $windowsApps | Out-Null
}

$shim = Join-Path $windowsApps "gcloud.cmd"
Write-CommandShim -ShimPath $shim -TargetPath $script:GcloudCmd

Add-UserPathEntry -PathEntry $windowsApps
Add-UserPathEntry -PathEntry $gcloudBin

$javaHome = Find-JavaHome
if ($javaHome) {
  $javaBin = Join-Path $javaHome "bin"
  $javaExe = Join-Path $javaBin "java.exe"
  $javacExe = Join-Path $javaBin "javac.exe"
  Set-UserEnv -Name "JAVA_HOME" -Value $javaHome
  Add-UserPathEntry -PathEntry $javaBin
  Write-CommandShim -ShimPath (Join-Path $windowsApps "java.cmd") -TargetPath $javaExe
  if (Test-Path $javacExe) {
    Write-CommandShim -ShimPath (Join-Path $windowsApps "javac.cmd") -TargetPath $javacExe
  }
} elseif ($CheckOnly) {
  Write-Error "Java was not found. Install Temurin 21 JDK."
  exit 1
}

$env:Path = @(
  $windowsApps,
  $gcloudBin,
  $(if ($javaHome) { Join-Path $javaHome "bin" }),
  [Environment]::GetEnvironmentVariable("Path", "Machine"),
  [Environment]::GetEnvironmentVariable("Path", "User")
) -join ";"

Set-CurrentUserExecutionPolicy

$projectEnv = @{
  "ASK_DEMO_MODE" = "true"
  "AUTH_SESSION_COOKIE" = "__session"
  "FIREBASE_PROJECT_ID" = $ProjectId
  "FIRESTORE_DATABASE_ID" = "(default)"
  "GCLOUD_PROJECT" = $ProjectId
  "GCP_PROJECT_ID" = $ProjectId
  "GOOGLE_CLOUD_PROJECT" = $ProjectId
  "GOOGLE_CLOUD_QUOTA_PROJECT" = $ProjectId
  "LOCAL_DEMO_AUTH" = "true"
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID" = $ProjectId
  "VERTEX_AI_LOCATION" = "us-central1"
  "VERTEX_SEARCH_LOCATION" = "us"
}

foreach ($entry in $projectEnv.GetEnumerator()) {
  Set-UserEnv -Name $entry.Key -Value $entry.Value
}

Write-Host "Using Google Cloud SDK:"
Invoke-Gcloud -Arguments @("--version") | Out-Null

$activeAccount = & $script:GcloudCmd auth list --filter=status:ACTIVE --format="value(account)"
if (-not $activeAccount) {
  if ($CheckOnly) {
    Write-Error "No active gcloud account."
    exit 1
  }

  Invoke-Gcloud -Arguments @("auth", "login") | Out-Null
}

$adcPath = Join-Path $env:APPDATA "gcloud\application_default_credentials.json"
if (-not (Test-Path $adcPath)) {
  if ($CheckOnly) {
    Write-Error "Application Default Credentials are missing."
    exit 1
  }

  Invoke-Gcloud -Arguments @("auth", "application-default", "login") | Out-Null
}

Invoke-Gcloud -Arguments @("projects", "describe", $ProjectId, "--format=value(projectId)") *> $null
$projectExists = $LASTEXITCODE -eq 0

if (-not $projectExists) {
  if ($CheckOnly) {
    Write-Error "Project $ProjectId does not exist or is not accessible."
    exit 1
  }

  Write-Host "Creating project $ProjectId..."
  Invoke-Gcloud -Arguments @(
    "projects",
    "create",
    $ProjectId,
    "--name=$ProjectName",
    "--set-as-default",
    "--quiet"
  ) | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Project creation failed. Check Google Cloud Terms of Service and project creation permissions."
    exit $LASTEXITCODE
  }
}

if (-not $CheckOnly) {
  Invoke-Gcloud -Arguments @("config", "set", "project", $ProjectId, "--quiet") | Out-Null

  Invoke-Gcloud -Arguments @("services", "enable", "cloudresourcemanager.googleapis.com", "serviceusage.googleapis.com", "--project=$ProjectId", "--quiet") | Out-Null

  Invoke-Gcloud -Arguments @("config", "set", "billing/quota_project", $ProjectId, "--quiet") | Out-Null
  Invoke-Gcloud -Arguments @("auth", "application-default", "set-quota-project", $ProjectId, "--quiet") | Out-Null

  if ($EnableApis) {
    Write-Host "Enabling demo APIs..."
    Invoke-Gcloud -Arguments (@("services", "enable") + $requiredApis + @("--project=$ProjectId", "--quiet")) | Out-Null
  }
}

$configuredProject = & $script:GcloudCmd config get-value project 2>$null
$quotaProject = & $script:GcloudCmd config get-value billing/quota_project 2>$null
$adcQuotaProject = $null
if (Test-Path $adcPath) {
  $adcQuotaProject = (Get-Content -Raw $adcPath | ConvertFrom-Json).quota_project_id
}

$missingApis = @()
if ($CheckOnly) {
  $enabledApis = & $script:GcloudCmd services list --enabled --project $ProjectId --format="value(config.name)"
  foreach ($api in $requiredApis) {
    if ($enabledApis -notcontains $api) {
      $missingApis += $api
    }
  }
}

Write-Host ""
Write-Host "Host Google setup:"
Write-Host "  account: $activeAccount"
Write-Host "  project: $configuredProject"
Write-Host "  quota project: $quotaProject"
Write-Host "  ADC quota project: $adcQuotaProject"
Write-Host "  execution policy: $(Get-CurrentUserExecutionPolicy)"
Write-Host "  gcloud shim: $shim"
if ($javaHome) {
  Write-Host "  JAVA_HOME: $javaHome"
}

if ($configuredProject -ne $ProjectId -or $quotaProject -ne $ProjectId -or $adcQuotaProject -ne $ProjectId -or $missingApis.Count -gt 0) {
  if ($missingApis.Count -gt 0) {
    Write-Error "Missing enabled APIs: $($missingApis -join ', ')"
  } else {
    Write-Error "Google host setup is incomplete."
  }
  exit 1
}

Write-Host "Done."
