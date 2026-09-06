---
spec_id: PMI-08
sequence: 8
title: Maintenance Synchronization, Blockers, and Approval Routing
depends_on: []
---

# Maintenance Synchronization, Blockers, and Approval Routing

## End state

The PMI application and RentVine present the same current maintenance work. Managers can scan open work and see what each item is waiting on, while properties with an established preapproval amount can bypass only the unnecessary owner-approval step.

## Source-grounded requirements

- The team asked for maintenance tickets, notes, and pictures to move between RentVine and the PMI application so there is one useful operational view.
- A blocker-focused report should show whether work is waiting on an owner, resident, vendor, scheduling, or another next step.
- Some properties already have approval for work up to a known amount; those items should move past owner approval while other work should remain waiting.
- The current application already has maintenance and vendor workflow surfaces that should be extended rather than replaced.

## Required behavior

1. Link each synchronized PMI maintenance record to its RentVine work-order identity.
2. Synchronize the fields supported by the actual provider and current application, including current status, notes, photos or attachments, property or unit, resident context, and assignment or vendor information where those already exist.
3. Define which system owns each synchronized value according to current project behavior. When both sides changed incompatibly, show a conflict instead of silently overwriting one side.
4. Prevent repeated sync from creating duplicate tickets, notes, photos, or assignments.
5. Derive and display a concise current blocker or waiting-on state from the work-order data. Use project terminology and the smallest useful set of blocker categories.
6. Add or connect the property-level preapproval setting needed by the current workflow. Support either an approved amount or the project’s existing equivalent.
7. Skip owner approval only when the work is within the property’s current preapproval and the amount needed for the decision is available. Otherwise keep the item waiting for owner approval.
8. Show the current blocker, relevant amount or approval information, assignment, latest useful activity, and a working RentVine link in the maintenance list or report.
9. Reuse existing vendor and maintenance-management features. A new vendor portal is not required by this package.

## Project integration

- Extend the current maintenance model, RentVine adapter, and report or list.
- Follow the provider’s actual API capabilities; do not promise bidirectional fields the API cannot support.
- Use existing application settings and workflow controls for the preapproval value.

## Model-run acceptance evidence

- **MSYNC-01:** A RentVine work order appears once in the PMI application with the supported status, notes, photos, property or unit, and assignment data.
- **MSYNC-02:** A supported change from either owning side reaches the other side or is clearly marked as one-way when the provider does not support the reverse action.
- **MSYNC-03:** Repeated polling, event delivery, or manual refresh creates no duplicate ticket, note, photo, or assignment.
- **MSYNC-04:** A work order within a current property preapproval skips owner approval; one above the amount or without enough amount evidence remains waiting for owner approval.
- **MSYNC-05:** A conflicting edit is visible and does not silently discard either side’s current value.
- **MSYNC-06:** The maintenance report shows a useful blocker and working source link for representative open items.

Use model-run provider fixtures, integration tests, and browser checks.

## Outside scope

- Building a new vendor portal.
- Automatically dispatching a vendor or authorizing work beyond the existing workflow.
- Replacing RentVine as the maintenance system of record.
- Inventing unsupported provider fields or directions of synchronization.
