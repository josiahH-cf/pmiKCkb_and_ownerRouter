# Loop state

Last updated: 2026-09-01. Resume here after reading `AGENTS.md` and `docs/facts.md`.

## Objective

Execute the single canonical S96-through-S87 queue, including exact source-of-truth writeback and
the temporary Space pilot, without treating specified behavior as deployed truth or widening any
effect beyond the owner-authorized keys and suite contracts.

## Current checkpoint

- Production serves `pmi-kc-app-rmtjd24ee-17d334db377f` / commit
  `da91e5cc7e3a85db7f4bcf9c7aa036bca554e76c` at 100% traffic. Immediate rollback is
  `pmi-kc-app-rmtj7bhzf-61f4736bdb6b`.
- Current implementation remains Production + Live with eleven Spaces, managed identity, seven open
  keys, the operating-Sheet write switch off, and S30's closed one-lease `endDate` proof runner.
- S96 is `ALL_GATES_GREEN` and deployed. Focused/canonical/core-E2E checks and exact-SHA CI passed;
  the zero-traffic candidate matched exact version and normalized predecessor configuration, bounded
  routes passed, and exact promotion/stable readback passed. Production had zero connector records,
  so the specified no-target first-click proof ran with no credential or vault effect.
- S85's technical implementation is `ALL_GATES_GREEN` and deployed through its focused/real-browser/
  canonical/core-E2E/CI `33496148515`/candidate/config/promotion/readback gates. `brand_conformance`
  remains separately blocked on approved official PMI assets; deployed values are provisional.
- S86 is `ALL_GATES_GREEN` and deployed. Focused interaction and complete S96-preservation suites,
  570 unit files with one intentional skip/5,223 passing tests, 26 Firestore files/119 tests, 31 core
  E2E tests, the production build, real Chromium theme/viewport/zoom/accessibility matrix, exact-SHA
  CI `33506372579`, zero-traffic candidate, normalized configuration, exact promotion, and repeated
  stable readback passed. No store, provider, role, permission, action-key, credential, client-data,
  draft, or message effect ran.
- S83 is `ALL_GATES_GREEN` and deployed. Focused 27-file/175-test access coverage, 583 unit files
  with one intentional file skip/5,301 passing tests/four skips, 26 Firestore files/119 tests, 31
  core E2E tests, policy/build gates, exact-SHA CI `33533250900`, zero-traffic candidate
  `pmi-kc-app-rmtiwwud5-993818fec846`, normalized configuration, exact promotion, repeated canonical
  route/version readback, and Action Registry mirror readback passed. No role, claim, request,
  provider, credential, client-data, draft, or message effect ran.
- S84 is `ALL_GATES_GREEN` and deployed: the three-group actor-aware disclosure navbar and
  Dashboard/Internal Processes terminology are live over unchanged routes/guards through exact-SHA
  CI `33562996950`, candidate `pmi-kc-app-rmtj7bhzf-61f4736bdb6b`, bounded smoke, normalized
  configuration, exact promotion, and repeated stable readback, with no external effect.
- ADC is healthy and resolves to `josiah@pmikcmetro.com`. The default gcloud refresh remains stale;
  every release through S82 used the proven non-persistent ADC token bridge without printing or
  writing a token.
- S82 is `ALL_GATES_GREEN` and deployed: the table-first desk, canonical v2 query and opaque
  party-filter contract, deskView continuity, privacy-bounded access returns, guided six-phase
  workspace, and compat-route upgrade are live through exact-SHA CI `33575465575`, candidate
  `pmi-kc-app-rmtjd24ee-17d334db377f`, bounded smoke, normalized configuration excluding only
  image/exact `APP_COMMIT_SHA`/the one specified party-filter binding, exact promotion, repeated
  stable readback, and secret/IAM/payload-shape readback, with no client-data or provider-write
  effect.
- The remaining S36, S87-S95, and S97-S100 suites are specified desired-state contracts, not
  implementation. S97 is the active suite. Their sole queue and completion gates are in
  `docs/feature-suites/README.md`.
- The prior UI/assistant documentation gate passed exact-SHA CI. The 2026-08-31 owner decision pass
  additionally closed every product question for S36/S97-S100 and authorized their exact future
  protected activation/live proof contracts; it performed no feature, cloud, provider, key, role,
  Sheet, draft, or deployment effect.
- S96 solely owns connector disconnect/reconciliation; S86 preserved it and supplies the shared
  interaction/transient foundation. S83 consumes those contracts and now supplies the all-staff
  access destination, Admin-only access-review lane, and role-aware queue reachability used by S84.
- The committed execution Registry and its non-authoritative Firestore Admin display mirror both
  read back at 41 keys/seven open with no malformed entry. Neither S83 nor the mirror grants action
  execution.
- S97 removes obsolete multi-record proof machinery and consumes S30's safety primitives. S98
  removes the obsolete copy-only Sheet path. S99/S100 replace synthetic or inert provider seams with
  exact official operations. S36 ends with its temporary resources gone and the eleven-store/flag
  baseline restored.
- S94 runs once before S93 against strict S93-slot fixtures; their later join is verification only.
  S95 consumes S87's specified disposition manifest; S87 implementation remains last.
- `.claude/settings.local.json` and `output/` are user-owned untracked files; exclude them from every
  commit and Cloud Build upload.

## Next exact action

Begin S97. Re-read its complete contract, the deployed S30 one-attempt/readback/rollback safety
primitives, the S77 exact-confirm foundation, the S80 authority matrix, and current desk/workspace
truth. First remove the obsolete multi-record proof machinery with tests. Then implement the three
exact renewal-writeback keys closed - `rentvine.lease.renewal_dates.update`,
`rentvine.lease.recurring_charge.create` with only its receipt-bound reversal DELETE, and
`rentvine.lease.recurring_charge.update` - behind exact preview/confirm/receipt/readback/reconcile
behavior and deterministic gates. No key opens and no protected proof-window patch is prepared
before those gates are green; the sole designated lease arrives only through secure execution
context and is never substituted or committed. Exclude user-owned `.claude/settings.local.json`
and `output/` plus ignored `temp/` artifacts from every commit and Cloud Build upload.

## Canonical queue

1. S96 — COMPLETE
2. S85 — COMPLETE
3. S86 — COMPLETE
4. S83 — COMPLETE
5. S84 — COMPLETE
6. S82 — COMPLETE
7. S97 — ACTIVE
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
  release or live effect after every independent closed-state deliverable is green. They are never
  guessed. Interactive authentication is always performed by a person, never automated.

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
