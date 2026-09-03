<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: source-of-truth-writeback-v1 -->

# S99 — Governed RentVine maintenance work-order writeback

> Status: **COMPLETE / DEPLOYED.** The exact RentVine work-order read, create, and status-update keys
> are proven, open, released, and read back. The retired synthetic executor and its hard-coded
> statuses are not provider capabilities.

**Goal.**

Let authorized maintenance staff read exact RentVine work-order truth, create one reviewed work order
from one verified Live app ticket, or update one existing work order's status, with explicit human
initiation, exact preview and confirmation, Admin approval for writes, at most one provider attempt,
durable receipts, exact readback, honest reconciliation, and separately confirmed correction or
cancellation. The app never assigns a Vendor, shares the work order, posts chat, attaches a file, or
sends a notification through this feature.

**Current state / intended end state.**

Production stores app-owned maintenance tickets separately and now uses only the official account-
pinned work-order endpoints and fresh account
catalogs listed below. One server-built proposal links one Live app ticket to one positive-integer
RentVine target. A write succeeds only after the returned work-order id and a separate provider GET
match the exact reviewed fields. App-ticket status and RentVine status remain separate; neither one
silently advances the other.

Completion evidence used property 84. The complete filtered read passed; TEST work order 1731 was
created with honest ambiguity reconciliation, a durable receipt, and final `Cancelled` state. The
delivered corrections cover trade rows, unit identifiers, provider `isVacant`, the update envelope,
and group 5 parsing. All three exact keys were activated and read back without adding Vendor
assignment, notification, attachment, chat-post, or send reachability.

**Actors and entry conditions.**

- A managed user with Maintenance Space `read` may explicitly request a bounded work-order read. A
  Maintenance-space Editor or higher may assemble a create or status proposal from a current Live
  app ticket and fresh provider data.
- Create and status update remain High-risk system-of-record effects. They require the current exact
  preview's Admin approval through the existing approval queue, an authenticated managed operator
  with Maintenance Space `edit`, the exact production-allowed key, valid RentVine `Manage Work
Orders` permission, Production + Live, no applicable runtime suspension, and an unexpired exact
  confirmation. S83 owns a missing-access request; approval never substitutes for an action gate.
- The server derives the `pmikcmetro` account, provider path, app ticket, property/unit mapping,
  current work order, and catalogs. The browser cannot supply a host, method, path, raw body, account,
  arbitrary list filter, or unobserved provider id.
- A create proposal requires one persisted Live ticket with a verified unit, non-empty description,
  no unresolved identity blocker, and no successful or ambiguous prior create attempt. A status
  proposal requires one exact work order selected from a fresh S99 read.
- The completed live proof used one staff-selected real work order or exact staff-confirmed real
  creation proposal supplied outside Git. It is historical evidence, not a reusable runtime input;
  it must not be rerun, reassigned, or replaced. No synthetic issue, person, property, unit, work
  order, or value may be introduced into normal execution.

**What it is / how it functions.**

### Exact operation and endpoint matrix

S99 retains and corrects the three existing keys; it adds no generic or substitute key:

| Exact Action Registry key           | Official RentVine operation                                                                                                                                                                        | S99 boundary                                                                                                                                                                                                         |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rentvine.work_order.read`          | `GET /maintenance/work-orders`, `GET /maintenance/work-orders/{workOrderID}`, `GET /maintenance/work-order/statuses[/{workOrderStatusID}]`, and `GET /maintenance/vendor-trades[/{vendorTradeID}]` | Human-initiated exact-id read or a ticket-bound property/unit list; bounded pagination and completeness are explicit. Catalog reads return status/trade identity only and never request the trade `vendors` include. |
| `rentvine.work_order.create`        | `POST /maintenance/work-orders`                                                                                                                                                                    | Create one work order from the exact field matrix below. Returned id plus a fresh detail GET must match before success.                                                                                              |
| `rentvine.work_order.update_status` | `POST /maintenance/work-orders/{workOrderID}`                                                                                                                                                      | Change only `workOrderStatusID`, with `sendVendorNotification:false` and `sendReview:false`; all other provider fields are omitted and must remain unchanged on readback.                                            |

All paths are rooted at the configured HTTPS `https://pmikcmetro.rentvine.com/api/manager` account
and accept only positive-integer provider ids. The transport has no generic request function and no
DELETE, status-catalog mutation, Vendor assignment, chat, file, email, or arbitrary work-order-update
method.

