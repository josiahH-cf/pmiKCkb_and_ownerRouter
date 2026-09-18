<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-meeting-readiness-2026-09 -->

# S128 — Pause operating-Sheet writes while preserving reads and app-owned work

> **Approval reference:** F08 (original feature #8).
> **Status:** SPECIFICATION ONLY — scope approved; no implementation, deployment, provider activation, or meeting validation performed by this export.
> **Export date:** 2026-09-18. **Repository baseline:** `d61eecf309fef75f5fe0a80f8f203c1d24c6804a`.
> **Registration:** S128 is a proposed allocation following the inspected S120 sequence, not a reservation or a claim of repository registration. Check for collisions on import, including the separately written F05 spec; preserve F08 when renumbering.
> **Classification:** Explicit policy reversal of currently enabled writeback execution.

**Goal.**

The application can continue reading the operating Sheet and recording its own work, while every operating-Sheet mutation remains disabled until a later explicit owner decision resumes it.

**Core outcome alignment.**

C04 — Preserve the operating Sheet as a trusted fallback during the pause. See suite outcome contract (from the 2026-09-18 export-pack index). This file is a standalone feature specification; the index coordinates shared ownership and does not combine implementation scope.

**Current state / intended end state.**

**Current evidence:** Current repository documentation records enabled Sheet writeback and S113 normal append/field update capability. `lib/lease-renewal/sheet-writeback-policy.ts` defines `LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED`, true only for the exact string true. The live dependency wiring uses `writeFlagEnabled: isSheetWritebackEnabled` and creates the writer lazily. The meeting’s stated read-only policy therefore requires an actual configuration/control-plane change, not a cosmetic explanation.

**Required end state:** The production operating-Sheet write flag is explicitly false under a verified later release. All normal append/update/correction and other reachable mutating paths refuse before provider dispatch. Reads, source comparisons, app-owned preparation/activity, and read-only receipt reconciliation continue. Existing implementation and historical proof remain intact for a separately reviewed resumption.

Current statements are grounded in the source map below at the pinned revision; they are not a fresh production readback. All new data shapes, labels, and defaults introduced here are proposed requirements unless explicitly identified as existing code or an owner decision.

**Actors and entry conditions.**

All actors, including Admin, are subject to the pause. Authorized release/configuration operators may apply this explicitly approved pause under the normal release contract. A later owner decision is required to resume; ordinary UI actions and existing open action keys cannot override it.

**What it is / how it functions.**

### R-F08-01 — Enforce one explicit operating-Sheet pause

Set `LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED=false` through the existing authorized runtime/release path. Use the same server-owned policy in all operating-Sheet mutation entry points; unset/malformed values remain off. Do not rely on hidden buttons, browser state, a display-only registry mirror, or an Admin session to enforce the pause. Preserve reader credentials and configured operating-Sheet identity.

### R-F08-02 — Cover bypasses and the dispatch boundary

Inventory all normal, legacy, proof, batch, retry, reconciliation, and correction callers capable of touching the operating Sheet. Check pause at the effect boundary; no alternate caller may dispatch a mutation. During rollout, quiesce new attempts and identify any already-dispatched operation. A request already delivered to Google cannot be declared cancelled: complete read-only reconciliation and retain its true receipt/outcome. Pause prevents subsequent dispatches, not historical reality.

### R-F08-03 — Keep reads and source truth intact

Continue Sheet reads, matching, source links, rent comparisons, freshness checks, and authorized history/receipt readback. Do not copy the production Sheet, redirect to a new spreadsheet, revoke shared credentials, or replace Sheet facts with app facts to simulate synchronization. A source mismatch can still constrain a dependent trusted-data action; the intentional pause itself must not create a global broken-connection state.

### R-F08-04 — Save app work without creating an execution backlog

Staff may save ordinary app-owned status, activities, preparation, and progress. When a matching Sheet update would previously be prepared automatically, show Saved in app; Sheet updates paused and do not silently enqueue new executable proposals. Preserve the underlying typed business value for ordinary app use. Do not make operators retype values just to dismiss a disabled Sheet action.

### R-F08-05 — Preserve existing proposals and honest partial outcomes

Existing proposals, receipts, and failed/ambiguous attempts remain readable with their original statuses plus a derived paused-policy overlay. Do not delete them, mark them applied, or retry them. Read-only reconciliation of an already attempted effect remains available when otherwise authorized. F14 completion attribution must not imply Sheet synchronization; F02 must not treat an intentional pause alone as unfinished mandatory work.

### R-F08-06 — Resume only by a fresh explicit owner decision

There is no automatic expiry, date-based resume, scheduler, or “several months” timer. A later owner-approved resumption must verify the actual writer contract, permissions, current targets, runtime state, and exact action authority. Old proposals require a fresh preview/source comparison and a new authorized confirmation; resumption MUST NOT flush saved or queued work automatically.

### R-F08-07 — Keep the pause through releases and rollback

Update release configuration, policy expectations, and current documentation as one governed slice. Every candidate/promotion/rollback and subsequent release must retain flag=false until a later explicit decision. Do not roll back to an old revision with writeback enabled merely to restore UI code. Do not edit protected action registry grants unnecessarily; the existing runtime switch is the narrow control.

**Data, state, and integration contract.**

No destructive migration. The pause is server-owned runtime policy; UI states are projections. Preserve all proposal generations, hashes, attempt IDs, receipts, before-values, and audit evidence. Any required additional policy reason is additive; historical success/failure is not rewritten.

**Failure, retry, cancellation, and concurrency.**

Read-only reconciliation is deliberately distinct from a corrective write. Recovery cannot construct a writer while paused. For a response lost after dispatch, report uncertainty and source readback without claiming causal success from a matching value alone. A rollback must preserve the paused configuration.

**Agent and loop contract.**

The entry trigger is an explicit authorized user interaction or a later authorized implementation run, not file receipt, elapsed time, a model inference, or a meeting date. Inputs are the actual current source snapshot, app-owned state, reviewed configuration, and actor scope. Reads produce typed evidence/readiness; ordinary saves use existing audited state services; an external effect uses only its owning exact confirmed-action service. State changes are re-read before success is displayed. Cancelled undispatched actions have no effect; dispatched/ambiguous effects are reconciled, not blindly retried. No new background agent, worker, polling loop, or scheduler is created by this feature.

For F13, this contract applies to evidence gathering only: there is no application mutation loop. For F12, meeting preparation/observation does not execute the described customer actions. Future meetings, material receipt, and provider activation remain distinct from implementation termination.

**In scope / out of scope.**

In scope: operating-Sheet mutations across reachable paths, runtime/UI truth, pending-work handling, resumption guard, and release preservation. Out of scope: disabling RentVine writes, Gmail drafts, Dotloop by implication, changing roles/keys, or deleting the implemented Sheet capability.

**Open questions & assumptions.**

The pause has no authorized end date. This approval explicitly supersedes prior mandatory enabled operating-Sheet execution; it does not supersede source verification, audit safety, or supported code. Do not reuse outdated .env example comments as live configuration evidence.

Unverified business/provider facts cannot be replaced by a plausible default. An explicitly labeled presentation/engineering default may be implemented within the approved scope; source semantics, policy applicability, legal wording, and provider permissions require their actual evidence. Missing input blocks only the dependent outcome identified below.

**Cross-product impacts.**

These are verified paths or explicitly marked candidate owners, not authorization to replace them:

- `lib/lease-renewal/sheet-writeback-policy.ts` — existing flag and shared policy accessor.

- `lib/lease-renewal/sheet-writeback/live.ts` and `lib/lease-renewal/sheet-writeback/execution-service.ts` — provider dispatch and read-only recovery boundaries.

- `lib/lease-renewal/sheet-writeback/prepare.ts`, `proposal-contract.ts`, `proposal-store.ts`, and `client-projection.ts` — paused proposal visibility and app-owned work separation.

- `docs/environment-handoff.md`, `AGENTS.md`, `docs/facts.md`, and active writeback contracts — update current truth only after actual verification.


Update only affected current contracts and facts after verification. Existing historical evidence remains historical. Original approval numbers remain stable; any later S-number remap must update all namespaced acceptance and outcome references consistently.

**Authority and evidence map.**

| Source | Location | What it supports and what it does not |
| --- | --- | --- |
| T08 | Transcript 00:18:14–00:20:42; parsed lines 830–876 | Decision to defer writes for several months while continuing reads and verification. |
| U08 | User approval on 2026-09-18 | Approval of Feature 8 supersedes the earlier enabled-write requirement for operating-Sheet execution only. |
| R08 | `lib/lease-renewal/sheet-writeback-policy.ts`; `lib/lease-renewal/sheet-writeback/live.ts`; `AGENTS.md` | Existing exact flag, lazy writer, and prior enabled-write direction. Capability remains; dispatch policy changes. |
| Shared baseline | `AGENTS.md`; `docs/facts.md`; `docs/loop-state.md`; `docs/feature-suites/TEMPLATE.md` at `d61eecf309fef75f5fe0a80f8f203c1d24c6804a` | Existing architecture/safety and document shape. The user’s latest approval controls new product scope; F08 expressly supersedes earlier enabled-Sheet execution. |

Transcript references use the supplied **Cherry Bridge + PMI: App Training, September 17, 2026** file and its conversation-parsed line numbers/timestamps. See source and decision log (from the 2026-09-18 export-pack evidence log) for filenames, source limitations, and conflicts. No raw customer details or secret values are reproduced here.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S128-1** — The owning boundaries listed above implement the data and state contract without a duplicate authoritative workflow, provider reader, or competing status model. A focused structural/service test or, for F13, a source-traceable assessment artifact demonstrates the named ownership and exact inputs/outputs.
- **ARCH-S128-2** — Actor scope, provenance/version binding, no-effect reads, explicit unavailable states, and existing effect/receipt boundaries remain enforced. Tests inject denied, missing, stale, conflicting, or interrupted evidence and assert the exact refusal/recovery described by each requirement.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S128-1** — R-F08-01: Enforce one explicit operating-Sheet pause. The observable result must satisfy AC-S128-1; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S128-2** — R-F08-02: Cover bypasses and the dispatch boundary. The observable result must satisfy AC-S128-2; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S128-3** — R-F08-03: Keep reads and source truth intact. The observable result must satisfy AC-S128-3; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S128-4** — R-F08-04: Save app work without creating an execution backlog. The observable result must satisfy AC-S128-4; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S128-5** — R-F08-05: Preserve existing proposals and honest partial outcomes. The observable result must satisfy AC-S128-5; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S128-6** — R-F08-06: Resume only by a fresh explicit owner decision. The observable result must satisfy AC-S128-6; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S128-7** — R-F08-07: Keep the pause through releases and rollback. The observable result must satisfy AC-S128-7; a UI label alone is insufficient where a service/provider boundary is required.


**Human litmus outcome.**

### Pause operating-Sheet writes while preserving reads and app-owned work

**If this was built correctly:** Staff keep using and comparing the Sheet and the app, but even an Admin cannot write to the operating Sheet from the app; saves clearly say they were recorded in the app only.

- Model/engineering verdict: NOT RUN — this export specifies checks; it does not execute application tests or claim their results.
- Human verdict: NOT RUN — no human observer.
- Any later human observation is recorded independently of implementation and provider verification.

**Requirement-to-outcome traceability.**

| Requirement | Owning boundary | Architecture | Behavior | Acceptance / test scenario |
| --- | --- | --- | --- | --- |
| R-F08-01 | policy / live wiring / executor | ARCH-S128-1, ARCH-S128-2 | BEH-S128-1 | AC-S128-1: Enforce one explicit operating-Sheet pause |
| R-F08-02 | all reachable Sheet effect callers | ARCH-S128-1, ARCH-S128-2 | BEH-S128-2 | AC-S128-2: Cover bypasses and the dispatch boundary |
| R-F08-03 | Sheet readers / live-desk | ARCH-S128-1, ARCH-S128-2 | BEH-S128-3 | AC-S128-3: Keep reads and source truth intact |
| R-F08-04 | prepare / app-state services / client-projection | ARCH-S128-1, ARCH-S128-2 | BEH-S128-4 | AC-S128-4: Save app work without creating an execution backlog |
| R-F08-05 | proposal store / recovery / desk projection | ARCH-S128-1, ARCH-S128-2 | BEH-S128-5 | AC-S128-5: Preserve existing proposals and honest partial outcomes |
| R-F08-06 | runtime policy / execution validation | ARCH-S128-1, ARCH-S128-2 | BEH-S128-6 | AC-S128-6: Resume only by a fresh explicit owner decision |
| R-F08-07 | release/config owners | ARCH-S128-1, ARCH-S128-2 | BEH-S128-7 | AC-S128-7: Keep the pause through releases and rollback |


Every acceptance scenario below is a required test or evidence deliverable, not a reported pass. For unaffected already-implemented behavior, retain the existing test as preservation evidence rather than duplicating it.

**Preservation set.**

Existing Sheet reads/matching/source links; all original receipts and proof history; app-owned progress; unrelated provider authority; no replay of completed proofs; configured identity and budget controls.

Keep preservation results separate from new-feature results. Passing one does not compensate for failing the other.

**Adversarial acceptance checks.**

- **AC-S128-1** — R-F08-01 / BEH-S128-1, ARCH-S128-1 and ARCH-S128-2: At runtime and through direct service/API calls as each role, append, field update, and correction refuse with a policy-paused reason and no writer construction/provider mutation. The exact runtime flag reads back false.

- **AC-S128-2** — R-F08-02 / BEH-S128-2, ARCH-S128-1 and ARCH-S128-2: A stale preview, duplicate execute, legacy caller, direct Admin request, and policy change immediately before dispatch all refuse a new write. An already-dispatched response-loss case performs only authorized reads and reports its actual uncertain/success outcome.

- **AC-S128-3** — R-F08-03 / BEH-S128-3, ARCH-S128-1 and ARCH-S128-2: The same source rows and values are read before and after the pause. A genuine rent mismatch remains visible while a plain app status save remains usable.

- **AC-S128-4** — R-F08-04 / BEH-S128-4, ARCH-S128-1 and ARCH-S128-2: Saving several staff activities during the pause updates only app-owned records, shows the pause label, and produces no auto-executable Sheet backlog or forced extra form.

- **AC-S128-5** — R-F08-05 / BEH-S128-5, ARCH-S128-1 and ARCH-S128-2: A historical applied receipt remains applied, an ambiguous attempt remains unresolved, and an unexecuted proposal remains unexecuted while paused. No generic “synced” claim appears.

- **AC-S128-6** — R-F08-06 / BEH-S128-6, ARCH-S128-1 and ARCH-S128-2: Advancing the clock by months, reloading, or enabling an unrelated connector does not resume writes. A stale pre-pause confirmation remains unusable after a simulated authorized resume.

- **AC-S128-7** — R-F08-07 / BEH-S128-7, ARCH-S128-1 and ARCH-S128-2: Candidate, promoted service, and exercised rollback configuration all report false, while unrelated provider keys, roles, reader setup, and data stay unchanged.

- **AC-S128-8** — ARCH-S128-2, preservation gate: run the named existing checks and assert no unintended customer sends, source mutations, paid lookups, actor widening, historical-evidence rewrite, or new background work. F08 must remain paused where installed; missing optional dependencies do not disable unrelated work.
- **AC-S128-9** — Evidence gate: the final result separately reports engineering tests, deployed readback if performed, missing external inputs, provider-specific verification, and human meeting observations. No unrun result is PASS, and no fake-provider success is described as a live customer outcome.

**Forbidden actions / hard gates.**

No autonomous customer sends, synthetic production customers, browser-driven provider workarounds, new identities, expanded roles, new action keys, or unreviewed protected-path changes. Opening, filtering, sorting, copying, inspecting, and refreshing must not authorize a write or advance a renewal. Preserve exact human confirmation, durable attempts, receipts, readback, and explicit reconciliation for separately authorized effects. A saved status, draft, uploaded file, matching provider record, or passed test is not proof of a sent message, valid signature, or completed customer workflow.

F08 is the only approved policy change in this pack: pause operating-Sheet mutations while preserving reads. It does not turn off supported RentVine operations or erase historical Sheet receipts. This export itself changes no runtime setting, repository file, account, calendar event, or provider record.

**Dependencies / sequencing.**

Apply this policy slice before meeting-readiness verification and before any tests that could otherwise create Sheet proposals. F07 displays the reason; F09/F10/F12 must work under it. The pause can be completed independently of all presentation work.

**Standalone delivery contract.**

- **Deliverable now, in a later implementation task:** When later authorized for implementation: the verified off runtime/configuration, all-path server enforcement, nonblocking app-owned saves, honest history/recovery, and pause-preserving rollback evidence.
- **Consumes, but does not assume:** the exact source/configuration/cross-feature inputs above; missing or unverified values retain their explicit unavailable representation.
- **Externally blocked or deferred outcome:** Actual runtime change is not performed by writing this spec. Resumption requires a new explicit owner decision, with no scheduled date invented.
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

Keep this specification independent of adjacent features until its own code/evidence and remaining dependencies are represented by current implementation contracts, tests, and facts. Preserve the original F08 approval mapping. Do not delete an external-input or meeting-validation gap merely because scaffolding passed. If existing behavior already meets part of the spec, link that evidence and merge only redundant explanatory prose—not acceptance coverage, history, or the user’s separate-feature boundary.
