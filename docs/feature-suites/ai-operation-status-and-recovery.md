<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: application-usability-reliability-2026-10 -->

# S171 — AI operation status and recovery

> Status: READY — finalized owner-accepted F04 of batch 005 on 2026-10-04; implementation and delivery NOT RUN. Spec authoring alone does not start execution.

**Goal.**

Make question answering and existing draft refinement visibly active, reliably terminal and recoverable while preserving the last useful result.

**Current state / intended end state.**

Current: Dashboard turns already show Working on your answer, stable operation IDs and separate history save states. Model interpretation falls back after a bounded wait, while knowledge and operational reads follow separate paths. Several fetch consumers lack a unified timeout/supersession lifecycle. Existing draft refinement remains a separately invoked operation on editable content.

Required end state: Dashboard Ask, existing knowledge Ask, saved-question rerun and the four current linked draft/refinement surfaces use coherent truthful phases, bounded waiting and safe retry/supersession.

The 2026-10-04 guarded Admin inspection read the canonical application's version as e106a88a50d541b4a012111019b09c2183f6ce20 / pmi-kc-app-rmusp7ehl-7ea8703905ca and inspected initial Dashboard, desk, lease workspace, Communications, Connections, and Admin screens. Its completed pass recorded zero mutation attempts. This establishes those observed presentations only; it does not establish failure handling, persistence, AI inference, all roles, accessibility certification, or a new release. Earlier failed access attempts remain failed. Customer values, raw reports, captures, profiles, and credentials remain outside Git.

**Actors and entry conditions.**

Staff asking operational/knowledge questions or deliberately refining an existing workflow message; no autonomous message generation or live customer proof is included.

**What it is / how it functions.**

This is one finalized change in batch 005, handoff application-usability-reliability-2026-10, registered in the canonical suite index. The owner accepted the recommendations on 2026-10-04 and requested specifications plus a launch prompt; authoring does not start execution. The future launch instruction selects only this program. Read the program contract in README.md and AGENTS.md; completed, superseded, and unrelated suites remain baselines rather than queued work.

Use the current owners below as verified starting points, then discover every actual consumer within this scope. They are not a frozen selector allowlist. The architecture obligations define the bounded change; the behavior outcomes define the observable success, failure and recovery. Before implementation, bind each trace row to actual tests/readbacks in the native evidence. A missing behavior must fail on the starting source for its intended reason; already-correct behavior gets preservation evidence.

**In scope / out of scope.**

Existing AI request/answer/refinement lifecycle and its read/history save boundaries. No model change, new action executor, token-streaming protocol requirement or automatic provider draft/send.

**Open questions & assumptions.**

The original call's exact prompt location and wording were not supplied; S178 defines the accepted result behavior independently. Actual inference costs and service timing must be measured rather than assumed.

No material product question remains for this authored scope. Ordinary implementation choices are resolved from current evidence. Missing authority or real customer/provider input blocks only its exact effect and is never guessed.

**Cross-product impacts.**

Inspected starting owners:

- `components/ask/AskForm.tsx`
- `components/ask/DashboardTurnView.tsx`
- `app/api/assistant/query/route.ts`
- `lib/api/assistant-operation-dedupe.ts`
- `lib/assistant/interpret.ts`
- `components/gmail-hub/WorkflowCommunicationPanel.tsx`
- `components/lease-renewal/RenewalMessagePreparation.tsx`

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

- **ARCH-S171-1** — Existing question operation IDs and owner-scoped history remain the deduplication/recovery boundary; answer execution and answer persistence have separate outcomes. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S171-2** — Truthful stage events or local operation labels reflect actual interpretation, source read, answer preparation and optional save state, with bounded owning waits. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S171-3** — Late, interrupted or failed AI responses preserve current conversation/draft state and never overwrite newer edits or convert recommendations into effects. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S171-1** — Users can see which question or revision is running. Deterministic falsification: Run a slow question beside a failed history save and a slow refinement; states remain separately owned and content remains visible.
- **BEH-S171-2** — Stage labels correspond to actual work. Deterministic falsification: Spy on a saved-plan rerun and a model-backed question; an invented phase or unexpected model invocation fails.
- **BEH-S171-3** — Unavailable AI or one failed source does not silently kill a supported lookup. Deterministic falsification: Exercise model timeout, invalid plan, missing source and operational/knowledge mixed requests; retain supported structured results with truthful limits.
- **BEH-S171-4** — Recovery does not rerun the same expensive question unnecessarily. Deterministic falsification: Double-submit, lose a response and fail the history write; assert intended dedupe and zero extra inference for Retry saving.
- **BEH-S171-5** — A late answer cannot replace a newer question or another account's screen. Deterministic falsification: Complete an old turn after switching conversations/accounts and revoking access; assert admission isolation and no hidden data leak.
- **BEH-S171-6** — Revising a message keeps the person's latest text and human review. Deterministic falsification: Edit the message during a delayed refinement and fail its return; preserve edits, reject automatic replacement and assert zero provider draft/send calls.
- **BEH-S171-7** — AI waiting and recovery are usable without a mouse. Deterministic falsification: Exercise mobile, keyboard and reduced motion through slow, failed and answered states; controls and result focus remain reachable.

**Human litmus outcome.**

### See the answer being prepared

**If this was built correctly:** A person submits a question or asks to revise a message. They see that it is being worked on, retain their current information, and receive the answer or an actionable recovery. A saved answer and an unsaved answer remain distinguishable.

