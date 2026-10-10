<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S203 — Authorized global entity search index

> Status: READY — finalized authoring contract; not implemented, queued, activated or released by this specification. Execution requires explicit owner direction under the existing native loop.

**Goal.**

Find authorized application records by partial names, addresses and identifiers from one consistent search service.

**Current state / intended end state.**

Current: The app has domain-specific list filtering and maintenance UnitTypeahead backed by lib/maintenance/unit-index.ts and /api/maintenance/units/search. That endpoint is maintenance/edit-gated and is not a general read-search contract. There is no global entity index or header search in AppShell.

Intended: A bounded global search covers leases, owners, residents, properties/units, maintenance tickets and approved vendors, using current canonical IDs, relation context and existing visibility rules. It supports case-insensitive partial matching and typed filters with current result routes.

The current implementation baseline was inspected in the clean WSL main checkout at
`43bad3adc7777ea035bc70eb8d2bee913427c810`; production readback identified the October 8
serving revision `pmi-kc-app-rmuz9g28p-0a2909d490e1` at
`337ac163c5709381e8db8d2c18810bec357d8a96`. The Windows authoring checkout is older and contains
unrelated work. Re-verify the implementation checkout and live state before execution; these
observations do not authorize copying/resetting either checkout or rerunning completed proofs.

**Actors and entry conditions.**

Authorized managed PMI staff use their existing roles and record/Space scope. Admin manages
organization configuration where stated; business titles do not confer permissions. Vendors are
restricted to their explicit assigned work where a suite enables it. The runner may author this
contract now and may implement only under a later explicit execution instruction. Real source
identities and unavailable provider/configuration inputs must remain distinguishable from local
working data and deterministic test fixtures.

**What it is / how it functions.**

A bounded global search covers leases, owners, residents, properties/units, maintenance tickets and approved vendors, using current canonical IDs, relation context and existing visibility rules. It supports case-insensitive partial matching and typed filters with current result routes. Each requirement below is independently falsifiable; implementation must satisfy the
structural obligation and the observed behavior, including the named failure/alternate cases.

**In scope / out of scope.**

Entity metadata search and relation context. Excludes full Gmail bodies, private AI chat bodies, raw provider transcripts, secrets, unrestricted document/full-text search and inaccessible records.

**Open questions & assumptions.**

No product blocker. Actual index technology, storage and measured limits are implementation choices based on current scale; the index must satisfy bounded queries, freshness and access rules without invented latency SLAs.

**Cross-product impacts.**

- components/layout/AppShell.tsx; components/maintenance/UnitTypeahead.tsx.
- lib/maintenance/unit-index.ts and existing source-backed domain projections.
- Lease/person/property/unit, maintenance and approved vendor read services; new owning search service/route chosen during implementation.

These are evidence-grounded owning areas, not an instruction to create an invented file/schema.
Use the current owning service when the implementation checkout differs.

**Authority and evidence map.**

| Input                                                                              | Classification                                | Use and limitation                                                                                                                         |
| ---------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Router; current committed source/tests; fresh readback                             | Current authority and implementation evidence | Establish current boundaries and starting state; authoring changes no live key, role, setting or provider state.                           |
| October 8 meeting/PDF/images and October 9 owner corrections in this clarification | Confirmed product intent                      | Establish the desired behavior in the requirement rows. New explicit corrections govern; historical screenshots are not operational proof. |
| Existing native suites and actual provider contracts                               | Compatibility and integration evidence        | Reuse delivered behavior and exact provider semantics; absent inputs do not become assumed capabilities.                                   |
| WSL baseline and October 8 serving identity above                                  | Bounded observation                           | Prevent stale Windows code from being mistaken for current implementation; re-verify before execution.                                     |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S203-1** — Build typed records from owning read projections with stable ID, display name/address/reference, source freshness and destination; retain distinct entities and relation edges.
- **ARCH-S203-2** — Normalize case/whitespace and apply literal substring matching to supported fields; multiple entered terms must all match searchable metadata of the same entity or its explicitly labeled relation context.
- **ARCH-S203-3** — Resolve the actor’s current domain/Space/assignment permissions server-side on every query and hydrate visible canonical entities before delivery; isolate any cache by actor scope.
- **ARCH-S203-4** — Incrementally refresh metadata/associations from owning stores, reconcile deletes/access changes and hydrate selected results; expose partial/unavailable sources rather than false comprehensive absence.
- **ARCH-S203-5** — Use server-side result limits/pagination and deterministic ordering, a recoverable index build/rebuild and query cancellation; do not fan out unbounded live provider calls on keystrokes.
- **ARCH-S203-6** — Return result type, stable identity, matched field/relation, authorized summary and canonical destination, separating autocomplete from Enter results filters.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S203-1** — Index the supported entity metadata and authorized relationships. A lease, owner, resident, unit/property, ticket and approved vendor can be found by their real metadata; missing associations remain unknown instead of name-based guesses.
- **BEH-S203-2** — Match partial case-insensitive terms consistently. ABC finds metadata containing abc; Miller finds matching people/leases; East 1 includes East 123 and East 168; punctuation is treated as text and cannot become executable query syntax.
- **BEH-S203-3** — Enforce access before returning any result, snippet or count. A user denied a ticket/vendor record cannot infer it through suggestions, totals or old cache. Permission removal takes effect on subsequent searches.
- **BEH-S203-4** — Keep index lifecycle and stale results honest. An edited name/address is searchable after the owning update/index reconciliation; stale/deleted records cannot navigate to another identity. A source failure displays partial results with its limitation.
- **BEH-S203-5** — Bound large searches and index recovery. A large fixture remains bounded with stable next pages and no duplicate/omitted equal-label IDs; failed rebuild does not expose incomplete results as complete.
- **BEH-S203-6** — Provide a reusable typed contract for header and full results. S204 displays consistent suggestions/results and type filters without separate matching logic or leaking excluded body content.

