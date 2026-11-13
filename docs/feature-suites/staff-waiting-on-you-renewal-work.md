<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: staff-workflow-audit-2026-11-12 -->

# S280 — List the renewal work that is waiting on you

> Status: AUTHORING READY, intake 158. Status and waiting. Revised on November 12, 2026
> to carry one rule for a RentVine and Sheet difference by owner direction.
> Implementation and verification pending.

**Goal.**

The Dashboard's "Waiting on you" names the renewal work that follows from a staff
member's own messages, every row names its lease and opens it, the list survives a stale
read, notifications show staff work only, and a difference between RentVine and the
operating Sheet in rent or lease dates reads as information on every screen.

**Current state / intended end state.**

Verified by a read-only trace of the serving source:

- "Waiting on you" reads approval-queue records and live renewal run views through one
  inbox builder (`lib/attention/attention-queue.ts`, lines 110 to 212). Desk next actions
  never enter it.
- The builder deduplicates on run and field only
  (`lib/approval/needs-decision-inbox.ts`, lines 155 to 168), and live review uses one
  run id (`lib/lease-renewal/live-review.ts`, lines 33 to 37). A rent difference on many
  leases therefore collapses into one "Current rent" row. The row's label is the field
  and its link goes to the runs route, which redirects to Live renewal review with no
  anchor (`lib/approval/renewal-review.ts`, lines 67 to 70). An item link builder exists
  (`lib/lease-renewal/live-review-destination.ts`, lines 7 to 16) and only the lease page
  uses it.
- The Approval Queue prints the deduplicated total while its tabs use the undeduplicated
  flag count, and the Renewal reviews tab renders duplicate keys
  (`components/approval/ApprovalQueue.tsx`, lines 714 to 724 and 787;
  `components/approval/RenewalReviewPanel.tsx`, lines 113 to 117).
- A renewal read is stale 60 seconds after it was made and expires after 15 minutes
  (`lib/lease-renewal/live-lease-cache.ts`, lines 57 to 63 and 130 to 140). While stale,
  the run views throw and the renewal rows drop out
  (`lib/lease-renewal/renewal-review-board.ts`, lines 64 to 71). The panel then prints
  "The renewal source is stale. Retained comparisons cannot establish current decisions;
  use the existing source refresh and recheck" (`lib/lease-renewal/review-readiness.ts`,
  lines 10 to 13) with a "Try again" button and no control named Refresh
  (`components/console/DashboardAttentionQueue.tsx`, lines 89 to 96 and 145 to 154).
- My Work and the question "What work is assigned to me today?" read assigned tasks only
  (`lib/firestore/work-accountability.ts`, lines 217 to 302;
  `lib/assistant/work-adapter.ts`, lines 38 to 50). No lease has an assignee. S246
  R-S246-10 keeps an explicit task question on the My Work route.
- Notifications serve eight families. "Connections to set up" and "Space coverage" have
  no role check; maintenance tickets and maintenance communications are still listed and
  emitted although that component is retired (`lib/notifications/families.ts`, lines 88
  to 147; `lib/notifications/hub.ts`, lines 123 to 136; `lib/notifications/feed.ts`,
  lines 218 to 235).
- The lease's numbers check treats RentVine as the basis for rent and dates and shows a
  different Sheet value as information (S249 R-S249-1, decision D-OP-7). The
  reconciliation pipeline still raises a flag for the same difference
  (`lib/lease-renewal/pipeline.ts`), classed as financial or timing
  (`lib/lease-renewal/severity.ts`), and the Dashboard, the Approval Queue and Live
  renewal review show it as "High. Two sources disagree. Needs human approval." The
  precedence table lists RentVine first for both field types and marks every rule
  unconfirmed (`lib/lease-renewal/field-reconciliation-rules.ts`).

In the November 12 rehearsal, with several renewals in progress, the Dashboard listed
one unnamed rent flag, My Work showed no tasks, the Approval Queue said one thing needed
a decision, and Notifications listed two unnamed replies and setup notices (audit
findings A-08 and A-11). The lease with that rent difference said "Numbers agree" on its
own page.

D-OP-7 as first recorded covered the lease's numbers check only. The owner's November
12, 2026 direction extends it to every screen. The decision row in the suite index and
S249 R-S249-1 are amended in place and name this suite.

Intended end state: the panel adds renewal items that are recorded as following from the
viewer's own sends, points to the team's list for the rest, names the lease on every
difference row, keeps its rows with their read time when the read is stale, the
notification feed drops setup and retired items for staff, and a RentVine and Sheet
difference in rent or lease dates is information wherever it appears.

