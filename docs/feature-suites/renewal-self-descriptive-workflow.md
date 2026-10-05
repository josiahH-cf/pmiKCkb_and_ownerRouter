<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: application-usability-reliability-2026-10 -->

# S176 — Self-descriptive renewal workflows without instructional subtext

> Status: READY — finalized owner-accepted F10 of batch 005 on 2026-10-04; implementation and delivery NOT RUN. Spec authoring alone does not start execution.

**Goal.**

Staff can work through any lease using clear section names, field labels, current status and action controls, with no instructional paragraphs in the default renewal experience.

**Current state / intended end state.**

Current: The deployed Focus-default workspace, Full view, section-help definitions, lease information, working values/autosave and current staff lane are the real starting point. Initial live lease and desk screens still contain substantial process narration and explanatory status text. Instructional subtext is not the same as a live discrepancy, notice warning, validation error or exact external-effect confirmation.

Required end state: Focus, Full view, the desk, lease information and existing renewal action panels share concise human wording. Default instructional paragraphs and redundant informational boxes are removed. Persistent labels and useful examples make inputs clear; optional process guidance and genuine help remain reachable without occupying the normal work surface.

The 2026-10-04 guarded Admin inspection read the canonical application's version as e106a88a50d541b4a012111019b09c2183f6ce20 / pmi-kc-app-rmusp7ehl-7ea8703905ca and inspected initial Dashboard, desk, lease workspace, Communications, Connections, and Admin screens. Its completed pass recorded zero mutation attempts. This establishes those observed presentations only; it does not establish failure handling, persistence, AI inference, all roles, accessibility certification, or a new release. Earlier failed access attempts remain failed. Customer values, raw reports, captures, profiles, and credentials remain outside Git.

**Actors and entry conditions.**

Ordinary authorized staff work any accessible lease under the deployed S154/S160/S167 contracts; Admin-only tools stay Admin-only. The lease may have no working record, missing links, an unfinished cycle, different source values or an ambiguous update. Those are current states to represent, not reasons to restore old cycle-start/approval gates.

**What it is / how it functions.**

This is one finalized change in batch 005, handoff application-usability-reliability-2026-10, registered in the canonical suite index. The owner accepted the recommendations on 2026-10-04 and requested specifications plus a launch prompt; authoring does not start execution. The future launch instruction selects only this program. Read the program contract in README.md and AGENTS.md; completed, superseded, and unrelated suites remain baselines rather than queued work.

Use the current owners below as verified starting points, then discover every actual consumer within this scope. They are not a frozen selector allowlist. The architecture obligations define the bounded change; the behavior outcomes define the observable success, failure and recovery. Before implementation, bind each trace row to actual tests/readbacks in the native evidence. A missing behavior must fail on the starting source for its intended reason; already-correct behavior gets preservation evidence.

**In scope / out of scope.**

All default renewal instructional prose, meaningful headings/buttons/field labels, current-state wording, optional help and guide reachability. This is presentation of the deployed workflow. It does not add approval prerequisites, change working/source precedence, rewrite customer template content, remove historical evidence or redesign the move-out business workflow.

**Open questions & assumptions.**

The precise amount of removable text is discovered from the current rendered owners, not a word-count promise. Keep a concise necessary status/consequence when deleting a four-sentence explanation would otherwise mislead. Approved process/legal substance and missing resources are not guessed or edited as UI copy.

No material product question remains for this authored scope. Ordinary implementation choices are resolved from current evidence. Missing authority or real customer/provider input blocks only its exact effect and is never guessed.

**Cross-product impacts.**

Inspected starting owners:

- `components/lease-renewal/RenewalWorkspace.tsx`
- `components/lease-renewal/RenewalFocusViewPane.tsx`
- `components/lease-renewal/RenewalLeaseInformation.tsx`
- `components/lease-renewal/RenewalMessagePreparation.tsx`
- `components/lease-renewal/RenewalDeskTable.tsx`
- `lib/lease-renewal/section-help.ts`

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

