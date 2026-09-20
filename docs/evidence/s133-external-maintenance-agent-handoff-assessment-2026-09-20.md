# S133 External maintenance-agent handoff assessment, 2026-09-20

Classification: bounded discovery and decision packet. Tabletop analysis on repository evidence and
the meeting transcript only; no vendor was contacted, no account connected, no credential requested,
no endpoint probed and no live integration test run. Companion contract:
`lib/maintenance/external-agent-handoff-assessment.ts`; packet checks:
`tests/unit/s133-decision-packet.test.ts`.

## Decision

Feasibility of a handoff between PMI KC and the external maintenance agent is not established.
The agent is known here only by its transcript label, Rue. The vendor's name appears in the
transcript notes in two different phonetic spellings and is not used in this packet; no domain,
product page or interface was inferred from it. Every handoff option below stays conditional on the
owner inputs listed under Requested inputs. The application-side inventory is complete and
supported by code; the vendor side is not established. Research more is not an output: the packet
closes when the requested inputs arrive or the owner rules the handoff out.

The one owner decision required before any later integration specification: confirm the vendor,
product and account identity and supply the primary interface documentation and a read-only access
scope; then choose whether the handoff is manual and link-only, read-only, or an exact separately
governed write or event interface.

## Evidence

Source kinds: Owner material, Vendor primary documentation, Authorized read-only read, Repository
code, Transcript, None. A Transcript row can never support a conclusion. A Not established row names
the exact input and who supplies it.

| Id               | Claim                                                                                                                      | Source kind     | Source                                                                           | Conclusion      | Requested input                                                                                      | From                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------- |
| E-ID-VENDOR      | The vendor's legal and product identity behind the transcript label                                                        | Transcript      | T13, meeting transcript 00:29:37 to 00:31:37, private and untracked              | Not established | Vendor legal name, product name and contract reference from the signed agreement                     | owner                        |
| E-ID-ACCOUNT     | PMI's account with the vendor and who administers it                                                                       | None            | none                                                                             | Not established | Account identifier and the administrator who can grant read-only access                              | owner                        |
| E-ID-ACCESS      | A permitted read-only access scope for an analyst                                                                          | None            | none                                                                             | Not established | Written read-only grant naming the scope and the harmless surfaces an analyst may inspect            | vendor account administrator |
| E-AGENT-ROLE     | The agent takes phone calls, troubleshoots, manages tickets and recommends plumbing steps                                  | Transcript      | T13, meeting transcript 00:29:37 to 00:31:37, private and untracked              | Inconclusive    | -                                                                                                    | -                            |
| E-AGENT-STATUS   | Vendor implementation is just starting and PMI KC may be given access later                                                | Transcript      | T13, meeting transcript 00:29:37 to 00:31:37, private and untracked              | Inconclusive    | -                                                                                                    | -                            |
| E-VENDOR-API     | The vendor exposes an API for tickets                                                                                      | None            | none                                                                             | Not established | Primary interface documentation with version, authentication, endpoints, effects and retry semantics | vendor account administrator |
| E-VENDOR-WEBHOOK | The vendor emits documented events                                                                                         | None            | none                                                                             | Not established | Webhook or event documentation with delivery, ordering and duplicate semantics                       | vendor account administrator |
| E-VENDOR-EXPORT  | The vendor supports an export or import of tickets                                                                         | None            | none                                                                             | Not established | Export format documentation and one redacted sample export                                           | vendor account administrator |
| E-VENDOR-LINK    | A verified deep link opens one vendor ticket                                                                               | None            | none                                                                             | Not established | One authorized ticket link pattern observed on a harmless read-only surface                          | vendor account administrator |
| E-VENDOR-TERMS   | Commercial, data-permission and retention terms permit a handoff                                                           | None            | none                                                                             | Not established | The data-processing and interface terms from the contract                                            | owner                        |
| E-PMI-INTAKE     | PMI KC receives structured maintenance intake and triages it with a pure projection                                        | Repository code | lib/maintenance/intake-triage.ts; lib/maintenance/intake-model.ts                | Supported       | -                                                                                                    | -                            |
| E-PMI-WORKORDER  | PMI KC creates, reads and status-updates RentVine work orders only through exact open keys                                 | Repository code | lib/integrations/rentvine/work-order-client.ts; docs/integration-architecture.md | Supported       | -                                                                                                    | -                            |
| E-PMI-LINK       | PMI KC links a ticket to an existing work order only on verified account, property and unit ids with a confirmed preview   | Repository code | lib/maintenance/existing-work-order-link.ts                                      | Supported       | -                                                                                                    | -                            |
| E-PMI-UNIT       | PMI KC never auto-merges a unit match; a structured id earns Verified and a tie reads Needs Review                         | Repository code | lib/maintenance/unit-matcher.ts                                                  | Supported       | -                                                                                                    | -                            |
| E-PMI-CHAT       | The work-order chat sync is a consequential read that marks retrieved messages read for managers                           | Repository code | lib/integrations/rentvine/chat-contract.ts                                       | Supported       | -                                                                                                    | -                            |
| E-PMI-AUTHORITY  | A communication proposal cannot choose a vendor, approve cost or transition a ticket                                       | Repository code | lib/maintenance/execution/providers.ts                                           | Supported       | -                                                                                                    | -                            |
| E-PMI-CLOSED     | Vendor assignment, resident reply drafts, owner notice sends and photo storage stay closed keys                            | Repository code | lib/integrations/action-registry-seed.ts; docs/integration-architecture.md       | Supported       | -                                                                                                    | -                            |
| E-PMI-SPEND      | Spend is authorized only within an Admin-confirmed, effective property preapproval                                         | Repository code | lib/maintenance/property-preapproval.ts                                          | Supported       | -                                                                                                    | -                            |
| E-PMI-STATUS     | Ticket status of record and the waiting-on projection are app-owned, and a provider status conflict is named, not resolved | Repository code | lib/maintenance/waiting-on.ts; lib/maintenance/ticket-model.ts                   | Supported       | -                                                                                                    | -                            |

