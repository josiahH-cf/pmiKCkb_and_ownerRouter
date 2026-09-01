# PMI KC current plan

Updated: 2026-08-31.

## Outcome

Execute the single canonical initiative through S87: close the connector hazard, deliver the UI/
access/navigation/renewal foundation, add the exact owner-authorized RentVine/Sheet/Maintenance/
resident source effects, prove and retire one temporary Space, then complete the bounded Dashboard
assistant and product-wide content reconciliation.

## Current implementation baseline

Production serves commit `1d68c7fb0a4f3138b9d0ba410d221b44bfb5534c` as revision
`pmi-kc-app-rmtg73suu-fe8734d35330` at 100% traffic. It remains Production + Live with eleven
Spaces, managed identity, seven open Action Registry keys, a closed operating-Sheet write switch,
and a closed S30 one-lease `endDate` proof runner. No RentVine renewal write, operating-Sheet write,
Maintenance provider mutation, resident sync/draft, or S36 pilot has run.

The current code also retains obsolete multi-record proof and copy-only Sheet paths. They are not
active guidance: S97 and S98 own their tested removal. S36 and S82-S100 are specified desired state,
not deployed behavior, until each suite completes implementation, verification, release, effect
proof where required, and readback.

## Authority and closed decisions

- Production is Live-only. The secure owner instruction names the sole S97 lease target; never commit
  its provider values or substitute another record.
- S97 owns exact renewal-date and recurring-charge create/update effects. S98 owns exact operating-
  Sheet row append and supported-field update. S99 owns exact work-order read/create/status effects.
  S100 owns manual mark-read-aware work-order chat sync and a separately confirmed unsent Gmail
  resident-reply draft.
- S36 owns one deterministic temporary Space provision/import/query/readback/retirement pilot and
  must restore the eleven-store/config baseline.
- The owner authorized a bounded temporary proof window for each exact S97-S100 key after its closed
  implementation and deterministic gates, mandatory close/readback after proof, and final protected
  activation only after that key's applicable live proof and remaining suite gates. No key is open
  merely because this plan exists.
- Direct sends, RentVine chat posting, vendor assignment, attachment upload, generic/bulk/provider
  execution, fake data, and autonomous/model-triggered effects remain outside scope. S100's explicit
  manager-read warning is the only non-reversible stateful-read exception; no unread restoration is
  invented.
- Dotloop and LeadSimple remain later separately scoped work.

## Canonical closure sequence

The only executable order is in `docs/feature-suites/README.md`:

1. S96 — safe connector disconnect and reconciliation.
2. S85 — global theme and visual system.
3. S86 — action feedback, help, and safe recovery.
4. S83 — capability-guided Admin access requests and approvals.
5. S84 — navbar dropdown navigation.
6. S82 — table-first renewal desk and guided lease workspace.
7. S97 — governed RentVine renewal writeback.
8. S98 — operating renewal Sheet append and field writeback.
9. S99 — RentVine Maintenance work-order writeback.
10. S100 — RentVine work-order chat sync and resident draft.
11. S36 — temporary Space provisioning pilot and exact retirement.
12. S88, then S89 — deterministic assistant foundation, privacy, observability, cancellation, and
    cost controls.
13. S90 and S91 — Work/access and renewal query adapters.
14. S92 — knowledge and bounded grounded narration.
15. S94 — human-confirmed renewal-to-self task action against strict S93-slot fixtures.
16. S93 — streaming/linked-result UI, followed by the single S93/S94 integration gate.
17. S95 — atomic minimal Dashboard composition and relocation.
18. S87 — final six-cohort product-wide content reconciliation and end-to-end verification.

Default to serialization. Only bounded S90/S91 domain work may run in isolated worktrees after its
prerequisites, with shared registries/schema/delivery serialized. No dependent starts after a failed
gate.

## Per-suite delivery rule

For each code suite, re-read current code and live read-only state, freeze fail-first and preservation
evidence, implement closed before effect activation, run focused adversarial tests,
`bash scripts/verify.sh`, and `npm run test:e2e:core`, then audit secrets, PII, protected paths,
runtime configuration, effects, and diff. Commit/push only green work, require exact-SHA aggregate
CI, and release served code through zero-traffic candidate smoke, exact promotion/readback, and the
captured rollback contract. Read back every cloud/provider/config mutation and reconcile facts,
status, this plan, and loop state before advancing.

Each suite terminates only as `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` when the user supplied an explicit
budget, or `BLOCKED` on one exact unavailable runtime input after all independent closed-safe work is
green. The full initiative completes only after S87 and final end-to-end verification are green and
current docs match deployed/live readback.
