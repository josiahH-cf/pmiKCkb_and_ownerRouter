<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-one-path-2026-11 -->

# S246 — Working batch and accurate renewal targets on the desk

> Status: AUTHORING READY: intake 112; implementation merged in PR #186 at `64a12692`. Resumed UX repairs and scoped qualification are recorded on `codex/renewal-one-path-ux`; production delivered at `ef81b891`, human verdict NOT RUN. Owner decisions D-OP-4 and D-OP-5 remain settled. This specification grants no provider effect.

**Goal.**

Staff open Renewals and see only the leases that need renewal work now, each with one stage and
one next step, and can tell at a glance what is still open from earlier months and why every
other lease is not on the list.

**Current state / intended end state.**

Verified at `6491c06f` (source) and by a read-only production observation of the default desk view
on November 5, 2026 at serving source `3f2e3f5d` (Admin session, no control activated; counts only,
customer values stay outside Git):

- `/lease-renewal` redirects to the desk at `app/lease-renewal/live/desk/page.tsx`. The default
  scope is the window from the first day of the current Central month to today plus 120 days
  (`lib/lease-renewal/desk-query.ts`, `lib/lease-renewal/assistant-source.ts`), plus due periodic
  reviews and retained unfinished work. The bare route opens the account's remembered view
  (`lib/lease-renewal/desk-preferences.ts`).
- Target membership comes only from the RentVine lease end date, the lease term and two text skip
  signals (`lib/lease-renewal/cohort.ts`). The lease's RentVine status is never read for
  membership. A pending or closed lease gets the move-out disposition unknown with reason
  `lease_not_active` (`lib/lease-renewal/move-out-disposition.ts`), which the lifecycle projection
  ignores (`lib/lease-renewal/lifecycle-category.ts`), so a closed lease inside the window reads
  "Upcoming".
- Observed default view: 38 rows of 375 loaded. Ten rows are leases RentVine reports Closed; six of
  those read Upcoming, Ready, next action "Owner outreach". Three rows carry "Source date changed"
  with a later RentVine end date and still read In progress. Three are month-to-month reviews, one
  has a move-out notice. Twenty-one are active fixed-term leases spread over four end months; five
  end in December, the month staff were working. "Rent verification" reads Needs verification on
  all 38 rows and the Action column reads "Owner outreach" on 30.
- A row carries about twenty facts. The address opens the lease in a new browser tab
  (`lib/lease-renewal/desk-destinations.ts`); owner and tenant names are filter links
  (`components/lease-renewal/RenewalDeskTable.tsx`).
- November 4 staff walkthrough (owner-held notes): the December list held seven leases, two no
  longer active; a remembered tenant filter was still applied; choosing a tenant name filtered the
  desk when the intent was to open the lease; saving a shared collection returned to the desk
  without applying it; several tabs accumulated.

Intended: the desk opens on a working batch that contains only real renewal targets, grouped by
what they need, with every excluded lease counted under a plain reason. The existing table, views,
filters, saved views and collections stay available one action away.

**Actors and entry conditions.**

Renewal staff with Renewals access read the desk; Editor or higher records work. RentVine lease
export and status table readable. A failed status-table or staff-record read degrades the affected
rows to an explicit retained state and never removes them from the list.

**What it is / how it functions.**

- **R-S246-1 — One target definition.** A lease is a renewal target for a month when RentVine
  reports it active, its term is fixed-term or needs review under S103, its end date falls in that
  month, no move-out is initiated, no skip signal applies and no completion is recorded for that
  cycle. One pure function owns this definition for the desk, the lease page and assistant answers.
- **R-S246-2 — Working batch as the default.** The bare desk route opens "This batch": the targets
  whose end date falls in the working month. The working month defaults to the next calendar month
  on the Central business date (D-OP-4) and changes with Previous month and Next month. The month
  and the count are stated in words above the list.
- **R-S246-3 — Carried over.** Targets from earlier months without a recorded completion, including
  the S232 ended-without-outcome set, show first as "Carried over", oldest end date first.
- **R-S246-4 — Not a renewal target, with a reason.** A lease RentVine reports closed or pending
  leaves the batch and is counted under "Not renewal targets" with its RentVine status name. Owner
  hold and program leases keep their existing reasons. The count opens the rows; every lease stays
  openable and workable (S154). Nothing is deleted or archived (D-OP-5).
