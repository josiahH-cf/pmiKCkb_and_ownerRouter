<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: maintenance-provider-sync-v1 -->

# S100 — RentVine work-order chat sync and resident reply draft

> Status: Specified, not implemented; neither exact action key exists in the committed registry, and
> both provider effects must remain fail-closed until their implementation, proof, and protected
> per-key activation gates pass.

**Goal.**

Let an authorized maintenance user deliberately import one bounded page of chat messages for one
exact RentVine work order, review any unresolved mappings, and create one exact unsent Gmail reply
draft to a verified resident without automatically changing any work order or sending any message.

**Current state / intended end state.**

Current production has tokenized app maintenance intake, app tickets, RentVine lease/unit reads, one
concrete list-only work-order client plus synthetic/governed work-order abstractions, workflow-linked
Gmail capabilities, and an unsent maintenance **owner** notice draft. It has no RentVine work-order-
chat list adapter, no imported-chat store or review lane, no resident-reply draft workflow, and no
Action Registry entries named
`rentvine.work_order.chat.sync` or `gmail.maintenance_resident_reply.draft_create`. The existing
invitation-shaped `rentvine-resident-channel` module is inert and does not implement this feature.

The intended state adds two independent exact actions:

1. `rentvine.work_order.chat.sync` performs only a manually confirmed
   `GET /chat/messages` for one server-bound Work Order chat. The official endpoint returns messages
   newest first and marks retrieved messages read for the manager role, so this is a consequential
   stateful read rather than passive page data.
2. `gmail.maintenance_resident_reply.draft_create` creates only one human-reviewed **unsent** Gmail
   draft in the signed-in user's connected mailbox, addressed to one server-verified resident email.

Neither action calls RentVine's chat-message POST, creates or updates a work order, changes work-order
status, creates another draft automatically, or sends a message.

**Actors and entry conditions.**

- The actor is a managed Editor, Approver, or Admin with `edit` capability and Maintenance Space
  access to the exact Live app ticket. A Vendor, token-only public reporter, read-only user, or actor
  outside that Space cannot see message bodies, trigger sync, rerun restricted source resolution, or
  create a draft.
- Sync requires one current, server-owned app-ticket-to-RentVine-work-order binding, the configured
  `pmikcmetro` RentVine account and managed credentials, Production+Live, a healthy unsuspended
  provider boundary, and executable exact key `rentvine.work_order.chat.sync`. The browser may name
  the app ticket and requested manual page only; it cannot supply the account, provider URL,
  `chatObjectTypeID`, work-order id, mapping, or credentials.
- Resident-reply drafting requires one already-synchronized message linked to that exact ticket and
  work order, a verified resident-origin sender mapping, one current server-resolved resident email,
  a nonempty reviewed subject and body, the signed-in user's connected Gmail mailbox, Production+Live,
  and executable exact key `gmail.maintenance_resident_reply.draft_create`.
- A free-form public-intake contact, message display name, unverified email, manager/vendor/owner
  sender, ambiguous contact match, or mismatched work order cannot become the resident recipient.

**What it is / how it functions.**

### Exact manual chat sync

The maintenance ticket shows `Sync resident messages` only when the actor and exact work-order
binding are eligible. Activating it opens a cancel-first confirmation that identifies the app ticket
and RentVine work order and says: `RentVine will mark retrieved messages as read for managers.` The
provider call occurs only after the same actor confirms the unchanged preview. Page load, navigation,
focus, filtering, reconnect, login, mapping review, draft preview, background jobs, polling, webhooks,
and model output never trigger it.

V1 fixes each confirmed call to one provider page with `pageSize=20`. The first action requests
`page=1`. The bare-array response is accepted only with integer pagination headers whose
`pagination-current-page` equals the confirmed page, `pagination-page-size` is 1 through 20,
`pagination-total-items` is nonnegative, and `pagination-total-pages` is at least the current page.
Blank/absent `pagination-next-page` means no older-page control; otherwise it must equal current page
plus one and not exceed total pages. Contradictory/malformed headers make the post-dispatch result
ambiguous. A valid next page exposes `Sync older messages`, which requires a new manual preview and
confirmation for that exact page. There is no automatic pagination or timer. The server calls only:

```text
GET https://{server-configured-account}.rentvine.com/api/manager/chat/messages
  ?chatObjectTypeID=1
  &objectID={server-bound-work-order-id}
  &page={confirmed-positive-page}
  &pageSize=20
```

