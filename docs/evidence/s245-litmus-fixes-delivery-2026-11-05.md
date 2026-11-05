# November 5 S245 litmus fixes delivery

Verified application delivery: **2026-11-05T12:02:19Z**. This release delivers the five PR #182
queue items in one candidate: the S245 machine-run litmus's outside-scope repairs for S87, S126,
S147, S242 and S86. PR #180's S113 journey test fix (tests and docs only) rode the same candidate
without a queue row, and PR #183's test and CI tooling is in the serving source with no runtime
path. Help stays V1.1. The run passed every phase on its first pass, with no stop, resume or
rollback. Raw receipts, logs and diagnostic output stay outside Git; this record carries
identifiers and counts only.

## Exact source and delivery chain

| Link                    | Observed evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qualified source        | Main `5b5c65c6b7be2b504b38e8c8fdea3d81367e5202`, the PR #183 merge. Chain since the previous serving commit `3f2e3f5d`: `6491c06f` (documentation closure of run 6951545a), `3a020f5b` (PR #181, the S246–S254 lease renewal one-path specifications and the November 5 client answers, docs only), `952b33e7` (PR #182 batch merge: PR #179 head `2b1b5af6` with fix `d51e84ad`, PR #178 `f1449e1d`, PR #180 `b661c831`, queue `5daf072c`, review fix `cf654c72` and queue `c61ba8c3`) and `5b5c65c6` (PR #183, test and CI tooling with no runtime path; lockfile unchanged)                                                |
| Code review             | Codex review on PR #182 (P2): PR #179 derived the Space card's Next Action from the current process draft. `cf654c72` reads the run's own steps through `getWorkflowRunDefinition` and falls back to the stored value; the thread was answered and resolved                                                                                                                                                                                                                                                                                                                                                                   |
| Local qualification     | `bash scripts/verify.sh` exit 0 at exact head `5b5c65c6` in native WSL, 11:26:26–11:36:25Z: 1,101 unit files (10,479 tests), 86 backend files (497 tests), every doc, help, policy and budget-guard gate and the production build. PR head `c61ba8c3` and `5daf072c` also passed. At `952b33e7` run 1 failed only two load-starved timeouts in `tests/unit/maintenance-vendor-test-lane-retirement.test.mjs` (39,110 ms and 7,160 ms against 5,000 ms; 1 ms and 12 ms when run alone; the test is unchanged and no timeout was raised); run 2 passed 10,473 unit and 497 backend tests                                        |
| Pull-request CI         | PR #182 head `c61ba8c3`: all five jobs passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Exact-main CI           | [42009697057](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/42009697057), push/main/exact 952b33e7: all five jobs successful, firestore included. [42018344883](https://github.com/josiahH-cf/pmiKCkb_and_ownerRouter/actions/runs/42018344883), push/main/exact 5b5c65c6: all seven jobs successful (unit-1, unit-2, e2e, firestore, quality, policy-build and verify), the job layout PR #183 introduced                                                                                                                                                                                               |
| Run / permit            | `8bf183d8-52e3-4244-b2ed-8894df854de8`; prepared at 11:26Z after the two preparation stops below and admitted at 11:37:42Z once the exact-head gate and CI had passed; fresh prerequisites ready (`auth_cli_adc`, `admin_browser`, `billing`, `cost_controls`); batched preflight GO with five queued items in one candidate; permit consumed                                                                                                                                                                                                                                                                                 |
| Application build       | Regional `3b45e869-c0ec-4be8-9b64-276b61faf7ff`, SUCCESS, created 11:41:53Z and finished 11:48:44.944926Z; one application-build claim at 11:41:41.660Z                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Revision / image        | `pmi-kc-app-rmw3h1wp5-706485135a02`; image `sha256:2bfa3a81206549a367bb02ad39ceb3ed645c261a9ef34098df414f9acb629df5` matches the successful build                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Recovery                | Receipt `599103fb-eab9-447a-851f-a5ab764bbf27` issued 11:41:17.821Z; predecessor `pmi-kc-app-rmw3661as-aecc6937ff3f` (`3f2e3f5dc20a6b010afacac472419d81429a79a7`); target `pmi-kc-app-recovery-8bf183d852e34244` (tag `cand-rmw3661as-aecc6937ff3f`); equal fingerprints `sha256:e5e35e04f4df400919a8ce6c9e1f21b51afac60858e0f6285da0ed1e683cf814`, Sheet=true                                                                                                                                                                                                                                                                |
| Candidate               | Receipt `9fb1b2e5-5d18-433b-8365-fd4e6e85c516`, issued 11:54:21.299Z on the first pass, with no stop or resume in this run; exact commit/revision/configuration, Admin passed, Editor `not_run`, reconciliation matched, monitoring ready                                                                                                                                                                                                                                                                                                                                                                                     |
| Promotion               | Receipt-bound exact revision, started 11:54:33.494Z and verified 11:54:42.628Z                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Observation             | Passed two checkpoints over **414,492 ms**, minimum 300,000 / deadline 480,000 ms; report generated 12:01:27.986Z                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Reconciliation / safety | 375 source/projected/rendered records; zero missing, unexpected, duplicate, field or destination discrepancies; thirteen guarded Admin routes passed, which requires zero diagnostics and mutation attempts; candidate 5xx and unresolved effects zero                                                                                                                                                                                                                                                                                                                                                                        |
| Terminal controller     | Exit 0; checkpoint complete at 12:01:30Z with lastDeployedSha 5b5c65c6 and ciRunId 42018344883; permit consumed; no rollback                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Independent readbacks   | All eleven sections matched at 12:02:19Z: canonical version, candidate-tag version, exact 100% traffic, immutable revision configuration, image digest, regional builds, candidate receipt, promotion receipt, observation receipt, checkpoint and authorized domains                                                                                                                                                                                                                                                                                                                                                         |
| Production check        | Read-only Admin session on the canonical origin at 12:09:13Z, GET requests only: `/help` names Help version V1.1 and serving commit 5b5c65c6; on a guide page in print media, 16 of 16 help headings have break-after avoid; the Notifications button's accessible name states the unread count once (no badge was showing at check time); all five process Spaces (owner-renewal-outreach, tenant-renewal-notice, move-in, move-out-deposit-disposition and lease-renewals) returned 200 and rendered the Workflow card with its Next line; 177 GET requests and zero non-GET attempts; the version matched before and after |

