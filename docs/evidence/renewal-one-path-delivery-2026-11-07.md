# November 7 renewal one-path delivery

Production serves `ef81b8917209f4eec3f22097142b559f3cce875b` / `pmi-kc-app-rmw65wgt2-8c8249a0547c` at 100% canonical traffic.
PR #191 and source PRs #184–#190 shipped together in run `72c6456a-3f3f-4ec2-8282-03542cfb7772` after all seven
exact-main CI jobs passed in `42356598810`. The controller exited zero and its permit is consumed.
Observation passed 2 checkpoints in 410,069 ms with 375 matched
source, projected and rendered lease records, zero discrepancies, candidate 5xx, unresolved effects
or guarded mutation attempts. The eleven independent final readbacks passed at
`2026-11-07T09:12:03Z`.

## Exact source and delivery chain

| Evidence                       | Verified value                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source                         | PRs #184–#190 plus the reviewed repair PR [#191](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/pull/191), merged at `ef81b8917209f4eec3f22097142b559f3cce875b`. The merge tree matches the reviewed branch and includes all six recovered commits and both typing changes.                                                                                                                                                                                                      |
| Verification                   | [Exact-main CI](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/42356598810) passed all seven jobs. The identical reviewed tree passed the local full gate, with 11,535 unit, 553 Firestore and 65 served end-to-end passes.                                                                                                                                                                                                                                         |
| One regional application build | `d8d3b2c1-797e-4094-9b60-06cd2c183200` succeeded. The running revision image matches `sha256:7c63410b2f4c18976af66584f084b9f3e350d928015e3cf6aa7019ded31eeb7c`.                                                                                                                                                                                                                                                                                                                         |
| Recovery                       | From `pmi-kc-app-rmw3h1wp5-706485135a02` / `5b5c65c6b7be2b504b38e8c8fdea3d81367e5202` to `pmi-kc-app-recovery-72c6456a3f3f4ec2`, retaining Sheet=true and runtime fingerprint `sha256:ce13be98ce4c6b9cb59a82b17399f8f93a4b489bce95de91dd90b8412eeb5c8b`. Receipt `a3aa0ec3-ea00-4e22-b6d0-94dc33d84f00`, reference `sha256:08d45e18e085da2d2e116b5587c0be14f1c9ef8923fc7fd4f632eed5423f76c3`, tag `cand-rmw3h1wp5-706485135a02`. The watcher recorded its prior tag binding separately. |
| Candidate                      | `pmi-kc-app-rmw65wgt2-8c8249a0547c`, candidate receipt `80c67367-e201-45e4-94cd-66395b89137e` issued `2026-11-07T09:04:40.370Z`. The guarded Admin policy passed on 13 routes. Editor browser `not_run`. The worker readiness job was restored after its exact probe.                                                                                                                                                                                                                   |
| Promotion                      | Exact receipt-bound candidate at 100% canonical traffic, verified `2026-11-07T09:05:03.613Z`.                                                                                                                                                                                                                                                                                                                                                                                           |
| Observation                    | 2 checkpoints across 410,069 ms. The bounds were 300,000 to 480,000 ms. All 375 source, projected and rendered lease records matched. The report recorded zero discrepancies, candidate 5xx, unresolved effects and guarded mutation attempts.                                                                                                                                                                                                                                          |
| Final readbacks                | All eleven passed at `2026-11-07T09:12:03Z`. The exact revision and commit, image, traffic, fingerprint, service identity, 11 paired Space maps, 5 secret bindings, Production + Live, Demo=false and Sheet=true were checked. Runtime fingerprint `sha256:582cb5fb2eaaf084ab61f0568c7518162333fd6bb0daf821b19981919d189b90`. Only `APP_COMMIT_SHA` changed among 54 runtime environment keys.                                                                                          |
| Completion                     | Controller exit zero at `2026-11-07T09:11:49Z`. Permit consumed. Nine queued items delivered in one candidate.                                                                                                                                                                                                                                                                                                                                                                          |

## Delivered behavior and outstanding evidence

- The working desk groups the upcoming batch and carried work. The assistant uses the same
  targets. Guided keeps one action in Now and advances with recorded evidence. Focus and Full
  and the original table and links stay available.
- The prepared kickoff keeps one reviewed version of figures and message. Portfolio agreements
  and the assistance path surface the applicable next step. Forms use confirmed charges and
  lease-specific wording where their approved mappings permit them.
- Help V2.1 and the [walkthrough](renewal-one-path-walkthrough-2026-11-06.md) describe the
  controls staff see. The [UX review](renewal-one-path-ux-review-2026-11-06.md) records the
  initial failures, targeted repairs and verification limits.

The [independent litmus](renewal-one-path-litmus-2026-11-06.md) retains 62 Yes, two No and seven
UNVERIFIED on its complete `edba7cbb` run, with separately dated repair rechecks. L55 remains No
because the settled assistance rule classifies the voucher-only lease as Ready. Batch acceptance
remains No. Human verdict NOT RUN.

Release assurance used guarded reads. No actual send, signature, billed or automatic
comparison, or client answer is delivery evidence. The [unblock packet](../open-blockers.md)
keeps document approval, case details, human authority and Dotloop activation separate.
The completed predecessor state was preserved under the release lock. Raw operational receipts
and evidence stay private.