## Capability matrix

Demonstrated means a supporting source showed the capability. A claim in the transcript is not
demonstrated. Unknowns are listed instead of guessed.

| System         | Interface kind     | Capability                                             | Direction | Demonstrated | Evidence         | Effect                                                                | Unknowns                                                                                             |
| -------------- | ------------------ | ------------------------------------------------------ | --------- | ------------ | ---------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| PMI KC         | API                | Create a RentVine work order                           | write     | yes          | E-PMI-WORKORDER  | One provider work order per exact confirmed key                       | -                                                                                                    |
| PMI KC         | API                | Read RentVine work orders and statuses                 | read      | yes          | E-PMI-WORKORDER  | None                                                                  | -                                                                                                    |
| PMI KC         | API                | Update a RentVine work-order status                    | write     | yes          | E-PMI-WORKORDER  | One provider status change per exact confirmed key                    | -                                                                                                    |
| PMI KC         | API                | Sync work-order chat                                   | read      | yes          | E-PMI-CHAT       | Marks retrieved messages read for managers (consequential read)       | -                                                                                                    |
| PMI KC         | Human handoff      | Link a ticket to an existing work order                | link      | yes          | E-PMI-LINK       | App-owned link after a previewed, confirmed hash; no provider receipt | -                                                                                                    |
| PMI KC         | Human handoff      | Structured intake and triage                           | manual    | yes          | E-PMI-INTAKE     | App-owned ticket; no provider effect                                  | -                                                                                                    |
| PMI KC         | API                | Assign a vendor, post chat, send notices, store photos | write     | no           | E-PMI-CLOSED     | Closed keys; unavailable                                              | Whether any will be opened is a separate governance decision, not part of this handoff               |
| External agent | API                | Read or write tickets                                  | write     | no           | E-VENDOR-API     | Unknown                                                               | Existence, version, authentication, identity linkage, effect semantics, retry and duplicate behavior |
| External agent | Documented webhook | Emit ticket or escalation events                       | event     | no           | E-VENDOR-WEBHOOK | Unknown                                                               | Existence, delivery guarantees, ordering, duplicates, freshness, signing                             |
| External agent | Export or import   | Export tickets or accept an import                     | read      | no           | E-VENDOR-EXPORT  | Unknown                                                               | Format, fields, identity fields, cadence, whether an export marks anything                           |
| External agent | Verified deep link | Open one ticket in the vendor console                  | link      | no           | E-VENDOR-LINK    | Unknown                                                               | Link pattern, authentication, stability of the ticket identifier                                     |
| External agent | Human handoff      | Staff read the vendor console and act in PMI KC        | manual    | no           | E-ID-ACCESS      | None on PMI KC; unknown on the vendor side                            | Whether reading a ticket in the console marks it, and who is allowed to read                         |

