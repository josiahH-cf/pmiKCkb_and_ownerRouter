<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-focus-batch-003 -->

# S142 — Dependency-aware renewal next actions

> Intake: ready, batch 003 item 009. Specification only; S113 and S127 remain deployed and are not restarted.

**Goal.**

For the selected lease and renewal cycle, derive all genuinely outstanding work and the actions ready now from the existing renewal contract, with exact reasons for waiting, uncertainty, and completion.

**Current state / intended end state.**

Current committed code has `renewal-process.ts` evidence substeps, branch applicability and prerequisites; `workspace-state.ts` has cycle-bound staff activity and a single `nextActivity`; `desk-guidance.ts` selects one action in the current phase; S127 projects issues and focuses a control after an app save. The comprehensive dashboard and those narrower helpers are deployed at the serving revision. They do not establish the requested complete, multiple-ready dependency projection. The user's favorable assessment of the recent makeover is reported experience, not a fresh usability verdict. End state: a read-only action projection that shares existing business rules and can drive a new working view without changing the full dashboard or creating a second workflow.

**Actors and entry conditions.**

An authenticated staff reader selects a lease and its current cycle through existing desk/workspace access. Role, source freshness, cycle retention and process availability come from current server state. A historical cycle is inspectable only under its existing contract and never silently becomes new work.

**What it is / how it functions.**

Project stable lease/cycle/action IDs, label, reason, actual prerequisites, readiness reason, required evidence, existing handler/control, owner, source/version and downstream unlocks where the owning workflow supplies them. Distinguish ready for this actor, ready for another authorized actor, dependency-blocked, waiting on an actor/event, unknown/unverifiable, complete and not applicable without migrating stored status fields. Reuse or narrowly extract the actual process and manual-summary predicates; keep the backend action route authoritative. Model all-required joins, supported alternatives and conditional branches. Resolve an acyclic dependency order independent of display numbering, with existing business priority then a stable tie-breaker; preserve current selection while still valid. Detect a true cycle, missing reference or impossible condition explicitly and continue unrelated ready work. A source failure blocks only dependent actions. Recompute after a relevant save, correction, concurrent update or source refresh, preserving unrelated receipts/history. Final completion uses the existing lifecycle/staff-evidence contract, never an empty-list shortcut.

**In scope / out of scope.**

In scope: value-free action/readiness projection and narrowly shared prerequisite/completion helpers. Out of scope: a new process, persisted task sequence, autonomous worker, new priority policy, AI dependency, replay of completed effects, or presentation changes to S113.

**Open questions & assumptions.**

No intake-blocking business question remains. Implementation must map each action to an existing control and completion predicate before enabling it; an unmapped or conflicting rule is shown as unresolved, not guessed. The examples' numbers describe graph behavior and are not seven required stages. Runtime record availability and any source-specific refusal are execution evidence to obtain, not grounds to invent data.

**Cross-product impacts.**

`renewal-process.ts`, `workspace-state.ts`, `desk-guidance.ts`, `renewal-issues.ts`, lease/cycle projection, role checks and action-route preconditions; S143–S144 consume this projection. S127's desk/full-view guidance remains consistent with the shared rules.

**Authority and evidence map.**

| Input                                                         | Classification                | Use and limitation                                                                                               |
| ------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Router, current code/tests and 100% serving revision readback | Authority / verified baseline | Existing process, staff evidence, action boundaries and shipped full dashboard; no proof of this new projection. |
| Source item 009                                               | Owner intent                  | Dependency semantics, distinct outcomes and full-view preservation; not proof of implementation.                 |
| Lease/cycle, provider and staff records in a future run       | Runtime evidence              | Establish actual readiness; unavailable or ambiguous values stay local unknowns.                                 |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S142-1** — A pure, cycle-scoped projection consumes the owning process/manual/evidence/issue rules, exposes stable action references and never stores a parallel completion counter. A parity fixture fails against the current single-action helper and passes once shared predicates agree.
- **ARCH-S142-2** — The resolver handles all-required, alternative, conditional and convergent edges with deterministic order and explicit cycle/missing-reference diagnostics; synthetic graph fixtures fail before implementation.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S142-1** — Correct actor-ready and other-actor/waiting/unknown/not-applicable/completed sets are returned for the exact cycle, including multiple independent ready actions.
- **BEH-S142-2** — Relevant saved or refreshed evidence changes only affected readiness; a true cycle or unavailable source cannot loop, fabricate completion or erase an unrelated effect receipt.

