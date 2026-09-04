# Loop state

Last updated: 2026-09-03. Resume here after reading `AGENTS.md` and `docs/facts.md`.

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
  all are exact-SHA CI green. Local and remote `main` are identical.
- Zero-traffic candidate `pmi-kc-app-rmtmaxi8r-f6190b47628d` (tag `cand-rmtmaxi8r-f6190b47628d`)
  was deployed from commit `af23da456c5afdbba5dfaac1af69d7c18c6bec9f` and passed the anonymous
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

- S102 (`ff200d3`): the live lease generation enriches every export view with the documented lease
  detail, so `baseRentAmount` is the shared `currentRent`, `rentAmount` stays the separate total,
  the month-to-month evidence rides along, and `unit.rent` survives only as the labelled
  `unitListedRent` reference across the desk, review, console provider, S51 oracle, and scripts.
- S103 (`0158c90`): one `projectLeaseTerm` projection owns the term for the cohort, desk, workspace,
  and `renewal-desk-query/v2`; the exact `isMonthToMonth` signal replaces the heuristic skip keys
  (kept only where no exact signal exists); month-to-month leases carry a `periodic_review`
  disposition, a `monthToMonthStartDate + 12 months` review anchor, an inspection-only workspace,
  and their own desk scope; an expired or missing end date, a pending conversion, a contradicted
  signal, or an unreadable detail yields `needs_review`; and the Editor-gated
  `lease_renewal_term_reviews` record plus `/api/lease-renewal/term-review` resolve leases whose
  provider evidence is absent, each bound to the lease view fingerprint so a drifted record goes
  stale.
- S104 (`0f01353`): the desk row and the lease workspace read one summary and one
  `buildDeskLeaseGuidance` result, so rent, unit reference, term, status, blockers, and the next
  action cannot differ between the two surfaces; a filtered, sorted view returns byte-identically,
  and a damaged continuation restores the default desk rather than a partial view.
- S105 (`13523c5`): the owner response is typed
  `approved_terms`, `revision_requested`, `declined_non_renewal`, or `no_response`. A revision
  request reopens the owner copy onward and invalidates every downstream preview while retaining the
  prior decision value for review; a decline continues through the documented non-renewal handoff
  without inventing a tenant answer; silence keeps the lease waiting on the owner. A new response or
  changed terms supersedes the decision and its previews, a confirmation captured against superseded
  terms is refused, and two confirmations of one effect map to one attempt identity. Its Dotloop
  phase link waits on S106 and S34; that absence is already a visible blocker with its next action.
- No provider write, timer, draft, or send derives from any of this work. Each slice passed the
  canonical gate, core E2E, and exact-SHA CI; S103 and S104 also passed the local rehearsal browser
  smoke, which recorded one pre-existing S84 narrow-viewport behavior left to S84.
- The earlier candidates from `28a9253`, `ff200d3`, `0158c90`, and `0f01353` are superseded and
  carry no traffic.

## S106 committed and candidate-deployed, not promoted

S106 (Dotloop connection and renewal readiness) adds one server-owned connection service: a
single-use authorization state consumed before anything else, the documented `authorization_code`
exchange server-side, both tokens stored only as opaque vault refs, and a connection record through
the existing S96 lifecycle. A denial, callback error, forged or replayed state, exchange failure, or
unconfigured secure storage each end with no connection. The typed client reads only the four
documented endpoints, bounds pagination to `batch_size` 100, refreshes once on 401, reports
`refresh_needed` on a revoked refresh token, backs off once on 429, and exposes no generic request
function. Readiness never says `connected` without a profile probe success and names the exact
missing resource; `signatureApiAvailable` stays false because the documentation lists no e-signature
operation. The callback asserts the Live provider fence first, so local rehearsal refuses it. Only
the LIVE readiness check is blocked, on the owner's OAuth application and a connected account.

## Next exact action

Begin S34 (`docs/feature-suites/dotloop-esign-activation.md`) and continue the renewal-completion order
(S107, S108, S109, S110, S111), one green suite at a time with a zero-traffic candidate and smoke
after each. Promotion of any candidate waits on the two
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
11. S34 — implemented, unreleased; live proof blocked (renewal-completion R6)
12. S107, S108, S109, S110, S111 — specified, next in that order
13. S36 — queued behind complete S100
14. S88, S89, S90, S91, S92, S94, S93, S93/S94 gate, S95, S87, S101 — specified

Default to serial execution; only the feature manifest's explicitly safe isolated-worktree S90/S91
domain work may parallelize.

## Runtime inputs, not product questions

- Promotion: two authenticated managed Admin/Editor browser profiles on the candidate origin and a
  passing S51 monitoring resource set.
- S100: one real synchronized resident message with an exact verified resident email.
- S106/S34: the Dotloop OAuth application and a connected managed Dotloop account.
- S108/S109: Admin-entered property preapproval amounts and owner-reviewed troubleshooting links.
- S36: derives its saved request and copied source packet from current approved state.

## Safety invariants

No direct client send, self-granted access, generic/bulk provider call, fake/sample identity or
customer value, guessed endpoint/mapping/recipient, personal runtime identity, secret/client evidence
in Git, cost-control change, or effect outside an exact listed key. Every authorized live write is
human-initiated, exact-previewed, exact-confirmed, at-most-once where provider idempotency is absent,
receipted, read back, and separately reversible/correctable. S100's disclosed manager-read marker is
the sole non-reversible stateful-read exception; no unread restoration is claimed.
