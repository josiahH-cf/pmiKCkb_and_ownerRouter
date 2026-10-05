<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: application-usability-reliability-2026-10 -->

# S172 — Task-sized responsive application layouts

> Status: READY — finalized owner-accepted F05 of batch 005 on 2026-10-04; implementation and delivery NOT RUN. Spec authoring alone does not start execution.

**Goal.**

Use available screen space according to the task while keeping forms, messages and reading comfortable and controls reachable.

**Current state / intended end state.**

Current: Live Dashboard, Renewals, Connections and Admin used the shared 1160 px content cap at a 1600 px viewport. Communications already used the full viewport width. These initial presentations establish inconsistent fit; they do not establish that every screen should be widened or every card resized.

Required end state: Operational tables and working panes use available width; reading/composition regions have appropriate line length and hierarchy. Responsive behavior preserves the same existing tasks rather than squeezing desktop boxes onto phones.

The 2026-10-04 guarded Admin inspection read the canonical application's version as e106a88a50d541b4a012111019b09c2183f6ce20 / pmi-kc-app-rmusp7ehl-7ea8703905ca and inspected initial Dashboard, desk, lease workspace, Communications, Connections, and Admin screens. Its completed pass recorded zero mutation attempts. This establishes those observed presentations only; it does not establish failure handling, persistence, AI inference, all roles, accessibility certification, or a new release. Earlier failed access attempts remain failed. Customer values, raw reports, captures, profiles, and credentials remain outside Git.

**Actors and entry conditions.**

Staff on wide desktop, laptop, phone, tablet and zoomed browsers; shared styles also preserve current sign-in, resident and Vendor flows.

**What it is / how it functions.**

This is one finalized change in batch 005, handoff application-usability-reliability-2026-10, registered in the canonical suite index. The owner accepted the recommendations on 2026-10-04 and requested specifications plus a launch prompt; authoring does not start execution. The future launch instruction selects only this program. Read the program contract in README.md and AGENTS.md; completed, superseded, and unrelated suites remain baselines rather than queued work.

Use the current owners below as verified starting points, then discover every actual consumer within this scope. They are not a frozen selector allowlist. The architecture obligations define the bounded change; the behavior outcomes define the observable success, failure and recovery. Before implementation, bind each trace row to actual tests/readbacks in the native evidence. A missing behavior must fail on the starting source for its intended reason; already-correct behavior gets preservation evidence.

**In scope / out of scope.**

Existing page/container/grid sizing, responsive grouping and reachable overflow. Ordinary cards adapt automatically; manual resizing belongs to S173/S174. No arbitrary draggable dashboard, new layout-settings page or business workflow redesign.

**Open questions & assumptions.**

Breakpoints, minimum readable widths and reading-line calibration are implementation choices tested against real controls and representative long content, not universal numeric promises.

No material product question remains for this authored scope. Ordinary implementation choices are resolved from current evidence. Missing authority or real customer/provider input blocks only its exact effect and is never guessed.

**Cross-product impacts.**

Inspected starting owners:

- `app/globals.css`
- `components/layout/AppShell.tsx`
- `components/console/ConsoleView.tsx`
- `components/lease-renewal/RenewalDeskTable.tsx`
- `components/gmail-hub/GmailHubHome.tsx`
- `app/admin/page.tsx`

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

- **ARCH-S172-1** — Task-aware shared layout composition replaces blanket width decisions while preserving current routes and owning regions. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S172-2** — Grid/container min/max sizing, shrink/wrap and intentional scroll regions prevent clipping, inaccessible controls and page-level accidental overflow. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S172-3** — Desktop, narrow and zoomed presentations retain the owning task and state with compatible themes and accessible reading order. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S172-1** — Wider and narrower regions reflect their actual work. Deterministic falsification: Compare a renewal table, Dashboard composer, Communications and Admin form on the same wide screen; one blanket width change cannot satisfy all cases.
- **BEH-S172-2** — Primary work uses the screen without long, hard-to-read prose lines. Deterministic falsification: Exercise desktop and wide-screen fixtures with long rows and drafts; retain task-appropriate widths, grouping and readable inputs.
- **BEH-S172-3** — Long content cannot push essential controls off screen. Deterministic falsification: Use long names, messages, labels and error text; verify visible/reachable controls and no accidental document-level horizontal overflow.
- **BEH-S172-4** — The same work can be finished on a phone or zoomed browser. Deterministic falsification: Exercise 320 and 390 px widths, intermediate wrapping and 200% zoom; supported tasks, feedback and exits remain operable.
- **BEH-S172-5** — Controls remain reachable near page and panel edges. Deterministic falsification: Scroll to the last field/action with open navigation, a panel and the feedback trigger; focus and activation must not be obscured.
- **BEH-S172-6** — The application feels coherent beyond the renewal screen. Deterministic falsification: A discovery-based coverage matrix must detect an unmigrated consumer or alias; a single improved table cannot close the suite.
- **BEH-S172-7** — Better fit does not change the data or lose work. Deterministic falsification: Resize and switch layouts with unsaved input and pending work; assert content/state parity and zero unintended effect calls.

**Human litmus outcome.**

### Use the space that is available

**If this was built correctly:** A person opens a table on a large screen and can see useful work across the available width. When they compose a message or use a phone, the inputs and actions remain readable and easy to reach.

