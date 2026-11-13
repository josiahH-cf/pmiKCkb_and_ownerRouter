# Staff workflow audit and redesign brief, November 12, 2026

Status: for owner review. Nothing in this document is implemented, approved or released.
Human verdict: NOT RUN. No staff member was observed; every "staff" step below was walked by the auditor.
Specifications: suites S272 to S286 were authored from this audit on the same day and are registered in the suite index. Section 9 lists the claims a later code and decision trace corrected, and section 10 records the owner's direction that followed. Where this document and a suite disagree, the suite governs.

## 1. Scope and evidence

| Item              | Value                                                                                                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serving revision  | `7f4cf234c18c0b80a0ed88bc08d70e174ae9c311` / `pmi-kc-app-rmwcvtvpl-13e72fe3f01f`, read from the production version endpoint at 2026-11-12T18:45:57Z. This was the only production request.                                                                    |
| Source inspected  | Worktree head `878e00f9`. It differs from the serving commit only in docs, `scripts/release-watcher.mjs` and tests, so `app`, `components` and `lib` are the served code.                                                                                     |
| Walkthrough build | Guarded one-path rehearsal serving `7f4cf234` (dev server), harness `22fe9058`, run `20261112T180934Z-7f4cf234-named`, automatic comparison held, mail stand-in on. 38 synthetic leases ("November 5 mix"). Run evidence is private local state, outside Git. |
| Effects exercised | Synthetic only, against loopback stand-ins: 4 sends, 1 schedule, 1 resume, 2 worker ticks, 2 comparisons, 1 owner reply, 1 unconfirmed send and its recovery. No provider, mailbox, Sheet, billed lookup or production record was touched.                    |
| Roles             | Editor: full walk. Admin: Admin index only. Approver: not walked (the control trace found no Approver-only page).                                                                                                                                             |
| Viewports         | 1440 x 900 by interaction. 390 x 844 by layout measurement on the desk and one lease. Screenshots were unavailable for part of the session, so visual polish is not assessed.                                                                                 |
| Code traces       | Three read-only traces (outreach, pricing, other surfaces). Claims marked "verified" were re-read by the auditor; claims marked "trace" come from a trace and were not independently re-read.                                                                 |

Rehearsal limits that matter when reading the findings:

- The rehearsal has no scheduled worker. Worker behavior comes from two harness ticks and from code.
- Sheet updates are switched off in the rehearsal and on in production. Sheet confirmation steps were read, not exercised.
- Lease pages load in about 15 s in the dev server. Load time is not a finding here.

## 2. Staff jobs and normal entry points

| #   | Job                                                                            | Normal entry                                                                 | Observed              |
| --- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | --------------------- |
| 1   | Work this month's renewals in order                                            | Operations > Lease Renewal (desk, Working batch)                             | Yes                   |
| 2   | Take one lease from numbers to owner ask to tenant offer to documents to close | Desk row "Next action" link                                                  | Yes, to Documents     |
| 3   | Handle an owner or tenant reply                                                | Notification, desk row, Communications                                       | Yes                   |
| 4   | Schedule, pause, resume or cancel a message                                    | Lease step, then Operations > Communications                                 | Yes                   |
| 5   | Fix a blocked lease (missing recipient, off-cycle date, unconfirmed send)      | Lease step                                                                   | Yes                   |
| 6   | Resolve a RentVine and Sheet difference                                        | Dashboard "Waiting on you", Approval Queue, desk "Review source differences" | Read only             |
| 7   | See what is waiting on me                                                      | Dashboard, My Work, Notifications, Approval Queue                            | Yes                   |
| 8   | Ask a question about a lease or my work                                        | Dashboard question box                                                       | One question          |
| 9   | Follow an internal process or checklist                                        | Operations > Internal Processes                                              | List only             |
| 10  | Approve or return queued items                                                 | My Work > Approval Queue                                                     | List only             |
| 11  | Check or fix a connection, change policy or access                             | Admin, Connections                                                           | Index and Editor view |
| 12  | Look something up in Help                                                      | Admin > Help                                                                 | Index only            |

## 3. What already works and should be kept

- The review dialog shows the exact sender, recipients, subject and body, and says "Confirming is the one step that sends or schedules it."
- The owner answer has a real review step: "Recommended base rent $1,400 / Amount approved $1,425 ... Saving records this answer and makes $1,425 the offer amount for this renewal. Nothing is sent."
- An unconfirmed send hides every send control, says "The send was not confirmed", and "Check whether the message went out" reconciled it in one click.
- The worker refused to send a scheduled message whose lease facts had changed.
- The renewal start date offers "Use the day after the current lease ends" at the owning field and records who adopted it.
- When a reply is on the sequence, the lease shows the reply text beside the decision with the evidence already filled in (lease 9105).
- The housing assistance lease gets its own path.
- The missing owner email names the exact fix and the way back: "Open its owner record to add the owner's email, then refresh this lease."

## 4. Priority findings

Ranking: P1 can put a wrong message in front of a customer or stops the normal path. P2 causes repeated effort, conflicting cues or a hidden fix. P3 is cleanup. Owners: Workflow = renewal operations lead, UI = application engineering, Policy = project owner (with the client for business rules).

### A-01 (P1) A paused, outdated message can be released with one click, after a newer one was sent

Staff objective: send the tenant one correct offer.

Observed on lease 9101:

