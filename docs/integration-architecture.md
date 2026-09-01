# Integration architecture

Updated: 2026-08-31.

## Effect model

Every provider capability is one exact Action Registry key. Execution requires:

1. committed key is production-allowed;
2. runtime dependency is configured;
3. actor is authenticated and authorized;
4. exact target/source versions are current;
5. preview and confirmation match;
6. provider idempotency is available or one durable app claim enforces one at-most-once attempt;
7. result is receipted and read back;
8. rollback/correction exists, except S100's explicitly confirmed RentVine manager-read marker, for
   which the official provider documents no unread restoration.

A category, credential, UI button, or runtime flag cannot imply action authority.

## Renewal role/effect projection

Renewal pages, APIs, and rendered controls consume one explicit capability/effect matrix. A managed
identity and Renewals Space access are always conjunctive with the row's role capability. Editors may
read and save ordinary app-owned progress/owner direction, request reference comps, and exact-confirm
one unsent draft. Approver reconciliation, Admin pricing/source approvals and configuration, provider
effects, and source writes remain separate rows.

An open action key does not grant page/role access, and a role cannot open a key. Exact action state,
runtime suspension, quota, provider readiness, preview/confirmation, receipts, readback, and rollback
remain downstream effect checks. In-app renewal sending is permanently unavailable for every role.

## Current open keys

- `gmail.mailbox.read`
- `gmail.thread.reply`
- `gmail.label.apply`
- `gmail.renewal_notice.draft_create`
- `gmail.maintenance_owner_notice.draft_create`
- `rentcast.rental_listings.search`
- `internal.transactional_notice.send`

All other keys are closed.

## Providers

| Provider                 | Current role                                                                                 | Write/effect state                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| RentVine                 | Complete lease reads; current work-order list reads; authoritative lease/unit/portfolio data | Current renewal/work-order writes closed; exact S97/S99/S100 operations specified |
| Google Sheets            | Operating renewal read source                                                                | Current write switch off; exact S98 append/update specified                       |
| RentCast                 | Reference rental listings/market data with cache, usage counter, cap 50                      | Exact read key open; never sets offered rent                                      |
| Gmail                    | Workflow reads, replies, labels, unsent renewal/maintenance drafts                           | Direct/generic notice sends closed                                                |
| Firestore                | App-owned state, approvals, receipts, tasks, snapshots                                       | Rules/transactions govern writes                                                  |
| Drive/Storage            | Approved sources and bounded artifacts                                                       | No broad source replacement/delete                                                |
| Dotloop                  | Typed packet/binding seam                                                                    | OAuth/mapping/provider activation pending                                         |
| LeadSimple               | Typed connector seam                                                                         | Account contract/credential pending                                               |
| Resident/Vendor channels | Tokenized app intake and staff work seams                                                    | S100 manual inbound sync/draft specified; Vendor effects closed                   |

## RentVine write boundary

S30 currently exposes only a closed proof for one lease `endDate`. S97 specifies exact renewal-date,
recurring-charge-create, and recurring-charge-update keys; S99 specifies exact work-order read/create/
status keys; S100 specifies explicit manual work-order-chat synchronization. Each contract owns its
official method/path/field matrix, typed proposal, managed actor, exact preview/confirmation, durable
claim, at-most-one provider attempt, receipt-first projection, provider readback, ambiguity state,
and separate reversal/correction. Caller-supplied methods/paths, arbitrary fields, generic/bulk work,
blind retry, and cross-provider atomicity are structurally unavailable.

RentVine supplies no proven atomic compare-and-set or provider idempotency token for these writes.
An uncertain attempt therefore never retries; observed matching state corroborates reconciliation
but does not prove causality. S100's official chat retrieval marks manager messages read, so it runs
only from an explicit user action that discloses that effect—never page load, polling, or an invented
webhook.

## Sheet boundary

`RENEWAL_SHEET_ID` is the current operating read source and its write switch is off. S98 retires the
copy-only path and adds two exact operating actions: one atomic source-backed row append and one
supported-field expected-value update. Its authorized proof appends one temporary real-data row at
the logical end, marks/isolates/reads it, separately sets its blank `current_rent` from the fresh
source through the field-update action, then separately deletes only the unchanged marked row and
proves final absence. Sheets exposes no provider operation-status/idempotency ledger, so an uncertain
request is not retried.

## Messaging boundary

Renewal and maintenance notices are drafts. A human sends them from Gmail. S100's resident reply is
created only as an exact-confirmed unsent draft in the signed-in user's connected mailbox. The narrow internal
transactional notice key may send only its allowlisted metadata-only internal notification; it does
not widen any client communication path.
