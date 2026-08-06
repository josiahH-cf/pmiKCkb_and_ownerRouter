# RentVine Live Field Map — confirmed 2026-07-22 (Slice 1 discovery)

> **Correction 2026-08-06 — read this before using the numbers below.** Two things changed.
>
> 1. **The coverage figures on this page are a 25-lease sample, not portfolio coverage.**
>    `/leases/export` is page-limited and this discovery ran against the default page, which returns
>    lease ids 1 through 25. The real portfolio is 305 leases (`pageSize` is the honoured parameter;
>    `limit` is accepted and ignored). Every "25/25" below therefore means "all of the first 25
>    leases", which is a non-random sample. Portfolio-wide coverage is re-measured by S57
>    (`docs/feature-suites/portfolio-complete-lease-reads.md`) and recorded in `docs/facts.md` as
>    `F-RENTVINE-EXPORT-PAGE-LIMITED`.
> 2. **The D10 note below is stale.** It states that `resolveRenewalRecipient` resolves the OWNER
>    channel 0/25. That Slice 6 wiring landed: a live re-derivation on 2026-08-06 resolved the owner
>    channel on every lease scanned via `portfolio.owners[0].email`. What remains open is different —
>    the owner branch returns only the **first** owner and produces no Cc, which S61
>    (`docs/feature-suites/renewal-recipient-fanout-and-separation.md`) fixes.
>
> The field **paths** on this page were re-derived live on 2026-08-06 with **zero drift**. They are
> current. Only the coverage denominators and the D10 resolver note were wrong.
>
> **Portfolio-wide coverage, measured 2026-08-06 after S57's complete paged read** (305 rows, 305
> distinct lease ids, `complete=true`, AC-S57-8): tenant email present on **302/305** leases
> (`lease.tenants[].email`, any element; `tenants[0].email` alone covers 301); owner email present on
> **305/305** leases (`portfolio.owners[].email`, any element; `owners[0].email` alone covers 303);
> **146/305** leases carry **more than one** owner email, which is the population S61's owner fan-out
> addresses. The 25/25 figures in the table below are retained as the historical default-page sample.

Read-only live discovery against `pmikcmetro.rentvine.com` `GET /leases/export` (25 rows), via
`npm run discover:rentvine-fields -- --live --limit 25` (`scripts/discover-rentvine-fields.ts`).
Output is **paths + presence + coverage only** — no email, name, rent, or address value was printed or
written (the gitignored proof at `temp/rentvine-field-discovery/field-discovery.json` is redacted the
same way). This resolves the D16 read half and feeds Slices 6 and 9.

## Confirmed field paths (on the `/leases/export` row)

| Purpose                           | Path on export row                       | Path on flattened lease view     | Coverage (present/of)  |
| --------------------------------- | ---------------------------------------- | -------------------------------- | ---------------------- |
| Lease id (join key)               | `lease.leaseID`                          | `leaseID`                        | 25/25                  |
| Tenant name (recipient join)      | `lease.tenants[].name`                   | `tenants[].name`                 | 25/25                  |
| **Tenant email (recipient)**      | `lease.tenants[].email`                  | `tenants[].email`                | **25/25** email-shaped |
| Lease-end date                    | `lease.endDate`                          | `endDate` → `lease_end_date`     | 25/25                  |
| Current rent                      | `unit.rent`                              | `currentRent` (lifted)           | 25/25                  |
| **Property-owner email (D10)**    | `portfolio.owners[].email`               | `portfolio.owners[].email`       | **25/25** email-shaped |
| Property-owner name               | `portfolio.owners[].name`                | `portfolio.owners[].name`        | 25/25                  |
| Property-owner contact id         | `portfolio.owners[].contactID`           | `portfolio.owners[].contactID`   | 25/25                  |
| Property street (Zillow link, S3) | `property.streetName`/`.address`         | `property.streetName`/`.address` | 25/25                  |
| Property city / state / postal    | `property.city`/`.stateID`/`.postalCode` | same on `property`               | 25/25                  |

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

`npm run discover:rentvine-fields -- --live` (free; read-only; no GCP budget). Since S57 this reads
the complete paged export and prints the distinct-lease-id count plus the completeness flag; the old
`--limit` flag is gone because RentVine silently ignores `limit`. Needs a fresh ADC/RentVine session
(`npm run auth:session`) and `.env.local` RentVine creds.