- **R-S246-5 — Renewed in RentVine.** A lease whose recorded cycle date is earlier than the current
  RentVine end date (`lib/lease-renewal/cycle-source-date.ts`) leaves "This batch" and shows under
  "Renewed in RentVine, confirm and close" with two actions: record staff completion with that
  source evidence, or keep working. Nothing completes by itself.
- **R-S246-6 — Other groups as counts.** "Month-to-month reviews due", "Non-renewals to hand off"
  and "Coming up later" show as counts that open their rows. The S232 month context stays true.
- **R-S246-7 — One short row.** A batch row shows address and unit, tenant names, end date, one
  stage line with who it waits on and since when, and one next-step link, plus at most three tags
  (standing agreement, housing assistance, needs a check). Stage and next step come from the single
  S247 projection; until S247 is delivered the row shows the existing S232 status and action text.
- **R-S246-8 — Opening a lease.** Choosing the row or its next step opens the lease in the same tab
  at its current step. Back to renewals restores the same month, group and scroll position. Names in
  the batch list are text; name filters remain in the full table.
- **R-S246-9 — Everything else stays.** "All leases and filters" opens the existing table with its
  views, columns, filters, sorts, window chip, per-reason counts and URL keys unchanged. A saved view
  is offered as "Open my saved view" and no longer applies by itself on the bare route. A shared
  collection link opens the table filtered to that collection's membership. The working batch
  and table use one main landmark so assistive navigation can move directly to the desk.
- **R-S246-10 — Same answer everywhere.** A Dashboard assistant answer about a month's renewals
  uses the same target definition and names the excluded counts by reason. "This batch" and
  "working month" mean the next calendar month's renewal targets. A question about which leases
  need renewal work asks for lease records; an explicit task question retains the My Work route.
  Display phrases such as "Show me", "Tell me" and "Give me" keep the visible lease scope.
  An assignment filter follows explicit ownership wording such as "my", "mine" or "assigned to me".
  When its cached source is stale, the assistant waits for a current coherent read before stating
  the batch membership, or reports that the source could not be verified.
  A person-supplied numeric lease reference selects that exact lease within the current read
  scope. Its table link keeps the same selection; an unknown reference yields the empty result.
- **R-S246-11 — Counts reconcile.** The groups partition the loaded leases: their counts sum to the
  total loaded, and each lease is in exactly one group.
- **R-S246-12 — Fail closed.** When the status table or a lease's status cannot be read, the lease
  stays listed with "RentVine status unavailable" and is never excluded on a guess.

**In scope / out of scope.**

In scope: the target definition, batch presentation, grouping, counts, row content, same-tab
navigation, entry resolution, collection link repair and assistant parity. Out of scope: any
outreach, draft, lookup or provider write derived from grouping; changing the month-to-month
cadence; removing a view, filter, saved view or collection; a new person-assignment model; S64.

**Open questions & assumptions.**

- D-OP-4 (owner decision, November 5, 2026): the working month is the next calendar month and the desk always opens
  on the batch. Evidence: on November 4 staff worked December end dates and asked for "next month".
- D-OP-5 (owner decision, November 5, 2026): closed and pending leases leave the batch automatically with a visible
  reason and count.
- Assumption: an inactive property is excluded only when the RentVine read already exposes that
  fact for the lease. Both leases staff called inactive on November 4 read Closed in RentVine, so
  the lease status covers the observed cases. No property state is inferred.
- Reported timing practice (owner outreach early in the month, tenant offers mid-month) is context
  only and derives no deadline (D-TIMING-UNSET).

**Cross-product impacts.**

`lib/lease-renewal/cohort.ts`, `lib/lease-renewal/live-desk.ts`,
`lib/lease-renewal/lifecycle-category.ts`, `lib/lease-renewal/desk-query-v2.ts`,
`lib/lease-renewal/desk-worklist-views.ts`, `lib/lease-renewal/desk-preferences.ts`,
`lib/lease-renewal/desk-destinations.ts`, `components/lease-renewal/RenewalDesk.tsx`,
`components/lease-renewal/RenewalDeskTable.tsx`,
`components/lease-renewal/SharedLeaseCollections.tsx`, the Dashboard assistant's renewal adapter,
the Dashboard "Open the Renewals desk" link, the release assurance reconciliation and canary
landmarks (they follow the default view), the help guides and screenshots (S252).

