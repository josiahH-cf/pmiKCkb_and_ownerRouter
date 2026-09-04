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
  S110 through `5abf6dd`; all are exact-SHA CI green. Local and remote `main` are identical.
- Zero-traffic candidate `pmi-kc-app-rmtmuvjmp-b9f775e360aa` (tag `cand-rmtmuvjmp-b9f775e360aa`)
  was deployed from commit `5abf6ddae9f46b9ccc32c99bd70b2e9b3beb7455` and passed the anonymous
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

## Renewal-completion work carried by the candidate, not promoted

Full claims for every slice are in `docs/facts.md`; these are pointers.

- S102 (`ff200d3`): the documented lease detail is the shared `currentRent`.
- S103 (`0158c90`): one `projectLeaseTerm` for cohort, desk, workspace, and `renewal-desk-query/v2`,
  a `periodic_review` disposition, and a fingerprint-bound Editor term review.
- S104 (`0f01353`): the desk row and the workspace read one summary and one guidance result.
- S105 (`13523c5`): typed owner responses with reopening, decline, and supersede paths.
- S106 (`af23da4`) and S34 (`7b26107`): one server-owned Dotloop connection (single-use state,
  server-side exchange, opaque vault refs) and one loop bound to one approved packet snapshot hash
  that reconciles a lost create by exact name. No e-signature operation is claimed; the
  documentation lists none. Only their live checks are blocked, on the owner's OAuth application and
  a connected account.
- S107 (`ae93742`): no queue, scheduler, worker, or automatic retry; the recorded conflict stands. No
  effect route forwards an abort signal, so a confirmed effect persists its receipt before any
  projection. On load, only covered claimed attempts older than the existing two-minute age reconcile
  through the S97/S98 services' own `reconcileEffect`, injected so the projection never writes.
- S108 (`03f7eee`): a `provider_snapshot` recorded only from the human-initiated work-order read, one
  waiting-on projection, and a `manageAdmin`-only versioned property preapproval that writes nothing
  to RentVine. Absence is never authorization. RentVine photo and attachment sync stays closed and no
  work-order dashboard URL is built, because none is documented.
- S109 (`9b2c829`): bounded structured intake on the unchanged S47 public boundary; pure triage owns
  urgency, evidence, copy, and completion, and the writer ignores any of the three in the request
  body. The catalog is empty until the owner supplies reviewed links; the optional model may only
  suggest a trade. Promotion carries `photos_needed` onto the ticket, which S108 reads as the
  resident blocker. `app/maintenance/report` clears its fragment token before any request and offers
  no file input.
- S110 (`5abf6dd`): one `runAssistantQuery` boundary over a closed versioned three-intent registry;
  the body carries only the question text and every other input is derived server-side. The Renewals
  desk orchestration moved into `lib/lease-renewal/assistant-source.ts`, which the desk page and the
  assistant both call, so the table and the answer cannot drift. A failed renewal read reports
  `unavailable`, never `no renewals`, and an actor without Renewals access receives no lease detail.
  No assistant module or its route can reach the action gate, an executor, a provider write client,
  or a draft path.
- No provider write, timer, draft, or send derives from any of this work. Each slice passed the
  canonical gate, core E2E, and exact-SHA CI; S103, S104, S108, S109, and S110 also passed a local
  rehearsal browser smoke, which recorded one pre-existing S84 narrow-viewport behavior left to S84.
- Every earlier renewal-completion candidate is superseded and carries no traffic.

## Next exact action

Begin S111 (`docs/feature-suites/renewal-completion-integrated-proof-and-training.md`), the last
suite in the renewal-completion order, with a zero-traffic candidate and smoke after it.
Promotion of any candidate waits on the two
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
16. S111 — specified, next
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
