# Integration architecture

Updated: 2026-10-20.

## Current application admission

October 20 supersedes the earlier maintenance/history and unsent-only application boundary.
The deployed operation policy fully retires maintenance/vendor/history entry points and effects,
including work-order reads, before provider construction; stored records/receipts are retained.
Vendoroo stays standalone. Renewal Focus/Full, source updates, linked Gmail reads and reviewed
unsent drafts remain available. Exact staff-confirmed renewal Send/Schedule/Resume and linked
replies use the current renewal-confirmed-delivery/2026-10-20 authorization version. The worker
skips old authorizations and all maintenance lanes before actor/mailbox/source reads.
No generic, bulk, model-triggered or unapproved background send is admitted. Both Dotloop write
keys stay closed; source visibility never grants legal approval or provider effects.

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
remain downstream effect checks. Historically, S183 authorized human Send/Schedule through S189-S192 only after
their technical gates and reviewed exact-key activation, passed in run 5b3dfb90 for only those two keys.

## Current source key metadata and last recorded Admin mirror

This inventory describes activation metadata, not current execution eligibility. The current
application-admission policy above overrides retired maintenance keys and legacy delivery authorizations.

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

The committed Registry and last recorded Admin mirror contain 48 exact keys: these 18 are open and the other 30 are closed. The mirror cannot grant execution. The historical notice send keys were confined to explicit human
S189–S192 sequences; generic send, S100 resident-draft, retired broad writeback identifiers,
provider Vendor assignment, RentVine attachments/chat posting and every unlisted effect stay closed.

## Providers

| Provider                 | Current role                                                                              | Write/effect state                                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RentVine                 | Complete lease reads; authoritative lease/unit/portfolio data; maintenance reads retired  | Exact renewal contracts remain; all work-order operations are retired at operation admission regardless of open metadata                                                                                                            |
| Google Sheets            | Operating renewal read source and exact append/update target                              | Both exact keys remain open; the reviewed S159 switch value true serves normal append and recognized-field updates behind exact confirmation; false pauses all operating-Sheet mutations; reads and app-owned work remain available |
| RentCast                 | Reference rental listings/market data with cache, usage counter, cap 50                   | Exact read key open; never sets offered rent                                                                                                                                                                                        |
| Gmail                    | Workflow-linked reads/labels, reviewed unsent drafts and exact confirmed renewal delivery | Fresh staff-confirmed renewal Send/Schedule/Resume and linked replies; old authorizations and maintenance refused; protected activation metadata unchanged                                                                          |
| Firestore                | App-owned state, approvals, receipts, tasks, snapshots                                    | Rules/transactions govern writes                                                                                                                                                                                                    |
| Drive/Storage            | Approved sources and bounded artifacts                                                    | No broad source replacement/delete                                                                                                                                                                                                  |
| Dotloop                  | Read-only profile/template diagnostics; existing typed packet/binding seam                | Fresh integrations identity verified; supported templates empty, company access denied and selection absent; both write keys closed                                                                                                 |
| LeadSimple               | Typed connector seam                                                                      | Account contract/credential pending                                                                                                                                                                                                 |
| Resident/Vendor channels | Retained records/receipts only; component and history UI/API retired                      | Operational intake, vendor work and maintenance chat retired; no new provider effect or activation                                                                                                                                  |

## RentVine write boundary

The maintenance proof/activation details in this section are historical. Current admission refuses
those maintenance effects; they cannot restart from an old key or receipt. Renewal contracts remain.

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

Current deployed source preserves reviewed unsent drafting and reopens only exact staff-confirmed
renewal delivery under October 20 owner direction. Every new authorization binds current actor,
sender, recipients, rich content/files, source versions and bounded schedule to
renewal-confirmed-delivery/2026-10-20. Legacy authorizations and all maintenance lanes are skipped
before mailbox/source/provider reads. No migrated record, model answer or page load authorizes send.
The existing durable claims, at-most-once occurrences, receipts/readback, reply pauses, sender handoff
and ambiguity recovery remain. Generic Gmail message.send stays closed. Managed GET readiness
constructs no sequence service or claim; its annual probe was restored PAUSED. The existing minute
POST worker retains its reviewed configuration. No customer effect was used as release proof.
S182 Dotloop API-origin exclusions remain. The retired maintenance resident-draft key stays closed;
no historical proof is restarted. Internal transactional notice remains metadata-only and allowlisted.

Historical activation provenance: the owner's S183 instruction authorizes the named program's human Send/Schedule
under its exact reviewed contract. The two notice
send keys passed their technical gates and reviewed activation in run5b3dfb90;
generic Gmail sends remain closed. No historical
draft, migrated record, model answer or page load becomes a sending authorization.
Current October 20 admission above limits execution to new confirmed renewal authorizations;
retained maintenance-key metadata grants no execution.

## Named program operation owners

| Operation                                                     | Exact authority and owning seam                                                                                                    | Recovery and present activation                                                                                                                            |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ordinary app-owned profile, policy, task and collection edits | Existing role/record scope; one explicit Save/Apply at the owning API                                                              | Version/conflict checks, durable original-operation receipt and correction; no provider permission inferred                                                |
| Supported RentVine work-order create/status                   | `rentvine.work_order.create` / `rentvine.work_order.update_status`; maintenance route, staff-confirmation service and S20 executor | Retired at operation admission; historical open key metadata and receipts grant no execution                                                               |
| Existing renewal/Sheet corrections                            | Exact S97/S98 keys and their existing owning services                                                                              | Preserve current source checks, one-attempt receipts and separately confirmed correction; no historical proof replay                                       |
| Renewal human Send/Schedule/Resume                            | `gmail.renewal_notice.send`; existing sequence service/worker and current authorization policy                                     | Exact current version/sender/targets/payload/schedule, one-attempt occurrence, reply pause and reconciliation; legacy/maintenance/generic dispatch refused |
| Workflow Gmail discovery/linking                              | `gmail.mailbox.read`; existing workflow-linked Gmail service                                                                       | Read-only bounded discovery; linking cannot authorize send or widen to a general inbox                                                                     |
| Dotloop packet effects                                        | Existing S106/S34 exact contract and S182 exclusions                                                                               | Eligibility and saved supported selection remain unverified; both write keys closed                                                                        |
| Acquisition and native answering                              | S216/S219 investigations and separately grounded pending specifications                                                            | Required outcomes await complete real contracts; no guessed endpoint, schema, financial opening state, phone or consent                                    |

This table records operation admission over preserved activation metadata; it grants no additional key, identity, role, budget or provider interface. Current serving
identity/readback is recorded in `docs/facts.md`; implementation evidence and remaining delivery
prerequisites are recorded in the native program ledger.
