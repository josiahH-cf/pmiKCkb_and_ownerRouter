# Loop state

Last updated: 2026-08-31. Resume here after reading `AGENTS.md` and `docs/facts.md`.

## Objective

Execute the audited S82-S96 initiative from its one canonical queue, beginning with the UX-005
connector-disconnect safety closure, without treating specified behavior as deployed truth or
weakening any existing effect boundary.

## Current checkpoint

- Production serves `pmi-kc-app-rmtg73suu-fe8734d35330` / commit
  `1d68c7fb0a4f3138b9d0ba410d221b44bfb5534c` at 100% traffic. Immediate rollback is
  `pmi-kc-app-rmtfzwn77-8153d75d1cd5`.
- S77, S59, S80, S72, S75, S78, S74, S79, S81, S63 machinery, and the S30 closed proof runner are
  implemented and deployed. Exact-SHA CI run `33330420327` is green.
- S82-S96 are audited, mutually reconciled specifications, not implementation. Their sole queue is
  `docs/feature-suites/README.md`.
- Documentation Gate 0 is complete. Specification closure
  `081fa90071170054e53a2182a68466fbccf4ebf4` passed local canonical verification and exact-SHA
  aggregate CI run `33425658400`; the pointer-only handoff armed S96 without a deployment.
- S96 solely owns connector disconnect/reconciliation and is the first executable suite. S86 consumes
  and preserves it; no other suite may invent a second disconnect lifecycle or vault contract.
- The queue uses S83 for access/authority relocation, S84 for primary navigation, and S82 for renewal
  desk/workspace behavior. No P1-P3 score exists without task-frequency evidence.
- S94 runs once before S93 against strict S93-slot fixtures; S93 then integrates the real contract
  once. Their later join is verification only, not another suite execution.
- S95 consumes S87's specified disposition manifest; S87 implementation remains last, avoiding a
  dependency cycle.
- No feature implementation, cloud mutation, deployment, external effect, role grant, or action-key
  change occurred during the specification audit.
- `.claude/settings.local.json` and `output/` are user-owned untracked files; exclude them from every
  commit and Cloud Build upload.

## Next exact action

Re-verify S96 connector component/route/store/vault/setup/auth truth, freeze its preservation
baseline, and materialize the named fail-first inertness/reconciliation tests before implementation;
do not begin S85.

## Canonical queue

1. S96
2. S85
3. S86
4. S83
5. S84
6. S82
7. S88
8. S89
9. S90
10. S91
11. S92
12. S94
13. S93
14. S93/S94 integration verification gate
15. S95
16. S87 and final end-to-end verification

Advance only after the preceding suite's complete delivery gate in the manifest. Default to serial
execution in the shared checkout; use only the manifest's explicitly safe isolated-worktree
parallelism.

## Parallel external items

- S63 secure exact-four packets and real reviewer.
- S30 exact secure designation and separate protected owner direction.
- Approved owner/tenant wording, timing/override policy, and real human litmus observations.
- Official PMI brand package, live-vault proof, distinct rehearsal Sheet, and exact provider seams.

Missing external evidence blocks only its named proof/conformance check. Never invent it or substitute
a customer, lease, credential, policy, brand value, or model judgment.

## Safety invariants

No live RentVine write, operating-Sheet write, autonomous/app client send, self-granted access,
action-key opening, fake/sample record, guessed provider/customer value, personal identity,
secret/client evidence in Git, cost-control change, or protected-path push without exact authority.
Every authorized live effect remains human-initiated, exact-previewed, exact-confirmed,
idempotent/at-most-once as specified, receipted, read back, reversible, and bounded.
