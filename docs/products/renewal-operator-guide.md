# Renewal operator guide

Updated: 2026-09-10 for the verified S113 production release. Consult
[current status](../status.md) for the exact serving revision and backend evidence.
Use the [staff walkthrough](renewal-client-walkthrough-2026-09-09.md) and
[printable training guide](renewal-training-guide.pdf) for the meeting.

## One lease, one dashboard

Open **Renewals**, choose a lease, and check its property, tenant and dates. The five section links
are **Lease details**, **Comps**, **Owner**, **Tenant**, and **Documents and completion**. All work is
on the same dashboard. **Do this next** focuses the current control; inspection and navigation do
not advance work. Old phase URLs still reach their corresponding section. **← Back to renewals**
returns to the same filtered desk.

Current rent means contractual base rent. Separate recurring charges, the total lease payment and
unit listed rent retain their own labels. Unknown values stay unknown. Open the exact RentVine and
Sheet destinations, review source freshness, and refresh when requested.

## Correct facts and update sources

In **Correct a lease fact**, select the fact, choose an observed value or enter the reviewed value,
record its source/reason, and choose the supported destination. No row number or provider code is
needed. An Editor can save a current-rent proposal for review; the approving role reloads that
proposal in the same editor. A recorded decision does not change a source.

Admin reviews the exact before/after for each source, cancels or confirms that one effect, and
reads its returned receipt and observed state. Sheet updates support existing rows and separately
confirmed current-state corrections. Missing-row append remains available; row deletion and
historical restore are unavailable. When both destinations are chosen, each has its own outcome.
One succeeded and one pending must remain visibly separate.

Current RentVine base-rent correction changes only the identified current rent billing amount.
Future renewal rent and dates use the separate controls bound to the current owner-approved terms.
Unsupported fees or ambiguous billing mappings explain the exact limitation. They do not authorize
a generic provider edit.

An interrupted or uncertain attempt must be recovered through its existing reconciliation control.
Do not submit another write to discover whether the first succeeded. Changed sources require a
fresh preview and confirmation. A correction is a new action, with the earlier evidence retained.

## Comps and messages

Use **Comps** before requesting owner approval. Deliberately run the existing RentCast lookup,
review and retain its comp/trend evidence, and save preparation. A lookup does not approve rent.
An unavailable provider or exhausted allowance leaves the existing evidence and other work usable.

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

