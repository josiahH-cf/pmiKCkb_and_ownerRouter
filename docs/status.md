# PMI KC current status

Last updated: 2026-09-29 (UTC).

## Current feature

**BLOCKED — fresh attended Google enrollment and remote release admission.**
Code/docs repair `a5d5791cf8ca1a2c02914f61386275f8db2c8308` was pushed. Its exact main [CI 36539913128](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/36539913128) passed all five lanes at 08:02:54Z. Release admission requires exact current-head green CI, including any subsequent documentation commit.

Native Node 22 run L passed 7,212 unit tests in 800 files, 232 backend tests in 42 files, all required gates and production build `MsohNlljqt7KxRmFLb2od` at 07:42:25.233Z. Its receipt directory is `~/pmi-kc-work/logs/gap-verify-l-2026-09-29T073525662Z`; full-log SHA256 is `f47e8febdd679a4c2cf0b06f204c517d25d2623f509be931aaba2baba2c817ec`. New core E2E passed 31 tests with 18 intentional skips at 07:47:43.666Z, preserving all 2,021 source hashes and this build. The isolated dev run ended with no test process or occupied port; it does not replace compiled production acceptance. Exact-build cold notice passed in 15.459 seconds and corrected desk-warmed notice passed in 17.456 seconds, both under the unchanged 20-second gate with HTTP 200, ready evidence, verified tenancy and a claim basis. A separate observational diagnostic matched all 311 source/snapshot/projected/rendered identity and category pairs before and after the notice API, with zero missing records or duplicates; this is cohort parity, not independent derivation of lifecycle truth. Both completed follow-ups reported zero blocked requests and page errors, and cleanup independently found zero owned Next processes.

Compiled follow-up receipts remain at `~/pmi-kc-work/logs/reservation-compiled-followup-2026-09-29T075109220Z`. The original run `reservation-compiled-2026-09-29T074817768Z` passed cold notice but its first warm attempt failed `notice_proof_required`: the runner omitted `PMI_CLEAN_WARM_NOTICE`, visited the 311-row desk and never requested notice. That failure remains unchanged and separate from the corrected pass.

Prior repair commit `d2ec88cc97578ddf028b2930af8540e19397613d` failed CI 36530528718 in two refresh-route unit cases and one S113 backend preview case; quality and policy/build passed. Default unit Firestore refusal, explicit memory fixtures, atomic-create reservation with exact existing-marker readback, cross-client races, bounded cleanup and all owning GET outcomes now pass the complete native gate. No deadline was extended. Later instrumentation localized reservation contention, but does not retrospectively identify the original CI failure's transaction site. K's historical unit admission database destination and metadata effects remain unverified; absent Data Access logs do not prove no effect. Every original outcome remains preserved. The pushed repair now has exact green CI; release admission still requires exact current-head green CI.

Historical immutable build K passed cold notice readiness in 16.563 seconds, a clean desk-warmed read in 16.778 seconds, exact save/readback focus and all 71 guide steps. Actual-source presentation and a separate six-category synthetic presentation passed both themes and 320/640/1360-pixel layouts, with zero overflow plus contrast, keyboard, accessible-tree, forced-colors and page-scale checks. A separate instrumented diagnostic verified all 311 source/cache/projected/rendered records and per-row categories before and after a newer API read, with zero missing records or duplicates. Its API read passed in 17.591 seconds and the desk caught up within its unchanged route deadline. Synthetic presentation establishes component presentation only; it does not establish actual source projection. K core passed 31 tests with 18 intentional skips and preserved its source hashes/build. These results do not verify the newer repair build. Human screen-reader and desktop full-page zoom verdicts remain NOT RUN.
All 118 references are mapped in [batch litmus evidence](evidence/batch-litmus-audit-2026-09-28.md). Every earlier failure is preserved.

The thirteen-feature queue remains S128, S123, S124, S134, S122, S125, S126, S127, S131, S129,
S130, S132 and S133. S121 remains separate and unscheduled. Exact-head green push CI, fresh
prerequisites and GO, one candidate, promotion, observation and independent readbacks remain gates.
No batch deployment or release receipt exists.
Preflight at 08:00:40.289Z found thirteen features, watcher target `a5d5791c`, aligned checkouts,
native runner READY with a free lock and zero watchers, and Sheet pause/Demo flags READY. It was
held for a missing permit, missing fresh prerequisite receipt, 11.1-hour enrollment and CI still
in progress at that time. CI subsequently passed; fresh GO remains required. Missing collector
evidence is not a finding that billing is disabled. The prior blocked-state document gate passed
pinned tests 6/6, Prettier and all document gates at 07:58:36.804Z–07:58:57.540Z.
Fresh attended WSL enrollment and Admin browser sign-in are required. CLI/ADC refresh passed,
but the 2026-09-28T20:56:36.677Z enrollment exceeds the seven-hour release-start budget.

