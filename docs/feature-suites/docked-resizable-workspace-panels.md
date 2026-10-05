<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: application-usability-reliability-2026-10 -->

# S174 — Docked resizable workspace information panels

> Status: READY — finalized owner-accepted F07 of batch 005 on 2026-10-04; implementation and delivery NOT RUN. Spec authoring alone does not start execution.

**Goal.**

Show useful record information beside the current task, allowing the user to resize it while both remain usable.

**Current state / intended end state.**

Current: RenewalWorkspaceSidebars mounts independent Lease information and Process guide panels. Live/source inspection confirmed the information panel is fixed-position and has no resize behavior. The captured opening animation was transient evidence and is not proof of settled clipping. Focus/Full defaults and existing lazy mounting/state preservation remain.

Required end state: On sufficiently wide screens Lease information opens as a right-hand docked inspector that reallocates space to the working region. Applicable existing detail panels use the same pattern; phones use a stacked or dedicated detail view with clear return.

The 2026-10-04 guarded Admin inspection read the canonical application's version as e106a88a50d541b4a012111019b09c2183f6ce20 / pmi-kc-app-rmusp7ehl-7ea8703905ca and inspected initial Dashboard, desk, lease workspace, Communications, Connections, and Admin screens. Its completed pass recorded zero mutation attempts. This establishes those observed presentations only; it does not establish failure handling, persistence, AI inference, all roles, accessibility certification, or a new release. Earlier failed access attempts remain failed. Customer values, raw reports, captures, profiles, and credentials remain outside Git.

**Actors and entry conditions.**

Staff inspecting a real lease while keeping edits/current task visible; Full-view users may open the process guide. Existing panels remain read-only on open and retain current controls.

**What it is / how it functions.**

This is one finalized change in batch 005, handoff application-usability-reliability-2026-10, registered in the canonical suite index. The owner accepted the recommendations on 2026-10-04 and requested specifications plus a launch prompt; authoring does not start execution. The future launch instruction selects only this program. Read the program contract in README.md and AGENTS.md; completed, superseded, and unrelated suites remain baselines rather than queued work.

Use the current owners below as verified starting points, then discover every actual consumer within this scope. They are not a frozen selector allowlist. The architecture obligations define the bounded change; the behavior outcomes define the observable success, failure and recovery. Before implementation, bind each trace row to actual tests/readbacks in the native evidence. A missing behavior must fail on the starting source for its intended reason; already-correct behavior gets preservation evidence.

**In scope / out of scope.**

Existing information/detail panel layout, resizing, focus and responsive behavior. Existing process guide remains optional help; no modal inspector requirement, arbitrary card rearrangement or new record editor is introduced.

**Open questions & assumptions.**

The minimum width for a usable split is derived from actual task/panel controls and long-content fixtures. Other detail surfaces adopt docking only where current tasks benefit; actual confirmations stay their existing dialogs.

No material product question remains for this authored scope. Ordinary implementation choices are resolved from current evidence. Missing authority or real customer/provider input blocks only its exact effect and is never guessed.

**Cross-product impacts.**

Inspected starting owners:

- `components/lease-renewal/RenewalWorkspaceSidebars.tsx`
- `components/lease-renewal/RenewalLeaseInformation.tsx`
- `components/lease-renewal/RenewalFocusViewContext.tsx`
- `components/ui/InfoTip.tsx`
- `lib/ui/transient-layer.ts`
- `app/globals.css`

Shared presentation and service changes must preserve other current consumers, direct entry routes, account boundaries and compatible return links. Coordinate with the named dependencies rather than creating parallel owners. Record exact revised source/test ownership in the current native docs after implementation.

**Authority and evidence map.**