**Actors and entry conditions.**

Any signed-in staff member reads the Dashboard, the Approval Queue, My Work and
Notifications. Entry requires only the existing read capability and workflow access.

**What it is / how it functions.**

- **R-S280-1 — Add your own renewal follow-through.** "Waiting on you" lists, from
  recorded facts only, renewal items where the viewer is the responsible sender of the
  lease's current message: a reply to record ("101 Sample Pl: record the owner's
  decision"), a held or out-of-date message (S273) and an unconfirmed send to check. Each
  opens that lease step and states its basis: "Because you sent this message." No person
  assignment is created or inferred, and "last worked by" is not used.
- **R-S280-2 — Point to the team's list.** Below those items one line reads "12 renewals
  have a next action for the team. Open the Renewal Desk." with the count from the same
  batch membership the desk uses (S246 R-S246-10) and a link to the working batch. My
  Work's empty state carries the same line. My Work and the task question keep their
  task meaning.
- **R-S280-3 — Name the lease on every difference row.** A row for a live source
  difference reads the lease label and the field ("101 Sample Pl: Current rent") and
  opens that lease's item on Live renewal review through the existing item link. Rows
  are one per lease and field, not one per field for all leases. Past the panel's row
  limit one line reads "and 37 more on Live renewal review". The Approval Queue's total,
  its tab counts and the rows shown agree, and the Renewal reviews tab uses unique keys.
- **R-S280-4 — Keep the list when the read is stale.** When the renewal read is older
  than its freshness limit, the panel keeps its last renewal rows, marks them "Renewal
  data last read 11/12/2026, 12:20 PM CST" and offers "Refresh", which runs the existing
  bounded re-read. The earlier stale sentence is removed. A decision on a retained row
  still requires the existing current read; a retained row is information until then.
- **R-S280-5 — Show staff work in notifications.** "Connections to set up" and "Space
  coverage" go to Admins only. Maintenance ticket and maintenance communication families
  are neither offered nor emitted while that component is retired; stored history is
  untouched. Renewal communication items follow S273 and S275.
- **R-S280-6 — Treat a RentVine and Sheet difference in rent or dates as information
  everywhere.** For the current rent and the lease dates, when RentVine has a readable
  value and the operating Sheet holds a different one, no decision is raised. The
  Dashboard's "Waiting on you" and the Approval Queue do not list it, and its count
  leaves their totals. Live renewal review shows it in an information group, named by
  lease: "101 Sample Pl: the operating Sheet shows $1,750.00 and RentVine shows
  $1,700.00. RentVine is the basis." with a link to that lease's pending Sheet update
  (S278). It carries no severity and no "Needs human approval". The same sentence
  appears on the lease's numbers check, as it does today. A decision is still raised
  when RentVine has no readable value, when a staff working value differs from RentVine,
  when the sources are not RentVine and the Sheet, and for every other field. Nothing is
  written to either source by this rule.

**In scope / out of scope.**

In scope: the panel's renewal items and team line, row naming and links, count agreement,
stale-read retention and wording, the staff notification families, and the one rule for
a RentVine and Sheet difference in rent or lease dates. Out of scope: a
person-assignment model (S64), turning desk next actions into tasks, the precedence or
severity of any other field, and any automatic correction of the Sheet.

**Open questions & assumptions.**

- Assumption, taken as the default: "waiting on you" means assigned tasks plus work that
  follows from your own sends. It is the only personal basis the records hold today.
- The owner directed on November 12, 2026 that D-OP-7 extend to the Dashboard and
  Approval Queue flags. The specifics are the author's inference and can be changed
  before a launch: the rule covers the current rent and the lease dates, between
  RentVine and the operating Sheet, and the difference stays visible as information on
  Live renewal review. The precedence of the other field types stays unconfirmed.

**Cross-product impacts.**

The attention queue and inbox builder, the Dashboard panel, the Approval Queue and its
tabs, My Work's empty state, the notification families, menu and page, Help and the
control map.

**Authority and evidence map.**