1. Scheduled the tenant offer (term through 12/31/2027) for 11/13/2026 9:00 AM.
2. Changed the working term end date to 06/30/2027.
3. Worker tick: sent 0, held 1. Communications showed "Paused: The lease or recipient facts changed. Review the linked history before resuming."
4. From the lease, reviewed and sent the current offer (through 06/30/2027). Gmail stand-in accepted it.
5. In Communications, the old communication still read "Paused ... 1 of 1 sends remain", body through 12/31/2027, with Send, Schedule and "Resume reviewed sequence" enabled. The page says "Resume requires a fresh review."
6. One click on "Resume reviewed sequence": no dialog. State became "Scheduled".
7. Next worker tick: sent 1. The stand-in mailbox holds two tenant messages on one thread, 06/30/2027 then 12/31/2027.
8. The lease page shows only the first send. Nothing on the lease or desk mentions the second.

Why (verified):

- Resume checks that the stored draft and the current target are unchanged since the page loaded, then writes a new authorization that pairs the current source digest with the stored body. The stored body is never compared with the current lease facts: `lib/gmail-hub/sequence-service.ts` (lines 461 to 481, 512, 552 to 562, 591 to 619).
- The button calls the action directly: `components/gmail-hub/CommunicationComposer.tsx` (lines 1160 to 1166).
- The only same-cycle guard is a claim taken by "send now with follow-ups". Plain Send and Schedule take no claim, and Resume opts out: `lib/gmail-hub/sequence-store.ts` (lines 324 to 366), `lib/gmail-hub/sequence-service.ts` (lines 634 to 638).
- Trace: Send and Schedule on a paused or scheduled communication do the same re-binding, and Send goes out at once.

Expected: one live offer per lease, cycle and audience. A message paused because facts changed cannot go out with its old text.

Smallest change:

1. Server: refuse resume, send and schedule when the existing authorization's source digest differs from the current one. The answer is "This message was written before the lease changed. Start a new message from the lease."
2. Server: on every confirm and resume, look for another communication for the same lease, cycle and audience that is sent, scheduled or paused. Refuse, and name it.
3. When a newer message for the same lease, cycle and audience is confirmed, cancel the future messages of the older one and record why.
4. UI: hide Send and Schedule on a communication that already has an authorization and is scheduled or paused.

Owner: UI and Policy (item 3 changes what happens to an older authorization).

First screen (paused communication): "Paused 11/12 12:21 PM. The lease changed after this was written: term end 12/31/2027 in this message, 06/30/2027 on the lease. A newer offer was sent 11/12 12:23 PM." Actions: "Open the lease" and "Cancel this message". No Resume.
Next interaction: "Open the lease" lands on the Offer step with the current message.

Acceptance:

- AC-01a normal: schedule a tenant offer, change no facts, pause it, resume it. It returns to Scheduled, one tick sends it once, and the mailbox holds one message.
- AC-01b exception: schedule, change the term end date, tick (held), send a new offer from the lease, then try Resume, Send and Schedule on the paused one. All three are refused with the message naming the changed fact. After a tick the mailbox holds exactly one tenant message for the cycle.
- AC-01c: the same check for an owner message.

### A-02 (P1) After facts change, the lease shows new text above the old schedule, and the hold is silent

Staff objective: know what will go out, and know when it did not.

Observed on lease 9101, between steps 2 and 4 above:

- The lease kept "Tenant message scheduled for 11/13/2026, 9:00 AM CST" and "Scheduled for 2026-11-13 at 09:00 Central" directly under a message that now read "through 06/30/2027" (revision DD925E). The scheduled authorization held revision 73CA4C, "through 12/31/2027". No warning.
- Communications > Scheduled listed the item with no sign of the change. Its detail showed the old text and no scheduled time.
- After the worker held it, the desk row returned to "Send the tenant offer" and the lease to "Review tenant offer". Unread notifications stayed at 2. The paused attempt is not on the lease at all (trace: a paused sequence drops off the lease page, `lib/firestore/renewal-outreach-records.ts` lines 117 to 123).

Expected: a scheduled message whose facts changed is flagged where the change was made, immediately, with the old and new values and one fix. An attempt that was held stays visible on the lease until someone resolves it.

Smallest change: on the lease step and the desk row, compare the current message with the scheduled authorization. When they differ, replace the scheduled line with "Scheduled message is out of date" and the fix "Review and schedule the current message" (which cancels the old one under A-01 item 3). Add an "Earlier attempts" line on the step for anything paused, cancelled or unconfirmed. Raise one notification when the worker holds a message.

Owner: UI. Workflow decides the wording.

First screen (lease, Offer step): status line "Scheduled offer is out of date: it says term end 12/31/2027, the lease now says 06/30/2027." Primary "Review and schedule the current offer". Secondary "Cancel the scheduled offer".
Next interaction: the review dialog with the current message and the date and time carried over.

Acceptance:

- AC-02a normal: schedule and change nothing. Lease, desk and Communications show the same text and the same date and time, in MM/DD/YYYY h:mm AM/PM Central.
- AC-02b exception: change the term end date after scheduling. Within one page refresh the lease and the desk row show the out-of-date state with both values. After a worker tick the lease shows "Held 11/12 ... because the lease changed", one notification names the address, and the attempt is listed under Earlier attempts.

### A-03 (P1) The owner's reply does not reach the decision screen through any staff control

Staff objective: see the owner's answer and record it.

Observed:

- Lease 9101: sent the owner message, delivered a reply from the owner's address. Lease and desk kept "Waiting on the owner ... The app is watching: Replies and delivery reports on the owner message's Gmail thread." Opening the lease, the desk, Communications and "Refresh worklist" changed nothing.
- "Refresh linked Gmail now" sits inside a closed "Gmail connection and refresh" disclosure at the bottom of Communications. After it, the desk row read "Needs a check: The staff record has no work recorded yet; the linked Gmail thread says waiting on the PMI KC team." The lease repeated that sentence three times in the first screen, with no reply text, no link and no fix. The owner answer form offered only "Another written channel" and "Conversation", so who, how, channel, reference and when were all typed by hand for an email the app already holds.
- Notifications and Communications listed the reply as "Renewal communication needs review" twice, with no address. The row link changed the URL and opened nothing.
- Lease 9105 (seeded) shows the intended result: the reply text, "Approved in the reply received 11/12/2026, 12:10 PM", and "Record this decision".

