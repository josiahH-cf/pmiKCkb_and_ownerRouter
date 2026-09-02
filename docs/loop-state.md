# Loop state

Last updated: 2026-09-02. Resume here after reading `AGENTS.md` and `docs/facts.md`.

## Objective

Execute the single canonical S96-through-S87 queue, including exact source-of-truth writeback and
the temporary Space pilot, without treating specified behavior as deployed truth or widening any
effect beyond the owner-authorized keys and suite contracts.

## Current checkpoint

- Production serves `pmi-kc-app-rmtjwy7f4-c705ce297553` / commit
  `642269cab5afba563c41ce769541680c04d5c60c` at 100% traffic. Immediate rollback is
  `pmi-kc-app-rmtjhew5f-125876b4ff5b`.
- Current implementation remains Production + Live with eleven Spaces, managed identity, ten open
  keys of 44, the operating-Sheet write switch off, and the three proven S97 keys open.
- S96 is `ALL_GATES_GREEN` and deployed with the full gate ladder and no credential/vault effect.
- S85 is `ALL_GATES_GREEN` and deployed (CI `33496148515` plus the full gate ladder);
  `brand_conformance` was later resolved with the published official PMI guide values live.
- S86 is `ALL_GATES_GREEN` and deployed (focused interaction/S96-preservation suites, canonical
  run, real-Chromium matrix, CI `33506372579`, full release gates) with no store or provider
  effect.
- S83 is `ALL_GATES_GREEN` and deployed (CI `33533250900`, candidate
  `pmi-kc-app-rmtiwwud5-993818fec846`, full gates) with no role or provider effect.
- S84 is `ALL_GATES_GREEN` and deployed: the three-group actor-aware disclosure navbar and
  Dashboard/Internal Processes terminology are live over unchanged routes/guards (CI
  `33562996950`, candidate `pmi-kc-app-rmtj7bhzf-61f4736bdb6b`, full gates), no external effect.
- ADC is healthy and resolves to `josiah@pmikcmetro.com`; every release through S97 used the
  proven non-persistent ADC token bridge without printing or writing a token.
- S82 is `ALL_GATES_GREEN` and deployed: the table-first desk, canonical v2 query/party-filter
  contract, guided workspace, and compat-route upgrade are live (CI `33575465575`, candidate
  `pmi-kc-app-rmtjd24ee-17d334db377f`, full gates), with no client-data or provider-write effect.
- S97 is COMPLETE and deployed (closed slice CI `33583463885`): all three serial per-key proofs
  passed live on owner-designated lease 115/property 84 with receipts (dates forward/replay/
  restore; create + receipt-bound DELETE + reconcile with durable charge 1616; update restoring
  the creation-receipt hash), each window opened/closed/read back separately, and the proofs
  fixed real contract gaps. Protected activation is live at commit `642269c...c60c` with mirror
  readback 44 keys/ten open. The labeled permanent TEST row anchors the lease in the Sheet.
- S98's closed slice is committed (`9130d6b`) with exact-SHA CI green: the two exact Sheet keys,
  typed proposal/one-attempt/receipt/reversal service, governed route and panel, proof-row read
  exclusion, proof CLI, retired broad key, and removed rehearsal path (env delta:
  `RENEWAL_REHEARSAL_SHEET_ID` leaves the deploy set). Keys closed, write switch off. Its release
  train and proof windows wait on the one owner step: interactive reauth (`auth:session` /
  `gcloud auth application-default login` as josiah@pmikcmetro.com — ADC and CLI are both
  invalid_rapt).
- S99's closed slice is committed (`c2ffec2`, exact-SHA CI `33658852900` green): official
  snapshot/codecs, narrow reader/writer, official executor, re-cut matrix, S20 route with
  ticket-link projection, panel, and proof CLI. All three keys stay closed until their windows.
- S100's closed slice is implemented and focused-green: the hash-pinned chat contract and
  lease-tenants resident resolver, one-page chat reader, transactional dedup/quarantine store with
  365-day workflow_link retention plus rules/index, `stateful_read` policy, cancel-first sync
  route/executor, rerun-only mapping review, governed resident-reply draft route/builder, ticket
  panel, and committed-seed closed refusals. Both S100 keys stay closed.
- The remaining S36 and S87-S95 suites are specified desired-state contracts, not implementation.
  Their sole queue and completion gates are in `docs/feature-suites/README.md`.
- The prior UI/assistant documentation gate passed exact-SHA CI. The 2026-08-31 owner decision pass
  additionally closed every product question for S36/S97-S100 and authorized their exact future
  protected activation/live proof contracts; it performed no feature, cloud, provider, key, role,
  Sheet, draft, or deployment effect.
- S96 solely owns connector disconnect/reconciliation; S86 supplies the shared interaction
  foundation; S83 supplies the access destination, review lane, and queue reachability S84 uses.
- The committed execution Registry and its non-authoritative Firestore Admin display mirror both
  read back at 44 keys/ten open with no malformed entry (the committed seed now holds 48 entries;
  the next release reseeds the mirror). Neither S83 nor the mirror grants action execution.
- S97 removed the obsolete multi-record proof machinery and proved/activated its keys. S98
  removes the obsolete copy-only Sheet path. S99/S100 replace synthetic or inert provider seams with
  exact official operations. S36 ends with its temporary resources gone and the eleven-store/flag
  baseline restored.
- S94 runs once before S93 against strict S93-slot fixtures; their later join is verification only.
  S95 consumes S87's specified disposition manifest; S87 implementation remains last.
- `.claude/settings.local.json` and `output/` are user-owned untracked files; exclude them from every
  commit and Cloud Build upload.

## Next exact action

Commit and CI the S100 closed slice, then start S36's closed-safe work while the one owner step is
outstanding: interactive reauth (`auth:session`), which unblocks, in order, the S98 closed-slice
release train (one reviewed env delta: `RENEWAL_REHEARSAL_SHEET_ID` removed; 48-key mirror
reseed), the three serial S98 proof windows on lease 115/property 84 via
`scripts/prove-s98-sheet-writeback.ts`, S98 activation, the S99 release, the S99 windows via
`scripts/prove-s99-work-order.ts` (bounded read; one owner-approved TEST create on property 84;
cancel via the unique live system Cancelled status), S99 activation, then the S100 release and its
two serial windows (one confirmed chat page on the TEST work order, then one resident-reply draft
only after a mapped resident with a verified email exists), S100 activation, and the docs
receipts. Open OWNER_PROOF_WINDOW_OPEN_KEYS and any write switch only per window and close each
with readback. Exclude user-owned `.claude/settings.local.json` and `output/` plus ignored
`temp/` artifacts from every commit and Cloud Build upload.

## Canonical queue

1. S96 — COMPLETE
2. S85 — COMPLETE
3. S86 — COMPLETE
4. S83 — COMPLETE
5. S84 — COMPLETE
6. S82 — COMPLETE
7. S97 — COMPLETE
8. S98 — ACTIVE
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

- S97's proofs consumed the owner-designated lease (2026-09-02) and are complete; later windows
  resolve every current provider value fresh, stop on drift, and never substitute targets.
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
