# Renewal operator guide

Updated: 2026-09-07. Use the [Wednesday walkthrough](renewal-client-walkthrough-2026-09-09.md)
for the staff session. This guide describes the current implementation; the walkthrough separates
serving controls from controls waiting for candidate promotion. Read release status before acting.

Local rehearsal is Demo + Live-read-only. It refuses every persistence and provider effect,
including resolutions, term reviews, estimates, drafts, and report submission. Practice reading and
navigation there. Conditional action controls are checked with isolated automated-test fixtures;
that is not a live lease proof. Never create customer state to make a control appear.

## Authority and source truth

Editor plus Renewals access permits reading, ordinary progress, term reviews, proposals, and eligible
unsent drafts. Approver or Admin resolves reconciliation decisions; a High correction requires Admin.
Admin approves pricing/source changes and executes or reconciles RentVine and Sheet effects.
A different current Admin applies staff access through the access-request workflow. A role never
substitutes for the exact action key, preview, confirmation, receipt, or readback.

Current rent is contractual lease base rent. Unit listed rent is a separate reference. Missing rent
is unknown, not zero. Read term, owner evidence, source conflicts, next action, and source freshness
before preparing anything. A changed source invalidates its earlier decision or preview.

## Step-to-control map

The browser smoke uses exact semantic locators, including the named article when controls repeat.
`workspace:` means the first verified workspace reached from the desk, with its selected phase.
A conditional row is tested only if visible; its absence is reported separately and does not prove
live availability. The owning component tests listed below exercise conditional states in isolation.

| Step | Page                        | Control (exact visible text)              | Role     | Scope                           | Availability | What you should see                                                          |
| ---- | --------------------------- | ----------------------------------------- | -------- | ------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| 1    | `/lease-renewal`            | `Renewals`                                | heading  | -                               | required     | The loaded desk or an honest source-unavailable state.                       |
| 2    | `/lease-renewal`            | `Filter renewal date`                     | summary  | -                               | required     | Date filter disclosure; opening reads and navigates only.                    |
| 3    | `/lease-renewal`            | `Month`                                   | label    | -                               | conditional  | Choose the lease end month.                                                  |
| 4    | `/lease-renewal`            | `Apply month`                             | button   | -                               | conditional  | Apply the chosen month through the desk URL.                                 |
| 5    | `/lease-renewal`            | `Clear filters`                           | link     | -                               | conditional  | Restore the current scope without filters.                                   |
| 6    | `workspace:verify-renewal`  | `← Back to renewals`                      | link     | -                               | required     | Return to the desk with the same view.                                       |
| 7    | `workspace:verify-renewal`  | `Verify renewal`                          | phase    | -                               | required     | Read the selected verification phase.                                        |
| 8    | `workspace:verify-renewal`  | `Open this lease in RentVine`             | link     | -                               | conditional  | Open the server-derived lease destination in a new tab.                      |
| 9    | `workspace:verify-renewal`  | `Open the operating renewal Sheet`        | link     | -                               | conditional  | Open the verified spreadsheet destination in a new tab.                      |
| 10   | `workspace:verify-renewal`  | `Resolve`                                 | button   | -                               | conditional  | Review the selected discrepancy resolution.                                  |
| 11   | `workspace:verify-renewal`  | `Confirm resolution`                      | button   | -                               | conditional  | Record only the exact reviewed decision.                                     |
| 12   | `workspace:verify-renewal`  | `Record lease term`                       | button   | -                               | conditional  | Record the verified term and reason against current lease facts.             |
| 13   | `workspace:owner-decision`  | `Owner decision`                          | phase    | -                               | required     | Read the owner phase and its missing evidence.                               |
| 14   | `workspace:owner-decision`  | `Record owner decision`                   | button   | -                               | conditional  | Save the owner's exact rent and terms.                                       |
| 14a  | `workspace:owner-decision`  | `Update owner decision`                   | button   | -                               | conditional  | Correct the recorded owner terms from current evidence.                      |
| 15   | `workspace:owner-decision`  | `Record owner response`                   | button   | -                               | conditional  | Record the actual response and its evidence.                                 |
| 16   | `workspace:tenant-decision` | `Tenant decision`                         | phase    | -                               | required     | Read the tenant offer phase and prerequisites.                               |
| 17   | `workspace:tenant-decision` | `Preview draft`                           | button   | -                               | conditional  | Read the exact recipient, wording, and attachment.                           |
| 18   | `workspace:tenant-decision` | `Preview review-only copy`                | button   | -                               | conditional  | Read wording that still lacks its publication approval.                      |
| 19   | `workspace:tenant-decision` | `Create Gmail draft`                      | button   | -                               | conditional  | Confirm creation of an eligible unsent draft.                                |
| 20   | `workspace:tenant-decision` | `Check exact attempt`                     | button   | -                               | conditional  | Read the result of an uncertain draft attempt without creating another.      |
| 21   | `workspace:verify-renewal`  | `Save proposal from fresh RentVine state` | button   | -                               | conditional  | Prepare the exact before/after proposal.                                     |
| 22   | `workspace:verify-renewal`  | `Review and confirm…`                     | button   | article:Review RentVine updates | conditional  | Review one RentVine effect.                                                  |
| 23   | `workspace:verify-renewal`  | `Confirm this exact effect once`          | button   | article:Review RentVine updates | conditional  | Admin confirms that one effect.                                              |
| 24   | `workspace:verify-renewal`  | `Reconcile from provider state`           | button   | article:Review RentVine updates | conditional  | Admin reads an uncertain outcome without replaying the write.                |
| 25   | `workspace:verify-renewal`  | `Prepare exact missing-row append`        | button   | -                               | conditional  | Prepare one server-derived row only when its exact link is absent.           |
| 26   | `workspace:verify-renewal`  | `Review and confirm…`                     | button   | article:Review Sheet updates    | conditional  | Review the exact Sheet row and target.                                       |
| 27   | `workspace:verify-renewal`  | `Confirm this exact effect once`          | button   | article:Review Sheet updates    | conditional  | Admin confirms the one append.                                               |
| 28   | `workspace:document-packet` | `Document packet`                         | phase    | -                               | required     | Read packet facts and the exact missing forms or connection.                 |
| 29   | `workspace:signatures`      | `Signatures`                              | phase    | -                               | required     | Read the signature handoff and missing evidence.                             |
| 30   | `workspace:compliance`      | `Compliance`                              | phase    | -                               | required     | Read all remaining completion evidence.                                      |
| 31   | `workspace:compliance`      | `Mark renewal complete`                   | button   | -                               | conditional  | Completion is accepted only with every required evidence item.               |
| 32   | `/`                         | `Get answer`                              | button   | -                               | required     | One of three read-only answers, a clarification, or unavailable state.       |
| 33   | `/maintenance`              | `What each ticket is waiting on`          | region   | -                               | required     | Read each ticket's current blocker.                                          |
| 34   | `/maintenance`              | `Waiting on`                              | combobox | -                               | required     | Filter the queue without writing.                                            |
| 35   | `/maintenance`              | `Record an estimate`                      | button   | -                               | conditional  | Record an app-owned ticket estimate in production only.                      |
| 36   | `/maintenance`              | `Review this preapproval`                 | button   | region:Property preapprovals    | required     | Review the exact property, amount, and effective date; Cancel remains first. |

