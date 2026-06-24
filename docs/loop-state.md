# Loop State

Single-read resume artifact for the unattended feature loop. Read this first. It is the
always-current pointer; `docs/status.md` is the append-only history. If the two disagree,
`docs/status.md` wins and this file is corrected.

Keep this file short, non-secret, and current. Update it at the start of a cycle, at each
slice boundary, and whenever a blocker, approval gate, or stop-and-reset condition
changes. See `docs/autonomous-agent-runner.md` for the loop, verification/falsification,
continuation, and stop-and-reset rules.

## Snapshot

- Last updated: 2026-06-24
- 2026-06-24 (lease-renewal LIVE WIRING — owner-directed "keep going" after slices A–E): wired the
  sheet hyperlink layer end-to-end so Slice B's RentVine-id join runs on real rows, all read-only / $0.
  `ingest.ts` now accepts an optional `tableJoinIds` (parallel to `tables`) and threads a per-row
  RentVine id through divider-drop + re-stitch onto `record.joinId`; `pipeline.ts` prefers
  `record.joinId` over the `recordJoinIds` map and passes `tableJoinIds` to ingest;
  `lib/lease-renewal/sheet-links.ts` (new) turns a FORMULA `values:batchGet` response into `tables` +
  `tableJoinIds` (via `valuesToGridWithLinks` + `rentvineJoinIdsForGrid`); `read-client.ts` exposes the
  read-only `batchGetFormulas` on the reader interface; `runFullyLiveRenewalReview({ linkJoin: true,
cohortWindows })` reads the link layer, runs the exact id-join, AND now forwards the cohort filter
  (previously dropped). Verification: typecheck, lint, `npm test` (**654/654 across 83 files**, +9),
  `verify:falsification` (**409 files**), format all PASS; a focused adversarial review traced the
  link↔row alignment through every ingest transform and found no off-by-one. No SoR write, no send,
  `production_allowed:false` throughout. **NEXT (owner-gated / UI):** run the real `--live` review to
  confirm the live flag volume drops; add `--link-join` / `--cohort` flags to `smoke:renewal-review`;
  surface the cohort / drafts / readiness on `/lease-renewal/runs` (OQ-UI-1).
