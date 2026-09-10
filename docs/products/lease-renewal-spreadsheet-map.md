# Renewal Sheet semantic map

Updated: 2026-09-02.

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
- Both S98 exact keys and the operating write switch remain on. The candidate currently permits
  normal append and refuses field updates. S113 F2 requires pre-approved in-app existing-row updates
  to recognized renewal business fields with fresh server resolution, exact confirmation, one-attempt
  claims and readback; no new provider-contract approval is needed. The broad key stays closed.

## Approved writeback target

S98 resolves the live schema and authoritative lease/row association server-side. An append sets only
fresh source-backed or exact human-confirmed fields and requires a fresh one-to-one proof that no row
already represents the lease. `renewal_date` is never silently inferred from RentVine `endDate`.
S113 replaces normal-field refusal with narrow exact-value updates and new confirmed field corrections;
identity/formula/formatting/unknown columns stay protected. Fresh reads and readback must surface
observed collaborator drift without claiming logical-row transaction isolation. Row deletion and
historical restore paths remain unavailable. This desired path is not yet implemented.

The one authorized proof appended a temporary real-data row at the logical end, placed a visible test
marker plus an opaque cell note, excluded that exact marker from downstream projections, read the
row back, separately updated its blank `current_rent` from the fresh source, then separately deleted
only the unchanged marked row and proved final absence. That proof is complete and must not be rerun
or replaced. The proof receipts remain historical evidence, not a reusable mutation path. Normal
append still requires exact preview, confirmation, lease-scoped one-attempt claim, header/source
readback, and the active exact key. It is manually correctable from its receipt and Sheet destination;
the app does not automate a fixed-row delete. No copy-only Sheet, fake identity/value, arbitrary
range, bulk update, formula overwrite, or blind retry is authorized.
