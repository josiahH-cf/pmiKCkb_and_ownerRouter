# Current plan

Updated: 2026-09-16 (UTC).

## Outcome

The renewal operator hub bundle (S114-S120, owner request of 2026-09-15) is in progress. Feature 1 of 7,
S114 independent lease-information and process sidebars, is COMPLETE and DEPLOYED (implemented at
`24b0be59`, released 2026-09-16 as head `b7fd04d1` / `pmi-kc-app-rmu46blcc-af55ec317652` on its third
attempt). Feature 2 of 7, S115 plain-language section help, is COMPLETE and DEPLOYED (implemented at
`dffc4f71`, released 2026-09-16 as head `3ca35870` / `pmi-kc-app-rmu4awn6p-67bd97a8824e` on its second
attempt). Feature 3 of 7, S116 exact source links, reliable Sheet matching and complete contact emails,
is COMPLETE and DEPLOYED: implemented at `7a19d338` and released 2026-09-16 as head `33ef3039` /
`pmi-kc-app-rmu4eoy5u-c8c2682e9102` (first attempt, one assurance_unverified retry). Live email-column
synchronization remains a named setup dependency until the Sheet manager adds the two headers.
Feature 4 of 7, S117 master lease facts, rent and charges with confirmed source updates, is COMPLETE
and DEPLOYED: implemented at `bc559602` and released 2026-09-16 as head `a483c47d` / `pmi-kc-app-rmu4ir3hc-7ee452a02151`
(first attempt; one smoke_unverified retry, two managed_browser_enrollment_required re-enrollments and two assurance_unverified passes during a Cloud Run cold-start degradation). Feature 5 of 7, S118 five-mile market
comparisons with reviewed defaults and source links, is COMPLETE and DEPLOYED: implemented at
`0223bdb1` and released 2026-09-16 as head `af46ac72` / `pmi-kc-app-rmu4ontao-f5c2a692d78e` (first attempt; one assurance_unverified pass while authenticated renders on both revisions took 12 to 33 seconds).
Feature 6 of 7, S119 audited manual work
status and matching desk filters, is COMPLETE and DEPLOYED: implemented at
`2c810eb1` and released 2026-09-17 as head `be023196` / `pmi-kc-app-rmu4s6qo5-5d81e4f12265` (first attempt; no retries).
Feature 7 of 7, S120 source-filled communications, shared resources and downstream completion UX,
is implemented and integrated on main at `e056077c`; its serialized release is next.

S114 replaces the expanded workspace header summary and inline glossary with two independent fixed
slide-out panels: Lease information (property, lease, rent references, owners/clients, tenants and
source records, each value separately selectable with an explicit copy control, one-audience
"Copy all" controls and owner and tenant desk click-back links over opaque party tokens) and Process
guide (glossary entries with step needs plus the single "Renewal dashboard sections" navigation).
Both panels stay open independently, close on Escape or their close control and return focus to their
toggle. A refused clipboard keeps the selectable value on screen and says so; copying records nothing
and grants no send, approval or provider authority. The operator guide step table gained the two panel
toggles and the tenant audience copy control, and steps 8-10 now use the serving section labels.

Verification on the exact commit in the native checkout: format, lint, types, 6,575 unit tests
(711 files), 201 backend tests, every policy check and the production build passed; core E2E passed
with 8 files and 4 intentional skips. The eight S114 tests failed before the implementation and pass
after it. On 2026-09-16 both compiled browser checks (renewal desk; renewal guide, 45 steps) passed
on `b29185a3` against the native rehearsal with a local-only party-filter key. No client message was
sent and no live record was written. Human verdict: NOT RUN.

S114 attempts 1 and 2 were not caused by the code (interop gcloud runtime; enrollment expiry during
observation). S115 attempt 1 was not caused by the feature code either: the production canary asserted
the work board's exact heading before the board settled, and the canary now settles a route before
asserting its landmark. The watcher recreates its Identity Platform client after a credential failure.
Observed authentication longevity is under nine hours; a release must start well inside a fresh
enrollment.

S120 downstream preparation and completion UX is implemented and integrated at `e056077c`; its serialized
release is the last in this bundle. Each feature completes its own verification, exact-main CI and serialized release
before the next begins.

## Current implementation baseline

Production serves `be023196ef63cd4e48db8230fc8deccaedae95c8` as `pmi-kc-app-rmu4s6qo5-5d81e4f12265` at 100% traffic. Exact main [CI 35165689726](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/35165689726) passed. Candidate build, smoke, configuration, domains, Admin assurance, reconciliation, receipt-bound promotion and the 300,000 ms observation passed. Two successful checkpoints completed in 377,809 ms; all 311 source/projected/rendered records matched with zero missing records, duplicates, field mismatches or invalid destinations. Monitoring reported zero candidate 5xx and unresolved live effects. Canonical/tagged versions, traffic, authorized domains and the reviewed runtime configuration were independently read back.

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
2. PR #89 merged the repair; final exact-main CI 34940745236 passed all five jobs.
3. Corrected candidate smoke/configuration/domains, Admin assurance, reconciliation and v4 receipts passed.
4. Exact promotion and the 300,000 ms observation passed with two successful checkpoints in 372,118 ms.
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
