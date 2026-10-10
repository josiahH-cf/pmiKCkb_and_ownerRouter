<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S204 — Global header autocomplete and filtered search results

> Status: READY — finalized authoring contract; not implemented, queued, activated or released by this specification. Execution requires explicit owner direction under the existing native loop.

**Goal.**

Let staff start a search beside the PMI home mark from any signed-in application page and open the right operational record.

**Current state / intended end state.**

Current: AppShell currently contains the PMI brand, environment badge, primary navigation, notifications, appearance, issue reporting and session controls. Maintenance UnitTypeahead supplies a useful keyboard/debounce pattern but its Enter behavior and permissions do not satisfy global search.

Intended: An accessible compact search beside the top-left PMI mark offers authorized autocomplete, an optional entity filter and Enter-to-results navigation, preserving the current page and opening selected records in new tabs.

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

An accessible compact search beside the top-left PMI mark offers authorized autocomplete, an optional entity filter and Enter-to-results navigation, preserving the current page and opening selected records in new tabs. Each requirement below is independently falsifiable; implementation must satisfy the
structural obligation and the observed behavior, including the named failure/alternate cases.

**In scope / out of scope.**

Global signed-in header search and results UI. Does not replace domain filters, become an AI command box, search excluded content or change source data.

**Open questions & assumptions.**

No material unknown. Responsive width and debounce/result page size follow measured existing conventions; empty input shows a prompt rather than an arbitrary data dump.

**Cross-product impacts.**

- components/layout/AppShell.tsx; components/layout/PrimaryNav.tsx.
- components/maintenance/UnitTypeahead.tsx as a reusable interaction example.
- New search results surface and S203 search contract; internal lease/person/ticket/vendor routes.

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

- **ARCH-S204-1** — Mount one shared header control with a clearly labeled search input and optional supported entity selector, adapting to narrow widths without hiding essential navigation.
- **ARCH-S204-2** — Debounce/cancel requests, show typed labels and matching context, retain last-query ordering and ignore obsolete responses.
- **ARCH-S204-3** — Implement an accessible combobox with suggestions initially unselected, deliberate arrow/pointer selection, Escape dismissal and Enter choosing an actively selected suggestion or opening the complete query results when none is selected. Fetching/replacing suggestions must not automatically activate the first result.
- **ARCH-S204-4** — Represent query and entity filter in the results route, preserve them on refresh/back, and show bounded pages with match context and explicit source limitations.
- **ARCH-S204-5** — Use verified typed destinations, opening selected entity records in new tabs; owner/resident selections open a related-lease filtered view, and lease selections start at the lease top.
- **ARCH-S204-6** — Allow retry without clearing the query and use specific non-sensitive error states; never include excluded bodies or hidden records in UI logs.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S204-1** — Expose search beside the home brand on all signed-in pages. From Dashboard, a lease, Maintenance, Communications or My Work, staff can find and use search; the PMI mark still returns home and the header does not overlap.
- **BEH-S204-2** — Provide useful autocomplete without requiring exact text. Typing a partial name/address returns S203 matches; rapid typing cannot replace newer suggestions with an older response. Empty, loading, no match and partial-source states are distinct.
- **BEH-S204-3** — Support Enter-to-results and keyboard selection predictably. Keyboard-only staff can select a result or press Enter to search all matches; typing Miller or East 1 and pressing Enter without arrow selection opens all filtered results, while deliberate arrow selection followed by Enter opens that record. Focus is visible, announcements are useful and Enter never accidentally submits an unrelated page form.
- **BEH-S204-4** — Make complete results filterable and shareable by query. Entering Miller opens all authorized matches under the chosen filter; changing type narrows that query and reload preserves it. No-result text does not conceal a source failure.
- **BEH-S204-5** — Open the correct record while preserving the starting workspace. East 1 suggestions distinguish similar addresses/IDs; choosing one opens exactly that destination without losing the originating form or worklist filters. Deleted/inaccessible targets produce an honest unavailable state.
- **BEH-S204-6** — Keep lookup failures recoverable and private. A failed search leaves the page usable and query intact; denied data does not appear in suggestions, counts, browser logs or accessibility text.

**Human litmus outcome.**

### Global header autocomplete and filtered search results

**If this was built correctly:** Let staff start a search beside the PMI home mark from any signed-in application page and open the right operational record. A staff operator can carry out the primary journey,
understand the stated pending/failure states and recover without silently losing work or creating a
duplicate effect. The implementation evidence must exercise the specific scenarios in every row.

