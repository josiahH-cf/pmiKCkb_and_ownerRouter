# PMI KC current status

Last updated: 2026-09-29 (UTC).

## Current feature

**Failed run: BLOCKED — candidate assurance and date-comparison reconciliation.** Exact target `1fbf8c3d41dc9638f3d37e01e1cab7649b7c2151` passed [CI 36541531783](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/36541531783); all thirteen features reached GO. Run `d63f66b3-db02-472e-bd72-11c7e713198c` was admitted at 09:38:37.326Z. The permit is now explicitly **HELD** after preserving an immutable admitted-permit snapshot; operator Resume remains true. Its one application-build claim is already used. The failed run cannot rebuild or resume while held; its separately authorized replacement has not been admitted or deployed.

Recovery's first failure at 09:40:50.710Z remains preserved; its underlying cause was not captured. Separate later readbacks passed cloud readiness, exact configuration and zero traffic, while guarded diagnostics found a tagged-host authentication mismatch. That later diagnosis does not establish the first failure's cause. Approved Google-session reuse restored that host. All 13 guarded routes passed with zero mutations at 09:46:31.802Z. Same-run receipt `57db0431-0f93-4fea-8a71-41d7dda72eab` issued at 09:47:29.810Z for Ready, zero-traffic, Sheet=false recovery revision `pmi-kc-app-recovery-d63f66b3db02472e`, fingerprint `sha256:34490b4330ff3bec3d38da1a81f097a196f4af4d6526abb979f148f542f695d8`.

The one application Cloud Build `ab087fe8-d629-497b-a98c-456dbf843bd4` ran from 09:47:46.710856231Z to 09:51:28.859504Z and read SUCCESS. Candidate `pmi-kc-app-rmumhi7df-f037af48a1fe`, tag `cand-rmumhi7df-f037af48a1fe`, carries the exact frozen SHA and fingerprint `sha256:27aa3df5fe4b36184aaa0f2163eb906ad1a480f182a2a75da48c6dd73a6e1cd8`: zero traffic, Production/Live, Demo=false, Sheet=false. Smoke, fingerprint and domain gates passed.

The watcher blocked at 09:54:53.550Z with `assurance_unverified` and emitted no underlying assurance report; its exact cause is not established. A separate canary using the unchanged script at 09:56:11.788Z–09:57:08.143Z passed 11 routes but timed out desk DOMContentLoaded at 30.006 seconds, recorded two landmark failures and did not run its dependent workspace; mutations and authentication errors were zero. These standalone diagnostics do not prove the watcher's cause. A further serial guarded desk probe at 10:02 passed in 6.338 seconds with zero mutations, without replacing either failure. Reconciliation at 09:58:35.690Z matched all 311 source/projected/rendered identities without missing records, duplicates or invalid destinations, but failed with 307 field mismatches and stable source drift. No candidate assurance receipt, promotion or observation exists.

The aggregate diagnostic at 10:11:29.336Z–10:12:40.060Z preserved that original FAILED/307 verdict. All mismatches were `endDate`; address, owners, tenants and base-rent mismatches were zero. The 311 source rows contained 307 valid ISO dates and four missing dates. Each of the 307 visible dates exactly matched an independent MM/DD/YYYY conversion, and its unique `time[datetime]` exactly matched the source ISO date. Rendered-DOM and other-field mismatches were zero; sources were complete/stable, with zero missing/unexpected/duplicate records or invalid destinations. This establishes the comparator's ISO-versus-display-format mismatch, not an assurance pass. Receipts remain at `~/pmi-kc-work/logs/candidate-reconciliation-field-diagnostic-2026-09-29T101129334Z/report.json` and `summary.json`. Checker repair `4f553dcae4e63eee0cddf9d689cdc8013e79b1a2` passed 63 focused tests, TypeScript, lint and independent review, then the full native gate: 7,244 unit tests passed with four local-config checks intentionally skipped in the clean snapshot, all 232 backend tests passed, required gates passed and production build `_F3DKdqhP0JMBovFiHYn2` completed. Those four unchanged config-key parity checks separately passed against the actual native configuration at 10:31:56.552Z. No credentials were copied into the isolated runner. A corrected-checker read-only diagnostic passed all 311 source/projected/rendered records with zero mismatches at 10:21:46.480Z. The unchanged full canary passed all thirteen routes with zero diagnostics or mutations at 10:22:44.437Z; desk/workspace timings were 9.577/15.428 seconds under unchanged deadlines. These new scoped results preserve every earlier failure and do not issue release receipts, change the admitted candidate or authorize continuation.

