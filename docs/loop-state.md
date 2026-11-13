# Loop state

Last updated: 2026-11-13 (UTC). Read AGENTS.md and docs/facts.md first.

## Current execution

The owner launched handoff `staff-workflow-audit-2026-11-12`, S272–S286 (intakes 150–164),
on 2026-11-13 UTC as one unattended cumulative run with one pull request and one guarded
release at the end ([launch authority](../AGENTS.md#owner-directed-staff-workflow-audit-unblock--2026-11-12)).
Work is isolated on `claude/staff-workflow-audit-s272-s286-5fb728`, based on exact main
`7dde3a79371545d1e5e536ab59eb47af7af34f7c` (PR #203). Intake `auth:ensure` read READY with
verified gcloud and ADC token refreshes. Focused checks run per suite; the full gate, core
E2E, the S284 matrix and the release run once on the cumulative head.

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

The first prepare stopped on the expired gcloud sign-in before any permit. After the owner
signed in again, run `d3a71afe` stopped at deploy: Cloud Build could not type-check a test
that imported an upload-excluded fixture, and canonical traffic never moved. Test-only repair
`7f4cf234` passed the exact upload-set type check and exact-main CI, and the replacement run
shipped it. The Thursday checkpoint and the Friday staff review stay separate from cumulative
admission.

Both November 12 stops are now guarded in code. The unit gate
`tests/unit/upload-set-closure.test.mjs` fails any uploaded type-checked import of a
`.gcloudignore`'d file. The watcher's inspect fetch now advances its bare cache's `main`, which
had stayed at an October tip until replacement run `c461d88c` timed out in inspect.

Historical S254 recorded 62 Yes, two No and seven UNVERIFIED on its complete `edba7cbb` run.
L55 and the batch verdict remain No under that run's assistance rule and source. S259 Run 11
passed all 14 engineering journeys. Staff verdict NOT RUN.
[Prior S254 litmus](evidence/renewal-one-path-litmus-2026-11-06.md) · [S259 report](evidence/renewal-usability-litmus-2026-11-07.md)

## Completed November 7 follow-up

Published specification `4caad68df6885d3eed4cb2b3fff7c70e5c96ae15`. Remote main at the start was `bf9753d6af9c7cb90c7a17d3dee0965ae9656095`. The deployed comparison baseline is `ef81b8917209f4eec3f22097142b559f3cce875b`.

PR #193 merged the implementation. The Tenant offer and Update status Help checks were repaired in [PR #194](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/pull/194) and [PR #195](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/pull/195). Exact application main `e012bddc42a5370686e114a9bb5f848dbb1b748a` passed all seven jobs in [push CI 42448213069](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/42448213069).

The full S259 replay passed all 14 journeys on `4b17ec5e4482f73225fd0dfb6d193576389fee85`. S252 passed 107 checks and all five budgets. The mailbox-disabled rehearsal passed 17 cases. The full WSL gate passed 11,578 unit tests with 4 existing skips, all 555 Firestore tests, the production build and 65 served E2E tests with 4 skips. Core E2E passed 46 with 23 explicit no-emulator skips. Rendered Help matched 27 scenes and accounted for 838 controls with zero missing. The disposable drift probe detected the hidden Record work control and nine changed scenes.

Governance PR #196 merged first at `48b5540f`. PR #197 then merged the scoped recovery mapper and Lease details capture repairs at `11c502c1f05c668234b588e57393ab0b7f92d329`. All seven lanes passed on the exact PR head and exact release main. [Governance PR](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/pull/196) · [Repair PR](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/pull/197) · [PR CI](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/42478870881) · [Push CI](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/42480191023)

See [delivery evidence](evidence/renewal-usability-delivery-2026-11-08.md) for the preserved pre-promotion stops and repairs.

The owner resolved the Gmail profile scope on November 8 for the existing guarded release check and directed governance to merge first. Standalone WSL CLI/ADC, existing Admin session, billing and cost-control checks passed on November 8 UTC. Staff verdict NOT RUN. See [guarded release assurance](../AGENTS.md#guarded-release-assurance). The [litmus report](evidence/renewal-usability-litmus-2026-11-07.md) preserves the exact runs, earlier failures and evidence gaps.

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
- **November 12 staff workflow audit:** S272–S286 (intakes 150–164) are AUTHORING READY and
  launched on 2026-11-13 UTC (above). Owner direction of November 12 carried every audit proposal, retired the rules
  that held ten of them and retired B-PROCESS-OWNER. The suite index's November 12 section and
  the router's Action authority record it. Each suite marks its inferred specifics as assumptions.
- Canonical U1–U6 in docs/open-blockers.md own real form/legal/map, case/terms, timing exceptions,
  human acceptance/signing, later exact-key authority and the specific decision above.
  All eight originals are recovered/private; do not request those files, membership or login again.

## Awaiting release

Staff workflow audit chunk 1, queued for a separate early release at the owner's direction
while chunk 2 (S272, S273, S276, S278, S280, S281, S283, S285 and S284) is in development.
Run `d8c6629d` ended in a verified rollback. Keep all six rows until a fresh run delivers them.

1. 152 S274 Refuse or hold a renewal message only for a settled change, and name it `42f7cd9a`
2. 153 S275 Bring an owner or tenant reply to the lease through visible controls `d7a9a0f7`
3. 155 S277 Adopt, affirm and show the basis of the renewal rent `1f1fe06a`
4. 157 S279 Show one lease status from one record `aaf06f03`
5. 160 S282 Record the review of an off-cycle lease end date `b2e53ba3`
6. 164 S286 Renewal Spaces show guidance and start no runs `2b4092d0`

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
