<!-- spec-shape: overhaul-v1 -->
<!-- cherry-bridge-notes: N1, N2 -->

# S70 — Renewal queue integrity: active-property truth and one ordering

> New 2026-08-24 from the client's "Cherry Bridge Renewal Fixes Needed" notes **N1** ("Not an active
> property") and **N2** ("Dates need to be in chronological order"), grounded against the code rather
> than taken at face value. Owner decision Q9 = **A**: specify both a read-only live field-discovery
> step and an operator override. Specification only — this suite changes no product code until an
> implementation session picks it up.

**Goal.** The renewal queue shows the right leases, in the right order, and lets an operator remove a
lease that does not belong without waiting for a data fix. Today it does neither: nothing filters on
whether a property is still active, and nothing sorts. An operator opening the Renewal Desk sees a
list in whatever order RentVine's export happened to return, containing leases that have already moved
out — directly under a "Needs your attention" fold that _is_ sorted by soonest end date. Two lists on
one page, two orderings, and one of them carries leases that should not be there at all.

**What it is / how it functions.**

_Current state, verified in-repo._ `lib/lease-renewal/cohort.ts` excludes exactly three things:
month-to-month, owner-authorized, and program text signals. It reads `status` and `leaseStatus` **only
as substring haystacks** for those three phrases — there is no active/inactive concept anywhere on the
read path. Worse, `moveOutDate` is the **last fallback** for the card's "Ends" date, so a lease that
has already moved out still renders a plausible date and stays actionable. Ordering: there is no sort.
Zero `sort` or `localeCompare` calls exist in `components/lease-renewal/RenewalDesk.tsx`,
`lib/lease-renewal/live-desk.ts`, or `lib/lease-renewal/cohort.ts`; the queue inherits RentVine export
row order. `lib/lease-renewal/attention.ts` `compareEndDate` already sorts the attention fold by
soonest end date, which is why the two lists visibly disagree.

_Intended end state._ Three things become true. First, the queue is ordered by soonest lease end date,
ascending, with a stable deterministic tie-break, and the attention fold and the queue use the **same**
comparator rather than two. Second, a lease whose authoritative RentVine status says it is not active
is excluded from the queue by default and is reachable only through an explicit "show excluded" view
that states why each one was excluded. Third, because nothing in this repository currently knows which
RentVine field expresses "not active", an operator can take a wrongly-listed lease off the queue with
a recorded reason, and that override survives regardless of what field discovery eventually finds.

_Field discovery is a read-only step, not a guess._ No committed fixture carries a RentVine
active/inactive field. The implementation begins with a read-only discovery pass over the live export
that enumerates every candidate status-like field and its observed value distribution, writes the
finding to a committed, **bodyless** report (field names and value counts, never a customer value),
and only then proposes the filter. A filter written before that pass is a guess and is forbidden.

_Second-order defect that must be fixed with the sort._ A card with an open conflict hides its date
entirely today — the conflict pill occupies the same slot. Sorting alone therefore still reads as an
ordering violation to the operator, because the cards they cannot verify are exactly the ones whose
date is invisible. The date and the conflict pill must both be visible on a conflicted card.

**Open questions & assumptions.**

- **Open — `Q-S70-ACTIVE-FIELD`.** Which RentVine field authoritatively expresses "not an active
  property"? Unknown in-repo; no committed fixture carries one. Resolved only by the discovery pass.
- **Open — `Q-S70-EXCLUDE-SEMANTICS`.** Does the client mean the _property_ is no longer managed, the
  _lease_ has ended, or the owner has left the portfolio? These are three different fields and three
  different exclusions. The override ships regardless; the automatic filter waits on this answer.
- **Assumption — `A-S70-SORT-KEY`.** "Chronological" means soonest lease **end** date first, matching
  the attention fold's existing `compareEndDate`. The client said "dates", and the end date is the only
  date the card renders.
