# Loop state

Last updated: 2026-11-07 (UTC). Read AGENTS.md and docs/facts.md first.

## Current execution

Production serves `ef81b8917209f4eec3f22097142b559f3cce875b` / `pmi-kc-app-rmw65wgt2-8c8249a0547c` at 100% canonical traffic.
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

The earlier [S245 delivery](evidence/s245-litmus-fixes-delivery-2026-11-05.md) and
[November 3 configuration outcomes](evidence/application-gap-delivery-2026-11-03.md) retain
their own evidence. The current release changes no workflow authority or held client input.

## Active November 7 follow-up

Published specification `4caad68df6885d3eed4cb2b3fff7c70e5c96ae15`. Remote main at the start was `bf9753d6af9c7cb90c7a17d3dee0965ae9656095`. The deployed comparison baseline is `ef81b8917209f4eec3f22097142b559f3cce875b`.

The implementation merged through PR #193. The Help verification repair is on `codex/renewal-help-framing-20261108` in `/home/josiah/pmi-kc-work/renewal-usability-20261107`. The exact locally qualified candidate is `f1e2ccc125f91276a8dac5341881b9c361832d87`.

The S259 browser matrix passed all 14 journeys on that candidate. S252 passed 107 checks and all five numerical budgets. The mailbox-disabled rehearsal passed 17 cases. The full gate passed 11,577 unit cases with 4 existing skips, all 555 Firestore tests, the production build and 65 served E2E cases with 4 skips. The separate core gate passed 46 with 23 explicit no-emulator skips. Required Help matched 27 scenes and accounted for 838 controls with zero missing. The deliberate injection detected the hidden Record work control and 9 material scene changes.

Qualify the pull request on its exact head and current base. After verified merge, record green push CI on the exact main commit. Leave the eight application intakes queued for one release while the recorded prerequisites are held.

Release admission is held by the required managed Gmail profile read and the separate Google CLI/ADC reauthentication challenge. See the [release holds](open-blockers.md#november-7-release-assurance). Staff verdict NOT RUN. The [litmus report](evidence/renewal-usability-litmus-2026-11-07.md) preserves the exact runs, earlier failures and evidence gaps.

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

These eight verified application intakes await one authorized candidate. Each row names the exact local qualification source. Intake 129 records engineering evidence in the [litmus report](evidence/renewal-usability-litmus-2026-11-07.md).

1. 121 Guided workspace, shared stage and continuity `f1e2ccc125f91276a8dac5341881b9c361832d87`
2. 122 Exact-cycle retirement and restoration `f1e2ccc125f91276a8dac5341881b9c361832d87`
3. 123 Monthly working table and exact target counts `f1e2ccc125f91276a8dac5341881b9c361832d87`
4. 124 Shared collection review and recovery `f1e2ccc125f91276a8dac5341881b9c361832d87`
5. 125 Sender setup and exact outgoing readiness `f1e2ccc125f91276a8dac5341881b9c361832d87`
6. 126 Staff and process destinations `f1e2ccc125f91276a8dac5341881b9c361832d87`
7. 127 Scoped Admin and Connections tasks `f1e2ccc125f91276a8dac5341881b9c361832d87`
8. 128 Required rendered Help and V2.2 assets `f1e2ccc125f91276a8dac5341881b9c361832d87`

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
