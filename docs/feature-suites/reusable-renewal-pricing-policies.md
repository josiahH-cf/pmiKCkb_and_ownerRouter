<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S194 — Reusable renewal pricing policies and lease assignment

> Status: READY — finalized authoring contract; not implemented, queued, activated or released by this specification. Execution requires explicit owner direction under the existing native loop.

**Goal.**

Make standing renewal pricing agreements easy to manage and assign across portfolios and leases, beyond the existing single percentage rule.

**Current state / intended end state.**

Current: lib/firestore/owner-policy-rules.ts supports one flat_percent_increase rule per verified numeric RentVine portfolio ID. lib/lease-renewal/rent-suggestion.ts rounds proposed rent to a whole dollar and does not overwrite operator terms. The owner corrected the supplied screenshot percentage: 3.5% is authoritative for the intended MKD rule, not 2.5%. No portfolio ID may be inferred from the name alone.

Intended: A clear policy management area supports reusable percentage, fixed-dollar, no-increase and manual-review policies, portfolio defaults and explicit lease overrides, with a visible effective policy and proposal basis.

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

A clear policy management area supports reusable percentage, fixed-dollar, no-increase and manual-review policies, portfolio defaults and explicit lease overrides, with a visible effective policy and proposal basis. Each requirement below is independently falsifiable; implementation must satisfy the
structural obligation and the observed behavior, including the named failure/alternate cases.

**In scope / out of scope.**

Renewal pricing policy management and calculation. Communications schedules are S189/S192; maintenance preapproval is S213. No automatic replacement of reviewed offer terms or invented owner agreement.

**Open questions & assumptions.**

No product blocker. Real IDs, policy values and effective dates are runtime configuration verified against source; unavailable owner agreements remain unset/manual review. The MKD 3.5% correction is confirmed intent, not a live mutation during authoring.

**Cross-product impacts.**

- lib/firestore/owner-policy-rules.ts; app/api/admin/owner-policy-rules/route.ts.
- lib/lease-renewal/rent-suggestion.ts; components/lease-renewal/RenewalProgressControls.tsx.
- Renewals lease policy controls and Admin policy management.

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

- **ARCH-S194-1** — Represent percentage, fixed-dollar, no-increase and manual-review policies with effective version/date and human-readable purpose; retain valid legacy rules as equivalent percentage policies.
- **ARCH-S194-2** — Bind assignments to verified source IDs; use explicit active lease override before the applicable portfolio default and otherwise show no policy/manual review, with an auditable reason for assignment changes.
- **ARCH-S194-3** — Associate the corrected percentage only with the verified intended policy target during authorized implementation/configuration; retain prior versions and observations.
- **ARCH-S194-4** — Apply the policy to authoritative current rent with existing whole-dollar rounding and label source rent, policy/version and result; manual-review yields no fabricated amount.
- **ARCH-S194-5** — Provide a discoverable management link and per-lease assignment control with single-action save under existing Admin-management and authorized staff-application permissions.
- **ARCH-S194-6** — Version policy-dependent proposals and warn when a prepared offer uses an older basis; preserve existing exact approved messages/schedules until explicitly updated under their owning contracts.
- **ARCH-S194-7** — Apply an applicable recorded standing policy as the prefill basis for previously untouched working offer terms, retaining policy/version/source evidence and distinguishing generated values from deliberate staff edits. Never replace a manual override or historical reviewed terms.
- **ARCH-S194-8** — Represent standing owner authority separately from mere pricing-policy existence. Only recorded applicable owner authority covering the current lease/cycle/terms may satisfy the individual-owner-outreach prerequisite; revocation, expiry, unresolved conflict or an override outside that authority restores owner review.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S194-1** — Provide named reusable policy types with clear configuration. An Admin creates/edits each type, sees validation for missing/invalid values and finds the same policy after reload; legacy rules produce the same valid result.
- **BEH-S194-2** — Resolve portfolio defaults and lease-specific overrides deterministically. Two leases in a portfolio share the default until one override is assigned; removing the override reveals the default. Ambiguous identity or invalid effective policy does not guess.
- **BEH-S194-3** — Make the corrected 3.5% agreement explicit without rewriting history. The intended MKD policy displays 3.5%; a 2.5% screenshot cannot override it. Other policies and prior approvals retain their actual values and timestamps.
- **BEH-S194-4** — Calculate a transparent proposed rent and preserve deliberate terms. Percentage and fixed-dollar fixtures show the expected rounded result; no-increase equals current rent; an existing staff-entered offer is not silently overwritten after policy changes.
- **BEH-S194-5** — Expose easy management and assignment without redundant approvals. Staff identify the effective policy and select a proposal in the lease; saving a policy does not send, update provider rent or record owner consent. Unauthorized policy administration is refused.
- **BEH-S194-6** — Treat changed policy as new preparation context. A later policy edit changes future recommendations, not a queued exact message or historical decision. Staff can deliberately adopt the new proposal without losing their prior terms.
- **BEH-S194-7** — Opening a lease with an applicable standing agreement prefills untouched working offer terms with the calculated rounded amount and its basis. A deliberate staff amount remains unchanged across refresh, reassignment and policy updates.
- **BEH-S194-8** — A lease covered by recorded standing owner authority can proceed without emailing the owner individually, with the agreement and scope visible. An ordinary reusable price rule alone does not prove owner consent; unset, revoked, expired or conflicting authority returns that lease to owner review without stopping unrelated work.

