# Loop state

Last updated: 2026-11-05 (UTC). Read AGENTS.md and docs/facts.md first.

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

## One-path batch S246–S254: in progress, handed off

The owner started the unattended one-path run (S246–S254) on November 5 and handed it to another
runner the same day. Nothing of it is merged or released, and the queue below is still empty.
Resume from `~/pmi-kc-work/one-path-run/` (outside Git): its handoff file gives the state, the
decisions made and the next steps, beside the owner's run instruction and the builder briefs.

- Built on branches, each still needing review, the full gate and a squash merge: PR #184
  (`feat/s254-litmus-harness`: shared litmus validator, the November 5 mix fixture and the one-path
  rehearsal with mail, comparison and model stand-ins behind a loopback-only Demo fence), PR #185
  (`feat/s253-confirmed-form-answers`) and PR #186 (`feat/s246-working-batch`).
- Not started: S247 with S248, S249, S250 with S251, S252, the queue commit, the S254 litmus run,
  the release and its closure.
- Release-critical and unproven until built: the canary landmarks and the reconciliation follow
  the new default desk and lease views in the same pull request as each view, and S249's automatic
  comparison start never fires in a verification session or an automated browser.
- Human verdict NOT RUN. The run made no send, provider write, billed lookup or production change.

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

None. The five PR #182 items (S87 present-tense copy and display, S126 Source last read, S147
Try again, S242 print headings and S86 InfoTip and Notifications) were delivered together by run
8bf183d8 at 5b5c65c6, and PR #180's test-only S113 fix rode the same candidate without a row.
The litmus's two open owner questions (S34 closed-key label, S115 unreachable About panels) and
the QuickBooks Connect button stay in docs/facts.md Open Questions with their defaults. The five
PR #177 items were delivered earlier by run 6951545a at merge commit 3f2e3f5d, and S242–S245 with
the five #173 fixes by run 74d79a9d at 323e8be3. Documentation-only closure does not deploy.
Never resume a consumed or archived run or use its receipts as a new queue. The stopped original
native owner and archived held runs remain untouched.

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