`chatObjectTypeID=1` is fixed to Work Order. The adapter cannot list all chat, request Lease,
Portfolio, Vendor, or Applicant chat, accept an arbitrary URL, call `GET /chat/messages/{id}`, follow
an attachment URL, or call `POST /chat/messages`. The provider response is capped at 2,000,000 bytes,
twenty rows, 20,000 stored/displayed Unicode code units per message body, and twenty attachment
metadata entries per message. Oversize body text is truncated with a visible `Message truncated`
flag; an oversize envelope refuses local import and reports the provider read-marker outcome as
uncertain.

The server accepts only the official literal dotted-key row shape. Common required fields are
positive integers `message.messageID`, `message.chatObjectTypeID=1`, and
`message.objectID=<requested work-order id>`; integer `message.roleTypeID`; string
`message.message`; and a valid `message.dateTimeCreated` instant normalized to UTC. Manager role `1`
requires positive equal `message.userID` and `user.userID`, with both `message.contactID` and
`contact.contactID` null. Tenant role `2` requires positive equal `message.contactID` and
`contact.contactID`, with both `message.userID` and `user.userID` null. Role 1 is always nonresident;
role 2 is the only resident-origin candidate. Unknown roles, missing/conflicting ids, or a role/id-
shape mismatch are stored only in restricted review and can never enable drafting.

Text is untrusted plain text rendered escaped; `message.messageLinkPreviewMeta`, HTML, scripts, and
link previews are discarded and never fetched. The only attachment projection is a maximum of
twenty entries containing positive integer `fileAttachmentID` and `fileID`; escaped strings `title`,
`fileName`, and `fileType` capped at 500 Unicode code units each; and escaped nullable
`previewFileName` under the same cap. Extra fields,
URLs, bytes, invalid ids/types, or an oversize string quarantine the entire row as
`invalid attachment metadata`; no attachment request runs.

The canonical deduplication identity is `(RentVine account reference, message.messageID)`. Its
payload hash is canonical JSON of account reference; required message ids/type/object/role; canonical
nullable user/contact ids; UTC creation instant; the full pre-truncation message text within the
two-megabyte envelope; and attachment allowlist sorted by `(fileAttachmentID,fileID)`. Mutable read/
share flags, names, emails, and link-preview metadata are excluded. The stored record contains the
bounded display body and truncation state, full-content hash, provider time and ids, mapping state,
allowlisted attachment metadata, sync-attempt reference, and retention fields. Message bodies and
resident values never enter logs, analytics, action receipts, model input, or notification payloads.

A duplicate pair with the same canonical payload hash is counted as `already synced` and is not
written again. A duplicate pair with a different canonical payload hash is not overwritten; it goes
to the restricted review lane as `provider message changed` with both hashes and no duplicated body
in logs. Provider rows with a missing/invalid message id are rejected bodylessly because they cannot
be deduplicated. Rows for the wrong object/type are rejected bodylessly rather than stored under the
requested ticket. Rows with an unknown sender or invalid role/id shape remain restricted
nonresident/rejected review records. Only otherwise valid tenant-role rows whose authoritative source
relation is unresolved or ambiguous enter the restricted `Needs mapping` lane; they are never
attached to another ticket or resident.

Work-order mapping comes only from the current server-owned ticket binding. During the same claimed
sync, the server reads fresh official work-order detail, requires one positive `leaseID`, and reads
fresh `GET /leases/{leaseID}` with `tenants` included. When exactly one tenant entry has both
`leaseTenant.contactID` and nested `contact.contactID` equal to the chat contact id, the local commit
atomically persists the message, exact resident source reference, and source version after verifying
that version is unchanged; there is no manual mapping step.
The draft recipient is the one nonblank current nested `contact.email` from that same exact match.

`requestedByContactID`, property/unit/name similarity, message display fields, and free-form review
are never resident authority. Missing lease id, no match, multiple matches, stale/conflicting ids, or
a concurrent source-version change leaves only that tenant-role row in `Needs mapping` with no
resident or email bound. An authorized reviewer may choose `Rerun source resolution`, which repeats
the same fresh reads and compare-and-commit algorithm; review never displays a person/email picker
and cannot select, type, override, or persist a person or email. Manager and unknown roles may remain
correctly labelled in restricted history but never enable resident reply.

Before provider dispatch, the execution ledger claims one preview-bound attempt. After a valid
provider response, the message creates/deduplicates, review-lane writes, next-page cursor, counts, and
successful attempt receipt commit together. The UI reports exact counts for `new`, `already synced`,
`needs mapping`, `rejected`, and `truncated`, plus the sync time. The receipt records only opaque ids,
page scope, hashes, counts, actor, action key, and the fact that the provider may have marked messages
read.

