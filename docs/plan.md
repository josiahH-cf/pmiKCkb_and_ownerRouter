# Current plan

Updated: 2026-09-28 (UTC).

## Outcome

Deliver all thirteen Awaiting release features as one verified candidate, promotion and observation,
then close the queue only after independent readbacks. Current terminal state is BLOCKED by the
confirmed release-safety and litmus gaps in
`docs/evidence/batch-litmus-audit-2026-09-28.md`; owner direction on repair or stopping is pending.
Billing is enabled and approved CLI/ADC authentication works. No per-feature fallback is authorized.

Before this documentation closeout, both checkouts and remote main matched
`f85abacc771dc0f85c2f7bf69af3d05d8402e88e`; exact-main CI 35549486717 passed.
Pre-edit native batch preflight read GO with thirteen features and watcher_target on that head.
Focused checks passed 194 tests in 37 files. Full verify.sh passed with 6,953 unit tests,
216 backend tests, policy checks and build; core E2E passed 31 tests with 18 intentional skips.
Preflight GO and earlier suite tests do not close the newly identified defects.

The queue remains S128 -> S123 -> S124 -> S134 -> S122 -> S125 -> S126 -> S127 -> S131 -> S129
-> S130 -> S132, with S133 independent but included in the same release. S121 remains separate, unscheduled and unchanged. The queue's exact feature commits remain in `docs/loop-state.md`.

## Current implementation baseline

Production serves `79493458f641b9710d8c43467e872aa9acf7948e` as
`pmi-kc-app-rmu4wevd9-d89996133320` at 100% traffic.
Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app.
Canonical/tagged versions and sign-in returned HTTP 200; both versions name the exact serving SHA/revision. Current readback is Production + Live,
managed runtime identity, eleven Space maps, Demo false and Sheet write-back true.
S128 is false in both ignored files in both checkouts but remains undeployed.

Serving S113 supports normal Sheet append/field updates and refuses row deletion and historical restore.
S96 — safe connector disconnect and reconciliation remains deployed. S82/S97/S98 conformance,
S102-S110, S106/S34 handoff and S114-S120 operator improvements remain the delivered baseline.
Historical CI 35173497243 and the completed S120 release receipts/observation are preserved;
they do not establish batch deployment.

S106/S34 normal packet preparation and governed execution are implemented, but actual approved
forms/catalog/mappings, managed Dotloop connection/selection and exact-key activation remain gates.
Both Dotloop keys remain closed. Document presence is not signature or content-verification proof.

## Canonical closure sequence

1. Keep the watcher stopped while resolving the audit findings. A preexisting S128-only attempt
   was cancelled: build `57f23335-8f8b-490e-b18e-5d6d4b1db564` read CANCELLED at
   2026-09-28T21:01:53.995Z; its candidate is absent and traffic unchanged. The stale checkpoint
   and reason are preserved outside Git; the active checkpoint names the last completed release.
2. Repair both rollback paths so no Sheet-enabled predecessor can receive traffic and the exact
   paused recovery target can be durably verified without rewriting an earlier receipt.
3. Resolve notice-withdrawal history, manual non-renewal draft refusal, notice-review invalidation,
   raw ISO/impossible dates in move-out labels, paused automatic proposal creation and stale
   confirmation after pause/resume, and the actual template-fill integration limitation.
4. Run focused adversarial checks, full `bash scripts/verify.sh`, core E2E and exact-main CI.
   Preserve existing roles, action keys and external-input gates. Browser smokes remain NOT RUN
   until actually completed; two Admin sign-in navigation timeouts leave auth UNVERIFIED; no challenge was observed.
5. Follow `docs/release-batch-runbook.md`: fresh authentication/cost readbacks, native preflight GO
   with thirteen entries/current target, one native watcher on a verified free lock, all candidate
   gates, receipt-bound promotion, 300,000 ms observation and independent readbacks.
6. Only after release success, clear the queue, record the exact serving evidence, run pinned
   document tests and document gates, and commit/push documentation-only closure.

The scheduled task remains Ready and unchanged; zero processes/free lock is a point-in-time
observation. Check again before a start. Batch assurance, promotion and observation remain NOT RUN.
B-DL1, B-DL2, B-DL3, B-S100, B-MNT1 and B-MNT2 remain open.
S36 is queued behind complete S100.

## Authority and closed decisions

Completed S97-S99 and S100 chat proofs are not rerun. Exact human preview/confirmation, one-attempt
claims, receipt/readback and separately confirmed corrections remain required for source writes.
This release task keeps live providers read-only and creates no customer draft/send or synthetic
production record. Do not change billing, budgets, guardrails, system/security settings or protected
paths. Owner attendance is required for authentication challenges.

The September 10 Admin-only assurance policy remains: Editor browser coverage is `not_run`,
with complete backend role restrictions preserved. The narrow historical legacy exception remains
limited to its exact recorded predecessor; it does not widen this candidate's gates.

## Per-suite delivery rule

Only actual passed gates receive ALL_GATES_GREEN. The current batch does not have that result.
Engineering tests, deployed readbacks, provider effects, external inputs and human observations
retain separate verdicts. Staff progress does not become a provider receipt or signature.
S87 — final six-cohort product-wide content reconciliation retains its existing dependencies.
No new automation or S36 work is part of this release task.
