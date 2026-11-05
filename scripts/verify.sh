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
"$NPM_CMD" run verify:dependencies
# The second-scale policy checks run first, so a failure among them is reported before the
# minutes-long lanes rather than after them. Every check still runs on every gate.
"$NPM_CMD" run verify:router-boundary
"$NPM_CMD" run verify:falsification
"$NPM_CMD" run verify:context-freshness
"$NPM_CMD" run verify:active-doc-paths
"$NPM_CMD" run verify:spec-traceability
"$NPM_CMD" run verify:copy-voice
"$NPM_CMD" run verify:redaction
# S242/S243/S244: the staff help hub gates (coverage, control names, screenshots, content rules).
"$NPM_CMD" run verify:help-coverage
"$NPM_CMD" run verify:help-controls
"$NPM_CMD" run verify:help-screenshots
"$NPM_CMD" run verify:help-content
# S54 parity: ci.yml runs this too. Locally the dev .env.local declares all eleven KB Spaces, so
# the documented multi-Space override is required; CI has no such file and runs the stricter bare
# form. Both must run it, or a budget regression reaches main through whichever lane omits it.
"$NPM_CMD" run check:budget-guard -- --allow-multiple-spaces
"$NPM_CMD" run format:check
"$NPM_CMD" run lint
"$NPM_CMD" run typecheck
"$NPM_CMD" test
"$NPM_CMD" run test:firestore
"$NPM_CMD" run build
