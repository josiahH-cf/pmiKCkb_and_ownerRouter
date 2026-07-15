# AI Execution Workflow

This is the human/AI collaboration contract for delivering and operating the working V1.

## 1. Establish Truth

- Read `docs/facts.md` and `docs/loop-state.md` first.
- Verify repository, environment, and cloud state before declaring a blocker.
- Resolve ambiguity from code/docs/transcripts and use the recommended safe default.
- Ask the developer before escalating an answerable implementation question to the client.

## 2. Separate Application Readiness from Provider Activation

The app is V1 when the pinned production revision, authentication, primary tabs, complete
workflows, safety boundaries, monitoring, and rollback work. Provider activation is a separate
per-action inventory.

- Production Test evidence may close app-workflow acceptance when it uses reserved aliases,
  zero external calls, explicit Test labels, and non-Live receipts.
- Only Live-lane evidence may claim a provider is Live-proven or enabled.
- A missing provider contract/credential blocks that action's Live activation, not development
  or acceptance of the stable application.
- Stakeholder signoff is tracked and useful but does not override observed application state.

## 3. Build a Complete Slice

For each slice, define:

- user and desired outcome;
- Live or Test lane;
- exact role/scope;
- source of every value;
- app write and any external effect;
- preview/confirmation requirement;
- receipt, failure, reconciliation, and rollback behavior;
- unit, Firestore, E2E, and browser evidence;
- documentation/fact updates.

Use invented aliases and Test providers whenever Live setup is unavailable. Test records may
write real Firestore/application state and reach Done. They must be structurally unable to
construct a Live provider client.

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

Never infer a provider endpoint or use a Test receipt as Live proof.

## 5. Retention and Operations

Bodyless persistence, explicit legal hold, bounded on-demand cleanup, and health reporting are
the working V1 default. TTL, additional indexes, and Scheduler automation are improvements to
consider when volume/operational evidence justifies them.

Before cloud work, run ADC, identity, budget, and production preflights. Capture the prior
serving revision. After deployment, verify signed-in roles, Live/Test labels, complete Test
journeys, provider activation labels, observability, and traffic rollback.

## 6. Evidence and Documentation

- Put exact acceptance checks in the relevant feature-suite spec.
- Put verified dated claims in `docs/facts.md`.
- Append implementation evidence to `docs/status.md`.
- Keep `docs/loop-state.md` as the current resume pointer.
- Update `docs/plan.md` in the same slice as any phase change.
- Keep secrets, customer values, Gmail bodies, and setup links out of evidence.

## 7. Blocker Format

A genuine blocker names:

- the exact action/surface affected;
- the missing external value or authority;
- what was already checked;
- the safest recommended default;
- a command or UI process to resolve it;
- the evidence that closes it;
- work that can continue using Test data meanwhile.

Do not write “coordinate with client” when a concrete recommendation can be made.

Runner-neutral execution details live in `docs/autonomous-agent-runner.md`. Draft cycle packets use
`docs/autonomous-feature-cycle-packet-template.md` and belong under `docs/temp/` until a durable
decision is promoted into the governed docs.
