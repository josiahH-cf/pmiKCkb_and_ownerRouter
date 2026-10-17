# Current plan

Updated: 2026-10-17 (UTC).

## Outcome

Execute S227–S229: retire custom maintenance with authorized read-only history, diagnose Dotloop
renewal-template visibility, and preserve renewal work and workflow-linked Gmail reads/unsent drafts.
Vendoroo stays standalone. The private Shockwave audit, standalone importer and new leasing are outside scope.

## Current implementation baseline

Implementation began at upstream 0b892865 in an isolated worktree; original checkouts remain
preserved. Source c99659d5/15648c0e was already on main. Delivery head 85b7e03c passed the full
local gate and exact-main CI 38957524699, but its observation failed and rollback verified.
Production serves eb5d35991c3ec128a102e4483d3779af16106821 through
pmi-kc-app-recovery-a97c579cf11b4d74 at 100%. The failed run captured predecessor
pmi-kc-app-rmv3yavsf-2cece39f7605 with that same commit. The Notifications parallel-read repair
requires new qualification and guarded replacement delivery; no failed result becomes a pass.

## Authority and closed decisions

The prepared October 16 instruction carries this scope through checks, green mainline and existing
gated delivery without phase-only consent. It narrows the October 9 Send/Schedule contract: current
source refuses client sends/schedules at operation admission, preserves unsent drafting and original
attempts/receipts, and changes no protected Registry activation metadata. Both Dotloop write keys
stay closed. No customer draft, send, loop or upload is verification proof. Normal supported renewal
source updates retain their contracts; Sheet still refuses row deletion and historical restore.

Old maintenance/Vendoroo integration and native maintenance-phone work cannot restart from READY.
Acquisition/native-answering contracts are outside this run. S96 - safe connector disconnect and
reconciliation and S87 - final six-cohort product-wide content reconciliation remain preservation
owners. Completed S97-S99 and S100 chat proofs are not rerun. Remaining maintenance resident-draft
proof is retired from this execution; S36 has no new execution grant.

## Canonical closure sequence

1. Preserve source/evidence and meaningful fail-first checks. Complete.
2. Implement retirement across direct/shared entry and jobs; retain history/permissions; repair
   Dotloop diagnostic coverage/freshness and verify renewal/draft preservation.
3. Run focused adversarial checks and bash scripts/verify.sh. Audit diff, private-data exclusions,
   exact action boundaries and documentation. Repair verified in-scope defects.
4. Push only green source. Served delivery additionally requires fresh managed authentication,
   exact-main CI, lock ownership, fresh prerequisites/GO, candidate assurance, receipt-bound promotion,
   full observation and independent readbacks. No old permit or receipt is reusable.

## Per-suite delivery rule

ALL_GATES_GREEN requires actual passed gates. Approved CLI/ADC/GitHub/Admin authentication now
passes. Run a97c579c failed final Notifications timing and verified rollback; its evidence remains
immutable. Qualify the diagnosed repair with bash scripts/verify.sh, publish green mainline and
exact-head CI, then archive only through the checked procedure and admit a fresh run. Complete
candidate assurance, receipt-bound promotion, full observation and independent readbacks. Normal
managed Dotloop reads found an empty supported template list, a failed company-template read and
no saved selection; both write keys stay closed. Human/physical-phone verdicts remain NOT RUN.
Current work is in docs/loop-state.md; external holds are in docs/open-blockers.md.
