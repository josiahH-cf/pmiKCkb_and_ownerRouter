# Renewal Sheet semantic map

Updated: 2026-08-31.

This is a sanitized connector contract. The operating spreadsheet is a client source of truth and
contains sensitive operational data. Raw rows, credentials, names, addresses, and values never enter
Git.

## Renewal fields

The renewal area carries, at minimum:

- stable row identity used by the connector;
- lease/tenant label for human review;
- renewal date;
- current rent;
- market value;
- completion/renewal response state;
- owner pricing/contact progress;
- form, document, signature, insurance, pet, charge, inspection, filter, and utility follow-ups.

Headers and visual layout are not stable identifiers. Blank rows, merged cells, section dividers,
checkboxes, and free-text status values require normalization.

## Security exclusions

Credential/login/Wi-Fi sections are hard-excluded from connector reads and all evidence. The full
workbook must not be exported into the repository.

## Truth and joins

- RentVine lease id plus a stable Sheet row key is the durable reconciliation identity.
- Address/name-only joins are ambiguous and cannot verify a lease.
- Current rent may represent different semantics across sources; disagreement is not automatically a
  RentVine error.
- A resolution binds to the exact lease, row, and source versions.
- Operating Sheet writes remain off in current production. S98 owns the exact target contract:
  source-backed row append and one supported-field expected-value update.

## Approved writeback target

S98 resolves the live schema and authoritative row identity server-side. An append sets only fresh
source-backed or exact human-confirmed fields; an update changes only one supported field when the
exact anchored row/header/current value still match. `renewal_date` is never silently inferred from
RentVine `endDate`.

The one authorized proof appends a temporary real-data row at the logical end, places a visible test
marker plus an opaque cell note, excludes that exact marker from downstream projections, reads the
row back, separately updates its blank `current_rent` from the fresh source, then separately deletes
only the unchanged marked row and proves final absence. No copy-only Sheet, fake identity/value,
arbitrary range, bulk update, formula overwrite, or blind retry is used.
