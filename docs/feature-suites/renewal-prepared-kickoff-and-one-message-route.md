<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-one-path-2026-11 -->

# S249 — Renewal kickoff prepared ahead, with one message and one route to send it

> Status: AUTHORING READY: intake 115; implementation merged in PR #188 at `aec5a309`, including the D-OP-1 router amendment. November 6 UX repairs and qualification continue on `codex/renewal-one-path-ux`; release pending, human verdict NOT RUN. D-OP-1, D-OP-2 and D-OP-7 remain settled. This specification grants no provider effect.

**Goal.**

For every renewal target, the numbers check, the rent comparison, a suggested rent and the owner
message are ready when staff open the lease, so the staff member's work is to review, adjust the
number or wording, and send from one place.

**Current state / intended end state.**

Verified at `6491c06f`, in the in-app guides, and in the November 4, 2026 staff walkthrough:

- The rent comparison is started per lease by a staff action in the Market rent comparison section
  (`app/api/lease-renewal/market-comps/route.ts`), under a monthly allowance that defaults to 50
  billed lookups with a six-hour result cache (`lib/lease-renewal/rentcast-quota.ts`).
- The recommended rent is typed by staff. A comparison-based suggestion exists
  (`lib/lease-renewal/rent-suggestion.ts`, `lib/lease-renewal/renewal-recommendation.ts`) and a
  standing policy can prefill untouched terms (`lib/lease-renewal/renewal-pricing-policy.ts`).
- The owner message is assembled deterministically from saved facts
  (`lib/lease-renewal/current-renewal-message.ts`). When the only figure is a provider reference,
  the owner-facing body contains the sentence "The working offer remains a staff decision."
  (`lib/lease-renewal/renewal-message-content.ts`).
- There are three ways to get the message out, each on its own controls: copy the text; create an
  unsent Gmail draft through Preview, Review creation confirmation and Create
  (`components/lease-renewal/RenewalMessagePreparation.tsx`); or open the Communications composer
  in a new tab and use Save draft, Send or Schedule. The Gmail draft and the composer draft are
  separate objects and do not update each other.
- Walkthrough: the comparison had run but had to be run again before its figures reached the
  message; the Gmail draft still showed the earlier wording without the staff member's rent; the AI
  rewording returned "The revision copied your instruction into the email, so it was not used"
  (`lib/email-refinement/refine.ts`); Save draft did not complete until a business profile was
  created in the Admin menu; the draft time shown was the compose time; staff deleted the
  staff-decision sentence and rewrote it to say the decision is the owner's. The owner (Josiah
  Hunter) stated the target: staff should not have to start the comparison or preview a draft;
  the work should wait in a ready state to approve or refine.
- By the in-app guides, kicking off one lease takes at least eleven deliberate actions across three
  browser tabs: open the lease, choose Full view, open the comparison section, run the lookup, enter
  the recommended rent, open the owner section, open the composer, save, send, record the outreach
  and set the work status.

Intended: the first three path steps arrive prepared on the Now card (S247), one current message
exists per lease, audience and cycle, and every way of delivering it reads that one message.

**Actors and entry conditions.**

Renewal staff (Editor or higher) for preparation and review; the responsible sender for Send and
Schedule under the existing contract. The lease is a renewal target (S246) or any lease staff
choose to work. RentVine readable; RentCast allowance available for a new lookup.

**What it is / how it functions.**

- **R-S249-1 — Numbers check, done by the app.** Check the numbers shows the RentVine contractual
  rent, the current rent charge or charges, the lease end date and any staff working value, and
  states either "Numbers agree" or the one difference to settle with its existing fix control.
  RentVine is the basis for rent and dates (D-OP-7). An operating Sheet value shows only when the
  Sheet holds a different value, as information; a blank Sheet row is not a difference.
- **R-S249-2 — Comparison ready.** Compare market rent shows the stored comparison for this lease
  and cycle: range, the first usable comparables in provider order, and its age. A stored
  comparison is reused and never needs a second run to reach the message.
  Its recorded date and time use the app's Central business timestamp convention, including
  the time zone. An unreadable timestamp says Comparison time unavailable.
- **R-S249-3 — Preparing a batch.** "Prepare this batch" on the desk runs, for each target in the
  working batch that has no stored comparison for its cycle, one lookup at a time under the signed
  in staff member's session, with visible progress and safe resumption. At most one billed lookup
  per lease per cycle happens without a staff member asking again. At the allowance the remaining
  leases read "Comparison not run: monthly allowance reached" and offer the existing own-figures
  entry. Opening a single unprepared lease offers the same one action on its Now card.
