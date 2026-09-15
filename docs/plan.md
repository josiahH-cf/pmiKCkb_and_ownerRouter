# Current plan

Updated: 2026-09-15 (UTC).

## Outcome

The September 14 renewal updates execute as six separate feature-to-production cycles.
Features 1-3 are complete and deployed: lease/unit/contact identity and owner filtering; nested
process glossary and stable value routing; actual external record/message destinations. Feature 3
merged through PRs #87/#88 and completed exact-main CI plus the serialized production release.
Its original unpromoted candidate and Feature 2's earlier verified rollback retain their actual evidence.

Feature 4 is IMPLEMENTED / PUSHED / MERGED / DEPLOYED. PR #89 merged `32d3ab5` as `4ece4ba`.
Serving SHA `2bf21ffe3821c1d2d32e3bb31cee9ccabb218e72` / `pmi-kc-app-rmu286tg6-b24d5e15315b`
completed the resumed production release. Features 1-4 are deployed; Features 5-6 have not started.

The reported retained lookup records HTTP 400. The exact query returned an insufficient-comparables
error. With subject attributes unchanged, 2- and 5-mile requests failed; 10 miles returned HTTP 200
with 15 comparables. The repair explains this refusal and allows an operator-selected radius retained
through query/cache/observation/market basis. Base rent, separate recurring charges, source provenance,
provider order, quota and action controls remain. Historical results no longer claim a fresh request.
Provider guidance: https://developers.rentcast.io/reference/property-valuation.
One successful diagnostic read was billable; raw responses/customer values remain outside Git.
No customer draft/send or system-of-record write ran.

Existing focused tests passed (65); full local verification passed 6,532 units, 201 backend tests,
policies/build. PR CI 34929220447 passed after two failed-job retries at different existing journey
waits; no code or assertions changed. Main CI 34929736602 and final CI 34931918778 passed.
The resumed release passed v4 assurance/promotion and two observation checkpoints in 378,909 ms.
Independent serving/version/runtime readback passed at 05:47:39 UTC. The watcher is active and complete.

The earlier `4ece4ba` / `pmi-kc-app-rmu26u6xc-9a156b302dac` observation failed on a 30,006 ms
Dashboard navigation timeout and verified rollback. Failed evidence remains outside Git. Aggregate
assurance failures retain their actual outcomes without an inferred cause. The existing complete
assurance function passed during a private diagnostic with the watcher paused between attempts;
no code, deadline, route assertion or release gate was weakened. The watcher then promoted the exact
receipted revision and completed observation. Feature 5 starts next from freshly inspected main.

## Current implementation baseline

Production serves `2bf21ffe3821c1d2d32e3bb31cee9ccabb218e72` as `pmi-kc-app-rmu286tg6-b24d5e15315b` at 100% traffic. Exact main [CI 34931918778](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/34931918778) passed on its first attempt. Candidate build, smoke, configuration, domains, Admin assurance, reconciliation, receipt-bound promotion and the 300,000 ms observation passed. Two successful checkpoints completed in 378,909 ms; all 311 source/projected/rendered records matched with zero missing records, duplicates, field mismatches or invalid destinations. Monitoring reported zero candidate 5xx and unresolved live effects. Canonical/tagged versions, traffic and the reviewed runtime configuration were independently read back.

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
2. PR #89 merged the repair; final exact-main CI 34931918778 passed all five jobs.
3. Corrected candidate smoke/configuration/domains, Admin assurance, reconciliation and v4 receipts passed.
4. Exact promotion and the 300,000 ms observation passed with two successful checkpoints in 378,909 ms.
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
