# Loop state

Last updated: 2026-08-31. Resume here after reading `AGENTS.md` and `docs/facts.md`.

## Objective

Execute the single canonical S96-through-S87 queue, including exact source-of-truth writeback and
the temporary Space pilot, without treating specified behavior as deployed truth or widening any
effect beyond the owner-authorized keys and suite contracts.

## Current checkpoint

- Production serves `pmi-kc-app-rmtg73suu-fe8734d35330` / commit
  `1d68c7fb0a4f3138b9d0ba410d221b44bfb5534c` at 100% traffic. Immediate rollback is
  `pmi-kc-app-rmtfzwn77-8153d75d1cd5`.
- Current implementation remains Production + Live with eleven Spaces, managed identity, seven open
  keys, the operating-Sheet write switch off, and S30's closed one-lease `endDate` proof runner.
- S36 and S82-S100 are specified desired-state contracts, not implementation. Their sole queue and
  completion gates are in `docs/feature-suites/README.md`.
- The prior UI/assistant documentation gate passed exact-SHA CI. The 2026-08-31 owner decision pass
  additionally closed every product question for S36/S97-S100 and authorized their exact future
  protected activation/live proof contracts; it performed no feature, cloud, provider, key, role,
  Sheet, draft, or deployment effect.
- S96 remains first and solely owns connector disconnect/reconciliation. S86 must preserve it.
- S97 removes obsolete multi-record proof machinery and consumes S30's safety primitives. S98
  removes the obsolete copy-only Sheet path. S99/S100 replace synthetic or inert provider seams with
  exact official operations. S36 ends with its temporary resources gone and the eleven-store/flag
  baseline restored.
- S94 runs once before S93 against strict S93-slot fixtures; their later join is verification only.
  S95 consumes S87's specified disposition manifest; S87 implementation remains last.
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
7. S97
8. S98
9. S99
10. S100
11. S36 temporary pilot and restoration gate
12. S88
13. S89
14. S90
15. S91
16. S92
17. S94
18. S93
19. S93/S94 integration verification gate
20. S95
21. S87 and final end-to-end verification

Advance only after the preceding suite's complete delivery gate. Default to serial execution; use
only the manifest's explicitly safe isolated-worktree S90/S91 parallelism.

## Runtime inputs, not product questions

- S97 receives the owner-designated real ended-lease URL in the execution prompt and resolves every
  current provider value fresh. Stop on drift; never substitute another target or commit its values.
- S98 derives its temporary proof row from fresh real sources and the live operating schema. S99
  uses a staff-selected real work order or exact staff-confirmed creation proposal and live provider
  catalogs. S100 maps exact official messages and resident email at runtime. S36 deterministically
  derives its saved request and copied source packet from current approved state.
- Missing credentials, actor sessions, identifiers, catalogs, or fresh values block only the exact
  live effect after every independent closed-state deliverable is green. They are never guessed.

## Safety invariants

No direct client send, self-granted access, generic/bulk provider call, fake/sample identity or
customer value, guessed endpoint/mapping/recipient, personal runtime identity, secret/client evidence
in Git, cost-control change, or effect outside an exact listed key. Every authorized live write is
human-initiated, exact-previewed, exact-confirmed, at-most-once where provider idempotency is absent,
receipted, read back, and separately reversible/correctable. S100's disclosed manager-read marker is
the sole non-reversible stateful-read exception; no unread restoration is claimed. Each exact
S97-S100 key has owner authority for one bounded proof window after its closed
implementation and deterministic gates, mandatory close/readback, and final activation only after
its applicable proof and remaining suite gates.
