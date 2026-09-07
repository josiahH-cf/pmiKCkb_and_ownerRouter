# Loop state

Last updated: 2026-09-07. Resume here after reading `AGENTS.md` and `docs/facts.md`, then run
`npm run auth:ensure` (authentication is pre-approved; a blocked credential names one human step).

## Objective

Release the committed S82 conformance, S97/S98 integrity, S51/S54 assurance, and renewal-completion
(S102-S111, rewritten S34) work through one zero-traffic candidate, then promote it, without widening
provider or action authority. Every claim below is re-derived from code, tests, and live read-only
state on the date above.

## Verified checkpoint

- Production still serves `pmi-kc-app-rmtkmhj1z-8855e4c6dbfb` from commit
  `d243911cb20ffb01773072c0e27c723648eeea34` at 100% traffic. Immediate rollback is
  `pmi-kc-app-rmtkgn08q-db89a37c43dc`.
- Everything on `main` through `7b3fdad` (the remediation slice, S102-S111, the rewritten S34, the
  owner's three reviewed troubleshooting links, the 2026-09-06 re-verification corrections, and the
  adversarial review of that re-verification) is exact-SHA CI green and deployed as zero-traffic
  candidate `pmi-kc-app-rmtq71kjl-bff41bbdb5fa` (tag `cand-rmtq71kjl-bff41bbdb5fa`, created 2026-09-06 19:22 UTC).
  Its anonymous read-only smoke passed at the exact commit, revision, tag, and service; its revision
  environment reads back Production + Live with the write switch on and the managed runtime
  identity; its configuration fingerprint is `sha256:dc697873b3b384e13a631e4742bae66358f71d6f09bca564dbfd84351de1bcda`; and its
  hostname is the only candidate entry in the authorized sign-in domains (the superseded
  `rmtq2goev` entry was removed). Traffic readback shows the serving revision unchanged at 100%. It
  supersedes every earlier candidate.
- The 2026-09-06 adversarial re-verification of S97 through S111 is committed as `5040818` (exact-SHA
  CI green) and, with the independent adversarial review of it (`7b3fdad`), carried by that candidate. Each suite's present truth is its `docs/facts.md` row;
  the corrections that changed code are: the Editor canary denial check (could never pass; now
  proved from the navigation chain), the configuration fingerprint (now excludes the output-only
  revision fields the control plane can restamp; recaptured above), the S51 oracle (`periodic_review` derived
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
- Authentication is pre-approved (S112, `AGENTS.md` Authentication). `npm run auth:ensure` is the
  one entry point. On 2026-09-07 the Windows store reads attended-ready as the owner's managed
  account, the WSL store's gcloud CLI needs the attended re-enrollment `auth:ensure` names, and the
  unattended identities wait on the owner's `B-AUTH2` setup.
- `.claude/settings.local.json`, `output/`, and the owner's untracked specification package are
  user-owned content. Exclude them, ignored `temp/`, credentials, provider bodies, and customer
  evidence from commits and build uploads.

## Next exact action

Promotion of `pmi-kc-app-rmtq71kjl-bff41bbdb5fa`. It waits only on the owner's one-time S112 setup
(`docs/open-blockers.md` `B-AUTH2`): the automation and canary identities, both credential stores
enrolled, and the two canary profiles enrolled on BOTH
`https://cand-rmtq71kjl-bff41bbdb5fa---pmi-kc-app-kq6wuvpiva-uc.a.run.app` and the canonical origin
(fast path: two managed profiles enrolled through `auth:enroll-canary` today). When the owner reports
that, run `npm run auth:ensure -- --need=canary` for both profiles and both origins, then
`--prepare-candidate-receipt` under `ENVIRONMENT_KIND=production DATA_CONTEXT=live` with
`--expected-commit=7b3fdadac134550c24b029034753a38f16e4096b`, `--expected-revision=pmi-kc-app-rmtq71kjl-bff41bbdb5fa`, and
`--expected-config-fingerprint=sha256:dc697873b3b384e13a631e4742bae66358f71d6f09bca564dbfd84351de1bcda`,
promote the exact revision, and complete the 300,000 ms observation. Promotion inputs are NOT
satisfied until that receipt exists. Until then, work the agent-owned list below; a new candidate is
needed only if runtime code changes.

## Agent-owned next work, no owner input needed

S112's remaining slices come first and need no candidate (except the last): wire
`ensureAuthenticated` from `scripts/auth/ensure.mjs` into every live script behind a source-scan
test; the workstation secret template (R4); the IAM audit; `PLAYWRIGHT_CHROME_PATH` and
`canarySessions` in the assurance harness; then the R3 read-only canary claim behind a candidate.

Build the rest in this order; each is fail-first, to its external seam, and each needs a new
candidate.

1. S106 runtime seam: record the refresh-token vault ref on the connection, add the vault-backed
   runtime token provider (no-person refresh), and wire Dotloop readiness/health into the Connection
   Center's live probes. Nothing here needs credentials to build; only the live check does.
2. S34 runtime wiring: construct `LiveDotloopProvider`/`DotloopRenewalExecutor` behind the S106
   token provider, carry transaction type and initial status on the selection record, and write the
   loop link onto the packet execution projection. Keys stay closed.
3. S100 link path: an exact, previewed, confirmed operation that binds an existing RentVine work
   order to a ticket (read-only against RentVine), so the Wednesday answer can be applied.
4. S98: the provider-owned stable-row and expected-generation seam that lets the route's reversal
   operation stop refusing `provider_capability_unavailable`, or retire the descriptor claim.
5. S108: a ticket-level property key so preapproval routing does not wait for a work-order read.
6. S34: make the document readback provider-verified (name/size from the provider) or record
   `presence_only` on the receipt instead of echoing the app's own hash.
7. S110: a month outside the read window (`last month`, a far-future `YYYY-MM`) answers `complete`
   with no rows; carry the window bounds with the read and answer a clarification instead.
8. Rehearsal server: `/` and intermittently the desk answer 500 in `next dev` (Next 16.2.12, Node
   24.18: `ArrayBuffer is not detachable`), reproduced at `e6eb315`; pin the smoke runner's Node or
   take the framework fix, then re-run the Dashboard and guide-control browser smokes.

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