## Ownership map

Current PMI KC and RentVine behavior is code evidence. The external agent column is the transcript
claim and stays a claim. A boundary claimed by both is a duplicate-ticket or duplicate-communication
risk until the owner names one owner. No external autonomy becomes PMI KC authority: sending,
approving cost, assigning a vendor, creating a work order and closing or reopening stay behind their
exact keys or remain closed.

| Boundary                             | PMI KC or RentVine today                                                               | Evidence                                                                      | External agent claim                        | Claim evidence  | Decision item                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- | --------------- | ------------------------------------------------------------------------------------ |
| Receive the request or call          | Structured intake form (token-bounded) and staff capture; phone intake is staff        | lib/maintenance/intake-model.ts                                               | Takes all maintenance phone calls           | Inconclusive    | Who receives a call first, and how a phone ticket reaches PMI KC                     |
| Gather facts                         | Intake fields, verified unit evidence, live unit source                                | lib/maintenance/verified-ticket-property.ts                                   | Gathers facts on the call                   | Inconclusive    | Which facts the agent records and in what identity terms                             |
| Troubleshoot                         | Approved matching troubleshooting resources; proposals carry no authority              | lib/maintenance/troubleshooting-catalog.ts                                    | Troubleshoots and recommends plumbing steps | Inconclusive    | Whether agent troubleshooting replaces or precedes the approved resources            |
| Create the work order                | Editor-confirmed RentVine work-order create behind its exact open key                  | lib/integrations/rentvine/work-order-client.ts                                | Manages tickets                             | Inconclusive    | Whether the agent creates tickets anywhere; if so, where the record of truth is      |
| Decide escalation                    | Pure triage urgency plus staff decision; waiting-on projection                         | lib/maintenance/intake-triage.ts; lib/maintenance/waiting-on.ts               | Handles escalations                         | Inconclusive    | Escalation criteria and who is told                                                  |
| Authorize spend or vendor assignment | Admin property preapproval; vendor assignment closed                                   | lib/maintenance/property-preapproval.ts; lib/maintenance/vendor-assignment.ts | Not claimed                                 | Not established | None: stays with PMI                                                                 |
| Contact the resident                 | Staff; resident reply drafts closed; resident channel invite behind exact confirmation | lib/maintenance/rentvine-resident-channel.ts                                  | Speaks with residents on calls              | Inconclusive    | Which party owns resident follow-up and how duplicates are prevented                 |
| Resolve or reopen                    | Audited status transitions and the separate reopen operation                           | lib/maintenance/ticket-model.ts                                               | Manages tickets                             | Inconclusive    | Single owner of resolution; otherwise a failure between two owners has no reconciler |
| Own the status of record             | App-owned ticket status; RentVine work-order status read; conflict named               | lib/maintenance/waiting-on.ts                                                 | Manages tickets                             | Inconclusive    | Which system is the status of record for a handed-off ticket                         |

Keys the map depends on, as the committed registry reads today:

| Key                                           | Registry state | Meaning for a handoff                                      |
| --------------------------------------------- | -------------- | ---------------------------------------------------------- |
| rentvine.work_order.create                    | open           | Only an exact confirmed Editor action creates a work order |
| rentvine.work_order.read                      | open           | Read-only inventory of provider work orders                |
| rentvine.work_order.update_status             | open           | Only an exact confirmed action changes provider status     |
| rentvine.work_order.chat.sync                 | open           | Consequential read; marks messages read for managers       |
| rentvine.work_order.assign_vendor             | closed         | No vendor assignment by the app, and none delegated        |
| gmail.maintenance_resident_reply.draft_create | closed         | No resident reply draft from the app                       |
| gmail.maintenance_owner_notice.send           | closed         | No owner notice send; drafts only                          |
| google_drive.maintenance_photo.store          | closed         | No attachment storage                                      |

## Minimal data contract candidate

Conditional and documentary; no production data model changes. A handoff record, in either
direction, carries at most: property id, unit id, lease id, work-order id, issue summary, urgency,
reported time, contact role, a contact channel reference (never the address itself) and provenance.
Everything else is dropped before it leaves; anything named like a token, secret, credential, raw
message body, transcript or recording is refused by name. Retention and access follow the existing
Maintenance record retention; the vendor's retention is Not established (E-VENDOR-TERMS).

