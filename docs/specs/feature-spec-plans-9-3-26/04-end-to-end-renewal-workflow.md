---
spec_id: PMI-04
sequence: 4
title: End-to-End Lease Renewal Workflow
depends_on:
  - 01-renewal-data-contract.md
  - 02-lease-term-and-renewal-eligibility.md
  - 03-renewal-desk-and-workspace.md
---

# End-to-End Lease Renewal Workflow

## End state

An eligible lease can move through the full PMI renewal process from data verification to a completed, traceable result without hidden state repair or duplicate external work.

## Source-grounded workflow

The reviewed process is:

1. Find the leases that require renewal work.
2. Verify the lease, tenant, current rent, lease term, dates, and discrepancies.
3. Obtain and record the owner’s decision and proposed terms.
4. Prepare and review the renewal proposal or packet information.
5. Complete the existing approval step for the current proposal.
6. Create or hand off the Dotloop renewal packet.
7. Apply the approved RentVine and operating-sheet updates through the application’s existing integration paths.
8. Send the supported tenant communication through the existing messaging path.
9. Show completion only after the required steps for that renewal are complete; otherwise show the exact blocker and next action.

## Required behavior

1. Connect the existing renewal stages into one visible lifecycle. Use project-native phase names and controls.
2. Prevent proposal or external work while the current rent, lease term, required dates, or material discrepancies are unresolved.
3. Record owner outcomes distinctly: approved terms, revision requested, declined or non-renewal direction, and no response or follow-up needed.
4. Tie downstream work to the current proposal version so a later change in rent, dates, term, or owner decision cannot silently execute an older proposal.
5. Use specification 06 for Dotloop packet behavior and specification 07 for unattended continuation.
6. Reuse the existing RentVine, operating-sheet, approval, and messaging integrations. Do not create parallel write paths.
7. Make retries safe. Repeating a step after a timeout or restart must not create another proposal, charge, sheet entry, Dotloop loop, document set, or outbound message for the same renewal version.
8. When an external result is uncertain or only partially completed, keep the renewal in the project’s existing retry or reconciliation state with the evidence and next action visible.
9. Keep one lease’s blocker from preventing unrelated eligible leases from being worked.
10. Give the operator a clear current phase, completed steps, blocker, and next action in both the table and workspace.

## Project integration

- Use the current application lifecycle, approval, write, communication, and reconciliation patterns.
- Adapt the sequence to actual owning services when the repository proves a different internal order, while preserving the observable workflow above.
- Do not introduce a distributed transaction or a second renewal workflow engine.

## Model-run acceptance evidence

- **RENEWAL-01:** A representative fixed-term lease moves from eligibility through verification, owner terms, approved proposal, Dotloop packet or handoff, RentVine and sheet updates, communication, and completion.
- **RENEWAL-02:** Owner revision, decline, no response, rent conflict, and term-review cases stop at distinct, recoverable states.
- **RENEWAL-03:** Failure and retry at each external boundary produce one effective result for the current renewal version.
- **RENEWAL-04:** Changing approved inputs before execution prevents the older proposal from continuing.
- **RENEWAL-05:** Completion is not shown while a required step is missing, failed, or unresolved.
- **RENEWAL-06:** A blocked lease does not stop another eligible lease from completing.

Exercise these through project-native automated tests and model-operated integration or browser flows.

## Outside scope

- Choosing renewal terms on behalf of the owner.
- Creating legal lease language.
- LeadSimple integration.
- Replacing established RentVine, sheet, messaging, or approval subsystems that already satisfy the workflow.
