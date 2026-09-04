# Loop state

Last updated: 2026-09-04. Resume here after reading `AGENTS.md` and `docs/facts.md`.

## Objective

Release the committed S82 conformance, S97/S98 integrity, and S51/S54 assurance slice through the
zero-traffic candidate that is already deployed, then execute the owner's 2026-09-03
renewal-completion program (S102-S111 and the rewritten S34) in dependency order without widening
provider or action authority.

## Verified checkpoint

- Production still serves `pmi-kc-app-rmtkmhj1z-8855e4c6dbfb` from commit
  `d243911cb20ffb01773072c0e27c723648eeea34` at 100% traffic. Immediate rollback is
  `pmi-kc-app-rmtkgn08q-db89a37c43dc`.
- The formerly uncommitted remediation slice is committed and pushed as `e6b76f9` with exact-SHA CI
  green (unit, Firestore, quality, policy-build). The grounded renewal-completion suites, the S102
  implementation, and the S51 preflight identity-read fix are committed through `ff200d3`, and S103
  through `0158c90`, S104 through `0f01353`, S105 through `13523c5`, and S106 through `af23da4`;
  S34 through `7b26107`, S107 through `ae93742`, S108 through `03f7eee`, S109 through `9b2c829`, and
  S110 through `5abf6dd`, and S111 through `5aa2a90`; all are exact-SHA CI green. Local and remote `main` are identical.
- Zero-traffic candidate `pmi-kc-app-rmtmy3z88-1fc4c3e29466` (tag `cand-rmtmy3z88-1fc4c3e29466`)
  was deployed from commit `5aa2a90909c68ef414acb8791f166c8370fca0d2` and passed the anonymous
  read-only smoke at its exact commit, revision, tag, and service. Traffic readback still shows
  `pmi-kc-app-rmtkmhj1z-8855e4c6dbfb` at 100%. It is not promoted and supersedes
  every earlier renewal-completion candidate.
