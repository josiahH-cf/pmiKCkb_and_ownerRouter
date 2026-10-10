<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S195 — Renewal recommendation visibility and comparable presentation

> Status: READY — finalized authoring contract; not implemented, queued, activated or released by this specification. Execution requires explicit owner direction under the existing native loop.

**Goal.**

Make existing rent recommendations and useful comparable properties easy to understand and use.

**Current state / intended end state.**

Current: Policy/market suggestions and manual working terms already exist. RentCast queries retain source basis and normalized comparables; supplied feedback primarily concerns visibility and useful ordering, not a missing recommendation backend. Reference comp preparation is operator-triggered.

Intended: The lease workspace visibly explains the current rent, applicable policy or comp basis, proposed rent and deliberate working offer. The first five usable comparables follow provider ordering, with compact distance formatting and access to the retained observation.

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

The lease workspace visibly explains the current rent, applicable policy or comp basis, proposed rent and deliberate working offer. The first five usable comparables follow provider ordering, with compact distance formatting and access to the retained observation. Each requirement below is independently falsifiable; implementation must satisfy the
structural obligation and the observed behavior, including the named failure/alternate cases.

**In scope / out of scope.**

Presentation and application of existing recommendation/comp capabilities, integrated with S194. No new paid background lookup, fabricated market value or independent AVM ranking algorithm.

**Open questions & assumptions.**

No unresolved product decision. The actual provider result order and usable-item validation remain the current normalized provider contract; research official documentation if the adapter differs.

**Cross-product impacts.**

- components/lease-renewal/RenewalProgressControls.tsx; RenewalFocusViewPane.tsx.
- lib/lease-renewal/rent-suggestion.ts; market-observation.ts; market-comp-query-resolver.ts.
- app/api/lease-renewal/market-comps/route.ts; tests/unit/s118-comp-preparation-defaults.test.tsx.

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

- **ARCH-S195-1** — Project source current rent, effective policy or comp basis, proposed amount, known limitations and staff working offer without conflating those states.
- **ARCH-S195-2** — Select the lease display and owner-message comparable list from the first five usable entries of the retained normalized observation in provider order, skipping only unusable entries with a stated validity rule. Preserve the full retained set and provenance separately; do not copy the full set into the owner message by default.
- **ARCH-S195-3** — Keep original normalized numeric distances in the observation and calculations; format visible distance to one decimal consistently in lease cards and owner-message HTML/plain text, distinguishing missing distance from zero.
- **ARCH-S195-4** — Use the existing working-term operation to select a recommendation once and retain policy/comp reference with that selection.
- **ARCH-S195-5** — Show lookup pending/failure and retained-versus-fresh basis separately, and retain all supported copy/attachment and manual preparation paths.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S195-1** — Present recommendation as a visible explanation, not an unexplained number. A staff member can identify why a number was proposed and which offer is actually selected; absent/stale source or manual-review policy displays its real state.
- **BEH-S195-2** — Show the first five usable provider-ranked comparables in the lease and owner message. A shuffled provider fixture retains its order in the first five usable cards and formatted/plain owner-message list, not an invented price/distance sort; fewer than five remain honestly fewer.
- **BEH-S195-3** — Format distances to one decimal for display only. A distance such as 1.26 displays 1.3 while export/source evidence retains its actual precision; no missing distance becomes 0.0.
- **BEH-S195-4** — Allow deliberate use of a proposal without overwriting staff work. Selecting a proposal updates the working offer through the normal authorized action; later refresh or comp failure does not overwrite a custom offer or approved message.
- **BEH-S195-5** — Keep failure and evidence visible without blocking unrelated work. A failed lookup leaves staff able to review existing facts/manual terms, while it cannot masquerade as a fresh market observation or satisfy evidence requirements it lacks.

**Human litmus outcome.**

### Renewal recommendation visibility and comparable presentation

**If this was built correctly:** Make existing rent recommendations and useful comparable properties easy to understand and use. A staff operator can carry out the primary journey,
understand the stated pending/failure states and recover without silently losing work or creating a
duplicate effect. The implementation evidence must exercise the specific scenarios in every row.