- **ARCH-S176-1** — Inventory every renewal section in the actual Focus and Full view, desk and lease-information paths. Map always-visible instruction blocks to deletion, a descriptive control/title, or genuinely useful optional help. Use the existing section-help boundary rather than a second process guide. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S176-2** — Keep input labels, required/optional meaning, formats, examples and action names close to their controls, independent of placeholder presence. Default flow contains task inputs, current facts/status and next permitted actions; a helper is never required for ordinary comprehension. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S176-3** — Preserve underlying step/routing identities, saved working fields, independent autosave, source differences, status log, unsent draft content, exact target/timing confirmations and receipt recovery. Adapt the optional Full view/guide to current behavior so it does not teach retired gates. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S176-1** — A complete default-workflow scan finds no training-style subtext; protected live facts/errors/consequences remain visible. Deterministic falsification: Open all sections, information and optional Full view with healthy and empty fixtures; an overlooked persistent instruction paragraph fails.
- **BEH-S176-2** — The person knows which control changes an app value, creates an unsent draft or updates a source before activating it. Deterministic falsification: A button labelled Save ambiguously dispatches a provider update, or a prepare button claims sent/completed; wording parity fails.
- **BEH-S176-3** — Entered values do not erase input meaning; blank optional resource boxes show their pending meaning. Deterministic falsification: Fill every field and use touch/keyboard; placeholder-only labels or an invented resource link fails.
- **BEH-S176-4** — The normal path is uncluttered and an opened guide describes the deployed steps without retired approval/cycle eligibility barriers. Deterministic falsification: Open the guide and navigate its existing steps; obsolete Save/cycle-start/owner-acceptance prerequisites or an unreachable real task fails.
- **BEH-S176-5** — A current problem remains understandable without a long introduction, and its real recovery stays reachable. Deterministic falsification: Force source conflict, partial roster, missing date/link, notice withdrawal or ambiguous receipt; the visible cause cannot disappear into help.
- **BEH-S176-6** — All existing fields/actions/linked targets are still reachable in Focus, Full and direct links, including an unstarted lease. Deterministic falsification: Run current S145 and S152–S167 journeys; hidden fields, lost hashes, restored business approvals or corrupted saved work fails.
- **BEH-S176-7** — Shortened status labels remain honest about who recorded completion and what a provider actually verified. Deterministic falsification: A local status selection or matching provider record renders as receipt-proved execution/signature; the evidence-semantic check fails.
- **BEH-S176-8** — Concise renewal controls work across sizes and remain labelled; existing message formatting and protected content are unchanged. Deterministic falsification: Compare displayed subject/body/resource bindings and tab through the mobile panel; truncation of required meaning or an inaccessible helper fails.

**Human litmus outcome.**

### Work a lease by reading its controls

**If this was built correctly:** A staff member opens a lease, sees what to enter or do next, and completes the existing task without reading a process essay. They can open a guide if needed and still see why a source update or draft is unavailable.

- Model verdict: NOT RUN — specification-only; implementation runner records PASS or FAIL against every trace row with actual evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                                                                                                                    | Architecture outcome | Behavior outcome | Human litmus                         | Deterministic evidence / falsification                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | ---------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S176-1 — Remove default instructional paragraphs and redundant informational boxes from every current renewal surface, including Full view and lease information.            | ARCH-S176-1          | BEH-S176-1       | Work a lease by reading its controls | AC-S176-1; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S176-2 — Name each section and action for its actual purpose and distinguish save-in-app, prepare, review, copy and confirmed source update.                                 | ARCH-S176-2          | BEH-S176-2       | Work a lease by reading its controls | AC-S176-2; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S176-3 — Keep persistently labelled inputs and concise helpful examples or formats beside/inside fields without requiring placeholder or hover text.                         | ARCH-S176-2          | BEH-S176-3       | Work a lease by reading its controls | AC-S176-3; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S176-4 — Retain optional useful process guidance through an explicit control and align it with Focus-default, autosave and ordinary-staff operations.                        | ARCH-S176-1          | BEH-S176-4       | Work a lease by reading its controls | AC-S176-4; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S176-5 — Keep concise current discrepancies, source freshness, validation, pending/failure, non-renewal notice safety and exact action consequences at their decision point. | ARCH-S176-3          | BEH-S176-5       | Work a lease by reading its controls | AC-S176-5; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S176-6 — Preserve all current staff capabilities and underlying route/step/history identities while changing their presentation.                                             | ARCH-S176-3          | BEH-S176-6       | Work a lease by reading its controls | AC-S176-6; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S176-7 — Show staff-recorded status, source-update evidence and provider-verified outcomes with their actual separate meanings.                                              | ARCH-S176-3          | BEH-S176-7       | Work a lease by reading its controls | AC-S176-7; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S176-8 — Apply both-theme, mobile, zoom and keyboard readability to the shortened controls and optional help, with supplied messages/resources preserved.                    | ARCH-S176-2          | BEH-S176-8       | Work a lease by reading its controls | AC-S176-8; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |

