# Loop State

Read `docs/facts.md` first. This is the short resume pointer; history belongs in
`docs/status.md`.

## Snapshot

- Last updated: 2026-07-18.
- The authorized end-to-end pass-one remediation cycle is active on
  `codex/process-audit-remediation-pass2`. Eight coherent commits through `82fad97` locally repair the
  Critical dependency, application state/routing defects, Test fixtures, Lease/Maintenance business
  lifecycle gates, publication/version continuation, cross-surface handoffs, Live app-decision
  projection, and resumable audit sidecars. The pass-two ledger gives every one of the 137 findings a
  root cause and disposition: 106 applicable/in progress and 31 evidence-excluded. The capability
  matrix maps all 281 stable cases and carries their pass-one result/evidence. Local `main` and
  `origin/main` remain at `77ee76e2f0b814c5a3cec2596a296ec7fe8570b8`; nothing from this repair
  branch is deployed yet.
- Deployed process-audit pass one is complete against the canonical Cloud Run application serving
  commit `38ebcf530e3fe193547806bace91246ccea20c0b`; the audit harness was built from local repository
  commit `2ca41cfe18de3ace79c7f4e1bf4c82474cf5be2c`. The resumable run
  `artifacts/process-audit/20260718T012316Z-pass1/` is gitignored and validates cleanly: all 281 cases
  are terminal, with 222 completed, 59 precisely blocked, 137 normalized findings, 1,798 ordered
  events, 279 case-specific DOM records, 110 bodyless structured records, and two Test-only
  screenshots. All 32 reviewer-checklist items map to cases. No product defect was repaired in this
  pass. A later repair pass should consume `run-report.md`, `findings.jsonl`, and `manifest.json`
  without replaying completed Test mutations.
- Focused remediation verification is green: runner 37/37, publication/workflow 28/28, Live renewal
  projection and decision persistence 49/49, Lease Test/spec suites, Firestore suites, typecheck, and
  lint with the eight existing warnings. The transitive `websocket-driver` lockfile is updated to the
  fixed `0.7.5` release with a production-dependency regression assertion. Full repository validation
  and the clean integrated-state verifier remain the next gate.
- The reusable runner now rejects inferred pass defaults, same-count contract drift, duplicate
  evidence references, unsafe sidecars, stale sidecar revisions, and non-idempotent amendment replay.
  Pass two has bodyless auth, ledger, and capability checkpoints; role sessions are not terminally
  ready until the deployed browser phase provisions and separates Admin, Editor, secondary Admin,
  canonical Test Vendor, and public contexts.
- Active branch: `codex/process-audit-remediation-pass2`; the pass-one main/deployed baseline is
  unchanged and remains the rollback target until integration succeeds.
- Goal: resolve or evidence-based exclude all 137 pass-one findings, add deterministic isolated Test
  fixtures and role/session coverage, validate the full repository, integrate and deploy the exact
  verified commit, then complete a deployed browser pass two and restore every temporary Test
  baseline. Existing provider-activation and human-secret ceremonies remain independent unless a
  safe fixture or already-authorized bodyless read proves them.
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

1. Finish Tier-0/status documentation, then run format, lint, typecheck, full unit/Firestore/core-E2E,
   falsification, redaction, context/spec gates, the all-in-one verifier, and pass-two running-state
   integrity checks. Correct remediation-caused failures only.
2. Use the established GitHub workflow to push and integrate the verified branch into `origin/main`;
   recheck ADC/identity/budget/cutover state and deploy that exact integrated commit to the canonical
   Cloud Run service, retaining the current revision as rollback target.
3. Establish five isolated role/public browser contexts, run every safely reachable stable case on the
   deployed revision, record pass-two evidence/findings/deltas, fix and redeploy any regression, make
   all applicable ledger/matrix rows terminal, restore Test/Vendor/staff baselines, and finalize the
   resumable run/report.

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