Why (verified):

- A single message with no follow-up becomes "completed" when Gmail accepts it: `lib/gmail-hub/sequence-store.ts` (lines 611 to 615).
- The worker reads open sequences only and skips completed ones: `lib/gmail-hub/sequence-worker.ts` (lines 104 to 106, 127 to 128).
- The manual Gmail refresh is built without the sequence reply check, although the runtime defines one: `lib/gmail-hub/dependencies.ts` (lines 97 to 101 defined, 191 to 205 not passed).
- "Refresh linked incoming" is the only control that runs the check, and it is not rendered for a completed communication: `components/gmail-hub/CommunicationComposer.tsx` (lines 659, 1152 to 1175).
- The seed and the qualification journeys make the reply appear by posting the refresh action to the route directly: `scripts/lib/one-path-rehearsal/seeds.mjs` (lines 267 to 274), `tests/browser/one-path-november-10-core-journeys.mjs` (lines 581 to 587). The engineering Yes for the replied case therefore does not cover the staff-reachable path.
- Trace: the row link is a client-side link inside a page that reads the address only on first load, and the list payload carries no lease label.

This needs one production confirmation (section 7): whether any completed owner message in production has its reply recorded on the sequence.

Expected: within one worker run of the reply arriving, the desk row says "Owner replied 11/12" and the lease shows the reply beside the decision. The notification names the address and opens that lease step.

Smallest change:

1. Keep a sent message's sequence under reply watch until an answer is recorded or the cycle closes (worker reads it; state label can stay "Sent").
2. Pass the reply check into the manual Gmail refresh.
3. Show "Check for a reply now" on the lease step while waiting. Show when the last check ran instead of "The app is watching".
4. Put the address in the notification and the Communications row, and make the row open the communication.
5. Replace the "Needs a check" sentence with the fact and the fix: "The owner replied 11/12 12:14 PM. Read it and record the answer."

Owner: UI. Workflow confirms the wording. Policy confirms that watching a sent thread until the answer is recorded stays inside the linked-reply read authority.

First screen (lease, Ask the owner, reply in): status "Owner replied 11/12/2026, 12:14 PM." The reply text. Choices: Approved in this reply / Asked for a change / Declined. Amount approved (see A-06). "Review the owner's answer".
Next interaction: the existing review, then Save.

Acceptance:

- AC-03a normal: send an owner message through the lease, deliver a reply with the control hook, run one worker tick, open the desk. The row reads "Record the owner's decision ... Owner replied [date]". The lease shows the reply text and the evidence-filled choice. No route is called by the test other than through visible controls and the worker tick.
- AC-03b exception: with the worker not run, "Check for a reply now" on the lease produces the same state. With the mailbox read failing, the lease says "Reply check failed at [time]. Try again" and keeps "Waiting on the owner".
- AC-03c: the notification text contains the address, and following it lands on that lease's Ask the owner step.

### A-04 (P1) A normal Send can be refused for a change nobody made, and the dialog offers no way forward

Staff objective: send the reviewed owner message.

Observed: first Send on lease 9101, about a minute after opening the review, returned "The recipients or source facts changed after the preview. Refresh and review them before Send/Schedule. Check the lease before trying again; nothing is sent twice." Nothing had been edited. The dialog named no fact, had no refresh, and left "Send this message" enabled. Cancel, reopen and Send within seconds worked. One of four confirms failed this way.

Why (trace, with the 409 text verified at `lib/gmail-hub/sequence-service.ts` lines 476 to 481): the bound digest includes the notice-safety marker and the blocker list. The first request more than 60 s after the last RentVine read starts a re-read, which rewrites the marker and briefly adds a "not ready" blocker. The preview retries through that state; confirm and the worker's dispatch do not. Inferred from the same code: a due scheduled message can be paused as "facts changed" by the same transient.

Expected: a re-read with no changed fact never refuses a send. A real change names the fact.

Smallest change: in confirm and in dispatch, when the only difference is the pending re-read, wait for it (bounded) and compare again. When a real difference remains, return which input changed, and have the dialog reload the preview in place with the changed value marked.

Owner: UI.

First screen (dialog after a real change): "The owner's email changed since you opened this review: was j...@..., now k...@.... The message below is current." Buttons: "Send this message", "Cancel".

Acceptance:

- AC-04a normal: open the review, wait 90 s without editing, Send. It sends. Repeat 10 times: 10 sends, 0 refusals.
- AC-04b exception: open the review, change the working rent in another tab, Send. Refused once, the dialog names "rent to recommend" with both values and shows the refreshed message; a second Send sends that message.
- AC-04c: schedule a message, let a RentVine re-read land at the due time (control hook), tick. Sent 1, held 0.

### A-05 (P2) A standing-agreement lease shows the rule's rent everywhere except where the offer needs it

Staff objective: send the tenant offer at the owner's pre-approved rule.

Observed on lease 9102: the desk shows "Rent to recommend 1751.00". The Offer step shows "Basis for the rent: Example Standing Agreement ... rounded to $1,751" and, a few lines down, "Renewal base rent: Not entered yet". The button "Set renewal base rent" jumps to the Pricing basis radios with focus on "Owner decides each renewal", the option that is not in effect. The amount can only be entered on a different step, in a field named "Rent to recommend", which shows "Suggested $1,751" and no way to adopt it. After typing 1751 the offer filled in and the field's basis changed to "Entered by staff", so the link to the agreement is lost.

