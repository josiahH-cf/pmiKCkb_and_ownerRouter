#!/usr/bin/env bash
# S238 R-S238-2: run the isolated November/December renewal browser journey. It checks out the
# committed HEAD into a disposable /tmp worktree, starts a Firestore emulator on a free loopback port
# and runs tests/browser/renewal-novdec-journey-browser.mjs inside it. Evidence (screenshots, server
# log, network refusal log, readback JSON) goes to private local state, never to Git. Production is
# never contacted: the server runs in the Demo descriptor with a synthetic RentVine transport and
# every other outbound connection refused. `--overlay` copies uncommitted changes for a dev run;
# such a run is labeled and is not evidence for a committed source SHA.
set -euo pipefail
repo=$(git rev-parse --show-toplevel)
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
port=$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')
config="$root/firebase.json"
node -e 'const fs=require("fs");const [cfg,port,cwd]=process.argv.slice(1);fs.writeFileSync(cfg,JSON.stringify({firestore:{rules:cwd+"/firestore.rules",indexes:cwd+"/firestore.indexes.json"},emulators:{singleProjectMode:true,firestore:{host:"127.0.0.1",port:Number(port)},ui:{enabled:false}}}))' "$config" "$port" "$root/worktree"
printf '{"run_id":"%s","source_sha":"%s","overlay":%s,"emulator_port":%s}\n' "$run_id" "$sha" "$overlay" "$port" >"$output/run.json"
cd "$root/worktree"
FIRESTORE_EMULATOR_HOST="127.0.0.1:$port" NOVDEC_JOURNEY_OUTPUT="$output" NOVDEC_JOURNEY_SOURCE_SHA="$sha" \
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
