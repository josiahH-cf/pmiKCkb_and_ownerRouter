# PMI KC Product Agent Router

This is the only authority-bearing runner-neutral router for this repository. Read it before acting.
Current implementation truth lives in `docs/facts.md`; the resume pointer is
`docs/loop-state.md`. Historical documents removed during the 2026-08-26 context reset remain
recoverable in Git at commit `1356918`, but they are not active guidance.

## Truth precedence

When two sources disagree, use this order:

1. this router for authority and safety;
2. live readback plus committed code/tests for implementation truth;
3. `docs/facts.md` for the concise verified ledger;
4. `docs/loop-state.md` and `docs/plan.md` for current work;
5. an active file listed in `docs/feature-suites/README.md`;
6. Git history for provenance only.

Never revive a historical blocker, Demo/Test policy, action grant, or provider claim without checking
the current code and live service. Date-stamped history is not authority.

## Present production truth — November 10 renewal walkthrough

Production serves `7f4cf234c18c0b80a0ed88bc08d70e174ae9c311` / `pmi-kc-app-recovery-aea5d595d8cc4e00` at 100% canonical traffic.
The latest receipt-bound rollback from staff workflow audit chunk 1 verified at `2026-11-13T20:22:24.224Z`.
[Chunk 1 attempt evidence](docs/evidence/staff-workflow-audit-chunk1-attempts-2026-11-13.md). The original November 10 delivery was
verified on `pmi-kc-app-rmwcvtvpl-13e72fe3f01f`.
Run `943a91a6-c659-4234-95ea-3582d0a4011e` consumed its permit after one successful application build `053961ec-41a0-4553-bc03-f37ecf2d8926`.
Two observation checkpoints passed in 402,737 ms. All 375 source, projected and rendered
lease records matched with zero discrepancies, candidate 5xx, unresolved effects or guarded
mutation attempts. All eleven independent final readbacks passed at `2026-11-12T02:04:06Z`.
[Delivery evidence](docs/evidence/renewal-walkthrough-delivery-2026-11-12.md) · [Exact-main CI](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/43133331913)

Intakes 139–149 shipped together and the queue cleared after independent readbacks.
S271 engineering is Yes across nine N10 cases, with a separate Thursday Yes, on exact source
`c0f6490e8659a3aa684099590efbbbcbef7c6deb` and build `EvsdEv_bUWl9gRTP0vv6O`. The S260 replay
is Yes across ten journeys and all three Help roles on the same source.
Human verdict: NOT RUN — no human observer. [Qualification](docs/evidence/renewal-walkthrough-qualification-2026-11-10.md)

The running image `sha256:787a052af6c254650dc136b2ac2df3dceda42492e222f469132d4a3690d31720` matches the successful regional build.
Runtime fingerprint `sha256:ba367a33db4a619ae67c7d9d3e06d27c2b154fa16c9c567f4212fa14f02487d7`. Only APP_COMMIT_SHA changed among 54 environment keys.
The managed service identity, eleven paired Space maps, five secret bindings, Production/Live,
Demo=false, Sheet=true and RentCast allowance 50 match reviewed state. The annual GET
readiness job returned to PAUSED, and the minute worker stayed ENABLED with its exact target and calendar.
Both Dotloop write keys remain closed, and signing stays human. Fees, tenant links, Dotloop maps
and the program source remain source pending in their owners.

## Previous production truth — November 9 renewal simplification (historical)

Production served `0afd020671ea9fbb1f0ee75484943c60e331b91a` / `pmi-kc-app-rmw9w581k-2489abae9071` at 100% canonical traffic.
Run `b61162cf-8646-4f9c-803e-3b24824c6e34` consumed its permit after one successful application build `1f42ae31-629b-418d-807a-e12fe229a9c1`.
Two observation checkpoints passed in 401,874 ms. All 375 source, projected and rendered
lease records matched with zero discrepancies, candidate 5xx, unresolved effects or guarded
mutation attempts. All eleven independent final readbacks passed at `2026-11-09T23:53:48Z`.
[Delivery evidence](docs/evidence/renewal-simplification-delivery-2026-11-09.md) · [Exact-main CI](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/42718078835)

Intakes 130–138 shipped together and the queue cleared after independent readbacks.
S260 engineering is Yes across ten journeys and all three Help roles on exact source
`b4fb6aa03e65aca6398b8adcefd523b6530e2f2f` and build `b9znJuQzNo6VAt8ZaK0Ut`. Staff verdict NOT RUN.
[Qualification](docs/evidence/renewal-simplification-qualification-2026-11-09.md)

The running image `sha256:01c07a86d73ee5c551c664399d9b54d32d304818aee47c83581a8ab0f687e965` matches the successful regional build.
Runtime fingerprint `sha256:bda4f86d6582874edd25bd04858c269d77bea7c1b79546b5e686427edcb545ec`. Only APP_COMMIT_SHA changed among 54 environment keys.
The managed service identity, eleven paired Space maps, five secret bindings, Production/Live,
Demo=false, Sheet=true and RentCast allowance 50 match reviewed state. The annual GET
readiness job returned to PAUSED, and the minute worker stayed ENABLED with its exact target and calendar.
Both Dotloop write keys remain closed, and signing stays human.

## Previous production truth — November 7 renewal usability batch (historical)

Production served `2e5e47a8a1112c53784170a29ab134cab336e4a0` / `pmi-kc-app-rmw84kdpe-d7fc9bff670c` at 100% canonical traffic.
Run `3003f053-9450-433c-8073-734d7914d222` completed with one successful application build and its permit consumed.
Two observation checkpoints passed in 405,871 ms. All 375 source, projected and rendered
lease records matched, with zero discrepancies, candidate 5xx, unresolved effects or guarded
mutation attempts. All eleven independent final readbacks passed at `2026-11-08T18:08:51Z`.
[Delivery evidence](docs/evidence/renewal-usability-delivery-2026-11-08.md) · [Exact-main CI](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/42505264623)

## Previous production truth — November 7 renewal one-path (historical)

Production served `ef81b8917209f4eec3f22097142b559f3cce875b` / `pmi-kc-app-rmw65wgt2-8c8249a0547c` at 100% canonical traffic.
PR #191 and source PRs #184–#190 shipped together in run `72c6456a-3f3f-4ec2-8282-03542cfb7772` after all seven
exact-main CI jobs passed in `42356598810`. The controller exited zero and its permit is consumed.
Observation passed 2 checkpoints in 410,069 ms with 375 matched
source, projected and rendered lease records, zero discrepancies, candidate 5xx, unresolved effects
or guarded mutation attempts. The eleven independent final readbacks passed at
`2026-11-07T09:12:03Z`. See the [delivery evidence](docs/evidence/renewal-one-path-delivery-2026-11-07.md).

The [independent litmus](docs/evidence/renewal-one-path-litmus-2026-11-06.md) retains 62 Yes, two No and seven
UNVERIFIED on its complete `edba7cbb` run, with separately dated repair rechecks. L55 remains No
because the settled assistance rule classifies the voucher-only lease as Ready. Batch acceptance
remains No. Human verdict NOT RUN.

## Previous production truth — November 5 S245 litmus fixes delivery (historical)