Why (trace): the rule's amount is computed when read and stored only when someone saves it (`lib/lease-renewal/renewal-preparation.ts` lines 449 to 489). The offer reads the stored value only.

Expected: on a covered lease the rule's amount is the offer amount unless staff override it, and the basis stays "Standing agreement".

Smallest change: at the Offer step's "Renewal base rent", show the rule amount with "Use $1,751 (standing agreement)" and "Enter a different amount". Save the basis with the value. Point "Set renewal base rent" at that control.

Owner: UI and Policy (whether a rule amount may be applied without a keystroke).

First screen (Offer step, covered lease): "Renewal base rent: $1,751 from Example Standing Agreement (3 percent on $1,700). Use this amount / Enter a different amount." Then dates, then "Review tenant offer".

Acceptance:

- AC-05a normal: on 9102, one click adopts $1,751, the message shows $1,751.00, the basis reads the agreement's name, and the desk row matches.
- AC-05b exception: enter $1,760 instead. The step shows "$1,760 entered by staff; the agreement gives $1,751" and the review dialog repeats both.

### A-06 (P2) The owner's decision is recorded twice and typed by hand

Staff objective: record what the owner approved, once.

Observed and traced:

- "Amount approved" is always empty, including when the reply says "the recommended rent". This is deliberate (`components/lease-renewal/RenewalOwnerAnswer.tsx` lines 3 to 7, trace). The cost is a retyped amount at the one field that sets the tenant offer.
- "Who approved" is not preselected when the reply came from the only owner of record. On the manual path, channel, reference and date and time are typed.
- The answer covers "Base rent only". At Documents the lease then says "The owner approved the base rent only. Record the owner's approval of the renewal dates and charges before packet execution." The owner message never asked about dates. This second approval is discovered four steps later.
- The renewal end date has no suggestion. A term proposal function exists with no caller (`lib/lease-renewal/renewal-date-proposal.ts` lines 176 to 213, trace). The same dates are typed again in the RentVine update form and the Sheet value.

Expected: one owner answer that covers what the packet needs, with the amount confirmed against the recommendation rather than retyped from memory.

Smallest change:

1. Keep the typed amount, and add beside it "Same as recommended ($1,400)" as a choice that fills the field. The existing review already shows both values before saving.
2. Preselect the sole owner of record when the reply's sender matches.
3. In the owner message and the answer form, ask for rent and term together, so one answer covers the packet. Until then, show at the answer step: "This answer will not cover the documents. Dates and charges need the owner's approval too."
4. Offer "12 months from start" (or the prior term length) for the end date, with the same adopt-or-type pattern as the start date. Prefill the RentVine and Sheet date forms from the working terms.

Owner: Policy for 1 and 3 (they change a deliberate rule and the owner template). UI for 2 and 4.

First screen (answer step): reply text; "Amount approved: [ ] or Same as recommended ($1,400)"; "Term: 01/01/2027 to [12/31/2027 suggested]"; "Approved by: Jordan Sample (sender of this reply)"; "Review the owner's answer".

Acceptance:

- AC-06a normal: record an approval at the recommended amount with no typing other than choices. The review shows recommended and approved as equal. Documents shows no request for a second owner approval.
- AC-06b exception: the owner approves a different amount and a 6 month term. Staff type both. The review shows recommended, approved and the term. The tenant offer, the RentVine future rent preview and the packet facts all read the approved values.

### A-07 (P2) The same amount carries several names, and the desk shows the one that no longer drives anything

Observed and traced:

- One stored value appears as "Rent to recommend", "Offer amount", "Renewal base rent", "Working renewal rent" and "Final working terms" (trace, `lib/lease-renewal/current-cycle-terms.ts` lines 204 to 223).
- After the owner approved $1,425 on lease 9101, the desk still showed "Rent to recommend 1400.00" and has no column for the approved amount.
- "Current base rent" is RentVine's contractual rent in the desk table and the working value in the batch view and the lease (trace).
- Four market numbers exist: the provider range, a starting range from current rent, the provider's point estimate and the app's median suggestion. The Sheet "Market value" update takes the point estimate, not the rent to recommend (trace, `lib/lease-renewal/workspace-state.ts` lines 810 to 815).
- Preparing a lease saves the suggestion as the rent to recommend, and the owner message then says "Our reviewed rental analysis suggests $1,500.00 per month" before any person has looked at it.
- Desk amounts have no currency sign (1450.00).

Expected: three names, used everywhere: Current rent (with its basis), Recommended rent (with its basis: comparison, agreement or staff), Approved rent (with who and when). The desk shows the latest of the last two and labels which.

Smallest change: rename labels to those three. Desk column "Renewal rent" showing "$1,425 approved" or "$1,400 recommended". Show the basis next to "Rent to recommend" on the Ask step ("suggested from 5 comparables, not yet reviewed" until staff open or edit it). Feed Sheet "Market value" from the recommended rent or relabel it. Format desk amounts as currency.

Owner: UI. Workflow confirms the names. Policy decides the Sheet "Market value" source.

Acceptance:

- AC-07a normal: for one lease, the desk, the lease steps, the review dialog and the Sheet preview use the same three names and equal values.
- AC-07b exception: where recommended and approved differ, every screen that shows one shows which it is; the desk row shows the approved amount.

### A-08 (P2) Status lines contradict each other on the same screen and across screens

Observed:

