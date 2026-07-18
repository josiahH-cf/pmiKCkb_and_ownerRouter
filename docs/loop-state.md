# Loop State

Read `docs/facts.md` first. This is the short resume pointer; history belongs in
`docs/status.md`.

## Snapshot

- Last updated: 2026-07-18.
- Deployed process-audit pass one is complete against the canonical Cloud Run application serving
  commit `38ebcf530e3fe193547806bace91246ccea20c0b`; the audit harness was built from local repository
  commit `2ca41cfe18de3ace79c7f4e1bf4c82474cf5be2c`. The resumable run
  `artifacts/process-audit/20260718T012316Z-pass1/` is gitignored and validates cleanly: all 281 cases
  are terminal, with 222 completed, 59 precisely blocked, 137 normalized findings, 1,798 ordered
  events, 279 case-specific DOM records, 110 bodyless structured records, and two Test-only
  screenshots. All 32 reviewer-checklist items map to cases. No product defect was repaired in this
  pass. A later repair pass should consume `run-report.md`, `findings.jsonl`, and `manifest.json`
  without replaying completed Test mutations.
- The clean repository verifier passes format, lint, typecheck, 307 unit files/2,215 tests, governance
  gates, redaction, and the 76/76 production build. The current production dependency audit now
  reports one critical transitive `websocket-driver@0.7.4` advisory through Firebase; direct
  application reachability is not yet proven. Pass one records it as `FND-PRE-009-01` and makes no
  dependency change.
- Final adversarial runner review recorded and corrected three additional harness defects: inferred
  pass defaults, same-count contract drift, and duplicate evidence references. The clean retry has a
  canonical contract fingerprint, zero definition drift, zero duplicate-reference arrays, and no
  replayed Test effect.
- Active branch: `main`; the Test Vendor reset/re-enable, internal-roster separation,
  deployment-wrapper hardening, and Approval Queue time-zone fix are committed, pushed, and deployed.
- Goal: close the stable working V1 on the client-owned Cloud Run service and deliver the final human
  HTML walkthrough. Deployment, desktop/phone browser acceptance, and current-revision
  rollback/restore rehearsal are complete. The Test Vendor secret-bearing ceremony is the sole
  remaining acceptance.
- V1 truth: application readiness and provider activation are separate. Production carries Live
  records and visibly isolated persistent Test records. Test workflows may write app/Firestore
  state and reach Done, but their executors make zero external calls and never prove Live.
- Current serving release: commit `38ebcf530e3fe193547806bace91246ccea20c0b`, successful Cloud
  Build `f106ceb4-02d0-497c-b147-f716e04c0149`, revision
  `pmi-kc-kb-demo-rmrm9mp6v-04c897acee28` at 100% traffic, image digest
  `sha256:25358a99d6f4890da64db6d3cb17b0ca7d3725c7f0251390b7c6dc8b12ba8103`, and Firestore
  ruleset `63b31613-59ba-495c-9ef3-455a5c593f51`. Its captured serving predecessor is
  `pmi-kc-kb-demo-rmrm8t6y7-d250f83ddfee`.

## Deployed and Proven

- Gmail execution is lane-bound: workflow-linked reads, governed labels, review-only source-backed
  proposals, and exact-confirmed replies are the product boundary. `gmail.draft.create` is
  production-closed; generic compose/send remains unavailable.
- Persistent production Test Lease run
  `test-renewal-019f6599-af50-7451-88ea-e2592fc001a2` reached Done with eleven receipts, eleven
  attempts, zero Live calls, and state preserved after reload.
- The Admin Test workspace passed Vendor 11/11, Lease 11/11, and Maintenance 19/19 with zero Live
  calls. Maintenance and Vendor lane isolation remain enforced.
- The final serving revision passed delayed direct signed-in loads for Ask, Spaces, Approval Queue,
  Gmail Hub, Connections, Admin, Lease Renewal, and Maintenance at desktop and 375px phone widths.
  Every route showed the expected H1, no horizontal overflow, and zero console errors; final-revision
  Cloud Run logs showed no checked ERROR-level entries.
- Production acceptance found a real Approval Queue hydration mismatch: the initial activity time used
  the Cloud Run host time zone while Chrome used Kansas City. The formatter now explicitly uses
  `America/Chicago`, and a regression test pins the server/browser-stable output.
