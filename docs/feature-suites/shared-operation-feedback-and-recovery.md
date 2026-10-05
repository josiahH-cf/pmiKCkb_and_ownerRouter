<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: application-usability-reliability-2026-10 -->

# S169 — Shared operation feedback and recovery

> Status: READY — finalized owner-accepted F02 of batch 005 on 2026-10-04; implementation and delivery NOT RUN. Spec authoring alone does not start execution.

**Goal.**

Give every asynchronous interaction one truthful, accessible lifecycle that users can recognize across the application.

**Current state / intended end state.**

Current: BusyIndicator, Progress, Button, PageState and confirmation primitives already exist. BusyIndicator's default visual delay is 400 ms; individual consumers mix plain buttons, text changes and separate state flags. Framework transitions alone do not order arbitrary asynchronous responses.

Required end state: Existing primitives and consumers share immediate acknowledgment, operation-owned pending/result/failure states and safe recovery. Supporting a spinner is insufficient unless the actual operation drives it.

The 2026-10-04 guarded Admin inspection read the canonical application's version as e106a88a50d541b4a012111019b09c2183f6ce20 / pmi-kc-app-rmusp7ehl-7ea8703905ca and inspected initial Dashboard, desk, lease workspace, Communications, Connections, and Admin screens. Its completed pass recorded zero mutation attempts. This establishes those observed presentations only; it does not establish failure handling, persistence, AI inference, all roles, accessibility certification, or a new release. Earlier failed access attempts remain failed. Customer values, raw reports, captures, profiles, and credentials remain outside Git.

**Actors and entry conditions.**

Mouse, keyboard, touch and assistive-technology users of existing application controls; operations may be reads, app saves or explicitly confirmed provider effects.

**What it is / how it functions.**

This is one finalized change in batch 005, handoff application-usability-reliability-2026-10, registered in the canonical suite index. The owner accepted the recommendations on 2026-10-04 and requested specifications plus a launch prompt; authoring does not start execution. The future launch instruction selects only this program. Read the program contract in README.md and AGENTS.md; completed, superseded, and unrelated suites remain baselines rather than queued work.

Use the current owners below as verified starting points, then discover every actual consumer within this scope. They are not a frozen selector allowlist. The architecture obligations define the bounded change; the behavior outcomes define the observable success, failure and recovery. Before implementation, bind each trace row to actual tests/readbacks in the native evidence. A missing behavior must fail on the starting source for its intended reason; already-correct behavior gets preservation evidence.

**In scope / out of scope.**

Shared interaction-state semantics, accessible indicators, cursor feedback and safe cancellation/retry presentation. No new generic effect executor or hidden business retry policy.

**Open questions & assumptions.**

Indicator dimensions and finite wait budgets are implementation choices calibrated to existing service contracts and measurements. A true percent remains unavailable unless the operation provides an actual completed/total pair.

No material product question remains for this authored scope. Ordinary implementation choices are resolved from current evidence. Missing authority or real customer/provider input blocks only its exact effect and is never guessed.

**Cross-product impacts.**

Inspected starting owners:

- `components/ui/BusyIndicator.tsx`
- `components/ui/Button.tsx`
- `components/ui/PageState.tsx`
- `components/ui/ConfirmationDialog.tsx`
- `lib/ui/transient-layer.ts`

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

- **ARCH-S169-1** — Existing UI primitives carry a consistent operation-owned lifecycle and stable request identity; state does not depend on a single global boolean. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S169-2** — Result admission, supersession and termination prevent stale responses from changing the current control or leaving orphan busy UI. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S169-3** — Accessible status, focus and motion semantics compose with existing confirmation and transient-layer behavior without broad app blocking. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S169-1** — The initiating control visibly acknowledges the action without waiting for the network. Deterministic falsification: Delay the network and also exercise an instant local toggle; only the genuinely pending operation shows a loading state.
- **BEH-S169-2** — Users can identify what is loading and continue independent work. Deterministic falsification: Run two reads and one save simultaneously; completing or failing one cannot clear the others or block an unrelated field.
- **BEH-S169-3** — Progress displays what the system actually knows. Deterministic falsification: Supply no total, invalid totals and changing real totals; reject invented completion and retain an honest indeterminate state.
- **BEH-S169-4** — Overlapping work cannot show an old answer as the latest result. Deterministic falsification: Finish requests in reverse order, throw after dispatch and leave/reenter a screen; assert correct terminal state and no orphan indicator.
- **BEH-S169-5** — A second click does not produce a second consequential attempt. Deterministic falsification: Double-click, retry after lost response and reload during a pending effect; use the original attempt/receipt and assert no extra provider call.
- **BEH-S169-6** — Leaving a wait does not claim that outside work was undone. Deterministic falsification: Abort a client after a server dispatch; the UI must not say cancelled at the provider, failed safely or ready to repeat without evidence.
- **BEH-S169-7** — Pending and terminal states remain understandable without sight, hover or motion. Deterministic falsification: Exercise keyboard-only, touch, reduced motion and a status-announcement assertion; an icon-only or color-only outcome fails.

**Human litmus outcome.**

### Know that the click worked

**If this was built correctly:** A person clicks or taps an action and immediately sees it acknowledged. The affected control or region shows that work is continuing, then shows completion or a clear next step. Other usable work stays available.