| Input                                                                                                                                                          | Classification                   | Use and limitation                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------- |
| S246 R-S246-10 and scope, S267 R-S267-2, S147 attention queue, `docs/work-accountability-data-contract.md`                                                     | Active contracts                 | No assignment model; task questions keep My Work; one inbox for decisions.                         |
| README decision D-OP-7 and S249 R-S249-1, as extended on November 12, 2026                                                                                     | Owner decision                   | RentVine is the basis for rent and lease dates on every screen. A Sheet difference is information. |
| `lib/attention/attention-queue.ts`, `lib/approval/needs-decision-inbox.ts`, `lib/notifications/families.ts`, `lib/lease-renewal/field-reconciliation-rules.ts` | Committed implementation (trace) | Present sources, dedup key, families and the precedence table. Re-verify before editing.           |
| Staff workflow audit of November 12, 2026, findings A-08 and A-11                                                                                              | Intent evidence only             | Observed disagreement between five surfaces. Its "last worked" basis is replaced by own sends.     |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S280-1** — The attention queue gains one renewal source keyed by lease,
  audience and item kind, derived from sequence evidence and the responsible sender. A
  test with an observed owner reply on a lease the viewer sent to fails on the starting
  state, where the panel has no such row.
- **ARCH-S280-2** — The difference rows are keyed by run, lease row and field, and the
  panel total, the tab counts and the rendered rows come from one count.
- **ARCH-S280-3** — The panel holds its last renewal rows with their read time and
  distinguishes retained from current rows in its data, not only in text.
- **ARCH-S280-4** — One reconciliation rule classifies a RentVine and Sheet difference
  in the current rent or the lease dates as information, and the numbers check, the
  attention queue, the Approval Queue and Live renewal review all read that one result.
  The precedence table records those two field types as confirmed and every other type
  as unconfirmed. No rule applies a value. A pipeline test with a Sheet rent above the
  RentVine rent beyond the known add-ons fails on the starting state, which raises a
  decision.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S280-1** — After an owner reply on a lease the Editor sent to, "Waiting on you"
  lists "101 Sample Pl: record the owner's decision" and opens that step.
- **BEH-S280-2** — With rent differences on three leases, the Dashboard and the Approval
  Queue show three named rows, each opening its own item, and the counts agree.
- **BEH-S280-3** — With the renewal read stale, the rows stay, show when they were read
  and offer Refresh; after Refresh they are current.
- **BEH-S280-4** — An Editor's notification menu offers no setup, Space coverage or
  maintenance family; an Admin still sees the setup notices.
- **BEH-S280-5** — With no personal items, the panel and My Work both show the team line
  with the desk's count.
- **BEH-S280-6** — On the rehearsal lease whose Sheet rent differs from RentVine, the
  lease says "Numbers agree" with the Sheet value as information, the Dashboard and the
  Approval Queue list no decision for it, and Live renewal review shows one information
  row naming the lease, both amounts and RentVine as the basis.

**Human litmus outcome.**

### One place that says what needs me

**If this was built correctly:** A staff member opens the Dashboard and sees the leases
where an owner or tenant answered their message, with the address on each row, and a
pointer to the team's renewal list. A row that says two sources disagree names the lease
and opens it. A Sheet rent that is merely out of date never asks anyone for approval.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                   | Architecture outcome | Behavior outcome | Human litmus                      | Deterministic evidence / falsification                                      |
| --------------------------------------------- | -------------------- | ---------------- | --------------------------------- | --------------------------------------------------------------------------- |
| R-S280-1 your own follow-through              | ARCH-S280-1          | BEH-S280-1       | One place that says what needs me | AC-S280-1. Row, basis line and link for each item kind.                     |
| R-S280-2 team line                            | ARCH-S280-1          | BEH-S280-5       | One place that says what needs me | AC-S280-2. Count equals the desk's batch membership.                        |
| R-S280-3 named difference rows                | ARCH-S280-2          | BEH-S280-2       | One place that says what needs me | AC-S280-3. Three leases, three rows, agreeing counts, item links.           |
| R-S280-4 list kept when stale                 | ARCH-S280-3          | BEH-S280-3       | One place that says what needs me | AC-S280-4. Retained rows, read time, Refresh, no stale decision.            |
| R-S280-5 staff notifications                  | ARCH-S280-1          | BEH-S280-4       | One place that says what needs me | AC-S280-5. Families per role; stored history untouched.                     |
| R-S280-6 one rule for a source difference     | ARCH-S280-4          | BEH-S280-6       | One place that says what needs me | AC-S280-7. Same result on four screens; other cases still decisions.        |
| Safety boundary across the requirements above | ARCH-S280-1          | BEH-S280-1       | One place that says what needs me | AC-S280-6. No send, write or lookup happens outside the staff action shown. |

**Preservation set.**

- `tests/unit/s147-attention-queue.test.ts`: one row for a decision that two sources
  supply, and the queue's ordering.
