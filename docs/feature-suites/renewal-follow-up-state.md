<!-- spec-shape: overhaul-v1 -->
<!-- cherry-bridge-notes: N11 -->

# S75 — Renewal follow-up state: waiting-on, last-followed-up, and the answer on auto-send

> New 2026-08-24 from the client's "Cherry Bridge Renewal Fixes Needed" note **N11** ("Waiting on
> owner/tenant? note last follow-up? auto-send?"). Owner decision Q10 = **A**: specify the permitted
> equivalent and record the auto-send ask as answered-not-possible under D33. Specification only — this
> suite changes no product code until an implementation session picks it up.

> **Amended 2026-08-25 for HV-010 (owner decision).** Asked for the real notice-timing numbers, the
> owner answered that they **vary by property**. That answer cannot be entered today. The rule model
> already supports three scopes resolved most-specific-wins (lease > property > global) in
> `lib/lease-renewal/notice-rules.ts`, but `components/admin/NoticeRulesAdminPanel.tsx` edits only the
> global scope, and its own comment records property and lease overrides as "a separable follow-on".
> So the engine exists and the screen does not, exactly as this suite's follow-up statuses exist and
> are never fed. `AC-S75-10`-`AC-S75-12` specify the override screen. Note also that the three
> rendered timing lines sit over FOUR settings plus an on/off flag, so answering the lines leaves one
> setting unanswered.

**Goal.** An operator can see at a glance who a renewal is waiting on and when it was last followed up,
and the app raises an internal nudge when a thread goes quiet — with a pre-composed, addressed, **unsent**
draft a person sends. The follow-up engine for all of this is already written, tested, and starved of
its two inputs; this suite feeds it.

**What it is / how it functions.**

_Current state, verified in-repo — the engine exists and cannot run._ `NoticeStatusCode` in
`lib/lease-renewal/notice-reminders.ts` already contains `awaiting_response` and `follow_up_due` with
human labels. The follow-up cadence is computed from `renewalLetterSentIso` and `tenantResponded` — and
**all three production callers hardcode those to `null` and `false`**. The consequence is that both
statuses are unreachable dead code and the "Follow-up due" line can never render, no matter what
happens on a lease. Separately, `planCallTasks` already suppresses a nudge when contact is on file
within N days, and it always sees "no contact on file", so it always nudges.

_Asks 1 and 2 are therefore a small, unblocked slice._ Nothing needs to be invented: two fields need to
be persisted and passed in. A renewal records who it is waiting on (owner or tenant) and the timestamp
of the last follow-up, the letter-sent timestamp stops being hardcoded null, and tenant response stops
being hardcoded false. The existing status vocabulary and suppression logic then work as written.

_Ask 3 — auto-send — is doubly barred, and the answer is no._ Two independent rules close it. First,
`AGENTS.md` carries a blanket invariant against any autonomous, scheduled, bulk, or model-triggered
client-facing send. Second, D33 permanently closed the renewal and maintenance send keys. Only a new
explicit owner decision superseding D33 could change that, and no such decision exists. This is recorded
here as an answered question, not an open one.

_The permitted equivalent, which is the designed end state anyway._ The app detects silence, raises an
**internal staff nudge**, and pre-composes an addressed **unsent** Gmail draft that a person reviews and
sends. That gives the team the outcome they described — nothing falls through the cracks — without any
message leaving the system unattended.

_S31 is fully unblocked build work._ The quiet-thread selector, the "No reply in N days" prompt, and
watch auto-renew are specified in full in S31 and **verified absent from disk today**, with no owner
dependency of any kind. Feeding this suite's two fields is what makes S31's selector able to select
anything.

**Open questions & assumptions.**

- **Open — `Q-S75-FOLLOWUP-CLOCK`.** Two follow-up clocks exist and disagree: the notice rule's
  `followUpIntervalDays` is 10 days (unverified), and S31's `followUpAfterDays` is 3 business days
  (assumed). One of them has to win, or the operator sees two different "due" answers for one lease.
  Reconcile before either renders.
- **Open — `Q-S75-WAITING-ON-GRANULARITY`.** Is "waiting on tenant" one state, or does the team
  distinguish waiting-on-signature from waiting-on-reply? The client wrote one phrase; the workflow may
  need two.
- **Assumption — `A-S75-WAITING-ON-DERIVED`.** Waiting-on is derived from recorded workflow events
  (letter sent, response captured, decision recorded) rather than set by hand, with a manual override
  available when reality disagrees.
- **Assumption — `A-S75-NUDGE-IS-INTERNAL`.** The nudge is an internal staff notification. It is never a
  client-facing message, and it never becomes one by configuration.

