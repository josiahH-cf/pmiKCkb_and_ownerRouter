---
spec_id: PMI-03
sequence: 3
title: Renewal Desk and Lease Workspace Alignment
depends_on:
  - 01-renewal-data-contract.md
  - 02-lease-term-and-renewal-eligibility.md
---

# Renewal Desk and Lease Workspace Alignment

## End state

A renewal operator can scan the renewal table, filter to the work that matters, open a lease, act or investigate, and return to the same working set. The table and detailed workspace show the same rent, lease term, status, blocker, and next action.

## Source-grounded requirements

- The application review emphasized a sortable renewal table so operators can see owner, tenant, location, cost information, and blocker state without opening every lease.
- Filters for tenant, owner, and lease location were demonstrated.
- Returning from a lease should preserve the prior filtered table instead of forcing the operator to start over.
- A blocked renewal should say what is blocking it, including rent discrepancies or missing owner decisions.

## Required behavior

1. Make the existing renewal table and lease workspace consume the same owning renewal data and workflow state.
2. Show at least the operator-relevant owner, tenant, lease location, actual current rent, lease term, renewal timing, current status, blocker summary, and next action using the project’s established layout.
3. Preserve tenant, owner, location, sorting, current renewal period, and the operator’s return position when opening and returning from a lease.
4. Apply the corrected rent and lease-term behavior from specifications 01 and 02 in both surfaces.
5. Keep blockers specific. A discrepancy, missing owner decision, missing term, unavailable source, or other supported condition should identify the next action rather than collapsing to generic `blocked`.
6. After a change in the workspace, refresh the affected row without resetting the rest of the operator’s working context.
7. When a supporting read fails, show that source as unavailable or failed while keeping unaffected information usable.

## Project integration

- Align existing components and queries rather than replacing the renewal interface wholesale.
- Use the project’s existing route, query, or saved-view mechanism for return state.
- Do not add unrelated Dashboard, navigation, or visual redesign work.

## Model-run acceptance evidence

- **DESK-01:** For the same lease, the table and workspace return the same current rent, term, status, blocker, and next action.
- **DESK-02:** Combined tenant, owner, and location filters plus sorting survive open, edit or review, and back navigation.
- **DESK-03:** Updating rent or term in the owning flow refreshes the affected row while preserving the filter set and return position.
- **DESK-04:** A source failure is shown as unavailable or failed rather than as no data, no blocker, or zero.
- **DESK-05:** A blocked row identifies the concrete discrepancy or missing decision that must be addressed.

Use the project’s existing test and browser tooling.

## Outside scope

- Rebuilding the full navigation or Dashboard.
- Creating a separate renewal status engine for the table.
- Adding fields that do not help the operator scan or complete renewal work.
