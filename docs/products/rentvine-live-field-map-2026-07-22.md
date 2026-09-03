# RentVine live field map

Re-derived and corrected from the 2026-08-26 measured export; write state updated 2026-09-02.

The old filename is retained because code comments reference it. The old 25-row/305-row narrative is
superseded.

## Measured complete export

- 306 distinct leases returned through paginated export.
- Lease id: `lease.leaseID`.
- Lease end: `lease.endDate`.
- Tenants: `lease.tenants[]`, including authoritative email when present.
- Owners: `portfolio.owners[]`, including all authoritative owner emails when present.
- Property: `property`, with composed street number/name and whole-address fallback.
- Unit: `unit`.
- Current rent for this live shape: `unit.rent` on 306/306.
- Lease-level current-rent keys in the 2026-08-26 diagnostic: 0/306.

For export-shaped rows, the mapper accepts only `unit.rent` as contractual base rent and does not
fall through to lease-level rent lookalikes when that field is absent. Flat legacy fixtures without
an explicit unit retain the configurable fallback. Recipient handling iterates all owner/tenant
records and keeps owner and tenant channels separate.

## Evidence rule

Discovery output contains paths, counts, and shape only. Do not print or commit names, addresses,
emails, rents, balances, or raw provider responses.

## Write state

S97's exact renewal-date update, recurring-charge create, and recurring-charge update contracts are
proved, deployed, and active. Each normal action still requires current authority, exact preview and
confirmation, an at-most-once claim, receipt, provider readback, and a separately confirmed reversal
or correction. The completed proof is not rerun. The broad compatibility action remains closed and
retired; no generic provider request is authorized.
