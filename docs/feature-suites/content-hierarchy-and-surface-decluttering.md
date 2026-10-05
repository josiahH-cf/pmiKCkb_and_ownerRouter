<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: application-usability-reliability-2026-10 -->

# S87 — Final six-cohort product-wide content reconciliation

> Status: READY — finalized owner-accepted F09 of batch 005 on 2026-10-04; implementation and delivery NOT RUN. Spec authoring alone does not start execution.

**Goal.**

A person understands each application surface from its title, useful controls, current facts and next action, without reading repeated instructional paragraphs.

**Current state / intended end state.**

Current: S87 was specification-only with an older fixed block manifest and dependencies on now superseded assistant/Dashboard proposals and the unrelated S36 pilot. Those are not execution prerequisites for this owner's new program. Current source and the guarded 2026-10-04 initial screens show repeated explanations on Dashboard, Admin, Connections, Communications and renewal surfaces. S135–S167 already supply the present assistant, Dashboard, workflow and mobile behavior; their completed work is the preservation baseline. This revision replaces the old S87 proposed edit manifest in place; it does not claim the old audit or this implementation passed.

Required end state: Six cohorts receive evidence-led content review and concrete changes: public/authentication and Vendor; Dashboard and My Work; Spaces, published-page chrome, processes and runs; Maintenance, Communications and Notifications; Connections, Admin and Approval Queue; and renewal surfaces through S176. Leading controls describe the task. Repeated/internal prose disappears, useful optional detail stays accessible on demand, and current facts, input labels, action consequences and recovery stay clear.

The 2026-10-04 guarded Admin inspection read the canonical application's version as e106a88a50d541b4a012111019b09c2183f6ce20 / pmi-kc-app-rmusp7ehl-7ea8703905ca and inspected initial Dashboard, desk, lease workspace, Communications, Connections, and Admin screens. Its completed pass recorded zero mutation attempts. This establishes those observed presentations only; it does not establish failure handling, persistence, AI inference, all roles, accessibility certification, or a new release. Earlier failed access attempts remain failed. Customer values, raw reports, captures, profiles, and credentials remain outside Git.

**Actors and entry conditions.**

Existing anonymous sign-in/setup visitors, managed staff, Admins and assigned Vendors enter their current guarded surfaces. Review states appropriate to each actor; role visibility never substitutes for server authorization. Never operate a live Vendor challenge or customer/provider action to obtain a screenshot.

**What it is / how it functions.**

This is one finalized change in batch 005, handoff application-usability-reliability-2026-10, registered in the canonical suite index. The owner accepted the recommendations on 2026-10-04 and requested specifications plus a launch prompt; authoring does not start execution. The future launch instruction selects only this program. Read the program contract in README.md and AGENTS.md; completed, superseded, and unrelated suites remain baselines rather than queued work.

Use the current owners below as verified starting points, then discover every actual consumer within this scope. They are not a frozen selector allowlist. The architecture obligations define the bounded change; the behavior outcomes define the observable success, failure and recovery. Before implementation, bind each trace row to actual tests/readbacks in the native evidence. A missing behavior must fail on the starting source for its intended reason; already-correct behavior gets preservation evidence.

**In scope / out of scope.**

Default application chrome, section headings, labels, repeated explanatory copy, and task hierarchy across the six cohorts are in scope. S176 owns the renewal-specific edit inventory; S175 owns message workspace organization; S179 owns retirement of the obsolete card. Published knowledge/legal/process source content, supplied message template meaning, existing source/customer values, provider powers, new navigation taxonomy and new workflows are outside this copy pass.

**Open questions & assumptions.**

No usage-frequency or human-comprehension measurements were supplied. Use observed task purpose and current states; never justify deletion by presumed rarity. The audit's roughly five-to-seven top-level navigation items is a review heuristic, not a mandate to rebuild navigation. No factual input or S36/S88–S95 implementation is needed to start this scoped reconciliation.

No material product question remains for this authored scope. Ordinary implementation choices are resolved from current evidence. Missing authority or real customer/provider input blocks only its exact effect and is never guessed.