- **R-S249-4 — Starting without a click.** The same preparation starts by itself when a staff
  member opens the working batch (D-OP-1), inside the same limits: the working batch only, one
  billed lookup per lease per cycle, inside the monthly allowance, in that staff member's session.
  A lease marked housing assistance is held back until a rent change is proposed (S251). One
  reviewed setting turns the automatic start off without a release, and "Prepare this batch" then
  remains.
- **R-S249-5 — Suggested rent with its basis.** The Now card shows one field, "Rent to recommend",
  prefilled from the covering standing agreement (S250) or else from the comparison-based
  suggestion, each with its basis in words. A prefilled figure is a proposal; it becomes the staff
  reviewed recommendation when the staff member sends, and a typed figure always wins.
  The field shows required, Edited, Saving, Saved or its specific failure with the existing
  retry. Its basis names an adopted agreement or policy exactly as recorded. An older save
  response preserves a newer entry and confirms only the value it actually stored.
- **R-S249-6 — Reason to include.** An optional one-line "Reason to include" (for example current
  market conditions) is placed in the message beside the recommendation exactly as typed.
- **R-S249-7 — One current message.** One message exists per lease, audience and cycle. Its preview
  on the Now card updates as the rent, the reason or the wording changes. Send, Schedule, Create
  Gmail draft and Copy all read that message. The Communications composer opened for the lease
  shows the same message. S161's preservation of authored wording remains: a changed input never
  silently rewrites a staff-authored or accepted AI body. The Now card shows the existing
  changed-information notice, Return to the standard wording and Undo the last refinement in
  place, so staff can deliberately rebuild the shared message from current inputs or keep their
  wording. The same controls remain in the message editor.
  Review, Schedule, Gmail preview and the Communications handoff first confirm any entered
  working figures that their message uses through the ordinary field saves, then read the
  current preparation. Pending work stays visibly pending. A refused, incomplete or unconfirmed
  relevant save keeps its entry, names and focuses its field, and prepares no older message.
  Unrelated incomplete fields remain usable. Copy keeps the exact displayed bytes during a
  pending or failed save and states when working figures were unconfirmed when copying began.
  Authored wording keeps its existing deliberate changed-fact recovery.
- **R-S249-8 — One route.** The primary action is "Review and send" on the Now card, which uses the
  existing staff-confirmed Send contract and its exact review. "Schedule", "Create Gmail draft
  instead" and "Copy" are secondary actions on the same card (D-OP-2).
- **R-S249-9 — A Gmail draft never goes stale silently.** When the message changes after a Gmail
  draft was created, the card reads "The Gmail draft is older than this message" and offers
  "Replace the Gmail draft". The required draft-review banner remains in the exact Gmail preview
  and draft, and is excluded only from the wording revision comparison. After confirmed creation,
  the lease refreshes its draft evidence so the waiting state appears without a manual reload.
  An uncertain create offers Recover exact Gmail attempt on the same Now card, through the
  existing own-attempt recovery. A confirmed recovery refreshes its draft currency and stage;
  unresolved recovery keeps its own state. Full view retains its recovery control.
  If the draft dialog's trigger becomes unavailable, focus returns to its exact recovery action.
  Confirmed recovery returns visible keyboard focus to Now; an unresolved check keeps focus on
  the recovery control. The existing dialog trap, cancel and confirmation rules stay intact.
  Changed message or lease evidence requires a new preview and exact confirmation, including
  a newer safety version with unchanged visible wording; the refusal names that evidence change.
  Creating a draft takes one review and one confirmation.
- **R-S249-10 — Owner wording.** An owner message never contains internal working language. With a
  staff recommendation it uses the approved suggestion wording. With none, the Now card asks for the
  rent to recommend before Send; the sentence "The working offer remains a staff decision" never
  reaches an owner. Template wording changes go through the existing template publication.
- **R-S249-11 — Readiness before the step.** The Now card lists what Send needs and its state:
  verified owner recipient, the sender's signature, an approved template, complete marked values.
  Each missing item has its fix in place; a staff member sets up their own signature on the card
  the first time, and the desk shows the same missing items before a lease is opened.
  A recipient fix focuses the recipient reasons and the already-read source record links. When
  an owner-record link is unavailable, the existing lease-record link explains the route to its
  owner record and the subsequent refresh. A template fix focuses its actual publication status.
  Source edits and an Approver's publication remain their existing separate handoffs.
  The tenant offer uses the same pattern: "Check tenant email addresses in RentVine" opens its
  recipient/source handoff, and "Ask an Approver to publish the tenant template" opens its
  publication status when that input is missing.
