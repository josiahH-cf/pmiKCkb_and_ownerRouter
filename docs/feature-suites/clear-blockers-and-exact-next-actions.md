<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-meeting-readiness-2026-09 -->

# S127 — Clear blockers and exact next-action guidance

> **Approval reference:** F07 (original feature #7).
> **Status:** SPECIFICATION ONLY — scope approved; no implementation, deployment, provider activation, or meeting validation performed by this export.
> **Export date:** 2026-09-18. **Repository baseline:** `d61eecf309fef75f5fe0a80f8f203c1d24c6804a`.
> **Registration:** S127 is a proposed allocation following the inspected S120 sequence, not a reservation or a claim of repository registration. Check for collisions on import, including the separately written F05 spec; preserve F07 when renumbering.
> **Classification:** Targeted usability correction over existing help and readiness controls.

**Goal.**

Every current blocking condition explains the missing business input or authority and leads to the exact usable control, without confusing advisory states, policy pauses, or staff status with a blocker.

**Core outcome alignment.**

C03 — Staff know what is blocked, what they can do, and where to go next. See suite outcome contract (from the 2026-09-18 export-pack index). This file is a standalone feature specification; the index coordinates shared ownership and does not combine implementation scope.

**Current state / intended end state.**

**Current evidence:** S113/S115/S120 already provide section help, missing-input routing, and a next-action surface. The transcript still reports difficulty understanding how to progress. This is a correction of the shared guidance and navigation, not a new six-phase rail or a second readiness engine.

**Required end state:** The desk and workspace show consistent, plain-language readiness with one primary next action, other relevant issues available on demand, and honest action-specific boundaries. F14 owns lifecycle colors; this feature owns explanations and control targets.

Current statements are grounded in the source map below at the pinned revision; they are not a fresh production readback. All new data shapes, labels, and defaults introduced here are proposed requirements unless explicitly identified as existing code or an owner decision.

**Actors and entry conditions.**

Readers inspect explanations and permitted sources. Editors act on ordinary app-owned preparation. Approvers/Admins retain their current review/execution authority. A user lacking authority sees an existing actionable handoff, not a self-grant button.

**What it is / how it functions.**

### R-F07-01 — Classify the kind and scope of each issue

Each issue MUST be a blocking prerequisite for a named action, a waiting-on-person state, an advisory, unavailable source evidence, or an intentional policy pause. State the affected action, business reason, and responsible role/source. Do not promote a missing optional resource to a global lease block. An F08 Sheet pause is not a failed write or broken connection.

### R-F07-02 — Choose a deterministic primary next action

Reuse the existing readiness/process ordering to select one current unresolved action, with other relevant issues available in a disclosure. F03 confirmed move-out redirects ordinary renewal outreach to the non-renewal review. Do not introduce a new arbitrary prioritization algorithm or hide a more consequential conflicting source because a cosmetic input is easier to complete.

### R-F07-03 — Navigate to the actual resolution point

Activating an issue MUST open its correct section, reveal the target control, and move keyboard focus to the relevant field or instruction. A required refresh must refresh the owning evidence and return to the same lease/control. An inert badge is plain text, not a false link. Missing external destinations show an honest explanation rather than a guessed URL or a loop back to the unchanged page.

### R-F07-04 — Expose permissions without granting them

When the user cannot perform the required action, show the existing authorized review/access/connection handoff and the role needed. Do not display an enabled provider confirm button simply because the UI is on the right section. Server-side authorization remains decisive for direct requests.

### R-F07-05 — Preserve input and explain state changes

After a successful app-owned save, update the shared readiness projection and next action without requiring duplicate data entry. After a stale/conflict/permission error, retain safe unsaved values and explain which part must be reviewed again. Do not claim all blockers are resolved until the authoritative readback says so. Canceling navigation does not mark a step done.

### R-F07-06 — Use accessible status meaning without color dependence

Keep a short visible label and actionable explanation; informational details may use existing accessible help disclosures. F14 supplies lifecycle dots and F08 supplies the pause semantics. A lifecycle-complete row can still expose a separate source recovery issue without its green dot claiming that every provider effect is verified. No status meaning may rely solely on hue, hover, animation, or an icon.

**Data, state, and integration contract.**

Project an action-specific issue model from existing owning services. Reuse current routes, section identifiers, access handoffs, and evidence versions; new proposed issue codes must be bounded and mapped once. Do not store another independent progress/status column.

**Failure, retry, cancellation, and concurrency.**

Slow reads show loading without claiming failure. Failed reads show unknown rather than empty issues. Out-of-order responses cannot clear newly introduced blockers. All mutations still use existing attempt/readback recovery; navigation itself is effect-free.

**Agent and loop contract.**

The entry trigger is an explicit authorized user interaction or a later authorized implementation run, not file receipt, elapsed time, a model inference, or a meeting date. Inputs are the actual current source snapshot, app-owned state, reviewed configuration, and actor scope. Reads produce typed evidence/readiness; ordinary saves use existing audited state services; an external effect uses only its owning exact confirmed-action service. State changes are re-read before success is displayed. Cancelled undispatched actions have no effect; dispatched/ambiguous effects are reconciled, not blindly retried. No new background agent, worker, polling loop, or scheduler is created by this feature.

For F13, this contract applies to evidence gathering only: there is no application mutation loop. For F12, meeting preparation/observation does not execute the described customer actions. Future meetings, material receipt, and provider activation remain distinct from implementation termination.

**In scope / out of scope.**

In scope: blocker language, exact targets, readiness parity, role handoffs, and targeted help. Out of scope: lifecycle classification/colors owned by F14, new workflow stages, broad rebranding, or a new AI assistant.

**Open questions & assumptions.**

The existing guide and readiness helpers may already satisfy particular cases; preserve those and implement only demonstrated gaps. No user wording or unverified priority order is manufactured. The next meeting can validate usability without blocking objective control-target and accessibility tests now.

Unverified business/provider facts cannot be replaced by a plausible default. An explicitly labeled presentation/engineering default may be implemented within the approved scope; source semantics, policy applicability, legal wording, and provider permissions require their actual evidence. Missing input blocks only the dependent outcome identified below.

**Cross-product impacts.**

These are verified paths or explicitly marked candidate owners, not authorization to replace them:

- `lib/lease-renewal/desk-guidance.ts` and `lib/lease-renewal/renewal-readiness.ts` — candidate owning guidance/readiness functions; inspect current symbols.

- `lib/lease-renewal/live-desk.ts` — shared evidence and desktop/workspace consistency.

- `components/lease-renewal/RenewalProgressControls.tsx` and existing workspace controls — exact focus targets and missing-input links.

- `docs/products/renewal-operator-guide.md` and `scripts/smoke-renewal-guide-controls-browser.mjs` — guide-to-control mapping; verify the current script filename before changing it.

Update only affected current contracts and facts after verification. Existing historical evidence remains historical. Original approval numbers remain stable; any later S-number remap must update all namespaced acceptance and outcome references consistently.

**Authority and evidence map.**

| Source          | Location                                                                                                                            | What it supports and what it does not                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T07             | Transcript 00:38:40 and 00:45:11–00:46:12; parsed lines 1414–1416 and 1634–1644                                                     | Requests for clearer blocked/completed/advisory meaning and clearer progression.                                                                                  |
| U07             | User approval on 2026-09-18                                                                                                         | Feature 7 retained; new color/status-category ownership is separated into F14.                                                                                    |
| R07             | S113 dashboard contract; `docs/loop-state.md`; `lib/lease-renewal/desk-guidance.ts`                                                 | Reuse existing section controls and shared readiness rather than duplicate workflow logic.                                                                        |
| Shared baseline | `AGENTS.md`; `docs/facts.md`; `docs/loop-state.md`; `docs/feature-suites/TEMPLATE.md` at `d61eecf309fef75f5fe0a80f8f203c1d24c6804a` | Existing architecture/safety and document shape. The user’s latest approval controls new product scope; F08 expressly supersedes earlier enabled-Sheet execution. |

Transcript references use the supplied **Cherry Bridge + PMI: App Training, September 17, 2026** file and its conversation-parsed line numbers/timestamps. See source and decision log (from the 2026-09-18 export-pack evidence log) for filenames, source limitations, and conflicts. No raw customer details or secret values are reproduced here.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S127-1** — The owning boundaries listed above implement the data and state contract without a duplicate authoritative workflow, provider reader, or competing status model. A focused structural/service test or, for F13, a source-traceable assessment artifact demonstrates the named ownership and exact inputs/outputs.
- **ARCH-S127-2** — Actor scope, provenance/version binding, no-effect reads, explicit unavailable states, and existing effect/receipt boundaries remain enforced. Tests inject denied, missing, stale, conflicting, or interrupted evidence and assert the exact refusal/recovery described by each requirement.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S127-1** — R-F07-01: Classify the kind and scope of each issue. The observable result must satisfy AC-S127-1; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S127-2** — R-F07-02: Choose a deterministic primary next action. The observable result must satisfy AC-S127-2; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S127-3** — R-F07-03: Navigate to the actual resolution point. The observable result must satisfy AC-S127-3; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S127-4** — R-F07-04: Expose permissions without granting them. The observable result must satisfy AC-S127-4; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S127-5** — R-F07-05: Preserve input and explain state changes. The observable result must satisfy AC-S127-5; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S127-6** — R-F07-06: Use accessible status meaning without color dependence. The observable result must satisfy AC-S127-6; a UI label alone is insufficient where a service/provider boundary is required.

**Human litmus outcome.**

### Clear blockers and exact next-action guidance

**If this was built correctly:** A staff member unfamiliar with a blocker understands what is missing, selects the action, lands on the correct field or handoff, and sees the next step only after the save is confirmed.

- Model/engineering verdict: NOT RUN — this export specifies checks; it does not execute application tests or claim their results.
- Human verdict: NOT RUN — no human observer.
- Any later human observation is recorded independently of implementation and provider verification.

**Requirement-to-outcome traceability.**

| Requirement | Owning boundary                           | Architecture             | Behavior   | Acceptance / test scenario                                        |
| ----------- | ----------------------------------------- | ------------------------ | ---------- | ----------------------------------------------------------------- |
| R-F07-01    | shared readiness / guidance               | ARCH-S127-1, ARCH-S127-2 | BEH-S127-1 | AC-S127-1: Classify the kind and scope of each issue              |
| R-F07-02    | desk-guidance / F03 disposition           | ARCH-S127-1, ARCH-S127-2 | BEH-S127-2 | AC-S127-2: Choose a deterministic primary next action             |
| R-F07-03    | workspace / section control registry      | ARCH-S127-1, ARCH-S127-2 | BEH-S127-3 | AC-S127-3: Navigate to the actual resolution point                |
| R-F07-04    | existing role guards / guidance consumers | ARCH-S127-1, ARCH-S127-2 | BEH-S127-4 | AC-S127-4: Expose permissions without granting them               |
| R-F07-05    | preparation services / workspace state    | ARCH-S127-1, ARCH-S127-2 | BEH-S127-5 | AC-S127-5: Preserve input and explain state changes               |
| R-F07-06    | shared interaction components / F14       | ARCH-S127-1, ARCH-S127-2 | BEH-S127-6 | AC-S127-6: Use accessible status meaning without color dependence |

Every acceptance scenario below is a required test or evidence deliverable, not a reported pass. For unaffected already-implemented behavior, retain the existing test as preservation evidence rather than duplicating it.

**Preservation set.**

Existing S115 help, S120 missing-input readiness, section and sidebar navigation, canonical return paths, role guards, and no automatic workflow advancement.

Keep preservation results separate from new-feature results. Passing one does not compensate for failing the other.

**Adversarial acceptance checks.**

- **AC-S127-1** — R-F07-01 / BEH-S127-1, ARCH-S127-1 and ARCH-S127-2: Fixtures for missing tenant email, missing legal form, waiting on owner, paused Sheet, and failed optional source yield distinct scoped messages; unrelated permitted work remains available.

- **AC-S127-2** — R-F07-02 / BEH-S127-2, ARCH-S127-1 and ARCH-S127-2: Given several issues, desk and workspace select the same action from the same evidence version; a confirmed move-out directs to handoff rather than owner solicitation.

- **AC-S127-3** — R-F07-03 / BEH-S127-3, ARCH-S127-1 and ARCH-S127-2: Keyboard activation from the desk reaches and focuses the missing recipient field; after refresh it returns there. Every displayed action has an existing target; unavailable URLs are not anchors.

- **AC-S127-4** — R-F07-04 / BEH-S127-4, ARCH-S127-1 and ARCH-S127-2: Reader, Editor, Approver, and Admin fixtures see appropriate inspect/prepare/review/execute outcomes; a forged direct request cannot bypass a role or closed key.

- **AC-S127-5** — R-F07-05 / BEH-S127-5, ARCH-S127-1 and ARCH-S127-2: A save resolves only its issue, focuses the next unresolved item, and leaves unrelated input intact. A changed source invalidates only dependent preparation and produces a specific review message.

- **AC-S127-6** — R-F07-06 / BEH-S127-6, ARCH-S127-1 and ARCH-S127-2: Keyboard, screen-reader, no-color, light/dark, narrow, and zoom checks expose the same reasons and actions; advisory and blocked states remain distinguishable in text.

- **AC-S127-7** — ARCH-S127-2, preservation gate: run the named existing checks and assert no unintended customer sends, source mutations, paid lookups, actor widening, historical-evidence rewrite, or new background work. F08 must remain paused where installed; missing optional dependencies do not disable unrelated work.
- **AC-S127-8** — Evidence gate: the final result separately reports engineering tests, deployed readback if performed, missing external inputs, provider-specific verification, and human meeting observations. No unrun result is PASS, and no fake-provider success is described as a live customer outcome.

**Forbidden actions / hard gates.**

No autonomous customer sends, synthetic production customers, browser-driven provider workarounds, new identities, expanded roles, new action keys, or unreviewed protected-path changes. Opening, filtering, sorting, copying, inspecting, and refreshing must not authorize a write or advance a renewal. Preserve exact human confirmation, durable attempts, receipts, readback, and explicit reconciliation for separately authorized effects. A saved status, draft, uploaded file, matching provider record, or passed test is not proof of a sent message, valid signature, or completed customer workflow.

F08 is the only approved policy change in this pack: pause operating-Sheet mutations while preserving reads. It does not turn off supported RentVine operations or erase historical Sheet receipts. This export itself changes no runtime setting, repository file, account, calendar event, or provider record.

**Dependencies / sequencing.**

Consumes F03 disposition, F08 pause state, and F09/F10/F11 readiness reasons. These inputs must each have an unknown/unavailable representation so independent work can ship without pretending downstream readiness.

**Standalone delivery contract.**

- **Deliverable now, in a later implementation task:** The corrected guidance/target mapping, consistent desk/workspace projections, accessible recovery states, and a verified current control-to-guide map.
- **Consumes, but does not assume:** the exact source/configuration/cross-feature inputs above; missing or unverified values retain their explicit unavailable representation.
- **Externally blocked or deferred outcome:** Human usability feedback at the next meeting is pending; it is distinct from automated navigation and permission checks.
- **Produces for downstream work:** the stable evidence/state contract and acceptance record defined here. No inferred approval or provider receipt is produced by a technical test.

**Verification and delivery contract.**

1. Re-read `AGENTS.md`, `docs/facts.md`, `docs/loop-state.md`, the current suite registry, and the implementation owners listed here. Compare the working revision with the pinned discovery baseline. Inspect only authorized read-only live evidence when needed. Do not treat repository deployment prose as a new live verification.
2. Record the preservation baseline and materialize each architecture, behavior, and adversarial check. A genuinely missing behavior must fail for its intended reason before its fix. An already-correct behavior is a preservation check; do not manufacture a failure or rebuild it merely to claim new work.
3. Run the focused checks, actual backend/service integration with controlled external adapters, and applicable served-browser checks. Keep source coverage, app-owned state, provider effects, and human observations separate in the result ledger. Use synthetic values only in local tests/emulators, never in Production.
4. Before an authorized code delivery, run `bash scripts/verify.sh`, `npm run test:firestore`, and `npm run test:e2e:core` as applicable under the current repository contract. Run the relevant compiled renewal desk/guide browser checks, inspect accessibility and source parity, and audit the diff for secrets, customer data, protected paths, provider gates, and unintended scope. Never weaken checks to fit a new label or bypass a missing input.
5. Implementation/release is a later task, not performed by this export. When authorized, use the existing serialized green-commit, exact-SHA CI, zero-traffic candidate, smoke/assurance, promotion, observation, readback, and captured-predecessor rollback path. Documentation-only changes do not trigger a production deploy unless they change a served asset. F08's pause must survive a rollback.
6. Report the implementation terminal as `ALL_GATES_GREEN`, `BLOCKED`, or `BUDGET_EXHAUSTED` (the last only with an explicit user-supplied run budget). External inputs and future meeting acceptance are tracked separately. A green scaffold does not make live validation complete. Record `Human verdict: NOT RUN — no human observer` until an actual authorized observation occurs. Do not set any verdict to PASS merely because this specification was written.

**Ordered prompt sequence.**

1. Inspect the current owning code and existing contracts; resolve only the bounded evidence questions identified here.
2. Freeze the feature-specific checks and preservation baseline. Establish the smallest complete change and the explicit no-effect boundary.
3. Build or reuse the owning implementation, including unavailable, stale, denied, interrupted, and recovery paths; do not introduce a parallel workflow engine.
4. Run every acceptance row and the preservation gates, then the repository's authorized verification/release loop. Record exact evidence and remaining external inputs.
5. Update current documentation only to what was demonstrated. Keep future meeting results, missing approved materials, and deferred provider activation pending rather than fabricating closure.

**Deletion/merge recommendation.**

Keep this specification independent of adjacent features until its own code/evidence and remaining dependencies are represented by current implementation contracts, tests, and facts. Preserve the original F07 approval mapping. Do not delete an external-input or meeting-validation gap merely because scaffolding passed. If existing behavior already meets part of the spec, link that evidence and merge only redundant explanatory prose—not acceptance coverage, history, or the user’s separate-feature boundary.
