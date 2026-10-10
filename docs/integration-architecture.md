# Integration architecture

Updated: 2026-10-10.

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
the exact visible ordinary operation once. Approver reconciliation, Admin configuration, current
owner authority, provider effects and source writes remain separate rows.

An open action key does not grant page/role access, and a role cannot open a key. Exact action state,
runtime suspension, quota, provider readiness, preview/confirmation, receipts, readback, and rollback
remain downstream effect checks. S183 authorizes human Send/Schedule through S189–S192 only after
their technical gates and reviewed exact-key activation, passed in run 5b3dfb90 for only those two keys.

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
- `gmail.renewal_notice.send`
- `gmail.maintenance_owner_notice.send`
- `rentcast.rental_listings.search`
- `internal.transactional_notice.send`
- `rentvine.lease.renewal_dates.update`
- `rentvine.lease.recurring_charge.create`
- `rentvine.lease.recurring_charge.update`
- `rentvine.work_order.chat.sync`

The committed Registry and read-back Admin mirror contain 48 exact keys: these 18 are open and the other 30 are closed. The mirror cannot grant execution. Notice send keys are confined to explicit human
S189–S192 sequences; generic send, S100 resident-draft, retired broad writeback identifiers,
provider Vendor assignment, RentVine attachments/chat posting and every unlisted effect stay closed.

## Providers

| Provider                 | Current role                                                                    | Write/effect state                                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RentVine                 | Complete lease reads; work-order reads; authoritative lease/unit/portfolio data | Exact S97 renewal, S99 work-order, and S100 chat-sync keys are open                                                                                                                                                                 |
| Google Sheets            | Operating renewal read source and exact append/update target                    | Both exact keys remain open; the reviewed S159 switch value true serves normal append and recognized-field updates behind exact confirmation; false pauses all operating-Sheet mutations; reads and app-owned work remain available |
| RentCast                 | Reference rental listings/market data with cache, usage counter, cap 50         | Exact read key open; never sets offered rent                                                                                                                                                                                        |
| Gmail                    | Workflow reads/replies/labels, rich linked drafts and human Send/Schedule       | Two scoped human notice sequence keys open; generic send closed                                                                                                                                                                     |
| Firestore                | App-owned state, approvals, receipts, tasks, snapshots                          | Rules/transactions govern writes                                                                                                                                                                                                    |
| Drive/Storage            | Approved sources and bounded artifacts                                          | No broad source replacement/delete                                                                                                                                                                                                  |
| Dotloop                  | Typed packet/binding seam; S106 connection and S34 packet lifecycle specified   | OAuth connected; office-agent/template eligibility and saved supported selection unverified; both write keys closed                                                                                                                 |
| LeadSimple               | Typed connector seam                                                            | Account contract/credential pending                                                                                                                                                                                                 |
| Resident/Vendor channels | Tokenized app intake and staff work seams                                       | Manual chat sync and scoped app vendor contributions available; resident draft and provider Vendor effects closed                                                                                                                   |

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
reviewed S159 switch is true in the last verified serving revision, enabling the existing normal
`google_sheets.renewal_checklist.row_append` and `google_sheets.renewal_checklist.field_update`
contracts. A false switch pauses both; open keys cannot override it. Reads and app-owned work remain
available, and recovery revisions preserve the captured predecessor's actual switch value.
The temporary proof row was deleted and read back absent, the proof mutation runner and copy-only path
are retired, and the broad compatibility key remains closed. Serving S113 derives normal append and supported field updates from fresh server-side lease/Sheet
state, claims one generation and preserves immutable history. Exact human preview/confirmation,
receipt/readback and separately confirmed current-state correction remain required. Row deletion,
historical restore and proof replay remain unavailable; no new provider-contract prerequisite applies.

## Messaging boundary

The owner's S183 instruction authorizes the named program's human Send/Schedule only through the
two reviewed notice contracts. The two notice
send keys passed their technical gates and reviewed activation in run 5b3dfb90;
generic Gmail sends remain closed. No historical
draft, migrated record, model answer or page load becomes a sending authorization.

Bind the exact managed sender, current workflow targets, frozen rich content/files and bounded
schedule. S189–S192 provide durable claims, receipts/readback, inbound-reply pauses, sender handoff
and ambiguity recovery. Runtime/key/current-authorization refusals remain real. The minute managed
worker is ENABLED with a verified normal empty checkpoint. The annual nonce-bound GET readiness
job is PAUSED after verified restoration.
S182 Dotloop
API-origin exclusions remain. S100's resident-reply
draft key remains closed until one synchronized resident message resolves to an exact verified email
and the key completes its own proof and activation. When available, it creates only an
exact-confirmed unsent draft in the signed-in managed mailbox. The narrow internal transactional
notice key may send only its allowlisted metadata-only internal notification; it does not widen any
client communication path.

## Named program operation owners

| Operation                                                                  | Exact authority and owning seam                                                                                                    | Recovery and present activation                                                                                                                                            |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary app-owned profile, policy, task, collection and maintenance edits | Existing role/record scope; one explicit Save/Apply at the owning API                                                              | Version/conflict checks, durable original-operation receipt and correction; no provider permission inferred                                                                |
| Supported RentVine work-order create/status                                | `rentvine.work_order.create` / `rentvine.work_order.update_status`; maintenance route, staff-confirmation service and S20 executor | Server-resolved exact preview, one Apply, atomic companion claim, original-attempt readback; keys already open                                                             |
| Existing renewal/Sheet corrections                                         | Exact S97/S98 keys and their existing owning services                                                                              | Preserve current source checks, one-attempt receipts and separately confirmed correction; no historical proof replay                                                       |
| Renewal/maintenance human Send/Schedule                                    | `gmail.renewal_notice.send` / `gmail.maintenance_owner_notice.send`; communication-sequence service and sequence-worker route      | Exact version/sender/targets/payload/schedule, bounded at-most-once occurrence, reply pause, reconcile; both exact keys open after run 5b3dfb90 gates; generic send closed |
| Workflow Gmail discovery/linking                                           | `gmail.mailbox.read`; existing workflow-linked Gmail service                                                                       | Read-only bounded discovery; linking cannot authorize send or widen to a general inbox                                                                                     |
| Dotloop packet effects                                                     | Existing S106/S34 exact contract and S182 exclusions                                                                               | Eligibility and saved supported selection remain unverified; both write keys closed                                                                                        |
| Vendoroo, acquisition and native answering                                 | S207/S216/S219 investigations and the same five pending specifications                                                             | Required outcomes await complete real contracts; no guessed endpoint, schema, financial opening state, phone or consent                                                    |

This table records only the reviewed two-key activation; it grants no additional key, identity, role, budget or provider interface. Current serving
identity/readback is recorded in `docs/facts.md`; implementation evidence and remaining delivery
prerequisites are recorded in the native program ledger.
