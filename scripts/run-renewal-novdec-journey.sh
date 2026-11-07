#!/usr/bin/env bash
# S238 R-S238-2: run the isolated November/December renewal browser journey. It checks out the
# committed HEAD into a disposable /tmp worktree, starts a Firestore emulator on a free loopback port
# and runs tests/browser/renewal-novdec-journey-browser.mjs inside it. Evidence (screenshots, server
# log, network refusal log, readback JSON) goes to private local state, never to Git. Production is
# never contacted: the server runs in the Demo descriptor with a synthetic RentVine transport and
# every other outbound connection refused. `--overlay` copies uncommitted changes for a dev run;
# such a run is labeled and is not evidence for a committed source SHA.
# Current engineering qualification wraps this command with isolated-verify.py --task renewal-journey;
# the /app branch below runs only after that entry point's actual kernel controls pass.
set -euo pipefail
repo=$(git rev-parse --show-toplevel)
# The engineering entry point already owns this physical source/dependency checkout. /tmp is a
# separate bounded mount and .git is read-only, so neither a second worktree nor shared hardlinks
# belong in this path. All original host-path behavior below remains separate and unchanged.
if [[ "$repo" == /app ]]; then
  [[ $# -eq 0 ]] || { echo "The isolated journey uses only its frozen staged source; no overlay argument is allowed." >&2; exit 2; }
  source "$repo/scripts/lib/one-path-rehearsal/network-guard.sh"
  enable_rehearsal_network_guard "$repo" /evidence
  node --input-type=module - <<'JS'
import assert from 'node:assert/strict';
import fs from 'node:fs';
const controls = JSON.parse(fs.readFileSync('/evidence/controls.json', 'utf8'));
const monitor = JSON.parse(fs.readFileSync('/evidence/monitor-ready.json', 'utf8'));
assert.equal(process.cwd(), '/app');
assert.equal(controls.allPassed, true);
assert.equal(Object.keys(controls.checks).length, 17);
assert.ok(Object.values(controls.checks).every(value => value === true));
assert.equal(fs.readlinkSync('/proc/self/ns/pid'), controls.pidNamespace);
assert.equal(monitor.pidNamespace, controls.pidNamespace);
assert.equal(monitor.ancestryAndRssObserved, true);
assert.match(process.env.PMI_SOURCE_MANIFEST_SHA256 ?? '', /^[a-f0-9]{64}$/);
assert.equal(process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES, '/opt/public-font-runtime/responses.cjs');
JS
  output=/evidence/renewal-journey
  mkdir "$output"
  sha=$(git rev-parse HEAD)
  overlay=false
  git diff --quiet HEAD -- . || overlay=true
  printf '{"source_sha":"%s","source_manifest_sha256":"%s","overlay":%s,"isolation":"kernel-v1"}\n' "$sha" "$PMI_SOURCE_MANIFEST_SHA256" "$overlay" >"$output/run.json"
  port=$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')
  config="$output/firebase.json"
  node -e 'const fs=require("fs");const [cfg,port]=process.argv.slice(1);fs.writeFileSync(cfg,JSON.stringify({firestore:{rules:"/app/firestore.rules",indexes:"/app/firestore.indexes.json"},emulators:{singleProjectMode:true,firestore:{host:"127.0.0.1",port:Number(port)},ui:{enabled:false}}}))' "$config" "$port"
  CI=true FIRESTORE_EMULATOR_HOST="127.0.0.1:$port" NOVDEC_JOURNEY_OUTPUT="$output" NOVDEC_JOURNEY_SOURCE_SHA="$sha" \
    NOVDEC_JOURNEY_OVERLAY="$overlay" NOVDEC_JOURNEY_ISOLATED=kernel-v1 \
    node node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only firestore --project pmi-kc-kb-novdec-journey-test --config "$config" \
    "node tests/browser/renewal-novdec-journey-browser.mjs" 2>&1 | tee "$output/journey.log"
  exit "${PIPESTATUS[0]}"
fi
overlay=false
[[ "${1:-}" == "--overlay" ]] && overlay=true
sha=$(git -C "$repo" rev-parse HEAD)
run_id="$(date -u +%Y%m%dT%H%M%SZ)-${sha:0:8}$($overlay && echo -overlay || true)"
root=$(mktemp -d /tmp/pmi-kc-novdec-journey-XXXXXX)
output="$HOME/.local/state/pmi-kc-novdec-journey-20261028/$run_id"
mkdir -p "$output"
chmod 700 "$HOME/.local/state/pmi-kc-novdec-journey-20261028" "$output"
cleanup() {
  git -C "$repo" worktree remove --force "$root/worktree" >/dev/null 2>&1 || true
  rm -rf "$root"
}
trap cleanup EXIT
git -C "$repo" worktree add --detach "$root/worktree" "$sha" >/dev/null
# Turbopack compiles only inside the workspace root, so node_modules is a hard-linked copy (same
# filesystem, no extra bytes). A marker lets the run prove nothing wrote into the shared files. A
# checkout whose node_modules is itself a link copies the directory it resolves to, not the link.
cp -al "$(readlink -f "$repo/node_modules")" "$root/worktree/node_modules"
touch "$root/node-modules-marker"
if $overlay; then
  (cd "$repo" && { git diff --name-only HEAD; git ls-files --others --exclude-standard; } | sort -u) |
    while read -r file; do
      [[ -f "$repo/$file" ]] && mkdir -p "$root/worktree/$(dirname "$file")" && cp "$repo/$file" "$root/worktree/$file"
    done
fi
source "$root/worktree/scripts/lib/one-path-rehearsal/network-guard.sh"
enable_rehearsal_network_guard "$root/worktree" "$output"
port=$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')
config="$root/firebase.json"
node -e 'const fs=require("fs");const [cfg,port,cwd]=process.argv.slice(1);fs.writeFileSync(cfg,JSON.stringify({firestore:{rules:cwd+"/firestore.rules",indexes:cwd+"/firestore.indexes.json"},emulators:{singleProjectMode:true,firestore:{host:"127.0.0.1",port:Number(port)},ui:{enabled:false}}}))' "$config" "$port" "$root/worktree"
printf '{"run_id":"%s","source_sha":"%s","overlay":%s,"emulator_port":%s}\n' "$run_id" "$sha" "$overlay" "$port" >"$output/run.json"
cd "$root/worktree"
CI=true FIRESTORE_EMULATOR_HOST="127.0.0.1:$port" NOVDEC_JOURNEY_OUTPUT="$output" NOVDEC_JOURNEY_SOURCE_SHA="$sha" \
  NOVDEC_JOURNEY_OVERLAY="$overlay" \
  npx firebase emulators:exec --only firestore --project pmi-kc-kb-novdec-journey-test --config "$config" \
  "node tests/browser/renewal-novdec-journey-browser.mjs" 2>&1 | tee "$output/journey.log"
status=${PIPESTATUS[0]}
changed=$(find "$root/worktree/node_modules" -type f -newer "$root/node-modules-marker" -links +1 2>/dev/null | head -20)
if [[ -n "$changed" ]]; then
  echo "shared node_modules files changed during the run:" | tee -a "$output/journey.log"
  echo "$changed" | tee -a "$output/journey.log"
  status=1
fi
echo "evidence: $output"
exit "$status"
