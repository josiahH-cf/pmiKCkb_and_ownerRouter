# Renewal operator guide

Updated: 2026-09-10 for the verified S113 production release. Consult
[current status](../status.md) for the exact serving revision and backend evidence.
Use the [staff walkthrough](renewal-client-walkthrough-2026-09-09.md) and
[printable training guide](renewal-training-guide.pdf) for the meeting.

## One lease, one dashboard

Open **Renewals**, choose a lease, and check its property, tenant and dates. The five section links
are **Lease details**, **Market rent comparison**, **Owner approval**, **Tenant offer and response**,
and **Documents and completion**. All work is on the same dashboard. **Do this next** focuses the
current control; inspection and navigation do not advance work. Old phase URLs still reach their
corresponding section. **← Back to renewals** returns to the same filtered desk. Each section and
card heading has a small **i** control, **About …**, that opens plain-language help: purpose, the
real steps, what saving records and what does not happen. Opening help changes nothing.

The compact lease identity, the section links and two panel buttons stay at the top of the page while
you scroll. **Lease information** opens a side panel with the full property, unit, dates, term, base
rent and reference amounts, owners, tenants, known contacts, status and validated source records.
Each value is separately selectable with a **Copy** control beside it, and **Copy all owner emails**
or **Copy all tenant emails** copies every source-backed address for that one audience; a party with
no email on file is named, never dropped. **Show leases for this owner** or **tenant** opens the
renewal table filtered to that party. The same panel holds **Work status (recorded by staff)**:
choose where the work stands (for example Verifying lease and rent, Waiting on owner response or
Waiting on tenant response) and select **Save status**; the panel then shows who saved it and when,
and **Status history** lists earlier values with their recorder. An unset status reads Not recorded,
and a status saved during an earlier renewal cycle is labeled as such. The renewal table's
**Filter status** disclosure filters by that same saved status, including Not recorded, alongside
the owner, tenant, date and scope filters, and the filter comes back with you from a lease. The
staff status is a note for resuming work: it never records owner approval, a sent message, a
signature, completion or a source update. **Process guide** opens a separate panel that lists every
section and its real controls; selecting an entry jumps to that control without recording progress.
Open, close or navigate either panel freely: nothing is saved, sent or verified by the panels, and
your unsaved edits stay on the page.

Current rent means contractual base rent. Separate recurring charges, the total lease payment and
unit listed rent retain their own labels. Unknown values stay unknown. Open the exact RentVine and
Sheet destinations, review source freshness, and refresh when requested.

## Correct facts and update sources

**Rent and charges** is the one working area for rent and charge facts. It shows the current
contractual base rent, the lease total and the unit-listed reference with their sources, every
recurring charge with its account classification and schedule, and two intents: **Correct a
current fact** for a value that is wrong today and **Prepare future approved rent** for the
owner-approved terms already recorded. **Update status by destination** lists, for the app, the
Sheet and RentVine, what is saved, prepared, applied with a receipt, read back or still needs
attention. A saved value is never described as a source update.

In **Correct a lease fact**, select the fact, accept the prefilled RentVine value or enter the
reviewed value, record its source/reason, and choose the supported destination. No row number or
provider code is needed. An Editor can save a current-rent proposal for review; the approving role
reloads that proposal in the same editor. A recorded decision does not change a source.

Admin reviews the exact preview for each source (lease, source system, field or charge, current
and proposed values, effective timing and what the confirmation changes), cancels or confirms that
one effect, and reads its returned receipt and observed state. Sheet updates support existing rows and separately
confirmed current-state corrections. Missing-row append remains available; row deletion and
historical restore are unavailable. When both destinations are chosen, each has its own outcome.
One succeeded and one pending must remain visibly separate.

Current RentVine base-rent correction changes only the identified current rent billing amount.
After it applies, the refreshed contractual base rent is compared with that charge; a remaining
difference is shown as a mismatch in Update status by destination and under the effect, never as
a completed rent change. Future renewal rent and dates use the separate controls bound to the
current owner-approved terms, and the Admin confirmation of a future-rent effect waits for the
tenant's recorded acceptance of those exact terms. Unsupported fees or ambiguous billing mappings
explain the exact limitation and point to the RentVine lease record. They do not authorize a
generic provider edit.

