# Current status

Updated: 2026-11-05 (UTC).

The S242–S245 help hub litmus repairs and help V1.1, with the S235 Admin form-family hint, are
DELIVERED at `3f2e3f5d` / `pmi-kc-app-rmw3661as-aecc6937ff3f`, 100% canonical traffic. Run `6951545a`
completed and its permit is consumed. Exact-main CI passed five jobs (`41979132377`); the
pull-request head's full gate passed 10,391 unit and 497 backend tests. Observation passed two
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
and 41974275990) on commits that change only help text and docs; each passed unchanged on re-run,
the test is unchanged and a root-cause follow-up is proposed separately. Exact holds remain in
`docs/open-blockers.md`; delivery evidence:
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