- Model verdict: ENGINEERING VERIFIED / DELIVERED — all mapped engineering scopes and independent deployment verified in run 5b3dfb90 /780f48db; exact CI, full observation, eleven readbacks and mobile scope are recorded in the native ledger. Human NOT RUN; no customer send was test proof.
  with evidence after execution.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                                                | Architecture outcome | Behavior outcome | Human litmus                                           | Deterministic evidence / falsification                                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | -------------------- | ---------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S204-1: Expose search beside the home brand on all signed-in pages.      | `ARCH-S204-1`        | `BEH-S204-1`     | Global header autocomplete and filtered search results | `AC-S204-1`: From Dashboard, a lease, Maintenance, Communications or My Work, staff can find and use search; the PMI mark still returns home and the header does not overlap.                                                             |
| R-S204-2: Provide useful autocomplete without requiring exact text.        | `ARCH-S204-2`        | `BEH-S204-2`     | Global header autocomplete and filtered search results | `AC-S204-2`: Typing a partial name/address returns S203 matches; rapid typing cannot replace newer suggestions with an older response. Empty, loading, no match and partial-source states are distinct.                                   |
| R-S204-3: Support Enter-to-results and keyboard selection predictably.     | `ARCH-S204-3`        | `BEH-S204-3`     | Global header autocomplete and filtered search results | `AC-S204-3`: Keyboard-only staff can select a result or press Enter to search all matches; focus is visible, announcements are useful and Enter never accidentally submits an unrelated page form.                                        |
| R-S204-4: Make complete results filterable and shareable by query.         | `ARCH-S204-4`        | `BEH-S204-4`     | Global header autocomplete and filtered search results | `AC-S204-4`: Entering Miller opens all authorized matches under the chosen filter; changing type narrows that query and reload preserves it. No-result text does not conceal a source failure.                                            |
| R-S204-5: Open the correct record while preserving the starting workspace. | `ARCH-S204-5`        | `BEH-S204-5`     | Global header autocomplete and filtered search results | `AC-S204-5`: East 1 suggestions distinguish similar addresses/IDs; choosing one opens exactly that destination without losing the originating form or worklist filters. Deleted/inaccessible targets produce an honest unavailable state. |
| R-S204-6: Keep lookup failures recoverable and private.                    | `ARCH-S204-6`        | `BEH-S204-6`     | Global header autocomplete and filtered search results | `AC-S204-6`: A failed search leaves the page usable and query intact; denied data does not appear in suggestions, counts, browser logs or accessibility text.                                                                             |

**Preservation set.**

PMI home action, primary navigation, environment/sign-in/session controls, current page unsaved state and filters, keyboard accessibility, supported themes and existing small-screen access. Record these as a separate gate, not an average with new feature checks.

**Adversarial acceptance checks.**

- **AC-S204-1** — Falsify `ARCH-S204-1` / `BEH-S204-1`: From Dashboard, a lease, Maintenance, Communications or My Work, staff can find and use search; the PMI mark still returns home and the header does not overlap.
- **AC-S204-2** — Falsify `ARCH-S204-2` / `BEH-S204-2`: Typing a partial name/address returns S203 matches; rapid typing cannot replace newer suggestions with an older response. Empty, loading, no match and partial-source states are distinct.
- **AC-S204-3** — Falsify `ARCH-S204-3` / `BEH-S204-3`: Type Miller/East 1 then press Enter with no selection and require full filtered results; repeat with deliberate arrow selection and require that exact record. A response refresh cannot auto-select a result; focus, announcements and unrelated-form isolation remain correct.
- **AC-S204-4** — Falsify `ARCH-S204-4` / `BEH-S204-4`: Entering Miller opens all authorized matches under the chosen filter; changing type narrows that query and reload preserves it. No-result text does not conceal a source failure.
- **AC-S204-5** — Falsify `ARCH-S204-5` / `BEH-S204-5`: East 1 suggestions distinguish similar addresses/IDs; choosing one opens exactly that destination without losing the originating form or worklist filters. Deleted/inaccessible targets produce an honest unavailable state.
- **AC-S204-6** — Falsify `ARCH-S204-6` / `BEH-S204-6`: A failed search leaves the page usable and query intact; denied data does not appear in suggestions, counts, browser logs or accessibility text.

**Forbidden actions / hard gates.**

This authoring request does not implement, commit, push, deploy, activate, send or mutate provider
records. Keep secrets, raw Gmail/customer bodies, credentials and private evidence outside Git.
Do not invent source IDs, recipient addresses, owner agreements, financial authority, provider
capabilities or human verdicts. Preserve current runtime boundaries until the specifically requested
governance contract is implemented under execution authority. A future named-program execution
instruction carries its approved scope through the existing delivery phases; it does not grant an
unrelated identity, cost, security, provider action or historical proof rerun.

**Dependencies / sequencing.**

Requires S203 search service; can build against its deterministic adapter before an actual index is ready. Uses S196 lease-opening/filter behavior and S225 branding without hardcoding future app name.

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
2. Verify each `ARCH-S204-*`, `BEH-S204-*` and `AC-S204-*` scenario, including the row's failure,
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
