# Current status

Updated: 2026-11-13 (UTC).

## November 10 renewal walkthrough delivery

Production serves `7f4cf234c18c0b80a0ed88bc08d70e174ae9c311` / `pmi-kc-app-recovery-d8c6629da8bc4d73` at 100% canonical traffic.
The receipt-bound rollback from staff workflow audit chunk 1 verified at `2026-11-13T19:25:24.889Z`.
[Chunk 1 attempt evidence](evidence/staff-workflow-audit-chunk1-attempts-2026-11-13.md). The original November 10 delivery was
verified on `pmi-kc-app-rmwcvtvpl-13e72fe3f01f`.
Run `943a91a6-c659-4234-95ea-3582d0a4011e` consumed its permit after one successful application build `053961ec-41a0-4553-bc03-f37ecf2d8926`.
Two observation checkpoints passed in 402,737 ms. All 375 source, projected and rendered
lease records matched with zero discrepancies, candidate 5xx, unresolved effects or guarded
mutation attempts. All eleven independent final readbacks passed at `2026-11-12T02:04:06Z`.
[Delivery evidence](evidence/renewal-walkthrough-delivery-2026-11-12.md) · [Exact-main CI](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/43133331913)

Intakes 139–149 shipped together and the queue cleared after independent readbacks.
S271 engineering is Yes across nine N10 cases, with a separate Thursday Yes, on exact source
`c0f6490e8659a3aa684099590efbbbcbef7c6deb` and build `EvsdEv_bUWl9gRTP0vv6O`. The S260 replay
is Yes across ten journeys and all three Help roles on the same source.
Human verdict: NOT RUN — no human observer. [Qualification](evidence/renewal-walkthrough-qualification-2026-11-10.md)

Run `d3a71afe` stopped at deploy before any candidate existed, because Cloud Build could not
type-check a test that imported an upload-excluded fixture. Test-only repair `7f4cf234` shipped
in the replacement run. The unit upload-set gate and the watcher's bare-cache fetch refspec now
guard both November 12 release stops. The Thursday checkpoint and the Friday staff review stay separate from
cumulative admission. Both Dotloop write keys remain closed, and signing stays human. Fees, tenant links, Dotloop maps
and the program source remain source pending in their owners.

## November 9 renewal simplification delivery (historical)

Production served `0afd020671ea9fbb1f0ee75484943c60e331b91a` / `pmi-kc-app-rmw9w581k-2489abae9071` at 100% canonical traffic.
Run `b61162cf-8646-4f9c-803e-3b24824c6e34` consumed its permit after one successful application build `1f42ae31-629b-418d-807a-e12fe229a9c1`.
Two observation checkpoints passed in 401,874 ms. All 375 source, projected and rendered
lease records matched with zero discrepancies, candidate 5xx, unresolved effects or guarded
mutation attempts. All eleven independent final readbacks passed at `2026-11-09T23:53:48Z`.
[Delivery evidence](evidence/renewal-simplification-delivery-2026-11-09.md) · [Exact-main CI](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/42718078835)

Intakes 130–138 shipped together and the queue cleared after independent readbacks.
S260 engineering is Yes across ten journeys and all three Help roles on exact source
`b4fb6aa03e65aca6398b8adcefd523b6530e2f2f` and build `b9znJuQzNo6VAt8ZaK0Ut`. Staff verdict NOT RUN.
[Qualification](evidence/renewal-simplification-qualification-2026-11-09.md)

## November 7 renewal usability delivery (historical)

Production served `2e5e47a8a1112c53784170a29ab134cab336e4a0` / `pmi-kc-app-rmw84kdpe-d7fc9bff670c` at 100% canonical traffic.
Run `3003f053-9450-433c-8073-734d7914d222` completed with one successful application build and its permit consumed.
Two observation checkpoints passed in 405,871 ms. All 375 source, projected and rendered
lease records matched, with zero discrepancies, candidate 5xx, unresolved effects or guarded
mutation attempts. All eleven independent final readbacks passed at `2026-11-08T18:08:51Z`.
[Delivery evidence](evidence/renewal-usability-delivery-2026-11-08.md) · [Exact-main CI](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/42505264623)

