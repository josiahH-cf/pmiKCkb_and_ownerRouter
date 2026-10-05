<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: application-usability-reliability-2026-10 -->

# S170 — Application-wide navigation and action loading feedback

> Status: READY — finalized owner-accepted F03 of batch 005 on 2026-10-04; implementation and delivery NOT RUN. Spec authoring alone does not start execution.

**Goal.**

Apply the shared lifecycle to actual navigation, filters, panels, autosaves and actions so the application visibly recognizes every interaction.

**Current state / intended end state.**

Current: PrimaryNav uses links; the desk has a route loading file and progressively enhanced GET forms with pending button text and screen-reader status. Many consumers use plain buttons or ad hoc busy flags. The owner accepts the existing page-loading solution as a useful baseline but not a complete application solution.

Required end state: Every discoverable in-scope route and asynchronous control uses truthful pending/error/terminal feedback. Screen changes retain identity and usable content instead of appearing dead or silently abandoning edits.

The 2026-10-04 guarded Admin inspection read the canonical application's version as e106a88a50d541b4a012111019b09c2183f6ce20 / pmi-kc-app-rmusp7ehl-7ea8703905ca and inspected initial Dashboard, desk, lease workspace, Communications, Connections, and Admin screens. Its completed pass recorded zero mutation attempts. This establishes those observed presentations only; it does not establish failure handling, persistence, AI inference, all roles, accessibility certification, or a new release. Earlier failed access attempts remain failed. Customer values, raw reports, captures, profiles, and credentials remain outside Git.

**Actors and entry conditions.**

All existing staff screens and their aliases, plus shared patterns on vendor/resident/sign-in surfaces without changing those actors' capabilities.

**What it is / how it functions.**

This is one finalized change in batch 005, handoff application-usability-reliability-2026-10, registered in the canonical suite index. The owner accepted the recommendations on 2026-10-04 and requested specifications plus a launch prompt; authoring does not start execution. The future launch instruction selects only this program. Read the program contract in README.md and AGENTS.md; completed, superseded, and unrelated suites remain baselines rather than queued work.

Use the current owners below as verified starting points, then discover every actual consumer within this scope. They are not a frozen selector allowlist. The architecture obligations define the bounded change; the behavior outcomes define the observable success, failure and recovery. Before implementation, bind each trace row to actual tests/readbacks in the native evidence. A missing behavior must fail on the starting source for its intended reason; already-correct behavior gets preservation evidence.

**In scope / out of scope.**

Navigation/link/form feedback and asynchronous consumer migration across the discovered application. Existing authentication, workflow, provider and role semantics remain unchanged.

**Open questions & assumptions.**

Inventory is derived from current routes/components, including aliases and non-happy states; six live initial screens do not establish comprehensive coverage.

No material product question remains for this authored scope. Ordinary implementation choices are resolved from current evidence. Missing authority or real customer/provider input blocks only its exact effect and is never guessed.

**Cross-product impacts.**

Inspected starting owners:

- `components/layout/PrimaryNav.tsx`
- `components/layout/AppShell.tsx`
- `components/lease-renewal/RenewalDeskGetForm.tsx`
- `components/lease-renewal/RenewalDeskViewMemory.tsx`
- `app/lease-renewal/live/desk/layout.tsx` and `components/lease-renewal/RenewalRouteLoading.tsx`, which on 2026-10-05 replaced the desk route loading file inspected at the start so the worklist stays on screen while a lease opens
- `components/gmail-hub/LiveGmailWorkspace.tsx`

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

