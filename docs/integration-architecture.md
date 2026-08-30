# Integration architecture

Updated: 2026-08-29.

## Effect model

Every provider capability is one exact Action Registry key. Execution requires:

1. committed key is production-allowed;
2. runtime dependency is configured;
3. actor is authenticated and authorized;
4. exact target/source versions are current;
5. preview and confirmation match;
6. idempotency is available;
7. result is receipted and read back;
8. rollback/correction exists.

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

| Provider                 | Current role                                                                    | Write/effect state                                         |
| ------------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| RentVine                 | Complete lease reads; work-order reads; authoritative lease/unit/portfolio data | Renewal dry-preview only; write key closed                 |
| Google Sheets            | Operating renewal read source                                                   | Operating write off; distinct rehearsal-copy proof pending |
| RentCast                 | Reference rental listings/market data with cache, usage counter, cap 50         | Exact read key open; never sets offered rent               |
| Gmail                    | Workflow reads, replies, labels, unsent renewal/maintenance drafts              | Direct/generic notice sends closed                         |
| Firestore                | App-owned state, approvals, receipts, tasks, snapshots                          | Rules/transactions govern writes                           |
| Drive/Storage            | Approved sources and bounded artifacts                                          | No broad source replacement/delete                         |
| Dotloop                  | Typed packet/binding seam                                                       | OAuth/mapping/provider activation pending                  |
| LeadSimple               | Typed connector seam                                                            | Account contract/credential pending                        |
| Resident/Vendor channels | App-plane intake/work seams                                                     | Exact provider/identity activation pending                 |

## RentVine write boundary

The reusable write client exposes only documented lease-update and existing-recurring-charge POSTs;
it has no generic request, delete, new-charge, status-change, or production factory. S30 deliberately
narrows its executable proof one step further: one exact lease `endDate` through the lease-update
POST. Recurring-charge proof is unreachable until its exact provider readback seam is verified. The
proof requires secure untracked inputs, exact managed-actor/action/runtime readback, fresh state before
writer construction, one durable attempt, exact readback, separately confirmed rollback, and
closed-state closeout. RentVine supplies no proven atomic compare-and-set or idempotency token, so an
ambiguous attempt is never retried and matching readback is not presented as proof of causality.

## Sheet boundary

`RENEWAL_SHEET_ID` is the operating read source.
`RENEWAL_REHEARSAL_SHEET_ID` is an optional distinct copy. Equality refuses. The copy proof is
blank-cell compare-and-set, readback, exact clear, and final blank verification.

## Messaging boundary

Renewal and maintenance notices are drafts. A human sends them from Gmail. The narrow internal
transactional notice key may send only its allowlisted metadata-only internal notification; it does
not widen any client communication path.