## November 7 renewal one-path (historical)

Production served `ef81b8917209f4eec3f22097142b559f3cce875b` / `pmi-kc-app-rmw65wgt2-8c8249a0547c` at 100% canonical traffic.
PR #191 and source PRs #184–#190 shipped together in run `72c6456a-3f3f-4ec2-8282-03542cfb7772` after all seven
exact-main CI jobs passed in `42356598810`. The controller exited zero and its permit is consumed.
Observation passed 2 checkpoints in 410,069 ms with 375 matched
source, projected and rendered lease records, zero discrepancies, candidate 5xx, unresolved effects
or guarded mutation attempts. The eleven independent final readbacks passed at
`2026-11-07T09:12:03Z`. See the [delivery evidence](evidence/renewal-one-path-delivery-2026-11-07.md).

The [independent litmus](evidence/renewal-one-path-litmus-2026-11-06.md) retains 62 Yes, two No and seven
UNVERIFIED on its complete `edba7cbb` run, with separately dated repair rechecks. L55 remains No
because the settled assistance rule classifies the voucher-only lease as Ready. Batch acceptance
remains No. Human verdict NOT RUN.

## November 7 renewal usability qualification

Published specification `4caad68df6885d3eed4cb2b3fff7c70e5c96ae15`. Remote main at the start was `bf9753d6af9c7cb90c7a17d3dee0965ae9656095`. The deployed comparison baseline is `ef81b8917209f4eec3f22097142b559f3cce875b`.

PR #193 merged the implementation. The Tenant offer and Update status Help checks were repaired in [PR #194](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/pull/194) and [PR #195](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/pull/195). Exact application main `e012bddc42a5370686e114a9bb5f848dbb1b748a` passed all seven jobs in [push CI 42448213069](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/42448213069).

The full S259 replay passed all 14 journeys on `4b17ec5e4482f73225fd0dfb6d193576389fee85`. S252 passed 107 checks and all five budgets. The mailbox-disabled rehearsal passed 17 cases. The full WSL gate passed 11,578 unit tests with 4 existing skips, all 555 Firestore tests, the production build and 65 served E2E tests with 4 skips. Core E2E passed 46 with 23 explicit no-emulator skips. Rendered Help matched 27 scenes and accounted for 838 controls with zero missing. The disposable drift probe detected the hidden Record work control and nine changed scenes.

Governance PR #196 merged first at `48b5540f`. PR #197 then merged the scoped recovery mapper and Lease details capture repairs at `11c502c1f05c668234b588e57393ab0b7f92d329`. All seven lanes passed on the exact PR head and exact release main. [Governance PR](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/pull/196) · [Repair PR](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/pull/197) · [PR CI](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/42478870881) · [Push CI](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/42480191023)

See [delivery evidence](evidence/renewal-usability-delivery-2026-11-08.md) for the preserved pre-promotion stops and repairs.