**Human litmus outcome.**

### Authorized global entity search index

**If this was built correctly:** Find authorized application records by partial names, addresses and identifiers from one consistent search service. A staff operator can carry out the primary journey,
understand the stated pending/failure states and recover without silently losing work or creating a
duplicate effect. The implementation evidence must exercise the specific scenarios in every row.

- Model verdict: ENGINEERING VERIFIED / DELIVERED — all mapped engineering scopes and independent deployment verified in run 5b3dfb90 /780f48db; exact CI, full observation, eleven readbacks and mobile scope are recorded in the native ledger. Human NOT RUN; no customer send was test proof.
  with evidence after execution.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                                                 | Architecture outcome | Behavior outcome | Human litmus                          | Deterministic evidence / falsification                                                                                                                                                                                    |
| --------------------------------------------------------------------------- | -------------------- | ---------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S203-1: Index the supported entity metadata and authorized relationships. | `ARCH-S203-1`        | `BEH-S203-1`     | Authorized global entity search index | `AC-S203-1`: A lease, owner, resident, unit/property, ticket and approved vendor can be found by their real metadata; missing associations remain unknown instead of name-based guesses.                                  |
| R-S203-2: Match partial case-insensitive terms consistently.                | `ARCH-S203-2`        | `BEH-S203-2`     | Authorized global entity search index | `AC-S203-2`: ABC finds metadata containing abc; Miller finds matching people/leases; East 1 includes East 123 and East 168; punctuation is treated as text and cannot become executable query syntax.                     |
| R-S203-3: Enforce access before returning any result, snippet or count.     | `ARCH-S203-3`        | `BEH-S203-3`     | Authorized global entity search index | `AC-S203-3`: A user denied a ticket/vendor record cannot infer it through suggestions, totals or old cache. Permission removal takes effect on subsequent searches.                                                       |
| R-S203-4: Keep index lifecycle and stale results honest.                    | `ARCH-S203-4`        | `BEH-S203-4`     | Authorized global entity search index | `AC-S203-4`: An edited name/address is searchable after the owning update/index reconciliation; stale/deleted records cannot navigate to another identity. A source failure displays partial results with its limitation. |
| R-S203-5: Bound large searches and index recovery.                          | `ARCH-S203-5`        | `BEH-S203-5`     | Authorized global entity search index | `AC-S203-5`: A large fixture remains bounded with stable next pages and no duplicate/omitted equal-label IDs; failed rebuild does not expose incomplete results as complete.                                              |
| R-S203-6: Provide a reusable typed contract for header and full results.    | `ARCH-S203-6`        | `BEH-S203-6`     | Authorized global entity search index | `AC-S203-6`: S204 displays consistent suggestions/results and type filters without separate matching logic or leaking excluded body content.                                                                              |

**Preservation set.**

Existing read permissions/Spaces, vendor-assignment isolation, stable IDs and canonical routes, current list filters and source completeness distinctions. Global read search never grants edit permission. Record these as a separate gate, not an average with new feature checks.

**Adversarial acceptance checks.**

