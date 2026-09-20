# Current plan

Updated: 2026-09-20 (UTC).

## Outcome

Local-only mode: production is undeployable (billing disabled, owner action required), so every
feature stops at a green tree with exact-SHA CI and waits in the Awaiting release queue in
`docs/loop-state.md`. The renewal meeting-readiness bundle (owner request of 2026-09-18) proceeds in
order S128 -> S123 -> S124 -> S134 -> S122 -> S125 -> S126 -> S127 -> S131 -> S129 -> S130 -> S132
with S133 independent and S121 when scheduled; every feature preserves the S128 pause. S128 (F08) is
IMPLEMENTED and CI-GREEN at `31bc9072`. S123 (F02) is IMPLEMENTED and CI-GREEN at `aa062d8e`:
the recorded cycle basis is compared with the current provider lease end and surfaced on the desk and
in the workspace, while retention, cycle identity and the audited store held as preservation. S124
(F03) is IMPLEMENTED and CI-GREEN at `fc03ec55`: the exact RentVine move-out contract (status-table
flags plus lease-detail notice dates) feeds one typed disposition that filters the desk, cues the
workspace and blocks ordinary drafts server-side for a confirmed notice. S134 (F14) is IMPLEMENTED
and CI-GREEN at `136826cc`: one lifecycle category per lease drives the row dot and label, the
Lifecycle sort and filter, and the workspace header. S122 (F01) is IMPLEMENTED and CI-GREEN at
`39a7f929`: three table-owned views (Active / upcoming, All leases, Completed) with counts and
zero-match offers over the one loaded projection. S125 (F04) is IMPLEMENTED and CI-GREEN at
`41d6e00c`: a versioned notice timing evaluator with an Admin-recorded basis, a desk filter and a
workspace panel. S126 (F06) is IMPLEMENTED and CI-GREEN at `7f0ed865`: one shared
date-display utility and an app-wide inventory. S127 (F07) is IMPLEMENTED and CI-GREEN at `52286917`:
one issue model with text kinds, affected actions and responsible parties, shared by the desk and
the workspace, with control-level focus targets. S131 (F11) is IMPLEMENTED and CI-GREEN at `59ad9224`:
a typed conditional policy projection, a versioned material store with separate intake and approval,
and an honest pending state. S129 (F09) is IMPLEMENTED and CI-GREEN at `009c4414`: an evidence
matrix over the existing draft path, the policy gate enforced at the server draft boundary, and a
read-only meeting preflight per audience. S130 (F10) is IMPLEMENTED and CI-GREEN at `696147f9`: a
seven-family intake manifest on the S66 catalog seam, byte classification as data, reviewed
version-bound maps, a Preview-only worksheet and an honest fill boundary. S132 (F12) is IMPLEMENTED and CI-GREEN at `f74468a1`: a typed
meeting-walkthrough contract, a Draft-for-validation runbook on exact guide controls, an observation
ledger and an effect-free preflight. S133 (F13, independent) is IMPLEMENTED and CI-GREEN at `75c06252`: a bounded
handoff-assessment contract and a tabletop decision packet with feasibility not established and the
owner and administrator inputs named (B-MNT2). Next: S121 when the owner schedules it; the Awaiting
release queue waits on billing.

The renewal operator hub bundle (S114-S120, owner request of 2026-09-15) is COMPLETE and DEPLOYED
(S120 head `79493458` / `pmi-kc-app-rmu4wevd9-d89996133320`, released 2026-09-17), before the
billing incident. The renewal operator hub bundle (S114-S120) is complete.

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

Every feature of the S114-S120 bundle is complete and deployed. In local-only mode each feature
completes its own verification and exact-main CI, then waits in the Awaiting release queue.

## Current implementation baseline

Production serves `79493458f641b9710d8c43467e872aa9acf7948e` as `pmi-kc-app-rmu4wevd9-d89996133320` at 100% traffic. Exact main [CI 35173497243](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/35173497243) passed. Candidate build, smoke, configuration, domains, Admin assurance, reconciliation, receipt-bound promotion and the 300,000 ms observation passed. Two successful checkpoints completed in 372,944 ms; all 311 source/projected/rendered records matched with zero missing records, duplicates, field mismatches or invalid destinations. Monitoring reported zero candidate 5xx and unresolved live effects. Canonical/tagged versions, traffic, authorized domains and the reviewed runtime configuration were independently read back.

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