**Authority and evidence map.**

| Input                                                             | Classification       | Use and limitation                                                                       |
| ----------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| `AGENTS.md`, `docs/facts.md` (D-LEASE-WORKABLE-AUTOSAVE, F-S154)  | Authority            | Every lease stays workable; membership is context, never a gate.                         |
| Committed code and tests at `6491c06f`                            | Implementation truth | Present membership, window, entry and row behavior.                                      |
| Read-only production desk observation, November 5, 2026           | Bounded observation  | Counts for the default view only; no control activated; not a behavior or failure proof. |
| November 4 staff walkthrough notes and November 5 owner direction | Intent evidence      | Accurate targets and simple entry; not policy, deadlines or permissions.                 |
| RentVine property active state                                    | External dependency  | Used only if the existing read exposes it; otherwise unset and nothing is inferred.      |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S246-1** — The desk orchestration shared by the desk page and the assistant carries one
  target projection that reads the lease status table. Fail-first: a fixture lease that is closed
  and ends inside the window projects Upcoming and actionable.
- **ARCH-S246-2** — The batch view is a presentation over the existing loaded desk rows, with no
  second inventory; group membership partitions the rows. Fail-first: no partition exists and the
  default scope mixes four end months with closed leases.
- **ARCH-S246-3** — Entry resolution opens the batch on the bare route and keeps explicit table
  links, `v=2` links and saved-view links on the table. Fail-first: the bare route applies the
  remembered view.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S246-1** — On a fixture date of November 5 the desk opens on December's targets only;
  closed and pending leases appear under "Not renewal targets" with their status name.
- **BEH-S246-2** — A lease with a later RentVine end date than its recorded cycle offers confirm
  and close; recording completion moves it out of the open groups; declining keeps it in the batch.
- **BEH-S246-3** — Choosing a row opens the lease in the same tab at its current step, and Back to
  renewals restores month, group and position.
- **BEH-S246-4** — The assistant's answer for a month lists exactly the batch membership and states
  the excluded counts by reason.
- **BEH-S246-5** — With the status table unreadable, every lease stays listed and labeled; none is
  excluded.

**Human litmus outcome.**

### Open Renewals and see this month's real work

**If this was built correctly:** A staff member opens Renewals in early November and sees the
handful of leases ending in December that still need work, anything left over from earlier months
above them, and a short line of counts for everything else. No moved-out or closed lease is in the
list. They choose a lease and it opens in the same tab at the step that needs them.

- Model verdict: RUN in the synthetic desk and assistant (J01–J03). L55 retains its literal per-reason count discrepancy under the settled assistance rule. See the [review](../evidence/renewal-one-path-ux-review-2026-11-06.md) and [individual litmus results](../evidence/renewal-one-path-litmus-2026-11-06.md).
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                        | Architecture outcome | Behavior outcome | Human litmus                                 | Deterministic evidence / falsification                                    |
| ---------------------------------- | -------------------- | ---------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| R-S246-1 one target definition     | ARCH-S246-1          | BEH-S246-1       | Open Renewals and see this month's real work | Fixture portfolio: each lease state yields the expected target verdict.   |
| R-S246-2 working batch default     | ARCH-S246-3          | BEH-S246-1       | Open Renewals and see this month's real work | Bare route on a fixed Central date renders the next month's targets.      |
| R-S246-3 carried over              | ARCH-S246-2          | BEH-S246-1       | Open Renewals and see this month's real work | Earlier-month unfinished and ended-without-outcome fixtures list first.   |
| R-S246-4 not a target, with reason | ARCH-S246-1          | BEH-S246-1       | Open Renewals and see this month's real work | Closed and pending fixtures counted with status name and still openable.  |
| R-S246-5 renewed in RentVine       | ARCH-S246-2          | BEH-S246-2       | Open Renewals and see this month's real work | Changed source date fixture offers both actions; no automatic completion. |
| R-S246-6 other groups as counts    | ARCH-S246-2          | BEH-S246-1       | Open Renewals and see this month's real work | Review, non-renewal and later fixtures land in their counted groups.      |
| R-S246-7 one short row             | ARCH-S246-2          | BEH-S246-3       | Open Renewals and see this month's real work | Row render test: five facts, one next-step link, at most three tags.      |
| R-S246-8 opening a lease           | ARCH-S246-3          | BEH-S246-3       | Open Renewals and see this month's real work | Browser check: same tab, step anchor, restored month and scroll.          |
| R-S246-9 everything else stays     | ARCH-S246-3          | BEH-S246-3       | Open Renewals and see this month's real work | Existing table URL keys, saved view and collection link tests stay green. |
| R-S246-10 same answer everywhere   | ARCH-S246-1          | BEH-S246-4       | Open Renewals and see this month's real work | Assistant month answer equals batch membership on the same fixture.       |
| R-S246-11 counts reconcile         | ARCH-S246-2          | BEH-S246-1       | Open Renewals and see this month's real work | Property test: group counts sum to total loaded; no lease in two groups.  |
| R-S246-12 fail closed              | ARCH-S246-1          | BEH-S246-5       | Open Renewals and see this month's real work | Unavailable status table fixture retains and labels every row.            |

