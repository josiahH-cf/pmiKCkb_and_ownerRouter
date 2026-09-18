<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-meeting-readiness-2026-09 -->

# S123 — Retain unfinished renewals when source dates advance

> **Approval reference:** F02 (original feature #2).
> **Status:** SPECIFICATION ONLY — scope approved; no implementation, deployment, provider activation, or meeting validation performed by this export.
> **Export date:** 2026-09-18. **Repository baseline:** `d61eecf309fef75f5fe0a80f8f203c1d24c6804a`.
> **Registration:** S123 is a proposed allocation following the inspected S120 sequence, not a reservation or a claim of repository registration. Check for collisions on import, including the separately written F05 spec; preserve F02 when renumbering.
> **Classification:** Workflow correction and controlled resume capability.

**Goal.**

Updating a RentVine lease date or recording tenant acceptance cannot make an unfinished renewal disappear from active work or falsely become complete.

**Core outcome alignment.**

C02 — Durable cycle progress; C01 — Discoverability independent of changing source dates. See suite outcome contract (from the 2026-09-18 export-pack index). This file is a standalone feature specification; the index coordinates shared ownership and does not combine implementation scope.

**Current state / intended end state.**

**Current evidence:** `tracked_incomplete` retention, S113 audited manual cycles, and S119 staff-status history already exist. S119 explicitly says its staff label is not provider evidence or completion. The meeting describes RentVine dates being advanced before all signing/completion work was done. No root cause or lost-record repair has been proven by this specification exercise.

**Required end state:** A current app-owned unfinished cycle remains findable and resumable under the same stable lease identity after source changes. Previously external-only work can be explicitly taken into the app without inventing its history or completion evidence.

Current statements are grounded in the source map below at the pinned revision; they are not a fresh production readback. All new data shapes, labels, and defaults introduced here are proposed requirements unless explicitly identified as existing code or an owner decision.

**Actors and entry conditions.**

Renewals Readers inspect current and historical cycle evidence. Editors record/resume ordinary work using the existing manual-work controls. Source changes retain current Approver/Admin authorization; this feature adds no write authority.

**What it is / how it functions.**

### R-F02-01 — Retain by unresolved cycle, not latest end date

Any durably recorded current cycle with unresolved applicable work MUST remain in Active / upcoming or the retained-work view even after the provider end/renewal date leaves the window. Retention MUST use the current cycle’s evidence and unresolved actions, not a guessed old date or a stored green staff label. Preserve active non-renewal handoff work as work, while F03 controls outreach eligibility.

### R-F02-02 — Separate acceptance, dates, signatures, and closure

Tenant acceptance, changed lease dates, generated documents, sent-for-signature reports, signatures, applicable follow-up, and final cycle closure MUST remain separate facts. None alone implies the others. The existing manual completion contract remains authoritative; show whether completion was staff-recorded or provider-verified.

### R-F02-03 — Resume external work deliberately

For a known lease with no app cycle that was already worked outside the app, provide the existing manual-start/record controls from F01 inspection or a minimal “Record existing renewal work” entry. The user explicitly records only the facts they can support and confirms the intended cycle/term where ambiguous. Do not backfill acceptance, earlier dates, contacts, signatures, or evidence from date movement alone.

### R-F02-04 — Show source changes without rewriting history

Display current provider dates separately from the cycle’s recorded terms/baseline when the latter exists. Flag a changed source date for review where it affects preparation, offers, or documents. Revalidate dependent prepared snapshots through existing staleness rules. Historical cycle facts and receipts MUST not be overwritten merely to agree with the new export.

### R-F02-05 — Cycle identity and reopening are explicit

Reuse a stable lease identity and existing cycle identity; never key retention by address, tenant name, or date. Starting a later cycle requires the normal explicit transition. Reopening uses the existing audited reopen behavior and preserves the previous closure. An old cycle’s complete/non-renewal/status fact MUST not become the new cycle’s fact.

### R-F02-06 — Concurrent and interrupted work cannot vanish

Persist app-owned work with the existing revision/attempt protections. A conflict requires readback and explicit reconsideration; do not silently overwrite another operator. Lost responses resolve against the saving event/receipt before retry. A provider read outage or missing source association leaves work visible as source-unavailable, not complete; writes needing that source remain blocked.

**Data, state, and integration contract.**

Reuse the existing manual-cycle and activity records, stable lease ID, event IDs, revision checks, and historical snapshots. Add a cycle baseline only for newly recorded known terms when required; absence in old records remains unknown. No bulk backfill or fake historical timestamps. F14 reads the resulting cycle state; it does not write it.

**Failure, retry, cancellation, and concurrency.**

The owning workflow determines stale-term invalidation, cancellation, and closure. A cancellation before a manual save has no effect; a dispatched save uses readback. Do not automatically undo a legitimate external date change. Reassociation after a source identity conflict requires the existing reviewed association path.

**Agent and loop contract.**

The entry trigger is an explicit authorized user interaction or a later authorized implementation run, not file receipt, elapsed time, a model inference, or a meeting date. Inputs are the actual current source snapshot, app-owned state, reviewed configuration, and actor scope. Reads produce typed evidence/readiness; ordinary saves use existing audited state services; an external effect uses only its owning exact confirmed-action service. State changes are re-read before success is displayed. Cancelled undispatched actions have no effect; dispatched/ambiguous effects are reconciled, not blindly retried. No new background agent, worker, polling loop, or scheduler is created by this feature.

For F13, this contract applies to evidence gathering only: there is no application mutation loop. For F12, meeting preparation/observation does not execute the described customer actions. Future meetings, material receipt, and provider activation remain distinct from implementation termination.

**In scope / out of scope.**

In scope: retained unfinished work, explicit recording of external-only work, cycle/source-date separation, and regression correction. Out of scope: automatically reversing RentVine dates, guessing unsigned leases from calendar dates, or bypassing completion requirements.

**Open questions & assumptions.**

Bounded investigation: reproduce the reported scenario through the current owning loaders with controlled before/after dates; determine whether the gap is membership, absence of an app cycle, or inspection-only access. Stop when the failing path is identified and covered; report inconclusive live-source cases rather than inventing a root cause.

Unverified business/provider facts cannot be replaced by a plausible default. An explicitly labeled presentation/engineering default may be implemented within the approved scope; source semantics, policy applicability, legal wording, and provider permissions require their actual evidence. Missing input blocks only the dependent outcome identified below.

**Cross-product impacts.**

These are verified paths or explicitly marked candidate owners, not authorization to replace them:

- `lib/lease-renewal/live-desk.ts` and `lib/lease-renewal/desk-model.ts` — retained-work membership.

- `lib/lease-renewal/workspace-state.ts` and `lib/lease-renewal/renewal-progress.ts` — existing cycle/progress meaning.

- `lib/lease-renewal/work-status.ts` — current versus previous-cycle staff annotations.

- `lib/production-assurance/manual-renewal-projection.ts` — independent manual-progress parity.

Update only affected current contracts and facts after verification. Existing historical evidence remains historical. Original approval numbers remain stable; any later S-number remap must update all namespaced acceptance and outcome references consistently.

**Authority and evidence map.**

| Source          | Location                                                                                                                            | What it supports and what it does not                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T02             | Transcript 00:34:09–00:35:22; parsed lines 1286–1344                                                                                | Tenant yes, updated provider dates, and missing signatures/completion must remain distinct.                                                                       |
| U02             | User approval on 2026-09-18                                                                                                         | Feature 2 approved independently.                                                                                                                                 |
| R02             | `lib/lease-renewal/live-desk.ts`; `lib/lease-renewal/workspace-state.ts`; `lib/lease-renewal/work-status.ts`                        | Existing retained work, manual cycles, and explicit separation of status from evidence.                                                                           |
| Shared baseline | `AGENTS.md`; `docs/facts.md`; `docs/loop-state.md`; `docs/feature-suites/TEMPLATE.md` at `d61eecf309fef75f5fe0a80f8f203c1d24c6804a` | Existing architecture/safety and document shape. The user’s latest approval controls new product scope; F08 expressly supersedes earlier enabled-Sheet execution. |

Transcript references use the supplied **Cherry Bridge + PMI: App Training, September 17, 2026** file and its conversation-parsed line numbers/timestamps. See source and decision log (from the 2026-09-18 export-pack evidence log) for filenames, source limitations, and conflicts. No raw customer details or secret values are reproduced here.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S123-1** — The owning boundaries listed above implement the data and state contract without a duplicate authoritative workflow, provider reader, or competing status model. A focused structural/service test or, for F13, a source-traceable assessment artifact demonstrates the named ownership and exact inputs/outputs.
- **ARCH-S123-2** — Actor scope, provenance/version binding, no-effect reads, explicit unavailable states, and existing effect/receipt boundaries remain enforced. Tests inject denied, missing, stale, conflicting, or interrupted evidence and assert the exact refusal/recovery described by each requirement.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S123-1** — R-F02-01: Retain by unresolved cycle, not latest end date. The observable result must satisfy AC-S123-1; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S123-2** — R-F02-02: Separate acceptance, dates, signatures, and closure. The observable result must satisfy AC-S123-2; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S123-3** — R-F02-03: Resume external work deliberately. The observable result must satisfy AC-S123-3; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S123-4** — R-F02-04: Show source changes without rewriting history. The observable result must satisfy AC-S123-4; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S123-5** — R-F02-05: Cycle identity and reopening are explicit. The observable result must satisfy AC-S123-5; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S123-6** — R-F02-06: Concurrent and interrupted work cannot vanish. The observable result must satisfy AC-S123-6; a UI label alone is insufficient where a service/provider boundary is required.

**Human litmus outcome.**

### Retain unfinished renewals when source dates advance

**If this was built correctly:** After a tenant says yes and someone advances the dates in RentVine, staff still find the lease, see what remains unsigned or unfinished, and continue the same work without re-entering it.

- Model/engineering verdict: NOT RUN — this export specifies checks; it does not execute application tests or claim their results.
- Human verdict: NOT RUN — no human observer.
- Any later human observation is recorded independently of implementation and provider verification.

**Requirement-to-outcome traceability.**

| Requirement | Owning boundary                        | Architecture             | Behavior   | Acceptance / test scenario                                     |
| ----------- | -------------------------------------- | ------------------------ | ---------- | -------------------------------------------------------------- |
| R-F02-01    | live-desk / manual cycle projection    | ARCH-S123-1, ARCH-S123-2 | BEH-S123-1 | AC-S123-1: Retain by unresolved cycle, not latest end date     |
| R-F02-02    | workspace-state / renewal-progress     | ARCH-S123-1, ARCH-S123-2 | BEH-S123-2 | AC-S123-2: Separate acceptance, dates, signatures, and closure |
| R-F02-03    | existing manual controls / cycle store | ARCH-S123-1, ARCH-S123-2 | BEH-S123-3 | AC-S123-3: Resume external work deliberately                   |
| R-F02-04    | progress / preparation snapshot owners | ARCH-S123-1, ARCH-S123-2 | BEH-S123-4 | AC-S123-4: Show source changes without rewriting history       |
| R-F02-05    | workspace-state / work-status          | ARCH-S123-1, ARCH-S123-2 | BEH-S123-5 | AC-S123-5: Cycle identity and reopening are explicit           |
| R-F02-06    | manual state service / live-desk       | ARCH-S123-1, ARCH-S123-2 | BEH-S123-6 | AC-S123-6: Concurrent and interrupted work cannot vanish       |

Every acceptance scenario below is a required test or evidence deliverable, not a reported pass. For unaffected already-implemented behavior, retain the existing test as preservation evidence rather than duplicating it.

**Preservation set.**

S113 cycle isolation, manual completion/reopening and pending-source semantics; S119 annotation history; exact source-write receipt meaning; existing active/periodic-review membership.

Keep preservation results separate from new-feature results. Passing one does not compensate for failing the other.

**Adversarial acceptance checks.**

- **AC-S123-1** — R-F02-01 / BEH-S123-1, ARCH-S123-1 and ARCH-S123-2: Begin an unfinished cycle, advance the source date by a year, refresh the owning desk, and observe the same single lease and cycle with remaining work intact.

- **AC-S123-2** — R-F02-02 / BEH-S123-2, ARCH-S123-1 and ARCH-S123-2: An accepted offer with future provider dates and missing signatures stays unfinished; an audited manual closure becomes completed with its correct attribution, not a provider-verification claim.

- **AC-S123-3** — R-F02-03 / BEH-S123-3, ARCH-S123-1 and ARCH-S123-2: Open an external-only future-dated lease: no cycle is created on read. An authorized explicit start records one incomplete cycle; unrecorded milestones remain missing.

- **AC-S123-4** — R-F02-04 / BEH-S123-4, ARCH-S123-1 and ARCH-S123-2: A source-date update marks an affected old preview stale while preserving the immutable old terms and evidence. With no old snapshot, the UI says previous terms were not recorded.

- **AC-S123-5** — R-F02-05 / BEH-S123-5, ARCH-S123-1 and ARCH-S123-2: Duplicate names/units, an old completed cycle, a new pending cycle, and a reopen each produce one correctly attributed current state; no cross-cycle closure leaks.

- **AC-S123-6** — R-F02-06 / BEH-S123-6, ARCH-S123-1 and ARCH-S123-2: Two operators race to update a cycle and one gets a recoverable conflict. A lost save response is read back without duplicate milestones. A provider outage preserves retained work with an unavailable-source warning.

- **AC-S123-7** — ARCH-S123-2, preservation gate: run the named existing checks and assert no unintended customer sends, source mutations, paid lookups, actor widening, historical-evidence rewrite, or new background work. F08 must remain paused where installed; missing optional dependencies do not disable unrelated work.
- **AC-S123-8** — Evidence gate: the final result separately reports engineering tests, deployed readback if performed, missing external inputs, provider-specific verification, and human meeting observations. No unrun result is PASS, and no fake-provider success is described as a live customer outcome.

**Forbidden actions / hard gates.**

No autonomous customer sends, synthetic production customers, browser-driven provider workarounds, new identities, expanded roles, new action keys, or unreviewed protected-path changes. Opening, filtering, sorting, copying, inspecting, and refreshing must not authorize a write or advance a renewal. Preserve exact human confirmation, durable attempts, receipts, readback, and explicit reconciliation for separately authorized effects. A saved status, draft, uploaded file, matching provider record, or passed test is not proof of a sent message, valid signature, or completed customer workflow.

F08 is the only approved policy change in this pack: pause operating-Sheet mutations while preserving reads. It does not turn off supported RentVine operations or erase historical Sheet receipts. This export itself changes no runtime setting, repository file, account, calendar event, or provider record.

**Dependencies / sequencing.**

F01 exposes inspection of all available leases; F14 consumes the true current-cycle state; F03 owns move-out outreach disposition. The retention logic itself is independently testable over current schemas.

**Standalone delivery contract.**

- **Deliverable now, in a later implementation task:** A complete retain/resume/reopen slice with real app-service tests and fake provider reads, plus a regression case for each discovered exclusion path.
- **Consumes, but does not assume:** the exact source/configuration/cross-feature inputs above; missing or unverified values retain their explicit unavailable representation.
- **Externally blocked or deferred outcome:** Actual customer case confirmation can occur later. Missing historical external work is not reconstructable without staff evidence and is not fabricated.
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

Keep this specification independent of adjacent features until its own code/evidence and remaining dependencies are represented by current implementation contracts, tests, and facts. Preserve the original F02 approval mapping. Do not delete an external-input or meeting-validation gap merely because scaffolding passed. If existing behavior already meets part of the spec, link that evidence and merge only redundant explanatory prose—not acceptance coverage, history, or the user’s separate-feature boundary.
