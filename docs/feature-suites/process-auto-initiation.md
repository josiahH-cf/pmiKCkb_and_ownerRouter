<!-- spec-shape: overhaul-v1 -->

# S18 — Process auto-initiation / anticipation (app-plane)

> New 2026-07-10 (operator note). Answers the owner's "why do these things still need a process?"
> The disposable decision-complete packet lives at `docs/temp/process-auto-initiation-plan.md`
> (local-only). This is the TRACKED spec the loop executes. The binding design decision below is an
> owner-default confirm-with-default: **"initiation" means app-plane draft/queue creation only** —
> the app ANTICIPATES and PROPOSES work a human starts with one click; it never auto-runs, auto-sends,
> or writes a system of record, and real scheduled (cron) auto-initiation stays hard-gated.
>
> **S56 closure amendment (2026-08-03).** Production Test runs and runtime sample-desk fallback are
> retired. The lane now reads the real bounded renewal desk, fails closed when that read is
> unavailable, and a person starts one ordinary Live app-plane run through
> `POST /api/process-definitions/{id}/runs`. Deterministic invented inputs remain test helpers only.
> This amendment controls wherever the historical build narrative below says Test, simulation, or
> runtime SAMPLE.

**Goal.** Every process remains human-started: SpaceDesk and the Console use the ordinary
`POST /api/process-definitions/{id}/runs` app-plane route. The anticipatory logic — the pure
`planNoticeReminders` / `planCallTasks` planners (`lib/lease-renewal/notice-reminders.ts`) over the
renewal cohort (`lib/lease-renewal/cohort.ts`) — is computed on request from the real bounded
read-only renewal desk and is also available through the Live-only manual CLI dry-run (`npm run
notices:reminders`, `scripts/run-notice-reminders.ts`): no Cloud Scheduler and no send. The operator
opens the Console
and sees an "Anticipated work" lane: a read-only, value-free "coming up / due" list computed on
request from those same pure planners, covering all four processes the owner named (lease renewals,
owner-renewal outreach, tenant renewal notices, maintenance work orders) plus a named
compliance/new-user placeholder — each item ONE CLICK from starting the existing human-run process
through the ordinary run/desk path. Anticipation never executes; it only proposes work a human
starts. Real cron auto-initiation, any send, and any system-of-record write stay behind the fence.

**What it is / how it functions.** One pure projection feeds one read-only Console lane; the start
control reuses the ordinary Live app-plane run/desk path and adds no external action.

- **Projection — new `lib/anticipation/projection.ts`.** A pure
  `buildAnticipatedWork({ referenceDateIso, deskView, ruleSet })` that mirrors
  `lib/lease-renewal/cohort.ts` exactly: reference date, the injected desk view, and the notice rule
  set are all INPUTS — no `Date.now()`, no I/O.
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
  primary "Start run" control that reuses
  `POST /api/process-definitions/{processDefinitionId}/runs`, landing on `/workflow-runs/{id}`. When
  a family has no usable definition, the item deep-links to its Space (`spaceHref`) instead. The
  start control is editor-gated exactly like the
  process picker (`canStart` plus the loaded in-scope, non-Retired definition set).
- **Data source (Live read-only).** Production and local rehearsal project over
  `loadLiveRenewalDesk`; an unavailable source returns no anticipated rows and never substitutes
  invented records. Unit tests inject deterministic helper desks to prove the pure projection. The
  renewal, owner-outreach, and notice families draw real counts from the cohort + planners;
  maintenance and compliance/new-user have no anticipation feed yet, so they render an honest `no-source-yet`
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
    `ConsoleView.tsx`; read-only; editor-only one-click start reusing the ordinary `/runs` POST /
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
  - Adding the still-undefined Dan-meeting-derived signals for maintenance / compliance / new-user.
  - Routine deploy, smoke, and traffic promotion until D05's full gate is green.

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
- _RESOLVED by S56:_ the runtime source is the real bounded Live renewal desk, used read-only.
  Unavailability fails closed. Invented renewal desks exist only under `tests/helpers`; the
  maintenance/compliance meeting-signal feed remains unbuilt and renders `no-source-yet`.
- _Client-owned:_ the notice-rule VALUES (deadline day, warning lead, follow-up interval) stay
  `Needs Verification:` until Dan confirms (`F-NOTICE-ENGINE`); the lane's urgency inherits them and
  is only as confirmed as they are.
