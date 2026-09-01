# RentVine connection and proof

Updated: 2026-08-31.

## Reads

Production credentials are Secret Manager-bound. Complete lease export reads work and currently return
306 distinct leases. Work-order reads use the verified documented account path. Read diagnostics must
remain bodyless/value-minimized.

## Renewal write seam

The separate write client exposes only:

- documented lease update POST for allowlisted renewal-date fields;
- documented existing recurring-charge update POST for allowlisted amount/date fields.

It has no generic route or production construction path. The current broad action key remains
closed. S97 specifies the successor exact renewal-date, recurring-charge-create, and recurring-charge-
update product contracts; S99 separately specifies exact work-order read/create/status operations.

## Required proof

1. Resolve only the owner-designated real lease supplied securely to the S97 execution.
2. Read exact current provider state.
3. Produce exact proposed and rollback payloads.
4. Build/release the successor exact keys closed, then review the protected per-key activation after
   the bounded proof succeeds.
5. Human confirms the exact preview.
6. Execute one provider attempt under the durable application claim; do not infer provider
   idempotency.
7. Read back provider state and write a bodyless receipt.
8. Roll back and read back again.

A writable credential alone is not permission to write. S97's final product supports only its exact
field/key matrix and uses a separate confirmation for normal reversal; S30's automatic proof closeout
is not the business workflow.
