# RentVine connection and exact-effect operations

Updated: 2026-09-02.

## Reads

Production credentials are Secret Manager-bound. Complete paginated lease export reads work; 306
distinct leases was the 2026-08-26 measured result, not a permanent count. Work-order reads use the
verified documented account path. Read diagnostics remain bodyless/value-minimized.

## Renewal write seam

The restricted provider clients expose only their verified exact operation contracts:

- documented lease update POST for allowlisted renewal-date fields;
- documented recurring-charge create and existing-charge update operations for their allowlisted
  terms;
- documented work-order read, create, and status-update operations; and
- one manual bounded work-order-chat GET whose disclosed provider consequence marks retrieved
  manager messages read.

No generic route or production construction path exists. S97's three exact renewal keys, S99's three
exact work-order keys, and S100's chat-sync key are proved, deployed, and active. The broad renewal
compatibility key remains closed and retired. Chat posting, vendor assignment, attachments, provider
notifications, and unlisted effects remain closed.

## Completed proof and normal execution

S97 completed its bounded renewal-date, charge-create, and charge-update proofs. S99 completed its
work-order proofs; proof work order 1731 is `Cancelled`. S100 completed its chat-sync proof. Do not
rerun those proofs, reuse their proof records as new proof targets, or select substitutes.

For every normal action, resolve the current managed actor and exact record, read fresh provider
state, produce an exact preview, require exact confirmation, claim at most one provider attempt,
store a bodyless receipt, and read the result back. A reversal or correction requires a new exact
confirmation. Ambiguous provider outcomes are reconciled by read only and never retried blindly.
S100 chat sync additionally requires the explicit mark-read consequence warning and confirmation;
the provider documents no unread restoration.

A writable credential alone is not permission to write. The final products support only their exact
field/key matrices and use a separate confirmation for normal reversal/correction. S30 is retired;
its proof closeout is not the business workflow or an activation path.