- Model verdict: NOT RUN — specification-only; implementation runner records PASS or FAIL against every trace row with actual evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                                                                                                                                                                                                                                     | Architecture outcome | Behavior outcome | Human litmus                  | Deterministic evidence / falsification                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S171-1 — Immediately echo/retain the submitted question or refinement instruction and show a clear pending state in its result region. Keep previous completed answers/current draft readable; distinguish processing from history-saving and provider draft creation.                        | ARCH-S171-1          | BEH-S171-1       | See the answer being prepared | AC-S171-1; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S171-2 — Show only genuinely known phases and indeterminate activity when no progress total exists. Existing saved-plan reruns perform zero new interpretation/model calls; do not label them as AI thinking when they only read current data.                                                | ARCH-S171-2          | BEH-S171-2       | See the answer being prepared | AC-S171-2; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S171-3 — Give each existing AI/read path a bounded completion/recovery contract and keep the validated deterministic fallback for model timeout, malformed output, throttling or failure. Partial/unavailable sources remain explicit and usable results survive.                             | ARCH-S171-2          | BEH-S171-3       | See the answer being prepared | AC-S171-3; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S171-4 — Retry a question under its stable existing operation identity and preserve owner-scoped conversation/history behavior. Repeated delivery joins/replays as supported; saving an answer retries its save without rerunning inference.                                                  | ARCH-S171-1          | BEH-S171-4       | See the answer being prepared | AC-S171-4; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S171-5 — Stop waiting and superseded questions have honest interrupted/unknown semantics. Late completions cannot become the current result after a different conversation, sign-in or access scope is selected; inaccessible restored results remain hidden.                                 | ARCH-S171-3          | BEH-S171-5       | See the answer being prepared | AC-S171-5; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S171-6 — Refinement requests bind the current user-edited draft/instruction. A late refinement never overwrites text edited after submission; show a recoverable alternate/review choice using existing contracts. Do not persist or create a Gmail draft merely because refinement finished. | ARCH-S171-3          | BEH-S171-6       | See the answer being prepared | AC-S171-6; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S171-7 — Keyboard/touch users can submit, inspect pending/results, stop local waiting and use recovery without a focus trap. Announcements remain concise and distinguish answer readiness, partial results and save failure.                                                                 | ARCH-S171-2          | BEH-S171-7       | See the answer being prepared | AC-S171-7; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |

Every row is a completion obligation, including boundary and recovery behavior. Native implementation evidence names each actual test/readback, environment, observed result and any precise unavailable seam. Unit/adapted evidence, compiled-browser evidence, guarded production reads and human observations retain their separate meanings.

**Preservation set.**

Existing authenticated routes and direct guards; current staff/Admin/Vendor and private-account boundaries; complete/partial source and freshness meanings; all-lease visibility and current working values; source differences and notice invalidation; receipt/ambiguity recovery; editable as-displayed unsent drafts; no-send and closed-key refusals; compatible query/return links; keyboard, touch, themes, reduced motion and existing mobile workflows. Any preservation failure fails the slice independently of a visual or timing improvement.

Retain the existing relevant owning tests and add missing preservation checks where the inspected baseline lacks them. Do not weaken a preserved assertion to make a visual, performance or wording change pass. The full native gate remains required for implementation delivery.

**Adversarial acceptance checks.**

- **AC-S171-1** — Verify R-S171-1 through ARCH-S171-1, BEH-S171-1 and the "See the answer being prepared" litmus: Run a slow question beside a failed history save and a slow refinement; states remain separately owned and content remains visible.
- **AC-S171-2** — Verify R-S171-2 through ARCH-S171-2, BEH-S171-2 and the "See the answer being prepared" litmus: Spy on a saved-plan rerun and a model-backed question; an invented phase or unexpected model invocation fails.
- **AC-S171-3** — Verify R-S171-3 through ARCH-S171-2, BEH-S171-3 and the "See the answer being prepared" litmus: Exercise model timeout, invalid plan, missing source and operational/knowledge mixed requests; retain supported structured results with truthful limits.
- **AC-S171-4** — Verify R-S171-4 through ARCH-S171-1, BEH-S171-4 and the "See the answer being prepared" litmus: Double-submit, lose a response and fail the history write; assert intended dedupe and zero extra inference for Retry saving.
- **AC-S171-5** — Verify R-S171-5 through ARCH-S171-3, BEH-S171-5 and the "See the answer being prepared" litmus: Complete an old turn after switching conversations/accounts and revoking access; assert admission isolation and no hidden data leak.
- **AC-S171-6** — Verify R-S171-6 through ARCH-S171-3, BEH-S171-6 and the "See the answer being prepared" litmus: Edit the message during a delayed refinement and fail its return; preserve edits, reject automatic replacement and assert zero provider draft/send calls.
- **AC-S171-7** — Verify R-S171-7 through ARCH-S171-2, BEH-S171-7 and the "See the answer being prepared" litmus: Exercise mobile, keyboard and reduced motion through slow, failed and answered states; controls and result focus remain reachable.

**Forbidden actions / hard gates.**

No client send, autonomous provider action, proof rerun, fabricated production record, new Action Registry key/activation, permission/claim/identity change, credential-store substitution, cost/guardrail change, or unrelated feature execution. Existing source updates and unsent Gmail drafting keep their exact human preview/confirmation, claim, receipt, readback, and correction contracts. A cancel, timeout, navigation, or client abort never proves an external operation stopped. Preserve Production/Live, managed identity, eleven Spaces, Demo=false and the reviewed Sheet switch. Protected paths retain AGENTS.md's owner-direction requirement; design this program through existing interfaces without assuming a protected-path grant.

**Dependencies / sequencing.**

S169/S170 govern common feedback; S178 governs matching/result links. Preserve deployed S138-S150 conversation, history, saved-question and refinement contracts.

**Standalone delivery contract.**

- **Deliverable now:** Coherent bounded AI lifecycles across all existing question/refinement consumers, including the model-unavailable path and private-history recovery.
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
