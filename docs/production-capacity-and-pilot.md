# Production capacity and pilot

Updated: 2026-09-02.

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
- S97 is complete and deployed. Its date, recurring-charge-create, and recurring-charge-update keys
  passed separate bounded proofs and are active through their exact human-confirmed contracts.
- S98's proof-qualified baseline is deployed and its two exact keys remain open; the temporary proof
  row was deleted and read back absent. Active unreleased hardening keeps normal row append and
  refuses field update/delete/restore until a stable provider row-generation seam exists.
- S99 is complete and deployed. Exact RentVine work-order read, create, and status update are active;
  proof work order 1731 is in its final `Cancelled` state.
- S100's manual, mark-read-aware chat sync passed proof and is active. Its unsent resident-reply
  draft remains closed because no synchronized resident message currently maps to a verified
  resident email. Automatic sync, provider chat posts, attachments, notifications, and sends remain
  outside this authority.
- S36 has not started because complete S100 is its prerequisite. Its one temporary source-copy/Store
  lifecycle must still finish with both temporary resources absent, the original source intact,
  eleven Stores restored, and its runtime flag false.

Completed S97-S99 and S100 chat-sync proofs must not be rerun or assigned substitute targets. Normal
operations use their active exact-key contracts; S100 resident-draft proof and S36 remain unavailable
until their own prerequisites and gates pass.

Do not turn “pilot” into permission for broad writes or a simultaneous all-record cutover.

## Scaling and in-memory limiters

`lib/maintenance/intake-rate-limit.ts` and `lib/api/model-call-throttle.ts` enforce per-instance,
in-memory limits. Raising `--max-instances=N` multiplies both in-memory, per-instance limiters by N.

Before raising the instance ceiling, re-review the S52 cost ceiling and both limiter systems. The
limiter review must either move coordination to a shared backing store or explicitly accept and
document the N-times effective limits. Scaling is never a silent release-flag change.
