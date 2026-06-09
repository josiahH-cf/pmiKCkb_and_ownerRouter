# Loop State

Single-read resume artifact for the unattended feature loop. Read this first. It is the
always-current pointer; `docs/status.md` is the append-only history. If the two disagree,
`docs/status.md` wins and this file is corrected.

Keep this file short, non-secret, and current. Update it at the start of a cycle, at each
slice boundary, and whenever a blocker, approval gate, or stop-and-reset condition
changes. See `docs/autonomous-agent-runner.md` for the loop, verification/falsification,
continuation, and stop-and-reset rules.

## Snapshot

- Last updated: 2026-06-09
- Operating mode: AWAY MODE active (see `docs/away-mode.md`) — owner on vacation, expected
  return ~2026-06-16; spend nothing (~$10 cap), queue approvals for return, do not ping.
  Restore full openness via the Return Checklist in `docs/away-mode.md`.
- Active product lane: Cross-product readiness/quality hardening (away-mode safe backlog)
- Loop status: Running the away-mode safe backlog (see `docs/away-mode.md`). Still
  migration-ready and client-blocked for all cost/cloud/external work; client-unblock
  items are queued for return because they cannot progress while the owner is away.
- Recommend fresh context window: not required; safe to resume from this file

## Migration Readiness

- State: migration-ready but client-blocked
- Evidence: `bash scripts/verify.sh` green on 2026-06-06 (229 unit tests, 20 Firestore
  rules tests); cutover/preflight artifacts present (`npm run preflight:production`,
  `docs/client-production-cutover.md`, source-corpus manifests)
- Implication: per the Migration-Readiness Stop Gate, do not add new speculative local
  product surface. Route to client unblock, cutover prep, docs, or regression hardening.

## Last Completed Slice

- Away-Mode Enablement + Entrypoint-Guard Hardening (2026-06-09): added the reversible
  away-mode overlay, the durable `$10` budget policy and `npm run check:budget-guard`
  preflight, CI guard step, and `.gitignore` hardening; then enabled the away-mode safe
  backlog and ran its first slice — guarded the `process.argv[1]` entrypoint check across
  all `scripts/*.mjs|ts` so the cost/tooling scripts are safe to import dynamically.
  Verified green and pushed to the `work/` branch. No cloud, Gmail, credential, deploy,
  import, send, or external-system action.
- Client Unblock / Tool-Access Reconciliation (2026-06-09): reconciled the returned
  ignored tool-access spreadsheet into tracked non-secret docs. `docs/client-checklist.md`,
  `docs/research-backlog.md`, and `docs/environment-handoff.md` now mark tool access as
  partially received: RentVine, LeadSimple, DotLoop, Boom, and Google Sheets have
  non-secret access/location answers; QuickBooks remains blank; Google Sheets exact
  scope still needs confirmation. Added RentVine credential rotation as an explicit
  client ask because a credential appeared in spreadsheet notes. Created an ignored
  local follow-up draft in `docs/temp/`; no external communication was sent.
- Status: docs reconciled and verified. No code/runtime, cloud, Gmail, credential use,
  client-resource, deploy, import, send, or external-system write was performed.
- Integration Architecture + Action Registry Foundation (2026-06-08): ratified the
  verified tool-stack research into `docs/integration-architecture.md` and
  `docs/research/integration-capability-2026-06.md`, propagated downstream effects across
  governance/product/pipeline docs, and built the metadata-only Action Registry
  (constants, `ActionRegistryRecord` type + Zod schema with a `production_allowed`
  governance refine, read-only `lib/firestore/action-registry.ts`, typed seed catalog,
  `scripts/seed-action-registry.ts` + `npm run seed:action-registry`, server-write-only
  `action_registry` Firestore rule, and tests). Every seeded entry is
  `production_allowed: false`; no external write paths were added.
- Decisions: Maintenance Work Order Intake is the first executable-write target; the
  Rentvine lease-renewal writeback is undocumented and stays gated; Sheets is an
  exception surface, not a source of truth.
- Status: built and doc-aligned. No commit/push performed by this cycle.
- Prior slice: Workflow Return/Revision Dev Cycle (2026-06-06): process-definition
  return/revision handling, returned-item resubmission behavior, and a read-only Recent
  Simulation Runs panel on `/processes`.

## Last-Known-Green Verification

- 2026-06-09 (away-mode enablement + entrypoint-guard hardening): `npm run format:check`,
  `npm run lint`, `npm run typecheck`, `npm test` (270 tests), `npm run test:firestore`
  (23 rules tests, Java 21 present), `npm run verify:router-boundary`,
  `npm run verify:falsification` (258 committable files), `npm run build`, and
  `npm run check:budget-guard` (demo posture, away mode active, $10 cap) all passed.
- 2026-06-09 (client unblock / tool-access reconciliation docs pass):
  `npm run format:check`, `git diff --check`, `npm run verify:router-boundary`, and
  `npm run verify:falsification` (254 committable files) all passed. Runtime checks were
  not run because this was a tracked-doc-only reconciliation.
