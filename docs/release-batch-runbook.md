# Batched release runbook

One candidate ships every queued feature. Written 2026-09-20, while production is undeployable
because billing is disabled on `pmi-kc-kb-prod` (`docs/facts.md` F-BILLING-INCIDENT). Nothing here
has run. Read `docs/loop-state.md` for the live queue and `docs/environment-handoff.md` for the
per-phase release contract this runbook sequences.

## What ships

The thirteen features in the Awaiting release queue are cumulative commits on `main`, so the current
head already contains all of them. One candidate carries the whole set.

| #   | Suite      | What it adds                                                |
| --- | ---------- | ----------------------------------------------------------- |
| 1   | S128 (F08) | Pause operating-Sheet writes; ships with the flag false     |
| 2   | S123 (F02) | Retain unfinished renewals across source date changes       |
| 3   | S124 (F03) | Move-out detection and non-renewal outreach filtering       |
| 4   | S134 (F14) | Color-coded lease status with matching sorting and filters  |
| 5   | S122 (F01) | All-lease visibility and explicit worklist views            |
| 6   | S125 (F04) | Thirty-day notice timing review with an explicit date basis |
| 7   | S126 (F06) | Consistent month/day/year date presentation                 |
| 8   | S127 (F07) | Clear blockers and exact next-action guidance               |
| 9   | S131 (F11) | Rhino-policy conditional logic, ready for approved material |
| 10  | S129 (F09) | Owner and tenant draft workflows, technical readiness       |
| 11  | S130 (F10) | Seven-template intake and Dotloop prefill readiness         |
| 12  | S132 (F12) | End-to-end walkthrough preparation and meeting evidence     |
| 13  | S133 (F13) | External maintenance-agent handoff assessment               |

Exact heads, CI run ids and per-feature evidence stay in `docs/loop-state.md` and `docs/facts.md`.

## Why one candidate instead of thirteen

Each release cycle is one Cloud Build, one candidate revision, candidate assurance, promotion and a
300,000 ms observation, about forty-five to sixty minutes. The watcher releases the newest green
`main` SHA, not one queue entry at a time, so thirteen separate cycles would rebuild the same
cumulative tree thirteen times for no added evidence. Batching keeps one build, one candidate, one
promotion and one observation. It also keeps one authorized-domain swap instead of thirteen.

What batching does not change: every per-phase gate still runs on this candidate, and a failure
rolls the whole batch back to the captured predecessor. That is the tradeoff to accept knowingly.
If a later observation fails, the whole set reverts together and is diagnosed as one candidate.

## Before you start

Do these in order. Step 3 starts an authentication clock that has expired in under nine hours, so
leave it until you are ready to run.

**1. Re-enable billing (owner only).** The runner never changes billing. Re-enable it on
`pmi-kc-kb-prod` in the console, then read it back and confirm the cost controls are unchanged:

```bash
gcloud beta billing projects describe pmi-kc-kb-prod --format="value(billingEnabled,billingAccountName)"
```

Expect `True` and account `01A5A3-65CA5A-614D45`. The project hard stop and the guardrail cap are
both 100 USD (`docs/budget-and-cost-policy.md`); the guardrail disables billing again at that cap, so
confirm the spend that triggered this incident is understood before deploying.

**2. Reset the stale watcher checkpoint.** This is the step that makes the batch a batch. The
watcher deploys the SHA its own checkpoint names while that checkpoint is unfinished. The current
checkpoint is an unfinished `prepare` at `0bbd95c3`, the S128 docs commit, so an unmodified start
would deploy S128 alone and leave twelve features queued. Archive it with its reason and leave a
checkpoint that states the last completed release truthfully. The preflight in step 4 prints the
SHA the checkpoint actually holds; if it is not `0bbd95c3`, substitute it in both filenames and in
the reason text below before running these, and run the preflight first to read it:

```bash
cd ~/.local/state/pmi-kc-release
cp checkpoint.json checkpoint-0bbd95c3dbd8f4a93b4b185b8ba09770170d1ca4-reset-for-batched-release.json
cat > checkpoint-0bbd95c3dbd8f4a93b4b185b8ba09770170d1ca4-reset-for-batched-release.json.reason.json <<JSON
{"reason":"Unfinished prepare at the S128 docs commit never deployed; it is superseded by the batched release of the current main head. No assurance, promotion or observation is claimed for it.","recordedAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
JSON
cat > checkpoint.json <<'JSON'
{
  "sha": "79493458f641b9710d8c43467e872aa9acf7948e",
  "phase": "complete",
  "lastDeployedSha": "79493458f641b9710d8c43467e872aa9acf7948e",
  "revision": "pmi-kc-app-rmu4wevd9-d89996133320",
  "tag": "cand-rmu4wevd9-d89996133320",
  "candidateOrigin": "https://cand-rmu4wevd9-d89996133320---pmi-kc-app-kq6wuvpiva-uc.a.run.app"
}
JSON
```

These exact commands were dry-run in a scratch directory on 2026-09-20: the archive keeps the
unfinished `prepare` verbatim, the reason file carries a real UTC timestamp, and the replacement
parses. The real state directory was not touched.

That states what is true: the last release that completed was S120 at `79493458`, serving
`pmi-kc-app-rmu4wevd9-d89996133320`. The watcher then seeds a fresh checkpoint at the current head,
carries `79493458` forward as the diff baseline, and drops the right candidate host from the
authorized-domain list during its `domains` phase. The earlier wedged S128 backup already in that
directory stays untouched.

