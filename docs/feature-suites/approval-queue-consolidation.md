<!-- spec-shape: overhaul-v1 -->

# S45 — Approval Queue one-card consolidation

> New 2026-07-28. Implements D-07 and consumes S40/S41/S44.
> Amended 2026-07-29 (production-unblock audit, live-production phase). Adds D60 — bulk excludes
> High and Blocked, which SUPERSEDES the 2026-07-20 `F-APPR-6` accept — and D64 — delete the dead
> bulk Execute control, add the missing bulk Close. New checks: AC-S45-9, AC-S45-10, AC-S45-11.

**Goal.** Approvals presents one clear decision card at a time on phone and desktop, with the
decision, why it matters, exact differences/evidence, allowed actions, reason requirement, and what
happens next. The same interaction and authority rules apply at every width. Filters and selection/
bulk operations exist only as deliberate secondary modes; duplicate projections, Test handoffs,
metrics walls, and alternate primary views disappear. In the live-production phase the bulk mode is
additionally honest about its own limits: a batch that contains a consequential decision is refused
by name instead of being quietly narrowed, the Execute control that has never done anything is
retired, and Close — a real state the queue needs, reachable today only by direct API — gets the
button it never had.

**What it is / how it functions.**

- **Canonical queue state.** One server-authorized ordered decision collection supplies both phone
  and desktop. It preserves decision ID/version, item/field link, risk/authority, due/age, reason
  rules, and safe environment context. There is no separate mobile business model.
- **One-card decider.** The active card shows plain title, entity context, requested decision,
  source difference/evidence link, consequence/next step, actor authority, required reason controls,
  and the exact approve/reject/return actions. After a successful decision it advances to the next
  eligible card and announces the result; refresh never repeats a completed mutation.
- **Browse and return.** A compact queue/list indicator lets the user move between cards without
  turning the page back into a dense table. S44 opens the exact field and returns to the same
  filter/card.
- **Secondary controls.** Filters open on demand. Selection mode must be explicitly entered before
  bulk controls appear. Bulk actions remain limited to already-authorized semantics and cannot
  bundle High/Blocked decisions, bypass per-item reasons, or silently approve.
- **Bulk eligibility is a named refusal, not a silent filter (D60).** Today the client only COUNTS
  consequential items — `previewBulkAction` (`components/approval/ApprovalQueueModel.ts`) returns
  `highRiskApprovals` / `linkedHighRiskApprovals` and `ApprovalQueueBulkPanel.tsx` prints
  `N High-risk approval(s) require confirmation` — while the server deliberately leaves bulk
  high-risk approval reason-optional: `planTransition` (`lib/firestore/approval-queue.ts`) applies
  `requireReason` only when `options.requireHighRiskReason` is set, which the single-item path sets
  and the bulk path does not, under the comment "Bulk high-risk approval stays reason-optional by
  owner ruling (F-APPR-6, accepted as-is)". D60 reverses that ruling. The new rule binds on the
  `QueueRiskLevel` values `High` and `Blocked` (`lib/approval/queue.ts` `QUEUE_RISK_LEVELS`) for
  every bulk action that records a decision or a terminal state — `approve`, `return`, `disable`,
  and the new `close`. A batch containing even one such item is refused WHOLE:
  `assertBulkActionInput` (`lib/firestore/approval-queue.ts`) rejects it before the per-item loop
  with an exported, byte-pinnable refusal constant (sibling of the existing
  `BULK_EXECUTE_BLOCKED_MESSAGE` / `BULK_UNAVAILABLE_ITEM_MESSAGE` pattern), so
  `POST /api/approval-queue/bulk` returns 400, no item changes status, and no Activity row is
  appended. Partial application after an implicit drop is exactly the failure mode D60 forbids: an
  operator must not be able to believe a High item was handled by a batch that skipped it. The
  client mirrors the same predicate — `canClientBulkUpdate` returns false for those items, Apply
  Bulk is disabled, and the panel names which selected items must be decided one at a time so the
  operator deselects them deliberately.
- **Triage stays open (D60 scope).** `assign` and `snooze` record no approve/deny outcome and leave
  the item open, so they remain available for High/Blocked-risk items and for `Blocked`-STATUS
  items. That path is load-bearing: `planAssign` (`lib/firestore/approval-queue.ts`) promotes a
  `Blocked` item back to `Ready for Approval` once both an assignee and a required approver exist,
  and removing it would strand every unowned item. The status rule for approval needs no new gate —
  `planTransition`'s `approve` branch already refuses anything whose `status` is not
  `Ready for Approval`.
