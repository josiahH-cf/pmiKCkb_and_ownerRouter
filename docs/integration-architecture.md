# Integration architecture

Updated: 2026-09-02.

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

A category, credential, UI button, runtime flag, or open Registry key cannot imply that a provider
exposes the operation-level safety primitive needed to execute an effect.

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

- `rentvine.work_order.create`
- `rentvine.work_order.read`
- `rentvine.work_order.update_status`
- `google_sheets.renewal_checklist.row_append`
- `google_sheets.renewal_checklist.field_update`
- `gmail.mailbox.read`
- `gmail.thread.reply`
- `gmail.label.apply`
- `gmail.renewal_notice.draft_create`
- `gmail.maintenance_owner_notice.draft_create`
- `rentcast.rental_listings.search`
- `internal.transactional_notice.send`
- `rentvine.lease.renewal_dates.update`
- `rentvine.lease.recurring_charge.create`
- `rentvine.lease.recurring_charge.update`
- `rentvine.work_order.chat.sync`

The committed Registry contains 48 exact keys: these 16 are open and the other 32 are closed. The
Firestore Admin mirror matches 48/16 but is display-only and cannot grant execution. Direct Gmail
sends, the S100 resident-draft key, the retired broad RentVine/Sheet identifiers, Vendor assignment,
attachments, RentVine chat posting, and every other unlisted effect remain closed.

## Providers

| Provider                 | Current role                                                                    | Write/effect state                                                               |
| ------------------------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| RentVine                 | Complete lease reads; work-order reads; authoritative lease/unit/portfolio data | Exact S97 renewal, S99 work-order, and S100 chat-sync keys are open              |
| Google Sheets            | Operating renewal read source and exact S98 append target                       | Both keys/switch on; active unreleased correction makes product path append-only |
| RentCast                 | Reference rental listings/market data with cache, usage counter, cap 50         | Exact read key open; never sets offered rent                                     |
| Gmail                    | Workflow reads, replies, labels, unsent renewal/maintenance drafts              | Direct/generic notice sends closed                                               |
| Firestore                | App-owned state, approvals, receipts, tasks, snapshots                          | Rules/transactions govern writes                                                 |
| Drive/Storage            | Approved sources and bounded artifacts                                          | No broad source replacement/delete                                               |
| Dotloop                  | Typed packet/binding seam; S106 connection and S34 packet lifecycle specified   | OAuth app registration, connected account, and per-key activation pending        |
| LeadSimple               | Typed connector seam                                                            | Account contract/credential pending                                              |
| Resident/Vendor channels | Tokenized app intake and staff work seams                                       | Manual chat sync open; resident draft and Vendor effects closed                  |

## RentVine write boundary

S97's exact renewal-date, recurring-charge-create, and recurring-charge-update keys and S99's exact
work-order read/create/status keys completed their bounded proof and activation lifecycles. S100's
manual work-order-chat synchronization also completed its disclosed mark-read proof and is open.
Each remains confined to its official method/path/field matrix, typed proposal, managed actor, exact
preview/confirmation where applicable, durable claim, at-most-one provider attempt, receipt-first
projection, provider readback, ambiguity state, and separate reversal/correction. The former S30
broad proof identifier is retired-closed. Caller-supplied methods/paths, arbitrary fields,
generic/bulk work, blind retry, and cross-provider atomicity are structurally unavailable.

RentVine supplies no proven atomic compare-and-set or provider idempotency token for these writes.
An uncertain attempt therefore never retries; observed matching state corroborates reconciliation
but does not prove causality. In particular, an ambiguous recurring-charge create remains unproven
even when one new matching charge appears; it cannot mint a receipt or deletion authority. S100's
official chat retrieval marks manager messages read, so it runs
only from an explicit user action that discloses that effect—never page load, polling, or an invented
webhook.

## Sheet boundary

`RENEWAL_SHEET_ID` is the current operating read source and exact S98 write target. The runtime
switch is on only for `google_sheets.renewal_checklist.row_append` and
`google_sheets.renewal_checklist.field_update`; both passed historical bounded proofs and remain open.
The temporary proof row was deleted and read back absent, the proof mutation runner and copy-only path
are retired, and the broad compatibility key remains closed. The active unreleased hardened product
route derives one append from fresh server-side lease/Sheet state, transactionally claims one lease
generation, and never retries an uncertain request. Normal field update and every fixed-row
delete/restore refuse before writer construction because the live Google client has no atomic
stable-logical-row, expected-generation, idempotency/status, and tombstone mutation seam. Historical
receipts remain readable; they do not make that missing capability current. The serving revision
continues to expose its historical two-operation baseline until this correction is promoted and read
back.

## Messaging boundary

Renewal and maintenance notices are drafts. A human sends them from Gmail. S100's resident-reply
draft key remains closed until one synchronized resident message resolves to an exact verified email
and the key completes its own proof and activation. When available, it creates only an
exact-confirmed unsent draft in the signed-in managed mailbox. The narrow internal transactional
notice key may send only its allowlisted metadata-only internal notification; it does not widen any
client communication path.