- Model verdict: NOT RUN — specification-only; implementation runner records PASS or FAIL against every trace row with actual evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                                                                                                                                                                                                              | Architecture outcome | Behavior outcome | Human litmus                    | Deterministic evidence / falsification                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | ---------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S172-1 — Inspect the existing task regions before changing their containers. Classify table/workspace, form/message, reading and secondary-detail needs; choose layout from the task instead of applying full width or larger margins everywhere.                      | ARCH-S172-1          | BEH-S172-1       | Use the space that is available | AC-S172-1; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S172-2 — Let data tables and adjacent working panes use the available application width with deliberate outer gutters. Preserve comfortably readable form/message regions and use remaining space for relevant context only when it supports the task.                 | ARCH-S172-1          | BEH-S172-2       | Use the space that is available | AC-S172-2; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S172-3 — Ensure every grid/flex child can shrink and text wraps or uses a deliberate accessible overflow treatment. Required buttons, labels, validation, filters and exits remain reachable; do not hide the overflow bug with page-level clipping.                   | ARCH-S172-2          | BEH-S172-3       | Use the space that is available | AC-S172-3; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S172-4 — Narrow screens and browser zoom reorganize regions by task priority, preserving DOM reading/focus order. Use a stacked/dedicated detail view where two panes cannot remain usable; do not change capabilities or force a new workflow.                        | ARCH-S172-3          | BEH-S172-4       | Use the space that is available | AC-S172-4; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S172-5 — Keep fixed/sticky utilities, navigation, banners, table headers, panel edges and the Feedback control from covering focused content or final actions. Scroll containers must be intentional and keyboard/touch reachable.                                     | ARCH-S172-2          | BEH-S172-5       | Use the space that is available | AC-S172-5; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S172-6 — Migrate shared consumers consistently across Dashboard, My Work, Internal Processes/processes/runs, Renewals, Maintenance, Communications, notifications, Connections, approvals and Admin, preserving compatible aliases and shared public/Vendor consumers. | ARCH-S172-3          | BEH-S172-6       | Use the space that is available | AC-S172-6; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S172-7 — Preserve existing visible source/working-value distinctions, validation, permissions, focus, light/dark modes and reduced motion. Layout changes must not unmount unsaved editors, discard state or create server/provider writes.                            | ARCH-S172-3          | BEH-S172-7       | Use the space that is available | AC-S172-7; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |

Every row is a completion obligation, including boundary and recovery behavior. Native implementation evidence names each actual test/readback, environment, observed result and any precise unavailable seam. Unit/adapted evidence, compiled-browser evidence, guarded production reads and human observations retain their separate meanings.

**Preservation set.**

Existing authenticated routes and direct guards; current staff/Admin/Vendor and private-account boundaries; complete/partial source and freshness meanings; all-lease visibility and current working values; source differences and notice invalidation; receipt/ambiguity recovery; editable as-displayed unsent drafts; no-send and closed-key refusals; compatible query/return links; keyboard, touch, themes, reduced motion and existing mobile workflows. Any preservation failure fails the slice independently of a visual or timing improvement.

Retain the existing relevant owning tests and add missing preservation checks where the inspected baseline lacks them. Do not weaken a preserved assertion to make a visual, performance or wording change pass. The full native gate remains required for implementation delivery.

**Adversarial acceptance checks.**

- **AC-S172-1** — Verify R-S172-1 through ARCH-S172-1, BEH-S172-1 and the "Use the space that is available" litmus: Compare a renewal table, Dashboard composer, Communications and Admin form on the same wide screen; one blanket width change cannot satisfy all cases.
- **AC-S172-2** — Verify R-S172-2 through ARCH-S172-1, BEH-S172-2 and the "Use the space that is available" litmus: Exercise desktop and wide-screen fixtures with long rows and drafts; retain task-appropriate widths, grouping and readable inputs.
- **AC-S172-3** — Verify R-S172-3 through ARCH-S172-2, BEH-S172-3 and the "Use the space that is available" litmus: Use long names, messages, labels and error text; verify visible/reachable controls and no accidental document-level horizontal overflow.
- **AC-S172-4** — Verify R-S172-4 through ARCH-S172-3, BEH-S172-4 and the "Use the space that is available" litmus: Exercise 320 and 390 px widths, intermediate wrapping and 200% zoom; supported tasks, feedback and exits remain operable.
- **AC-S172-5** — Verify R-S172-5 through ARCH-S172-2, BEH-S172-5 and the "Use the space that is available" litmus: Scroll to the last field/action with open navigation, a panel and the feedback trigger; focus and activation must not be obscured.
- **AC-S172-6** — Verify R-S172-6 through ARCH-S172-3, BEH-S172-6 and the "Use the space that is available" litmus: A discovery-based coverage matrix must detect an unmigrated consumer or alias; a single improved table cannot close the suite.
- **AC-S172-7** — Verify R-S172-7 through ARCH-S172-3, BEH-S172-7 and the "Use the space that is available" litmus: Resize and switch layouts with unsaved input and pending work; assert content/state parity and zero unintended effect calls.

**Forbidden actions / hard gates.**

No client send, autonomous provider action, proof rerun, fabricated production record, new Action Registry key/activation, permission/claim/identity change, credential-store substitution, cost/guardrail change, or unrelated feature execution. Existing source updates and unsent Gmail drafting keep their exact human preview/confirmation, claim, receipt, readback, and correction contracts. A cancel, timeout, navigation, or client abort never proves an external operation stopped. Preserve Production/Live, managed identity, eleven Spaces, Demo=false and the reviewed Sheet switch. Protected paths retain AGENTS.md's owner-direction requirement; design this program through existing interfaces without assuming a protected-path grant.

**Dependencies / sequencing.**

S173/S174 consume the layout foundation; S175/S87/S176 reorganize specific content. S169/S170 loading states must fit the same layouts.

**Standalone delivery contract.**

- **Deliverable now:** Shared task-sized layouts and all affected consumer migrations with viewport/long-content/control-reachability evidence.
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
