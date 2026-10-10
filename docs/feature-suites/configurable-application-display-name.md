<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S225 — Configurable application display name

> Status: READY — finalized authoring contract; not implemented, queued, activated or released by this specification. Execution requires explicit owner direction under the existing native loop.

**Goal.**

Let Admin choose the application’s display name consistently while keeping the current name until a replacement is chosen.

**Current state / intended end state.**

Current: Brand presentation currently uses PmiWordmark and product-name constants in AppShell and related surfaces. The owner requested easy naming configuration but has not supplied a new name.

Intended: A simple Admin setting changes the display name across the application’s supported brand/title surfaces with a preview and ordinary save; an unset setting retains the current name.

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

A simple Admin setting changes the display name across the application’s supported brand/title surfaces with a preview and ordinary save; an unset setting retains the current name. Each requirement below is independently falsifiable; implementation must satisfy the
structural obligation and the observed behavior, including the named failure/alternate cases.

**In scope / out of scope.**

Application display name only. No domain, OAuth/client ID, project/service identity, legal entity name, email sender, database key, routing or permission change.

**Open questions & assumptions.**

The replacement name is intentionally not chosen. This does not block configuration capability: retain the existing default and let Admin set a future value.

**Cross-product impacts.**

- components/brand/PmiWordmark.tsx; components/layout/AppShell.tsx.
- Current brand/product-name constants and page metadata as inventoried during implementation.
- Admin settings projection and owning configuration store.

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

- **ARCH-S225-1** — Use one validated app configuration source with current name as default, audited single-action save and preview before application.
- **ARCH-S225-2** — Resolve supported header, navigation/accessibility and page-title labels from the shared configuration instead of new hardcoded copies.
- **ARCH-S225-3** — Trim/validate reasonable display text and render it as text; keep responsive layout and accessible names independent of visual truncation.
- **ARCH-S225-4** — Limit this setting to display projection and invalidate its presentation cache; preserve provider identities and historical evidence.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S225-1** — Expose a simple Admin display-name setting. An Admin can preview/save a name and see it after reload; non-Admin updates are refused. Blank/reset restores the existing default.
- **BEH-S225-2** — Apply the name consistently to inventoried presentation surfaces. A test inventories affected brand strings and verifies one saved name appears consistently; loading/failure uses the existing default without a blank header.
- **BEH-S225-3** — Handle longer text and unsafe input without breaking navigation. A long name remains readable through an appropriate accessible label and does not hide search/navigation; markup cannot execute or alter a URL.
- **BEH-S225-4** — Keep branding separate from operational identity and history. Changing the display name sends no email, changes no OAuth/domain/service configuration and does not rewrite prior message/report snapshots.

**Human litmus outcome.**

### Configurable application display name

**If this was built correctly:** Let Admin choose the application’s display name consistently while keeping the current name until a replacement is chosen. A staff operator can carry out the primary journey,
understand the stated pending/failure states and recover without silently losing work or creating a
duplicate effect. The implementation evidence must exercise the specific scenarios in every row.

- Model verdict: LOCAL EVIDENCE — implementation and mapped engineering checks are recorded per requirement in `docs/evidence/operations-communications-maintenance-2026-10.json`; the complete local canonical gate and core E2E passed in their recorded scopes; exact-main CI and runtime/delivery remain separately verified gates. No live provider effect or human observation is claimed.
  with evidence after execution.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                                                 | Architecture outcome | Behavior outcome | Human litmus                          | Deterministic evidence / falsification                                                                                                                                     |
| --------------------------------------------------------------------------- | -------------------- | ---------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S225-1: Expose a simple Admin display-name setting.                       | `ARCH-S225-1`        | `BEH-S225-1`     | Configurable application display name | `AC-S225-1`: An Admin can preview/save a name and see it after reload; non-Admin updates are refused. Blank/reset restores the existing default.                           |
| R-S225-2: Apply the name consistently to inventoried presentation surfaces. | `ARCH-S225-2`        | `BEH-S225-2`     | Configurable application display name | `AC-S225-2`: A test inventories affected brand strings and verifies one saved name appears consistently; loading/failure uses the existing default without a blank header. |
| R-S225-3: Handle longer text and unsafe input without breaking navigation.  | `ARCH-S225-3`        | `BEH-S225-3`     | Configurable application display name | `AC-S225-3`: A long name remains readable through an appropriate accessible label and does not hide search/navigation; markup cannot execute or alter a URL.               |
| R-S225-4: Keep branding separate from operational identity and history.     | `ARCH-S225-4`        | `BEH-S225-4`     | Configurable application display name | `AC-S225-4`: Changing the display name sends no email, changes no OAuth/domain/service configuration and does not rewrite prior message/report snapshots.                  |

**Preservation set.**

PMI home behavior and wordmark identity, canonical URLs, existing record IDs, service configuration, managed sender names, authentication and supported theme/accessibility behavior. Record these as a separate gate, not an average with new feature checks.

**Adversarial acceptance checks.**

- **AC-S225-1** — Falsify `ARCH-S225-1` / `BEH-S225-1`: An Admin can preview/save a name and see it after reload; non-Admin updates are refused. Blank/reset restores the existing default.
- **AC-S225-2** — Falsify `ARCH-S225-2` / `BEH-S225-2`: A test inventories affected brand strings and verifies one saved name appears consistently; loading/failure uses the existing default without a blank header.
- **AC-S225-3** — Falsify `ARCH-S225-3` / `BEH-S225-3`: A long name remains readable through an appropriate accessible label and does not hide search/navigation; markup cannot execute or alter a URL.
- **AC-S225-4** — Falsify `ARCH-S225-4` / `BEH-S225-4`: Changing the display name sends no email, changes no OAuth/domain/service configuration and does not rewrite prior message/report snapshots.

**Forbidden actions / hard gates.**

This authoring request does not implement, commit, push, deploy, activate, send or mutate provider
records. Keep secrets, raw Gmail/customer bodies, credentials and private evidence outside Git.
Do not invent source IDs, recipient addresses, owner agreements, financial authority, provider
capabilities or human verdicts. Preserve current runtime boundaries until the specifically requested
governance contract is implemented under execution authority. A future named-program execution
instruction carries its approved scope through the existing delivery phases; it does not grant an
unrelated identity, cost, security, provider action or historical proof rerun.

**Dependencies / sequencing.**

Can implement independently. S204 header search remains usable with longer display names; S224 business titles remain separate.

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
2. Verify each `ARCH-S225-*`, `BEH-S225-*` and `AC-S225-*` scenario, including the row's failure,
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