An interrupted or uncertain attempt must be recovered through its existing reconciliation control.
Do not submit another write to discover whether the first succeeded. Changed sources require a
fresh preview and confirmation. A correction is a new action, with the earlier evidence retained.

## Comps and messages

Use **Comps** before requesting owner approval. The low and high start from the current
contractual base rent (20% through $750, easing to 15% at $2,500) and are labeled **Starting range
from current rent, not market evidence**; the radius starts at five miles. Deliberately run the
existing RentCast lookup, review and retain its comp/trend evidence, and save preparation: a usable
result fills only figures you have not edited, the saved PMI recommendation prepares the Sheet
Market value for Admin confirmation, and **Open the RentCast property report** opens RentCast's own
report for the resolved address (its radius setting and the market report need a RentCast Pro plan
and are not the saved result). A lookup does not approve rent. An unavailable provider, too few
comparables or an exhausted allowance leaves the starting range, the existing evidence and other
work usable; the starting range alone never satisfies the comparison-based owner message.

Prepare the owner's request in **Owner message preparation**. After explicit owner approval,
prepare **Tenant message preparation** with that cycle's exact terms. Review applicability, separate
charges, source comparisons and your signature. Save the reviewed preparation. The supplied message
formatting is preserved without staff editing notes or example customer values.

Use **Copy subject**, **Copy formatted body**, or **Copy plain text**. If clipboard access fails,
the selectable text remains available. Plain text can be pasted into the appropriate manual portal
or text channel after review. **Preview unsent Gmail draft** shows its exact recipients, subject,
body and any attachment. Confirm only that draft; a person reviews and sends it in Gmail. A saved
draft is never shown as sent. Recover the exact draft attempt after an uncertain response. Earlier
cycle drafts remain history and cannot replace the current approved terms.

## Record outside work and finish

**Work recorded by staff** accepts actual work performed by phone, email, portal, text or another
tool. Record the source/channel and occurrence evidence. Record **Owner response** separately from
**Tenant response**. Owner approval includes the exact rent, effective date and term end date.
A counteroffer or revised terms returns the affected work to review; a decline uses the non-renewal
handoff. Do not record approval merely to enable a later control.

Record applicable documents, signatures, accounting/compliance and follow-ups. **Not applicable**
requires its actual source, reason and existing approved policy or artifact predicate. Unknown
applicability remains unfinished. Pending Sheet status updates stay visible and can be reviewed
without retyping the recorded activity.

When the applicable checklist is satisfied, use **Record staff completion**. The result explicitly
means completion recorded by staff. Provider receipts, document presence and verified completion
remain separate evidence. Reopen/correct an earlier answer when necessary. Closing and reopening
the page retains the cycle; a later renewal starts a new reviewed cycle and does not inherit the
old completed checklist.

## Resource links and document handoff

The persistent labeled boxes include **Insurance flyer**, **Renewal information form**, the resident
benefits flyer, and all seven approved legal-form locations. Admin saves a reviewed HTTPS location
and its verification state. Blank boxes are **pending team input** and do not block the dashboard,
manual completion or release. Only an output that needs that resource waits. A blank or unverified
value never becomes a customer link. Saving a legal-form location does not publish legal content.

**Document preparation and signature handoff** identifies the exact missing catalog, participant
mapping, connection, selection or activation gate. **Evaluate packet** resolves current approved
sources and publishes no provider effect. When actual approved publications and mappings are
available, the normal preview shows the included forms, mapped facts and exact participants.
Download and inspect the exact approved file. Mapped facts shown in the preview do not edit those
file bytes; review and complete applicable form fields in Dotloop before sending for signature.

S106 owns connection/selection; S34 owns the separately activated loop and upload actions. The
current Dotloop keys remain closed. When their gates pass, each action uses its own exact preview,
Admin confirmation, execution receipt and readback. A retained successful receipt can rebuild the
packet view without repeating the write. A matching loop name alone cannot prove which attempt
created it; an uncertain attempt without its receipt remains for review.

Open the verified Dotloop loop for the human signature handoff. **Refresh from Dotloop** records
loop metadata only. Uploaded document identity/name proves presence, not signatures or content
verification. Record actual returned signed artifacts through the existing evidence/manual controls.
There is no documented in-app signature-send/status capability. Manual S113 work proceeds
independently while these exact document-dependent inputs are pending.

