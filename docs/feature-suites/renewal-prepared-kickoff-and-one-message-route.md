<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-one-path-2026-11 -->

# S249 — Renewal kickoff prepared ahead, with one message and one route to send it

> Status: Preparation and shared message readiness delivered at `2e5e47a8`, intake 125. November 9 intakes 131 and 136 are AUTHORING READY for click-only month preparation and a saved, fill-only recommendation.

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

The November 9 baseline is serving source `2e5e47a8`. The batch component exposes preparation
only on the default working month and can call it on open. The kickoff route shares the RentCast
adapter, cost gate, cache and claim. The prepared owner message is app content. The comparison
result, provider point estimate and app recommendation are separate values. The app can display
an untouched recommendation without having saved it in the cycle's working record. The new action
prepares the selected month by deliberate staff intent and gives that proposal a durable basis.

**Actors and entry conditions.**

Renewal staff (Editor or higher) for preparation and review; the responsible sender for Send and
Schedule under the existing contract. The lease is a renewal target (S246) or any lease staff
choose to work. RentVine readable; RentCast allowance available for a new lookup.

**What it is / how it functions.**

- **R-S249-1 — Numbers check, done by the app.** Check the numbers shows the RentVine contractual
  rent, the current rent charge or charges, the lease end date and any staff working value, and
  states either "Numbers agree" or the one difference to settle with its existing fix control.
  RentVine is the basis for rent and dates (D-OP-7). An operating Sheet value shows only when the
  Sheet holds a different value, as information. A blank Sheet row adds no discrepancy.
  The compact facts, source links and actionable attention cues follow S247 R-S247-12.
- **R-S249-2 — Comparison at a glance.** Compare market rent shows contractual base rent,
  the RentCast estimate or a clear not-run/unavailable state, and the single editable Rent
  to recommend. When comparison evidence is needed and absent, offer one deliberate
  Run RentCast action. After a usable result, show the point estimate, range, count and
  Central read time once. Use a read-only Verification disclosure for comparables in
  provider order, the actual query basis, derivation, available past rent and approved
  report or listing links. Put editable lookup inputs, intentional rerun and manual
  figures in Work, including when reached through Full. Opening a report, evidence, a
  step or Full starts zero paid calls or saves. Retain earlier usable results with
  their actual source/time when a new request fails or yields no usable data. Put the
  failure and exact available manual or retry action once beside Work.
- **R-S249-3 — Prepare the selected month once.** Above the S246 table, label the action
  “Prepare [month] leases” with the selected month. One authorized staff click runs the existing
  paid read under the signed-in Renewals scope without a second approval. Scope the run to the
  selected month's eligible current-cycle targets, regardless of the displayed status or count
  filter. A carried-over, later, completed, retired, moved-out, pending, closed or unreadable
  target is outside this action. The server resolves membership and the exact current cycle
  from fresh authoritative inputs before admission and refuses stale, tampered or unavailable
  targets individually. Changing the month does not retarget a run. Make its month and per-lease
  outcomes visible. A foreground interruption leaves completed work discoverable and stops
  starting remaining leases when the run is abandoned. An explicit continue for the same month
  revalidates remaining targets and recovers the same per-cycle claim before a retry.
  Run a paid lookup only for an applicable, missing comparison. Use one admitted lookup at a
  time in the run, the exact open RentCast action, existing cache, transactional monthly
  allowance and at-most-once per-cycle claim. Reuse a stored usable comparison. A denied call, exhausted allowance, unavailable source, inconclusive result and
  ambiguous dispatch have distinct outcomes with the applicable recovery. No silent retry of an
  ambiguous call. Keep the existing deliberate single-lease action outside the monthly batch.
  Skip comparison for a confirmed covered standing-agreement path and hold assistance under
  S251 until a rent change calls for it. When coverage cannot be verified, give the exact
  blocked reason and manual review path before spending.
  For each applicable owner step, make its initial draft ready to review on the lease through
  the current lease/cycle/audience message owner, including when evidence was already saved.
  Preserve authored content, optional staff reason, current draft/version and existing
  outreach. Leave already-authorized or completed outreach attached to its original record.
  Display incomplete draft reasons with their exact fix. Use the applicable S251 message when
  the owner decides whether to renew before setting rent. Batch preparation produces only
  RentCast reference reads and app-owned work.
