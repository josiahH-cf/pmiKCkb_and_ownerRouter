#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

NODE_CMD="${NODE_CMD:-node}"
NPM_CMD="${NPM_CMD:-npm}"

if ! command -v "$NODE_CMD" >/dev/null 2>&1; then
  for node_dir in "/c/Program Files/nodejs" "/mnt/c/Program Files/nodejs"; do
    if [ -x "$node_dir/node.exe" ] && [ -x "$node_dir/npm" ]; then
      NODE_CMD="$node_dir/node.exe"
      NPM_CMD="$node_dir/npm"
      break
    fi
  done
fi

"$NODE_CMD" --version >/dev/null 2>&1 || {
  echo "node is required"
  exit 1
}

"$NPM_CMD" --version >/dev/null 2>&1 || {
  echo "npm is required"
  exit 1
}

if [ ! -f package-lock.json ]; then
  echo "package-lock.json is required. Run npm install first."
  exit 1
fi

"$NPM_CMD" ci
"$NPM_CMD" run format:check
"$NPM_CMD" run lint
"$NPM_CMD" run typecheck
"$NPM_CMD" test
"$NPM_CMD" run verify:router-boundary
"$NPM_CMD" run build
