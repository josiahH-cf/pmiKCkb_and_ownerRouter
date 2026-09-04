# Renewal operator guide

This guide is for the people who run renewals. Every step names a control you can see in the app and
the result you should see after using it. Nothing here asks you to run a command or open a developer
tool.

Practice on the local rehearsal server, which reads live data but refuses every change, then do the
real work in the production application. The two look the same; the rehearsal one answers "Live data
is read only in the local rehearsal surface." whenever you try to change something.

## Before you start

- You need Editor access in the Renewals Space to record decisions, and Admin access to change a
  property preapproval amount.
- Every outside effect asks you to confirm the exact action and target first. If you did not confirm
  it, it did not happen.
- If a value reads "Needs Verification", the app could not read it. That is not zero and not none;
  it means go look.
- When a date filter you typed cannot be used, the desk names it under "Renewal date filter
  problems". That block appears only when there is a problem to name.

## Step-to-control map

The rehearsal browser check reads this table and confirms each control is on the page it names, so a
step here cannot drift from the app.

| Step                                     | Page             | Control (exact visible text)     | What you should see                                                        |
| ---------------------------------------- | ---------------- | -------------------------------- | -------------------------------------------------------------------------- |
| 1. Open the renewal worklist             | `/lease-renewal` | `Renewals`                       | The renewal table, one row per lease, soonest end date first.              |
| 2. Narrow to what you are working on     | `/lease-renewal` | `Worklist scope:`                | The scope you pick decides which leases the table lists.                   |
| 3. Undo every filter at once             | `/lease-renewal` | `Clear filters`                  | The table returns to the full worklist for the scope you are on.           |
| 4. Ask the Dashboard about your day      | `/`              | `Get answer`                     | A short list with links, or a note naming the three supported questions.   |
| 5. See what each maintenance item awaits | `/maintenance`   | `What each ticket is waiting on` | One row per open ticket with its blocker and the next action.              |
| 6. Filter maintenance by its blocker     | `/maintenance`   | `Waiting on`                     | The queue narrows in place; no page reload.                                |
| 7. Record a maintenance estimate         | `/maintenance`   | `Record an estimate`             | The estimate appears on the ticket and the blocker updates.                |
| 8. Set a property preapproval            | `/maintenance`   | `Review this preapproval`        | A confirmation restating the exact amount and property, with Cancel first. |

## Reading one lease

Open a lease from the renewal table. The workspace shows the same values the row showed, because both
read one projection.

- **Current rent** is the tenant's contractual base rent from the lease record.
- **Unit listed rent** is a reference from the unit record. It is labelled separately and it is never
  the tenant's rent.
- **Term** is fixed term, month to month, or needs review. A month-to-month lease shows the date its
  next periodic review is due, counted twelve months from the month-to-month start date. If the app
  has no start date it says so rather than inventing one.
- **Renewal timing**, **blocker**, and **next action** all come from the same guidance the table row
  used, so the two can never disagree.

Use the back link to return to the table. Your filters and sort come back with you.

## Working a renewal through

1. **Resolve a rent discrepancy.** When the lease rent and the sheet disagree, the workspace shows
   both values and asks you to record which one is right. Recording a resolution does not change
   either system; it records your decision so the desk stops treating the value as unverified.
2. **Record a term review.** When the term reads needs review, record the term you verified and, for
   a month-to-month lease, the anchor date. The record is bound to the lease facts you were looking
   at, so if those facts change your record goes stale rather than silently applying to new facts.
3. **Record the owner outcome.** After the owner replies, record which of the four outcomes it was:
   approved terms, revision requested, declined, or no response. A revision request reopens the owner
   copy and every preview built on it. A decline routes to the non-renewal handoff. Nothing invents a
   tenant answer.
4. **Prepare the offer and complete approval.** Each step names what is missing before you can
   continue. Nothing sends on its own.
5. **Create or open the Dotloop packet.** One approved packet becomes exactly one loop. If the packet
   facts change, the old loop is marked superseded rather than reused.
6. **Follow the signature handoff.** The app opens the loop in Dotloop and names the required
   signers. It does not claim a signature state, because the published Dotloop API documents no
   signature operation.

## Reading attempt state

The lease workspace shows one **Confirmed external steps** card: the last confirmed step, when it was
attempted, how it ended, any blocker, and what to do next.

- **Recorded with a receipt** means the change is done and the app has the provider's own receipt.
- **Still finishing** means the attempt is in flight. Reload in a moment.
- **Result uncertain** means the app could not confirm the outcome. Reconcile it from its exact
  receipt before confirming anything again. The app never retries by itself, and it never guesses.

## Where results appear

| Where           | What lands there                                                             |
| --------------- | ---------------------------------------------------------------------------- |
| RentVine        | The lease dates and recurring charges you confirmed, each with its readback. |
| Operating Sheet | The appended renewal row you confirmed, in the confirmed target tab.         |
| Gmail           | The draft you reviewed. You send it yourself; the app never sends.           |
| Dotloop         | The one loop for the approved packet, with its documents and participants.   |

## Practice cases

Run these on the rehearsal server. Each one ends with a correction you make through the app's own
controls; none needs a developer.

1. **A lease whose rents differ.** Open it, read current rent and unit listed rent, and record a rent
   resolution. Correct it by recording the resolution again with the other value.
2. **A month-to-month lease with no anchor.** Confirm the term reads needs review and the review date
   is absent. Record a term review with an anchor, then record it again with the correct anchor if
   you entered the wrong one.
3. **A maintenance ticket at a preapproved property.** Record an estimate under the preapproval and
   confirm the ticket stops waiting on the owner. Clear the estimate to put it back.
4. **A maintenance ticket above the preapproval.** Record an estimate above the amount and confirm the
   owner-approval request returns.
5. **An intake report about active water.** Submit it from the resident report link and confirm it is
   treated as urgent and asks for photos. It lands in the review queue for you to promote or dismiss.

## When something is not available

The app says which source did not answer and what it still knows. A read that failed never renders as
"none" or "no renewals". If you see an unavailable note, the safe move is to open the owning page and
look, not to act on the partial view.
