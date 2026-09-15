#!/usr/bin/env bash
# Opens one URL in the owner's default Windows browser from WSL so Google's browser callback can
# return to the waiting enrollment command. It passes nothing else and records nothing.
exec /mnt/c/Windows/System32/rundll32.exe url.dll,FileProtocolHandler "$1"