- **R-S249-4 — Require a deliberate start.** Opening the desk or a lease, refresh, filter,
  month and view changes, Back and mount/remount all read existing preparation only. Refuse
  the old automatic request on the server before a lookup or preparation mutation, including
  when a previously saved setting is on and a stale client sends that request. Retire the
  effective automatic-start control and preserve its configuration audit history. The
  November 9 owner decision replaces the November 5 D-OP-1 permission for this revision.
  Reconcile the corresponding router wording in the authorized implementation. Keep the
  existing manual single-lease comparison, cost, role, verification and environment fences.
- **R-S249-5 — Save the recommendation only into an empty working field.** Batch and
  deliberate single-lease preparation use the existing recommendation rules and the exact
  current lease/cycle. A confirmed applicable S250 rule has precedence; otherwise use the
  app's existing bounded comparison suggestion from usable current evidence. Keep the
  provider estimate, contractual base rent and recommendation distinct. Save a valid
  proposal to the canonical working-rent field only if the authoritative field is absent
  or confirmed cleared and its expected version and cycle still match. An existing value
  that needs verification remains visible for staff to correct. Record its provenance and exact comparison/rule basis through the
  existing working record. The successful readback says it is a saved recommendation.
  Retain any already populated value, including a prior proposal or staff override, through
  later preparations, provider reruns, and rule changes. A deliberate staff edit wins. An
  older attempt cannot refill a field that staff changed or cleared while it was pending.
  A new explicit preparation may fill a deliberately cleared field. If the initiating
  view has unsettled typing, preserve it and wait for its save before filling. Preserve a
  concurrent local entry through the existing conflict and retry path. When the field
  cannot be read, the basis fails freshness checks, or no usable value can be computed,
  keep the current entry and report the specific wait, refusal or manual route.
  If the lookup saved but the recommendation did not, retry the fill using stored evidence
  and rechecked field/cycle versions. Avoid another paid call.
  Guided, Full, desk and the initial owner draft read the same confirmed working amount.
  Compare market rent owns the one editable amount in Guided and Full, with save
  feedback and exact retry. The owner step reads the same amount and links back to
  that field for a change. Retain newer typing and authored wording. If the amount changes during message review, require a fresh exact
  preview through R-S249-7. A saved proposal supplies the amount to recommend. The
  existing staff review, owner authority, tenant terms and provider updates retain their own
  evidence and confirmation.
- **R-S249-6 — Reason to include.** An optional one-line "Reason to include" (for example current
  market conditions) is placed in the message beside the recommendation exactly as typed.
- **R-S249-7 — One current message.** One message exists per lease, audience and cycle. Its preview
  on the Now card updates as the rent, the reason or the wording changes. Send, Schedule, Create
  Gmail draft and Copy all read that message. The Communications composer opened for the lease
  shows the same message. S161's preservation of authored wording remains: a changed input never
  silently rewrites a staff-authored or accepted AI body. The Now card shows the existing
  changed-information notice, Return to the standard wording and Undo the last refinement in
  place, so staff can deliberately rebuild the shared message from current inputs or keep their
  wording. These appear once when the compact preview shows them. The same controls remain
  in the message editor in Full view.
  Review, Schedule, Gmail preview and the Communications handoff first confirm any entered
  working figures that their message uses through the ordinary field saves, then read the
  current preparation. Pending work stays visibly pending. A refused, incomplete or unconfirmed
  relevant save keeps its entry, names and focuses its field, and prepares no older message.
  Recovery leads to the actual owning field in the current view. For the recommendation
  it lands at Compare market rent, with an exact return to the interrupted message
  when the save is confirmed. The field label, focused input and retry remain visible.
  Preserve supported input identities and map any former duplicate editor targets to
  that owner. A newer deliberate focus choice keeps precedence.
  If an entered figure prevents a Gmail preview, its empty dialog closes before the field
  receives recovery focus. The dialog completes its ordinary focus return first; keyboard
  work continues at the failed input. Successful exact previews retain their review and
  separate confirmation. An earlier deliberate cancel or step change keeps its newer focus.
  A preview opened during loading holds keyboard focus within its dialog. Once ready, a short
  review focuses Cancel. A long review starts at the sender, recipients and wording so staff
  see them before the confirmation. Tab remains within the review. Cancel and Escape close a
  ready review and return keyboard focus to the available action that opened it. A dispatched
  operation keeps its existing busy cancellation boundary.
  The relevant confirmed field versions are checked again after composition and communication
  draft saving. If a newer value arrived during either wait, an older exact review stays closed
  and the Now action asks for the current message to be reviewed again. The saved application
  draft is reused through its ordinary versioned update; no second effect or confirmation runs.
  The linked composer joins a repeated pending read for the same entry. If its read fails,
  Try again reloads that entry, keeps keyboard focus during loading and leads into the ready
  composer. Close remains available and the usual exact review still governs delivery.
  Unrelated incomplete fields remain usable. Copy keeps the exact displayed bytes during a
  pending or failed save and states when working figures were unconfirmed when copying began.
  Authored wording keeps its existing deliberate changed-fact recovery.
