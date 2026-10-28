<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-novdec-2026-10-28 -->

# S232 — November/December worklist reasons, ended-without-outcome visibility and explainable next actions

> Status: IN PROGRESS (merged to main at bf0c03f9 by PR #158, not served) — R-S232-1, R-S232-2, R-S232-6 and R-S232-8 are implemented with focused tests; R-S232-7 is implemented under its amended contract (fail-closed staff-record reads and retained skipped work; `start_cycle` keeps the existing S123/S144 restart, replay and stale-revision contract). R-S232-3 per-reason excluded counts and R-S232-4/R-S232-5 resolver links remain. Originally finalized 2026-10-28 from the November/December renewal Clarify Features initialization (intake 099). No client input blocks this code slice; the A5 timing basis and the unconfirmed notice rule hold only the timing labels named below.

**Goal.**

Bailey Whiting or Chasity Velazquez opens Renewals, selects November or December 2026, and can see
every lease that needs renewal work, why each row appears or is excluded, what it is waiting on and
the next useful action, including leases whose end date already passed without a recorded outcome.
A blocked action names the missing input, who resolves it and where.

**Current state / intended end state.**

Inspected at `a1c0fe8c` (source read, not a production observation):

- `/lease-renewal` redirects to the desk at `app/lease-renewal/live/desk/page.tsx`; a lease opens at
  `app/lease-renewal/live/desk/lease/[leaseId]/page.tsx` in Focus view with an in-place Full view
  switch. Views are "Active / upcoming", "All leases" and "Completed"; scopes are current window and
  tracked incomplete, tracked incomplete outside the window, "Month-to-month periodic review due" and
  "All loaded leases" (`lib/lease-renewal/desk-query-v2.ts`, `components/lease-renewal/RenewalDeskTable.tsx`).
- "Month" is a month input with "Apply month"; it matches the lease end month only. "Range start" /
  "Range end (at most 120 days)" covers 2026-11-01 to 2026-12-31 in one range. The active window is
  the first day of the current America/Chicago business month forward 120 days
  (`lib/lease-renewal/assistant-source.ts`, `lib/lease-renewal/desk-query.ts`) and is never displayed.
  Periodic-review rows stay in their own scope by the confirm-with-default in `docs/facts.md`.
- There is no overdue view. A lease whose end date passed with no recorded work becomes
  `outside` ("Later / outside current window"), so after November 1 an October-ending lease with no
  recorded outcome leaves the active list.
- Inclusion reasons are computed — eight cohort reasons in `lib/lease-renewal/cohort.ts` ("Ready to
  work", "Month-to-month", "Owner-authorized hold", "Program lease", "No end date on file",
  "Off-cycle end date", "Outside this window", "Lease term needs review") and retention states in
  `lib/lease-renewal/live-desk.ts` — but only `skip` rows and review action text show them; the
  retention label is a tooltip/data attribute; no window dates or per-reason excluded counts appear.
- Desk guidance (`lib/lease-renewal/desk-guidance.ts`) never produces "Blocked" and its blockers are
  always empty; the desk has no per-row waiting-on text (filter only), and the staff-lane and
  follow-up projections (`lib/lease-renewal/renewal-action-snapshot.ts`) are two waiting sources.
  The row shows a phase short label, so a brand-new record reads "Owner decision".
- Focus statuses come from `lib/lease-renewal/action-graph.ts` and `lib/lease-renewal/renewal-actions.ts`
  ("Ready for you", "Ready for another person", "Waiting on someone else", "Starts after earlier
  work", "Needs a check", "Review in Full view", "Done", "Not part of this lease's path"). A blocked
  action names prerequisite actions, not data fields; the responsible party is a role only; routes
  are API endpoints that are never rendered. The notice-timing issue says "Resolved by: an Admin
  (record the reviewed timing basis)" with no link, although `app/admin/page.tsx` renders
  `components/admin/MoveOutTimingBasisAdminPanel.tsx`.
- The lease-page notice status is computed with `renewalLetterSentIso: null` and
  `tenantResponded: false` hard-coded (`lib/lease-renewal/live-desk.ts`) against the seeded notice
  rule in `lib/lease-renewal/notice-rules.ts`, whose defaults are unverified.
- Retention holes: a lease reclassified `skip` drops its unfinished staff work from the row (asserted
  in `tests/unit/live-desk.test.ts`); a failed staff-record read yields an empty map so unfinished
  outside-window work shows as `outside` (untested); the explicit `start_cycle` operation in
  `lib/firestore/renewal-workspace.ts` has no completion guard (no UI caller).
- The lease page evaluates policy material with the UTC date slice of the read timestamp instead of
  the Central business date.

Intended: the same desk, routes and filters with a visible campaign window, a findable
ended-without-outcome set, a visible reason on every row and every excluded count, one waiting-on
projection shown per row, actionable next/blocked text with links, truthful notice timing and
fail-closed retention.

**Actors and entry conditions.**

Renewal staff with Renewals access (Editor or higher) reading the live desk; RentVine and the staff
record store readable. A failed source or staff-record read degrades the affected rows to an
explicit retained/unavailable state rather than blocking the desk. No role, owner or tenant decision
gates viewing.

**What it is / how it functions.**

- **R-S232-1 — Visible campaign window and month context.** The desk states the active window
  ("Renewal window: Oct 1, 2026 – Feb 25, 2027, Central" for today's computation) and the selected
  month or range. In a month view it states how many month-to-month periodic reviews fall in that
  month and opens them in one action; review rows otherwise keep their own scope.
- **R-S232-2 — Ended without a recorded outcome.** A lease that is active in RentVine, has no
  move-out or non-renewal initiated, is Fixed-term or Needs review under S103, has an end date before
  today's Central business date, and whose cycle for that end date has no recorded owner outcome,
  tenant outcome, non-renewal handoff or staff completion keeps a visible state "Ended {date} without
  a recorded renewal outcome". It is a filterable scope whose count shows on the default view; it is
  never silently `outside`. No outreach, draft or schedule is derived from it.
- **R-S232-3 — A visible reason on every row and every exclusion.** Each row shows its inclusion
  reason or retention label as text. "All leases" shows excluded counts per reason (for example
  "Outside this window", "Program lease", "Owner-authorized hold"), each opening its rows.
- **R-S232-4 — One status and waiting-on per row.** One projection supplies status, waiting-on
  party, the evidence source behind the status (the source read, staff record or provider receipt and
  its time) and next action to both the desk row and Focus. When the staff lane and the follow-up
  projection disagree the row reads "Needs a check" with both facts, never one silently. The row
  shows that next action instead of a phase short label; the "Renewal step" filter stays for link
  compatibility and is labeled as recorded progress.
- **R-S232-5 — Actionable next and blocked actions.** Each blocked or waiting action names (a) the
  missing input by its visible label (a field, configuration, decision or evidence), (b) who resolves
  it — the specific person when the app already records one (owner/tenant parties from the source,
  the communication's responsible staff member, an assigned follow-up), otherwise the role — and
  (c) an in-app link to the resolving control (timing basis → the Admin timing panel; a missing
  packet fact → that field; resource selection → Connections), or an explicit "outside the app"
  statement. A disabled control alone is never the explanation.
- **R-S232-6 — Truthful notice timing.** Notice status uses the actual recorded evidence for the
  lease cycle — a confirmed sent communication for that audience (S233) or a staff-recorded outreach
  — instead of hard-coded nulls, and shows the rule's verification state while the seeded rule is
  unconfirmed. "Notice overdue" never appears without its evidence basis and rule state. The 30-day
  move-out comparison keeps "Cannot determine" until an Admin records A5.
- **R-S232-7 — Fail-closed retention and no duplicate cycle.** A failed staff-record read marks the
  affected rows "Saved progress unavailable; retained until tracking state can be verified". A lease
  reclassified `skip` with unfinished recorded work stays visible as tracked, showing both reasons
  (the current assertion is changed intentionally). `start_cycle` keeps its existing contract: an
  explicit staff start with a reason keeps the earlier cycle, including unfinished work, as history
  (S144), the same request replays idempotently, a stale expected cycle or revision is refused
  (AC-S123-3), and a changed source date starts the history-preserving next cycle (AC-S123-5). The
  originally authored same-date refusal was withdrawn on 2026-10-28 because it broke those
  deliberate restarts.
- **R-S232-8 — Central business date everywhere.** Policy-material and notice evaluation on the lease
  page use the Central business date from `lib/lease-renewal/business-calendar.ts`.

**In scope / out of scope.**

In scope: desk/Focus projections and copy, the ended-without-outcome scope, reason and count
display, link targets, notice evidence wiring, retention fixes, the same-basis cycle guard, business
date use, and tests. Out of scope: changing the month filter to include periodic reviews (kept by the
existing confirm-with-default), any derived outreach or timer, a new person-assignment model, S64,
new providers or fields, forced phases, and legal notice policy.

**Open questions & assumptions.**

- No product decision blocks this slice. The notice rule values and the A5 basis are client/Admin
  inputs (C05 in `docs/open-blockers.md`); until supplied, their labels read unverified / "Cannot
  determine" and nothing is inferred.
- Reported practice (owner outreach in the first days of the month, tenant offers on the 15th,
  October 8 meeting notes) is context only, never a computed deadline.
- Assumption (labeled): "today" means the Central business date at render time.

**Cross-product impacts.**

`lib/lease-renewal/live-desk.ts`, `lib/lease-renewal/desk-query.ts`, `lib/lease-renewal/desk-query-v2.ts`,
`lib/lease-renewal/desk-guidance.ts`, `lib/lease-renewal/cohort.ts`, `lib/lease-renewal/renewal-actions.ts`,
`lib/lease-renewal/renewal-issues.ts`, `lib/lease-renewal/notice-rules.ts`,
`lib/lease-renewal/renewal-action-snapshot.ts`, `lib/firestore/renewal-workspace.ts`,
`components/lease-renewal/RenewalDeskTable.tsx`, `components/lease-renewal/RenewalFocusViewPane.tsx`,
`components/lease-renewal/RenewalWorkspace.tsx`, the Dashboard assistant's month answer (must agree
with R-S232-1/2 counts), saved desk views (S166) and shared collections (S201), the operator guide.

**Authority and evidence map.**

| Input                                                              | Classification       | Use and limitation                                                                                  |
| ------------------------------------------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, D-MTM-REVIEW-CADENCE, D-LEASE-WORKABLE-AUTOSAVE, S156 | Authority            | Every lease workable; no forced stages; review cadence drives visibility only.                      |
| Committed code/tests at `a1c0fe8c`                                 | Implementation truth | Present desk, Focus, retention and timing behavior and the holes above.                             |
| 2026-10-28 Clarify Features initialization (Obsidian inbox)        | Intent evidence      | November/December findability, overdue and unfinished visibility, reasons, actionable next actions. |
| October 8 meeting notes (owner-held)                               | Intent evidence      | Actors and reported timing practice only; not policy, permissions or deadlines.                     |
| A5 basis, notice rule confirmation (C05)                           | External dependency  | Hold only the timing labels; everything else ships.                                                 |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S232-1** — The live desk projection carries a window descriptor and an
  `ended_without_outcome` retention state computed from source term, end date, Central business date
  and cycle outcome records. Fail-first: a fixture lease ended last month with no outcome projects
  `outside`.
- **ARCH-S232-2** — One per-lease guidance projection (status, waiting-on party, missing input,
  resolver, link target) is consumed by both desk and Focus; a disagreement between staff-lane and
  follow-up inputs is represented, not resolved by precedence. Fail-first: desk and Focus read
  different waiting sources and the desk exposes none.
- **ARCH-S232-3** — Notice status consumes the lease cycle's actual sent/recorded outreach evidence
  and the rule verification state. Fail-first: hard-coded nulls in `buildLiveNotice`.
- **ARCH-S232-4** — Retention degrades fail-closed on staff-record read failure and `skip`
  reclassification; the cycle store refuses a same-basis duplicate while work is unfinished.
  Fail-first: the empty-map path, the current `skip` assertion and an unguarded same-basis
  `start_cycle`.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S232-1** — Selecting November 2026 shows the window, the month's rows, the month's periodic
  review count with its link, and the ended-without-outcome count.
- **BEH-S232-2** — Every row shows its reason; "All leases" shows per-reason excluded counts that
  open the right rows.
- **BEH-S232-3** — Every row shows status, waiting-on and next action text; a brand-new record no
  longer reads "Owner decision".
- **BEH-S232-4** — A blocked action shows the missing input, the person or role, and a working link;
  the notice-timing blocker links to the Admin timing basis panel.
- **BEH-S232-5** — Notice timing reflects a recorded send and shows the unverified rule state; a
  failed staff-record read or `skip` reclassification never hides unfinished work.

**Human litmus outcome.**

### Staff find November and December work and know what to do next

**If this was built correctly:** A staff member chooses November, sees the renewal window, every
lease needing work, the leases whose end date passed without an outcome, and why each row is there.
Opening a lease, they can say what it is waiting on and what to do next; when something is missing
they see what it is, who supplies it and a link to where it goes.

- Model verdict: NOT RUN — to be completed by the implementation runner with evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                         | Architecture outcome | Behavior outcome | Human litmus                                                   | Deterministic evidence / falsification                                                                                         |
| ----------------------------------- | -------------------- | ---------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| R-S232-1 window and month context   | ARCH-S232-1          | BEH-S232-1       | Staff find November and December work and know what to do next | Extend `tests/unit/renewal-desk-query.test.ts` and `tests/unit/s82-desk-query-v2.test.ts`: window text, review count and link. |
| R-S232-2 ended without outcome      | ARCH-S232-1          | BEH-S232-1       | Staff find November and December work and know what to do next | Extend `tests/unit/live-desk.test.ts`: ended/no-outcome, moved-out, month-to-month and completed variants.                     |
| R-S232-3 visible reasons and counts | ARCH-S232-1          | BEH-S232-2       | Staff find November and December work and know what to do next | Extend `tests/unit/s122-worklist-views.test.ts`: each cohort reason renders; counts sum to total loaded.                       |
| R-S232-4 one status and waiting-on  | ARCH-S232-2          | BEH-S232-3       | Staff find November and December work and know what to do next | Extend `tests/unit/s142-guidance-parity.test.ts` and `tests/unit/s82-desk-guidance.test.ts`: desk equals Focus; disagreement.  |
| R-S232-5 actionable blocked actions | ARCH-S232-2          | BEH-S232-4       | Staff find November and December work and know what to do next | Extend `tests/unit/s142-renewal-actions.test.ts`: input, resolver and link for each blocker kind; no bare disabled control.    |
| R-S232-6 truthful notice timing     | ARCH-S232-3          | BEH-S232-5       | Staff find November and December work and know what to do next | Extend `tests/unit/s125-move-out-timing.test.ts` and `tests/unit/live-desk.test.ts`: sent evidence and unverified rule state.  |
| R-S232-7 fail-closed retention      | ARCH-S232-4          | BEH-S232-5       | Staff find November and December work and know what to do next | Extend `tests/unit/live-desk.test.ts` and `tests/firestore/s123-cycle-store.test.ts`: read failure, skip, same-basis refusal.  |
| R-S232-8 Central business date      | ARCH-S232-3          | BEH-S232-5       | Staff find November and December work and know what to do next | Extend `tests/unit/business-calendar.test.ts`: 23:30 Central on Oct 31 evaluates as Oct 31, not Nov 1.                         |

**Preservation set.**

`tests/unit/s123-cycle-source-date.test.ts` (AC-S123-1 to AC-S123-7), `tests/unit/s134-lifecycle-category.test.ts`,
`tests/unit/s82-desk-query-v2.test.ts` URL keys and saved-view compatibility, S124 move-out filters,
S102/S153 rent labels (contractual base rent apart from lease total and unit listed rent), source
freshness banners, owner/tenant audience separation and per-audience copy, working-value comparisons,
the source-conflict filter,
S166 saved views, S201 collection membership by lease and cycle, the read-only desk smoke and the
canonical gate.

**Adversarial acceptance checks.**

- **AC-S232-1** — Fixture portfolio on 2026-11-02 Central: an October-ending active fixed-term lease
  with no outcome appears in the ended-without-outcome scope with its date; the same lease with a
  recorded non-renewal, a move-out notice or a staff completion does not (ARCH-S232-1, BEH-S232-1).
- **AC-S232-2** — Per-reason excluded counts plus included rows equal total loaded; every count opens
  exactly its rows (ARCH-S232-1, BEH-S232-2).
- **AC-S232-3** — For every action-graph blocker kind, the rendered text contains the input label, a
  person or role and a link whose target renders the resolving control; desk and Focus agree for the
  same lease (ARCH-S232-2, BEH-S232-3, BEH-S232-4).
- **AC-S232-4** — A lease with a confirmed sent tenant notice never reads "Notice overdue" for that
  cycle; an unverified rule always shows its unverified state (ARCH-S232-3, BEH-S232-5).
- **AC-S232-5** — Staff-record read failure, `skip` reclassification and a same-basis `start_cycle`
  each leave unfinished work visible and create no second cycle (ARCH-S232-4, BEH-S232-5).
- **AC-S232-6** — No row, count or scope derives a draft, send, schedule, reminder or timer, and no
  phase gate is reintroduced (preservation of D-MTM-REVIEW-CADENCE and S156).

**Forbidden actions / hard gates.**

No outreach, draft, schedule or timer derived from desk state; no invented timing policy; no person
inferred from a title or email; no provider write; no customer value in Git or fixtures beyond
synthetic data; no protected-path change.

**Dependencies / sequencing.**

Consumes S103 lease term, S122 views, S123 retention, S124 move-out, S125 timing, S142/S156 guidance,
S166 preferences and, when delivered, S233 sent-communication evidence (absent → staff-recorded
outreach only). Produces the per-lease guidance and ended-without-outcome state that S238's
walkthrough uses. Independently buildable.

**Standalone delivery contract.**

- **Deliverable now:** R-S232-1 to R-S232-8 with fixtures, focused tests, operator-guide updates and
  this suite's evidence.
- **Consumes, but does not assume:** S233 sent evidence (unset → recorded outreach or none); A5 and
  notice-rule confirmation (unset → unverified / "Cannot determine").
- **Externally blocked effect:** none for the code slice; confirmed timing labels wait on C05.
- **Produces for downstream suites:** guidance projection, window descriptor, ended-without-outcome
  scope and per-reason counts.

**Verification and delivery contract.**

1. Before edits, record the current readback, the preservation baseline and each ARCH/BEH check
   failing for the stated reason.
2. Run the focused checks for every ARCH, BEH and AC row; keep preservation separate.
3. Run `bash scripts/verify.sh` and `npm run test:e2e:core`; audit secrets, PII, gates, runtime
   configuration and diff scope before any authorized delivery.
4. Report `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only under an explicit budget, or `BLOCKED` only for
   an exact unavailable external input after all fail-closed work is green.

**Ordered prompt sequence.**

1. Re-verify current code and a read-only desk observation.
2. Materialize the ARCH/BEH checks, litmus and preservation baseline; record fail-first results.
3. Build the window, scope, reasons, guidance, links, timing evidence and retention fixes.
4. Falsify, run focused and canonical tests, update the operator guide, and ship only when
   authorized.

**Deletion/merge recommendation.**

Remove this suite when its checks are represented by code, tests and current facts; keep S122–S125
and S142 history unchanged.
