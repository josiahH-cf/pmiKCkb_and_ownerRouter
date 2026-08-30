# Four-lease renewal proof readiness — current 2026-08-30

This is the value-free execution packet for S63. The generated operational report contains client
data and therefore stays under gitignored `temp/test-set/`; no lease values or identities belong in
this document. The capture, evidence-append, and report commands now accept only strict secure files
outside tracked source (or under gitignored `temp/`) and emit only counts, allowlisted refusal codes,
and opaque run references. Historical tracked case literals are not authorization to reconstruct a
runtime packet.

## Approved evaluation decisions

The owner recorded the formerly missing criteria on 2026-08-29:

1. Use S72's approved six ordered steps, detailed substeps, responsible operational roles,
   completion evidence, alternate exits, and reopening rules.
2. Treat contractual base rent as the renewal comparison/decision value. Display recurring charges
   separately; never collapse them into current rent.
3. Request RentCast with a two-mile maximum radius and 15 comparables. Preserve provider order and
   apply no hidden freshness/selection/rejection filter; show retrieval and available comparable age
   evidence without inventing a freshness claim.

These decisions make the process/rent/radius/count criteria evaluable. Missing lease-specific source
or observation evidence still renders only the affected criterion `not evaluated` or blocked.

## Secure packet setup

1. Copy `docs/source-corpus/four-lease-runtime.template.json` and
   `docs/source-corpus/four-lease-observations.template.json` to a location outside the repository or
   under `temp/test-set/input/`. Never fill either tracked template in place.
2. In the runtime copy, provide one managed `pmikcmetro.com` Editor with `renewals` scope, exactly the
   four opaque slots `case-1` through `case-4`, four unique exact lease ids, four unique positive
   Sheet rows, and the review-window/owner/abort context. Placeholder values intentionally refuse.
3. In the observation copy, replace the batch reference and record only facts actually observed for
   the corresponding opaque case slot. Every template criterion starts `null`; never turn a missing
   observation into `true`, `false`, or zero. An exact retry keeps the same batch and observation
   references. A corrected/new observation uses new references; changing a prior reference's content
   refuses as an idempotency conflict.
4. Set `S63_TEST_SET_RUNTIME_CONFIG_PATH` for all three commands and
   `S63_TEST_SET_OBSERVATION_PATH` for the append command. Paths may be absolute or relative to the
   repository, but tracked paths refuse before an external read.

## Exact execution sequence

1. Confirm Production + Live and keep Gmail draft/send, RentVine renewal write, operating-Sheet write,
   and every other effect unavailable to the proof runner.
2. Prove repository/log scans are value-free and validate the secure runtime packet. Missing,
   duplicate, malformed, unmanaged, out-of-scope, or non-four input refuses before a provider read.
3. Run `npm run testset:capture-baseline`. It resolves all four complete read-only RentVine and
   operating-Sheet bindings before opening the app-plane store. Each configured row must expose a
   RentVine lease link for that exact configured lease; a missing, unit-only, or different-lease link
   returns `source_identity_mismatch`. It creates at most one immutable baseline per lease. An exact
   source-equivalent retry is reused; a changed source snapshot returns `baseline_source_conflict`
   and never replaces or mislabels the frozen baseline as current.
4. Inside the authorized Firestore/gitignored-report boundary, verify each tuple: exact lease id,
   exact Sheet row, capture timestamp, and source hash. None of those values may be printed or
   committed.
5. Observe S72 process behavior, base-rent/separate-charge truth, RentCast's two-mile/15-request
   reference behavior, human-decision separation, and S77 preview/refusal without confirmation.
   Do not create an unsent draft. Any human communication remains outside S63 and is not proof-run
   evidence.
6. Run `npm run testset:append-evidence`. The command validates every baseline/hash and every existing
   idempotency reference across the complete batch before its first append. It then performs only
   deterministic create-only Firestore appends and reports appended/reused counts without case data.
7. Run `npm run testset:report`. It reads only immutable baselines/evidence and writes
   `temp/test-set/report-<opaque-run-reference>.md`.
8. Inspect the local report. Each lease must show process, number/evidence, and read-only safety as
   separate outcomes. A safety PASS requires explicit observed zero app-draft, app-send, RentVine,
   Sheet, and Dotloop receipt counts; absence is `not_evaluated`, never an inferred zero.
9. Re-run the repository/diff/log/no-effect audits, then have a real reviewer complete the two human
   litmus verdicts. The implementation runner does not fill a human verdict.

## Deterministic machinery proof

- Baseline identity is lease id plus exact Sheet row and source hash; it is create-only.
- The selected Sheet row must resolve its own RentVine hyperlink to the exact configured lease before
  the app-plane store opens; a row number alone is never trusted as identity.
- Exact source-equivalent capture retry is reusable; changed or invalid stored source/hash state
  fails closed without replacement.
- Process, number/evidence, and safety verdicts are independent and return `not_evaluated` when any
  required observation is absent.
- Secure observation retries are idempotent. A conflicting reused reference refuses, and known
  conflicts across the batch are detected before the first append.
- The execution modules import no RentVine/Sheet/Dotloop writer, Gmail draft creator/sender, generic
  executor, or action-gate mutator.
- Tracked case/operator literals and identity-bearing command output have been removed. Synthetic
  tests and deliberately non-executable templates prove the exact-four, path, shape, redaction,
  immutability, append-only, and no-effect boundaries.

Green machinery does not manufacture operational evidence. A fresh Live run remains unavailable
until the exact four-case runtime packet and observations are supplied securely; human review remains
external even after a report is generated.

## Completion evidence

S63 machinery is complete when focused/adversarial/canonical tests, CI, release readback, source/log
redaction, and action/no-effect audits are green. S63 operational evidence is complete only when four
source-current exact baselines exist, every required observation has been reviewed under the approved
criteria, real human verdicts are recorded, and the generated report contains no unresolved result
other than an explicitly named client-data fact. Report those two completion states separately.
