<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: staff-workflow-audit-2026-11-12 -->

# S283 — Keep staff screens accurate: times, what Prepare covers, staff wording, working controls and the notice basis

> Status: AUTHORING READY, intake 161. Accuracy cleanup. Revised on November 12, 2026 to
> carry filtered preparation, the read-only notice basis, and the removal of two dead
> controls and two labels by owner direction. Implementation and verification pending.

**Goal.**

Staff read one date and time format, prepare exactly the leases they are looking at and
know the count first, see staff wording and only controls that work, start a process run
once with a reason when it is refused, and read the shared notice basis on a lease
without being able to change it there.

**Current state / intended end state.**

Verified by a read-only trace of the serving source:

- Dates. `lib/date-display.ts` owns the settled formats: "MM/DD/YYYY" for a date and
  "MM/DD/YYYY, h:mm AM CDT" for an instant (S126 R-F06-01). These places format outside
  it: `components/lease-renewal/RenewalPreparedMessage.tsx` (lines 877, 881 and 1463; line
  881 prints an ISO date and a 24-hour time), `components/lease-renewal/RenewalOfferAnswers.tsx`
  (lines 107 to 124), `components/lease-renewal/RenewalMessagePreparation.tsx` (lines 379
  to 390), `components/lease-renewal/LeasePacketReadiness.tsx` (line 43),
  `components/lease-renewal/RenewalManualWorkspace.tsx` (lines 624 to 626),
  `components/gmail-hub/CommunicationComposer.tsx` (lines 1110, 1149, 1269, 1281 and
  1311), `components/gmail-hub/WorkflowCommunicationsHub.tsx` (lines 339 to 346), and the
  zoned formatter in `lib/gmail-hub/schedule-calendar.ts` (lines 153 to 163), which gives
  "Nov 1, 2026, 1:30 AM CDT".
- Preparation. "Prepare {month} leases" targets the selected month's dated, openable
  rows regardless of any filter (`components/lease-renewal/RenewalWorkingBatch.tsx`,
  lines 382 to 392). The target count exists only as a data attribute
  (`components/lease-renewal/RenewalKickoffPreparation.tsx`, lines 177 and 189 to 191).
  The remaining monthly allowance is known only on the server
  (`lib/lease-renewal/rentcast-quota.ts`, lines 12 to 54;
  `lib/lease-renewal/kickoff-support.ts`, lines 72 to 98). At the allowance the client
  keeps posting each remaining lease and each is answered "Comparison not run: monthly
  allowance reached" (lines 119 to 162 of the preparation component).
- Internal text. The Live renewal review page prints an engineering sentence that begins
  "Keep external actions blocked until" (`lib/lease-renewal/business-contract.ts`, lines
  155 to 162). Documents shows raw fact keys
  (`lib/lease-documents/lease-packet-readiness.ts`, lines 183 to 207 and 470 to 474;
  `lib/lease-documents/evaluate-packet.ts`, lines 840 to 864). The process form asks an
  Editor for "Owner UID" (`components/workflows/ProcessDefinitionListClient.tsx`, lines
  178 to 262). Packet and process readiness views label a default as "Engineering
  default, not yet approved by the client" (`lib/lease-documents/lease-packet-readiness.ts`,
  `lib/lease-renewal/template-process-readiness.ts`). The step list marks a step that
  does not apply with the chip "Not part of this lease's path"
  (`lib/lease-renewal/renewal-path.ts`,
  `components/lease-renewal/RenewalFocusViewPane.tsx`).
- Controls that cannot work. Connections offers a Connect button on the QuickBooks card
  although the app has no QuickBooks sign-in (`lib/connections/connector-catalog.ts`,
  `components/connections/ConnectionCenter.tsx`). The Approval Queue's bulk actions
  include Execute, which skips every item and attempts no write
  (`components/approval/ApprovalQueueBulkPanel.tsx`, `lib/firestore/approval-queue.ts`).
- Runs. Starting a run mints a new id on every call (`lib/firestore/workflows.ts`, lines
  237 to 330). Any refusal shows "Could not start a run." and discards the server's
  reason (`components/desk/SpaceDeskRunPanel.tsx`, lines 56 to 77).
