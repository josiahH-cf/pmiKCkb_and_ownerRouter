# RentVine live field map

Re-derived and corrected: 2026-08-26.

The old filename is retained because code comments reference it. The old 25-row/305-row narrative is
superseded.

## Complete export

- 306 distinct leases returned through paginated export.
- Lease id: `lease.leaseID`.
- Lease end: `lease.endDate`.
- Tenants: `lease.tenants[]`, including authoritative email when present.
- Owners: `portfolio.owners[]`, including all authoritative owner emails when present.
- Property: `property`, with composed street number/name and whole-address fallback.
- Unit: `unit`.
- Current rent for this live shape: `unit.rent` on 306/306.
- Lease-level current-rent keys in the 2026-08-26 diagnostic: 0/306.

The mapper resolves `unit.rent` first, then legacy lease-level fallbacks. Recipient handling
iterates all owner/tenant records and keeps owner and tenant channels separate.

## Evidence rule

Discovery output contains paths, counts, and shape only. Do not print or commit names, addresses,
emails, rents, balances, or raw provider responses.

## Write state

The currently deployed restricted client contains partial lease/recurring-charge POST support, but
production renewal write remains closed and live-unproven. S97 specifies the complete exact renewal-
date and recurring-charge create/update contracts, readbacks, receipts, ambiguity recovery,
reversal, one-record proof, and protected activation. No generic provider request is authorized.
