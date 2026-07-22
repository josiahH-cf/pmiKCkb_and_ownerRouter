# RentVine Live Field Map — confirmed 2026-07-22 (Slice 1 discovery)

Read-only live discovery against `pmikcmetro.rentvine.com` `GET /leases/export` (25 rows), via
`npm run discover:rentvine-fields -- --live --limit 25` (`scripts/discover-rentvine-fields.ts`).
Output is **paths + presence + coverage only** — no email, name, rent, or address value was printed or
written (the gitignored proof at `temp/rentvine-field-discovery/field-discovery.json` is redacted the
same way). This resolves the D16 read half and feeds Slices 6 and 9.

## Confirmed field paths (on the `/leases/export` row)

| Purpose                            | Path on export row              | Path on flattened lease view      | Coverage (present/of) |
| ---------------------------------- | ------------------------------- | --------------------------------- | --------------------- |
| Lease id (join key)                | `lease.leaseID`                 | `leaseID`                         | 25/25                 |
| Tenant name (recipient join)       | `lease.tenants[].name`          | `tenants[].name`                  | 25/25                 |
| **Tenant email (recipient)**       | `lease.tenants[].email`         | `tenants[].email`                 | **25/25** email-shaped |
| Lease-end date                     | `lease.endDate`                 | `endDate` → `lease_end_date`      | 25/25                 |
| Current rent                       | `unit.rent`                     | `currentRent` (lifted)            | 25/25                 |
| **Property-owner email (D10)**     | `portfolio.owners[].email`      | `portfolio.owners[].email`        | **25/25** email-shaped |
| Property-owner name                | `portfolio.owners[].name`       | `portfolio.owners[].name`         | 25/25                 |
| Property-owner contact id          | `portfolio.owners[].contactID`  | `portfolio.owners[].contactID`    | 25/25                 |
| Property street (Zillow link, S3)  | `property.streetName`/`.address`| `property.streetName`/`.address`  | 25/25                 |
| Property city / state / postal     | `property.city`/`.stateID`/`.postalCode` | same on `property`       | 25/25                 |

The export row's top-level append objects are: `lease` (with `tenants[]`), `portfolio` (with
`owners[]`), `property`, `unit`, `balances`, `unpaidCharges[]` (87 leaf paths total).

## D10 owner-email finding (feeds Slice 6)

The authoritative property-owner email is **`portfolio.owners[].email`** — a **plural `owners[]` array on
the portfolio append**, present and email-shaped on **all 25** leases.

`resolveRenewalRecipient` (`lib/lease-renewal/recipient-resolution.ts`) currently resolves the OWNER
channel **0/25** because `ownerContainers` searches only `lease.owner`, `lease.owners[0]`,
`lease.property.owner`, and singular `lease.portfolio.owner` — none of which is the real
`portfolio.owners[]` array. **Slice 6 wiring:** add a `portfolio.owners[]` container (each element,
`scopedEmailKeys`) so the owner channel resolves from the authoritative source, then re-run this
discovery live to confirm owner coverage > 0 before flipping `gmail.maintenance_owner_notice.draft_create`.

`leaseViewsFromExport` already preserves the `portfolio` sibling on the flattened view, so no read-path
change is needed — only the resolver's container list.

## D18 write endpoint (feeds Slice 9) — UNRESOLVED, flagged for AM

Not probed. The RentVine client is **GET-only by contract** (`lib/integrations/rentvine/client.ts` has no
write path), and no RentVine **write** endpoint or field-write semantics are documented in-repo. A live
write flip requires the owner/vendor to supply the documented write endpoint + semantics. Until then
Slice 9's executor is built but stays `production_allowed:false`. **AM owner step:** provide the confirmed
RentVine renewal-write endpoint (path, method, payload, idempotency + rollback semantics) to flip the gate.

## Re-verify

`npm run discover:rentvine-fields -- --live --limit 25` (free; read-only; no GCP budget). Needs a fresh
ADC/RentVine session (`npm run auth:session`) and `.env.local` RentVine creds.
