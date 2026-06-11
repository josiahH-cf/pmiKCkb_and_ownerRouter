# Loop State

Single-read resume artifact for the unattended feature loop. Read this first. It is the
always-current pointer; `docs/status.md` is the append-only history. If the two disagree,
`docs/status.md` wins and this file is corrected.

Keep this file short, non-secret, and current. Update it at the start of a cycle, at each
slice boundary, and whenever a blocker, approval gate, or stop-and-reset condition
changes. See `docs/autonomous-agent-runner.md` for the loop, verification/falsification,
continuation, and stop-and-reset rules.

## Snapshot

- Last updated: 2026-06-11
- Operating mode: REMOTE AWAY MODE active (see `docs/away-mode.md`) — owner may be
  remote, but future models should continue significant product, migration, and API/setup
  work when it is reversible, non-breaking, and budget-guarded under the ~$10 cap.
- Active product lane: Cross-product migration/setup and product-readiness work
- Loop status: Idle — remote-autonomy overlay has been widened. The next run may proceed
  with bounded migration/setup/API work instead of stopping solely because the owner is
  remote. Stop only for hard gates: unmanaged cost, destructive/breaking changes,
  secrets/raw client data, autonomous sends, or unapproved system-of-record writes.
- Recommend fresh context window: not required; safe to resume from this file

## Migration Readiness

- State: migration-ready but client-blocked
- Evidence: `bash scripts/verify.sh` green on 2026-06-06 (229 unit tests, 20 Firestore
  rules tests); cutover/preflight artifacts present (`npm run preflight:production`,
  `docs/client-production-cutover.md`, source-corpus manifests)
- Implication: per the Migration-Readiness Stop Gate, do not add new speculative local
  product surface. Route to client unblock, cutover prep, docs, or regression hardening.

## Last Completed Slice

- Remote Away Mode Autonomy Widening (2026-06-11, user-directed): converted Away Mode
  from local-only vacation posture into a remote-autonomy overlay. Future agents may run
  significant product, migration, and API/setup work when it is reversible, non-breaking,
  budget-guarded, and documented. Hard stops remain for unmanaged cost, destructive or
  hard-to-rollback changes, secrets/raw client data, autonomous sends/live notifications,
  and unapproved system-of-record writes. Updated the budget guard so Away Mode allows
  `--allow-multiple-spaces` for bounded migration/setup with a warning while still
  refusing Pro and live notification-send overrides. No cloud, Gmail, credential, deploy,
  import, send, client-resource, or external-system action was performed.
