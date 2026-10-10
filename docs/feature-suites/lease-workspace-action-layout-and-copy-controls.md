<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S197 — Lease workspace action layout and consistent copy controls

> Status: READY — finalized authoring contract; not implemented, queued, activated or released by this specification. Execution requires explicit owner direction under the existing native loop.

**Goal.**

Reduce lease-page scrolling and make common values easy to copy while preserving the complete workflow.

**Current state / intended end state.**

Current: Focus/Full view, in-pane execution, a workspace resizer, staff progress and a running Status log are implemented. Focus reveals one existing action region. Copy controls already exist for selected renewal values with bounded clipboard handling; the request extends visibility and consistency rather than creating a second workflow.

Intended: The lease retains visible identity and a grouped action workspace, resizable panels and collapsible secondary information. Suggested next work and recorded work sit together on wide screens, the Status log is easier to reach, and appropriate displayed operational values have unobtrusive copy icons.

The current implementation baseline was inspected in the clean WSL main checkout at
`43bad3adc7777ea035bc70eb8d2bee913427c810`; production readback identified the October 8
serving revision `pmi-kc-app-rmuz9g28p-0a2909d490e1` at
`337ac163c5709381e8db8d2c18810bec357d8a96`. The Windows authoring checkout is older and contains
unrelated work. Re-verify the implementation checkout and live state before execution; these
observations do not authorize copying/resetting either checkout or rerunning completed proofs.

**Actors and entry conditions.**

Authorized managed PMI staff use their existing roles and record/Space scope. Admin manages
organization configuration where stated; business titles do not confer permissions. Vendors are
restricted to their explicit assigned work where a suite enables it. The runner may author this
contract now and may implement only under a later explicit execution instruction. Real source
identities and unavailable provider/configuration inputs must remain distinguishable from local
working data and deterministic test fixtures.

**What it is / how it functions.**

The lease retains visible identity and a grouped action workspace, resizable panels and collapsible secondary information. Suggested next work and recorded work sit together on wide screens, the Status log is easier to reach, and appropriate displayed operational values have unobtrusive copy icons. Each requirement below is independently falsifiable; implementation must satisfy the
structural obligation and the observed behavior, including the named failure/alternate cases.

**In scope / out of scope.**

Layout and copy affordances across the affected operational UI. No replacement of workflow state machines, duplicated controls, implicit provider actions or copy of hidden/private values.

**Open questions & assumptions.**

No product blocker. Final spacing/section defaults follow existing design conventions and verified content; responsive behavior is required rather than a prescribed pixel layout.

**Cross-product impacts.**

- components/lease-renewal/RenewalWorkspace.tsx; RenewalWorkspaceSidebars.tsx; RenewalFocusViewPane.tsx.
- components/lease-renewal/RenewalManualWorkspace.tsx; RenewalWorkStatusControl.tsx; RenewalCopyValue.tsx.
- components/ui/WorkspaceResizer.tsx; related operational detail surfaces.

These are evidence-grounded owning areas, not an instruction to create an invented file/schema.
Use the current owning service when the implementation checkout differs.

**Authority and evidence map.**

| Input                                                                              | Classification                                | Use and limitation                                                                                                                         |
| ---------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Router; current committed source/tests; fresh readback                             | Current authority and implementation evidence | Establish current boundaries and starting state; authoring changes no live key, role, setting or provider state.                           |
| October 8 meeting/PDF/images and October 9 owner corrections in this clarification | Confirmed product intent                      | Establish the desired behavior in the requirement rows. New explicit corrections govern; historical screenshots are not operational proof. |
| Existing native suites and actual provider contracts                               | Compatibility and integration evidence        | Reuse delivered behavior and exact provider semantics; absent inputs do not become assumed capabilities.                                   |
| WSL baseline and October 8 serving identity above                                  | Bounded observation                           | Prevent stale Windows code from being mistaken for current implementation; re-verify before execution.                                     |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S197-1** — Reuse the existing action snapshot and owning controls; move or reveal regions without creating divergent forms or state copies, and keep lease identity visible.
- **ARCH-S197-2** — Provide accessible collapse/expand for secondary panels while retaining lease identity, current outcome, blocking issue and chosen action context.
- **ARCH-S197-3** — Retain resize behavior and present Suggested next and Recorded renewal work beside one another when space allows, stacking them coherently on narrow screens.
- **ARCH-S197-4** — Keep its existing audited history and draft behavior while positioning it near current work with clear recent activity and access to older entries.
- **ARCH-S197-5** — Apply the existing bounded local clipboard primitive to names, email addresses, record references, addresses, displayed amounts and message text where copying is useful; give each icon a specific accessible name.
- **ARCH-S197-6** — Keep owner email property address and dollar figures emphasized in HTML and plain text free of markup; rich output passes through S187 without stripping formatting.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S197-1** — Keep identity visible while grouping real actions by task. Staff reach the chosen action without a long full-page scan; switching task/view retains entered values and never executes an action.
- **BEH-S197-2** — Collapse secondary facts without hiding critical status. A collapsed panel is discoverable and keyboard operable; a real failure or stale approval is still visible and cannot be hidden by a saved layout preference.
- **BEH-S197-3** — Make workspace sizing and paired progress sections useful. A wide-screen operator compares next and recorded work at once; resized/narrow layouts preserve all controls and text without overlap.
- **BEH-S197-4** — Bring the running Status log into the primary workflow. Staff find/add a note and review its outcome without scrolling through unrelated sections; older entries and prior-term meaning remain intact.
- **BEH-S197-5** — Provide consistent copy icons for useful visible operational values. Copy transfers only the intended visible value, confirms locally and leaves text selectable if clipboard is refused; no telemetry, hidden data or provider request is introduced.
- **BEH-S197-6** — Preserve message formatting through the communications handoff. The preview and transmitted exact rich message retain bold address/amounts; plain-text copy contains the readable values without HTML or markdown decoration.

**Human litmus outcome.**

### Lease workspace action layout and consistent copy controls

**If this was built correctly:** Reduce lease-page scrolling and make common values easy to copy while preserving the complete workflow. A staff operator can carry out the primary journey,
understand the stated pending/failure states and recover without silently losing work or creating a
duplicate effect. The implementation evidence must exercise the specific scenarios in every row.

- Model verdict: LOCAL EVIDENCE — implementation and mapped engineering checks are recorded per requirement in `docs/evidence/operations-communications-maintenance-2026-10.json`; the complete local canonical gate and core E2E passed in their recorded scopes; exact-main CI and runtime/delivery remain separately verified gates. No live provider effect or human observation is claimed.
  with evidence after execution.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                                                    | Architecture outcome | Behavior outcome | Human litmus                                               | Deterministic evidence / falsification                                                                                                                                                         |
| ------------------------------------------------------------------------------ | -------------------- | ---------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S197-1: Keep identity visible while grouping real actions by task.           | `ARCH-S197-1`        | `BEH-S197-1`     | Lease workspace action layout and consistent copy controls | `AC-S197-1`: Staff reach the chosen action without a long full-page scan; switching task/view retains entered values and never executes an action.                                             |
| R-S197-2: Collapse secondary facts without hiding critical status.             | `ARCH-S197-2`        | `BEH-S197-2`     | Lease workspace action layout and consistent copy controls | `AC-S197-2`: A collapsed panel is discoverable and keyboard operable; a real failure or stale approval is still visible and cannot be hidden by a saved layout preference.                     |
| R-S197-3: Make workspace sizing and paired progress sections useful.           | `ARCH-S197-3`        | `BEH-S197-3`     | Lease workspace action layout and consistent copy controls | `AC-S197-3`: A wide-screen operator compares next and recorded work at once; resized/narrow layouts preserve all controls and text without overlap.                                            |
| R-S197-4: Bring the running Status log into the primary workflow.              | `ARCH-S197-4`        | `BEH-S197-4`     | Lease workspace action layout and consistent copy controls | `AC-S197-4`: Staff find/add a note and review its outcome without scrolling through unrelated sections; older entries and prior-term meaning remain intact.                                    |
| R-S197-5: Provide consistent copy icons for useful visible operational values. | `ARCH-S197-5`        | `BEH-S197-5`     | Lease workspace action layout and consistent copy controls | `AC-S197-5`: Copy transfers only the intended visible value, confirms locally and leaves text selectable if clipboard is refused; no telemetry, hidden data or provider request is introduced. |
| R-S197-6: Preserve message formatting through the communications handoff.      | `ARCH-S197-6`        | `BEH-S197-6`     | Lease workspace action layout and consistent copy controls | `AC-S197-6`: The preview and transmitted exact rich message retain bold address/amounts; plain-text copy contains the readable values without HTML or markdown decoration.                     |

**Preservation set.**

Focus/Full roundtrip, unsaved inputs and save focus, lease/cycle identity, current operations and disclosures, bounded clipboard lifetime/refusal, accessible keyboard controls and mobile use. Record these as a separate gate, not an average with new feature checks.

**Adversarial acceptance checks.**

- **AC-S197-1** — Falsify `ARCH-S197-1` / `BEH-S197-1`: Staff reach the chosen action without a long full-page scan; switching task/view retains entered values and never executes an action.
- **AC-S197-2** — Falsify `ARCH-S197-2` / `BEH-S197-2`: A collapsed panel is discoverable and keyboard operable; a real failure or stale approval is still visible and cannot be hidden by a saved layout preference.
- **AC-S197-3** — Falsify `ARCH-S197-3` / `BEH-S197-3`: A wide-screen operator compares next and recorded work at once; resized/narrow layouts preserve all controls and text without overlap.
- **AC-S197-4** — Falsify `ARCH-S197-4` / `BEH-S197-4`: Staff find/add a note and review its outcome without scrolling through unrelated sections; older entries and prior-term meaning remain intact.
- **AC-S197-5** — Falsify `ARCH-S197-5` / `BEH-S197-5`: Copy transfers only the intended visible value, confirms locally and leaves text selectable if clipboard is refused; no telemetry, hidden data or provider request is introduced.
- **AC-S197-6** — Falsify `ARCH-S197-6` / `BEH-S197-6`: The preview and transmitted exact rich message retain bold address/amounts; plain-text copy contains the readable values without HTML or markdown decoration.

**Forbidden actions / hard gates.**

This authoring request does not implement, commit, push, deploy, activate, send or mutate provider
records. Keep secrets, raw Gmail/customer bodies, credentials and private evidence outside Git.
Do not invent source IDs, recipient addresses, owner agreements, financial authority, provider
capabilities or human verdicts. Preserve current runtime boundaries until the specifically requested
governance contract is implemented under execution authority. A future named-program execution
instruction carries its approved scope through the existing delivery phases; it does not grant an
unrelated identity, cost, security, provider action or historical proof rerun.

**Dependencies / sequencing.**

Consumes existing S142–S145/S152/S164/S170 behavior, S195 visible recommendations and S198 task links. Preserve old routes and controls; independently implementable with unset neighboring projections.

**Standalone delivery contract.**

- **Deliverable now:** A future authorized implementation can produce the complete bounded
  behavior, migration/refusal/recovery paths, tests and documentation for the requirements above.
  This authoring deliverable is the finalized registered specification only.
- **Consumes, but does not assume:** Neighboring projections and actual runtime inputs named above;
  unavailable values remain explicitly unset/blocked, never fabricated.
- **Externally blocked effect:** Missing actual provider connection, capability, exact activation or
  reviewed operational input blocks only its named effect. Record the affected acceptance case;
  complete independent behavior and do not call the whole suite operationally complete prematurely.
- **Produces for downstream suites:** The stated behavior, stable owning-service contracts and
  separate architecture, behavior, preservation and integration evidence.

**Verification and delivery contract.**

1. Re-verify current source/live state and the existing preservation checks before implementation.
   Materialize an expected-failing check for each missing requirement; already delivered behavior
   gets a passing preservation baseline, not a manufactured failure.
2. Verify each `ARCH-S197-*`, `BEH-S197-*` and `AC-S197-*` scenario, including the row's failure,
   boundary and recovery case. Use compiled browser checks for material UI journeys and backend
   tests for real access/intent/persistence boundaries; adapter tests do not prove live effects.
3. Run the native canonical verification and authoring/reference checks required by the affected
   slice. Run `bash scripts/verify.sh` for implementation delivery, inspect the mechanical diff and
   preserve privacy, exact provider gates and unrelated work. No deployment is part of authoring.
4. Report `ALL_GATES_GREEN` only for the actual verified scope; `BUDGET_EXHAUSTED` only when an
   explicit budget exists; or `BLOCKED` for an exact unresolved input/authority after independent
   work is complete. Keep code readiness, live proof and human observation separately truthful.

**Ordered prompt sequence.**

1. Read this contract, S183 and its named dependencies; verify the real source and baseline.
2. Establish each architecture/behavior falsification and the independent preservation gate.
3. Implement the bounded owning-service and UI changes with recovery/migration as required.
4. Exercise all requirement rows, verify integration and report exact readiness/limitations.
5. Update the existing native state/evidence only during authorized implementation; deliver through
   the existing process only when the owner has explicitly instructed execution.

**Deletion/merge recommendation.**

Do not retire this unimplemented suite. After verified delivery, consolidate only when each
requirement, preservation obligation and remaining dependency has a current code/test/fact owner;
retain historical failure/effect meaning and the native intake status.
