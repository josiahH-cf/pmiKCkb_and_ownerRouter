# Renewal Focus batch 003 validation — 2026-10-01

S145 evidence map for S142–S144, with the FV-01 to FV-102 acceptance ledger from the 2026-10-01
acceptance run. Each cell names the environment that produced it. "Unit" is the real
`RenewalWorkspace` under jsdom, with a stateful route fake that applies the real planner and
revision fence. "Backend" is the Firestore emulator through the real staff-record store, or
through the real workspace route handler. "Compiled browser" is the real application on the local
rehearsal (Demo + live read-only, which refuses every write) in headless Chromium. "Production"
cells come only from run `ab803f8a`'s release readbacks and the read-only production Focus check. Human verdict: NOT RUN — no human
observer.

## Tested environments

- **Code:** S142 merged at `f5368c2f` (PR #101). S143/S144 merged at `884b7759` (PR #102). S145
  merged at `752d7dda` (PR #103) with tests, the compiled-browser smoke and two corrections to the
  S143/S144 pane. The acceptance run merged PR #105 at `ef7e0956`: five pane repairs
  (`2fdcbbe5`), the remaining verification, the read-only production Focus check and fixes to the
  two check scripts (`2f1dc347`). PR #104 (`f449520e`) patched a Hono production advisory found by
  the run's fresh audit. Each merged head passed the full `bash scripts/verify.sh` on its exact
  commit, including a fresh production dependency audit (`npm audit --omit=dev`: 0
  vulnerabilities), and `test:e2e:core` (31 passed, 18 skipped), and exact PR CI. S142 ran 7,670
  unit and 236 backend tests; S143/S144 ran 7,687 and 239; PR #103's head ran 7,707 and 239; PR
  #105's head ran 7,737 and 241.
- **Baseline:** the Full view was recorded at `6c806afe`, before any Focus change, for six fixture
  cases: three roles, a selected step, three sample leases and the layout without a cycle. The
  text of every Copy control was captured at `b1c6135c`, also before any Focus change, for five of
  those cases (`tests/fixtures/s145-copy-output-baseline.json`, sample data only).
- **Backend route path:** the E2E harness cannot carry step 4b. It drives `next dev` over HTTP
  with no browser, and its local-rehearsal descriptor reads live sources and refuses every write.
  So `tests/firestore/s145-focus-mounted-route.test.ts` renders the real workspace under jsdom and
  sends the pane's requests to the real `/api/lease-renewal/workspace` GET and POST handlers on the
  Firestore emulator, with the real role table in the capability check and the real revision
  fence. Seams left: the page loader's live RentVine and Sheet reads (a sample lease workspace
  stands in), the session cookie, and Next's HTTP layer (the handlers receive standard requests).
- **Compiled browser:** `npm run dev` on the WSL host on 2026-10-01 with a demo Editor session,
  each run on a fresh server. Before the acceptance run: the guide and desk smokes and a first
  Focus run used `d98f3fce` (00:42–00:51 UTC), the desk comparison used the pre-batch-003 code
  `b6c9a1e4` (00:53–01:00), and the desk smoke and Focus smoke used `82344c39` (01:00–01:13). In
  the acceptance run the guide and desk smokes used `2fdcbbe5` (09:26–09:34), and the Focus smoke
  and the production check's per-lease routine used `2f1dc347` (09:52–10:01), as did a
  read-only table-of-contents scroll probe (10:20–10:24, not committed). Reads used the
  approved `josiah@pmikcmetro.com` identity, whose CLI/ADC refresh `auth:ensure` verified. Both
  checks wait for the page's own reads to finish before recording a baseline, and they print
  structure only: no lease identifier, party, address or amount.
- **Production:** run `ab803f8a-4ffb-4568-9178-05ccb588a94c` released batches 002 and 003 at
  `2ec46806bda10e799025e9919a2c1b14b7be3a5a` / `pmi-kc-app-rmupi9ukm-9f056f091001` (100% traffic; promotion verified
  2026-10-01T12:46:30.426Z; observation passed two checkpoints in 392,911 ms with all 312 records
  matched). `scripts/check-production-focus.ts` ran at 2026-10-01T12:56:15Z on the canonical
  origin in the managed owner-admin profile behind the release request guard. Eleven independent
  readback sections matched, last at 2026-10-01T13:02:41Z.

## Fail-first

- On the single-view source (`6c806afe`), six of the seven round-trip tests fail on the missing
  switch. The seventh, the no-switch layout check, passes by design. The journey and server-rule
  files fail without the S142 projection. The recorded baseline passes on both sides.
- All 17 S143/S144 tests failed on `6530f51b` (S142 only), before the Focus view existed.
- S142's graph tests failed without the resolver. Its equivalence fixture shows that the
  extracted manual-lane predicates leave every summary and guidance output unchanged.
- The four earlier corrections, each reverted on its own in a scratch worktree at `76ba54c5`:
  - Reveal fix reverted: the round-trip test "returns every disclosure as it was after working
    through tasks in Focus" fails.
  - Completion wording reverted: the journey "puts unverified rent first and moves on when a late
    source refresh confirms it" fails.
  - Root-cause ordering in `action-graph.ts` reverted: the S143 outcome test fails on the missing
    unreadable-record statement.
  - Completed-renewal selection in `renewal-actions.ts` reverted: the same S143 test fails on the
    missing completed result.
- The acceptance-run repairs: with the new tests copied onto `76ba54c5`, exactly seven fail (FV-27,
  FV-36, FV-37, the branch-conflict explanation, FV-43/FV-73, FV-49 and FV-99/FV-64). The other 16
  pass there as verification of existing behavior. All pass on `2fdcbbe5`.

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
- **Acceptance run, pane (PR #105, `2fdcbbe5`):**
  - Rule diagnostics (FV-36, FV-37): a cycle, a missing prerequisite and the recorded owner/tenant
    conflict were reduced to "needs review in Full view". The pane now names the steps involved
    and lists every diagnostic under "Rules that need review".
  - Last task (FV-27): after the final completion, keyboard focus stayed in the finished task's
    controls. It now lands on the result line.
  - Completion record (FV-49): a completed staff renewal showed no control, so its existing Reopen
    action was out of reach in Focus. The pane now reveals the existing completion record.
  - Announcements (FV-99, FV-64): choosing a task, and a change to the chosen task's requirement
    from another person's save, were silent. Both are now announced in the polite region.
  - Page notices (FV-43, FV-73): failed supporting reads and the move-out notice were hidden in
    Focus. The pane now states both, in the Full view's own words.
- **Acceptance run, check scripts (PR #105, `2f1dc347`):** the Focus smoke read its free-text
  selector before initialising it; its Focus-task edit check could pick the message editor, which
  marks itself as needing review after any edit, so it now edits a staff record field and pins
  each field; and under tsx the production check's in-page signature needed an identity `__name`
  shim. The rehearsal found all three; none is in the application.

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
  offer. The optional comp preparation is saved from the pane, which then returns to the required
  outreach. A concurrent save delivered by refresh re-derives the next task without a submission.
  A late refresh that confirms the rent moves on with "Done", not "Recorded". After each journey,
  Full view shows the same records and summary label. No operation id was replayed.
- **Acceptance run (unit):** 20 verification cases and 3 diagnostic cases. They cover keyboard
  operation (Tab to the end of the page and once more around it without reaching hidden content,
  Enter on a task, Space on "Show this task in Full view"), the last-task focus, the completion
  record's Reopen through the
  existing route, announcements, unsaved input across a colleague's save and a late refresh,
  pending, invalid and lost-response saves (the same operation id recovers once), a tenant counter
  and a tenant decline walked to completion, the document packet, the lease-date confirmation (the
  same request body as Full view), the unsent Gmail draft (no workspace write and no send record),
  unknown, conflicting and verified rent, and the table of contents before and after a round trip.
- **Store (backend):** the S144 emulator test advances one confirmed, read-back record at a time
  to completion and reopening. A stale revision and a wrong cycle are refused, and a duplicate is
  replayed once. Each of these leaves the projection unchanged. A new cycle leaves the earlier one
  as history. Through the real route handler: typing without saving satisfied nothing and sent
  nothing; a double click sent one request, and the pane advanced only on the route's readback; a
  replay of the same operation returned `duplicate` with the revision and activity count
  unchanged; a reload showed the record in Full view and the next task in Focus; and a stale
  revision was refused (409) with the entry, the task and the store unchanged.
- **Full view preservation (unit):** for five role, lease and step cases, the Full view returns to
  the recorded baseline after entering and leaving Focus in both orders. The switch works from
  the keyboard. Disclosure state returns as it was after every task is chosen. Every Copy
  control's text equals the `b1c6135c` capture before and after a round trip and carries no Focus
  wording. Switching sends no request and causes no save, navigation or refresh. The layout
  without a cycle offers no switch and is unchanged.
- **Compiled browser, Focus (acceptance run, `2f1dc347`):** four live lease workspaces. On each,
  Full view was the default and Focus showed one task ("Verify contractual base rent"), hiding
  14–16 Full view elements. All 29 tasks were chosen in Focus. After pointer, keyboard and
  phone-width round trips, the Full view signature, including every disclosure, was unchanged; a
  scrolled Full view came back at the same position; the table of contents reached all five
  sections. Switching sent no lease-renewal request and no write, and caused no navigation and no
  page error. Neither view scrolled horizontally at 390 px, nor Focus at desktop width (the
  guarded routine below also checked the Full view at desktop width). An unsaved value
  survived in a Full view field on three leases and in a Focus task's staff record field on one
  (Focus, Full, Focus). The only console error predates switching: a 409 from the RentVine
  write-back status read during page load.
- **Compiled browser, production check routine (acceptance run, `2f1dc347`):** the per-lease
  routine of `scripts/check-production-focus.ts` ran on three live lease workspaces inside the
  real guarded browser (every non-GET and known state-changing GET refused before dispatch). All
  checks passed, including the desk return link, with zero mutation attempts and zero blocked
  requests. Only the exact-version readback and the managed profile differ in production.
- **Production Focus check (`2ec46806`, 2026-10-01T12:56:15Z):** `/api/version` matched the exact
  commit and revision before and after. On three live lease workspaces reached from the desk, Full
  view was the default and Focus showed a task or result, hiding 14–16 Full view elements. All 29
  tasks were chosen in Focus. Pointer, keyboard and phone-width round trips left the Full view
  signature unchanged; the scrolled position, URL and desk return link survived. Switching sent
  zero lease-renewal or write requests and caused no navigation or page error. Neither view
  scrolled horizontally at 390 px or 1440 px. Mutation attempts: 0; blocked requests: none.
- **Compiled browser, preservation:** the S111 guide smoke passed on `d98f3fce` and again on
  `2fdcbbe5`. It located 71 guide steps and preserved the desk view from desk to lease and back.
- **Compiled browser, desk smoke (not a batch 003 change):** the S82 desk smoke failed its 20 s
  interaction budgets on the rehearsal for both the pre-batch-003 code and the batch 003 code. On
  `b6c9a1e4` and `82344c39`, both attempts timed out waiting 20 s for the table. On `d98f3fce`, a
  sort took 22.5 s and a filter 22.2 s; on `2fdcbbe5`, a sort took 24.2 s and a filter 25.9 s.
  Desk render times were the same before and after: 2.8–32.1 s on `b6c9a1e4` and 2.7–29.8 s on
  `82344c39`. Batch 003 does not change the desk list loader.

## Acceptance map

| Check     | Evidence                                                                                                                                           | Environment            | Result                                                        |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------- |
| AC-S142-1 | Two joins blocked after the first shared prerequisite and ready after the second; reversed display order resolves prerequisites first              | Unit                   | Pass                                                          |
| AC-S142-2 | Alternatives and branches without phantom work; cycles, missing references, impossible conditions and unknown applicability diagnosed locally      | Unit                   | Pass                                                          |
| AC-S142-3 | Another actor, waiting effect, unreadable source, unrelated save and historical cycle stay distinct; stale, replayed and wrong-cycle saves refused | Unit; backend          | Pass                                                          |
| AC-S143-1 | Full view default; both switch orders return the recorded baseline; unsaved input kept; no navigation; desk return preserved                       | Unit; compiled browser | Pass, including unsaved input in a Focus task's staff field   |
| AC-S143-2 | One task with lease context, other ready tasks and all work by status; actions completed in the pane                                               | Unit; compiled browser | Pass                                                          |
| AC-S143-3 | No request, save or navigation from switching or choosing; waiting, blocked, unreadable and complete stay distinct; focus and announcements        | Unit; compiled browser | Pass                                                          |
| AC-S144-1 | Every applicable action maps to its existing control and route; the pane sends exactly the Full view request                                       | Unit; backend          | Pass; live writes not exercised                               |
| AC-S144-2 | Confirmed save advances on readback, survives reload and appears in Full view; independent work stays offered                                      | Unit; backend          | Pass                                                          |
| AC-S144-3 | Concurrent change, double click, ambiguous effect and Gmail return keep input and evidence meaning without replay or a send claim                  | Unit; backend          | Pass; no live Gmail draft created                             |
| AC-S145-1 | Graph cases plus the server-rule matrix over reachable planner states, roles and cycles                                                            | Unit                   | Pass                                                          |
| AC-S145-2 | Journeys across branches, failures, re-entry and concurrency; store lifecycle                                                                      | Unit; backend          | Pass; live staff-record saves not exercised                   |
| AC-S145-3 | Baseline, round trips, disclosures, copy output, keyboard and phone width; guide smoke                                                             | Unit; compiled browser | Pass; desk smoke budget failure is pre-existing (see Results) |
| AC-S145-4 | This map; serving readback required for any deployment claim                                                                                       | Unit; backend; browser | Local scopes pass; production readbacks and Focus check pass  |

## Acceptance ledger (FV-01 to FV-102)

Each entry gives the result, the environment, the evidence and the remaining gap. "No
(unverified)" means not exercised; the missing evidence is named. Production cells come from run
`ab803f8a`'s readbacks and the read-only production Focus check (2026-10-01).

### A. Delivery, records, run discipline

- **FV-01** Yes · Git, GitHub. `git merge-base --is-ancestor` holds on `main` for `6c806afe`,
  `6530f51b`, `d98f3fce`, every PR #103 commit (`82344c39`, `6bd240b6`, `76ba54c5`, `ffdca2f2`)
  and both PR #105 commits (`2fdcbbe5`, `2f1dc347`). Each PR merged at its gated head: #101
  `6530f51b`, #102 `d98f3fce`, #103 `ffdca2f2`, #104 `2f8e0bb0`, #105 `2f1dc347`. Gap: none.
- **FV-02** Yes · Production. Canonical and candidate-tag `/api/version` return `2ec46806bda10e799025e9919a2c1b14b7be3a5a`
  / `pmi-kc-app-rmupi9ukm-9f056f091001`, which holds 100% traffic; every batch 003 commit and fix (FV-01) is an
  ancestor of `2ec46806`. Gap: none.
- **FV-03** Yes · Production. After candidate assurance, promotion, observation and readbacks,
  `scripts/check-production-focus.ts` passed on the exact serving revision (version verified before
  and after) on three live lease workspaces reached from the desk, behind the release request
  guard: zero mutation attempts, no blocked request. Gap: none.
- **FV-04** Yes · Unit; scratch reverts; full gate. Each of the four earlier corrections fails its
  regression test when reverted, and each acceptance-run repair fails first on `76ba54c5` (see
  Fail-first). The full gate passed on the fixed head `2f1dc347`. Gap: none locally.
- **FV-05** Yes · Records. The S142–S145 registry rows, intake rows, loop state, status, plan,
  facts and this map state implemented (commit and PR), tested (environment and result) and
  live-verified separately; the live cells come from run `ab803f8a`'s readbacks and the production
  Focus check, and S144 records that in-pane saves were not exercised live. The docs gates passed.
  Gap: none.
- **FV-06** Yes · Records. Every No (unverified) entry is listed under "Unverified seams" and in
  loop state and status, with its missing evidence. Human verdict: NOT RUN — no human observer.
- **FV-07** Yes · Git. Only the S142–S145 and 009–012 rows changed; no other suite, provider
  proof or queue row was reopened. By owner decision, batch 002's queued rows shipped with batch
  003 in run `ab803f8a`, which consumed the queue; nothing earlier was requeued.
- **FV-08** Yes · Code search; unit. No file batch 003 added imports an assistant, refinement,
  Gemini or model-routing module; its one-line change to `RenewalMessagePreparation.tsx` adds an
  `id`. Focus tests pass with no AI configured, and no action reads refinement output.
- **FV-09** Yes · Run log. No per-feature or per-phase approval was requested. The owner was
  asked twice: once for the canary enrollment pair, and once, after run `6eb157e1` blocked, for
  PR #93's navigation bound, which the run's boundaries reserved to the owner. Both answers are
  recorded in `docs/loop-state.md`.

### B. Full-view preservation

- **FV-10** Yes · Unit; compiled browser; production. The initial
  `view` is `"full"` and no lease-view preference is stored anywhere (search), so the "unless"
  clause is N/A. Full was pressed on every fresh load in unit tests, on seven rehearsal loads and
  on all three production workspaces, with no Focus pane by default. Gap: none.
- **FV-11** Yes · Unit; compiled browser. Pre-existing workspace tests pass unchanged in the full
  gate, and the S111 guide smoke passed on `2fdcbbe5` without touching the switch.
- **FV-12** Yes · Unit. The signature's `sectionIds` and `regions` order equals the `6c806afe`
  baseline for every fixture case on the final head.
- **FV-13** Yes · Unit; backend. Headings and per-section text hashes equal the baseline; after a
  legitimate save (journeys and the route-handler test) both views show the new value.
- **FV-14** Yes · Unit; compiled browser. All five navigation entries move focus into their
  section before and after a round trip; the rehearsal clicked through all five on four leases.
  A read-only probe on two more leases started each click from the bottom of the page; every
  entry put focus in its section with the focused control at the top of the viewport (0 px),
  before and after a round trip.
- **FV-15** Yes · Unit. Copy text equals the `b1c6135c` capture byte for byte, before and after a
  round trip, and contains no Focus, Full view or task wording.
- **FV-16** Yes · Code review; unit. The form files gain only ids and context fields
  (`RenewalManualWorkspace.tsx`, `RenewalMessagePreparation.tsx`) and a post-save focus hand-off
  (`RenewalSaveFocus.tsx`); no validation changed, and pre-existing validation tests pass
  unchanged.
- **FV-17** Yes · Unit. No rent, comp, notice or date computation module changed; the extracted
  predicates return identical outputs (`s142-predicate-equivalence`), and pre-existing calculation
  tests pass unchanged.
- **FV-18** Yes · Git; unit. `git diff b1c6135c..main -- app/api lib/integrations` is empty, and
  the pane sends exactly the Full view request.
- **FV-19** Yes · Git; backend. FV-18 holds, `test:firestore` passes with unchanged assertions,
  and the Action Registry seed is unchanged.
- **FV-20** Yes · Compiled browser; code search. Every in-app link into a lease workspace (desk,
  My Work, Gmail Hub, Ask, notice draft, packet action, access handoff) is unchanged and opens the
  same route, which opens Full view on the current cycle; the guide smoke kept the desk view from
  desk to lease and back. The S82 desk budget miss is the same on `b6c9a1e4` under the same
  conditions. Gap: none in scope; desk dev latency predates batch 003.

### C. View switching

- **FV-21** Yes · Unit; compiled browser. `RenewalFocusViewPane` owns the surface (identity, one
  task with reason and state, other ready work, outcomes and announcements) and is portaled into
  the first slot of the workspace body; only the chosen task's own control regions stay visible
  (14–16 Full view elements hidden). It imports no stepwise or review-mode component.
- **FV-22** Yes · Unit; code. The switch renders at lease level in both views with correct
  `aria-pressed`. The no-switch layout is unreachable for real leases: the live lease page is the
  only caller and always passes the staff record or its read failure; the old lease route
  redirects.
- **FV-23** Yes · Unit; compiled browser; production. Lease, cycle,
  URL and desk return link were identical across both switch orders (unit; three leases in the
  guarded routine). In production the URL and desk return link were unchanged after pointer,
  keyboard and phone round trips on three live workspaces, with zero navigations and the Full
  view signature unchanged. Gap: none.
- **FV-24** Yes · Unit; compiled browser. Switching and choosing sent zero lease-renewal requests
  and zero non-GET requests, caused no navigation or refresh and changed nothing in the store.
- **FV-25** Yes · Unit; compiled browser. Unsaved values survive both orders in Full view fields
  and Focus task controls (unit), and on the rehearsal (Full view fields on three leases, a Focus
  task's staff record field on one), with no request.
- **FV-26** Yes · Unit; compiled browser. The switch takes Tab, Enter and Space; Tab never reaches
  hidden content; Enter chooses a task and focuses its heading; Space on "Show this task in Full
  view" lands at the task's control.
- **FV-27** Yes · Unit. After a confirmed completion, focus is on the next task's heading, or on
  the result line after the last task; never `body` or a hidden element (repaired in PR #105).

### D. Dependency projection

- **FV-28** Yes · Unit; code search. Readiness and completion come only from
  `projectRenewalActions` over the snapshot and staff readback; no Focus state or new Firestore
  write exists; the server-rule matrix invariants hold.
- **FV-29** Yes · Unit; backend. Every Focus submission carries the cycle id and revision;
  wrong-cycle and stale submissions are refused; a new cycle carries none of the old records.
- **FV-30** Yes · Unit; backend. Unsaved input leaves dependents blocked; only the read-back
  record satisfies them, through the real route handler.
- **FV-31** Yes · Unit. Two dependents of the same two prerequisites stay blocked after the first
  and become ready after the second (graph fixture and real activities).
- **FV-32** Yes · Unit. Real alternatives: staff completion needs either the continuing branch's
  recorded chain or a decline with the non-renewal handoff; an activity is satisfied by Done or a
  permitted Not applicable; either party's decline opens the non-renewal branch. Each is tested,
  and journeys complete by each branch alone.
- **FV-33** Yes · Unit. An excluded branch's actions are not applicable, and completion is
  reachable without them.
- **FV-34** Yes · Unit. Unknown applicability, missing rent evidence, an unavailable source and an
  unreadable staff record each stay unresolved and block only their dependents.
- **FV-35** Yes · Unit. With display order reversed and no cycle, the real prerequisite comes
  first without an override.
- **FV-36** Yes · Unit. A cycle is diagnosed with both actions named in the pane; nothing
  completes and independent work stays ready (repaired in PR #105).
- **FV-37** Yes · Unit. A missing reference keeps the dependent listed with its diagnostic
  (repaired in PR #105).
- **FV-38** Yes · Unit. One primary task with the rest under "Other ready tasks"; recording them
  in six random orders reaches one result.
- **FV-39** Yes · Unit; compiled browser. Choosing every task (29 per live lease) sent no request
  and changed no status.
- **FV-40** Yes · Unit. Work only another role may do appears as another person's; readiness
  matches `hasRenewalRoleAuthority` and the route guard for Editor, Approver and Admin.

### E. Focus pane content

- **FV-41** Yes · Unit. The lease title and current cycle stay visible through task changes.
- **FV-42** Yes · Unit; compiled browser. Exactly one task heading; regions outside the task are
  hidden.
- **FV-43** Yes · Unit. Rent verification shows the existing rent-and-charges region beside its
  control; failed supporting reads and the move-out notice are stated in the pane (repaired in
  PR #105).
- **FV-44** Yes · Unit. A blocked downstream action is never offered as executable; the pane
  leads with its resolvable prerequisite.

### F. In-pane actions

- **FV-45** Yes · Unit; backend. A staff form saves from Focus through the existing route and
  reads back, with exactly the Full view request.
- **FV-46** Yes · Unit. The optional comp preparation runs from the pane and persists; no paid or
  live market call.
- **FV-47** Yes · Unit. The verification task shows the source values and the existing confirm or
  correct operation; unknown, conflicting and verified rent stay distinct.
- **FV-48** Yes · Unit (fixtures). The existing lease-date path is the RentVine updates
  confirmation; from the pane it sends the same request body as Full view. Gap: no live RentVine
  write (not authorized).
- **FV-49** Yes · Unit; backend. Done, Not applicable, owner and tenant outcomes, staff
  completion and Reopen work from the pane through their existing routes (Reopen repaired in
  PR #105).
- **FV-50** Yes · Unit (fixtures). The existing unsent-draft workflow opens in the pane bound to
  the selected lease and cycle.
- **FV-51** Yes · Unit. Owner response, non-renewal handoff and document packet handoff are usable
  from Focus.
- **FV-52** Yes · Unit. The accepted, declined and countered paths each reach staff completion in
  Focus.
- **FV-53** Yes · Backend; code. The unchanged route re-plans against stored state (capability
  check, revision fence, preconditions) before it writes.
- **FV-54** Yes · Unit. While a save is pending, the task and values stay visible and the control
  shows pending.
- **FV-55** Yes · Unit. Invalid input is refused without a request; a refused save shows its
  error and the pane does not advance.
- **FV-56** Yes · Unit. After a lost response or an ambiguous effect, input and task stay and the
  existing recovery is offered.
- **FV-57** Yes · Unit; backend. A double click sends one request; a retry uses the same
  operation id, which the store replays once.
- **FV-58** Yes · Unit (fixtures). An uncertain provider effect is shown through the existing
  S107 reconciliation without a retry. Gap: no live provider effect (not authorized).
- **FV-59** Yes · Unit; backend. A task leaves the pane only when its readback satisfies its
  completion predicate.
- **FV-60** Yes · Unit. A confirmed change recomputes the projection before the next task is
  chosen.
- **FV-61** Yes · Unit. Advancing to the next task issues no request.
- **FV-62** Yes · Unit; backend. After a Focus save, Full view shows the same persisted state.
- **FV-63** Yes · Unit; backend. A reload derives the next task from stored state; no step counter
  exists and completed tasks are not offered again.
- **FV-64** Yes · Unit; backend. A colleague's change is shown and announced before anything
  stale can run, and the revision fence refuses a stale submit (announcement repaired in PR #105).
- **FV-65** Yes · Unit. Another person's save and a refreshed source leave unfinished input
  intact.
- **FV-66** Yes · Unit. A counter reopens only the owner response; new terms reopen only the
  terms-dependent work.
- **FV-67** Yes · Unit. Recalculation keeps receipts and history; no operation id was replayed.
- **FV-68** Yes · Unit. Completed work stays in the Done group and in Full view.
- **FV-69** Yes at fixture level · Unit. The draft handoff carries the lease, cycle and message
  context, and a Gmail return keeps it. Gap: live Gmail stays No (unverified); creating a real
  draft to demonstrate the feature is not authorized.
- **FV-70** Yes · Unit. Creating a draft or opening Gmail changes no completion state and
  records no send.
- **FV-71** Yes · Unit. Staff work says "Recorded."; a refreshed source or provider says "Done.".
- **FV-72** Yes · Unit. The completion predicates are unchanged, and no receipt requirement was
  added.
- **FV-73** Yes · Unit. Waiting work names its requirement and the known actor or event; the
  move-out notice is stated in the pane (repaired in PR #105).
- **FV-74** Yes · Unit. Blocked, unavailable and unresolved dependencies leave unrelated ready
  work available.
- **FV-75** Yes · Unit. Completion shows only when `summary.complete` holds; otherwise the pane
  says nothing is ready for this person.
- **FV-76** Yes · Code search. No role check, claim, activation or approval gate guards Focus,
  and the route guard is unchanged.
- **FV-77** Yes · Git; production. No flag, role, connector or registry change; the serving
  revision reads `LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED=false` and matches its reviewed
  configuration fingerprint (FV-97). Gap: none.
- **FV-78** Yes · Code search; unit. No Focus file calls a send or fetch path, and drafts stay
  unsent.

### G. Verification checks

- **FV-79** Yes · Unit; backend. The server-rule matrix, graph tests and route-handler test pass
  through the shared projection and the real route conditions.
- **FV-80** Yes · Unit; backend. Journeys start from a fresh cycle, mid-path and after a counter
  and reach the existing final states; one path ran through the real route handler.
- **FV-81** Yes · Unit. FV-12 to FV-15 pass against the `6c806afe` baseline, including the
  cross-build copy comparison.
- **FV-82** Yes · Unit; backend. Reload and resume derive the next task from stored state without
  replay.
- **FV-83** Yes · Unit; compiled browser. See FV-25.
- **FV-84** Yes · Unit. Opening the provider is recorded as neither sent nor complete.
- **FV-85** Yes · Unit; backend. A concurrent change is reconciled through the revision fence
  before any stale submit.
- **FV-86** Yes · Unit. A late refresh shows the new dependency state with unsaved input
  unchanged.
- **FV-87** Yes · Unit; backend. Exactly one effect for a repeated submission.
- **FV-88** Yes · Unit. An ambiguous result keeps the context and recovers with the same operation
  before any repeat.
- **FV-89** Yes · Production. The production Focus check's guard report reads zero mutation
  attempts and no blocked request, and every workspace recorded zero write requests. No synthetic
  record was created. Gap: none.
- **FV-90** Yes · All environments run. No send or draft call reached production or Gmail; unit
  tests use fixtures, the rehearsal refuses writes and the guarded routine recorded zero mutation
  attempts. The production check ran under the same guard and recorded zero mutation attempts.
- **FV-91** Yes · Redaction gate; review. `verify:redaction` passes; the fixtures use sample data
  only, and smoke and check output prints structure only.

### H. Added by this audit

- **FV-92** Yes · Logs outside Git. `verify.sh` and `test:e2e:core` exited 0 on the exact heads of
  PRs #101, #102, #103, #104, #105, #106 (`7b453b07`) and #107 (`7a61bf77`).
- **FV-93** Yes · Local gate; CI. `verify:dependencies` passed (0 vulnerabilities) on PR #105's
  head, on PR #107's head `7a61bf77` (tree-identical to the release head) and in the release head's
  push CI 36860571425 (policy-build, finished 12:17 UTC), which admission at 12:23:39 UTC required.
  Each later `main` push reruns it in CI. Gap: none.
- **FV-94** Yes · GitHub. CI is green on every PR head and every `main` merge commit, including
  the exact released SHA `2ec46806` (run 36860571425: quality, unit, firestore, policy-build and
  verify passed). Gap: none.
- **FV-95** Yes · Git. `b1c6135c..main` changes no protected path, Action Registry key or
  `production_allowed` flag, `app/api/**` route, Firestore rules, provider adapter or runtime
  flag, and adds no persisted Focus state.
- **FV-96** Yes · Release state. Run `6eb157e1` reached an owner-directed outcome: it was
  archived byte-for-byte as superseded at 12:15:49 UTC, before run `ab803f8a`'s permit was
  prepared at 12:16:47 UTC, so runs never overlapped. `~/pmi-kc-work/main` and `b1c6135c` were
  untouched while it was unfinished. One cumulative candidate carried batches 002 and 003 and
  every fix. Gap: none.
- **FV-97** Yes · Production. Independent readbacks at 13:02:41 UTC: canonical traffic 100% on
  `pmi-kc-app-rmupi9ukm-9f056f091001`; environment production/live with `ASK_DEMO_MODE=false` and
  `LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED=false`; the managed runtime identity, eleven paired Space
  maps and four secret bindings match the reviewed configuration fingerprint; exactly one
  candidate authorized domain. Gap: none.
- **FV-98** Yes · Compiled browser; production. No horizontal overflow
  in either view at 390 px or desktop width on the three guarded loads, nor at 390 px (both views)
  and desktop (Focus) on the four smoke loads; the switch worked at both widths. In production,
  neither view scrolled horizontally at 390 px or 1440 px on three live workspaces, and the switch
  worked at both widths. Gap: none.
- **FV-99** Yes · Unit. Task changes, requirement changes and completions are announced in the
  polite region in evidence wording (repaired in PR #105).
- **FV-100** Yes · Unit; compiled browser. A scrolled Full view returns to its position, "Show this
  task in Full view" focuses the requested control, and every disclosure is as the person left it.
- **FV-101** Yes · Unit. A refresh with no relevant change keeps the chosen task and announces
  nothing new.
- **FV-102** Yes · Code search; unit. The pane shows no "step N of M" text, and nothing persists a
  Focus step index.

## Unverified seams

- Live staff-record saves through Focus: the rehearsal refuses writes, and no synthetic production
  record is authorized. The emulator tests cover the store and the real route handler.
- Live Gmail drafts and provider effects (RentVine or Sheet write-back) started from Focus
  (FV-48, FV-58, FV-69): the controls and their exact confirmation and readback are unchanged and
  were tested only with fixtures.
- Around the workspace route: the page loader's live reads, the session cookie and Next's HTTP
  layer. The E2E harness has no browser and refuses writes, so the route handlers ran in a backend
  test.
- An owner who keeps identical terms after a tenant counter: the existing S113 rule keeps the
  owner response outstanding, and Focus follows it. The tenant's later answer is recorded in Full
  view. No new rule was added.
- The desk's production latency was not measured here. The dev rehearsal budget failure above
  predates batch 003.
- Human usability, screen reader and full-page zoom verdicts: NOT RUN.