- **R-S249-8 — One route.** Lead with the specific review of the owner message or tenant
  offer when ready, using the existing staff-confirmed Send contract and its exact review.
  Show Schedule, Create Gmail draft instead and Copy as secondary Work (D-OP-2). If review
  is blocked, surface the exact input or reconciliation action per S247 R-S247-15.
  Review and schedule marks Date and Time (Central) as required and names a cleared value at
  its field. Both values are needed before Schedule this message becomes available. The
  reviewed draft, recipient hashes, Central default and server timing validation stay in place.
  On Offer the tenant, the optional immediate offer with reviewed follow-ups uses S189's
  explicit joint authorization and the same tenant message preparation. The owner route and
  the separate future schedule remain available.
- **R-S249-9 — A Gmail draft never goes stale silently.** When the message changes after a Gmail
  draft was created, the card reads "The Gmail draft is older than this message" and offers
  "Replace the Gmail draft". The required draft-review banner remains in the exact Gmail preview
  and draft, and is excluded only from the wording revision comparison. After confirmed creation,
  the lease refreshes its draft evidence so the waiting state appears without a manual reload.
  An uncertain create offers one Recover exact Gmail attempt on the current Now card, through
  the existing own-attempt recovery. When the compact preview is shown, it is the location
  for that recovery. A confirmed recovery refreshes its draft currency and stage; unresolved
  recovery keeps its own state. Full view retains its recovery control.
  If the draft dialog's trigger becomes unavailable, focus returns to its exact recovery action.
  Confirmed recovery returns visible keyboard focus to Now; an unresolved check keeps focus on
  the recovery control. The existing dialog trap, cancel and confirmation rules stay intact.
  Changed message or lease evidence requires a new preview and exact confirmation, including
  a newer safety version with unchanged visible wording; the refusal names that evidence change.
  Creating a draft takes one review and one confirmation.
- **R-S249-10 — Owner wording.** An owner message never contains internal working language. With a
  rent recommendation it uses the approved suggestion wording. A message that recommends
  rent requires the amount before Send. An assisted renew-or-not message follows S251; the sentence "The working offer remains a staff decision" never
  reaches an owner. Template wording changes go through the existing template publication.
- **R-S249-11 — Readiness before the step.** The Now card and desk read the exact message's
  required inputs and their state from S224, including the verified recipient and applicable
  publication. Provide the actual fix beside each missing input. Use the sender-owned setup
  in the current step. All visible signature fields are optional and an explicitly saved
  blank is ready. The same setup and exact readiness reasons are available in Full view and
  Communications. The gate covers the existing outgoing routes. Edit and Copy remain usable
  with incomplete working content.
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
- **R-S249-13 — Surface actual readiness.** Expose the compact shared stage, message-specific
  readiness and actionable exception to S246's single table. A send that needs reconciliation
  or a missing exact input remains staff work. Sendable, scheduled and waiting have distinct
  meanings and never require separate tables. Keep complete readiness detail and the actual
  fix in the lease or composer.
