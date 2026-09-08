param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$pmiTaskName = 'PMI KC release watcher'
$pmiLauncher = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'run-release-watcher.ps1')).Path
$pmiUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$pmiTask = Get-ScheduledTask -TaskName $pmiTaskName -ErrorAction SilentlyContinue
if (-not $CheckOnly) {
  $pmiAction = New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') `
    -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $pmiLauncher + '"')
  $pmiTrigger = New-ScheduledTaskTrigger -AtLogOn -User $pmiUser
  $pmiPrincipal = New-ScheduledTaskPrincipal -UserId $pmiUser -LogonType Interactive -RunLevel Limited
  $pmiSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName $pmiTaskName -Action $pmiAction -Trigger $pmiTrigger `
    -Principal $pmiPrincipal -Settings $pmiSettings -Force | Out-Null
  $pmiTask = Get-ScheduledTask -TaskName $pmiTaskName
  if ($pmiTask.Principal.RunLevel -ne 'Limited' -or $pmiTask.Principal.LogonType -ne 'Interactive' -or
      $pmiTask.Settings.MultipleInstances -ne 'IgnoreNew' -or -not $pmiTask.Settings.StartWhenAvailable -or
      $pmiTask.Actions.Arguments -notlike ('*' + $pmiLauncher + '*')) {
    throw 'Release watcher task readback did not match its user-level contract.'
  }
  Start-ScheduledTask -TaskName $pmiTaskName
  $pmiTask = Get-ScheduledTask -TaskName $pmiTaskName
}
if (-not $pmiTask) { Write-Output 'Release watcher task is not installed.'; exit 1 }
[pscustomobject]@{
  TaskName = $pmiTask.TaskName
  State = [string]$pmiTask.State
  RunLevel = [string]$pmiTask.Principal.RunLevel
  LogonType = [string]$pmiTask.Principal.LogonType
  MultipleInstances = [string]$pmiTask.Settings.MultipleInstances
  StartWhenAvailable = $pmiTask.Settings.StartWhenAvailable
} | ConvertTo-Json