The RentVine read-marker has no known rollback. A refusal before HTTP dispatch is a definite no-effect
failure. A timeout, connection loss after dispatch, invalid/oversize response, or local commit failure
is `needs_reconciliation`: messages may already be marked read in RentVine, no automatic retry runs,
and the UI tells the user to review RentVine before choosing a new manual sync. A later deliberate
sync re-reads under a new confirmation and relies on `(account, messageID)` deduplication; it is never
described as restoring unread state or proving the first attempt did not occur.

### Human-reviewed resident reply draft

On a mapped resident-origin message, `Draft email reply` opens a composer tied to the exact ticket,
work order, message id, resident source reference, and signed-in mailbox. The user supplies a nonempty
subject and reply body. The server rejects CR/LF header injection, rejects a body over 20,000 code
units, and does not automatically quote the provider message or copy its attachments. It re-reads the
ticket/work-order/resident relation and resolves exactly one current email from the authoritative
RentVine resident/contact source; the browser-provided address, public-intake contact, or message
display name is never accepted as the recipient.

Preview returns the exact `From`, single `To`, subject, complete body with the standard review-before-
sending draft banner, source references, `executionId`, and `previewHash`. There is no CC, BCC, or
attachment in V1. Editing subject/body, changing the selected message, mapping, recipient source,
ticket/work-order binding, mailbox, or current source version invalidates the preview. Confirming the
unchanged preview once creates one unsent Gmail draft in the signed-in connected mailbox through
`gmail.maintenance_resident_reply.draft_create`. A deterministic RFC Message-ID and the existing
governed-draft ledger provide duplicate-confirm handling, one-attempt semantics, exact Gmail
readback/reconciliation, and a bodyless receipt.

`created` means only that the unsent draft exists. The app never reports `sent`, `delivered`,
`contacted`, or `replied` from draft creation. A timeout or uncertain Gmail outcome disables another
create and exposes exact-attempt reconciliation; it does not create a new draft. The app exposes a
link to the exact Gmail draft but never calls a Gmail draft-delete operation in V1 and has no draft-
delete Action Registry key, route, or provider method. Correction or reversal is a person editing or
deleting the still-unsent, unchanged draft in Gmail through that link. The app may subsequently run
read-only exact-attempt reconciliation and report `modified` or `no longer present`; it does not
perform or claim the deletion. If a person edits or sends the draft in Gmail, the app does not claim
it can roll that human action back.

### Exact message retention

The S100 implementation registers one collection named `rentvine_work_order_chat_messages` in
`communications-retention:v1.0` as class `workflow_link`. Each body-bearing message/review record is
stamped at its first successful local import with immutable `retention_anchor_at_ms`, `expires_at`,
`expires_at_ms = anchor + 365 days`, and `legal_hold=false`. Duplicate sync, view, mapping review,
draft creation, or changed-payload quarantine never refreshes that anchor. The existing legal-hold
transition clears/restores expiry under the same original anchor; malformed/unknown retention state
fails closed. Existing previewed, hash-confirmed, dependency-ordered communications cleanup removes
the complete message/review record when it expires and is not held. Bodyless sync/action receipts
remain under their existing audit retention and never duplicate message bodies or attachment data.

**In scope / out of scope.**

In scope: the two exact closed-by-default Action Registry entries; a `stateful_read` risk kind for
the consequential GET; manual preview/confirmation; one-page-at-a-time RentVine adapter; bounded
response parsing; exact deduplication; transactional exact-source resident auto-binding; restricted
source-resolution review/recovery; thread
display; metadata-only attachment handling; sync receipts and ambiguity; resident-reply composition;
server-resolved recipient/mailbox; exact-confirm unsent Gmail draft; draft reconciliation; and the
exact 365-day communications workflow-link retention contract above.

Out of scope: polling, Scheduler, Pub/Sub, webhook ingestion, page-load refresh, unread-count claims,
mailbox-wide or all-RentVine chat reads, attachment download/storage/preview, link-preview fetching,
RentVine `POST /chat/messages`, service-request creation, work-order create/update/status/vendor
assignment, manual person/email selection or inferred/overridden mapping, automatic task/notification/
draft, Gmail draft deletion by the app, Gmail thread reply, any direct or automatic send, SMS, owner/
vendor communication, general inbox, or S47 public-intake changes.

**Open questions & assumptions.**

No material product choice remains. The following are explicit V1 decisions:

- Each action reads exactly one page of twenty messages; older pages require another manual action.
- Retrieved messages may become read for managers in RentVine and that state is not reversible by
  PMI KC.
- Attachments are metadata only when metadata is present in the list response. V1 makes no second
  provider request to enrich or download them.
- Reply copy is human-entered and exact-previewed, so no unapproved resident-reply template or legal
  wording is invented.
- One fresh unique authoritative source match auto-binds transactionally during sync. Only unresolved
  or ambiguous tenant-role rows enter `Needs mapping`; authorized review can rerun the same source
  algorithm but cannot select or type a person/email.
- PMI KC never deletes Gmail drafts in V1. A person corrects or deletes the unchanged unsent draft in
  Gmail through its exact link; the app may reconcile observed state but has no delete key or API.
- `rentvine.work_order.chat.sync` and `gmail.maintenance_resident_reply.draft_create` remain
  `production_allowed:false` now. After closed implementation and deterministic gates, the owner-
  authorized temporary proof window may open only the key under proof; it is closed/read back before
  that key's separate final activation after proof. A credential or open related key cannot imply
  either grant.

A live proof still needs one staff-selected current real work order, one mapped resident with
verified email, a managed actor/mailbox, and provider permission. Those are external operational
inputs, not missing product behavior; deterministic fixtures can complete the fail-closed
implementation first.

**Cross-product impacts.**

Maintenance ticket detail and review queues; current ticket/work-order/resident source bindings;
Firestore records, indexes, retention, and rules; external-execution ledger, risk taxonomy, Action
Registry, runtime suspension, and Admin action visibility; RentVine client/transport and connection
health; Gmail governed-draft provider and mailbox connection; activity/audit records; privacy/logging;
S47 intake preservation; and final S87 Maintenance content reconciliation.

**Authority and evidence map.**