- 2026-06-24 (lease-renewal next-phase BUILD — owner-directed "build and plan the next session; plan
  the whole set of changes, then execute"): built all five §3 slices of
  [`products/lease-renewal-next-phase-plan.md`](products/lease-renewal-next-phase-plan.md) as pure,
  deterministic, unit-tested modules — **read-only / draft-only, $0, no SoR write, no send, every
  Action Registry entry stays `production_allowed:false`**. **A** `lib/lease-renewal/cohort.ts`
  (`classifyRenewalCohort` → actionable/skip/review by end-date window + configurable skip signals;
  wired as an optional cohort filter in `live-run.ts`). **B** the 397-flag collapse:
  `pipeline.ts` now (i) does NOT flag a blank sheet cell with no joined authoritative source (un-started
  worklist), (ii) accepts an exact RentVine-id join (`recordJoinIds` + candidate `joinId`) that bypasses
  the fuzzy name join, (iii) downgrades a `current_rent` conflict whose gap equals a subset of the known
  add-ons (RBP $28 + insurance $11.95); plus `rentvine-link.ts` (parse lease/unit id from a URL or
  `=HYPERLINK`), `rent.ts` (`rentsAgree`), `sheet-to-grids.ts` hyperlink layer, a read-only
  `read-client.ts batchGetFormulas`, and `lease-mapper.ts` populating `joinId`. **C** `owner-draft.ts`
  (`buildOwnerRenewalDraft` — source-tagged facts, `Needs Verification` markers, no send). **D**
  `tenant-draft.ts` (`buildTenantOfferDraft` × email/portal/text — Dan's multi-channel rule). **E**
  `renewal-readiness.ts` (`evaluateRenewalReadiness` must-never-miss checklist; unknown → `needs_input`,
  never a false all-clear). Verification: `format:check`, `lint`, `typecheck`, `npm test` (**638/638
  across 82 files**, +20), `verify:falsification` (**407 committable files**) all PASS; an adversarial
  5-dimension review workflow ran over the change-set. **NEXT (live wiring):** populate `recordJoinIds`
  from the sheet's FORMULA hyperlink read end-to-end, and surface the cohort / drafts / readiness on the
  `/lease-renewal/runs` review page.
- 2026-06-24 (lease-renewal next-phase REALIGNMENT — owner-directed "read the product doc + the
  show-and-tell transcript, check the email is in scope, then plan the next phase that anticipates and
  solves client problems instead of asking open-ended questions"): authored
  [`products/lease-renewal-next-phase-plan.md`](products/lease-renewal-next-phase-plan.md) and pointed
  the build-plan route at it. **Finding:** the in-flight "calibrate the 397 flags / email Dan five
  questions" task was misaligned — the gitignored 2026-06-19 transcript already answers four of the five
  questions, and Dan answered the fifth (the must-never-miss failure modes) in detail on the call. The
  new plan folds those answers in (§2 "decisions already resolved") so the next cycle does NOT re-ask
  them, then builds five zero-cost, read-only/draft-only slices: **A** cohort detection +
  skip-classification (mirror Dan's manual end-date filter), **B** join on the embedded RentVine
  hyperlink ID + auto-fill blanks from RentVine (collapses the 397-flag noise — blanks are normal
  worklist state, not defects; base-rent-to-base-rent excluding RBP/insurance), **C** owner
  renewal-email draft (the #1 ask; source-tagged, `Needs Verification` on missing market input, no send),
  **D** tenant offer draft rendered for all three channels (email + portal + text — Dan's hard rule),
  **E** the must-never-miss readiness checklist (inherited→full set, pre-1978→lead paint, city addendum,
  deposit-type, pet deposit, LLC suffix, prorated rent; `needs_input` never a false all-clear). Only
  three residual Dan items remain, framed as confirmations-with-defaults (§4). No code built this slice —
  plan packet + doc wiring only; committed for a fresh-context build next session.
- 2026-06-24 (RentVine live read — owner just obtained API access; owner-directed "consolidate +
  prove RentVine + replace the synthetic feed with live reads"): the lease-renewal review now runs on
  REAL RentVine leases. Moved the saved credential into `.env.local` (gitignored; never echoed) →
  `npm run preflight:rentvine` green. Built a read-only RentVine client (HTTP Basic
  `base64(key:secret)`, identity-guarded to the `pmikcmetro` tenant), a lease→`NonSheetCandidate`
  mapper, a real `health.rentvine.api_key` probe, the `npm run smoke:rentvine-read -- --live` proof,
  and the `lib/lease-renewal/live-run.ts` wiring. **PROVEN LIVE:** one read-only
  `GET /api/manager/leases/export` returned **25 real leases → 25 mapped candidates** (auth HTTP 200,
  no rate-limit headers); the four `RENTVINE_DOC_UNKNOWNS` are resolved (auth + endpoints from working
  code; field names + rate posture from the live call). Finding: the plain `/leases` list omits tenant
  names + rent, so the live read uses `/leases/export` (tenant ← `lease.tenants[].name`, renewal_date
  ← `lease.endDate`, current_rent ← `unit.rent`). **Live Google Sheet read also WORKS now** (read-only,
  `npm run smoke:sheet-read -- --live`): **26 tabs total, 25 read, credential tab "Passwords/contacts"
  auto-skipped**, counts-only/redacted (no cell values). The real renewal tab is **"Lease Renewal"**
  (519×31). AUTH JOURNEY (managed domain is hostile to programmatic Sheets): the user OAuth Sheets
  scope is blocked ("app blocked"); admin-trusting the gcloud client didn't help; a service account
  shared on the sheet still 403'd ("caller does not have permission" — the domain blocks the external
  SA from opening the file). RESOLUTION: **domain-wide delegation** — the reader (`lib/google-sheets/read-client.ts`)
  signs a JWT via the SA (keyless, `iamcredentials.signJwt`) and reads AS `josiah@pmikcmetro.com`
  (env `SHEETS_IMPERSONATE_SA` + `SHEETS_DWD_SUBJECT`). GCP set up: SA `lease-renewal-reader@pmi-kc-kb-prod`,
  Token Creator granted, Sheets + IAM Credentials APIs enabled, and the SA client id `104374162913177846911`
  authorized for `spreadsheets.readonly` in Admin → Domain-wide delegation. RentVine reads are free (no
  GCP budget). Every Action Registry entry stays `production_allowed:false`; no SoR write. **584/584
  tests across 74 files.** Committed on branch `feat/lease-renewal-live-reads` (`cabc281`). **End-to-end
  real review CONFIRMED RUNNING** (throwaway run): the real "Lease Renewal" tab fingerprints + header-
  resolves correctly (its headers match the synthetic `SAMPLE_RENEWALS` exactly), ingesting **390 real
  records**, reconciled against the **25 live RentVine leases** → **397 flags (321 High, 76 Blocked)**,
  `production_allowed:false`, counts-only. NEXT (calibration, owner/Dan-gated): the 397-flag volume is
  mostly the "missing High-severity field → flag" rule firing on the tracker's many blank / "not
  renewing" rows — tune the reconciliation/severity rules so flags are accurate with a low false-positive
  rate (the Phase-1 accuracy milestone; OQ-PREC-1 precedence + which blanks should/shouldn't flag), and
  calibrate the non-renewal tabs ("Periodic Ins Trkr 25", "Unit Details") to the real names. See Last
  Completed Slice.
- 2026-06-23 (sync-and-readiness triple, owner-directed "Do 3, then 2, then 1" after the
  cutover-readiness finding surfaced an out-of-sync concern): added a living-plan status field +
  enforcing test, a FREE `npm run reality:check` map-vs-territory reconcile, and a RentVine
  connection-readiness scaffold (`npm run preflight:rentvine` + plain-language setup checklist). The
  RentVine live read is blocked only on RentVine's API doc. Also saved a durable tone-preference
  memory (simple, human-readable explanations). See Last Completed Slice.
- 2026-06-23 (production cutover-readiness hardening — dry-run rehearsal, owner-directed "plan the
  next phase of development" → KB production cutover): added `npm run cutover:dry-run`
  (`scripts/cutover-dry-run.mjs`) + two synthetic golden fixtures (`tests/fixtures/cutover/`) + 17
  tests (`tests/unit/cutover-readiness-golden.test.mjs`) that drive the real `buildCutoverReport`
  over a healthy config and assert every gate green except one documented residual — plus negative
  fixtures for each rejection. Zero cloud cost, no deploy, no sources. Closes the `docs/plan.md` P5
  dry-run gate ("Dry-runs exist for imports, setup scripts, seeders, and preflights"). FINDING
  (surfaced, not changed): the report's aggregate `readiness.ok` can never be `true` for a compliant
  production env — production preflight requires `KB_APPROVAL_NOTIFICATIONS_ENABLED=true`, but the
  in-report budget guard refuses the live Gmail send without `--allow-notifications` (a flag
  `cutover:report` does not expose), so the report always carries exactly one expected `gcp:`
  notification-send blocker. Documented in `docs/client-production-cutover.md` §1b/§6; no tooling
  behavior changed. **Open question for the owner:** should `cutover:report` accept an approval flag
  so a fully-approved cutover can reach `readiness.ok === true`?
- 2026-06-23 (budget kill switch FULLY ARMED on `pmi-kc-kb-prod`): the hard $10 cap is live
  end-to-end. Chain: project-scoped $10 budget
  (`billingAccounts/01A5A3-65CA5A-614D45/budgets/033af8c0-8f21-48af-b89b-0632896e5018`, 50/90/100%
  thresholds) → publishes to topic `budget-guardrail-topic` (publisher
  `billing-budget-alert@system.gserviceaccount.com`, granted via the Console connect) → Eventarc →
  2nd-gen function `budget-guardrail` (ACTIVE, `KILL_SWITCH_CAP_USD=10`; SA has
  `roles/billing.projectManager` + `roles/run.invoker`) → disables billing at $10. No-op wiring test
  confirmed the function path (`…no action.`); the disable logic is unit-tested. **Unblock path:** Dan
  granted josiah org-level `roles/orgpolicy.policyAdmin` + `roles/resourcemanager.organizationAdmin`;
  the topic→budget link needed domain-restricted-sharing (`iam.allowedPolicyMemberDomains` = customer
  `C030vgv56`) temporarily relaxed on the project for the Console connect, then **re-locked** (verified
  back to `C030vgv56`). The CLI cannot bind the budgets publisher SA directly — the Billing Console
  grants it internally. See `docs/budget-killswitch.md`.
- 2026-06-22 cycle (lease-renewal Phase-1 read pipeline + review surface — OQ-UI-1, candidate (a),
  owner-directed "plan and implement the next phase"): wired the already-merged deterministic
  Phase-1 modules into a pure orchestrator `lib/lease-renewal/pipeline.ts` (`runRenewalPipeline`:
  ingest → join MATCH-ONLY → reconcile → severity → queue-item draft, `production_allowed:false`),
  a fixture-fed `lib/lease-renewal/simulation.ts` + `sample-sheet.ts` (synthetic; the app stays
  source-blocked), a new top-level **`/lease-renewal/runs`** review section (index + `[runId]`
  detail, severity-grouped flags, counts-only manifest + excluded-tab census), and the §3.5
  **resolve loop** (pick-a-source / enter-corrected-value / flag-is-wrong, required reason, Activity)
  on a NEW KB-owned Firestore layer `lease_renewal_resolutions` + `lease_renewal_resolution_activity`
  (server-write-only rules; `lib/firestore/lease-renewal-resolutions.ts` + `POST /api/lease-renewal/resolve`).
  GOVERNANCE held: the resolve loop writes only KB-owned Firestore; a pick/corrected resolution
  **QUEUES** a proposed write-back (`production_allowed:false`) — **no sheet/SoR write executes**;
  High/Blocked resolutions require an Admin; OQ-PREC-1 still gates suggested winners. Deep links
  repointed `/workflow-runs/...` → `/lease-renewal/runs/...`. **Merged to `main` 2026-06-22**
  (`9efa5c3`).
- 2026-06-22 cycle (budget kill switch + e2e-runner CI fix): added the hard-cap budget kill switch
  (`infra/budget-guardrail/` — budget → Pub/Sub → Cloud Function that disables the project's billing
  at the $10 cap; pure decode/decide + dependency-injected handler; 11 tests prove the disable path
  with a mock billing client, no live call), a PRINT-ONLY provisioning runbook
  (`npm run killswitch:plan` / `scripts/setup-budget-killswitch.mjs`), `docs/budget-killswitch.md`,
  and corrected the stale "billing not provisioned" claim in `docs/budget-and-cost-policy.md`. Also
  fixed `scripts/run-e2e-tests.mjs` to spawn firebase/vitest via PowerShell on Windows — the prior
  push (`9efa5c3`) failed CI on a Prettier format check; this slice greens it. **GCP arming of the
  kill switch stays owner-side (billing-console Hard Stop) — code + tested logic + runbook only.**
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
- **Phase-1 deterministic build run COMPLETE + reviewed + MERGED to `main` (2026-06-20):** built ALL
  14 zero-cost, deterministic Phase-1 lease-renewal units from
  [`products/lease-renewal-build-plan.md`](products/lease-renewal-build-plan.md) §3 as 12 verified
  slices on `work/lease-renewal-phase1`, then ran a 5-lens adversarial review (correctness /
  governance / spec / tests / integration; each finding adversarially verified) and fast-forward
  merged to `main` after fixing the findings. **Units delivered:** 12 (the three
  `google_sheets.renewal_checklist.{read,reconcile,writeback}` registry entries — seed catalog now
  **17 entries, all `production_allowed:false`**); 14 (`tests/fixtures/lease-renewal/` synthetic
  sanitized corpus + `lib/lease-renewal/sheet-types.ts`); 3 (`fingerprint.ts`); 4 (`headers.ts`);
  5 (`normalized-value.ts` — `Conflict` never set at ingest; impossible calendar dates rejected);
  1+2+7 (`ingest.ts` — credential hard-exclusion + the §2.2.5 emit scrubber via
  `credential-guard.ts`, divider-drop + re-stitch, counts-only `IngestManifest`); 6 (`join.ts`
  — no auto-merge); 8 (`severity.ts`); 9 (`reconciliation.ts` + `field-reconciliation-rules.ts` —
  suggestion-only, OQ-PREC-1-gated, where `Conflict` IS set); 10 (`approval-queue-mapping.ts` —
  PII in-boundary); 11 (`writeback.ts` — mock/design-only re-anchor + CAS + read-after-write); 13
  (mocked Rentvine + Sheets health/read smokes). All pure functions / rule tables on synthetic
  fixtures; **no live calls, credentials, cost, deploy, or SoR write.**
- **Post-review hardening (2026-06-20):** the review found 0 blockers / 2 majors (no governance
  breach). Fixed before merge: (1) `parseSheetDate` now round-trips through a UTC date and rejects
  impossible calendar dates (Feb 30 etc.) → `null`/Needs Review per §3, instead of fabricating a
  `Verified` ISO on the High-severity `renewal_date` field; (2) the credential containment now
  matches the spec — a shared `lib/lease-renewal/credential-guard.ts` aligns the Stage-B token set to
  the authoritative §2.2 regex (adds `passcode/ssid/login/credential/access code`, strong-token
  1-hit trip) AND adds the previously-missing §2.2(5) **emit scrubber** that redacts any credential
  value reaching the emit stage (`credentialScrubHits` + tab Blocked). Plus three cheap nits
  (currency regex unified, multi-dot divider guard in writeback, `blocked_reason` only on Blocked
  severity).
- **Stop condition:** clean stop — all §3 deterministic units are built and green. The remaining
  Phase-1 work is **client/owner-gated**, not buildable now: OQ-PREC-1 (Dan confirms §3.4 precedence
  to flip reconciliation suggestions from `Blocked`), OQ-SHEET-1/OQ-LEX-1/OQ-JOIN-1 (live-read
  calibration), OQ-UI-1 (the lease-renewal workflow-run/Approval-Queue review surface — an unbuilt
  UI dependency for the Phase-1 accuracy milestone), and the cost-gated first live read.
- **Next slice candidates:** Slices A→E **and the live wiring (slice F)** of
  [`products/lease-renewal-next-phase-plan.md`](products/lease-renewal-next-phase-plan.md) are **BUILT +
  tested 2026-06-24** (pure modules + the FORMULA-link join through ingest, $0). The **active next
  cycle is owner-gated execution + the UI**: (i) run the real `--live` fully-live review (needs ADC) to
  confirm the flag volume drops from ~397 to a small set; (ii) add `--link-join` / `--cohort` flags to
  `scripts/smoke-renewal-review.ts` so the live proof exercises the id-join + cohort filter; (iii)
  surface the cohort summary, the owner/tenant drafts, and the readiness checklist on the
  `/lease-renewal/runs` review page (OQ-UI-1, the one unbuilt UI dependency). Older candidates, still
  valid: (a) wire these modules into a read pipeline + the OQ-UI-1 workflow-run
  page — **DONE 2026-06-22** (pipeline + `/lease-renewal/runs` review surface + §3.5 resolve loop,
  simulation-only). Remaining: (b) after Dan confirms OQ-PREC-1, set `PRECEDENCE_CONFIRMED` and add
  the active-suggestion tests (today unlisted-field conflicts render `Blocked "no precedence rule"`);
  (c) the cost-gated first live read — **RentVine half DONE 2026-06-24** (live `/leases/export` → 25
  candidates, wired via `lib/lease-renewal/live-run.ts`, $0; replaces the synthetic `source:"rentvine"`
  feed); the live Google Sheet half is BUILT + WIRED (ADC reader + adapter + health probe +
  `smoke:sheet-read` + combined `runFullyLiveRenewalReview`), sheet id received — BLOCKED only on ADC
  reauth + Sheets scope (the gcloud ADC login command; OQ-SHEET-1 narrowed); (d) recurring read
  cadence (OQ-LS-1);
  (e) Phase-2 write-back enablement (admin flag off by default) — the resolve loop already queues
  the proposed write-back. Per owner decision 2026-06-20 the existing RentVine credential is used
  as-is (NOT rotated; load from env/Secret Manager, keep out of git). Use the canonical Cloud Run
  host for any auth work, not the project-number URL.

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

- RentVine live read + Sheets read scaffolding (2026-06-24, owner-directed after the owner obtained
  RentVine API access). Replaced the synthetic `source:"rentvine"` feed with a proven live read.
  - **Credentials:** moved the saved key/secret from `secrets/rentvine-api-credentials.local.md` into
    `.env.local` (both gitignored; values never printed/committed) via an inline parser that reports
    only field labels + success. `npm run preflight:rentvine` now `env_configured: true`.
  - **RentVine client (`lib/integrations/rentvine/client.ts`):** read-only GETs only; HTTP Basic
    `Authorization: Basic base64("{key}:{secret}")`; base URL host validated to the `pmikcmetro`
    tenant family (identity guard); injected `RentVineHttpTransport` (tests use a fake; `createFetchTransport`
    is the live default); `RentVineAuthError`(401, no secret in message)/`RentVineRateLimitError`(429,
    parsed Retry-After); `listLeases`, `getLease`, `listLeasesExport`, non-throwing `probeLeases`.
  - **Mapper (`lib/integrations/rentvine/lease-mapper.ts`):** pure lease→`NonSheetCandidate` with a
    configurable field map; `leaseViewsFromExport` lifts `unit.rent`→`currrentRent` and keeps
    `lease.tenants[]`; emits the byte-identical `"Rentvine (read-authoritative)"` source_system;
    skips+counts unmappable leases (never silently drops).
  - **Health probe (`health-probe.ts`):** real `health.rentvine.api_key` transport (4 steps) over the
    existing `runHealthCheck` seam; one memoized probe call; PII/token-free details.
  - **Proof (`scripts/smoke-rentvine-read.ts`, `npm run smoke:rentvine-read [-- --live]`):** default
    dry; `--live` makes ONE read-only `GET /leases/export`. **Live result: 25 real leases → 25 mapped
    candidates, 0 skipped; auth HTTP 200; no rate-limit headers.** Output is shape-only/redacted (field
    NAMES + which key resolved each target; tenant→initials+length, rent→type); artifact under
    gitignored `temp/`.
  - **Wiring (`lib/lease-renewal/live-run.ts`):** `runLiveRenewalReview` reads the live export, maps to
    candidates, keeps the synthetic building-level/Google-Form candidates, and feeds
    `runRenewalPipeline` with `tables` injectable (synthetic until the live Sheet read lands). Result
    stays `production_allowed:false`, counts-only manifest, no writes. NOT wired into the SSR run page.
  - **Live Sheet read (built + wired):** `lib/google-sheets/{read-client,sheet-to-grids,health-probe}.ts`
    (read-only ADC reader, `spreadsheets.readonly` scope, injected `SheetsValuesReader`; pure
    values→`RawGrid[]`; `health.google_sheets.api` probe), `scripts/smoke-sheet-read.ts`
    (`npm run smoke:sheet-read`; counts-only/redacted; skips credential-marker tabs), and the combined
    `lib/lease-renewal/live-run.ts:runFullyLiveRenewalReview` (live sheet `tables` + live Rentvine
    candidates → pipeline). **Sheet id received** (`RENEWAL_SHEET_ID` in `.env.local`, gitignored). The
    `--live` attempt reached auth and surfaced the exact blocker: ADC is in a reauth-required state
    (`invalid_rapt`) and lacks the Sheets scope. **Unblock:** owner runs `gcloud auth
application-default login --scopes=openid,https://www.googleapis.com/auth/spreadsheets.readonly,https://www.googleapis.com/auth/cloud-platform`
    as `josiah@pmikcmetro.com`, then `npm run smoke:sheet-read -- --live`. In-scope tabs
    (1,2,3,5,6,8–18; never 4/7) + header interpretations are already documented; tabs 4/7 stay
    hard-excluded by ingest Stage B.
  - **Four `RENTVINE_DOC_UNKNOWNS` resolved:** auth = HTTP Basic; endpoints = `/api/manager/leases`,
    `/leases/{id}`, `/leases/export`; response field names confirmed live (tenant ← `lease.tenants[].name`,
    renewal_date ← `lease.endDate`, current_rent ← `unit.rent`); rate posture = 429+Retry-After, no
    headers observed on the probe. Plain `/leases` lacks tenant names + rent → the live read uses
    `/leases/export`.
  - **Verification:** `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`
    (**584/584 across 74 files**, +39), `npm run verify:falsification` (**391 committable files**) all
    PASS. RentVine reads are free; no deploy, no SoR write, no secret in any tracked file; every Action
    Registry entry stays `production_allowed:false`.
- Sync-and-readiness triple (2026-06-23, owner-directed "Do 3, then 2, then 1"). Three small, free,
  local slices answering an out-of-sync concern:
  - (3) Living plan: every `docs/plan.md` cross-product phase now carries a `Status:` line
    (`done`/`in progress`/`blocked`/`not started`; P0 done, P7 blocked, the rest in progress with
    one-line context). `AGENTS.md` Documentation Rules + Definition of Done now require updating the
    plan's Status in the same slice. `tests/unit/plan-status-sync.test.mjs` enforces a valid Status
    on every phase, contiguous from P0.
  - (2) Reality check: `npm run reality:check` (`scripts/reality-check.mjs`) reconciles the recorded
    map against live GCP using the existing FREE metadata reads (enabled APIs, Firestore database,
    Firebase project), prints an `in-sync`/`drift`/`partial`/`unverified` verdict, degrades to
    `unverified` (exit 0) without ADC, never writes, and explicitly lists the dimensions it does NOT
    yet auto-check (Cloud Run, billing/spend, datastore doc counts, Auth roster, Drive, Gmail) so
    coverage is honest. Pure `summarizeReality` unit-tested (5 cases) with synthetic live state.
  - (1) RentVine read-connection readiness: `.env.example` documents `RENTVINE_API_BASE_URL`/`KEY`/
    `SECRET`; `npm run preflight:rentvine` (`scripts/preflight-rentvine.mjs`) reports config presence
    (never prints secrets, never calls RentVine) plus the API-doc unknowns code can't resolve;
    `docs/products/rentvine-connection-setup.md` is the owner checklist. The real read client is the
    deferred next step — BLOCKED on RentVine's API doc (base URL, auth scheme, endpoint paths, lease
    response shape). RentVine reads do not bill the $10 GCP cap.
- Production cutover-readiness hardening — dry-run rehearsal (2026-06-23, owner-directed "plan the
  next phase of development", lane chosen: KB production cutover). New `scripts/cutover-dry-run.mjs`
  (`npm run cutover:dry-run`) runs the SAME `buildCutoverReport` as `cutover:report`, fed two
  synthetic, non-secret golden fixtures (`tests/fixtures/cutover/golden-production.env.fixture` +
  `golden-production-source-manifest.json`, all `sample-kb-fixture-*` placeholders), and asserts the
  four component gates (production env, source corpus, deploy preview, GCP infra) are green with
  only the one expected notification-send residual; it exits non-zero on any other blocker. New
  `tests/unit/cutover-readiness-golden.test.mjs` (17 tests): golden config greens every gate;
  negative fixtures prove each rejection (unapproved source, bucket/data-store placeholders, High
  sensitivity, demo project id, `ASK_DEMO_MODE=true`, non-https URL, missing Firebase key,
  notifications off, wrong `ALLOWED_HD`, non-pmikcmetro recipient). Purely additive — no change to
  any rejection-rule script. Docs: `docs/client-production-cutover.md` §1b (rehearsal) + §6
  (residual note); `docs/status.md`. Zero cost, no deploy, no sources, fully reversible. Closes the
  `docs/plan.md` P5 dry-run gate. Surfaced the `readiness.ok`-never-true finding (see Snapshot).
- Budget kill switch + e2e-runner CI fix (2026-06-22, owner-directed "configure the pub/sub kill
  switch and ensure it works"). New `infra/budget-guardrail/`: `decide.mjs` (pure decode of the
  Cloud Billing budget Pub/Sub notification + cap decision — uses the SMALLER of the env cap and the
  budget amount), `handler.mjs` (DI billing client; disables billing by clearing `billingAccountName`
  only when over cap AND billing still enabled), `index.mjs` (functions-framework entrypoint),
  `package.json` (its own deps, installed only at deploy time), README. `tests/unit/budget-killswitch.test.mjs`
  (11 tests) proves decode → decide → disable against the real payload with a mock billing client.
  PRINT-ONLY runbook `scripts/setup-budget-killswitch.mjs` (`npm run killswitch:plan`) emits the
  exact gcloud commands (topic, SA + billing-admin IAM, function deploy, project-scoped budget wired
  to the topic, a safe no-op wiring test) — it executes nothing. Docs: `docs/budget-killswitch.md`
  - corrected the stale billing-not-provisioned claim in `docs/budget-and-cost-policy.md`. Also
    Prettier-fixed `scripts/run-e2e-tests.mjs` (greens the CI that `9efa5c3` failed). No live call,
    no credentials, no cost, no deploy; GCP arming stays owner-side (billing-console Hard Stop).
- Lease Renewal Phase-1 read pipeline + review surface (2026-06-22, OQ-UI-1 / candidate (a),
  owner-directed). New, all on `work/lease-renewal-phase1-pipeline-ui`: (1) `pipeline.ts`
  `runRenewalPipeline` — a PURE orchestrator composing the existing ingest / fingerprint / header /
  normalize / join (match-only) / reconcile / severity / approval-queue-mapping units into one run
  (`RenewalRunResult`, flags grouped by severity, counts-only manifest, `production_allowed:false`);
  (2) `simulation.ts` + `sample-sheet.ts` — a deterministic fixture-fed simulation run (synthetic;
  tabs 4 & 7 exercised so the credential census is real); (3) the `/lease-renewal/runs` section
  (index + `[runId]` detail, `requirePageCapability("read")`, AppShell nav entry) rendering the run
  summary, excluded-tab census, and severity-grouped flags with candidate values / deep links /
  suggested-winner-or-Blocked; (4) the §3.5 resolve loop — `lib/firestore/lease-renewal-resolutions.ts`
  (pure `planLeaseRenewalResolution` + Firestore wrappers), `lease_renewal_resolutions` +
  `lease_renewal_resolution_activity` collections (server-write-only `firestore.rules`),
  `POST /api/lease-renewal/resolve`, and the interactive client controls (pick-a-source /
  corrected-value / flag-is-wrong, required reason, High/Blocked → Admin, no self-... ; Approver/Admin
  to resolve). A pick/corrected resolution QUEUES a proposed write-back (`production_allowed:false`);
  **no sheet/SoR write executes**. Repointed the queue-mapping deep link to `/lease-renewal/runs/...`.
  16 new unit tests + 3 new Firestore rules tests + a 5-case e2e file. No live call, no credentials,
  no cost, no deploy. Merged to `main` 2026-06-22 (`9efa5c3`).
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

- 2026-06-23 (sync-and-readiness triple, owner Windows host): `npm run format:check`,
  `npm run lint`, `npm run typecheck`, `npm test` (**545/545 across 68 files**, +13: plan-status 3,
  reality-check 5, preflight-rentvine 5), and `npm run verify:falsification` (**376 committable
  files**) all PASS. `npm run reality:check` (free; "not-checked" without `--live`) and
  `npm run preflight:rentvine` (reports missing env + the API-doc unknowns) behave as designed. New
  files plus small edits to `docs/plan.md`/`AGENTS.md`/`.env.example`/`package.json` — no change to
  existing rejection-rule scripts.
- 2026-06-23 (production cutover-readiness hardening — dry-run rehearsal, owner Windows host):
  `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`
  (**532/532 across 65 files**, +17 the new `cutover-readiness-golden` suite),
  `npm run cutover:dry-run` (green — four gates ok, 3 upload/3 import/3 seed corpus plan),
  `npm run verify:falsification` (**370 committable files**, +4 new), `npm run verify:router-boundary`,
  and `git diff --check` all PASS. Working tree limited to the new
  `scripts/cutover-dry-run.mjs`, `tests/fixtures/cutover/*`, `tests/unit/cutover-readiness-golden.test.mjs`,
  one `package.json` script line, and doc updates (`client-production-cutover.md`, `status.md`, this
  file) — no edits to any rejection-rule script.
- 2026-06-22 (budget kill switch + e2e-runner CI fix, owner Windows host): `npm run format:check`
  (clean repo-wide, incl. the previously-unformatted `scripts/run-e2e-tests.mjs` that failed CI on
  `9efa5c3`), `npm run lint`, `npm run typecheck`, `npm test` (**515/515 across 64 files**, +11 the
  budget kill-switch suite), `npm run check:budget-guard` (demo, $10 cap), and
  `npm run verify:falsification` (**366 committable files**) all PASS. `npm run killswitch:plan`
  renders the provisioning runbook with the real identifiers. The kill-switch `.mjs` lives under
  `infra/` (not typechecked by `tsc`, not bundled into the app) and its deps are deploy-time only.
- 2026-06-22 (lease-renewal Phase-1 read pipeline + review surface, owner Windows host):
  `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`
  (**504/504 PASS across 63 files**, +16: pipeline / simulation / resolution-plan / updated
  approval-queue-mapping), `npm run test:firestore` (**26/26 across 5 files**, +3 for the new
  `lease_renewal_resolutions` rules), `npm run verify:falsification` (**357 committable files**),
  `npm run verify:router-boundary`, `npm run check:budget-guard` (demo posture, away mode inactive,
  $10 cap), and `npm run build` (warning-free; new routes `/lease-renewal/runs`,
  `/lease-renewal/runs/[runId]`, `/api/lease-renewal/resolve`) all PASS. The lease-renewal e2e
  (`tests/e2e/lease-renewal-runs.e2e.test.mjs`) passed **5/5** under the Firestore emulator (auth-guard
  redirect, index/detail render with severity pill + "Simulation-only" + no "PLACEHOLDER", no-reason
  400, Approver-on-High 403, and the Admin pick-source resolve round-trip persisting a queued
  `production_allowed:false` write-back + Activity). NOTE (Windows harness): `npm run test:e2e`
  cannot spawn the bundled emulator / bare `vitest` on this host (pre-existing ENOENT) — run the
  e2e via `npx firebase emulators:exec --only firestore "npx vitest run --config vitest.e2e.config.ts <file>"`,
  or `npx vitest run --config vitest.e2e.config.ts <file>` for the no-emulator subset (the write
  round-trip self-skips without `FIRESTORE_EMULATOR_HOST`).
- 2026-06-20 (post-review hardening, pre-merge, owner Windows host): after fixing the 2 review
  majors + 3 nits — `npx vitest run` **488/488 PASS across 60 files** (+10 tests: impossible-date
  rejection, the §2.2.5 emit scrubber + drifted-credential-tab exclusion, the `blocked_reason`
  consistency case, and a dedicated `credential-guard` suite); `npm run format:check`,
  `npm run lint`, `npm run typecheck`, `npm run verify:falsification` (**344 committable files**),
  `npm run check:budget-guard`, and `npm run build` (warning-free) all PASS. This is the green state
  fast-forward merged to `main`.
- 2026-06-20 (Phase-1 deterministic build run COMPLETE — 12 slices / 14 units, owner Windows
  host): full `verify.sh`-equivalent green run by step — `npx vitest run` **478/478 PASS across 59
  files** (+91 lease-renewal tests over the 387 baseline); `npm run format:check`,
  `npm run lint`, `npm run typecheck`, `npm run verify:router-boundary`,
  `npm run verify:falsification` (**342 committable files**), `npm run check:budget-guard` (demo
  posture, away mode inactive, $10 cap), and `npm run build` (warning-free) all PASS;
  `npx tsx scripts/seed-action-registry.ts --dry-run --json` validated **17 entries, all
  production_allowed=false, no writes**. (`bash scripts/verify.sh` itself not run as one command —
  it leads with `npm ci`; every step it chains except `npm ci` was run individually and passed.)
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

- 2026-06-20 (Phase-1 deterministic build run): `npm run verify:falsification` passed across **342
  committable files**. Self-review of the 14-unit lease-renewal build: every module is a pure
  function / rule table tested with synthetic, sanitized fixtures — no fetch, SDK, Gmail, or live
  transport import anywhere; `runHealthCheck` and the lease-renewal read connector have NO live
  transport default (mock-injected only). Credential tabs 4 & 7 are hard-excluded at ingest and the
  emit scrubber keeps their cells out of records/manifest/queue artifacts; the `IngestManifest` and
  the Approval-Queue mapper are counts-/links-only with no raw cell value (PII stays in-boundary).
  Every Action Registry entry remains `production_allowed:false`; the write-back is mock/in-memory
  only and stays `Planned` behind the §4.0 admin-flag-off + per-write button-press model. Synthetic
  credential placeholders are digit-free PLACEHOLDER tokens, so the secret scanner stays clean. No
  secrets, no client data, no cloud/API/Gmail action, no deploy/import/send, no SoR write.
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

The `docs/plan.md` P5 dry-run gate is now closed (`npm run cutover:dry-run`). The remaining
cutover steps are sequenced behind client-owned work: §2 (real client GCP/Firebase project +
billing) and §4 (approved PMI KC source files + sensitivity classification) are client-blocked;
§3/§5/§6/§7 only run once those land. The one decision available without client input is the
owner's call on the `readiness.ok`-never-true finding above — whether `cutover:report` should
accept an approval flag (e.g. `--allow-notifications`) so a fully-approved cutover reaches
`readiness.ok === true`, or whether operators should keep reading past the one expected
notification-send blocker. If the owner picks the former, that is a small, well-scoped follow-up
slice (forward the flag through `buildCutoverReport` → `buildGcpSetupPlan`/`evaluateBudgetGuard`).

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
- ~~RentVine credential rotation~~ — RESOLVED (owner decision 2026-06-20): the existing RentVine
  credential is **used as-is, not rotated**. Still keep it out of git and load it only from
  env/Secret Manager (no-secrets rule).
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
spreadsheet currently contains live RentVine API credentials in a notes cell. Per owner decision
2026-06-20 these are **used as-is, not rotated**; they must still be loaded only from env/Secret
Manager and never committed. Record only non-secret references (tool name, access type, owner,
location label) in tracked docs.

## Resume Here

1. Read this file, then `docs/autonomous-agent-runner.md` and the latest `docs/status.md`
   entry.
2. If the trigger is "plan the next feature cycle", produce a decision-complete packet
   and stop. If the trigger authorizes running the loop, proceed unattended.
3. If the trigger is **"continue with feature development"**, open
   [`products/lease-renewal-build-plan.md`](products/lease-renewal-build-plan.md) and build the next
   zero-cost, deterministic Phase-1 unit from §3 (it carries the done-state, buildable units,
   open-questions/blockers register, and the two-track prod plan). Keep every Action Registry entry
   `production_allowed:false`. The existing RentVine credential is used as-is (owner decision
   2026-06-20, OQ-SEC-1 resolved — not rotated); load it from env/Secret Manager, never commit it.
4. Honor the stop gate: prefer client unblock / cutover / docs / regression work over new
   local product surface while blockers are client-owned.
5. Update this file at each slice boundary.