Production serves `5b5c65c6b7be2b504b38e8c8fdea3d81367e5202` /
`pmi-kc-app-rmw3h1wp5-706485135a02` at 100% canonical traffic. Run
`8bf183d8-52e3-4244-b2ed-8894df854de8` completed at 12:01:30Z; its permit is consumed and controller
exited zero. One application build `3b45e869-c0ec-4be8-9b64-276b61faf7ff` succeeded. Candidate
receipt `9fb1b2e5-5d18-433b-8365-fd4e6e85c516` issued at 11:54:21.299Z; receipt-bound promotion
verified at 11:54:42.628Z. Two observation checkpoints passed in 414,492 ms, within the
300,000/480,000 ms bounds. All 375 source/projected/rendered records matched, with zero
discrepancies, candidate 5xx, unresolved effects or guarded Admin mutation attempts. Editor browser
remains `not_run` under the existing policy. All eleven independent final readback sections matched
at 12:02:19Z. Runtime fingerprint:
`sha256:ce13be98ce4c6b9cb59a82b17399f8f93a4b489bce95de91dd90b8412eeb5c8b`. The running digest
matches the successful regional build. Only APP_COMMIT_SHA changed among 54 environment keys;
managed runtime identity, eleven paired Space maps, five secret bindings, Production/Live,
Demo=false and Sheet=true match reviewed state.

The run passed every phase on its first pass, with no stop, resume or rollback. Two preparation
stops came before admission. The first prepare at `952b33e7` stopped on authentication: the WSL
CLI/ADC enrollment was 17.6 h old, past Google's roughly 16 h reauthentication limit, and the owner
re-enrolled at 11:22:58Z. The second refused `remote_main_moved` because PR #183 had merged, so
the release followed main to `5b5c65c6`. `auth:ensure` then reported gcloud and ADC ok with a
verified token refresh and the Admin canary ok on its existing session.

