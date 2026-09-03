# Loop state

Last updated: 2026-09-02. Resume here after reading `AGENTS.md` and `docs/facts.md`.

## Objective

Complete and release the active S82 conformance, S97 integrity hardening, S98 append integrity plus
fixed-row capability refusal, and S51/S54 assurance
correction without widening provider/action authority or treating worktree behavior as deployed
truth. Then resume the canonical feature queue at its actual S100 blocker.

## Verified checkpoint

- Production serves `pmi-kc-app-rmtkmhj1z-8855e4c6dbfb` from commit
  `d243911cb20ffb01773072c0e27c723648eeea34` at 100% traffic. Immediate rollback is
  `pmi-kc-app-rmtkgn08q-db89a37c43dc`.
- Runtime is Production + Live with eleven Spaces, managed identity, the operating-Sheet write switch
  on, and a 48-key/16-open committed Registry plus matching non-authoritative Admin mirror.
- S96, S85, S86, S83, S84, S97, and S99 are complete and deployed. S98 has a deployed,
  proof-qualified baseline and an active append-only integrity/capability correction.
- S98's two exact Sheet keys are active and its temporary proof row was deleted and read back absent.
  The serving revision still exposes its historical fixed-row path. The active unreleased correction
  keeps only normal server-derived append executable, generation-binds its lease-scoped one-attempt
  lifecycle, archives succeeded evidence, locks ambiguous recovery, retires proof mutations, and
  refuses field update/delete/restore until the provider offers a stable logical-row and expected-
  generation mutation seam.
- S99's three exact work-order keys are active; proof work order 1731 rests in final Cancelled state.
- S100's closed implementation and `rentvine.work_order.chat.sync` are deployed, proven, and active.
  `gmail.maintenance_resident_reply.draft_create` remains closed. The designated thread currently
  yields no synchronized resident message mapped to a verified resident email, so S100 is BLOCKED.
- Completed S97-S99 and S100-chat proof windows are closed and read back; no proof key remains
  temporarily open.
- ADC is fresh and the non-persistent access-token bridge can read Cloud Run. The default gcloud
  refresh credential remains stale/noninteractive; never automate an authentication dialog.
- `.claude/settings.local.json` and `output/` are user-owned untracked files. Exclude them, ignored
  `temp/`, credentials, provider bodies, and customer evidence from commits and build uploads.

## Active unreleased work

- S82 conformance is reopened. The worktree addresses nullable rent, typed auxiliary-read failure,
  desk/workspace evidence parity, validated source links, phase-local controls, forced post-write
  freshness, source-snapshot-bound resolution/approval/Sheet claims, one resolution-aware blocker
  projection, scope/filter/loading clarity, accessibility, zoom, and large-cohort browser coverage.
- S97/S98 integrity hardening is unreleased. S97 generation-binds attempts, verifies duplicate
  after-state, and leaves every ambiguous create unproven: even one newly matching id cannot establish
  provider-owned causality, mint a success receipt, or authorize deletion. S98 derives append
  lease/value/source terms server-side, scopes proposals to the signed-in lease workspace, atomically binds the proposal,
  execution, and lease lifecycle, revalidates after claim, preserves recovery/history, and refuses
  fixed-row mutations that the provider cannot safely bind. No live proof is rerun.
- S51/S54 assurance expansion adds strict bodyless evidence, Admin/Editor read-only canaries,
  diagnostic classification, source/application reconciliation, immutable candidate/promotion
  receipts, a versioned predecessor recovery baseline, one-use promotion authority, monitoring/
  rollback decisions, ambiguous-command compensation, cancellable bounded operations, and a complete
  five-minute post-promotion observation contract with separated checkpoints and a fixed evidence
  deadline.
- My Work entry/navigation remains read-only: reconciliation, cutoff recovery, and session extension
  require deliberate user interaction; scroll restoration is not an activity signal.
- S88-S95 amendments and S101 are specifications only; no Dashboard AI, minimal-home cutover,
  product-wide decluttering, or cross-application assistant expansion is implemented by this slice.

## Next exact action

Finish the current code/spec integration and all focused falsification. Run formatting, lint,
typecheck, the canonical verifier, and bounded core E2E; audit the exact diff and all safety/privacy
boundaries. Commit/push only a green tree and require exact-SHA CI. Deploy one zero-traffic candidate,
prove exact identity/configuration, run managed candidate assurance, promote only the exact passed
revision through its bound receipts, and complete immediate plus end-of-300,000-ms observation.
Update current docs only from actual readback; do not prewrite a new commit, revision, count, or
success claim.

## Canonical feature queue

1. S96 — COMPLETE
2. S85 — COMPLETE
3. S86 — COMPLETE
4. S83 — COMPLETE
5. S84 — COMPLETE
6. S82 — baseline deployed; conformance remediation ACTIVE
7. S97 — baseline deployed/proof-qualified; integrity remediation ACTIVE
8. S98 — baseline deployed/proof-qualified; append-only integrity/capability remediation ACTIVE
9. S99 — COMPLETE
10. S100 — BLOCKED on the resident-draft runtime input; chat sync complete
11. S36 temporary Space pilot — QUEUED, not started
12. S88
13. S89
14. S90
15. S91
16. S92
17. S94
18. S93
19. S93/S94 integration verification gate
20. S95
21. S87
22. S101 post-S87 read-only expansion

The correction slice is an explicit S82 conformance, S97/S98 integrity, and assurance intercept and
does not advance a dependent feature. S36 cannot start until the full S100 completion gate passes.
Default to serial execution; only the feature manifest's explicitly safe isolated-worktree S90/S91
domain work may parallelize.

## Runtime inputs, not product questions

- S100 needs one real synchronized resident message with an exact verified resident email in the
  signed-in managed mailbox. Never guess a recipient or substitute a record.
- S51 live assurance needs existing managed Admin/Editor profiles and current provider/monitoring
  access. Its harness never provisions credentials, changes roles, or writes through the browser.
- S36 later derives its saved request and copied source packet from current approved state.

## Safety invariants

No direct client send, self-granted access, generic/bulk provider call, fake/sample identity or
customer value, guessed endpoint/mapping/recipient, personal runtime identity, secret/client evidence
in Git, cost-control change, or effect outside an exact listed key. Every authorized live write is
human-initiated, exact-previewed, exact-confirmed, at-most-once where provider idempotency is absent,
receipted, read back, and separately reversible/correctable. S100's disclosed manager-read marker is
the sole non-reversible stateful-read exception; no unread restoration is claimed.