The owner explicitly authorized repair of the replacement-release path and **one replacement cumulative candidate carrying all thirteen features** on September 29, 2026. This replaces the prior stop for that decision; it does not change the failed 1fb run, its HELD permit or consumed build claim. The corrected tree must pass review, the full gate, exact-head main CI and fresh locked admission before its separate replacement run starts. Preserve every failed checkpoint, claim and receipt; no per-feature releases, receipt edits or gate bypass are permitted. The runner uses the admitted application's exact checkout for assurance and observation; it cannot substitute a separately versioned checker into the failed candidate.

Replacement preparation remains conditional on the reviewed bootstrap/recovery repair, which is not part of the date-checker commit. It must select the actual already-authorized candidate host, validate its current exact tag/revision binding and preserve that binding separately from the canonical 100% serving predecessor. The last readback has that host on the failed 1fb candidate and the old S120 tag on the failed run's recovery; neither may be guessed to equal the serving predecessor. Derive a fresh Sheet=false recovery target and immutable receipt for the new run from the independently read canonical baseline. Preserve unrelated tag bindings, require service-version conflict checks, and never reassign the old recovery receipt or mark the failed checkpoint complete or rolled back. Archiving alone does not establish readiness.

Fresh readbacks remain scoped to the failed run and serving baseline: approved CLI/ADC probes were READY around 11:10 UTC, canonical Admin was READY at 11:14:21.741Z, and the Google sign-in provider returned HTTP200/enabled=true at 11:14:50.693Z without changes. Billing and the exact unchanged cost controls passed at 11:13:27.194Z. At 11:14:04.037Z, S120 still served 100% traffic; the failed 1fb candidate and its recovery stayed at zero, with one candidate authorized domain. The replacement preflight remained NOT READY despite thirteen features, green CI for then-head `22fc2b4d`, a free runtime and 1.9-hour enrollment: the old checkpoint/HELD permit and missing new-run prerequisites still prevent GO. None of these reads admits the replacement.

Native Node 22 run L passed 7,212 unit tests in 800 files, 232 backend tests in 42 files, all required gates and production build `MsohNlljqt7KxRmFLb2od` at 07:42:25.233Z. Its receipt directory is `~/pmi-kc-work/logs/gap-verify-l-2026-09-29T073525662Z`; full-log SHA256 is `f47e8febdd679a4c2cf0b06f204c517d25d2623f509be931aaba2baba2c817ec`. New core E2E passed 31 tests with 18 intentional skips at 07:47:43.666Z, preserving all 2,021 source hashes and this build. The isolated dev run ended with no test process or occupied port; it does not replace compiled production acceptance. Exact-build cold notice passed in 15.459 seconds and corrected desk-warmed notice passed in 17.456 seconds, both under the unchanged 20-second gate with HTTP 200, ready evidence, verified tenancy and a claim basis. A separate observational diagnostic matched all 311 source/snapshot/projected/rendered identity and category pairs before and after the notice API, with zero missing records or duplicates; this is cohort parity, not independent derivation of lifecycle truth. Both completed follow-ups reported zero blocked requests and page errors, and cleanup independently found zero owned Next processes.

Compiled follow-up receipts remain at `~/pmi-kc-work/logs/reservation-compiled-followup-2026-09-29T075109220Z`. The original run `reservation-compiled-2026-09-29T074817768Z` passed cold notice but its first warm attempt failed `notice_proof_required`: the runner omitted `PMI_CLEAN_WARM_NOTICE`, visited the 311-row desk and never requested notice. That failure remains unchanged and separate from the corrected pass.

Prior repair commit `d2ec88cc97578ddf028b2930af8540e19397613d` failed CI 36530528718 in two refresh-route unit cases and one S113 backend preview case; quality and policy/build passed. Default unit Firestore refusal, explicit memory fixtures, atomic-create reservation with exact existing-marker readback, cross-client races, bounded cleanup and all owning GET outcomes now pass the complete native gate. No deadline was extended. Later instrumentation localized reservation contention, but does not retrospectively identify the original CI failure's transaction site. K's historical unit admission database destination and metadata effects remain unverified; absent Data Access logs do not prove no effect. Every original outcome remains preserved. The pushed repair now has exact green CI; release admission still requires exact current-head green CI.

