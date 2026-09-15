# Current plan

Updated: 2026-09-15 (UTC).

## Outcome

Feature 6 (global clarity and response times) is implemented on
`codex/renewal-clarity-response-times`; verification passed. It is not yet pushed,
merged or deployed. Features 1-5 remain deployed.

The shared navigation now describes each destination's purpose. The Dashboard and renewal table
explain where to start; lease sections name the work they contain and explain their inputs and saved
destinations. Market estimates, charge frequency, source notes and staff activity fields use plain
wording. Existing field identifiers, source provenance, value routing and draft/write boundaries remain.

The global Admin navigation previously loaded request rows and the managed-user directory just to
show a pending count. It now calls the existing count query after the same current-Admin check.
Independent Dashboard and shared decision-summary reads run together, retaining scope filtering,
source freshness and independent failure handling. No cache lifetime, policy or runtime setting changed.
These are observed code-path improvements; no numerical response-time claim is made.

Existing label assertions are aligned with the new copy. The release reader requires the captured
Feature 5 commit's old section labels and the candidate's new labels, preserving all section,
destination, visibility and safety checks. Full verification passed: 6,532 unit tests, 201 backend
tests, formatting, lint, types, policy checks and production build. Existing selectors were corrected
for the renamed sections; no test or deadline was added or weakened. Unit results are retained in
`/tmp/pmi-f6-verify-final.log`, backend results in `/tmp/pmi-f6-backend-rerun.log`, and remaining policy
and build results in `/tmp/pmi-f6-policy-build.log`. Push, merge and serialized production release remain.

## Current implementation baseline

Production serves `82a2cf80ab0e17c9a947a54204524f7cd282eb93` as `pmi-kc-app-rmu2a59tx-28c0417b4693` at 100% traffic. Exact main [CI 34935971798](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/34935971798) passed on its first attempt. Candidate build, smoke, configuration, domains, Admin assurance, reconciliation, receipt-bound promotion and the 300,000 ms observation passed. Two successful checkpoints completed in 374,876 ms; all 311 source/projected/rendered records matched with zero missing records, duplicates, field mismatches or invalid destinations. Monitoring reported zero candidate 5xx and unresolved live effects. Canonical/tagged versions, traffic and the reviewed runtime configuration were independently read back.

Serving S113 supports normal Sheet append/field updates and refuses row deletion and historical restore.
S96 — safe connector disconnect and reconciliation remains deployed. S82/S97/S98 conformance and
integrity corrections, S102-S110 and normal S106/S34 handoff implementation are serving.

Local verification passes 6,528 unit tests (four skips), 201 backend tests, policy/build and seven
compiled browser checks. All 33 review findings are closed; Human verdict remains NOT RUN.
Staff-recorded completion reports actual outside work and remains separate from provider-verified effects. Backend journeys use actual controls, routes, Firestore, claims, receipts and readbacks with deterministic external adapters; no live customer effect was created to demonstrate completion.

S106/S34 normal packet preparation, approval, exact S21 bytes, S20 queue/ledger execution and own-receipt recovery are implemented and deployed. Real approved forms/catalog/mappings, managed Dotloop credentials/connection/selection and separately authorized exact-key activation remain gates. Both Dotloop keys remain closed. Signature work is a human handoff; document presence and submitted content hashes do not prove signatures or provider-owned content verification.

## Canonical closure sequence

Feature 4 completed the existing release sequence:

1. Existing focused tests and full local verification passed: 6,532 units, 201 backend tests, policies/build.
2. PR #89 merged the repair; final exact-main CI 34935971798 passed all five jobs.
3. Corrected candidate smoke/configuration/domains, Admin assurance, reconciliation and v4 receipts passed.
4. Exact promotion and the 300,000 ms observation passed with two successful checkpoints in 374,876 ms.
5. Independent serving/version/runtime readbacks passed. Earlier failed attempts remain preserved.

S36 is queued behind complete S100. B-S100/B-MNT1 and actual Dotloop resources remain separate.

## Authority and closed decisions

The owner-approved v4 receipt records only the exact blocked predecessor My Work reconcile defect on `d243911cb20ffb01773072c0e27c723648eeea34` / `pmi-kc-app-rmtkmhj1z-8855e4c6dbfb` as `failed_known_legacy_defect`. The single request was aborted before dispatch; its matching browser failures remain recorded. Candidate and post-promotion checks passed with zero mutation attempts. Editor browser coverage is `not_run` under the owner-approved Admin-only policy; backend role restrictions remain.

Completed S97-S99 and S100 chat proofs are not rerun. Exact human preview/confirmation, one-attempt
claims, receipt/readback and separately confirmed corrections remain required for source writes.
No new role, account, key, send authority, budget or customer value was introduced. No production
completion was seeded. Blank resource inputs are accepted. The 24-hour auth longevity proof is separate.

## Per-suite delivery rule

S113 is ALL_GATES_GREEN for its requested implementation and deployment scope. Only actual passed
gates receive that result; external forms/connections/provider capabilities remain explicitly gated.
Future deliveries still require backend/adversarial acceptance, exact CI and the full release contract.
S87 — final six-cohort product-wide content reconciliation retains its existing dependencies.
No new automation or S36 work is part of this completed run.
