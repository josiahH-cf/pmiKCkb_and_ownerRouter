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
  through `0158c90`; both are exact-SHA CI green. Local and remote `main` are identical.
- Zero-traffic candidate `pmi-kc-app-rmtm1dmg7-98fa238467b3` (tag `cand-rmtm1dmg7-98fa238467b3`)
  was deployed from commit `0158c90bc2da68e6a3e0c03103dd0e418a11b000` and passed the anonymous
  read-only smoke at its exact commit, revision, tag, and service. Traffic readback still shows
  `pmi-kc-app-rmtkmhj1z-8855e4c6dbfb` at 100%. It is not promoted and supersedes
  `pmi-kc-app-rmtlsgy0i-ffb8a132da84`.
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

## Committed, candidate-deployed, unpromoted work

- S102 (tenant current rent from the RentVine lease detail) is committed in `ff200d3`:
  the live lease generation enriches every export view with the documented lease detail
  (`baseRentAmount` as `currentRent`, `rentAmount` as the total, month-to-month evidence for S103),
  `unit.rent` survives only as the labelled `unitListedRent` reference, and the live review, console
  provider, S51 oracle, reconciliation script, and capture/smoke scripts read the same source. The
  workspace verification phase shows the unit rent as reference only. Fixtures use the shared
  lease-detail fake. The canonical gate, core E2E, and exact-SHA CI passed; the candidate above
  carries it. It is not promoted.
- The earlier zero-traffic candidate from `28a9253` (`pmi-kc-app-rmtloqhri-64ba4b00a394`) is
  superseded by the candidate above and carries no traffic.

## S103 committed and candidate-deployed, not promoted

S103 (lease term and renewal eligibility) is committed in `0158c90` on top of S102's enriched view:
one
`projectLeaseTerm` projection owns the term for the cohort, desk, workspace, and
`renewal-desk-query/v2`; the exact lease-detail `isMonthToMonth` signal replaces the heuristic
month-to-month skip keys (kept only for flat legacy fixtures); month-to-month leases carry the new
`periodic_review` disposition, a `monthToMonthStartDate + 12 months` review anchor, an
inspection-only workspace, and their own desk scope; an expired or missing end date, a pending
conversion, a contradicted signal, or an unreadable detail yields `needs_review`; and the
Editor-gated `lease_renewal_term_reviews` record plus `/api/lease-renewal/term-review` resolve
leases whose provider evidence is absent, each bound to the lease view fingerprint so a drifted
record goes stale. No provider write, timer, draft, or send derives from it. The canonical gate,
core E2E, exact-SHA CI, and the local rehearsal browser smoke against live read-only sources all
passed; the browser run also recorded one pre-existing S84 narrow-viewport behavior, left to S84.

## Next exact action

Begin S104 (`docs/feature-suites/renewal-desk-workspace-parity-closure.md`): desk and workspace
parity plus the open/write/return continuation proof, consuming S102's rent and S103's term. Then
continue the renewal-completion order (S105, S106, S34, S107, S108, S109, S110, S111), one green
suite at a time with a zero-traffic candidate and smoke after each. Promotion of any candidate waits on the two
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
8. S104, S105, S106, S34, S107, S108, S109, S110, S111 — specified, next in that order
9. S36 — queued behind complete S100
10. S88, S89, S90, S91, S92, S94, S93, S93/S94 gate, S95, S87, S101 — specified

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
