#!/bin/sh
set -eu
umask 077
export TZ=Etc/UTC LC_ALL=C
exec python3 -B /app/scanner_service.py