| Input                                                                                                                         | Classification                           | Use and limitation                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `docs/facts.md`, and current Action Registry                                                                     | Authority / current truth                | Every external effect needs one exact key; provider writes and new keys are closed by default; client communication may end only in a human-reviewed unsent Gmail draft; no sample/Test record or autonomous send.                                                                                                  |
| [Official RentVine List Chat Messages documentation](https://docs.rentvine.com/#tag/Chat-Messages/operation/listChatMessages) | Primary provider contract                | Documents Basic Auth, `GET /chat/messages`, Work Order `chatObjectTypeID=1`, literal dotted response fields, pagination headers, role ids 1/2, attachment metadata, and automatic manager-role read marking. It does not authorize polling, POST, attachment download, app mapping, or PMI KC production execution. |
| [Official RentVine Get Lease documentation](https://docs.rentvine.com/#tag/Leases/operation/getLease)                         | Primary provider contract                | Documents lease `tenants` include and exact `leaseTenant.contactID` plus nested `contact.contactID/email` fields used for resident mapping; it does not authorize name/property inference.                                                                                                                          |
| Current Maintenance page, ticket stores, work-order execution family, and Gmail owner-draft path                              | Verified implementation truth            | Supply role/Space conventions, app-ticket truth, exact provider-effect discipline, signed-in mailbox binding, governed preview/confirmation, one attempt, unsent-draft receipt, and reconciliation patterns. The owner-draft key/recipient/template cannot be reused as a resident reply.                           |
| `lib/maintenance/rentvine-resident-channel.ts`                                                                                | Superseded inert implementation artifact | Its invitation/template/webhook contract has no route or action authority and must not be adapted into chat sync or treated as provider proof.                                                                                                                                                                      |
| Owner direction for S100                                                                                                      | Product and future-activation authority  | Selects manual work-order chat sync, exact dedup/mapping/review/retention boundaries, and the resident-reply Gmail draft; authorizes a bounded per-key proof window plus later final activation after proof; it does not make either key executable now or authorize RentVine POST/direct send.                     |
| Exact safe live work order/resident/mailbox and protected key activation                                                      | External dependency                      | Required only for live proofs/activation. Never substitute a Test identity, guess a recipient, or block closed-key fixture implementation.                                                                                                                                                                          |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S100-1** — The execution taxonomy gains `stateful_read`, with immutable Medium risk,
  Action Registry gating, exact current-preview confirmation, human initiation, and explicit
  no-schedule/no-bulk/no-model constraints. Static and policy tests fail if the sync key is classified
  as passive `read`, omits exact confirmation, or can execute from render/background code.
- **ARCH-S100-2** — A narrow RentVine adapter constructs only the server-configured Basic-Auth
  `GET /chat/messages` request with fixed type `1`, exact bound work-order id, confirmed positive page,
  and page size twenty. It accepts only the bare-array dotted-key shape and the exact consistent
  pagination headers defined above. URL/verb/query/response allowlists and provider-spy tests reject
  all-message reads, other object types, arbitrary URLs, message-detail/file calls, POST, polling,
  automatic paging, and inferred response fields.
- **ARCH-S100-3** — The sync store uses `(account_ref, messageID)` as a unique identity and commits a
  valid bounded batch, mapping/review dispositions, cursor, counts, and receipt atomically after one
  claimed attempt. Concurrency, replay, reordered-page, overlapping-page, changed-payload, and local-
  failure tests prove no duplicate or silent overwrite.
- **ARCH-S100-4** — Work-order and resident mapping are server-owned and source-versioned. The sync
  transaction automatically binds the resident only when fresh work-order/lease reads yield one exact
  contact match; unresolved, ambiguous, or concurrently changed rows alone enter `Needs mapping`.
  Authorized review can only rerun that same compare-and-commit source algorithm, never choose or
  enter identity/contact data. Firestore rules prevent other Spaces/roles from reading bodies or
  modifying mappings.
- **ARCH-S100-5** — Attachment handling is an allowlisted metadata projection only. Static imports,
  transport spies, stored-shape tests, and URL/secret scans prove only the six named metadata fields
  cross the boundary and no attachment bytes, extra field, download call, signed URL, link preview,
  or unbounded provider field is accepted.
- **ARCH-S100-6** — The resident-reply action is a distinct Medium `workflow_draft` contract using
  the existing governed-draft ledger: server-owned recipient and signed-in mailbox, full exact
  preview, execution/hash confirmation, deterministic RFC Message-ID, one attempt, readback,
  reconciliation, an exact Gmail link, and unsent-draft-only provider. It has no Gmail draft-delete
  key, route, or provider method: a human edits/deletes the unchanged draft in Gmail, while PMI KC may
  only reconcile the observed result. Static tests prove it cannot reach Gmail send,
  `gmail.thread.reply`, Gmail draft deletion, or RentVine chat POST.
- **ARCH-S100-7** — Sync message bodies and resident/customer values are encrypted/protected under
  current app storage and rules but excluded from action receipts, logs, metrics, notifications,
  model prompts, URLs, and ordinary error bodies. The exact S100 collection is registered as a
  365-day `workflow_link` with immutable first-import anchor and legal-hold behavior. Bodyless audit,
  retention, cleanup, and PII tests enforce this.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S100-1** — Loading a maintenance surface makes zero chat calls. An eligible user sees a
  warning, cancels with zero effect, or confirms one exact page. Success reports new/duplicate/review/
  rejected/truncated counts and the possible RentVine read marker.
- **BEH-S100-2** — Duplicate or overlapping pages create no duplicate messages. Exact messages appear
  in stable chronological order; changed duplicate payloads, wrong-object rows, and unresolved sender
  mappings remain visibly isolated for review rather than overwriting or cross-linking data. Message
  access ends at its fixed 365-day expiry unless legal hold applies; later interaction cannot extend it.
- **BEH-S100-3** — Closed/suspended key, missing scope/binding/credentials, provider 400/401/403/429/
  5xx, invalid/oversize payload, timeout, and local commit failure produce distinct safe states. Only
  pre-dispatch refusal claims no provider effect; post-dispatch uncertainty warns that messages may
  be read and offers no automatic retry.
- **BEH-S100-4** — Sync automatically binds one resident when the fresh authoritative relation has
  exactly one match. Only unresolved/ambiguous tenant-role rows show `Needs mapping`; an authorized
  reviewer can rerun source resolution, but stale, multiple, absent, wrong-work-order, free-form, or
  concurrent results refuse and preserve the review item without a person/email picker.
- **BEH-S100-5** — On a mapped resident-origin message, the user can enter subject/body, inspect exact
  mailbox and verified recipient, cancel, edit and re-preview, or confirm once. Success creates one
  matching unsent Gmail draft, links to it, and reports only draft truth. Correction/deletion occurs
  manually in Gmail; PMI KC never invokes a draft-delete API.
- **BEH-S100-6** — Missing/changed resident email, mailbox, message, mapping, ticket/work-order source,
  subject/body, closed/suspended draft key, or uncertain Gmail outcome blocks or reconciles without
  another draft, provider chat write, work-order mutation, or send.
- **BEH-S100-7** — Sync, mapping, and draft operations remain independent. Sync never creates a
  ticket/status/draft/task/notification; source resolution reaches only the exact allowlisted read
  sources during sync or an authorized rerun and never performs a provider effect; drafting never
  changes RentVine or marks an app ticket complete.

**Human litmus outcome.**

### Deliberately sync one work-order conversation

**If this was built correctly:** A maintenance Editor opens a mapped ticket and chooses Sync resident
messages. The app warns that RentVine will mark retrieved messages read for managers. Cancel does
nothing. Confirm imports at most one page, reports exactly what was new or needs review, and never
refreshes again until a person chooses it.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with request allowlist,
  effect-spy, deduplication, mapping, pagination, ambiguity, privacy, and receipt evidence.
- Human verdict: PASS | FAIL - why; when no human observer is present, use
  `Human verdict: NOT RUN — no human observer` and continue unless explicitly made a completion gate.

### Create one resident reply draft

**If this was built correctly:** From a mapped resident message, the user writes a reply, reviews the
signed-in mailbox, verified resident address, subject, and full body, then creates one unsent Gmail
draft. Nothing is posted to RentVine or sent from the app, and an uncertain result offers a check of
the exact attempt instead of another create button.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with authoritative-
  recipient, exact-confirm, one-attempt, reconciliation, and no-send evidence.
- Human verdict: PASS | FAIL - why; when no human observer is present, use
  `Human verdict: NOT RUN — no human observer` and continue unless explicitly made a completion gate.

**Requirement-to-outcome traceability.**

| Requirement                                                 | Architecture outcome                        | Behavior outcome           | Human litmus                                  | Deterministic evidence / falsification                                                                                                                                                              |
| ----------------------------------------------------------- | ------------------------------------------- | -------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sync is a manual consequential stateful read                | `ARCH-S100-1`, `ARCH-S100-2`                | `BEH-S100-1`, `BEH-S100-3` | Deliberately sync one work-order conversation | Policy, render/provider-spy, cancel, confirmation-hash, exact URL/query, and post-dispatch-timeout tests fail any passive/automatic path.                                                           |
| Only one exact Work Order page is read per action           | `ARCH-S100-2`                               | `BEH-S100-1`               | Deliberately sync one work-order conversation | Verb/path/type/object/page/page-size matrix rejects arbitrary/all-chat/detail/POST and proves older-page sync needs another confirmation.                                                           |
| Messages deduplicate by account plus messageID              | `ARCH-S100-3`                               | `BEH-S100-2`, `BEH-S100-3` | Deliberately sync one work-order conversation | Same-page, overlap, reorder, concurrent attempt, response loss, changed-payload, and local-transaction failure tests.                                                                               |
| Work-order/resident mappings are exact and reviewable       | `ARCH-S100-4`                               | `BEH-S100-2`, `BEH-S100-4` | Deliberately sync one work-order conversation | Unique-match auto-bind, unresolved/ambiguous review, rerun-only, wrong-object, missing/multiple/stale contact, cross-work-order, no-picker/free-form, source-version, and concurrent-commit tables. |
| Attachments remain metadata only                            | `ARCH-S100-5`                               | `BEH-S100-1`, `BEH-S100-2` | Deliberately sync one work-order conversation | Stored-shape, byte/URL/token leak, follow-up transport, oversize/truncated metadata, and render-safety tests.                                                                                       |
| Body-bearing messages expire under one exact policy         | `ARCH-S100-7`                               | `BEH-S100-2`               | Deliberately sync one work-order conversation | Collection registration, fixed first-import anchor, 365-day expiry, no-refresh, legal-hold, cleanup, and bodyless-receipt tests.                                                                    |
| Resident response ends in one unsent Gmail draft            | `ARCH-S100-6`, `ARCH-S100-7`                | `BEH-S100-5`, `BEH-S100-6` | Create one resident reply draft               | Cross-layer form/route/service test, exact recipient/mailbox re-read, preview invalidation, deterministic Message-ID, exact Gmail link/reconciliation, and no-send/no-draft-delete static scan.     |
| Sync, mapping, work-order, and draft effects do not cascade | `ARCH-S100-1`, `ARCH-S100-4`, `ARCH-S100-6` | `BEH-S100-7`               | Both S100 litmus entries                      | Provider/action/store spies prove each user action reaches only its named boundary and never automatically invokes another.                                                                         |

**Preservation set.**

S47 tokenized-intake isolation/review; Maintenance page read/edit/Space guards; maintenance ticket,
unit, photo, work-order draft/create/status, owner-notice draft, Vendor, and Live-only retirement
tests; RentVine read client account/credential redaction; external-execution approval/claim/receipt/
runtime-suspension gates; Gmail DWD draft-only and send-boundary tests; Firestore rules; product-record
retention; PII/secrets scans; and canonical route/build checks remain green as a separate gate.

**Adversarial acceptance checks.**

- **AC-S100-1** — `ARCH-S100-1/2` and `BEH-S100-1` prove zero provider calls on render, hover,
  reconnect, navigation, page selection, cancellation, background execution, scheduled invocation,
  model invocation, or a changed/stale preview.
- **AC-S100-2** — The exact provider matrix proves only GET list, Work Order type `1`, the
  server-bound object id, one page of twenty, consistent exact pagination headers, the documented
  dotted-key row shape, and managed credentials are reachable. Browser-supplied account/path/type/
  object credentials and RentVine POST are rejected before transport construction.
- **AC-S100-3** — `ARCH-S100-3` and `BEH-S100-2/3` prove exact `(account,messageID)` deduplication,
  atomic local commit, changed-payload quarantine, and honest ambiguity after provider dispatch.
- **AC-S100-4** — `ARCH-S100-4` and `BEH-S100-4` prove missing, stale, multiple, wrong-property,
  wrong-work-order/lease/contact ids, unknown role, nonresident, requested-by, name/property inference,
  and free-form/manual mappings cannot produce a resident link or recipient. One unique fresh match
  auto-binds inside the sync transaction; ambiguous/unresolved matches alone enter `Needs mapping`,
  and review exposes only rerun source resolution with source-version/concurrency protection.
- **AC-S100-5** — `ARCH-S100-5/7` proves invalid/extra attachment fields quarantine the row and
  attachment bytes/URLs, raw provider envelopes, bodies, contacts, and emails are absent from logs,
  receipts, telemetry, notifications, URLs, and model input.
- **AC-S100-6** — `ARCH-S100-6` and `BEH-S100-5/6` prove the real composer payload crosses the route,
  service, execution ledger, and Gmail draft provider with exact confirmation and authoritative
  recipient/mailbox; the returned exact draft link can support read-only reconciliation, while route,
  key, import, and provider-spy inventories prove the app has no Gmail draft-delete reachability.
  Separate-layer mocks that only agree with themselves are insufficient.
- **AC-S100-7** — Send-boundary and provider spies prove no Gmail send/thread reply, RentVine chat
  POST, work-order/status/vendor mutation, auto-draft, or cascade occurs in any success, refusal,
  timeout, response-loss, mapping, or reconciliation case.
- **AC-S100-8** — Closed or suspended exact keys refuse before their respective provider clients are
  constructed, and opening a related RentVine/Gmail key does not make either S100 key executable.
- **AC-S100-9** — The S100 collection is registered only as `workflow_link`; first-import, duplicate,
  view, mapping, draft, expiry, hold/release, malformed-policy, preview/confirmation, and cleanup tests
  prove a fixed 365-day body-bearing window with no anchor refresh or body copied into audit receipts.

**Forbidden actions / hard gates.**

No provider call on page load or in a background/scheduled/model path; polling; webhooks; automatic
pagination/retry; all-chat or cross-object read; attachment/file/link-preview fetch; browser-supplied
provider target/account/credential/resident/email/mailbox; overwrite of a changed duplicate; raw
body/customer values in logs or model input; RentVine chat POST; automatic work-order create/status/
vendor change; automatic app ticket/task/notification/draft; Gmail thread reply; app send; sample or
Test production sync/draft; app-initiated Gmail draft deletion; manual/free-form person or email
mapping; claim that manager unread state is reversible; generic/category action grant; or
`production_allowed` change without exact protected owner review.

**Dependencies / sequencing.**

S100 preserves S47 and consumes an exact Live app ticket plus server-verified RentVine work-order and
resident sources. The closed-key implementation may land after the Maintenance interaction and
access foundations are available. If work-order or resident bindings are absent, the surface renders
the exact blocked/review state and makes zero provider calls; it must not invent a dependency receipt
or broaden S47. S87 remains the final owner of product-wide Maintenance placement/copy and must add
the sync, mapping-review, and resident-draft surfaces to its migration manifest without changing
their effect semantics.

The two S100 keys are independent: sync can be implemented and fixture-verified while the draft key
is closed, and the draft path can be fixture-verified while no live sync target exists. Live sync
proof precedes live draft proof because only a synchronized, exactly mapped resident message may
seed the draft workflow. Neither proof authorizes the other key.

**Standalone delivery contract.**

- **Deliverable now:** Closed-by-default registry/policy contracts, stateful-read architecture,
  exact one-page adapter, bounded parser/store/review lane, manual UX, dedup/ambiguity/receipt flow,
  resident-reply composer, server recipient/mailbox resolution, governed unsent-draft creation and
  reconciliation lifecycle with human Gmail correction/deletion outside the app;
  Firestore rules/indexes/retention, privacy controls, full deterministic fixture tests, closed-state
  release, bounded live proofs, protected activation, and exact release/readback.
- **Consumes, but does not assume:** A current app-ticket/work-order binding, provider resident/contact
  source, connected signed-in Gmail mailbox, S47 ticket provenance, and shared interaction primitives.
  Each absent input has a named unavailable or needs-mapping state with zero provider construction.
- **Externally blocked effect:** Live sync requires one exact staff-selected real work order/resident,
  managed actor, credential permission, exact preview, and protected activation of
  `rentvine.work_order.chat.sync`. Live draft requires a successful mapped sync, verified current
  resident email, connected managed mailbox, and separate protected activation of
  `gmail.maintenance_resident_reply.draft_create`. Record the corresponding live proof as `BLOCKED`
  without blocking the green fail-closed code slice.
- **Produces for downstream suites:** A stable bounded message/review projection, opaque sync receipt
  and ambiguity states, exact resident mapping contract, resident-draft request/outcome contract, and
  S87 surface/state manifest entries.

**Verification and delivery contract.**

1. Before implementation, capture that both exact keys/adapters/stores/surfaces are absent, freeze
   S47/Maintenance/Gmail/send-boundary preservation, and materialize failing policy, request allowlist,
   render-zero-call, dedup/mapping, privacy, and cross-layer draft tests for that expected absence.
2. Run focused tests for risk classification; registry schema; exact RentVine transport and bounded
   parser; page/cancel/confirmation state; attempt claim/receipt/ambiguity; store concurrency/dedup;
   transactional auto-binding/rerun-only review; Firestore rules; attachment metadata; PII/logging;
   draft contract/composer/route/service/provider/reconciliation; runtime suspension; and no-cascade/
   no-send/no-draft-delete boundaries.
3. Run `bash scripts/verify.sh` and `npm run test:e2e:core`; inspect the mechanical diff and audit
   secrets, PII, provider URLs/verbs/query parameters, action-key state, runtime descriptor, account/
   work-order/resident/mailbox sources, attachment fields, logs, receipts, and scope traceability.
4. Keep both committed keys closed through closed-state release. After deterministic gates and one
   exact real target exist, apply the owner-authorized temporary proof-window patch for only the key
   under proof, read it back executable, run one bodyless-evidence proof, then close/read it back
   before opening the other proof window or preparing final activation. Deliver every served change
   through the existing zero-traffic candidate, exact smoke, promotion, readback, and rollback
   process; sample/Test data never contacts either provider.
5. Report one implementation terminal state: `ALL_GATES_GREEN` only after both exact keys' bounded
   live proof, protected activation, release, and readback pass; `BUDGET_EXHAUSTED` only with an
   explicit budget; or `BLOCKED` only on one exact unavailable runtime input after all independent
   fail-closed work is complete. Do not call a fixture-green slice live-proven or advance the
   canonical queue from it.

**Ordered prompt sequence.**

1. Re-verify official RentVine endpoint behavior, current provider/action code, exact Maintenance
   bindings, Gmail draft lifecycle, and S47 preservation; record fail-first checks.
2. Add the closed action schemas and `stateful_read` policy, then build the narrow transport/parser,
   attempt ledger, atomic dedup store, mapping/review lane, and manual one-page UX.
3. Build the separate closed resident-reply draft contract by reusing the governed unsent-draft
   ledger while adding server-owned resident/mailbox resolution, exact preview invalidation, exact
   Gmail link/read-only reconciliation, and a hard absence of app draft-delete reachability.
4. Falsify every automatic/cross-scope/replay/response-loss/mapping/PII/attachment/send path; run
   focused, Firestore, canonical, and end-to-end preservation gates.
5. Reconcile current facts/status/plan/loop/manifest and S87 surface ownership, ship fail-closed code,
   and run each live proof only after its own exact protected authority and safe target exist.

**Deletion/merge recommendation.**

Remove S100 from the active tree only after both keys' implemented contracts, closed/open state,
proof results, manual-sync/read-marker behavior, mapping/review lifecycle, unsent-draft boundary, and
all safety tests are represented in current product, integration, engineering, and facts documents.
Do not merge it into S47 or the owner-notice draft: each has different actors, sources, recipients,
effects, and failure recovery.
