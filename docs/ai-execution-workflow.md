# AI Execution Workflow

This is the human/AI collaboration contract for delivering and operating the full product. The
active UI/environment program is S40–S50.

## 1. Establish Truth

- Read `docs/facts.md`, `docs/loop-state.md`, and
  `docs/ui-ux-recalibration-implementation-program-2026-07-28.md` first.
- Verify repository, environment, and cloud state before declaring a blocker.
- Treat D-01–D-14 as settled. Resolve implementation placement from current code; meet the exact
  observable end state without demanding the example filename/layout.
- Ask the developer before escalating an answerable implementation question to the client.

## 2. Separate Environment, Product Readiness, and Provider Activation

The app is V1 when the pinned production revision, authentication, primary tabs, complete
workflows, safety boundaries, monitoring, and rollback work. Provider activation is a separate
per-action inventory.

- Local rehearsal evidence may close read-only/refusal acceptance only when it resolves explicitly
  to `environmentKind:"demo"` plus `dataContext:"live_readonly"`, performs zero durable writes or
  Live-provider effects, and creates no receipt. Former Production Test journeys remain historical
  evidence only; deterministic invented scenarios belong in automated tests.
- Only Live-lane evidence may claim a provider is Live-proven or enabled.
- A missing provider contract/credential blocks that action's Live activation, not development
  or acceptance of the stable application.
- Stakeholder signoff is tracked and useful but does not override observed application state.
- Production is Live-only. Local Demo + Live-read-only is explicit, has no invented product lane,
  and can close no mutation/provider evidence. The hosted Demo GCP project is deferred.

## 3. Build a Complete Slice

For each slice, define:

- user and desired outcome;
- environment and data context: Production + Live, or local
  `environmentKind:"demo"` + `dataContext:"live_readonly"` with `source:"explicit"`;
- exact role/scope;
- source of every value;
- app write and any external effect;
- preview/confirmation requirement;
- receipt, failure, reconciliation, and rollback behavior;
- unit, Firestore, E2E, and browser evidence;
- documentation/fact updates.

Use deterministic automated tests for invented aliases when Live setup is unavailable. The local
rehearsal runtime may read bounded Live data but must be structurally unable to write application
state, create receipts, or construct a Production/Live effect client. Build the Live provider and
full action contract to its documented seam rather than stopping at refusal-only local evidence.

For S40–S50 also define the owning surface, exact item/evidence/return link, first task action at
desktop/390×844, plain operator copy, role/environment negative states, stage-one compatibility,
and deletion proof. Shipped simulations/no-op Sample/Test tools leave; automated tests, local
read-only/refusal proof, security, rollback, and real provider seams stay.

## 4. Live Action Promotion

Activate one action at a time after verifying:

1. canonical action key and immutable risk;
2. documented endpoint/contract and authoritative mapping;
3. least-privilege identity/credential storage;
4. exact target/effect preview;
5. role-specific confirmation or Admin decision;
6. one-attempt/idempotency behavior;
7. bodyless receipt and readback/reconciliation;
8. monitoring and kill switch;
9. correction/rollback rehearsal.

Never infer a provider endpoint or use local rehearsal evidence as Live proof. When every item above is
documented, open the owning action’s `production_allowed`/allowlists/pinned tests in the same
reviewed slice; do not leave finished actions gated by habit.

## 5. Retention and Operations

Bodyless persistence, explicit legal hold, bounded on-demand cleanup, and health reporting are
the working V1 default. TTL, additional indexes, and Scheduler automation are improvements to
consider when volume/operational evidence justifies them.

Before cloud work, run ADC, identity, budget, and exact environment/production preflights. Capture
the prior serving revision. Deploy the Production candidate at zero traffic, smoke the exact
descriptor, promote deliberately, and preserve rollback. Verify signed-in roles, Production
Live-only behavior, provider activation labels, observability, and traffic rollback. Verify local
rehearsal separately with the explicit Demo + Live-read-only descriptor and mutation/effect refusals;
do not provision a hosted Demo project.

## 6. Evidence and Documentation

- Put exact acceptance checks in the relevant feature-suite spec.
- Put verified dated claims in `docs/facts.md`.
- Append implementation evidence to `docs/status.md`.
- Keep `docs/loop-state.md` as the current resume pointer.
- Update `docs/plan.md` in the same slice as any phase change.
- Keep secrets, customer values, Gmail bodies, and setup links out of evidence.
- For two-stage retirement, record the candidate/consumer/role/route/script/test/provider/security/
  deployed-boundary/rollback proof; static reachability alone is not evidence for deletion.

## 7. Blocker Format

A genuine blocker names:

- the exact action/surface affected;
- the missing external value or authority;
- what was already checked;
- the safest recommended default;
- a command or UI process to resolve it;
- the evidence that closes it;
- work that can continue in the app-plane, automated tests, and local read-only rehearsal meanwhile.

Do not write “coordinate with client” when a concrete recommendation can be made.

Runner-neutral execution details live in `docs/autonomous-agent-runner.md`. Draft cycle packets use
`docs/autonomous-feature-cycle-packet-template.md` and belong under `docs/temp/` until a durable
decision is promoted into the governed docs.
