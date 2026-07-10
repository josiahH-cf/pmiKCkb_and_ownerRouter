<!-- spec-shape: overhaul-v1 -->

# S18 — Process auto-initiation / anticipation (app-plane)

> New 2026-07-10 (operator note). Answers the owner's "why do these things still need a process?"
> The disposable decision-complete packet lives at `docs/temp/process-auto-initiation-plan.md`
> (local-only). This is the TRACKED spec the loop executes. The binding design decision below is an
> owner-default confirm-with-default: **"initiation" means app-plane draft/queue creation only** —
> the app ANTICIPATES and PROPOSES work a human starts with one click; it never auto-runs, auto-sends,
> or writes a system of record, and real scheduled (cron) auto-initiation stays hard-gated.

**Goal.** Today every process is started by hand: SpaceDesk's "Start a run", and the Console process
picker, which starts a SIMULATION only (`components/ask/AskForm.tsx:106` → `POST
/api/process-definitions/{id}/test-runs`). The only anticipatory logic that exists — the pure
`planNoticeReminders` / `planCallTasks` planners (`lib/lease-renewal/notice-reminders.ts`) over the
renewal cohort (`lib/lease-renewal/cohort.ts`) — runs ONLY as a manual CLI dry-run (`npm run
notices:reminders`, `scripts/run-notice-reminders.ts`) that prints and exits: no Cloud Scheduler, no
send, nothing reads lease/meeting data to open work. After this suite the operator opens the Console
and sees an "Anticipated work" lane: a read-only, value-free "coming up / due" list computed on
request from those same pure planners, covering all four processes the owner named (lease renewals,
owner-renewal outreach, tenant renewal notices, maintenance work orders) plus a named
compliance/new-user placeholder — each item ONE CLICK from starting the existing human-run process
through the existing test-run/desk path. Anticipation never executes; it only proposes work a human
starts. Real cron auto-initiation, any send, and any system-of-record write stay behind the fence.

**What it is / how it functions.** One pure projection feeds one read-only Console lane; the start
control reuses the existing simulation/desk path (no new endpoint, no new external action).

- **Projection — new `lib/anticipation/projection.ts`.** A pure `buildAnticipatedWork({
referenceDateIso, batch, ruleSet })` that mirrors `lib/lease-renewal/cohort.ts` exactly: reference
  date, the in-boundary lease batch, and the notice rule set are all INPUTS — no `Date.now()`, no I/O.
  It folds `classifyRenewalCohort` + `planNoticeReminders` + `planCallTasks` +
  `resolveNoticeRule`/`DEFAULT_NOTICE_RULE_SET` into a value-free `AnticipatedWorkList`: one
  `AnticipatedWorkGroup` per owner-named process family (`lease-renewals`,
  `owner-renewal-outreach`, `tenant-renewal-notice`, `maintenance-work-order-intake`) plus a named
  compliance/new-user family. Each group carries ONLY value-free fields — `processDefinitionId`,
  `spaceId`, `spaceName`, `category`, a numeric `count`, an `urgency` enum
  (`overdue`/`due-soon`/`upcoming`/`all-clear`/`no-source-yet`), a value-free `summary` label
  ("3 leases due for a notice"), and a `startHref` — derived from `lib/spaces.ts` (`launchSpaces` +
  `spaceHref`). NO address, rent, tenant name, or lease-end date crosses onto the value-free list
  (the same posture as the needs-decision inbox and the write-back queue).
- **Lane — new `components/console/ConsoleAnticipatedWork.tsx`.** A sibling of
  `components/console/ConsoleProcessStrip.tsx` (read-only, deep-linking chips). Rendered by
  `components/console/ConsoleView.tsx` (which already assembles the deck + ask box + process strip
  from one non-fatal gather). Each item shows the family, its value-free count + urgency, and a
  primary "Start a test run" control that reuses the EXISTING `POST
/api/process-definitions/{processDefinitionId}/test-runs` the picker and `SpaceDesk` already use
  (F-SPACE-DESK-1), landing on `/workflow-runs/{id}`; when a family has no seeded definition the item
  deep-links to its Space (`spaceHref`) instead. The start control is editor-gated exactly like the
  process picker (`canStartSimulation = can(user.role, "edit")`, `ConsoleView.tsx:47`).
- **Data source (in-boundary).** V1 projects over the deterministic SAMPLE batch the desk already
  uses (`lib/lease-renewal/sample-desk.ts` — `getRenewalDeskView` / the `sampleReminderLeases` shape
  in `scripts/run-notice-reminders.ts:60`), so the lane is reproducible and PII-free. The renewal,
  owner-outreach, and notice families draw real counts from the cohort + planners; maintenance and
  compliance/new-user have no anticipation feed yet, so they render an honest `no-source-yet`
  placeholder ("Waiting on a maintenance signal") — a named family, never a fabricated item.