The read list accepts only server-typed filters supported by the official operation and needed for
the selected ticket: exact `propertyID`, `unitID`, `workOrderStatusID`, `leaseID`, `startDate`,
`endDate`, or `isNew`. A raw search string, vendor filter, caller-provided query serialization, or
unbounded all-account fetch is unavailable. It sends explicit `page` and the documented default
`pageSize=15`, deduplicates by positive `workOrderID`, stops on a short page, and caps one activation
at 20 pages. Reaching the cap reports `complete:false`; it never presents 300 rows as a complete set.
Detail GET is the authoritative pre-write/readback path.

### Exact wire types, envelopes, and canonical equality

Wire validation is operation-specific and runs before canonicalization. The implementation must not
use a generic `string | number`, truthy/falsy, or envelope-unwrapping parser. Every provider id used
in a path or GET query begins as a positive integer and is URL-serialized as its canonical base-10
digits. Every id in a create or status-update request body is instead an exact positive decimal
string: `propertyID`, `unitID`, `priorityID`, `workOrderStatusID`, and optional `vendorTradeID` on
create, and `workOrderStatusID` on update. Leading zeroes, signs, whitespace, fractions, exponent
notation, zero, booleans, and numeric/string substitutions for the operation's required raw type are
rejected before transport construction.

The list query's `isNew` filter is only integer `0` or `1`. Create request fields
`isOwnerApproved`, `isVacant`, and `isSharedWithOwner` are exact JSON booleans;
`isSharedWithTenant` is exact string `"0"`; and transient create/update notification flags are exact
JSON booleans fixed to `false` below. In work-order response objects, each consumed persisted
boolean-like flag is accepted only as the documented exact string `"0"` or `"1"`. The app may present
those response flags as booleans only after field-specific decode. Numeric/string/boolean substitution,
empty strings, and other truthy/falsy coercion refuse.

The consumed operations accept only these response roots:

| Operation                     | Exact response root                                                      | Exact raw identity/flag contract                                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work-order list GET           | Bare array; every row is the documented `{ workOrder, contact }` wrapper | The parser reads only allowlisted fields from those two members; it never treats a bare work-order object or a detail envelope as a list row. Documented boolean-like read fields are exact strings `"0"` or `"1"`.              |
| Work-order detail GET         | `{ workOrder, schedulingStatusID }`                                      | Every consumed id inside `workOrder` uses its documented canonical positive decimal string; `schedulingStatusID` alone is an integer or null. Documented persisted boolean-like work-order fields are exact `"0"`/`"1"` strings. |
| Work-order create POST        | `{ workOrder, schedulingStatusID }`                                      | Same work-order id/response-flag rules and integer-or-null `schedulingStatusID` rule as detail GET. No id-only, bare-work-order, list-row, or update envelope is accepted as create success.                                     |
| Work-order status-update POST | `{ workOrder }`                                                          | Every consumed returned id is a canonical positive decimal string. A detail/create envelope with `schedulingStatusID` or any other root is not accepted as update success.                                                       |
| Status-list GET               | Bare array; every row is `{ workOrderStatus }`                           | Every consumed status id is a canonical positive decimal string. Bare status objects are rejected.                                                                                                                               |
| Status-detail GET             | `{ workOrderStatus }`                                                    | The detail is enveloped and every consumed status id is a canonical positive decimal string.                                                                                                                                     |
| Vendor-trade-list GET         | Bare array of documented Vendor-trade objects                            | Every consumed `vendorTradeID` is a positive integer. A wrapper or detail envelope is rejected.                                                                                                                                  |
| Vendor-trade-detail GET       | `{ vendorTrade }`                                                        | The detail is enveloped; its `vendorTradeID` is a canonical positive decimal string and must canonically equal the integer id selected from the list and used in the path.                                                       |

Canonicalization is narrow, reversible, and type preserving at the boundary. An allowed decimal
string must equal the canonical decimal serialization of the resulting positive-integer identity;
an allowed integer must be a safe positive integer and must equal that same canonical identity.
Cross-operation comparisons happen only after each raw value passes its own operation-specific
decoder. Equality then requires exact canonical id equality and exact typed equality for every
non-id field; JavaScript loose equality, `Number(...)`/`String(...)` coercion, truthiness, alternate
envelopes, and partial-object success are forbidden. A response that cannot make that strict raw-to-
canonical round trip is invalid and produces refusal or post-dispatch ambiguity, never verified
success.