- _Assumption:_ hard gates unchanged this cycle — no autonomous send, no SoR write execution
  (`F-WRITE-GATE`), no Cloud Scheduler, no new Google scope, and no new Action Registry flip (the
  existing compose-only `gmail.renewal_notice.draft_create` allowlist is unchanged). The verified
  non-null S52 production cost ceiling applies; if it is unset, cost-bearing/live/cloud work is
  closed while local/app-plane work continues. Routine deployment follows D05; interactive auth,
  credentials/scopes, IAM, billing/quota, provider inputs, and destructive operations remain
  owner-run.

**Cross-product impacts.** New `lib/anticipation/projection.ts` +
`components/console/ConsoleAnticipatedWork.tsx`; consumes (unchanged)
`lib/lease-renewal/notice-reminders.ts` (`planNoticeReminders` / `planCallTasks`),
`lib/lease-renewal/cohort.ts` (`classifyRenewalCohort`), `lib/lease-renewal/notice-rules.ts`
(`DEFAULT_NOTICE_RULE_SET` / `resolveNoticeRule`) plus `lib/lease-renewal/live-desk.ts` for the
read-only runtime input. Wires into `components/console/ConsoleView.tsx`; reuses `lib/spaces.ts`
(`launchSpaces` + `spaceHref`) and the `lib/space-card-state.ts` semantics for the start routing;
adds plain lane classes to `app/globals.css`. The UI is the on-screen twin of the existing dry-run
CLI `scripts/run-notice-reminders.ts` (the projection reuses the same planners the CLI prints). New
tests `tests/unit/anticipation-projection.test.ts` + `tests/unit/console-anticipated-work.test.tsx`.
Interacts with (does NOT supersede): `F-NOTICE-ENGINE` (source planners), `F-PRECUST-CYCLE`
(no-Cloud-Scheduler hard gate it honors), `F-WRITE-GATE` (no SoR write), `F-CONSOLE-ACT-IN-PLACE` /
`F-CONSOLE-APP-STATE` (the Console front door it extends — one read-only lane + a human-started run
control, no new external action), `F-APPROVAL-QUEUE-UNIFIED` (the value-free needs-decision inbox is
its sibling projection). Additive; no Supersede Log entry.

**Adversarial acceptance checks.**

- **AC-S18-1** — Given a fixed `referenceDateIso`, an injected `RenewalDeskView`, and
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
- **AC-S18-4** — When the projection is all-clear, the lane renders the exact text "All clear.
  Nothing is coming up right now." AND still renders the caption "Computed on request · it runs only
  when you open the Console, and a person sends every message." _Verify:_ `npm test --
tests/unit/console-anticipated-work.test.tsx`; keep `tests/unit/console-view.test.tsx` green.
- **AC-S18-5** — Activating "Start run" on an anticipated item issues exactly
  `POST /api/process-definitions/{processDefinitionId}/runs` (or, for a definition-less family,
  navigates to `spaceHref`); the resulting record is an explicit Live app-plane workflow run and NO
  route that sends or writes a system of record is called. _Verify:_ `npm test --
tests/unit/console-anticipated-work.test.tsx`; the network target is `…/runs` and the route has no
  send/provider/system-write call.
- **AC-S18-6** — A viewer (non-editor) role renders the read-only lane with ZERO start controls
  (`canStart` false), mirroring the process-picker gate in `ConsoleView.tsx`. _Verify:_
  `npm test -- tests/unit/console-anticipated-work.test.tsx`.
- **AC-S18-7** — A repo scan finds NO Cloud Scheduler / cron / `node-cron` / `setInterval` / timer
  that invokes `buildAnticipatedWork` or any process start; the projection is reachable only from a
  server render or an explicit editor "Refresh" (hard-gate falsification — any scheduler reference in
  the anticipation/Console path fails). _Verify:_ `rg -n "cron|setInterval|Scheduler|schedule\(" lib/anticipation components/console`
  returns nothing; `npm run typecheck`.
- **AC-S18-8** — For a fixed injected desk and date, the lane's renewal-family counts reconcile with
  `planNoticeReminders` and `planCallTasks`; the Live-only CLI loads the real desk over the same
  bounded window and fails closed when unavailable. _Verify:_
  `tests/unit/anticipation-projection.test.ts` and `tests/unit/notice-reminders-cli.test.ts`.
- **AC-S18-9** — All new copy passes the voice gate (plain language, "run" rather than retired lane
  vocabulary, "the app", no em dash) and the suite is green under lint/typecheck. _Verify:_ `npm run