| Step | Page                       | Control (exact visible text)                  | Role     | Scope                                             | Availability | What you should see                                                          |
| ---- | -------------------------- | --------------------------------------------- | -------- | ------------------------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| 1    | /lease-renewal             | Renewals                                      | heading  | -                                                 | required     | The desk or an honest source-unavailable state.                              |
| 2    | /lease-renewal             | Filter renewal date                           | summary  | -                                                 | required     | Read-only date filter.                                                       |
| 3    | /lease-renewal             | Month                                         | label    | -                                                 | conditional  | Choose the lease end month.                                                  |
| 4    | /lease-renewal             | Apply month                                   | button   | -                                                 | conditional  | Filter through the desk URL.                                                 |
| 5    | /lease-renewal             | Refresh source facts                          | button   | -                                                 | conditional  | Refresh sources with returned freshness.                                     |
| 6    | workspace:verify-renewal   | ← Back to renewals                            | link     | -                                                 | required     | Retain the same filtered desk.                                               |
| 7    | workspace:verify-renewal   | Lease details                                 | link     | navigation:Renewal dashboard sections             | required     | Inspect this section without advancing work.                                 |
| 8    | workspace:verify-renewal   | Comps                                         | link     | navigation:Renewal dashboard sections             | required     | Inspect this section without advancing work.                                 |
| 9    | workspace:verify-renewal   | Owner                                         | link     | navigation:Renewal dashboard sections             | required     | Inspect this section without advancing work.                                 |
| 10   | workspace:verify-renewal   | Tenant                                        | link     | navigation:Renewal dashboard sections             | required     | Inspect this section without advancing work.                                 |
| 11   | workspace:verify-renewal   | Documents and completion                      | link     | navigation:Renewal dashboard sections             | required     | Inspect this section without advancing work.                                 |
| 12   | workspace:verify-renewal   | Open this lease in RentVine                   | link     | -                                                 | conditional  | The exact source lease.                                                      |
| 13   | workspace:verify-renewal   | Open the operating renewal Sheet              | link     | -                                                 | conditional  | The configured source Sheet.                                                 |
| 14   | workspace:verify-renewal   | Fact to correct                               | label    | region:Correct a lease fact                       | required     | Choose a supported business fact.                                            |
| 15   | workspace:verify-renewal   | Value source / reason                         | label    | region:Correct a lease fact                       | required     | Record the source of the correction.                                         |
| 16   | workspace:verify-renewal   | Destinations                                  | label    | region:Correct a lease fact                       | required     | Show exact supported destinations.                                           |
| 17   | workspace:verify-renewal   | Save current-rent proposal for review         | button   | region:Correct a lease fact                       | conditional  | Persist an Editor proposal without a provider effect.                        |
| 18   | workspace:verify-renewal   | Review and confirm…                           | button   | article:Review Sheet updates                      | conditional  | Exact Sheet before/after.                                                    |
| 19   | workspace:verify-renewal   | Confirm this exact effect once                | button   | article:Review Sheet updates                      | conditional  | One Admin-confirmed Sheet effect.                                            |
| 20   | workspace:verify-renewal   | Reconcile from provider state                 | button   | article:Review RentVine updates                   | conditional  | Recover the existing attempt.                                                |
| 21   | workspace:owner-decision   | Copy formatted body                           | button   | region:Owner message preparation                  | conditional  | Copy reviewed formatted owner wording.                                       |
| 22   | workspace:owner-decision   | Preview unsent Gmail draft                    | button   | region:Owner message preparation                  | conditional  | Preview an exact unsent draft.                                               |
| 23   | workspace:owner-decision   | Record owner response                         | button   | -                                                 | conditional  | Persist the actual response and exact approved terms.                        |
| 24   | workspace:tenant-decision  | Copy plain text                               | button   | region:Tenant message preparation                 | conditional  | Copy the current-cycle tenant message.                                       |
| 25   | workspace:tenant-decision  | Record tenant response                        | button   | -                                                 | conditional  | Persist acceptance, decline or revised terms.                                |
| 26   | workspace:document-packet  | Insurance flyer                               | label    | region:Renewal resource links                     | required     | Persistent labeled blank or reviewed location.                               |
| 27   | workspace:document-packet  | Renewal information form                      | label    | region:Renewal resource links                     | required     | Persistent labeled blank or reviewed location.                               |
| 28   | workspace:document-packet  | Reload document readiness and attempts        | button   | region:Document preparation and signature handoff | required     | Current gates and saved exact attempts.                                      |
| 29   | workspace:document-packet  | Preview exact Dotloop packet creation         | button   | region:Document preparation and signature handoff | conditional  | Exact preview only when document gates pass.                                 |
| 30   | workspace:compliance-close | Record staff completion                       | button   | region:Documents and completion                   | conditional  | Explicit staff-recorded completion.                                          |
| 32   | `/`                        | `Get answer`                                  | button   | -                                                 | required     | One of three read-only answers, a clarification, or unavailable state.       |
| 33   | `/maintenance`             | `What each ticket is waiting on`              | region   | -                                                 | required     | Read each ticket's current blocker.                                          |
| 34   | `/maintenance`             | `Waiting on filter`                           | combobox | -                                                 | required     | Filter the queue without writing.                                            |
| 35   | `/maintenance`             | `Record an estimate`                          | button   | -                                                 | conditional  | Record an app-owned ticket estimate in production only.                      |
| 36   | `/maintenance`             | `Review this preapproval`                     | button   | region:Property preapprovals                      | required     | Review the exact property, amount, and effective date; Cancel remains first. |
| 37   | workspace:document-packet  | Approved standard lease location              | label    | region:Renewal resource links                     | required     | Persistent labeled blank or reviewed location.                               |
| 38   | workspace:document-packet  | Approved renewal extension location           | label    | region:Renewal resource links                     | required     | Persistent labeled blank or reviewed location.                               |
| 39   | workspace:document-packet  | Approved animal agreement location            | label    | region:Renewal resource links                     | required     | Persistent labeled blank or reviewed location.                               |
| 40   | workspace:document-packet  | Approved lead-based-paint disclosure location | label    | region:Renewal resource links                     | required     | Persistent labeled blank or reviewed location.                               |
| 41   | workspace:document-packet  | Approved city addendum location               | label    | region:Renewal resource links                     | required     | Persistent labeled blank or reviewed location.                               |
| 42   | workspace:document-packet  | Approved HOA artifact location                | label    | region:Renewal resource links                     | required     | Persistent labeled blank or reviewed location.                               |
| 43   | workspace:document-packet  | Approved owner acknowledgment location        | label    | region:Renewal resource links                     | required     | Persistent labeled blank or reviewed location.                               |

Conditional proof owners include the S113 dashboard, correction, manual, message and document
control tests plus their Firestore route/store integration tests. The semantic guard rejects a
heading, partial label or control in the wrong panel. The non-renewal application rows above preserve
the existing shared guide coverage. See [implementation evidence](../evidence/s113-implementation-review-2026-09-10.md)
for actual test and release outcomes.
