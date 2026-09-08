# Compatibility entry point. All development credentials and Node tooling live in WSL.
param([string]$Account = "josiah@pmikcmetro.com", [switch]$Attended)
$ErrorActionPreference = "Stop"
if ($Account -ne "josiah@pmikcmetro.com") { throw "Only the authorized local managed account may enroll." }
& wsl.exe -e bash -lc 'cd /mnt/c/Users/josia/Documents/github-windows/pmiKCkb_and_ownerRouter && npm run auth:enroll:wsl -- --attended --account=josiah@pmikcmetro.com'
exit $LASTEXITCODE
