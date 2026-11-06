# November 5 help hub litmus repairs delivery

Verified application delivery: **2026-11-05T07:04:43Z**. This release delivers the
five PR #177 queue items in one candidate: the S242 and S244 repairs the S245 machine-run litmus
found, help V1.1 (S243), the S245 litmus report and the S235 Admin form-family hint. The run's
first candidate assurance pass stopped before promotion with production untouched; the operator
resumed that same pass, which then passed assurance and every later phase. Raw receipts, logs and
diagnostic output stay outside Git; this record carries identifiers and counts only.

## Exact source and delivery chain

| Link                    | Observed evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qualified source        | PR #177 head `f5840775bd8f039116d11659c870378384111e51`, merged into main by merge commit `3f2e3f5dc20a6b010afacac472419d81429a79a7` so every queued commit stays an ancestor: `cbe0de34` (S242 and S244 repairs, litmus Runs 1 and 2), `d2d3a787` (conditional-branch inventory, S66 line, S235 hint, help V1.1), `2d255032` (22 pictures recaptured), `13e5ab40` (two guide results), `d9647ea7` (litmus Runs 3 and 4) and queue `f5840775`                                       |
| Local qualification     | Pull-request head full gate at `f5840775`: `bash scripts/verify.sh` exit 0, with 1,096 unit files (10,391 tests) and 86 backend files (497 tests)                                                                                                                                                                                                                                                                                                                                   |
| Pull-request CI         | The firestore lane failed on the S113 mounted journey's tenant-preview wait in attempt 1 of [41968323970](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/41968323970) (`13e5ab40`) and of [41974275990](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/41974275990) (`f5840775`). Both commits change only help text and docs; each passed unchanged on re-run; the test was not changed, and a root-cause follow-up is proposed separately |
| Exact-main CI           | [41979132377](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/41979132377), push/main/exact 3f2e3f5d; all five jobs successful                                                                                                                                                                                                                                                                                                                                   |
| Run / permit            | `6951545a-4e90-4620-b53f-ef5de75b2c1a`; fresh approved CLI/ADC, Admin browser, billing and cost prerequisites, with the `auth:ensure` canary reporting `google_session_reuse`; batched preflight GO with five queued items in one candidate and every check READY; watcher admitted at 06:33:10Z; permit consumed (`run_complete`)                                                                                                                                                  |
| Application build       | Regional `10aff53f-a5a8-4cb0-9877-54a6791ee0d3`, SUCCESS 06:41:25.512797Z; one application-build claim                                                                                                                                                                                                                                                                                                                                                                              |
| Revision / image        | `pmi-kc-app-rmw3661as-aecc6937ff3f`; image `sha256:d97f5a1e7b896db03787460b433407acf34b253f894d3be62fff1375355ab53b` matches the successful build                                                                                                                                                                                                                                                                                                                                   |
| Recovery                | Receipt `024e2916-ab10-48fd-a150-529288bcca9e` issued 06:36:09.191Z; predecessor `pmi-kc-app-rmw2hrh4d-8b96ea7b6800` (`323e8be36535dabe21623ff28ca1160f8aae6657`); target `pmi-kc-app-recovery-6951545a4e904620`; equal fingerprints, Sheet=true                                                                                                                                                                                                                                    |
| First assurance pass    | Stopped before promotion: `observe-production-release.ts` failed with `candidate_assurance_gate_failed` at 06:46:31.236Z and the checkpoint recorded `blocked: assurance_unverified` with an operator resume required; the gate kept no report. Canonical traffic stayed at 100% on `pmi-kc-app-rmw2hrh4d-8b96ea7b6800` and the last deployed commit stayed `323e8be3`                                                                                                              |
| Operator resume         | 06:53:40Z, the same pre-promotion pass of the same run; no observation was resumed                                                                                                                                                                                                                                                                                                                                                                                                  |
| Candidate               | Receipt `eac936d1-13e5-49c9-ac09-fbbd68a62458`, issued 06:57:08.097Z in the resumed pass; exact commit/revision/configuration, Admin passed, Editor `not_run`, reconciliation matched, monitoring ready                                                                                                                                                                                                                                                                             |
| Promotion               | Receipt-bound exact revision, started 06:57:21.720Z and verified 06:57:27.868Z                                                                                                                                                                                                                                                                                                                                                                                                      |
| Observation             | Passed two checkpoints over **416,972 ms**, minimum 300,000 / deadline 480,000 ms; report generated 07:04:18.693Z                                                                                                                                                                                                                                                                                                                                                                   |
| Reconciliation / safety | 375 source/projected/rendered records; zero missing, unexpected, duplicate, field or destination discrepancies; thirteen Admin routes rendered with zero diagnostics/mutation attempts; candidate 5xx and unresolved effects zero                                                                                                                                                                                                                                                   |
| Terminal controller     | Exit 0 at 07:04:20Z; checkpoint complete, exact lastDeployedSha 3f2e3f5d, permit consumed; no rollback                                                                                                                                                                                                                                                                                                                                                                              |
| Independent readbacks   | All eleven sections matched at 07:04:43Z: canonical/tag identity, exact 100% traffic, revision/image/configuration, regional build, candidate/promotion/observation/checkpoint and the current candidate domain                                                                                                                                                                                                                                                                     |
| Production check        | Read-only Admin session on the canonical origin at 07:05:05Z, GET requests only: `/help` names Help version V1.1 and serving commit 3f2e3f5d, What changed shows the amended V1.1 entry, and the snooze, Completion checks and connection-check results read as corrected; five help pages returned 200; 118 GET requests and zero non-GET attempts; the version matched before and after                                                                                           |

