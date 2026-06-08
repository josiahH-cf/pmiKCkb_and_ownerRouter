# Loop State

Single-read resume artifact for the unattended feature loop. Read this first. It is the
always-current pointer; `docs/status.md` is the append-only history. If the two disagree,
`docs/status.md` wins and this file is corrected.

Keep this file short, non-secret, and current. Update it at the start of a cycle, at each
slice boundary, and whenever a blocker, approval gate, or stop-and-reset condition
changes. See `docs/autonomous-agent-runner.md` for the loop, verification/falsification,
continuation, and stop-and-reset rules.

## Snapshot

- Last updated: 2026-06-08
- Active product lane: PMI KC KB (workflow-control layer)
- Loop status: Stopped — migration-ready but client-blocked
- Recommend fresh context window: not required; safe to resume from this file

## Migration Readiness

- State: migration-ready but client-blocked
- Evidence: `bash scripts/verify.sh` green on 2026-06-06 (229 unit tests, 20 Firestore
  rules tests); cutover/preflight artifacts present (`npm run preflight:production`,
  `docs/client-production-cutover.md`, source-corpus manifests)
- Implication: per the Migration-Readiness Stop Gate, do not add new speculative local
  product surface. Route to client unblock, cutover prep, docs, or regression hardening.

## Last Completed Slice

- Workflow Return/Revision Dev Cycle (2026-06-06): process-definition return/revision
  handling, returned-item resubmission behavior, and a read-only Recent Simulation Runs
  panel on `/processes`. Followed by the Migration-Readiness Stop Guardrail Context
  Update, which propagated the stop gate across the active routing/runner/docs.
- Status: built, verified, doc-aligned. No commit/push performed by that cycle.

## Last-Known-Green Verification

- 2026-06-08 (loop-hardening pass): `npm run format:check`, `npm run lint`,
  `npm run typecheck`, `npm test` (243 tests), `npm run verify:router-boundary`,
  `npm run verify:falsification` (246 files), `npm run build`, and `git diff --check` all
  passed. `bash scripts/verify.sh` and `npm run test:firestore` were not re-run this pass;
  every step `verify.sh` chains except `npm ci` and the Firestore emulator was run
  individually.
- 2026-06-06: `bash scripts/verify.sh` passed (format, lint, typecheck, 229 tests, router
  boundary, build); `npm run test:firestore` passed (20 rules tests).
- Re-run after any change in this loop; record new results here and in `docs/status.md`.

## Last Falsification Result

- 2026-06-08: `npm run verify:falsification` passed across 246 committable files (no
  secrets, oversized files, invalid JSON, or broken internal doc links). Self-review of
  the loop-hardening changes found no rule violations, stale commands, or broken
  cross-references; the gitignored `docs/client_docs/` credential leak is excluded from
  committable files by design. Treat this as the baseline falsification result.

## Next Safe Slice Candidates

Ranked. Choose per the Multi-Slice Continuation Loop and Stop-And-Reset rules.

1. Client unblock / cutover handoff (preferred). The remaining blockers are client-owned,
   so the highest-value safe work is preparing and tightening the client unblock and
   cutover handoff, not new local feature surface. See `docs/client-checklist.md`.
2. Reconcile newly arrived tool-access answers. `docs/client_docs/` now contains the
   returned tool-access spreadsheet (RentVine, LeadSimple, DotLoop, QuickBooks, Boom,
   Google Sheets). Update `docs/client-checklist.md` and `docs/research-backlog.md` to
   mark the tool-access ask as partially answered, recording only non-secret references.
   See the Security Note below before touching that file.
3. Regression hardening / docs alignment only. Safe if it fixes a real regression or
   stale doc; otherwise deferred by the stop gate.

Deferred (blocked by the stop gate unless tied to cutover/acceptance/quality): the
process-definition Activity / revision-history view that surfaces Approval Queue return
reasons on the process detail page. This was the prior "next local slice" idea but is now
deferred because remaining blockers are client-owned.

## Active Blockers And Exact Client Asks

All client-owned (tracked in `docs/client-checklist.md` and `docs/research-backlog.md`):

- Google Cloud billing card + explicit approval for any cost-bearing migration step.
- Lease Renewal walkthrough (target Wed Jun 17 2026, 9:30-10:15 AM; fallbacks Jun 17-18).
- Tool-access answers — PARTIALLY RECEIVED in `docs/client_docs/` (still needs QuickBooks;
  confirm which Google Sheets are in scope).
- Signed lease / lease-end-date source location.
- Gmail Inbox 0 safe test-thread protocol confirmation.
- Approval sender (`kb-automation@pmikcmetro.com`) and launch approver defaults
  (Dan + Josiah) — confirm or correct.

## Pending Approval Gates

None active. The next cost-bearing or external step (billing, deploy, live import, Gmail
access, system-of-record writes) requires an explicit approval request and a user
confirmation that the matching Dan/team reply has unblocked that exact action.

## Stop-Condition State

- Fired: Migration readiness reached — local verification green, cutover/preflight
  artifacts current, client asks clear, remaining blockers client-owned.
- Recommended next action: client unblock / cutover prep, or reconcile the newly arrived
  tool-access answers (non-secret references only). Do not expand local product surface
  to keep the loop active.

## Commit Queue Status

- No pending commit queue. The 2026-06-08 loop-hardening changes are documentation, one
  read-only verification helper script, and one test; group them as a single
  "autonomous loop hardening" change set. Do not commit, push, or merge without an
  explicit request.

## Security Note

`docs/client_docs/` is gitignored and must never be committed (it holds client
spreadsheets, rent ledgers, invoices, and tool-access records). The returned tool-access
spreadsheet currently contains live RentVine API credentials in a notes cell; those must
be rotated by the client and stored outside the repo. Record only non-secret references
(tool name, access type, owner, location label) in tracked docs.

## Resume Here

1. Read this file, then `docs/autonomous-agent-runner.md` and the latest `docs/status.md`
   entry.
2. If the trigger is "plan the next feature cycle", produce a decision-complete packet
   and stop. If the trigger authorizes running the loop, proceed unattended.
3. Honor the stop gate: prefer client unblock / cutover / docs / regression work over new
   local product surface while blockers are client-owned.
4. Update this file at each slice boundary.