- **Assumption — `A-S70-TIE-BREAK`.** Leases sharing an end date tie-break on the stable lease
  identifier so the order does not shuffle between reloads.
- **Assumption — `A-S70-OVERRIDE-IS-APP-OWNED`.** The override is an app-owned record. It never writes
  to RentVine or the Sheet.

**Cross-product impacts.** The attention fold (S42) and the Renewal Desk must share one comparator;
this suite removes the duplicate ordering rather than adding a third. S43's canonical workspace inherits
the same cohort, so an excluded lease must also stop appearing as a workspace target. S58's currency
contract governs how stale the underlying read may be before the queue may claim an ordering at all —
an ordering computed from an expired read is not an ordering the operator can trust. S71's address
label is what identifies each row, so a queue sorted correctly but labeled ambiguously is still
unusable; the two suites land together or the operator cannot tell which row moved.

**Adversarial acceptance checks.**

- **AC-S70-1** — the rendered queue is in non-decreasing lease-end-date order. A fixture whose input
  rows are deliberately shuffled relative to end date renders in sorted order, and a fixture with two
  identical end dates renders the same relative order on repeated renders.
- **AC-S70-2** — the Renewal Desk queue and the "Needs your attention" fold order the same fixture
  identically. A change to one comparator that is not made to the other fails this check by rendering
  two different sequences from one input.
- **AC-S70-3** — a card carrying an open conflict renders **both** its end date and its conflict
  indicator. A fixture with a conflicted lease asserts the date string is present in the card, not
  replaced by the pill.
- **AC-S70-4** — a lease whose authoritative status field marks it not active is absent from the
  default queue and present in the "show excluded" view, and that view states the exclusion reason for
  each row. Until `Q-S70-ACTIVE-FIELD` resolves, this check runs against the discovery report's named
  field and fails closed if that report is missing.
- **AC-S70-5** — the field-discovery report exists, is committed, and contains field names with value
  counts and **no customer value**. A report containing an address, resident name, or currency amount
  fails.
- **AC-S70-6** — an operator override removes a lease from the default queue, persists a reason, and is
  visible and reversible in the excluded view. Reloading the page preserves it; it changes no RentVine
  and no Sheet record.
- **AC-S70-7** — `moveOutDate` is no longer the silent last fallback for the "Ends" date. A fixture
  lease whose only date is a move-out date renders a labeled moved-out state rather than a plausible
  renewal date, and is not actionable.

**Forbidden actions / hard gates.** No autonomous, scheduled, bulk, or model-triggered client-facing
send. The override is app-owned only: it never writes to RentVine and never writes to the Sheet. No
active/inactive filter may be inferred, guessed, or hardcoded before the read-only discovery pass names
the field — a filter on a guessed field silently hides real renewal work, which is worse than showing
too many. The discovery report is bodyless: field names and value counts only, never a customer value,
address, resident, or rent. No lease may be excluded without a recorded, readable reason. Sorting must
not change which leases are in the cohort; ordering and filtering are separate changes with separate
checks.

**Ordered prompt sequence.**

1. Read-only discovery pass over the live export; emit the bodyless field report. Do not filter yet.
2. Extract one shared end-date comparator; point both the attention fold and the queue at it.
3. Render the date alongside the conflict pill on conflicted cards.
4. Add the operator override (record, reason, excluded view, reversal).
5. Only after step 1 names the field: add the default active-property exclusion behind the excluded
   view.
6. Retire `moveOutDate` as the silent "Ends" fallback; render an explicit moved-out state.

**Deletion/merge recommendation.** Keep as its own suite. It is the smallest slice that makes the queue
trustworthy and it is a prerequisite for S71 and S72 being verifiable by an operator. Do not merge into
S43 — S43 governs the per-lease workspace, and this suite governs what reaches it. Fold `A-S70-SORT-KEY`
into `docs/facts.md` once an operator confirms the end date is the intended sort key.