**Preservation set.**

S122 views and counts, S123 retention identity, S124 move-out filters, S134 lifecycle labels in the
table, S166 saved views (reachable by link), S201 collection membership by lease and cycle, S232
window chip, ended-without-outcome scope and per-reason counts, the desk URL keys of
`lib/lease-renewal/desk-query-v2.ts`, S154 workability of every lease, source freshness banners,
the read-only desk smoke `scripts/smoke-renewal-desk-browser.mjs` and the release reconciliation
count of source, projected and rendered records.

**Adversarial acceptance checks.**

- **AC-S246-1** — Fixture portfolio with closed, pending, move-out, month-to-month, renewed in
  source, active in month, active in a later month and ended without outcome: each lease lands in
  exactly one group and the counts sum to total loaded (ARCH-S246-1, ARCH-S246-2, BEH-S246-1).
- **AC-S246-2** — Every existing desk URL, saved view and collection link renders the same table
  rows as before this suite; the bare route alone changes (ARCH-S246-3, BEH-S246-3).
- **AC-S246-3** — No group, count or row derives a draft, send, schedule, reminder, paid lookup or
  provider write, and an excluded lease still opens and saves work (R-S246-4, S154).
- **AC-S246-4** — The assistant answer and the desk agree on membership and excluded counts for
  the same month and fixture (BEH-S246-4).
- **AC-S246-5** — An unreadable lease status never removes a lease from the list (BEH-S246-5).

**Forbidden actions / hard gates.**

No lease is hidden without a counted reason. No provider write, send, draft or lookup. No inferred
property state, eviction or move-out. No customer value in fixtures, tests or documentation. No
protected-path change.

**Dependencies / sequencing.**

Consumes S103 lease term, S123 cycle date change, S124 move-out disposition, S232 scopes and
reasons, and the S247 stage projection when present. Produces the target definition and group
membership that S247, S248, S249 and S252 read. Independently buildable; recommended first in the
bundle because every later step depends on a trustworthy list.

**Standalone delivery contract.**

- **Deliverable now:** R-S246-1 to R-S246-12 with fixtures, focused tests, the updated desk smoke
  and the assurance landmark update.
- **Consumes, but does not assume:** the S247 stage (absent: existing S232 status and action text);
  property active state (absent: unset, nothing inferred).
- **Externally blocked effect:** none.
- **Produces for downstream suites:** the target definition, group membership and counts.

**Verification and delivery contract.**

1. Before edits, record the current readback, the preservation baseline and each ARCH and BEH check
   failing for the stated reason.
2. Run the focused checks for every ARCH, BEH and AC row; keep preservation separate.
3. Run `bash scripts/verify.sh`; audit secrets, PII, gates, runtime configuration and diff scope
   before any authorized delivery.
4. Report `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only under an explicit budget, or `BLOCKED` only
   for an exact unavailable external input after all fail-closed work is green.

**Ordered prompt sequence.**

1. Re-verify current code and take a read-only desk observation.
2. Materialize the ARCH and BEH checks, litmus and preservation baseline; record fail-first results.
3. Build the target definition, grouping, batch presentation, entry resolution and assistant parity.
4. Falsify, run focused and canonical tests, update the assurance landmarks and help content, and
   ship only when authorized.

**Deletion/merge recommendation.**

Remove this suite when its checks are represented by code, tests and current facts; keep S122,
S134, S166, S201 and S232 history unchanged.
