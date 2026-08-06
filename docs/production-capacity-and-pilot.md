# Production capacity and bounded-pilot record

Date: 2026-07-30. Status: **accepted Production pilot capacity contract**.

## Fixed Cloud Run envelope

Production deploys keep this exact capacity set:

`--min-instances=0 --max-instances=1 --memory=512Mi --cpu=1 --concurrency=10 --timeout=60`

The accepted ceiling is one instance, one CPU, 512 MiB of memory, and ten concurrent in-flight
requests. Excess work can queue until the 60-second request timeout. This envelope is an intentional
pilot bound, not an estimate of unlimited product capacity.

## D08 bounded pilot

Live operation starts with one named property set or the next renewal cohort, runs for two to four
weeks, and does not expand to every property or workflow at once. The pilot aborts for any Sev-1 that
the runtime suspend cannot contain, or for a second Sev-1 with the same cause.

### The named cohort (recorded 2026-08-06)

The D08 property set is now named. It is four lease renewals, supplied by the owner as Sheet rows
507 through 510 and resolved to RentVine lease ids by a live read-only join on 2026-08-06.

| Sheet row | Lease id | Lease end  | Tenants on lease |
| --------- | -------- | ---------- | ---------------- |
| 507       | 278      | 2026-09-30 | 1                |
| 508       | 279      | 2026-09-30 | 2                |
| 509       | 280      | 2026-09-30 | 1                |
| 510       | 297      | 2026-10-10 | 5                |

Rents and addresses are deliberately not reproduced here; they are client data held in the gitignored
resolution file and regenerable read-only at any time.

Three facts are recorded because they change how the cohort must be handled. Lease 297 ends
2026-10-10, not 2026-09-30, so the all-end-September framing from the 2026-08-05 call is wrong. Lease
297 reads a RentVine current rent of zero against a non-zero Sheet listing, which is a genuine
day-zero discrepancy kept as the test set's first finding rather than corrected beforehand. Leases 279
and 280 share one street address, so every record keys on lease id and never on address.

Cohort enforcement is **procedural**, by owner decision: operators work these four through their
per-lease deep links. No lease filter, allowlist, or pilot flag exists in the product, and the test
report states plainly that the boundary was operational rather than enforced by code.

The **window** is two to four weeks from the day the test set opens. The **abort trigger** is
unchanged and already stated above. The **daily owner is still unnamed** and is tracked as
`Q-TESTSET-DAILY-OWNER` in `docs/facts.md`; D08 requires one, and no daily-owner, on-call, or rotation
concept exists anywhere in the product or the docs. What exists instead is the acknowledgement-window
contract in `docs/production-incident-runbook.md`.

The full goals, evidence model, and pass criteria live in
`docs/feature-suites/four-lease-renewal-test-set.md` (S63).

## Exact capacity change signal

Capacity must be reviewed when either signal occurs:

- sustained request queueing or saturation-attributable 5xx on A1 during normal pilot use; or
- any expansion of scope past the named cohort.

Neither signal authorizes an automatic scaling change.

## Scaling and the two in-memory limiters

Both the maintenance intake pre-gate in `lib/maintenance/intake-rate-limit.ts` and the paid-model
throttle in `lib/api/model-call-throttle.ts` are in-memory, per-instance controls. Raising
`--max-instances=N` multiplies both in-memory, per-instance limiters by N.

Before any such change, re-review the S52 cost ceiling and projected burn, and re-review both limiter
systems. The limiter review must either move coordination to a shared backing store or explicitly
accept and document the N-times effective limits. Scaling is never a silent deploy-flag bump.
