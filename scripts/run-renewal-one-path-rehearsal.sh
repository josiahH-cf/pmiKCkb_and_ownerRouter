#!/usr/bin/env bash
# S254 R-S254-2 to R-S254-4 and S252 R-S252-2: the one-path renewal rehearsal. Like
# scripts/run-renewal-novdec-journey.sh and scripts/run-help-rehearsal.sh it checks a commit out
# into a disposable /tmp worktree, starts Firebase emulators on free loopback ports and serves the
# real app in the Demo descriptor with local demo sign-in (Editor, Approver, Admin), a synthetic
# RentVine transport and every other outbound connection refused and logged. Production, a
# provider, a mailbox and a billed lookup are never contacted. Evidence goes to private local
# state (~/.local/state/pmi-kc-one-path-rehearsal/<run>), never to Git.
#
#   bash scripts/run-renewal-one-path-rehearsal.sh                    smoke: sign in, open Renewals, count rows
#   bash scripts/run-renewal-one-path-rehearsal.sh --serve            stay up for a verification session
#   bash scripts/run-renewal-one-path-rehearsal.sh --driver <file>    run a journey driver file
#   bash scripts/run-renewal-one-path-rehearsal.sh --commit <sha> ... serve that commit's application
#   bash scripts/run-renewal-one-path-rehearsal.sh --driver tests/browser/one-path-stand-in-proof-driver.mjs
#                                                                     prove the stand-ins and control hooks through the app
#
# Options
#   --commit <sha>     Serve the application as of that commit (for example the starting commit
#                      6491c06f3773e92c0bd811d4360371523e24d643) with the harness files of THIS
#                      checkout laid over it: this script's helpers, the provider boundary, the
#                      fixture and the drivers. Application code stays that commit's.
#   --overlay          Copy this checkout's uncommitted changes into the worktree (current tree
#                      only). The run is labeled and is not evidence for a committed source SHA.
#   --serve            Keep serving; print the origin, the sign-in steps for each role, the control
#                      hooks and the log locations. Stop with Ctrl+C.
#   --serve-for <s>    With --serve: stop by itself after that many seconds.
#   --driver <file>    Run this driver file (path inside the repository) in place of the smoke
#                      driver. Arguments after -- are passed to it.
#   --no-seeds         Load the source leases only; skip every app-state seed.
#   --hold-automatic-comparison
#                      Keep the rehearsal's automatic preparation setting off, including after
#                      resets. Use for audits that must never trigger an automatic comparison.
#   --no-mail-adapter  Serve without the Demo-owned mail adapter (S249): the server is then outside
#                      the rehearsal exemption, as a verification session's server is, so the
#                      automatic start never fires in an automated browser and sends and Gmail
#                      drafts are refused. Comparisons still reach the comparison stand-in.
#
# WHAT IT LOADS. The "November 5 mix" (tests/fixtures/lease-renewal/november-5-mix.json): 38
# synthetic leases, every date shifted by whole months so the working month is the next calendar
# month on today's Central business date. Its shape check must pass before anything starts.
#
# STAND-INS, inside the rehearsal only (scripts/lib/one-path-rehearsal/stand-ins.mjs, 127.0.0.1):
#   comparison   synthetic comparables for RentCast reads, with a request log by lease
#   mail         accepts a send, keeps what was sent readable, and on request delivers an owner
#                reply, makes the next send unconfirmed, returns a failed delivery, or sends a held
#                draft. The app reaches it through its Demo-owned adapter
#                (lib/environment/rehearsal-stand-in.ts); a commit without that adapter refuses
#                sends in the Demo environment, as the starting commit does.
#   model        gives an assistant question an empty plan, so the app's own interpreter answers,
#                and gives an email rewording a revision the app accepts, or one it refuses
# Control hooks for a running rehearsal: node scripts/one-path-rehearsal-control.mjs (its header
# lists every command), or the same functions from scripts/lib/one-path-rehearsal/control.mjs.
#
# EXTENSION POINTS
#   Journey driver (S252)   Add tests/browser/one-path-journey-driver.mjs, modeled on
#                           tests/browser/one-path-smoke-driver.mjs, and run it with --driver. A
#                           driver gets ONE_PATH_REHEARSAL_ORIGIN and ONE_PATH_REHEARSAL_RUN_DIR,
#                           reads <run>/rehearsal.json (role leases, groups, stand-in origin,
#                           files) through readRehearsal, and uses the control functions. Files
#                           named tests/browser/one-path-*-driver.mjs travel with --commit.
#   Candidate-only seeds    scripts/lib/one-path-rehearsal/seeds.mjs lists the seed steps. Built:
#                           recorded cycles for the three leases renewed in RentVine, one fresh
#                           RentVine read so move-out evidence shows as it does day to day, and the
#                           replied lease's sent owner message with an owner reply. Named and not
#                           built until their suites are: the standing agreement (S250) and the
#                           housing assistance fact (S251). Built by S249: the prepared lease's
#                           stored comparison, signature and approved templates. Each goes
#                           through the served app's routes, so a commit without the feature
#                           refuses it. The forms seed module tests/browser/one-path-forms-seed.mjs
#                           (S253) writes the emulator directly, so it is the served commit's own
#                           file: it is loaded when that commit has it, called as
#                           seedOnePathForms(database, { leases }), and never travels with
#                           --commit. A seed a commit cannot take is reported in rehearsal.json
#                           and the run carries on.
#   Litmus session (S254)   Start --serve on the candidate, run the handoff's checks in a browser
#                           at the printed origin, and use the control hooks where a check names a
#                           stand-in. Stop it, then start --serve --commit <starting commit> for
#                           the checks that name the starting commit (L11, L24): one rehearsal
#                           serves at a time. The refused-connection log answers L58.
#   Temporary files (L71)   The worktree and emulator data live under /tmp and are removed when
#                           the run ends. Screenshots, helpers and notes a session makes belong in
#                           a directory from mktemp -d (or in the run directory), never in the
#                           repository; remove them at the end and say so in the report. The
#                           report itself is the only file that goes to Git.
set -euo pipefail
repo=$(git rev-parse --show-toplevel)
if [[ "$repo" == /app ]]; then
  echo "The one-path rehearsal runs from a host checkout; the kernel-isolated lane has no entry for it." >&2
  exit 2