- **R-S249-12 — Rewording that works.** An AI rewording replaces the body only when the staff member
  chooses "Use this revision". A rejected result keeps the typed instruction, says what to change
  and leaves the message as it was. The card shows when the message was last edited.
- **R-S249-13 — Ready for review on the desk.** In the batch, leases whose kickoff is prepared and
  sendable list first under "Ready for your review" with a count; leases missing an input follow
  with the named input; waiting and finished leases follow those.
- **R-S249-14 — The same pattern for later steps.** Each later path step shows its deterministic
  preparation when the stage reaches it: the tenant offer from the working terms once the owner
  step is settled, and the RentVine and Sheet update previews once the terms are final. These are
  reads and assembly only; every send and every source update keeps its own exact confirmation.

**In scope / out of scope.**

In scope: preparation content for the first three steps, the batch preparation action, the single
message object and its delivery actions, readiness items, rewording behavior, desk ordering and
the tenant-offer and source-update preparation views. Out of scope: any send, Gmail draft or
provider write without staff confirmation; a background worker; a new comparison provider or
selection policy (D-COMP-POLICY); template content changes outside publication; scheduling features.

**Open questions & assumptions.**

- D-OP-1 (owner decision, November 5, 2026): the rent comparison may start without a staff action
  for leases in the working batch, at most once per lease per cycle and inside the monthly
  allowance. This changes the recorded "operator-triggered" comparison authority in `AGENTS.md`.
  The router amendment ships in the same change as R-S249-4, and nothing automatic is built before
  it. Proposed router wording: "Owner-approved 2026-11-05: for leases in the Renewals working
  batch, the app may start the existing RentCast comparison when a staff member opens the batch,
  at most once per lease per renewal cycle and within the monthly allowance. This adds no send,
  Gmail draft, schedule, provider write or Action Registry key."
- D-OP-2 (owner decision, November 5, 2026): Send from the Now card is the primary route; Gmail
  draft, Schedule and Copy are secondary on the same card.
- D-OP-7 (owner decision, November 5, 2026): RentVine is the basis for rent and dates in the numbers check and a
  Sheet difference is informational. The code's source precedence table is still marked
  unconfirmed (`lib/lease-renewal/field-reconciliation-rules.ts`); this decision settles it for
  this check only.
- Assumption: this suite supersedes, for in-app prepared content only, the S232 statement that no
  draft is derived from desk state. No Gmail draft, send, schedule or reminder is derived.
- The earlier fallback suite S121 (no usable comparables) stays specified and separate; when a
  lookup yields nothing usable the card shows that outcome and the own-figures entry.

**Cross-product impacts.**

`app/api/lease-renewal/market-comps/route.ts`, `lib/lease-renewal/rentcast-quota.ts`,
`lib/lease-renewal/market-observation.ts`, `lib/lease-renewal/rent-suggestion.ts`,
`lib/lease-renewal/renewal-recommendation.ts`, `lib/lease-renewal/current-renewal-message.ts`,
`lib/lease-renewal/renewal-message-content.ts`, `lib/lease-renewal/renewal-message-preparation.ts`,
`components/lease-renewal/RenewalMessagePreparation.tsx`,
`components/lease-renewal/RenewalProgressControls.tsx`, `components/email/RefineWithAi.tsx`,
`lib/email-refinement/refine.ts`, `lib/gmail-hub/sequence-service.ts`, the Communications composer,
the staff business profile and sender signature store, the cost guard and budget alert, the desk
batch rows (S246) and the help guides (S252).

**Authority and evidence map.**