Historical immutable build K passed cold notice readiness in 16.563 seconds, a clean desk-warmed read in 16.778 seconds, exact save/readback focus and all 71 guide steps. Actual-source presentation and a separate six-category synthetic presentation passed both themes and 320/640/1360-pixel layouts, with zero overflow plus contrast, keyboard, accessible-tree, forced-colors and page-scale checks. A separate instrumented diagnostic verified all 311 source/cache/projected/rendered records and per-row categories before and after a newer API read, with zero missing records or duplicates. Its API read passed in 17.591 seconds and the desk caught up within its unchanged route deadline. Synthetic presentation establishes component presentation only; it does not establish actual source projection. K core passed 31 tests with 18 intentional skips and preserved its source hashes/build. These results do not verify the newer repair build. Human screen-reader and desktop full-page zoom verdicts remain NOT RUN.
All 118 references are mapped in [batch litmus evidence](evidence/batch-litmus-audit-2026-09-28.md). Every earlier failure is preserved.

All thirteen features remain queued until verified promotion and observation; S121 stays separate. The earlier 08:00 preflight hold and every failed receipt remain preserved, but fresh GO and admission subsequently passed for the frozen target above. Current continuation is held for candidate assurance and reconciliation, not expired authentication.

Fresh approved WSL CLI/ADC enrollment and identity binding completed at 09:18:39.478Z. One owner-approved WSL restart resolved the invisible WSLg window; headed Admin enrollment verified role Admin/human_completed at 09:34:11.947Z, and post-restart probes passed. Separate B-AUTH2 unchanged-enrollment longevity remains open. Billing and unchanged 25/100/100 USD cost controls remain independently verified; no budget, guardrail, identity, claim or security setting changed.

Independent readback at 10:03:32.146Z confirmed original S120 at 100% traffic with fingerprint `sha256:d44428cbddc18208ef1422dff178fd2f24af77119465497623f02cd57c686568` and Sheet=true. Candidate and prepared recovery were Ready with Sheet=false. Canonical/candidate versions returned HTTP 2xx with exact identities; authorized domains contained one candidate plus canonical. This readback made zero mutations. It is baseline/candidate evidence, not promotion or a completed release.

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
belongs to the admitted frozen run, stopped at candidate assurance. Its permit is explicitly HELD;
the earlier admitted permit was preserved immutably. Keep operator Resume true without treating it
as authorization to resume or create another build. The scheduled task configuration is unchanged.

## Serving release

Production serves `79493458f641b9710d8c43467e872aa9acf7948e` as
`pmi-kc-app-rmu4wevd9-d89996133320` at 100% traffic.
Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app.
The 10:03:32.146Z readback confirmed canonical/candidate exact versions over HTTP 2xx and one candidate authorized domain plus canonical. Candidate traffic remains zero.

Read-back configuration: Production + Live, managed runtime identity, eleven Space maps,
Demo false and operating-Sheet write-back **true**. The S128 pause is staged false in both ignored
env files in both checkouts, but it has not reached the serving revision.

S120's recorded tag is `cand-rmu4wevd9-d89996133320`; freshly read-back configuration fingerprint is
`sha256:d44428cbddc18208ef1422dff178fd2f24af77119465497623f02cd57c686568`.
Its historical exact CI 35173497243, candidate assurance receipt at 02:27:49Z, promotion verified
at 02:28:06Z, two-checkpoint observation of 372,944 ms and completion at 02:34:15Z on 2026-09-17
remain evidence for that release. They do not verify the queued batch.

## Authentication and cost controls

Approved `josiah@pmikcmetro.com` fresh WSL CLI/ADC enrollment and binding completed at 09:18:39.478Z on 2026-09-29; post-restart probes passed.
At 07:45:40.618Z, an independent Identity Platform Google-provider read returned HTTP 200
with the expected resource and enabled=true. No authentication setting was changed.
After one owner-approved WSL restart, headed Admin enrollment verified role Admin/human_completed
at 09:34:11.947Z. The later tagged-host mismatch was repaired through approved Google-session reuse;
recovery's 13-route guarded assurance passed. Candidate assurance remains blocked as described above.
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
effect was performed for this release check. Candidate assurance has no passing receipt;
promotion and observation for the batch remain NOT RUN.
