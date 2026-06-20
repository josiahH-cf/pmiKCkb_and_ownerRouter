# Loop State

Single-read resume artifact for the unattended feature loop. Read this first. It is the
always-current pointer; `docs/status.md` is the append-only history. If the two disagree,
`docs/status.md` wins and this file is corrected.

Keep this file short, non-secret, and current. Update it at the start of a cycle, at each
slice boundary, and whenever a blocker, approval gate, or stop-and-reset condition
changes. See `docs/autonomous-agent-runner.md` for the loop, verification/falsification,
continuation, and stop-and-reset rules.

## Snapshot

- Last updated: 2026-06-20
- 2026-06-20 cycle (hardening + recontextualization): revoked the legacy `cherrybridge.ai`
  gcloud credential (only `josiah@pmikcmetro.com` remains); retired the demo _cloud_ lane —
  neutralized all dead `pmikckb-test` repo pointers AND **deleted the `pmikckb-test` GCP project**
  (DELETE_REQUESTED, ~30-day recoverable) via a one-time ephemeral cherrybridge auth
  (`docs/demo-lane-retirement.md`); fixed BOTH environment-coupled unit tests
  (`migration-readiness`, `cutover-report`) to be hermetic — **387/387 unit tests now pass**;
  reworked the lease-renewal connector write-back to an **admin-enabled, suggest-then-button-press**
  model (no trust auto-write — `docs/products/lease-renewal-connector-design.md` §4.0); and ran a
  doc recontextualization pass (identity/migration, renewal/move-in/move-out, cross-doc ambiguities).
- Operating mode: Normal owner-present coordination. Remote Away Mode is inactive; see
  `docs/away-mode.md`.
- Active product lane: Cross-product migration/setup (PMI KC KB cutover) and the cheap-live
  demo surface
- Loop status: Cheap-live Ask demo WORKING on the new project as of 2026-06-19. Discovery
  this cycle: the old demo stack (`pmikckb-test`) is owned by and auth-locked to the
  **cherrybridge.ai** org (deployed sign-in enforces `allowedHostedDomain=cherrybridge.ai`)
  and is not reusable, so a fresh project was built under the `pmikcmetro.com` org
  (584930494337, same org as the PM billing `01A5A3-65CA5A-614D45`). Provisioned end-to-end by
  the assistant: project `pmi-kc-kb-prod` (number `558870356522`), billing linked + project
  scoped $10 budget alert (`…/budgets/15ddc8d6-…`), 19 APIs, Firestore Native (us-central1) +
  12 seeded spaces, Firebase web app (`1:558870356522:web:c1b2473b886a6edd889953`), Cloud
  Storage source bucket `pmi-kc-kb-prod-sources-558870356522`, Agent Search data store
  `kb-lease-renewals-txt` (3 sanitized demo docs imported), and a passing
  `npm run smoke:ask-live` (`Verified Source` answer, 2 citations). Local app live at
  `http://localhost:3000`.
- DEPLOYED 2026-06-19: shareable Cloud Run demo live at
  `https://pmi-kc-kb-demo-558870356522.us-central1.run.app` (sign-in locked to
  `pmikcmetro.com`, Google provider enabled, `--no-invoker-iam-check` access model for the org
  allUsers policy; runtime/build SA `558870356522-compute@developer.gserviceaccount.com`
  granted datastore/discoveryengine/aiplatform + cloudbuild/run/storage/artifactregistry/logging
  roles). Remaining follow-ups: deploy Firestore rules/indexes (needs `firebase login`); expand
  the live corpus beyond the single `lease-renewals` space if desired. Cutover _completion_
  still source-blocked (approved client sources). Spend stayed well under the $10 cap. Packet:
  `docs/temp/2026-06-19-gcp-billing-unblock-cutover-resume.md`.