Identity join: a record joins only on stable verified RentVine property and unit ids, or through the
existing link preview that a person confirms. Two similar units or duplicate resident names read
ambiguous and wait for that person; a name or address match alone never joins. The vendor's ticket
identifier is unknown until E-VENDOR-API or E-VENDOR-EXPORT exists. Stateful reads are labeled:
PMI KC's chat sync marks messages read; whether reading in the vendor console marks anything is
unknown (E-ID-ACCESS).

## Failure and double-action scenarios

Tabletop only. PMI KC behavior is code evidence; the external side is an unresolved limit until the
matching evidence row is supported. An ambiguous create is reconciled from the other side's state,
never retried blind.

| Scenario                 | PMI KC today                                                                        | External side                                    | Receipt proof                                                   | Reconciler        |
| ------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------- | ----------------- |
| Ordinary ticket          | Intake, triage, verified unit, Editor-confirmed work order, app-owned status        | Unresolved: E-AGENT-ROLE, E-VENDOR-API           | Provider work-order id read back after the confirmed create     | Maintenance owner |
| Escalation               | Urgency from triage; staff decision; waiting-on projection                          | Unresolved: escalation criteria and notification | App activity record naming the decision and actor               | Maintenance owner |
| Duplicate delivery       | Idempotent exact keys; link refuses a conflicting existing link                     | Unresolved: E-VENDOR-WEBHOOK duplicate semantics | One work-order id per ticket; a second delivery reads the first | Maintenance owner |
| Two similar units        | Unit matcher never auto-merges; a tie reads Needs Review; link needs exact ids      | Unresolved: vendor identity fields               | Verified unit id on the ticket before any provider effect       | Editor            |
| Missing resident contact | Ticket records a missing contact; no send happens                                   | Unresolved: what the agent does with no contact  | None until a contact is verified                                | Maintenance owner |
| Vendor outage            | PMI KC keeps working; no dependency exists today                                    | Unresolved: outage behavior and backlog delivery | Not applicable until an interface exists                        | Maintenance owner |
| Revoked access           | Not applicable today; a later connector would read an honest unavailable state      | Unresolved: revocation notice                    | Not applicable until an interface exists                        | Admin             |
| Uncertain handoff        | An attempt with unknown dispatch is reconciled from provider state before any retry | Unresolved: whether the vendor exposes its state | The other system's record read back, not a resend               | Admin             |

## Handoff options

Every option is conditional on the requested inputs. None creates a connector, scheduler, webhook,
replacement troubleshooting agent, new identity, new role or new action key. A manual option remains
available at every stage.

| Option                     | Status      | Conditional on                                                                         | What it would be                                                                                                                                       | Manual fallback                 |
| -------------------------- | ----------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| A. Manual, link-only       | Conditional | E-ID-VENDOR, E-ID-ACCOUNT, E-ID-ACCESS, E-VENDOR-LINK                                  | Staff read the vendor console and act in PMI KC through existing intake and work-order controls; a verified ticket link is stored as a plain reference | Today's process; no link stored |
| B. Read-only import        | Conditional | E-ID-VENDOR, E-ID-ACCOUNT, E-ID-ACCESS, E-VENDOR-EXPORT, E-VENDOR-TERMS                | A documented export is read into a review surface; a person associates each row through the existing link preview                                      | Option A                        |
| C. Governed write or event | Conditional | E-ID-VENDOR, E-ID-ACCOUNT, E-ID-ACCESS, E-VENDOR-API, E-VENDOR-WEBHOOK, E-VENDOR-TERMS | An exact, separately specified and governed interface with its own keys, receipts, readback and reconciliation                                         | Option A                        |

## Requested inputs

- Owner: vendor legal name, product name and contract reference; account identifier and administrator;
  the data-processing and interface terms.
- Vendor account administrator: a written read-only access grant and scope; primary interface
  documentation; webhook or event documentation; export format documentation and one redacted sample;
  one authorized ticket link pattern.

When an input arrives, only the interrupted evidence row is resumed. No guessed endpoint is tried in
the meantime and no other vendor is substituted.

## Preservation

Existing Maintenance intake, work-order, approval, resident-communication and vendor-lifecycle
behavior is unchanged by this assessment; the checks named in the companion contract's preservation
list run unchanged. No repository or provider diff from this packet changes an integration, key,
identity, role or runtime setting.

Human verdict: NOT RUN, no human observer. Model and engineering verdict: the packet's tables are
checked against the companion contract; that is documentation consistency, not provider feasibility.