**Cross-product impacts.**

Inspected starting owners:

- `components/ask/AskForm.tsx`
- `components/console/ConsoleView.tsx`
- `components/connections/ConnectorCard.tsx`
- `components/admin/SupportReportsPanel.tsx`
- `components/workflows/ProcessDefinitionDetailClient.tsx`
- `components/ui/InfoTip.tsx`
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

- **ARCH-S87-1** — Keep one current, source-backed disposition map in the native implementation evidence for the six cohorts. For each always-visible explanatory block name its actual owner, observed state, purpose, action (preserve, slim/remove, hide, merge, rename, reorganize, or add) and verification. Old CB/SF selectors cannot confer edit authority over current source. Required facts/source content are explicitly protected. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S87-2** — Express each bounded task region with a descriptive heading, persistently named inputs and reachable primary action; use existing Disclosure/InfoTip and interaction/theme primitives for useful secondary detail. Placeholder examples supplement a visible label. Do not create a second help system, accessibility pattern or automatic navigation redesign. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S87-3** — Keep present workflow, role, route, history, error and external-effect boundaries intact while changing presentation. Shared copy changes have explicit state parity checks and a current owner; renewal-specific content consumes S176 and preserves optional Full view/process guidance. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S87-1** — Every applicable surface has a current disposition and outcome; an uninspected surface is marked pending and prevents coverage completion. Deterministic falsification: Omit an Admin subroute or a Vendor empty state from the manifest; the coverage check fails even when Dashboard is polished.
- **BEH-S87-2** — Default views lose identified redundant text while useful controls, current values and source content remain reachable. Deterministic falsification: A removed paragraph reappears in an always-open help box or an unexplained capability disappears; the content/capability parity check fails.
- **BEH-S87-3** — Users can identify a section and its inputs after values are entered, without reading an introduction. Deterministic falsification: Fill the field so its placeholder disappears; its purpose and accessible name remain unambiguous.
- **BEH-S87-4** — Useful help works with keyboard and touch and returns focus; deleted repetition is not recreated as help. Deterministic falsification: Try hover-free touch, Escape, keyboard and screen-reader names; hidden required meaning or inaccessible help fails.
- **BEH-S87-5** — A blocked, partial, ambiguous or unsent state remains visible and names a safe next step. Deterministic falsification: Force missing source, permission refusal, ambiguous receipt or an irreversible read warning; copy reduction must not hide the cause or imply completion.
- **BEH-S87-6** — Parallel regions remain usable, and a read-only/blocked region does not emphasize an impossible action. Deterministic falsification: Render healthy, completed, unavailable and confirmation states; competing primary controls or an unreachable actual action fails.
- **BEH-S87-7** — The question, pending/result and actionable records lead; saved questions, private history and work destination remain accessible. Deterministic falsification: Remove an old-looking panel without checking its current destination; saved-question, history or work navigation parity fails.
- **BEH-S87-8** — Task chrome is concise while complete authorized knowledge, definitions, run evidence and Vendor session controls remain reachable. Deterministic falsification: Try an unauthorized run/ticket, empty directory and published long page; no hidden authorization, blank state or source-text deletion is allowed.
- **BEH-S87-9** — The person reaches the exact existing administrative action and sees its current cause/result without training paragraphs. Deterministic falsification: Change staff/Admin visibility or hide a failed check in secondary diagnostics; role/readiness parity fails.
- **BEH-S87-10** — The same underlying state has the same concise meaning across its owning surface and attention links. Deterministic falsification: Render one degraded communication or maintenance item on its hub and linked detail; conflicting success/readiness labels fail.
- **BEH-S87-11** — Reduced copy stays readable and every required label/control works at all declared sizes; no human verdict is fabricated. Deterministic falsification: An icon-only action, low-contrast grey example, clipped label or placeholder-only instruction fails even when total text decreases.

**Human litmus outcome.**

### Understand the task without an introduction