- `tests/unit/needs-decision-inbox.test.ts`: existing dedup of the same decision from two
  sources; its key gains the lease row.
- `tests/unit/dashboard-attention-queue.test.tsx`: the bounded "Try again" re-read keeps
  its limit; its label and the stale text are updated.
- `tests/unit/notification-feed.test.ts` and
  `tests/unit/notification-menu-component.test.tsx`: the served family set is asserted per
  role in place of "exactly eight".
- The assistant's month answer equals batch membership (S246 R-S246-10).
- `tests/unit/s249-numbers-parity.test.ts`: the lease's numbers check wording and its one
  difference to settle.
- `tests/unit/lease-renewal-approval-queue-mapping.test.ts`: flags for every other field
  keep their class, severity and wording. The cases that expect a decision for a
  RentVine and Sheet rent or date difference are rewritten on purpose for R-S280-6.

**Adversarial acceptance checks.**

- **AC-S280-1** — Falsify ARCH-S280-1 and BEH-S280-1. For a reply, a held message, an
  out-of-date message and an unconfirmed send on leases the viewer sent to, the panel
  shows one row each with the lease label, the basis line and a link to that step. The
  same items on leases another person sent to do not appear as the viewer's.
- **AC-S280-2** — Falsify BEH-S280-5. The team line's count equals the working batch's
  next-action count on the same fixture, on the Dashboard and in My Work's empty state.
  "What work is assigned to me today?" still answers from tasks.
- **AC-S280-3** — Falsify ARCH-S280-2 and BEH-S280-2. With differences on three leases
  and two fields, rows equal the lease and field pairs, each link opens that item, the
  total equals the rows and the tab counts, and no duplicate key warning is logged.
- **AC-S280-4** — Falsify ARCH-S280-3 and BEH-S280-3. Age the read past its limit: rows
  stay with their read time; a decision control on a retained row requires the current
  read first; Refresh makes them current or reports the read failure in place.
- **AC-S280-5** — Falsify BEH-S280-4. For Editor, Approver and Admin, list the families
  offered and the items emitted. No maintenance item is emitted. Stored maintenance
  records are unchanged.
- **AC-S280-6** — Safety. Opening the Dashboard starts no lookup, save or send, and no
  row shows a reply body.
- **AC-S280-7** — Falsify ARCH-S280-4 and BEH-S280-6. With a Sheet rent and a Sheet
  lease end that differ from RentVine on three leases: the numbers check, the Dashboard,
  the Approval Queue and Live renewal review agree, with zero decisions and one
  information row per lease and field. Then vary one case at a time and expect a
  decision each time: RentVine unreadable, a staff working value that differs from
  RentVine, a market value conflict, and an owner decision conflict. No Sheet or
  RentVine write is attempted in any case.

**Forbidden actions / hard gates.**

No inferred assignment. No decision taken on a stale row. No change to the precedence or
severity of any field other than the current rent and the lease dates between RentVine
and the operating Sheet. No value applied to either source by a rule. No deletion of
stored notifications or maintenance history. No protected path edit.

**Dependencies / sequencing.**

Consumes S273's held and out-of-date states and S275's observed replies; without them
the panel lists the item kinds that exist. S284 qualifies the batch.

**Standalone delivery contract.**

- **Deliverable now:** The panel items and team line, named rows and counts, stale-read
  retention and the staff notification set, with tests and Help rows, reaching
  `ALL_GATES_GREEN`.
- **Consumes, but does not assume:** S273 and S275 states, shown when present.
- **Externally blocked effect:** None.
- **Produces for downstream suites:** A lease-keyed attention item for S284's journeys.

**Verification and delivery contract.**

1. Before editing, prove BEH-S280-1 to BEH-S280-3 and BEH-S280-6 fail on the starting
   state and record the preservation baseline separately.
2. Run focused unit and rendered checks for every ARCH, BEH and AC row.
3. For an authorized candidate run `bash scripts/verify.sh` and `npm run test:e2e:core`,
   complete the scoped S284 qualification and follow the current release gates.
4. Report `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` only for an exact unavailable input or authority.

**Ordered prompt sequence.**

1. Re-verify the queue sources, the dedup key and the families.
2. Materialize the failing checks and the preservation baseline.
3. Add the renewal source and team line, then row naming and counts, then stale
   retention and the notification set, then the one rule for a source difference.
4. Falsify, run focused and canonical checks, update Help and current docs.

**Deletion/merge recommendation.**

Keep active until the panel items, named rows, retained list and the one difference rule
are represented by verified code, tests and current facts.