- Notice basis. The shared notice timing basis selector renders at the top of the lease
  workspace body and is hidden in Guided view only after the client reveals the view
  (`components/lease-renewal/RenewalWorkspace.tsx`, lines 676 to 689 and 1996 to 2060),
  so it can show during load. It saves on selection for every renewal
  (`components/lease-renewal/NoticeTimingBasisSelection.tsx`, lines 155 to 233), and
  Editors may select it (`lib/lease-renewal/role-action-governance.ts`, lines 62 to 73).

Audit findings A-12, A-14, A-19 and A-20 observed these on synthetic data.

Five earlier rules kept part of that state: S249 R-S249-3 prepared the whole month
whatever the filter showed; the owner's November 3 answer under S125 let an Editor select
the notice basis on a lease; a recorded default kept the QuickBooks Connect button; a
pinned check kept the bulk Execute option; and S247 R-S247-2 and S235 R-S235-2 required
the two labels. The owner's November 12, 2026 direction retires all five. Each owning
suite, the facts ledger and the router are amended in place and name this suite.

Intended end state: the listed renderings use the settled formats; Prepare covers the
leases shown and states its count and allowance before the click; the listed internal
text and the two labels are replaced by staff wording; the two dead controls are gone; a
run starts at most once per click and a refusal gives its reason; and the lease shows
the notice basis as a read-only line that an Admin changes in Admin.

**Actors and entry conditions.**

Any staff member reads these screens. Editors with existing capabilities start
preparation and process runs. An Admin sets the shared notice timing basis. The only
capability change is that selecting the notice basis becomes an Admin action.

**What it is / how it functions.**

- **R-S283-1 — Use the settled date and time formats.** Every rendering listed above uses
  the `lib/date-display.ts` helpers: dates as MM/DD/YYYY and instants as "MM/DD/YYYY,
  h:mm AM CDT" with the zone named (S126 R-F06-01; S233 R-S233-6). Date and time inputs
  keep their native formats. The date display inventory (`docs/date-display-inventory.md`)
  gains these rows. A pinned test that asserts an earlier shape is updated in the same
  change.
- **R-S283-2 — Prepare the leases shown, and say so before the click.** The action
  prepares the selected month's eligible leases that the table shows under the active
  filters and search. With nothing filtered that is the whole month. The button states
  the count: "Prepare 9 December 2026 leases", or "Prepare 4 of 9 December 2026 leases"
  with a filter on. One line beside it reads, for example, "4 leases shown. 3 need a
  comparison; 1 already has one. Monthly allowance: 41 of 50 left." The numbers come
  from the server-resolved targets and a new read-only allowance count (counts only).
  The client sends the shown lease and cycle targets. The server still resolves month
  membership, eligibility and the current cycle for each target from fresh inputs and
  refuses any target outside the selected month, so a filter can narrow the run and
  never widen it. Changing the filter or the month after the click does not retarget a
  run, and a continue revalidates the remaining targets of that same run. When the
  allowance cannot cover the comparisons needed, the line says how many it covers
  before the click. One click still starts the run, with no second approval. When the
  server answers that the allowance is reached, the client stops posting the remaining
  leases and lists them as not run.
- **R-S283-3 — Replace internal text with staff wording.** The engineering sentence on
  Live renewal review is removed from the staff page; its content stays in code and
  Help. A raw fact key shown in Documents is replaced by its staff label, with the key
  available in Verification, wherever no acceptance check pins the key itself. The
  process form's "Owner UID" gets a staff label and a hint that say what the value is
  and where an Admin finds it; the stored value and who may edit it are unchanged.
- **R-S283-4 — Start a run once and explain a refusal.** For a Space that still starts
  runs ([S286](renewal-spaces-guidance-without-runs.md) retires them for the renewal
  Spaces), one staff click creates at most one run: the client sends a per-click key and
  a repeated or double-clicked request returns the same run. A refusal shows the
  server's reason in staff words, for example "This process has no assigned staff member
  yet. An Admin assigns one before a run can start."