- Lease 9101, Ask the owner, after the send: the step said "Waiting on the owner since 11/12/2026. Last contact 11/12/2026" while the "Waiting and follow-up" card below said "Waiting on an unresolved source. Last contact: Needs Verification."
- Right after the app's own confirmed tenant send: "Needs a check: The staff record says waiting on the tenant; the linked Gmail thread says waiting on the PMI KC team." Trace: the comparison picked an older thread's state.
- After the tenant accepted and the form was recorded as sent, the stage still read "Preparing tenant offer, waiting on the PMI KC team".
- Lease 9105 says "Numbers agree ... The operating Sheet shows $1,750 ... This is information." The Dashboard, the Approval Queue and Live renewal review show the same difference as "High. Two sources disagree. Needs human approval." The flag names no lease, and its link opens the whole list (trace: one row per field type, redirect without an anchor).
- "Waiting on you" on the Dashboard turned into "The renewal source is stale. Retained comparisons cannot establish current decisions; use the existing source refresh and recheck" a few minutes after the last read, with no link.
- "Timing policy not confirmed ... Next: Ask an Admin to confirm and version the client timing policy" appears on every lease, with no name or link for the Admin task (it is Admin > Renewal notice rules).

Expected: one status sentence per lease, built from one source, shown the same way on the desk and the lease. A difference between sources is either information everywhere or a decision everywhere.

Smallest change: drive the "Waiting and follow-up" card from the same record as the step status and remove it from the step when it adds nothing. Limit the thread comparison to the thread of the current step. Decide once whether a Sheet and RentVine rent difference with RentVine as basis is information or a decision, and make the flag list follow. Put the address on every flag. Replace the stale text with "Renewal data was last read at [time]. Refresh" as a button. Name and link the Admin task.

Owner: UI for the wiring. Policy for the rent-difference rule. Workflow for wording.

Acceptance:

- AC-08a normal: after an app-confirmed send, the lease shows one waiting line, no "Needs a check", and the desk row matches it word for word.
- AC-08b exception: with a real disagreement (staff recorded "waiting on tenant" and the tenant replied), the line states the fact and the fix: "Tenant replied 11/12. Record the response."
- AC-08c: a rent difference is shown with the same severity on the lease and in every queue, and every queue row names the lease and opens it.

### A-09 (P2) The working screen puts the action first and the deciding facts last, and jumps land in the wrong place

Observed at 1440 x 900:

- Ask the owner: the first screen holds the button, "Reason to include" and five "Ready" lines. The message starts below the fold. Current rent and Rent to recommend come after the message and after Schedule, Create Gmail draft and Copy.
- The review dialog's Send button, the schedule date and time and the follow-up option are below a long message. The dialog shows an internal cycle id.
- "Record owner response" jumps 5,294 px. "Enter renewal start date" jumps to another step's section. Labels land under the sticky header. "Return to tenant offer" lands in "Tenant message preparation", not on the step it came from. After saving the owner answer the view lands at the bottom of the next step. The address bar keeps `step=ask-owner` after the step advances.
- "Send the renewal information form", "Prepare the required documents" and "Deliver the required documents" send and prepare nothing. Each jumps 3,000 to 6,700 px to a status select ("Not started / Waiting / Done: recorded by staff"), and staff scroll back for the next one. The document tools ("Evaluate packet", "Open packet inputs") are in a section the button does not open.
- After a send, the step keeps "Reason to include", the readiness list, the full message, a second composer ("Compose owner message in Communications", "Preview unsent Gmail draft"), and "Send again". Trace: "Open in Communications" writes a draft communication by being opened.
- The off-cycle end date (lease 9106) blocks the send while all five readiness lines say Ready. Its fix button is labelled with the problem and lands on "Working current rent".
- Guided pages run 3,000 to 7,400 px. Full view was 13,611 px with 143 inputs and 103 buttons.

Expected: each step shows, in order, what is true, the facts for this decision, the one action, and evidence on request. A jump opens the exact control in place and returns to where it started.

Smallest change (layout only, no new authority):

1. Step order: status sentence; decision facts (current rent, market range, rent to recommend with Edit in place); primary action; "Other ways to send" holding Schedule, Gmail draft and Copy; then closed disclosures for the message, comparables, earlier attempts and source records.
2. In the dialog: recipients, amounts and timing at the top; the message in a scroll area; buttons fixed at the bottom.
3. After a send: replace the composer with "Sent [time] to [recipient]. View sent message." Keep "Send again" behind "Other actions".
4. Manual sub-steps: record them on the step itself as a short list with one "Mark done" each, and name the buttons for what they do ("Mark the information form as sent").
5. Blocking conditions join the readiness list. Each fix button says the fix ("Confirm the lease end date") and opens that control.
6. Jumps: open in place where possible; otherwise scroll with the label visible and return to the origin. Keep the step in the address.

Owner: UI. Workflow confirms the order per step.

First screen (Ask the owner, ready to send):

- "Ready to ask the owner. Nothing sent yet."
- "Current rent $1,350 (RentVine lease). Market $1,300 to $1,500 from 5 comparables on 11/12. Recommend $1,400 (comparison suggestion) [Edit]."
- "To: jordan.sample@... From: you."
- [Review owner message] [Other ways to send]
- Closed: Message, Comparables (5), Reason to include, Source records.

Next interaction: the review dialog, amounts first, Send fixed at the bottom.

Acceptance:

- AC-09a normal: at 1440 x 900 and at 390 x 844, the status sentence, the three amounts and the primary action of the current step are visible without scrolling after opening a lease from the desk.
- AC-09b: every "fix" or "enter" control leaves its target label fully visible and offers a return that restores the step and scroll position.
- AC-09c exception: on lease 9106 the readiness list shows the end-date item as not ready, its button names the fix, and completing it enables the review without leaving the step.
- AC-09d: after a confirmed send the step has no editable message and no Schedule, Draft or Copy outside "Other actions".

### A-10 (P2) Narrow screens: the header and the identity strip take the screen