**If this was built correctly:** On each task page, the person finds the main control and understands what it does from the title and labels. They can ask for useful detail when they want it. They still see current problems, the actual scope and any consequence before acting.

- Model verdict: NOT RUN — specification-only; implementation runner records PASS or FAIL against every trace row with actual evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                                                                                                                                                                   | Architecture outcome | Behavior outcome | Human litmus                                | Deterministic evidence / falsification                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S87-1 — Inventory all six cohorts and all their current reachable routes/aliases before editing; classify populated, initial/empty, pending, error, permission and consequential states, with actual evidence and an owner. | ARCH-S87-1           | BEH-S87-1        | Understand the task without an introduction | AC-S87-1; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence.  |
| R-S87-2 — Delete duplicate, internal or label-repeating explanations rather than transferring every paragraph into a tooltip.                                                                                                 | ARCH-S87-1           | BEH-S87-2        | Understand the task without an introduction | AC-S87-2; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence.  |
| R-S87-3 — Use concise human headings, actions and persistent field labels that describe the supported task and its result.                                                                                                    | ARCH-S87-2           | BEH-S87-3        | Understand the task without an introduction | AC-S87-3; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence.  |
| R-S87-4 — Keep optional rationale and structured evidence behind reachable, labelled Disclosure or InfoTip controls when it has a real purpose.                                                                               | ARCH-S87-2           | BEH-S87-4        | Understand the task without an introduction | AC-S87-4; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence.  |
| R-S87-5 — Preserve concise current facts, freshness/scope, exact consequences, errors and recovery at the decision point.                                                                                                     | ARCH-S87-3           | BEH-S87-5        | Understand the task without an introduction | AC-S87-5; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence.  |
| R-S87-6 — Keep one obvious leading task and at most one visually primary action per bounded task region where an action exists.                                                                                               | ARCH-S87-2           | BEH-S87-6        | Understand the task without an introduction | AC-S87-6; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence.  |
| R-S87-7 — Review Dashboard/My Work using the deployed AI-first/history/work arrangement and preserve actual conversation and work capabilities.                                                                               | ARCH-S87-3           | BEH-S87-7        | Understand the task without an introduction | AC-S87-7; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence.  |
| R-S87-8 — Review Spaces/processes/runs and public/Vendor chrome without rewriting published source content or revealing restricted records.                                                                                   | ARCH-S87-3           | BEH-S87-8        | Understand the task without an introduction | AC-S87-8; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence.  |
| R-S87-9 — Review Connections/Admin/Approval Queue with current operational task labels and truthful connector/permission state.                                                                                               | ARCH-S87-3           | BEH-S87-9        | Understand the task without an introduction | AC-S87-9; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence.  |
| R-S87-10 — Review Maintenance/Communications/Notifications and delegate renewal copy to S176 so action, scope, unsent truth and status stay consistent.                                                                       | ARCH-S87-3           | BEH-S87-10       | Understand the task without an introduction | AC-S87-10; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S87-11 — Complete readability checks in both themes, narrow and wide layouts, 200% zoom, keyboard and reduced motion without using a prose-count target as proof.                                                           | ARCH-S87-2           | BEH-S87-11       | Understand the task without an introduction | AC-S87-11; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |

Every row is a completion obligation, including boundary and recovery behavior. Native implementation evidence names each actual test/readback, environment, observed result and any precise unavailable seam. Unit/adapted evidence, compiled-browser evidence, guarded production reads and human observations retain their separate meanings.

**Preservation set.**

Existing authenticated routes and direct guards; current staff/Admin/Vendor and private-account boundaries; complete/partial source and freshness meanings; all-lease visibility and current working values; source differences and notice invalidation; receipt/ambiguity recovery; editable as-displayed unsent drafts; no-send and closed-key refusals; compatible query/return links; keyboard, touch, themes, reduced motion and existing mobile workflows. Any preservation failure fails the slice independently of a visual or timing improvement.

Retain the existing relevant owning tests and add missing preservation checks where the inspected baseline lacks them. Do not weaken a preserved assertion to make a visual, performance or wording change pass. The full native gate remains required for implementation delivery.