Repairs include reviewed notice evidence and the approved invalidation marker, both-audience final-
claim refusal, strict dates across 69 consumers, proposal-free Sheet pause, actual immutable filled
PDF output/approval and shared paused recovery with exact admission/lock. Independent parsing checked
14 PDF fields; six real PDF races passed. Release recovery/control passed 135 focused tests including
five real process tests. Actual form accuracy and human verdicts retain their external prerequisites;
synthetic fixtures never become production records.

## Cancelled stale attempt and watcher

A preexisting watcher started an S128-only build from `0bbd95c3` at 20:58:24.661Z on
2026-09-28. The runner stopped it and cancelled Cloud Build
`57f23335-8f8b-490e-b18e-5d6d4b1db564`; its terminal readback is CANCELLED at 21:01:53.995Z.
Candidate `pmi-kc-app-rmu82xj2c-fa2fae08b587` is absent, and traffic did not change.
The attempt was not relabeled successful.

The stale checkpoint is preserved verbatim with a reason outside Git. The active checkpoint now
names the last completed S120 release. At 2026-09-29T02:31:17Z eleven release files matched both checkouts, the permit was absent and zero
watchers were found. The temporary installation hold was released and the kernel lock read free.
Direct admission still refused; the unchanged scheduled task remains Ready. Recheck before resuming.

## Serving release

Production serves `79493458f641b9710d8c43467e872aa9acf7948e` as
`pmi-kc-app-rmu4wevd9-d89996133320` at 100% traffic.
Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app.
Canonical/tagged versions and sign-in returned HTTP 200 after billing recovery; both versions name the exact serving SHA/revision. Authorized domains contain exactly one candidate entry for the old S120 release plus canonical.

Read-back configuration: Production + Live, managed runtime identity, eleven Space maps,
Demo false and operating-Sheet write-back **true**. The S128 pause is staged false in both ignored
env files in both checkouts, but it has not reached the serving revision.

S120's recorded tag is `cand-rmu4wevd9-d89996133320`; freshly read-back configuration fingerprint is
`sha256:d44428cbddc18208ef1422dff178fd2f24af77119465497623f02cd57c686568`.
Its historical exact CI 35173497243, candidate assurance receipt at 02:27:49Z, promotion verified
at 02:28:06Z, two-checkpoint observation of 372,944 ms and completion at 02:34:15Z on 2026-09-17
remain evidence for that release. They do not verify the queued batch.

## Authentication and cost controls

Approved `josiah@pmikcmetro.com` WSL CLI/ADC refresh passed again around 07:42 UTC on 2026-09-29.
At 07:45:40.618Z, an independent Identity Platform Google-provider read returned HTTP 200
with the expected resource and enabled=true. No authentication setting was changed.
Guarded Admin browser authentication remains UNVERIFIED after a genuine Google challenge;
attended enrollment closed before verification and now awaits the owner.
At 07:48:03.544Z, billing and the exact cost-control validator passed with zero mutations.
Billing is enabled on the expected account. The unchanged controls read back as alert 25 USD,
project hard stop 100 USD, account backstop 100 USD and ACTIVE Node.js 22 guardrail with cap 100.
The hard-stop Pub/Sub configuration is present, and both alerts retain two channels.
No billing, budget, IAM, claim, identity or security setting was changed.
Elapsed-session longevity remains separate; a stale enrollment requires the owner's attended step.

## Delivered baseline and open dependencies

S113 F1-F5 and S114-S120 remain the delivered baseline: the dashboard, typed corrections,
governed source updates, operator-triggered comps, reviewed unsent draft preparation, audited manual
progress and operator workspace improvements. Staff completion remains distinct from provider
receipts and signatures. Blank resource inputs remain supported; only dependent outputs wait.

B-DL1, B-DL2 and B-DL3 remain open for approved Dotloop credentials, managed connection/selection,
and real forms/mappings. Both Dotloop keys remain closed. B-S100 still needs the exact synchronized
resident and verified email; S36 remains queued behind complete S100. B-MNT1 and B-MNT2 remain
open for preapproval proof inputs and external maintenance-agent evidence. No meeting or
customer-specific verdict is inferred from engineering tests.

No live customer draft/send, source write, paid comparison, historical proof rerun or signature
effect was performed for this release check. Candidate receipts and observation for the batch
remain NOT RUN.
