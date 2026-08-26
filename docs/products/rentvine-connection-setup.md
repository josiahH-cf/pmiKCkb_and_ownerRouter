# RentVine connection and proof

Updated: 2026-08-26.

## Reads

Production credentials are Secret Manager-bound. Complete lease export reads work and currently return
306 distinct leases. Work-order reads use the verified documented account path. Read diagnostics must
remain bodyless/value-minimized.

## Renewal write seam

The separate write client exposes only:

- documented lease update POST for allowlisted renewal-date fields;
- documented existing recurring-charge update POST for allowlisted amount/date fields.

It has no generic route, delete, new-charge, status-change, or production construction path. The
action key remains closed.

## Required proof

1. Client designates one unmistakable test lease/owner.
2. Read exact current provider state.
3. Produce exact proposed and rollback payloads.
4. Review protected per-key activation.
5. Human confirms the exact preview.
6. Execute once with idempotency.
7. Read back provider state and write a bodyless receipt.
8. Roll back and read back again.

A writable credential alone is not permission to write.