- 2026-06-08 (integration architecture + Action Registry pass): `npm run typecheck`,
  `npm run lint`, `npm run format:check`, `npm test` (257 tests),
  `npm run test:firestore` (23 rules tests), `npm run seed:action-registry -- --dry-run`
  (9 entries, all `production_allowed: false`, no writes), `npm run verify:falsification`
  (254 files), `npm run verify:router-boundary`, and `npm run build` all passed. Full
  `bash scripts/verify.sh` was not re-run as one command this pass; every step it chains
  except `npm ci` was run individually.
- 2026-06-06: `bash scripts/verify.sh` passed (format, lint, typecheck, 229 tests, router
  boundary, build); `npm run test:firestore` passed (20 rules tests).
- Re-run after any change in this loop; record new results here and in `docs/status.md`.

## Last Falsification Result

- 2026-06-09: `npm run verify:falsification` passed across 254 committable files. The
  ignored `docs/client_docs/` and `docs/temp/` files remain excluded from committable
  checks by design; tracked docs record only non-secret summaries.
- 2026-06-08: `npm run verify:falsification` passed across 246 committable files (no
  secrets, oversized files, invalid JSON, or broken internal doc links). Self-review of
  the loop-hardening changes found no rule violations, stale commands, or broken
  cross-references; the gitignored `docs/client_docs/` credential leak is excluded from
  committable files by design. Treat this as the baseline falsification result.

## Next Safe Slice Candidates

While away mode is active, work the **Safe Backlog While Away** in `docs/away-mode.md`
top-down (entrypoint-guard hardening is done; next is test-coverage gaps, then regression
sweeps, then dry-run cutover tooling, then docs hygiene). Each slice is
quality/readiness only, verified, committed and pushed to the `work/` branch, with no
cost/cloud/external action. When that backlog is exhausted and verification is green, stop
and wait for return.

Queued for return (cannot progress while the owner is away):

1. Client unblock / cutover handoff. The remaining blockers are client-owned, so this is
   on-return work, not an away-mode slice. See `docs/client-checklist.md`.
2. Client follow-up draft review. An ignored draft exists at
   `docs/temp/2026-06-09-tool-access-follow-up.md`; sending or posting it is an external
   communication and needs explicit user/client approval.
3. Process-definition Activity / revision-history view (surfaces Approval Queue return
   reasons on the process detail page). Deferred by the stop gate as new product surface;
   revisit on return unless it becomes tied to cutover/acceptance/quality.

## Active Blockers And Exact Client Asks

All client-owned (tracked in `docs/client-checklist.md` and `docs/research-backlog.md`):

- Google Cloud billing card + explicit approval for any cost-bearing migration step.
- Lease Renewal walkthrough (target Wed Jun 17 2026, 9:30-10:15 AM; fallbacks Jun 17-18).
- QuickBooks access status/location — blank in the returned tool-access spreadsheet.
- Google Sheets exact in-scope sheet list and owner confirmation.
- RentVine credential rotation — a credential appeared in ignored spreadsheet notes and
  must be rotated/stored outside the repo before future use.
- Signed lease / lease-end-date source location.
- Rentvine lease-renewal-write endpoint confirmation — undocumented in the public API;
  vendor confirmation required before any renewal writeback (see
  `docs/integration-architecture.md`).
- Source-vocabulary normalization — freeze canonical stage/system/record-ID/approval names
  (legacy Propertyware vs Rentvine "RV") before any live connector work.
- Gmail Inbox 0 safe test-thread protocol confirmation.
- Approval sender (`kb-automation@pmikcmetro.com`) and launch approver defaults
  (Dan + Josiah) — confirm or correct.

## Pending Approval Gates

None active. The next cost-bearing or external step (billing, deploy, live import, Gmail
access, system-of-record writes) requires an explicit approval request and a user
confirmation that the matching Dan/team reply has unblocked that exact action.

## On-Return Review Queue

Away mode is active (`docs/away-mode.md`). Instead of pinging the owner during the
vacation window, accumulate anything that needs a human decision here for the on-return
review, then continue with safe local work or stop cleanly.

- Away mode state: ACTIVE; activated 2026-06-09; expected return ~2026-06-16; review-by
  2026-06-20. Budget cap $10; no live cloud spend (billing unprovisioned).
- (No new items queued this cycle.) All existing client-owned asks remain tracked in
  `docs/client-checklist.md` and the Active Blockers section above; do not re-raise them
  as approval pings while away.
- On return: work the Return Checklist in `docs/away-mode.md`, then clear this queue.

## Stop-Condition State

- Active: Running the away-mode safe backlog (`docs/away-mode.md`). Migration readiness
  remains reached (verification green, cutover/preflight artifacts current, client asks
  clear, remaining blockers client-owned); the loop is doing bounded quality/readiness
  work only, not expanding product surface.
- Stop when: the safe backlog is exhausted with verification green, or any away-mode stop
  condition fires (a step needs cost/cloud/external/approval). Then wait for return; do not
  invent product surface to keep the loop active.
- Recommended next action: continue the away-mode safe backlog; route client unblock /
  cutover prep to the on-return queue.

## Commit Queue Status

- Pending doc-only commit queue: group the 2026-06-09 tool-access reconciliation as
  "client unblock tool-access reconciliation." It includes tracked updates to
  `docs/client-checklist.md`, `docs/research-backlog.md`, `docs/environment-handoff.md`,
  `docs/status.md`, and this file. The ignored `docs/temp/` follow-up draft is local
  scratch and is not part of the commit queue. Do not commit, push, or merge without an
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
