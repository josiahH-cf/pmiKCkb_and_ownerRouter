<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-meeting-readiness-2026-09 -->

# S122 — All-lease visibility and explicit worklist views

> **Approval reference:** F01 (original feature #1).
> **Status:** SPECIFICATION ONLY — scope approved; no implementation, deployment, provider activation, or meeting validation performed by this export.
> **Export date:** 2026-09-18. **Repository baseline:** `d61eecf309fef75f5fe0a80f8f203c1d24c6804a`.
> **Registration:** S122 is a proposed allocation following the inspected S120 sequence, not a reservation or a claim of repository registration. Check for collisions on import, including the separately written F05 spec; preserve F01 when renumbering.
> **Classification:** Enhancement of the existing renewal desk.

**Goal.**

A renewal operator can find, inspect, and return to any lease supplied by the authorized RentVine read, including future-dated and completed leases, without confusing a filtered worklist with the full portfolio.

**Core outcome alignment.**

C01 — Discover every available authorized lease; C02 — Resume work without losing context. See suite outcome contract (from the 2026-09-18 export-pack index). This file is a standalone feature specification; the index coordinates shared ownership and does not combine implementation scope.

**Current state / intended end state.**

**Current evidence:** The existing desk reads a paginated lease export and supports `scope=active`, `tracked`, `all`, and `periodic_review`. The current default is active; “All loaded leases” already exists. The transcript demonstrates a discoverability/scope problem after dates were advanced, not proof that three records were absent from the provider export. Current routes, opaque party keys, stable lease identity, and inspection-only boundaries are retained.

**Required end state:** The canonical desk exposes obvious All leases, Active / upcoming, and Completed views with truthful scope/counts and exact return-state preservation. A future date never prevents inspection. This feature does not start a renewal or decide its completion.

Current statements are grounded in the source map below at the pinned revision; they are not a fresh production readback. All new data shapes, labels, and defaults introduced here are proposed requirements unless explicitly identified as existing code or an owner decision.

**Actors and entry conditions.**

Readers with Renewals access can inspect and use views. Existing Editor/Approver/Admin roles retain their separate work and external-effect permissions. Every query is scoped to the authenticated actor before counts, facets, or data are returned.

**What it is / how it functions.**

### R-F01-01 — One complete accessible lease inventory

All leases MUST include each lease once from the complete, authorized provider result available to the app, regardless of renewal-window membership, future year, staff status, or completed cycle. Source identities, not names/addresses, determine uniqueness. Missing optional Sheet/rent/notice data MUST not remove a known lease. A provider error or incomplete page set MUST display incomplete coverage; “all” describes scope, not guaranteed historical-provider coverage.

### R-F01-02 — Explicit views and predictable defaults

Expose All leases, Active / upcoming, and Completed as table-owned view controls on the existing desk, not a second independently loaded inventory. Keep the current active default for compatibility; show a persistent, obvious All leases option. Active / upcoming reuses the existing window/periodic-review rules plus F02 retained work. Completed uses F14’s cycle-aware completion category, not the loose `complete_staff_status` annotation. Existing tracked and periodic-review bookmarks remain supported.

### R-F01-03 — Filters and counts explain exclusions

View selection MUST preserve non-scope owner/tenant/location filters and disclose the active filter chips. Completed sets the completion filter across All leases so completed records outside the active window are reachable. Show loaded-source count, selected-scope count, and matching count with availability cues. Zero matches MUST offer clear filters or All leases without claiming the lease does not exist. Do not leak counts for unauthorized records.

### R-F01-04 — Inspection independent of workflow eligibility

A stable, authorized lease outside the current window MUST open a lease-information inspection path through the canonical workspace. Unsupported workflow controls remain visibly unavailable with a reason; do not create an active cycle, owner decision, or write proposal on open. Where existing route guards only permit actionable/tracked rows, extend the read-only inspection outcome rather than pretending every lease is actionable.

### R-F01-05 — Navigation and chronological behavior

Preserve full canonical view/filter/sort state on lease open, Back to renewals, browser Back/Forward, and shared bookmarks. Continue sorting underlying dates rather than F06 display strings. Unknown dates remain explicitly unknown and sort deterministically. Party filters retain opaque tokens; no customer names/emails are inserted in URLs.

### R-F01-06 — No false deletion or silent archival

A stale or failed refresh MUST distinguish last-known information from a successful empty result. A lease that was previously visible but is absent from a fresh provider response MUST not be reported completed or deleted by inference. All-source history retrieval beyond the current provider contract is a bounded investigation, not an invented archive API or a bulk backfill.

**Data, state, and integration contract.**

Use one server-owned desk projection and additive URL state only. Reuse `scope=all`; add only the view/category encoding required after checking the current parser. UI selection has no durable business effect. Do not add a duplicate lease collection or a browser-only dataset that escapes access checks.

**Failure, retry, cancellation, and concurrency.**

Canceling or navigating away from a read does not persist work. Out-of-order filter responses must not overwrite the latest query. Refresh failure must not erase an existing work record. Unknown provider archival coverage is surfaced in the coverage explanation.

**Agent and loop contract.**

The entry trigger is an explicit authorized user interaction or a later authorized implementation run, not file receipt, elapsed time, a model inference, or a meeting date. Inputs are the actual current source snapshot, app-owned state, reviewed configuration, and actor scope. Reads produce typed evidence/readiness; ordinary saves use existing audited state services; an external effect uses only its owning exact confirmed-action service. State changes are re-read before success is displayed. Cancelled undispatched actions have no effect; dispatched/ambiguous effects are reconciled, not blindly retried. No new background agent, worker, polling loop, or scheduler is created by this feature.

For F13, this contract applies to evidence gathering only: there is no application mutation loop. For F12, meeting preparation/observation does not execute the described customer actions. Future meetings, material receipt, and provider activation remain distinct from implementation termination.

**In scope / out of scope.**

In scope: inventory visibility, table-owned views, accurate counts, inspection access, and navigation. Out of scope: new historical export APIs, creating missing RentVine leases, importing the operating Sheet as a separate lease identity source, retention policy changes, or changing existing eligibility windows.

**Open questions & assumptions.**

Nonblocking presentation default: retain the existing active landing view while making All leases explicit. External completeness limitation: the provider’s treatment of archived/terminated/deleted records has not been verified here; investigate only if a requested record is absent from the complete existing export. Do not promise inaccessible provider history.

Unverified business/provider facts cannot be replaced by a plausible default. An explicitly labeled presentation/engineering default may be implemented within the approved scope; source semantics, policy applicability, legal wording, and provider permissions require their actual evidence. Missing input blocks only the dependent outcome identified below.

**Cross-product impacts.**

These are verified paths or explicitly marked candidate owners, not authorization to replace them:

- `lib/lease-renewal/desk-query-v2.ts` — canonical query parsing, serialization, filters, and sort.

- `lib/lease-renewal/live-desk.ts` and `lib/lease-renewal/desk-model.ts` — authorized source projection and retention.

- `components/lease-renewal/RenewalDesk.tsx` and `components/lease-renewal/RenewalDeskTable.tsx` — desk views, counts, and links.

- `scripts/smoke-renewal-desk-browser.mjs` — existing desk navigation/source-parity preservation.

Update only affected current contracts and facts after verification. Existing historical evidence remains historical. Original approval numbers remain stable; any later S-number remap must update all namespaced acceptance and outcome references consistently.

**Authority and evidence map.**

| Source          | Location                                                                                                                            | What it supports and what it does not                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T01             | Transcript 00:31:37–00:36:04; parsed lines 1216–1356                                                                                | Missing-record report, recognition of advanced dates, and explicit all-leases versus active/upcoming views.                                                       |
| U01             | User approval on 2026-09-18                                                                                                         | Feature 1 approved as a standalone specification.                                                                                                                 |
| R01             | `lib/lease-renewal/desk-query-v2.ts`; `lib/lease-renewal/live-desk.ts`; `components/lease-renewal/RenewalDeskTable.tsx`             | Existing query contract, retention projection, and All loaded leases control; code evidence, not a new live completeness assertion.                               |
| Shared baseline | `AGENTS.md`; `docs/facts.md`; `docs/loop-state.md`; `docs/feature-suites/TEMPLATE.md` at `d61eecf309fef75f5fe0a80f8f203c1d24c6804a` | Existing architecture/safety and document shape. The user’s latest approval controls new product scope; F08 expressly supersedes earlier enabled-Sheet execution. |

Transcript references use the supplied **Cherry Bridge + PMI: App Training, September 17, 2026** file and its conversation-parsed line numbers/timestamps. See source and decision log (from the 2026-09-18 export-pack evidence log) for filenames, source limitations, and conflicts. No raw customer details or secret values are reproduced here.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S122-1** — The owning boundaries listed above implement the data and state contract without a duplicate authoritative workflow, provider reader, or competing status model. A focused structural/service test or, for F13, a source-traceable assessment artifact demonstrates the named ownership and exact inputs/outputs.
- **ARCH-S122-2** — Actor scope, provenance/version binding, no-effect reads, explicit unavailable states, and existing effect/receipt boundaries remain enforced. Tests inject denied, missing, stale, conflicting, or interrupted evidence and assert the exact refusal/recovery described by each requirement.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S122-1** — R-F01-01: One complete accessible lease inventory. The observable result must satisfy AC-S122-1; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S122-2** — R-F01-02: Explicit views and predictable defaults. The observable result must satisfy AC-S122-2; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S122-3** — R-F01-03: Filters and counts explain exclusions. The observable result must satisfy AC-S122-3; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S122-4** — R-F01-04: Inspection independent of workflow eligibility. The observable result must satisfy AC-S122-4; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S122-5** — R-F01-05: Navigation and chronological behavior. The observable result must satisfy AC-S122-5; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S122-6** — R-F01-06: No false deletion or silent archival. The observable result must satisfy AC-S122-6; a UI label alone is insufficient where a service/provider boundary is required.

**Human litmus outcome.**

### All-lease visibility and explicit worklist views

**If this was built correctly:** An operator who cannot find a lease switches to All leases, finds it despite an advanced date, opens its details, and returns to the exact filtered table without starting or completing work.

- Model/engineering verdict: NOT RUN — this export specifies checks; it does not execute application tests or claim their results.
- Human verdict: NOT RUN — no human observer.
- Any later human observation is recorded independently of implementation and provider verification.

**Requirement-to-outcome traceability.**

| Requirement | Owning boundary                         | Architecture             | Behavior   | Acceptance / test scenario                                |
| ----------- | --------------------------------------- | ------------------------ | ---------- | --------------------------------------------------------- |
| R-F01-01    | live-desk / desk-model                  | ARCH-S122-1, ARCH-S122-2 | BEH-S122-1 | AC-S122-1: One complete accessible lease inventory        |
| R-F01-02    | desk-query-v2 / F14 category projection | ARCH-S122-1, ARCH-S122-2 | BEH-S122-2 | AC-S122-2: Explicit views and predictable defaults        |
| R-F01-03    | desk-query-v2 / desk table              | ARCH-S122-1, ARCH-S122-2 | BEH-S122-3 | AC-S122-3: Filters and counts explain exclusions          |
| R-F01-04    | desk/workspace route owners             | ARCH-S122-1, ARCH-S122-2 | BEH-S122-4 | AC-S122-4: Inspection independent of workflow eligibility |
| R-F01-05    | desk-query-v2 / workspace return links  | ARCH-S122-1, ARCH-S122-2 | BEH-S122-5 | AC-S122-5: Navigation and chronological behavior          |
| R-F01-06    | live-desk / live-lease-cache            | ARCH-S122-1, ARCH-S122-2 | BEH-S122-6 | AC-S122-6: No false deletion or silent archival           |

Every acceptance scenario below is a required test or evidence deliverable, not a reported pass. For unaffected already-implemented behavior, retain the existing test as preservation evidence rather than duplicating it.

**Preservation set.**

Existing S82/S104 desk/workspace parity, S116 identity/source links, query-v2 parsing, opaque owner/tenant links, source completeness checks, and compiled desk browser coverage.

Keep preservation results separate from new-feature results. Passing one does not compensate for failing the other.

**Adversarial acceptance checks.**

- **AC-S122-1** — R-F01-01 / BEH-S122-1, ARCH-S122-1 and ARCH-S122-2: A multi-page fixture containing future, completed, month-to-month, missing-Sheet, and duplicate-name leases yields exactly the expected unique lease IDs. An interrupted page read never reports full coverage.

- **AC-S122-2** — R-F01-02 / BEH-S122-2, ARCH-S122-1 and ARCH-S122-2: A first load retains the current active semantics, one action opens the full set, and Completed excludes a tenant-accepted-but-unsigned cycle and an unsubstantiated staff-status label.

- **AC-S122-3** — R-F01-03 / BEH-S122-3, ARCH-S122-1 and ARCH-S122-2: Combining a future-year location query with the active view yields an explained empty result; switching to All leases finds the same lease. Counts reconcile with the visible rows and remain actor-scoped.

- **AC-S122-4** — R-F01-04 / BEH-S122-4, ARCH-S122-1 and ARCH-S122-2: Opening a lease dated several years ahead displays known facts and exact source destinations, while spies show zero cycle creation, writes, Gmail calls, or paid comp requests.

- **AC-S122-5** — R-F01-05 / BEH-S122-5, ARCH-S122-1 and ARCH-S122-2: A filtered and reverse-date-sorted future lease opens and returns to the same table state; malformed URL values fall back without widening actor access.

- **AC-S122-6** — R-F01-06 / BEH-S122-6, ARCH-S122-1 and ARCH-S122-2: A read failure retains an explicit availability state, whereas a confirmed fresh absence is labeled source-unavailable and does not fabricate completion/history.

- **AC-S122-7** — ARCH-S122-2, preservation gate: run the named existing checks and assert no unintended customer sends, source mutations, paid lookups, actor widening, historical-evidence rewrite, or new background work. F08 must remain paused where installed; missing optional dependencies do not disable unrelated work.
- **AC-S122-8** — Evidence gate: the final result separately reports engineering tests, deployed readback if performed, missing external inputs, provider-specific verification, and human meeting observations. No unrun result is PASS, and no fake-provider success is described as a live customer outcome.

**Forbidden actions / hard gates.**

No autonomous customer sends, synthetic production customers, browser-driven provider workarounds, new identities, expanded roles, new action keys, or unreviewed protected-path changes. Opening, filtering, sorting, copying, inspecting, and refreshing must not authorize a write or advance a renewal. Preserve exact human confirmation, durable attempts, receipts, readback, and explicit reconciliation for separately authorized effects. A saved status, draft, uploaded file, matching provider record, or passed test is not proof of a sent message, valid signature, or completed customer workflow.

F08 is the only approved policy change in this pack: pause operating-Sheet mutations while preserving reads. It does not turn off supported RentVine operations or erase historical Sheet receipts. This export itself changes no runtime setting, repository file, account, calendar event, or provider record.

**Dependencies / sequencing.**

Consumes F02 retained-work semantics and F14 cycle categories when present; tests can inject those documented contracts. F01 owns view controls and membership presentation, not lifecycle classification. No circular dependency: F14 is a pure projection over existing cycle evidence and can be developed independently.

**Standalone delivery contract.**

- **Deliverable now, in a later implementation task:** The view/inspection/count/query slice and controlled fixtures can be completed without a live customer walkthrough. Integrated membership is accepted only after F02/F14 contract tests also pass.
- **Consumes, but does not assume:** the exact source/configuration/cross-feature inputs above; missing or unverified values retain their explicit unavailable representation.
- **Externally blocked or deferred outcome:** Provider historical coverage beyond the current export, if needed. No requirement to change that provider behavior is implied.
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

Keep this specification independent of adjacent features until its own code/evidence and remaining dependencies are represented by current implementation contracts, tests, and facts. Preserve the original F01 approval mapping. Do not delete an external-input or meeting-validation gap merely because scaffolding passed. If existing behavior already meets part of the spec, link that evidence and merge only redundant explanatory prose—not acceptance coverage, history, or the user’s separate-feature boundary.