| Input                                                                 | Classification                     | Use and limitation                                                                                                                                           |
| --------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`                                                           | Authority and safety               | Exact scope, identities, protected paths, action and release gates; a spec or registry row is not execution authority.                                       |
| Current live readback, source/tests and `docs/facts.md`               | Implementation truth               | Establish actual baseline and preservation; revalidate before implementation. The October 4 read covers initial Admin screens, not every future requirement. |
| October 4 accepted recommendations and general UI/UX audit framework  | Clarified product intent           | Establish this bounded desired behavior. Audit timing/navigation heuristics are not measured guarantees or a mandate to invent new workflows.                |
| `docs/feature-suites/README.md`, `docs/plan.md`, `docs/loop-state.md` | Native program and resume contract | Identify selected specs, decisions, sequencing and evidence status; completed/superseded rows never restart themselves.                                      |
| Missing external input or human observation                           | Scoped dependency                  | Keep its actual unavailable or NOT RUN state; continue independent implementation and fail-closed verification.                                              |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S174-1** — The workspace owns a non-modal split between task content and the existing inspector, preserving mounted editor/data/state boundaries. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S174-2** — The splitter supports pointer/keyboard sizes within meaningful accessible bounds and consumes account layout preferences through S177. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S174-3** — Focus, nested help/transient layers and narrow-screen return state preserve existing coordinator and route/default-view contracts. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S174-1** — The inspector and current task share the screen. Deterministic falsification: Open information while a task editor is visible; compare region bounds and verify the inspector does not cover the primary working region.
- **BEH-S174-2** — Users can adjust the information space without accidental actions. Deterministic falsification: Resize by drag, arrows and collapse/restore at both bounds; assert readable content, reachable controls and zero form/effect dispatch.
- **BEH-S174-3** — The panel has the remembered size where it fits. Deterministic falsification: Change size, close/reopen, change viewport and account; retain appropriate size while avoiding cross-account or customer-state leakage.
- **BEH-S174-4** — Phone users can inspect and return without losing work. Deterministic falsification: Enter details from a task with unsaved input at 390 px and 200% zoom, then return; compare task, focus, edits and scroll.
- **BEH-S174-5** — Presentation changes do not change the lease's work state. Deterministic falsification: Open/resize both panels, switch Full/Focus and return; assert preserved editor values, default view and zero unintended writes.
- **BEH-S174-6** — Keyboard users can enter, use and leave both regions. Deterministic falsification: Open a nested InfoTip, press Escape twice and close the panel; verify layered dismissal, focus restoration and reachable bottom actions.
- **BEH-S174-7** — Similar detail work behaves consistently where it fits. Deterministic falsification: Inspect each migrated detail consumer and an unchanged confirmation/menu; audit task preservation rather than counting converted popups.

**Human litmus outcome.**

### Keep the task and information side by side

**If this was built correctly:** A person opens Lease information. On desktop the task makes room, the person adjusts the divider, and both regions remain usable. On a phone they see the information and return to the same task and edits.

- Model verdict: NOT RUN — specification-only; implementation runner records PASS or FAIL against every trace row with actual evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                                                                                                                                                                                                                             | Architecture outcome | Behavior outcome | Human litmus                               | Deterministic evidence / falsification                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S174-1 — Open Lease information on the right as a docked non-modal region on usable desktop widths, reallocating the main workspace instead of covering it. Keep relevant task inputs/actions and panel content reachable while both are open.                                        | ARCH-S174-1          | BEH-S174-1       | Keep the task and information side by side | AC-S174-1; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S174-2 — Provide discoverable pointer and keyboard resizing with an accessible named separator and current/min/max values. Prevent unusable task/panel sizes; closing/collapsing has a clear restore path and never submits an adjacent form.                                         | ARCH-S174-2          | BEH-S174-2       | Keep the task and information side by side | AC-S174-2; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S174-3 — Remember the user's desktop panel size per account through S177. Opening/closing is transient task state; do not automatically reopen a specific customer's record across sign-ins. Viewport clamping does not rewrite the preferred size.                                   | ARCH-S174-2          | BEH-S174-3       | Keep the task and information side by side | AC-S174-3; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S174-4 — On phones, narrow screens and zoom where both panes cannot work, use a stacked or dedicated detail view with a clear close/back to the same task, filter context, scroll position and unsaved edits. No off-screen drag handle is required.                                  | ARCH-S174-3          | BEH-S174-4       | Keep the task and information side by side | AC-S174-4; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S174-5 — Preserve lazy mounting, current working/source distinctions, independent information/guide state and Focus/Full semantics. Process guide remains optional and visible only in its supported view; resizing/opening never advances a workflow or triggers save/provider work. | ARCH-S174-1          | BEH-S174-5       | Keep the task and information side by side | AC-S174-5; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S174-6 — Restore focus to the correct initiating control on close and honor deepest active help/confirmation Escape ownership. Provide visible focus and clear navigation between panes without a modal focus trap; fixed utilities do not obscure final panel actions.               | ARCH-S174-3          | BEH-S174-6       | Keep the task and information side by side | AC-S174-6; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S174-7 — Apply the docking pattern to other existing useful inspector/detail consumers after current-task evidence, while retaining actual modal confirmations and small-screen behavior. Do not force every popup or menu into a sidebar.                                            | ARCH-S174-1          | BEH-S174-7       | Keep the task and information side by side | AC-S174-7; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |

Every row is a completion obligation, including boundary and recovery behavior. Native implementation evidence names each actual test/readback, environment, observed result and any precise unavailable seam. Unit/adapted evidence, compiled-browser evidence, guarded production reads and human observations retain their separate meanings.

**Preservation set.**

Existing authenticated routes and direct guards; current staff/Admin/Vendor and private-account boundaries; complete/partial source and freshness meanings; all-lease visibility and current working values; source differences and notice invalidation; receipt/ambiguity recovery; editable as-displayed unsent drafts; no-send and closed-key refusals; compatible query/return links; keyboard, touch, themes, reduced motion and existing mobile workflows. Any preservation failure fails the slice independently of a visual or timing improvement.

Retain the existing relevant owning tests and add missing preservation checks where the inspected baseline lacks them. Do not weaken a preserved assertion to make a visual, performance or wording change pass. The full native gate remains required for implementation delivery.

**Adversarial acceptance checks.**

- **AC-S174-1** — Verify R-S174-1 through ARCH-S174-1, BEH-S174-1 and the "Keep the task and information side by side" litmus: Open information while a task editor is visible; compare region bounds and verify the inspector does not cover the primary working region.
- **AC-S174-2** — Verify R-S174-2 through ARCH-S174-2, BEH-S174-2 and the "Keep the task and information side by side" litmus: Resize by drag, arrows and collapse/restore at both bounds; assert readable content, reachable controls and zero form/effect dispatch.
- **AC-S174-3** — Verify R-S174-3 through ARCH-S174-2, BEH-S174-3 and the "Keep the task and information side by side" litmus: Change size, close/reopen, change viewport and account; retain appropriate size while avoiding cross-account or customer-state leakage.
- **AC-S174-4** — Verify R-S174-4 through ARCH-S174-3, BEH-S174-4 and the "Keep the task and information side by side" litmus: Enter details from a task with unsaved input at 390 px and 200% zoom, then return; compare task, focus, edits and scroll.
- **AC-S174-5** — Verify R-S174-5 through ARCH-S174-1, BEH-S174-5 and the "Keep the task and information side by side" litmus: Open/resize both panels, switch Full/Focus and return; assert preserved editor values, default view and zero unintended writes.
- **AC-S174-6** — Verify R-S174-6 through ARCH-S174-3, BEH-S174-6 and the "Keep the task and information side by side" litmus: Open a nested InfoTip, press Escape twice and close the panel; verify layered dismissal, focus restoration and reachable bottom actions.
- **AC-S174-7** — Verify R-S174-7 through ARCH-S174-1, BEH-S174-7 and the "Keep the task and information side by side" litmus: Inspect each migrated detail consumer and an unchanged confirmation/menu; audit task preservation rather than counting converted popups.

**Forbidden actions / hard gates.**

No client send, autonomous provider action, proof rerun, fabricated production record, new Action Registry key/activation, permission/claim/identity change, credential-store substitution, cost/guardrail change, or unrelated feature execution. Existing source updates and unsent Gmail drafting keep their exact human preview/confirmation, claim, receipt, readback, and correction contracts. A cancel, timeout, navigation, or client abort never proves an external operation stopped. Preserve Production/Live, managed identity, eleven Spaces, Demo=false and the reviewed Sheet switch. Protected paths retain AGENTS.md's owner-direction requirement; design this program through existing interfaces without assuming a protected-path grant.

**Dependencies / sequencing.**

S172/S173 establish available workspace sizing; S177 supplies account-owned panel-size storage. Preserve S152 Focus default, S114's deployed panel semantics and the current S165 mobile contracts.

**Standalone delivery contract.**

- **Deliverable now:** Docked/resizable existing panels plus narrow-screen and nested-focus recovery, without any provider effect or changed workflow default.
- **Consumes, but does not assume:** Compatible deployed behavior and the named program contracts. Missing optional source/layout data has an explicit default, unavailable or recoverable state; an unimplemented peer is never treated as deployed.
- **Externally blocked effect:** This authored change requires no new provider activation or business mutation as proof. Any unavailable real input, human verdict or protected authority is recorded only against its exact outcome, with its actual BLOCKED or NOT RUN meaning; independent engineering/release proceeds.
- **Produces for downstream suites:** Verified owning contracts, traceable new behavior and separate preservation evidence for S181's cumulative validation and delivery.

**Verification and delivery contract.**

1. At the start of an explicitly authorized execution, refresh approved WSL authentication, read the actual serving version and relevant source, and freeze the existing behavior and preservation checks. Materialize missing-behavior tests before implementation; they must fail for the expected defect. Already-satisfied requirements receive preservation evidence rather than an artificial failure.
2. Exercise every requirement, architecture outcome, behavior outcome, and adversarial case through the actual owning components and services. Distinguish unit, emulator/backend, compiled-browser, guarded live-read, and human evidence. A passing adapter or screenshot does not establish a customer/provider effect. Use privacy-safe fixtures only in tests.
3. Run focused checks and the existing canonical verification, including bash scripts/verify.sh and npm run test:e2e:core, before an authorized mainline delivery. Keep preservation results separate. Audit scope, diff, secrets/PII, permissions, action contracts, runtime configuration, and deterministic traceability; update any changed route-opening landmark in the release canary in the same slice.
4. Deliver this program cumulatively through the existing runner and release gates: one watcher/lock, exact-main green CI, fresh prerequisites and locked GO, one application build per run, a zero-traffic candidate, guarded exact-revision assurance and reconciliation, receipt-bound promotion, the full 300,000 ms observation, and independent final readbacks. Preserve the reviewed Sheet=true value on candidate/promoted revisions and the captured predecessor's actual value on its recovery target. Consumed receipts/permits never admit this program.
5. Keep actual failed attempts immutable outside Git and diagnose before resuming or replacing them. Pre-dispatch authentication holds recheck the same approved store/checkpoint after change; in-flight or ambiguous operations still require reconciliation. Report ALL_GATES_GREEN only for actually completed requirements and delivery; BLOCKED only for an exact unavailable dependency after independent work is complete; BUDGET_EXHAUSTED only when an explicit budget exists. Human verdicts stay NOT RUN unless a person actually observes.

**Ordered prompt sequence.**

1. Read this complete specification, the canonical program section, router, current facts/resume/plan, and inspected owning source/tests. Revalidate present behavior instead of reviving old prerequisites.
2. Record the relevant baseline, requirement-to-outcome checks, expected fail-first results and preservation checks before implementation. Resolve ordinary technical choices from evidence; never invent missing customer/provider input.
3. Implement the bounded change and its actual loading, failure, recovery, concurrency and compatibility paths in the existing owners. Preserve unsaved work and unrelated/user-owned files.
4. Verify every trace row and adversarial case, then integrate with the other named program changes and existing mobile behavior. Record exact tested environments and unavailable live seams.
5. Carry the verified slice into the native checkpoint and authorized cumulative delivery. Authoring or a registry row alone never runs this sequence.

**Deletion/merge recommendation.**

Keep this suite active through verified program delivery and any remaining acceptance dependency. Retire or merge its narrative only after current code/tests/facts own every contract and the registry retains the exact disposition. Never remove the only unmet requirement, fabricate a human/provider result or restart a completed baseline from its row.
