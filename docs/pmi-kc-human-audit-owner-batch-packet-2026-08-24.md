# Human-audit owner batch packet — 2026-08-24

Seven decisions, one sitting. Four are the audit's `owner_decision` items. Three are effect-bearing
items the lane **refused to commit** after adversarial verification falsified the premises behind the
Q2=C effect-authority grant; they escalate here because refusing to commit must never strand an item
without a route to terminal (`AC-S69-35`).

Nothing was sent. Nothing was written to RentVine or the Sheet. Zero non-GET requests were issued by
the run. Totals remain **2 Pass / 10 `not_run`**.

Bodyless throughout: no resident name, address, rent figure, mailbox content, credential, or raw
OAuth URL appears here.

---

## Part 1 — The three refused effects (read this first)

Q2=C authorized committing `HV-002`, `HV-007`, and `HV-009`, each "with a proven reversal". Adversarial
verification, run **before any effect was attempted**, falsified that premise for all three.

### HV-002 — resolve one reconciliation flag

**Why it was refused.** The confirmation dialog is **severity-dependent**. `requiresAdmin` is true only
for High and Blocked flags; on a Low or Medium flag `requestSubmit` falls straight through to
`performSubmit`, which POSTs the resolve endpoint. On those cards the primary `Resolve` button **is**
the commit control. "Advance to the confirmation boundary and stop" would have written a durable
decision about a real client lease with nothing to stop at.

**Live state, verified read-only.** `/lease-renewal/live` renders 20 `Resolve` controls and the line
"20 items need a human decision". Every currently open item is **High** severity — Medium, Low and
Blocked are all absent — so today's live set does have a dialog. The hazard is real but not currently
triggered. No card renders a resolution line, so the "every flag unresolved" observation still holds.

**Also unresolvable as specified.** Your Q3 answer routed the write to "seeded test data on the
non-Production plane". The only non-Production plane in this repo refuses every durable mutation by
contract, so that half of the disposition cannot execute. And the item's "recorded resolution shows
the actor" clause cannot be satisfied on `/lease-renewal/live` at all — the resolved-flag line renders
status, kind, source/value and reason, but never the actor. The only surface that renders a resolution
actor is `/lease-renewal/property/{propertyKey}`.

**Your options.**

- **A (recommended).** Name one lease and the intended resolution; I execute it on a High card with
  your reason, then read back the receipt. One durable app-plane write, no RentVine, no Sheet.
- **B.** Accept the boundary proof as sufficient and close HV-002 without a write.
- **C.** Do it yourself in a sitting.

**Effect of each.** A closes the item with a real receipt and one real operational decision recorded.
B closes it with the guard proven but the receipt contents never observed. C is identical to A but
costs your time instead of mine.

### HV-007 — create-and-clean cycle

**Why it was refused.** "Reversal proven by readback" is false on **four of five legs**: the shipped UI
exposes no reversal control — forward-only ticket lifecycle, no placeholder removal, no un-resolve, no
mark-unread. Two of the legs operate on **real Live operational records**, not disposable fixtures, so
"app-owned create-and-clean" is the wrong description of them. Its own stop rule fires before any
effect.

**Your options.** Leave refused (recommended); or name which single leg you want exercised and accept
that it is one-way.

### HV-009 — Gmail push-watch

**Why it was refused.** It is not "only a push-watch". One confirmation produces three durable effects:
an app-plane claim written **before** the provider call and consumed even on failure, the provider
mutation itself, and an ongoing external push channel that keeps writing Production records for the
watch's lifetime. **No watch-stop path exists anywhere in the product**, so the reversal readback
`AC-S69-29` requires is unproducible — and the item's own expected pass state (watch **active**)
directly contradicts the reversal state the lane requires (**stopped**). The item cannot both pass and
be reversed.

**Your options.** Leave refused (recommended); or authorize a one-way watch with no reversal, knowing
it keeps writing until it expires on its own.

---

## Part 2 — The four owner decisions

### HV-004 — should an Admin be able to paste an API key into the Connections page?

**Verified read-only on the live deployment.** `/connections` renders exactly 2 API-key inputs and 2
`Save API key` buttons. All four safety properties the audit named **hold**: every input is
`type=password`, every input is empty on load, every input carries `autocomplete="off"`, and every Save
button is disabled while its input is empty.

**One audit claim is falsified.** The finding said the model had to expand a panel to find the boxes.
Both inputs sit **outside** any disclosure element — they are on the card directly, more prominent than
reported.

