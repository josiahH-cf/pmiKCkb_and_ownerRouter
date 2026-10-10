<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S183 — Operational governance and authority reconciliation

> Status: READY — finalized authoring contract; not implemented, queued, activated or released by this specification. Execution requires explicit owner direction under the existing native loop.

**Goal.**

Make the requested ordinary staff work and reviewed workflow communications possible without recurring consent ceremonies, while retaining enforceable operational correctness.

**Current state / intended end state.**

Current: The current router permanently forbids scheduled/client-facing sends and ends renewal/maintenance initiation at an unsent Gmail draft. Exact send and several vendor/provider keys are closed. Existing renewal controls still carry categorical and repeated approval barriers. These are current rules, not the desired product outcome. The October owner directions explicitly request in-app sending, a schedule approved once, and ordinary authorized edits with less toil.

Intended: One coherent operation-level contract distinguishes app-owned edits, human-requested provider updates, user-approved scheduled sends, model answers, and genuinely unavailable effects. Router, policy documentation, server controls and user controls agree about that contract.

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

One coherent operation-level contract distinguishes app-owned edits, human-requested provider updates, user-approved scheduled sends, model answers, and genuinely unavailable effects. Router, policy documentation, server controls and user controls agree about that contract. Each requirement below is independently falsifiable; implementation must satisfy the
structural obligation and the observed behavior, including the named failure/alternate cases.

**In scope / out of scope.**

Policy and implementation-contract reconciliation for this program. No new identity, claim, general inbox, arbitrary provider endpoint, autonomous model write, budget change, or generic bulk mutation grant.

**Open questions & assumptions.**

No unresolved product choice. The exact keys and owning code paths must be inventoried from the current registry during implementation; this is technical research, not a reason to ask the owner to repeat settled intent. Provider capabilities and missing credentials remain factual dependencies.

**Cross-product impacts.**

- AGENTS.md; docs/facts.md and the active suite register (future implementation reconciliation only).
- lib/integrations/action-gate.ts; lib/integrations/action-registry-seed.ts; lib/lease-renewal/role-action-governance.ts.
- lib/auth/roles.ts; existing operation routes and action-governance tests.

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

- **ARCH-S183-1** — Assign every affected existing or new operation a named actor, data scope, trigger, provider boundary, evidence and recovery owner; reconcile router, registry descriptions, server refusals and UI together.
- **ARCH-S183-2** — Separate user intent capture from internal technical interlocks; remove additional consent tokens and repeated confirmations where they only duplicate the same review, without removing server checks.
- **ARCH-S183-3** — Map S189 approval and S190 durable execution to the exact scoped send capability and managed sender; exclude model-triggered and unapproved background sends.
- **ARCH-S183-4** — Apply the same staff operation services to an explicitly requested supported action and keep informational generation separate from the action executor.
- **ARCH-S183-5** — Produce a complete named-key/path delta for this program, replacing obsolete blanket restrictions only where the requested outcome requires it; do not open unrelated keys or invent absent safety primitives.
- **ARCH-S183-6** — Define authoring-ready versus execution-authorized versus technically blocked states in the existing loop contract; record settled owner decisions once and retain failed/ambiguous effects honestly.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S183-1** — Replace contradictory categorical policy with an operation matrix for this program. A matrix check identifies the current unsent-only/scheduled-send contradiction and passes only when all owning controls express the approved program contract; documentation alone cannot override a server refusal.
- **BEH-S183-2** — Treat a normal explicit Save or action as the staff authorization for the exact visible outcome. An authorized staff member completes an ordinary edit once; invalid targets, stale values and unauthorized staff still receive a specific refusal without a write.
- **BEH-S183-3** — Authorize scheduled client communications only through the reviewed Send/Schedule contract. Approved initial and follow-up occurrences proceed without a new prompt; an unapproved schedule, changed payload or unsupported sender cannot dispatch.
- **BEH-S183-4** — Make AI assistance open and contextual without turning its answer into execution authority. A speculative answer can render with facts/inferences distinguished; no inferred action or hallucinated identifier is dispatched. An explicit supported staff action is not refused merely because it originated in chat.
- **BEH-S183-5** — Keep provider discovery, exact activation and protected changes explicit and scoped. A review detects an extra key or identity grant. An unavailable provider contract reports the affected effect as blocked while independent app work continues.
- **BEH-S183-6** — Carry approved execution scope through the future loop without repeated human intervention. The runner advances approved phases and ordinary choices unattended; a genuinely missing provider input is surfaced once with exact impact, and a failed receipt never becomes a pass.

**Human litmus outcome.**

### Operational governance and authority reconciliation

**If this was built correctly:** Make the requested ordinary staff work and reviewed workflow communications possible without recurring consent ceremonies, while retaining enforceable operational correctness. A staff operator can carry out the primary journey,
understand the stated pending/failure states and recover without silently losing work or creating a
duplicate effect. The implementation evidence must exercise the specific scenarios in every row.

