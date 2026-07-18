# Loop State

Read `docs/facts.md` first. This is the short resume pointer; history belongs in
`docs/status.md`.

## Snapshot

- Last updated: 2026-07-18.
- The validated remediation series was integrated through protected PR #76. Local `main` and
  `origin/main` are `3033eac81629cd2a67a111256bbdc226b94edbce`; CI and the clean integrated
  all-in-one verifier passed. That exact commit is serving at 100% on revision
  `pmi-kc-kb-demo-rmrqf0ce6-ac7fc4d500ea` with image digest
  `sha256:fefa53d611bf0a73c8669eed23f85a517030dfd00ca575666896ce21a6c79868` and the
  managed production runtime service account. The retained rollback revision is
  `pmi-kc-kb-demo-rmrm9mp6v-04c897acee28`.
- The active regression-repair branch is `codex/vendor-handoff-pass2`. Deployed pass two has 12
  terminal cases: nine pass, two expected denials, and one reproduced failure. The isolated canonical
  Test Vendor completed reset, response-only password setup, TOTP enrollment/challenge, assigned-ticket
  access, draft, approved label, exact reply, duplicate-click suppression, Waiting, Complete,
  cross-ticket denial, and route-level cross-mode denial with zero provider/Live effects.
- The reproduced failure is `VENDOR-PORTAL-011`: Maintenance showed the canonical Test assignment and
  no-Live-communication boundary but not the bodyless Vendor mailbox state/history/next action. The
  current branch adds a read-gated `no-store` Test projection and reconstructs legacy mailbox history
  from the deterministic initial Waiting state plus current state. Focused route/component/service/
  Firestore-boundary suites are 34/34 green; format, lint, and typecheck pass. The repair still needs
  integration, exact-commit deployment, and deployed case-result amendment.
- Deployed process-audit pass one is complete against the canonical Cloud Run application serving
  commit `38ebcf530e3fe193547806bace91246ccea20c0b`; the audit harness was built from local repository
  commit `2ca41cfe18de3ace79c7f4e1bf4c82474cf5be2c`. The resumable run
  `artifacts/process-audit/20260718T012316Z-pass1/` is gitignored and validates cleanly: all 281 cases
  are terminal, with 222 completed, 59 precisely blocked, 137 normalized findings, 1,798 ordered
  events, 279 case-specific DOM records, 110 bodyless structured records, and two Test-only
  screenshots. All 32 reviewer-checklist items map to cases. No product defect was repaired in this
  pass. A later repair pass should consume `run-report.md`, `findings.jsonl`, and `manifest.json`
  without replaying completed Test mutations.
- The pass-two ledger still maps all 137 pass-one findings (106 applicable/in progress and 31
  evidence-excluded), and the capability matrix still maps all 281 stable cases. The run remains
  resumable and running; 269 cases are pending. The Test Vendor identity/session is established, while
  reusable restricted-staff and secondary-Admin session evidence plus the unauthenticated public check
  remain to be made terminal in the auth sidecar.
- The reusable runner now rejects inferred pass defaults, same-count contract drift, duplicate
  evidence references, unsafe sidecars, stale sidecar revisions, and non-idempotent amendment replay.
  Pass two has bodyless auth, ledger, and capability checkpoints; finalization still requires separated
  Admin, restricted staff, secondary Admin, canonical Test Vendor, and public contexts to be ready.
- Active branch: `codex/vendor-handoff-pass2`; `3033eac` is the current integrated/deployed baseline and
  `pmi-kc-kb-demo-rmrm9mp6v-04c897acee28` is the retained rollback revision.
- Goal: resolve or evidence-based exclude all 137 pass-one findings, add deterministic isolated Test
  fixtures and role/session coverage, validate the full repository, integrate and deploy the exact
  verified commit, then complete a deployed browser pass two and restore every temporary Test
  baseline. Existing provider-activation and human-secret ceremonies remain independent unless a
  safe fixture or already-authorized bodyless read proves them.
- V1 truth: application readiness and provider activation are separate. Production carries Live
  records and visibly isolated persistent Test records. Test workflows may write app/Firestore
  state and reach Done, but their executors make zero external calls and never prove Live.

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

1. Run the full validation stack on `codex/vendor-handoff-pass2`, integrate it through the protected
   GitHub path, recheck ADC/identity/budget/cutover state, and deploy that exact integrated commit.
2. Reopen the canonical Test Vendor session on the new revision, expand the Maintenance Vendor handoff,
   record bodyless Waiting/Complete/history/next-action evidence, and amend `VENDOR-PORTAL-011` from the
   reproduced failure to its verified deployed result.
3. Continue every remaining stable case with grouped route evidence, establish restricted-staff,
   secondary-Admin, and public contexts, terminalize all ledger/matrix rows, restore every Test/Vendor/
   staff baseline, finalize the resumable report, and perform final exact-commit deployment parity.

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