- **R-S283-5 — Show the notice basis on the lease and change it in Admin.** On a lease
  the shared notice timing basis is one read-only line for every role: "Notice timing:
  counted from the lease end date, in calendar days, 30 days. Applies to every renewal.
  Set on 11/03/2026." An Admin also sees "Change in Admin", which opens the existing
  Admin entry for the basis. Selecting or changing the basis is an Admin action there,
  with the existing version check, audit, operation receipt and readback, and still one
  selection with no second confirmation. Editors and Approvers cannot change it, in the
  page or through the route. When no basis is saved the line reads "Notice timing basis:
  not set. An Admin sets it in Renewal notice rules.", and the notice timing review
  shows Needs Verification as it does today. The line is never rendered above the step
  while the lease loads. The saved basis, its version and its history are unchanged.
- **R-S283-6 — Remove controls that cannot work.** Connections shows the QuickBooks card
  with the state "Not connected. This app has no QuickBooks sign-in." and no Connect
  button. The Approval Queue's bulk action list no longer offers Execute; Approve,
  Return for Revision, Assign, Snooze and Disable Action stay, and an approved action
  still runs only from its own exact review. Help and the control map drop both
  controls.
- **R-S283-7 — Show the steps that apply, and say Needs Verification for a default.**
  The step list and the Focus pane show only the steps on this lease's path, and the
  path line names the reason when a standard step is absent, for example "Standing
  agreement: the owner step is skipped." The chip "Not part of this lease's path" is
  retired. A link that names a step this lease does not use opens the current step with
  "This lease does not use that step. Showing the current step." In packet and process
  readiness views, a form family or rule still on its default reads "Needs Verification:
  PMI KC has not confirmed this form use." in place of "Engineering default, not yet
  approved by the client". A default still is not policy and still holds nothing by
  itself, and the Admin form-family field keeps its own hint.

**In scope / out of scope.**

In scope: the listed renderings, the Prepare scope, line and client stop, the three
internal texts, the two labels, the two removed controls, the run start and its refusal
text, and the notice basis line with its Admin-only change. Out of scope: retiring
process runs for the renewal Spaces
([S286](renewal-spaces-guidance-without-runs.md)), the maintenance notification families
([S280](staff-waiting-on-you-renewal-work.md)), any change to the RentCast allowance, the
per-cycle claim or the paid lookup gate, any QuickBooks integration, and any change to
what the saved notice basis means.

**Open questions & assumptions.**

The owner directed on November 12, 2026 that these proposals be carried. The specifics
below are the author's inference and can be changed before a launch:

- Assumption: "the leases shown" means the rows the monthly table shows for the selected
  month under every active filter and the search box. Carried-over, later, completed,
  retired, moved-out, pending, closed and unreadable targets stay outside the action
  whatever the filter shows.
- Assumption: the notice basis is changed on the existing Admin entry for it, by an
  Admin, with one selection. Approvers are treated like Editors.
- Assumption: a step that does not apply is not shown at all. The alternative is a muted
  chip with new wording.
- Assumption: the replacement label is "Needs Verification: PMI KC has not confirmed
  this form use." and the QuickBooks state is "Not connected. This app has no QuickBooks
  sign-in."
- Assumption: the allowance count shown is the same value the server enforces at
  reservation; the line is information and reserves nothing.

**Cross-product impacts.**

Lease and Communications date renderings and their tests, the date display inventory,
the monthly table's Prepare control, its support read and the preparation route, the
Live renewal review page, Documents readiness and packet panels, the process readiness
view, the step list and Focus pane, the process definition form, Connections, the
Approval Queue's bulk panel, the workflow run start route and panel, the lease workspace
render order, the notice basis control, route and role rules, the Admin entry for the
basis, Help and the control map.

**Authority and evidence map.**