Conditional proof owners: `tests/unit/renewal-guide-conditional-controls.test.tsx`,
`tests/unit/renewal-progress-controls.test.tsx`,
`tests/unit/live-renewal-review.test.tsx`, `tests/unit/s97-rentvine-updates-panel.test.tsx`,
`tests/unit/s98-operating-sheet-panel.test.tsx`,
`tests/unit/renewal-notice-draft-composer.test.tsx`,
`tests/unit/renewal-desk-component.test.tsx`, and the term/progress route and store tests.
The semantic guard rejects a matching heading, partial label, or control in the wrong panel.
Fixture proof is distinct from the browser smoke and from live availability.

## Confirmation, recovery, and completion

RentVine dates and each recurring-charge operation are independent previews and confirmations.
Read the returned receipt and fresh source values before the next effect. A pending or uncertain
attempt is not permission to start another. Admin uses its reconciliation control. Correction is a
new exact preview and confirmation bound to the original receipt, where that operation supports it.

The corrected Sheet path permits only a missing-row append. A receipt is not stable-row delete
permission. Fixed-row update, delete, and restore are unavailable. An Admin uses the receipt and
verified destination to arrange manual correction in the Sheet; the app does not automate it.

A Gmail draft is unsent. Read the exact recipient, subject, body, and attachment in Gmail before
sending it yourself. Sending outside the app still needs actual sent-message and response evidence
before progress can be counted complete. Never infer a reply from a draft.

Dotloop remains blocked on OAuth credentials, a connected managed account with a selected office
profile/template and transaction/status, and approved blank forms covering all seven families.
Both loop and upload action keys are closed. No live create control is promised. Once separately
authorized and wired to verified artifacts, the packet's loop opens in Dotloop for the human
signature handoff. Provider document identity/name proves presence only, not a content hash or
signature. Completion waits on the actual signed artifacts and all remaining requirements.