| Input                                                                  | Classification       | Use and limitation                                                                                        |
| ---------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` (renewal consolidation, permanent safety boundaries, cost) | Authority            | Deterministic drafts are authorized; comparison is operator-triggered; no background Gmail draft or send. |
| `docs/facts.md` (D-COMP-POLICY, D-RENEWAL-GMAIL-DRAFT, D-TIMING-UNSET) | Authority            | No invented comparable policy; a draft proves no send; no timers.                                         |
| Committed code and tests at `6491c06f`; in-app guides                  | Implementation truth | Present triggers, three delivery routes, two draft objects, message assembly.                             |
| November 4 staff walkthrough notes and November 5 owner direction      | Intent evidence      | Prepared ahead; approve or refine; fewer actions. Observed defects are reported behavior, not root cause. |
| RentCast allowance and budget                                          | External dependency  | A lookup beyond the allowance is refused and shown; nothing is fabricated.                                |
| Owner decision D-OP-1, November 5, 2026                                | Owner decision       | Approves the bounded automatic start; it ships only with the router amendment.                            |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S249-1** — One preparation projection per lease and cycle states, for each kickoff item,
  ready or the named missing input, from existing facts and stored observations. Fail-first: no such
  projection exists; readiness is spread over three sections.
- **ARCH-S249-2** — One message record per lease, audience and cycle is the only source for Send,
  Schedule, Gmail draft, Copy and the composer; a Gmail draft records the message revision it was
  made from. Fail-first: the Gmail draft and the composer draft hold different bodies after an edit.
- **ARCH-S249-3** — Batch preparation is a foreground, staff-session sequence with a per lease and
  cycle lookup claim, allowance check and stored result; it has no worker and creates no Gmail
  draft, send or provider write. Fail-first: lookups exist only as single per-lease actions.
- **ARCH-S249-4** — The automatic start is bounded by the working batch, one claim per lease and
  cycle and the allowance, and is controlled by one reviewed setting that ships with the router
  amendment. Fail-first: no automatic start exists. Preservation: with the setting off no billed call starts
  without a staff action.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S249-1** — A prepared lease opens with numbers agreed, comparison shown, rent prefilled with
  its basis and the owner message previewed; Review and send completes in one review and one
  confirmation without leaving the page.
- **BEH-S249-2** — Changing the rent or the reason updates the preview, and a Gmail draft made
  earlier reads older until replaced; the sent message carries the current rent.
- **BEH-S249-3** — Prepare this batch runs at most one billed lookup per lease per cycle, shows
  progress, stops at the allowance with the stated message and can be resumed.
- **BEH-S249-4** — A missing recipient, signature or template shows on the desk and the Now card
  with its fix; a staff member sets their signature on the card and Send becomes available.
- **BEH-S249-5** — An owner message with no staff recommendation cannot be sent and never contains
  internal working language; a rejected rewording changes nothing and explains itself.
- **BEH-S249-6** — Once the owner step is settled the tenant offer is shown prepared from the
  working terms; once terms are final the source update previews are shown; neither sends nor writes.

**Human litmus outcome.**

### Review a ready renewal and send it

**If this was built correctly:** A staff member opens a December lease. The rent comparison is
there, a suggested rent is filled in with its reason, and the owner message is written. They lower
the rent, add a sentence about the market, watch the message change, and send it. They did not
scroll through sections, open another tab or run anything.

- Model verdict: NOT RUN — to be completed by the implementation runner with evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                         | Architecture outcome | Behavior outcome | Human litmus                       | Deterministic evidence / falsification                                                          |
| ----------------------------------- | -------------------- | ---------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| R-S249-1 numbers check              | ARCH-S249-1          | BEH-S249-1       | Review a ready renewal and send it | Agreeing, differing charge, blank Sheet and differing Sheet fixtures.                           |
| R-S249-2 comparison ready           | ARCH-S249-1          | BEH-S249-1       | Review a ready renewal and send it | Stored observation feeds the message with no second lookup.                                     |
| R-S249-3 preparing a batch          | ARCH-S249-3          | BEH-S249-3       | Review a ready renewal and send it | Batch run test: one claim per lease and cycle, allowance stop, resume.                          |
| R-S249-4 starting without a click   | ARCH-S249-4          | BEH-S249-3       | Review a ready renewal and send it | Setting on: opening the batch starts lookups inside the limits. Setting off: zero billed calls. |
| R-S249-5 suggested rent             | ARCH-S249-1          | BEH-S249-1       | Review a ready renewal and send it | Agreement, comparison and typed-value precedence fixtures.                                      |
| R-S249-6 reason to include          | ARCH-S249-2          | BEH-S249-2       | Review a ready renewal and send it | Typed reason appears verbatim in every delivery form.                                           |
| R-S249-7 one current message        | ARCH-S249-2          | BEH-S249-2       | Review a ready renewal and send it | Edit then Send, Schedule, draft and Copy all carry the same revision.                           |
| R-S249-8 one route                  | ARCH-S249-2          | BEH-S249-1       | Review a ready renewal and send it | Browser check: send from the Now card in one review and one confirmation.                       |
| R-S249-9 draft never stale silently | ARCH-S249-2          | BEH-S249-2       | Review a ready renewal and send it | Edit after draft creation marks it older; replace updates the revision.                         |
| R-S249-10 owner wording             | ARCH-S249-2          | BEH-S249-5       | Review a ready renewal and send it | Content test: no internal sentence in any owner body; send refused without a recommendation.    |
| R-S249-11 readiness before the step | ARCH-S249-1          | BEH-S249-4       | Review a ready renewal and send it | Missing recipient, signature and template fixtures on desk and card.                            |
| R-S249-12 rewording that works      | ARCH-S249-2          | BEH-S249-5       | Review a ready renewal and send it | Echoed-instruction fixture keeps instruction and body; accepted revision applies once.          |
| R-S249-13 ready for review on desk  | ARCH-S249-1          | BEH-S249-4       | Review a ready renewal and send it | Batch ordering test across prepared, missing-input, waiting and finished rows.                  |
| R-S249-14 pattern for later steps   | ARCH-S249-1          | BEH-S249-6       | Review a ready renewal and send it | Tenant offer and source preview fixtures; zero sends or writes.                                 |

**Preservation set.**

The S189–S192 send, schedule and resume contract; the unsent Gmail draft contract and own-receipt
recovery; copy output bytes for an unchanged message; S161–S163 editable messages and greetings;
S224 business profiles; S195 comparable presentation and provider order; S194 prefill rules; the
allowance, cache and budget guard; the existing own-figures entry; S121 as a separate suite; and
staff typed values always taking precedence over a proposal.

**Adversarial acceptance checks.**

- **AC-S249-1** — For a prepared fixture lease the owner message is sent from the lease page in one
  review and one confirmation with no other page opened, where the starting state needs at least
  eleven actions across three tabs (ARCH-S249-1, BEH-S249-1).
- **AC-S249-2** — After any edit, Send, Schedule, Create Gmail draft, Copy and the composer carry
  the identical message revision, and an earlier Gmail draft is marked older (ARCH-S249-2,
  BEH-S249-2).
- **AC-S249-3** — Batch preparation makes at most one billed lookup per lease per cycle, makes none
  beyond the allowance, and with the setting off makes none without a staff action (ARCH-S249-3,
  ARCH-S249-4, BEH-S249-3).
- **AC-S249-4** — No preparation path creates a Gmail draft, a send, a schedule, a reminder or a
  provider write, and no owner body contains internal working language (BEH-S249-5, BEH-S249-6).
- **AC-S249-5** — A staff typed rent, reason or wording is never overwritten by a later proposal,
  refresh or policy change (R-S249-5 preservation).

**Forbidden actions / hard gates.**

No send, schedule or Gmail draft without the staff member's exact confirmation. No billed lookup
outside the approved limits, and no automatic start before the router amendment lands in the same
change. No fabricated comparable or rent. No change to `lib/integrations/action-gate.ts`, the Action Registry or the budget guard.
No customer value in fixtures, tests or documentation.

**Dependencies / sequencing.**

Consumes the S246 batch, the S247 Now card and the S248 evidence rules, each optional: without them
the same prepared content renders in the existing Owner approval section. Consumes S250 for the
agreement prefill (absent: comparison-based suggestion). Produces the prepared content S252 walks.

**Standalone delivery contract.**

- **Deliverable now:** R-S249-1 to R-S249-14 with batch preparation, its automatic start and
  router amendment, the single message record, readiness items and tests.
- **Consumes, but does not assume:** S247 (absent: existing section), S250 (absent: comparison
  suggestion), RentCast allowance (absent: stated refusal and own-figures entry).
- **Externally blocked effect:** none. R-S249-4 ships only together with its router amendment; a
  lookup beyond the RentCast allowance is refused and shown.
- **Produces for downstream suites:** the preparation projection and the single message record.

**Verification and delivery contract.**

1. Before edits, record the current readback, the preservation baseline and each ARCH and BEH check
   failing for the stated reason.
2. Run the focused checks for every ARCH, BEH and AC row; keep preservation separate.
3. Run `bash scripts/verify.sh`; audit secrets, PII, gates, cost guard, runtime configuration and
   diff scope before any authorized delivery.
4. Report `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only under an explicit budget, or `BLOCKED` only
   for an exact unavailable external input after all fail-closed work is green.

**Ordered prompt sequence.**

1. Re-verify current code, the allowance state and the message path for one lease.
2. Materialize the ARCH and BEH checks, litmus and preservation baseline; record fail-first results.
3. Build the preparation projection, the single message record and its delivery actions, then the
   batch preparation and readiness items.
4. Falsify, run focused and canonical tests, update help content, and ship only when authorized.

**Deletion/merge recommendation.**

Remove this suite when its checks are represented by code, tests and current facts. Merge the
remaining S121 fallback wording into the same message contract when S121 is executed.
