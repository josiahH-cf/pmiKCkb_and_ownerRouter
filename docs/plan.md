# Current plan

Updated: 2026-09-15 (UTC).

## Outcome

The September 14 renewal updates execute as six separate feature-to-production cycles.
Features 1 and 2 are complete and deployed. Feature 1 surfaces lease/unit/contact identity and
owner-filtered navigation. Feature 2 supplies the nested glossary, stepwise guidance and saved-value
destinations, retaining existing editors and persistence. Its deployment continuation repaired the
existing missing-observation-report rollback path. PRs #84/#85/#86 merged as `e689586`; exact main
CI 34919964550 and the complete serialized release passed. No failed attempt was relabeled as passed.

Feature 3 is in implementation on `codex/renewal-external-destinations`, based on freshly inspected
main `b0cba8a`: validated RentVine verification links, lease/owner record and Messages links, and
managed Gmail Drafts beside message copy/draft actions. Provider UI routes and managed mailbox
selection were read back. Existing focused tests passed (84); 6,532 unit tests, 201 backend tests, policies and build passed.
PR #87 merged `3287f8a`, whose candidate has five mismatches because the old reader required internal
verification links. The Feature 3 continuation on `codex/renewal-external-destination-assurance` corrects
that reader while retaining exact independently read destination checks. Full verification passed.
Push/merge the continuation and complete the existing serialized production release before Feature 4.
Features 4-6 remain unstarted: RentCast repair, dark-mode readability, then global clarity and response times.

## Current implementation baseline

Production serves `e689586ffd1a8b369a86df4c1a1bffa478bd609d` as `pmi-kc-app-rmu21dwpb-3ea232a8339f` at 100% traffic. Exact main [CI 34919964550](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/34919964550) passed on its first attempt. Candidate build, smoke, configuration, domains, Admin assurance, reconciliation, receipt-bound promotion and the 300,000 ms observation passed. Two successful checkpoints completed in 376,815 ms; all 311 source/projected/rendered records matched with zero missing records, duplicates, field mismatches or invalid destinations. Monitoring reported zero candidate 5xx and unresolved live effects. Canonical/tagged versions, traffic and the reviewed runtime configuration were independently read back.

Serving S113 supports normal Sheet append/field updates and refuses row deletion and historical restore.
S96 — safe connector disconnect and reconciliation remains deployed. S82/S97/S98 conformance and
integrity corrections, S102-S110 and normal S106/S34 handoff implementation are serving.

Local verification passes 6,528 unit tests (four skips), 201 backend tests, policy/build and seven
compiled browser checks. All 33 review findings are closed; Human verdict remains NOT RUN.
Staff-recorded completion reports actual outside work and remains separate from provider-verified effects. Backend journeys use actual controls, routes, Firestore, claims, receipts and readbacks with deterministic external adapters; no live customer effect was created to demonstrate completion.

S106/S34 normal packet preparation, approval, exact S21 bytes, S20 queue/ledger execution and own-receipt recovery are implemented and deployed. Real approved forms/catalog/mappings, managed Dotloop credentials/connection/selection and separately authorized exact-key activation remain gates. Both Dotloop keys remain closed. Signature work is a human handoff; document presence and submitted content hashes do not prove signatures or provider-owned content verification.

## Canonical closure sequence

Feature 2 completed the existing release sequence:

1. Bounded implementation and full local verification passed: 6,528 units/four skips, 201 backend tests, policy/build.
2. PRs #84/#85/#86 merged the feature and recovery continuation; exact final main CI passed all five jobs.
3. Fresh candidate smoke/configuration/domains, Admin assurance, reconciliation and v4 receipts passed.
4. Exact promotion and the 300,000 ms production observation passed with two successful checkpoints in 376,815 ms.
5. Independent serving/version/runtime readbacks passed. Earlier failed observations and verified rollback remain preserved.

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
