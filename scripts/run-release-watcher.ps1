$ErrorActionPreference = 'Stop'
$pmiRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$pmiLogRoot = Join-Path $env:LOCALAPPDATA 'PMI-KC\release-watcher'
New-Item -ItemType Directory -Path $pmiLogRoot -Force | Out-Null
# WSL uses its existing default user and credential store. The watcher emits only phase/status
# summaries; cloud command output and credentials never reach these host-local logs.
# The native Linux Cloud SDK and Node runtime go ahead of the inherited Windows-mounted SDK path:
# through the interop path every gcloud read takes 25-45 s, which exhausted the 420,000 ms
# post-promotion observation window on 2026-09-16 before the first canary request left the host.
$pmiRuntimePath = '/snap/google-cloud-cli/current/bin:/home/josiah/.local/opt/node-v22.23.2-linux-x64/bin'
$pmiArguments = '--cd "' + $pmiRoot + '" --exec bash -lc "export PATH=' + $pmiRuntimePath + ':$PATH; exec node scripts/release-watcher.mjs --watch"'
$pmiProcess = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\wsl.exe') `
  -ArgumentList $pmiArguments -WindowStyle Hidden -Wait -PassThru `
  -RedirectStandardOutput (Join-Path $pmiLogRoot 'status.log') `
  -RedirectStandardError (Join-Path $pmiLogRoot 'errors.log')
exit $pmiProcess.ExitCode
