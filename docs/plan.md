# Current plan

Updated: 2026-09-15 (UTC).

## Outcome

The September 14 renewal updates execute as six separate feature-to-production cycles.
Features 1-3 are complete and deployed: lease/unit/contact identity and owner filtering; nested
process glossary and stable value routing; actual external record/message destinations. Feature 3
merged through PRs #87/#88 and completed exact-main CI plus the serialized production release.
Its original unpromoted candidate and Feature 2's earlier verified rollback retain their actual evidence.

September 14 Feature 4 (RentCast failure repair) is IMPLEMENTED / PUSHED / MERGED, but its
production release FAILED OBSERVATION and was ROLLED BACK. Features 1-3 remain deployed;
Features 5-6 have not started. Remain on Feature 4.

Implementation `32d3ab5566f4a6e4a46672c298e44491fca1a923` was pushed on
`codex/renewal-rentcast-repair` and merged through PR #89 as
`4ece4ba11e5cb35c0f6703fd19d586a423d57697`. Existing focused tests passed (65), and full local
verification passed 6,532 units, 201 backend tests, policies and production build. PR CI 34929220447
passed after two failed-job retries: different waits in the existing mounted backend journey failed
before the unchanged job passed. Exact main CI 34929736602 passed all five jobs on its first attempt.

The reported retained lookup records HTTP 400. An exact-query diagnostic returned the provider's
insufficient-comparables error. Keeping all subject attributes unchanged, 2- and 5-mile requests
failed; a 10-mile request returned HTTP 200 with 15 comparables and an estimate. Raw responses and
customer values remain outside Git. Diagnostic reads made one successful billable request; no
customer draft/send or system-of-record write ran. The adapter passed replay of both actual responses.
The repair explains this refusal and exposes an operator-selected radius, retaining that radius
through the query, cache, observation and saved market basis. Source provenance, contractual base
rent, separate recurring charges, provider order and existing quota/action controls remain intact.
Provider guidance: https://developers.rentcast.io/reference/property-valuation.

Candidate `pmi-kc-app-rmu26u6xc-9a156b302dac` passed build, smoke, configuration, domains and eventual
v4 assurance, then promotion at 05:00:16 UTC. Earlier aggregate assurance failures remain in the
watcher log; separate Admin and reconciliation diagnostics passed without establishing their cause.
Production observation failed after 417,350 ms with one successful checkpoint: Dashboard navigation
timed out at 30,006 ms, with one request failure and missing landmark. All 311 records reconciled;
monitoring reported zero candidate 5xx and unresolved effects. No auth mismatch or mutation occurred.
The existing process required rollback and verified Feature 3 restored at 100% traffic. Independent
canonical/tagged version and runtime readback confirmed that restoration at 05:09:18 UTC.

The checkpoint is terminal `rolled_back_verified`, not complete. The watcher process was stopped
between attempts to prevent documentation closure from requeuing the same failed runtime. Its
scheduled task and release lock file remain intact. Resume Feature 4 from the preserved failure;
do not start Feature 5 or clear the failed receipt/checkpoint. Automatic approved authentication works.

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
