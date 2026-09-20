<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-meeting-readiness-2026-09 -->

# S126 — Consistent month/day/year date presentation

> **Approval reference:** F06 (original feature #6).
> **Status:** IMPLEMENTED and CI-GREEN at `7f0ed865` (2026-09-20); release deferred by the billing incident; no deployment, provider activation, or meeting validation has occurred. Serving evidence: `docs/facts.md` F-S126 and `docs/date-display-inventory.md`.
> **Export date:** 2026-09-18. **Repository baseline:** `d61eecf309fef75f5fe0a80f8f203c1d24c6804a`.
> **Registration:** S126 is a proposed allocation following the inspected S120 sequence, not a reservation or a claim of repository registration. Check for collisions on import, including the separately written F05 spec; preserve F06 when renumbering.
> **Classification:** Application-wide presentation correction with unchanged date semantics.

**Goal.**

All app-controlled user-facing calendar dates read in month/day/year order, without shifting a day, changing sorting, rewriting data, or corrupting existing provider contracts.

**Core outcome alignment.**

C03 — Readable operational facts; C05 — Consistent meeting and document preparation. See suite outcome contract (from the 2026-09-18 export-pack index). This file is a standalone feature specification; the index coordinates shared ownership and does not combine implementation scope.

**Current state / intended end state.**

**Current evidence:** The transcript requests month/day/year and specifically calls out dates at the top of the page. The desk stores/query-filters canonical ISO dates, and `work-status.ts` separately formats audit timestamps in America/Chicago. Current presentation is mixed. The transcript does not choose a separator, padding, or year width.

**Required end state:** A shared display convention is used in app-owned tables, headers, sidebars, forms, previews, history, and current operator handouts. Internal dates remain canonical and date-only values never undergo timezone conversion.

Current statements are grounded in the source map below at the pinned revision; they are not a fresh production readback. All new data shapes, labels, and defaults introduced here are proposed requirements unless explicitly identified as existing code or an owner decision.

**Actors and entry conditions.**

All existing application users benefit; there is no new permission or business action. Operators entering dates retain current typed validation and accessible labels.

**What it is / how it functions.**

### R-F06-01 — Adopt one visible convention

Use `MM/DD/YYYY` for app-owned full numeric calendar-date displays as a documented implementation default: two-digit month/day and four-digit year. This is a proposed presentation choice within the approved month/day/year requirement, not a claimed transcript decision. Month-only views show a clear month/year label. Audit timestamps retain time and an explicit timezone after the formatted calendar date.

### R-F06-02 — Keep date-only values date-only

A value that denotes a calendar date MUST be validated and formatted as that date without converting midnight UTC into the user’s timezone. Timestamp values MUST use their established business timezone or explicitly documented surface contract. Never change an event instant to force a preferred date. Do not use arbitrary browser locale as business logic.

### R-F06-03 — Preserve storage, filters, and providers

Do not rewrite persisted ISO dates, URL `from`/`through`/`endDate` values, sort keys, signatures/hashes, provider payloads, receipts, or API schemas. Sort and compare typed values, not formatted strings. F04’s day-count evaluator consumes canonical dates, never the rendered label.

### R-F06-04 — Handle date input honestly

Native date inputs may render according to browser settings; supply a consistent adjacent MM/DD/YYYY display/hint and canonical-value validation rather than claiming the browser guarantees the layout. Any non-native typed entry MUST accept only its declared format, reject impossible/ambiguous values, and preserve a usable keyboard/picker path. Do not silently reinterpret 04/05 as day/month.

### R-F06-05 — Distinguish unknown and invalid dates

Missing dates MUST display Not available or the existing precise missing-state label, never zero, the epoch, today, or Invalid Date. Invalid upstream values must produce a recoverable data-check explanation; raw machine diagnostics may retain the original value only in already-authorized diagnostics, not as the normal display.

### R-F06-06 — Inventory the whole app without rewriting source content

Audit app-owned date displays across Renewals, My Work, approvals, workflow communications, Maintenance, Connections/Admin, and current generated handouts; record each surface and result. Format dynamic date values in newly prepared app output. Do not rewrite quoted source email text, immutable historical messages, approved legal-form wording, externally hosted provider screens, or historical receipts to match the new style.

**Data, state, and integration contract.**

This is presentation-only. Consolidate a small shared formatter if one does not already exist, with distinct date-only and timestamp entry points. No schema migration, locale preference subsystem, provider change, or timezone-policy change is authorized.

**Failure, retry, cancellation, and concurrency.**

Formatting failure yields explicit invalid/unavailable output, not an exception that hides the lease. Form errors preserve unsaved input for correction; canceling entry changes nothing. Rendering or changing locale never persists business data.

**Agent and loop contract.**

The entry trigger is an explicit authorized user interaction or a later authorized implementation run, not file receipt, elapsed time, a model inference, or a meeting date. Inputs are the actual current source snapshot, app-owned state, reviewed configuration, and actor scope. Reads produce typed evidence/readiness; ordinary saves use existing audited state services; an external effect uses only its owning exact confirmed-action service. State changes are re-read before success is displayed. Cancelled undispatched actions have no effect; dispatched/ambiguous effects are reconciled, not blindly retried. No new background agent, worker, polling loop, or scheduler is created by this feature.

For F13, this contract applies to evidence gathering only: there is no application mutation loop. For F12, meeting preparation/observation does not execute the described customer actions. Future meetings, material receipt, and provider activation remain distinct from implementation termination.

**In scope / out of scope.**

In scope: app-controlled displays, input clarity, new preview variables, and current operator materials. Out of scope: modifying historical source content, changing provider formats, legal-form format mandates, or imposing app formatting on Gmail/RentVine/Dotloop screens.

**Open questions & assumptions.**

Nonblocking implementation default: MM/DD/YYYY. Existing legal-form/provider-specific field formats take precedence for their payloads and must be reviewed under F10. Inventory findings may reveal more app-owned surfaces; they are part of this formatting slice, not permission for a redesign.

Unverified business/provider facts cannot be replaced by a plausible default. An explicitly labeled presentation/engineering default may be implemented within the approved scope; source semantics, policy applicability, legal wording, and provider permissions require their actual evidence. Missing input blocks only the dependent outcome identified below.

**Cross-product impacts.**

These are verified paths or explicitly marked candidate owners, not authorization to replace them:

- `lib/lease-renewal/desk-query-v2.ts` — preserve ISO parsing and underlying date sorting.

- `lib/lease-renewal/business-calendar.ts` and `lib/lease-renewal/work-status.ts` — inspect/reuse semantic date primitives.

- `components/lease-renewal/RenewalDeskTable.tsx` and existing workspace/message components — primary display consumers.

- Shared date-display utility and application-wide display inventory — proposed additions or consolidation; locate existing shared utilities before introducing one.

- `docs/products/renewal-operator-guide.md` and its current handout generator — keep displayed date instructions consistent.

Update only affected current contracts and facts after verification. Existing historical evidence remains historical. Original approval numbers remain stable; any later S-number remap must update all namespaced acceptance and outcome references consistently.

**Authority and evidence map.**

| Source          | Location                                                                                                                            | What it supports and what it does not                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T06             | Transcript 00:44:11–00:45:11; parsed lines 1558–1586                                                                                | Requested month, day, year presentation across the application.                                                                                                   |
| U06             | User approval on 2026-09-18                                                                                                         | Feature 6 approved separately.                                                                                                                                    |
| R06             | `lib/lease-renewal/desk-query-v2.ts`; `lib/lease-renewal/work-status.ts`; `lib/lease-renewal/business-calendar.ts`                  | Canonical ISO query dates and a current Central-time audit formatter are distinct data types.                                                                     |
| Shared baseline | `AGENTS.md`; `docs/facts.md`; `docs/loop-state.md`; `docs/feature-suites/TEMPLATE.md` at `d61eecf309fef75f5fe0a80f8f203c1d24c6804a` | Existing architecture/safety and document shape. The user’s latest approval controls new product scope; F08 expressly supersedes earlier enabled-Sheet execution. |

Transcript references use the supplied **Cherry Bridge + PMI: App Training, September 17, 2026** file and its conversation-parsed line numbers/timestamps. See source and decision log (from the 2026-09-18 export-pack evidence log) for filenames, source limitations, and conflicts. No raw customer details or secret values are reproduced here.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S126-1** — The owning boundaries listed above implement the data and state contract without a duplicate authoritative workflow, provider reader, or competing status model. A focused structural/service test or, for F13, a source-traceable assessment artifact demonstrates the named ownership and exact inputs/outputs.
- **ARCH-S126-2** — Actor scope, provenance/version binding, no-effect reads, explicit unavailable states, and existing effect/receipt boundaries remain enforced. Tests inject denied, missing, stale, conflicting, or interrupted evidence and assert the exact refusal/recovery described by each requirement.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S126-1** — R-F06-01: Adopt one visible convention. The observable result must satisfy AC-S126-1; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S126-2** — R-F06-02: Keep date-only values date-only. The observable result must satisfy AC-S126-2; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S126-3** — R-F06-03: Preserve storage, filters, and providers. The observable result must satisfy AC-S126-3; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S126-4** — R-F06-04: Handle date input honestly. The observable result must satisfy AC-S126-4; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S126-5** — R-F06-05: Distinguish unknown and invalid dates. The observable result must satisfy AC-S126-5; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S126-6** — R-F06-06: Inventory the whole app without rewriting source content. The observable result must satisfy AC-S126-6; a UI label alone is insufficient where a service/provider boundary is required.

**Human litmus outcome.**

### Consistent month/day/year date presentation

**If this was built correctly:** An operator reads the same lease date in the table, header, sidebar, and draft preview in the expected order, and filtering/sorting still returns the same leases.

- Model/engineering verdict: PASS in local engineering tests on `7f0ed865` (2026-09-20): AC-S126-1 through AC-S126-7 covered by the utility, surface and inventory cases named in F-S126 (compiled browser checks NOT RUN while rehearsal auth is blocked); no deployed readback.
- Human verdict: NOT RUN — no human observer.
- Any later human observation is recorded independently of implementation and provider verification.

**Requirement-to-outcome traceability.**

| Requirement | Owning boundary                                     | Architecture             | Behavior   | Acceptance / test scenario                                          |
| ----------- | --------------------------------------------------- | ------------------------ | ---------- | ------------------------------------------------------------------- |
| R-F06-01    | shared display utility / display inventory          | ARCH-S126-1, ARCH-S126-2 | BEH-S126-1 | AC-S126-1: Adopt one visible convention                             |
| R-F06-02    | business-calendar / shared display utility          | ARCH-S126-1, ARCH-S126-2 | BEH-S126-2 | AC-S126-2: Keep date-only values date-only                          |
| R-F06-03    | query / API serializers                             | ARCH-S126-1, ARCH-S126-2 | BEH-S126-3 | AC-S126-3: Preserve storage, filters, and providers                 |
| R-F06-04    | existing date controls                              | ARCH-S126-1, ARCH-S126-2 | BEH-S126-4 | AC-S126-4: Handle date input honestly                               |
| R-F06-05    | shared display utility / data checks                | ARCH-S126-1, ARCH-S126-2 | BEH-S126-5 | AC-S126-5: Distinguish unknown and invalid dates                    |
| R-F06-06    | application presentation owners / handout generator | ARCH-S126-1, ARCH-S126-2 | BEH-S126-6 | AC-S126-6: Inventory the whole app without rewriting source content |

Every acceptance scenario below is a required test or evidence deliverable, not a reported pass. For unaffected already-implemented behavior, retain the existing test as preservation evidence rather than duplicating it.

**Preservation set.**

Canonical date validation, query-v2 120-day range contract, business-date semantics, evidence hashes, provider serialization, and immutable historical artifacts.

Keep preservation results separate from new-feature results. Passing one does not compensate for failing the other.

**Adversarial acceptance checks.**

- **AC-S126-1** — R-F06-01 / BEH-S126-1, ARCH-S126-1 and ARCH-S126-2: An inventory fixture date appears as 10/01/2026 in headers, table cells, sidebars, review panels, app-generated message variable text, and app-owned history; no mixed year-first full date remains on those surfaces.

- **AC-S126-2** — R-F06-02 / BEH-S126-2, ARCH-S126-1 and ARCH-S126-2: Leap days, month/year boundaries, and dates around daylight-saving changes display the identical calendar day across runtime/browser timezones; a true timestamp retains its instant and explicit zone.

- **AC-S126-3** — R-F06-03 / BEH-S126-3, ARCH-S126-1 and ARCH-S126-2: A before/after snapshot shows byte-identical persisted/API/query dates and unchanged chronological order, including 12/31 and 01/01 across years.

- **AC-S126-4** — R-F06-04 / BEH-S126-4, ARCH-S126-1 and ARCH-S126-2: A native picker retains ISO submission with a readable companion date; a typed input rejects 02/30/2026 and does not silently swap month/day or coerce blank to today.

- **AC-S126-5** — R-F06-05 / BEH-S126-5, ARCH-S126-1 and ARCH-S126-2: Null, empty, malformed, impossible-date, and out-of-range fixtures render explicit unavailable/invalid states without throwing, silently normalizing, or changing stored evidence.

- **AC-S126-6** — R-F06-06 / BEH-S126-6, ARCH-S126-1 and ARCH-S126-2: The surface inventory names every found app-controlled formatter and its test. Historical message/form/receipt hashes remain unchanged; newly generated display variables use the convention.

- **AC-S126-7** — ARCH-S126-2, preservation gate: run the named existing checks and assert no unintended customer sends, source mutations, paid lookups, actor widening, historical-evidence rewrite, or new background work. F08 must remain paused where installed; missing optional dependencies do not disable unrelated work.
- **AC-S126-8** — Evidence gate: the final result separately reports engineering tests, deployed readback if performed, missing external inputs, provider-specific verification, and human meeting observations. No unrun result is PASS, and no fake-provider success is described as a live customer outcome.

**Forbidden actions / hard gates.**

No autonomous customer sends, synthetic production customers, browser-driven provider workarounds, new identities, expanded roles, new action keys, or unreviewed protected-path changes. Opening, filtering, sorting, copying, inspecting, and refreshing must not authorize a write or advance a renewal. Preserve exact human confirmation, durable attempts, receipts, readback, and explicit reconciliation for separately authorized effects. A saved status, draft, uploaded file, matching provider record, or passed test is not proof of a sent message, valid signature, or completed customer workflow.

F08 is the only approved policy change in this pack: pause operating-Sheet mutations while preserving reads. It does not turn off supported RentVine operations or erase historical Sheet receipts. This export itself changes no runtime setting, repository file, account, calendar event, or provider record.

**Dependencies / sequencing.**

Independent of provider activation and meetings. F04 reuses canonical dates; F09/F10/F12 consume the display convention while preserving their external data contracts.

**Standalone delivery contract.**

- **Deliverable now, in a later implementation task:** A shared display contract, exhaustive date tests, application surface inventory, updated app-controlled consumers, and unchanged-data evidence.
- **Consumes, but does not assume:** the exact source/configuration/cross-feature inputs above; missing or unverified values retain their explicit unavailable representation.
- **Externally blocked or deferred outcome:** Actual blank-template formatting requirements remain F10 inputs; they do not block application presentation.
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

Keep this specification independent of adjacent features until its own code/evidence and remaining dependencies are represented by current implementation contracts, tests, and facts. Preserve the original F06 approval mapping. Do not delete an external-input or meeting-validation gap merely because scaffolding passed. If existing behavior already meets part of the spec, link that evidence and merge only redundant explanatory prose—not acceptance coverage, history, or the user’s separate-feature boundary.
