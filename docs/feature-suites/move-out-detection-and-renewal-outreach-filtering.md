<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-meeting-readiness-2026-09 -->

# S124 — Move-out detection and non-renewal outreach filtering

> **Approval reference:** F03 (original feature #3).
> **Status:** IMPLEMENTED and CI-GREEN at `fc03ec55` (2026-09-20); release deferred by the billing incident; no deployment, provider activation, or meeting validation has occurred. The exact read contract is recorded in `docs/facts.md` F-RENTVINE-MOVE-OUT-CONTRACT; serving evidence in F-S124.
> **Export date:** 2026-09-18. **Repository baseline:** `d61eecf309fef75f5fe0a80f8f203c1d24c6804a`.
> **Registration:** S124 is a proposed allocation following the inspected S120 sequence, not a reservation or a claim of repository registration. Check for collisions on import, including the separately written F05 spec; preserve F03 when renumbering.
> **Classification:** New source-backed disposition over the existing non-renewal handoff.

**Goal.**

An operator can see that move-out or non-renewal has been initiated, filter those leases, and avoid preparing ordinary renewal outreach against a confirmed active notice.

**Core outcome alignment.**

C03 — Actionable, evidence-backed operational status; C02 — Non-renewal remains a workflow, not deletion. See suite outcome contract (from the 2026-09-18 export-pack index). This file is a standalone feature specification; the index coordinates shared ownership and does not combine implementation scope.

**Current state / intended end state.**

**Current evidence:** The transcript reports a RentVine move-out state and notice-given date. The repository contains manual `non_renewal_handoff` status and a move-out process template, but this review did not verify an exact notice-given API field. `moveOutDate` also appears among legacy lease-end aliases: that presence alone is not proof that a move-out notice exists.

**Required end state:** One source-attributed move-out disposition distinguishes confirmed initiation, explicit absence, withdrawn/cancelled evidence, and unknown/stale/conflicting information. F14 displays the yellow non-renewal indicator and F01/F14 provide consistent filtering; this feature owns evidence and outreach routing.

Current statements are grounded in the source map below at the pinned revision; they are not a fresh production readback. All new data shapes, labels, and defaults introduced here are proposed requirements unless explicitly identified as existing code or an owner decision.

**Actors and entry conditions.**

Readers inspect authorized disposition evidence. Editors record supported manual non-renewal work through existing controls. Only current authorized provider reads are used for imported evidence. Neither a read nor a manual staff label cancels a lease in RentVine.

**What it is / how it functions.**

### R-F03-01 — Establish the exact read contract first

Before mapping live notices, verify the existing client’s supported read response, field semantics, lease association, explicit cancellation behavior, pagination, and absence semantics against official provider documentation and authorized evidence. Record the non-secret field map. Do not infer notice submission from a future/end/moveOutDate value, a missing lease, or a Sheet checkbox. Unsupported or unverified fields produce unknown, not false.

### R-F03-02 — Use a typed, attributed disposition

Expose proposed semantic outcomes `initiated`, `not_initiated`, `withdrawn`, and `unknown` with evidence origin, source freshness, observation time, applicable lease/cycle, and a bounded reason. Stale/conflicting/failed reads are reasons for unknown, not negative evidence. These are proposed semantics, not claims of current provider field names. Preserve manual non-renewal disposition separately from provider notice evidence.

### R-F03-03 — Suppress inappropriate ordinary outreach locally

A current confirmed initiated notice or applicable audited non-renewal outcome MUST route the next action to review/non-renewal handoff and make ordinary owner/tenant renewal-draft creation unavailable for that unresolved disposition. Reading earlier drafts/history remains allowed. Unknown evidence MUST show uncertainty and must not silently exclude the lease or globally block previously supported manual work. The server rechecks applicable confirmed conflicts at final draft creation; an old open tab cannot bypass them.

### R-F03-04 — Expose filterable evidence without losing records

Provide exact move-out/non-renewal filter keys consumed by the canonical desk query. Include-only, exclude-confirmed, and all must be distinguishable; excluded confirmed cases remain in All leases and non-renewal work. Unknown cases remain in the default worklist and are available for targeted review. F14 owns color and category rendering; the same underlying disposition drives it.

### R-F03-05 — Keep non-renewal and completion separate

Move-out initiation MUST not close the lease, mark signatures complete, assess fees, or mark the handoff done. Show the existing handoff/checklist as a deliberate staff action; retain unresolved work under F02. F04 consumes available notice evidence but does not decide this disposition.

### R-F03-06 — Handle withdrawal and conflicting history

A fresh explicit withdrawal updates current provider evidence without deleting the notice history. Do not automatically resume outreach when an independent manual non-renewal decision remains, or reuse an old draft approval. Require the existing explicit review/correction path; time passing or null fields do not prove withdrawal. Never attach an old tenancy’s notice to a new tenancy at the same address.

**Data, state, and integration contract.**

Extend the existing authorized lease read projection with typed source evidence and freshness; use existing protected app records for manual decisions/history. Do not create an independent polling agent, new provider mutation endpoint, or negative default backfill. Resolve identities server-side. F14 consumes disposition and provenance, not raw provider bodies.

**Failure, retry, cancellation, and concurrency.**

Read failure permits a deliberate refresh and clearly labels any last-known positive evidence as stale; do not claim it was cancelled. A recorded manual handoff remains intact through provider failure. Interruption of a read has no effect. Source conflicts require review and never automatic writeback.

**Agent and loop contract.**

The entry trigger is an explicit authorized user interaction or a later authorized implementation run, not file receipt, elapsed time, a model inference, or a meeting date. Inputs are the actual current source snapshot, app-owned state, reviewed configuration, and actor scope. Reads produce typed evidence/readiness; ordinary saves use existing audited state services; an external effect uses only its owning exact confirmed-action service. State changes are re-read before success is displayed. Cancelled undispatched actions have no effect; dispatched/ambiguous effects are reconciled, not blindly retried. No new background agent, worker, polling loop, or scheduler is created by this feature.

For F13, this contract applies to evidence gathering only: there is no application mutation loop. For F12, meeting preparation/observation does not execute the described customer actions. Future meetings, material receipt, and provider activation remain distinct from implementation termination.

**In scope / out of scope.**

In scope: bounded mapping investigation, fail-closed read projection, outreach protection, and filter integration. Out of scope: full move-out accounting, collections, eviction, notice creation/cancellation, automatic source updates, and new maintenance functions.

**Open questions & assumptions.**

Live dependency (resolved 2026-09-20): the exact RentVine notice fields were established from the official reference and read-only live probes and are recorded in `docs/facts.md` F-RENTVINE-MOVE-OUT-CONTRACT: the status table's pending and completed move-out flags are the initiation evidence; the lease detail's notice date and expected move-out date are supporting evidence; RentVine exposes no explicit cancellation field, so withdrawal needs prior app-owned initiated evidence (no store records it yet) and otherwise stays unknown or a review case.

Unverified business/provider facts cannot be replaced by a plausible default. An explicitly labeled presentation/engineering default may be implemented within the approved scope; source semantics, policy applicability, legal wording, and provider permissions require their actual evidence. Missing input blocks only the dependent outcome identified below.

**Cross-product impacts.**

These are verified paths or explicitly marked candidate owners, not authorization to replace them:

- `lib/integrations/rentvine/client.ts` and `lib/integrations/rentvine/lease-mapper.ts` — candidate read/mapping owners; verify exact supported provider contract first.

- `lib/lease-renewal/live-desk.ts` and `lib/lease-renewal/desk-model.ts` — shared disposition projection.

- `lib/lease-renewal/workspace-state.ts`, `lib/lease-renewal/work-status.ts`, and `lib/move-out/process-template.ts` — existing manual handoff/history.

- `components/lease-renewal/RenewalDeskTable.tsx` and existing message-preparation controls — consumers, not independent truth resolvers.

Update only affected current contracts and facts after verification. Existing historical evidence remains historical. Original approval numbers remain stable; any later S-number remap must update all namespaced acceptance and outcome references consistently.

**Authority and evidence map.**

| Source          | Location                                                                                                                            | What it supports and what it does not                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T03             | Transcript 00:36:04–00:37:30; parsed lines 1358–1384                                                                                | Request to recognize initiated move-out before contacting an owner and use the non-renewal handoff.                                                               |
| U03             | User approval on 2026-09-18                                                                                                         | Approve Feature 3; separate cross-lease color/sort/filter feature F14 implements the additional request.                                                          |
| R03             | `lib/lease-renewal/work-status.ts`; `lib/move-out/process-template.ts`; `lib/integrations/rentvine/lease-mapper.ts`                 | Existing manual handoff and date aliases are reuse points, not a verified notice mapping.                                                                         |
| Shared baseline | `AGENTS.md`; `docs/facts.md`; `docs/loop-state.md`; `docs/feature-suites/TEMPLATE.md` at `d61eecf309fef75f5fe0a80f8f203c1d24c6804a` | Existing architecture/safety and document shape. The user’s latest approval controls new product scope; F08 expressly supersedes earlier enabled-Sheet execution. |

Transcript references use the supplied **Cherry Bridge + PMI: App Training, September 17, 2026** file and its conversation-parsed line numbers/timestamps. See source and decision log (from the 2026-09-18 export-pack evidence log) for filenames, source limitations, and conflicts. No raw customer details or secret values are reproduced here.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S124-1** — The owning boundaries listed above implement the data and state contract without a duplicate authoritative workflow, provider reader, or competing status model. A focused structural/service test or, for F13, a source-traceable assessment artifact demonstrates the named ownership and exact inputs/outputs.
- **ARCH-S124-2** — Actor scope, provenance/version binding, no-effect reads, explicit unavailable states, and existing effect/receipt boundaries remain enforced. Tests inject denied, missing, stale, conflicting, or interrupted evidence and assert the exact refusal/recovery described by each requirement.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S124-1** — R-F03-01: Establish the exact read contract first. The observable result must satisfy AC-S124-1; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S124-2** — R-F03-02: Use a typed, attributed disposition. The observable result must satisfy AC-S124-2; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S124-3** — R-F03-03: Suppress inappropriate ordinary outreach locally. The observable result must satisfy AC-S124-3; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S124-4** — R-F03-04: Expose filterable evidence without losing records. The observable result must satisfy AC-S124-4; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S124-5** — R-F03-05: Keep non-renewal and completion separate. The observable result must satisfy AC-S124-5; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S124-6** — R-F03-06: Handle withdrawal and conflicting history. The observable result must satisfy AC-S124-6; a UI label alone is insufficient where a service/provider boundary is required.

**Human litmus outcome.**

### Move-out detection and non-renewal outreach filtering

**If this was built correctly:** Staff see that move-out is already initiated before contacting the owner, can find those leases as a group, and can distinguish a confirmed notice from missing information.

- Model/engineering verdict: PASS in local engineering tests on `fc03ec55` (2026-09-20): AC-S124-1 through AC-S124-7 covered by the unit and component cases named in F-S124, with the read contract verified against docs.rentvine.com and read-only live probes; compiled browser checks NOT RUN (rehearsal auth blocked); no deployed readback.
- Human verdict: NOT RUN — no human observer.
- Any later human observation is recorded independently of implementation and provider verification.

**Requirement-to-outcome traceability.**

| Requirement | Owning boundary                              | Architecture             | Behavior   | Acceptance / test scenario                                   |
| ----------- | -------------------------------------------- | ------------------------ | ---------- | ------------------------------------------------------------ |
| R-F03-01    | RentVine client / lease mapper               | ARCH-S124-1, ARCH-S124-2 | BEH-S124-1 | AC-S124-1: Establish the exact read contract first           |
| R-F03-02    | shared disposition projection                | ARCH-S124-1, ARCH-S124-2 | BEH-S124-2 | AC-S124-2: Use a typed, attributed disposition               |
| R-F03-03    | message-readiness / draft service / guidance | ARCH-S124-1, ARCH-S124-2 | BEH-S124-3 | AC-S124-3: Suppress inappropriate ordinary outreach locally  |
| R-F03-04    | desk-model / desk-query-v2 / F14             | ARCH-S124-1, ARCH-S124-2 | BEH-S124-4 | AC-S124-4: Expose filterable evidence without losing records |
| R-F03-05    | workspace-state / move-out handoff           | ARCH-S124-1, ARCH-S124-2 | BEH-S124-5 | AC-S124-5: Keep non-renewal and completion separate          |
| R-F03-06    | source projection / cycle evidence           | ARCH-S124-1, ARCH-S124-2 | BEH-S124-6 | AC-S124-6: Handle withdrawal and conflicting history         |

Every acceptance scenario below is a required test or evidence deliverable, not a reported pass. For unaffected already-implemented behavior, retain the existing test as preservation evidence rather than duplicating it.

**Preservation set.**

Stable lease associations and missing-source behavior; existing owner/tenant draft safety; manual non-renewal history; no-send boundary; F01 full inventory and F02 retained work.

Keep preservation results separate from new-feature results. Passing one does not compensate for failing the other.

**Adversarial acceptance checks.**

- **AC-S124-1** — R-F03-01 / BEH-S124-1, ARCH-S124-1 and ARCH-S124-2: Fixtures with only an end date or legacy moveOutDate alias never become initiated. A documented exact positive notice plus stable lease association can become initiated; missing mapping remains unknown.

- **AC-S124-2** — R-F03-02 / BEH-S124-2, ARCH-S124-1 and ARCH-S124-2: Positive, explicit negative, cancelled, absent-field, stale, conflicting, and read-failed fixtures each produce the expected outcome and attribution; manual staff status is never labeled RentVine-confirmed.

- **AC-S124-3** — R-F03-03 / BEH-S124-3, ARCH-S124-1 and ARCH-S124-2: A confirmed notice appears before owner outreach and prevents a new ordinary renewal draft even through a stale client request. An unknown notice remains discoverable with a review cue and does not masquerade as no notice.

- **AC-S124-4** — R-F03-04 / BEH-S124-4, ARCH-S124-1 and ARCH-S124-2: A mixed set filtered to exclude confirmed notices retains unknown cases; the non-renewal filter returns the same leases whose applicable indicator says non-renewal. No source record is deleted.

- **AC-S124-5** — R-F03-05 / BEH-S124-5, ARCH-S124-1 and ARCH-S124-2: An initiated notice creates a visible handoff need with no completion, fee, source-write, or resident-message side effect.

- **AC-S124-6** — R-F03-06 / BEH-S124-6, ARCH-S124-1 and ARCH-S124-2: A cancelled provider notice plus an active manual non-renewal decision remains a review case. A new tenancy with the same address does not inherit the former notice; old previews require revalidation.

- **AC-S124-7** — ARCH-S124-2, preservation gate: run the named existing checks and assert no unintended customer sends, source mutations, paid lookups, actor widening, historical-evidence rewrite, or new background work. F08 must remain paused where installed; missing optional dependencies do not disable unrelated work.
- **AC-S124-8** — Evidence gate: the final result separately reports engineering tests, deployed readback if performed, missing external inputs, provider-specific verification, and human meeting observations. No unrun result is PASS, and no fake-provider success is described as a live customer outcome.

**Forbidden actions / hard gates.**

No autonomous customer sends, synthetic production customers, browser-driven provider workarounds, new identities, expanded roles, new action keys, or unreviewed protected-path changes. Opening, filtering, sorting, copying, inspecting, and refreshing must not authorize a write or advance a renewal. Preserve exact human confirmation, durable attempts, receipts, readback, and explicit reconciliation for separately authorized effects. A saved status, draft, uploaded file, matching provider record, or passed test is not proof of a sent message, valid signature, or completed customer workflow.

F08 is the only approved policy change in this pack: pause operating-Sheet mutations while preserving reads. It does not turn off supported RentVine operations or erase historical Sheet receipts. This export itself changes no runtime setting, repository file, account, calendar event, or provider record.

**Dependencies / sequencing.**

Produces disposition for F04/F14 and routing context for F07/F09. Reuses F02 current-cycle meaning. Develop F14 using the typed contract, not a second provider reader.

**Standalone delivery contract.**

- **Deliverable now, in a later implementation task:** The shared contract, controlled source fixtures, manual/provider attribution, server-enforced confirmed-notice guard, filters, and unknown-state recovery. Enable live mapping only after the mapping evidence passes.
- **Consumes, but does not assume:** the exact source/configuration/cross-feature inputs above; missing or unverified values retain their explicit unavailable representation.
- **Externally blocked or deferred outcome:** Exact documented provider mapping and an authorized current-source example. Do not create a customer notice just to generate evidence.
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

Keep this specification independent of adjacent features until its own code/evidence and remaining dependencies are represented by current implementation contracts, tests, and facts. Preserve the original F03 approval mapping. Do not delete an external-input or meeting-validation gap merely because scaffolding passed. If existing behavior already meets part of the spec, link that evidence and merge only redundant explanatory prose—not acceptance coverage, history, or the user’s separate-feature boundary.