- **ARCH-S170-1** — A current route/control inventory identifies each owning asynchronous lifecycle and the existing services it invokes; shared consumers are migrated together. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S170-2** — Navigation, query transitions and independent component work use the S169 semantics with compatible server rendering, progressive enhancement and authorized prefetch boundaries. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S170-3** — Autosave and action consumers preserve local edits and existing attempt/readback semantics while publishing their genuine state. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S170-1** — Each actual control has a correct acknowledgment and terminal path. Deterministic falsification: A cross-surface matrix must find a missing consumer or uncovered state as incomplete rather than infer coverage from the shared primitive.
- **BEH-S170-2** — Navigation and filtering visibly continue or recover. Deterministic falsification: Use slow route data, a failed route, same-path query changes and browser history; no silent dead link or indefinitely selected pending destination is permitted.
- **BEH-S170-3** — The displayed rows and filter state agree even under delay. Deterministic falsification: Rapidly switch filters and return results out of order; retain a clearly pending old view and then admit only the final requested view.
- **BEH-S170-4** — Opening or loading one region does not disrupt the rest of the task. Deterministic falsification: Open panels while a separate read is delayed and leave unsaved input elsewhere; both state and focus remain usable.
- **BEH-S170-5** — A person knows whether an edit, copy or download succeeded. Deterministic falsification: Fail saving, deny clipboard access and interrupt a download; retain the edit/content and render the appropriate recovery.
- **BEH-S170-6** — Initial loading does not masquerade as a configuration problem. Deterministic falsification: Delay the Gmail connection response, then separately return connected and denied outcomes; pending, available and actual refusal must be distinct.
- **BEH-S170-7** — Feedback behaves consistently without expanding external effects. Deterministic falsification: Exercise touch, keyboard and reduced-motion navigation with request spies; forbid stateful or paid prefetch and ensure required landmarks remain reachable.

**Human litmus outcome.**

### Move through the app without guessing

**If this was built correctly:** A person chooses a destination, changes a filter or opens an information panel. The click is recognized, the current task stays understandable, and the requested view or a useful recovery appears. Saving and refreshing are distinguishable.

- Model verdict: NOT RUN — specification-only; implementation runner records PASS or FAIL against every trace row with actual evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                                                                                                                                                                                                                                                                 | Architecture outcome | Behavior outcome | Human litmus                          | Deterministic evidence / falsification                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S170-1 — Inventory and migrate navigation, same-route filters/sort, panel data, refreshes, autosaves, copy/export, connection checks, approvals and supported action controls on all discovered surfaces. Mark synchronous, asynchronous and unavailable controls distinctly; no representative-only completion.          | ARCH-S170-1          | BEH-S170-1       | Move through the app without guessing | AC-S170-1; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S170-2 — On route selection acknowledge the selected destination immediately, preserve the current usable screen while work is pending, and expose appropriate route placeholders/status. Same-route query changes and back/forward also settle correctly; navigation failure provides retry/back without losing context. | ARCH-S170-2          | BEH-S170-2       | Move through the app without guessing | AC-S170-2; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S170-3 — Filtering and sorting identify the requested selection while retaining the last completed result until the new result is admitted. Never label old rows as the new filtered result; only the latest applicable navigation wins.                                                                                  | ARCH-S170-2          | BEH-S170-3       | Move through the app without guessing | AC-S170-3; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S170-4 — Component-level waits affect their own region. A data-free information toggle opens immediately; an actual read shows local loading. Existing screen content, focus and unsaved input survive unrelated reads and completed view changes.                                                                        | ARCH-S170-2          | BEH-S170-4       | Move through the app without guessing | AC-S170-4; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S170-5 — Autosave feedback distinguishes edited, saving, saved and failed/retry states without adding recording modes or mandatory save buttons. Clipboard/download actions show their actual success/failure and a usable supported fallback, not cosmetic success.                                                      | ARCH-S170-3          | BEH-S170-5       | Move through the app without guessing | AC-S170-5; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S170-6 — Checking, connected, disconnected, degraded, partial and permission-denied states remain distinct. In particular, a connection being checked must not already be described as waiting for missing access or a failed connection.                                                                                 | ARCH-S170-3          | BEH-S170-6       | Move through the app without guessing | AC-S170-6; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S170-7 — Preserve keyboard/touch focus, reduced motion, status announcements and mobile controls throughout transitions. Prefetch only genuine authorized reads; do not prefetch stateful GETs, paid comps, provider effects or write-preparation operations.                                                             | ARCH-S170-2          | BEH-S170-7       | Move through the app without guessing | AC-S170-7; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |

Every row is a completion obligation, including boundary and recovery behavior. Native implementation evidence names each actual test/readback, environment, observed result and any precise unavailable seam. Unit/adapted evidence, compiled-browser evidence, guarded production reads and human observations retain their separate meanings.

**Preservation set.**

Existing authenticated routes and direct guards; current staff/Admin/Vendor and private-account boundaries; complete/partial source and freshness meanings; all-lease visibility and current working values; source differences and notice invalidation; receipt/ambiguity recovery; editable as-displayed unsent drafts; no-send and closed-key refusals; compatible query/return links; keyboard, touch, themes, reduced motion and existing mobile workflows. Any preservation failure fails the slice independently of a visual or timing improvement.

Retain the existing relevant owning tests and add missing preservation checks where the inspected baseline lacks them. Do not weaken a preserved assertion to make a visual, performance or wording change pass. The full native gate remains required for implementation delivery.

**Adversarial acceptance checks.**

- **AC-S170-1** — Verify R-S170-1 through ARCH-S170-1, BEH-S170-1 and the "Move through the app without guessing" litmus: A cross-surface matrix must find a missing consumer or uncovered state as incomplete rather than infer coverage from the shared primitive.
- **AC-S170-2** — Verify R-S170-2 through ARCH-S170-2, BEH-S170-2 and the "Move through the app without guessing" litmus: Use slow route data, a failed route, same-path query changes and browser history; no silent dead link or indefinitely selected pending destination is permitted.
- **AC-S170-3** — Verify R-S170-3 through ARCH-S170-2, BEH-S170-3 and the "Move through the app without guessing" litmus: Rapidly switch filters and return results out of order; retain a clearly pending old view and then admit only the final requested view.
- **AC-S170-4** — Verify R-S170-4 through ARCH-S170-2, BEH-S170-4 and the "Move through the app without guessing" litmus: Open panels while a separate read is delayed and leave unsaved input elsewhere; both state and focus remain usable.
- **AC-S170-5** — Verify R-S170-5 through ARCH-S170-3, BEH-S170-5 and the "Move through the app without guessing" litmus: Fail saving, deny clipboard access and interrupt a download; retain the edit/content and render the appropriate recovery.
- **AC-S170-6** — Verify R-S170-6 through ARCH-S170-3, BEH-S170-6 and the "Move through the app without guessing" litmus: Delay the Gmail connection response, then separately return connected and denied outcomes; pending, available and actual refusal must be distinct.
- **AC-S170-7** — Verify R-S170-7 through ARCH-S170-2, BEH-S170-7 and the "Move through the app without guessing" litmus: Exercise touch, keyboard and reduced-motion navigation with request spies; forbid stateful or paid prefetch and ensure required landmarks remain reachable.

**Forbidden actions / hard gates.**

No client send, autonomous provider action, proof rerun, fabricated production record, new Action Registry key/activation, permission/claim/identity change, credential-store substitution, cost/guardrail change, or unrelated feature execution. Existing source updates and unsent Gmail drafting keep their exact human preview/confirmation, claim, receipt, readback, and correction contracts. A cancel, timeout, navigation, or client abort never proves an external operation stopped. Preserve Production/Live, managed identity, eleven Spaces, Demo=false and the reviewed Sheet switch. Protected paths retain AGENTS.md's owner-direction requirement; design this program through existing interfaces without assuming a protected-path grant.

**Dependencies / sequencing.**

S169 defines semantics; S168 measures the underlying work. S171 owns AI-specific lifecycle and S177 preference concurrency. Apply S170 throughout the later layout/copy changes.

**Standalone delivery contract.**

- **Deliverable now:** All current async route/control consumers migrated with a bounded discoverable inventory and slow/failure/browser checks; completion requires coverage beyond a single example.
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
