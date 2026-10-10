<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S184 — Ordinary staff provider updates with one clear action

> Status: READY — finalized authoring contract; not implemented, queued, activated or released by this specification. Execution requires explicit owner direction under the existing native loop.

**Goal.**

Let authorized staff edit supported operational records through normal in-app controls with one review/action and dependable outcomes.

**Current state / intended end state.**

Current: Sheet append/recognized-field updates and scoped RentVine renewal/work-order updates already exist with narrow provider contracts. The live Sheet switch is true. Several controls still expose historical pauses or approval stages. Registry enablement alone does not establish that a provider operation is currently usable.

Intended: Supported existing provider edits use a direct editable form and visible before/after values, a single Save/Apply action, nearby progress and an honest receipted outcome. App-owned drafts remain easy to save.

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

Supported existing provider edits use a direct editable form and visible before/after values, a single Save/Apply action, nearby progress and an honest receipted outcome. App-owned drafts remain easy to save. Each requirement below is independently falsifiable; implementation must satisfy the
structural obligation and the observed behavior, including the named failure/alternate cases.

**In scope / out of scope.**

Usability and governance of already supported source edits, plus contracts specifically introduced by this program. No generic method/path/body editor, row deletion, historical restore or arbitrary financial posting.

**Open questions & assumptions.**

No missing product input. The implementer inventories supported field/action controls and their current permissions before editing. Missing actual connection or scope blocks only that effect.

**Cross-product impacts.**

- components/lease-renewal/OperatingSheetPanel.tsx; RenewalWorkingRecord.tsx; renewal source update controls.
- lib/lease-renewal/sheet-writeback and lib/lease-renewal/writeback existing primitives.
- components/maintenance/RentvineWorkOrderPanel.tsx; owning API routes.

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

- **ARCH-S184-1** — Bind visible editable values and before/after comparison to the same server-resolved record/version consumed by execution.
- **ARCH-S184-2** — Route direct controls and chat-requested operations through the same named operation service after S183; retain technical validation behind the action.
- **ARCH-S184-3** — Retain a durable intent across double click, retry and reload; resolve the provider result and receipt before offering a repeat.
- **ARCH-S184-4** — Preserve distinct source observations, local working values, staff progress and provider receipts in projections and audit history.
- **ARCH-S184-5** — Derive availability from current server capability and actual configuration, retiring stale copy while preserving real connection failures.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S184-1** — Present exact changes in the ordinary editing surface. The user reviews and saves once; changing record, value or source version after review cannot silently apply a different change.
- **BEH-S184-2** — Remove redundant approval steps for supported staff edits. A normal recognized Sheet field update and supported RentVine update require no second consent ceremony; unauthorized or unsupported edits remain unavailable with a useful reason.
- **BEH-S184-3** — Make execution and recovery visible at the control. Double click and response loss cannot duplicate the intended update. The user sees success with readback, a known failure with retained input, or an unresolved outcome with reconciliation.
- **BEH-S184-4** — Separate provider truth from app drafts and staff records. A local save or manual Done never claims a RentVine/Sheet write occurred; verified readback and corrected values identify their actual origin.
- **BEH-S184-5** — Reconcile obsolete paused labels with the verified runtime contract. With the reviewed Sheet switch true, supported actions are usable; with actual connection denial, the relevant action explains it without hiding unrelated work.

**Human litmus outcome.**

### Ordinary staff provider updates with one clear action

**If this was built correctly:** Let authorized staff edit supported operational records through normal in-app controls with one review/action and dependable outcomes. A staff operator can carry out the primary journey,
understand the stated pending/failure states and recover without silently losing work or creating a
duplicate effect. The implementation evidence must exercise the specific scenarios in every row.

- Model verdict: ENGINEERING VERIFIED / DELIVERED — all mapped engineering scopes and independent deployment verified in run 5b3dfb90 /780f48db; exact CI, full observation, eleven readbacks and mobile scope are recorded in the native ledger. Human NOT RUN; no customer send was test proof.
  with evidence after execution.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                                                    | Architecture outcome | Behavior outcome | Human litmus                                          | Deterministic evidence / falsification                                                                                                                                                                    |
