<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S196 — Renewal desk navigation and readable tables

> Status: READY — finalized authoring contract; not implemented, queued, activated or released by this specification. Execution requires explicit owner direction under the existing native loop.

**Goal.**

Let staff find the right lease quickly and read renewal worklists on normal laptop screens without clipped controls.

**Current state / intended end state.**

Current: The Renewals desk already provides filtering/sorting, saved preferences, lifecycle/status data and lease links. Existing worklists and headers can become crowded. The requested nonrenewals-first view and related-person filters must preserve deliberately chosen user sorting.

Intended: A clear Nonrenewals-first default/view, readable alternating rows, sticky headers and distinct links help staff open the intended lease or provider record in a new tab, starting at the lease top.

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

A clear Nonrenewals-first default/view, readable alternating rows, sticky headers and distinct links help staff open the intended lease or provider record in a new tab, starting at the lease top. Each requirement below is independently falsifiable; implementation must satisfy the
structural obligation and the observed behavior, including the named failure/alternate cases.

**In scope / out of scope.**

Renewal worklist ordering, filtering, navigation and table readability. No source lease data change or new general search backend; global search is S203/S204.

**Open questions & assumptions.**

No material open question. Browser checks must include a normal small laptop viewport and normal zoom, plus responsive/zoomed layouts; exact CSS dimensions are implementer choices, not invented product thresholds.

**Cross-product impacts.**

- components/lease-renewal/RenewalDeskTable.tsx; RenewalDeskRefresh.tsx.
- lib/lease-renewal/desk-query-v2.ts; lib/firestore/renewal-desk-preferences.ts.
- app/lease-renewal routes; tests/unit/s82-renewal-desk-table.test.tsx; renewal-desk-query.test.ts.

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

- **ARCH-S196-1** — Provide an explicit Nonrenewals-first view/default for an unset view and retain user-selected sort/filter preferences thereafter.
- **ARCH-S196-2** — Resolve clicked names to stable source person IDs and filter associated leases, displaying the chosen filter and an easy clear action.
- **ARCH-S196-3** — Label internal lease links and external RentVine links separately; worklist/detail search openings use a new tab and the internal lease starts at its top.
- **ARCH-S196-4** — Use sticky headers and bounded/responsive overflow so identity, filters, sort affordances and actions remain reachable without clipping or overlap.
- **ARCH-S196-5** — Add alternating row treatment, spacing and distinct lifecycle/status/action semantics while preserving text labels and adequate contrast in supported themes.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S196-1** — Make nonrenewing work easy to prioritize without overriding deliberate sorting. A fresh view surfaces nonrenewals first; a staff member’s saved deliberate sort remains after reload and is never silently replaced.
- **BEH-S196-2** — Use owner and resident names as related-lease filters. Two people sharing a surname are not merged; selecting an owner/resident shows all authorized related leases rather than opening an unrelated detail.
- **BEH-S196-3** — Distinguish app and RentVine navigation. Staff can tell which destination opens, retain their list state, and reach the correct verified lease; no guessed provider URL or inherited midpage anchor is used.
- **BEH-S196-4** — Keep table headers and controls readable at ordinary laptop sizes. A compiled browser check at a small laptop viewport and normal zoom can operate all columns/controls; narrow and enlarged-text layouts retain access with sensible scrolling.
- **BEH-S196-5** — Separate rows, lifecycle labels and actionable pills visually. An operator can track one row across columns and distinguish a status from a button; keyboard focus, dark/light theme and non-color cues remain usable.

**Human litmus outcome.**

### Renewal desk navigation and readable tables

**If this was built correctly:** Let staff find the right lease quickly and read renewal worklists on normal laptop screens without clipped controls. A staff operator can carry out the primary journey,
understand the stated pending/failure states and recover without silently losing work or creating a
duplicate effect. The implementation evidence must exercise the specific scenarios in every row.

- Model verdict: ENGINEERING VERIFIED / DELIVERED — all mapped engineering scopes and independent deployment verified in run 5b3dfb90 /780f48db; exact CI, full observation, eleven readbacks and mobile scope are recorded in the native ledger. Human NOT RUN; no customer send was test proof.
  with evidence after execution.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                                                               | Architecture outcome | Behavior outcome | Human litmus                                | Deterministic evidence / falsification                                                                                                                                                     |
