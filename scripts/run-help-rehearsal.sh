#!/usr/bin/env bash
# S243 R-S243-5: run the staff help hub against the isolated synthetic rehearsal. Like
# scripts/run-renewal-novdec-journey.sh it checks out the committed HEAD into a disposable /tmp
# worktree, starts a Firestore emulator on a free loopback port and runs
# scripts/capture-help-screenshots.mjs inside it. The server runs in the Demo descriptor with the
# synthetic RentVine transport from tests/browser/renewal-novdec-journey-network.mjs, and every
# other outbound connection is refused and logged. Production is never contacted.
#
#   bash scripts/run-help-rehearsal.sh               capture every scene into public/help/<version>/
#   bash scripts/run-help-rehearsal.sh --check       resolve every scene, write nothing into the tree
#   bash scripts/run-help-rehearsal.sh --controls    run the help control-name browser check
#   bash scripts/run-help-rehearsal.sh --serve       keep the rehearsal running for inspection
#   bash scripts/run-help-rehearsal.sh --outline     write role/name outlines of every scene route
#
# `--allow-overlay` copies uncommitted changes into the disposable worktree; the capture log
# records it, and such a run is not evidence for a committed source SHA. Logs, network refusals and
# outlines go to private local state, never to Git.
set -euo pipefail
repo=$(git rev-parse --show-toplevel)
overlay=false
args=()
for arg in "$@"; do
  if [[ "$arg" == "--allow-overlay" ]]; then overlay=true; fi
  args+=("$arg")
done
sha=$(git -C "$repo" rev-parse HEAD)
dirty=false
if ! git -C "$repo" diff --quiet HEAD -- . || [[ -n "$(git -C "$repo" ls-files --others --exclude-standard -- app components lib public scripts tests)" ]]; then
  dirty=true
fi
if $dirty && ! $overlay; then
  echo "The working tree differs from HEAD $sha. Commit first, or pass --allow-overlay (recorded in the capture log)." >&2
  exit 2
fi
run_id="$(date -u +%Y%m%dT%H%M%SZ)-${sha:0:8}$($overlay && echo -overlay || true)"
state="$HOME/.local/state/pmi-kc-help-rehearsal"
output="$state/$run_id"
mkdir -p "$output"
chmod 700 "$state" "$output"
root=$(mktemp -d /tmp/pmi-kc-help-rehearsal-XXXXXX)
cleanup() {
  git -C "$repo" worktree remove --force "$root/worktree" >/dev/null 2>&1 || true
  rm -rf "$root"
}
trap cleanup EXIT
git -C "$repo" worktree add --detach "$root/worktree" "$sha" >/dev/null
# Turbopack compiles only inside the workspace root, so node_modules is a hard-linked copy.
cp -al "$(readlink -f "$repo/node_modules")" "$root/worktree/node_modules"
if $overlay; then
  (cd "$repo" && { git diff --name-only HEAD; git ls-files --others --exclude-standard; } | sort -u) |
    while read -r file; do
      [[ -f "$repo/$file" ]] && mkdir -p "$root/worktree/$(dirname "$file")" && cp "$repo/$file" "$root/worktree/$file"
    done
  (cd "$repo" && git diff --name-only --diff-filter=D HEAD) | while read -r file; do
    rm -f "$root/worktree/$file"
  done
fi
port=$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})')
config="$root/firebase.json"
node -e 'const fs=require("fs");const [cfg,port,cwd]=process.argv.slice(1);fs.writeFileSync(cfg,JSON.stringify({firestore:{rules:cwd+"/firestore.rules",indexes:cwd+"/firestore.indexes.json"},emulators:{singleProjectMode:true,firestore:{host:"127.0.0.1",port:Number(port)},ui:{enabled:false}}}))' "$config" "$port" "$root/worktree"
printf '{"run_id":"%s","source_sha":"%s","overlay":%s,"emulator_port":%s,"args":"%s"}\n' "$run_id" "$sha" "$overlay" "$port" "${args[*]:-}" >"$output/run.json"
cd "$root/worktree"
quoted=$(printf ' %q' "${args[@]}")
# The capture process (fixture seeding, readbacks, the browser driver) loads the same refusal
# preload as the server: loopback only, every other connection refused and logged.
HELP_REHEARSAL_OUTPUT="$output" HELP_REHEARSAL_SOURCE_SHA="$sha" HELP_REHEARSAL_OVERLAY="$overlay" \
  HELP_REHEARSAL_TARGET_ROOT="$repo" FIRESTORE_EMULATOR_HOST="127.0.0.1:$port" \
  NOVDEC_JOURNEY_NETWORK_LOG="$output/capture-network.jsonl" \
  npx firebase emulators:exec --only firestore --project pmi-kc-kb-help-rehearsal-test --config "$config" \
  "node --import tsx --import ./tests/browser/renewal-novdec-journey-network.mjs scripts/capture-help-screenshots.mjs --managed$quoted" 2>&1 | tee "$output/rehearsal.log"
status=${PIPESTATUS[0]}
echo "evidence: $output"
exit "$status"
