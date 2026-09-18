<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-meeting-readiness-2026-09 -->

# S133 — External maintenance-agent handoff assessment

> **Approval reference:** F13 (original feature #13).
> **Status:** SPECIFICATION ONLY — scope approved; no implementation, deployment, provider activation, or meeting validation performed by this export.
> **Export date:** 2026-09-18. **Repository baseline:** `d61eecf309fef75f5fe0a80f8f203c1d24c6804a`.
> **Registration:** S133 is a proposed allocation following the inspected S120 sequence, not a reservation or a claim of repository registration. Check for collisions on import, including the separately written F05 spec; preserve F13 when renumbering.
> **Classification:** Bounded discovery/decision specification, not an integration implementation.

**Goal.**

Produce an evidence-based decision packet describing whether and how the external maintenance agent mentioned as “Rue” can hand work to or from PMI KC, without building a replacement agent or assuming an API exists.

**Core outcome alignment.**

C07 — Understand the external maintenance handoff without duplicating or broadening the application. See suite outcome contract (from the 2026-09-18 export-pack index). This file is a standalone feature specification; the index coordinates shared ownership and does not combine implementation scope.

**Current state / intended end state.**

**Current evidence:** The transcript says vendor implementation is beginning, the team may provide access, and ticket management/escalation are potential areas to assess. It does not establish the vendor’s exact legal/product identity, account permissions, supported interfaces, contracts, or a selected integration design. Existing PMI KC Maintenance capabilities remain governed by their current S99/S100/S108/S109 contracts.

**Required end state:** A bounded capability/ownership/data-flow assessment identifies verified supported handoff options, genuinely missing evidence, and one decision needed before any future integration spec. When access/material is unavailable, the packet explicitly says feasibility is not established and names the exact input; no fictional connector is scaffolded.

Current statements are grounded in the source map below at the pinned revision; they are not a fresh production readback. All new data shapes, labels, and defaults introduced here are proposed requirements unless explicitly identified as existing code or an owner decision.

**Actors and entry conditions.**

PMI’s maintenance owner and vendor account administrator provide authorized materials/read-only access; an analyst evaluates them; the project owner approves any later integration scope. No vendor is contacted, account connected, or credential requested in chat by writing this spec.

**What it is / how it functions.**

### R-F13-01 — Verify identity and permitted access before choosing technology

Confirm the vendor/product/account with owner-supplied authoritative material; preserve “Rue” as the transcript label until resolved. Inspect only approved documentation and authorized harmless read-only surfaces. Do not guess a domain/API from a phonetic name, scrape a login, bypass a paywall, or substitute another vendor.

### R-F13-02 — Inventory actual capabilities and limits

For each relevant interface, record documentation/version, supported input/output, identity linkage, permissions, transport, effect semantics, event freshness, retry/duplication behavior, and unavailable operations. Distinguish API, documented webhook, export/import, verified deep link, and human handoff. A marketing claim is not evidence of an enabled account endpoint.

### R-F13-03 — Map ownership of the maintenance workflow

Document who receives a request/call, gathers facts, performs troubleshooting, creates the work order, decides escalation, authorizes spending/vendor assignment, contacts residents, resolves/reopens the issue, and owns source-of-truth status. Compare with current PMI KC/RentVine behavior to reveal duplicate tickets, duplicate communications, and unowned failures. No external agent’s autonomy becomes permission for the PMI application to send or spend.

### R-F13-04 — Define minimal data and a real identity join

For a potential handoff, identify only necessary property/unit/lease/work-order/contact fields, provenance, and permitted retention/access. Require stable verified IDs or an explicit human association step; matching names/addresses alone is insufficient. Keep raw resident communications and account credentials out of public evidence. Note whether a nominal read has a mark-read or other provider effect.

### R-F13-05 — Assess failure and double-action risks

Where an interface is actually supported, evaluate delayed/duplicate/reordered events, source drift, missing contacts, access revocation, vendor outage, partial creation, escalation ambiguity, and human takeover. Specify what evidence would prove handoff receipt and who reconciles uncertainty. Do not invent idempotency, automatic retries, polling, or notification behavior to fill gaps.

### R-F13-06 — Deliver a bounded decision, not an implementation

Produce: capability/evidence matrix; current-versus-vendor responsibility map; minimal data contract candidate; security/cost/retention questions; viable documented handoff options including a manual option when supported; and the exact owner decision required for a later build. Mark conclusions supported, unsupported, or inconclusive. Do not create a connector, scheduler, webhook, replacement troubleshooting agent, or new action grant.

**Data, state, and integration contract.**

No new production data model. Candidate schemas/data flows are documentary and explicitly conditional. Assessment notes use redacted examples or synthetic local scenarios; actual account material remains private. Existing Maintenance state and retention remain unchanged.

**Failure, retry, cancellation, and concurrency.**

When authorization, documentation, or a harmless read is unavailable, stop that probe and record the precise missing input. Do not keep cycling through guessed endpoints or substitute another account. Resume only the interrupted evidence step when proper access arrives.

**Agent and loop contract.**

The entry trigger is an explicit authorized user interaction or a later authorized implementation run, not file receipt, elapsed time, a model inference, or a meeting date. Inputs are the actual current source snapshot, app-owned state, reviewed configuration, and actor scope. Reads produce typed evidence/readiness; ordinary saves use existing audited state services; an external effect uses only its owning exact confirmed-action service. State changes are re-read before success is displayed. Cancelled undispatched actions have no effect; dispatched/ambiguous effects are reconciled, not blindly retried. No new background agent, worker, polling loop, or scheduler is created by this feature.

For F13, this contract applies to evidence gathering only: there is no application mutation loop. For F12, meeting preparation/observation does not execute the described customer actions. Future meetings, material receipt, and provider activation remain distinct from implementation termination.

**In scope / out of scope.**

In scope: bounded vendor identification, capability/ownership/privacy/recovery assessment and decision artifact. Out of scope: production integration, autonomous notifications, phone routing changes, vendor assignment/spend execution, building a new AI agent, or changing existing Maintenance behavior.

**Open questions & assumptions.**

Unresolved: exact vendor/product identity, approved account access, interface documentation, owner’s intended handoff, data permission/retention, and commercial/API terms. Bounded external search in this drafting pass did not establish these; no outside guess has replaced transcript terminology.

Unverified business/provider facts cannot be replaced by a plausible default. An explicitly labeled presentation/engineering default may be implemented within the approved scope; source semantics, policy applicability, legal wording, and provider permissions require their actual evidence. Missing input blocks only the dependent outcome identified below.

**Cross-product impacts.**

These are verified paths or explicitly marked candidate owners, not authorization to replace them:

- `docs/integration-architecture.md` and current Maintenance contracts — action/data boundary inventory.

- `docs/facts.md` and `docs/open-blockers.md` — existing capabilities and actual remaining gates.

- Current RentVine Maintenance and work-order chat owning modules — candidate reuse points, to be named precisely after inspecting the relevant handoff.

- A bounded decision record in the existing documentation/evidence structure — proposed artifact; no new provider module authorized.


Update only affected current contracts and facts after verification. Existing historical evidence remains historical. Original approval numbers remain stable; any later S-number remap must update all namespaced acceptance and outcome references consistently.

**Authority and evidence map.**

| Source | Location | What it supports and what it does not |
| --- | --- | --- |
| T13 | Transcript 00:29:37–00:31:37; parsed lines 1146–1196 | Purchased external agent, implementation underway, possible future access, ticket/escalation opportunity. |
| U13 | User approval on 2026-09-18 | Feature 13 approved as the previously identified exploratory assessment, not expanded to a production integration. |
| R13 | `docs/facts.md`; `docs/integration-architecture.md`; current S99/S100/S108/S109 contracts | Existing exact work-order, manual sync, draft, triage, and preapproval boundaries must remain intact. |
| Shared baseline | `AGENTS.md`; `docs/facts.md`; `docs/loop-state.md`; `docs/feature-suites/TEMPLATE.md` at `d61eecf309fef75f5fe0a80f8f203c1d24c6804a` | Existing architecture/safety and document shape. The user’s latest approval controls new product scope; F08 expressly supersedes earlier enabled-Sheet execution. |

Transcript references use the supplied **Cherry Bridge + PMI: App Training, September 17, 2026** file and its conversation-parsed line numbers/timestamps. See source and decision log (from the 2026-09-18 export-pack evidence log) for filenames, source limitations, and conflicts. No raw customer details or secret values are reproduced here.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S133-1** — The owning boundaries listed above implement the data and state contract without a duplicate authoritative workflow, provider reader, or competing status model. A focused structural/service test or, for F13, a source-traceable assessment artifact demonstrates the named ownership and exact inputs/outputs.
- **ARCH-S133-2** — Actor scope, provenance/version binding, no-effect reads, explicit unavailable states, and existing effect/receipt boundaries remain enforced. Tests inject denied, missing, stale, conflicting, or interrupted evidence and assert the exact refusal/recovery described by each requirement.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S133-1** — R-F13-01: Verify identity and permitted access before choosing technology. The observable result must satisfy AC-S133-1; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S133-2** — R-F13-02: Inventory actual capabilities and limits. The observable result must satisfy AC-S133-2; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S133-3** — R-F13-03: Map ownership of the maintenance workflow. The observable result must satisfy AC-S133-3; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S133-4** — R-F13-04: Define minimal data and a real identity join. The observable result must satisfy AC-S133-4; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S133-5** — R-F13-05: Assess failure and double-action risks. The observable result must satisfy AC-S133-5; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S133-6** — R-F13-06: Deliver a bounded decision, not an implementation. The observable result must satisfy AC-S133-6; a UI label alone is insufficient where a service/provider boundary is required.


**Human litmus outcome.**

### External maintenance-agent handoff assessment

**If this was built correctly:** The maintenance owner can see what the purchased agent actually handles, what the app would receive or hand off, what remains manual or unknown, and what must be decided before any build.

- Model/engineering verdict: NOT RUN — this export specifies checks; it does not execute application tests or claim their results.
- Human verdict: NOT RUN — no human observer.
- Any later human observation is recorded independently of implementation and provider verification.

**Requirement-to-outcome traceability.**

| Requirement | Owning boundary | Architecture | Behavior | Acceptance / test scenario |
| --- | --- | --- | --- | --- |
| R-F13-01 | assessment evidence record | ARCH-S133-1, ARCH-S133-2 | BEH-S133-1 | AC-S133-1: Verify identity and permitted access before choosing technology |
| R-F13-02 | vendor primary material / existing integration architecture | ARCH-S133-1, ARCH-S133-2 | BEH-S133-2 | AC-S133-2: Inventory actual capabilities and limits |
| R-F13-03 | maintenance process map / current exact action contracts | ARCH-S133-1, ARCH-S133-2 | BEH-S133-3 | AC-S133-3: Map ownership of the maintenance workflow |
| R-F13-04 | identity / privacy assessment | ARCH-S133-1, ARCH-S133-2 | BEH-S133-4 | AC-S133-4: Define minimal data and a real identity join |
| R-F13-05 | handoff feasibility analysis | ARCH-S133-1, ARCH-S133-2 | BEH-S133-5 | AC-S133-5: Assess failure and double-action risks |
| R-F13-06 | decision packet only | ARCH-S133-1, ARCH-S133-2 | BEH-S133-6 | AC-S133-6: Deliver a bounded decision, not an implementation |


Every acceptance scenario below is a required test or evidence deliverable, not a reported pass. For unaffected already-implemented behavior, retain the existing test as preservation evidence rather than duplicating it.

**Preservation set.**

Existing Maintenance intake/work-order/approval behavior; exact provider keys; resident communication restrictions; no new vendor effects, accounts, costs, or scheduled automation.

Keep preservation results separate from new-feature results. Passing one does not compensate for failing the other.

**Adversarial acceptance checks.**

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

Independent from the renewal feature bundle and the next renewal meeting. Reuse current S99/S100/S108/S109 evidence; do not reopen already completed proof programs or use this assessment to bypass their remaining gates.

**Standalone delivery contract.**

- **Deliverable now, in a later implementation task:** A bounded assessment protocol and evidence/decision templates; when adequate authorized material exists, a traceable report. Without it, complete the application-side inventory and return an explicitly inconclusive provider feasibility result.
- **Consumes, but does not assume:** the exact source/configuration/cross-feature inputs above; missing or unverified values retain their explicit unavailable representation.
- **Externally blocked or deferred outcome:** Owner-confirmed vendor identity and approved documentation/access. A future integration requires a separate approved implementation scope after this assessment.
- **Produces for downstream work:** the stable evidence/state contract and acceptance record defined here. No inferred approval or provider receipt is produced by a technical test.

**Bounded feature spike.**

**Decision enabled:** Whether there is a documented, authorized handoff worth specifying next, and whether it should be manual/link-only, read-only, or an exact separately governed write/event interface.

**Competing possibilities:** a documented API/export supports a minimal handoff; only an authenticated human/deep-link path exists; or account access/documentation is insufficient to establish either. None is assumed.

**Required evidence:** owner-confirmed product/account identity, primary interface documentation, authorized nonmutating capability read when available, stable identity mapping, effect/privacy/retention limits, and the workflow-owner map.

**Scenarios:** one ordinary ticket, one escalation, duplicate delivery, two similar units, missing resident contact, outage, revoked access, and uncertain handoff. Paper/tabletop analysis is labeled as such; it is not a live integration test.

**Output and stop condition:** deliver the bounded decision packet when the evidence supports or rules out each candidate, or when an exact unavailable input prevents further authorized investigation. Do not treat “research more” as an output. Update only this assessment’s findings and propose the next bounded scope; do not automatically implement it.

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

Keep this specification independent of adjacent features until its own code/evidence and remaining dependencies are represented by current implementation contracts, tests, and facts. Preserve the original F13 approval mapping. Do not delete an external-input or meeting-validation gap merely because scaffolding passed. If existing behavior already meets part of the spec, link that evidence and merge only redundant explanatory prose—not acceptance coverage, history, or the user’s separate-feature boundary.