| Input                                                                                                                                                        | Classification                   | Use and limitation                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| S126 R-F06-01, S233 R-S233-6, `docs/voice-and-audience.md`                                                                                                   | Active contracts and copy rules  | Date and instant formats, named zones, no internal jargon, dead controls removed, Needs Verification for uncertainty.       |
| Owner direction of November 12, 2026, to carry every audit proposal and retire the rules that held them                                                      | Owner decision                   | Authority for the filtered scope, the Admin-only basis, the two removals and the two labels. The specifics are assumptions. |
| AGENTS.md (owner approval of November 9, 2026, as amended), S249 R-S249-3 and R-S249-4 as amended                                                            | Authority and active contract    | One deliberate click, the shown leases of the selected month as scope, existing allowance and fences.                       |
| S125, S247 R-S247-2 and S235 R-S235-2 as amended on November 12, 2026; `docs/facts.md` Supersede Log                                                         | Active contracts                 | The amended rules this suite implements.                                                                                    |
| `lib/date-display.ts`, `components/lease-renewal/RenewalKickoffPreparation.tsx`, `lib/firestore/workflows.ts`, `lib/lease-renewal/role-action-governance.ts` | Committed implementation (trace) | Present formats, Prepare control, run start and role rule. Re-verify lines before editing.                                  |
| Staff workflow audit of November 12, 2026, findings A-12, A-14, A-19 and A-20                                                                                | Intent evidence only             | Observed on synthetic data.                                                                                                 |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S283-1** — The listed renderings call the shared date helpers. A source check
  over the listed files for direct locale or ISO formatting fails on the starting state.
- **ARCH-S283-2** — The preparation support read returns counts for targets, comparisons
  needed and allowance remaining, with no lease value, and the client reads them before
  the click.
- **ARCH-S283-3** — The run start accepts a client per-click key and stores it with the
  run, so the same key returns the same run. A test posting the same key twice fails on
  the starting state with two runs.
- **ARCH-S283-4** — A preparation run's targets are the targets the client listed that
  the server also resolves as eligible members of the selected month. The server never
  adds a target the client did not list and never accepts one outside the month. A test
  with a filter showing four of nine leases fails on the starting state, which prepares
  nine.
- **ARCH-S283-5** — The notice basis has one writer, the Admin entry, and the route
  refuses a non-Admin actor before any write. The lease renders a read projection of
  the saved version. A route test in which an Editor selects a basis fails on the
  starting state, which saves it.
- **ARCH-S283-6** — The QuickBooks card carries no connect action in the connector
  catalog, and the bulk action list has no Execute option. Neither is hidden by style.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S283-1** — A scheduled message reads "Scheduled for 11/13/2026, 9:00 AM CST" on
  the lease and in Communications, and no listed surface shows another date shape.
- **BEH-S283-2** — With a filter showing four of nine December leases, the button reads
  "Prepare 4 of 9 December 2026 leases", the line's counts equal the lookups the
  comparison stand-in then records, and only those four leases are prepared.
- **BEH-S283-3** — At the allowance the run stops posting, and the remaining leases are
  listed as not run.
- **BEH-S283-4** — An Editor sees none of the three internal texts.
- **BEH-S283-5** — A double click on Start run creates one run; a refused start shows
  its reason.
- **BEH-S283-6** — An Editor sees the notice basis as one read-only line and cannot
  change it. An Admin changes it on the Admin entry and every lease shows the new line.
  During a slow lease load the line never appears above the step.
- **BEH-S283-7** — Connections shows QuickBooks with its state and no Connect button,
  and the Approval Queue's bulk actions do not include Execute.
- **BEH-S283-8** — A lease on a standing agreement shows no chip for the owner step and
  a path line that says why. Documents shows "Needs Verification: PMI KC has not
  confirmed this form use." where the engineering label was.

**Human litmus outcome.**

### Screens that say what is true in plain words