**Adversarial acceptance checks.**

- **AC-S87-1** — Verify R-S87-1 through ARCH-S87-1, BEH-S87-1 and the "Understand the task without an introduction" litmus: Omit an Admin subroute or a Vendor empty state from the manifest; the coverage check fails even when Dashboard is polished.
- **AC-S87-2** — Verify R-S87-2 through ARCH-S87-1, BEH-S87-2 and the "Understand the task without an introduction" litmus: A removed paragraph reappears in an always-open help box or an unexplained capability disappears; the content/capability parity check fails.
- **AC-S87-3** — Verify R-S87-3 through ARCH-S87-2, BEH-S87-3 and the "Understand the task without an introduction" litmus: Fill the field so its placeholder disappears; its purpose and accessible name remain unambiguous.
- **AC-S87-4** — Verify R-S87-4 through ARCH-S87-2, BEH-S87-4 and the "Understand the task without an introduction" litmus: Try hover-free touch, Escape, keyboard and screen-reader names; hidden required meaning or inaccessible help fails.
- **AC-S87-5** — Verify R-S87-5 through ARCH-S87-3, BEH-S87-5 and the "Understand the task without an introduction" litmus: Force missing source, permission refusal, ambiguous receipt or an irreversible read warning; copy reduction must not hide the cause or imply completion.
- **AC-S87-6** — Verify R-S87-6 through ARCH-S87-2, BEH-S87-6 and the "Understand the task without an introduction" litmus: Render healthy, completed, unavailable and confirmation states; competing primary controls or an unreachable actual action fails.
- **AC-S87-7** — Verify R-S87-7 through ARCH-S87-3, BEH-S87-7 and the "Understand the task without an introduction" litmus: Remove an old-looking panel without checking its current destination; saved-question, history or work navigation parity fails.
- **AC-S87-8** — Verify R-S87-8 through ARCH-S87-3, BEH-S87-8 and the "Understand the task without an introduction" litmus: Try an unauthorized run/ticket, empty directory and published long page; no hidden authorization, blank state or source-text deletion is allowed.
- **AC-S87-9** — Verify R-S87-9 through ARCH-S87-3, BEH-S87-9 and the "Understand the task without an introduction" litmus: Change staff/Admin visibility or hide a failed check in secondary diagnostics; role/readiness parity fails.
- **AC-S87-10** — Verify R-S87-10 through ARCH-S87-3, BEH-S87-10 and the "Understand the task without an introduction" litmus: Render one degraded communication or maintenance item on its hub and linked detail; conflicting success/readiness labels fail.
- **AC-S87-11** — Verify R-S87-11 through ARCH-S87-2, BEH-S87-11 and the "Understand the task without an introduction" litmus: An icon-only action, low-contrast grey example, clipped label or placeholder-only instruction fails even when total text decreases.

**Forbidden actions / hard gates.**

No client send, autonomous provider action, proof rerun, fabricated production record, new Action Registry key/activation, permission/claim/identity change, credential-store substitution, cost/guardrail change, or unrelated feature execution. Existing source updates and unsent Gmail drafting keep their exact human preview/confirmation, claim, receipt, readback, and correction contracts. A cancel, timeout, navigation, or client abort never proves an external operation stopped. Preserve Production/Live, managed identity, eleven Spaces, Demo=false and the reviewed Sheet switch. Protected paths retain AGENTS.md's owner-direction requirement; design this program through existing interfaces without assuming a protected-path grant.

**Dependencies / sequencing.**

Runs after S172/S175 presentation decisions and alongside S176; S181 integrates every cohort. S83–S86 and S135–S167 are existing foundations. Old S36 and S88–S95 proposal dependencies are retired for this revision; S94 and unrelated unfinished proposals remain inert.

**Standalone delivery contract.**

- **Deliverable now:** The complete six-cohort current-content inventory, changed default hierarchy/copy, on-demand useful help, and state/role/accessibility parity checks. It can be verified without activating a provider or collecting missing legal/resource inputs.
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
