<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S185 — Measured governance performance and operational toil

> Status: READY — finalized authoring contract; not implemented, queued, activated or released by this specification. Execution requires explicit owner direction under the existing native loop.

**Goal.**

Reduce measured governance-related latency and repeated operator work without weakening correctness controls.

**Current state / intended end state.**

Current: The owner reports governance has degraded usability/performance as the application became live. This is a reported problem, not proof of a particular bottleneck. Current code includes repeated role/action checks, workflow reads, approval state and source reconciliation; those require measurement before removal.

Intended: A baseline and after-change comparison shows which checks cause latency or redundant work, removes unnecessary repetition and keeps genuine policy/consistency checks efficient and visible.

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

A baseline and after-change comparison shows which checks cause latency or redundant work, removes unnecessary repetition and keeps genuine policy/consistency checks efficient and visible. Each requirement below is independently falsifiable; implementation must satisfy the
structural obligation and the observed behavior, including the named failure/alternate cases.

**In scope / out of scope.**

Instrument and improve affected operation paths within the current app. No invented performance SLA, weakened release gate, unbounded cache, privileged bypass or speculative infrastructure rewrite.

**Open questions & assumptions.**

The actual bottleneck and baseline timings are nonblocking investigation outputs, not assumed causes. Choose implementation details from evidence and record the chosen reproducible workload.

**Cross-product impacts.**

- lib/integrations/action-gate.ts; lib/lease-renewal/role-action-governance.ts.
- components/hooks/useOperation.ts.
- Dashboard, Renewals, My Work, Maintenance and Communications representative routes; existing performance and role tests.

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

- **ARCH-S185-1** — Record sanitized request-stage timings, call counts and user action counts for the same read, local edit, provider update and communications preparation paths.
- **ARCH-S185-2** — Coalesce compatible request-local reads and policy resolution; bound any cache to actor/scope/config version and invalidate it when those change.
- **ARCH-S185-3** — Expose stage-aware pending and partial failure through the existing operation controls, and prevent duplicate dispatch while work is unresolved.
- **ARCH-S185-4** — Compare like-for-like before/after distributions and operation counts, separate cold/warm behavior, and retain raw private measurements outside Git.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S185-1** — Measure representative work before changing checks. A reproducible baseline identifies actual repeated work and latency; the report cannot label an unmeasured component as the cause.
- **BEH-S185-2** — Eliminate redundant calls and consent work while retaining the owning check. The same workload performs fewer redundant calls or actions; changed permissions/configuration do not reuse another actor or an obsolete authority decision.
- **BEH-S185-3** — Keep slow and partial operations understandable. A deliberately delayed or failed stage leaves controls responsive, identifies what is waiting and retains input; repeated clicks cannot create a second effect.
- **BEH-S185-4** — Demonstrate improvement with independent preservation evidence. The changed paths improve measured repetition or latency with no worsened material journey; role, conflict, idempotency and recovery checks pass independently. No arbitrary number is claimed as an owner SLA.

**Human litmus outcome.**

### Measured governance performance and operational toil

**If this was built correctly:** Reduce measured governance-related latency and repeated operator work without weakening correctness controls. A staff operator can carry out the primary journey,
understand the stated pending/failure states and recover without silently losing work or creating a
duplicate effect. The implementation evidence must exercise the specific scenarios in every row.

- Model verdict: ENGINEERING VERIFIED / DELIVERED — all mapped engineering scopes and independent deployment verified in run 5b3dfb90 /780f48db; exact CI, full observation, eleven readbacks and mobile scope are recorded in the native ledger. Human NOT RUN; no customer send was test proof.
  with evidence after execution.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                                                            | Architecture outcome | Behavior outcome | Human litmus                                         | Deterministic evidence / falsification                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------- | -------------------- | ---------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S185-1: Measure representative work before changing checks.                          | `ARCH-S185-1`        | `BEH-S185-1`     | Measured governance performance and operational toil | `AC-S185-1`: A reproducible baseline identifies actual repeated work and latency; the report cannot label an unmeasured component as the cause.                                                                              |
| R-S185-2: Eliminate redundant calls and consent work while retaining the owning check. | `ARCH-S185-2`        | `BEH-S185-2`     | Measured governance performance and operational toil | `AC-S185-2`: The same workload performs fewer redundant calls or actions; changed permissions/configuration do not reuse another actor or an obsolete authority decision.                                                    |
| R-S185-3: Keep slow and partial operations understandable.                             | `ARCH-S185-3`        | `BEH-S185-3`     | Measured governance performance and operational toil | `AC-S185-3`: A deliberately delayed or failed stage leaves controls responsive, identifies what is waiting and retains input; repeated clicks cannot create a second effect.                                                 |
| R-S185-4: Demonstrate improvement with independent preservation evidence.              | `ARCH-S185-4`        | `BEH-S185-4`     | Measured governance performance and operational toil | `AC-S185-4`: The changed paths improve measured repetition or latency with no worsened material journey; role, conflict, idempotency and recovery checks pass independently. No arbitrary number is claimed as an owner SLA. |

**Preservation set.**

Role and Space denial, current-data validation, conflict handling, no duplicate external effect, audit/recovery, actual user permissions and existing production assurance. Record these as a separate gate, not an average with new feature checks.

**Adversarial acceptance checks.**

- **AC-S185-1** — Falsify `ARCH-S185-1` / `BEH-S185-1`: A reproducible baseline identifies actual repeated work and latency; the report cannot label an unmeasured component as the cause.
- **AC-S185-2** — Falsify `ARCH-S185-2` / `BEH-S185-2`: The same workload performs fewer redundant calls or actions; changed permissions/configuration do not reuse another actor or an obsolete authority decision.
- **AC-S185-3** — Falsify `ARCH-S185-3` / `BEH-S185-3`: A deliberately delayed or failed stage leaves controls responsive, identifies what is waiting and retains input; repeated clicks cannot create a second effect.
- **AC-S185-4** — Falsify `ARCH-S185-4` / `BEH-S185-4`: The changed paths improve measured repetition or latency with no worsened material journey; role, conflict, idempotency and recovery checks pass independently. No arbitrary number is claimed as an owner SLA.

**Forbidden actions / hard gates.**

This authoring request does not implement, commit, push, deploy, activate, send or mutate provider
records. Keep secrets, raw Gmail/customer bodies, credentials and private evidence outside Git.
Do not invent source IDs, recipient addresses, owner agreements, financial authority, provider
capabilities or human verdicts. Preserve current runtime boundaries until the specifically requested
governance contract is implemented under execution authority. A future named-program execution
instruction carries its approved scope through the existing delivery phases; it does not grant an
unrelated identity, cost, security, provider action or historical proof rerun.

**Dependencies / sequencing.**

Consumes S183 operation matrix. Can baseline independently; optimization is complete only with preserved operation correctness. S226 consumes results.

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
2. Verify each `ARCH-S185-*`, `BEH-S185-*` and `AC-S185-*` scenario, including the row's failure,
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
