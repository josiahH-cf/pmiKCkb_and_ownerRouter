# Current plan

Updated: 2026-09-15 (UTC).

## Outcome

The September 14 renewal updates execute as six separate feature-to-production cycles.
Features 1-3 are complete and deployed: lease/unit/contact identity and owner filtering; nested
process glossary and stable value routing; actual external record/message destinations. Feature 3
merged through PRs #87/#88 and completed exact-main CI plus the serialized production release.
Its original unpromoted candidate and Feature 2's earlier verified rollback retain their actual evidence.

September 14 Feature 4 (RentCast failure repair) is implemented on
`codex/renewal-rentcast-repair`; full verification passed. It is not yet pushed, merged or deployed.
Features 1-3 remain deployed; Features 5-6 have not started.

The retained reported lookup records HTTP 400. Replaying its exact query returned RentCast's
insufficient-comparables error. Keeping every subject attribute unchanged, 2- and 5-mile requests
failed; a 10-mile request returned HTTP 200 with 15 comparables and an estimate. Raw responses and
customer values remain outside Git. These diagnostic reads made one billable successful request;
no customer draft/send or system-of-record write ran.

The repair distinguishes that provider refusal, exposes an operator-selected positive radius and
retains the actual radius through the query/cache/observation/market basis. Each lookup remains one
operator-triggered request; no automatic radius fallback occurs. Source attributes, property-type
omission, base-rent provenance and separate recurring charges remain intact. The initial 2-mile
radius remains; historical lookup display no longer claims a fresh request occurred on page load.
Provider guidance: https://developers.rentcast.io/reference/property-valuation.
Existing focused tests passed (65); the actual private failure/success responses passed adapter replay.
Full verification passed: 6,532 unit tests, 201 backend tests, policies and production build.
The existing PR/CI/serialized production release remains to complete Feature 4.

## Current implementation baseline

Production serves `a5852eaf8b19c1af48295ec8fff77814a91a10c7` as `pmi-kc-app-rmu2508wj-67ca3e173ab5` at 100% traffic. Exact main [CI 34926252129](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/34926252129) passed on its first attempt. Candidate build, smoke, configuration, domains, Admin assurance, reconciliation, receipt-bound promotion and the 300,000 ms observation passed. Two successful checkpoints completed in 386,528 ms; all 311 source/projected/rendered records matched with zero missing records, duplicates, field mismatches or invalid destinations. Monitoring reported zero candidate 5xx and unresolved live effects. Canonical/tagged versions, traffic and the reviewed runtime configuration were independently read back.

Serving S113 supports normal Sheet append/field updates and refuses row deletion and historical restore.
S96 — safe connector disconnect and reconciliation remains deployed. S82/S97/S98 conformance and
integrity corrections, S102-S110 and normal S106/S34 handoff implementation are serving.

Local verification passes 6,528 unit tests (four skips), 201 backend tests, policy/build and seven
compiled browser checks. All 33 review findings are closed; Human verdict remains NOT RUN.
Staff-recorded completion reports actual outside work and remains separate from provider-verified effects. Backend journeys use actual controls, routes, Firestore, claims, receipts and readbacks with deterministic external adapters; no live customer effect was created to demonstrate completion.

S106/S34 normal packet preparation, approval, exact S21 bytes, S20 queue/ledger execution and own-receipt recovery are implemented and deployed. Real approved forms/catalog/mappings, managed Dotloop credentials/connection/selection and separately authorized exact-key activation remain gates. Both Dotloop keys remain closed. Signature work is a human handoff; document presence and submitted content hashes do not prove signatures or provider-owned content verification.

## Canonical closure sequence

Feature 3 completed the existing release sequence:

1. Existing focused tests and full local verification passed: 6,532 units, 201 backend tests, policies/build.
2. PRs #87/#88 merged the feature and reconciliation correction; exact main CI 34926252129 passed all five jobs.
3. Corrected candidate smoke/configuration/domains, Admin assurance, reconciliation and v4 receipts passed.
4. Exact promotion and the 300,000 ms observation passed with two successful checkpoints in 386,528 ms.
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