- **Computed on request, never scheduled.** The lane renders on Console load from the pure
  projection and carries a permanent caption: "Computed on request · this never runs on a schedule
  and never sends." No background job, no cron, no `setInterval`. An optional editor "Refresh" simply
  re-runs the pure projection for the current view.

- **Buildable now (app-plane).**
  - **Slice 1 — projection module.** `lib/anticipation/projection.ts` (pure; reference-date + batch +
    rule-set inputs; no `Date.now`, no I/O) folding cohort + `planNoticeReminders` + `planCallTasks`
    into the value-free `AnticipatedWorkList`. New `tests/unit/anticipation-projection.test.ts`.
  - **Slice 2 — Console lane.** `components/console/ConsoleAnticipatedWork.tsx` wired into
    `ConsoleView.tsx`; read-only; editor-only one-click start reusing the existing test-runs POST /
    desk deep link (NO new endpoint). Lane styles as plain `.console-*` classes in `app/globals.css`.
    New `tests/unit/console-anticipated-work.test.tsx`.
  - **Slice 3 — honest states.** Empty/all-clear text ("All clear — nothing is coming up right now.")
    and the permanent "Computed on request · never runs on a schedule" caption; the `no-source-yet`
    placeholder for un-fed families.
  - **Slice 4 — cover all four (+placeholder) families.** Extend the projection to NAME — but never
    auto-run — `owner-renewal-outreach`, `maintenance-work-order-intake`, and a compliance/new-user
    family, so the lane covers every process the owner named. Copy passes `verify:copy-voice`.
- **Gated (owner / vendor).**
  - Real scheduled auto-initiation (Cloud Scheduler / cron / any timer that starts a run). HARD-gated
    by `F-PRECUST-CYCLE`; stays out of scope entirely.
  - Any autonomous send from an anticipated item.
  - Any system-of-record write (RentVine / Sheet / QuickBooks / bank / client Drive) triggered from
    an anticipated item (`F-WRITE-GATE`).
  - Wiring the LIVE anticipation feed (the real lease feed + the Dan-meeting-derived signals for
    maintenance / compliance / new-user) beyond the in-boundary sample — needs the approved data
    source and owner sign-off.
  - Deploy (owner-run).

**Open questions & assumptions.**