PR #182 is delivered in one candidate: the S245 litmus's outside-scope repairs for S87
(present-tense copy and display, and a workflow run's Next Action from its own checklist), S126
(Source last read in the date and time convention), S147 (Try again waits, bounded at 30 s, for a
lease read in flight), S242 (print keeps every help heading with its content) and S86 (InfoTip
hover and Escape behavior, and one unread count in the Notifications button's name). Help stays
V1.1. PR #180's test-side S113 journey fix rode the candidate without a queue row and closes
Q-ENG-ADV-CI; PR #183 changed only test and CI tooling. Exact-main CI passed all seven jobs in
`42018344883`. The November 5 help-hub litmus repairs delivery (run `6951545a` at `3f2e3f5d`) is
historical. Both Dotloop write keys remain closed; no customer dispatch, provider business write or
signature was release proof.
Evidence: `docs/evidence/s245-litmus-fixes-delivery-2026-11-05.md`; current holds: `docs/open-blockers.md`.

## Previous production truth — November 5 help-hub litmus repairs delivery (historical)

Production serves `3f2e3f5dc20a6b010afacac472419d81429a79a7` /
`pmi-kc-app-rmw3661as-aecc6937ff3f` at 100% canonical traffic. Run
`6951545a-4e90-4620-b53f-ef5de75b2c1a` completed at 07:04:20Z; its permit is consumed and controller
exited zero. One application build `10aff53f-a5a8-4cb0-9877-54a6791ee0d3` succeeded. Candidate
receipt `eac936d1-13e5-49c9-ac09-fbbd68a62458` issued at 06:57:08.097Z; receipt-bound promotion
verified at 06:57:27.868Z. Two observation checkpoints passed in 416,972 ms, within the
300,000/480,000 ms bounds. All 375 source/projected/rendered records matched, with zero
discrepancies, candidate 5xx, unresolved effects or guarded Admin mutation attempts. Editor browser
remains `not_run` under the existing policy. All eleven independent final readback sections matched
at 07:04:43Z. Runtime fingerprint:
`sha256:e5e35e04f4df400919a8ce6c9e1f21b51afac60858e0f6285da0ed1e683cf814`. The running digest
matches the successful regional build. Only APP_COMMIT_SHA changed among 54 environment keys;
managed runtime identity, eleven paired Space maps, five secret bindings, Production/Live,
Demo=false and Sheet=true match reviewed state.

The run's first candidate assurance pass stopped before promotion (`assurance_unverified`) with
canonical traffic untouched on `pmi-kc-app-rmw2hrh4d-8b96ea7b6800`. Its request log showed no 5xx
and slow cold first loads (the renewal desk took 41.5 s); the gate kept no report, so the cause is
not proven beyond cold first loads. Read-only diagnostics on the warm candidate rendered 13 of 13
Admin routes and matched 375/375/375. The operator resume of that same pass then passed assurance,
promotion, observation and completion, with no rollback.

PR #177 is delivered in one candidate: the S242–S244 repairs the S245 machine-run litmus found,
help V1.1 (three guide results that match the app and 22 recaptured pictures), the conditional-branch
help copy inventory with its one S66 correction, the S245 litmus report and the S235 Admin
form-family hint by the owner's decision of 2026-11-04. The litmus accepted the hub on Run 4 at
`13e5ab40` under R-S245-5: no check is No, L10 is UNVERIFIED for 25 provider-bound steps, and the
human verdict is NOT RUN. Exact-main CI passed all five jobs in `41979132377`. The November 4
help-hub delivery (run `74d79a9d` at `323e8be3`) is historical. Both Dotloop write keys remain
closed; no customer dispatch, provider business write or signature was release proof.
Evidence: `docs/evidence/help-hub-litmus-repairs-delivery-2026-11-05.md`; current holds: `docs/open-blockers.md`.

## Previous production truth — November 4 help-hub delivery (historical)

Production serves `323e8be36535dabe21623ff28ca1160f8aae6657` /
`pmi-kc-app-rmw2hrh4d-8b96ea7b6800` at 100% canonical traffic. Run
`74d79a9d-87ff-4084-93e2-d09ac5e8a15f` completed at 19:31:23Z; its permit is consumed and controller
exited zero. One application build `98e4dfca-c178-495f-8524-9a81bbb05e98` succeeded. Candidate
receipt `f6cf1600-89fc-4542-9a46-c12b7df7a7a7` issued at 19:24:17.951Z; receipt-bound promotion
verified at 19:24:32.657Z. Two observation checkpoints passed in 413,080 ms, within the
300,000/480,000 ms bounds. All 375 source/projected/rendered records matched, with zero
discrepancies, candidate 5xx, unresolved effects or guarded Admin mutation attempts. Editor browser
remains `not_run` under the existing policy. All eleven independent final readback sections matched
at 19:31:37Z. Runtime fingerprint:
`sha256:71c35604ae103658e23bc9255cb7f7054c84d54549c392671e50a30a61163cd5`. The running digest
matches the successful regional build. Only APP_COMMIT_SHA changed among 54 environment keys;
managed runtime identity, eleven paired Space maps, five secret bindings, Production/Live,
Demo=false and Sheet=true match reviewed state.

S242–S244 (the signed-in Help section, rehearsal-captured guides and screen references, and the
in-app help copy refresh), the S245 litmus template and validator, and the merged #173
adversary-review fixes (S130, S241, S227, S125, S235) are delivered. Exact-main CI passed all five
jobs in `41886947757`. The first run of the same application source, `6960e4e1` at `b0f3fca2`,
promoted and then held at observation; its operator resume ended in a verified rollback to the
exact predecessor, and it is archived as superseded. The S245 machine-run litmus report follows this
delivery; repairs it finds ship as their own release. Both Dotloop write keys remain closed; no
customer dispatch, provider business write or signature was release proof.
Evidence: `docs/evidence/help-hub-delivery-2026-11-04.md`; current holds: `docs/open-blockers.md`.

## Previous production truth — November 3 gap-program delivery (historical)

Production serves `b5ba780279be0eb5661e463d2e73b5add1064056` /
`pmi-kc-app-rmw123csb-dc0ce89a8583` at 100% canonical traffic. Run
`ff1f44bf-9864-42e7-884f-1c2b8e2a545f` completed at 19:25:27Z; its permit is consumed and controller
exited zero. One application build `d0f2d859-cc2c-42e2-8c27-a81340c84930` succeeded. Candidate receipt
`3290b6c6-bf10-4c8d-8013-30c82dd9bf55` issued at 19:18:11.576Z; receipt-bound promotion verified
at 19:18:33.509Z. Two observation checkpoints passed in 417,609 ms, within the 300,000/480,000 ms
bounds. All 375 source/projected/rendered records matched, with zero discrepancies, candidate 5xx,
unresolved effects or guarded Admin mutation attempts. Editor browser remains `not_run` under the
existing policy. All eleven independent final readback sections matched at 19:27:02Z. Runtime
fingerprint: `sha256:b6cf189e006e5711bdc6b6f2eab1cec889d2439598b9cefbee96ea777c5a9111`.
The running digest matches the successful regional build. Managed runtime identity, eleven paired
Space maps, five secret bindings, Production/Live, Demo=false and Sheet=true match reviewed state.

The named P1–P9 source delta and four independently reviewed corrections are delivered. Full07
passed 10,162 unit tests/four existing parity skips and all 497 backend tests; core E2E passed
46 with 23 explicit no-emulator skips. Exact-main CI passed all five jobs in `41696162202`.
Thirteen separately bounded normal configuration operations subsequently passed readback:
eight unchanged source destinations attested (v8→v16), Dotloop observation refreshed with selection
v1 unchanged, settled notice basis v1 saved, and the same existing owner-renewal process corrected
and published Active v1 (six steps, three links, 4,637 verified immutable bytes, zero runs).
No original/legal/map approval, customer dispatch, provider business write, signature or Dotloop
key activation is inferred. Both Dotloop write keys remain closed. The preserved process staffing
placeholders and real human acceptance retain their specific holds.

S240's live inventory read remains non-runnable: effective-policy inspection establishes no runtime
storage.objects.list grant, while owner access verifies the existing Approved/Low source and
validates its exact handoff without importing. S240 explicitly excludes IAM changes; the prepared
one-permission/bucket proposal needs one project-owner scope decision (B-GCP-REINDEX). No new
permission has been applied. This is not a missing-client-file/login or Dan task.
The application queue is delivered; documentation-only closure does not deploy. Raw evidence and
778 byte-preserved prior state files remain private. The stopped original owner was never resumed.
Evidence: `docs/evidence/application-gap-delivery-2026-11-03.md`; current holds: `docs/open-blockers.md`.

## Previous production truth — November 3 00:10 delivery (historical)

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

S232–S239, S126 Admin date normalization and the scoped combined WSL auth repair are delivered.
The queue is empty. The original native Claude owner remains stopped; held eab1d318 was archived
byte-for-byte after exact no-effect reconciliation and was never resumed. Documentation-only closure
does not deploy. Evidence: docs/evidence/application-delivery-2026-11-03.md.

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

Both Dotloop write keys remain closed; signing is a human handoff. The current staff-confirmed
renewal contract retains role/Space, current source/target, sender/content, one-attempt, receipt,
readback and ambiguity recovery gates. Retired maintenance and generic/model-triggered sends remain
unavailable. Paid calls and live business effects were not release/auth proof. Client originals,
reviewed maps and staff acceptance retain their exact separate holds.

## Previous production truth — 2026-10-17 (historical)

Run `d33c7174-23b1-4126-ac11-657738b1864f` released S227-S229 plus the scoped Notifications latency repair at
`a7bce0981badc7523a6498949b6ea5f2effb198e` / `pmi-kc-app-rmvc9kmq6-1c2699db16f8` with 100% canonical traffic. One application build
`0983c589-af35-4219-9f5f-1bc1018f4043` succeeded at 2026-10-17T10:50:56.561207Z. Candidate receipt
`5b8ba2f6-8531-4936-86d6-5d01d85db110` issued 2026-10-17T10:58:13.931Z; promotion verified
2026-10-17T10:58:38.332Z. Full observation passed two checkpoints in 434,351 ms
against the 300,000 ms minimum and 480,000 ms deadline. All 318 source/projected/rendered
records matched with zero discrepancies, candidate 5xx or unresolved effects. Eleven independent
readback sections matched at 2026-10-17T11:06:16Z. The checkpoint is complete and permit consumed.
Tag `cand-rmvc9kmq6-1c2699db16f8`; fingerprint `sha256:dcbcdd544dd0c6d4d9a294748997aa324aaf2a09008dc1baf0c2aa060dbb1095`.

Captured predecessor: `pmi-kc-app-recovery-a97c579cf11b4d74` / `eb5d35991c3ec128a102e4483d3779af16106821`, Sheet=true.
Run-bound recovery `pmi-kc-app-recovery-d33c717423b14126`, receipt `07b55751-a159-4b01-bb4c-068178f8815b`, reference
`sha256:d376fa106048928a155fc69da5d8588071a1f9c0e45fb3c3ad83a834d418042c`, preserves that actual image/configuration. Its fingerprint
is `sha256:6e57b2a65a60f8e6a218c0b4b0e4cb8db791bad0a8a45a2322457a030393da2c`. The previously authorized tag was separately captured
as bound to `pmi-kc-app-rmvc7c5lz-ec2410dd001a`; canonical serving traffic was not substituted for it.
No traffic rollback was used in this successful run.

Production/Live, the managed runtime service account, eleven Spaces, Demo=false, Sheet=true,
five existing secret bindings (Dotloop client secret version 1), RentCast allowance 50 and existing
cost/security controls are verified. All 54 environment keys match the captured predecessor except
APP_COMMIT_SHA; the five secret bindings and runtime identity match. Both workers' captured target
fields, states and schedules match; the annual GET probe is restored PAUSED. Registry metadata remains
48 exact keys, 18 open/30 closed; operation refusal overrides old send/maintenance metadata.
Editor browser coverage remains not_run under owner-admin-2026-09-10; backend restrictions remain.
Human acceptance and physical-phone checks: NOT RUN — no human observer.

Normal managed Dotloop resource refresh succeeded on production. The supported individual
template list is empty; the company-template read failed as unavailable, which does not prove an
empty company list. No supported renewal selection is saved. The reported active template's owning
visibility/root cause remains unestablished; no template recreation is requested. The live UI
distinguishes failed and empty reads and excludes unsupported profiles from selection. Both Dotloop
write keys remain closed. Gmail's provider profile read succeeded for the expected managed mailbox;
sync health reports degraded. No customer draft/send, loop, upload, signature, paid comp request or
production test record was verification proof. Normal connection refresh updates only its existing
credential/observation metadata; it is separate from guarded read-only release assurance.

The first run a97c579c at 85b7e03c passed build/candidate/promotion, then failed its final
Notifications browser route at 30,006 ms. Observation remains failed (one checkpoint, 477,992 ms),
with all 318 records matched and zero candidate 5xx/unresolved effects. Receipt-bound rollback
verified at 2026-10-17T10:05:14.585Z. Its terminal checkpoint, admitted permit state, claims,
receipts and operation ids were archived byte-for-byte under the real lock before replacement;
none was rewritten or reused. The slow document request took 29.175 seconds. A fail-first test
confirmed independent review/support reads waited behind event reads; the repair starts those
reads together without changing counts, permissions, content or browser bounds.
Evidence: docs/evidence/application-delivery-2026-10-17.md.

The September 30 thirteen-feature gate passed 7,462 unit tests and 234 backend tests, with four existing
configuration skips, all required checks and production build. The notice portfolio repair
preserves per-lease invalidation semantics while processing 311 leases in ten bounded transactions;
its regression failed on the original fan-out and passed after repair. Mixed admission and
concurrent observations passed actual emulator transactions. My Work's initial loading repair
passed three regressions that failed on the original source and 23 focused checks. The full
118-reference litmus matrix and G1–G7 retain their exact unit/backend/compiled-browser scopes
in the shared batch audit. Earlier failed attempts remain failed in immutable evidence outside Git.

September 14 Features 1–6 and S113–S120 remain carried in this release.

The owner-requested adversarial review closed five confirmed findings through verified repairs
and a cumulative deployment. That release's permit is consumed and its queue delivered; original
completed runs and every failed attempt retain their actual evidence. No technical or safety
gate was lowered. Evidence: `docs/evidence/adversary-review-2026-09-29.md`.

S113 F1-F5 is complete and deployed: one lease dashboard, typed corrections and supported Sheet/
RentVine updates, restored operator-triggered RentCast preparation, supplied formatted/copyable
messages with governed unsent Gmail drafting, audited manual progress and the integrated journey.
Its original verification passed 6,528 unit tests (four existing skips), all 201 backend tests, policy
checks and production build. All 33 in-scope adversarial findings are closed; seven compiled browser
checks passed, including the 42-step guide. Human verdicts remain NOT RUN.

Staff-recorded completion reports actual outside work and remains separate from provider-verified effects. Backend journeys use actual controls, routes, Firestore, claims, receipts and readbacks with deterministic external adapters; no live customer effect was created to demonstrate completion.

Persistent labeled insurance-flyer, renewal-information-form and seven legal-form location boxes accept blank pending-team inputs. Only output requiring a real verified resource waits; placeholders never become customer links or legal content.

S106/S34 normal packet preparation, approval, exact S21 bytes, S20 queue/ledger execution and own-receipt recovery are implemented and deployed. Real approved forms/catalog/mappings, managed Dotloop credentials/connection/selection and separately authorized exact-key activation remain gates. Both Dotloop keys remain closed. Signature work is a human handoff; document presence and submitted content hashes do not prove signatures or provider-owned content verification.

- Project `pmi-kc-kb-prod`, service `pmi-kc-app`, region `us-central1`; canonical https://pmi-kc-app-kq6wuvpiva-uc.a.run.app.
- Current captured predecessor: `pmi-kc-app-rmvc9kmq6-1c2699db16f8` / `a7bce0981badc7523a6498949b6ea5f2effb198e`, Sheet=true. Run-bound recovery: `pmi-kc-app-recovery-91710ba5db964982`, receipt `1ef5e0f7-867b-429d-817a-ea75038c9b9d`. No traffic rollback occurred in this run; older receipts retain their historical scope.
- Runtime remains Production + Live, managed runtime identity, eleven Spaces, Sheet write-back
  true since the S152–S167 release (run `47fabb7c`; the current recovery target keeps true), false Demo flags, existing RentVine/RentCast secret bindings and RentCast allowance 50.
- S82 conformance, S97 replay/ambiguity integrity, S98 normal append and owner-approved field
  updates, S102-S110/readiness corrections and S51/S54 assurance are serving. Row deletion and
  historical restore/proof mutations remain unavailable. Matching observations cannot establish
  provider creation causality or mint receipt-bound reversal authority.
- S96 and the S83-S86 access/navigation/theme/interaction foundation remain deployed. S97-S99 and
  S100 chat-sync proof-qualified exact keys retain their contracts; completed proofs were not rerun.
- Source and read-back Admin Registry mirror contain 48 exact keys, 18 open and 30 closed. Only the two reviewed workflow notice send keys activated, with backup/CAS/readback;46 unrelated metadata records were unchanged. The maintenance-draft descriptive note was separately aligned without an activation change.
- The earlier S100 resident-draft activation and S36 queue are historical; the current maintenance
  retirement instruction requests neither proof nor activation. Revised S87 is deployed in batch 005;
  overlapping S88-S93/S101 and S95 proposals are superseded, while S94 remains unexecuted.
- Existing monitoring and domain gates passed. The managed alert recipient remains unchanged.
  No paid comp request, live customer draft/send, new provider proof or signature effect ran.
- Both private supplied v2 templates are published and read back approved. Private sources and
  customer data remain outside Git. Staff and provider evidence retain their separate meanings.
- Fresh approved WSL CLI/ADC browser flows and identity binding passed at 2026-09-29T20:23:16.794Z; approved-store refresh verified at 20:23:20.424Z. Earlier post-restart probes remain historical evidence. Owner-completed Admin enrollment verified the Admin role at 09:34:11.947Z. Separate 24-hour unchanged-enrollment longevity remains unverified; no identity, IAM or claim changed.

The owner-approved v4 receipt records only the exact blocked predecessor My Work reconcile defect on `d243911cb20ffb01773072c0e27c723648eeea34` / `pmi-kc-app-rmtkmhj1z-8855e4c6dbfb` as `failed_known_legacy_defect`. The single request was aborted before dispatch; its matching browser failures remain recorded. Candidate and post-promotion checks passed with zero mutation attempts. Editor browser coverage is `not_run` under the owner-approved Admin-only policy; backend role restrictions remain.

The 919a2ae candidate passed CI 34549763928, candidate assurance and promotion, then failed final observation at 420,140 ms and verified rollback to d243911. Its consumed candidate receipt, promotion receipt, failed observation and terminal rollback checkpoint remain preserved; the failure was never rewritten as a pass.

The earlier 6e77d18, 00836a8 and 297af97 candidates were archived as superseded without claiming their failed
or unfinished assurance passed. Earlier batch evidence is in
`docs/evidence/application-usability-batch005.json`; current operations evidence is in
`docs/evidence/operations-communications-maintenance-2026-10.json`. Each retains its actual scope.

## Product boundary

PMI KC is one deployed application with three connected lanes:

- PMI KC KB: source-backed knowledge, Console, Spaces, processes, approvals, and Admin.
- Lease Renewal Agent: complete RentVine/Sheet reads, reconciliation, comps, reviewed drafts, and
  lease-specific work.
- Workflow Communications: linked renewal reads/labels, reviewed drafts and exact staff-confirmed
  sends, schedules and Resume. It remains separate from general mailbox management and model-driven sending.

The complete custom maintenance component, resident intake and operational Vendor work are retired
under the current direction. No data purge is authorized. Feedback, staff work accountability and
authorized knowledge remain; Vendoroo stays standalone.

## Standing authority

The owner has authorized the runner to:

- implement the full application to each real external seam;
- commit and push a green slice directly to `main`;
- deploy a zero-traffic Cloud Run candidate, smoke its exact commit/revision, promote the exact
  revision, and restore the captured predecessor when rollback proof is required;
- configure the application's GCP resources under a managed `pmikcmetro.com` or project service
  identity, including APIs, quotas, IAM required by the app, Pub/Sub, Scheduler, Cloud Run, Cloud
  Functions, budgets, alerts, authorized domains, and OAuth redirects;
- process live resident, owner, lease, and operational data in Production;
- apply a safe documented default and continue when a non-authority question is uncertain;
- authenticate as the designated automation and verification identities without asking, under the
  Authentication section below.

Every cloud mutation must be read back. Record verified non-secret outcomes in `docs/facts.md`.

### Owner-authorized thirteen-feature completion — 2026-09-29 UTC

The owner explicitly authorizes the necessary Cloud Build and Cloud Run release actions,
diagnosed and verified repairs, resumes and replacement cumulative candidates, promotion,
receipt-bound rollback when needed, and documentation closure until the entire thirteen-feature
batch is verified deployed. Do not ask again solely because another repaired attempt is required.
This supersedes the previous one-replacement limit and the count-only stop after two different
failures in one phase. S121 is excluded; authority ends at verified completion or an owner stop.

The runner may implement in-scope repairs, commit/push green slices, preserve and retire failed
attempts through the reviewed procedure, and resume or replace after diagnosis and verification.
Every candidate carries all thirteen features. Keep one watcher on the real release lock, one
application build per run, exact-main green CI, fresh prerequisites and locked preflight GO,
the reviewed Sheet switch value on candidate and promoted revisions (S159: true) with the recovery
target keeping the captured predecessor's actual value, guarded assurance, exact reconciliation,
receipt-bound promotion, the full 300,000 ms observation and independent final readbacks.
Keep the queue until verified delivery. Never alter an admitted checkout, reuse a consumed claim,
reassign an old receipt, guess a host binding, or relabel a failed outcome. Every failed run and its
raw evidence stay immutable outside Git. Preserve actual tag bindings independently of canonical
serving traffic when preparing each new run-bound recovery target and receipt.

Attempt counts alone require no new permission. Diagnose before retrying; unresolved cloud
operations/effects forbid blind redispatch. Continue agent-owned diagnosis and repair under these
boundaries. Ask only when actual owner action or a new authority/input is necessary, including an
authentication challenge, disabled billing, a protected-path/security decision or missing human
information that prevents safe continuation. Fresh GO and each phase's technical gates remain
mandatory; this authority does not make an unknown or failed check pass.

No billing, budget, guardrail, identity, claim, system/security setting, protected-path grant,
Action Registry key, client-send authority or provider-effect boundary changes. Live providers
remain read-only for this release apart from the separately approved notice-invalidation metadata.
Human verdicts, real inputs and provider activations retain their existing scoped holds; they do not
block deployment of the thirteen already-defined implementations or become verified by deployment.

### Feature-run authorization continuity — 2026-09-30 owner direction

An explicit owner instruction to execute a named feature or batch carries that same approved scope
through planning, implementation, verification and its authorized delivery. Do not ask for fresh
consent solely because that run advances a phase, moves between its named features, or reaches an
already authorized deployment. Resolve ordinary technical choices from current evidence; ask once
only when a consequential scope, effect, authority, or human input is genuinely unresolved. Keep the
answer in the current loop state and continue independent authorized work.

Markdown intake alone grants no execution authority. A completed, superseded, historical, or
specified suite cannot start from its registry row or old queue position. The owner explicitly
directed implementation and mainline merge of request 001, governance simplification and unattended
authentication renewal, as operational maintenance. That direction grants no new application
feature, customer/provider effect, target, identity, privilege, or unrelated feature execution.
Patched production dependencies required by the unchanged audit use the existing release gates.
Existing exact-key,
protected-path, release-lock, fresh-GO, receipt and rollback gates still apply when relevant. A
prepared release permit is a technical interlock, not a repeated consent form; an admitted permit
stays bound to the same run/SHA through credential renewal, while a consumed or failed permit never
authorizes new work.

### Guarded release assurance

On November 8 the owner directed the governance change to merge before the November 7 renewal
usability release. An authorized application release carries its existing guarded read-only
assurance on the verified predecessor, recovery target, candidate and canonical origins. Use the
approved managed Admin session, exact revision and existing guard, policy and time bounds. A current
owner restriction on a particular check takes precedence until its scope is resolved.

The required Communications check may read the existing managed Gmail profile through
`GET /api/gmail-hub/connection` under the existing delegation and read gate. This resolves the
November 7 hold for that check. Retain the readiness verdict and release identity. Keep profile
responses, mailbox identifiers and provider data private. This scope covers connection readiness.
Gmail threads, messages, attachments, history, refresh and sync are outside release proof, as are
drafts, labels, sends and customer schedules.

Product audits and litmus runs use the guarded local rehearsal and synthetic fixtures. Hold automatic
comparison and use the mail stand-in only for isolated synthetic effects. Keep production desk and
lease reads within the existing guarded release manifest. Customer effects, provider business writes,
production test records, signatures and billed lookups stay outside verification. The annual managed
GET readiness probe keeps its exact candidate binding, invocation claim and PAUSED restoration.

Release authority uses the existing identities, roles, exact Action Registry keys and approved
configuration. Require exact-main CI, the release lock, one watcher, a fresh permit and locked GO,
then the existing receipts, observation, readbacks and recovery rules. Staff acceptance requires the
actual staff session. A change in data, effect, identity or scope requires its own authority.

## Authentication — approved local host contract (2026-09-08)

The owner explicitly authorized `josiah@pmikcmetro.com` for local unattended development and
release work on this WSL host. This supersedes the former automation-user/impersonation setup for
this host. Reuse its WSL credential store and ignored provider configuration. Do not create an
account, change IAM or claims, add federation, a private control repository, or a runner environment.
The owner applies an account-scoped Cloud session-policy exception and completes fresh enrollment;
the runner never changes that policy or enters a password, code, passkey, or CAPTCHA.

- On November 2 the owner explicitly requested the combined WSL auth repair, including scoped
  `scripts/auth/**` edits. `bash scripts/pmi-auth` reuses these existing approved identities/stores
  and provider grants, verifies real safe reads and reports paid/generation exceptions. Actual
  expiry/challenges are distinct from profile ownership, display, identity and permission failures.
  This request grants no broader scope, new identity, business effect or security-setting change.
- `npm run auth:status` inspects without token refresh, repairs, or browser activity. Unprobed
  freshness is unverified, never READY.
- `npm run auth:ensure` verifies the exact local identity and store before ordinary token probes,
  refreshes through Google libraries, and reports one WSL recovery command when a person is needed.
  Run it at the beginning of authorized work and use the actual CLI/ADC refresh probes again before
  dependent release phases. Elapsed enrollment age alone is not a readiness gate or a universal
  credential lifetime. Permission denial and an unknown probe failure are not treated as reauth.
- `auth:session`, `auth:enroll`, and `auth:enroll:wsl` all enroll the WSL CLI and ADC. The PowerShell
  compatibility entry point delegates to WSL. Enrollment reads Google's identity once and binds
  the exact ADC file locally because gcloud leaves its account field empty.
- From a Windows shell, including a Windows-hosted Claude Code or Codex session and its start hook,
  `auth:status` and `auth:ensure` run the same command inside WSL and report the WSL store. When WSL
  cannot run it, the result names that failure instead of requesting enrollment.
- Personal accounts, unexpected managed accounts, impersonation, key files, and credential/store
  overrides cannot substitute for the approved account. Credentials and enrollment evidence stay
  outside Git and source uploads. Status contains no tokens or provider bodies.
- Existing dedicated verification accounts retain their displayed roles. The server must refuse business
  mutations before execution. Authentication, logout, and genuine reads remain available. No claim
  is granted or changed. Managed claim-less accounts remain Editor with all Spaces by owner decision.
- September 10 owner direction accepts the existing `josiah@pmikcmetro.com` Admin browser session
  for release assurance on both the exact candidate and canonical origins. An Editor browser
  session is not required. Versioned receipts record `owner-admin-2026-09-10` and Editor `not_run`;
  Admin access is not evidence of Editor restrictions. Preserve the complete backend Editor/role
  tests and existing claims. The assurance receipt, promotion, and 300,000 ms observation remain gates.
  The owner account retains ordinary Admin authority. Its assurance runs use the guarded read-only
  browser, including the existing state-changing GET refusals; they do not claim that the owner has
  the dedicated canary accounts' server-side mutation restriction.
- September 10 owner approval permits only the exact predecessor exception below.
  The owner approved only the exact blocked legacy My Work reconcile exception on captured
  predecessor d243911 / pmi-kc-app-rmtkmhj1z-8855e4c6dbfb at the canonical origin. Version 4 receipts
  retain Admin `failed_known_legacy_defect`, Editor `not_run`, and exact blocked-request evidence.
  The guard must successfully abort the single POST /api/work body {action:reconcile} before dispatch;
  all route landmarks, monitoring and other diagnostics must pass. The candidate and post-promotion
  checks still require zero mutation attempts. No business write is allowed by this exception.
- The local release watcher may deploy exact-main-SHA green CI from an isolated clean checkout,
  serialize and resume phases outside Git, and catch up after this host starts. Documentation-only
  commits do not deploy. Missing authentication pauses only the dependent phase; no repeated login
  loop or unverified promotion is allowed. A pre-dispatch authentication hold waits for a change in
  the approved local credential store, then rechecks the same identity and resumes that exact
  checkpoint if usable. An in-flight or ambiguous effect still requires exact reconciliation; store
  change never proves an effect failed or authorizes redispatch. If Google requires a person, the
  owner completes the challenge and independent work continues meanwhile.

Fresh-shell, reboot, and elapsed-session proofs are required to claim those separate behaviors;
they are not repeated release prerequisites without an exact current contract. A policy or
procedure alone does not establish authentication readiness. Independent implementation continues
when Google requires human enrollment. This request authorizes only the scoped local-auth changes;
it does not authorize a session-policy, IAM, claim, or credential-store substitution.

## Permanent safety boundaries

- No model-triggered, unapproved background, generic or bulk client-facing send.
- October 20 explicitly reopens only the existing exact staff-confirmed renewal Send, Schedule and
  Resume contract and linked renewal replies. Historical authorizations cannot dispatch until a
  fresh reviewed authorization binds the current policy. Preserve exact source/target checks,
  one-attempt claims, receipts and ambiguity reconciliation; maintenance remains retired.
- Ordinary supported staff edits use one visible Save/Apply as exact intent. Preserve server-side
  permissions, real target/version/conflict checks, durable one-attempt claims, receipts, readback
  and recovery. A chat-originated explicit supported action uses the same operation service;
  informational model output supplies no execution authority.
- Every live system-of-record write is human-initiated, exact-previewed, exact-confirmed,
  idempotent or at-most-once, receipted, read back, and reversible/correctable. The sole specified
  exception is S100's manual RentVine chat GET: the official provider marks retrieved manager
  messages read and documents no unread restoration. It therefore requires an explicit consequence
  warning and confirmation, one bounded page, honest ambiguous-state reporting, and no claim of
  rollback.
- No sample, synthetic, or test identity/data may become a live draft, send, provider write, or
  production record.
- Secrets, tokens, credentials, client exports, Gmail bodies, customer values, and raw evidence never
  enter Git.
- Staff, runner, Firebase, connector, Cloud Build, and runtime identities must be
  `pmikcmetro.com` or project service identities; local unattended runner work uses only the
  specifically approved account above. Canary identities only verify. Personal identities and
  service-account keys are forbidden.
- The runner never enters a password, one-time code, passkey, or CAPTCHA, and never copies a
  person's cookies or browser profile.
- Do not guess provider endpoints, record identifiers, mappings, recipient addresses, policy, or
  customer values.
- Destructive production data work requires backup, dry-run, exact target, and rollback.
- Every live effect must be bounded and reversible/correctable, except the explicitly warned and
  confirmed S100 manager-read marker described above.

## Action authority

### Owner-approved notice invalidation metadata — 2026-09-29 UTC

For the release-gap repairs, the owner explicitly permits authenticated source reads to update a
durable, lease-bound approval-invalidation marker containing only version/hash/time metadata. Bind
the marker to verified tenancy/cycle scope so a notice observed and later withdrawn cannot revive
an old draft approval, including after restart. This narrow app-owned metadata exception creates
no workflow milestone, provider write, customer draft or send. Other reads retain their existing
contracts. Source absence does not itself prove provider withdrawal; staff-reviewed
withdrawal and provider evidence remain distinct. This is not a new provider-action or role grant.

Production activation is per exact Action Registry key. Never infer a category grant.

Open keys as verified 2026-10-10:

- `rentvine.work_order.create`
- `rentvine.work_order.read`
- `rentvine.work_order.update_status`
- `google_sheets.renewal_checklist.row_append`
- `google_sheets.renewal_checklist.field_update`
- `gmail.mailbox.read`
- `gmail.thread.reply`
- `gmail.label.apply`
- `gmail.renewal_notice.draft_create`
- `gmail.maintenance_owner_notice.draft_create`
- `gmail.renewal_notice.send` (only the current human-authorized S189–S192 sequence contract)
- `gmail.maintenance_owner_notice.send` (same scoped contract)
- `rentcast.rental_listings.search`
- `internal.transactional_notice.send`
- `rentvine.lease.renewal_dates.update` (S97 proof-qualified activation, 2026-09-02)
- `rentvine.lease.recurring_charge.create` (includes only its receipt-bound reversal DELETE)
- `rentvine.lease.recurring_charge.update`
- `rentvine.work_order.chat.sync`

The other 30 keys are closed. In particular:

- `gmail.message.send` remains closed; no arbitrary inbox/send capability is authorized;
- `gmail.maintenance_resident_reply.draft_create` remains closed pending its exact S100 live proof;
- the retired `rentvine.lease.renewal_writeback` compatibility identifier remains closed;
- `google_sheets.renewal_checklist.writeback` remains closed.

A runtime flag or open Registry key alone never outranks an operation-level refusal. The explicit
owner direction below changes the S98 normal-field requirement; it is not inferred from a flag.

### Owner-approved renewal consolidation — 2026-09-09

September 10 unblock amendment: restore/repair the existing RentCast component and its existing
operator-triggered comp/trend integration if hidden, disconnected or deleted. Incorporate the supplied
private email templates/formatting; automatically assemble deterministic, copyable drafts and repair
the existing governed Gmail draft transport. This is not background Gmail creation or send authority.
Scope RentVine effects through the explicit S113 F2.4 matrix. Prepare the S106/S34 document end state
and its deployment continuation when actual capabilities, forms, connection and exact activation gates
are satisfied; manual S113 work proceeds independently. A signature API or approved legal content
must not be invented. This amendment authorizes corresponding in-place handoff reconciliation.
The owner then deferred collection of missing tenant links and legal-form locations: implement
persistent labeled link-entry boxes now, with blank pending-team states. Verified values may be
supplied or hardcoded later when applicable. Missing values do not block S113 implementation/release;
only the exact resource-dependent output waits for real content and its existing execution contract.

Owner-approved 2026-11-09: the selected month can be prepared only by a deliberate staff click.
Resolve each lease and cycle from current source evidence and preserve the existing per-cycle claim,
RentCast action gate, cache, verification fence and monthly allowance. Preparation may save an
app-owned recommendation and owner draft through their current owners. The November 5 D-OP-1
permission is superseded. Opening a page, changing its scope or viewing evidence starts no lookup.
Owner direction 2026-11-12: the click prepares the selected month's eligible leases that the active
filters show (S283). A filter narrows the run and never widens it.

S113 (`docs/feature-suites/renewal-workflow-consolidation.md`) is the completed product implementation:
F1 dashboard/facts, F2 corrections/source updates, F3 comps/messages, F4 manual progress, then F5
integrated verification. New automation and Dotloop/signature execution are outside this program;
their existing contracts remain separate. Authentication/release assurance continues independently.

- A full lease dashboard replaces the six-phase navigation barrier while preserving routes,
  source truth, historical process/evidence meaning, permissions and exact execution contracts.
- Audited staff-recorded activity advances the manual workflow through completion. Staff reports
  remain distinct from provider receipts and verified completion; owner approval of exact terms
  remains explicit. No manual marker grants provider execution or invents an effect receipt.
- Normal in-app existing-row Sheet field updates are required and pre-approved. The owner explicitly
  rejected a new provider safety-contract prerequisite. Replace the blanket normal-field refusal
  through existing narrow Sheets primitives, fresh server-resolved target/value checks, exact
  preview/confirmation, a durable one-attempt claim, receipt/readback and separately confirmed
  correction. Do not wait for a hypothetical provider-owned idempotency/tombstone seam or ask again
  for this feature authorization. Actual permissions, connection failures and observed conflicts
  still apply to the exact attempted write; app claims do not establish collaborator isolation.
  Owner direction 2026-11-12: one reviewed preview and one confirmation may apply up to ten listed
  recognized cells of one existing lease row, each with its own one-attempt claim, readback and
  receipt (S278). No range, other row, formula or unattended write is added.
- Preserve row append. Row deletion and historical proof reruns remain unavailable. A field
  correction is a new current-state preview/confirmation, not automatic historical restore.
- This owner direction authorizes corresponding present-truth/router/spec reconciliation, not new
  roles, identities, action keys, sends, budget changes, customer values or provider-proof targets.

### Owner-directed staff workflow audit unblock — 2026-11-12

The owner directed that every proposal of the
[November 12 staff workflow audit](docs/evidence/staff-workflow-audit-2026-11-12.md) be carried
and that the rules which held ten of them be retired. S272–S286 (intakes 150–164) are AUTHORING
READY in `docs/feature-suites/README.md`. Authoring is not implementation, activation or
delivery, and serving behavior is unchanged until a suite is delivered. The owner supplied no
specifics, so each suite marks its inferred values as assumptions the owner can change before a
launch. These decisions replace the earlier rules named beside them:

- A renewal end date is offered as a 12 month choice staff make (S285). This replaces S263's rule
  that no term length is offered.
- The owner who replied opens selected when the reply came from the address the message was sent
  to (S285). This replaces S234's rule against any preselection. No amount or decision is read
  from a reply.
- One owner message asks for rent and term, through a new copy version published by an existing
  template approver (S285).
- Preparation covers the leases the filters show (S283). This replaces the whole-month scope.
- One confirmation may apply a lease row's listed Sheet cells (S278). This replaces one
  confirmation per field.
- The shared notice basis is read on a lease and changed by an Admin (S283). This replaces the
  November 3 staff selection.
- The follow-up form opens with editable starting values (S276). This replaces S189's rule against
  any starting cadence. Nothing is authorized until staff confirm the review.
- The QuickBooks Connect button and the bulk Execute option are removed, and two internal labels
  are replaced (S283).
- The three renewal Spaces show their process as guidance and start no runs (S286).
  B-PROCESS-OWNER is retired.
- Four Guided layout pins are replaced: in-place editing of Rent to recommend and of the renewal
  dates, named message groups, and an address that names the step shown (S281).
- A RentVine and Sheet difference in rent or lease dates is information on every screen (S280).
  This extends D-OP-7.

Nothing here opens an action key, changes a `production_allowed` value, edits a protected path or
authorizes a send, a provider write or a paid lookup outside the existing exact staff-confirmed
contracts. Every permanent safety boundary above still applies. If building any of these needs a
protected-path change, prepare and surface it for the owner.

Owner launch 2026-11-13 (UTC): the owner explicitly launched handoff
`staff-workflow-audit-2026-11-12`, S272–S286 (intakes 150–164), as one unattended cumulative
run through implementation, verified repairs, the S284 qualification, one pull request and one
guarded production release of the whole batch, under Feature-run authorization continuity. The
owner accepts every assumption the suites mark as written for this launch. Each suite gets its
fail-first proof and focused checks; the full gate, core E2E, the S284 matrix and its replays
run once on the cumulative head before the release. The launch does not authorize publishing
the new owner wording or the follow-up copy in production, which stays a template approver's
staff action, or the two S284 R-S284-5 production counts. It changes no billing, budget,
identity, role, claim, action key, `production_allowed` value or protected path.

### Owner-authorized activation program — current boundary

The owner directed on 2026-08-31 that the application graduate from categorical read-only posture
to exact human-confirmed source-of-truth updates. S97, S98, S99, and the S100 chat-sync action passed
their bounded per-key proof windows, mandatory close/readback, and separate final activations. An
open key is authority, not proof that the provider currently exposes every safety primitive.
Serving S113 supports normal field updates under the explicit owner-approved contract above.
The S128 batch paused operating-Sheet effects while preserving reads and app-owned saves. S159,
released on 2026-10-03 in run `47fabb7c` (the serving revision reads Sheet=true),
resumes the existing normal append and recognized-field updates through the narrow switch and the
two open exact keys: candidate and promoted revisions read the one reviewed value
(`lib/production-assurance/sheet-writeback-expectation.mjs`, true) and the recovery target keeps the
captured predecessor's actual value. Enablement executes no backlog. Row deletion and historical
restore remain unavailable, and completed receipts retain their original meaning.
No activation is a generic method/path/body, bulk,
autonomous, model-triggered, or send grant.

The sole remaining activation-program key is
`gmail.maintenance_resident_reply.draft_create`. It may receive one bounded proof window only after
the S100 contract resolves a synchronized resident message to a verified resident email, followed by
mandatory close/readback and a separate protected activation only after proof. Its absence blocks
S100 completion and therefore S36, not the already delivered S97-S99 or chat-sync actions.

The broad `rentvine.lease.renewal_writeback` and
`google_sheets.renewal_checklist.writeback` compatibility keys remain closed and are retired rather
than activated as product or proof actions. Completed proof windows used only the exact new key under
proof plus its suite's required runtime switch, and every executed window was closed and read back
before final activation. Receipt-bound reversal under a create/append key is allowed only when that
suite defines the exact inverse operation and the current provider seam can bind it safely; it is not
general delete authority. S98's active correction finds no such fixed-row Sheet seam and refuses it.
`rentvine.work_order.assign_vendor`, RentVine chat posting, attachment upload, generic or otherwise unlisted Gmail sends, and
every unlisted provider key remain closed. S36 separately authorizes one temporary, bounded Space
provision/import/readback/retirement pilot under its exact lifecycle; it is not Action Registry
category authority.

## October operations program authority — 2026-10-09

The owner explicitly started `operations-communications-maintenance-2026-10`, S183–S226,
intake 055–098, including S183's necessary scoped protected governance edits and reviewed exact-key
activation for its specifically defined operations after technical gates. This carries through
implementation, verified repairs and existing delivery without phase-only consent. Authoring
READY is not implementation, activation or delivery. All five PENDING outcomes remain required;
complete accessible bounded investigations and surface genuinely missing material inputs once.
No unrelated key, identity, privilege, budget, destructive data or model-driven effect is granted.
October 10 verified delivery activates only `gmail.renewal_notice.send` and
`gmail.maintenance_owner_notice.send` under S189–S192. Exact-main CI, managed GET readiness/
restoration, guarded Admin/Gmail assurance, promotion, full observation, independent readbacks and
exact-key metadata CAS/readback passed in run 5b3dfb90. Minute worker ENABLED with a verified normal
empty tick; annual GET readiness job PAUSED.
No customer send is test proof; old drafts, attempts or completed proofs never grant a schedule.
Generic `gmail.message.send`, resident-draft proof and unrelated keys retain their existing holds.
Preserve S182 Dotloop API-origin exclusions; OAuth connection does not prove resource eligibility
or saved supported profile/template/status selection. Both Dotloop write keys remain closed.

## Protected paths

Prepare and surface, but do not push without explicit owner direction:

- `firestore.rules`
- `lib/integrations/action-gate.ts`
- `lib/auth/**`
- any `production_allowed` change in `lib/integrations/action-registry-seed.ts`
- `scripts/check-budget-guard.mjs`
- `infra/budget-guardrail/**`
- `scripts/auth/**`

The owner-directed 2026-08-31 documentation reconciliation authorizes present-truth edits to this
router and `docs/facts.md`. The activation program above is also explicit owner direction for its
remaining resident-draft proof-window and final-activation patches at the gates stated above. It does
not authorize a new identity, safety exception, cost change, premature key opening, or any effect
outside that exact suite contract.

## Cost and cloud controls

The old claim that Production has a $10 hard stop is retired. Current verified controls are the $25
alert, $100 project hard stop, $100 account backstop, and guardrail cap 100. A protected legacy local
planning guard still has a conservative $10 fallback; it is not live Cloud Billing truth. Raising
headroom must move the applicable budget and guardrail together and be read back. Lowering/removing a
safety control, alert, domain in use, or guardrail still requires owner direction.

Routine deployments use the existing production service and reviewed production environment.
Preserve the runtime service account, eleven-Space configuration, secret bindings, Production+Live
descriptor, and reviewed Sheet-write switch (true) unless the requested change explicitly targets one
of them.

## Live-write proof policy

- Production remains Live-only. Do not create a fake person, lease, work order, provider record, or
  customer value for a proof.
- S97's designated-lease proofs, S98's temporary-row append/update/delete proof, S99's work-order
  proofs, and S100's chat-sync proof are complete. Their receipts and final readbacks govern; do not
  rerun or substitute a new proof target.
- Normal S97 and S99 effects remain bounded by their activated exact-key contracts. S98/S113 serves server-derived append, normal Sheet field updates and fresh
  confirmed field corrections under the owner-approved contract above; row delete and historical
  proof mutations remain unavailable. No specification edit itself enables a provider effect.
  S100 synchronization remains manual and discloses that the official read marks manager messages
  read. Missing or ambiguous mappings fail only the exact action.
- The remaining S100 resident-draft proof may use only a synchronized message with an exact mapped
  resident and verified email, and may create only an unsent draft in the signed-in managed mailbox.
  Until that runtime input exists and the key passes proof and activation, it remains unavailable.
- S36 may copy one already-approved source object byte-for-byte into its isolated temporary prefix,
  provision/import/read back one temporary store, retire it, delete only that copied object, and
  prove the original eleven-store/config state restored.
- Every proof and normal write remains exact-previewed, exact-confirmed, at-most-once where the
  provider lacks idempotency, receipted, read back, reversible or separately correctable, and bounded
  by its exact key and suite. S100's disclosed manager-read marker is the one non-reversible stateful-
  read exception above. Until a suite's prerequisites pass, its effects remain unavailable.

## Documentation hygiene

Active documentation is intentionally small. `docs/README.md` is the index.

- Update current documents in place; do not append a second contradictory history.
- `docs/status.md` is a current snapshot, not a changelog.
- `docs/facts.md` contains only present facts, active decisions, and genuinely open questions.
- `docs/loop-state.md` stays under 140 lines and contains only the current resume state.
- Completed program prompts, old audits, Demo/V1 packets, and superseded specs belong in Git history,
  not the active tree.
- If a document becomes false, rewrite or delete it in the same slice. Do not preserve false active
  prose with a warning banner.
- Ignored `docs/temp/` material is local scratch and must never be treated as evidence or read by
  default.
- New specs go only in `docs/feature-suites/`, use the template, and must be registered in its
  README.

## Execution loop

1. Read this file, `docs/facts.md`, and `docs/loop-state.md`; run `npm run auth:ensure`
   (authentication is pre-approved and never a reason to wait).
2. Inspect committed code and live read-only state before accepting a stale claim.
3. Plan one bounded outcome and its falsification.
4. Implement with tests and preserve unrelated/user-owned changes.
5. Run focused adversarial tests, then `bash scripts/verify.sh` for a ship candidate.
6. Audit secrets, PII, gates, runtime config, and diff.
7. Commit/push only a green tree; deploy served runtime or asset changes through zero-traffic
   candidate smoke. Verify runner-local governance/auth/release-tooling changes with focused tests,
   full CI and host readback; they do not by themselves require a Cloud Run revision.
8. Update facts, status, plan, and loop state to the verified result.

No force-push, history rewrite, release tag, or branch deletion. Do not deploy documentation-only
changes unless they alter a served asset.

External and human holds live only in `docs/open-blockers.md`, the unblock packet. A hold blocks
only its named effect. Never stop, wait or ask about one unless the task exercises that effect or
the owner reports its step done; development, tests, merges and releases proceed independently.
When the owner reports a step, perform that row's follow-up and update the packet.

## Current routes

- Documentation index: `docs/README.md`
- Verified facts: `docs/facts.md`
- Current status: `docs/status.md`
- Resume point: `docs/loop-state.md`
- Current plan: `docs/plan.md`
- Product contract: `docs/spec.md`
- Active suites: `docs/feature-suites/README.md`
- Provider/action model: `docs/integration-architecture.md`
- Environment/release: `docs/environment-handoff.md`
- Security/engineering: `docs/engineering.md`
- Client/runtime inputs: `docs/client-checklist.md`

## Per-runner pointers

The repository is runner-neutral. Claude reads `CLAUDE.md`, which points here, and the tracked
`.claude/settings.json`, which only allow-lists the `scripts/auth` commands and runs `auth:ensure`
at session start. Codex uses this file directly and has no repo-tracked harness configuration; its
approval and sandbox settings live in the owner's `~/.codex/config.toml`. Runner-local settings
never widen repository authority.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