verify:copy-voice`, `npm run typecheck`, `npm run lint`; keep `tests/unit/space-card-state.test.ts`
  green.

**Forbidden actions / hard gates.** App-plane only. Anticipation NEVER executes — it proposes work a
human starts. No Cloud Scheduler, no cron, no `setInterval`, no timer that auto-starts a run
(`F-PRECUST-CYCLE`). No autonomous send. No system-of-record write (RentVine / Sheet / QuickBooks /
bank / client Drive) triggered from an anticipated item (`F-WRITE-GATE`). No new Google scope. The
Console lane stays value-free — no address, rent, tenant name, or lease-end date on the list. The
runtime lease input is a bounded Live read and never falls back to sample data. Every Action
Registry entry `production_allowed:false` (this suite adds none). No client data on GitHub. The
verified non-null S52 production cost ceiling applies; if it is unset, cost-bearing/live/cloud work
is closed while local/app-plane work continues. Routine release follows D05: after the full local
gate, auth and budget preflights, prior-revision capture, and a captured rollback command are green,
the runner may deploy; it must smoke the new revision successfully before promoting traffic.
Interactive authentication, credentials/scopes, IAM, billing/quota, provider inputs, and destructive
operations remain owner-run. A violation of any of these is itself a falsification.

**Ordered prompt sequence.**

1. _Discovery:_ re-read `lib/lease-renewal/notice-reminders.ts`, `cohort.ts`, `notice-rules.ts`,
   `live-desk.ts`, `components/console/ConsoleView.tsx` + `ConsoleProcessStrip.tsx`, the ordinary
   `/runs` start route, and `lib/spaces.ts`; confirm the planners + cohort are pure and grep-confirm
   no scheduler exists.
2. _Build:_ Slice 1 — `lib/anticipation/projection.ts` (pure `buildAnticipatedWork`) folding
   `classifyRenewalCohort` + `planNoticeReminders` + `planCallTasks` into the value-free
   `AnticipatedWorkList` across the four families + the compliance/new-user placeholder; add
   `tests/unit/anticipation-projection.test.ts` (determinism AC-S18-1, value-free key-set AC-S18-2,
   four-families AC-S18-3). Lint/typecheck/test + a falsification pass.
3. _Build:_ Slice 2+3+4 — `components/console/ConsoleAnticipatedWork.tsx` wired into `ConsoleView.tsx`;
   read-only lane, editor-only one-click start reusing the ordinary `/runs` POST / desk deep link;
   honest empty/all-clear + "computed on request, never scheduled" caption + `no-source-yet`
   placeholder; plain `app/globals.css` classes; `tests/unit/console-anticipated-work.test.tsx`
   (AC-S18-4/5/6). Extend — never weaken — the value-free sentinel posture.
4. _Verify:_ `npm test` (new + the named sentinels), `npm run typecheck`, `npm run lint`, `npm run
verify:copy-voice`; reconcile counts with `npm run notices:reminders -- --date=2026-07-14 --json`
   (AC-S18-8); then `bash scripts/verify.sh`. Browser-drive the Console lane as an editor AND a viewer:
   confirm one click lands on an ordinary run at `/workflow-runs/{id}`, the viewer sees no start control,
   and nothing sends or writes.
5. _Gate:_ STOP before any Cloud Scheduler / cron / timer, any unverified meeting-signal wiring, any
   SoR write, or any send. Hand back to the owner.
6. _Owner:_ present the confirm-with-default (initiation = app-plane draft/queue creation only; no
   scheduler); collect the client-owned "what defines anticipated maintenance / compliance / new-user
   work" signals from the Dan meetings. Routine deployment follows D05 after its full gate is green.
7. _Context update:_ promote the shipped lane to a `docs/facts.md` `F-ANTICIPATION-LANE` row citing
   AC-S18-1 … AC-S18-9, and update `docs/loop-state.md` at the slice boundary (keep headroom under its
   140-line cap).

**Deletion/merge recommendation.** KEEP this suite as the cycle's tracked spec; the
`docs/temp/process-auto-initiation-plan.md` packet stays disposable local evidence. It EXTENDS the
Console front door (S10 / `F-CONSOLE-APP-STATE`) and the notice planners (S13 / `F-NOTICE-ENGINE`)
rather than replacing them, and it does NOT supersede S13 — it builds the anticipation lane S13 left
as a manual CLI dry-run. If the Console app-state suites are later consolidated, this may MERGE into
that family as the "anticipation lane" section; until then keep it standalone.

**2026-07-13 audit hardening (QA-006).** A projected static id is no longer sufficient to render Start.
`ConsoleView` intersects it with the definitions actually loaded and scoped for the principal, excludes Retired
definitions, and still requires edit permission. Missing/unavailable definitions render Open the space; a stale
POST replaces the start control with that recovery, and pending starts are deduplicated. S56 moved starts to
the ordinary Live app-plane `/runs` endpoint.
