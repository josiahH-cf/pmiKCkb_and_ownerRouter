# Loop state

Last updated: 2026-09-06. Resume here after reading `AGENTS.md` and `docs/facts.md`.

## Objective

Release the committed S82 conformance, S97/S98 integrity, S51/S54 assurance, and renewal-completion
(S102-S111, rewritten S34) work through one zero-traffic candidate, then promote it, without widening
provider or action authority. Every claim below is re-derived from code, tests, and live read-only
state on the date above.

## Verified checkpoint

- Production still serves `pmi-kc-app-rmtkmhj1z-8855e4c6dbfb` from commit
  `d243911cb20ffb01773072c0e27c723648eeea34` at 100% traffic. Immediate rollback is
  `pmi-kc-app-rmtkgn08q-db89a37c43dc`.
- Everything on `main` through `5040818` (the remediation slice, S102-S111, the rewritten S34,
  the owner's three reviewed troubleshooting links, and the 2026-09-06 re-verification corrections)
  is exact-SHA CI green and deployed as zero-traffic candidate `pmi-kc-app-rmtq2goev-157da39536d0` (tag
  `cand-rmtq2goev-157da39536d0`, created 2026-09-06 17:14 UTC). Its anonymous read-only smoke passed at
  the exact commit, revision, tag, and service; its revision environment reads back Production + Live
  with the write switch on and the managed runtime identity; its recaptured configuration fingerprint
  is `sha256:d56d2ff81aef901cebfd58fe6bf721ccbd401eedec938c72de678564a3fc6fde`; and its hostname is the only
  candidate entry in the authorized sign-in domains (the superseded `rmtpqneki` entry was removed).
  Traffic readback shows the serving revision unchanged at 100%. It supersedes every earlier
  candidate.
- The 2026-09-06 adversarial re-verification of S97 through S111 is committed as `5040818` (exact-SHA
  CI green) and carried by that candidate. Each suite's present truth is its `docs/facts.md` row;
  the corrections that changed code are: the Editor canary denial check (could never pass; now
  proved from the navigation chain), the configuration fingerprint (now excludes every documented
  output-only revision field; recaptured above), the S51 oracle (`periodic_review` derived
  independently), the month-to-month review date (rolls forward to the current anniversary), the
  term-review route (refuses an unknown lease or a changed view), the comp query basis (lease-detail
  rent), the workspace next-action card (renders the shared guidance), the S107 load-time pass (now
  read-only; reconcile is the Admin-gated control), the S105 owner outcome (carried forward and
  gating the tenant draft, S97 execution, and the S98 append), the S110 adapters (desk predicates,
  business calendar, `unavailable` on a throwing source), the S109 fire/water terms (whole words),
  the Dotloop config/create/pagination/upload-refresh/orphan-token paths, the seed allowlist (no
  `gmail.message.send`), and the S98 matrix descriptors (no dependency on a retired send key).
- Candidate assurance has not run. Its only remaining hold is human: the two managed browser
  profiles (one Admin; one managed account with no role claim, which the application resolves to
  `Editor`) signed in on BOTH the candidate origin and the canonical origin. No account needs to be
  created, elevated, or demoted. Monitoring reads `READY`. `docs/open-blockers.md` `B-AUTH2` carries
  the exact steps.
- Whether a claim-less managed account should hold `Editor` by default is an owner question
  (`docs/facts.md` Open Questions); the runner does not change `lib/auth/**` for it.
- Runtime is Production + Live with eleven Spaces, the operating-Sheet write switch on, and a
  48-key/16-open committed Registry plus matching non-authoritative Admin mirror.
- S99, S97, and S100 chat sync are proven and open; S100's draft key stays closed on the eligible
  resident message, and the app also lacks a path to link an existing RentVine work order to a
  ticket (agent-owned, below). S36 is queued behind complete S100.
- ADC is fresh for the managed account; the non-persistent access-token bridge performs cloud
  readback and the candidate deploy without printing a token.
- `.claude/settings.local.json`, `output/`, and the owner's untracked specification package are
  user-owned content. Exclude them, ignored `temp/`, credentials, provider bodies, and customer
  evidence from commits and build uploads.

## Next exact action

Promotion of `pmi-kc-app-rmtq2goev-157da39536d0`. It waits only on the owner's human step: the two managed
browser profiles (one Admin; one managed account with no role claim, which the application resolves
to `Editor`) signed in on BOTH `https://cand-rmtq2goev-157da39536d0---pmi-kc-app-kq6wuvpiva-uc.a.run.app` and the
canonical origin (`docs/open-blockers.md` `B-AUTH2` has the exact commands). When the owner reports
that, run `--prepare-candidate-receipt` under `ENVIRONMENT_KIND=production DATA_CONTEXT=live` with
`--expected-commit=5040818…`, `--expected-revision=pmi-kc-app-rmtq2goev-157da39536d0`, and
`--expected-config-fingerprint=sha256:d56d2ff81aef901cebfd58fe6bf721ccbd401eedec938c72de678564a3fc6fde`,
promote the exact revision, and complete the 300,000 ms observation. Promotion inputs are NOT
satisfied until that receipt exists. Until then, work the agent-owned list below; a new candidate is
needed only if runtime code changes.

## Agent-owned next work, no owner input needed

Build in this order; each is fail-first, to its external seam, and each needs a new candidate.

1. S106 runtime seam: record the refresh-token vault ref on the connection, add the vault-backed
   runtime token provider (no-person refresh), and wire Dotloop readiness/health into the Connection
   Center's live probes. Nothing here needs credentials to build; only the live check does.
2. S34 runtime wiring: construct `LiveDotloopProvider`/`DotloopRenewalExecutor` behind the S106
   token provider, carry transaction type and initial status on the selection record, and write the
   loop link onto the packet execution projection. Keys stay closed.
3. S100 link path: an exact, previewed, confirmed operation that binds an existing RentVine work
   order to a ticket (read-only against RentVine), so the Wednesday answer can be applied.
4. S98: a route operation for the service-defined reversal, or retire the descriptor claim.
5. S108: a ticket-level property key so preapproval routing does not wait for a work-order read.

## Canonical feature queue

1. S96, S85, S86, S83, S84, S99 — COMPLETE
2. S82, S97, S98 — baselines deployed; remediation committed, candidate deployed, promotion pending
3. S100 — BLOCKED on the resident-draft runtime input plus the agent-owned link path; chat sync done
4. S51/S54 — assurance expansion committed; live candidate gate waits on the two profiles
5. S102-S111 and S34 — committed and candidate-deployed, not promoted (renewal-completion R1-R11);
   S106/S34 runtime seams and live proofs remain as listed above
6. S36 — queued behind complete S100
7. S88, S89, S90, S91, S92, S94, S93, S93/S94 gate, S95, S87, S101 — specified

Default to serial execution; only the feature manifest's explicitly safe isolated-worktree S90/S91
domain work may parallelize.

## Runtime inputs, not product questions

- Promotion: the two managed browser profiles above, signed in on both origins.
- S100: one real synchronized resident message with an exact verified resident email, on a work
  order the app can link.
- S106/S34: the Dotloop OAuth application (requested from Dotloop 2026-09-04) and a connected
  managed Dotloop account; the approved artifact content source for the upload.
- S108: Admin-entered property preapproval amounts (the record and its Admin control are shipped).
- S36: derives its saved request and copied source packet from current approved state.

## Safety invariants

No direct client send, self-granted access, generic/bulk provider call, fake/sample identity or
customer value, guessed endpoint/mapping/recipient, personal runtime identity, secret/client evidence
in Git, cost-control change, or effect outside an exact listed key. Every authorized live write is
human-initiated, exact-previewed, exact-confirmed, at-most-once where provider idempotency is absent,
receipted, read back, and separately reversible/correctable. S100's disclosed manager-read marker is
the sole non-reversible stateful-read exception; no unread restoration is claimed.
