# Renewal Focus batch 003 validation — 2026-10-01

S145 evidence map for S142–S144. Each cell names the environment that produced it. "Unit" is the
real `RenewalWorkspace` under jsdom, with a stateful route fake that applies the real planner and
revision fence. "Backend" is the Firestore emulator through the real staff-record store.
"Compiled browser" is the real application on the local rehearsal (Demo + live read-only, which
refuses every write) in headless Chromium. "Production" cells are filled only from the batch 003
release readback. Human verdict: NOT RUN — no human observer.

## Tested environments

- **Code:** S142 merged at `f5368c2f` (PR #101). S143/S144 merged at `884b7759` (PR #102). S145
  adds tests, the compiled-browser smoke and two corrections to the S143/S144 pane. Each slice
  passed the full `bash scripts/verify.sh` on its exact head, including a fresh production
  dependency audit (`npm audit --omit=dev`: 0 vulnerabilities). Each also passed
  `test:e2e:core` (31 passed, 18 skipped) and exact PR CI (6/6). S142 ran 7,670 unit and 236
  backend tests; S143/S144 ran 7,687 unit and 239 backend tests.
- **Baseline:** the Full view was recorded at `6c806afe`, before any Focus change, for six fixture
  cases: three roles, a selected step, three sample leases and the layout without a cycle.
- **Compiled browser:** `npm run dev` on the WSL host on 2026-10-01 with a demo Editor session,
  each run on a fresh server. The guide and desk smokes and a first Focus run used `d98f3fce`
  (00:42–00:51 UTC). The desk comparison used the pre-batch-003 code `b6c9a1e4` (00:53–01:00).
  The desk smoke and the final Focus smoke used the S145 commit `82344c39` (01:00–01:13). Reads
  used the approved `josiah@pmikcmetro.com` identity, whose CLI/ADC refresh `auth:ensure`
  verified. The Focus smoke waits for the page's own reads to finish before recording its
  baseline, and it prints structure only: no lease identifier, party, address or amount.
- **Production:** none. Batch 003 has not been released, and serving is unchanged.

## Fail-first

- On the single-view source (`6c806afe`), six of the seven round-trip tests fail on the missing
  switch. The seventh, the no-switch layout check, passes by design. The journey and server-rule
  files fail without the S142 projection. The recorded baseline passes on both sides.
- All 17 S143/S144 tests failed on `6530f51b` (S142 only), before the Focus view existed.
- S142's graph tests failed without the resolver. Its equivalence fixture shows that the
  extracted manual-lane predicates leave every summary and guidance output unchanged.
- Each S145 correction's test fails on `d98f3fce` and passes with the correction.

## Corrections made in this batch

- **Disclosures after Focus (S143).** Choosing tasks in Focus opened the manual-activity
  disclosures on each task's path. Leaving Focus did not close them, so 12 sections that had been
  closed in the Full view stayed expanded. The reveal now closes exactly the disclosures it opened.
  The existing focus helper still opens a requested control's disclosure for "Show this task in
  Full view".
- **Completion wording (S144).** When a refreshed source completed the chosen verification task,
  the pane announced "Recorded. Next: …". Only staff work now says Recorded; other completions
  say Done.
- **Made during S143/S144:** an unreadable staff record is now reported as its own root cause,
  and a completed renewal leads with its outcome instead of optional work.

## Results

- **Graph and server rules (unit):** 60 seeded walks of 40 planner actions each, including
  out-of-order, reversed, revised and declined records. In every reachable state, the pane offers
  staff completion exactly when the planner accepts it. Every offered staff record is accepted,
  and its readback completes that action. Not applicable is offered exactly where the planner
  permits it. Every reported completion is the manual lane's own satisfaction predicate. Readiness
  follows the workspace route's role guard for all three roles. The only diagnostic a reachable
  record raises is the recorded owner/tenant branch conflict. Independent ready work recorded in
  six random orders reaches one result. A new cycle carries none of the earlier cycle's records.
- **Journeys (unit):** in the Focus pane, the accepted branch runs to staff completion across a
  dirty-input switch, a Gmail return and a reload. An owner decline runs to the non-renewal
  handoff and completion. A tenant counter reopens the owner response, and new terms reopen the
  offer. A concurrent save delivered by refresh re-derives the next task without a submission. A
  late refresh that confirms the rent moves on with "Done", not "Recorded". After each journey,
  Full view shows the same records and summary label. No operation id was replayed.
- **Store (backend):** the S144 emulator test advances one confirmed, read-back record at a time
  to completion and reopening. A stale revision and a wrong cycle are refused, and a duplicate is
  replayed once. Each of these leaves the projection unchanged. A new cycle leaves the earlier one
  as history.
- **Full view preservation (unit):** for five role, lease and step cases, the Full view returns to
  the recorded baseline after entering and leaving Focus in both orders. The switch works from
  the keyboard. Disclosure state returns as it was after every task is chosen. The S114 copy
  controls copy identical text before and after. Switching sends no request and causes no save,
  navigation or refresh. The layout without a cycle offers no switch and is unchanged.
- **Compiled browser, Focus:** three live lease workspaces. On each, Full view was the default and
  Focus showed one task ("Verify contractual base rent"), hiding 14–16 Full view elements. All 29
  tasks were chosen in Focus. After three round trips (pointer, keyboard, and pointer at 390 px),
  the Full view signature, including disclosure state, was unchanged. Neither view scrolled
  horizontally. Switching sent no lease-renewal request and no write, and it caused no navigation
  and no page error. The only console errors predate switching: a 409 from the RentVine write-back
  status read during page load, and a development-server deprecation notice.
- **Compiled browser, preservation:** the S111 guide smoke passed on `d98f3fce`. It located 71
  guide steps (40 required and 6 conditional controls visible, 25 conditional controls not offered
  on the sampled lease) and preserved the desk view from desk to lease and back. The S145
  corrections change only Focus-mode code.
- **Compiled browser, desk smoke (not a batch 003 change):** the S82 desk smoke failed its 20 s
  interaction budgets on the rehearsal for both the pre-batch-003 code and the batch 003 code. On
  `b6c9a1e4` and `82344c39`, both attempts timed out waiting 20 s for the table. On `d98f3fce`, a
  sort took 22.5 s and a filter 22.2 s. Desk render times were the same before and after: 2.8–32.1 s
  on `b6c9a1e4` and 2.7–29.8 s on `82344c39`. Batch 003 does not change the desk list loader. The
  first cold Focus run also differed from its baseline because slow reads (up to 27.5 s) were still
  loading when the baseline was recorded. The smoke now waits for those reads to finish, and its
  later runs passed.

## Acceptance map

| Check     | Evidence                                                                                                                                           | Environment            | Result                                                               |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------- |
| AC-S142-1 | Two joins blocked after the first shared prerequisite and ready after the second; reversed display order resolves prerequisites first              | Unit                   | Pass                                                                 |
| AC-S142-2 | Alternatives and branches without phantom work; cycles, missing references, impossible conditions and unknown applicability diagnosed locally      | Unit                   | Pass                                                                 |
| AC-S142-3 | Another actor, waiting effect, unreadable source, unrelated save and historical cycle stay distinct; stale, replayed and wrong-cycle saves refused | Unit; backend          | Pass                                                                 |
| AC-S143-1 | Full view default; both switch orders return the recorded baseline; unsaved input kept; no navigation; desk return preserved                       | Unit; compiled browser | Pass; live unsaved-input check had no free-text staff form to use    |
| AC-S143-2 | One task with lease context, other ready tasks and all work by status; actions completed in the pane                                               | Unit; compiled browser | Pass                                                                 |
| AC-S143-3 | No request, save or navigation from switching or choosing; waiting, blocked, unreadable and complete stay distinct; focus and announcements        | Unit; compiled browser | Pass                                                                 |
| AC-S144-1 | Every applicable action maps to its existing control and route; the pane sends exactly the Full view request                                       | Unit                   | Pass; live writes not exercised                                      |
| AC-S144-2 | Confirmed save advances on readback, survives reload and appears in Full view; independent work stays offered                                      | Unit; backend          | Pass                                                                 |
| AC-S144-3 | Concurrent change, double click, ambiguous effect and Gmail return keep input and evidence meaning without replay or a send claim                  | Unit; backend          | Pass; no live Gmail draft created                                    |
| AC-S145-1 | Graph cases plus the server-rule matrix over reachable planner states, roles and cycles                                                            | Unit                   | Pass                                                                 |
| AC-S145-2 | Journeys across branches, failures, re-entry and concurrency; store lifecycle                                                                      | Unit; backend          | Pass; live staff-record saves not exercised                          |
| AC-S145-3 | Baseline, round trips, disclosures, copy output, keyboard and phone width; guide smoke                                                             | Unit; compiled browser | Pass; desk smoke budget failure is pre-existing (see Results)        |
| AC-S145-4 | This map; serving readback required for any deployment claim                                                                                       | Unit; backend; browser | Local scopes pass; production pending the batch 003 release readback |

## Unverified seams

- Production serving of Focus: batch 003 is not deployed. Its release follows the batch 002
  release, which is paused in its recovery phase on the owner's attended canary browser
  enrollment.
- Live staff-record saves through Focus: the rehearsal refuses writes, and no synthetic production
  record is authorized. The emulator test covers the store path.
- Live Gmail drafts and provider effects (RentVine or Sheet write-back) started from Focus: the
  controls and their exact confirmation and readback are unchanged and were tested only with
  fixtures.
- Unsaved input in the compiled browser: none of the sampled live leases had a current cycle with
  a free-text staff form. This is covered at fixture level.
- An owner who keeps identical terms after a tenant counter: the existing S113 rule keeps the
  owner response outstanding, and Focus follows it. The tenant's later answer is recorded in Full
  view. No new rule was added.
- The desk's production latency was not measured here. The dev rehearsal budget failure above
  predates batch 003.
- Human usability, screen reader and full-page zoom verdicts: NOT RUN.