| ----------------------------------------------------------------------------------------- | -------------------- | ---------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-S196-1: Make nonrenewing work easy to prioritize without overriding deliberate sorting. | `ARCH-S196-1`        | `BEH-S196-1`     | Renewal desk navigation and readable tables | `AC-S196-1`: A fresh view surfaces nonrenewals first; a staff member’s saved deliberate sort remains after reload and is never silently replaced.                                          |
| R-S196-2: Use owner and resident names as related-lease filters.                          | `ARCH-S196-2`        | `BEH-S196-2`     | Renewal desk navigation and readable tables | `AC-S196-2`: Two people sharing a surname are not merged; selecting an owner/resident shows all authorized related leases rather than opening an unrelated detail.                         |
| R-S196-3: Distinguish app and RentVine navigation.                                        | `ARCH-S196-3`        | `BEH-S196-3`     | Renewal desk navigation and readable tables | `AC-S196-3`: Staff can tell which destination opens, retain their list state, and reach the correct verified lease; no guessed provider URL or inherited midpage anchor is used.           |
| R-S196-4: Keep table headers and controls readable at ordinary laptop sizes.              | `ARCH-S196-4`        | `BEH-S196-4`     | Renewal desk navigation and readable tables | `AC-S196-4`: A compiled browser check at a small laptop viewport and normal zoom can operate all columns/controls; narrow and enlarged-text layouts retain access with sensible scrolling. |
| R-S196-5: Separate rows, lifecycle labels and actionable pills visually.                  | `ARCH-S196-5`        | `BEH-S196-5`     | Renewal desk navigation and readable tables | `AC-S196-5`: An operator can track one row across columns and distinguish a status from a button; keyboard focus, dark/light theme and non-color cues remain usable.                       |

**Preservation set.**

Saved filters/sorts, pagination and source totals, keyboard navigation, current lease identity checks, no provider writes on reads and status meaning. Record these as a separate gate, not an average with new feature checks.

**Adversarial acceptance checks.**

- **AC-S196-1** — Falsify `ARCH-S196-1` / `BEH-S196-1`: A fresh view surfaces nonrenewals first; a staff member’s saved deliberate sort remains after reload and is never silently replaced.
- **AC-S196-2** — Falsify `ARCH-S196-2` / `BEH-S196-2`: Two people sharing a surname are not merged; selecting an owner/resident shows all authorized related leases rather than opening an unrelated detail.
- **AC-S196-3** — Falsify `ARCH-S196-3` / `BEH-S196-3`: Staff can tell which destination opens, retain their list state, and reach the correct verified lease; no guessed provider URL or inherited midpage anchor is used.
- **AC-S196-4** — Falsify `ARCH-S196-4` / `BEH-S196-4`: A compiled browser check at a small laptop viewport and normal zoom can operate all columns/controls; narrow and enlarged-text layouts retain access with sensible scrolling.
- **AC-S196-5** — Falsify `ARCH-S196-5` / `BEH-S196-5`: An operator can track one row across columns and distinguish a status from a button; keyboard focus, dark/light theme and non-color cues remain usable.

**Forbidden actions / hard gates.**

This authoring request does not implement, commit, push, deploy, activate, send or mutate provider
records. Keep secrets, raw Gmail/customer bodies, credentials and private evidence outside Git.
Do not invent source IDs, recipient addresses, owner agreements, financial authority, provider
capabilities or human verdicts. Preserve current runtime boundaries until the specifically requested
governance contract is implemented under execution authority. A future named-program execution
instruction carries its approved scope through the existing delivery phases; it does not grant an
unrelated identity, cost, security, provider action or historical proof rerun.

**Dependencies / sequencing.**

Can implement independently; consumes S194 effective policy labels only when available. S204 reuses navigation behavior. Keep all existing saved view formats compatible.

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
2. Verify each `ARCH-S196-*`, `BEH-S196-*` and `AC-S196-*` scenario, including the row's failure,
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