Runtime fingerprint is
`sha256:ce13be98ce4c6b9cb59a82b17399f8f93a4b489bce95de91dd90b8412eeb5c8b`, equal to the reviewed
fingerprint. A revision comparison against the predecessor found exactly 54 environment keys on
both, with only APP_COMMIT_SHA changed; the five secret bindings and the managed runtime identity
match. Eleven paired Space maps, Production/Live, Demo=false and Sheet=true match the reviewed
configuration. The nine authorized domains include the canonical host and exactly one current
candidate host `cand-rmw3h1wp5-706485135a02`.

Two earlier runs of the production check failed on the check's own selectors, not on the product:
the first read an `aria-label` the Notifications button does not use, and both read Space page
text from a main landmark those pages do not have. The results above are from the third run.

The previous delivery, run `6951545a` at `3f2e3f5d` (revision
`pmi-kc-app-rmw3661as-aecc6937ff3f`), is historical; its record is the
[help hub litmus repairs delivery](help-hub-litmus-repairs-delivery-2026-11-05.md).

## Preparation

The first prepare, at `952b33e7`, stopped on authentication: the WSL CLI/ADC enrollment from
2026-11-04T16:44:51Z was 17.6 h old, past Google's roughly 16 h reauthentication limit. The owner
re-enrolled at 2026-11-05T11:22:58Z. A second prepare refused with `remote_main_moved` because
PR #183 had merged to main in the meantime, so the release followed main to `5b5c65c6`; PR #183
changes only test and CI tooling and leaves the lockfile unchanged. `auth:ensure` then reported
gcloud and ADC ok with a verified token refresh, and the Admin canary ok on its existing session
(`existing_session`). Run `8bf183d8` was then prepared at 11:26Z and admitted at 11:37:42Z, after
the full gate and exact-main CI passed at `5b5c65c6`, and every later phase passed on its first
pass.

## Delivered scope

- **S87** present-tense copy and display (`d51e84ad`, `cf654c72`): the Connections no-sign-in
  result for QuickBooks, the Approval Queue bulk Execute refusal, the People and Access and Space
  request read-failure notes, and a workflow run's Next Action from its checklist on the run page,
  Space card, process summary and shared context; the Space card reads the run's pinned steps.
- **S126** (`d51e84ad`): Source last read follows the date and time convention on Waiting on you,
  Notifications, Spaces and the assistant's approvals answer.
- **S147** (`d51e84ad`): Try again waits, bounded at 30 s, for a lease read already in flight
  before it reads again.
- **S242** (`d51e84ad`): print keeps every help heading with the content it introduces.
- **S86** (`f1449e1d`): InfoTip cancels a pending hover open, ignores content scrolled under a
  resting pointer and stays closed after Escape, and the Notifications button states the unread
  count once.
- **PR #180** (`b661c831`, tests and docs only, no queue row): the S113 mounted journey's jsdom
  label lookups no longer starve its polling waits. The green exact-main runs above meet its done
  criterion, so Q-ENG-ADV-CI is closed in [open-blockers](../open-blockers.md).
- Help stays V1.1; no help content changed.

## Remaining work

- The 25 S245 L10 steps are unchanged: they close only through a human run against the providers
  in Production with Live data and Sheet updates on.
- The three Open Questions in [facts](../facts.md) (the S34 closed-key label, the S115 About ids
  and the QuickBooks Connect button) keep their defaults.

Both Dotloop write keys remain closed and signing stays human. No customer dispatch, provider
business write, signature or production test record was release proof. Editor-browser, phone and
human acceptance remain unverified in their named scopes. Holds remain in
[open-blockers](../open-blockers.md).