- Recommend fresh context window: not required; safe to resume from this file
- **Next slice — "continue with feature development":** build the next zero-cost, deterministic
  Phase-1 lease-renewal unit per [`products/lease-renewal-build-plan.md`](products/lease-renewal-build-plan.md)
  §3 (start with the Action Registry `renewal_checklist.{read,reconcile,writeback}` entries, then the
  `lib/lease-renewal/` ingest/normalize/fingerprint/headers/join/severity/reconciliation/queue-mapping
  modules with synthetic fixtures). Done-state, open-questions/blockers register, and the two-track
  prod plan are in that doc (§2, §7, §8). No live Rentvine call until the leaked credential is
  rotated (OQ-SEC-1); use the canonical Cloud Run host for any auth work, not the project-number URL.

## Migration Readiness

- State: fresh project `pmi-kc-kb-prod` provisioned + cheap-live Ask demo WORKING 2026-06-19;
  shareable deployed demo pending the Google sign-in toggle; cutover _completion_ still
  source-blocked
- Billing: account `01A5A3-65CA5A-614D45` (org `584930494337`), budget id
  `82962d7e-b340-4253-8348-38caff16e88a`, PM-created. Per `docs/budget-and-cost-policy.md`,
  keep the durable ~$10 unattended-spend guard; the PM budget is the outer GCP-enforced
  alert. Create a project-scoped $10 budget alert on the production project before any deploy.
- Evidence: `bash scripts/verify.sh` green on 2026-06-06; re-verified 2026-06-19 on the owner
  Windows host (budget-guard green; falsification green across 303 files). As of 2026-06-20,
  **387/387 unit tests pass** — the two prior environment-coupled failures (`migration-readiness`,
  `cutover-report`) are now fixed hermetically (see Last-Known-Green below).
  Cutover/preflight artifacts present (`npm run preflight:production`,
  `docs/client-production-cutover.md`, source-corpus manifests).
- What billing unblocks: live preflight, API enablement, Firestore/Cloud Run setup, the
  cheap-live demo. What it does NOT unblock: production cutover completion (needs approved
  client sources) and every cost step (each needs explicit approval + budget guard).
- Implication: do not add new speculative local product surface. Route to gated cutover
  setup, the cheap-live demo, docs, or regression hardening.

## Last Completed Slice

- Hardening + Recontextualization (2026-06-20, owner-directed): (1) Revoked the legacy
  `cherrybridge.ai` gcloud credential (only `josiah@pmikcmetro.com` remains; no active repo
  reference depends on it). (2) Retired the demo _cloud_ lane on the repo side — neutralized the
  dead `pmikckb-test` default project ids in `deploy-demo-cloud-run.mjs`,
  `source-corpus-manifest.mjs`, and `setup-windows-google-dev.ps1`; repointed `demo-operator` off
  the dead project-number URL; removed the `firebase:setup-*demo` npm scripts; **kept** local-dev
  demo mode, the demo source templates, and the preflight guardrails that reject the dead project.
  The `pmikckb-test` GCP project was then **deleted this session** via a one-time ephemeral
  cherrybridge auth (DELETE_REQUESTED, ~30-day recoverable; `docs/demo-lane-retirement.md`). (3) Fixed
  both environment-coupled unit tests to be hermetic (`migration-readiness` no longer depends on
  ambient ADC reaching an empty prod Firestore; `cutover-report` reads an empty env fixture, not
  the host `.env.local`) — **387/387 unit tests pass**. (4) Reworked the lease-renewal connector
  write-back to an admin-enabled, console-user-scoped, suggest-then-button-press model with no
  trust-based auto-write (`lease-renewal-connector-design.md` §4.0). (5) Documentation
  recontextualization: identity/migration current-state, a new `move-in-move-out-process.md`, and
  cross-doc ambiguity fixes. No system-of-record write, no deploy, no spend.
- GCP Billing Unblock — Cutover Resume + Verification Baseline (2026-06-19): recorded the
  PM-provisioned billing account (`01A5A3-65CA5A-614D45`, org `584930494337`, budget id
  `82962d7e-b340-4253-8348-38caff16e88a`) as non-secret identifiers in
  `docs/environment-handoff.md`, flipping the #1 client blocker. Wrote the decision-complete
  packet `docs/temp/2026-06-19-gcp-billing-unblock-cutover-resume.md` (production cutover
  track; keep $10 guard with PM budget as the outer alert; today's demo = cheap-live Ask on
  the existing `pmikckb-test` project). Ran the read-only verification baseline and
  root-caused two unit-test failures as environment-coupled (not regressions): the
  `cutover-report` blocker-prefix test reads the host's on-disk `.env.local`
  (`GCP_PROJECT_ID=pmikckb-test`) via `readProductionPreflightEnv`, and the
  `migration-readiness` real-deps test is a 5s cold-import timeout (passes at 30s); flagged a
  follow-up to make both hermetic. No console/billing action, no spend, no ADC/live run, no
  secrets, no system-of-record write. Next steps are user-owned gates (gcloud/ADC auth,
  production project id, per-step spend approval). See the matching `docs/status.md` entry.