Measured at 390 x 844:

- The app header is 310 px tall.
- Desk: "Prepare December 2026 leases" is at 933 px and the first lease row at 1,672 px. Rows are 196 px tall inside a table 864 px wide that scrolls sideways.
- Lease 9104 (five tenants): the sticky identity strip is 448 px tall, so it covers more than half the screen while scrolling. The step's primary button is at 1,288 px and Rent to recommend at 3,342 px.

Expected: the first row or the current action is on the first screen at phone width.

Smallest change: collapse the header to one row (menu, search icon, notifications). Make the identity strip one line with "N tenants" and a details disclosure, and do not pin more than 64 px. Render desk rows as cards at narrow width (address, next action, date, rent).

Owner: UI.

Acceptance:

- AC-10a: at 390 x 844 the first lease's address and next action are within the first screen of the desk, and no sideways scrolling is needed to read the next action.
- AC-10b: on a five-tenant lease the pinned area is at most 64 px and the primary action is within the first screen.

### A-11 (P2) Five places answer "what is waiting on me" and they disagree

Observed as Editor with several renewals mid-flight: Dashboard "Waiting on you" listed one rent flag; My Work showed 0 tasks; the question "What work is assigned to me today?" answered "No tasks need your attention today"; the Approval Queue said "1 thing needs your decision"; Notifications listed two unnamed replies plus setup notices; the desk held the real list as "Next action". Trace: the work session on My Work ends after 15 minutes unless staff interact with that page.

Expected: one list of what needs this person, with renewals in it.

Smallest change: show the desk's next actions for leases this person last worked (or is assigned) in "Waiting on you" and in the My Work answer, each linking to the lease step. Remove setup notices from staff notifications.

Owner: Workflow (what "mine" means for a renewal), then UI.

Acceptance:

- AC-11a: after an owner reply on a lease the Editor sent, Dashboard "Waiting on you" lists "101 Sample Pl: record the owner's decision" and opens that step.
- AC-11b exception: with the renewal read stale, the list keeps its last items, says when they were read, and offers Refresh.

## 5. Lower priority findings

| ID   | Finding                                                                                                                                                                                                                                                                                                                                                                         | Evidence                                                                                              | Smallest change                                                                                                                                    | Acceptance                                                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-12 | "Prepare [month] leases" starts paid lookups for the whole batch with no count, and ignores the visible filter. Owner direction allows one deliberate click.                                                                                                                                                                                                                    | Verified: `components/lease-renewal/RenewalKickoffPreparation.tsx` (lines 100 to 192). Trace: filter. | Label the count and the allowance beside the button: "Prepare 9 leases. Up to 9 lookups; 41 of 50 left this month." Prepare what the filter shows. | The line shows numbers equal to the lookups the stand-in records. With a filter on, only shown leases are prepared. At the allowance, the button states which leases will be skipped. |
| A-13 | Communications has four refresh controls; only the hidden one reads Gmail. Send and Schedule show in every state. The detail omits the scheduled time.                                                                                                                                                                                                                          | Observed. Trace.                                                                                      | One "Check Gmail now" in the page header that also runs the reply check. State-specific actions (see A-01).                                        | One control, visible on load, brings in a delivered reply.                                                                                                                            |
| A-14 | Retired or internal content in staff view: Maintenance notification types and items; "Not part of this lease's path" chips; QuickBooks Connect; bulk Execute; a process form asking for "Owner UID"; "Engineering default, not yet approved by the client" and raw fact keys in Documents; engineering text on Live renewal review ("Keep external actions blocked until ..."). | Observed. Trace for dead controls.                                                                    | Remove or hide each. Move internal text to Help or Admin.                                                                                          | None of the listed strings or controls render for an Editor.                                                                                                                          |
| A-15 | Process runs and Space checklists duplicate the lease path. Spaces show red "Needs a process". Start run is not idempotent and its refusal reads "Could not start a run."                                                                                                                                                                                                       | Observed list. Trace.                                                                                 | Link the two renewal Spaces to the desk as instructions only, or retire run controls for renewals.                                                 | Decision recorded by Policy; then no "Needs a process" on a Space whose work lives on the desk.                                                                                       |
| A-16 | Recording "Accepted" for the tenant saves at once with no who, how or when, unlike the owner answer. Trace: follow-ups keep going after a staff-recorded acceptance; only a recorded decline stops them.                                                                                                                                                                        | Observed. Trace.                                                                                      | Give the tenant response the owner-answer review. Stop follow-ups on any recorded response.                                                        | Recording Accepted shows a review and, with follow-ups authorized, the next tick sends 0 and the communication reads "Stopped: tenant responded".                                     |
| A-17 | The follow-up form starts blank on every lease.                                                                                                                                                                                                                                                                                                                                 | Observed.                                                                                             | Prefill from an approved follow-up template and the default cadence; keep the exact review.                                                        | The form opens complete and editable; nothing is authorized until confirmed.                                                                                                          |
| A-18 | Sheet updates are prepared and confirmed one fact at a time (five on lease 9101 before Documents).                                                                                                                                                                                                                                                                              | Observed list; not exercised.                                                                         | One preview listing every pending cell for the lease, one confirmation, one receipt per cell.                                                      | One confirmation writes N cells and reads back N receipts; a conflict on one cell reports that cell and leaves the others written or unwritten as stated.                             |
| A-19 | Dates appear in three formats; a transient state after Prepare showed "Rent to recommend: Ready" beside "Missing rent to recommend".                                                                                                                                                                                                                                            | Observed.                                                                                             | One date format. Do not advance the step until the recommendation is saved.                                                                        | No step shows both lines; all dates read MM/DD/YYYY.                                                                                                                                  |
| A-20 | The shared notice basis selector, which saves on selection for all renewals, is rendered inside each lease page and was visible at the top during one load.                                                                                                                                                                                                                     | Observed once. Trace: Editor may change it.                                                           | Show it as a read-only line on the lease with a link to its Admin page.                                                                            | An Editor on a lease cannot change the shared basis.                                                                                                                                  |