- _Assumption:_ "initiation" = app-plane draft/queue creation only (owner-default, confirm-with-default
  per this suite's operator note). The app anticipates + proposes; a human starts each run. This is
  the whole scope of S18; nothing here relaxes it.
- _Open:_ whether the owner ever wants TRUE scheduled (cron) auto-initiation. That is the gated
  future — it requires relaxing `F-PRECUST-CYCLE`'s no-Cloud-Scheduler stop AND the owner's hard
  budget kill switch (per the owner-budget-safety memory), and is explicitly OUT of this suite.
  Routed to `docs/client-checklist.md` as a confirm-with-default (default: no scheduler; the lane
  stays request-computed).
- _Open / Client-owned:_ what SIGNALS define "anticipated" maintenance work and compliance/new-user
  work (from the Dan meetings). Until supplied, those families render the honest `no-source-yet`
  placeholder; the renewal/notice/owner-outreach families are fully sourced from the existing
  planners today.
- _Open:_ the LIVE data source. V1 projects over the in-boundary SAMPLE batch (`sample-desk.ts`);
  swapping in the live lease feed is gated (the live Sheet + RentVine reads are verified per
  `F-DRIVE-DWD` / the Sheets-DWD memory, but a meeting-signal feed is not built). Confirm-with-default:
  sample batch until the live feed is wired behind the gate.
- _Client-owned:_ the notice-rule VALUES (deadline day, warning lead, follow-up interval) stay
  `Needs Verification:` until Dan confirms (`F-NOTICE-ENGINE`); the lane's urgency inherits them and
  is only as confirmed as they are.
- _Assumption:_ hard gates unchanged this cycle — no autonomous send, no SoR write execution
  (`F-WRITE-GATE`), no Cloud Scheduler, no new Google scope, every Action Registry entry
  `production_allowed:false`, ~$10 cap, deploy owner-run.

**Cross-product impacts.** New `lib/anticipation/projection.ts` +
`components/console/ConsoleAnticipatedWork.tsx`; consumes (unchanged)
`lib/lease-renewal/notice-reminders.ts` (`planNoticeReminders` / `planCallTasks`),
`lib/lease-renewal/cohort.ts` (`classifyRenewalCohort`), `lib/lease-renewal/notice-rules.ts`
(`DEFAULT_NOTICE_RULE_SET` / `resolveNoticeRule`), and `lib/lease-renewal/sample-desk.ts` (the
in-boundary batch). Wires into `components/console/ConsoleView.tsx`; reuses `lib/spaces.ts`
(`launchSpaces` + `spaceHref`) and the `lib/space-card-state.ts` semantics for the start routing;
adds plain lane classes to `app/globals.css`. The UI is the on-screen twin of the existing dry-run
CLI `scripts/run-notice-reminders.ts` (the projection reuses the same planners the CLI prints). New
tests `tests/unit/anticipation-projection.test.ts` + `tests/unit/console-anticipated-work.test.tsx`.
Interacts with (does NOT supersede): `F-NOTICE-ENGINE` (source planners), `F-PRECUST-CYCLE`
(no-Cloud-Scheduler hard gate it honors), `F-WRITE-GATE` (no SoR write), `F-CONSOLE-ACT-IN-PLACE` /
`F-CONSOLE-APP-STATE` (the Console front door it extends — one read-only lane + a start-a-test-run
control, no new external action), `F-APPROVAL-QUEUE-UNIFIED` (the value-free needs-decision inbox is
its sibling projection). Additive; no Supersede Log entry.

**Adversarial acceptance checks.**

- **AC-S18-1** — Given a fixed `referenceDateIso`, the `sample-desk.ts` batch, and
  `DEFAULT_NOTICE_RULE_SET`, `buildAnticipatedWork(...)` returns deep-equal output on two consecutive
  calls (deterministic; no `Date.now`, no I/O — a `Date.now` or a network/fs import fails the check).
  _Verify:_ `npm test -- tests/unit/anticipation-projection.test.ts`; keep
  `tests/unit/lease-renewal-cohort.test.ts` green.
- **AC-S18-2** — `JSON.stringify(buildAnticipatedWork(...))` contains NONE of: a street address, a
  `$`-prefixed rent, a tenant name, or a lease-end date string; each group's key set is EXACTLY
  `{processDefinitionId, spaceId, spaceName, category, count, urgency, summary, startHref}`
  (value-free invariant, pinned like the write-back queue's row-key test). _Verify:_ `npm test --
tests/unit/anticipation-projection.test.ts`; keep `tests/unit/needs-decision-inbox.test.ts` green.
- **AC-S18-3** — The rendered Console lane shows all FOUR owner-named families (Lease Renewals, Owner
  Renewal Outreach, Tenant Renewal Notice, Maintenance Work Order Intake) plus the compliance/new-user
  family; an un-fed family renders the `no-source-yet` placeholder text and produces NO startable item
  (never a fabricated work item). _Verify:_ `npm test -- tests/unit/console-anticipated-work.test.tsx`.
- **AC-S18-4** — When the projection is all-clear, the lane renders the exact text "All clear —
  nothing is coming up right now." AND still renders the caption "Computed on request · this never
  runs on a schedule and never sends." _Verify:_ `npm test --
tests/unit/console-anticipated-work.test.tsx`; keep `tests/unit/console-view.test.tsx` green.
- **AC-S18-5** — Activating "Start a test run" on an anticipated item issues exactly the existing
  `POST /api/process-definitions/{processDefinitionId}/test-runs` (or, for a definition-less family,
  navigates to `spaceHref`); the resulting run is simulation-only and NO route that sends or writes a
  system of record is called. _Verify:_ `npm test -- tests/unit/console-anticipated-work.test.tsx`;
  browser-drive the lane and confirm the network target is `…/test-runs` and the run status is a test
  run.
- **AC-S18-6** — A viewer (non-editor) role renders the read-only lane with ZERO start controls
  (`canStartSimulation` false), mirroring the process-picker gate in `ConsoleView.tsx`. _Verify:_
  `npm test -- tests/unit/console-anticipated-work.test.tsx`.
- **AC-S18-7** — A repo scan finds NO Cloud Scheduler / cron / `node-cron` / `setInterval` / timer
  that invokes `buildAnticipatedWork` or any process start; the projection is reachable only from a
  server render or an explicit editor "Refresh" (hard-gate falsification — any scheduler reference in
  the anticipation/Console path fails). _Verify:_ `rg -n "cron|setInterval|Scheduler|schedule\(" lib/anticipation components/console`
  returns nothing; `npm run typecheck`.
- **AC-S18-8** — For a given `--date`, the lane's renewal-family counts reconcile with
  `npm run notices:reminders -- --date=2026-07-14 --json` (the lane is the UI twin of the dry-run over
  the same planners; a divergence means the projection forked from the planners). _Verify:_ `npm run
notices:reminders -- --date=2026-07-14 --json`; keep `tests/unit/lease-renewal-notice-reminders.test.ts`
  green.
- **AC-S18-9** — All new copy passes the voice gate (plain language, "test run" not "simulation",
  "the app", no em dash) and the suite is green under lint/typecheck. _Verify:_ `npm run
verify:copy-voice`, `npm run typecheck`, `npm run lint`; keep `tests/unit/space-card-state.test.ts`
  green.

**Forbidden actions / hard gates.** App-plane only. Anticipation NEVER executes — it proposes work a
human starts. No Cloud Scheduler, no cron, no `setInterval`, no timer that auto-starts a run
(`F-PRECUST-CYCLE`). No autonomous send. No system-of-record write (RentVine / Sheet / QuickBooks /
bank / client Drive) triggered from an anticipated item (`F-WRITE-GATE`). No new Google scope. The
Console lane stays value-free — no address, rent, tenant name, or lease-end date on the list. The
live meeting/lease feed stays gated; V1 projects over the in-boundary SAMPLE batch only. Every Action
Registry entry `production_allowed:false` (this suite adds none). No client data on GitHub. ~$10
budget cap. Deploy stays owner-run. A violation of any of these is itself a falsification.

**Ordered prompt sequence.**

1. _Discovery:_ re-read `lib/lease-renewal/notice-reminders.ts`, `cohort.ts`, `notice-rules.ts`,
   `sample-desk.ts`, `components/console/ConsoleView.tsx` + `ConsoleProcessStrip.tsx`, the test-runs
   start path in `components/ask/AskForm.tsx:106`, and `lib/spaces.ts`; confirm the planners + cohort
   are pure and the `…/test-runs` POST is the shared start path; grep-confirm no scheduler exists.
2. _Build:_ Slice 1 — `lib/anticipation/projection.ts` (pure `buildAnticipatedWork`) folding
   `classifyRenewalCohort` + `planNoticeReminders` + `planCallTasks` into the value-free
   `AnticipatedWorkList` across the four families + the compliance/new-user placeholder; add
   `tests/unit/anticipation-projection.test.ts` (determinism AC-S18-1, value-free key-set AC-S18-2,
   four-families AC-S18-3). Lint/typecheck/test + a falsification pass.
3. _Build:_ Slice 2+3+4 — `components/console/ConsoleAnticipatedWork.tsx` wired into `ConsoleView.tsx`;
   read-only lane, editor-only one-click start reusing the existing test-runs POST / desk deep link;
   honest empty/all-clear + "computed on request, never scheduled" caption + `no-source-yet`
   placeholder; plain `app/globals.css` classes; `tests/unit/console-anticipated-work.test.tsx`
   (AC-S18-4/5/6). Extend — never weaken — the value-free sentinel posture.
4. _Verify:_ `npm test` (new + the named sentinels), `npm run typecheck`, `npm run lint`, `npm run
verify:copy-voice`; reconcile counts with `npm run notices:reminders -- --date=2026-07-14 --json`
   (AC-S18-8); then `bash scripts/verify.sh`. Browser-drive the Console lane as an editor AND a viewer:
   confirm one click lands on a test run at `/workflow-runs/{id}`, the viewer sees no start control,
   and nothing sends or writes.
5. _Gate:_ STOP before any Cloud Scheduler / cron / timer, any live meeting-or-lease feed wiring
   beyond the in-boundary sample, any SoR write or send. Hand back to the owner.
6. _Owner:_ present the confirm-with-default (initiation = app-plane draft/queue creation only; no
   scheduler); collect the client-owned "what defines anticipated maintenance / compliance / new-user
   work" signals from the Dan meetings; deploy stays owner-run.
7. _Context update:_ promote the shipped lane to a `docs/facts.md` `F-ANTICIPATION-LANE` row citing
   AC-S18-1 … AC-S18-9, and update `docs/loop-state.md` at the slice boundary (keep headroom under its
   140-line cap).

**Deletion/merge recommendation.** KEEP this suite as the cycle's tracked spec; the
`docs/temp/process-auto-initiation-plan.md` packet stays disposable local evidence. It EXTENDS the
Console front door (S10 / `F-CONSOLE-APP-STATE`) and the notice planners (S13 / `F-NOTICE-ENGINE`)
rather than replacing them, and it does NOT supersede S13 — it builds the anticipation lane S13 left
as a manual CLI dry-run. If the Console app-state suites are later consolidated, this may MERGE into
that family as the "anticipation lane" section; until then keep it standalone.
