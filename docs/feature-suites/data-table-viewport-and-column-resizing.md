<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: application-usability-reliability-2026-10 -->

# S173 — Usable table viewports and resizable columns

> Status: READY — finalized owner-accepted F06 of batch 005 on 2026-10-04; implementation and delivery NOT RUN. Spec authoring alone does not start execution.

**Goal.**

Make existing operational tables practical workflow hubs with readable rows, reachable scrolling, discoverable filters and resizable columns.

**Current state / intended end state.**

Current: RenewalDeskTable is a server-rendered table with column-owned GET filters/sort, a sticky identity column and scroll-region styles. Live rows display substantial contact/source metadata and tall supporting content. Manual column resizing is absent. Existing filters and sort controls are preserved capabilities.

Required end state: Renewal and other existing applicable data tables fit their workspace, expose horizontal/vertical movement where users are working, and let users resize desktop columns without losing labels, fields or actions. Secondary row detail is reachable on demand.

The 2026-10-04 guarded Admin inspection read the canonical application's version as e106a88a50d541b4a012111019b09c2183f6ce20 / pmi-kc-app-rmusp7ehl-7ea8703905ca and inspected initial Dashboard, desk, lease workspace, Communications, Connections, and Admin screens. Its completed pass recorded zero mutation attempts. This establishes those observed presentations only; it does not establish failure handling, persistence, AI inference, all roles, accessibility certification, or a new release. Earlier failed access attempts remain failed. Customer values, raw reports, captures, profiles, and credentials remain outside Git.

**Actors and entry conditions.**

Staff scanning, filtering, sorting and opening records by pointer, keyboard or touch; each table keeps its current row and authorization semantics.

**What it is / how it functions.**

This is one finalized change in batch 005, handoff application-usability-reliability-2026-10, registered in the canonical suite index. The owner accepted the recommendations on 2026-10-04 and requested specifications plus a launch prompt; authoring does not start execution. The future launch instruction selects only this program. Read the program contract in README.md and AGENTS.md; completed, superseded, and unrelated suites remain baselines rather than queued work.

Use the current owners below as verified starting points, then discover every actual consumer within this scope. They are not a frozen selector allowlist. The architecture obligations define the bounded change; the behavior outcomes define the observable success, failure and recovery. Before implementation, bind each trace row to actual tests/readbacks in the native evidence. A missing behavior must fail on the starting source for its intended reason; already-correct behavior gets preservation evidence.

**In scope / out of scope.**

Actual existing tabular/list-workspace viewport handling and data-table column resizing. Do not convert every list to a table, add arbitrary card resizing, remove known records or alter filter meanings.

**Open questions & assumptions.**

Other tables and their supported query controls are discovered from current routes/components; current role/Space-filtered inventory governs which rows exist. No fixed row-height or column-width promise is invented.

No material product question remains for this authored scope. Ordinary implementation choices are resolved from current evidence. Missing authority or real customer/provider input blocks only its exact effect and is never guessed.

**Cross-product impacts.**

Inspected starting owners:

- `components/lease-renewal/RenewalDeskTable.tsx`
- `components/lease-renewal/RenewalDeskGetForm.tsx`
- `app/globals.css`
- `components/approval/ApprovalQueueListPanel.tsx`
- `components/admin/SupportReportsPanel.tsx`

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