**Human litmus outcome.**

### Reusable renewal pricing policies and lease assignment

**If this was built correctly:** Make standing renewal pricing agreements easy to manage and assign across portfolios and leases, beyond the existing single percentage rule. A staff operator can carry out the primary journey,
understand the stated pending/failure states and recover without silently losing work or creating a
duplicate effect. The implementation evidence must exercise the specific scenarios in every row.

- Model verdict: LOCAL EVIDENCE — implementation and mapped engineering checks are recorded per requirement in `docs/evidence/operations-communications-maintenance-2026-10.json`; the complete local canonical gate and core E2E passed in their recorded scopes; exact-main CI and runtime/delivery remain separately verified gates. No live provider effect or human observation is claimed.
  with evidence after execution.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                                                                          | Architecture outcome | Behavior outcome | Human litmus                                           | Deterministic evidence / falsification                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------- | -------------------- | ---------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S194-1: Provide named reusable policy types with clear configuration.                              | `ARCH-S194-1`        | `BEH-S194-1`     | Reusable renewal pricing policies and lease assignment | `AC-S194-1`: An Admin creates/edits each type, sees validation for missing/invalid values and finds the same policy after reload; legacy rules produce the same valid result.                                                                                  |
| R-S194-2: Resolve portfolio defaults and lease-specific overrides deterministically.                 | `ARCH-S194-2`        | `BEH-S194-2`     | Reusable renewal pricing policies and lease assignment | `AC-S194-2`: Two leases in a portfolio share the default until one override is assigned; removing the override reveals the default. Ambiguous identity or invalid effective policy does not guess.                                                             |
| R-S194-3: Make the corrected 3.5% agreement explicit without rewriting history.                      | `ARCH-S194-3`        | `BEH-S194-3`     | Reusable renewal pricing policies and lease assignment | `AC-S194-3`: The intended MKD policy displays 3.5%; a 2.5% screenshot cannot override it. Other policies and prior approvals retain their actual values and timestamps.                                                                                        |
| R-S194-4: Calculate a transparent proposed rent and preserve deliberate terms.                       | `ARCH-S194-4`        | `BEH-S194-4`     | Reusable renewal pricing policies and lease assignment | `AC-S194-4`: Percentage and fixed-dollar fixtures show the expected rounded result; no-increase equals current rent; an existing staff-entered offer is not silently overwritten after policy changes.                                                         |
| R-S194-5: Expose easy management and assignment without redundant approvals.                         | `ARCH-S194-5`        | `BEH-S194-5`     | Reusable renewal pricing policies and lease assignment | `AC-S194-5`: Staff identify the effective policy and select a proposal in the lease; saving a policy does not send, update provider rent or record owner consent. Unauthorized policy administration is refused.                                               |
| R-S194-6: Treat changed policy as new preparation context.                                           | `ARCH-S194-6`        | `BEH-S194-6`     | Reusable renewal pricing policies and lease assignment | `AC-S194-6`: A later policy edit changes future recommendations, not a queued exact message or historical decision. Staff can deliberately adopt the new proposal without losing their prior terms.                                                            |
| R-S194-7: Prefill untouched working terms from the applicable standing agreement.                    | `ARCH-S194-7`        | `BEH-S194-7`     | Reusable renewal pricing policies and lease assignment | `AC-S194-7`: Open a covered lease with blank working terms and verify the rounded policy amount/basis is prefilled; set a manual amount and repeat refresh/reassignment/policy changes with that amount preserved.                                             |
| R-S194-8: Use recorded standing owner authority to bypass individual outreach only within its scope. | `ARCH-S194-8`        | `BEH-S194-8`     | Reusable renewal pricing policies and lease assignment | `AC-S194-8`: Covered MKD-style agreement skips individual outreach; mere price rule, missing membership, revoked/expired/conflicting authority and out-of-scope manual terms restore owner review. No invented owner decision or provider receipt is produced. |

