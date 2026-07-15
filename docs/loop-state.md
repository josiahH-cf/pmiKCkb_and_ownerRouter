# Loop State

Read `docs/facts.md` first. This is the short resume pointer; history belongs in
`docs/status.md`.

## Snapshot

- Last updated: 2026-07-15.
- Active branch: synchronized `main` at
  `f02112d9f5ea3dd5a223a46bcc76a96a5c314b97` (`origin/main` matches).
- Goal: finish the stable working V1 on the client-owned Cloud Run service and deliver the final human
  HTML walkthrough. Core production/browser/rollback evidence and the final all-in-one verifier are
  complete; only the human Test Vendor secret-bearing acceptance remains.
- V1 truth: application readiness and provider activation are separate. Production carries Live
  records and visibly isolated persistent Test records. Test workflows may write app/Firestore
  state and reach Done, but their executors make zero external calls and never prove Live.
- Current candidate: Cloud Build `0be21660-bfe6-47e7-8e33-ff1b5b21bd10`, revision
  `pmi-kc-kb-demo-00025-mhw` at 100% traffic, image digest
  `sha256:23e75a9dc7ee22258794814e986dece1ba8303609f7d516ca5d58148109e4625`, and
  Firestore ruleset `63b31613-59ba-495c-9ef3-455a5c593f51`. Captured prior revision:
  `pmi-kc-kb-demo-00024-6b2`.

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
- Traffic rollback to `pmi-kc-kb-demo-00024-6b2` and immediate restoration to `00025-mhw` succeeded;
  unauthenticated and signed-in boundaries stayed healthy.
- Identity Platform global MFA and the TOTP provider are enabled with adjacent interval `1`.
- The clean-install all-in-one verifier is green: 304 unit files/2,089 tests, Firestore 17/59, core
  E2E 32 passed/18 intentional prerequisite skips, 76/76 production pages/routes, and all governance
  gates. The dependency audit is three Moderate dev-only findings and zero runtime findings.

## Next Exact Actions

1. Complete the human Test Vendor password/TOTP/assigned-ticket/mailbox journey; automated Vendor
   11/11 evidence is not a substitute for this human secret-bearing flow.
2. After the Vendor journey, synchronize its final evidence, commit/push the documentation closeout,
   then complete the goal.

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