### Exact create field matrix

The create writer serializes only these fields:

| Provider field           | Required value and source                                                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `propertyID`             | Required positive identity freshly derived from the verified ticket unit's RentVine property mapping; serialized in the create body as a canonical positive decimal string.                                                                    |
| `unitID`                 | Required positive identity equal to the verified ticket unit; serialized in the create body as a canonical positive decimal string. S99 deliberately narrows the provider's optional unit to one exact app-ticket target.                      |
| `description`            | Required exact reviewed ticket description. Execution cannot accept an inline replacement or HTML/script content; staff edits the ticket before rebuilding the preview.                                                                        |
| `priorityID`             | Required explicit staff selection from the official create contract's `1` Low, `2` Medium, or `3` High vocabulary, serialized as a decimal string. App `Normal`/`Emergency` labels never auto-map; priority `4` remains unsupported.           |
| `workOrderStatusID`      | Required id from a fresh account status catalog/detail read, serialized as a decimal string. Creation permits only a current status whose live primary grouping is Pending or Open; it never creates directly into a terminal/on-hold state.   |
| `isVacant`               | Required explicit staff-confirmed JSON boolean shown in the preview. It is never inferred from missing lease data.                                                                                                                             |
| `isOwnerApproved`        | Literal JSON boolean `false` in the create body. The app does not claim owner approval from ticket creation or staff approval.                                                                                                                 |
| `vendorTradeID`          | Optional positive identity explicitly selected from the fresh trade list and serialized as a decimal string in the create body. It is a maintenance category only and grants no Vendor assignment; inferred app trade text cannot auto-map it. |
| `isSharedWithTenant`     | Literal string `"0"`.                                                                                                                                                                                                                          |
| `isSharedWithOwner`      | Literal JSON boolean `false`.                                                                                                                                                                                                                  |
| `sendVendorNotification` | Literal `false`.                                                                                                                                                                                                                               |
| `sendEmail`              | Literal `false`; the `email` object is omitted.                                                                                                                                                                                                |

Every other official create field is out of scope and structurally rejected, including `leaseID`,
`vendorContactID`, `technicianContactIDs`, `requestedByContactID`, `assignedToUserID`, dates,
amounts, templates, projects, instructions, `attachments`, and `issueImages`. The response and
detail readback must prove the exact work-order id, property/unit, description, priority, status,
vacancy, owner-approval, optional trade, and the two persisted sharing values through the exact
operation-specific envelope/type decoders and strict raw-to-canonical equality above. The allowlisted serialized-request hash proves both notification flags were sent
as `false`; those transient request flags are never misrepresented as provider-readable state.
Account-level evidence below remains necessary to rule out a configured provider automation. Truthy/
falsy coercion is forbidden.

### Status, cancellation, and correction

The status selector is generated from a fresh `GET /maintenance/work-order/statuses` result and each
selected id is revalidated by detail GET. It displays provider name, system/custom classification,
and primary grouping, but stores and submits the id. It never uses the synthetic `Open -> Waiting on
Vendor -> Scheduled -> Closed` matrix or assumes the example ids in the official documentation are
the current account ids.

Before a status update, detail readback must match the exact id, property/unit, current status, and
proposal version and must prove both owner and tenant sharing are off. The only request body is:

```text
{ workOrderStatusID: "<fresh-target-id>", sendVendorNotification: false, sendReview: false }
```

The target must differ from the current status. A successful response is followed by detail GET;
success requires the target status and every tracked non-status field to match the before record.
Changing description, priority, schedule, approval, sharing, assignment, or any other field is not a
status success.

Cancellation is not deletion. The cancellation target is the unique live system catalog entry named
`Cancelled`, verified by its system flag and detail read. Zero or multiple matches disable automatic
cancellation. A create receipt offers a separate `Cancel created work order` preview only for that
exact receipt-bound id. A normal status receipt offers `Restore prior status` only while the work
order still has the receipted target status and the prior status remains in the live catalog. Both
are new High-risk `rentvine.work_order.update_status` attempts with new previews, approvals,
confirmations, claims, receipts, and readbacks. Drift or provider refusal leaves manual RentVine
review; the app never DELETEs a work order or automatically compensates.