Runtime fingerprint is
`sha256:e5e35e04f4df400919a8ce6c9e1f21b51afac60858e0f6285da0ed1e683cf814`. A revision comparison
against the predecessor found exactly 54 environment keys on both, with only APP_COMMIT_SHA
changed; the five secret bindings and the managed runtime identity match. Eleven paired Space maps,
Production/Live, Demo=false and Sheet=true match the reviewed configuration. The
nine authorized domains include the canonical host and exactly one current
candidate host `cand-rmw3661as-aecc6937ff3f`.

The previous delivery, run `74d79a9d` at `323e8be3` (revision
`pmi-kc-app-rmw2hrh4d-8b96ea7b6800`), is historical; its record is the
[help hub delivery](help-hub-delivery-2026-11-04.md).

## The first assurance pass and its resume

The first pass completed its recovery, zero-traffic deploy, smoke, fingerprint and domain phases,
then stopped at candidate assurance before promotion. Production was untouched: canonical traffic
stayed at 100% on `pmi-kc-app-rmw2hrh4d-8b96ea7b6800` throughout. The assurance gate kept no
report, so the failing check is unknown and the cause is not proven beyond slow cold first loads.

The candidate's Cloud Run request log for that pass showed no 5xx response. Cold first loads were
slow: the renewal desk took 41.5 s, the lease workspace's API reads took 15–17 s each and a later
desk read took 21.8 s. Two extracts are retained: the first 400 requests (06:42:21–06:44:32Z)
hold 397 2xx responses, two 307 redirects and one `/favicon.ico` 404, and the 77 requests from
06:44:33Z to 06:46:11Z are all 200.

Read-only diagnostics then ran on the warm candidate from the watcher's exact checkout with the
release's own browser build. The Admin canary rendered 13 of 13 routes 2xx with their landmarks and
zero diagnostics or mutation attempts (06:48:39–06:49:12Z). A reconciliation under the release's
`s232-one-status` guidance contract matched 375/375/375 with complete, stable sources
(06:49:38–06:50:52Z). A read-only recovery-preparation canary warmed the recovery target
`pmi-kc-app-recovery-6951545a4e904620` (tag `cand-rmw2hrh4d-8b96ea7b6800`, commit `323e8be3`, the
predecessor's fingerprint) and rendered 13 of 13 routes 2xx (06:52:33–06:53:27Z).

The operator resumed the run at 06:53:40Z. The stop was before promotion, so the resume repeated
the same pass and no observation was resumed. Assurance passed and issued the candidate receipt at
06:57:08.097Z; promotion, the full observation and completion followed, and no rollback occurred.

## Delivered scope

- **S242** repairs: a deep link to an unknown step id lands on the guide's section page with its
  "This guide moved" line; each guide picture declares its committed pixel size, so a step opened
  from another page stays in view while the pictures load; screen control rows are keyed by region,
  role and label, which clears the duplicate-key errors on four help pages.
- **S243** help V1.1: three guide results match the app (Manage Connections after a live check,
  the snoozed queue item and the Completion checks card), with one What changed entry and a new
  content digest, and the 22 pictures under public/help/V1.1 (retired by help V2.0 in S252; kept in Git history) are recaptured from the isolated
  synthetic rehearsal.
- **S244** in-app help copy repairs: InfoTip measures its panel at its own width; the Admin
  migration note, the bulk Execute line and the Sheet reversal line describe present behavior; the
  copy inventory reads each branch of a conditional, adding 65 disposition rows, and their audit
  corrects one S66 status line.
- **S245** machine-run litmus report, Runs 1 to 4, in
  [the litmus report](help-hub-litmus-2026-11-04.md). Run 4 at `13e5ab40` is accepted under
  R-S245-5: no check is No, and L10 is UNVERIFIED for 25 steps that need RentCast, Gmail, Dotloop,
  the Sheet updates switch or Production with Live data. Human verdict: NOT RUN.
- **S235** Admin form-family hint by the owner's decision of 2026-11-04: the hint is S244 help copy
  and reads "Engineering default. Choosing a use here records it as a new configuration version."
  R-S235-2 is amended; the packet and process readiness views keep their "not yet approved by the
  client" source label.

## Remaining work

- The 25 L10 steps close only through a human run against the providers in Production with Live
  data and Sheet updates on; RentCast, Gmail and Dotloop stand-ins, which the rehearsal does not
  have, could cover part of them.
- The first assurance pass's stop has no proven cause: the gate kept no report, and slow cold first
  loads are the only supported explanation.
- The S113 mounted journey's pull-request CI failures have no named cause; a root-cause follow-up
  is proposed separately (Q-ENG-ADV-CI in [open-blockers](../open-blockers.md)).
- Observations the litmus recorded outside S242 to S244 scope are unchanged by this release.

Both Dotloop write keys remain closed and signing stays human. No customer dispatch, provider
business write, signature or production test record was release proof. Editor-browser, phone and
human acceptance remain unverified in their named scopes. Holds remain in
[open-blockers](../open-blockers.md).