- Model verdict: NOT RUN — specification-only; implementation runner records PASS or FAIL against every trace row with actual evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                                                                                                                                                                                                                                                                      | Architecture outcome | Behavior outcome | Human litmus               | Deterministic evidence / falsification                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S169-1 — Acknowledge a deliberate action in the next available rendered interaction state, targeting sub-~400ms visible feedback. For synchronous toggles/local changes show their resulting state without manufacturing a wait; expose pending immediately through label/state even if a spinner is delayed to avoid flicker. | ARCH-S169-1          | BEH-S169-1       | Know that the click worked | AC-S169-1; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S169-2 — Use localized pending indicators and a subtle route indicator for route work. A desktop progress cursor is complementary and scoped to relevant pending work; do not freeze the application or obscure unrelated controls. Multiple simultaneous operations retain independent statuses.                              | ARCH-S169-1          | BEH-S169-2       | Know that the click worked | AC-S169-2; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S169-3 — Show determinate progress only for actual measurable completed/total units; otherwise use an indeterminate indicator or truthful phase label. Never fabricate percentages, time estimates or phase progress.                                                                                                          | ARCH-S169-1          | BEH-S169-3       | Know that the click worked | AC-S169-3; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S169-4 — Every started operation terminates or exposes its bounded recovery state. Newer operation generations win; late results, unmounts, navigation and exceptions cannot leave stale busy state or replace current data.                                                                                                   | ARCH-S169-2          | BEH-S169-4       | Know that the click worked | AC-S169-4; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S169-5 — Prevent duplicate submission of the same consequential operation at the control and retain existing server claims/deduplication. Retry ordinary reads explicitly; uncertain writes recover through their own receipt/reconciliation, never blind redispatch.                                                          | ARCH-S169-2          | BEH-S169-5       | Know that the click worked | AC-S169-5; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S169-6 — Cancel, close, leave and Stop waiting distinguish local UI control from server/provider cancellation. Preserve unsaved input and show an unknown outcome until authoritative reconciliation where a dispatch may have occurred.                                                                                       | ARCH-S169-2          | BEH-S169-6       | Know that the click worked | AC-S169-6; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S169-7 — Provide an accessible name/status, appropriate aria-busy and polite announcements without duplicate narration; preserve focus and keyboard/touch operation, non-color state and reduced-motion/static alternatives. Required meaning never depends on the mouse cursor or animation.                                  | ARCH-S169-3          | BEH-S169-7       | Know that the click worked | AC-S169-7; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |

Every row is a completion obligation, including boundary and recovery behavior. Native implementation evidence names each actual test/readback, environment, observed result and any precise unavailable seam. Unit/adapted evidence, compiled-browser evidence, guarded production reads and human observations retain their separate meanings.

**Preservation set.**

Existing authenticated routes and direct guards; current staff/Admin/Vendor and private-account boundaries; complete/partial source and freshness meanings; all-lease visibility and current working values; source differences and notice invalidation; receipt/ambiguity recovery; editable as-displayed unsent drafts; no-send and closed-key refusals; compatible query/return links; keyboard, touch, themes, reduced motion and existing mobile workflows. Any preservation failure fails the slice independently of a visual or timing improvement.

Retain the existing relevant owning tests and add missing preservation checks where the inspected baseline lacks them. Do not weaken a preserved assertion to make a visual, performance or wording change pass. The full native gate remains required for implementation delivery.

**Adversarial acceptance checks.**

- **AC-S169-1** — Verify R-S169-1 through ARCH-S169-1, BEH-S169-1 and the "Know that the click worked" litmus: Delay the network and also exercise an instant local toggle; only the genuinely pending operation shows a loading state.
- **AC-S169-2** — Verify R-S169-2 through ARCH-S169-1, BEH-S169-2 and the "Know that the click worked" litmus: Run two reads and one save simultaneously; completing or failing one cannot clear the others or block an unrelated field.
- **AC-S169-3** — Verify R-S169-3 through ARCH-S169-1, BEH-S169-3 and the "Know that the click worked" litmus: Supply no total, invalid totals and changing real totals; reject invented completion and retain an honest indeterminate state.
- **AC-S169-4** — Verify R-S169-4 through ARCH-S169-2, BEH-S169-4 and the "Know that the click worked" litmus: Finish requests in reverse order, throw after dispatch and leave/reenter a screen; assert correct terminal state and no orphan indicator.
- **AC-S169-5** — Verify R-S169-5 through ARCH-S169-2, BEH-S169-5 and the "Know that the click worked" litmus: Double-click, retry after lost response and reload during a pending effect; use the original attempt/receipt and assert no extra provider call.
- **AC-S169-6** — Verify R-S169-6 through ARCH-S169-2, BEH-S169-6 and the "Know that the click worked" litmus: Abort a client after a server dispatch; the UI must not say cancelled at the provider, failed safely or ready to repeat without evidence.
- **AC-S169-7** — Verify R-S169-7 through ARCH-S169-3, BEH-S169-7 and the "Know that the click worked" litmus: Exercise keyboard-only, touch, reduced motion and a status-announcement assertion; an icon-only or color-only outcome fails.

**Forbidden actions / hard gates.**

No client send, autonomous provider action, proof rerun, fabricated production record, new Action Registry key/activation, permission/claim/identity change, credential-store substitution, cost/guardrail change, or unrelated feature execution. Existing source updates and unsent Gmail drafting keep their exact human preview/confirmation, claim, receipt, readback, and correction contracts. A cancel, timeout, navigation, or client abort never proves an external operation stopped. Preserve Production/Live, managed identity, eleven Spaces, Demo=false and the reviewed Sheet switch. Protected paths retain AGENTS.md's owner-direction requirement; design this program through existing interfaces without assuming a protected-path grant.

**Dependencies / sequencing.**

Uses S168's evidence and existing S86 primitives; S170-S171 migrate consumers. Completed S86 remains a preservation baseline.

**Standalone delivery contract.**

- **Deliverable now:** Shared operation semantics and primitive regressions with actual slow/failure/overlap cases, consumable without changing any provider contract.
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
