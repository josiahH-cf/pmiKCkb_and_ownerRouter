# Loop state

Last updated: 2026-09-29 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

BLOCKED: candidate assurance rejects the exact successful build’s provenance update.
Repair main 497333a686c09cc492c7a4ef6edd925c7c8dfb98 is pushed; native and independent 2,189-blob audit match.
[CI 36573074638](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/36573074638) passed all five jobs on that exact repair SHA, completing 13:14:11Z.
Exact admitted SHA b59f2c6f08a32f022cff5112a16bc5405664e4d1; [CI 36563319696](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/36563319696) passed.
Run 59d3ef47-06c6-4d9c-9235-ffb257e9976f was admitted 11:51:31.991Z.
The owner-authorized 12:23 same-run resume passed recovery 12:25:57.310Z, receipt
c8112978-83d0-4ddc-8ad8-0f07538806e7, reference hash
de865c7bda6b0c6f538119e697c348460698c740de670967baf5733ae692b31a.
One application claim was made 12:26:10.017Z. Build 5dfbc9d0-4a9c-4972-b371-fed8d1388f77
succeeded 12:30:30.821224Z. Candidate pmi-kc-app-rmumm94q0-db6fbbbf472d is Ready at zero traffic,
Production/Live, Demo=false, Sheet=false; fingerprint
sha256:332270ebfef15047baf756d47e09d72b514dccf43f93911fc6aae9212c55b368.
Smoke, fingerprint and domains passed. Assurance failed 12:33:42.187Z unclassified_child_failure.
The unchanged verifier reproduced recovery_service_controls_changed. Only buildConfig.name and
sourceLocation changed to the exact successful build and generation-qualified source; all other
controls match, and the operation’s typed Service response recomputes the serviceControlsHash recorded in the immutable recovery receipt.
Candidate canary/reconciliation were NOT RUN within the gate; no candidate assurance receipt,
promotion or observation exists. Keep all thirteen features queued.

Prior 497 repair full gate and CI passed. The final unique-output correction passed 263 focused
tests/6 files, typecheck/lint and independent review; its full gate passed with 7,425 unit/232 backend passes and all required checks; its commit and exact-head CI remain pending.
Fresh approved CLI/ADC enrollment/binding passed 13:16:20.229Z after an owner-requested retry;
the earlier 13:13:03.542Z timeout remains failed. Guarded Admin readiness passed both exact origins at 13:42:27.560Z; full assurance is separate.
Corrected verifyRecoveryAvailability returned true 13:25:04.509Z: default freshness, exact
b59/run59d3 receipt/candidate, seven guarded GET200 responses, unchanged checker/eight state hashes.
This is diagnostic only: no candidate assurance receipt, promotion, observation or continuation.
Guarded Admin readiness passed both canonical and exact b59 candidate 13:42:27.560Z:
HTTP200/Admin/expected heading, no sign-in, zero attempts/blocks/errors, nine state hashes unchanged,
lock released and owned/profile/watcher processes 0. Prior timeouts remain failed; cause unproven.
A further replacement requires separate owner approval; no silent verifier/receipt substitution.
The last permit is admitted until 17:47:51.558Z; permit/Resume is not execution authority.
Earlier failures remain immutable, including unproven precise causes of the first two recovery failures.

## Verified implementation and local proof

Final b59 gate passed 11:28:44.910177Z–11:37:01.569397Z: 7,289 unit passes, four clean-config
skips, 232 backend passes, all required gates/build 4uaO6qfRu25uJswh6MZrf. Four actual-config
checks separately passed 11:42:00.939Z; skips are not relabeled. Focused 139/7 + independent review passed.
Full receipt: ~/pmi-kc-work/logs/replacement-ship-verify-20260929T112448971523Z/summary.json.
All 2,188 tracked paths and 17 changed paths match committed/tested b59 bytes.
G1–G7 engineering proofs and all 118 litmus references retain exact scopes in the batch audit.
The G4 historical-proposal/resume compiled component branch passed both cases, zero effects,
current application source 955 hashes matched, build MsohNlljqt7KxRmFLb2od; process cleanup 0.
Receipt: ~/pmi-kc-work/logs/g4-historical-component-1790680995497/report.json.
K/L compiled/core and actual filled-PDF proofs remain scoped; human verdicts NOT RUN.
Historical K unit-store target/marker effects remain UNVERIFIED; absent logs prove no zero-effect claim.

## Awaiting release (thirteen cumulative features)

1. S128 (F08) pause operating-Sheet writes: code `31bc9072`, docs `0bbd95c3`, CI 35342904192.
   Recovery preparation passed; the paused candidate still requires assurance and production promotion.
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

## Verified production and authentication

Serving SHA 79493458f641b9710d8c43467e872aa9acf7948e (S120).
Revision pmi-kc-app-rmu4wevd9-d89996133320, 100%; canonical binding passed 12:44:03.541Z.
Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app.
Last full configuration fingerprint: sha256:d44428cbddc18208ef1422dff178fd2f24af77119465497623f02cd57c686568.
Production/Live, managed identity, 11 Space-map entries per map, Demo=false, Sheet=true.
Blocked-state readback passed 12:44:03.541Z: exact candidate and recovery Ready/zero traffic,
Production/Live, Demo=false, Sheet=false; canonical S120 remains 100%, one candidate domain.
Versions, fingerprints and checkpoint match. This is not assurance or promotion.
Approved CLI/ADC enrollment/binding 09:18:39.478Z; headed Admin 09:34:11.947Z after owner-approved
WSL restart. Authentication returned READY at 12:22:47Z. Google provider enabled 11:14:50.693Z; billing/cost passed 11:13:27.194Z.
Billing/service read 13:40:31.862Z confirmed billing enabled, Ready/generation and S120 at 100%.
No billing/budget/guardrail/security/identity/claim change. Fresh CLI/ADC passed 13:16:20.229Z.

## Next step and remaining limits

Commit/push the final correction and verify exact-head CI; its full local gate passed.
The fresh authentication and passing read-only diagnostic do not authorize another replacement.
Resolve the frozen-candidate/execution decision explicitly before any further release action.
Never blind-retry, change receipts, create another candidate/run or use per-feature releases.
After actual RELEASED only: independent versions/traffic/config/domain readbacks, guarded remote
feature checks, then in-place docs closure/pinned six tests/document gates and documentation-only push.
B-DL1/2/3, B-S100, B-MNT1/2 and separate B-AUTH2 longevity remain open. S36 stays behind S100.
Actual draft/form/Rhino/policy/meeting and human accessibility verdicts remain unverified; S121 separate.
No customer draft/send, paid comp, provider proof rerun or synthetic production record.