- The final rollback rehearsal moved 100% traffic from
  `pmi-kc-kb-demo-rmrm9mp6v-04c897acee28` to
  `pmi-kc-kb-demo-rmrm8t6y7-d250f83ddfee`. Staff and Vendor sign-in returned 200,
  unauthenticated `/ask` redirected to `/sign-in`, and the existing signed-in Console worked. Traffic
  returned 100% to the final revision with the same healthy boundaries and no ERROR entries in the
  final-revision log query. The earlier `f02112d / 00025-mhw` rehearsal remains historical evidence.
- Identity Platform global MFA and the TOTP provider are enabled with adjacent interval `1`.
- The deployed release's clean-install all-in-one verifier is green: 306 unit files/2,179 tests,
  Firestore 17/59, core E2E 32 passed/18 intentional prerequisite skips, 76/76 production pages/routes, and all
  governance gates. The dependency audit is three Moderate dev-only findings and zero runtime
  findings; the cutover dry-run is fully green.
- The canonical `.invalid` Test Vendor can now be reset/re-enabled from `pending_setup`, `active`, or
  `disabled` after an Admin reason and exact UID/status/invite-version preview. Reset rotates the
  Firebase UID and invalidates password/TOTP/session/action-link/UID-confirmation artifacts while
  preserving the stable Vendor id and Test workflow data. Partial failures stay disabled; no Live,
  OAuth, provider, vault, or Registry effect occurs.
- Prepared-crash reload binds the original source without displaying UID. While the lease is live,
  only the original reason reproduces the same preview; after expiry a fresh reason can bind that
  source and atomically records the distinct bodyless recovery-claim audit. Takeover quarantines every
  abandoned UID, allocates a distinct fresh UID, preserves one prepared invite increment/canonical
  reset audit, and fences delayed old-owner work from the winner.
- Reset/setup-link initial claims and successful completions use distinct bodyless audit actions; a
  failed pre-completion attempt retains its honest claim event and never exposes UID/link/plaintext
  reason/secret. Test mailbox reads and writes revalidate current active UID/assignment/thread/reset
  state transactionally, so disable, deassignment, rotation, or reset claim revokes stale access.
- Disable/reset serialize deterministically: claimed/prepared reset blocks disable before side effects;
  disable-first stales the old preview but permits a fresh disabled-state reset; completed permits
  disable.
- The internal People/Access, role/scope, ID-token, and session boundaries reject any identity carrying
  a `vendor`, `vendor_id`, or `data_mode` claim key—even false/empty/malformed or using the staff
  domain. The separate Vendor path requires the exact valid three-claim tuple. The deploy wrapper
  promotes the exact revision created by that invocation so a prior rollback pin cannot strand it and
  a concurrent deploy cannot redirect traffic through floating `LATEST`.

## Next Exact Actions

1. Use the completed pass-one findings and stable case IDs for the separately authorized repair pass,
   beginning with the Critical dependency advisory and High application defects; do not replay
   completed Test mutations or treat Test receipts as Live activation proof.
2. When an owner-present session is available, complete only the remaining explicit human ceremonies:
   canonical Test Vendor password/TOTP, secondary-role sessions, and exact operational confirmations.
3. Rerun the affected audit cases after repairs and append a new pass rather than rewriting pass-one
   evidence.

## Advisory Post-V1 Activations

- A Live Vendor mailbox needs a routable Vendor, same-address OAuth client/redirect, and token vault.
- An unavailable Live Rentvine, LeadSimple, Dotloop, QuickBooks, Boom, Sheets, SMS, or Drive action
  needs its exact provider contract, credential, and authoritative mapping before that action alone
  is enabled.
- Native TTL, extra indexes, and Scheduler remain optional until measured volume warrants them.

These are independent Live-action activations, not an all-provider application-release gate.

## Locked Safety

- No autonomous/scheduled/bulk/model-triggered send.
- No guessed provider endpoint/value or customer data in git/evidence.
- Every Live external effect is target-labeled, human-confirmed, one-attempt, idempotent, receipted,
  reconcilable, monitored, and reversible.
- Ambiguous outcomes reconcile before correction; Test receipts never claim Live.
- Staff/cloud identities remain `pmikcmetro.com` or `pmi-kc-kb-prod`; no personal account.

## Resume

Read `AGENTS.md`, `docs/facts.md`, this file, the newest `docs/status.md` entry, and the relevant
feature-suite spec. Preserve concurrent user work and continue at the first incomplete Next Exact
Action without reopening settled working-app V1 decisions.