- Model verdict: ENGINEERING VERIFIED / DELIVERED — all mapped engineering scopes and independent deployment verified in run 5b3dfb90 /780f48db; exact CI, full observation, eleven readbacks and mobile scope are recorded in the native ledger. Human NOT RUN; no customer send was test proof.
  with evidence after execution.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                                                           | Architecture outcome | Behavior outcome | Human litmus                                                  | Deterministic evidence / falsification                                                                                                                                                    |
| ------------------------------------------------------------------------------------- | -------------------- | ---------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S195-1: Present recommendation as a visible explanation, not an unexplained number. | `ARCH-S195-1`        | `BEH-S195-1`     | Renewal recommendation visibility and comparable presentation | `AC-S195-1`: A staff member can identify why a number was proposed and which offer is actually selected; absent/stale source or manual-review policy displays its real state.             |
| R-S195-2: Show the first five usable provider-ranked comparables.                     | `ARCH-S195-2`        | `BEH-S195-2`     | Renewal recommendation visibility and comparable presentation | `AC-S195-2`: A shuffled provider fixture retains its order in the first five usable cards, not an invented price/distance sort; fewer than five remain honestly fewer.                    |
| R-S195-3: Format distances to one decimal for display only.                           | `ARCH-S195-3`        | `BEH-S195-3`     | Renewal recommendation visibility and comparable presentation | `AC-S195-3`: A distance such as 1.26 displays 1.3 while export/source evidence retains its actual precision; no missing distance becomes 0.0.                                             |
| R-S195-4: Allow deliberate use of a proposal without overwriting staff work.          | `ARCH-S195-4`        | `BEH-S195-4`     | Renewal recommendation visibility and comparable presentation | `AC-S195-4`: Selecting a proposal updates the working offer through the normal authorized action; later refresh or comp failure does not overwrite a custom offer or approved message.    |
| R-S195-5: Keep failure and evidence visible without blocking unrelated work.          | `ARCH-S195-5`        | `BEH-S195-5`     | Renewal recommendation visibility and comparable presentation | `AC-S195-5`: A failed lookup leaves staff able to review existing facts/manual terms, while it cannot masquerade as a fresh market observation or satisfy evidence requirements it lacks. |

**Preservation set.**

Operator-triggered RentCast lookup, allowance/budget controls, full normalized observation, source freshness, reference-only labels, manual terms and exact reviewed message evidence. Record these as a separate gate, not an average with new feature checks.

**Adversarial acceptance checks.**

- **AC-S195-1** — Falsify `ARCH-S195-1` / `BEH-S195-1`: A staff member can identify why a number was proposed and which offer is actually selected; absent/stale source or manual-review policy displays its real state.
- **AC-S195-2** — Falsify `ARCH-S195-2` / `BEH-S195-2`: More than five provider-ranked usable entries yield exactly the same first five in lease cards and HTML/plain owner-message lists; the full observation remains retained. Fewer than five remain fewer and no invented sort appears.
- **AC-S195-3** — Falsify `ARCH-S195-3` / `BEH-S195-3`: A distance such as 1.26 displays 1.3 while export/source evidence retains its actual precision; no missing distance becomes 0.0.
- **AC-S195-4** — Falsify `ARCH-S195-4` / `BEH-S195-4`: Selecting a proposal updates the working offer through the normal authorized action; later refresh or comp failure does not overwrite a custom offer or approved message.
- **AC-S195-5** — Falsify `ARCH-S195-5` / `BEH-S195-5`: A failed lookup leaves staff able to review existing facts/manual terms, while it cannot masquerade as a fresh market observation or satisfy evidence requirements it lacks.

**Forbidden actions / hard gates.**

This authoring request does not implement, commit, push, deploy, activate, send or mutate provider
records. Keep secrets, raw Gmail/customer bodies, credentials and private evidence outside Git.
Do not invent source IDs, recipient addresses, owner agreements, financial authority, provider
capabilities or human verdicts. Preserve current runtime boundaries until the specifically requested
governance contract is implemented under execution authority. A future named-program execution
instruction carries its approved scope through the existing delivery phases; it does not grant an
unrelated identity, cost, security, provider action or historical proof rerun.

**Dependencies / sequencing.**

Consumes S194 policy projection and S183 ordinary staff operation rules. S197 supplies workspace placement; can implement independently against compatible projections.

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
2. Verify each `ARCH-S195-*`, `BEH-S195-*` and `AC-S195-*` scenario, including the row's failure,
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