**If this was built correctly:** Every date reads the same way. A staff member filters
the month to the leases they mean to work, reads how many leases and lookups Prepare
will cover, and gets exactly those. A button that cannot do anything is not there, and a
button that cannot start a process says why. Nothing on a staff page reads like a note
to an engineer.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                   | Architecture outcome     | Behavior outcome       | Human litmus                                 | Deterministic evidence / falsification                                           |
| --------------------------------------------- | ------------------------ | ---------------------- | -------------------------------------------- | -------------------------------------------------------------------------------- |
| R-S283-1 settled date formats                 | ARCH-S283-1              | BEH-S283-1             | Screens that say what is true in plain words | AC-S283-1. Source check and rendered strings.                                    |
| R-S283-2 prepare the leases shown             | ARCH-S283-2, ARCH-S283-4 | BEH-S283-2, BEH-S283-3 | Screens that say what is true in plain words | AC-S283-2. Shown targets only; counts equal recorded lookups; stop at allowance. |
| R-S283-3 staff wording                        | ARCH-S283-1              | BEH-S283-4             | Screens that say what is true in plain words | AC-S283-3. Rendered pages for an Editor.                                         |
| R-S283-4 one run, explained refusal           | ARCH-S283-3              | BEH-S283-5             | Screens that say what is true in plain words | AC-S283-4. Same key twice; refusal text.                                         |
| R-S283-5 notice basis read on the lease       | ARCH-S283-5              | BEH-S283-6             | Screens that say what is true in plain words | AC-S283-5. Roles, route refusal, Admin change and delayed load render.           |
| R-S283-6 controls that cannot work            | ARCH-S283-6              | BEH-S283-7             | Screens that say what is true in plain words | AC-S283-7. Catalog, option list, Help and control map.                           |
| R-S283-7 applicable steps and default label   | ARCH-S283-6              | BEH-S283-8             | Screens that say what is true in plain words | AC-S283-8. Each path variant and each default state.                             |
| Safety boundary across the requirements above | ARCH-S283-1              | BEH-S283-1             | Screens that say what is true in plain words | AC-S283-6. No send, write or lookup happens outside the staff action shown.      |

**Preservation set.**

- `tests/unit/s249-batch-preparation.test.ts` and
  `tests/unit/s249-automatic-start.test.tsx`: one click, no automatic start, the server's
  membership and cycle checks, the per-cycle claim and the allowance. The case that
  expects the whole month to be prepared under a filter is rewritten on purpose for
  R-S283-2.
- `tests/unit/s233-communication-timing-and-labels.test.ts`: every instant names its
  zone; its expected strings move to the settled format.
- `tests/unit/s235-lease-packet-readiness.test.tsx` and
  `tests/unit/s253-packet-inputs-editor.test.tsx`: required packet labels. The default's
  label moves to the new wording on purpose for R-S283-7.
- `tests/unit/s247-renewal-path.test.ts`: which steps apply on each path. The cases that
  expect a "Not part of this lease's path" chip are rewritten on purpose for R-S283-7.
  The S254 litmus check L50 expects that chip; its recorded verdicts stay as they are,
  and a later litmus states the new expectation.
- `tests/unit/space-card-state.test.ts`: "Needs a process" for a mapped Space with no
  stored definition, outside the renewal Spaces.
- `tests/unit/approval-queue-component.test.tsx`: the 50-item selection cap and the other
  bulk actions. Its "keeps execute visibly guarded" case is rewritten on purpose for
  R-S283-6.
- `tests/unit/connector-setup-actions.test.tsx`: the other connectors' actions. The
  QuickBooks Connect case is rewritten on purpose for R-S283-6.
- `tests/unit/s125-notice-basis-selection-store.test.ts`: version conflict, audit,
  receipt and readback of a saved basis. The Editor cases in
  `tests/unit/s125-notice-basis-selection-control.test.tsx` and
  `tests/unit/s125-notice-basis-selection-route.test.ts` are rewritten on purpose for
  R-S283-5.

**Adversarial acceptance checks.**

- **AC-S283-1** — Falsify ARCH-S283-1 and BEH-S283-1. Render each listed surface with a
  date, an instant in standard time and an instant in daylight time. Each shows the
  settled format and names its zone. Inputs keep their native value format. The source
  check finds no direct formatting in the listed files.
- **AC-S283-2** — Falsify ARCH-S283-2, ARCH-S283-4, BEH-S283-2 and BEH-S283-3 in the
  guarded rehearsal with the comparison stand-in. With no filter the whole month is
  prepared. With a status filter, a group filter and a search each showing a subset,
  only the shown leases are prepared and the button and line state that subset. Post a
  target from another month or an ineligible lease by hand: refused, and the others
  proceed. Change the filter mid-run: the run's targets do not change. With the
  allowance set to reached part way through, posting stops and the unprepared leases
  are listed. Opening the desk, changing the month or the filter starts no lookup.
