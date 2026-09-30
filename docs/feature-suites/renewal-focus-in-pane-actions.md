<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-focus-batch-003 -->

# S144 — Execute renewal actions inside Focus view

> Intake: ready, batch 003 item 011. Scope is the existing human-operated renewal lifecycle; no new provider action or release has started.

**Goal.**

Staff can perform each applicable existing renewal action in the Focus pane and advance only after its actual completion condition is established.

**Current state / intended end state.**

The full workspace contains existing manual activity/response controls, comp preparation, reconciliation, source-update panels, message preparation, document handoff and packet/follow-up controls. `RenewalManualProvider` persists cycle/revision-bound staff work; `RenewalSaveFocus` refreshes after some app saves. The current “Do this next” card generally links to a full-view section. No separate Focus pane currently integrates those handlers end to end. The intended pane reuses their forms, validation, routes, calculations, authority and recovery, with no parallel action service.

**Actors and entry conditions.**

The same authenticated lease/cycle actor, role and source-readiness checks as each existing control. A user may view outstanding work without having authority to execute it. Current server-side preconditions decide every submission; a stale UI never grants permission.

**What it is / how it functions.**

Map S142 actions to the actual current handlers and completion evidence before enabling a pane control. Cover applicable current information/forms, comp preparation, source verification/correction, lifecycle date/status, reviewed owner/tenant communication, owner/tenant outcomes, manual activity, documents/signatures/follow-up and final staff completion; skip inapplicable branches rather than inventing stages. Reuse or narrowly extract the full-view controls. Required work done in the app stays in the pane; genuine Gmail/provider handoffs remain external. S139 refinement may be consumed if later implemented but is never a prerequisite. Before submit, recheck exact server lease/cycle revision, current values, role and operation-specific preconditions. Keep input during pending/failure, prevent double submission, honor existing at-most-once/receipt/readback/reconciliation and never blindly retry an ambiguous effect. Refresh shared state on confirmed success; advance only when the existing evidence predicate is met. Opening Gmail, creating an unsent draft, staff reporting a send and provider-confirmed delivery retain different meanings. Re-entry, reload, concurrent save and late source updates derive the next action again; changed upstream facts reopen only actually affected work and preserve historical receipts.

**In scope / out of scope.**

In scope: in-pane integration of applicable existing actions, persistence, conflict/recovery and progression. Out of scope: new approval or analysis product, new lifecycle stages, new provider integration/key, enabling paused Sheet writes, AI batch implementation, automatic sending or a background lease worker.

**Open questions & assumptions.**

No intake-blocking question. Exact applicable action inventory is determined from current code and the selected cycle at implementation time, not from the source's examples alone. A presently unavailable external resource remains a localized waiting state; no fake completion or invented action is allowed. If a current route has no reusable UI, extract the smallest shared control while preserving full-view behavior.

**Cross-product impacts.**

S142–S143, `RenewalManualWorkspace`, comp/message/notice components, source-correction and writeback panels, document/packet/follow-up controls, `RenewalSaveFocus`, existing `/api/lease-renewal/*` routes and readback tests. S128's Sheet pause remains in force.

**Authority and evidence map.**

| Input                                                | Classification                | Use and limitation                                                                                 |
| ---------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------- |
| Router, current handlers/tests and serving full view | Authority / verified baseline | Existing exact action/effect contracts, staff evidence and forms; does not prove in-pane coverage. |
| Source item 011                                      | Owner intent                  | Complete human working lane and evidence-based progression, without new authority.                 |
| Future real provider/actor outcomes                  | External evidence             | Can verify only their exact effect; missing inputs block only affected action.                     |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S144-1** — Every enabled action maps to an owning existing form/route/evidence predicate and exact lease/cycle revision; a mapping/route parity test fails against the current link-only UI.
- **ARCH-S144-2** — Shared refresh and conflict/reconciliation behavior prevents duplicate/ambiguous effect replay and never records a Focus-only step; pending/failure/reload fixtures fail first.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S144-1** — Applicable information, assessment, verification, status/date, communication, response, follow-up and completion controls work in pane under their current roles and evidence levels.
- **BEH-S144-2** — Confirmed saves advance to the next dependency-valid task and appear in Full view; stale, failed, pending and ambiguous results retain context without false advancement or duplicate effects.

