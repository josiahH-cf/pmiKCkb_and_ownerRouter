# Production capacity and pilot

Updated: 2026-08-31.

Production is already live. New external effects still roll out as bounded pilots.

## Verified Cloud Run envelope

Live readback on 2026-08-26 matches the release contract:

`--min-instances=0 --max-instances=1 --memory=512Mi --cpu=1 --concurrency=10 --timeout=60`

The present ceiling is one instance, one CPU, 512 MiB of memory, and ten concurrent in-flight
requests. The absent live minimum-scale annotation resolves to zero. This is a bounded operating
envelope, not a statement of unlimited capacity.

## Pilot shape

- The pilot uses one named property set or the next renewal cohort, or one exact test record for a
  reversible proof.
- An observation window of two to four weeks unless the action is a one-record reversible proof.
- Named daily owner and escalation owner.
- Explicit success criteria and abort trigger.
- No autonomous client sends.
- Immediate freeze on ambiguous provider results.
- Bodyless receipts and readback.

Expansion/capacity review triggers are:

- sustained request queueing or saturation-attributable 5xx on A1 during normal pilot use; or
- any expansion of scope past the named cohort.

Neither trigger authorizes automatic scaling.

## Current pilots/proofs

- RentCast reference reads are live under allowance 50.
- S97 specifies one owner-designated lease `endDate` proof, exact rollback, retirement of the old
  multi-record machinery, and later activation of only its three exact renewal keys.
- S98 specifies one temporary source-backed row at the end of the operating renewal Sheet, exact
  readback and deletion, and retirement of the copy-only rehearsal path.
- S99/S100 specify exact Maintenance work-order effects, one manual mark-read-aware chat sync, and an
  unsent resident-reply Gmail draft. Fake work orders, automatic sync, provider chat posts, and sends
  are not proof substitutes.
- S36 specifies one temporary source-copy/Store lifecycle that must finish with both temporary
  resources absent, the original source intact, eleven Stores restored, and its runtime flag false.

These S97-S100/S36 contracts are authorized targets, not current production capability. Their live
effects remain unavailable until each closed implementation, bounded proof, protected activation,
release, and readback gate passes.

Do not turn “pilot” into permission for broad writes or a simultaneous all-record cutover.

## Scaling and in-memory limiters

`lib/maintenance/intake-rate-limit.ts` and `lib/api/model-call-throttle.ts` enforce per-instance,
in-memory limits. Raising `--max-instances=N` multiplies both in-memory, per-instance limiters by N.

Before raising the instance ceiling, re-review the S52 cost ceiling and both limiter systems. The
limiter review must either move coordination to a shared backing store or explicitly accept and
document the N-times effective limits. Scaling is never a silent release-flag change.