Every row is a completion obligation, including boundary and recovery behavior. Native implementation evidence names each actual test/readback, environment, observed result and any precise unavailable seam. Unit/adapted evidence, compiled-browser evidence, guarded production reads and human observations retain their separate meanings.

**Preservation set.**

Existing authenticated routes and direct guards; current staff/Admin/Vendor and private-account boundaries; complete/partial source and freshness meanings; all-lease visibility and current working values; source differences and notice invalidation; receipt/ambiguity recovery; editable as-displayed unsent drafts; no-send and closed-key refusals; compatible query/return links; keyboard, touch, themes, reduced motion and existing mobile workflows. Any preservation failure fails the slice independently of a visual or timing improvement.

Retain the existing relevant owning tests and add missing preservation checks where the inspected baseline lacks them. Do not weaken a preserved assertion to make a visual, performance or wording change pass. The full native gate remains required for implementation delivery.

**Adversarial acceptance checks.**

- **AC-S176-1** — Verify R-S176-1 through ARCH-S176-1, BEH-S176-1 and the "Work a lease by reading its controls" litmus: Open all sections, information and optional Full view with healthy and empty fixtures; an overlooked persistent instruction paragraph fails.
- **AC-S176-2** — Verify R-S176-2 through ARCH-S176-2, BEH-S176-2 and the "Work a lease by reading its controls" litmus: A button labelled Save ambiguously dispatches a provider update, or a prepare button claims sent/completed; wording parity fails.
- **AC-S176-3** — Verify R-S176-3 through ARCH-S176-2, BEH-S176-3 and the "Work a lease by reading its controls" litmus: Fill every field and use touch/keyboard; placeholder-only labels or an invented resource link fails.
- **AC-S176-4** — Verify R-S176-4 through ARCH-S176-1, BEH-S176-4 and the "Work a lease by reading its controls" litmus: Open the guide and navigate its existing steps; obsolete Save/cycle-start/owner-acceptance prerequisites or an unreachable real task fails.
- **AC-S176-5** — Verify R-S176-5 through ARCH-S176-3, BEH-S176-5 and the "Work a lease by reading its controls" litmus: Force source conflict, partial roster, missing date/link, notice withdrawal or ambiguous receipt; the visible cause cannot disappear into help.
- **AC-S176-6** — Verify R-S176-6 through ARCH-S176-3, BEH-S176-6 and the "Work a lease by reading its controls" litmus: Run current S145 and S152–S167 journeys; hidden fields, lost hashes, restored business approvals or corrupted saved work fails.
- **AC-S176-7** — Verify R-S176-7 through ARCH-S176-3, BEH-S176-7 and the "Work a lease by reading its controls" litmus: A local status selection or matching provider record renders as receipt-proved execution/signature; the evidence-semantic check fails.
- **AC-S176-8** — Verify R-S176-8 through ARCH-S176-2, BEH-S176-8 and the "Work a lease by reading its controls" litmus: Compare displayed subject/body/resource bindings and tab through the mobile panel; truncation of required meaning or an inaccessible helper fails.

**Forbidden actions / hard gates.**

No client send, autonomous provider action, proof rerun, fabricated production record, new Action Registry key/activation, permission/claim/identity change, credential-store substitution, cost/guardrail change, or unrelated feature execution. Existing source updates and unsent Gmail drafting keep their exact human preview/confirmation, claim, receipt, readback, and correction contracts. A cancel, timeout, navigation, or client abort never proves an external operation stopped. Preserve Production/Live, managed identity, eleven Spaces, Demo=false and the reviewed Sheet switch. Protected paths retain AGENTS.md's owner-direction requirement; design this program through existing interfaces without assuming a protected-path grant.

**Dependencies / sequencing.**

Consumes the S87 copy rules, S174 panel behavior and S175 message organization. S152–S167 are deployed preservation inputs. Verification integrates with S170/S177/S181; missing legal/resource/provider inputs block only their existing effect.

**Standalone delivery contract.**

- **Deliverable now:** The complete renewal copy/label migration, optional guide parity, current-state and exact-confirmation wording, and deterministic Focus/Full/desk checks with existing staff workflows.
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
