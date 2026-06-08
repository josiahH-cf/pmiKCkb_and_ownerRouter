# Autonomous Feature-Cycle Packet Template

Use this template for planning packets created under `docs/temp/`. Keep packets free of
secrets, raw customer data, and live Gmail content.

## Cycle Packet

Feature-cycle objective:

Product lane:

Why this is next:

End-state target:

Migration-readiness impact:

Reason this should happen before production cutover:

Local-development exhaustion check:

If this is deferred, what remains before migration:

Backward dependencies:

Confirmed context used:

In scope:

Out of scope:

Decisions resolved from docs:

Decisions or approvals still needed:

Cost, cloud, API, Gmail, deploy, import, key, or client-environment gates:

Environment or secret impact:

Manual setup or web-app testing required:

Implementation batches:

Verification plan:

Falsification checklist (try to break the slice from fresh context):

- Mismatches between intent and actual behavior:
- Omissions or missing acceptance criteria:
- Regressions or downstream breakage:
- Rule or security-boundary violations:
- Edge cases and unhandled states:
- Invalid JSON or Markdown:
- Stale command descriptions, prompt-chain hints, or missing linked docs:
- Oversized files or suspiciously large diffs:

Final user verification:

Human-side work:

Stop conditions:

Slice continuation decision (continue to next slice or stop, and why):

Stop-and-reset condition checked:

Next safe slice candidate:

Loop-state snapshot to record in `docs/loop-state.md`:

## Blocker Record

Product lane:

Missing item:

Why it blocks the cycle:

Exact ask:

Work that can continue:

Verification after unblock:

## Approval Request

Action requiring approval:

Affected environment:

Product lane:

Expected cost or usage exposure:

Data touched:

Secrets, keys, roles, domains, labels, filters, sources, imports, deploys, or external
systems involved:

Verification path:

Rollback or correction path:

What remains blocked without approval:

## Client Communication Draft

Subject:

Plain-English ask:

Why it matters:

What PMI KC should provide or approve:

What will happen after approval:

How success will be verified:

Security note:

## End-Of-Run Handoff

What was built:

Files changed:

Validation run:

Validation result:

Falsification result:

Cost or client-environment actions avoided:

Remaining blockers:

Exact client asks:

Commit queue:

Loop-state updates recorded:

Manual user review at the end of the run:

## Commit Queue Item

Suggested commit title:

Files or concerns included:

Validation run:

Validation result:

Manual review required before ship:

Excluded or unrelated changes:
