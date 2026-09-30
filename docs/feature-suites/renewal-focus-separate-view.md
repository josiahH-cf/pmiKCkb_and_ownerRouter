<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-focus-batch-003 -->

# S143 — Separate lease renewal Focus view

> Intake: ready, batch 003 item 010. Additive presentation scope; implementation and release not started.

**Goal.**

Staff can switch within the same lease and cycle between the current comprehensive dashboard and a separate one-action working view without losing context or silently losing edits.

**Current state / intended end state.**

The serving `RenewalWorkspace` renders the full S113 dashboard with section navigation, guide, forms, copy and one linked “Do this next” card. `RenewalDashboardNavigation` focuses existing sections; `RenewalSaveFocus` returns focus after saves. The separate `RenewalReviewMode` is a different live-review surface, not the requested lease view. No lease-level Full/Focus switch or dedicated action pane is established by current code. Keep the full view the default and its content/behavior intact; add a dedicated pane driven by S142.

**Actors and entry conditions.**

The same signed-in actor and lease/cycle access as the existing workspace. Inspection-only leases retain that boundary. A view switch itself needs no new approval and has no business effect.

**What it is / how it functions.**

Put an accessible “Full view” / “Focus view” switch at lease level in both modes. Preserve desk filters, exact lease/cycle, return path and, where supported, full-view section/scroll context. Keep unsaved form input mounted or use the existing unsaved-change guard before switching; never submit or discard it silently. In Focus view show compact identity and material task context, one primary actor-ready action with its usable controls, plus a compact selector for other independent ready actions. Selecting/defering is presentation only. For blocked work, lead to the resolvable prerequisite; for waiting, unavailable source, rule conflict, failed/ambiguous result and actual completion, show distinct truthful states. Full details remain reachable, while the normal internal path stays in the pane once S144 is connected. Stable selection survives harmless refreshes; after confirmed completion move focus and selection predictably to the next valid action. Use the current responsive/keyboard/status design system.

**In scope / out of scope.**

In scope: isolated lease-level presentation, switch, context/selection, input preservation and accessible states. Out of scope: redesigning or hiding chunks of the full dashboard, restoring the older stepwise UI, a new persisted step counter, new URL scheme, additional approval, or provider authority.

**Open questions & assumptions.**

No intake-blocking question. “Full view” and “Focus view” are accepted labels unless a current equivalent exists; no durable per-user view preference is requested. Full view stays the default. Existing dirty-form behavior must be inspected during implementation; if a component cannot stay mounted, a switch guard must preserve or explicitly protect its input. The exact component boundary is an engineering choice, not a new business rule.

**Cross-product impacts.**

`RenewalWorkspace`, dashboard navigation/sidebars, S127 focus, S142 projection, S144 action controls, desk return links, responsive/accessibility and full-view copy regression tests. No new data store or integration.

**Authority and evidence map.**

| Input                                                | Classification                    | Use and limitation                                                                                  |
| ---------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------- |
| Router, S113/S127 code/tests and serving revision    | Authority / verified baseline     | Full-view behavior, permissions and effects; no Focus view.                                         |
| Source item 010                                      | Owner intent                      | Additive switch and one-action pane; reported dashboard satisfaction is not measured live evidence. |
| Current unsaved-control behavior and viewport checks | Implementation evidence to obtain | Determines safe mount/guard and preservation, not a reason to alter business rules.                 |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S143-1** — An isolated Focus presentation consumes S142 and existing lease/cycle state while full dashboard components remain behaviorally intact; a structural/render fixture fails against the current single surface.
- **ARCH-S143-2** — Switching and action selection are local presentation state, preserve or guard dirty inputs and maintain desk/lease/cycle context; switch-effect and dirty-form fixtures fail before implementation.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S143-1** — Existing entry opens Full view; switch shows one usable next task and other independent ready tasks, and returning restores full-view information/navigation/copy.
- **BEH-S143-2** — Pending, failed, ambiguous, waiting, unknown, rule-conflicted and complete outcomes stay distinct; focus and status announcements remain usable when a task disappears.

**Human litmus outcome.**

### Work in one pane and return to the dashboard

**If this was built correctly:** Staff open the familiar lease dashboard, switch to a focused task, edit safely, and return to the same lease and full details without a surprise save or lost input. Record model verdict; without an observer use `Human verdict: NOT RUN — no human observer`.

**Requirement-to-outcome traceability.**

| Requirement                         | Architecture outcome | Behavior outcome | Human litmus                                 | Falsification                                                                  |
| ----------------------------------- | -------------------- | ---------------- | -------------------------------------------- | ------------------------------------------------------------------------------ |
| Separate, additive view             | ARCH-S143-1          | BEH-S143-1       | Work in one pane and return to the dashboard | Full-view DOM, TOC, navigation and copied bytes compared on the same fixture.  |
| Safe continuity and truthful states | ARCH-S143-2          | BEH-S143-2       | Work in one pane and return to the dashboard | Dirty form, cycle, filters, switch-effect, ready/wait/unknown and focus tests. |

**Preservation set.**

S113 section structure, table of contents, information, forms, control semantics, lease-copy output, desk entry/return, S127 focus targets, S134 labels, role visibility and full-view default remain green.

**Adversarial acceptance checks.**

- **AC-S143-1** — Opening through existing worklist/desk shows unchanged Full view; switching both ways preserves lease/cycle, list context and dirty input or stops with the established guard.
- **AC-S143-2** — Focus is a dedicated one-task surface with material decision context and other independent ready work; normal internal actions do not require repeated full-view navigation once S144 is connected.
- **AC-S143-3** — Switch/selection have zero domain/provider effects; blocked/failed/unknown/completed states and keyboard focus remain coherent across save and refresh.

**Forbidden actions / hard gates.**

No data mutation from opening/switching/selecting; no hidden auto-submit, preference write, provider dispatch, role grant, or change to full-view business behavior. An in-pane control retains its existing backend and effect gates.

**Dependencies / sequencing.**

Intake item 010 consumes S142 action projection; S144 wires all applicable actions; S145 verifies both views. S113/S127/S134 are deployed baselines, not implementation queues. AI batch 002 is not a dependency.

**Standalone delivery contract.**

Deliver the isolated surface, switch, truthful projection states and preservation tests. Mark complete human working-path coverage only after S144 connects the required controls; until then do not describe the pane as an end-to-end renewal solution.

**Verification and delivery contract.**

Record baseline full-view DOM/behavior and copied output before code changes, then fail-first switch, dirty-input, zero-effect and responsive/focus tests. Run focused and canonical `bash scripts/verify.sh` under an authorized execution run; audit exact diff and result evidence. Use `ALL_GATES_GREEN` for tested scope, `BLOCKED` only for a precise external input and `BUDGET_EXHAUSTED` only with an explicit budget.

**Ordered prompt sequence.**

1. Recheck current full-view and form-state baseline at the latest source/serving version.
2. Record fail-first switch, input, context and copy-preservation cases.
3. Add the isolated view, switch, selection and accessible state treatment over S142.
4. Connect S144, falsify full-view regressions and report exact tested versus live scope.

**Deletion/merge recommendation.**

Retire after S145 and serving evidence show both switch behavior and full-view preservation are owned by code/tests/current facts.