| ------------------------------------------------------------------------------ | -------------------- | ---------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S184-1: Present exact changes in the ordinary editing surface.               | `ARCH-S184-1`        | `BEH-S184-1`     | Ordinary staff provider updates with one clear action | `AC-S184-1`: The user reviews and saves once; changing record, value or source version after review cannot silently apply a different change.                                                             |
| R-S184-2: Remove redundant approval steps for supported staff edits.           | `ARCH-S184-2`        | `BEH-S184-2`     | Ordinary staff provider updates with one clear action | `AC-S184-2`: A normal recognized Sheet field update and supported RentVine update require no second consent ceremony; unauthorized or unsupported edits remain unavailable with a useful reason.          |
| R-S184-3: Make execution and recovery visible at the control.                  | `ARCH-S184-3`        | `BEH-S184-3`     | Ordinary staff provider updates with one clear action | `AC-S184-3`: Double click and response loss cannot duplicate the intended update. The user sees success with readback, a known failure with retained input, or an unresolved outcome with reconciliation. |
| R-S184-4: Separate provider truth from app drafts and staff records.           | `ARCH-S184-4`        | `BEH-S184-4`     | Ordinary staff provider updates with one clear action | `AC-S184-4`: A local save or manual Done never claims a RentVine/Sheet write occurred; verified readback and corrected values identify their actual origin.                                               |
| R-S184-5: Reconcile obsolete paused labels with the verified runtime contract. | `ARCH-S184-5`        | `BEH-S184-5`     | Ordinary staff provider updates with one clear action | `AC-S184-5`: With the reviewed Sheet switch true, supported actions are usable; with actual connection denial, the relevant action explains it without hiding unrelated work.                             |

**Preservation set.**

Existing append/correction behavior, actor permissions, source provenance, one-attempt claims, exact target resolution, stale/conflict checks, correction receipts and S100 irreversibility warning; no source edits from a page read. Record these as a separate gate, not an average with new feature checks.

**Adversarial acceptance checks.**

- **AC-S184-1** — Falsify `ARCH-S184-1` / `BEH-S184-1`: The user reviews and saves once; changing record, value or source version after review cannot silently apply a different change.
- **AC-S184-2** — Falsify `ARCH-S184-2` / `BEH-S184-2`: A normal recognized Sheet field update and supported RentVine update require no second consent ceremony; unauthorized or unsupported edits remain unavailable with a useful reason.
- **AC-S184-3** — Falsify `ARCH-S184-3` / `BEH-S184-3`: Double click and response loss cannot duplicate the intended update. The user sees success with readback, a known failure with retained input, or an unresolved outcome with reconciliation.
- **AC-S184-4** — Falsify `ARCH-S184-4` / `BEH-S184-4`: A local save or manual Done never claims a RentVine/Sheet write occurred; verified readback and corrected values identify their actual origin.
- **AC-S184-5** — Falsify `ARCH-S184-5` / `BEH-S184-5`: With the reviewed Sheet switch true, supported actions are usable; with actual connection denial, the relevant action explains it without hiding unrelated work.

**Forbidden actions / hard gates.**

This authoring request does not implement, commit, push, deploy, activate, send or mutate provider
records. Keep secrets, raw Gmail/customer bodies, credentials and private evidence outside Git.
Do not invent source IDs, recipient addresses, owner agreements, financial authority, provider
capabilities or human verdicts. Preserve current runtime boundaries until the specifically requested
governance contract is implemented under execution authority. A future named-program execution
instruction carries its approved scope through the existing delivery phases; it does not grant an
unrelated identity, cost, security, provider action or historical proof rerun.

**Dependencies / sequencing.**

Consumes S183 governance reconciliation. Uses the existing S97/S98/S99/S113/S159 contracts and adds no duplicate provider implementation. New provider actions in maintenance remain owned by their suites.

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
2. Verify each `ARCH-S184-*`, `BEH-S184-*` and `AC-S184-*` scenario, including the row's failure,
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
