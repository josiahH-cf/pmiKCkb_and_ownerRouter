<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-completion-v1 -->

# S104 — Renewal desk and workspace parity closure

> Status: Mostly satisfied by the deployed S82 baseline and its active unreleased remediation. This
> suite closes only the residual gaps the 2026-09-03 owner package adds: rent and term parity from
> S102/S103 and one proof that filters, sort, and return position survive a workspace change.

**Goal.**

The renewal table and the lease workspace show the same current rent, term, status, blocker, and
next action for a lease, and an operator returns from a lease to the same filtered, sorted view.

**Current state / intended end state.**

| Package requirement (PMI-03)                                           | Classification    | Evidence                                                                                                                                        |
| ---------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Table and workspace consume one projection                             | Already satisfied | `loadLiveRenewalDesk` attaches `buildDeskLeaseGuidance` per row; the workspace reads the same summary (`lib/lease-renewal/live-desk.ts`)        |
| Owner, tenant, location, rent, timing, status, blocker, action columns | Already satisfied | S82 required-column table (`docs/feature-suites/guided-renewal-desk-and-workspace.md`)                                                          |
| Lease term column                                                      | Missing           | Delivered by S103                                                                                                                               |
| Filters, sort, period, and return position survive a lease             | Already satisfied | `deskView` continuation (`lib/lease-renewal/desk-view-continuation.ts`, `access-return.ts`) and `tests/unit/s82-desk-view-continuation.test.ts` |
| Corrected rent and term in both surfaces                               | Missing           | Delivered by S102/S103; parity assertion added here                                                                                             |
| Specific blockers, not generic `blocked`                               | Already satisfied | Causal blocker links per phase (`desk-guidance.ts`); status precedence in S82                                                                   |
| Row refresh after a workspace change keeps context                     | Partially         | Post-write freshness reloads the projection; the return link preserves `deskView`; no test proves both together after a write                   |
| Failed supporting read shows unavailable, not empty                    | Already satisfied | Typed auxiliary-read results (`lib/lease-renewal/auxiliary-read.ts`)                                                                            |

Intended end state: no new component; S102/S103 fields render in both surfaces and one integration
check proves table/workspace equality plus context preservation across a workspace write.

**Actors and entry conditions.**

A renewal operator with Renewals Space access on the canonical Live desk or lease workspace.
Navigation stays read-only; writes remain in their owning phases.

**What it is / how it functions.**

1. Add `leaseTerm`, `nextReviewIso`, `currentRent` (lease-scoped), and `unitListedRent` to the
   serialized desk item and the workspace summary through the existing projection, not a parallel
   query.
2. Add one parity test that builds the desk and the workspace for the same fixture lease and asserts
   equal rent, term, overall status, blocker set, and next action.
3. Add one continuation test that opens a lease from a filtered, sorted desk, records a term review
   or discrepancy resolution, and returns through the workspace return link to the identical
   `renewal-desk-query/v2` state with the refreshed row.
4. Extend `scripts/smoke-renewal-desk-browser.mjs` to assert the term cell and the return state after
   a phase navigation.

**In scope / out of scope.**

In scope: field plumbing, parity and continuation tests, smoke extension. Out of scope: navigation,
Dashboard, visual redesign, or a separate status engine.

**Open questions & assumptions.**

None. Rehearsal writes are refused by the Live-read-only descriptor, so the continuation test runs
at the unit/route layer with the store faked; the browser smoke proves navigation only.

**Cross-product impacts.**

Desk table, workspace, desk query serialization, S110 adapters, and S111 proof.

**Authority and evidence map.**

| Input                                                 | Classification                   | Use and limitation                                                 |
| ----------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| S82 contract, committed desk/workspace code and tests | Authority / implementation truth | Column, status, continuation, and read-only navigation rules stay. |
| Owner package PMI-03                                  | Intent evidence                  | Parity and return-position expectations.                           |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S104-1** — Desk item and workspace summary share the S102/S103 fields through one
  projection; a fixture asserting term parity fails until the fields exist.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S104-1** — For one lease the table and workspace return identical rent, term, status,
  blocker, and next action.
- **BEH-S104-2** — Open, write, and return preserves the exact desk query and shows the refreshed row.

**Human litmus outcome.**

### Open a lease and come back to the same list

**If this was built correctly:** The operator filters the table, opens a lease, records something,
and returns to exactly the same filtered and sorted table with that row updated. The lease page and
the table row never disagree about rent, term, status, or what to do next.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with parity, continuation,
  and browser evidence.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                 | Architecture outcome | Behavior outcome | Human litmus                                | Deterministic evidence / falsification          |
| --------------------------- | -------------------- | ---------------- | ------------------------------------------- | ----------------------------------------------- |
| DESK-01 parity              | `ARCH-S104-1`        | `BEH-S104-1`     | Open a lease and come back to the same list | Parity fixture                                  |
| DESK-02, DESK-03 continuity | `ARCH-S104-1`        | `BEH-S104-2`     | Open a lease and come back to the same list | Continuation route test and browser smoke       |
| DESK-04, DESK-05 blockers   | `ARCH-S104-1`        | `BEH-S104-1`     | Open a lease and come back to the same list | Existing S82 auxiliary-read and guidance suites |

**Preservation set.**

All S82 focused suites and `npm run smoke:renewal-desk-browser` stay green.

**Adversarial acceptance checks.**

- **AC-S104-1** — `BEH-S104-1`: a term or rent shown in the workspace but absent from the row fails.
- **AC-S104-2** — `BEH-S104-2`: a return link that drops any v2 parameter fails.
- **AC-S104-3** — `ARCH-S104-1`: no component recomputes status or term locally.

**Forbidden actions / hard gates.**

No write from navigation, no display label in a URL, no second projection.

**Dependencies / sequencing.**

After S102 and S103; before S105.

**Standalone delivery contract.**

- **Deliverable now:** field plumbing, parity/continuation tests, smoke extension.
- **Consumes, but does not assume:** S102/S103 fields; absent fields render `Needs review`.
- **Externally blocked effect:** none.
- **Produces for downstream suites:** the parity assertion S111 reuses.

**Verification and delivery contract.**

1. Freeze the parity and continuation fixtures failing for the expected reason.
2. Run focused desk/workspace/query checks and the browser smoke.
3. Run `bash scripts/verify.sh` and `npm run test:e2e:core`.
4. Report `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only with an explicit budget, or `BLOCKED` (not
   expected).

**Ordered prompt sequence.**

1. Re-verify S82 continuation behavior.
2. Materialize parity/continuation fixtures.
3. Plumb fields; extend the smoke.
4. Run focused and canonical checks; update current docs.

**Deletion/merge recommendation.**

Merge into the S82 contract at closure.