- **Bulk Execute retirement, stage one (D64 under D-12).** Bulk Execute is a no-op control: every
  selected item short-circuits to `BULK_EXECUTE_BLOCKED_MESSAGE` in `bulkTransitionApprovalQueueItem`
  before any transition, `transitionInputFromBulk` throws if it is ever reached, and the panel
  itself admits "Execute is visible for v1, but current items will be skipped". Stage one removes
  the rendered option from the `<select>` in `ApprovalQueueBulkPanel.tsx` and from `BulkActionMode`,
  keeps `"execute"` in `QueueBulkActionSchema` (`lib/firestore/schemas.ts`) so an in-flight client or
  direct API caller still gets the existing honest skip rather than a 500, and INSTRUMENTS that
  branch with one metadata-only counter (action + timestamp + caller role; never item content,
  reason text, or identity) so the consumer evidence D-12 requires is data rather than assumption.
- **Bulk Execute deletion, stage two (S49).** Only after the instrumentation window shows zero
  non-test callers may S49 delete `"execute"` from `QueueBulkActionSchema`, the
  `input.action === "execute"` branch and `BULK_EXECUTE_BLOCKED_MESSAGE` in
  `lib/firestore/approval-queue.ts`, the `transitionInputFromBulk` throw, the `case "execute"` arm of
  `assertBulkActionInput`, and the `action === "execute"` short-circuit in `canClientBulkUpdate`,
  replacing the two pinned tests that currently assert the guarded control
  (`tests/unit/approval-queue-foundation.test.ts` "keeps bulk execute visible but guarded until
  executable runtime exists" and `tests/unit/approval-queue-component.test.tsx` "caps Select visible
  at the 50-item bulk limit and keeps execute visibly guarded") with a negative test that the enum
  rejects `execute`. Static reachability alone is never the proof.
- **Bulk Close (D64).** `close` already exists as a single-item transition — `QueueTransitionActionSchema`
  carries it, and `planTransition`'s `case "close"` enforces `can(actor.role, "manageAdmin")` plus a
  required reason and moves the item to `Closed` with `closed_at`, while `syncLinkedActionExecution`
  revokes any linked execution in the same transaction (F-APPR-4). It has no button anywhere, which
  is why the queue's only cleanup path is a direct PATCH. This suite adds `"close"` to
  `QueueBulkActionSchema` and `BulkActionMode`, requires a reason for it in `assertBulkActionInput`
  and its client twins `requiresBulkReason` / `validateBulkActionFields`, lets
  `transitionInputFromBulk` pass it through unchanged so the Admin + reason + revoke rules are the
  SAME code the single-item path runs, and adds a `close` boolean to
  `ApprovalQueueActionAvailability` (`lib/approval/queue.ts`) so `canClientBulkUpdate` can answer for
  it and a non-Admin never sees the option. Terminal items are already skipped by the `isTerminal`
  guard in the bulk loop; High/Blocked-risk items are refused by the D60 gate above, so bulk Close
  is deliberately a Low/Medium cleanup tool.
- **Mode integrity.** Production accepts/renders Live decisions only. Demo decisions live only in
  Demo. Legacy seed/reset records missing classification are rejected and repaired in S40/S45
  migration tests; names never cause a default to Live.
- **Compatibility.** Reuse the proven reason codes, exact decision mutations, audit, authority, and
  mobile interaction primitives. Hide alternate views/projections and preserve a temporary redirect
  or adapter for valid incoming links until S49 proof.
- **Buildable now (app-plane).** Queue projection, one-card UI, responsive behavior, exact links,
  secondary filters/selection, mode rejection, compatibility adapters, the D60 whole-batch refusal,
  the D64 stage-one Execute retirement plus its instrumentation, bulk Close, and tests.
- **Build to the seam (live provider).** None. Approval is an app-plane decision; any resulting
  external action still goes through its owning S20/S25/S26 contract.
- **Owner dependency (the one flip).** None.

**Open questions & assumptions.**

- _Answered 2026-07-28 (D-07):_ one-card decisions are canonical on desktop and mobile.
- _Answered 2026-07-10 (D1):_ a selected reason code satisfies Low/Medium mandatory reason; High,
  Blocked, and manual override require free text.
- _Answered 2026-07-28:_ older dense desktop coexistence is superseded; preserving business
  behavior does not require preserving parallel rendered views.
- _Assumption:_ selection/bulk remains only for actions already proven safe and homogeneous. If no
  current action satisfies that, selection mode ships without an enabled bulk mutation.
- _Answered 2026-07-29 (D60):_ the S45 tightening WINS over the 2026-07-20 `F-APPR-6` accept. Bulk
  excludes `High` and `Blocked` risk from every decision-recording action, and the exclusion is a
  whole-batch refusal with a named constant, never a silent narrowing. The owner chose the
  recommended option over both "keep the accept" and "one shared typed reason for the whole batch",
  so a batch-level reason does NOT unlock High/Blocked either. This is a contradiction being closed,
  not a new restriction: the single-item path already enforces a server-side reason.
- _Answered 2026-07-29 (D64):_ delete bulk Execute and add bulk Close. Execute is a shipped no-op
  (D-08's exact target); Close is a real transition with no UI. Retirement follows D-12's two stages
  — hide plus instrument here, delete in S49 on consumer proof — so a caller that still exists is
  discovered rather than 500ed.
- _Assumption:_ the D60 exclusion binds on `risk`, not on `status`, for `approve` / `return` /
  `disable` / `close`, and `assign` / `snooze` stay open so the existing `Blocked`-status unblock
  path survives. Record as a `Q-`/`A-` row in `docs/facts.md` at build time; an owner who wants
  triage restricted too can tighten one predicate.
- _Assumption:_ the stage-one instrumentation window is one full release cycle of real operator use
  in Production. If the counter is non-zero at S49, the caller is identified and migrated before
  deletion rather than the deletion being forced.
- Decision-complete.

**Cross-product impacts.**

- Likely touchpoints include Approval Queue routes/components, decision gather/projection,
  mobile decider, filter/bulk state, audit and execution-authority adapters, legacy seeds, and S44
  links.
- D60/D64 touch exactly these real modules: `lib/firestore/approval-queue.ts`
  (`assertBulkActionInput`, `bulkTransitionApprovalQueueItem`, `transitionInputFromBulk`,
  `planTransition`'s `requireHighRiskReason` comment and `case "close"`), `lib/firestore/schemas.ts`
  (`QueueBulkActionSchema`), `lib/approval/queue.ts` (`ApprovalQueueActionAvailability`,
  `queueActionAvailability`), `components/approval/ApprovalQueueModel.ts` (`BulkActionMode`,
  `previewBulkAction`, `canClientBulkUpdate`, `requiresBulkReason`, `validateBulkActionFields`),
  `components/approval/ApprovalQueueBulkPanel.tsx`, `components/approval/ApprovalQueue.tsx`
  (`submitBulkAction`), `app/api/approval-queue/bulk/route.ts`, and the pinned tests
  `tests/unit/approval-queue-foundation.test.ts`, `tests/unit/approval-queue-component.test.tsx`,
  `tests/unit/approval-queue-api-routes.test.ts`.
- Consumes S40 environment classification, S41 shell, S42 ownership, and S44 exact link/return.
- Supersedes S14’s intentional dense-desktop coexistence and S17 full decision projections. Keep
  reason/action/audit contracts; record the supersede markers when shipped.
- **Supersedes `F-APPR-6` (D60).** The 2026-07-20 accept is now false and must be DELETED rather
  than left standing beside its replacement, exactly as the S39 "display-only" sweep was handled.
  The shipping slice rewrites the `F-APPR-6` row in `docs/v1-remediation-decisions-2026-07-20.md`
  and the "bulk high-risk approval accepted as-is (`F-APPR-6`)" sentence in `docs/whats-next.md`,
  deletes the "Bulk high-risk approval stays reason-optional by owner ruling (F-APPR-6, accepted
  as-is)" comment in `lib/firestore/approval-queue.ts`, and records one `docs/facts.md` Supersede
  Log marker naming D60 as the superseding decision. `F-V1-REMEDIATION-DECISIONS` keeps its other 21
  rulings; only the bulk-high-risk clause changes.
- **Hands stage two to S49 (D64).** S49 owns the Execute deletion and inherits the named
  instrumentation counter as its consumer proof. S45 leaves the server branch reachable and honest.

**Adversarial acceptance checks.**

- **AC-S45-1** — Phone and desktop render the same active decision/version and the same allowed
  actions/reason rule, with no dense parallel table or alternate primary projection in the normal
  flow. _Verify:_ shared projection/component and cross-viewport browser tests.
- **AC-S45-2** — Low/Medium accepts a chosen reason code; High/Blocked/manual override refuses
  without required free text. A stale version, unauthorized actor, changed source, or technical
  blocker writes no decision. _Verify:_ authority/audit/decision negative tests.
- **AC-S45-3** — Completing a card creates one decision/audit effect, announces the result, and
  advances once. Refresh/retry/idempotency never duplicates it. _Verify:_ route/service concurrency
  tests.
- **AC-S45-4** — Exact evidence opens the disputed field and Back restores filter/card. An invalid
  return or inaccessible item reveals no data. _Verify:_ S44 consumer browser/security tests.
- **AC-S45-5** — Filters and bulk controls are absent until invoked; bulk cannot include High,
  Blocked, mixed-version, mixed-context, or individually reasoned decisions. _Verify:_ selection and
  bulk refusal tests.
- **AC-S45-6** — Production rejects missing/Test/Demo classification and renders Live decisions
  only; Demo renders Demo decisions only. The legacy bad seed cannot produce a `LIVE` label from an
  omitted field. _Verify:_ schema/seed/environment regression tests.
- **AC-S45-7** — At 390×844 the full decision, evidence, reason, and primary actions are usable
  without horizontal overflow or shell/Feedback overlay; keyboard/focus/announcement behavior
  passes. _Verify:_ authenticated mobile browser task.
- **AC-S45-8** — `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run test:e2e:core`, `npm run verify:spec-traceability`, and `npm run build` pass; keep S20
  authority, decision audit, environment, route-link, and idempotency sentinels green.
- **AC-S45-9** (D60) — `POST /api/approval-queue/bulk` with `action` in `approve` / `return` /
  `disable` / `close` and an `item_ids` list containing one item whose `risk` is `High` or `Blocked`
  returns HTTP 400 whose body carries the exported refusal constant byte-for-byte; re-reading every
  id in that batch shows the SAME `status` and `updated_at` as before the call and the
  `approval_queue_activity` trail has grown by zero rows — the eligible siblings are not applied
  either. Supplying `confirm_high_risk:true`, a batch-level `reason`, or both still returns the same 400. The identical selection submitted one item at a time through the single-item path still
  succeeds with the existing High-risk confirmation plus server-required reason, so no legitimate
  decision is lost. In the UI, selecting such an item disables Apply Bulk and renders text naming
  which selected items are decided one at a time; no item silently leaves the selection. _Verify:_
  `npm test -- tests/unit/approval-queue-api-routes.test.ts`,
  `npm test -- tests/unit/approval-queue-foundation.test.ts`,
  `npm test -- tests/unit/approval-queue-component.test.tsx`; keep the decision-audit and
  execution-authority sentinels green.
- **AC-S45-10** (D64 stage one) — The rendered Action `<select>` in the bulk panel offers no
  `Execute` option at any viewport and for any role, and the "Execute is visible for v1" preview
  sentence is absent from the DOM. A direct `POST /api/approval-queue/bulk` with
  `{"action":"execute"}` still returns 200 with every item `outcome:"skipped"` and the existing
  no-runtime message (no 500, no schema rejection), and that call increments exactly one
  metadata-only instrumentation record whose serialized fields contain no item summary, reason text,
  assignee uid, or approver uid. `assign` / `snooze` remain available for a `Blocked`-status item and
  a bulk assign supplying both an assignee and a required approver moves it to `Ready for Approval`.
  _Verify:_ `npm test -- tests/unit/approval-queue-component.test.tsx`,
  `npm test -- tests/unit/approval-queue-api-routes.test.ts`; keep
  `tests/unit/approval-queue-foundation.test.ts` green.
- **AC-S45-11** (D64 bulk Close) — An Admin who selects two Low/Medium non-terminal items, chooses
  `Close`, and supplies a reason sees both move to `Closed` with `closed_at` set and exactly one
  `closed` Activity row each carrying that reason; a linked execution on either item reads back
  revoked in the same transaction. The same request from an Approver or Editor returns the
  Admin-required refusal and changes nothing, and those roles are never offered the option in the
  UI. Close with a blank or whitespace reason returns 400 and writes nothing. Replaying the same
  request adds no second Activity row, because the already-terminal items skip. _Verify:_
  `npm test -- tests/unit/approval-queue-foundation.test.ts`,
  `npm test -- tests/unit/approval-queue-api-routes.test.ts`; keep the S20 execution-authority and
  idempotency sentinels green.

**Forbidden actions / hard gates.** Never convert a rendered card or bulk selection into execution
authority. Never bulk High/Blocked decisions or bypass item-specific reason/version/source checks:
per D60 a batch containing a `High` or `Blocked` item is refused WHOLE by name, and silently
dropping it from the batch, auto-downgrading its risk, or accepting a single batch-level reason in
its place is itself a falsification. Never let a `High`-risk approval reach the append-only Activity
trail without a reason on any path. Never delete the bulk Execute server branch in this suite —
D-12 requires the hide-plus-instrument stage first, and static reachability alone is never deletion
proof; equally, never leave the dead Execute control rendered to an operator. Never let bulk Close
bypass the Admin capability check, the required reason, or the linked-execution revoke that the
single-item `close` path already enforces; bulk Close reuses that exact code rather than a parallel
writer. Never let the retirement instrumentation record item content, reason text, or any principal
identity. Never default missing mode to Live or mix environments. An approval may unlock an existing
action but cannot execute a provider side effect unless the owning contract separately requires and
receives exact confirmation. Preserve the standing NEVERs: no autonomous CLIENT-facing send
(internal-staff notifications may auto-send per `D-AUTOMATION-LINE`); generic non-workflow
`gmail.message.send` stays Registry-closed; no personal account in any auth path; no secrets, PII,
or guessed endpoint in git; every live effect one-attempt, idempotent, receipted, and reversible,
with every client-facing send OR system-of-record write additionally human-confirmed; interactive
auth, credential/scope grants, IAM/billing changes, and destructive operations stay owner-run;
routine application deploy, smoke, exact-revision traffic promotion, and rollback follow D05 after
their gates and preflights pass; and this suite stays inside the production cost ceiling defined by
S52.

**Ordered prompt sequence.**

1. _Discovery:_ inventory every Approval view/projection, mutation, reason rule, filter/bulk path,
   direct link, seed, and responsive test; identify canonical business logic versus duplicate UI.
2. _Understanding:_ pin one projection/card state machine and the authority/reason/idempotency
   matrix; write failing parity, missing-mode, and mobile-task tests first.
3. _Build:_ compose the one-card experience from proven actions/audit primitives and S44 links;
   make filters/browse/selection secondary.
4. _Build:_ repair strict classification and stage-one redirects/adapters; hide duplicate views,
   Test handoffs, and metrics panels.
5. _Build:_ D60 — add the exported whole-batch refusal constant and enforce it in
   `assertBulkActionInput` for `approve` / `return` / `disable` / `close`; delete the
   reason-optional `F-APPR-6` comment in `planTransition`; mirror the predicate in
   `canClientBulkUpdate` / `previewBulkAction` and in the panel's disabled Apply plus its
   name-the-items copy. Write the AC-S45-9 failing tests first, including the negative case that a
   batch-level reason does not unlock the batch.
6. _Build:_ D64 stage one — remove `Execute` from `BulkActionMode` and the rendered `<select>`,
   keep the server branch returning the existing honest skip, and add the metadata-only
   instrumentation counter. Then add bulk Close: extend `QueueBulkActionSchema`, `BulkActionMode`,
   `requiresBulkReason`, `validateBulkActionFields`, `assertBulkActionInput`, and the new `close`
   flag on `queueActionAvailability`, passing straight through to the existing `planTransition`
   `case "close"` so Admin capability, required reason, and linked-execution revoke are unchanged
   code.
7. _Verify:_ falsify stale/double decisions, reason bypass, bulk escalation, mixed context, generic
   links, mobile overflow, focus loss, and seed default-to-Live. Additionally falsify: a High item
   surviving a batch as a skip rather than a refusal; a batch-level reason unlocking High; an
   Approver reaching bulk Close; a Close batch replay writing a second Activity row; the
   instrumentation payload carrying reason text or a uid.
8. _Gate:_ no action gate. Confirm no provider action executes merely because the decision is saved,
   and that the Execute branch still executes nothing.
9. _Context update:_ add the shipped S45 fact citing AC-S45-1 through AC-S45-11, add the S14/S17
   supersede markers AND the `F-APPR-6` Supersede Log marker naming D60, delete the now-false
   bulk-high-risk accept from `docs/v1-remediation-decisions-2026-07-20.md` and `docs/whats-next.md`,
   clear the two bulk items from the manual-QA known-gap list, hand the Execute deletion to S49 with
   its instrumentation evidence, and advance `docs/loop-state.md` to S46.

**Deletion/merge recommendation.** KEEP this spec. MERGE mobile and desktop onto one decision model
and interaction. RETIRE_UI alternate projections/dense views in stage one; S49 deletes them only
after link/role/usage proof. Bulk Execute follows the same two-stage rule: RETIRE_UI here with
instrumentation, DELETE in S49 on consumer proof. DELETE the `F-APPR-6` bulk-high-risk accept
outright when D60 ships — a superseded governance clause is deleted and marked, never left standing
next to its replacement. The disposable packet for this cycle stays
`docs/temp/approval-queue-bulk-actions-cycle.md`-style local evidence and is not tracked as durable
guidance.
