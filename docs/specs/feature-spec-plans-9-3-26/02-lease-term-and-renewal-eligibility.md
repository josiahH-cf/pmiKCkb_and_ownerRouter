---
spec_id: PMI-02
sequence: 2
title: Lease Term and Renewal Eligibility
depends_on:
  - 01-renewal-data-contract.md
---

# Lease Term and Renewal Eligibility

## End state

The lease and renewal views clearly distinguish fixed-term or yearly leases from month-to-month leases. The distinction drives the renewal workload so fixed-term leases follow their end dates and month-to-month leases do not reappear as ordinary renewals every month.

## Source-grounded requirements

- Start and end dates are useful, but the meeting showed that month-to-month leases may have no end date, an expired end date, or dates that do not reliably describe the current agreement.
- The team requested a visible toggle or indicator for month-to-month versus yearly leases.
- A month-to-month lease is not treated as a normal monthly renewal; the stated operating practice is to review it again after roughly a year.
- The term should be visible in the renewal experience without forcing the operator to infer it from dates.

## Required behavior

1. Use the existing provider field when it reliably identifies lease term. When the provider does not supply a usable value, add the lightest project-native field or control needed to record `fixed-term/yearly`, `month-to-month`, or `needs review`.
2. Show the term and relevant start/end dates in the lease and renewal views. Use the application’s established presentation pattern rather than forcing a new table column when a status label is clearer.
3. Treat dates as evidence, not as an unconditional classifier. No end date, an expired end date, or a one-year span must not silently decide the term when the record is ambiguous.
4. Place fixed-term leases into the existing renewal window from their verified end date.
5. Keep month-to-month leases out of the ordinary monthly renewal cycle. Surface them for periodic review around one year after the best supported month-to-month start, conversion, or last review date.
6. When no reliable review anchor exists, show `needs review` rather than inventing one.
7. Recalculate renewal eligibility everywhere the term or relevant dates change.
8. Reuse any existing RentVine writeback or lease-data update path if the term can be represented there; otherwise keep the application-owned value in the project’s established data model.

## Project integration

- Use the existing renewal query, lease edit flow, and date conventions.
- Do not introduce a separate scheduler or duplicate eligibility calculation.

## Model-run acceptance evidence

- **TERM-01:** A fixed-term lease enters the current renewal cohort according to its verified end date and the project’s existing lead-window rules.
- **TERM-02:** A month-to-month lease does not appear as a conventional renewal in consecutive months.
- **TERM-03:** A month-to-month lease becomes reviewable around the supported annual anchor and records the next review point using the project’s existing workflow.
- **TERM-04:** Missing or contradictory dates produce `needs review` rather than an unsupported fixed-term or month-to-month result.
- **TERM-05:** Changing the term or date evidence updates the renewal table, workspace, and Dashboard renewal query consistently.

Use project-native automated checks and model-operated browser coverage.

## Outside scope

- Automatically converting leases between fixed-term and month-to-month.
- Fabricating lease end dates.
- Selecting owner terms or a proposed rent.
- Backfilling uncertain records by guess.