**3. Re-enroll WSL authentication (owner only, attended).** In WSL, in the repository:

```bash
npm run auth:enroll:wsl -- --attended --account=josiah@pmikcmetro.com
```

The runner never types credentials. An enrollment that expires mid-observation pauses a required
rollback on `authentication_required` until you re-enroll, and production keeps serving the
candidate while it waits.

**4. Confirm readiness.** From the repository, in WSL:

```bash
npm run release:batch-preflight -- --billing-re-enabled
```

Expect `GO`, `watcher_target` reading the current head, and thirteen features in the batch. It reads
the exact-SHA CI run through the GitHub CLI; if it cannot, it says so and refuses `GO` rather than
assuming a green run. Anything still outstanding is printed with the exact action. The check is
read-only: it runs no cloud command and writes nothing.

## Run it

Start the watcher natively. Never use the Windows-mounted Cloud SDK: through the interop path each
gcloud read takes twenty-five to forty-five seconds, which exhausted a whole 420,000 ms observation
window on 2026-09-16 and forced a verified rollback.

```bash
cd /mnt/c/Users/josia/Documents/github-windows/pmiKCkb_and_ownerRouter
export PATH=/snap/google-cloud-cli/current/bin:/home/josiah/.local/opt/node-v22.23.2-linux-x64/bin:$PATH
LOGS=/mnt/c/Users/josia/AppData/Local/PMI-KC/release-watcher
mkdir -p "$LOGS"
flock --nonblock ~/.local/state/pmi-kc-release/release.lock -c true && echo "lock free"
nohup setsid node scripts/release-watcher.mjs --watch \
  >> "$LOGS/native-status-batch.log" 2>> "$LOGS/native-errors-batch.log" < /dev/null &
```

`lock free` must print before you continue: it means no other watcher holds the lock. Use
`npm run release:watch:dry-run` beforehand to print one decision without acting, and
`npm run release:watch:once` for a single real pass.

The watcher then runs, in order, and re-reads state after every effect: `prepare`, `deploy`,
`smoke`, `fingerprint`, `domains`, `assurance`, `promote`, `observe`, `complete`. It refuses any head
without its own green push CI, and documentation-only commits never deploy.

## While it runs

Follow the status lines in `native-status-batch.log`. Each is a JSON object with `sha`, `phase` and
any `blocked` reason. Expect roughly forty-five to sixty minutes end to end, most of it in the build
and the 300,000 ms observation.

## If a phase fails

- **Verified rollback.** Traffic returns to the captured predecessor and the checkpoint goes
  terminal. Keep the receipts, reports and checkpoint exactly as written; never relabel a failed
  attempt as a pass. Push a new head to start a fresh attempt.
- **`authentication_required`.** Your enrollment expired. Re-enroll as in step 3. A held rollback
  executes as soon as authentication returns.
- **`release_phase_unverified` on `domains` right after a re-enrollment.** A long-lived watcher can
  hold a stale Identity Platform client. Stop the idle process, confirm the lock is free, and
  relaunch on the same lock with a new log tag.
- **`assurance_unverified` repeating.** Stop the watcher between passes, then run the production
  canary manually against the candidate origin with its own report path. Never run the canary while
  the watcher may be mid-pass: both use the same Admin browser profile.
- **`NOT_FOUND` after a successful build.** Transient. Confirm no revision was created and re-run the
  same command.
- **Sheet pause.** A rollback target whose write flag is not false is redeployed from its own image
  with the flag forced false rather than receiving traffic as-is. The pause survives a rollback.

## After it completes

1. Readbacks: `bash ~/pmi-kc-work/scripts/s120-readbacks.sh <head-sha> <revision>` in WSL. It prints
   canonical and tagged `/api/version`, traffic, revision env by name, builds, the receipts summary,
   the checkpoint and the authorized-domain names. Never print the raw Identity Platform config; it
   carries a signer key.
2. Confirm the authorized-domain list holds exactly one candidate entry. If the superseded host was
   already absent, remove the leftover by hand rather than leaving two.
3. Confirm the revision env shows `ENVIRONMENT_KIND=production`, `DATA_CONTEXT=live`,
   `ASK_DEMO_MODE=false` and `LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED=false`.
4. Record the result in `docs/facts.md` (serving SHA, revision, fingerprint, receipts, complete-at
   time from the checkpoint file mtime converted to UTC), `docs/loop-state.md` (clear the Awaiting
   release queue), `docs/status.md`, `docs/plan.md` and `docs/environment-handoff.md`.
5. Re-run the two pinned tests after those edits: `environment-handoff-provider-table` and
   `plan-status-sync` both assert the serving revision and commit. Then prettier, the four document
   gates, a documentation-only commit and a push. The watcher logs `documentation_only` for it and
   does not deploy.

## What this release does not do

It ships no new capability that was previously blocked on an external input. Operating-Sheet writes
stay paused. No message is sent; drafts stay drafts. Dotloop stays unconnected and its action keys
stay closed, so B-DL1, B-DL2 and B-DL3 remain open, as do B-S100, B-MNT1 and the new B-MNT2. The
compiled browser smokes and every human verdict remain NOT RUN until someone runs them against the
promoted revision.