## Roles and rehearsal

Editor plus Renewals access permits ordinary recorded work, preparations and eligible unsent drafts.
Approver or Admin handles reconciliation decisions; High current-rent corrections require Admin.
Admin approves and executes exact source/provider updates and manages resource locations. Existing
Space restrictions and verification-account refusals apply. A role alone does not enable a key.

Local rehearsal is Demo + Live-read-only and refuses persistence/provider effects. Use it for
inspection and navigation. Deterministic isolated integration tests exercise effect controls; they
are not live customer proofs. Never create a customer record just to make a control appear.

## Step-to-control map

The browser smoke uses exact semantic controls and named scopes. `workspace:` retains an old step
URL while showing the full dashboard. Required rows must be visible; conditional rows report their
availability separately. An absent conditional control does not prove provider readiness.

| Step | Page                       | Control (exact visible text)                  | Role     | Scope                                             | Availability | What you should see                                                                                                             |
| ---- | -------------------------- | --------------------------------------------- | -------- | ------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 1    | /lease-renewal             | Renewals                                      | heading  | -                                                 | required     | The desk or an honest source-unavailable state.                                                                                 |
| 2    | /lease-renewal             | Filter renewal date                           | summary  | -                                                 | required     | Read-only date filter.                                                                                                          |
| 3    | /lease-renewal             | Month                                         | label    | -                                                 | conditional  | Choose the lease end month.                                                                                                     |
| 4    | /lease-renewal             | Apply month                                   | button   | -                                                 | conditional  | Filter through the desk URL.                                                                                                    |
| 5    | /lease-renewal             | Refresh source facts                          | button   | -                                                 | conditional  | Refresh sources with returned freshness.                                                                                        |
| 6    | workspace:verify-renewal   | ← Back to renewals                            | link     | -                                                 | required     | Retain the same filtered desk.                                                                                                  |
| 7    | workspace:verify-renewal   | Lease details                                 | link     | navigation:Renewal dashboard sections             | required     | Inspect this section without advancing work.                                                                                    |
| 8    | workspace:verify-renewal   | Market rent comparison                        | link     | navigation:Renewal dashboard sections             | required     | Inspect this section without advancing work.                                                                                    |
| 9    | workspace:verify-renewal   | Owner approval                                | link     | navigation:Renewal dashboard sections             | required     | Inspect this section without advancing work.                                                                                    |
| 10   | workspace:verify-renewal   | Tenant offer and response                     | link     | navigation:Renewal dashboard sections             | required     | Inspect this section without advancing work.                                                                                    |
| 11   | workspace:verify-renewal   | Documents and completion                      | link     | navigation:Renewal dashboard sections             | required     | Inspect this section without advancing work.                                                                                    |
| 12   | workspace:verify-renewal   | Open this lease in RentVine                   | link     | -                                                 | conditional  | The exact lease record on the configured RentVine host, independent of any Sheet link.                                          |
| 13   | workspace:verify-renewal   | Open the operating renewal Sheet              | link     | -                                                 | conditional  | The configured source Sheet.                                                                                                    |
| 14   | workspace:verify-renewal   | Fact to correct                               | label    | region:Correct a lease fact                       | required     | Choose a supported business fact.                                                                                               |
| 15   | workspace:verify-renewal   | Value source / reason                         | label    | region:Correct a lease fact                       | required     | Record the source of the correction.                                                                                            |
| 16   | workspace:verify-renewal   | Destinations                                  | label    | region:Correct a lease fact                       | required     | Show exact supported destinations.                                                                                              |
| 17   | workspace:verify-renewal   | Save current-rent proposal for review         | button   | region:Correct a lease fact                       | conditional  | Persist an Editor proposal without a provider effect.                                                                           |
| 18   | workspace:verify-renewal   | Review and confirm…                           | button   | article:Review Sheet updates                      | conditional  | Exact Sheet before/after.                                                                                                       |
| 19   | workspace:verify-renewal   | Confirm this exact effect once                | button   | article:Review Sheet updates                      | conditional  | One Admin-confirmed Sheet effect.                                                                                               |
| 20   | workspace:verify-renewal   | Reconcile from provider state                 | button   | article:Review RentVine updates                   | conditional  | Recover the existing attempt.                                                                                                   |
| 21   | workspace:owner-decision   | Copy formatted body                           | button   | region:Owner message preparation                  | conditional  | Copy reviewed formatted owner wording.                                                                                          |
| 22   | workspace:owner-decision   | Preview unsent Gmail draft                    | button   | region:Owner message preparation                  | conditional  | Preview an exact unsent draft.                                                                                                  |
| 23   | workspace:owner-decision   | Record owner response                         | button   | -                                                 | conditional  | Persist the actual response and exact approved terms.                                                                           |
| 24   | workspace:tenant-decision  | Copy plain text                               | button   | region:Tenant message preparation                 | conditional  | Copy the current-cycle tenant message.                                                                                          |
| 25   | workspace:tenant-decision  | Record tenant response                        | button   | -                                                 | conditional  | Persist acceptance, decline or revised terms.                                                                                   |
| 26   | workspace:document-packet  | Insurance flyer                               | label    | region:Renewal resource links                     | required     | Persistent labeled blank or reviewed location.                                                                                  |
| 27   | workspace:document-packet  | Renewal information form                      | label    | region:Renewal resource links                     | required     | Persistent labeled blank or reviewed location.                                                                                  |
| 28   | workspace:document-packet  | Reload document readiness and attempts        | button   | region:Document preparation and signature handoff | required     | Current gates and saved exact attempts.                                                                                         |
| 29   | workspace:document-packet  | Preview exact Dotloop packet creation         | button   | region:Document preparation and signature handoff | conditional  | Exact preview only when document gates pass.                                                                                    |
| 30   | workspace:compliance-close | Record staff completion                       | button   | region:Documents and completion                   | conditional  | Explicit staff-recorded completion.                                                                                             |
| 32   | `/`                        | `Get answer`                                  | button   | -                                                 | required     | One of three read-only answers, a clarification, or unavailable state.                                                          |
| 33   | `/maintenance`             | `What each ticket is waiting on`              | region   | -                                                 | required     | Read each ticket's current blocker.                                                                                             |
| 34   | `/maintenance`             | `Waiting on filter`                           | combobox | -                                                 | required     | Filter the queue without writing.                                                                                               |
| 35   | `/maintenance`             | `Record an estimate`                          | button   | -                                                 | conditional  | Record an app-owned ticket estimate in production only.                                                                         |
| 36   | `/maintenance`             | `Review this preapproval`                     | button   | region:Property preapprovals                      | required     | Review the exact property, amount, and effective date; Cancel remains first.                                                    |
| 37   | workspace:document-packet  | Approved standard lease location              | label    | region:Renewal resource links                     | required     | Persistent labeled blank or reviewed location.                                                                                  |
| 38   | workspace:document-packet  | Approved renewal extension location           | label    | region:Renewal resource links                     | required     | Persistent labeled blank or reviewed location.                                                                                  |
| 39   | workspace:document-packet  | Approved animal agreement location            | label    | region:Renewal resource links                     | required     | Persistent labeled blank or reviewed location.                                                                                  |
| 40   | workspace:document-packet  | Approved lead-based-paint disclosure location | label    | region:Renewal resource links                     | required     | Persistent labeled blank or reviewed location.                                                                                  |
| 41   | workspace:document-packet  | Approved city addendum location               | label    | region:Renewal resource links                     | required     | Persistent labeled blank or reviewed location.                                                                                  |
| 42   | workspace:document-packet  | Approved HOA artifact location                | label    | region:Renewal resource links                     | required     | Persistent labeled blank or reviewed location.                                                                                  |
| 43   | workspace:document-packet  | Approved owner acknowledgment location        | label    | region:Renewal resource links                     | required     | Persistent labeled blank or reviewed location.                                                                                  |
| 44   | workspace:verify-renewal   | Lease information                             | button   | -                                                 | required     | Toggle the lease information side panel from anywhere on the page.                                                              |
| 45   | workspace:verify-renewal   | Process guide                                 | button   | -                                                 | required     | Toggle the separate process guide side panel.                                                                                   |
| 46   | workspace:verify-renewal   | Copy all tenant emails                        | button   | complementary:Lease information                   | conditional  | Copy every source-backed tenant address once the panel is open.                                                                 |
| 47   | workspace:verify-renewal   | About Lease details                           | button   | region:Lease details                              | required     | Plain-language help for the section opens beside the heading; nothing changes.                                                  |
| 48   | workspace:verify-renewal   | About Lease term                              | button   | region:Lease details                              | required     | Help explains what recording a term changes in the app and that RentVine is not edited.                                         |
| 49   | workspace:verify-renewal   | About Correct a lease fact                    | button   | region:Correct a lease fact                       | required     | Help names the input, the destination and the separate Admin confirmation.                                                      |
| 50   | workspace:verify-renewal   | About Owner approval                          | button   | region:Owner approval                             | required     | Help gives the communicate-then-record sequence; the app sends nothing.                                                         |
| 51   | workspace:verify-renewal   | About Documents and completion                | button   | region:Documents and completion                   | required     | Help separates staff-recorded work from provider-verified completion.                                                           |
| 52   | workspace:owner-decision   | Copy recipients                               | button   | region:Owner message preparation                  | conditional  | Copy the complete To/Cc set the draft carries; a missing party refuses instead.                                                 |
| 53   | workspace:verify-renewal   | Preview Owner emails update                   | button   | article:Review Sheet updates                      | conditional  | Prepare the complete owner address set from RentVine into the Owner emails column.                                              |
| 54   | workspace:verify-renewal   | Preview Tenant emails update                  | button   | article:Review Sheet updates                      | conditional  | Prepare the complete tenant address set from RentVine into the Tenant emails column.                                            |
| 55   | workspace:verify-renewal   | Rent and charges working area                 | region   | region:Lease details                              | required     | The one working area: values, charges, intents and destination status.                                                          |
| 56   | workspace:verify-renewal   | Correct a current fact                        | link     | region:Rent and charges working area              | required     | Jumps to Correct a lease fact for a value that is wrong today.                                                                  |
| 57   | workspace:verify-renewal   | Prepare future approved rent                  | link     | region:Rent and charges working area              | required     | Jumps to the future-rent control bound to the recorded owner terms.                                                             |
| 58   | workspace:verify-renewal   | Update status by destination                  | region   | region:Rent and charges working area              | required     | Per-destination saved, prepared, applied, read-back or mismatch state.                                                          |
| 59   | workspace:verify-renewal   | Prepare this future-rent preview              | button   | region:Rent and charges working area              | conditional  | Only after owner terms, a reviewed schedule and the explicit review box.                                                        |
| 60   | workspace:verify-renewal   | Review and confirm…                           | button   | article:Review RentVine updates                   | conditional  | Dense exact preview, then the arming step for one RentVine effect.                                                              |
| 61   | workspace:verify-renewal   | Confirm this exact effect once                | button   | article:Review RentVine updates                   | conditional  | One Admin-confirmed RentVine effect after the arming step.                                                                      |
| 62   | workspace:verify-renewal   | Open the RentCast property report             | link     | region:Market rent comparison                     | conditional  | RentCast's own report for the resolved address, known unit attributes and the radius above; a missing address is named instead. |
| 63   | workspace:verify-renewal   | Open this lookup's RentCast property report   | link     | region:Market rent comparison                     | conditional  | The retained lookup's exact query on RentCast's site, not a copy of the saved result.                                           |
| 64   | workspace:verify-renewal   | Work status (recorded by staff)               | label    | complementary:Lease information                   | conditional  | Choose where the work stands; the choice is not saved until Save status.                                                        |
| 65   | workspace:verify-renewal   | Save status                                   | button   | complementary:Lease information                   | conditional  | Saves the app-owned staff status with your identity and time; nothing else changes.                                             |
| 66   | workspace:verify-renewal   | Status history                                | summary  | complementary:Lease information                   | conditional  | Earlier statuses with prior and new values, recorder and time.                                                                  |
| 67   | /lease-renewal             | Work status (recorded by staff)               | label    | -                                                 | conditional  | Filter the table by the saved staff status, including Not recorded, inside Filter status.                                       |

Conditional proof owners include the S113 dashboard, correction, manual, message and document
control tests plus their Firestore route/store integration tests. The semantic guard rejects a
heading, partial label or control in the wrong panel. The non-renewal application rows above preserve
the existing shared guide coverage. See [implementation evidence](../evidence/s113-implementation-review-2026-09-10.md)
for actual test and release outcomes.