The owner resolved the Gmail profile scope on November 8 for the existing guarded release check and directed governance to merge first. Standalone WSL CLI/ADC, existing Admin session, billing and cost-control checks passed on November 8 UTC. Staff verdict NOT RUN. See [guarded release assurance](../AGENTS.md#guarded-release-assurance). The [litmus report](evidence/renewal-usability-litmus-2026-11-07.md) preserves the exact runs, earlier failures and evidence gaps.

## November 5 S245 litmus fixes delivery (historical)

The S245 litmus fixes for S87, S126, S147, S242 and S86 (PR #182) are DELIVERED at `5b5c65c6` /
`pmi-kc-app-rmw3h1wp5-706485135a02`, 100% canonical traffic. Run `8bf183d8` completed on its first
pass and its permit is consumed. Exact-main CI passed seven jobs (`42018344883`), after five at
`952b33e7` (`42009697057`); the exact head's full gate passed 10,479 unit and 497 backend tests.
Observation passed two checkpoints/414,492 ms, 375 matched records, zero discrepancies/5xx/unresolved
effects or mutation attempts; all eleven final readbacks matched at 12:02:19Z.

Two preparation stops came before admission. The first prepare at `952b33e7` stopped on
authentication because the WSL CLI/ADC enrollment was 17.6 h old, past Google's roughly 16 h
reauthentication limit, and the owner re-enrolled; the second refused `remote_main_moved` after
PR #183 (test and CI tooling) merged, so the release followed main to `5b5c65c6`. A read-only production check then found help V1.1 at the
serving commit, every help heading kept with its content in print, the Notifications button's
count named once and the Workflow card's Next line on all five process Spaces.

PR #180's test-side S113 journey fix rode the candidate without a queue row; the green exact-main
runs close Q-ENG-ADV-CI. Help stays V1.1; the three Open Questions keep their defaults, the 25
S245 L10 steps are unchanged and the human verdict is NOT RUN. Exact holds remain in
`docs/open-blockers.md`; delivery evidence:
`docs/evidence/s245-litmus-fixes-delivery-2026-11-05.md`.

## November 5 help-hub litmus repairs delivery (historical)

The S242–S245 help hub litmus repairs and help V1.1, with the S235 Admin form-family hint, were
DELIVERED at `3f2e3f5d` / `pmi-kc-app-rmw3661as-aecc6937ff3f`, then 100% canonical traffic. Run
`6951545a` completed and its permit is consumed. Exact-main CI passed five jobs (`41979132377`);
the pull-request head's full gate passed 10,391 unit and 497 backend tests. Observation passed two
checkpoints/416,972 ms, 375 matched records, zero discrepancies/5xx/unresolved effects or
mutation attempts; all eleven final readbacks matched at 07:04:43Z.

The run's first candidate assurance pass stopped before promotion (`assurance_unverified`) with
production untouched. Its request log showed no 5xx and slow cold first loads, including a 41.5 s
renewal desk; the gate kept no report, so the cause is not proven beyond cold first loads.
Read-only diagnostics on the warm candidate rendered 13 of 13 Admin routes and matched
375/375/375. The operator resume of that same pass then passed assurance, promotion, observation
and completion, with no rollback.

The S245 machine-run litmus accepted the hub on Run 4 at `13e5ab40` under R-S245-5: no check is
No, L10 is UNVERIFIED for 25 steps that need RentCast, Gmail, Dotloop, the Sheet updates switch or
Production with Live data, and the human verdict is NOT RUN. Pull-request CI's firestore lane failed
twice on the S113 mounted journey's tenant-preview wait (attempt one of runs 41968323970
and 41974275990) on commits that change only help text and docs; each passed unchanged on re-run.
Its cause is test-side (jsdom's label lookup starved the journey's shared thread); PR #180's repair
shipped in the release above and closed Q-ENG-ADV-CI. Delivery evidence:
`docs/evidence/help-hub-litmus-repairs-delivery-2026-11-05.md`.

## November 4 help-hub delivery (historical)

The S242–S245 staff help hub and the merged #173 adversary-review fixes were DELIVERED at
`323e8be3` / `pmi-kc-app-rmw2hrh4d-8b96ea7b6800`, then 100% canonical traffic. Run `74d79a9d`
completed and its permit is consumed. Exact-main CI passed five jobs (`41886947757`); the
pull-request head's full gate passed 10,387 unit and 497 backend tests. Observation passed two
checkpoints/413,080 ms, 375 matched records, zero discrepancies/5xx/unresolved effects or mutation
attempts; all eleven final readbacks matched at 19:31:37Z.

The first run of this source (`6960e4e1`, `b0f3fca2`) held at observation after one passed
checkpoint; its resume ended in a verified rollback and it is archived as superseded. The S245
machine-run litmus report followed; its repairs shipped in the release above. Delivery evidence:
`docs/evidence/help-hub-delivery-2026-11-04.md`.

## November 3 gap-program delivery (historical)

The P1–P9 application delta was DELIVERED at `b5ba7802` /
`pmi-kc-app-rmw123csb-dc0ce89a8583`, then 100% canonical traffic. Run `ff1f44bf` completed and its permit
is consumed. Exact-main CI passed five jobs; full07 passed 10,162 unit/four parity skips and 497
backend/no skips, with core 46 passes/23 explicit no-emulator skips. Observation passed two
checkpoints/417,609 ms, 375 matched records, zero discrepancies/5xx/unresolved effects or mutation
attempts; all eleven final readbacks matched at 19:27:02Z.

All thirteen normal configuration operations have confirmed response/independent readback and
clean profile release: source destinations v16, Dotloop observation with selection v1 preserved,
settled basis v1, and the existing process Active v1 with six steps/three links/verified immutable
bytes/zero runs. Independent reviews passed within those scopes. No original/legal/map approval,
provider business effect, customer communication, signature or Dotloop key activation is inferred.

The live source handoff remains deliberately non-runnable because the runtime lacks metadata-list
permission. Actual approved source and an importer-compatible owner handoff are verified; the
prepared one-permission/bucket proposal needs one project-owner scope decision under S240's
explicit IAM exclusion. No client files/login or new permission was needed/applied. Process staffing placeholders need a real team
responsibility choice before staff routing is claimed. Exact holds remain in `docs/open-blockers.md`;
delivery/configuration evidence: `docs/evidence/application-gap-delivery-2026-11-03.md`.

## Earlier November 3 qualification history

The owner launched the finalized P1–P9 gap plan after the delivery recorded below. Its bounded
source repairs passed native full gate 06 at 17:01:58Z: 10,128 unit tests (four existing parity
skips), 497 backend tests, all policies and production build. All 14 app phases passed 17 isolation
controls, all 12 emitted font hashes match, staged source is unchanged and actual outer exit is zero.
Exact-main CI passed for reviewed head `a32d1a6b` in run `41682825309`. Independent review then
found canonical PDF continuation, immutable publication readback, retired process-surface history
and re-index UI currency gaps, plus unperformed required core E2E. The four source repairs now
pass focused checks and independent re-review. Core E2E passed 46 tests with 23 explicit
configuration skips. Corrected full07 passed at 18:30:52Z: 10,162 unit tests/four existing parity
skips, all 497 backend tests, all policies/audit and production build. Fresh exact-main CI and
delivery remain pending; the slice is not admitted for release.
See `docs/open-blockers.md`.
The 34-step credential-free browser journey passed separately from production/human acceptance.
All eight unchanged supplied originals now pass complete parser compatibility and bounded local
tripwires; legal/map approval and real-original publication remain separate. Current technical
questions and residual human inputs are maintained in `docs/open-blockers.md`; see
`docs/evidence/application-gap-implementation-2026-11-03.md`. Both Dotloop write keys remain closed.

Production serves `bc97535379dd08deab578455b00a80fc93b8d209` / `pmi-kc-app-rmvzwt7ms-00754475effd` at 100% canonical traffic.
Run `d4c109a0-6dce-4c4d-8928-ec77e9a58c73` completed at 2026-11-03T00:10:44Z, with its permit consumed and watcher exited.
One application build `fbe2d323-9a95-4d51-a398-618f8928cdc8` succeeded. Candidate receipt
`da8eab6f-ee31-4642-9266-0c9ae3c1d641` issued at 00:03:44.084Z; receipt-bound promotion verified
at 00:04:07.060Z. Observation passed two checkpoints in 401,533 ms against the 300,000 ms minimum
and 480,000 ms deadline. All 375 source/projected/rendered records matched with zero discrepancies,
candidate 5xx or unresolved effects. All thirteen guarded Admin routes rendered with zero
mutation attempts and diagnostics; Editor browser remains `not_run` under the existing policy.
All eleven independent readback sections matched at 00:15:13Z. Fingerprint:
`sha256:db70cd63e1c17ebb706e5291422e68d8be06707ceebc5805a7408b5eda547fe0`.
Only APP_COMMIT_SHA changed among 54 environment keys. The five secret bindings, runtime identity,
eleven Space maps, Production + Live, Demo=false, Sheet=true and existing cost/action controls match.
The annual GET readiness probe passed and restored its exact target/calendar in PAUSED state;
the existing minute worker remains ENABLED. No customer dispatch was test proof.

The cumulative S232–S239, S126 date repair and scoped WSL authentication changes are delivered.
Evidence: docs/evidence/application-delivery-2026-11-03.md.

## Verification

PR #170 merged at `5ddb6ec1`; its five exact-main checks passed. PR #171's reviewed head
`8f4f8ec68641f42bb787cf3e7cee0f01d74d78bc` passed its own completed automated review with no
findings/unresolved findings and all five CI jobs in `41540700295`, then merged to `bc975353`.
All five exact-main push jobs passed in `41542987797` before release.

The corrected local gate retained all required command results: 9,942 unit tests with four
existing configuration skips, 495 backend tests, policies, zero production audit findings and
production build. Nineteen step records, fourteen isolation control sets, emitted build/font bytes
and both unchanged source copies passed independent readback. Its original outer supervisor exit
was not recorded; that gap remains explicit and no missing report was fabricated. Fresh PR and
exact-main CI passed on the final source. Three fail-first actual-kernel-lock regressions cover
the rejecting-close lease repair. The isolated 34-step journey passed on identical application
runtime bytes before the local-auth changes; synthetic results do not establish staff acceptance.

Post-release checks rendered all seven People sign-in dates without Invalid timestamp.
The live desk and an actual linked lease opened; Full view showed four recurring charges and no
supporting-read failures. The Sheet read completed but that sample has an ambiguous association,
so no row/write target was inferred. The authenticated strict read-only `options` operation returned
200/ok with four charges; the UI refresh button was not clicked. All four Communications tabs,
Connections and Readiness opened; this proves navigation/current views, not a real dispatch.

The private diagnostic's first two attempts had harness timing/panel-selection failures. The final
attempt completed those behavior checks but its last independent identity request raised TypeError
without a retained HTTP response. Its failed outcome is preserved. A separate read at 00:22:52Z
matched the exact canonical version and 100% traffic, with the profile lease free; no browser
relaunch or behavior rerun was used to fill that identity gap. The recovered November 2 renewal
endpoint 500 retains an unproven root cause; successful current reads are recovery evidence only.

## Operator readiness

The one-command WSL operator entry point is
`bash /home/josiah/pmi-kc-work/auth-command-20261102/scripts/pmi-auth`, from any WSL directory.
Its retained author checkout `8f4f8ec6` has the same runtime tree as merged main `bc975353`.
After deployment, the actual command returned process/reported exit 0 in 36.964 seconds with
`auth_ready_with_exceptions`, existing Admin session and a free profile lease before/after.
Approved CLI/ADC token refresh, GitHub API identity, local and production RentVine metadata,
29 Sheet tabs, Drive folder, managed Gmail readonly profile, eleven search-store metadata reads
and the exact existing Dotloop account passed. Paid RentCast and AI generation are untested.
An actual Google challenge still needs the owner; no password, code, passkey or CAPTCHA is automated.
Espansr replacement/merge/reinstall is a separate handoff and was not performed here.

## Exact remaining boundaries

Both Dotloop business-write keys remain closed; signing is a human handoff. C00/A1 selection
and the A5 policy decision remain settled. Eight saved source references are unverified; approved
originals and reviewed field/signer maps remain missing across ten form families. R-S235-7 map
verification and real staff acceptance remain NOT RUN. Each client hold blocks only its named effect.
No live lease mutation, email, draft, payment, signature, paid lookup or production test record was
used as proof. Staff-account browser acceptance, forced MFA, unchanged 24-hour enrollment and a
physical-phone verdict remain unverified. Training/video suggestions and the Dan/Jon communication
remain drafts; nothing was sent or booked.

The original native Claude owner remains stopped. Original failed attempts and the archived held
run retain their actual outcomes. The release queue is empty; documentation closure does not deploy.
