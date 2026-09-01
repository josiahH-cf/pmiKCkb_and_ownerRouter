# What is next

Updated: 2026-09-01.

## Immediate action

Begin S84. Re-verify the deployed AppShell/PrimaryNav, S81 destinations, S83 role-aware Admin/access
and Approval Queue reachability, S85 Appearance utility, S86 transient coordination, notification
menu, environment badge, role badge, and sign-out truth. Freeze the named desktop/mobile disclosure,
actor-filtering, terminology, active-state, keyboard/touch/focus, and utility-preservation tests
before implementation; do not begin S82.

Documentation Gate 0 is complete through specification closure
`081fa90071170054e53a2182a68466fbccf4ebf4`, exact-SHA aggregate CI run `33425658400`, and the
pointer-only queue handoff. Do not repeat the audit or readiness gate. Preserve
`.claude/settings.local.json` and `output/` as untracked user-owned content.

## Implementation sequence

Use only the canonical queue in `docs/feature-suites/README.md`: S96, S85, S86, S83, S84, S82,
S97, S98, S99, S100, the S36 temporary pilot/restoration gate, S88, S89, S90, S91, S92, S94, S93,
the S93/S94 integration gate, S95, and S87. Each suite executes once. S83 owns access, S84 primary
navigation, S82 renewal UI, S97-S100 exact source effects, S36 its temporary cloud lifecycle, and S87
the final six-cohort reconciliation.

The desired S36, S82, S84, and S87-S100 behavior is specified but not deployed. S96, S85, S86, and
S83 are complete and deployed. Continue to describe the current application using live readback and
implemented facts until each remaining suite passes its delivery and release gates.

## Safe state while advancing

- Assistant queries never grant access, start workflows, create generic approvals, send client
  communication, or execute the S97-S100 source actions.
- S94's only V1 write is one reviewed, human-confirmed renewal-to-self My Work task with exact
  idempotency and readback; production exposure waits for both dedicated secrets.
- S96 can complete its code/readback gates without destroying a live credential; live-vault proof is
  separate evidence.
- S89 establishes the privacy-safe Ask rollback floor before assistant exposure.
- S95 changes `/` and `/ask` together only after complete S93/S94 integration and destination parity.
- Official-brand sign-off and task-frequency priority scores are not inferred.

## Runtime evidence

No product question remains open. The secure owner instruction supplies the sole S97 target; every
other provider id/value/catalog, actor session, confirmation, mailbox mapping, and S36 source packet
is resolved fresh under its suite. Missing/stale evidence blocks only that exact live effect after
all independent closed work is green. Official brand and real human litmus evidence remain separately
reported conformance evidence, never model-filled authority.