**Human litmus outcome.**

### Know what can actually happen next

**If this was built correctly:** On a lease with missing information, staff see the information action before the dependent message. After a confirmed save, both newly ready tasks appear; a colleague's task remains visibly outstanding. Record a model verdict with evidence; without an observer use `Human verdict: NOT RUN — no human observer`.

**Requirement-to-outcome traceability.**

| Requirement                         | Architecture outcome | Behavior outcome | Human litmus                       | Falsification                                                                   |
| ----------------------------------- | -------------------- | ---------------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| Canonical cycle/role/evidence truth | ARCH-S142-1          | BEH-S142-1       | Know what can actually happen next | Exact cycle, staff/provider distinction, actor access and S127 parity fixtures. |
| Dependency and refresh integrity    | ARCH-S142-2          | BEH-S142-2       | Know what can actually happen next | All-of/any-of/branch/cycle/missing-edge and changed-source fixtures.            |

**Preservation set.**

S113 full dashboard, S127 single guidance/focus behavior, S123 cycle retention, S124 move-out branch, S128 Sheet pause, S134 lifecycle labels, current manual completion and server-side role/effect checks stay green.

**Adversarial acceptance checks.**

- **AC-S142-1** — Two actions depending on the same two prerequisites stay blocked after the first save and become ready only after the second; an acyclic reverse display order resolves correctly.
- **AC-S142-2** — Alternative and conditional paths avoid phantom work; true cycles/missing references and unknown applicability are diagnostic, without false completion or hiding independent work.
- **AC-S142-3** — Concurrent/upstream changes, another actor, unavailable source and historical cycle produce distinct, stable outcomes while preserving unrelated valid progress and receipts.

**Forbidden actions / hard gates.**

No model-generated business rule, automatic client send, source write, provider-effect replay, grant/key activation, historical-cycle restart or synthetic production record. Projection is read-only; actual action execution retains exact preview, confirmation and readback requirements.

**Dependencies / sequencing.**

Intake item 009 is first; S143 and S144 consume its action IDs and statuses; S145 verifies integration. Existing S113/S127 are baseline, not work to rerun. S135–S141 are independent and unimplemented.

**Standalone delivery contract.**

Deliver the projection, graph diagnostics, parity and fail-closed tests without waiting for a UI or external input. A missing real source blocks only its affected action; it does not block independently checkable projection behavior.

**Verification and delivery contract.**

Capture current code and read-only serving identity, then fail-first representative cycle/graph/parity fixtures. Run focused action-route and lifecycle preservation checks, `bash scripts/verify.sh`, and audit the diff and effect gates. Claim `ALL_GATES_GREEN` only for actually tested code; use `BLOCKED` for a precise unavailable external input and `BUDGET_EXHAUSTED` only if an explicit budget exists. A specification or fixture alone is not live verification.

**Ordered prompt sequence.**

1. Recheck current lease/process/manual/source code and authorized readback.
2. Map real action controls/completion predicates and record fail-first graph, cycle and preservation cases.
3. Build one derived projection with honest unknowns and no persisted sequence.
4. Falsify against route preconditions and current dashboard, then run canonical gates when execution is authorized.

**Deletion/merge recommendation.**

Retire only after its action contract and remaining limits are owned by tested code, serving readback and current facts.
