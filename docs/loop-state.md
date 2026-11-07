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

The owner launched intakes 121–129 for unattended execution on November 7. The published specification is `4caad68df6885d3eed4cb2b3fff7c70e5c96ae15`. Remote main at start was `bf9753d6af9c7cb90c7a17d3dee0965ae9656095`. The isolated WSL branch is `codex/renewal-usability-20261107`. The comparison baseline is the earlier deployed `ef81b891`.

One implementation owner is using the isolated WSL worktree
`/home/josiah/pmi-kc-work/renewal-usability-20261107`. Continue the named verification in order.
Use the [versioned S254 profile](renewal-usability-litmus-profile-2026-11-07.md), S252 budgets and
ledger, and final S259 matrix on one candidate. Every automated rehearsal holds automatic
comparison. The focused run at `ffa59856` covered five checkpoints. Staff verdict NOT RUN.

The release runbook requires a guarded Communications browser check that reads the real managed Gmail profile through `/api/gmail-hub/connection`. The November 7 execution instruction excludes mailbox access as verification. This holds release assurance and any release admission that depends on it. Engineering qualification uses only synthetic and loopback evidence. The release queue remains empty during engineering qualification.

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

The queue is empty. Run `72c6456a` delivered S246–S254 in one candidate.
Documentation closure does not require an application revision. The [November 7 follow-up](feature-suites/README.md#november-7-renewal-usability--finalized-specifications)
is authoring ready, with [S259](feature-suites/renewal-usability-final-journey-litmus.md) last.
Its [execution handoff](renewal-ux-followup-handoff.md) is active under the November 7 launch.

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