- Candidate assurance has not run. Its remaining inputs are two authenticated managed Admin and
  Editor browser-profile directories on the candidate origin and the S51 monitoring resource set,
  which currently reads `DRIFT` (one managed channel with a mismatched definition, no metric, no
  policies; fresh setup refuses while that channel exists, so a reviewed manual recovery plus the
  operator's email verification is required).
- The S51 identity read sent the ADC quota-project header to the OpenID userinfo endpoint and was
  refused; the preflight now reads identity with the bearer token only (committed in `ff200d3`,
  carried by the candidate, not yet exercised live).
- Runtime is Production + Live with eleven Spaces, the operating-Sheet write switch on, and a
  48-key/16-open committed Registry plus matching non-authoritative Admin mirror.
- S99, S97, and S100 chat sync are proven and open; S100 remains BLOCKED on a synchronized resident
  message mapped to a verified resident email. S36 is queued behind complete S100.
- ADC is fresh for the managed account; the non-persistent access-token bridge performs cloud
  readback and the candidate deploy without printing a token.
- `.claude/settings.local.json`, `output/`, and the owner's untracked specification package are
  user-owned content.
  Exclude them, ignored `temp/`, credentials, provider bodies, and customer evidence from commits
  and build uploads.

## Renewal-completion program, carried by the candidate and not promoted

The owner's 2026-09-03 program is complete. Full claims for every slice are in `docs/facts.md` and
the integrated proof report is in `docs/status.md`; these are pointers.

- S102 (`ff200d3`), S103 (`0158c90`), S104 (`0f01353`), S105 (`13523c5`): one shared `currentRent`,
  one `projectLeaseTerm` with the `periodic_review` disposition and a fingerprint-bound term review,
  one summary and guidance shared by desk row and workspace, and typed owner outcomes with their
  reopening, decline, and supersede paths.
- S106 (`af23da4`) and S34 (`7b26107`): one server-owned Dotloop connection and one loop bound to one
  approved packet snapshot hash. No e-signature operation is claimed; the documentation lists none.
- S107 (`ae93742`): no queue, scheduler, worker, or automatic retry; only covered claimed attempts
  past the existing age reconcile, through the owning services, read-only.
- S108 (`03f7eee`) and S109 (`9b2c829`): a provider snapshot from the human-initiated work-order read,
  one waiting-on projection, an Admin-only versioned preapproval that writes nothing to RentVine, and
  structured resident intake whose pure triage owns urgency, evidence, and completion. Absence is
  never authorization. RentVine attachment sync and public upload stay closed.
- S110 (`5abf6dd`): one closed three-intent read-only boundary, and the desk orchestration extracted
  so the table and the answer share one code path.
- S111 (`5aa2a90`): one integration suite over one fixture portfolio that imports no store, gate,
  orchestrator, or network call, plus a browser proof that every operator-guide step names a control
  the app really shows.
- No provider write, timer, draft, or send derives from any of this work. Each slice passed the
  canonical gate, core E2E, and exact-SHA CI; S103, S104, S108, S109, S110, and S111 also passed a
  local rehearsal browser smoke, which recorded one pre-existing S84 narrow-viewport behavior left to
  S84.
- Blocked by external environment, never converted to a human task: live Dotloop (owner OAuth
  application and connected account), owner-reviewed troubleshooting links, and Admin-entered
  property preapproval amounts.
- Every earlier renewal-completion candidate is superseded and carries no traffic.

## Next exact action

The owner's 2026-09-03 renewal-completion program is complete: S102-S111 and the rewritten S34 are
committed, exact-SHA CI green, and carried by one unpromoted zero-traffic candidate. No further
suite in that program is buildable without an owner input. The next action is promotion, which
waits on the two
managed browser profiles and the monitoring recovery; when those exist, capture the configuration
fingerprint under `ENVIRONMENT_KIND=production DATA_CONTEXT=live`, run
`--prepare-candidate-receipt`, promote the exact revision, and complete the 300,000 ms observation.

## Canonical feature queue

1. S96, S85, S86, S83, S84 — COMPLETE
2. S82, S97, S98 — baselines deployed; remediation committed, candidate deployed, promotion pending
3. S99 — COMPLETE
4. S100 — BLOCKED on the resident-draft runtime input; chat sync complete
5. S51/S54 — assurance expansion committed; live candidate gate pending owner inputs
6. S102 — committed and candidate-deployed, not promoted (renewal-completion R1)
7. S103 — committed and candidate-deployed, not promoted (renewal-completion R2)
8. S104 — committed and candidate-deployed, not promoted (renewal-completion R3)
9. S105 — committed and candidate-deployed except its Dotloop phase link (renewal-completion R4)
10. S106 — committed and candidate-deployed; only its live check is blocked (R5)
11. S34 — committed and candidate-deployed; live proof blocked (renewal-completion R6)
12. S107 — committed and candidate-deployed, not promoted (renewal-completion R7)
13. S108 — committed and candidate-deployed, not promoted (renewal-completion R8)
14. S109 — committed and candidate-deployed, not promoted (renewal-completion R9)
15. S110 — committed and candidate-deployed, not promoted (renewal-completion R10)
16. S111 — committed and candidate-deployed, not promoted (renewal-completion R11, last)
17. S36 — queued behind complete S100
18. S88, S89, S90, S91, S92, S94, S93, S93/S94 gate, S95, S87, S101 — specified

Default to serial execution; only the feature manifest's explicitly safe isolated-worktree S90/S91
domain work may parallelize.

## Runtime inputs, not product questions

- Promotion: two authenticated managed Admin/Editor browser profiles on the candidate origin and a
  passing S51 monitoring resource set.
- S100: one real synchronized resident message with an exact verified resident email.
- S106/S34: the Dotloop OAuth application and a connected managed Dotloop account.
- S108/S109: Admin-entered property preapproval amounts (the record and its Admin control ship in
  S108; the amounts themselves come from the owner's files) and owner-reviewed troubleshooting links
  (the S109 catalog ships empty; its absence disables only the resource offer).
- S36: derives its saved request and copied source packet from current approved state.

## Safety invariants

No direct client send, self-granted access, generic/bulk provider call, fake/sample identity or
customer value, guessed endpoint/mapping/recipient, personal runtime identity, secret/client evidence
in Git, cost-control change, or effect outside an exact listed key. Every authorized live write is
human-initiated, exact-previewed, exact-confirmed, at-most-once where provider idempotency is absent,
receipted, read back, and separately reversible/correctable. S100's disclosed manager-read marker is
the sole non-reversible stateful-read exception; no unread restoration is claimed.
