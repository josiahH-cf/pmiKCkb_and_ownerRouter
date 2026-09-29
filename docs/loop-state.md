# Loop state

Last updated: 2026-09-29 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

Terminal state: BLOCKED — fresh attended Google enrollment and remote release admission.
Run L passed 7,212 unit tests in 800 files, 232 backend tests in 42 files, all gates and production
build MsohNlljqt7KxRmFLb2od at 07:42:25.233Z. New core E2E passed 31 tests with 18 intentional skips
at 07:47:43.666Z; all 2,021 source hashes and the build were preserved. Exact-build cold and corrected
desk-warmed notice passed in 15.459/17.456 seconds under the unchanged 20-second gate. The separate
cohort diagnostic matched all 311 identity/category pairs before/after the notice API. Prior K
browser/core results retain their historical-build scope; cohort equality is not independent lifecycle derivation.
All thirteen queue entries remain. S121 stays separate. No batch candidate/promotion/observation ran.
CLI/ADC refresh works and Google sign-in is enabled; Admin requires attended Google sign-in.
The 20:56:36.677Z September 28 enrollment exceeds the seven-hour release-start budget; fresh attended
WSL enrollment is also required. Successful token refresh does not waive that gate.
The owner-approved read exception permits lease-bound version/hash/time invalidation metadata only.
Prior repair commit d2ec88cc97578ddf028b2930af8540e19397613d failed CI 36530528718: two unit cases
and one S113 backend preview case. Quality and policy/build passed. Default unit-store refusal,
explicit memory fixtures, atomic-create reservation, bounded cleanup and all owning GET outcomes
now pass run L. The original failed CI receipt remains unchanged.
K's unit database target/effects and the original CI transaction site remain unverified.
Exact new green push CI and fresh GO are mandatory.

## Verified host and cloud readbacks

- Approved `josiah@pmikcmetro.com` WSL CLI and ADC refresh passed again around 07:42 UTC.
- Google sign-in provider independently read HTTP 200 and enabled=true at 07:45:40.618Z, mutation zero.
- Billing and exact cost-control validation passed at 07:48:03.544Z on the expected account: alert 25 USD, project hard stop
  100 USD, account backstop 100 USD, ACTIVE Node.js 22 guardrail with cap 100, hard-stop Pub/Sub
  present and two channels on each alert. No billing, budget or security setting was changed.
- Both ignored env files in both checkouts now carry Sheet write-back false.
- Canonical/tagged versions and sign-in returned HTTP 200; both versions name the exact serving SHA/revision. Admin browser authentication is UNVERIFIED
  after a genuine Google challenge; attended enrollment closed before verification. A page response is not authenticated assurance.
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
The fail-closed interlock is installed in both checkouts. At 2026-09-29T02:31:17Z eleven release files
matched, no permit existed, zero watchers were found and the S120 checkpoint had no in-flight work.
The temporary installation hold was released; the kernel lock read free and direct admission refused.
The scheduled task remains Ready and unchanged. Recheck all state before preparing any permit.

## Current repair verification

G1/G2 retain reviewed notice history and owner-approved source invalidation; real Firestore tests
reject an old unused approval after a notice clears across instances. G3 covers 69 date consumers.
G4 creates no paused Sheet proposal and binds confirmation to the current server revision/policy.
G5 saves/downloads actual approved AcroForm bytes, preserves originals and atomically binds S20;
independent parsing checked 14 fields. Concurrent staging cleanup was reproduced and repaired;
all six real PDF race/persistence cases passed. G6/G7 recovery/admission passed 135 focused tests,
including five real kernel-lock/process tests and four observer-entry guards plus independent review.
Run L receipts: ~/pmi-kc-work/logs/gap-verify-l-2026-09-29T073525662Z; full-log SHA256
f47e8febdd679a4c2cf0b06f204c517d25d2623f509be931aaba2baba2c817ec. Both S113 journeys passed.
New core receipts: ~/pmi-kc-work/logs/core-e2e-reservation-20260929T074448Z; runtime cleaned up.
Historical K cold/desk-warmed notice passed in 16.563/16.778 seconds; save/readback focus, 71 guide
steps, actual-source and six-category synthetic presentation passed. Its separate instrumented
check matched 311 source/cache/projected/rendered records and categories before/after an API read.
K core passed 31/18 skipped. Eight earlier compiled smokes and prior G4/G5 controls retain their
exact-build scopes. K manifest: ~/pmi-kc-work/logs/final-k-browser-receipt-manifest-20260929.json.
New follow-up receipts: ~/pmi-kc-work/logs/reservation-compiled-followup-2026-09-29T075109220Z.
The first new warm attempt omitted PMI_CLEAN_WARM_NOTICE and failed notice_proof_required without
requesting notice; it remains unchanged alongside the corrected pass. Browser blocks/page errors and
remaining owned Next processes were zero. Older failures remain unchanged; human verdicts remain NOT RUN.

## Awaiting release (thirteen cumulative features; repaired head requires exact CI)

1. S128 (F08) pause operating-Sheet writes: code `31bc9072`, docs `0bbd95c3`, CI 35342904192.
   Flag-false deployment and prepared paused recovery readbacks remain required.
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

Next: commit the green repaired tree, require its exact push CI,
fresh attended WSL/Admin enrollment and preflight GO with thirteen entries/current watcher target, single native watcher on the free
lock, candidate/assurance/promotion/observation and independent readbacks. Follow the batch runbook.
Never substitute per-feature releases. Authentication expiry requires attended owner enrollment.

Local compiled checks are recorded above; remote batch browser assurance and human verdicts remain NOT RUN. B-DL1, B-DL2,
B-DL3, B-S100, B-MNT1 and B-MNT2 remain open. Staff records are not provider receipts or signatures.
S36 stays behind complete S100; completed provider proofs are not rerun. Live providers remain
read-only for this release task. No customer draft/send, source write or paid comparison ran.
