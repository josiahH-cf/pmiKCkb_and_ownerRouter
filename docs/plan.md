# Current plan

Updated: 2026-09-11 (UTC).

## Outcome

Complete and deploy S113 in docs/feature-suites/renewal-workflow-consolidation.md. The delivered
scope is one dashboard, supported source corrections, RentCast comp/trend preparation, supplied
rich/plain messages with governed Gmail drafts, audited manual completion and the integrated guide.
Persistent labeled insurance, renewal information and legal-form boxes accept pending-team blanks.
Missing resource values do not block S113 implementation or deployment.

## Current implementation baseline

Production serves d243911cb20ffb01773072c0e27c723648eeea34 as
pmi-kc-app-rmtkmhj1z-8855e4c6dbfb at https://pmi-kc-app-kq6wuvpiva-uc.a.run.app, 100% traffic.
The prior zero-traffic 6e77d18 candidate refuses fixed-row update/delete/restore; S113 replaces
normal field-update refusal under explicit owner authority and preserves the deletion refusal.
S96 — safe connector disconnect and reconciliation is serving. The readiness program and S113 are on main; the latest 919a2ae attempt was promoted and then
rolled back as recorded below.

S113 and its first release corrections are pushed through `919a2ae70c23ff304cef7e1699cee1539712e40f`.
Exact CI 34549763928 passed all five jobs (the retained first backend attempt was 199 PASS/2 FAIL;
an unchanged retry passed all 201). Candidate `pmi-kc-app-rmtw9sc8z-1ffcfff358ae` passed smoke,
configuration, domains and aggregate Admin/source assurance. Its v4 candidate receipt was issued
2026-09-11 01:48:59 UTC and its promotion receipt verified 01:49:17 UTC.
Post-promotion observation FAILED at 420,140 ms: all 13 final Admin routes rendered with zero
browser diagnostics/mutations, but the final reconciliation did not finish before the fixed
420,000 ms cutoff. One complete checkpoint is insufficient. The real driver restored the captured
predecessor and verified rollback; canonical again serves `d243911cb20ffb01773072c0e27c723648eeea34`
/ `pmi-kc-app-rmtkmhj1z-8855e4c6dbfb`. Checkpoint remains terminal `rolled_back_verified`.
R33 is corrected and locally verified. One coherent memory-only DOM snapshot and at most three
independent canary pages retain every assertion, source-before/after read, mutation guard and
shared cancellation. The 300,000 ms window and 420,000 ms cutoff are unchanged. All 89 affected
tests and the full canonical native run pass: 6,528 units, four existing skips, all 201 backend
tests, policies and production build. Live timing diagnosis read all 311 rows with stable sources
and zero mismatches; it is not a release receipt. All 33 in-scope findings are closed locally;
the new exact release must establish observation acceptance. Owner-completed enrollment at 01:36 UTC verified exact
CLI/ADC refresh; Admin-only policy and the exact predecessor exception remain approved.
The superseded a3c1d97 candidate passed aggregate assurance but never attempted promotion.
Its unconsumed receipt remains preserved. All failed receipts/checkpoints retain their actual results.
New exact CI, candidate assurance, promotion, observation and final readbacks remain mandatory.

The earlier 00836a8 candidate also remains unpromoted.

F1-F5 is implemented locally. Full units pass 6,528 tests with four existing skips; 201 backend
checks pass through actual mounted controls, routes, Firestore, claims, receipts and readbacks.
External effects use deterministic adapters; staff-recorded completion remains distinct from
provider verification. Core HTTP E2E passes 31 tests, with 18 intentionally skipped in its separate
no-Firestore group. Canonical verification phases and affected build/tests pass. The 42-step
compiled guide and all six other applicable browser checks pass. Fragment history and independent
workspace read scheduling are corrected; the full desk passes its unchanged deadlines.
Current evidence: docs/evidence/s113-implementation-review-2026-09-10.md.

Normal S106/S34 packet preparation, approval, exact S21 content, S20 execution and own-receipt
recovery pass backend acceptance. Actual forms/catalog, mappings, connection/consent/selection and
exact closed keys remain separate gates. No signature-send/status capability is invented.
The supplied owner and tenant v2 templates are published and read back approved with exact immutable
hashes and the existing Admin approver. Old review-only versions remain unchanged.

## Canonical closure sequence

1. Implementation/backend/browser acceptance and all 33 in-scope findings pass. H1-H8 model
   verdicts contain concrete evidence; human review stays NOT RUN. Final delivery checks pass.
2. Commit/push the green source/reconciliation correction after final documentation checks. Preserve the verified status GET and exact predecessor exception.
3. Require green exact-main-SHA CI; create an isolated clean checkout and zero-traffic candidate.
   Archive the terminal 919a2ae checkpoint with its passed promotion, failed observation and verified rollback.
4. Verify exact candidate SHA/revision, runtime configuration, domains, existing owner Admin on
   both exact origins, independent source reconciliation and the bound candidate receipt.
5. Promote that exact revision, pass the 300,000 ms observation and read back serving revision,
   traffic and backend state. Align only the two approved Sheet Registry descriptive entries;
   backup, compare-and-set and read back, preserving all 48 entries and 16 open keys.
6. Update documentation and meeting brief to verified deployment; push documentation-only closure
   and restore the existing local release watcher. Do not deploy a documentation-only change.

S36 is queued behind complete S100. B-S100/B-MNT1 inputs remain separate from this request.

## Authority and closed decisions

The owner authorized the full manual dashboard, staff-recorded progression, supported normal Sheet
updates, RentCast restoration and supplied deterministic copy/Gmail repair. Existing-row changes
require fresh exact preview/confirmation, one-attempt claims, receipts/readback and separately
confirmed correction. No new provider-contract prerequisite or feature approval is required.
The owner accepts Admin-only browser assurance on both origins; Editor remains not_run and backend
role checks remain.
The owner approved only the exact blocked legacy My Work reconcile exception on captured
predecessor d243911 / pmi-kc-app-rmtkmhj1z-8855e4c6dbfb at the canonical origin. Version 4 receipts
retain Admin `failed_known_legacy_defect`, Editor `not_run`, and exact blocked-request evidence.
The guard must successfully abort the single POST /api/work body {action:reconcile} before dispatch;
all route landmarks, monitoring and other diagnostics must pass. The candidate and post-promotion
checks still require zero mutation attempts. No business write is allowed by this exception.
No account, IAM, claim, action key, send authority or budget control changes.
The 24-hour authentication longevity proof remains separate and unverified.

Completed S97-S99 and S100 chat proofs are not rerun. B-GOLD1 remains closed under its exact
owner-approved correction; original captures and source values stay private and unchanged.
No fake production workflow, customer draft/send, row deletion or invented legal content is added.

## Per-suite delivery rule

Implementation/backend/adversarial acceptance precedes commit and deployment. Exact-SHA CI,
candidate smoke/configuration/browser assurance, receipt-bound promotion and observation are
mandatory. ALL_GATES_GREEN names only actually completed gates; no external provider input is
represented as available. S113 acceptance and S106/S34 resource-dependent activation are separate.

The remaining queue is unchanged. S87 — final six-cohort product-wide content reconciliation
retains its dependencies; S36 and new automation do not expand this implementation run.
