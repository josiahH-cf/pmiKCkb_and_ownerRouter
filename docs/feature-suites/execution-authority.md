<!-- spec-shape: overhaul-v1 -->

# S20 — Risk-bounded execution authority

> New 2026-07-14. Implements R01 and the Round 2 Admin self-approval decision. This supersedes the
> former “Editor always prepares; Approver/Admin always sends” product rule. **Status: Local green on
> 2026-07-14**; all Registry values and live/external gates remain unchanged.

**Goal.** Internal Editors directly complete enabled Low/Medium work without an approval detour, while
consequential High actions remain Admin-approved and invalid or technically blocked actions remain
closed. Admins may approve and execute their own proposal at every risk. The UI, API, Action Registry,
and audit all derive from one server-side decision so no surface can silently widen authority.

**What it is / how it functions.**

- **Risk contract — `lib/execution/risk-policy.ts` (new).** Classifies an action instance, not merely
  an action type. Low = read/health/local draft or reversible governed label. Medium = exact-confirmed
  workflow email/portal/SMS communication or immediate validated app content publication. High =
  system-of-record value/status change, document creation/upload, unbounded or overwrite/delete Drive
  write, account/invite/role,
  OAuth-token lifecycle, vendor assignment, or accounting draft. Blocked = missing evidence,
  authoritative source, required value, scope, connection, documented endpoint, registry readiness,
  or failed validation.
- **Authority decision — `lib/execution/authority.ts` (new).** Editor: execute enabled Low/Medium;
  propose High; never execute Blocked. Admin: execute Low/Medium and self-approve High with exact
  preview plus reason; may resolve a business-review Blocked item only after its blocker becomes
  satisfied. Approval never bypasses a failed technical invariant or `production_allowed:false`.
  Approver remains supported and may approve High only where an action policy explicitly grants it;
  V1 defaults consequential writes to Admin.
- **Human send.** An internal Editor may exact-confirm an enabled workflow-linked email, portal, or SMS
  communication because R01 classifies that human-confirmed instance Medium. Autonomous/bulk/scheduled
  send remains forbidden. Vendor sends follow S22, not the internal Editor role.
- **State machine.** `Draft → Ready → Executing → Succeeded|Failed|Needs reconciliation`; High inserts
  `Awaiting Admin → Approved|Returned|Revoked` before execution. One immutable execution id binds
  action key, actor, risk, preview hash, approval, attempt, result, and correction/rollback reference.
- **Buildable now (app-plane).** Pure classifier/authority modules, proposal state, audit schema,
  server-derived UI availability, fake executor tests, and migration of existing queue decisions.
- **Gated (owner / vendor).** Every real external action, registry promotion, live role claim change,
  deploy, and production proof remains separately gated by its suite and action key.

**Open questions & assumptions.**

- _Answered 2026-07-14:_ Editors directly execute enabled Low/Medium; Admin approval is required for
  consequential High writes; Admin may self-approve at all risks.
- _Answered 2026-07-14:_ linked exact-confirmed email/portal/SMS is Medium; no-autonomous-send remains.
- _Assumption:_ “Blocked requires Admin approval” means Admin owns the decision after remediable
  business review, not that Admin can override a missing credential, endpoint, source, scope, or failed
  safety validation. This is required by the still-binding Action Registry and security rules.
- _Answered 2026-07-14:_ immediate validated publication is Medium and does not enter Approval Queue.
- _Client-owned:_ none. Per-system credentials and production executions are operational gates, not
  product questions.

**Cross-product impacts.** Touches `lib/auth/roles.ts`, `lib/approval/`, `lib/integrations/action-gate.ts`,
Action Registry schema/seed, Approval Queue/Console action controls, Firestore rules/audit, S14, S19,
and every S25/S26 executor. Supersede marker: `V1-EDITOR-PREPARE-ONLY` in `docs/facts.md`. Existing
exact-confirmation, source-state, space-scope, and value-free inbox invariants are extended.

**Adversarial acceptance checks.**

- **AC-S20-1** — One server policy returns direct execution for Editor Low/Medium and `Awaiting Admin`
  for Editor High; Editor Blocked is refused with named unmet conditions. _Verify:_ `npm test --
execution-authority`.
- **AC-S20-2** — Admin may approve their own High proposal with a non-empty reason and matching preview
  hash; a stale hash, returned/revoked item, or second claim causes zero executor calls. _Verify:_
  `npm test -- execution-authority approval-queue`.
- **AC-S20-3** — Exact-confirmed workflow email/portal/SMS is Medium, but scheduled, model-triggered,
  bulk, recipient-drifted, or unconfirmed send is Blocked for every role. _Verify:_ `npm test --
execution-authority gmail-hub-service`.
- **AC-S20-4** — Every system-of-record/document/account/OAuth/accounting mutation and every unbounded,
  overwrite, or delete Drive mutation classifies High regardless of UI input; a browser cannot submit
  `risk:"Low"`. The only Drive exception is S26's validated append-only photo into the configured
  assigned-ticket folder, which is Medium. _Verify:_ `npm test -- execution-risk-policy
route-auth-boundary`.
- **AC-S20-5** — `production_allowed:false`, undocumented evidence, missing permission, failed source
  validation, or absent authoritative value prevents execution even after Admin approval. _Verify:_
  `npm test -- action-gate action-registry-schema execution-authority`.
- **AC-S20-6** — One execution id yields at most one attempt and an append-only bodyless audit under
  double-click, concurrency, timeout, and retry. Ambiguity becomes `Needs reconciliation`. _Verify:_
  `npm test -- execution-ledger`; `npm run test:firestore`.
- **AC-S20-7** — UI affordances equal the server decision for Editor, Approver, Admin, wrong scope, and
  Vendor; direct API calls cannot exceed them. _Verify:_ `npm test`; keep role/scope/route sentinels green.
- **AC-S20-8** — Full checks pass: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm
test`, `npm run verify:router-boundary`, `npm run verify:spec-traceability`, and `npm run build`.

**Forbidden actions / hard gates.** No live execution or registry flip in the authority slice. No
autonomous/bulk/scheduled send. No client data in audit. Admin self-approval never bypasses technical
Blocked conditions, documented-evidence rules, exact confirmation, source validation, scope, or the
action gate. No new role claim is minted live. Deploy remains owner-run; ~$10 cap applies.

**Ordered prompt sequence.**

1. _Discovery:_ map every current role check, queue action, executor gate, and audit state; pin current
   behavior with tests before editing.
2. _Understanding:_ enumerate all current/future action keys and assign the immutable default risk
   above; add instance-risk elevation only, never browser-controlled lowering.
3. _Build:_ implement pure classification/authority and shared denial reasons.
4. _Build:_ implement execution/proposal ledger, preview hash, one-attempt claim, reconciliation state,
   and append-only audit with emulator tests.
5. _Build:_ derive Approval Queue, Console, and route availability from the server decision; migrate
   internal Editor Low/Medium behavior without granting Vendor/internal-space crossover.
6. _Verify:_ run focused adversarial tests, then the full list; falsify direct API, stale preview,
   double-click, Admin self-approval, and technical Blocked override.
7. _Gate:_ stop before any Action Registry promotion, live role change, send, write, or deploy.
8. _Context update:_ add `F-V1-EXECUTION-AUTHORITY-BUILT` citing AC-S20-1..8; update plan/status/loop
   and the supersede log at the slice boundary.

**Deletion/merge recommendation.** KEEP as the canonical cross-product execution-authority spec.
MERGE current-state evidence from S14/S19 through references; do not rewrite their historical ACs.
