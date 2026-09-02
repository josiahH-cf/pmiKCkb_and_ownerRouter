# PMI KC current plan

Updated: 2026-09-02.

## Outcome

Execute the single canonical initiative through S87: close the connector hazard, deliver the UI/
access/navigation/renewal foundation, add the exact owner-authorized RentVine/Sheet/Maintenance/
resident source effects, prove and retire one temporary Space, then complete the bounded Dashboard
assistant and product-wide content reconciliation.

## Current implementation baseline

Production serves commit `642269cab5afba563c41ce769541680c04d5c60c` as revision
`pmi-kc-app-rmtjwy7f4-c705ce297553` at 100% traffic. It remains Production + Live with eleven
Spaces, managed identity, ten open Action Registry keys (44 total), a closed operating-Sheet
write switch, and the retired S30 broad identifier closed. The only RentVine renewal writes ever
executed are the receipted 2026-09-02 S97 proofs on the owner-designated test lease, each restored
or receipt-bound-deleted except the approved durable test charge. No operating-Sheet write beyond
the owner-approved labeled TEST row, no Maintenance provider mutation, no resident sync/draft, and
no S36 pilot has run.

S97 removed the obsolete multi-record proof machinery; the current code still retains the copy-only
Sheet path, whose tested removal S98 owns and which is not active guidance. The remaining S36,
S87-S95, and S98-S100 contracts are specified desired state, not deployed behavior, until each
suite completes implementation, verification, release, effect proof where required, and readback.

S96 is `ALL_GATES_GREEN` and deployed. Its focused, canonical, core-E2E, exact-SHA CI, zero-traffic
candidate, normalized-config, bounded-route, exact promotion, and stable readback gates passed. The
live connector collection was empty, so the specified no-target proof made no credential or vault
effect. S85's technical implementation is `ALL_GATES_GREEN` and deployed: focused tests, the real
Chromium matrix, full unit/Firestore/core-E2E gates, policy checks, production build, exact-SHA CI,
zero-traffic candidate, normalized-config, promotion, and stable readback passed. Its separate
`brand_conformance` gate remains blocked on approved official PMI assets. S86 is also
`ALL_GATES_GREEN` and deployed: shared interaction primitives, exact action inventory, accessible
contextual help, honest busy/result feedback, cancel-first in-app confirmations, shell transient
coordination, and notification failure/retry behavior passed focused and S96-preservation suites,
canonical verification, real-browser coverage, exact-SHA CI, exact candidate/promotion, and stable
readback without widening any effect. S83 is also `ALL_GATES_GREEN` and deployed: its capability-
guided access center, additive role/Space request lifecycle, Admin-only review/apply/reconcile lane,
guarded-surface handoffs, renewal-authority relocation, and connection feedback passed focused,
canonical, core-E2E, exact-SHA CI, candidate/configuration, promotion, stable-route, and registry-
mirror readback gates without applying a role or running a provider effect. S84 is also
`ALL_GATES_GREEN` and deployed: its actor-filtered three-group disclosure navbar, descriptive
destination rows, local glyphs, S83 count reuse, S86 transient registration, responsive
Menu/accordion behavior, and Dashboard/Internal Processes terminology passed focused, real-browser,
canonical, core-E2E, exact-SHA CI, candidate/configuration, exact-promotion, and repeated stable-
readback gates over unchanged routes and guards. S82 is also `ALL_GATES_GREEN` and deployed: its
table-first desk, canonical v2 query and opaque party-filter contract, desk-view continuity,
privacy-bounded access returns, guided six-phase workspace, and compat-route upgrade passed
focused, real-browser, canonical, core-E2E, exact-SHA CI, candidate/configuration,
exact-promotion, stable-readback, and secret/IAM readback gates. S97 is COMPLETE: the closed
slice, all three serial per-key live proofs on the designated lease, and the protected activation
are deployed with mirror readback at 44 keys/ten open. S85's separate `brand_conformance` is
resolved with the official extracted guide values. S98 is the active suite.

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

The active position is step 8 (S98). Implement the two exact operating-Sheet keys
(`google_sheets.renewal_checklist.row_append`, `google_sheets.renewal_checklist.field_update`)
closed behind the S97-pattern gates, then run their serial bounded proof windows on a temporary
real-data row (append/readback, blank-to-source field update, receipt-bound delete, final
absence), close each window, and take the protected activation through the full release train.
The copy-only rehearsal Sheet path is removed in the same suite.

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
