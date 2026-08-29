<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-stabilization-v2 -->

# S80 — Renewal role and action governance

> Status: Active; the owner approved an Editor-level ordinary-work matrix, while current page/API
> gates are inconsistent and all provider/action safety boundaries remain unchanged.

**Goal.**

Let Renewals-space Editors perform ordinary renewal work without redundant approval friction while
keeping pricing approval, configuration, live source writes, action activation, and client sending at
their exact stronger boundaries.

**Current state / intended end state.**

The canonical Live desk/workspace requires Admin, while the draft API and legacy notices surface
permit Editor. App-owned progress/owner decisions, comp suggestions, policy changes, draft creation,
and provider writes are presented through different mechanisms whose authority is not summarized for
the operator. The intended state has one explicit, tested capability/effect matrix and honest
unavailable reasons; it does not create per-person authority or weaken an exact action gate.

**Actors and entry conditions.**

Every actor must be a managed `pmikcmetro.com` user with Renewals Space access. Role and effect type
are evaluated independently: Editor, Approver, and Admin do not imply an Action Registry grant, and an
open key does not imply role/Space access.

**What it is / how it functions.**

The approved matrix is:

| Capability                                                              | Editor with Renewals Space      | Approver/Admin distinction               | External authority                   |
| ----------------------------------------------------------------------- | ------------------------------- | ---------------------------------------- | ------------------------------------ |
| Read canonical desk/workspace and source-backed facts                   | Allowed                         | Same                                     | Read connection and freshness checks |
| Search/sort/filter and save app-owned progress/record an owner decision | Allowed and audited             | Same                                     | No provider write                    |
| Request RentCast reference comps                                        | Allowed                         | Same                                     | Exact read key, runtime state, quota |
| Approve a comp-derived pricing suggestion                               | Not implied                     | Existing Approver/Admin rule             | App approval record only             |
| Preview and create one unsent renewal Gmail draft                       | Allowed with exact confirmation | Same                                     | Exact draft key; never send          |
| Manage timing/pricing policy, users, connections, suspensions, or gates | Denied                          | Existing Admin-only rule                 | Exact management boundary            |
| Write RentVine/Sheet or store screenshot                                | No role alone authorizes        | Exact reviewed flow when separately open | Current keys remain closed           |
| Send a renewal message from the app                                     | Never                           | Never                                    | Permanently closed                   |

**In scope / out of scope.**

In scope: page/API parity, ordinary app-owned renewal mutations, exact role/action matrix, audit,
unavailable explanations, and deterministic privilege checks. Out of scope: S64 per-person grants,
role redesign, auth-provider changes, action-key activation, direct send, or weakening exact preview
for any external effect.

**Open questions & assumptions.**

The owner selected this matrix. “Owner decision” means recording the human owner's decision in the
app; it does not let an Editor invent or approve a comp-derived number on the owner's behalf.

**Cross-product impacts.**

Renewal pages/routes, S77/S78/S59 flows, approval queue, Admin policy surfaces, Action Registry
readiness, audit records, Space access, and user-facing refusal copy.

**Authority and evidence map.**