- Model verdict: LOCAL EVIDENCE — implementation and mapped engineering checks are recorded per requirement in `docs/evidence/operations-communications-maintenance-2026-10.json`; the complete local canonical gate and core E2E passed in their recorded scopes; exact-main CI and runtime/delivery remain separately verified gates. No live provider effect or human observation is claimed.
  with evidence after execution.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                                                                                | Architecture outcome | Behavior outcome | Human litmus                                        | Deterministic evidence / falsification                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------- | -------------------- | ---------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S183-1: Replace contradictory categorical policy with an operation matrix for this program.              | `ARCH-S183-1`        | `BEH-S183-1`     | Operational governance and authority reconciliation | `AC-S183-1`: A matrix check identifies the current unsent-only/scheduled-send contradiction and passes only when all owning controls express the approved program contract; documentation alone cannot override a server refusal.      |
| R-S183-2: Treat a normal explicit Save or action as the staff authorization for the exact visible outcome. | `ARCH-S183-2`        | `BEH-S183-2`     | Operational governance and authority reconciliation | `AC-S183-2`: An authorized staff member completes an ordinary edit once; invalid targets, stale values and unauthorized staff still receive a specific refusal without a write.                                                        |
| R-S183-3: Authorize scheduled client communications only through the reviewed Send/Schedule contract.      | `ARCH-S183-3`        | `BEH-S183-3`     | Operational governance and authority reconciliation | `AC-S183-3`: Approved initial and follow-up occurrences proceed without a new prompt; an unapproved schedule, changed payload or unsupported sender cannot dispatch.                                                                   |
| R-S183-4: Make AI assistance open and contextual without turning its answer into execution authority.      | `ARCH-S183-4`        | `BEH-S183-4`     | Operational governance and authority reconciliation | `AC-S183-4`: A speculative answer can render with facts/inferences distinguished; no inferred action or hallucinated identifier is dispatched. An explicit supported staff action is not refused merely because it originated in chat. |
| R-S183-5: Keep provider discovery, exact activation and protected changes explicit and scoped.             | `ARCH-S183-5`        | `BEH-S183-5`     | Operational governance and authority reconciliation | `AC-S183-5`: A review detects an extra key or identity grant. An unavailable provider contract reports the affected effect as blocked while independent app work continues.                                                            |
| R-S183-6: Carry approved execution scope through the future loop without repeated human intervention.      | `ARCH-S183-6`        | `BEH-S183-6`     | Operational governance and authority reconciliation | `AC-S183-6`: The runner advances approved phases and ordinary choices unattended; a genuinely missing provider input is surfaced once with exact impact, and a failed receipt never becomes a pass.                                    |

**Preservation set.**

Existing backend role/Space isolation, managed identity, verification-only accounts, exact-target validation, idempotency/at-most-once, receipts/readbacks, release locks, fresh assurance, recovery, secret/PII exclusion, and S100 read-marker warning remain independently checked. Preserve all unrelated exact-key closures. Record these as a separate gate, not an average with new feature checks.

**Adversarial acceptance checks.**

- **AC-S183-1** — Falsify `ARCH-S183-1` / `BEH-S183-1`: A matrix check identifies the current unsent-only/scheduled-send contradiction and passes only when all owning controls express the approved program contract; documentation alone cannot override a server refusal.
- **AC-S183-2** — Falsify `ARCH-S183-2` / `BEH-S183-2`: An authorized staff member completes an ordinary edit once; invalid targets, stale values and unauthorized staff still receive a specific refusal without a write.
- **AC-S183-3** — Falsify `ARCH-S183-3` / `BEH-S183-3`: Approved initial and follow-up occurrences proceed without a new prompt; an unapproved schedule, changed payload or unsupported sender cannot dispatch.
- **AC-S183-4** — Falsify `ARCH-S183-4` / `BEH-S183-4`: A speculative answer can render with facts/inferences distinguished; no inferred action or hallucinated identifier is dispatched. An explicit supported staff action is not refused merely because it originated in chat.
- **AC-S183-5** — Falsify `ARCH-S183-5` / `BEH-S183-5`: A review detects an extra key or identity grant. An unavailable provider contract reports the affected effect as blocked while independent app work continues.
- **AC-S183-6** — Falsify `ARCH-S183-6` / `BEH-S183-6`: The runner advances approved phases and ordinary choices unattended; a genuinely missing provider input is surfaced once with exact impact, and a failed receipt never becomes a pass.

**Forbidden actions / hard gates.**

This authoring request does not implement, commit, push, deploy, activate, send or mutate provider
records. Keep secrets, raw Gmail/customer bodies, credentials and private evidence outside Git.
Do not invent source IDs, recipient addresses, owner agreements, financial authority, provider
capabilities or human verdicts. Preserve current runtime boundaries until the specifically requested
governance contract is implemented under execution authority. A future named-program execution
instruction carries its approved scope through the existing delivery phases; it does not grant an
unrelated identity, cost, security, provider action or historical proof rerun.

**Dependencies / sequencing.**

First implementation prerequisite for S184, S186–S193, S202 and any newly authorized vendor/provider mutation. Authoring this file changes no active runtime rule. An explicit instruction to execute S183 or this named program includes the necessary scoped protected governance edits and reviewed exact-key activation for its specifically defined operations after their technical gates pass. It carries the stated governance change through implementation; do not request the same approval again at each phase or solely because the already-selected change touches its named protected path. Unrelated keys, identities and privileges remain outside that instruction. Unavailable provider semantics or credentials remain genuine holds; activation is not evidence that a provider effect succeeded.

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
2. Verify each `ARCH-S183-*`, `BEH-S183-*` and `AC-S183-*` scenario, including the row's failure,
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
