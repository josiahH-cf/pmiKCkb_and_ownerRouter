# Renewal Sheet semantic map

Updated: 2026-08-26.

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
- Operating Sheet writes remain off.

## Rehearsal

A verbatim copy may be configured separately. It must have a different id. The only approved proof is
one blank cell: compare-and-set synthetic marker, readback, exact clear, final blank readback.
