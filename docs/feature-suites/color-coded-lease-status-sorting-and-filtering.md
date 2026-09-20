<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-meeting-readiness-2026-09 -->

# S134 — Color-coded lease status with matching sorting and filters

> **Approval reference:** F14 (original feature #14; added color/sort/filter feature linked to #3).
> **Status:** IMPLEMENTED and CI-GREEN at `136826cc` (2026-09-20); release deferred by the billing incident; no deployment, provider activation, or meeting validation has occurred. Serving evidence: `docs/facts.md` F-S134.
> **Export date:** 2026-09-18. **Repository baseline:** `d61eecf309fef75f5fe0a80f8f203c1d24c6804a`.
> **Registration:** S134 is a proposed allocation following the inspected S120 sequence, not a reservation or a claim of repository registration. Check for collisions on import, including the separately written F05 spec; preserve F14 when renumbering.
> **Classification:** New cross-lease presentation feature added to the approved Feature 3 discussion.

**Goal.**

Each renewal-table row has a small labeled lifecycle dot—green for complete, orange for upcoming, yellow for initiated non-renewal—and the same cycle-aware category drives sorting, filtering, counts, and workspace meaning.

**Core outcome alignment.**

C03 — A consistent status category controls what staff see, sort, and filter; C01/C02 — No hidden or falsely completed work. See suite outcome contract (from the 2026-09-18 export-pack index). This file is a standalone feature specification; the index coordinates shared ownership and does not combine implementation scope.

**Current state / intended end state.**

**Current evidence:** The desk already has derived overall status and manual staff-status filtering; S119 explicitly separates its annotation from completion/provider evidence. The user now requests small color indicators plus matching categories for sorting/filtering. Adding colors directly to existing loose annotations would falsely equate a staff label with an actual completed cycle.

**Required end state:** One deterministic, source-attributed lifecycle category is rendered as a dot plus visible text in the existing table. It is separate from readiness blockers and the saved staff-work label. F03 supplies notice evidence, F02 supplies current-cycle continuity, F01 supplies views, and F07 explains actions.

Current statements are grounded in the source map below at the pinned revision; they are not a fresh production readback. All new data shapes, labels, and defaults introduced here are proposed requirements unless explicitly identified as existing code or an owner decision.

**Actors and entry conditions.**

All authorized Renewals readers can see, sort, and filter. Category projection is read-only; ordinary staff status editing retains current permissions and cannot set provider evidence or lifecycle completion.

**What it is / how it functions.**

### R-F14-01 — Project one lifecycle category from real current evidence

Introduce one pure shared category projection over authorized lease identity, latest applicable cycle/outcome, current eligibility, and F03 disposition. Proposed categories are Complete, Non-renewal initiated, In progress, Upcoming, Later / outside current window, and Unknown — review. These are UI categories, not new provider statuses or a new workflow engine. A saved `complete_staff_status` label alone MUST NOT produce Complete.

### R-F14-02 — Define cycle-aware precedence and attribution

Use the latest applicable audited outcome: a completed applicable cycle is Complete with staff/provider attribution; an active confirmed non-renewal disposition is Non-renewal initiated; other unfinished current work is In progress. With no unfinished applicable cycle, existing due-window/periodic-review eligibility is Upcoming; a known later date is Later. A completed old cycle must not suppress a newly due cycle or a newer applicable move-out notice. If the relation is unverified/conflicting, use Unknown rather than guessing from timestamps or dates alone. F02 owns cycle continuity; F03 owns notice applicability.

### R-F14-03 — Apply the requested colors with explicit meaning

Render one small dot beside the visible category label in the renewal-status cell: Complete green, Upcoming orange, Non-renewal initiated yellow. Use existing semantic informational/neutral tokens for In progress, Later, and Unknown; no additional business priority is inferred from their hue. A completion label states staff-recorded versus independently verified where relevant. A green dot never asserts signatures, synchronization, or coverage beyond the underlying actual completion evidence.

### R-F14-04 — Keep readiness and staff annotations separate

Preserve the existing overall readiness/blocker and saved staff-work-status meanings and filters. Blocked is a separate readiness cue using the established critical/warning tokens, not a competing lifecycle category that hides upcoming/non-renewal. An intentional F08 pause is labeled as policy, not critical failure. Show unresolved provider reconciliation even beside a completed manual cycle; do not obscure it with a green dot.

### R-F14-05 — Sort by category, not CSS or independent guesses

Add a table-header lifecycle-status sort to the canonical query contract. Proposed stable default: ascending alphabetic order of the visible category labels, descending reverses that order; ties use the existing deterministic secondary date/lease-ID order, with unknown dates explicitly handled. Do not introduce an unapproved urgency ranking. Sort consumes the same category key rendered in the row, not a DOM class or translated color name.

### R-F14-06 — Filter and count the exact displayed categories

Add category filtering using the canonical bounded keys, with All and each category including Unknown. Combine with existing actor/owner/tenant/date/staff-status/readiness filters without changing their semantics; show chips and explained zero results. F01 Completed selects All leases plus Complete. Changing that category changes the named view consistently rather than leaving a false Completed heading. Counts use the same authorized snapshot, not a second query with different rules.

### R-F14-07 — Preserve accessible and effect-free interaction

The dot is decorative when the adjacent text supplies meaning; provide full accessible text for any compact variant. Do not require hover or color vision. Use current light/dark contrast, focus, keyboard sort, `aria-sort`, narrow-screen, zoom, and reduced-motion conventions. Sorting/filtering/pressing a label must never edit staff status, create a cycle, send a message, write a source, or call a paid service.

### R-F14-08 — Refresh categories atomically and preserve history

Project category, count, sort, filter membership, label, and evidence from one current data generation. A newer manual/source update recomputes the row consistently; an old response cannot restore a stale green state. Previous-cycle records and historical staff annotations remain intact and labeled; no migration overwrites them with a color/category string. When required evidence cannot be read, show Unknown or a clearly qualified last-known state, not an unqualified success dot.

**Data, state, and integration contract.**

No persistent color field and no duplicated authoritative status. Add a bounded read-only category key/label/provenance and optional cycle-relation explanation to the shared view model. Additive URL filter/sort parsing preserves existing bookmarks and drops invalid enum values using the current safe fallback. Source/annotation/cycle storage remains unchanged except any narrowly justified F02 correction.

**Failure, retry, cancellation, and concurrency.**

A failed source/cycle read cannot default to Complete or No move-out. Preserve last-known data only with visible freshness qualification, and filter unknown cases consistently. Conflicting selections yield an explained empty view; do not silently clear the user’s filters. Navigation preserves query/scroll context where current contracts support it.

**Agent and loop contract.**

The entry trigger is an explicit authorized user interaction or a later authorized implementation run, not file receipt, elapsed time, a model inference, or a meeting date. Inputs are the actual current source snapshot, app-owned state, reviewed configuration, and actor scope. Reads produce typed evidence/readiness; ordinary saves use existing audited state services; an external effect uses only its owning exact confirmed-action service. State changes are re-read before success is displayed. Cancelled undispatched actions have no effect; dispatched/ambiguous effects are reconciled, not blindly retried. No new background agent, worker, polling loop, or scheduler is created by this feature.

For F13, this contract applies to evidence gathering only: there is no application mutation loop. For F12, meeting preparation/observation does not execute the described customer actions. Future meetings, material receipt, and provider activation remain distinct from implementation termination.

**In scope / out of scope.**

In scope: one cycle-aware category projection, requested colors, semantic labels, stable sort, exact filtering/counts, and accessible table/workspace consistency. Out of scope: authorizing workflow transitions by clicking dots, new business-status automation, overriding F03 notice evidence, or replacing saved staff-work statuses.

**Open questions & assumptions.**

Explicit user colors: green/orange/yellow as stated. Nonblocking engineering choices: neutral/info presentation for the remaining categories and alphabetic category sort; these are declared defaults, not claims of user-selected priority. Reuse the existing eligibility window instead of inventing an “upcoming means 30/60/90 days” rule.

Unverified business/provider facts cannot be replaced by a plausible default. An explicitly labeled presentation/engineering default may be implemented within the approved scope; source semantics, policy applicability, legal wording, and provider permissions require their actual evidence. Missing input blocks only the dependent outcome identified below.

**Cross-product impacts.**

These are verified paths or explicitly marked candidate owners, not authorization to replace them:

- `lib/lease-renewal/desk-model.ts` and `lib/lease-renewal/live-desk.ts` — shared lifecycle/category projection and evidence.

- `lib/lease-renewal/workspace-state.ts` and `work-status.ts` — current-cycle outcome versus staff annotation.

- `lib/lease-renewal/desk-query-v2.ts` — additive category filter/sort and canonical URL state.

- `components/lease-renewal/RenewalDeskTable.tsx` and existing semantic theme/status components — one dot/label representation.

- Existing production-assurance desk/workspace projections and browser checks — independent category/count parity.

Update only affected current contracts and facts after verification. Existing historical evidence remains historical. Original approval numbers remain stable; any later S-number remap must update all namespaced acceptance and outcome references consistently.

**Authority and evidence map.**

| Source          | Location                                                                                                                            | What it supports and what it does not                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| U14             | User clarification on 2026-09-18                                                                                                    | Explicit green completed, orange upcoming, yellow initiated non-renewal dots with sortable/filterable categories.                                                 |
| T14             | Transcript 00:38:40; parsed lines 1414–1416                                                                                         | Earlier blocked/completed/advisory color discussion.                                                                                                              |
| R14             | `lib/lease-renewal/work-status.ts`; `lib/lease-renewal/desk-query-v2.ts`; `components/lease-renewal/RenewalDeskTable.tsx`           | Existing manual annotation and derived-status/filter contracts; do not collapse them into one truth field.                                                        |
| Shared baseline | `AGENTS.md`; `docs/facts.md`; `docs/loop-state.md`; `docs/feature-suites/TEMPLATE.md` at `d61eecf309fef75f5fe0a80f8f203c1d24c6804a` | Existing architecture/safety and document shape. The user’s latest approval controls new product scope; F08 expressly supersedes earlier enabled-Sheet execution. |

Transcript references use the supplied **Cherry Bridge + PMI: App Training, September 17, 2026** file and its conversation-parsed line numbers/timestamps. See source and decision log (from the 2026-09-18 export-pack evidence log) for filenames, source limitations, and conflicts. No raw customer details or secret values are reproduced here.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S134-1** — The owning boundaries listed above implement the data and state contract without a duplicate authoritative workflow, provider reader, or competing status model. A focused structural/service test or, for F13, a source-traceable assessment artifact demonstrates the named ownership and exact inputs/outputs.
- **ARCH-S134-2** — Actor scope, provenance/version binding, no-effect reads, explicit unavailable states, and existing effect/receipt boundaries remain enforced. Tests inject denied, missing, stale, conflicting, or interrupted evidence and assert the exact refusal/recovery described by each requirement.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S134-1** — R-F14-01: Project one lifecycle category from real current evidence. The observable result must satisfy AC-S134-1; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S134-2** — R-F14-02: Define cycle-aware precedence and attribution. The observable result must satisfy AC-S134-2; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S134-3** — R-F14-03: Apply the requested colors with explicit meaning. The observable result must satisfy AC-S134-3; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S134-4** — R-F14-04: Keep readiness and staff annotations separate. The observable result must satisfy AC-S134-4; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S134-5** — R-F14-05: Sort by category, not CSS or independent guesses. The observable result must satisfy AC-S134-5; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S134-6** — R-F14-06: Filter and count the exact displayed categories. The observable result must satisfy AC-S134-6; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S134-7** — R-F14-07: Preserve accessible and effect-free interaction. The observable result must satisfy AC-S134-7; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S134-8** — R-F14-08: Refresh categories atomically and preserve history. The observable result must satisfy AC-S134-8; a UI label alone is insufficient where a service/provider boundary is required.

**Human litmus outcome.**

### Color-coded lease status with matching sorting and filters

**If this was built correctly:** Staff immediately distinguish completed, upcoming, and non-renewal work from the dots and words, then sort or filter those same categories without seeing different classifications or accidentally changing any record.

- Model/engineering verdict: PASS in local engineering tests on `136826cc` (2026-09-20): AC-S134-1 through AC-S134-9 covered by the unit and component cases named in F-S134 (theme tokens asserted for both themes; keyboard, zoom and narrow-screen checks rely on the existing table conventions and the compiled browser checks, which are NOT RUN while rehearsal auth is blocked); no deployed readback.
- Human verdict: NOT RUN — no human observer.
- Any later human observation is recorded independently of implementation and provider verification.

**Requirement-to-outcome traceability.**

| Requirement | Owning boundary                                       | Architecture             | Behavior   | Acceptance / test scenario                                           |
| ----------- | ----------------------------------------------------- | ------------------------ | ---------- | -------------------------------------------------------------------- |
| R-F14-01    | shared lifecycle projection                           | ARCH-S134-1, ARCH-S134-2 | BEH-S134-1 | AC-S134-1: Project one lifecycle category from real current evidence |
| R-F14-02    | F02 cycle state / F03 disposition / category resolver | ARCH-S134-1, ARCH-S134-2 | BEH-S134-2 | AC-S134-2: Define cycle-aware precedence and attribution             |
| R-F14-03    | table status component / semantic theme               | ARCH-S134-1, ARCH-S134-2 | BEH-S134-3 | AC-S134-3: Apply the requested colors with explicit meaning          |
| R-F14-04    | F07 guidance / existing readiness / work-status       | ARCH-S134-1, ARCH-S134-2 | BEH-S134-4 | AC-S134-4: Keep readiness and staff annotations separate             |
| R-F14-05    | desk-query-v2 / category labels                       | ARCH-S134-1, ARCH-S134-2 | BEH-S134-5 | AC-S134-5: Sort by category, not CSS or independent guesses          |
| R-F14-06    | desk-query-v2 / F01 views                             | ARCH-S134-1, ARCH-S134-2 | BEH-S134-6 | AC-S134-6: Filter and count the exact displayed categories           |
| R-F14-07    | table / shared interaction components                 | ARCH-S134-1, ARCH-S134-2 | BEH-S134-7 | AC-S134-7: Preserve accessible and effect-free interaction           |
| R-F14-08    | shared projection / freshness / assurance             | ARCH-S134-1, ARCH-S134-2 | BEH-S134-8 | AC-S134-8: Refresh categories atomically and preserve history        |

Every acceptance scenario below is a required test or evidence deliverable, not a reported pass. For unaffected already-implemented behavior, retain the existing test as preservation evidence rather than duplicating it.

**Preservation set.**

S119 staff annotation semantics; real manual/provider completion distinctions; S82 query/navigation/accessibility; F01 full visibility; F02 retained cycles; F03 non-renewal evidence; F08 pause.

Keep preservation results separate from new-feature results. Passing one does not compensate for failing the other.

**Adversarial acceptance checks.**

- **AC-S134-1** — R-F14-01 / BEH-S134-1, ARCH-S134-1 and ARCH-S134-2: A partition fixture includes every category exactly once per lease; tenant acceptance or a green-sounding staff annotation without cycle closure never yields Complete.

- **AC-S134-2** — R-F14-02 / BEH-S134-2, ARCH-S134-1 and ARCH-S134-2: Old complete plus a newly due later cycle becomes Upcoming; unfinished work after advanced dates stays In progress; a current initiated notice becomes Non-renewal; a truly closed non-renewal handoff is Complete with a “Non-renewal handoff completed” qualifier; conflicting cycle relation is Unknown.

- **AC-S134-3** — R-F14-03 / BEH-S134-3, ARCH-S134-1 and ARCH-S134-2: Rendered completed/upcoming/non-renewal fixtures use the requested semantic colors and visible labels in both themes; a staff-recorded completed cycle is explicitly attributed and not labeled provider-verified.

- **AC-S134-4** — R-F14-04 / BEH-S134-4, ARCH-S134-1 and ARCH-S134-2: A completed manual cycle with an unresolved historical provider attempt shows both truthful completion attribution and the independent recovery issue. An upcoming blocked lease stays Upcoming with a separate blocked cue.

- **AC-S134-5** — R-F14-05 / BEH-S134-5, ARCH-S134-1 and ARCH-S134-2: Ascending/descending tests produce deterministic category groups with stable ties across refresh and source row reorder. The order is not affected by changing a theme token or date display string.

- **AC-S134-6** — R-F14-06 / BEH-S134-6, ARCH-S134-1 and ARCH-S134-2: Filtering Non-renewal returns exactly rows with that primary label; Unknown remains reachable. Completed finds eligible completed rows outside the active window. Combined filters, clear/reset, and counts remain consistent.

- **AC-S134-7** — R-F14-07 / BEH-S134-7, ARCH-S134-1 and ARCH-S134-2: Keyboard, screen-reader, no-color, light/dark, narrow, and zoom checks expose category and sort state. Provider/mutation spies remain zero for all table interactions.

- **AC-S134-8** — R-F14-08 / BEH-S134-8, ARCH-S134-1 and ARCH-S134-2: Out-of-order refresh, lost source read, reopened cycle, withdrawn notice, and previous-cycle annotation fixtures keep desk/workspace/filter parity without changing stored evidence.

- **AC-S134-9** — ARCH-S134-2, preservation gate: run the named existing checks and assert no unintended customer sends, source mutations, paid lookups, actor widening, historical-evidence rewrite, or new background work. F08 must remain paused where installed; missing optional dependencies do not disable unrelated work.
- **AC-S134-10** — Evidence gate: the final result separately reports engineering tests, deployed readback if performed, missing external inputs, provider-specific verification, and human meeting observations. No unrun result is PASS, and no fake-provider success is described as a live customer outcome.

**Forbidden actions / hard gates.**

No autonomous customer sends, synthetic production customers, browser-driven provider workarounds, new identities, expanded roles, new action keys, or unreviewed protected-path changes. Opening, filtering, sorting, copying, inspecting, and refreshing must not authorize a write or advance a renewal. Preserve exact human confirmation, durable attempts, receipts, readback, and explicit reconciliation for separately authorized effects. A saved status, draft, uploaded file, matching provider record, or passed test is not proof of a sent message, valid signature, or completed customer workflow.

F08 is the only approved policy change in this pack: pause operating-Sheet mutations while preserving reads. It does not turn off supported RentVine operations or erase historical Sheet receipts. This export itself changes no runtime setting, repository file, account, calendar event, or provider record.

**Dependencies / sequencing.**

F02 supplies current applicable cycle truth; F03 supplies confirmed/manual/unknown disposition; F01 consumes categories for views; F07 handles reasons/actions. Implement/test the pure projection with contract fixtures independently, then verify all consumers against the same version.

**Standalone delivery contract.**

- **Deliverable now, in a later implementation task:** The deterministic category contract, single accessible status component, additive query/filter/sort integration, and cycle/source/role/refresh parity tests.
- **Consumes, but does not assume:** the exact source/configuration/cross-feature inputs above; missing or unverified values retain their explicit unavailable representation.
- **Externally blocked or deferred outcome:** F03 automatic provider-disposition mapping remains conditional until verified; manual/app evidence and explicit unknown cases must still render/filter correctly.
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

Keep this specification independent of adjacent features until its own code/evidence and remaining dependencies are represented by current implementation contracts, tests, and facts. Preserve the original F14 approval mapping. Do not delete an external-input or meeting-validation gap merely because scaffolding passed. If existing behavior already meets part of the spec, link that evidence and merge only redundant explanatory prose—not acceptance coverage, history, or the user’s separate-feature boundary.