- **AC-S283-3** — Falsify BEH-S283-4. As an Editor, the Live renewal review page, the
  Documents step and the process form show no engineering sentence, no raw fact key
  outside Verification and no "Owner UID" label.
- **AC-S283-4** — Falsify ARCH-S283-3 and BEH-S283-5 on a Space that still starts runs.
  Post the same per-click key twice and double-click the button: one run. A refused
  start shows the server's reason in staff words.
- **AC-S283-5** — Falsify ARCH-S283-5 and BEH-S283-6. As Editor and as Approver the lease
  shows the line and no control, and a direct request to the route is refused with no
  write. As Admin the lease shows "Change in Admin"; one selection on the Admin entry
  saves a new version with its receipt and readback, and a stale version is refused.
  With no basis saved the line says so. Delay the lease load and capture each render:
  the line is never above the step.
- **AC-S283-6** — Safety. No paid lookup starts without the one click. No run, send or
  provider write is created by rendering.
- **AC-S283-7** — Falsify ARCH-S283-6 and BEH-S283-7. As Editor, Approver and Admin,
  Connections renders the QuickBooks card with its state and no Connect button, and the
  bulk action list has no Execute option. Every other connector action and bulk action
  still works. Help and the control map name neither removed control.
- **AC-S283-8** — Falsify BEH-S283-8. On a standing agreement, housing assistance,
  month-to-month and non-renewal lease, the step list shows only applicable steps with
  the path line, the retired chip text appears nowhere, and a link to an unused step
  opens the current step with its line. With a form family on its default, the packet
  and process readiness views show the Needs Verification line, nothing is held by the
  default alone, and the Admin field hint is unchanged.

**Forbidden actions / hard gates.**

No second approval and no automatic start for preparation. No lookup on page open,
filter or month change. No preparation target the server did not resolve into the
selected month. No change to the allowance, the per-cycle claim or the paid lookup gate.
No notice basis write by a non-Admin, and no change to a saved basis or its history by
this work. No QuickBooks sign-in built. No protected path edit.

**Dependencies / sequencing.**

Standalone. S273 and S275 use the settled instant format for their new lines. S286
retires run controls for the renewal Spaces and leaves R-S283-4 to the Spaces that still
run. S284 qualifies the batch.

**Standalone delivery contract.**

- **Deliverable now:** The date renderings, the Prepare scope, line and stop, the staff
  wording and labels, the two removals, the run start and refusal text, and the notice
  basis line with its Admin-only change, with tests, the inventory rows and Help rows,
  reaching `ALL_GATES_GREEN`.
- **Consumes, but does not assume:** Nothing from another suite.
- **Externally blocked effect:** None.
- **Produces for downstream suites:** One instant format for every new line in the batch.

**Verification and delivery contract.**

1. Before editing, prove BEH-S283-1, BEH-S283-2, BEH-S283-5, BEH-S283-6 and BEH-S283-7
   fail on the starting state and record the preservation baseline separately.
2. Run focused unit, rendered and rehearsal checks for every ARCH, BEH and AC row.
3. For an authorized candidate run `bash scripts/verify.sh` and `npm run test:e2e:core`,
   complete the scoped S284 qualification and follow the current release gates.
4. Report `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` only for an exact unavailable input or authority.

**Ordered prompt sequence.**

1. Re-verify each listed rendering, the Prepare control, the run start, the notice basis
   role rule and the two controls.
2. Materialize the failing checks and the preservation baseline, including the pinned
   cases this suite rewrites on purpose.
3. Move the renderings to the helpers, then the Prepare scope and line, the wording and
   labels, the two removals, the run start and the notice basis line.
4. Falsify, run focused and canonical checks, update the inventory, Help and current
   docs.

**Deletion/merge recommendation.**

Keep active until each item is represented by verified code, tests and current facts.
