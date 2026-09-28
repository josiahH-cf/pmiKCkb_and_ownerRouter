# Loop state

Last updated: 2026-09-28 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

Terminal state: BLOCKED — the one thirteen-feature batch has confirmed release-safety and litmus
gaps. Billing and approved CLI/ADC authentication now work. Do not start the watcher until the
findings in docs/evidence/batch-litmus-audit-2026-09-28.md are resolved and the release gates pass.
The batch remains undeployed; candidate assurance, promotion and observation for it are NOT RUN.
Owner direction on repair or stopping is pending. S121 remains separate unscheduled scope.

Native checkout, Windows checkout and remote main were read back at
`f85abacc771dc0f85c2f7bf69af3d05d8402e88e`; exact-SHA push CI 35549486717 passed.
Before these documentation edits, repeated native batch preflight read GO, thirteen features and
watcher_target on that head. GO does not override the independently identified safety defects.
Focused verification passed 194 tests in 37 files. Full verify.sh passed: 6,953 unit tests,
216 backend tests, policy checks and build. Core E2E passed 31 tests with 18 intentional skips.

## Verified host and cloud readbacks

- Approved `josiah@pmikcmetro.com` WSL CLI and ADC authentication passed on 2026-09-28.
- Billing enabled on the expected account. Unchanged controls: alert 25 USD, project hard stop
  100 USD, account backstop 100 USD, ACTIVE Node.js 22 guardrail with cap 100, hard-stop Pub/Sub
  present and two channels on each alert. No billing, budget or security setting was changed.
- Both ignored env files in both checkouts now carry Sheet write-back false.
- Canonical/tagged versions and sign-in returned HTTP 200; both versions name the exact serving SHA/revision. Admin browser authentication is UNVERIFIED
  after two 60-second sign-in navigation timeouts with no observed challenge; a page response is not authenticated assurance.
- Serving revision remains Production + Live, Demo false, managed identity and eleven Space maps.
  Its operating-Sheet flag is still true: the queued S128 pause has NOT reached production.

## Watcher and preserved cancelled attempt

A preexisting watcher (PID 382) was active despite the prior stopped claim and started the stale
S128-only head `0bbd95c3`. Cloud Build `57f23335-8f8b-490e-b18e-5d6d4b1db564` started at
20:58:24.661Z on 2026-09-28. The watcher was stopped and the build read back CANCELLED at
21:01:53.995Z. Candidate `pmi-kc-app-rmu82xj2c-fa2fae08b587` is absent; no traffic change occurred.
Cancellation is not a successful build, candidate, assurance or release.

The exact stale checkpoint is archived outside Git at
`~/.local/state/pmi-kc-release/checkpoint-0bbd95c3dbd8f4a93b4b185b8ba09770170d1ca4-cancelled-stale-batch-20260928T2107Z.json`,
with a reason file. The active checkpoint truthfully names the last completed S120 release below.
Watcher readback: zero processes and free lock. The existing scheduled task remains Ready and
unchanged; this is a stopped-process observation, not a disabled-task claim. Recheck before resuming.

## Release blockers

- Promotion compensation can restore the original Sheet-enabled predecessor without a pause check.
- Observer rollback can redeploy a paused predecessor image, but recovery still demands the original
  receipt-bound revision/fingerprint; the new rollback target is not durably recorded.
- Move-out withdrawal has no prior-evidence integration; manual non-renewal is not enforced by every
  supplied-draft path, and the review fingerprint omits provider notice history.
- Move-out labels still render raw ISO dates and accept date-shaped impossible calendar dates.
- Staff saves can automatically persist Sheet proposals during the pause; unexpired confirmations
  are not bound to a pause generation.
- The template filling helpers have no production caller; actual independently verified filled output
  is not demonstrated. PDF manual handoff remains permitted; no replacement provider is authorized.

## Awaiting release (built, CI-green, undeployed; one cumulative candidate)

1. S128 (F08) pause operating-Sheet writes: code `31bc9072`, docs `0bbd95c3`, CI 35342904192.
   Flag-false deployment and safe rollback remain required; current rollback gaps block release.
2. S123 (F02) retain unfinished renewals across date changes: `aa062d8e`, CI 35505452408.
3. S124 (F03) move-out detection and non-renewal outreach filtering: `fc03ec55` plus test fix `3d4a9e23`, CI 35508231675.
4. S134 (F14) color-coded lease status with matching sorting and filters: `136826cc`, CI 35508545796.
5. S122 (F01) all-lease visibility and explicit worklist views: `39a7f929`, CI 35509588537.
6. S125 (F04) thirty-day notice timing review with an explicit date basis: `41d6e00c`, CI 35511209348.
7. S126 (F06) consistent month/day/year date presentation: `7f0ed865`, CI 35512028503.
8. S127 (F07) clear blockers and exact next-action guidance: `52286917`, CI 35513295598.
9. S131 (F11) Rhino-policy conditional logic, ready for approved material upload: `59ad9224`, CI 35515037772.
10. S129 (F09) owner and tenant draft workflows, technical readiness for meeting validation: `009c4414`, CI 35516040981.
11. S130 (F10) seven-template intake and Dotloop prefill readiness: `696147f9`, CI 35517371018.
12. S132 (F12) end-to-end walkthrough preparation and meeting evidence: `f74468a1`, CI 35519202311.
13. S133 (F13) external maintenance-agent handoff assessment: `75c06252`, CI 35519982150.

## Verified production

Serving SHA: 79493458f641b9710d8c43467e872aa9acf7948e
Serving revision: pmi-kc-app-rmu4wevd9-d89996133320, 100% traffic (tag cand-rmu4wevd9-d89996133320).
Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app.
Freshly read-back serving fingerprint: sha256:d44428cbddc18208ef1422dff178fd2f24af77119465497623f02cd57c686568.
Recorded predecessor: pmi-kc-app-rmu4s6qo5-5d81e4f12265 / be023196ef63cd4e48db8230fc8deccaedae95c8.

S120's historical exact CI 35173497243, receipts and two-checkpoint 372,944 ms observation passed;
they are evidence for S120, not the thirteen-feature batch. All failed-attempt evidence stays outside
Git unchanged. No current batch receipt, promotion time or observation pass exists.

## Resume and remaining limits

After authorized repairs: focused adversarial checks, full verify.sh and core E2E, exact-main CI,
fresh preflight GO with thirteen entries/current watcher target, single native watcher on the free
lock, candidate/assurance/promotion/observation and independent readbacks. Follow the batch runbook.
Never substitute per-feature releases. Authentication expiry requires attended owner enrollment.

Compiled feature browser smokes and human verdicts remain NOT RUN for the batch. B-DL1, B-DL2,
B-DL3, B-S100, B-MNT1 and B-MNT2 remain open. Staff records are not provider receipts or signatures.
S36 stays behind complete S100; completed provider proofs are not rerun. Live providers remain
read-only for this release task. No customer draft/send, source write or paid comparison ran.