### Notifications, provider automation, and lifecycle truth

Create always forces tenant/owner sharing and both documented notification flags off. Status update
does not change sharing and is unavailable for an already-shared record; it forces vendor notification
and completion review off. Vendor/contact/technician/email/file/chat fields are absent from every
request.

The official update documentation warns that status changes may trigger workflows or notifications.
Therefore a false request flag is necessary but not sufficient activation evidence. Before any live
create or status effect, the runner must obtain fresh account/provider evidence that the exact
initial status or selected transition will not emit an owner, resident, or Vendor notification or
review request. The versioned evidence binds account, operation, current/target status ids when
applicable, fixed request flags, provider/account configuration reference, reviewer, observed time,
and expiry. If that account-level behavior cannot be verified, the affected create/update key remains
blocked; the app must not describe `false` as proof that an out-of-band RentVine automation cannot
run.

An app ticket, create proposal, approval, provider response, matching catalog name, or matching
readback is not itself an effect receipt. Provider success is projected to the ticket only after the
immutable receipt is durable. Projection records the provider id/status and receipt reference but
does not change the app ticket's lifecycle, mark it closed, assign a Vendor, or emit a notification.

**In scope / out of scope.**

In scope: exact work-order/detail/status/trade reads; bounded pagination; one ticket-bound create;
one exact status update; live provider mappings; corrected Registry preview schemas; strict
account-pinned read/write transports; Admin approval and exact confirmation; claim/receipt/readback;
response-loss reconciliation; ticket/provider link projection; separately confirmed prior-status
restore or cancellation; cache invalidation; closed release, real-record proof, protected activation,
and current-doc reconciliation.

Out of scope: property-level work orders without a verified unit; arbitrary or bulk reads/writes;
Vendor/contact/technician assignment; trade-to-Vendor expansion; lease/resident invitation; chat read
or post; webhooks or polling; attachments or issue images; schedule, amount, template, project,
instructions, approval, vacancy, description, priority, or sharing updates after creation; work-order
DELETE; status-catalog/trade mutation; Gmail or RentVine sends; model-triggered execution; and
synthetic-provider execution. S100 separately owns manual official-chat synchronization and one
unsent Gmail resident-reply draft.

**Open questions & assumptions.**

No product decision remains open. Exact provider ids, current status/trade catalogs, the selected
normal-operation target or proposal, and account-level no-notification evidence are fail-closed
runtime inputs, not values to commit or guess. Their absence blocks only the exact normal read/write
that consumes them. The completed proof target is historical evidence and is never selected again.

**Cross-product impacts.**

Maintenance ticket queue/detail/activity; Approval Queue; S83 access requests; S85/S86 action and
recovery presentation; Action Registry schemas/gates; RentVine account client and credentials;
Firestore attempt/receipt/ticket-link evidence; Admin connection status; runtime suspensions; cache
invalidation; S90 read-only Work projections; S100 chat identity; S87 content inventory; environment,
release, integration, and client documentation.

**Authority and evidence map.**

| Input                                                                     | Classification                   | Use and limitation                                                                                                                                                                             |
| ------------------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, current code/tests, live readback, and `docs/facts.md`       | Authority / implementation truth | Establish the closed three keys, Live-only managed identity, current app tickets/list read, synthetic-only executor, and exact approval/effect boundaries.                                     |
| Owner decisions of 2026-08-31                                             | Product/effect authority         | Authorize S99 reads/create/status, real-record proof, and future protected activation after gates; exclude assignment, chat post, attachments, sends, sharing, and autonomy.                   |
| Official RentVine OpenAPI at `https://docs.rentvine.com/`                 | Provider contract                | Establish the exact GET/POST paths, required create fields, update flags, priority vocabulary, and status/trade catalogs. Snapshot/hash only consumed operations; infer no CAS or idempotency. |
| Fresh provider catalogs/state and exact staff-confirmed Live ticket/proof | Runtime authority                | Supply ids, before state, explicit vacancy/priority/status/trade choices, and notification-safety evidence. Missing, stale, conflicting, or incomplete input refuses one action.               |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S99-1** — One versioned server proposal union binds actor, role/Space, Live ticket,
  provider account, exact key/mode, property/unit/work-order identity, fresh before/catalog hashes,
  exact create or status fields, fixed safety flags, source/version, preview hash/expiry, Admin
  approval, reversal data, and one opaque attempt id. Unknown fields and caller paths/bodies refuse.
