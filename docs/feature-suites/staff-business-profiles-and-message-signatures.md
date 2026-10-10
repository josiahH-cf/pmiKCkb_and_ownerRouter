<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S224 — Staff business profiles and message signatures

> Status: READY — finalized authoring contract; not implemented, queued, activated or released by this specification. Execution requires explicit owner direction under the existing native loop.

**Goal.**

Manage staff business titles and contact details clearly and reuse them in accurate future message signatures.

**Current state / intended end state.**

Current: Access roles such as Admin/Editor govern permissions. Retained sender signatures already exist in lib/firestore/renewal-sender-signatures.ts for the actor’s own email and presentation fields. Those are not an organization-wide business profile or permission service.

Intended: Admin can maintain staff business title and approved business contact details; current staff can see their profile and preview the resulting own-sender signature in workflow communications.

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

Admin can maintain staff business title and approved business contact details; current staff can see their profile and preview the resulting own-sender signature in workflow communications. Each requirement below is independently falsifiable; implementation must satisfy the
structural obligation and the observed behavior, including the named failure/alternate cases.

**In scope / out of scope.**

Business presentation metadata and future signatures. No IAM/claim change, new staff account, identity impersonation, Gmail global signature management or change to existing approved message bytes.

**Open questions & assumptions.**

No missing behavior decision. Actual titles, phones and hours are runtime business data entered by authorized Admin; they are not inferred from role or invented during implementation.

**Cross-product impacts.**

- Admin staff management and existing managed staff identity projection.
- lib/firestore/renewal-sender-signatures.ts; lib/lease-renewal/renewal-message-preparation.ts.
- S187 composer and S188 managed sender ownership.

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

- **ARCH-S224-1** — Attach versioned business presentation fields to a verified existing staff identity through an Admin-only service and clear UI labels.
- **ARCH-S224-2** — Support title, display name and optional approved business phone/hours through existing signature-compatible validation and an audited normal save.
- **ARCH-S224-3** — Resolve a profile only for the current managed sender, prefill the signature and show exact rich/plain preview in the composer.
- **ARCH-S224-4** — Record the signature version/content in the prepared message; later profile edits apply to new preparation and require the normal explicit schedule update to change an approved schedule.
- **ARCH-S224-5** — Preserve prior actor-owned signature values, make conflicts with Admin profile visible, and choose current profile for new prefill without rewriting prior snapshots.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S224-1** — Manage business title separately from access role. Changing a title such as Property Manager changes presentation only; Admin/Editor permissions and claims remain unchanged. Invalid or unknown staff identities cannot be assigned profiles.
- **BEH-S224-2** — Retain approved contact details without fabricating missing values. A blank optional field is omitted from the signature rather than replaced with a guessed number/hours; authorized changes persist after reload.
- **BEH-S224-3** — Use the responsible sender’s profile for future composition. Two staff users see their own correct signature; takeover loads the new responsible staff profile and never borrows another mailbox identity.
- **BEH-S224-4** — Keep prepared and approved message content stable. An Admin title change does not mutate a queued exact message or historical send; new composition can deliberately use the current profile.
- **BEH-S224-5** — Migrate existing retained signatures without losing useful staff data. Existing staff can inspect their prior signature and current profile; migration/retry cannot delete history or silently change a sent/approved payload.

**Human litmus outcome.**

### Staff business profiles and message signatures

**If this was built correctly:** Manage staff business titles and contact details clearly and reuse them in accurate future message signatures. A staff operator can carry out the primary journey,
understand the stated pending/failure states and recover without silently losing work or creating a
duplicate effect. The implementation evidence must exercise the specific scenarios in every row.

- Model verdict: ENGINEERING VERIFIED / DELIVERED — all mapped engineering scopes and independent deployment verified in run 5b3dfb90 /780f48db; exact CI, full observation, eleven readbacks and mobile scope are recorded in the native ledger. Human NOT RUN; no customer send was test proof.
  with evidence after execution.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                                                      | Architecture outcome | Behavior outcome | Human litmus                                   | Deterministic evidence / falsification                                                                                                                                                                   |