- **R-S249-14 — The same pattern for later steps.** Each later path step shows its deterministic
  preparation when the stage reaches it: the tenant offer from the working terms once the owner
  step is settled, and the RentVine and Sheet update previews once the terms are final. If a
  marked value holds the tenant offer, Review and send brings staff to its existing marked-value
  links on the current step, including the exact shared resource setting when a link is missing.
  The shared setting keeps its existing edit role and verified-value requirement. These are
  reads and assembly only; every send and every source update keeps its own exact confirmation.

**In scope / out of scope.**

In scope: preparation content for the first three steps, the batch preparation action, the single
message object and its delivery actions, readiness items, rewording behavior, desk ordering and
the tenant-offer and source-update preparation views. Out of scope: any send, Gmail draft or
provider write without staff confirmation; a background worker; a new comparison provider or
selection policy (D-COMP-POLICY) and template content changes outside publication. S189 owns schedule and combined send authorization.

**Open questions & assumptions.**

- November 9 owner decisions Q3 and Q5 require click-only selected-month preparation and
  saving the suggestion into an empty current-cycle field. The old D-OP-1 automatic start
  belongs to the shipped baseline. An actual month, source facts, allowance and applicable
  agreement are runtime inputs; the corresponding action explains any unavailability.
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

| Input                                                                  | Classification         | Use and limitation                                                                                                                                                    |
| ---------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` (renewal consolidation, permanent safety boundaries, cost) | Authority              | Deterministic drafts are authorized; comparison is operator-triggered; no background Gmail draft or send.                                                             |
| `docs/facts.md` (D-COMP-POLICY, D-RENEWAL-GMAIL-DRAFT, D-TIMING-UNSET) | Authority              | No invented comparable policy; a draft proves no send; no timers.                                                                                                     |
| Committed code and tests at `6491c06f`; in-app guides                  | Implementation truth   | Present triggers, three delivery routes, two draft objects, message assembly.                                                                                         |
| November 4 staff walkthrough notes and November 5 owner direction      | Intent evidence        | Prepared ahead; approve or refine; fewer actions. Observed defects are reported behavior, not root cause.                                                             |
| RentCast allowance and budget                                          | External dependency    | A lookup beyond the allowance is refused and shown; nothing is fabricated.                                                                                            |
| November 9 note, screenshots, and Q3/Q5 answers                        | Confirmed owner intent | Click-only month preparation, compact comparison, and save only into an empty cycle field. Serving source verifies the prior automatic branch and displayed proposal. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S249-1** — One preparation projection per lease and cycle states, for each kickoff item,
  ready or the named missing input, from existing facts and stored observations. Fail-first: no such
  projection exists; readiness is spread over three sections.
- **ARCH-S249-2** — One message record per lease, audience and cycle is the only source for Send,
  Schedule, Gmail draft, Copy and the composer; a Gmail draft records the message revision it was
  made from. Fail-first: the Gmail draft and the composer draft hold different bodies after an edit.
- **ARCH-S249-3** — One foreground request per eligible lease/cycle uses existing target
  resolution, lookup claim, allowance and app-owned message projection. The selected month is
  checked at admission. Fail-first: the serving control is unavailable on an explicit
  non-default month and the staff path does not verify that selected month.
- **ARCH-S249-4** — App navigation and legacy auto-trigger requests do not enter preparation.
  Fail-first: an enabled legacy setting can cause paid calls on open. Verify the client trace
  and server refusal independently.
- **ARCH-S249-5** — One cycle/version-checked fill-only write preserves proposal provenance in
  the current working rent. Fail-first: a usable untouched suggestion renders without a
  saved proposal or exact version. A concurrent operator write/clear wins over an old fill.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S249-1** — A prepared lease opens with numbers agreed, comparison shown, rent prefilled with
  its basis and the owner message previewed; Review and send completes in one review and one
  confirmation without leaving the page.
- **BEH-S249-2** — Changing the rent or the reason updates the preview, and a Gmail draft made
  earlier reads older until replaced; the sent message carries the current rent.
- **BEH-S249-3** — The selected month's button prepares app drafts and reference comparisons
  under one click, shows per-lease progress and allows explicit continuation. Opening or
  revisiting the desk spends nothing. An outside target and a cap-stopped or ambiguous lookup
  each have the correct outcome and safe next action.
- **BEH-S249-4** — A missing recipient, signature or template shows on the desk and the Now card
  with its fix. When setup is the only hold, saving even a blank signature makes the
  prepared message ready for its exact review. An unused optional input creates no hold.
- **BEH-S249-5** — An owner rent recommendation needs its amount before Send and uses approved
  customer wording. A rejected rewording keeps the prior message and names what to change.
- **BEH-S249-6** — Once the owner step is settled the tenant offer is shown prepared from the
  working terms; once terms are final the source update previews are shown; neither sends nor writes.

- **BEH-S249-7** — After a usable comparison or applicable rule, the empty recommendation
  is saved with its origin and is the amount shown on the desk and owner draft. In another
  lease with a populated amount, new market evidence appears and the amount stays intact.
  Staff can review the source, edit the amount, recover a failed save and see which number
  the owner would receive.

**Human litmus outcome.**

### Review a ready renewal and send it

**If this was built correctly:** A staff member chooses a month and prepares it once.
They open a lease, see its current rent and market evidence, and find the saved recommendation
in the owner draft. They change the amount on one lease and run a later comparison. The market
evidence updates and their amount stays. They can review the exact owner message on the lease.

- Model verdict: November 7 readiness revision NOT RUN. The November 5 prepared message,
  review and guarded delivery evidence is J07–J09. The starting Demo send, automatic start
  and enable-to-off comparison remain unverified in that baseline. See the
  [review](../evidence/renewal-one-path-ux-review-2026-11-06.md) and
  [litmus results](../evidence/renewal-one-path-litmus-2026-11-06.md).
- Human verdict: NOT RUN — no human observer

November 9 model verdict is NOT RUN. Earlier checks above retain their dated scope.

**Requirement-to-outcome traceability.**

| Requirement                             | Architecture outcome | Behavior outcome | Human litmus                       | Deterministic evidence / falsification                                                                                  |
| --------------------------------------- | -------------------- | ---------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| R-S249-1 numbers check                  | ARCH-S249-1          | BEH-S249-1       | Review a ready renewal and send it | Agreeing, differing charge, blank Sheet and differing Sheet fixtures.                                                   |
| R-S249-2 comparison and verification    | ARCH-S249-1          | BEH-S249-7       | Review a ready renewal and send it | AC-S249-6. Provider result, current rent, proposal and retained details are distinct.                                   |
| R-S249-3 selected-month preparation     | ARCH-S249-3          | BEH-S249-3       | Review a ready renewal and send it | AC-S249-3 and AC-S249-7. Month, claims, allowance, draft reuse and partial outcomes.                                    |
| R-S249-4 deliberate start               | ARCH-S249-4          | BEH-S249-3       | Review a ready renewal and send it | AC-S249-3. Zero passive or legacy automatic preparation, even with a stored true setting.                               |
| R-S249-5 saved proposal only when empty | ARCH-S249-5          | BEH-S249-7       | Review a ready renewal and send it | AC-S249-5 and AC-S249-8. Empty, existing, stale, concurrent edit and retry cases.                                       |
| R-S249-6 reason to include              | ARCH-S249-2          | BEH-S249-2       | Review a ready renewal and send it | Typed reason appears verbatim in every delivery form.                                                                   |
| R-S249-7 one current message            | ARCH-S249-2          | BEH-S249-2       | Review a ready renewal and send it | Edit then Send, Schedule, draft and Copy all carry the same revision.                                                   |
| R-S249-8 one route                      | ARCH-S249-2          | BEH-S249-1       | Review a ready renewal and send it | Browser check: send from the Now card in one review and one confirmation.                                               |
| R-S249-9 draft never stale silently     | ARCH-S249-2          | BEH-S249-2       | Review a ready renewal and send it | Edit after draft creation marks it older; replace updates the revision.                                                 |
| R-S249-10 owner wording                 | ARCH-S249-2          | BEH-S249-5       | Review a ready renewal and send it | Owner recommendation requires its amount. The S251 renew-or-not message uses its own facts.                             |
| R-S249-11 readiness before the step     | ARCH-S249-1          | BEH-S249-4       | Review a ready renewal and send it | Desk, card and composer parity for missing recipient, absent setup, saved blank, unused resource and required template. |
| R-S249-12 rewording that works          | ARCH-S249-2          | BEH-S249-5       | Review a ready renewal and send it | Echoed-instruction fixture keeps instruction and body; accepted revision applies once.                                  |
| R-S249-13 actual readiness              | ARCH-S249-1          | BEH-S249-4       | Review a ready renewal and send it | S246 AC-S246-7. One row stage and actionable exception; detail links to the fix.                                        |
| R-S249-14 pattern for later steps       | ARCH-S249-1          | BEH-S249-6       | Review a ready renewal and send it | Tenant offer and source preview fixtures; zero sends or writes.                                                         |

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
- **AC-S249-3** — Load, reload, filter, change months, navigate Back and mount on both desktop
  and mobile with the old setting on. Assert zero preparation requests. Call the old
  automatic route with an authorized test actor and assert zero store writes and adapter
  calls. Click a non-default month's action and attempt duplicate and concurrent requests.
  Assert one claim per lease/cycle within the allowance and that out-of-month or stale
  targets never call the adapter (ARCH-S249-3, ARCH-S249-4, BEH-S249-3).
- **AC-S249-4** — No preparation path creates a Gmail draft, a send, a schedule, a reminder or a
  provider write, and no owner body contains internal working language (BEH-S249-5, BEH-S249-6).
- **AC-S249-5** — A staff typed rent, reason or wording is never overwritten by a later proposal,
  refresh or policy change (R-S249-5 preservation).

- **AC-S249-6** — Browser-check unrun, usable, insufficient, failed and retained-result
  comparisons in Guided and Full. Compare approved report links and Central read time.
  With Verification closed, find the actual run, edit or recovery. Open Verification
  and show the query basis, results and prior evidence with zero paid calls and app
  writes. Keep deliberate rerun and manual entry in Work. Verify only one editable
  recommendation and that the owner draft links to that same editor when it needs a
  change, with its authored text kept.
- **AC-S249-7** — In one selected-month run, exercise cached, newly prepared, covered,
  assisted, cap-stopped, changed-cycle and unknown-dispatch rows. Assert the correct month
  after a view change and the original claim on resume. Check one current app draft per
  applicable audience/cycle with exact missing-input links and retained authored text. The
  provider adapters record zero Gmail draft, dispatch, schedule and source-update effects.
- **AC-S249-8** — Read back a saved empty-field proposal and basis in a fresh lease session,
  the desk and owner message. Exercise rule and comparison precedence, an existing stored
  recommendation, typed edit racing the fill, clear racing the fill, a new cycle, a stale
  version and a failed save after a saved observation. Assert a later fill uses the existing
  evidence and cannot overwrite or fabricate a value. A pending or changed financial input
  keeps the exact outgoing review gated.

**Forbidden actions / hard gates.**

Require the staff member's exact confirmation at every outgoing boundary. Admit billed reads
only through the existing action and cost controls after staff intent. Reject fabricated
comparables and amounts. Preserve the Action Registry, `lib/integrations/action-gate.ts`, budget
guard and verification identities. Use synthetic fixtures and test adapters.

**Dependencies / sequencing.**

Consumes the S246 batch, the S247 Now card and the S248 evidence rules, each optional: without them
the same prepared content renders in the existing Owner approval section. Consumes S250 for the
agreement prefill (absent: comparison-based suggestion). Produces the prepared content S252 walks.

**Standalone delivery contract.**

- **Deliverable now:** R-S249-1 to R-S249-14, including the explicit month action and the
  saved recommendation, the legacy automatic refusal, current router reconciliation and the
  single message record. Exercise each with the existing effect-safe test adapters.
- **Consumes, but does not assume:** S247 (absent: existing section), S250 (absent: comparison
  suggestion), RentCast allowance (absent: stated refusal and own-figures entry).
- **Externally blocked effect:** An unavailable provider, source or exhausted allowance holds
  only the affected comparison. Existing stored evidence, editable work and the other rows
  remain usable as their scope permits.
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