## 6. Outreach states, as they exist now

| State                    | Where it lives                                                                                       | What staff see                           | Gap                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| In-app message           | Message preparation record, autosaved                                                                | "Message revision AC5144"                | None                                                                                |
| App draft communication  | Sequence in state draft, written by the Review click and by opening "Open in Communications" (trace) | "Draft in app"                           | Opening a page creates a record                                                     |
| Copied                   | Clipboard only                                                                                       | Nothing                                  | Staff must record delivery by hand; markers can be copied                           |
| Unsent Gmail draft       | Draft head and snapshot                                                                              | "Draft waiting in Gmail since ..."       | The app learns it was sent only from "I sent it from Gmail" (trace). Not exercised. |
| Scheduled authorization  | Sequence active with schedule                                                                        | "Scheduled for ..."                      | A-02                                                                                |
| Attempted, not confirmed | Occurrence claimed, unresolved                                                                       | "The send was not confirmed"             | None. Works.                                                                        |
| Confirmed send           | Occurrence sent, thread link, outreach record                                                        | "Accepted by Gmail 11/12/2026, 12:13 PM" | Reply watch ends here. A-03                                                         |
| Paused                   | Sequence paused with a cause                                                                         | Communications only                      | Invisible on the lease. A-01, A-02                                                  |
| Reply or bounce          | Sequence inbound list, link attention                                                                | Reply card, or "needs review"            | A-03. Bounce not exercised.                                                         |
| Staff-recorded delivery  | Workspace activities                                                                                 | "Work recorded by staff"                 | Compared against thread state and raises "Needs a check". A-08                      |

## 7. Coverage map and open cases

Covered by interaction: desk Working batch; lease path for a prepared lease through owner send, reply, answer, dates, tenant schedule, fact change, hold, send, resume, tenant acceptance, information form, document status; missing owner recipient; standing agreement; housing assistance (first step); off-cycle end date; unconfirmed send; Communications Incoming and Scheduled; Notifications; Dashboard; My Work; Approval Queue; Live renewal review; Internal Processes list; Processes; Connections and access as Editor; Admin index as Admin; Help index.

Not covered, and why:

| Case                                                                                                               | Reason                                                                                                                                                                             | What would close it                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Production reply watch for completed owner messages (A-03)                                                         | Rehearsal has no worker; no production data read                                                                                                                                   | One guarded read of existing receipts: does any completed owner sequence carry an inbound reply recorded by the worker |
| Frequency of the A-04 refusal in production                                                                        | Depends on real read timing                                                                                                                                                        | Count of 409 responses on the sequences route in request logs for the last 30 days                                     |
| Unsent Gmail draft, "I sent it from Gmail", Copy then record, bounce                                               | Not exercised                                                                                                                                                                      | Rehearsal with `send-draft` and `bounce` hooks                                                                         |
| Follow-up sequences end to end                                                                                     | Form read only                                                                                                                                                                     | Rehearsal with two ticks and a reply                                                                                   |
| Sheet updates with the switch on; RentVine future rent confirm                                                     | Switch off in rehearsal; not exercised                                                                                                                                             | Rehearsal variant with the Sheet stand-in on                                                                           |
| Documents, packet evaluation, Dotloop handoff                                                                      | Inputs are source pending; both write keys closed                                                                                                                                  | After forms and maps are approved                                                                                      |
| Month-to-month review, non-renewal handoff, "Renewed in RentVine, confirm and close", retire and restore           | Not walked                                                                                                                                                                         | Same method on leases 9122 to 9138                                                                                     |
| Saved views, shared collections, global search, question answers beyond one                                        | Not walked                                                                                                                                                                         | Same method                                                                                                            |
| Approver role; a second Admin for access changes                                                                   | Not walked                                                                                                                                                                         | Rehearsal sign-in as Approver and Admin                                                                                |
| Process runs and publication                                                                                       | List only                                                                                                                                                                          | Needs published processes in the rehearsal                                                                             |
| Whether page-open provider probes are billed                                                                       | Opening Connections sends RentCast a request built to be rejected unbilled (`lib/lease-renewal/providers/rentcast-health-probe.ts`, header comment); provider billing was not read | One look at the RentCast usage page after opening Connections                                                          |
| Dark theme, physical phone, visual polish                                                                          | Screenshots unavailable for part of the session                                                                                                                                    | Staff session or a visible browser run                                                                                 |
| Real staff behavior: what they read first, whether they use Communications at all, how they learn of replies today | No human observer                                                                                                                                                                  | The Friday staff review, with A-01 to A-04 as the script                                                               |

## 8. Suggested order of work

1. A-01 server refusals (items 1 and 2). They remove the wrong-send path without changing any screen.
2. A-03 reply watch and the refresh wiring, then confirm in production.
3. A-04 confirm and dispatch re-read handling.
4. A-02 and the UI half of A-01.
5. A-05 to A-08, which share the amount model and status line.
6. A-09 to A-11 as one layout pass on the lease step and the desk.
7. Section 5 items as cleanup.

Every item keeps the existing role checks, exact review, one-attempt claims, receipts, readback and recovery. None opens an action key or adds a send path.

## 9. Corrections from the specification trace

Six read-only traces of the code and of the settled decisions were run after this audit was written, to prepare suites S272 to S284. Sections 1 to 8 are kept as written. The traces confirmed the four P1 findings and found these claims wrong or incomplete.