**Human litmus outcome.**

### Work a renewal without section hunting

**If this was built correctly:** Staff save needed information, prepare and review the owner message, record actual outside follow-through, continue through the applicable branch and see the same results in Full view. Waiting or uncertain effects remain visible. Record model verdict; without an observer use `Human verdict: NOT RUN — no human observer`.

**Requirement-to-outcome traceability.**

| Requirement                        | Architecture outcome | Behavior outcome | Human litmus                           | Falsification                                                                  |
| ---------------------------------- | -------------------- | ---------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| Complete applicable action mapping | ARCH-S144-1          | BEH-S144-1       | Work a renewal without section hunting | Handler/control inventory and path tests across current renewal branches.      |
| Safe submit and progression        | ARCH-S144-2          | BEH-S144-2       | Work a renewal without section hunting | Wrong cycle, conflict, pending/ambiguous effect, reload and cross-view parity. |

**Preservation set.**

All full-view controls and validations, S105 staff versus provider evidence, S107 attempt recovery, S113 copy/Gmail/comp behavior, S123 cycle retention, S124 move-out routing, S127 save focus, S128 Sheet pause and exact server role/effect tests stay green.

**Adversarial acceptance checks.**

- **AC-S144-1** — Each applicable current action family has a usable in-pane control or genuine external handoff, sharing its full-view handler and server validation; no internal link-only substitute.
- **AC-S144-2** — A confirmed save survives reload, updates Full view, recomputes S142 and advances only when the owning completion evidence is present; independent work stays available.
- **AC-S144-3** — Invalid input, concurrent/wrong-cycle state, duplicate click, provider ambiguity and return from Gmail preserve input and evidence meaning without replaying an effect or claiming a send.

**Forbidden actions / hard gates.**

No autonomous send, provider operation on view entry, hidden Sheet write, guessed recipient/policy/resource, new exact-key activation or relaxed preview/confirmation/readback. Opening an external tab is not completion; staff attestation is not provider verification.

**Dependencies / sequencing.**

Intake item 011 consumes S142's action map and S143's pane; S145 validates the resulting path. S139 is optional future refinement and must not hold this batch. Unavailable Dotloop/S100 inputs remain their existing localized gates, not new Focus prerequisites.

**Standalone delivery contract.**

Deliver the complete in-pane integration for applicable currently supported actions, explicit waiting/refusal for unavailable effects, and route-to-UI parity tests. Mark an unavailable external effect separately from a green app-owned working path; do not call the entire journey live verified without its actual evidence.

**Verification and delivery contract.**

Before editing, inventory exact handlers and create fail-first route, branch, conflict and preservation checks. Exercise the full UI → server → persistence path with controlled fixtures, then `bash scripts/verify.sh`, audit gates/diff and run only authorized live readbacks. Record `ALL_GATES_GREEN` for proven implementation, `BLOCKED` for exact unavailable external input or `BUDGET_EXHAUSTED` only with an explicit budget. Mock success never establishes a live provider effect.

**Ordered prompt sequence.**

1. Recheck action services, roles, cycle checks and current UI handlers.
2. Pin action-to-control/evidence mapping and fail-first success/failure/concurrency cases.
3. Reuse/extract controls in the pane; keep server checks and recovery intact.
4. Verify persistence, cross-view parity, branch coverage and no unintended effects under the authorized run.

**Deletion/merge recommendation.**

Retire only after all applicable in-pane action coverage and remaining external limits are recorded in tested code and current facts.