- **ARCH-S173-1** — Column widths, table viewport bounds and resize controls extend the existing table owner without a second source/query projection. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S173-2** — Shared table scrolling/header/identity behavior composes with contextual filter layers and the global transient/focus coordinator. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S173-3** — Primary versus secondary row content is derived from actual task relevance and preserves full detail through its owning record/detail surface. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S173-1** — Users can reach all columns and rows from their working position. Deterministic falsification: Exercise a long portfolio and a horizontally overflowing table at desktop and laptop sizes; reach the last column/action without scrolling to the entire table's bottom.
- **BEH-S173-2** — A crowded column can be resized without changing its view. Deterministic falsification: Drag and keyboard-resize next to a sort/filter control; assert no unintended query change, inaccessible zero-width column or clipped required content.
- **BEH-S173-3** — Column filters remain usable at the edge of the screen. Deterministic falsification: Open the rightmost filter on a narrow/zoomed viewport with long choices; Apply, dismiss and recovery remain visible and operable.
- **BEH-S173-4** — Rows support scanning while full context remains available. Deterministic falsification: Use multiple similarly named parties, long addresses, source differences and ambiguous matches; compact rows must remain distinguishable and their full details reachable.
- **BEH-S173-5** — Better table presentation preserves what the worklist actually contains. Deterministic falsification: Compare pre/post projections and exercise partial sources, active/all/completed scopes and zero matches; presentation cannot silently hide a known record.
- **BEH-S173-6** — Column choices persist without breaking a smaller screen. Deterministic falsification: Save a wide-screen width, open a phone and reopen desktop; retain the preferred desktop choice while each current viewport remains usable.
- **BEH-S173-7** — The table remains usable without dragging or hover. Deterministic falsification: Exercise keyboard-only sorting/filtering/resizing and touch scrolling, with request counts and row-access checks on a large fixture.

**Human litmus outcome.**

### Work through the table

**If this was built correctly:** A person filters the renewal list, adjusts a crowded column, moves across the table without hunting for a distant scrollbar, and opens a lease. Key facts stay readable, and fuller detail is one clear action away.

- Model verdict: NOT RUN — specification-only; implementation runner records PASS or FAIL against every trace row with actual evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                                                                                                                                                                                                                                      | Architecture outcome | Behavior outcome | Human litmus           | Deterministic evidence / falsification                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | ---------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S173-1 — Use the available task workspace and bound table height/scrolling where needed so horizontal and vertical navigation are reachable near the current viewport. Preserve sticky headers and record identity where they help scanning; avoid competing accidental scroll traps.          | ARCH-S173-1          | BEH-S173-1       | Work through the table | AC-S173-1; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S173-2 — Add discoverable pointer and keyboard column resizing to actual applicable desktop data tables. Clamp widths to usable bounds, expose accessible resize semantics and retain full-value access; resizing never sorts, filters or navigates as an accidental side effect.              | ARCH-S173-1          | BEH-S173-2       | Work through the table | AC-S173-2; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S173-3 — Keep filter menus and their Apply/clear controls visible within the table/viewport boundaries, including edge columns, sticky regions and zoom. Opening, typing, dismissing and applying preserve unrelated filters and user input.                                                   | ARCH-S173-2          | BEH-S173-3       | Work through the table | AC-S173-3; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S173-4 — Keep the primary row identity, parties needed to distinguish records, relevant date/rent/status and next action readable. Move supporting contact IDs, repeated labels and long explanations into an accessible row/detail path without losing source meaning or navigation.          | ARCH-S173-3          | BEH-S173-4       | Work through the table | AC-S173-4; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S173-5 — Preserve the current row set, counts, all-lease visibility, complete/partial/freshness states, default scope, zero-match recovery and typed filter/sort meanings. Never substitute an empty result for a failed source or remove inactive/history records from their supported views. | ARCH-S173-3          | BEH-S173-5       | Work through the table | AC-S173-5; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S173-6 — Integrate column choices and supported table view settings with S177. The current screen responds immediately; failed preference saving is visible and does not undo the usable local layout. Responsive clamping does not overwrite the user's saved desktop width.                  | ARCH-S173-1          | BEH-S173-6       | Work through the table | AC-S173-6; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S173-7 — Preserve semantic headers, aria-sort, focus, visible non-color states, touch targets and accessible full-content access. Any performance optimization must retain complete reachable rows and filters, with no per-row provider/store work.                                           | ARCH-S173-2          | BEH-S173-7       | Work through the table | AC-S173-7; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |

Every row is a completion obligation, including boundary and recovery behavior. Native implementation evidence names each actual test/readback, environment, observed result and any precise unavailable seam. Unit/adapted evidence, compiled-browser evidence, guarded production reads and human observations retain their separate meanings.

**Preservation set.**

Existing authenticated routes and direct guards; current staff/Admin/Vendor and private-account boundaries; complete/partial source and freshness meanings; all-lease visibility and current working values; source differences and notice invalidation; receipt/ambiguity recovery; editable as-displayed unsent drafts; no-send and closed-key refusals; compatible query/return links; keyboard, touch, themes, reduced motion and existing mobile workflows. Any preservation failure fails the slice independently of a visual or timing improvement.

Retain the existing relevant owning tests and add missing preservation checks where the inspected baseline lacks them. Do not weaken a preserved assertion to make a visual, performance or wording change pass. The full native gate remains required for implementation delivery.

**Adversarial acceptance checks.**

- **AC-S173-1** — Verify R-S173-1 through ARCH-S173-1, BEH-S173-1 and the "Work through the table" litmus: Exercise a long portfolio and a horizontally overflowing table at desktop and laptop sizes; reach the last column/action without scrolling to the entire table's bottom.
- **AC-S173-2** — Verify R-S173-2 through ARCH-S173-1, BEH-S173-2 and the "Work through the table" litmus: Drag and keyboard-resize next to a sort/filter control; assert no unintended query change, inaccessible zero-width column or clipped required content.
- **AC-S173-3** — Verify R-S173-3 through ARCH-S173-2, BEH-S173-3 and the "Work through the table" litmus: Open the rightmost filter on a narrow/zoomed viewport with long choices; Apply, dismiss and recovery remain visible and operable.
- **AC-S173-4** — Verify R-S173-4 through ARCH-S173-3, BEH-S173-4 and the "Work through the table" litmus: Use multiple similarly named parties, long addresses, source differences and ambiguous matches; compact rows must remain distinguishable and their full details reachable.
- **AC-S173-5** — Verify R-S173-5 through ARCH-S173-3, BEH-S173-5 and the "Work through the table" litmus: Compare pre/post projections and exercise partial sources, active/all/completed scopes and zero matches; presentation cannot silently hide a known record.
- **AC-S173-6** — Verify R-S173-6 through ARCH-S173-1, BEH-S173-6 and the "Work through the table" litmus: Save a wide-screen width, open a phone and reopen desktop; retain the preferred desktop choice while each current viewport remains usable.
- **AC-S173-7** — Verify R-S173-7 through ARCH-S173-2, BEH-S173-7 and the "Work through the table" litmus: Exercise keyboard-only sorting/filtering/resizing and touch scrolling, with request counts and row-access checks on a large fixture.

**Forbidden actions / hard gates.**

No client send, autonomous provider action, proof rerun, fabricated production record, new Action Registry key/activation, permission/claim/identity change, credential-store substitution, cost/guardrail change, or unrelated feature execution. Existing source updates and unsent Gmail drafting keep their exact human preview/confirmation, claim, receipt, readback, and correction contracts. A cancel, timeout, navigation, or client abort never proves an external operation stopped. Preserve Production/Live, managed identity, eleven Spaces, Demo=false and the reviewed Sheet switch. Protected paths retain AGENTS.md's owner-direction requirement; design this program through existing interfaces without assuming a protected-path grant.

**Dependencies / sequencing.**

S172 supplies workspace width, S170 supplies filter feedback, S177 owns durable filter/sort/column preferences, and S176 applies renewal-specific copy reduction. Existing S82/S122/S166 remain baselines.

**Standalone delivery contract.**

- **Deliverable now:** Table viewport, resize, filter placement and row-hierarchy behavior with actual overflow/keyboard/long-row and preference compatibility checks.
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