| Finding | Correction                                                                                                                                                                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A-01    | Plain tenant Send and Schedule are checked against the per-cycle claim; only "send with follow-ups" takes it. A resumed message is due at once, so "returns to Scheduled" in AC-01a is the label only. Smallest-change items 2 and 3 conflict with each other and with the settled one-update rule; S272 and S273 replace them. |
| A-02    | "Scheduled for 2026-11-13 at 09:00 Central" is a client-only line, not lease state. A tenant sequence paused after an accepted send does show its cause. The authorization stores no message revision, and its digest covers facts, not wording.                                                                                |
| A-03    | Gmail push is retired, so the push route's reply check is dormant, not missing. Wiring the check into the manual refresh alone would not recover a reply the mailbox cursor has passed. The broken link and missing address are on the Linked conversations row; the communication cards show the address.                      |
| A-04    | The cause is a race: the message target does not join the lease read it starts. A second transient exists through the retirement status. The worker's pause for a read in flight is pinned by a test and documented, so AC-04c changes a deliberate rule (S274).                                                                |
| A-05    | The monthly preparation stores the agreement amount with its basis, and a one-click adoption action exists but is not rendered. The fix link is specified to reach the standing choice.                                                                                                                                         |
| A-06    | An explicit affirmation of an equal amount is already allowed. The broader coverage choice exists once both working dates are saved. Preselecting the owner, a default end date and one ask for rent and term each contradict a settled decision. The RentVine and Sheet forms open with the current source value.              |
| A-07    | The desk claims hold for the monthly table only; the worklist table formats currency and states the approval. The Sheet Market value takes a hidden figure filled from the provider's point estimate, which departs from the documented rule (S278).                                                                            |
| A-08    | "Stale" begins 60 seconds after the last read, and a "Try again" button exists. The flag sentence is assembled on Live renewal review only. Status also depends on the viewer's own mailbox links, which the audit did not see (S279).                                                                                          |
| A-09    | Four proposals contradict pinned checks: the in-place rent edit, new disclosures, the step in the address and the start date on the Offer step. After a send the delivery actions are already removed. No control clears the off-cycle block, so "layout only" was wrong for that case (S282).                                  |
| A-10    | The app header is not sticky. Hiding header controls or unpinning the lease header on phones would fail the existing phone-layout contract.                                                                                                                                                                                     |
| A-11    | The 15-minute session does not explain "0 tasks". My Work reads assigned tasks only, and no lease has an assignee.                                                                                                                                                                                                              |
| A-12    | Ignoring the filter is specified. The target count is not the lookup count, because stored comparisons are reused.                                                                                                                                                                                                              |
| A-13    | Two of the four controls read Gmail; neither is visible on load.                                                                                                                                                                                                                                                                |
| A-14    | QuickBooks Connect, the bulk Execute option, the path chip and the engineering-default label are each kept by a recorded default, a pinned test or a required label.                                                                                                                                                            |
| A-15    | "Could not start a run." hides a specific server reason. Runs and Space checklists are kept by settled suites.                                                                                                                                                                                                                  |
| A-16    | The save records the staff actor, the time and an optional source. An observed reply or bounce also pauses reminders.                                                                                                                                                                                                           |
| A-17    | The settled schedule rule forbids a fixed cadence or default enrollment, so the blank form is by design.                                                                                                                                                                                                                        |
| A-18    | One confirmation for several cells conflicts with the exact action's one-field contract.                                                                                                                                                                                                                                        |
| A-19    | Both readiness lines come from one list fed by two reads; the step advance is not involved. Four date shapes exist, not three.                                                                                                                                                                                                  |
| A-20    | Editor access to the notice basis is a recorded owner decision. The "Ask an Admin" line concerns a different policy.                                                                                                                                                                                                            |

## 10. Owner direction after the trace

Section 9 records that ten proposals contradicted a settled decision, a recorded default, a required label or a pinned check, and the suites first set them aside. On November 12, 2026 the owner directed that all ten be carried, that the four questions the suites had left open be settled the same way, and that the rules which held them be retired. The owner gave no figures or wording, so the suites mark their specifics as assumptions.

| Proposal                                                                                 | Finding | Now carried by | Rule it replaces                                             |
| ---------------------------------------------------------------------------------------- | ------- | -------------- | ------------------------------------------------------------ |
| A suggested renewal end date                                                             | A-06    | S285           | S263 R-S263-2 as first written                               |
| The replying owner selected as the approver                                              | A-06    | S285           | S234 R-S234-1's last sentence                                |
| One owner ask for rent and term                                                          | A-06    | S285           | The owner copy that asked about rent alone                   |
| Preparing only the leases shown                                                          | A-12    | S283           | S249 R-S249-3's whole-month scope                            |
| One confirmation for several Sheet cells                                                 | A-18    | S278           | The one-field confirmation of S98 and S159                   |
| A read-only notice basis on the lease                                                    | A-20    | S283           | The November 3 staff selection under S125                    |
| A filled-in follow-up form                                                               | A-17    | S276           | S189 R-S189-9's rule against a starting cadence              |
| QuickBooks Connect and bulk Execute removed; the path chip and the default label retired | A-14    | S283           | A recorded default, a pinned check and two required labels   |
| Process runs retired for renewals                                                        | A-15    | S286           | The run rules of S241 and S256, and the B-PROCESS-OWNER hold |
| In-place rent edit, named groups, the step in the address, dates on the Offer step       | A-09    | S281           | Pins of S247 R-S247-14, S269 and S270                        |
| A RentVine and Sheet rent or date difference as information on every screen              | A-08    | S280           | D-OP-7's limit to the lease numbers check                    |