- Source Drop Zone Setup + Away Mode Return (2026-06-15): reauthenticated Google as
  `josiah@pmikcmetro.com`, created the Google Drive source drop zone
  `PMI KC - Source Drop Zone` with product subfolders, shared it with
  `dan@pmikcmetro.com`, verified metadata-only visibility for the shared Sheets in Drive
  home, recorded the non-secret pointers in `docs/environment-handoff.md` and
  `docs/status.md`, and set Remote Away Mode inactive now that the owner is back at the
  desk. No sheet contents, raw client records, credentials, deploys, imports, sends, or
  external-system writes were performed.
- Gmail Inbox 0 Non-Live Foundation + Management Page v1 (2026-06-12, non-live half of
  remote-run queue item #7): built `lib/gmail-inbox-zero/` — doc-locked label/phase/
  status/hard-exclusion vocabulary, the pure `evaluateInboxTriage` gates (approved rules
  only; auto-apply only for exact matches past Shadow; Shadow applies nothing),
  `proposeRuleChangeFromFeedback` (corrections become Proposed changes needing Admin
  approval), and `buildReplyDraft` (Approved templates only, always banner-prefixed,
  Needs Verification placeholders, hard-excluded categories refused; text only, no send
  capability) — plus the doc-mandated minimal Admin-only management page, read-only at
  `/admin/gmail-inbox-zero` with an honest not-connected status. 12 unit + 4 e2e tests.
  Deliberately skipped: legacy artifact mining (sibling repo absent), ingestion,
  add-on card, back-labeling, live Gemini — all client-gated. See `docs/status.md`.
- Lease Renewal Agent Non-Executable Foundation (2026-06-12, decision-free half of
  remote-run queue item #6): converted the confirmed product-doc facts into
  `lib/lease-renewal/` — shared vocabulary (fact-confidence states, the verified
  eight-stage model, planned reads/outputs), the pure `evaluateRenewalFactGates`
  confidence gates, and `buildLeaseRenewalProcessTemplate`, whose action references are
  derived from the Action Registry seed so readiness/rollback cannot drift and the
  Rentvine writeback stays a gated pending-future-automation step. Added the renewal
  source inventory template
  (`docs/source-corpus/lease-renewal-source-inventory.template.json`) and 11 acceptance
  tests that drive the existing process-definition machinery simulation-only
  (Draft → Testing → Pending Approval). No runtime trigger, page, API route, or
  connector was added; the runtime half of item 6 stays client-blocked. See the
  matching `docs/status.md` entry.
- KB Admin Migration Console (2026-06-12, remote-run queue item #5): built the
  read-only, preview-first `/admin/migration` page (linked from `/admin`) that mirrors
  `npm run cutover:report` in-app: GCP converge plan, production env preflight,
  source-corpus template readiness, budget/away posture, Action Registry readiness with
  a production_allowed governance assertion, notification posture, a section-prefixed
  blockers rollup, and owner-side action labeling. `lib/admin/migration-readiness.ts`
  reuses the `.mjs` script logic via sibling `.d.mts` declarations with explicit
  `process.cwd()`-rooted arguments; the pure manifest validation/readiness functions
  moved to `scripts/source-corpus-readiness.mjs` and `scripts/source-doc-id.mjs`
  (re-exported by the CLI, tests unchanged) so the page bundle stays free of
  firebase-admin and CLI file operations. 10 unit tests + 5 e2e tests; no client
  mutation surface. See the matching `docs/status.md` entry.
- Integration Readiness Expansion (2026-06-12, remote-run queue item #8): added
  structured `preview_payload_schema` field descriptors to the Action Registry (schema,
  types, record builder) with the pure validator `lib/integrations/preview-payload.ts`;
  defined seven deterministic per-system health-check contracts in
  `lib/integrations/health-checks.ts` whose `runHealthCheck` only works through an
  injected transport (no live calls possible, test-locked); expanded the seed catalog
  from 9 to 14 entries (`rentvine.lease.read`, `rentvine.work_order.read`,
  `leadsimple.task.create`, `gmail.label.apply`, `gmail.draft.create` — Gmail pair stays
  `Planned` pending the client-approved access model; Move-Out actions deliberately not
  added because their scope is still TBD); wired `connection_health_check_ref` on every
  entry; and built mocked connector tests for the maintenance work-order chain
  (`tests/helpers/mock-connectors.ts`). Every entry remains `production_allowed: false`;
  no external write path exists. See the matching `docs/status.md` entry.
- Cutover Tooling Batch (2026-06-11, remote-run queue items #1-#3): `seed:spaces` is
  now idempotent (`--dry-run`, existence prechecks, `--force` preserves `created_at`);
  `npm run preflight:gcp` prints the credential-less GCP/Firebase/Firestore converge
  plan with a doc-synced required-API list and adds `--live` read-only verification
  when ADC exists; `npm run cutover:report` composes GCP plan, production env
  preflight, budget posture, corpus readiness, deploy preview, an ordered rollback
  plan, and the §7 smoke checklist into one machine-readable readiness report that the
  runbook now requires before deploy. All dry-run/read-only; live API reads remain
  owner-side because the remote container has no credentials. See `docs/status.md`.
- Mocked-Auth E2E Flow Harness (2026-06-11, remote-run queue item #4): built the
  browserless e2e harness (`npm run test:e2e` / `test:e2e:core`,
  `scripts/run-e2e-tests.mjs`, `tests/e2e/`): a cookie-jar fetch client drives a real
  `next dev` server with `LOCAL_DEMO_AUTH=true ASK_DEMO_MODE=true`, optionally inside the
  Firestore emulator seeded from `scripts/demo-firestore.mjs`. 33 tests cover guard
  redirects and role gating, Ask source states and citations, capture-to-placeholder,
  Approval Queue flows (filters, high-risk confirmation, approve, bulk snooze, bulk
  execute block), the full process-definition lifecycle to activation, spaces, and
  graceful no-Firestore degradation. `POST /api/auth/demo` now accepts an optional
  Editor/Approver/Admin role (cookie `local-demo:<Role>`), still demo-gated. See the
  matching `docs/status.md` entry for validation detail.
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

- 2026-06-20 (hardening + recontextualization slice, owner Windows host): `npx vitest run`
  **387/387 PASS across 48 files** — both previously environment-coupled failures
  (`migration-readiness.test.ts`, `cutover-report.test.mjs`) are now hermetic and green. Full
  `bash scripts/verify.sh` not re-run this slice (changes were tests + scripts + docs); run it
  before any deploy.
- 2026-06-19 (billing-unblock slice, owner Windows host): `npm run check:budget-guard` PASS
  (demo posture, away mode inactive, $10 cap); `npm run verify:falsification` PASS (303
  committable files); `npm test` 370/372 PASS. The 2 failures are environment-coupled, not
  regressions (modules last changed 2026-06-12, the green era): (1)
  `tests/unit/cutover-report.test.mjs > aggregates blockers across sections with prefixes` —
  `readProductionPreflightEnv` reads the host's on-disk `.env.local` (`GCP_PROJECT_ID=pmikckb-test`),
  so the expected `gcp:` "no project" blocker is absent; (2)
  `tests/unit/migration-readiness.test.ts > computes real plan/preflight/corpus/budget` — 5s
  default timeout on cold dynamic import of the real Google SDK modules (passes at
  `--testTimeout=30000`; vitest reported ~56s aggregate import). `npm run host:check`: gcloud
  SDK present but `pmikckb-test` not accessible → ADC reauth required before any live/demo run.
  `npm run check:live-cost -- --allow-multiple-spaces` correctly gates (ambient
  `ASK_DEMO_MODE=true`). No `bash scripts/verify.sh` full run this slice (docs-only changes).
  Follow-up queued: make the two tests hermetic vs local `.env.local` and cold imports.
- 2026-06-12 (Gmail Inbox 0 foundation slice, end of run): `npm run format:check`,
  `npm run lint`, `npm run typecheck`, `npm test` (372 tests / 47 files),
  `npm run verify:falsification` (303 committable files),
  `npm run verify:router-boundary`, `npm run check:budget-guard` (demo posture, away
  mode active, $10 cap), `npm run build` (warning-free), `npm run test:e2e:core`
  (25 passed, 17 emulator-dependent skipped), `npm run test:e2e` (39 passed, 3
  degraded-mode correctly skipped), and `npm run test:firestore` (23 rules tests) all
  passed.
- 2026-06-12 (lease renewal foundation slice, end of run): `npm run format:check`,
  `npm run lint`, `npm run typecheck`, `npm test` (360 tests / 46 files),
  `npm run verify:falsification` (297 committable files),
  `npm run verify:router-boundary`, `npm run check:budget-guard` (demo posture, away
  mode active, $10 cap), `npm run build` (warning-free), `npm run test:firestore`
  (4 rules-test files), and `npm run test:e2e:core` (21 tests, 17 emulator-dependent
  skipped) all passed.
- 2026-06-12 (end of remote run, queue items 8 + 5): `bash scripts/verify.sh` passed
  (format, lint, typecheck, 349 unit tests / 45 files, router boundary, falsification
  across 292 committable files, warning-free build with `/admin/migration` present);
  `npm run test:firestore` passed (23 rules tests); `npm run test:e2e:core` passed (21
  tests, 17 emulator-dependent skipped); `npm run test:e2e` passed (35 tests, 3
  degraded-mode correctly skipped with the emulator present);
  `npm run check:budget-guard` passed (demo posture, away mode active, $10 cap); the
  seed dry-run validated 14 entries, all production_allowed=false, no writes.
- 2026-06-12 (integration readiness expansion, slice boundary): `npm run format:check`,
  `npm run lint`, `npm run typecheck`, `npm test` (339 tests / 44 files),
  `npm run test:firestore` (23 rules tests), `npm run verify:falsification` (281
  committable files), `npm run verify:router-boundary`, `npm run check:budget-guard`
  (demo posture, away mode active, $10 cap), and the seed dry-run
  (`npx tsx scripts/seed-action-registry.ts --dry-run --json`: 14 entries, all
  production_allowed=false, no writes) all passed.
- 2026-06-11 (e2e harness + cutover tooling batch, end of remote run):
  `bash scripts/verify.sh` passed (format, lint, typecheck, 318 unit tests / 42 files,
  router boundary, falsification across 276 committable files, build);
  `npm run test:firestore` passed (23 rules tests); `npm run test:e2e` passed (31
  tests, 2 degraded-mode tests correctly skipped with the emulator present);
  `npm run test:e2e:core` passed earlier in the run (16 tests without the emulator);
  `npm run check:budget-guard` passed (demo posture, away mode active, $10 cap).
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

- 2026-06-12 (Gmail Inbox 0 foundation slice): `npm run verify:falsification` passed
  across 303 committable files. Self-review: all new logic is pure (no Gmail API
  import, no fetch, no send method anywhere); the only runtime surface is the
  Admin-gated read-only management page, which reads constants and server config only —
  no Firestore collection, no mutation handler, no Gmail call. The router-boundary
  guard still forbids Gmail runtime scope literals in `lib/`/`app/` and passes. No
  secrets, no client data, no cloud/API/Gmail action, no deploy/import/send, and no
  system-of-record write path.
- 2026-06-12 (lease renewal foundation slice): `npm run verify:falsification` passed
  across 297 committable files. Self-review: the slice adds only pure vocabulary, a
  pure gate function, a template builder whose action references derive from the
  governed seed catalog, a JSON inventory template with TBD placeholders, and
  simulation-only acceptance tests. No runtime trigger, page, API route, connector,
  send, secret, client data, or external write path was added, honoring the product
  doc's "Do Not Build Yet" boundary.
- 2026-06-12 (end of remote run): `npm run verify:falsification` passed across 292
  committable files. Self-review of the Admin migration console slice: the page and its
  aggregation module are strictly read-only (no POST/PUT handlers, no client mutation
  surface, no cloud fetch — the GCP section stays plan-mode and never calls
  `fetchLiveState`); the only runtime-adjacent refactor moved pure functions into
  `scripts/source-corpus-readiness.mjs` / `scripts/source-doc-id.mjs` with the CLI
  re-exporting them and its tests unchanged. No secrets, no client data, no
  cloud/API/Gmail action, no deploy/import/send, and no system-of-record write path.
- 2026-06-12 (integration readiness expansion): `npm run verify:falsification` passed
  across 281 committable files. Self-review: the slice is metadata, pure functions, and
  mocked tests only; the one guard interaction found (router-boundary forbids Gmail
  runtime scope literals in `lib/`) was resolved by rewording catalog metadata, not by
  weakening the guard. No secrets, no client data, no cloud/API/Gmail action, no
  deploy/import/send, and no system-of-record write path; every registry entry remains
  production_allowed=false.
- 2026-06-11 (end of e2e + cutover tooling run): `npm run verify:falsification` passed
  across 276 committable files. Self-review: all four slices are local
  tests/tooling/docs; the only runtime change is the demo-gated role parameter on
  `POST /api/auth/demo`, which stays behind `isLocalDemoAuthEnabled()` (off in
  production and rejected by the production preflight). No secrets, no client data, no
  cloud/API/Gmail action, no deploy/import/send, and no system-of-record write path.
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

Remote Away Mode is inactive and the remote-safe queue is exhausted. The next run should
choose work only when it is tied to a fresh client answer, production setup, cutover
readiness, or a concrete regression:

1. If Dan returns Google Cloud project/billing details, run read-only preflight/reporting
   and record non-secret identifiers.
2. If Dan/team fill the Drive folders, turn approved material into source manifests and
   source-readiness checks; do not import/index until source and cost gates are cleared.
3. If Dan records the Lease Renewal walkthrough, convert it into source notes, open
   questions, acceptance scenarios, and a scoped implementation packet.
4. If no new client answer has arrived, stay limited to regression fixes, docs hygiene,
   verification, and handoff cleanup.

## Next Large Remote Run Queue

This queue is intentionally sized for a large-context, long-running model. Do not stop
after one small patch if checks stay green and no hard gate fires. Work top-down, updating
this file and `docs/status.md` at each slice boundary.

Progress (2026-06-11 remote run): items 1-4 below now have their local/dry-run halves
built and verified — `preflight:gcp` (item 1: plan mode complete; `--live` read-only
verification ready but needs owner-side ADC), `cutover:report` (item 2: composed
readiness report, rollback plan, smoke checklist), `seed:spaces` idempotency (item 3;
remaining: rules/index deploy prechecks against a live project, owner-side), and the
mocked-auth e2e harness (item 4: 33 flow tests; browser-pixel coverage optional).
The remaining work in items 1-3 is owner-side live execution, which is
credential-blocked from the remote container, so the next remote slice should come
from items 5-8 or new regression/readiness needs.

Progress (2026-06-12 remote run): items 8 and 5 are complete, and item 6's decision-free
half is built. Item 8 (integration readiness expansion): structured preview payload
schemas, per-system health-check contracts, a 14-entry seed catalog, and mocked
maintenance-chain connector tests, all metadata/mocked with every entry
production_allowed=false. Item 5 (KB Admin migration console): read-only
`/admin/migration` mirrors `cutover:report` in-app with owner-side blocker labeling.
Item 6 (Lease Renewal foundation, non-executable half): doc-grounded vocabulary,
fact-confidence gates, the seed-derived process-definition template, the renewal source
inventory template, and simulation-only acceptance tests; the runtime half stays
client-blocked (signed-lease system, allowed reads, source folder, walkthrough). Item 7's non-live half
is now also built (label/rule/draft models with governance gates and the read-only
Admin management page v1); its live half (Gmail access model, mailbox scan, safe-thread
protocol, legacy artifact mining) stays client-blocked. The remote-safe halves of all
queue items (1-8) are now exhausted: the next remote slice must come from new
regression/readiness needs, the queued remote-owner decisions, or client answers
unblocking the live halves.

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

- ~~Google Cloud billing card~~ — PROVISIONED 2026-06-19 (account `01A5A3-65CA5A-614D45`,
  org `584930494337`, budget id `82962d7e-b340-4253-8348-38caff16e88a`). Still open: gcloud/ADC
  auth on the host (host:check shows `pmikckb-test` not accessible), a PMI KC production
  project id (create/select + link billing + $10 budget alert), and explicit per-step approval
  for each cost-bearing migration step (the $10 guard stays binding).
- Lease Renewal walkthrough (target Wed Jun 17 2026, 9:30-10:15 AM; fallbacks Jun 17-18).
- QuickBooks access status/location — blank in the returned tool-access spreadsheet.
- Google Sheets exact in-scope sheet list and owner confirmation.
- RentVine credential rotation — a credential appeared in ignored spreadsheet notes and
  must be rotated/stored outside the repo before future use.
- ~~Signed lease / lease-end-date source location.~~ RESOLVED: signed leases live in **Dotloop**
  (e-signature home); lease-end / renewal timing reads from the **Rentvine lease record** (Tab 3
  `Renewal Date` corroborates). See `docs/products/lease-renewal-discovery-reference.md` §2 and
  `docs/products/lease-renewal-connector-design.md` §3.4.
- Rentvine lease-renewal-write endpoint confirmation — undocumented in the public API;
  vendor confirmation required before any renewal writeback (see
  `docs/integration-architecture.md`).
- Source-vocabulary normalization — freeze canonical stage/system/record-ID/approval names
  (legacy Propertyware vs Rentvine "RV") before any live connector work.
- Gmail Inbox 0 safe test-thread protocol confirmation.
- Approval sender (`kb-automation@pmikcmetro.com`) and launch approver defaults
  (Dan + Josiah) — confirm or correct.

## Pending Approval Gates

Now that billing is provisioned, the following cost-bearing steps are queued behind explicit
per-step approval (each must also pass `npm run check:budget-guard` and stay under the $10 cap):

- Cheap-live Ask demo on `pmikckb-test` (<$10): `npm run smoke:ask-live` and optional
  `npm run deploy:demo -- --budget-confirmed`.
- Production infra setup on the PMI KC project: `gcloud services enable …`, Firestore create +
  rules/index deploy, source import (`import:agent-search`), `deploy`, and the §7 production smoke.

Hard-stop actions still require explicit approval and the assistant will not perform them:
billing/cap increases or billing-console changes, Pro model usage, autonomous sends,
destructive/breaking changes, raw client data/secrets, Gmail mailbox access, or unapproved
system-of-record writes.

## On-Return Review Queue

Remote Away Mode is inactive (`docs/away-mode.md`) because the owner is back in active
coordination. Use this queue only for items that still need explicit owner/client input.

- Away mode state: INACTIVE as of 2026-06-15. Budget cap remains $10 unless explicitly
  changed.
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
- Remote decision queue: cleared by the 2026-06-15 return update.

## Stop-Condition State

- Fired: migration-readiness stop gate. Local foundations are substantially complete, the
  Drive source drop zone exists, and the remaining high-value work is blocked on Dan/client
  replies, production setup, approved sources, or walkthrough content.
- Recommended next action: after Dan replies, update `docs/client-checklist.md` and
  `docs/environment-handoff.md`, then run the relevant dry-run/preflight/source-manifest
  step. If no reply has arrived, do not start new speculative runtime surface.

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
3. If the trigger is **"continue with feature development"**, open
   [`products/lease-renewal-build-plan.md`](products/lease-renewal-build-plan.md) and build the next
   zero-cost, deterministic Phase-1 unit from §3 (it carries the done-state, buildable units,
   open-questions/blockers register, and the two-track prod plan). Keep every Action Registry entry
   `production_allowed:false`; no live Rentvine call until OQ-SEC-1 (credential rotation).
4. Honor the stop gate: prefer client unblock / cutover / docs / regression work over new
   local product surface while blockers are client-owned.
5. Update this file at each slice boundary.
