# AI-first Dashboard batch 004 validation — 2026-10-01

S151 evidence map for S146–S150, with the AF-01 to AF-70 acceptance ledger from the 2026-10-01
execution run. Each cell names the environment that produced it. "Unit" is the real component or
module under jsdom or node with counted seams. "Backend" is the Firestore emulator through the
real history and saved-question stores and the real route handlers, with the model provider, the
interpreter and the server operational context counted. "E2E" is the real `next dev` server driven
over HTTP (`tests/e2e`), with the Firestore emulator for persistence or without it for the
Live-read-only rehearsal contract. "Compiled browser" is headless Chromium against that harness
server with demo accounts, deterministic interpretation and the Firestore emulator. "Production"
cells come only from the release readbacks and the owner's bounded live check. Human verdict: NOT
RUN — no human observer.

## Tested environments

- **Code:** intake PR #110 (`c2de469d`, merged at `cd4407c0`). S146/S147 `87d6fd7c` (PR #111,
  merged at `a4b6f2f6`). S148 `fe78b0c9` (PR #112, head `0367bb5e`, merged at `c6b44ef0`).
  S149/S150 `129c833e` (PR #113, head `ea9fdb43`, merged at `d1055b7f`). S151 `85524308` and
  `404abdf3`, the interim-release records `b7bf7b14` and the live check's fresh-context fix
  `b9d3d1d7` (PR #115, head `d5b6967b`, merged at
  `19d4590a`). The interim queue PR #114 (`de36d59f`, docs only) merged at `2b53c5d5`. Each code
  head passed the full `bash scripts/verify.sh` on its exact commit (fresh production dependency
  audit included) and `npm run test:e2e:core` (31 passed and 18 skipped; 32 and 22 once S151's
  E2E file landed), with logs outside Git, and
  exact PR CI: `87d6fd7c` 7,811 unit (4 skipped) and 246 backend; `0367bb5e` 7,842 and 261;
  `ea9fdb43` 7,876 and 273; `d5b6967b` 7,887 and 273.
- **Baseline:** at `cd4407c0` (main before any batch 004 code) the 18 Dashboard, assistant,
  navigation and boundary suites passed (181 tests), and the preservation set passed.
- **Backend:** `tests/firestore/s148-assistant-history.test.ts` (15) and
  `tests/firestore/s149-s150-saved-questions.test.ts` (12) run the real stores and the real
  `/api/assistant/history*`, `/api/assistant/saved*` and `/api/assistant/query` handlers on the
  emulator. Seams left: the session cookie (the capability check returns the test user) and Next's
  HTTP layer (handlers receive standard requests).
- **E2E:** `tests/e2e/ai-history.e2e.test.mjs` on 2026-10-01 against `next dev` with the harness
  descriptor (Demo + Live-read-only, demo auth, deterministic interpretation): 4 passed with the
  Firestore emulator; the no-emulator case runs in every `test:e2e:core` gate.
- **Compiled browser:** `scripts/run-dashboard-history-browser-smoke.mjs` inside a Firestore
  emulator, 28 checks passed at desktop (1360×1000) and 390×844 on the code of PR #115.
- **Live-check dry run:** the production check script at `6cafaecb`, with only its version check
  and the owner profile replaced by the harness's demo sign-in, ran against the harness server on
  the Firestore emulator (2026-10-01T20:03Z): four questions answered and saved, three
  conversations listed and two turns restored after the context relaunch, save, pin and unpin,
  one `stored_plan` rerun with the earlier answer kept, and zero refused requests. The harness has
  no lease source, so its lease groups read as unavailable.
- **Production:** interim run `98f7e743-7345-4b74-a6a8-675fe9fac31f` (owner direction 2026-10-01)
  released S108 and S146–S148 at `2b53c5d5d889280d1fa0dc6aa1da3dc3e601d9d0` /
  `pmi-kc-app-rmupw50tc-8189b32d3395` (promotion verified 2026-10-01T19:18:35.092Z; observation
  passed two checkpoints in 414,515 ms; 312 of 312 records matched; zero candidate 5xx; eleven
  readback sections, none unverified, last at 2026-10-01T19:27:07Z). Its first recovery
  assurance failed on a cold first render; a read-only diagnostic canary on the 0% recovery target
  passed (all 13 routes) and the same-run resume passed. Second run: run `729d5716-bc5e-4e61-9932-c9107d1954f2` released S149–S151 at `1402e51b4828d407f990a675f16e6a7ba47afb7b` / `pmi-kc-app-rmuq2qvcc-8074bfd97707` (promotion verified 2026-10-01T22:15:27.458Z; observation 419,630 ms, 312 of 312 records; readbacks 2026-10-01T22:22:18Z). Its first recovery assurance also failed on a cold first render and passed on a diagnosed resume; every later phase passed first time. Run 0aa79bfe had first carried the same code and rolled back verified (see Results).

## Fail-first

- S146/S147 on `cd4407c0`: 16 unit tests fail (the composer-first order, per-turn retry, no
  process picker, new conversation, the queue states) and the S147 suites cannot load.
- S148 on `87d6fd7c`: 19 unit tests fail (no history, no operation id, no saved state) and the
  contracts and emulator suites cannot load.
- S149/S150 on `0367bb5e`: 25 unit tests fail (no stored-plan executor, no saved questions, no
  run route, and the rehearsal still read history per question) and the contracts and emulator
  suites cannot load.
- Counted-model fixtures: the S150 unit and emulator suites show the question path interpreting
  on every call (two calls for two identical questions; one model provider and one interpreter
  call for a new question through the real route) while the stored-plan path makes none.

## Corrections made in this batch

- **History replay read in the rehearsal (S148, fixed in S149/S150 `129c833e`).** The query route
  read the user's history on every question that carried an operation id, including in the
  Live-read-only rehearsal against a real project, where history is never saved. It now reads only
  where history is saved (`tests/unit/s148-query-replay-mode.test.ts` fails on `0367bb5e`).
- **Made during S148 before its commit:** reopening with narrowed access hid stored records but
  still returned their references in the follow-up context and executed plan (now stripped); the
  history list could stay loading when no first page streamed (now offers retry); the workspace
  wrote a ref during render (lint) and now syncs it in a layout effect.
- **Live check reopened on a new page, not a fresh context (S151, fixed before merge in
  `b9d3d1d7`).** AF-65 asks the bounded live check to reopen history in a fresh browser context;
  the script opened another page of the same context. It now closes and relaunches the guarded
  owner context between the question and reopen phases. The new source test in
  `tests/unit/s151-live-check.test.ts` fails on `b7bf7b14` and passes after the fix.
- **S148 UI test raced the reopen focus move (test-only, fixed in `d5b6967b`).** PR CI on
  `6cafaecb` failed "a follow-up in a reopened conversation continues its stored context and
  saves there": its DOM showed an empty question box and no new turn. Reopening moves focus to
  the opened turn on the next animation frame; under load that frame landed after the test had
  started typing, so the keys went to the turn. With `requestAnimationFrame` delayed by 40 ms the
  original test fails every time; after the fix (wait for the focus move, then type) the whole
  file passes under that delay, as do the other Dashboard UI suites. No product change.
- **Check tooling:** the S151 browser smoke clicked Show anticipated work before hydration (it now
  waits for the request), used an ambiguous label locator and read a helper before its
  initialisation. None is in the application.

## Results

- **S146 workspace (unit):** the composer is the first primary element and every answer and
  follow-up renders below it in order (`tests/unit/s146-ai-first-dashboard.test.tsx`,
  `tests/unit/console-view.test.tsx`). An ordinary question posts only `question`,
  `conversation` and the operation id; no process, Space or workflow field. A network rejection
  fails only its turn, keeps the question and recovers on Retry; a late answer never clears newer
  typing. Mounting sends no request. A new conversation keeps the earlier one reopenable without
  asking again. The attention read streams into its own boundary, so a pending or failed read
  never delays the composer.
- **S147 relocation and queue (unit):** the five named panels are absent (not hidden); Anticipated
  work computes on request in Internal Processes beside Start run with its default-notice-rule
  caption; setup status sits in Connections and the Internal Processes cards. The queue lists
  only the signed-in user's eligible approval and renewal-review items, once each, with view
  versus approve authority, inline Approve with its server re-check and a refresh afterwards, and
  distinct empty, partial and unavailable states with no fabricated count, including for a
  maintenance-only user (`tests/unit/s147-*.test.ts*`, `tests/unit/dashboard-attention-queue.test.tsx`).
- **S148 history (backend, unit, E2E):** turns are recorded under the session uid's own key;
  repeated begins and identical saves write nothing new; a completed answer is never overwritten
  (409); a failed attempt completes on retry; two concurrent sessions append distinct turns; a
  late answer never moves a newer turn or the conversation's state; another account, a guessed
  conversation id or a spoofed operation id reveals nothing; 25 conversations page 20 + 5 without
  duplicates; an unanswered question shows in progress, then interrupted, never answered; off-site
  and script links and oversize answers are refused. Through the real handlers: save, list and
  reopen with zero model calls; narrowed access hides stored records and their references; a
  verification account is refused (403) with nothing written; a completed submission replays with
  zero model calls and duplicate deliveries of a new submission make one. In the UI: no request on
  mount, one operation id across begin, query and save, Retry saving resends the same answer and
  never asks again, failed history reads stay distinct from empty, older pages append, responses
  for another sign-in are discarded, and verification and rehearsal sessions send no history
  write. E2E: a later session lists and reopens the same turn with its as-of; the Editor account
  gets 404; the rehearsal refuses every history write (409) while asking still works.
- **S149 saved questions (backend, unit, E2E):** saving reads the user's own completed turn on the
  server and keeps its merged plan, record references, original concrete range and relative or
  fixed intent; it is idempotent per turn, and the same wording asked twice stays two items. A
  follow-up's saved plan keeps `assignee: me` while its words alone lose the subject. Failed turns
  (409), other users (404) and verification accounts (403) cannot save. Pin and label changes are
  versioned: a retried pin is a no-op, a stale opposite change is refused (409) and the latest
  state is shown, unpinning keeps the item. The browser never receives a stored plan or record
  references. In the UI: Save question saves once, a failed save never shows as saved, Open last
  answer only reads, navigation never runs anything, pin and rename carry the version they saw,
  and Ask again sends the saved context and labels the answer as newly generated.
- **S150 structured rerun (unit, backend, E2E):** `runStoredPlan` has no interpreter parameter and
  runs the stored plan through the same executors: identical records, totals and links to a new
  question at the same moment; "this month" moves from September to October under a controlled
  clock while the earlier answer keeps its September range; a named month stays fixed in
  December; a cross-subject follow-up keeps its record references; a detail question answers its
  one stored record. Failed, partial and denied current reads show as unavailable, partial and
  not authorized, distinct from a true empty result. Current runs carry their real as-of, coverage
  and currency, and log one bodyless `assistant_conversation` line with `interpretedBy:
stored_plan`. Through the real run route: zero model and interpreter calls and one context per
  run, the result recorded as a new `rerun_of` turn with the original untouched, duplicate
  delivery executing once and replaying afterwards, unsupported plans refused (409) without
  executing, other users 404 and verification accounts 403. E2E: the rerun matches the data
  layer's fresh answer for the same question, and a saved follow-up reruns with its merged meaning.
- **Compiled browser (S151 smoke, 28 checks):** listed in the commit for PR #115; every check passed
  at desktop and 390 px.
- **Production, interim run (owner direction):** run `98f7e743-7345-4b74-a6a8-675fe9fac31f`
  admitted `2b53c5d5` (S108 and S146–S148) at 0% traffic. Build
  `75cc1c9b-0bac-48de-a762-ef3a39dbbbf6` succeeded at 2026-10-01T19:11:40Z. Its first recovery
  assurance failed on a cold first render; a read-only diagnostic canary on the 0% recovery target
  `pmi-kc-app-recovery-98f7e74373454b74` passed all 13 routes and the same-run resume passed.
  Candidate receipt `06c73cc7-4a80-4229-925f-f0478e3300de` issued 2026-10-01T19:17:43.559Z;
  promotion verified 19:18:35.092Z; observation two checkpoints in 414,515 ms, 312 of 312
  records, zero candidate 5xx. Eleven readback sections, none unverified, at
  2026-10-01T19:27:07Z.
- **Production, second run:** run `729d5716-bc5e-4e61-9932-c9107d1954f2` admitted `1402e51b4828d407f990a675f16e6a7ba47afb7b` (S149–S151). Build `a3736e14-99d5-428f-bc0c-74673f48cdc1`
  succeeded at 2026-10-01T22:09:48.058Z. Its first recovery assurance failed on a cold first render (a read-only diagnostic canary on the new clone first reached the Dashboard's 30-second bound, then a warm pass rendered all 13 routes) and the same-run resume passed; the smoke, configuration, domains and candidate assurance passed first time, and the observation passed at 419,630 ms, 0.37 s inside the 420,000 ms evidence deadline. Before it, run `0aa79bfe-784c-47d2-915a-0cbf0b2032be` carried the same code at `19d4590a` (build `6103f767-8a80-4a02-865a-1f6bea8fa9d2`): after cold-start resumes at recovery assurance and at the candidate smoke (one 504 at the 60-second request timeout), it promoted at about 21:12Z, and its observation's final checkpoint could not finish the reconciliation and runtime readback before the deadline (13-route canary 114.8 s, all 2xx, zero candidate 5xx). It rolled back to `pmi-kc-app-recovery-0aa79bfe784c47d2` and the watcher verified the rollback after a passing read-only canary. PR #116 recorded the failure; the checkpoint was archived byte-for-byte as superseded by `1402e51b`, and the unused admitted run `c238e7e0` (nothing dispatched) was preserved. Before that, a permit prepared for the rolled-back `19d4590a` (run `2b6e6fc8`) was refused at preflight because the watcher blocks a rolled-back SHA; nothing was admitted or dispatched, and the next `--prepare` (run `c238e7e0`, for `1402e51b`) replaced it. Candidate receipt `0917204b-1fb4-4e62-8989-f97273ef9e8e` issued
  2026-10-01T22:14:46.913Z; promotion verified 2026-10-01T22:15:27.458Z; observation two checkpoints in 419,630 ms,
  312 of 312 records, zero candidate 5xx. Eleven readback sections, none
  unverified, at 2026-10-01T22:22:18Z: canonical and tagged `/api/version` name `1402e51b4828d407f990a675f16e6a7ba47afb7b` / `pmi-kc-app-rmuq2qvcc-8074bfd97707`; 100%
  traffic; Production/Live; `ASK_DEMO_MODE=false`; `LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED=false`;
  the managed runtime identity; eleven Space maps; four secret bindings; exactly one candidate
  authorized domain; one maximum instance.
- **Production, bounded live check** (2026-10-01T22:22:51.669Z, `scripts/check-production-ai-history.ts`, the
  managed owner-admin profile, exact serving revision): version verified before and after; 4 questions asked (limit five), 4 answered and 4 saved to history, 4 model calls in the question window (at most one per question); after a fresh browser context the history listed 3 of the three new conversations and reopened 2 stored turns, all labelled historical, with 0 model calls; one structured saved question was saved, pinned and unpinned and stayed listed, with 0 model calls; one current run answered through `stored_plan` with 0 model calls and 1 `stored_plan` log line, keeping the earlier answer; requests: 101 reads, 4 questions, 8 history writes, 3 saved-question writes, 1 run and 0 refused; no other write left the browser.

## Acceptance map

| Check     | Evidence                                                                                                                                     | Environment                                | Result                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| AC-S146-1 | Composer first; answers and follow-ups below it in order at desktop and 390 px, on both sides of the 760 px breakpoint                       | Unit; compiled browser                     | Pass                                                                                     |
| AC-S146-2 | The captured request carries only the question, conversation and operation id; no process picker, detection or run start on the Dashboard    | Unit; E2E                                  | Pass                                                                                     |
| AC-S146-3 | Composer renders while the queue read is pending or failed; a failed request keeps the input and recovers on Retry                           | Unit                                       | Pass                                                                                     |
| AC-S146-4 | A new conversation keeps the earlier one; mounting and reopening send no question and no model request                                       | Unit; backend; compiled browser            | Pass                                                                                     |
| AC-S147-1 | Five panels absent from the rendered Dashboard; Anticipated work in Internal Processes beside Start run; setup status in Connections         | Unit; compiled browser                     | Pass                                                                                     |
| AC-S147-2 | No Dashboard entry point retained beyond the AI workspace, history, saved questions and the compact queue                                    | Unit                                       | Pass (none retained)                                                                     |
| AC-S147-3 | Only the signed-in user's eligible pending items, once each, with view versus approve authority and links                                    | Unit                                       | Pass                                                                                     |
| AC-S147-4 | Empty, partial and unavailable states distinct; no fabricated count; a failed queue read never blocks asking                                 | Unit                                       | Pass                                                                                     |
| AC-S148-1 | A completed turn reopens after reload and in a later session with its order, links and as-of, from the server                                | Backend; E2E; compiled browser; production | Pass; production reopened 2 stored turns after a fresh browser context                   |
| AC-S148-2 | Another account, guessed or spoofed ids reveal nothing (404); account switch discards responses; narrowed access hides records               | Unit; backend; E2E                         | Pass                                                                                     |
| AC-S148-3 | Listing and opening make zero model calls (counted); paging beyond 20 without duplicates; failed reads distinct from empty                   | Unit; backend; E2E; production             | Pass; production reopen window read 0 model calls                                        |
| AC-S148-4 | Failed save retries the same answer once with no inference; failed and interrupted turns never complete; late answers never move newer turns | Unit; backend                              | Pass                                                                                     |
| AC-S149-1 | Save from history, pin, and reopen the original answer in a later session with no model call                                                 | Backend; E2E; compiled browser; production | Pass; production save and pin with 0 model calls                                         |
| AC-S149-2 | Unpin keeps the item; repeated save and pin create nothing new; a failed save or pin is never shown as durable                               | Unit; backend; production                  | Pass; production unpin kept the item listed                                              |
| AC-S149-3 | Saved follow-up keeps its merged plan; relative periods re-evaluate, fixed periods stay, historical ranges unchanged                         | Unit; backend; E2E                         | Pass                                                                                     |
| AC-S149-4 | Open and Run are distinct; navigation runs nothing; a run adds a `rerun_of` turn; items private to their user                                | Unit; backend; E2E                         | Pass                                                                                     |
| AC-S150-1 | Zero model calls when opening, listing, saving and pinning: counted seams and bodyless production logs                                       | Unit; backend; production                  | Pass; production logs: 0 model calls on reopen, 0 on save and pin                        |
| AC-S150-2 | Stored-plan rerun with no interpreter or narration call matches the data layer's fresh answer                                                | Unit; backend; E2E; production             | Pass; production current run via `stored_plan`, 0 model calls                            |
| AC-S150-3 | Every current run re-executes; reopened answers keep their range; current runs record their actual range, as-of and coverage                 | Unit; backend                              | Pass                                                                                     |
| AC-S150-4 | Unsupported plans asked again and labelled; one model call per operation; failed, partial and denied reads distinct                          | Unit; backend                              | Pass; cross-instance window recorded below                                               |
| AC-S151-1 | Record identities, filters and counts checked against the data layer for lease-date, own-work, approvals and follow-up questions             | E2E; backend; production                   | Pass; production answers checked by structure only                                       |
| AC-S151-2 | Persistence, interruption, duplicate, paging, rollover, invalidation and current-run failure on controlled data only                         | Unit; backend; E2E                         | Pass                                                                                     |
| AC-S151-3 | Serving revision and configuration confirmed, assurance passed, the bounded live check passed within its limit                               | Production                                 | Pass; readbacks and the bounded live check passed on `pmi-kc-app-rmuq2qvcc-8074bfd97707` |
| AC-S151-4 | This map, the corrections and every unverified seam; registry rows distinguish implemented, tested and live-verified                         | Records                                    | Pass                                                                                     |

## Acceptance ledger (AF-01 to AF-70)

Each entry gives the result, the environment, the evidence and the remaining gap. "No
(unverified)" means not exercised; the missing evidence is named. Production cells come from the
two release runs' readbacks and the owner's bounded live check (2026-10-01).

### A. Delivery, records, run discipline

- **AF-01** Yes · Git, GitHub. `git merge-base --is-ancestor` holds on `main` for `87d6fd7c`,
  `fe78b0c9`, `129c833e`, `85524308`, `404abdf3`, `b7bf7b14`, `b9d3d1d7`, `6cafaecb`, `d5b6967b`
  and `50801b7b`. Each PR merged at its gated head with `--match-head-commit`: #111 `87d6fd7c`,
  #112 `0367bb5e`, #113 `ea9fdb43`, #115 `d5b6967b`, and docs-only #114 `de36d59f` and #116
  `50801b7b` (the rollback record). This map's docs-only records PR merges the same way after
  the docs gates and exact CI. Independent verification (2026-10-02): the docs-only heads #114,
  #116 and #117 merged after the docs gates and exact CI, not the full gate named in AF-09; the
  full gate then passed on each exact head (AF-09). Gap: none.
- **AF-02** Yes · Production. Canonical traffic is 100% on `pmi-kc-app-rmuq2qvcc-8074bfd97707`; canonical and tagged `/api/version` name `1402e51b4828d407f990a675f16e6a7ba47afb7b` (PR #116's docs-only rollback record on top of PR #115's `19d4590a`), which descends from every batch 004 code merge; candidate receipt `0917204b-1fb4-4e62-8989-f97273ef9e8e`. The docs-only records PR does not deploy. Gap: none.
- **AF-03** Yes · Production. Interim run 98f7e743 and run 729d5716 each passed candidate assurance, receipt-bound promotion and observation (two checkpoints; 414,515 ms and 419,630 ms against the 420,000 ms evidence deadline; all records matched); eleven readback sections matched with none unverified (19:27:07Z and 2026-10-01T22:22:18Z); the bounded live check passed on the exact serving revision. Between them, run 0aa79bfe carried the same code and rolled back verified when its observation could not finish inside that deadline. Gap: none.
- **AF-04** Yes · Unit; full gate. The one correction after a slice landed (the rehearsal's
  history replay read) has `tests/unit/s148-query-replay-mode.test.ts`, which fails on `0367bb5e`
  and passes on `ea9fdb43`; the full gate passed on `ea9fdb43`. The live check's fresh-context
  correction has a source test in `tests/unit/s151-live-check.test.ts` that fails on `b7bf7b14`
  and passes on `d5b6967b`, where the full gate passed. The S148 UI test race fails every time
  with a 40 ms animation frame before its fix and passes after it (`d5b6967b`). The pre-commit
  corrections are
  covered by the S148 tests that pin them (stripped references, failed-list retry, lint). Gap:
  none.
- **AF-05** Yes · Records. The S146–S151 registry rows, loop-state, status, plan, facts and this
  map name each suite's commit and PR, its tested environments and results, and what the
  production readbacks and live check verified; `npm run verify:context-freshness`, prettier and
  the pinned doc tests pass. Gap: none.
- **AF-06** Yes · Records. Every No (unverified) cell is listed under Unverified seams. Gap: none.
- **AF-07** Yes · Git. Only batch 004 rows change in the registry; no other suite, queue row or
  earlier evidence is reopened (S95 and the Dashboard part of S87 stay superseded, S88–S93/S101
  untouched). Gap: none.
- **AF-08** Yes · Run log. No owner question was asked; the owner's only message during the run
  directed an interim no-downtime release for a client call, recorded in loop-state. Gap: none.
- **AF-09** Yes · Local gate. `bash scripts/verify.sh` and `npm run test:e2e:core` passed on each
  merge head's exact commit: `87d6fd7c` (17:34–17:48 UTC), `0367bb5e` (18:02–18:17), `ea9fdb43`
  (18:27–18:42), `d5b6967b` (20:24–20:37); logs in `~/pmi-kc-work/logs/b004-*`. On `b7bf7b14` and
  on `d5b6967b` the first run failed one pre-existing backend-lane test (an S113 journey, then an
  S145 Focus journey at 5,328 ms against the 5,000 ms default) and one unchanged rerun of the full
  gate passed; `b7bf7b14` and `6cafaecb` were superseded before merge. The docs-only merge heads
  `de36d59f` (#114), `50801b7b` (#116) and `2316dbb7` (#117) merged after the docs gates and exact
  CI only; independent verification then ran the full gate on each exact commit on 2026-10-02
  (logs `~/pmi-kc-work/logs/v004-g-*`) and each passed (`2316dbb7` on its third run; the first two failed only the pre-existing S113 counteroffer journey listed under Unverified seams). Their trees are those
  of the released `2b53c5d5` and `1402e51b` and of the final `6c2d48ed`. Gap: none.
- **AF-10** Yes · Release checkout. `npm run verify:dependencies` passed (0 vulnerabilities) on
  `2b53c5d5` at admission of run 98f7e743, on `19d4590a` at admission of run 0aa79bfe, on
  `1402e51b` at admission of run 729d5716, and on the final `main`. Gap: none.
- **AF-11** Yes · GitHub. PR CI was green on every merged PR head (it failed once on the
  intermediate S151 head `6cafaecb`, the S148 test race above, which was never merged); push
  CI was green on `a4b6f2f6`,
  `c6b44ef0`, `2b53c5d5` (run 36908787688, released by 98f7e743), `d1055b7f`, `19d4590a` (run 36922955335) and `1402e51b` (run 36929714817, released by run 729d5716) and the docs-only records merge, checked after it lands.
  Gap: none.
- **AF-12** Yes · Git. `git diff cd4407c0 1402e51b --name-only` touches no protected path
  (`firestore.rules`, `lib/integrations/action-gate.ts`, `lib/auth/**`, the registry seed,
  `scripts/check-budget-guard.mjs`, `infra/budget-guardrail/**`, `scripts/auth/**`), no provider
  adapter, no `ASK_DEMO_MODE` or `LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED` setting, no model
  selection, `READ_POSTS` or the release assurance guard
  (`lib/production-assurance/guarded-browser.ts`, `lib/auth/canary-policy.ts`). Gap: none.
- **AF-13** Yes · Production readback at 2026-10-01T22:22:18Z: 100% traffic on `pmi-kc-app-rmuq2qvcc-8074bfd97707`; Production/Live with `ASK_DEMO_MODE=false` and `LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED=false`; the managed runtime identity, eleven Space maps and four secret bindings, unchanged from the interim revision; exactly one candidate authorized domain (`cand-rmuq2qvcc-8074bfd97707`). Gap: none.

### B. S146 AI-first workspace

- **AF-14** Yes · Unit; compiled browser. The composer is first and answers render below it in
  order (`AC-S146-1` tests); the browser smoke saw the question box before any turn and answers
  below it at 1360 px and 390 px, on both sides of the 760 px breakpoint. Independent
  verification found that the smoke check of that name tests only the answered state and that
  its 390 px pass measures overflow only; a direct Chromium measurement on 2026-10-02 confirmed
  the position at 1360, 761, 759 and 390 px (Independent verification). Gap: none.
- **AF-15** Yes · Unit; E2E. The captured request body holds only `question`, `conversation` and
  `operationId`; the real route answers it through the harness server. Gap: none.
- **AF-16** Yes · Unit. No process picker, suggestion, detection or run start on the Dashboard;
  ConsoleView reads no process definitions; Start run stays in Internal Processes. Gap: none.
- **AF-17** Yes · Unit; E2E. Follow-ups send the server context and keep answer links and the
  per-source as-of, coverage and currency; a reopened conversation continues its stored context.
  Gap: none.
- **AF-18** Yes · Unit; compiled browser. A new conversation keeps the earlier one reopenable with
  no question sent; reopening from history reads stored turns only. Gap: none.
- **AF-19** Yes · Unit. The composer renders while the attention read is pending and after it
  fails; history and saved lists stream in their own state. Gap: none.
- **AF-20** Yes · Unit. A rejected request fails only its turn, keeps the typed question and
  recovers on Retry; nothing stays pending. Gap: none.
- **AF-21** Yes · Unit; compiled browser. Zero requests on mount (measured); opening history and a
  saved answer sends only the conversation GET. Gap: none.
- **AF-22** Yes · Unit; E2E. A policy question on the Dashboard continues to the knowledge answer
  with its sources (`tests/unit/ask-form.test.tsx`); through the real server, `/api/ask` answers a
  supported question with a cited Verified Source (`tests/e2e/ask.e2e.test.mjs`, in every
  `test:e2e:core` gate). Process definitions and Start run stay in Internal Processes. Gap: none.
- **AF-23** Yes · Full gate. The per-lease dashboard, Focus view and email draft editor suites
  passed unchanged on every merge head. Gap: none.

### C. S147 relocation and attention queue

- **AF-24** Yes · Unit. The five named panels are absent from the rendered Dashboard (not hidden
  or collapsed). Gap: none.
- **AF-25** Yes · Unit; compiled browser. Anticipated work computes on request in Internal
  Processes beside Start run with its default-notice-rule caption, with the same permission
  checks; setup status lives in Connections and the Internal Processes cards. Gap: none.
- **AF-26** N/A · No Dashboard entry point was retained beyond the AI workspace, history, saved
  questions and the compact queue. Gap: none.
- **AF-27** Yes · Unit. Only the signed-in user's eligible, accessible pending approval and
  renewal-review items, with view versus approve authority; no setup, planning or catalog
  entries. Gap: none.
- **AF-28** Yes · Unit. An approval supplied by two sources appears once. Gap: none.
- **AF-29** Yes · Unit. Empty, partial and unavailable are distinct; no fabricated count,
  including for a user without renewals scope; a queue failure never blocks asking. Gap: none.
- **AF-30** Yes · Unit. Inline Approve uses the existing button and server re-check; the queue
  refreshes after an approval; no new approval behaviour. Gap: live approval not exercised.
- **AF-31** Yes · Full gate; production canary. Renewal views, staff work, process content and
  administration routes render unchanged (13 canary routes on both release candidates). Gap: none.

### D. S148 durable history

- **AF-32** Yes · Backend; E2E; compiled browser; production. A later session reopens a turn with its order, links and as-of (`tests/firestore/s148-assistant-history.test.ts`, `tests/e2e/ai-history.e2e.test.mjs`, the browser smoke's reload). Production: after a fresh browser context the history listed 3 of the three new conversations and reopened 2 stored turns, all labelled historical. Gap: none.
- **AF-33** Yes · Unit; backend. History is stored through the authenticated routes (no browser
  storage); verification accounts are refused (403) with nothing written, and the UI says history
  is not saved for them. Gap: none.
- **AF-34** Yes · Unit; backend; E2E; compiled browser. Another account, a guessed id or a spoofed
  operation id reveals nothing (404); the workspace is keyed by the signed-in user and discards
  responses for another sign-in; narrowed access hides stored records and their references.
  Gap: none.
- **AF-35** Yes · Backend; production. Listing and opening make zero model calls and rerun nothing (counted seams in unit and backend). Production: 0 model calls in the reopen window (bodyless logs). Gap: none.
- **AF-36** Yes · Unit; compiled browser. A failed save shows Retry saving, which resends the same
  answer once with no new question request. Gap: none.
- **AF-37** Yes · Unit; backend. Failed and interrupted turns are stored and shown as such, never
  as answers. Gap: none.
- **AF-38** Yes · Backend; unit. A late answer never moves a newer turn or the conversation's
  state; concurrent sessions append distinct turns; a late answer never clears newer typing.
  Gap: none.
- **AF-39** Yes · Backend; unit; E2E. Pages beyond 20 are reachable without duplicates; a failed
  read is shown as failed, not empty. Gap: none.
- **AF-40** Yes · Unit. The S138 and S110 static bans pass unchanged; the route imports only the
  history read module; it stays in the verification read set; both release assurances stayed
  mutation-free. Gap: none.

### E. S149 saved and pinned questions

- **AF-41** Yes · Backend; E2E; compiled browser; production. Save from history, pin, and reopen the original answer in a later session with no model call (`tests/firestore/s149-s150-saved-questions.test.ts`, E2E, the browser smoke's reload). Production: one question saved, pinned and unpinned with 0 model calls. Gap: none.
- **AF-42** Yes · Backend; E2E; production. Unpinning keeps the item, its conversation and answer (backend, E2E). Production: the unpinned item stayed listed. Gap: none.
- **AF-43** Yes · Backend; unit; compiled browser. Repeated save and pin create nothing new; a
  failed save or pin is never shown as durable; retries regenerate nothing. Gap: none.
- **AF-44** Yes · Unit; compiled browser. Open last answer and Run for current results are distinct;
  opening, pinning, loading the Dashboard and signing in never run a saved question. Gap: none.
- **AF-45** Yes · Unit; backend; E2E. A saved follow-up keeps its merged plan (subject, assignee,
  people, record references). Gap: none.
- **AF-46** Yes · Unit; backend. Relative periods re-evaluate at run time on the America/Chicago
  business calendar, named months stay fixed, the date field is kept, each result shows its
  concrete range, and historical ranges never change. Gap: none.
- **AF-47** Yes · Backend; E2E. A run adds a `rerun_of` turn and never changes the earlier answer;
  saved items are private to their user. Gap: none.
- **AF-48** Yes · Code review; Git. No scheduler, polling, notification or background execution
  exists for saved questions. Gap: none.

### F. S150 reuse and structured rerun

- **AF-49** Yes · Unit; backend; production. Production bodyless logs read 0 model calls while opening and listing history and 0 while saving and pinning. Gap: none.
- **AF-50** Yes · Unit; backend; E2E; production. A stored-plan rerun lists the same ids and totals as the data layer's own answer (unit BEH-S150-1, E2E). Production: one current run answered through `stored_plan` with 0 model calls and 1 `stored_plan` log line. Gap: none.
- **AF-51** Yes · Unit; backend. Every current run re-executes; a changed range, access or source
  state is read again, never served from a stored answer. Gap: none.
- **AF-52** Yes · Unit; backend. Reopened answers keep their original time, range and coverage;
  current runs record their actual range, as-of and coverage. Gap: none.
- **AF-53** Yes · Unit; backend. Knowledge, mixed, processes, maintenance, communications and
  incomplete plans are refused by the executor and asked again through the existing path,
  labelled as newly generated; a clarification still asks. Gap: none.
- **AF-54** Yes · Backend; unit; production readback. Duplicate delivery of one question operation
  makes one model call and of one run executes once; retried saves never regenerate; a completed
  operation replays from history with zero model calls. The join is per instance, and the serving
  revision's readback shows one maximum instance (`autoscaling.knative.dev/maxScale` 1). Gap: the
  brief two-revision window during a promotion (see Unverified seams).
- **AF-55** Yes · Unit; backend; compiled browser. Failed, partial and denied reads are distinct
  from history and from a true empty result. Gap: none.
- **AF-56** Yes · Unit; backend. The executor runs only a server-loaded, schema-valid plan for the
  allowlisted subjects; no client plan is accepted and no write, approval, send or provider effect
  exists on the path. Gap: none.
- **AF-57** Yes · Unit; production. `assistant_conversation`, `assistant_history` and replay lines
  carry counts and outcomes only. Production: the live check counted `model_call`, `assistant_conversation` and `assistant_history` lines by name and outcome only. Gap: none.

### G. S151 integrated validation

- **AF-58** Yes · Unit; E2E; production. Record ids and totals are compared, never wording: the
  lease-date question ("What leases are due this month?") reruns to the same records as a new
  question for the same data and moment, and moves to the next month's records under a controlled
  clock (`tests/unit/s150-stored-plan.test.ts`); the own-work question and a saved follow-up rerun
  to the same ids and totals as a fresh answer through the real server
  (`tests/e2e/ai-history.e2e.test.mjs`); approvals answers list exactly the approvals read's items
  with their approve authority (`tests/unit/s138-dashboard-conversation.test.ts`, unchanged and
  passing in every gate). Production: the lease-date, follow-up, own-work and approvals questions answered on live data, compared by structure only (no customer data leaves the check). Gap: record-level parity on live data is not printed, by design.
- **AF-59** Yes · Unit; backend; compiled browser. Failed history save with retry, model failure,
  interrupted response, late response, second session, failed history load, failed pin write,
  repeated delivery and paging all pass on controlled data. Gap: none.
- **AF-60** Yes · Backend; unit. Month rollover under a controlled clock and a changed source
  record (denied and empty reads) pass with no production record changed. Gap: none.
- **AF-61** Yes · Unit; compiled browser. A failed current run keeps the earlier answer historical
  and is labelled as failed, never current. Gap: none.
- **AF-62** Yes · Full gate; production canary. Relocated links and the comprehensive lease view,
  Focus view and email-draft navigation pass. Gap: none.
- **AF-63** Yes · Unit; compiled browser. Approval and history read failures never block asking;
  switching users leaks nothing; no new sign-in, activation or approval step. Gap: none.
- **AF-64** Yes · E2E; compiled browser. The real interface, server, data services and
  persistence are exercised end to end on the emulator (deterministic interpretation stands in
  for the model). Gap: live model interpretation is exercised only by the live check.
- **AF-65** Yes · Production. Readbacks at 2026-10-01T22:22:18Z confirmed the serving revision `pmi-kc-app-rmuq2qvcc-8074bfd97707` and its configuration; the bounded live check passed on it: version verified before and after; 4 questions asked (limit five), 4 answered and 4 saved to history, 4 model calls in the question window (at most one per question); after a fresh browser context the history listed 3 of the three new conversations and reopened 2 stored turns, all labelled historical, with 0 model calls; one structured saved question was saved, pinned and unpinned and stayed listed, with 0 model calls; one current run answered through `stored_plan` with 0 model calls and 1 `stored_plan` log line, keeping the earlier answer; requests: 101 reads, 4 questions, 8 history writes, 3 saved-question writes, 1 run and 0 refused; no other write left the browser. Gap: none.
- **AF-66** Yes · Production; Git. The live check created only the owner's own conversation and
  saved-question records; no synthetic customer record, client message or provider effect; no
  credential, private value or conversation content in Git or logs. Gap: none.

### H. Release and accessibility

- **AF-67** No (failed) · Release. Batch 004 shipped in two candidates by owner direction on
  2026-10-01 (run 98f7e743 for S146–S148, run 0aa79bfe, rolled back verified, then 729d5716 for S149–S151); runs never overlapped and
  each release checkout was clean at its admitted SHA. Gap: by owner direction.
- **AF-68** Yes · Compiled browser. No horizontal overflow on the Dashboard (empty, with answers,
  with a restored conversation and the rename form), Internal Processes with anticipated work,
  and the history and saved navigation at 390 px and desktop. Gap: none.
- **AF-69** Yes · Unit; compiled browser. Turn, save, pin and run outcomes are announced in the
  polite region; focus moves to the answered turn unless the person is typing, and to the opened
  turn on reopen. Gap: screen reader verdict NOT RUN.
- **AF-70** Yes · Unit; backend. The S110 and S138 static bans and the release assurance guard
  pass unchanged; verification-account sessions write no history (403 and no documents). Gap:
  none.

## Independent verification — 2026-10-02

A separate pass re-derived the run's claims from Git, CI, receipts, Cloud Run, Cloud Logging and
the tests, and repaired what it found. It asked no live question (the run used four of the owner's
five) and wrote nothing in production.

- **Git and CI.** Every slice and fix commit descends from `origin/main`, and each PR merged at its
  reviewed head (the merge commit's second parent). PR CI is green on every merged head, and push CI on
  the released `2b53c5d5` and `1402e51b`. The four code heads' full-gate logs show `verify_exit=0`
  and `e2e_exit=0` (the S151 head after one rerun) with a zero-finding production audit. The
  docs-only heads (#114 `de36d59f`, #116 `50801b7b`, #117 `2316dbb7`) had merged on the docs gates
  and exact CI only; the full gate then passed on each exact commit (`2316dbb7` on its third run; the first two failed only the pre-existing S113 counteroffer journey listed under Unverified seams). Their trees
  equal the released `2b53c5d5` and `1402e51b` and the final `6c2d48ed`.
- **Production.** Readbacks at 2026-10-02T08:12:25Z matched in every section with none unverified:
  `1402e51b` / `pmi-kc-app-rmuq2qvcc-8074bfd97707` at 100%, Production/Live, Demo=false,
  Sheet=false, the managed identity, eleven Space maps, four secret bindings, the reviewed
  fingerprint and exactly one candidate domain. The checkpoint is `complete`, the permit is
  `consumed`, the revision's maximum scale is 1, and the captured predecessor
  `pmi-kc-app-recovery-0aa79bfe784c47d2` serves `2b53c5d5` with Sheet=false. A read-only watcher
  dry run reports `documentation_only` for `6c2d48ed`.
- **Live check from Cloud Logging** (bodyless lines and request logs, 2026-10-01T16:50Z to
  2026-10-02T08:15Z, counts only). In the live check's 22:20Z window the headless owner profile
  posted 4 questions and the service logged exactly 4 `assistant.interpret` model calls, 4 history
  begins and 4 finishes, 1 reopen, 1 save, 2 pin changes and 1 `stored_plan` run, with no further
  model call. Apart from 4 session sign-ins, no other headless request in the window wrote
  anything. Four other Dashboard questions (19:00Z to 20:10Z) and ordinary renewal-desk actions came
  from an ordinary browser, that is, people using the app, not run tooling.
- **Behaviour on the final tree.** `tests/e2e/ai-history.e2e.test.mjs` passed with the emulator (4
  passed; the no-emulator case skipped) and the S151 browser smoke passed 28 of 28 checks. A direct
  Chromium measurement on the harness (an uncommitted script) found both answers below the question
  box, in its column and in order, with no side panel or overflow, at 1360, 761, 759 and 390 px; the
  history column sits beside the main column at 761 px and below it at 759 px.
- **One falsification per suite** at `6c2d48ed`, each run clean, then mutated, then reverted:

  | Suite | Mutation                                       | Cited test                                          | Clean     | Mutated  |
  | ----- | ---------------------------------------------- | --------------------------------------------------- | --------- | -------- |
  | S146  | the question request carries `process_id`      | `tests/unit/s146-ai-first-dashboard.test.tsx`       | 8 passed  | 2 failed |
  | S147  | every failed attention feed reads as all clear | `tests/unit/s147-attention-queue.test.ts`           | 8 passed  | 2 failed |
  | S148  | a later failure overwrites a completed turn    | `tests/firestore/s148-assistant-history.test.ts`    | 15 passed | 1 failed |
  | S148  | the owner key and owner checks are removed     | `tests/firestore/s148-assistant-history.test.ts`    | 15 passed | 1 failed |
  | S149  | a repeated pin is no longer a no-op            | `tests/firestore/s149-s150-saved-questions.test.ts` | 12 passed | 1 failed |
  | S150  | running a saved question asks the model again  | `tests/firestore/s149-s150-saved-questions.test.ts` | 12 passed | 3 failed |
  | S151  | the live check allows a sixth question         | `tests/unit/s151-live-check.test.ts`                | 11 passed | 2 failed |

- **Records corrected.** Four summary lines said no traffic rollback occurred; run 0aa79bfe's
  verified rollback now appears beside them. The refused permit for `19d4590a` (run `2b6e6fc8`) is
  recorded above. The B-AUTH2 records said the probe was running; it stopped at its first failure
  16.06 hours after enrollment, and the owner re-enrolled WSL CLI/ADC on 2026-10-02.
- **S33 live target.** Removing the Dashboard's process step also removed S33's process-driven
  live-target affordance: three S33 AskForm tests were replaced by an S146 assertion that no
  live-target read is sent. `/api/ask/live-target` remains, with no caller in the application.
- **Outside batch 004.** With the emulator, the whole E2E suite also fails 13 tests in four
  write-flow files (approval queue, capture, process definitions, work accountability): the
  Live-read-only harness refuses their writes (409). Neither those files nor the harness changed in
  batch 004, and `test:e2e:core` skips them; a separate task covers them.

## Unverified seams

- Cross-instance duplicate delivery: the in-flight join is per instance, and production runs one
  maximum instance (revision readback). Only during a promotion's brief two-revision window could a
  duplicate reach a second instance before the first answer is saved and make one more model call;
  replay from history covers every later duplicate. Not exercised.
- Two pre-existing backend-lane tests failed once each in S151's local gates and passed on one
  unchanged rerun of the full gate on the same head: the S113 counteroffer journey
  (`tests/firestore/s113-sheet-route.test.ts`, the notice-safety generation check refused a draft
  step) on `b7bf7b14`, and the S145 Focus journey (`tests/firestore/s145-focus-mounted-route.test.ts`,
  5,328 ms against vitest's 5,000 ms default; 3,094–4,736 ms in the seven other runs) on
  `d5b6967b`. Neither file nor the code it runs is touched by batch 004, both passed in CI, and
  both are flagged for a separate fix outside this batch. Independent verification saw the S113
  journey fail twice more on `2316dbb7` (2026-10-02), both times at the default-timeout wait for
  the creation confirmation after the draft preview (line 3215; line 3231 the first time). The
  file passed 27 of 27 alone on that commit, and the third full gate passed. Every backend file
  uses its own emulator project, so batch 004's new files cannot clear its data.
- The knowledge answer (`/api/ask`) inside the live check: the check's guard refuses it, so live
  knowledge generation is covered only by tests and earlier evidence.
- Record-level parity on live data: the live check reports answers by structure only, so no
  customer data leaves it; record ids, filters and counts are compared with the data layer on
  controlled data (unit and E2E).
- Release observation margin: run 729d5716 passed at 419,630 ms against the fixed 420,000 ms
  evidence deadline (0.37 s to spare) and run 0aa79bfe missed it. The final checkpoint's 13-route
  canary spends 16–22 s each on the Dashboard, renewal desk, renewal workspace, Internal Processes
  and notifications, all reading live sources, so it leaves little room for the reconciliation
  and runtime readback. These routes were as slow before batch 004. Changing the deadline or the
  canary needs an owner decision; speeding up those routes is outside this batch.
- Live inline approval (AF-30): not exercised, because it would be a business write; the server
  re-check and the queue refresh are covered by unit tests.
- Human usability, screen reader and full-page zoom verdicts: NOT RUN.
