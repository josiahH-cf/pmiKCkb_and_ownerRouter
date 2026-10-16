<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-meeting-readiness-2026-09 -->

# S133 — External maintenance-agent handoff assessment

> **Approval reference:** F13 (original feature #13).
> **Status:** IMPLEMENTED AND DEPLOYED in the verified cumulative corrective batch at `c541db723d3622234956a16e95765867733427cf` / `pmi-kc-app-rmundpf2v-249c945f2220`. Exact CI 36650984450, release gates, independent source/runtime readbacks and six guarded product checks passed. Current evidence: [adversary review](../evidence/adversary-review-2026-09-29.md); original per-reference scopes and human/provider boundaries: [shared batch audit](../evidence/batch-litmus-audit-2026-09-28.md).
> **Export date:** 2026-09-18. **Repository baseline:** `d61eecf309fef75f5fe0a80f8f203c1d24c6804a`.
> **Registration:** Registered as S133 in `docs/feature-suites/README.md`; the original F13 approval mapping and independent suite acceptance contract are retained.
> **Classification:** Bounded discovery/decision specification, not an integration implementation.

**Goal.**

Retain the original maintenance/vendor records, receipts, permissions and historical requirement evidence after custom maintenance retirement. S227 owns the current operating contract; Vendoroo remains standalone.

**Core outcome alignment.**

C07 — Understand the external maintenance handoff without duplicating or broadening the application. See suite outcome contract (from the 2026-09-18 export-pack index). This file is a standalone feature specification; the index coordinates shared ownership and does not combine implementation scope.

**Current state / intended end state.**

October 15 30:54–31:32 and the confirming maintenance emails retire the custom workflow. The source baseline 0b892865 contains the earlier implementation or proposal recorded below; S227 retires operational entry and preserves authorized read-only history. S227–S229 are under verification, with no new deployment claimed. Earlier authoring and delivery evidence retains its original scope.

**Actors and entry conditions.**

Existing authorized readers retain their current permissions. No new maintenance intake, vendor work, provider action, maintenance draft, integration access request or old proof window may start from this contract. Shared renewal and knowledge behavior remains separately owned.

**What it is / how it functions.**

Read-only retention uses the existing stores and receipt/history readers under their original authorization, with operational requests refused before dispatch. No records are deleted or relabeled. Current maintenance is managed in standalone Vendoroo; no destination URL or integration is invented.

**Data, state, and integration contract.**

No new production data model. Candidate schemas/data flows are documentary and explicitly conditional. Assessment notes use redacted examples or synthetic local scenarios; actual account material remains private. Existing Maintenance state and retention remain unchanged.

**Failure, retry, cancellation, and concurrency.**

When authorization, documentation, or a harmless read is unavailable, stop that probe and record the precise missing input. Do not keep cycling through guessed endpoints or substitute another account. Resume only the interrupted evidence step when proper access arrives.

**Agent and loop contract.**

The entry trigger is an explicit authorized user interaction or a later authorized implementation run, not file receipt, elapsed time, a model inference, or a meeting date. Inputs are the actual current source snapshot, app-owned state, reviewed configuration, and actor scope. Reads produce typed evidence/readiness; ordinary saves use existing audited state services; an external effect uses only its owning exact confirmed-action service. State changes are re-read before success is displayed. Cancelled undispatched actions have no effect; dispatched/ambiguous effects are reconciled, not blindly retried. No new background agent, worker, polling loop, or scheduler is created by this feature.

For F13, this contract applies to evidence gathering only: there is no application mutation loop. For F12, meeting preparation/observation does not execute the described customer actions. Future meetings, material receipt, and provider activation remain distinct from implementation termination.

**In scope / out of scope.**

Only retention, historical interpretation and permission compatibility remain applicable. All former operational maintenance/vendor requirements and Vendoroo ingestion work in the historical trace below are superseded by S227. Raw private sources remain outside Git. This file grants no new execution or release authority.

**Open questions & assumptions.**

Former provider/account/policy inputs are not prerequisites for retirement and must not trigger duplicate requests. Fresh read-only provider evidence and deployment are held only by the exact authentication/browser limitations recorded in docs/open-blockers.md. Missing observations are not success.

**Cross-product impacts.**

S227 owns retired HTTP and shared effect admission, authorized history and reports. Existing stores, receipts and permissions remain unchanged. Renewal, workflow-linked unsent communications, search and knowledge retain their independent contracts. The historical architecture below identifies original owners for preservation only; it does not request extensions or integration.

**Authority and evidence map.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

| Source          | Location                                                                                                                            | What it supports and what it does not                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T13             | Transcript 00:29:37–00:31:37; parsed lines 1146–1196                                                                                | Purchased external agent, implementation underway, possible future access, ticket/escalation opportunity.                                                         |
| U13             | User approval on 2026-09-18                                                                                                         | Feature 13 approved as the previously identified exploratory assessment, not expanded to a production integration.                                                |
| R13             | `docs/facts.md`; `docs/integration-architecture.md`; current S99/S100/S108/S109 contracts                                           | Existing exact work-order, manual sync, draft, triage, and preapproval boundaries must remain intact.                                                             |
| Shared baseline | `AGENTS.md`; `docs/facts.md`; `docs/loop-state.md`; `docs/feature-suites/TEMPLATE.md` at `d61eecf309fef75f5fe0a80f8f203c1d24c6804a` | Existing architecture/safety and document shape. The user’s latest approval controls new product scope; F08 expressly supersedes earlier enabled-Sheet execution. |

Transcript references use the supplied **Cherry Bridge + PMI: App Training, September 17, 2026** file and its conversation-parsed line numbers/timestamps. See source and decision log (from the 2026-09-18 export-pack evidence log) for filenames, source limitations, and conflicts. No raw customer details or secret values are reproduced here.

**Architecture outcome (deterministic, fail-first).**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **ARCH-S133-1** — The owning boundaries listed above implement the data and state contract without a duplicate authoritative workflow, provider reader, or competing status model. A focused structural/service test or, for F13, a source-traceable assessment artifact demonstrates the named ownership and exact inputs/outputs.
- **ARCH-S133-2** — Actor scope, provenance/version binding, no-effect reads, explicit unavailable states, and existing effect/receipt boundaries remain enforced. Tests inject denied, missing, stale, conflicting, or interrupted evidence and assert the exact refusal/recovery described by each requirement.

**Behavior outcome (deterministic, fail-first).**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **BEH-S133-1** — R-F13-01: Verify identity and permitted access before choosing technology. The observable result must satisfy AC-S133-1; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S133-2** — R-F13-02: Inventory actual capabilities and limits. The observable result must satisfy AC-S133-2; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S133-3** — R-F13-03: Map ownership of the maintenance workflow. The observable result must satisfy AC-S133-3; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S133-4** — R-F13-04: Define minimal data and a real identity join. The observable result must satisfy AC-S133-4; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S133-5** — R-F13-05: Assess failure and double-action risks. The observable result must satisfy AC-S133-5; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S133-6** — R-F13-06: Deliver a bounded decision, not an implementation. The observable result must satisfy AC-S133-6; a UI label alone is insufficient where a service/provider boundary is required.

**Human litmus outcome.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

### External maintenance-agent handoff assessment

**If this was built correctly:** The maintenance owner can see what the purchased agent actually handles, what the app would receive or hand off, what remains manual or unknown, and what must be decided before any build.

- Model/engineering verdict: PASS for the implemented engineering and release scope at `843e222f436cee824ccb89cef23e8eea59d78d5d`. The final full gate passed 7,438 unit and 234 backend tests with four existing skips, exact CI 36624189352, production assurance/reconciliation/observation and independent readbacks. The shared audit preserves the exact per-check source/build scope and failed attempts. No human, customer accuracy, provider activation or external-input verdict is inferred.
- Human verdict: NOT RUN — no human observer.
- Any later human observation is recorded independently of implementation and provider verification.

**Requirement-to-outcome traceability.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

| Requirement | Owning boundary                                             | Architecture             | Behavior   | Acceptance / test scenario                                                 |
| ----------- | ----------------------------------------------------------- | ------------------------ | ---------- | -------------------------------------------------------------------------- |
| R-F13-01    | assessment evidence record                                  | ARCH-S133-1, ARCH-S133-2 | BEH-S133-1 | AC-S133-1: Verify identity and permitted access before choosing technology |
| R-F13-02    | vendor primary material / existing integration architecture | ARCH-S133-1, ARCH-S133-2 | BEH-S133-2 | AC-S133-2: Inventory actual capabilities and limits                        |
| R-F13-03    | maintenance process map / current exact action contracts    | ARCH-S133-1, ARCH-S133-2 | BEH-S133-3 | AC-S133-3: Map ownership of the maintenance workflow                       |
| R-F13-04    | identity / privacy assessment                               | ARCH-S133-1, ARCH-S133-2 | BEH-S133-4 | AC-S133-4: Define minimal data and a real identity join                    |
| R-F13-05    | handoff feasibility analysis                                | ARCH-S133-1, ARCH-S133-2 | BEH-S133-5 | AC-S133-5: Assess failure and double-action risks                          |
| R-F13-06    | decision packet only                                        | ARCH-S133-1, ARCH-S133-2 | BEH-S133-6 | AC-S133-6: Deliver a bounded decision, not an implementation               |

Every acceptance scenario below is a required test or evidence deliverable, not a reported pass. For unaffected already-implemented behavior, retain the existing test as preservation evidence rather than duplicating it.

**Preservation set.**

Existing Maintenance intake/work-order/approval behavior; exact provider keys; resident communication restrictions; no new vendor effects, accounts, costs, or scheduled automation.

Keep preservation results separate from new-feature results. Passing one does not compensate for failing the other.

**Adversarial acceptance checks.**

The following definitions record the original pre-retirement contract and its evidence. They retain their original meanings for provenance; S227 supersedes their operational applicability. They are not new acceptance claims or execution instructions.

- **AC-S133-1** — R-F13-01 / BEH-S133-1, ARCH-S133-1 and ARCH-S133-2: The evidence table either names the verified source/account/access scope or marks them Not established with an exact requested owner input; no unsupported identity is recorded as fact.

- **AC-S133-2** — R-F13-02 / BEH-S133-2, ARCH-S133-1 and ARCH-S133-2: The matrix separates demonstrated read-only/export/link capability from unverified write/webhook claims and records unknowns rather than fabricated endpoints/scopes.

- **AC-S133-3** — R-F13-03 / BEH-S133-3, ARCH-S133-1 and ARCH-S133-2: A supported example is traced from intake to handoff with an owner at each boundary; missing ownership is a decision item, and unsupported app actions remain outside the integration options.

- **AC-S133-4** — R-F13-04 / BEH-S133-4, ARCH-S133-1 and ARCH-S133-2: Two similar units and duplicate resident names cannot be silently joined; a stateful read is labeled as such, and the minimized handoff excludes unrelated customer records and secrets.

- **AC-S133-5** — R-F13-05 / BEH-S133-5, ARCH-S133-1 and ARCH-S133-2: Each feasible option includes exact known recovery behavior or an explicit unresolved limit; an ambiguous create cannot be presented as safe for blind retry.

- **AC-S133-6** — R-F13-06 / BEH-S133-6, ARCH-S133-1 and ARCH-S133-2: The report’s proposed options are traceable to evidence, unverified options are visibly conditional, and repository/provider diffs show no integration or authority change.

- **AC-S133-7** — ARCH-S133-2, preservation gate: run the named existing checks and assert no unintended customer sends, source mutations, paid lookups, actor widening, historical-evidence rewrite, or new background work. F08 must remain paused where installed; missing optional dependencies do not disable unrelated work.
- **AC-S133-8** — Evidence gate: the final result separately reports engineering tests, deployed readback if performed, missing external inputs, provider-specific verification, and human meeting observations. No unrun result is PASS, and no fake-provider success is described as a live customer outcome.

**Forbidden actions / hard gates.**

No autonomous customer sends, synthetic production customers, browser-driven provider workarounds, new identities, expanded roles, new action keys, or unreviewed protected-path changes. Opening, filtering, sorting, copying, inspecting, and refreshing must not authorize a write or advance a renewal. Preserve exact human confirmation, durable attempts, receipts, readback, and explicit reconciliation for separately authorized effects. A saved status, draft, uploaded file, matching provider record, or passed test is not proof of a sent message, valid signature, or completed customer workflow.

F08 is the only approved policy change in this pack: pause operating-Sheet mutations while preserving reads. It does not turn off supported RentVine operations or erase historical Sheet receipts. This export itself changes no runtime setting, repository file, account, calendar event, or provider record.

**Dependencies / sequencing.**

Use S227 for maintenance retirement and retained read-only compatibility. S228 owns current Dotloop diagnostics and S229 renewal/unsent communications preservation. Do not resume the old maintenance, Vendoroo integration or proof sequence from this historical contract.

**Standalone delivery contract.**

- **Deliverable now:** The S227 retirement/retention slice, preserving original evidence without migration effects.
- **Consumes, but does not assume:** Existing authorized history and exact receipts.
- **Externally blocked effect:** No former maintenance/provider effect is requested. Current live verification holds are in docs/open-blockers.md.
- **Produces for downstream suites:** Original record/receipt meanings and permissions, without new operational authority.

**Bounded feature spike.**

**Decision enabled:** Whether there is a documented, authorized handoff worth specifying next, and whether it should be manual/link-only, read-only, or an exact separately governed write/event interface.

**Competing possibilities:** a documented API/export supports a minimal handoff; only an authenticated human/deep-link path exists; or account access/documentation is insufficient to establish either. None is assumed.

**Required evidence:** owner-confirmed product/account identity, primary interface documentation, authorized nonmutating capability read when available, stable identity mapping, effect/privacy/retention limits, and the workflow-owner map.

**Scenarios:** one ordinary ticket, one escalation, duplicate delivery, two similar units, missing resident contact, outage, revoked access, and uncertain handoff. Paper/tabletop analysis is labeled as such; it is not a live integration test.

**Output and stop condition:** deliver the bounded decision packet when the evidence supports or rules out each candidate, or when an exact unavailable input prevents further authorized investigation. Do not treat “research more” as an output. Update only this assessment’s findings and propose the next bounded scope; do not automatically implement it.

**Verification and delivery contract.**

1. Verify current S227 retirement and read-only retention through the real request, service and authorized reader boundaries.
2. Preserve original requirement IDs, historical verdicts, records and receipt meanings. Do not execute the superseded operational acceptance outcomes or collect retired integration inputs.
3. Use S227-S229 for current focused regressions, required repository checks and authorized gated delivery. Record local, live-provider, human and deployment outcomes separately; missing evidence cannot become success.
4. Report ALL_GATES_GREEN only for actually completed current engineering gates, BUDGET_EXHAUSTED only for an explicit budget, or BLOCKED with its exact unavailable external input after independent work. These terminal states do not resume the superseded operational outcomes.

**Ordered prompt sequence.**

1. Read the current router and S227; verify actual retirement/retention behavior.
2. Use original evidence below only for provenance and preservation scope.
3. Do not execute former operational instructions, collect retired integration inputs or rerun completed proofs.
4. Verify and deliver the currently authorized S227–S229 slice through existing gates.

**Deletion/merge recommendation.**

The original operational contract is superseded by S227. Its historical trace remains temporarily available for native program-ledger consistency; it is not an execution queue. Remove that provenance only with its remaining evidence references reconciled, retaining originals in Git history.
