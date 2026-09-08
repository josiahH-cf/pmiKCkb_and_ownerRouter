$ErrorActionPreference = 'Stop'
$pmiRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$pmiLogRoot = Join-Path $env:LOCALAPPDATA 'PMI-KC\release-watcher'
New-Item -ItemType Directory -Path $pmiLogRoot -Force | Out-Null
# WSL uses its existing default user and credential store. The watcher emits only phase/status
# summaries; cloud command output and credentials never reach these host-local logs.
$pmiArguments = '--cd "' + $pmiRoot + '" --exec bash -lc "exec node scripts/release-watcher.mjs --watch"'
$pmiProcess = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\wsl.exe') `
  -ArgumentList $pmiArguments -WindowStyle Hidden -Wait -PassThru `
  -RedirectStandardOutput (Join-Path $pmiLogRoot 'status.log') `
  -RedirectStandardError (Join-Path $pmiLogRoot 'errors.log')
exit $pmiProcess.ExitCode
