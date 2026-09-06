---
spec_id: PMI-01
sequence: 1
title: Correct Current Rent Source
depends_on: []
---

# Correct Current Rent Source

## End state

Every renewal surface uses the tenant’s actual current rent from the active RentVine lease context. Property market rent remains a separate reference value and can never stand in for the amount the current tenant is paying.

## Source-grounded requirements

- The application review showed a renewal row changing when the property-level market-rent value changed, proving that the wrong source was being consumed.
- The correct value was located in the active lease/current-rent area of RentVine and was consistent with the applicable recurring-rent charge shown for the tenant.
- The renewal workflow already treats a material disagreement between RentVine and the operating sheet as a blocker that must be resolved before continuing.
- Missing rent must remain unavailable rather than appearing as `$0`.

## Required behavior

1. Identify the exact RentVine API field or existing normalized field that represents the active tenant’s current rent. Confirm it from current provider documentation and the repository rather than guessing from display labels.
2. Correct the existing shared renewal read path so the renewal table, lease workspace, proposal inputs, and any renewal query use that same current-rent value.
3. Keep property market rent separately named and displayed only where it is useful as a reference.
4. When the current-rent source is missing, unreadable, or not associated with the active lease, show an unavailable or blocked state. Do not substitute market rent, another charge, a blank verified value, or zero.
5. When the current-rent value conflicts with another workflow source such as the operating sheet, show both values, identify the disagreement, and keep the renewal from advancing until the existing discrepancy workflow resolves it.
6. After a supported correction, refresh the owning renewal data so the table and workspace show the same new value.

## Project integration

- Change the existing renewal data path; do not create a second rent resolver alongside it.
- Reuse the application’s existing source-link, discrepancy, refresh, and external-write behavior where present.
- Preserve the project’s existing currency, lease-status, and recurring-charge rules.

## Model-run acceptance evidence

- **RENT-01:** With current rent `1050` and market rent `1000`, every renewal consumer uses `1050` as the tenant’s current rent and labels `1000` only as market rent if it is shown.
- **RENT-02:** With no usable active-lease rent, the renewal is unavailable or blocked and never displays `$0` as a verified amount.
- **RENT-03:** With different RentVine and operating-sheet amounts, the affected renewal shows the two sources and cannot advance through the existing verification step.
- **RENT-04:** After the authoritative current-rent source changes, a model-run refresh shows the corrected value consistently in the table and workspace.
- **RENT-05:** An unrelated property-level market-rent update does not change the current tenant rent shown by the renewal workflow.

Use project-native unit, integration, and browser checks.

## Outside scope

- Changing how market rent is set or syndicated.
- Changing security-deposit behavior.
- Recommending a new renewal rent.
- Rebuilding existing discrepancy or RentVine write workflows when they already satisfy the required outcome.
