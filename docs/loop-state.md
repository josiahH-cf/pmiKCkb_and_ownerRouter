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
- S96 is `ALL_GATES_GREEN` and deployed through focused/canonical/core-E2E, exact-SHA CI,
  candidate/config, promotion, and readback gates; production had zero connector records, so the
  no-target first-click proof ran with no credential or vault effect.
- S85 is `ALL_GATES_GREEN` and deployed through its focused/real-browser/canonical/core-E2E/CI
  `33496148515`/candidate/config/promotion/readback gates. `brand_conformance` remains separately
  blocked on approved official PMI assets; deployed values are provisional.
- S86 is `ALL_GATES_GREEN` and deployed through focused interaction/S96-preservation suites, the
  full canonical run, real-Chromium matrix, exact-SHA CI `33506372579`, candidate/config, exact
  promotion, and repeated stable readback, with no store, provider, role, or message effect.
- S83 is `ALL_GATES_GREEN` and deployed through focused 27-file/175-test access coverage, the full
  canonical run, exact-SHA CI `33533250900`, candidate `pmi-kc-app-rmtiwwud5-993818fec846`,
  config/promotion/readback, and registry-mirror readback, with no role or provider effect.
- S84 is `ALL_GATES_GREEN` and deployed: the three-group actor-aware disclosure navbar and
  Dashboard/Internal Processes terminology are live over unchanged routes/guards through exact-SHA
  CI `33562996950`, candidate `pmi-kc-app-rmtj7bhzf-61f4736bdb6b`, bounded smoke, normalized
  configuration, exact promotion, and repeated stable readback, with no external effect.
- ADC is healthy and resolves to `josiah@pmikcmetro.com`. The default gcloud refresh remains stale;
  every release through S97 used the proven non-persistent ADC token bridge without printing or
  writing a token.
- S82 is `ALL_GATES_GREEN` and deployed: the table-first desk, canonical v2 query and opaque
  party-filter contract, deskView continuity, privacy-bounded access returns, guided six-phase
  workspace, and compat-route upgrade are live through exact-SHA CI `33575465575`, candidate
  `pmi-kc-app-rmtjd24ee-17d334db377f`, bounded smoke, normalized configuration excluding only
  image/exact `APP_COMMIT_SHA`/the one specified party-filter binding, exact promotion, repeated
  stable readback, and secret/IAM/payload-shape readback, with no client-data or provider-write
  effect.
- S97 is COMPLETE and deployed. After the closed slice (CI `33583463885`), the owner designated
  test lease 115/property 84 (2026-09-02) and all three serial per-key proofs passed live with
  receipts: dates forward/duplicate-replay/restore; create with honest ambiguity reconcile,
  receipt-bound DELETE plus delete-reconcile, and the approved durable update-target charge 1616;
  update with a restore hash equal to the creation receipt. Each window was a reviewed
  commit/CI/zero-traffic candidate, closed and read back before the next; the proofs surfaced and
  fixed real contract gaps (ISO date normalization, detail-confirmed reconcile, list envelopes,
  HTTP-400 absence signal, reversal reconciliation). Protected activation is live at commit
  `642269cab5afba563c41ce769541680c04d5c60c` with mirror readback 44 keys/ten open. The labeled
  permanent TEST row anchors the lease in the operating Sheet.
- The remaining S36, S87-S95, and S98-S100 suites are specified desired-state contracts, not
  implementation. S98 is the active suite. Their sole queue and completion gates are in
  `docs/feature-suites/README.md`.
- The prior UI/assistant documentation gate passed exact-SHA CI. The 2026-08-31 owner decision pass
  additionally closed every product question for S36/S97-S100 and authorized their exact future
  protected activation/live proof contracts; it performed no feature, cloud, provider, key, role,
  Sheet, draft, or deployment effect.
- S96 solely owns connector disconnect/reconciliation; S86 supplies the shared interaction
  foundation; S83 supplies the access destination, review lane, and queue reachability S84 uses.
- The committed execution Registry and its non-authoritative Firestore Admin display mirror both
  read back at 44 keys/seven open with no malformed entry. Neither S83 nor the mirror grants action
  execution.
- S97 removed the obsolete multi-record proof machinery and proved/activated its keys. S98
  removes the obsolete copy-only Sheet path. S99/S100 replace synthetic or inert provider seams with
  exact official operations. S36 ends with its temporary resources gone and the eleven-store/flag
  baseline restored.
- S94 runs once before S93 against strict S93-slot fixtures; their later join is verification only.
  S95 consumes S87's specified disposition manifest; S87 implementation remains last.
- `.claude/settings.local.json` and `output/` are user-owned untracked files; exclude them from every
  commit and Cloud Build upload.

## Next exact action

Begin S98. Re-read its complete contract and the live operating-Sheet truth ("Lease Renewal" tab;
the permanent S97 TEST row sits at the tail below one spacer). Implement the two exact keys
closed - `google_sheets.renewal_checklist.row_append` and
`google_sheets.renewal_checklist.field_update` - behind the S97-pattern proposal/one-attempt/
receipt/readback/reconcile gates, remove the copy-only rehearsal Sheet path with tests, then run
the serial bounded proof windows (temporary real-data row append/readback, blank-to-source field
update, receipt-bound row delete, final absence) using the committed OWNER_PROOF_WINDOW_OPEN_KEYS
machinery, close each window, and take protected activation through the full release train with
mirror readback. Exclude user-owned `.claude/settings.local.json` and `output/` plus ignored
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
