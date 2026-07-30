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