- **ARCH-S99-2** — A concrete read-only client implements only the six table GET forms, and a separate
  narrow write client implements only the two POST forms. The Registry, risk matrix, preview schemas,
  routes, receipts, UI, and tests share the same exact field/key matrix. Per-operation codecs enforce
  integer path/query ids, decimal-string body/work-order/status ids, operation-specific request
  boolean/string fields, exact persisted response `"0"`/`"1"` flags, integer-or-null scheduling ids,
  and the eight response roots above before any value becomes canonical app state.
- **ARCH-S99-3** — Every mutation has a durable application claim before its one provider call.
  RentVine exposes no proven idempotency or atomic compare-and-set token; timeout, network loss, 5xx,
  invalid/missing response, or claim/receipt uncertainty becomes `ambiguous` and never retries.
- **ARCH-S99-4** — Create readback binds the returned stable id and all reviewed fields. Status
  readback binds the same id, target status, and unchanged tracked fields. Receipt persistence
  precedes idempotent ticket projection; projection failure never causes another provider call.
- **ARCH-S99-5** — Reconciliation is read-only. Create reconciliation may report zero, one, or many
  matching candidates without claiming causality. Status reconciliation reports observed prior,
  target, or drift state. A matching observation never upgrades causality or permits a retry.
- **ARCH-S99-6** — The synthetic executor's assumed provider CAS/idempotency, hard-coded transition
  matrix, and Vendor-assignment reachability are removed from product capability. Tests inject only
  HTTP transports/provider responses pinned to the official operation schemas; no synthetic product
  provider or Test record can reach Live routes.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S99-1** — A ticket offers `Check RentVine` as an explicit bounded read. Fresh results show
  complete/incomplete pagination truth, provider id/status, and direct provider/detail link without
  mutating the ticket or starting background polling.
- **BEH-S99-2** — `Create in RentVine` appears only for one eligible ticket with no prior successful
  or ambiguous create. Preview shows exact property/unit, description, provider priority/status,
  vacancy, owner approval false, optional category, and all sharing/notification flags off.
- **BEH-S99-3** — `Update RentVine status` appears only for one freshly read, unshared work order and
  a different fresh-catalog target. The preview shows current/target provider status, unchanged
  fields, notification consequences, correction availability, approval, and expiry.
- **BEH-S99-4** — One exact confirmation produces at most one POST and then either a bodyless verified
  receipt, a provider refusal with no success claim, or `Needs reconciliation` with no Retry control.
  Duplicate confirmation returns the durable outcome.
- **BEH-S99-5** — A separately confirmed restore or cancellation changes only the exact status of the
  unchanged receipt-bound record. Drift disables the automatic action and links to read-only provider
  review. App ticket status never follows provider status automatically.
- **BEH-S99-6** — Vendor assignment, chat, files, owner/resident sharing, notifications, direct sends,
  autonomous execution, and generic provider controls are absent from the UI and unreachable through
  the route/transport. Missing access links to S83 without weakening the action.

**Human litmus outcome.**

### Create or change exactly one RentVine work order

**If this was built correctly:** A maintenance staff member opens one verified ticket, sees the exact
RentVine values that will be read or changed, and can request approval and confirm one clearly named
effect. Success names the one verified work order; uncertainty offers reconciliation, not Retry.
Nothing is shared or sent, no Vendor is assigned, and cancellation/restoration is a separate reviewed
status action.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why; when no human observer is present, use `Human verdict: NOT RUN — no human observer`.

**Requirement-to-outcome traceability.**