**Cross-product impacts.** S31 (Gmail reply-watch and follow-up) is the direct consumer: it is specified,
absent from disk, and starved by exactly the two fields this suite persists — these two land together or
neither works. S39's internal notification centre carries the nudge. S72's step 5 needs tenant-response
capture to exist before it can become reachable at all, so this suite is a prerequisite for that step
leaving its not-built-yet state. S24 governs what any composed draft may claim. S15's Gmail hub composes
the unsent draft. D33 and the blanket no-autonomous-send invariant bound the whole suite.

**Adversarial acceptance checks.**

- **AC-S75-1** — a renewal renders an explicit waiting-on state naming owner or tenant. A fixture that
  has sent a letter and received no response renders "waiting on tenant"; today no fixture can reach
  that state, which is the regression guard.
- **AC-S75-2** — a renewal renders the date it was last followed up, and that date changes when a
  follow-up is recorded.
- **AC-S75-3** — `renewalLetterSentIso` and `tenantResponded` are populated from persisted workflow
  state in every production caller. A test asserts no production caller passes a hardcoded `null` or
  `false` for either, closing the exact gap that makes today's statuses unreachable.
- **AC-S75-4** — the `awaiting_response` and `follow_up_due` status codes are reachable. A fixture
  produces each one, and the "Follow-up due" line renders.
- **AC-S75-5** — `planCallTasks` suppresses its nudge for a fixture with contact on file inside the
  window, and raises it outside the window. Today it always raises, because it always sees no contact.
- **AC-S75-6** — exactly one follow-up interval governs a lease. A fixture asserts the notice-rule
  interval and the S31 interval resolve to a single value, so an operator cannot be shown two different
  due dates for one lease.
- **AC-S75-7** — a quiet thread produces an **internal** notification and a pre-composed **unsent**
  Gmail draft addressed to the right recipient set. A test asserts the draft exists, is unsent, and that
  no send is issued by the detection path under any fixture, flag, or elapsed time.
- **AC-S75-8** — no scheduled, batched, elapsed-time, or model-triggered path can issue a client-facing
  send. A fixture that advances the clock arbitrarily produces nudges and drafts only, and the refusal
  cites D33 / the blanket invariant by name.
- **AC-S75-9** — the manual waiting-on override persists, is attributed, and is reversible, and it never
  writes to RentVine or the Sheet.

- **AC-S75-10** — an Admin can record notice-timing values at the property scope, and a lease under
  that property resolves to them while a lease under an unconfigured property resolves to the global
  defaults. A fixture with one property override asserts both outcomes from the same rule set, so
  most-specific-wins is observable rather than merely implemented.
- **AC-S75-11** — the override screen exposes all FOUR timing settings plus the enabled flag, not the
  three lines the Space currently renders. A fixture asserting only three editable settings fails,
  closing the gap where confirming the rendered lines leaves the notice-deadline month offset
  unanswered.
- **AC-S75-12** — a scope whose values an Admin has not confirmed still renders its Needs Verification
  marker, and confirming at the property scope clears the marker for leases under that property only.
  A fixture asserts that confirming one property does not mark another property's values verified.

**Forbidden actions / hard gates.** No autonomous, scheduled, bulk, or model-triggered client-facing
send — this is the invariant the client's third ask runs into, and it is not negotiable at the suite
level. D33's permanent closure of the renewal and maintenance send keys stands; this suite does not open
them, propose opening them, or build a path that would work if they were opened. The nudge is internal
only and must not be configurable into a client-facing message. No draft composed by the detection path
may be sent by anything other than a person. Do not render a follow-up due date before
`Q-S75-FOLLOWUP-CLOCK` is reconciled — showing two different due dates for one lease is worse than
showing none. Waiting-on state is app-owned; it never writes to RentVine or the Sheet.

**Ordered prompt sequence.**

1. Reconcile `Q-S75-FOLLOWUP-CLOCK` to one interval.
2. Persist waiting-on and last-followed-up as app-owned fields, derived from workflow events.
3. Stop hardcoding `renewalLetterSentIso` and `tenantResponded` in all three production callers.
4. Prove `awaiting_response` and `follow_up_due` are reachable and the "Follow-up due" line renders.
5. Re-verify `planCallTasks` suppression now that contact-on-file is real.
6. Build S31's quiet-thread selector against the now-populated fields.
7. Raise the internal nudge into S39's notification centre.
8. Pre-compose the addressed unsent draft; prove no send path exists from detection.
9. Add the manual waiting-on override.
10. Reply to the client on ask 3: the app will not send on its own, here is what it does instead.

**Deletion/merge recommendation.** Keep as its own suite, and treat it as the cheapest real win in the
Cherry Bridge set — the status vocabulary, the follow-up clock, and the nudge suppression logic are
already written and tested; they have simply never been fed. Do not merge into S31: S31 is the reply-watch
mechanism, this is the state it watches. Record the auto-send refusal and its two independent grounds in
`docs/facts.md` so the question does not reopen by drift; if the owner ever supersedes D33, that is a new
decision record, not an amendment to this suite.
