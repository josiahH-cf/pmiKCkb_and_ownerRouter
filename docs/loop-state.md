# Loop state

Last updated: 2026-11-07 (UTC). Read AGENTS.md and docs/facts.md first.

## Current execution

The S245 litmus fixes (PR #182: S87, S126, S147, S242 and S86, with PR #180's S113 test fix)
are DELIVERED. Canonical source is 5b5c65c6b7be2b504b38e8c8fdea3d81367e5202 / pmi-kc-app-rmw3h1wp5-706485135a02, 100%.
Run 8bf183d8-52e3-4244-b2ed-8894df854de8 completed; its permit is consumed and controller exited
zero. Every phase passed on its first pass, with no stop, resume or rollback. Before admission the
first prepare at 952b33e7 stopped on a 17.6 h old CLI/ADC enrollment and the owner re-enrolled; a
second refused remote_main_moved after PR #183 (test and CI tooling) merged, so the release
followed main. Exact-main CI42018344883 passed all seven jobs;
observation passed two checkpoints/414,492 ms
with 375 matched records and zero discrepancies/5xx/unresolved effects/mutation attempts; all
eleven final readbacks matched at 12:02:19Z. Q-ENG-ADV-CI is closed. Help stays V1.1; the S245
litmus's L10 is UNVERIFIED for 25 provider-bound steps and the human verdict is NOT RUN. See
docs/evidence/s245-litmus-fixes-delivery-2026-11-05.md. The November 5 litmus repairs delivery
(run 6951545a, 3f2e3f5d) is in docs/evidence/help-hub-litmus-repairs-delivery-2026-11-05.md and
the November 4 help hub delivery (run 74d79a9d, 323e8be3) in
docs/evidence/help-hub-delivery-2026-11-04.md. The earlier P1–P9
delivery (run ff1f44bf, b5ba7802) is in
docs/evidence/application-gap-delivery-2026-11-03.md; its details follow.

Full07 passed 10,162 unit tests/four existing parity skips, all 497 backend tests/no skips and
all sixteen commands/build. Core passed 46/23 explicit no-emulator skips on the same aceee3fe
manifest. Independent source/CI/delivery/configuration reviews passed their stated scopes.
Exact-main CI41696162202 passed all five jobs. Observation passed two checkpoints/417,609 ms,
375 source/projected/rendered matches, zero discrepancies/5xx/unresolved effects/mutation attempts;
all eleven final readbacks matched at 19:27:02Z. Editor-browser/human verdicts remain separate.

Normal configuration readbacks: eight unchanged source destinations v8→v16; Dotloop refreshed
19:36:04Z with two profiles/zero-nine templates and entire selection v1 preserved; settled notice
basis v1/own intent; same existing process seven-field Save, exact-process Low policy and Active
version1 Publish, six steps/three links/4,637 verified immutable bytes/zero runs. Each operation
had one consumed dispatch, no retry and clean profile release. No legal/map approval, original
publication, customer/provider business effect, signature or Dotloop activation was inferred.

The guarded post-configuration five-route UI read had all 200 responses, no errors/mutation
attempts and free profile before/after. It also exposed the remaining source-access seam below.

## One-path batch S246–S254: reviewed in isolation

Current main `2187cf09fa0d5860919940448ae1ef55cd298f05` contains PRs #184–#190,
including every source suite and the S254 harness. Branch `codex/renewal-one-path-ux`
includes all six Claude commits and both remaining typing-recovery changes. The original
worktree and its untracked owner files remain untouched.

- The independent report at `edba7cbb` names all 71 checks: 62 Yes, 2 No and 7 UNVERIFIED.
  The repaired source `eb7f4d69` has targeted rechecks, including the L18 retained text.
  L55 keeps the literal count discrepancy, so batch acceptance remains No.
  See the [litmus report](evidence/renewal-one-path-litmus-2026-11-06.md).
- The older November/December journey passed on that source. The first canonical verify
  stopped on an obsolete test count; the exact Help map assertion was updated in
  `0e9c6a27`. The final-tree qualification and CI are recorded with the
  PR. See the [UX review](evidence/renewal-one-path-ux-review-2026-11-06.md).
- Human verdict NOT RUN. Real-provider, mailbox, physical-device, legal and client-input
  limits remain. Automatic comparisons were held off throughout guarded browser verification.
- The owner merges, releases and deploys. Earlier handoff release instructions do not apply.

## Exact remaining boundaries

- **B-GCP-REINDEX:** the app lacks storage.objects.list on its existing corpus bucket. Bucket,
  project/organization policies, five runtime roles and managed-folder absence were inspected;
  owner credentials read one existing Approved/Low source. Its owner-side source-bound command
  passed the actual builder/parser/request/generation checks without import or staging.
  S240 explicitly excludes IAM changes. A private one-permission role/exact-bucket proposal with
  backup/etag-CAS/readback/rollback is ready; only the project owner's narrow scope-deviation
  decision can authorize it. No new permission, login, API, identity or source was needed/created
  to diagnose it. The live SDK exception is not exposed; missing effective permission is
  independently sufficient to prevent that read. Keep the app's honest non-runnable state.
- **B-PROCESS-OWNER:** the published guidance preserves original placeholder owner/default
  approver values. Future run ownership currently derives from default_approver_uid. Dan/team
  must identify the responsible managed staff; the team maps existing UIDs without guessing or
  reinstating a general Dan approval. This holds staff routing, not current publication.
- Canonical U1–U6 in docs/open-blockers.md own real form/legal/map, case/terms, timing exceptions,
  human acceptance/signing, later exact-key authority and the two specific decisions above.
  All eight originals are recovered/private; do not request those files, membership or login again.

## Awaiting release

The owner decides whether to release after reviewing the PR and its verification.
These are merged source commits, not delivery claims; no release action is authorized in this review.

1. S246 working batch and accurate targets: `64a12692`.
2. S247 guided lease path: `20d55104`.
3. S248 evidence-driven stage: `20d55104`.
4. S249 prepared kickoff and one message route: `aec5a309`.
5. S250 standing owner agreements: `daf8ee05`.
6. S251 housing assistance path: `daf8ee05`.
7. S252 engineering walkthrough and help: `2187cf09`.
8. S253 confirmed form answers: `95858eef`.
9. S254 harness and validator: `6b0a71a5`; see the branch report for the unaccepted litmus.

The S245 fix batch at `5b5c65c6` remains the last recorded production delivery. Never reuse a
consumed permit or receipt. The stopped original native owner and archived runs remain untouched.

## Continuation contract

1. Use the existing private copy-only client-update workflow/receipt for ordinary communication
   closure from actual current main; never a mailbox draft/send or external message tool.
2. If the project owner explicitly extends S240 for the prepared metadata-only permission,
   re-read its exact private proposal and fresh policy/etag, preserve every unrelated grant,
   use the same existing runtime identity, apply only the approved role/bucket binding and read
   everything back. Verify the unchanged app GET yields the actual source-bound runnable handoff.
   No ingestion or application release is authorized by that decision alone.
3. Dan/team answers become exact version-bound configuration through existing controls. Do not
   invent owner/approver UIDs, legal meanings, fees, source approvals or a universal Dan gate.
4. Both Dotloop write keys remain closed; signing stays human. Existing source/recipient/sender/
   policy/claim/receipt/ambiguity gates continue. No live proof or production test record is rerun.

Approved WSL auth entry remains bash /home/josiah/pmi-kc-work/auth-command-20261102/scripts/pmi-auth.
Reuse existing stores/profile; only an actual Google challenge needs a human. Physical-phone,
Editor-browser/human acceptance, paid comps/generation, indefinite auth and real provider/customer
completion remain unverified in their named scopes.