fi
overlay=false
commit=""
driver_file=""
args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --overlay) overlay=true ;;
    --commit) commit="${2:?--commit needs a commit}"; shift ;;
    --serve | --no-seeds | --no-mail-adapter | --hold-automatic-comparison) args+=("$1") ;;
    --driver) driver_file="${2:?--driver needs a file}"; args+=("$1" "$2"); shift ;;
    --serve-for) args+=("$1" "${2:?--serve-for needs seconds}"); shift ;;
    --) shift; args+=(-- "$@"); break ;;
    *) echo "Unknown option: $1 (see the header of this script)." >&2; exit 2 ;;
  esac
  shift
done
head_sha=$(git -C "$repo" rev-parse HEAD)
named=false
if [[ -n "$commit" ]]; then
  if $overlay; then
    echo "--overlay applies to the current tree. With --commit the harness files of this checkout are always laid over the named commit." >&2
    exit 2
  fi
  served=$(git -C "$repo" rev-parse --verify --quiet "$commit^{commit}") || {
    echo "This repository has no commit $commit." >&2
    exit 2
  }
  named=true
else
  served=$head_sha
  dirty=false
  if ! git -C "$repo" diff --quiet HEAD -- . || [[ -n "$(git -C "$repo" ls-files --others --exclude-standard -- app components lib public scripts tests)" ]]; then
    dirty=true
  fi
  if $dirty && ! $overlay; then
    echo "The working tree differs from HEAD $head_sha. Commit first, or pass --overlay (recorded in the run)." >&2
    exit 2
  fi