- Source-Corpus Readiness Dry-Run Hardening (2026-06-11, away-mode safe backlog item #4):
  added a `readiness` object to `npm run corpus:plan` output so production dry-runs flag
  placeholder manifest values, non-Approved source metadata, High-sensitivity entries,
  raw context/call source paths, duplicate Cloud Storage URIs, duplicate derived document
  IDs, and summary counts before any upload/import/metadata command is used. Updated the
  client cutover runbook and implementation notes to require `readiness.ok === true` and
  empty blockers before staging-copy creation, upload, import, or `sources_meta` seeding.
  Verified with focused script tests, full unit tests, Firestore rules tests, build,
  router-boundary, falsification, budget guard, and a dry-run against the production
  manifest template. No cloud, Gmail, credential, deploy, import, send, client-resource,
  or external-system action was performed.
- Bug-Hunt Triage Fixes (2026-06-09, owner-directed): resolved all four bug-hunt
  candidates. (1) Ask answers reject leaked `Needs Verification:` placeholders and the
  prompt scopes the placeholder to draft; (2) disabled/closed/cancelled process-definition
  queue items revert the definition to Draft instead of stranding it in Pending Approval;
  (3) approval-queue refresh notifies the merged (current) approver, keeping the audit
  prior-version snapshot. Each shipped with a test (279 unit tests, Firestore rules tests,
  and build all green). Pushed to the `work/` branch and merged to `main`.
- KB Core Bug-Hunt Sweep (2026-06-09, away-mode safe backlog item #3): ran a read-only
  adversarial sweep over the anti-hallucination, ask-orchestration, and approval/workflow
  paths. Ask orchestration and demo/cost gating are sound. Surfaced four candidate issues
  in sensitive subsystems whose fixes need owner decisions; recorded them in the On-Return
  Review Queue and made no runtime change. The decision-free safe backlog (entrypoint
  guards, page-guard coverage) is now essentially exhausted.
- Auth Page-Guard Test Coverage (2026-06-09, away-mode safe backlog item #2): added
  `tests/unit/page-guards.test.ts` covering the previously-untested `lib/auth/page-guards.ts`
  — capability/role pass-through, 401 redirect to `/sign-in`, 403 redirect to
  `/sign-in?error=forbidden`, and non-auth-error rethrow. No runtime change. Verified green
  (276 tests) and pushed to the `work/` branch.
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

- 2026-06-11 (Remote Away Mode autonomy widening): `npm run check:budget-guard`,
  `npm test -- budget-guard` (15 tests), `npm run format:check`, `npm run lint`,
  `npm run typecheck`, `npm test` (282 tests), `git diff --check`,
  `npm run verify:router-boundary`, and `npm run verify:falsification` (259 files) all
  passed.
- 2026-06-11 (source-corpus readiness dry-run hardening): `npm run check:budget-guard`,
  `npm test -- live-cost-scripts` (26 tests), production-template
  `npm run corpus:plan -- --manifest=docs/source-corpus/client-production-source-manifest.template.json --project=pmikc-kb-production --location=us --dry-run`
  (local dry-run only; readiness blockers printed for placeholders/unreviewed sources),
  `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test` (280 tests),
  `git diff --check`, `npm run verify:router-boundary`, `npm run verify:falsification`
  (259 files), `npm run test:firestore` (23 rules tests), and `npm run build` all passed.
- 2026-06-09 (bug-hunt triage fixes): `npm run format:check`, `npm run lint`,
  `npm run typecheck`, `npm test` (279 tests), `npm run test:firestore` (23 rules tests),
  `npm run build`, `npm run verify:falsification` (259 files), `npm run verify:router-boundary`,
  and `npm run check:budget-guard` all passed.
- 2026-06-09 (auth page-guard test coverage): `npm run format:check`, `npm run lint`,
  `npm run typecheck`, `npm test` (276 tests, 39 files), `npm run verify:falsification`
  (259 files), and `npm run verify:router-boundary` all passed.
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

- 2026-06-11: `npm run verify:falsification` passed across 259 committable files after the
  Remote Away Mode autonomy widening. Self-review found the change widens execution
  posture only through docs and budget-guard logic; no secrets, no client data, no
  cloud/API/Gmail action, no deploy/import/send, and no system-of-record write was
  performed.
- 2026-06-11: `npm run verify:falsification` passed across 259 committable files after the
  source-corpus readiness hardening slice. Self-review found the change stayed within
  away-mode safe dry-run tooling: no secrets, no client data, no cloud/API/Gmail action,
  no deploy/import/send, and no system-of-record write path.
- 2026-06-09: `npm run verify:falsification` passed across 254 committable files. The
  ignored `docs/client_docs/` and `docs/temp/` files remain excluded from committable
  checks by design; tracked docs record only non-secret summaries.
- 2026-06-08: `npm run verify:falsification` passed across 246 committable files (no
  secrets, oversized files, invalid JSON, or broken internal doc links). Self-review of
  the loop-hardening changes found no rule violations, stale commands, or broken
  cross-references; the gitignored `docs/client_docs/` credential leak is excluded from
  committable files by design. Treat this as the baseline falsification result.

## Next Safe Slice Candidates

Remote Away Mode now allows substantial bounded work. The next run should choose the most
readiness-improving slice from active docs, favoring migration/setup over speculative
surface:

1. Re-run context intake, then select a concrete production-lift or migration/setup slice.
2. Use APIs where useful for reversible setup: Firebase/GCP preflight, API enablement,
   Firestore rules/index preparation, source bucket/data-store planning, scale-to-zero
   deploy prep, approved source import prep, and cheap-live smokes when budget-guarded.
3. Continue product/runtime work when active product docs define scope and tests.
4. Stop only for the hard gates in `docs/away-mode.md`.

## Next Large Remote Run Queue

This queue is intentionally sized for a large-context, long-running model. Do not stop
after one small patch if checks stay green and no hard gate fires. Work top-down, updating
this file and `docs/status.md` at each slice boundary.

1. **Production-lift setup automation.** Build an idempotent setup orchestrator that
   checks/records non-secret GCP/Firebase state, validates billing/budget posture without
   increasing spend, plans API enablement, verifies Firebase app/Auth/domain state, checks
   Firestore database/rules/index readiness, and writes a structured environment handoff
   report. Allowed: read-only API inspection, dry-runs, reversible setup where the budget
   guard passes. Stop for: billing account mutation, quota/cap changes, service-account key
   creation, or any setup that cannot be replayed or rolled back.
2. **Cutover and migration pipeline.** Turn the existing production cutover runbook into
   executable dry-run tooling: manifest readiness, source bucket/data-store plan,
   deploy-command plan, rollback plan, production smoke checklist, and a single
   machine-readable cutover report. Allowed: `corpus:plan`, `preflight:production`,
   cost-guarded multi-Space planning, generated commands, and cheap-live smoke hooks.
   Stop for: raw client source import, real upload/import/indexing that is not approved and
   bounded, or deploy without rollback/cost evidence.
3. **App-owned environment migration.** Prepare scripts and tests for app-owned Firestore
   setup: rules/index deploy prechecks, seed-space/action-registry/source-meta dry-runs,
   migration idempotency checks, and rollback notes. Allowed: emulator-backed tests,
   metadata-only app records, and reversible setup. Stop for: destructive data migration
   or any write to client/system-of-record data.
4. **Production hardening and e2e coverage.** Add mocked-auth browser/e2e coverage for
   Ask, source states, citations, Approval Queue, process definitions, Admin visibility,
   and no-source behavior. Use local/dev servers and browser screenshots where useful.
   This is high-value because it lowers migration risk without touching client data.
5. **KB Admin migration console.** Build only if it stays within current PMI KC KB scope:
   a read-only/preview-first Admin view for environment readiness, source corpus readiness,
   Action Registry readiness, notification posture, and cutover blockers. It must not add
   autonomous sends or external writes.
6. **Lease Renewal Agent foundation, non-executable.** Convert confirmed docs into
   domain models, process-definition templates, fixture data, acceptance scenarios, and
   read/gather fact workflows without RentVine/DotLoop/QuickBooks/Boom/Sheets writes.
   Stop before runtime execution unless product docs define the v1 scope, permissions, and
   acceptance gates.
7. **Gmail Inbox 0 foundation, non-live or safe-thread only.** Mine legacy artifacts,
   define label/rule/prompt models, draft safe-thread test harnesses, and build management
   surfaces that preserve human send authority. Stop before live mailbox read/modify/draft
   unless Dan's safe-thread protocol is confirmed.
8. **Integration readiness expansion.** Expand Action Registry coverage, per-system
   health-check contracts, preview payload schemas, rollback/correction notes, and mocked
   connector tests. Maintenance Work Order Intake remains the first future executable write
   target; Rentvine lease-renewal writeback remains gated as undocumented.

For every batch above, keep generated artifacts non-secret, keep raw client/customer data
out of git, run proportional checks, and commit/push clean batches to `main` when the user
has asked for consolidation.

Queued remote-owner decisions:

1. Client follow-up draft review. An ignored draft exists at
   `docs/temp/2026-06-09-tool-access-follow-up.md`; sending or posting it is an external
   communication and needs explicit user/client approval.
2. Process-definition Activity / revision-history view (surfaces Approval Queue return
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

None active for bounded, reversible migration/setup work that passes the budget guard.
Hard-stop actions still require explicit approval: billing/cap increases, Pro model usage,
autonomous sends, destructive/breaking changes, raw client data/secrets, Gmail mailbox
access, or unapproved system-of-record writes.

## On-Return Review Queue

Remote Away Mode is active (`docs/away-mode.md`). Do not stop merely because the owner is
remote. Accumulate only hard-stop decisions here, continue with non-blocked work, and keep
cost/breaking-risk notes concrete.

- Away mode state: ACTIVE; activated 2026-06-09; converted to Remote Away Mode on
  2026-06-11. Budget cap $10 unless explicitly changed.
- Existing client-owned asks remain tracked in `docs/client-checklist.md`; they block only
  dependent steps, not unrelated product/migration/setup work.
- Bug-hunt sweep candidates (2026-06-09) — TRIAGED AND RESOLVED 2026-06-09 with owner
  go-ahead (all confirmed real; ask orchestration/demo gating was already sound):
  1. Anti-hallucination contract: confirmed via `docs/spec.md` §10.2 that the placeholder
     is draft-only. The Ask answer field now downgrades to "No Reliable Source Found" if a
     `Needs Verification:` marker leaks in, and the prompt scopes the placeholder to draft.
     (`lib/ask/service.ts`, `lib/llm/prompt.ts`)
  2. Workflow sync: disabling/closing/cancelling a process-definition queue item now
     reverts the definition to Draft (Returned still → Needs Revision; Approved untouched),
     so it is no longer stranded in Pending Approval. (`lib/firestore/workflows.ts`)
  3. Approval-queue refresh: refresh now passes the merged item to the notification path
     (audit prior-version snapshot unchanged), so a refreshed approver is notified rather
     than the stale set. Impact was narrow (only the refresh→Blocked notification).
     (`lib/firestore/approval-queue.ts`)
  4. Test gap: covered by new tests in `workflow-foundation`, `ask-service`, and
     `approval-queue-notifications-v1`.
- Remote decision queue: no new hard-stop decision queued by the Remote Away Mode
  conversion. Work the Return Checklist in `docs/away-mode.md` only if you want to remove
  the overlay.

## Stop-Condition State

- Fired: old local-only away-mode stop condition superseded on 2026-06-11 by explicit user
  request. Future runs should not stop just because work involves APIs, migration, setup,
  or client-environment prep. Stop only for the hard gates in `docs/away-mode.md`.
- Recommended next action: start a new feature/migration run from `main`, choose the
  highest-impact bounded setup/product slice, run `npm run check:budget-guard` before any
  live/deploy/import/smoke action, and continue until a real hard stop or quality failure
  fires.

## Commit Queue Status

- Clear: source corpus readiness dry-run hardening was committed as `b652073` and
  fast-forwarded to `main` / `origin/main` on 2026-06-11 by explicit user request. No
  pending commit queue remains.

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