**Preservation set.**

Stable RentVine IDs, audit history, whole-dollar proposal rounding, source rent provenance, staff-entered terms, recorded owner decisions and unrelated comp/manual proposal paths. Record these as a separate gate, not an average with new feature checks.

**Adversarial acceptance checks.**

- **AC-S194-1** — Falsify `ARCH-S194-1` / `BEH-S194-1`: An Admin creates/edits each type, sees validation for missing/invalid values and finds the same policy after reload; legacy rules produce the same valid result.
- **AC-S194-2** — Falsify `ARCH-S194-2` / `BEH-S194-2`: Two leases in a portfolio share the default until one override is assigned; removing the override reveals the default. Ambiguous identity or invalid effective policy does not guess.
- **AC-S194-3** — Falsify `ARCH-S194-3` / `BEH-S194-3`: The intended MKD policy displays 3.5%; a 2.5% screenshot cannot override it. Other policies and prior approvals retain their actual values and timestamps.
- **AC-S194-4** — Falsify `ARCH-S194-4` / `BEH-S194-4`: Percentage and fixed-dollar fixtures show the expected rounded result; no-increase equals current rent; an existing staff-entered offer is not silently overwritten after policy changes.
- **AC-S194-5** — Falsify `ARCH-S194-5` / `BEH-S194-5`: Staff identify the effective policy and select a proposal in the lease; saving a policy does not send, update provider rent or record owner consent. Unauthorized policy administration is refused.
- **AC-S194-6** — Falsify `ARCH-S194-6` / `BEH-S194-6`: A later policy edit changes future recommendations, not a queued exact message or historical decision. Staff can deliberately adopt the new proposal without losing their prior terms.
- **AC-S194-7** — Falsify `ARCH-S194-7` / `BEH-S194-7`: Opening a covered lease with untouched working terms prefills the rounded policy amount and agreement basis; manual overrides survive refresh, reassignment and changed policy, with prior reviewed terms unchanged.
- **AC-S194-8** — Falsify `ARCH-S194-8` / `BEH-S194-8`: A valid scoped standing owner agreement permits proceeding without individual owner outreach. A price rule alone, missing membership, revocation, expiry, conflict or out-of-authority override requires owner review; provider writes still use the exact normal staff action contract.

**Forbidden actions / hard gates.**

This authoring request does not implement, commit, push, deploy, activate, send or mutate provider
records. Keep secrets, raw Gmail/customer bodies, credentials and private evidence outside Git.
Do not invent source IDs, recipient addresses, owner agreements, financial authority, provider
capabilities or human verdicts. Preserve current runtime boundaries until the specifically requested
governance contract is implemented under execution authority. A future named-program execution
instruction carries its approved scope through the existing delivery phases; it does not grant an
unrelated identity, cost, security, provider action or historical proof rerun.

**Dependencies / sequencing.**

S183/S184 remove redundant per-number approval barriers for authorized staff while retaining explicit term selection. S195 displays the selected basis. Existing rules must migrate compatibly.

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
2. Verify each `ARCH-S194-*`, `BEH-S194-*` and `AC-S194-*` scenario, including the row's failure,
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