| Requirement                                     | Architecture outcome                                                               | Behavior outcome                                                             | Human litmus                                       | Deterministic evidence / falsification                                                                                                                                                  |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact official endpoint/key/field matrix        | `ARCH-S99-1`, `ARCH-S99-2`                                                         | `BEH-S99-1`, `BEH-S99-2`, `BEH-S99-3`                                        | Preview contains only one supported read/effect    | OpenAPI-snapshot, raw-type/envelope codecs, schema, static inventory, and HTTP-spy matrices reject every other path, method, query, field, account, shape, coercion, and second target. |
| Live catalog and ticket/provider identity       | `ARCH-S99-1`, `ARCH-S99-4`                                                         | `BEH-S99-1`, `BEH-S99-2`, `BEH-S99-3`                                        | Staff can explain every id and mapped value        | Stale/missing/duplicate property, unit, status, trade, priority, work-order, and catalog fixtures refuse before writer construction.                                                    |
| At-most-once receipt/readback/reconciliation    | `ARCH-S99-3`, `ARCH-S99-4`, `ARCH-S99-5`                                           | `BEH-S99-4`                                                                  | Result is verified or honestly recoverable         | Claim races, duplicate confirm, timeout, 5xx, invalid response, readback/receipt/projection loss, and candidate ambiguity prove no retry.                                               |
| Separate reversible status/cancellation         | `ARCH-S99-3`, `ARCH-S99-4`, `ARCH-S99-5`                                           | `BEH-S99-5`                                                                  | Correction is separately reviewed                  | Prior/target/cancelled/drift/catalog-removal/race fixtures prove one new attempt and zero DELETE or automatic compensation.                                                             |
| Sharing/notifications/assignment/sends stay off | `ARCH-S99-1`, `ARCH-S99-2`, `ARCH-S99-6`                                           | `BEH-S99-2`, `BEH-S99-3`, `BEH-S99-6`                                        | No client or Vendor effect accompanies the write   | Body spies, UI/route inventory, provider-account proof, and send/attachment/chat/assignment scans prove fixed false/absent fields.                                                      |
| Real-record proof and protected activation      | `ARCH-S99-1`, `ARCH-S99-2`, `ARCH-S99-3`, `ARCH-S99-4`, `ARCH-S99-5`, `ARCH-S99-6` | `BEH-S99-1`, `BEH-S99-2`, `BEH-S99-3`, `BEH-S99-4`, `BEH-S99-5`, `BEH-S99-6` | One exact staff-selected case behaves as previewed | Secure target/proposal, GET/POST/readback/correction evidence, release identity, and exact per-key readback must all agree.                                                             |

**Preservation set.**

Preserve app-owned ticket capture, intake quarantine, unit verification, ticket/activity/notification
lifecycle, photo and unsent owner-draft boundaries, current role/Space/approval semantics, all
RentVine lease/property reads, the `pmikcmetro` account and managed credentials, runtime suspension,
the exact per-key registry boundary, permanent no-send rules, secrets/PII hygiene,
eleven Spaces, and every unrelated provider key. Provider work-order status and app ticket status
remain independently visible and independently changed.

**Adversarial acceptance checks.**

- **AC-S99-1** — Official-operation snapshot/schema tests prove integer path/query ids (including
  integer `isNew` 0/1), decimal-string create/update body ids, decimal-string work-order/status ids,
  integer trade-list ids, operation-specific request booleans/string flags, exact persisted response
  `"0"`/`"1"` flags, integer-or-null scheduling ids, pagination completeness, and the exact list,
  detail, create, update, status, and trade envelopes. Wrong raw types, leading-zero/coercible ids,
  alternate wrappers, partial objects, arbitrary host/path/body, and OpenAPI example ids refuse.
- **AC-S99-2** — Create tests reject a non-Live or unverified ticket, prior success/ambiguity,
  property/unit drift, inline description, inferred priority/trade, unsupported priority `4`, unsafe
  initial status, missing vacancy, and every out-of-scope provider field before POST.
- **AC-S99-3** — Status tests reject a missing/stale/shared/different work order, stale/duplicate/same
  target, missing notification-safety evidence, hard-coded transition, and non-status mutation; only
  the three-field status body reaches the provider.
- **AC-S99-4** — Concurrency and failure injection at approval, confirmation, claim, provider,
  readback, receipt, projection, reconciliation, restore, and cancellation prove at most one POST per
  attempt, no blind retry, and no false success.
- **AC-S99-5** — Browser/route/role/accessibility tests cover read, create, status, approval handoff,
  exact confirm, busy/refused/success/ambiguous/drift states, focus recovery, direct links, and no
  automatic ticket transition.