fi
# The files a named commit is served with: the rehearsal's own helpers, the provider boundary, the
# fixture and the drivers. Nothing under app, components or lib is in this list, and neither is a
# seed module that writes a commit's own document shapes (tests/browser/one-path-*-seed.mjs).
harness_files() {
  (
    cd "$repo"
    for path in scripts/run-renewal-one-path-rehearsal.sh scripts/one-path-rehearsal.mjs \
      scripts/one-path-rehearsal-control.mjs scripts/lib/browser-executable.mjs \
      scripts/lib/help-rehearsal-origin.mjs tests/browser/renewal-novdec-journey-network.mjs \
      tests/fixtures/lease-renewal/november-5-mix.json; do
      if [[ -f "$path" ]]; then echo "$path"; fi
    done
    find scripts/lib/one-path-rehearsal -type f 2>/dev/null || true
    find tests/browser -maxdepth 1 -type f -name 'one-path-*-driver.mjs' 2>/dev/null || true
    # A driver named on the command line travels too.
    if [[ -n "$driver_file" && -f "$driver_file" ]]; then echo "${driver_file#./}"; fi
  ) | sort -u
}
run_id="$(date -u +%Y%m%dT%H%M%SZ)-${served:0:8}$($overlay && echo -overlay || true)$($named && echo -named || true)"
state="$HOME/.local/state/pmi-kc-one-path-rehearsal"
output="$state/$run_id"
mkdir -p "$output"
chmod 700 "$state" "$output"
root=$(mktemp -d /tmp/pmi-kc-one-path-rehearsal-XXXXXX)
cleanup() {
  git -C "$repo" worktree remove --force "$root/worktree" >/dev/null 2>&1 || true
  rm -rf "$root"
}
trap cleanup EXIT
git -C "$repo" worktree add --detach "$root/worktree" "$served" >/dev/null
# Turbopack compiles only inside the workspace root, so node_modules is a hard-linked copy (same
# filesystem, no extra bytes). A marker lets the run prove nothing wrote into the shared files.
cp -al "$(readlink -f "$repo/node_modules")" "$root/worktree/node_modules"
touch "$root/node-modules-marker"
copy_in() {
  while read -r file; do
    if [[ -f "$repo/$file" ]]; then
      mkdir -p "$root/worktree/$(dirname "$file")"
      cp "$repo/$file" "$root/worktree/$file"
    fi
  done
}
harness_dirty=false
if $named; then
  harness_files | copy_in
  if [[ -n "$(cd "$repo" && { git diff --name-only HEAD -- $(harness_files); git ls-files --others --exclude-standard -- $(harness_files); })" ]]; then
    harness_dirty=true
  fi
elif $overlay; then
  (cd "$repo" && { git diff --name-only HEAD; git ls-files --others --exclude-standard; } | sort -u) | copy_in
  (cd "$repo" && git diff --name-only --diff-filter=D HEAD) | while read -r file; do
    rm -f "$root/worktree/$file"
  done
fi
free_port() {
  node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'
}
firestore_port=$(free_port)
auth_port=$(free_port)
config="$root/firebase.json"
node -e 'const fs=require("fs");const [cfg,fsPort,authPort,cwd]=process.argv.slice(1);fs.writeFileSync(cfg,JSON.stringify({firestore:{rules:cwd+"/firestore.rules",indexes:cwd+"/firestore.indexes.json"},emulators:{singleProjectMode:true,firestore:{host:"127.0.0.1",port:Number(fsPort)},auth:{host:"127.0.0.1",port:Number(authPort)},ui:{enabled:false}}}))' "$config" "$firestore_port" "$auth_port" "$root/worktree"
printf '{"run_id":"%s","served_sha":"%s","harness_sha":"%s","overlay":%s,"named_commit":%s,"harness_uncommitted":%s,"firestore_port":%s,"auth_port":%s,"args":"%s"}\n' \
  "$run_id" "$served" "$head_sha" "$overlay" "$named" "$harness_dirty" "$firestore_port" "$auth_port" "${args[*]:-}" >"$output/run.json"
cd "$root/worktree"
quoted=""
[[ ${#args[@]} -gt 0 ]] && quoted=$(printf ' %q' "${args[@]}")
# A browser started here is headless; a stale desktop display must not reach it.
unset DISPLAY WAYLAND_DISPLAY
# The rehearsal process (stand-ins, seeding, the browser) loads the same refusal preload as the
# server: loopback only, every other connection refused and logged.
ONE_PATH_REHEARSAL_OUTPUT="$output" ONE_PATH_REHEARSAL_SERVED_SHA="$served" \
  ONE_PATH_REHEARSAL_HARNESS_SHA="$head_sha" ONE_PATH_REHEARSAL_OVERLAY="$overlay" \
  ONE_PATH_REHEARSAL_NAMED_COMMIT="$named" \
  FIRESTORE_EMULATOR_HOST="127.0.0.1:$firestore_port" FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:$auth_port" \
  NOVDEC_JOURNEY_NETWORK_LOG="$output/harness-network.jsonl" \
  npx firebase emulators:exec --only firestore,auth --project pmi-kc-kb-one-path-rehearsal-test --config "$config" \
  "node --import ./tests/browser/renewal-novdec-journey-network.mjs scripts/one-path-rehearsal.mjs --managed$quoted" 2>&1 | tee "$output/rehearsal.log"
status=${PIPESTATUS[0]}
changed=$(find "$root/worktree/node_modules" -type f -newer "$root/node-modules-marker" -links +1 2>/dev/null | head -20)
if [[ -n "$changed" ]]; then
  echo "shared node_modules files changed during the run:" | tee -a "$output/rehearsal.log"
  echo "$changed" | tee -a "$output/rehearsal.log"
  status=1
fi
echo "evidence: $output"
exit "$status"