| Input                                                                                                                     | Classification                | Use and limitation                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` action authority, standing authority, and protected-path rules                                                | Authority                     | Roles, Space access, exact action keys, and runtime readiness are independent; protected auth/Rules/gate paths may be prepared but not pushed without explicit owner direction. |
| `docs/facts.md` renewal decisions and S64 status                                                                          | Product authority             | The Editor ordinary-work matrix is approved; per-person authority remains an unauthorized proposal.                                                                             |
| Canonical Live desk/workspace guards, legacy notices guards, draft route, progress/decision routes, and rendered controls | Verified implementation truth | Current Admin-only page access disagrees with Editor-capable ordinary APIs/surfaces; the inventory must prove every actual entry point rather than assume parity.               |
| Role, Space, route, component, Action Registry, suspension, and send-boundary tests                                       | Verification baseline         | Existing denials are preservation evidence; new inventory/matrix checks must fail on the current page/API disagreement.                                                         |
| Stabilization intake                                                                                                      | Intent evidence only          | “Less approval friction” means approved ordinary app work, not blanket unchecked provider effects or a role redesign.                                                           |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S80-1** — One renewal capability/effect matrix is projected consistently into page guards,
  API guards, rendered controls, and tests; a deterministic inventory identifies any mismatch.
- **ARCH-S80-2** — App-owned saves and provider effects remain separate types with separate audit and
  confirmation rules; no generic “renewal action” or category grant can bridge them.
- **ARCH-S80-3** — Static and adversarial privilege checks prove no renewal surface imports send,
  bypasses Space scope, treats role as an action key, or implements unauthorized S64 inheritance.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S80-1** — A Renewals-space Editor can open the canonical desk/workspace, save ordinary
  progress/owner-decision facts, request reference comps, and exact-confirm an unsent draft.
- **BEH-S80-2** — The same Editor is denied Admin policy/configuration, comp-suggestion approval where
  the existing rule requires stronger authority, and every closed provider write, with a specific
  reason and safe next action.
- **BEH-S80-3** — An Editor without Renewals Space access, an unmanaged/personal identity, or a user
  with a valid role but suspended/closed exact action remains denied before effect construction.

**Human litmus outcome.**

### Understand and use renewal authority

**If this was built correctly:** A renewal Editor can do routine work from the main desk and knows why
a pricing approval, setup change, source write, or client send is unavailable. The UI never suggests
that becoming an Admin would override a closed action or permit in-app sending.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                                                  | Architecture outcome | Behavior outcome         | Human litmus                                                   | Deterministic evidence / falsification                                                                                             |
| ---------------------------------------------------------------------------- | -------------------- | ------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| One authority answer across page, API, and control                           | `ARCH-S80-1`         | `BEH-S80-1`, `BEH-S80-2` | Understand and use renewal authority                           | Machine inventory exercises every matrix row against page/API/control guards and initially exposes the Admin/Editor mismatch.      |
| Ordinary app saves cannot become provider effects                            | `ARCH-S80-2`         | `BEH-S80-1`, `BEH-S80-2` | Routine work is available while source writes stay unavailable | Type/route tests prove progress/decision persistence and provider construction use distinct capabilities, audit, and confirmation. |
| Space, managed identity, suspension, and exact-key checks remain conjunctive | `ARCH-S80-3`         | `BEH-S80-3`              | UI gives the real denial reason and safe next action           | Adversarial role × Space × identity × action × suspension table denies every missing dimension before effect construction.         |
| No direct send or implicit S64 grant                                         | `ARCH-S80-3`         | `BEH-S80-2`, `BEH-S80-3` | Admin is not presented as an override                          | Static send/grant scans and direct-URL/API tests remain green separately.                                                          |

**Preservation set.**

Role hierarchy, Space isolation, managed-domain checks, Admin management denials, Action Registry
exact-key tests, runtime suspension, external execution ledgers, S64 unauthorized status, protected-
path policy, and every send/write refusal remain green separately.

**Adversarial acceptance checks.**

- **AC-S80-1** — `ARCH-S80-1` enumerates canonical page/API/control authority and fails on any
  disagreement, including the present Admin-page/Editor-API mismatch.
- **AC-S80-2** — `BEH-S80-1` proves Editor ordinary work through real route contracts, not only hidden
  controls or mocked roles.
- **AC-S80-3** — `ARCH-S80-2` and `BEH-S80-2` prove an app-owned save cannot construct a provider and a
  role cannot activate a closed key.
- **AC-S80-4** — `ARCH-S80-3` proves direct sends and implicit S64 grants remain unreachable.
- **AC-S80-5** — Any required edit under `lib/auth/**`, Firestore Rules, or protected gate code is
  prepared and surfaced but not pushed without explicit owner direction.

**Forbidden actions / hard gates.**

No S64 implementation, role/category-to-action inference, self-grant, personal identity, hidden Admin
mutation, action-key opening, preview bypass, source write, or app/client send.

**Dependencies / sequencing.**

S80 is the authority contract consumed by S77/S78/S79/S81, but it can be implemented independently as
guard alignment and tests. Any protected-path change stops at a review-ready patch until separately
authorized; unprotected page/route alignment may proceed under standing implementation authority.

**Standalone delivery contract.**

- **Deliverable now:** complete capability/effect inventory, explicit matrix module/contract,
  page/API/control parity, exact refusal reasons, audit coverage, adversarial privilege tests, and all
  unprotected alignment can reach `ALL_GATES_GREEN` without S77/S78/S81 implementation.
- **Consumes, but does not assume:** downstream screens consume matrix answers; absent screens do not
  change the matrix, and existing safe denied/unavailable rendering remains valid.
- **Externally blocked effect:** if parity requires `lib/auth/**`, Firestore Rules, protected gate
  code, or a `production_allowed` edit, AC-S80-5 is `BLOCKED` for push/deploy until explicit owner
  direction. The runner must surface a separate review-ready patch and finish every unprotected check.
- **Produces for downstream suites:** one stable capability/effect matrix, denial taxonomy, and test
  inventory used by S77, S78, S79, and S81.

**Verification and delivery contract.**

1. Before editing, record every page/API/control result and make the parity inventory fail on the
   measured Admin-page/Editor-ordinary-work disagreement; freeze global auth/action/send denials.
2. Run `npm run test:direct -- tests/unit/roles.test.ts tests/unit/renewal-notice-draft-route.test.ts tests/unit/renewal-desk-component.test.tsx tests/unit/renewal-workspace-live.test.tsx tests/unit/lease-renewal-send-boundary.test.ts` plus the new matrix and direct-route tests.
3. Run `bash scripts/verify.sh`, inspect the mechanical diff and protected-path subset, and audit
   managed-domain, Space, action-key, suspension, provider-construction, Rules, and send behavior.
4. Report `ALL_GATES_GREEN` only for a fully authorized deliverable; use `BUDGET_EXHAUSTED` only when
   explicitly budgeted. Use `BLOCKED` with AC-S80-5 and exact paths when protected delivery authority
   is absent—never silently omit the needed patch or widen authority.

**Ordered prompt sequence.**

1. Inventory every renewal page, API, control, role, Space check, action key, and effect type.
2. Add fail-first parity/privilege checks and freeze existing global auth/gate preservation.
3. Align ordinary work to the approved matrix and make refusals specific without changing exact-key
   authority.
4. Run adversarial role/Space/action/suspension/send tests and the canonical gate; surface protected
   edits separately.

**Deletion/merge recommendation.**

Remove after the matrix is deployed and represented durably in auth/product/action documentation and
privilege tests; S64 remains a separate explicitly unauthorized proposal.