- **AC-S99-6** — Complete-tree inventory proves no production or proof route exposes Vendor
  assignment, chat post, files, DELETE, sharing, notification, send, generic update, synthetic
  executor, or synthetic provider effect.
- **AC-S99-7** — The staff-selected live proof, any separately confirmed restore/cancellation,
  exact-key closeout, protected activation diff, zero-traffic release, and stable action readback pass
  without customer values, credentials, provider bodies, or message content entering artifacts.

**Forbidden actions / hard gates.**

No action while its exact key is closed; no provider writer before fresh account/catalog/target read;
no generic, bulk, scheduled, polling, webhook, model-triggered, or second-target work; no guessed
property, unit, work order, status, priority, trade, vacancy, approval, transition, notification, or
sharing behavior; no Vendor/contact/technician assignment; no chat post/read under S99; no file or
attachment; no work-order DELETE; no owner/resident/Vendor share or notification; no direct send; no
retry after ambiguity; no automatic compensation; no synthetic Live proof; no personal identity; no
secret/customer value/provider body in Git or logs; and no claim that matching readback alone proves
causality.

**Dependencies / sequencing.**

S99 consumed S83 access/approval handoff and S85/S86 action, confirmation, status, and recovery
presentation. It preserves the deployed maintenance ticket/intake/unit contracts and may execute
after S98 in the canonical serialized queue; it has no functional dependency on renewal values,
Dotloop, or LeadSimple. S100 consumes S99's exact provider account/work-order link and cannot post or
mutate through it. S90 and S87 consume S99's final read-only status/action surfaces.

**Standalone delivery contract.**

- **Delivered:** corrected exact three-key schemas; concrete official read/write adapters;
  ticket proposal/approval/route/UI; live catalogs; claims, receipts, readback, reconciliation,
  restore/cancellation, projection, deterministic tests, closed release, bounded proof, and protected
  activation.
- **Consumes, but does not assume:** provider ids/catalogs/state, the normal-operation target/proposal,
  vacancy/priority/status/trade choices, and notification-automation evidence are fresh runtime inputs;
  the completed proof target is not.
- **Externally blocked effect:** none. Normal actions still fail closed when managed credentials,
  permission, real target/proposal, reversible transition, or no-notification evidence is unavailable;
  no substitute record, mapping, or transition is chosen.
- **Produces for downstream suites:** one canonical work-order link, exact provider status/receipt/
  recovery contracts, S100's provider identity input, and read-only S90/S87 projections.

**Verification and delivery contract.**

1. Preserve the official operation/response codecs, exact key/method/field/catalog matrix,
   one-attempt behavior, no-notification boundary, receipts, readback, reconciliation, and
   correction/cancellation tests in every affected change.
2. Keep the three exact open keys, account identity, ticket link/status projection, and all closed
   Vendor/chat/attachment/send operations aligned across code and current docs.
3. Release changes through the normal exact-SHA, zero-traffic candidate, managed assurance,
   promotion, and readback gates. Do not rerun or replace the completed work-order proof.
4. Specify any new work-order method, transition, assignment, attachment, or notification under a
   new exact contract and key; never infer it from the completed S99 proof.

**Ordered prompt sequence.**

1. Reconcile the current three-key implementation, official operation codecs, provider catalogs,
   proposal/claim lifecycle, and current production readback against this contract without rerunning
   or replacing the completed live proof.
2. Run the focused S99 endpoint/type, route, role, one-attempt, ambiguity, receipt, projection,
   correction, notification, and prohibited-reachability falsification.
3. Run the canonical verifier, exact-SHA CI, zero-traffic candidate smoke and managed assurance,
   exact promotion, observation, and live configuration/version readback for any code-bearing change.
4. Report exactly one terminal state: `ALL_GATES_GREEN` only after every applicable gate passes;
   `BUDGET_EXHAUSTED` only when an explicit execution budget is actually exhausted; or `BLOCKED` only
   for one exact unavailable external input or authority after all unrelated in-scope work is
   complete. Never choose a substitute work order, catalog value, transition, or proof target.

**Deletion/merge recommendation.**

The completion gate is satisfied. Retain this contract only while it remains the active source for
the official operation matrix and recovery boundary; durable Maintenance and integration
documentation may absorb it without reviving synthetic provider assumptions.
