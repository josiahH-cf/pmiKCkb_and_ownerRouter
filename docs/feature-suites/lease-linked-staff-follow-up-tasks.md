<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S198 — Lease-linked staff follow-up tasks in My Work

> Status: READY — finalized authoring contract; not implemented, queued, activated or released by this specification. Execution requires explicit owner direction under the existing native loop.

**Goal.**

Track pets, insurance and Rhino-related follow-up as assigned lease work that staff can find and complete.

**Current state / intended end state.**

Current: My Work accountability, renewal manual activities and policy-related follow-up already exist. lib/lease-renewal/policy-content.ts distinguishes approved material/applicability from staff-recorded follow-up. Staff completion is not evidence of insurance coverage, a policy renewal or a provider effect.

Intended: A staff member can create/assign a lease-bound follow-up, find it in My Work and the lease, record progress and complete/reopen it without losing the source policy or historical context.

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

A staff member can create/assign a lease-bound follow-up, find it in My Work and the lease, record progress and complete/reopen it without losing the source policy or historical context. Each requirement below is independently falsifiable; implementation must satisfy the
structural obligation and the observed behavior, including the named failure/alternate cases.

**In scope / out of scope.**

App-owned staff tasks for pets, insurance and Rhino-related follow-up. No insurance underwriting, pet-policy invention, automatic customer notice or verified coverage assertion.

**Open questions & assumptions.**

No unresolved behavior choice. Actual applicability and wording come from approved policy/source data at runtime; unknown facts remain review tasks, not fabricated requirements for all leases.

**Cross-product impacts.**

- app/work/page.tsx; app/api/work/route.ts; components/work/WorkAccountabilityBoard.tsx.
- lib/lease-renewal/policy-content.ts; renewal follow-up/manual activity controls.
- Lease work projections and existing accountability stores.

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

- **ARCH-S198-1** — Reuse the existing work service with stable lease/cycle linkage, task kind, assignee, optional due date and notes; originating controls resolve real records.
- **ARCH-S198-2** — Project the owning task state in both places and link back to the exact lease without a separate competing task store.
- **ARCH-S198-3** — Retain an idempotent app task creation intent and show existing active matching work rather than silently adding another task; explicitly allow a new cycle or distinct follow-up.
- **ARCH-S198-4** — Keep actor/time/history and optional supporting references while preserving the task’s origin and prior status.
- **ARCH-S198-5** — Link applicable reviewed material where available and show pending/conflicting material in task context without requiring unrelated work to stop.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S198-1** — Create a clearly labeled task against the actual lease and cycle. A staff member creates a pet, insurance or Rhino follow-up from the lease and finds the same task after reload; ambiguous identity is refused.
- **BEH-S198-2** — Make tasks visible from both the lease and My Work. Assigning, updating or completing a task is reflected in both views, with clear empty/unassigned states and authorized filtering.
- **BEH-S198-3** — Prevent duplicate work from repeated creation intent. Double click/retry produces one intended task; a later deliberate separate task or new renewal cycle remains possible and distinguishable.
- **BEH-S198-4** — Record completion and reopening as staff work. Completing a task shows who recorded it and when, never marks policy coverage/provider success automatically, and reopening retains the prior completion history.
- **BEH-S198-5** — Use approved facts and preserve unknown applicability. An unknown insurance/Rhino rule can be investigated as a task; it does not produce invented legal wording or an automatic resident message.

**Human litmus outcome.**

### Lease-linked staff follow-up tasks in My Work

**If this was built correctly:** Track pets, insurance and Rhino-related follow-up as assigned lease work that staff can find and complete. A staff operator can carry out the primary journey,
understand the stated pending/failure states and recover without silently losing work or creating a
duplicate effect. The implementation evidence must exercise the specific scenarios in every row.

- Model verdict: LOCAL EVIDENCE — implementation and mapped engineering checks are recorded per requirement in `docs/evidence/operations-communications-maintenance-2026-10.json`; the complete local canonical gate and core E2E passed in their recorded scopes; exact-main CI and runtime/delivery remain separately verified gates. No live provider effect or human observation is claimed.
  with evidence after execution.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                                                 | Architecture outcome | Behavior outcome | Human litmus                                  | Deterministic evidence / falsification                                                                                                                                         |
