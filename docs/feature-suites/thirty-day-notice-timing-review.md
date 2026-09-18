<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-meeting-readiness-2026-09 -->

# S125 — Thirty-day notice timing review with an explicit date basis

> **Approval reference:** F04 (original feature #4).
> **Status:** SPECIFICATION ONLY — scope approved; no implementation, deployment, provider activation, or meeting validation performed by this export.
> **Export date:** 2026-09-18. **Repository baseline:** `d61eecf309fef75f5fe0a80f8f203c1d24c6804a`.
> **Registration:** S125 is a proposed allocation following the inspected S120 sequence, not a reservation or a claim of repository registration. Check for collisions on import, including the separately written F05 spec; preserve F04 when renumbering.
> **Classification:** New operational timing indicator; not a legal or fee determination.

**Goal.**

Staff can see whether recorded notice meets a configured 30-day timing comparison, inspect both dates and the chosen basis, and identify late or undeterminable cases for human review.

**Core outcome alignment.**

C03 — Explain a reviewable timing result without inventing policy or money owed. See suite outcome contract (from the 2026-09-18 export-pack index). This file is a standalone feature specification; the index coordinates shared ownership and does not combine implementation scope.

**Current state / intended end state.**

**Current evidence:** The transcript states PMI requires 30-day notice and mentions a RentVine notice-given date, but does not establish whether the comparison target is scheduled move-out, contractual end, or another date, nor legal counting rules. Existing renewal notice/follow-up rules concern a different workflow and MUST not silently be repurposed as move-out policy.

**Required end state:** A deterministic calculator and source-attributed display work once the target-date/counting basis is explicitly reviewed. Until then, the UI identifies the missing basis instead of issuing a misleading yes/no. No fees, balances, legal conclusions, or notices are generated.

Current statements are grounded in the source map below at the pinned revision; they are not a fresh production readback. All new data shapes, labels, and defaults introduced here are proposed requirements unless explicitly identified as existing code or an owner decision.

**Actors and entry conditions.**

Renewals staff inspect results. Editors may record supported source facts through existing app-owned review controls. The existing authorized policy/configuration role records the approved timing basis; this specification adds no role or unilateral policy authority.

**What it is / how it functions.**

### R-F04-01 — Name both dates and their meaning

The input MUST contain a validated notice-given calendar date, a separately identified target calendar date, exact lease association, source/provenance, freshness, and an approved policy version/basis. Label the target “scheduled move-out date” or “contractual lease-end date” only when that is the reviewed meaning. Never substitute one for the other because a field is blank.

### R-F04-02 — Make counting explicit and testable

The threshold is 30 days from the transcript. Proposed technical default, not a confirmed business/legal fact: compare calendar-date ordinals as target minus notice, with exactly 30 satisfying the threshold; no time-of-day, weekend, holiday, or inclusive extra-day adjustment. Activate this rule only after the authorized policy owner confirms that basis. Implement the evaluator with the counting rule as explicit versioned input, never an implicit library default.

### R-F04-03 — Use truthful result states

Render Meets configured 30-day timing, Below configured 30-day timing — staff review, Cannot determine, or Not applicable, with days provided, the two dates, and basis where available. Not applicable requires explicit absence/withdrawal or a reviewed applicability decision; an unreadable notice is Cannot determine. A malformed/impossible or contradictory source date is invalid evidence, not a financial violation.

### R-F04-04 — Keep results tied to the evidence version

Calculate on the current source/policy snapshot and display freshness. A later corrected notice, target date, or approved rule version recomputes the display; retain any previously staff-reviewed result as historical with its source version. Do not alter source dates to make the result pass. A stale policy or date invalidates final claims that depend on it.

### R-F04-05 — Provide a review path, not an automated sanction

Late/uncertain outcomes MUST link to the relevant source facts and existing staff review/handoff context. They MUST NOT calculate break-lease fees, rent owed, deposit deductions, collection actions, legal compliance, or send a demand. Keep the operational timing result independent of renewal completion and F14 lifecycle color.

### R-F04-06 — Support consistent filtering and unavailable states

Expose bounded timing filter values using the same result projection as the desk/workspace; unknown is explicitly filterable and never treated as compliant. F06 formats dates but does not change the underlying comparison. Loading, failed reads, or inaccessible evidence MUST not expose customer data or reset a prior reviewed fact.

**Data, state, and integration contract.**

The evaluator is pure over date-only facts and an explicit reviewed rule. Store only actual reviewed policy configuration and, where needed, staff review evidence in existing protected patterns; do not add a full legal-rules engine. Source fields remain nullable and attributed. Proposed names are implementation design, not alleged provider fields.

**Failure, retry, cancellation, and concurrency.**

Retry is a deliberate read/recalculation. A policy/configuration save follows current revision checks and readback; cancellation before saving changes nothing. A lost save response is reconciled before resubmission. Conflicting dates remain visible for review.

**Agent and loop contract.**

The entry trigger is an explicit authorized user interaction or a later authorized implementation run, not file receipt, elapsed time, a model inference, or a meeting date. Inputs are the actual current source snapshot, app-owned state, reviewed configuration, and actor scope. Reads produce typed evidence/readiness; ordinary saves use existing audited state services; an external effect uses only its owning exact confirmed-action service. State changes are re-read before success is displayed. Cancelled undispatched actions have no effect; dispatched/ambiguous effects are reconciled, not blindly retried. No new background agent, worker, polling loop, or scheduler is created by this feature.

For F13, this contract applies to evidence gathering only: there is no application mutation loop. For F12, meeting preparation/observation does not execute the described customer actions. Future meetings, material receipt, and provider activation remain distinct from implementation termination.

**In scope / out of scope.**

In scope: logic, boundary tests, source-linked display, basis configuration, and staff review/filtering. Out of scope: determining applicable law, selecting contractual notice provisions, fee/penalty calculations, collection notices, and automatic legal enforcement.

**Open questions & assumptions.**

Live classification dependency: PMI must confirm the comparison anchor and counting convention. The spec is ready for the evaluator, explicit unconfigured state, review UI, and tests now; production yes/no results remain gated on that exact input. This preserves the requested feature without silently turning a proposed calendar rule into policy.

Unverified business/provider facts cannot be replaced by a plausible default. An explicitly labeled presentation/engineering default may be implemented within the approved scope; source semantics, policy applicability, legal wording, and provider permissions require their actual evidence. Missing input blocks only the dependent outcome identified below.

**Cross-product impacts.**

These are verified paths or explicitly marked candidate owners, not authorization to replace them:

- `lib/lease-renewal/business-calendar.ts` — existing date-only/business-date handling.

- `lib/lease-renewal/live-desk.ts` and `lib/lease-renewal/desk-model.ts` — source evidence and result display.

- `lib/lease-renewal/notice-rules.ts` — inspect for reusable primitives only; preserve existing renewal notice rules.

- New bounded move-out timing evaluator and focused tests — proposed additions under the existing renewal domain, not verified existing symbols.


Update only affected current contracts and facts after verification. Existing historical evidence remains historical. Original approval numbers remain stable; any later S-number remap must update all namespaced acceptance and outcome references consistently.

**Authority and evidence map.**

| Source | Location | What it supports and what it does not |
| --- | --- | --- |
| T04 | Transcript 00:37:30; parsed lines 1386–1404 | Thirty-day check requested; staff subsequently investigate financial consequences themselves. |
| U04 | User approval on 2026-09-18 | Feature 4 approved, without adding a target-date or penalty rule. |
| R04 | `lib/lease-renewal/business-calendar.ts`; `lib/lease-renewal/notice-rules.ts`; `lib/lease-renewal/live-desk.ts` | Reuse date semantics and projections; existing notice rules are not proof of this requested policy. |
| Shared baseline | `AGENTS.md`; `docs/facts.md`; `docs/loop-state.md`; `docs/feature-suites/TEMPLATE.md` at `d61eecf309fef75f5fe0a80f8f203c1d24c6804a` | Existing architecture/safety and document shape. The user’s latest approval controls new product scope; F08 expressly supersedes earlier enabled-Sheet execution. |

Transcript references use the supplied **Cherry Bridge + PMI: App Training, September 17, 2026** file and its conversation-parsed line numbers/timestamps. See source and decision log (from the 2026-09-18 export-pack evidence log) for filenames, source limitations, and conflicts. No raw customer details or secret values are reproduced here.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S125-1** — The owning boundaries listed above implement the data and state contract without a duplicate authoritative workflow, provider reader, or competing status model. A focused structural/service test or, for F13, a source-traceable assessment artifact demonstrates the named ownership and exact inputs/outputs.
- **ARCH-S125-2** — Actor scope, provenance/version binding, no-effect reads, explicit unavailable states, and existing effect/receipt boundaries remain enforced. Tests inject denied, missing, stale, conflicting, or interrupted evidence and assert the exact refusal/recovery described by each requirement.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S125-1** — R-F04-01: Name both dates and their meaning. The observable result must satisfy AC-S125-1; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S125-2** — R-F04-02: Make counting explicit and testable. The observable result must satisfy AC-S125-2; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S125-3** — R-F04-03: Use truthful result states. The observable result must satisfy AC-S125-3; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S125-4** — R-F04-04: Keep results tied to the evidence version. The observable result must satisfy AC-S125-4; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S125-5** — R-F04-05: Provide a review path, not an automated sanction. The observable result must satisfy AC-S125-5; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S125-6** — R-F04-06: Support consistent filtering and unavailable states. The observable result must satisfy AC-S125-6; a UI label alone is insufficient where a service/provider boundary is required.


**Human litmus outcome.**

### Thirty-day notice timing review with an explicit date basis

**If this was built correctly:** Staff can see the exact dates and the number of days given, understand why a case needs review, and never mistake an unknown date or unset policy for a yes/no answer.

- Model/engineering verdict: NOT RUN — this export specifies checks; it does not execute application tests or claim their results.
- Human verdict: NOT RUN — no human observer.
- Any later human observation is recorded independently of implementation and provider verification.

**Requirement-to-outcome traceability.**

| Requirement | Owning boundary | Architecture | Behavior | Acceptance / test scenario |
| --- | --- | --- | --- | --- |
| R-F04-01 | timing evaluator / source projection | ARCH-S125-1, ARCH-S125-2 | BEH-S125-1 | AC-S125-1: Name both dates and their meaning |
| R-F04-02 | business-calendar / timing evaluator | ARCH-S125-1, ARCH-S125-2 | BEH-S125-2 | AC-S125-2: Make counting explicit and testable |
| R-F04-03 | timing projection / UI | ARCH-S125-1, ARCH-S125-2 | BEH-S125-3 | AC-S125-3: Use truthful result states |
| R-F04-04 | projection / existing audited review storage | ARCH-S125-1, ARCH-S125-2 | BEH-S125-4 | AC-S125-4: Keep results tied to the evidence version |
| R-F04-05 | guidance / timing UI | ARCH-S125-1, ARCH-S125-2 | BEH-S125-5 | AC-S125-5: Provide a review path, not an automated sanction |
| R-F04-06 | desk query / F06 date display | ARCH-S125-1, ARCH-S125-2 | BEH-S125-6 | AC-S125-6: Support consistent filtering and unavailable states |


Every acceptance scenario below is a required test or evidence deliverable, not a reported pass. For unaffected already-implemented behavior, retain the existing test as preservation evidence rather than duplicating it.

**Preservation set.**

Existing renewal notice/follow-up policy, no automatic fee/source updates, timezone/date-only semantics, exact source provenance, and unaffected renewal completion.

Keep preservation results separate from new-feature results. Passing one does not compensate for failing the other.

**Adversarial acceptance checks.**

- **AC-S125-1** — R-F04-01 / BEH-S125-1, ARCH-S125-1 and ARCH-S125-2: When move-out and lease-end differ, selecting either reviewed basis produces its own result and label. Missing target-basis approval yields Cannot determine, not a guessed answer.

- **AC-S125-2** — R-F04-02 / BEH-S125-2, ARCH-S125-1 and ARCH-S125-2: Under the reviewed calendar-day fixture rule, 29 fails, 30 passes, and 31 passes; same-date yields zero. A daylight-saving change does not change the day count. An unset counting basis produces no yes/no.

- **AC-S125-3** — R-F04-03 / BEH-S125-3, ARCH-S125-1 and ARCH-S125-2: Missing notice, missing target, source failure, invalid leap date, future-recorded notice, and target-before-notice fixtures produce explained uncertainty/review, never an invented compliant status or amount owed.

- **AC-S125-4** — R-F04-04 / BEH-S125-4, ARCH-S125-1 and ARCH-S125-2: Correcting a notice date changes the current timing result while retaining prior reviewed evidence; revisiting an old report identifies the old basis rather than rewriting it.

- **AC-S125-5** — R-F04-05 / BEH-S125-5, ARCH-S125-1 and ARCH-S125-2: A below-threshold fixture shows a review action and no ledger calculation, draft demand, account update, completion change, or legal-compliance badge.

- **AC-S125-6** — R-F04-06 / BEH-S125-6, ARCH-S125-1 and ARCH-S125-2: A timing-filtered table exactly matches current result keys, including unknown cases; formatting changes leave every calculation and sort key unchanged.

- **AC-S125-7** — ARCH-S125-2, preservation gate: run the named existing checks and assert no unintended customer sends, source mutations, paid lookups, actor widening, historical-evidence rewrite, or new background work. F08 must remain paused where installed; missing optional dependencies do not disable unrelated work.
- **AC-S125-8** — Evidence gate: the final result separately reports engineering tests, deployed readback if performed, missing external inputs, provider-specific verification, and human meeting observations. No unrun result is PASS, and no fake-provider success is described as a live customer outcome.

**Forbidden actions / hard gates.**

No autonomous customer sends, synthetic production customers, browser-driven provider workarounds, new identities, expanded roles, new action keys, or unreviewed protected-path changes. Opening, filtering, sorting, copying, inspecting, and refreshing must not authorize a write or advance a renewal. Preserve exact human confirmation, durable attempts, receipts, readback, and explicit reconciliation for separately authorized effects. A saved status, draft, uploaded file, matching provider record, or passed test is not proof of a sent message, valid signature, or completed customer workflow.

F08 is the only approved policy change in this pack: pause operating-Sheet mutations while preserving reads. It does not turn off supported RentVine operations or erase historical Sheet receipts. This export itself changes no runtime setting, repository file, account, calendar event, or provider record.

**Dependencies / sequencing.**

F03 supplies notice evidence or unknown. F06 owns date presentation; F07 owns review navigation. Existing renewal notice-policy behavior is preserved and is not merged into this rule.

**Standalone delivery contract.**

- **Deliverable now, in a later implementation task:** The parameterized timing evaluator, source/result UI, configuration/readback path, and exhaustive boundary/unknown tests. The unconfigured state is an accepted deliverable, not evidence of a completed live calculation.
- **Consumes, but does not assume:** the exact source/configuration/cross-feature inputs above; missing or unverified values retain their explicit unavailable representation.
- **Externally blocked or deferred outcome:** Confirmed target-date meaning and day-count convention, plus the source-field mapping from F03 for automatic reads.
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

Keep this specification independent of adjacent features until its own code/evidence and remaining dependencies are represented by current implementation contracts, tests, and facts. Preserve the original F04 approval mapping. Do not delete an external-input or meeting-validation gap merely because scaffolding passed. If existing behavior already meets part of the spec, link that evidence and merge only redundant explanatory prose—not acceptance coverage, history, or the user’s separate-feature boundary.
