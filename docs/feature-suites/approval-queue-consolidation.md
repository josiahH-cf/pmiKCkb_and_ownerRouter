<!-- spec-shape: overhaul-v1 -->

# S45 — Approval Queue one-card consolidation

> New 2026-07-28. Implements D-07 and consumes S40/S41/S44.

**Goal.** Approvals presents one clear decision card at a time on phone and desktop, with the
decision, why it matters, exact differences/evidence, allowed actions, reason requirement, and what
happens next. The same interaction and authority rules apply at every width. Filters and selection/
bulk operations exist only as deliberate secondary modes; duplicate projections, Test handoffs,
metrics walls, and alternate primary views disappear.

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
- **Mode integrity.** Production accepts/renders Live decisions only. Demo decisions live only in
  Demo. Legacy seed/reset records missing classification are rejected and repaired in S40/S45
  migration tests; names never cause a default to Live.
- **Compatibility.** Reuse the proven reason codes, exact decision mutations, audit, authority, and
  mobile interaction primitives. Hide alternate views/projections and preserve a temporary redirect
  or adapter for valid incoming links until S49 proof.
- **Buildable now (app-plane).** Queue projection, one-card UI, responsive behavior, exact links,
  secondary filters/selection, mode rejection, compatibility adapters, and tests.
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
- Decision-complete.

**Cross-product impacts.**

- Likely touchpoints include Approval Queue routes/components, decision gather/projection,
  mobile decider, filter/bulk state, audit and execution-authority adapters, legacy seeds, and S44
  links.
- Consumes S40 environment classification, S41 shell, S42 ownership, and S44 exact link/return.
- Supersedes S14’s intentional dense-desktop coexistence and S17 full decision projections. Keep
  reason/action/audit contracts; record the supersede markers when shipped.

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

**Forbidden actions / hard gates.** Never convert a rendered card or bulk selection into execution
authority. Never bulk High/Blocked decisions or bypass item-specific reason/version/source checks.
Never default missing mode to Live or mix environments. An approval may unlock an existing action
but cannot execute a provider side effect unless the owning contract separately requires and
receives exact confirmation. Preserve no autonomous client send, generic-send closure, managed
identity, secrets/PII exclusion, one-attempt/reversible effects, and the cost cap.

**Ordered prompt sequence.**

1. _Discovery:_ inventory every Approval view/projection, mutation, reason rule, filter/bulk path,
   direct link, seed, and responsive test; identify canonical business logic versus duplicate UI.
2. _Understanding:_ pin one projection/card state machine and the authority/reason/idempotency
   matrix; write failing parity, missing-mode, and mobile-task tests first.
3. _Build:_ compose the one-card experience from proven actions/audit primitives and S44 links;
   make filters/browse/selection secondary.
4. _Build:_ repair strict classification and stage-one redirects/adapters; hide duplicate views,
   Test handoffs, and metrics panels.
5. _Verify:_ falsify stale/double decisions, reason bypass, bulk escalation, mixed context, generic
   links, mobile overflow, focus loss, and seed default-to-Live.
6. _Gate:_ no action gate. Confirm no provider action executes merely because the decision is saved.
7. _Context update:_ add the shipped S45 fact and S14/S17 supersede markers, update manual QA, and
   advance `docs/loop-state.md` to S46.

**Deletion/merge recommendation.** KEEP this spec. MERGE mobile and desktop onto one decision model
and interaction. RETIRE_UI alternate projections/dense views in stage one; S49 deletes them only
after link/role/usage proof.