| --------------------------------------------------------------------------- | -------------------- | ---------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-S198-1: Create a clearly labeled task against the actual lease and cycle. | `ARCH-S198-1`        | `BEH-S198-1`     | Lease-linked staff follow-up tasks in My Work | `AC-S198-1`: A staff member creates a pet, insurance or Rhino follow-up from the lease and finds the same task after reload; ambiguous identity is refused.                    |
| R-S198-2: Make tasks visible from both the lease and My Work.               | `ARCH-S198-2`        | `BEH-S198-2`     | Lease-linked staff follow-up tasks in My Work | `AC-S198-2`: Assigning, updating or completing a task is reflected in both views, with clear empty/unassigned states and authorized filtering.                                 |
| R-S198-3: Prevent duplicate work from repeated creation intent.             | `ARCH-S198-3`        | `BEH-S198-3`     | Lease-linked staff follow-up tasks in My Work | `AC-S198-3`: Double click/retry produces one intended task; a later deliberate separate task or new renewal cycle remains possible and distinguishable.                        |
| R-S198-4: Record completion and reopening as staff work.                    | `ARCH-S198-4`        | `BEH-S198-4`     | Lease-linked staff follow-up tasks in My Work | `AC-S198-4`: Completing a task shows who recorded it and when, never marks policy coverage/provider success automatically, and reopening retains the prior completion history. |
| R-S198-5: Use approved facts and preserve unknown applicability.            | `ARCH-S198-5`        | `BEH-S198-5`     | Lease-linked staff follow-up tasks in My Work | `AC-S198-5`: An unknown insurance/Rhino rule can be investigated as a task; it does not produce invented legal wording or an automatic resident message.                       |

**Preservation set.**

My Work role visibility, existing assignments/due dates, activity audit, manual/provider evidence separation, policy applicability unknown/conflict states and unrelated task behavior. Record these as a separate gate, not an average with new feature checks.

**Adversarial acceptance checks.**

- **AC-S198-1** — Falsify `ARCH-S198-1` / `BEH-S198-1`: A staff member creates a pet, insurance or Rhino follow-up from the lease and finds the same task after reload; ambiguous identity is refused.
- **AC-S198-2** — Falsify `ARCH-S198-2` / `BEH-S198-2`: Assigning, updating or completing a task is reflected in both views, with clear empty/unassigned states and authorized filtering.
- **AC-S198-3** — Falsify `ARCH-S198-3` / `BEH-S198-3`: Double click/retry produces one intended task; a later deliberate separate task or new renewal cycle remains possible and distinguishable.
- **AC-S198-4** — Falsify `ARCH-S198-4` / `BEH-S198-4`: Completing a task shows who recorded it and when, never marks policy coverage/provider success automatically, and reopening retains the prior completion history.
- **AC-S198-5** — Falsify `ARCH-S198-5` / `BEH-S198-5`: An unknown insurance/Rhino rule can be investigated as a task; it does not produce invented legal wording or an automatic resident message.

**Forbidden actions / hard gates.**

This authoring request does not implement, commit, push, deploy, activate, send or mutate provider
records. Keep secrets, raw Gmail/customer bodies, credentials and private evidence outside Git.
Do not invent source IDs, recipient addresses, owner agreements, financial authority, provider
capabilities or human verdicts. Preserve current runtime boundaries until the specifically requested
governance contract is implemented under execution authority. A future named-program execution
instruction carries its approved scope through the existing delivery phases; it does not grant an
unrelated identity, cost, security, provider action or historical proof rerun.

**Dependencies / sequencing.**

Uses existing My Work lifecycle and S183 normal operation contract; S194 pricing policies remain separate. S201 collections may link tasks without owning them.

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
2. Verify each `ARCH-S198-*`, `BEH-S198-*` and `AC-S198-*` scenario, including the row's failure,
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