| -------------------------------------------------------------------------------- | -------------------- | ---------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S224-1: Manage business title separately from access role.                     | `ARCH-S224-1`        | `BEH-S224-1`     | Staff business profiles and message signatures | `AC-S224-1`: Changing a title such as Property Manager changes presentation only; Admin/Editor permissions and claims remain unchanged. Invalid or unknown staff identities cannot be assigned profiles. |
| R-S224-2: Retain approved contact details without fabricating missing values.    | `ARCH-S224-2`        | `BEH-S224-2`     | Staff business profiles and message signatures | `AC-S224-2`: A blank optional field is omitted from the signature rather than replaced with a guessed number/hours; authorized changes persist after reload.                                             |
| R-S224-3: Use the responsible sender’s profile for future composition.           | `ARCH-S224-3`        | `BEH-S224-3`     | Staff business profiles and message signatures | `AC-S224-3`: Two staff users see their own correct signature; takeover loads the new responsible staff profile and never borrows another mailbox identity.                                               |
| R-S224-4: Keep prepared and approved message content stable.                     | `ARCH-S224-4`        | `BEH-S224-4`     | Staff business profiles and message signatures | `AC-S224-4`: An Admin title change does not mutate a queued exact message or historical send; new composition can deliberately use the current profile.                                                  |
| R-S224-5: Migrate existing retained signatures without losing useful staff data. | `ARCH-S224-5`        | `BEH-S224-5`     | Staff business profiles and message signatures | `AC-S224-5`: Existing staff can inspect their prior signature and current profile; migration/retry cannot delete history or silently change a sent/approved payload.                                     |

**Preservation set.**

Managed-domain identities, existing authentication/roles, own-sender signature ownership, prior message snapshots and signatures, ordinary profile access control and audit. Record these as a separate gate, not an average with new feature checks.

**Adversarial acceptance checks.**

- **AC-S224-1** — Falsify `ARCH-S224-1` / `BEH-S224-1`: Changing a title such as Property Manager changes presentation only; Admin/Editor permissions and claims remain unchanged. Invalid or unknown staff identities cannot be assigned profiles.
- **AC-S224-2** — Falsify `ARCH-S224-2` / `BEH-S224-2`: A blank optional field is omitted from the signature rather than replaced with a guessed number/hours; authorized changes persist after reload.
- **AC-S224-3** — Falsify `ARCH-S224-3` / `BEH-S224-3`: Two staff users see their own correct signature; takeover loads the new responsible staff profile and never borrows another mailbox identity.
- **AC-S224-4** — Falsify `ARCH-S224-4` / `BEH-S224-4`: An Admin title change does not mutate a queued exact message or historical send; new composition can deliberately use the current profile.
- **AC-S224-5** — Falsify `ARCH-S224-5` / `BEH-S224-5`: Existing staff can inspect their prior signature and current profile; migration/retry cannot delete history or silently change a sent/approved payload.

**Forbidden actions / hard gates.**

This authoring request does not implement, commit, push, deploy, activate, send or mutate provider
records. Keep secrets, raw Gmail/customer bodies, credentials and private evidence outside Git.
Do not invent source IDs, recipient addresses, owner agreements, financial authority, provider
capabilities or human verdicts. Preserve current runtime boundaries until the specifically requested
governance contract is implemented under execution authority. A future named-program execution
instruction carries its approved scope through the existing delivery phases; it does not grant an
unrelated identity, cost, security, provider action or historical proof rerun.

**Dependencies / sequencing.**

Consumes S188 sender identity and S187 exact preview; can deliver independent Admin profile management with signature preview. S183 preserves role distinction.

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
2. Verify each `ARCH-S224-*`, `BEH-S224-*` and `AC-S224-*` scenario, including the row's failure,
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