- **AC-S203-1** — Falsify `ARCH-S203-1` / `BEH-S203-1`: A lease, owner, resident, unit/property, ticket and approved vendor can be found by their real metadata; missing associations remain unknown instead of name-based guesses.
- **AC-S203-2** — Falsify `ARCH-S203-2` / `BEH-S203-2`: ABC finds metadata containing abc; Miller finds matching people/leases; East 1 includes East 123 and East 168; punctuation is treated as text and cannot become executable query syntax.
- **AC-S203-3** — Falsify `ARCH-S203-3` / `BEH-S203-3`: A user denied a ticket/vendor record cannot infer it through suggestions, totals or old cache. Permission removal takes effect on subsequent searches.
- **AC-S203-4** — Falsify `ARCH-S203-4` / `BEH-S203-4`: An edited name/address is searchable after the owning update/index reconciliation; stale/deleted records cannot navigate to another identity. A source failure displays partial results with its limitation.
- **AC-S203-5** — Falsify `ARCH-S203-5` / `BEH-S203-5`: A large fixture remains bounded with stable next pages and no duplicate/omitted equal-label IDs; failed rebuild does not expose incomplete results as complete.
- **AC-S203-6** — Falsify `ARCH-S203-6` / `BEH-S203-6`: S204 displays consistent suggestions/results and type filters without separate matching logic or leaking excluded body content.

**Forbidden actions / hard gates.**

This authoring request does not implement, commit, push, deploy, activate, send or mutate provider
records. Keep secrets, raw Gmail/customer bodies, credentials and private evidence outside Git.
Do not invent source IDs, recipient addresses, owner agreements, financial authority, provider
capabilities or human verdicts. Preserve current runtime boundaries until the specifically requested
governance contract is implemented under execution authority. A future named-program execution
instruction carries its approved scope through the existing delivery phases; it does not grant an
unrelated identity, cost, security, provider action or historical proof rerun.

**Dependencies / sequencing.**

S204 consumes the service. Reuse autocomplete patterns but not maintenance-only permissions or guessed record routes. S209 durable associations and S211 vendor visibility can extend records through their explicit contracts.

**Standalone delivery contract.**

- **Deliverable now:** A future authorized implementation can produce the complete bounded
  behavior, migration/refusal/recovery paths, tests and documentation for the requirements above.
  This authoring deliverable is the finalized registered specification only.
- **Consumes, but does not assume:** Neighboring projections and actual runtime inputs named above;
  unavailable values remain explicitly unset/blocked, never fabricated.
- **Externally blocked effect:** Missing actual provider connection, capability, exact activation or
  reviewed operational input blocks only its named effect. Record the affected acceptance case;
  complete independent behavior and do not call the whole suite operationally complete prematurely.
- **Produces for downstream suites:** The stated behavior, stable owning-service contracts and
  separate architecture, behavior, preservation and integration evidence.

**Verification and delivery contract.**

1. Re-verify current source/live state and the existing preservation checks before implementation.
   Materialize an expected-failing check for each missing requirement; already delivered behavior
   gets a passing preservation baseline, not a manufactured failure.
2. Verify each `ARCH-S203-*`, `BEH-S203-*` and `AC-S203-*` scenario, including the row's failure,
   boundary and recovery case. Use compiled browser checks for material UI journeys and backend
   tests for real access/intent/persistence boundaries; adapter tests do not prove live effects.
3. Run the native canonical verification and authoring/reference checks required by the affected
   slice. Run `bash scripts/verify.sh` for implementation delivery, inspect the mechanical diff and
   preserve privacy, exact provider gates and unrelated work. No deployment is part of authoring.
4. Report `ALL_GATES_GREEN` only for the actual verified scope; `BUDGET_EXHAUSTED` only when an
   explicit budget exists; or `BLOCKED` for an exact unresolved input/authority after independent
   work is complete. Keep code readiness, live proof and human observation separately truthful.

**Ordered prompt sequence.**

1. Read this contract, S183 and its named dependencies; verify the real source and baseline.
2. Establish each architecture/behavior falsification and the independent preservation gate.
3. Implement the bounded owning-service and UI changes with recovery/migration as required.
4. Exercise all requirement rows, verify integration and report exact readiness/limitations.
5. Update the existing native state/evidence only during authorized implementation; deliver through
   the existing process only when the owner has explicitly instructed execution.

**Deletion/merge recommendation.**

Do not retire this unimplemented suite. After verified delivery, consolidate only when each
requirement, preservation obligation and remaining dependency has a current code/test/fact owner;
retain historical failure/effect meaning and the native intake status.
