# Loop State

Read `docs/facts.md` first. This is the short resume pointer; history belongs in
`docs/status.md`.

## Snapshot

- Last updated: 2026-07-15.
- Active branch: `codex/working-app-v1` from synchronized `main` at `85e4b783`.
- Goal: ship the stable working V1, commit/merge/push, deploy to the client-owned Cloud Run
  service, validate production, and deliver the human HTML walkthrough.
- V1 truth: application readiness and provider activation are separate. Production has
  explicit Live and isolated Test lanes. Test records may write app/Firestore state and reach
  Done; they make zero external calls and cannot prove Live.
- Current serving baseline before this release: revision `pmi-kc-kb-demo-00021-bj8` at 100%; prior
  revision `pmi-kc-kb-demo-00020-24d`; canonical URL
  `https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app`.

## Implemented in the Working Tree

- Shared `DataMode` normalization and Live/Test evidence markers.
- Production Console shows separate Live Rentvine projection and invented Test projection; no
  fallback or browser mode switch.
- External action identity/record/receipt/audit binds lane. Production Live rejects Test; the
  isolated production Test orchestrator is memory-only and accepts only branded no-client adapters.
- Admin V1 Test workspace runs Vendor, all eleven Lease, and all nineteen Maintenance typed actions,
  reporting zero Live-provider calls and non-Live evidence.
- Maintenance supports Live tickets plus canonical persistent Test seed, Summit Test Vendor
  assignment, status/notes/activity, six explicit simulated actions with receipts, close/reopen, and
  cross-lane rejection.
- Vendor supports canonical Admin provision preview, one-response Firebase password link, password/
  TOTP with fresh re-sign-in, lane-bound assigned tickets, app-only Test mailbox drafts/labels/exact
  replies, and exact disable/revoke. Test rejects OAuth/Gmail construction.
- Release report separates application workflow readiness, advisory provider states, and advisory
  Dan/Josiah signoffs; repeated 169-gate framing is retired.
- Production Identity Platform now has Email/Password/password-required and TOTP interval `1`; the
  canonical host and Google provider remain enabled.
- Final adversarial audit fixes bind S20/dependencies/Admin Vendor Gmail to lane, make Maintenance
  Test actions one-receipt/idempotent, and make concurrent Test Vendor mailbox replies atomic.
- Core governance, product docs, plan, engineering workflow, S22/S23/S25/S26/S27 specs, operations
  docs, and the human HTML report use the same contract. TTL/index/Scheduler are optional.

## Verified So Far

- Format, typecheck, and lint are green; lint has zero errors and eight known test-mock warnings.
- Full unit suite: 299 files / 2,046 tests green.
- Firestore emulator: 16 files / 56 tests green on an isolated port.
- Core E2E: 32 passed / 18 intentionally skipped.
- Production build: 75 routes green.
- All-in-one clean-install verifier is green through formatting, lint, typecheck, unit, router,
  falsification, context, traceability, redaction, and build.
- Dependency inventory remains three Moderate dev-only `firebase-tools`-chain findings, zero High or
  Critical.

## Next Exact Actions

1. Commit the feature branch, merge to `main`, push, deploy, capture new/prior revisions, and verify
   endpoint/auth/API boundaries.
2. Use signed-in browser acceptance at desktop/phone widths. Exercise Admin Test workspace,
   Maintenance Test to Done, and Test Vendor password/TOTP/assigned-ticket flow where the Auth setup
   permits it.
3. Record production evidence in facts/status/plan/HTML and complete the goal.

## Genuine External Activations (not app blockers)

- Live Vendor Gmail needs a routable Vendor, same-address OAuth client/redirect, and token vault.
- Each unavailable Live Rentvine/LeadSimple/Dotloop/QuickBooks/Boom/Sheets/SMS/Drive action needs its
  exact provider contract, credential, and authoritative mapping before that action is enabled.
- Optional TTL, extra indexes, and Scheduler can wait for measured volume.

## Locked Safety

- No autonomous/scheduled/bulk/model-triggered send.
- No guessed provider endpoint/value or customer data in git/evidence.
- Every Live external effect is target-labeled, human-confirmed, one-attempt, idempotent, receipted,
  reconcilable, monitored, and reversible.
- Ambiguous outcomes reconcile before correction; Test receipts never claim Live.
- Staff/cloud identities remain `pmikcmetro.com` or `pmi-kc-kb-prod`; no personal account.

## Resume

Read `AGENTS.md`, `docs/facts.md`, this file, newest `docs/status.md`, and the relevant feature-suite
spec. Inspect branch/worktree, preserve concurrent user work, and continue at the first incomplete
Next Exact Action without reopening settled R01–R09 decisions.