**Recommendation: A.** Take the two API-key boxes and Save button off the page; keep credential entry
in the server setup flow. Nothing is stored today, so this removes no working function, settles the
case as written, and fixes the page contradicting its own setup copy.

**Effect.** A: boxes come off; `Verify connection`, `Disconnect` and the OAuth `Connect with …` buttons
all stay; case CONNECTION-005 goes fail → pass. B (permit masked entry): the audit expectation is
amended instead of the code, and we owe a test pinning the properties.

### HV-005 — the premise is false; may we correct the record?

**This finding is wrong.** The maintenance owner-notice draft gate is **not** "ready but switched off".
It has been open since July: `gmail.maintenance_owner_notice.draft_create` carries
`production_allowed: true`, at the exact commit the audit ran against. **Four independent tests** pin
it. The registry holds **six open / thirty-five closed**, not the five/thirty-six the audit asserted,
and **zero** entries anywhere are "Approved for Execution" while closed — so the inconsistency the
finding describes does not exist on any key.

**Recommendation: accept the falsification.** No gate change, no edit to the protected registry file.
Correct finding FND-024-GATE-001 and the `F-MODEL-PROCESS-AUDIT-2026-08-17` row in `docs/facts.md`,
which currently carries the false statement.

**Effect.** Accept: two documentation corrections, zero product change, zero risk, and a live false
statement leaves `facts.md`. Re-check first: same destination, more time — unless it disagrees, which
would mean code contradicting four green tests, a much larger problem worth knowing about.

### HV-010 — what are our real renewal notice timing numbers?

**Three lines on screen, but four numbers to answer.** The Lease Renewals Space shows Notice deadline,
Operator warning, and Follow-up, each marked "Needs Verification". Underneath there are **four**
settings plus an on/off flag: notice deadline day of month (seeded 15), month offset (seeded −1, the
month before lease end), operator warning lead days (seeded 3), follow-up interval days (seeded 10),
rules enabled (seeded on). Answering "three values" leaves one unanswered.

**Recommendation.** If the seeded defaults match practice — due on the 15th of the month before lease
end, warned 3 days ahead, follow-up every 10 days, on — confirm them as global values on the `/admin`
Renewal Notice Rules panel with Confirmed ticked. Give the real number wherever it differs. Answer the
scope as "same for every property" unless it genuinely varies, because that is the only scope the admin
form can save today.

**Effect.** Confirm as-is: markers clear, nothing about date computation changes (those are already the
numbers in force). Different numbers: every lease's computed notice deadline, warning date and cadence
shift from that point on. Varies by property: the rule model supports per-property and per-lease
overrides with most-specific-wins, but there is no admin screen to enter them today.

**Note:** this interacts with S75 `Q-S75-FOLLOWUP-CLOCK` — the notice rule's 10 days and S31's 3
business days are two different clocks that must reconcile to one.

### HV-011 — may an audit run finish while honestly recording a blocked sign-in?

**This is about the audit tool, not the product.** No customer data, no email, no product screen.

**The rule contradicts itself.** The runner declares five identity classes and three legal readiness
values — `ready`, `blocked`, `not_required` — but the finalization check throws unless all five are
`ready`. Two of the three legal values can therefore never appear in a run that finishes. The strict
flag bites on both the finalize and validate paths.

**Recommendation: yes, but adopt two narrower rules** rather than widening the check. Accept
`not_required` only when no case in that run's inventory declares that role; accept `blocked` only when
every case depending on that role is itself finished with a finding recorded against it. Also split the
item: your answer covers steps 1–4, and step 5 (re-run and confirm it finalizes) tracks as follow-up
engineering verification once the change exists — otherwise this item can never close.

**Effect.** Approve: a change to the finalization check plus pinned tests; nothing in the product
changes; audit readiness records become accurate rather than all-green-or-absent. Leave as-is: the
sidecar stays unusable on any first pass that cannot provision all five identities.

---

## Not in this packet, and why

- **HV-003** needs a second managed identity at their own keyboard. Terminal only when that person is
  available.
- **HV-006** needs a microphone. Note: the item bundles a hardware-blocked half with a denial half that
  needs no microphone, so classifying the whole id `hardware_required` discards provable evidence —
  worth splitting.
- **HV-008** is refused outright and is not a decision. The grounds are the blanket
  no-autonomous/scheduled/bulk/model-triggered client-facing-send invariant, plus an irreversible
  durable Production association created before any send. (Citing `D33` alone, as the lane originally
  did, was too narrow to be accurate — corrected.)
- **HV-001** and **HV-012** are terminal `pass` and are never replayed or downgraded.
