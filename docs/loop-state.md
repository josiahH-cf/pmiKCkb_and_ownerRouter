# Loop State

Read `docs/facts.md` first. This is the short resume pointer; history belongs in
`docs/status.md`.

## Snapshot

- Last updated: 2026-07-15.
- Active branch: `main` with a locally verified, uncommitted Test Vendor reset/re-enable,
  internal-roster separation, and deployment-wrapper hardening slice on top of the recorded
  production checkpoint. Do not treat the working-tree candidate as deployed.
- Goal: finish the stable working V1 on the client-owned Cloud Run service and deliver the final human
  HTML walkthrough. Core production/browser/rollback evidence is complete; the hardened candidate is
  locally verified and needs commit/push/deploy before the human Test Vendor secret-bearing acceptance.
- V1 truth: application readiness and provider activation are separate. Production carries Live
  records and visibly isolated persistent Test records. Test workflows may write app/Firestore
  state and reach Done, but their executors make zero external calls and never prove Live.
- Current serving checkpoint: commit `7ccd9f213d51d6723d1a6467fe656f3b4724d6a5`, Cloud Build
  `840e3b52-ae0e-43b8-bcbf-a25045d5705a`, revision `pmi-kc-kb-demo-00026-cxk` at 100% traffic,
  image digest `sha256:1012dde4878af0c582c5c00f6fc1d5ad3374391ebfc1e2ae2e0747453b03a1ac`,
  and Firestore ruleset `63b31613-59ba-495c-9ef3-455a5c593f51`. Its serving predecessor is
  `pmi-kc-kb-demo-00025-mhw`.
- Current local release candidate: uncommitted hardening on top of `7ccd9f2`; final verifier counts,
  commit, build, image, serving revision, and captured prior revision remain pending until closeout.

## Deployed and Proven

- Gmail execution is lane-bound: workflow-linked reads, governed labels, review-only source-backed
  proposals, and exact-confirmed replies are the product boundary. `gmail.draft.create` is
  production-closed; generic compose/send remains unavailable.
- Persistent production Test Lease run
  `test-renewal-019f6599-af50-7451-88ea-e2592fc001a2` reached Done with eleven receipts, eleven
  attempts, zero Live calls, and state preserved after reload.
- The Admin Test workspace passed Vendor 11/11, Lease 11/11, and Maintenance 19/19 with zero Live
  calls. Maintenance and Vendor lane isolation remain enforced.
- All eight internal surfaces loaded signed-in. Clean direct phone loads at 390x844 showed no
  horizontal overflow, visible alerts, or reproducible console errors. Cloud Run logs showed zero
  ERROR entries for the checked candidate window.
- Historical rollback evidence on `f02112d / 00025-mhw` moved traffic to
  `pmi-kc-kb-demo-00024-6b2` and restored `00025-mhw`; unauthenticated and signed-in boundaries stayed
  healthy. Capture and rehearse the current candidate's own prior revision after its deploy.
- Identity Platform global MFA and the TOTP provider are enabled with adjacent interval `1`.
- The final hardening candidate's clean-install all-in-one verifier is green: 306 unit files/2,178 tests, Firestore
  17/59, core E2E 32 passed/18 intentional prerequisite skips, 76/76 production pages/routes, and all
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

1. Commit/push and deploy the locally verified reset/re-enable candidate; confirm the wrapper promotes
   exact named revision, record the new build/revision/digest/prior, and rerun boundary smoke/log
   checks.
2. Complete the human Test Vendor password/TOTP/assigned-ticket/mailbox journey, disable it, reset it,
   prove UID rotation plus preserved Test workflow data, and complete a fresh password/TOTP sign-in.
   Automated Vendor 11/11 evidence is not a substitute for this secret-bearing flow.
3. Synchronize final evidence and the human HTML walkthrough, commit/push the closeout, then complete
   the goal.

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
