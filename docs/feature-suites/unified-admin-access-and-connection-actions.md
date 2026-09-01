<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-ui-guidance-v2 -->

# S83 — Capability-guided Admin access requests and approvals

> Status: Complete and deployed. Commit `796879d6e95834a749b8f11f998ff5c76e6d0459`, exact-SHA CI
> `33533250900`, zero-traffic candidate `pmi-kc-app-rmtiwwud5-993818fec846`, normalized runtime
> parity, exact promotion, repeated canonical readback, and the 41-key/seven-open Firestore mirror
> readback passed. No role, claim, request, provider, credential, client-data, draft, or message
> effect ran during release.

**Goal.**

Let every managed staff user request the access needed for a real job from one understandable
workflow, route every valid request into an Admin-only approval queue, and apply an approved change
exactly once with verified readback, without creating a parallel permission system or weakening any
external-action boundary.

**Current state / intended end state.**

The application has three global roles and seven role capabilities. Editors receive `read`, `edit`,
and governed workflow-communications access; Approvers add approval and placeholder-resolution
authority; Admins add administration and soft-delete authority. Space claims independently control
Renewals and Maintenance reach. Firebase custom claims in the authenticated ID token are the
authority for the current request/session; Firebase Admin directory readback is the persisted latest
claim source and may be newer until the user refreshes authentication. Only an Admin
can use the existing People and Access controls to change them. A managed user cannot currently
request a missing role, capability, or Space.

The current Approval Queue is an operational, Renewals-scoped shell. Its general queue records can be
approved by some Approvers, and a generic approval transition does not change or read back Firebase
claims. It therefore cannot safely be reused as the access-request state machine. The current Admin
page also contains no requester-facing access destination, while renewal pages still need a safe
handoff when role or Space access is missing.

The intended state adds a capability-first `My access` workflow for all managed staff. Users can
select what they need to do, request any missing capability that an existing higher role can provide,
request any higher existing global role directly, or request named Space access. The server derives
the least existing role and Space change needed and shows the complete bundle before submission.
Requests appear in a specialized Admin-only `Access requests` lane in the Approval Queue shell. An
Admin can deny with a reason or exact-confirm one claim change; exact Firebase directory readback
makes the request `applied`, and only a refreshed ID-token session makes newly granted access usable.

The request workflow is never a navigational or processing dead end: no individual Admin assignment
is required, pending requests do not lock the user's current access or unrelated requests, denied or
superseded requests can be revised, and every unavailable state has a truthful recovery path. It does
not promise immediate approval or let the user use restricted access before approval.

**Actors and entry conditions.**

- A requester is an authenticated, enabled internal user in the configured managed Workspace domain.
  Editors, Approvers, and scoped Admins may request access they do not currently hold. External Vendor
  identities, personal identities, signed-out users, disabled accounts, and service identities cannot
  use the self-service workflow.
- An access reviewer is a different authenticated user with the existing `manageAdmin` capability.
  Approver authority in the operational queue does not make someone an access reviewer.
- Existing roles remain exactly `Editor`, `Approver`, and `Admin`. Existing base capabilities remain
  exactly `read`, `edit`, `sendEmail`, `approve`, `resolvePlaceholder`, `manageAdmin`, and
  `softDelete`. Existing named Space scopes and the backward-compatible missing-claim `All spaces`
  representation remain authoritative.
- A role or Space request changes no access when submitted or merely approved in the UI. Firebase
  custom-claim readback is the only proof that the approved access became effective.
- Role capability, Space access, Action Registry state, runtime suspension, provider readiness,
  quota, exact confirmation, and permanent send prohibitions remain independent conjunctive checks.
- Any managed staff user may read existing connection status. Only `manageAdmin` users may run the
  three existing live verification probes or use current connector-management controls.
- If the request store, capability catalog, Firebase Auth, or current claims cannot be read, creation
  and review fail closed with a retryable message. Cached client state is never accepted as access
  truth.

**What it is / how it functions.**

### One authoritative requestable-access catalog

Create one server-owned catalog that joins the existing global role/capability matrix to operator-
facing task labels and Space requirements. It is a request catalog, not an authorization source.
Page, API, and control enforcement continue to use the existing role, Space, and action contracts.

Every current global capability appears exactly once in the catalog:

| Capability           | Minimum existing role | Request presentation and boundary                                                                                                                        |
| -------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read`               | Editor                | `View app work`. A signed-in internal user normally already has it; an already-held capability is shown as current, not requestable.                     |
| `edit`               | Editor                | `Create and update app work`. Space access may still be required for a specific area.                                                                    |
| `sendEmail`          | Editor                | `Use governed workflow communications`. The label explicitly says this is not generic compose/send permission and never overrides an exact Gmail action. |
| `approve`            | Approver              | `Approve eligible app work`. Approval remains subject to item ownership, required-reviewer, effect, and exact-action rules.                              |
| `resolvePlaceholder` | Approver              | `Resolve verified placeholders`. It does not authorize source invention or a provider write.                                                             |
| `manageAdmin`        | Admin                 | `Manage users, access, configuration, and supported connections`. It does not open a closed action or permit client sending.                             |
| `softDelete`         | Admin                 | `Remove eligible app records through recoverable controls`. It is not destructive provider-data authority.                                               |

The minimum role is derived and exhaustively tested against the current `can(role, capability)`
contract. A catalog entry cannot name an arbitrary capability, role, route, scope, provider action,
or Action Registry key. If the role matrix changes, catalog parity fails until every added, removed,
or remapped capability receives an explicit label, impact statement, and requestability decision.

An application access-intent manifest maps every first-party user-facing guarded page and control to
its exact base capability, optional named Space, and denial classifications. This manifest drives the
request handoff and a filesystem-backed parity test; it does not replace route/API guards. A UI
denial caused only by `insufficient_role` or `missing_space` offers `Request access` with that exact
catalog item preselected. APIs retain a 403 and may return only allow-listed capability/Space metadata
for the first-party UI to render; they never create a request on denial.

The following are not role capabilities and therefore never become request targets:

- an Action Registry key, production-allowed state, runtime-suspension change, provider credential,
  quota increase, or exact-confirmation bypass;
- a permanently forbidden in-app client send;
- provider write, rollback, or approval authority that no current role can make executable by itself;
- a customer, lease, workflow, provider-record, or arbitrary route identifier; and
- a new role, new Space, raw permission string, S64 person-specific override, or service identity.

When one of those independent conditions blocks an otherwise role-eligible user, the UI shows the
existing exact readiness, retry, Admin configuration, manual provider, or Gmail handoff. It does not
offer a misleading role request.

### Unified Admin access entry and request UX

Add a stable `/admin/access` destination accessible to every authenticated internal managed user. It
contains:

- `My access`: role, inherited capabilities, and named Space access or `All spaces` that authorize
  the current authenticated session, plus truthful latest-directory comparison/refresh guidance and
  concise independent action boundaries;
- `Request access`: capability-first task choices, optional direct higher-role selection, named Space
  selection, business reason, exact server preview, and submission;
- `My requests`: that user's bounded, newest-first request history with current state, last update,
  denial/supersession reason where applicable, and current recovery action; and
- `Connections`: prominent links to the existing renewal-data, communications, and documents/storage
  groups owned by `/connections`.

The primary navigation exposes an `Admin` destination to every managed staff user. For a non-Admin it
targets `/admin/access`; for a current Admin it continues to target `/admin`, where People and Access
links to the same self-service page and the access-review lane. S84 nests this destination inside the
Admin disclosure group without changing either target. `/admin`, `/admin/users`, and all current
direct claim controls remain `manageAdmin`-only.

`My access` never conflates two claim clocks. The server derives the displayed role, capability
labels, and Space representation only from the already verified current ID-token claims; those are
the facts current page/API guards enforce. Independently, one bounded Firebase Admin user read
compares the latest directory custom claims. Its closed comparison state is `matched` when the
normalized role/Spaces equal the session, `refresh_required` when they differ, and `unavailable`
when the comparison read cannot be completed. `refresh_required` shows exact notice `Your access was
updated. Sign out and back in to use the latest access.` and the safe sign-out/re-entry control; it
does not present the newer grant as currently usable. `unavailable` preserves current-session facts,
shows `Current session access is shown. Newer access changes could not be checked.`, and offers
`Retry latest access`; it makes only the comparison partial. Invalid/unverifiable ID-token claims
make current access unavailable and render no guessed role/Space/capability.

The server-owned `AccessEffectiveProjectionV1` consumed by S90 is strict, has no other keys, and uses
this declaration order:

```text
schema_version: "access-effective-projection-v1"
role: "Editor" | "Approver" | "Admin"
space_access:
  { kind: "all_spaces" }
  | { kind: "named", labels: 1..50 distinct trimmed NFC current-registry labels,
      each 1..120 code points, in canonical Space-registry order }
capability_labels: 0..7 distinct trimmed NFC catalog labels, each 1..120 code points,
                   for exactly the keys where can(role, capability) is true,
                   in catalog order
authority_source: "current_session"
directory_sync_state: "matched" | "refresh_required" | "unavailable"
```

Unknown fields, duplicate/out-of-order labels, more than 50 current named Spaces, a label outside its
owning current registry/catalog, or any role/capability mismatch makes the projection unavailable;
it is not silently capped. The absent Space claim alone maps to `all_spaces`; a present valid claim
must resolve at least one named label. The projection contains no newer directory role/Space values,
uid/email, action-key/provider state, or request history. S90 alone adds its presentation
truncation flags/detail scope after deterministic 4-KiB compaction. Request preview/apply separately
rereads the latest directory claims as its mutation baseline, so a stale session can neither
overwrite a newer grant nor redefine current-session authority.

The page has one primary outcome, `Understand and request my access`, and four labelled task regions
in the order above. Each region loads and fails independently so a history outage cannot erase current
session access or the connection handoffs:

- a verified empty requester history says `No access requests yet.` and leaves Request access
  available;
- a verified catalog state with no access-increasing requestable option says `You already have every
role and Space available through this request workflow.` and keeps current access and Connections
  visible without a disabled Submit control;
- an unavailable current-access projection says `Your current access could not be verified.` and
  offers the existing safe authentication refresh/sign-out path, never a request based on guessed
  claims;
- an unavailable capability catalog says `Access options are unavailable.` and offers `Retry access
options` without hiding current access or own history;
- an unavailable own-history read says `Your request history is unavailable.` and offers `Retry
request history` without presenting zero; and
- an `unavailable/not_committed` submission retains the exact unexpired `attempt_id`/`preview_hash`
  plus the selected intent, named Spaces, and non-secret reason in the current page session, says
  `Your request was not submitted.`, and offers `Try again`; that control resubmits the same exact
  attempt/hash and never silently creates a fresh preview. After a transport close/timeout, a strict
  `unavailable/unknown` outcome, or any returned response that fails the strict
  `AccessRequestSubmitResponseV1`/receipt/HTTP validation following Submit dispatch, the only retained
  recovery authority is the exact `attempt_id`, `preview_hash`, and expiry in memory; the page also keeps the
  bounded normalized intent, named-Space selection, and non-secret reason solely to render the same
  reviewed choice or repopulate a later fresh preview. Those local presentation values cannot submit,
  authorize, or identify a request without a server-valid attempt/hash. The page enters
  `submission_unknown`, disables a new Submit for that intent, and may reload own history for general
  visibility. History never resolves this ambiguity because its requester-safe receipts intentionally
  expose no attempt id/hash. Show `Request status was not received.` and one deliberate `Check request
status` control that resubmits the byte-identical attempt/hash; that Submit replay is the sole
  authoritative status check and never creates a new attempt or retries automatically. An unknown
  field, malformed receipt, media/body/auth error without the strict submit union, or
  status/message/HTTP mismatch after dispatch is ambiguous under this same rule; it never becomes a
  definite no-commit result and never starts a new attempt. A
  `created`/`replayed`/`existing_request` response renders its strict receipt and clears recovery
  material; `existing_request` says that this preview created no new request. If the
  same-attempt response is `stale_preview`, the creation-attempt index has already proved no request
  committed; discard it, show `Request status could not be confirmed. Start a new preview.`, and
  restore the preserved intent/reason for fresh review. `idempotency_conflict` means the attempt
  cannot be matched safely: discard that attempt/hash, render its exact response message, preserve
  the intent/reason for explicit fresh Preview, and do not claim that no prior request exists. The
  fresh Preview must run the normalized-intent existing-request lookup before it may issue another
  attempt. An expired attempt follows the same fresh-Preview path. Closing the page loses only this recovery
  material; own history remains the durable human-readable discovery path, not an attempt matcher.

Each region has a heading; status text and icons do not rely on color. Loading text identifies the
region, submission/decision updates use one polite live region, field errors are associated with their
controls, focus moves to the first invalid field or durable receipt, and cancellation/Retry preserves
unaffected page state. S87 records this delivered surface as SF-30 and preserves S83's exact state,
copy, recovery, and task-region ownership rather than replacing it.

The `My requests` heading owns the exact server-authored fragment `my-requests`; the canonical
request-history destination is `/admin/access#my-requests`. On direct navigation the page scrolls that
region into view and moves programmatic focus to its heading after the region resolves. The URL never
contains a request id, requester identity, capability/role/Space label, reason, state, or return URL,
and it does not auto-expand a particular request. S90 uses this one owning-region destination for
request-history items and reauthorizes/reloads the signed-in user's bounded history on open.

The owning self-history service is cursor-paged in exact newest-first `updated_at`, then stable-id
descending order. One page returns at most 50 authorized records plus an opaque server cursor or
`null`; the cursor contains no readable identity/customer/reason value, is accepted only for the same
authenticated requester and ordering, and never enters the page URL. `My requests` initially reads
one page and shows `Load older requests` only when a cursor exists. That deliberate control appends
one next page, preserves prior rows on failure, and offers `Try loading older requests`; repeated or
overlapping ids are de-duplicated by stable id without changing order. A null cursor after a
successful page proves the displayed history is complete. S90 reads only the first page and consumes
the cursor-presence bit as `has_more`; it never follows cursors during one assistant query or calls a
50-row page complete when `has_more=true`.

The default request path asks `What do you need to do?`, not `Which technical permission do you
want?` Selecting a task shows the exact capability, applicable Space, minimum role, and all
additional capabilities that role would add. A separate `Request a role` option exposes every
existing role that strictly adds access over the user's current role, including Admin. Current and
lower roles are shown as current/not access-increasing and cannot be submitted through self-service;
an Admin can still make audited reductions through existing People and Access controls.

A named-Space request adds one or more current exact scopes. `All spaces` is available only as an
explicit high-impact choice, never the default, and its preview states that the wildcard also reaches
future Spaces until an Admin narrows it. A capability request scoped to an area selects only that
named Space by default. It never silently chooses `All spaces`.

The server calculates one additive access plan for the selected intent. The plan may include both a
minimum-role promotion and a named-Space addition when both are required. It never removes a
capability or Space. The preview shows:

- authenticated requester identity;
- selected task/capability, role, or Space intent;
- current role and exact current Space representation;
- exact target role and target Space representation;
- every capability and Space added by the target bundle;
- the requester's plain-English business reason;
- global impact of a role change across all Spaces the user can access;
- any independent action/provider condition that will still apply; and
- the statement that submission changes nothing until an Admin approves and exact readback succeeds.

The requester reason is one single-line plain-text value. Normalize it with Unicode NFC, trim leading/
trailing whitespace, and collapse each internal Unicode whitespace run to one ASCII space. The result
must be 10 through 500 Unicode code points and contain no C0/C1 control, bidi override/isolate, markup,
or URL scheme. Render it only as escaped text without Markdown, HTML, auto-linking, or attribute
interpolation. The field label says `Describe the staff duty that needs this access. Do not include
resident, owner, lease, credential, or other customer details.` Denial and supersession reasons use
the same normalization/rendering, with a 1-through-500-code-point bound. Invalid input is rejected
beside the field and is never persisted or logged.

The requester confirms that exact server-issued preview. A denied first-party surface may use only
this versioned `/admin/access` preselection query contract:

| Key          | Accepted value and bound                                                                                                                                                               | Canonical/default rule                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `v`          | exact literal `1`                                                                                                                                                                      | required whenever any preselection key is emitted; the plain page omits the query |
| `capability` | exactly one current catalog capability key from `read`, `edit`, `sendEmail`, `approve`, `resolvePlaceholder`, `manageAdmin`, or `softDelete`                                           | required for preselection and emitted first after `v`                             |
| `space`      | one exact current named Space id, 1 through 128 ASCII characters, accepted only when that catalog capability is Space-scoped and the actor may request that exact named Space          | optional; omitted for global capability intent and never represents `All spaces`  |
| `return_to`  | one once-decoded relative same-origin route, 1 through 32,768 UTF-8 bytes, accepted only by S83's shared first-party return registry and its destination-specific path/query validator | optional; has no fragment; emitted after `space`; never navigated automatically   |

Every key is scalar and uses `URLSearchParams` percent encoding in the fixed order above. A repeated,
unknown, empty, oversized, noncanonical, unsupported-capability/scope combination, malformed stable
id, path containing credentials/control characters/backslashes/dot segments, protocol-relative or
absolute URL, encoded traversal, unregistered query key/value, or fragment drops the complete preselection and renders the
ordinary page with exact notice `Requested access option is unavailable.` It never partially applies
a return path to a different intent. The server resolves capability and Space through the current
catalog after authentication and derives requester, current claims, minimum role, and target bundle.

S83 owns that shared return registry before any assistant work exists. Its V1 destination keys and
builders are exactly `dashboard` (`/`), `my_work` (`/work`), `approval_queue`
(`/approval-queue`), `connections` (`/connections`), `communications` (`/gmail-hub`),
`internal_processes` (`/spaces`), `maintenance` (`/maintenance`), `admin` (`/admin`),
`renewal_desk` (`/lease-renewal/live/desk`), and `renewal_workspace` (the existing canonical
`/lease-renewal/live/desk/lease/{encodedLeaseId}` helper). Only `renewal_workspace` accepts a typed
stable id; at S83 delivery every entry accepts no query or fragment. S82 later extends only the two
renewal builders with its exact v2 desk query and workspace `step`/`deskView` continuation while
retaining this outer bound and all other refusals. Every other V1 entry remains the exact path with no
dynamic segment or query. `/admin` remains useful only after its direct guard passes. S88 later imports these builders into its broader result-route registry;
S83 does not depend on S88. A future destination requires an explicit S83 registry amendment before a
denied surface may place it in `return_to`.

The access intent itself cannot name another user, select `All spaces`, select a target role, carry a
reason, displayed customer/staff value, question, provider destination, or auto-submit. `return_to`
may contain only a registry-owned opaque stable app-record id and non-customer canonical UI state;
S82 therefore removes its `q` and `lease` free-text filters before nesting a renewal route. The return
destination appears only as an explicit post-receipt link and reauthorizes when opened. The separate canonical
history handoff is exactly `/admin/access#my-requests`, has no query, and never auto-opens a record.
S88/S90/S94 later consume this contract and may emit no other access-request URL form.

When S88 imports this handoff registry, the exact coordinator destination is
`destination_key: "access.request"`, label `Request access`, and the typed query builder above. The
plain multi-handoff collapse is `destination_key: "access.home"`, label `Open Access`, and fixed
`/admin/access`. S83 owns both builders; an assistant/domain suite cannot add a query key, change the
label, or turn `access.home` into a preselected request. The general S83 `return_to` ceiling remains
32,768 UTF-8 bytes for owning first-party denied surfaces. The S88-imported variant additionally
requires the complete percent-encoded handoff href to fit S88's 2,048-byte route ceiling. On overflow
it deterministically rebuilds the same capability/Space preselection without `return_to`; if even
that form cannot validate, S88 emits no handoff. It never truncates nested state or drops a different
query key. Exact 2,048/2,049-byte assembled-href fixtures freeze this intersection.

### Durable access-request contract

The versioned normalized intent is exactly:

```text
AccessIntentV1 {
  schema_version: "access-intent-v1"
  intent_kind: "capability" | "role" | "spaces"
  catalog_version: exact current catalog version
  catalog_key: exact allow-listed capability, role, or spaces-intent key
  scope: {
    kind: "global" | "named_spaces" | "all_spaces"
    space_ids: [] | sorted unique exact Space ids
  }
}
```

`catalog_key` and scope pairing are closed:

| `intent_kind` | Exact legal `catalog_key` values                                                             | Exact legal scope                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capability`  | `read`, `edit`, `sendEmail`, `approve`, `resolvePlaceholder`, `manageAdmin`, or `softDelete` | `global` with `space_ids:[]`, or `named_spaces` with ids only when the access-intent manifest proves that exact Space requirement; never `all_spaces` |
| `role`        | exact existing role name `Editor`, `Approver`, or `Admin`                                    | `global` with `space_ids:[]` only; the target role applies over the requester's current Space scope                                                   |
| `spaces`      | `named_spaces` or `all_spaces`                                                               | key `named_spaces` requires scope `named_spaces`; key `all_spaces` requires scope `all_spaces`; neither accepts `global`                              |

A role key is requestable only when it strictly adds access over the current role; `Editor` remains
in the versioned catalog for exhaustive parity but is normally current/lower and therefore not a
valid self-service target. A capability with `named_spaces` may derive the least role promotion and
that exact Space addition in one target plan; `global` never silently adds a Space. A mismatched
kind/key/scope tuple fails strict validation before hashing or attempt creation.

`global` and `all_spaces` require an empty `space_ids` array. `named_spaces` requires 1 through the
current bounded Space-catalog maximum, removes exact duplicates, and sorts by Unicode code-point order
before preview, persistence, comparison, or hashing. `all_spaces` is a distinct scope kind; no `*`,
empty list, omitted field, or caller alias may represent it. The server rejects a scope kind that the
catalog intent does not permit. V1 `catalog_version` is the exact literal `catalog-v1`; a catalog
change requires a new literal plus migration/compatibility tests and cannot silently reinterpret a
stored V1 intent.

The server computes the idempotency identity from the UTF-8 bytes of ECMAScript `JSON.stringify` on
an object inserted in this exact key order:

```text
{
  "domain": "access-request:v1",
  "requester_uid": <exact authenticated uid>,
  "intent": <canonical AccessIntentV1 in its declared key order>
}
```

All values use standard JSON escaping, `space_ids` is already canonicalized as above, and there are
no undefined values, extra keys, or inserted whitespace. Hash those bytes with SHA-256 and encode the
raw 32-byte digest as canonical unpadded base64url. The stored identity is literal prefix
`access-intent-v1:` plus the 43-character digest. It excludes reason, current claims, timestamps, and
attempt id; it is server-only deduplication metadata, not an identifier exposed in a URL, log, metric,
notification, or authorization check.

Freeze this non-secret vector in request-service tests: requester `user-123` and canonical intent
`{"schema_version":"access-intent-v1","intent_kind":"capability","catalog_version":"catalog-v1","catalog_key":"edit","scope":{"kind":"named_spaces","space_ids":["lease-renewals","operations"]}}`
must produce exactly `access-intent-v1:Jd64GN67KBSCO6J0w60XQpWf1-MQ7G8e4eAyqY4dMbA`.

The strict preview payload is `AccessRequestPreviewV1` with exactly:

```text
schema_version: "access-request-preview-v1"
requester_uid: exact authenticated uid
requester_label: managed-directory display label, 1 through 160 code points
intent: canonical AccessIntentV1
reason: exact normalized requester reason
baseline_access: { role, scope }
target_access: { role, scope }
added_capability_keys: sorted unique current catalog keys
added_space_ids: sorted unique exact Space ids
all_spaces_added: boolean
independent_conditions_statement: "Access approval does not change action availability, provider readiness, or required human confirmation."
```

Each `role` is exactly `Editor|Approver|Admin`. Each `scope` is exactly `{ kind: "all_spaces",
space_ids: [] }` or `{ kind: "named_spaces", space_ids: <sorted unique exact Space ids> }`.
`requester_label` and catalog-rendered labels are presentation only; the key/id fields above drive
comparison. The independent-conditions statement is the exact literal above, not a variable key list
or provider-readiness claim. The UI renders every field through current catalog labels plus that
literal and the fixed no-change-until-approval statement; there is no hidden target field.

The server hashes the UTF-8 bytes of ECMAScript `JSON.stringify` over that object in the exact
declaration order, with nested intent/access objects in their declared order, standard JSON escaping,
explicit empty arrays/booleans, and no extra keys or whitespace. `preview_hash` is the lowercase
64-character SHA-256 hex digest. `attempt_id` is a server-created lowercase canonical UUID-v4 and
expiry is 15 minutes after issuance.

Every requester-safe summary uses this exact `AccessRequestReceiptV1`:

```text
schema_version: "access-request-receipt-v1"
request_ref: opaque server id, 1 through 128 ASCII characters matching ^[A-Za-z0-9_-]+$
request_version: positive safe integer
intent_kind: "capability" | "role" | "spaces"
intent_label: immutable request-time catalog label snapshot, trimmed NFC plain text, 1 through 160 code points
state: exact public access-request lifecycle state
outcome_summary: exact fixed S83 state summary
created_at: ISO timestamp
updated_at: ISO timestamp
```

The requester API seam is closed and versioned:

- `POST /api/admin/access/requests/preview` accepts only
  `Content-Type: application/json` and an `AccessRequestPreviewCommandV1` body of at most 16 KiB UTF-8:
  `{ schema_version: "access-request-preview-command-v1", intent: AccessIntentV1, reason: <the exact
normalized 10..500-code-point requester reason> }`. Those are the only keys. The server derives the
  requester, current claims, catalog, baseline, target, and delta after authentication.
- `POST /api/admin/access/requests` accepts only `Content-Type: application/json` and an
  `AccessRequestSubmitCommandV1` body of at most 4 KiB UTF-8:
  `{ schema_version: "access-request-submit-command-v1", attempt_id: <lowercase canonical UUID-v4>,
preview_hash: <64 lowercase hexadecimal characters> }`. Those are the only keys; the retained
  server attempt supplies every other value.

Both routes enforce the byte ceiling before JSON allocation, reject a missing/wrong media type with
HTTP 415, an oversized body with 413, malformed JSON or strict-schema/normalization failure with 400,
an absent session with 401, and a non-managed/disabled/ineligible requester with the current
non-enumerating 403 API shape. These transport/auth failures are not domain-union variants and create
no attempt, request, receipt, catalog mutation, claim write, or Admin queue item. Responses use strict
JSON; request bodies, reasons, hashes, attempt ids, and receipts never enter routine logs or metrics.
Preview returns HTTP 200 for either legal response variant below. Submit uses only the per-variant
statuses defined below.

The raw ref is not displayed or placed in a URL. The authenticated Preview endpoint returns exactly
one `AccessRequestPreviewResponseV1` variant:

```text
ready:
  schema_version: "access-request-preview-response-v1"
  status: "ready"
  attempt_id
  expires_at
  preview_hash
  preview: AccessRequestPreviewV1

existing request:
  schema_version: "access-request-preview-response-v1"
  status: "existing_request"
  request: AccessRequestReceiptV1
```

The `ready` variant has no request field; the `existing_request` variant has no attempt, expiry, hash,
or preview field. The submission command contains only its schema version plus that ready variant's
exact `attempt_id` and `preview_hash`; it cannot resubmit or alter intent, reason, requester, baseline,
target, delta, or independent-conditions statement.

Every authenticated, schema-valid Submit domain outcome is exactly one
`AccessRequestSubmitResponseV1` variant:

```text
created/replayed/existing request:
  schema_version: "access-request-submit-response-v1"
  status: "created" | "replayed" | "existing_request"
  message: "Access request submitted." | "This access request was already submitted." |
           "An access request already covered this request."
  request: AccessRequestReceiptV1

failure:
  schema_version: "access-request-submit-response-v1"
  status: "stale_preview" | "idempotency_conflict" | "unavailable"
  message: exact paired message below
  commit_state: "not_committed" | "unknown"
```

`created` pairs only with `Access request submitted.` and HTTP 201; `replayed` pairs only with `This
access request was already submitted.` and HTTP 200; `existing_request` pairs only with `An access
request already covered this request.` and HTTP 200. `existing_request` never claims that the
confirmed preview/reason created or byte-matches the returned active request. `stale_preview` pairs with
`commit_state:not_committed`, `Access changed before submission. Review the latest preview.`, and HTTP 409. `idempotency_conflict` pairs with `commit_state:unknown`, `This access request could not be
safely replayed. Start a new preview.`, and HTTP 409. `unavailable/not_committed` pairs with
`Access requests are temporarily unavailable.` and HTTP 503 only after the service proves the attempt
index absent and no transaction committed. `unavailable/unknown` pairs with
`Request status could not be verified. Check request status.` and HTTP 503 whenever commit/readback
cannot be proved. Failure variants contain no request or attempt fields; success variants contain no
`commit_state`. Media/body/auth/schema failures retain the application's bounded API error contract
and do not masquerade as this union. Unknown keys or a status/message/commit-state/HTTP mismatch fails
strict validation and, after Submit dispatch, enters `submission_unknown` as specified above.

After authentication and strict body validation, Submit consults the durable creation-attempt index
first using the authenticated requester plus the command's exact `attempt_id` and `preview_hash`; it
does not require the disposable preview attempt to still exist for an indexed replay. A matching index
with `resolution_kind=created` returns `replayed`; one with
`resolution_kind=existing_request` returns `existing_request`, even when the preview has since expired
or the referenced request has changed lifecycle state. A colliding requester, identity, or preview
hash returns `idempotency_conflict`.
Only when no committed index exists does the server load the retained preview attempt, reread current
claims/catalog, rebuild the strict preview from its server-retained intent/reason, and constant-time
compare the hash. A missing unindexed attempt, expiry, or any
catalog/current-claim/target/delta/reason mismatch then returns `stale_preview`, creates nothing, and
requires an explicitly reviewed fresh preview. Thus response loss after commit cannot be mistaken for
an expired uncommitted preview, and the durable request remains byte-bound to what the user confirmed
even though the separate normalized-intent identity intentionally excludes reason and current claims.

The preview store retains at most one unexpired open attempt per requester and idempotency identity;
an identical preview reuses it, while a changed preview invalidates it before issuing one replacement.
It retains at most 20 open attempts per requester across independent identities, evicting the oldest
unused preview as expired. Every attempt persists its exact server-issued `expires_at` and becomes
unusable at that instant; an expired document never counts as open and can never authorize Submit,
even when physical cleanup has not deleted it yet. Physical deletion is asynchronous housekeeping,
not an authorization boundary or V1 completion gate. A replacement Preview deletes the exact unused
attempt it invalidates; a committed Submit deletes its now-indexed preview attempt after the atomic
request/index transaction; and each Preview performs one bounded oldest-first cleanup of at most 20
expired unused attempts for that requester. Cleanup failure cannot extend validity or turn an expired
attempt into an open attempt; it returns the bounded store-degraded state only when the requested new
preview itself cannot be stored safely. V1 adds no native TTL policy, Scheduler job, or new retention
service. If an active request already exists for the identity, Preview returns that request's safe
current receipt and issues no new attempt. A created request stores exactly one
`creation_attempt_id`; a unique server index is retained under the referenced request's existing
retention policy, not as an unbounded array on the request. The strict
`AccessRequestAttemptIndexV1` contains exactly, in order: schema version
`access-request-attempt-index-v1`; canonical UUID-v4 `attempt_id`; exact requester uid; exact
`access-intent-v1:*` identity; lowercase 64-character `preview_hash`; `resolution_kind` as
`created|existing_request`; opaque request id; positive safe-integer request version at resolution;
and canonical creation timestamp. No reason, baseline/target value, label, email, or client value is
stored in the index. These retained requester/identity/hash fields are the evidence used for every
same-attempt comparison after preview expiry.

One transaction applies these rules before creating a request:

1. The creation-attempt index is read first. The same attempt id, requester, identity, and preview hash
   returns the status fixed by its `resolution_kind`: `replayed` for a created request or
   `existing_request` for a race-resolved active request, with the same request ref and its current
   safe receipt, including after preview expiry or after the request later becomes terminal.
2. An indexed attempt id with a different requester, identity, or preview hash returns a bounded
   `idempotency_conflict` refusal and creates or changes nothing.
3. Only an unindexed attempt proceeds to expiry, current-access/catalog rebuild, and preview-hash
   validation; a failed check returns `stale_preview` and creates no index or request.
4. If an active request for the same requester/normalized identity appeared after Preview, the same
   transaction creates this Submit attempt's durable index with
   `resolution_kind=existing_request`, the exact retained attempt requester/identity/preview hash,
   and a pointer to that existing request; it changes no request and returns strict
   `existing_request` with the current safe receipt. The attempt was already issued, and the response
   never claims the user's different reason/baseline/preview created or matches the active request. A
   later byte-identical Submit reads that index first and returns the same status/request, including
   after its lifecycle changes.
5. A valid fresh attempt with that identity and no active request creates one new request; therefore a
   denied, cancelled, or superseded intent can be requested again after a new preview.
6. A fresh attempt id with a different identity is independent and cannot be blocked by another
   pending intent.

For a created branch, the attempt index and new request commit atomically. For the race-existing
branch, only the attempt index commits atomically with the transaction's exact read of the existing
request; that request is not changed. A transaction failure creates neither an index nor a new
request. The safe response receipt is built from the transaction-resolved request. An
ambiguous client response is resolved only by replaying that same server-issued attempt id; it never
creates a second attempt automatically. Reordered or duplicated incoming named scopes normalize to
the same identity before these checks.

The server-only request record contains at least:

- random opaque request id and monotonically increasing version;
- requester uid and managed-directory display reference;
- the complete canonical `AccessIntentV1` tuple;
- the immutable request-time catalog label snapshot used only for requester/Admin presentation after
  a catalog rename/removal; it never substitutes for the catalog key/version in authority checks;
- normalized baseline role/Space representation and its fingerprint;
- exact derived target role/Space representation and summarized additive delta;
- requester reason;
- state, created/updated timestamps, idempotency identity, and the single creation-attempt reference;
  and
- later reviewer, decision, execution, audit, and exact-readback receipts.

Email may be displayed from the authenticated directory but is not mutable identity. Reasons and
employee/customer values never enter URLs, metrics, notification payloads, source control, or routine
logs. Clients cannot write request, decision, or receipt records directly.

The public lifecycle is:

- `pending`: durably submitted and visible to the Admin pool;
- `applying`: one exact confirmed Admin execution owns the claim attempt;
- `applied`: current Firebase readback satisfies the exact approved target;
- `denied`: an Admin declined it with a reason and no claim mutation;
- `cancelled`: the requester cancelled it while pending and no claim mutation occurred;
- `superseded`: the catalog/identity/current-claim state can no longer satisfy the original intent
  through a safe additive plan; and
- `reconciliation_required`: a claim attempt started but its exact outcome cannot be proved. It is
  never retried as though nothing happened.

For downstream assistant projection, S83 emits only one fixed requester-safe `outcome_summary` for
the current state; it never emits the requester/Admin reason, customer data, internal error, claim
delta, or reviewer identity:

| State                     | Exact `outcome_summary`                                                            |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `pending`                 | `An Admin has not reviewed this request yet.`                                      |
| `applying`                | `An Admin approved this request and access is being verified.`                     |
| `applied`                 | `This access is active. Refresh your sign-in session if it is not available yet.`  |
| `denied`                  | `An Admin denied this request. Open My access for the reason.`                     |
| `cancelled`               | `You cancelled this request.`                                                      |
| `superseded`              | `This request no longer matches current access. Open My access to review it.`      |
| `reconciliation_required` | `The access result could not be confirmed. Open My access for the current status.` |

The value is NFC plain text, 1 through 240 Unicode code points by construction and is serialized
only in the signed-in requester's S90 result. Full authorized reasons remain on `/admin/access`.

At most one active (`pending`, `applying`, or `reconciliation_required`) request exists per requester
and canonical normalized-intent tuple. Replaying an attempt id or submitting the same normalized intent
returns the existing request. A different capability, role, or Space intent may be submitted while
another is pending; pending access never locks unrelated current work or access needs.

When multiple requests overlap, approval remains deterministic. Before previewing an Admin decision,
the server re-reads current claims and recalculates the selected request's additive plan:

1. If current claims already satisfy the intent, close it as `applied` with an already-satisfied
   readback and no mutation.
2. If another safe additive change altered the baseline but the same intent remains valid, issue a
   fresh Admin preview from the current claims to the least target that still satisfies it. Do not
   overwrite the intervening change or require the requester to start over.
3. If the role/catalog/Space no longer exists, current claims are malformed, identity eligibility
   changed, or satisfying the intent would require removing access, close as `superseded` and provide
   `Review updated access` for a new request.

The requester can read only their own requests and can cancel only their own `pending` request using
an exact visible summary and version check. They cannot edit a submitted reason/intent, inspect
another user's request, decide a request, or infer another request through identifiers, counts,
timing, or status codes. A denied, cancelled, or superseded request does not impose a cooling-off
period; a corrected request may be submitted immediately.

### Admin-only Access requests lane

Add a specialized `Access requests` lane to the existing Approval Queue shell. Its canonical route is
`/approval-queue?view=access`, linked from Admin > People and Access and `/admin/access`. The lane is
backed directly by the access-request service; it does not create or mirror a generic
`approval_queue_items` record, use a generic queue approval transition, or infer access from an
operational queue status.

Authorization branches before data loading:

- the Access requests lane, count, list, detail, decision, and reconciliation APIs require
  `manageAdmin` but do not require Renewals Space;
- all existing operational, renewal-review, write-back, notification, and bulk queue lanes retain
  their current role and Renewals Space contracts; and
- a non-Admin never sees the access lane or its count, and a direct route/API request fails without
  revealing request existence.

The Approval Queue navigation remains visible to users with Renewals access as today and becomes
visible to an Admin even when that Admin lacks Renewals scope, so the Admin can reach the global
access lane. Loading that Admin-only lane must not read renewal queue data or expose renewal lanes the
Admin's Space claim does not permit.

All eligible Admins form the reviewer pool. A request never becomes `Blocked` merely because it lacks
an assignee or named required approver. The lane displays a high-contrast pending count on Admin and
Approval Queue entry points and defaults to pending requests ordered oldest first with stable request-
id ties. It supports bounded pagination and filters for requester, intent type, capability/role/Space,
state, and waiting age. Waiting age is informational; no SLA, automatic escalation, or auto-approval
interval is invented.

The queue list uses request snapshots and a bounded directory join; it does not call Firebase once per
row. Opening or refreshing one detail may re-read that exact target user. Each detail shows the
requester, reason, selected job/capability, current snapshot, derived target, access gained, request
age, and immutable activity. V1 has no claim, assignment, ownership, reservation, or assignee field or
control. Every eligible Admin reviews the same unassigned pool; the decision compare-and-set, not an
advisory assignment, resolves concurrent reviewers.

Access requests have no bulk approve/apply action. Bulk operational queue actions never include them.
An Admin can deny one request with a required plain-English reason, or request an exact apply preview.
The Admin cannot edit, broaden, narrow, substitute, or partially approve the requested target; the
safe alternatives are deny, let the requester submit a corrected intent, or use the separately
audited direct People and Access controls.

### Exact approval, claim application, and recovery

Only a different current Admin may begin an access decision. A requester cannot approve their own
request, including an Admin requesting missing Space access. Existing direct Admin user management is
a separate audited path and is not treated as approval of the request; if it independently satisfies
the intent, the next request readback closes the request as already applied.

For every review, the server re-reads the target account and enforces managed-domain, internal-
identity, enabled-account, valid-role/catalog/Space, and current Admin service safeguards. The
server-issued apply preview binds request id/version, catalog version, current-claim fingerprint,
exact complete target role/Space representation, preserved unrelated-claim fingerprint, reviewer uid,
and a single-use nonce for ten minutes.

Confirmation returns that complete server-issued object, not a boolean or reconstructed client value.
A durable compare-and-set claims `pending` to `applying` for one execution before Firebase mutation.
Concurrent or replayed confirmations return the same receipt or a stale-preview response and never
apply twice.

The apply orchestrator reuses the validation and audit rules of the existing `setAppUserRole` and
`setAppUserScopes` boundaries. When the access plan changes both role and Space, it must not call two
independent claim writers and pretend the result is atomic. It writes the complete merged custom-
claims target in one Firebase `setCustomUserClaims` attempt, preserves every unrelated claim exactly,
and records the role and/or Space delta plus request/execution identity in append-only Admin audit
before mutation. An audit failure causes no claim attempt.

After the one attempt, the service reads the exact Firebase user again rather than trusting a
constructed return value:

- exact target role/Space plus preserved unrelated claims closes `applied`;
- a known validation/audit failure before mutation releases no execution and leaves the request
  pending with a specific Admin-visible error; and
- any failure after mutation begins, timeout, missing readback, unexpected target, or changed
  unrelated claim becomes `reconciliation_required` with no blind retry or false success.

`Reconcile` is an explicit Admin-only read action for `applying` or
`reconciliation_required`. It never writes a claim. Exact target readback closes `applied`; another
safe current state stays `reconciliation_required` and links to current direct People and Access
controls. A later corrective direct change retains that path's existing guards and audit, and the
request service reads it independently; the request closes as `applied` only if current claims
satisfy the approved target, otherwise as `superseded` with a required Admin resolution reason.
Attempt history is immutable.

Every decision persists a non-secret receipt with request/execution ids and versions, actor ids,
timestamps, decision, previous/target normalized access, audit references, and readback fingerprint/
outcome. The requester sees the decision and safe next step but not internal errors or other staff
data. After `applied`, the UI states that access becomes available after authentication refresh and
offers a safe sign-out/re-entry path; it never changes the current session token in the client.

### Nonblocking and degraded behavior

“Never becomes a blocker” applies to the request workflow, not to the protected capability itself:

- a user can submit and track a valid request without knowing an Admin identity or waiting on a page;
- request creation returns one durable receipt immediately and does not hold navigation open;
- a pending request preserves every capability and Space the user already has;
- one pending intent does not prevent a different access need from being submitted;
- stale overlapping requests are recalculated or satisfied rather than blindly rejected;
- denial, cancellation, and supersession always provide a fresh-request path;
- all Admins see the same unassigned pending pool and pending count; and
- unavailable storage/Auth/queue state clearly distinguishes a submission that never committed from
  an existing durable request, preserves committed evidence, and shows retry/support guidance without
  fabricating success or granting temporary local access.

If no different enabled Admin is currently eligible to review a request, submission may still
persist, but both requester and Admin health views show `Admin review is unavailable` without listing
Admin identities. The existing managed break-glass role path remains the recovery for a zero-Admin
state. The product does not auto-grant, invent a substitute reviewer, promise a response time, or send
an external notification without a separately approved policy.

### Connection navigation and check behavior

The Admin access surface reuses S81's task-navigation manifest. Its accent actions are links labelled
`Review renewal data connections`, `Review messaging connections`, and `Review document and storage
connections`, targeting the existing task anchors. A navigation link never displays fake progress or
calls a connector.

On Connections, only RentVine, Google Sheets, and RentCast expose an Admin-only read-check control,
using the existing live-verifier allowlist:

- idle: an accent/PMI-orange `Check <connector> connection` button;
- pending: the same disabled control with a visible spinner, `Checking <connector>…` text,
  `aria-busy="true"`, and a polite live-region update;
- passed: refresh the shared source-backed card and show `Verified` with text plus the existing
  verified semantic treatment;
- did not pass: refresh shared state and show a caution/error message with the existing safe next
  step; and
- transport/timeout failure: show `The check could not run` and permit an explicit later retry.

There is no fabricated percentage or green progress bar because the probes expose no measurable
progress. Orange communicates the pending action; green communicates only verified success. Gmail and
other unsupported connectors show honest stored/readiness status and setup handoff but no `Check`
control, group-level probe, or synthetic success.

All access and connection controls consume S85 semantic tokens and S86 action/busy/notice
primitives. Text/control contrast, visible focus,
status labels independent of color, 44-by-44 CSS-pixel targets, disabled semantics, screen-reader
announcements, 320 CSS-pixel layout, 200-percent zoom, and reduced-motion behavior meet the current
accessibility contract. Pending counts and status changes use concise polite announcements and never
move focus unexpectedly.

### Compatibility, rollout, and rollback

There is no migration of current users, roles, capabilities, Space claims, queue items, action keys,
connection records, or renewal evidence. The request store starts empty; Firebase claims remain the
only effective access source. The specialized access lane reuses the Approval Queue shell but not the
generic item schema or transition service, so current queue behavior and historical items retain their
meaning.

Roll out in this order:

1. capability/catalog parity, request store/service, and requester own-history permissions;
2. Admin access lane, exact apply/readback/reconciliation, pending counts, and degraded-state health;
3. `/admin/access` navigation and direct People and Access links; then
4. capability/Space request handoffs on denied first-party surfaces.

Do not expose a request button until its request can be read by the Admin pool and safely denied or
applied. Renewal authority leaves renewal surfaces only after the access destination is reachable.
Current direct Admin role/scope management remains available throughout rollout and rollback. Rolling
back UI leaves immutable request/audit receipts intact and does not apply, delete, reopen, or
reinterpret them. No purge job or retention interval is introduced; evidence remains durable until a
separately authorized retention policy governs it.

**In scope / out of scope.**

In scope: exhaustive existing-capability catalog; user-facing access-intent inventory; managed-user
Admin entry; capability-first, higher-role, named-Space, and explicit `All spaces` requests; combined
least-access preview; requester history/cancellation; specialized Admin queue lane and pending count;
Admin deny/exact apply; one-attempt merged claim write; audit/readback/reconciliation; overlapping-
request behavior; route/control handoffs; renewal-authority relocation; connection-group actions;
supported check pending UI; accessibility; privacy; and fail-closed degraded states.

Out of scope: new roles, capabilities, Spaces, or hierarchy; S64 per-person capability overrides;
temporary grants, delegation, expiry, or just-in-time access; self-service reductions; account
creation/invitation/password reset; Vendor access; generic queue item mirroring; bulk access approval;
automatic approval/escalation; response-time policy; email/Chat notification; Action Registry or
runtime-suspension changes; provider credential setup; new connector probes; client send; source
write; or redesign of unrelated Admin and approval lanes.

**Open questions & assumptions.**

No material product question remains open. The phrase `all capabilities should be requestable` is
interpreted through the user's previously selected recommendation and current architecture: every
existing base capability is visible, and every missing capability that a higher existing role can
provide can be requested by intent. Approval assigns the least existing global role plus necessary
Space access; it does not authorize S64 or grant one capability independently. A role promotion is
global across the user's accessible Spaces, and the preview makes that bundle explicit.

`Never be a blocker` means the request path cannot dead-end, disappear, require a named Admin, lock
other work, or falsely lose a valid request. It does not mean restricted work is available before
approval, that Admin review is guaranteed by a deadline, or that safety checks may be bypassed. The
`admin approval queue` is the specialized Admin-only access lane in the existing Approval Queue shell,
backed by its own request/apply lifecycle because the generic Renewals queue cannot safely mutate
Firebase claims.

**Cross-product impacts.**

Global role/capability catalog; role and Space claim parsing; AppShell navigation; first-party guarded
page/control denial UX; `/admin/access`, `/admin`, and `/admin/users`; Approval Queue shell and route
branching; current Admin user services and audit stores; Firebase Admin custom claims; new server-only
access-request records; S80 authority projection; S81 task manifest; S82 renewal handoffs; Connections
verification UI; session-refresh messaging; security, PII, accessibility, performance, and responsive
gates. No provider effect owns request state.

**Authority and evidence map.**

| Input                                                                                    | Classification            | Use and limitation                                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, action registry, and `docs/facts.md`                                        | Authority / present truth | Managed identities, exact-key separation, protected-path handling, Live-only behavior, closed writes, and client-send boundaries remain unchanged.                            |
| `lib/auth/roles.ts`, session/Space guards, Admin user services, and current audit stores | Implementation truth      | Supply the exact roles, seven base capabilities, Space semantics, and claim mutation safeguards. The request catalog cannot become authority.                                 |
| S80 plus the current renewal governance matrix                                           | Implementation truth      | Prove role/Space and action/provider conditions are separate. Only role/Space denial produces a request handoff.                                                              |
| Current Approval Queue shell, permissions, and specialized sub-views                     | Implementation truth      | Supply UI/navigation patterns. Access requests need a separate Admin-only data and transition boundary because generic approvals are Renewals-scoped and do not apply claims. |
| S81 and current Connections verifier                                                     | Implementation truth      | Supply task destinations, all-role status visibility, Admin-only management, and exactly three supported live probes.                                                         |
| Current feature note and prior role-model clarification                                  | Intent evidence           | Require requestable access across the app, stable end-to-end Admin approval/denial, and the existing role/Space recommendation rather than granular per-user overrides.       |
| New capability, role, Space, action activation, SLA, or notification policy              | External/adjacent input   | Absent by default. It requires its own accepted contract and cannot be inferred or block the current role/Space request implementation.                                       |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S83-1** — One exhaustive request catalog and first-party access-intent inventory map every
  current base capability and guarded UI handoff to exact existing role/Space requirements. Parity
  tests fail on unknown, omitted, stale, or action-key-derived entries.
- **ARCH-S83-2** — One server-only access-request service owns normalized additive plans, actor-
  filtered reads, lifecycle/version transitions, overlap/idempotency, and append-only receipts.
  Clients cannot write records or cross requester/Admin boundaries.
- **ARCH-S83-3** — One exact apply orchestrator binds current claims, request/catalog versions,
  reviewer, target, unrelated claims, nonce, audit, single Firebase attempt, exact readback, and
  reconciliation. A combined role/Space plan is one merged claim write, not two falsely atomic calls.
- **ARCH-S83-4** — One specialized Admin-only Access requests lane consumes the request service while
  existing queue lanes retain their present schemas, data, bulk actions, Approver rules, and Renewals
  scope. Route tests prove no cross-lane read or transition.
- **ARCH-S83-5** — All role/Space denials and request previews share one allow-listed handoff contract;
  every action/provider/permanent denial keeps its original recovery and cannot be recast as access.
- **ARCH-S83-6** — Connection actions consume the S81 manifest and existing verifier allowlist.
  Navigation performs no probe; a supported probe performs exactly one bounded read and no write or
  authority change.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S83-1** — Any managed staff role can find My access, see inherited capabilities and Spaces,
  request any missing capability satisfiable by an existing higher role, request a higher role or
  Space directly, preview the complete least-access bundle, and track/cancel its own request.
- **BEH-S83-2** — A missing-role or missing-Space first-party UI denial offers the exact preselected
  request path. Closed actions, suspensions, quotas, unavailable providers, exact confirmation, and
  permanent sends never offer a misleading request.
- **BEH-S83-3** — Every valid request appears immediately in the shared Admin pool without requiring
  assignment. Pending requests preserve current work, do not block other intents, and remain
  discoverable through Admin/queue counts and oldest-first review.
- **BEH-S83-4** — A different Admin can deny with a reason or exact-confirm one additive claim plan.
  Drift, overlap, concurrency, replay, audit failure, mutation uncertainty, and readback mismatch
  preserve one durable truthful state and never apply twice or overwrite unrelated claims.
- **BEH-S83-5** — A request is presented as applied only after exact Firebase directory readback;
  current usable access always comes from session claims, with an exact mismatch/refresh state until
  authentication refresh. Approval never changes an action key, provider/config state, renewal evidence, or
  communication boundary.
- **BEH-S83-6** — Renewal authority is absent from renewal desk/workspace; People and Access shows each
  user's individual role, inherited capabilities, Spaces, and derived renewal authority; existing
  direct Admin controls remain protected and available.
- **BEH-S83-7** — Accent connection-group actions navigate to exact anchors. Only the three supported
  checks show honest accessible pending/pass/fail states, with green reserved for verified success.

**Human litmus outcome.**

### Request a missing capability from the work surface

**If this was built correctly:** An Editor encounters an Approver-only control, selects `Request
access`, sees that the request would promote them to Approver across their current Spaces and add the
needed Space if missing, submits a reason, and continues other work while the request appears in
their history.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Review and apply access from the Admin queue

**If this was built correctly:** An Admin opens the Access requests lane without needing Renewals
scope or a personal assignment, sees the oldest pending request and full bundle impact, denies with a
reason or confirms once, and sees exact applied readback or a clear reconciliation state.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Recover without losing or bypassing access truth

**If this was built correctly:** A duplicate, overlapping approval, stale preview, queue outage,
denial, or claim timeout never loses the request, grants local temporary access, or traps the user;
the UI shows the existing request, refreshed plan, retry, new-request, or reconciliation action.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Check a renewal connection

**If this was built correctly:** An Admin follows the renewal-data action, checks a supported
connector, sees a spinner while it runs and a labelled verified/failure result afterward; an
unsupported messaging connector never pretends to run a check.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                         | Architecture outcome       | Behavior outcome                      | Human litmus                                   | Deterministic evidence / falsification                                                                                                                                                                                         |
| --------------------------------------------------- | -------------------------- | ------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Every existing capability is understood/requestable | `ARCH-S83-1`, `ARCH-S83-5` | `BEH-S83-1`, `BEH-S83-2`              | Request a missing capability                   | Role/capability/catalog and guarded-surface inventories cover every enum/control, derive least roles, disclose bundled gains, and reject unknown strings, action keys, closed effects, and no-ops.                             |
| One easy self-service role/Space workflow           | `ARCH-S83-1`, `ARCH-S83-2` | `BEH-S83-1`, `BEH-S83-3`              | Request a missing capability                   | Role × Space × intent tests cover capability-first, higher-role, named-Space, explicit wildcard, combined plan, exact preview, safe return, own history, cancellation, duplicate, and independent pending intents.             |
| Requests bubble to an Admin approval queue          | `ARCH-S83-2`, `ARCH-S83-4` | `BEH-S83-3`, `BEH-S83-4`              | Review and apply access from the Admin queue   | Route/list/count tests prove every valid request is immediately visible to all and only Admins, no assignee is required, scoped Admin works, renewal reads are skipped, stable ordering/pagination hold, and no mirror drifts. |
| Exact approval, application, and recovery           | `ARCH-S83-2`, `ARCH-S83-3` | `BEH-S83-4`, `BEH-S83-5`              | Review and apply; Recover without losing truth | State/property and fake-Firebase tests cover deny, already-satisfied, safe drift, incompatible drift, two reviewers, replay, audit failure, one mutation, timeout, mismatched/unrelated-claim readback, and reconcile.         |
| Request workflow never creates a dead end           | `ARCH-S83-2`, `ARCH-S83-4` | `BEH-S83-1`, `BEH-S83-3`, `BEH-S83-5` | Recover without losing or bypassing truth      | Degraded-state and overlap matrices prove immediate durable receipts, continued current access, independent intents, no cooling-off, pool review, honest no-reviewer/queue errors, and no temporary/automatic grants.          |
| Renewal authority relocation and direct controls    | `ARCH-S83-1`, `ARCH-S83-5` | `BEH-S83-2`, `BEH-S83-6`              | Request a missing capability                   | DOM/direct-route tests assert no renewal authority panel, one per-user Admin projection, capability/Space-specific handoff, and preserved Admin-only direct management.                                                        |
| Honest connection navigation/check states           | `ARCH-S83-6`               | `BEH-S83-7`                           | Check a renewal connection                     | Manifest/component/API tests prove group links cause no probes, supported checks cause one read, unsupported ids refuse, and spinner/text/result semantics are exact.                                                          |
| No implicit external or client effect               | `ARCH-S83-3`, `ARCH-S83-6` | `BEH-S83-2`, `BEH-S83-5`, `BEH-S83-7` | All litmus entries                             | Registry snapshots and action/provider/store spies prove request/review/navigation/check paths create no draft/send, source write, action-key/suspension mutation, provider permission, or renewal completion.                 |

**Preservation set.**

Managed-domain and Vendor isolation; exact Editor/Approver/Admin parsing; seven-capability hierarchy;
missing-scope `All spaces` compatibility; Renewals/Maintenance isolation; last-Admin and direct Admin
guards; append-only audit-before-mutation; unrelated custom claims; S80 page/API/control/action
parity; generic Approval Queue schema, Approver behavior, bulk actions, and renewal scoping; S81 task
anchors and all-role status; three bounded health probes; unsupported connector refusal; Live-only
environment; draft-only communication; closed source writes; session refresh; secrets/PII scans; and
responsive/accessibility gates remain green separately.

**Adversarial acceptance checks.**

- **AC-S83-1** — `ARCH-S83-1/5` fail on an omitted/unknown capability, stale minimum role, invented
  role/Space, unclassified guarded UI, role request offered for an action-key/provider/quota/
  suspension/confirmation/permanent denial, or an unsafe absolute return target.
- **AC-S83-2** — `ARCH-S83-2` rejects caller-supplied uid/email/current claims/target bundle, no-op or
  subtractive plans, combined arbitrary inputs, malformed `All spaces`, another user's request,
  Vendor/disabled/personal/service identities, and direct client record writes. Exact route tests
  freeze both requester POST paths, strict command keys, 16/4-KiB limits, media/auth/schema HTTP
  failures, and zero attempt/request creation on every pre-domain refusal.
- **AC-S83-3** — `BEH-S83-1/3` proves duplicate idempotency, independent simultaneous intents,
  reordered/deduplicated named scopes, explicit all-spaces encoding, bounded text-only reason
  normalization/rendering, exact `catalog-v1` kind/key/scope pairings, fixed independent-condition
  statement, replay-before-expiry status recovery, cancellation, denial with immediate corrected resubmission, already-
  satisfied overlap, safe plan refresh, incompatible supersession, stable count/order/pagination,
  and continued existing access. Response-loss fixtures commit before returning transport close,
  malformed JSON, unknown union field, malformed receipt, media/auth envelope, and every
  status/message/HTTP mismatch; each preserves the same attempt/hash, enters `submission_unknown`,
  and converges only through byte-identical Submit replay without a second attempt/request. A
  Preview-to-Submit race with an active same-identity/different-reason request returns only strict
  `existing_request`; its exact attempt index is atomically retained, a byte-identical replay returns
  the same status/current receipt, and neither response claims preview equivalence or creates a new
  request.
- **AC-S83-4** — `ARCH-S83-4` proves only Admins can list/count/open/deny/apply/reconcile access
  requests; the schema and UI contain no claim/assignment field or transition; Approvers and
  requesters cannot decide; an Admin without Renewals can use only the access lane; access items
  cannot enter generic/bulk transitions; renewal data is not loaded for that lane.
- **AC-S83-5** — `ARCH-S83-3` rejects expired/altered/replayed previews, same-user review, stale
  fingerprints, two reviewers, sequential role/Space writers for one plan, audit failure, multiple
  Firebase attempts, timeout, missing/mismatched readback, or changed unrelated claims as `applied`.
- **AC-S83-6** — `BEH-S83-5/6` proves an applied request changes only the exact role/Space target,
  preserves unrelated claims and other users, requires authentication refresh, derives renewal
  authority through S80, and leaves every action key, suspension, provider state, and client effect
  unchanged. Exact `AccessEffectiveProjectionV1` schema/order/cardinality tests cover matched,
  refresh-required, comparison-unavailable, malformed session claims, absent all-Spaces claims, and
  named scopes; every displayed access value comes from the one current session and newer directory
  values never masquerade as usable authority.
- **AC-S83-7** — `ARCH-S83-6` rejects group verification, unsupported connector probes, caller-
  selected implementations, multiple probe calls, provider writes, fake percentages, and green
  pending/failure states.
- **AC-S83-8** — `BEH-S83-1/3/7` pass keyboard, focus, live-region, disabled/non-color status,
  44-pixel target, AA contrast, reduced-motion, 200-percent zoom, and 320-pixel viewport checks. Exact
  page-state fixtures distinguish empty own history, no access-increasing option, unavailable current
  access/catalog/history, definite no-commit, ambiguous submit, and durable request; each leaves the
  unaffected task regions usable and renders only its declared recovery.

**Forbidden actions / hard gates.**

No self-grant, self-approval, automatic/temporary grant, generic Approver access decision, granular
S64 override, new role/capability/Space/action key, role/category-to-action inference, arbitrary or
subtractive self-service target, bulk access apply, generic queue mirror, silent claim overwrite,
sequential combined-plan mutation, blind retry, unverified success, guessed identity,
personal/Vendor authority, provider write, autonomous/in-app client send, notification or SLA
invention, secret/customer value in a reason/log/URL/test, secret in any request record, or fake
connector probe/progress. Authenticated requester/reviewer identity and the exact role/Space plan are
the only employee/access values intentionally stored in the governed request/audit record. Do not
change or push protected auth, Firestore Rules, action-gate/registry, budget, or guardrail paths
without the exact owner direction required by `AGENTS.md`; surface any genuinely required protected
edit as a separate reviewable dependency.

**Dependencies / sequencing.**

S83 consumes the current global role/capability and Space contracts, S80 as role/effect truth, S81 as
connection truth, the existing Admin user services/audits as validation patterns, and the Approval
Queue shell as presentation only. S85/S86 supply presentation and feedback without changing this
suite's access or connection truth. Implement S83 before S82 in the complete UI/UX bundle so renewal
denials have a live capability/Space handoff before authority panels are removed.

Catalog/request storage and self-history can be implemented independently of claim execution. The
Admin lane and exact apply/reconcile boundary must be green before request buttons are exposed
outside `/admin/access`. No new provider credential, action activation, S64 authority, email policy,
or response-time policy is required.

**Standalone delivery contract.**

- **Deliverable now:** exhaustive catalog/inventory, managed-user access page, additive request state
  machine, Admin queue lane/count, exact one-attempt claim apply/readback/reconciliation, direct
  handoffs, current-role/Space preservation, connection actions, supported probe pending UI, and all
  refusal/security/accessibility paths can reach `ALL_GATES_GREEN` with current Firebase and app
  infrastructure.
- **Consumes, but does not assume:** S82 may supply a lease-specific capability/Space/return handoff.
  Without it, `/admin/access` still supports direct requests and renewal routes retain current guards.
- **Externally blocked effect:** none. An unavailable request store, Firebase session, or eligible
  reviewer is an honest fail-closed runtime state, not permission to substitute local authority.
- **Produces for downstream suites:** one requestable-access catalog, access-intent handoff, Admin
  request queue, exact apply/reconciliation contract, and truthful navigation-versus-check contract.

**Verification and delivery contract.**

1. Before implementation edits, inventory the exact seven capabilities, role supersets, every Space-
   guarded/user-facing denial, current Admin direct mutations/audits, Approval Queue lane guards and
   loader reads, renewal-authority DOM, connection probes/UI, registry snapshot, and provider/store
   call counts. Add fail-first parity/request/queue/readback tests that fail only because S83 is absent.
2. Run focused catalog/inventory, access service/store, role/scope, route/API/control, Approval Queue,
   Admin roster, AppShell, renewal surface, connection, UI primitive, accessibility, PII, and security
   tests across the full actor × intent × Space × state × failure tables.
3. Rehearse exact apply with injected Firebase/store adapters: role only, Space only, combined plan,
   already satisfied, safe/incompatible drift, overlapping requests, two reviewers, replay, audit
   failure, mutation failure/timeout, unrelated-claim drift, mismatched readback, and reconciliation.
   No test may use or change a live user claim.
4. Run `bash scripts/verify.sh`, inspect the mechanical diff and protected-path subset, and audit
   secrets/PII, roles/capabilities/Spaces, action registry/suspensions, runtime configuration, queue
   cross-lane reads, Firebase/provider call counts, and requirement traceability before authorized
   delivery.
5. Report `ALL_GATES_GREEN` only when catalog parity, request UX, queue visibility, exact apply,
   recovery, connection UX, accessibility, and all preservation gates pass. `BLOCKED` names only an
   exact protected-path or unavailable infrastructure issue after every independent fail-closed path
   is complete.
6. Report one implementation terminal state: `ALL_GATES_GREEN`; `BUDGET_EXHAUSTED` only if a future
   user supplies an explicit budget; or `BLOCKED` only for one exact unavailable input/authority after
   every independent fail-closed path is complete. Human approval availability is a runtime state,
   not a reason to invent a reviewer or a different terminal name.

**Ordered prompt sequence.**

1. Re-verify roles/capabilities/Spaces, guarded UI denials, direct Admin claim/audit behavior,
   Approval Queue scope/load boundaries, connection manifest/probes, and renewal-authority usages.
2. Freeze preservation and materialize fail-first catalog/inventory, request permission/state,
   specialized queue, exact combined apply, reconciliation, navigation/check, and accessibility tests.
3. Build the server-only catalog/request boundary and requester surfaces; add the Admin lane without
   changing generic queue semantics.
4. Compose one exact merged claim attempt with current Admin validation/audit/readback; wire safe
   capability/Space handoffs and connection states only after Admin review is reachable.
5. Falsify every actor/intent/overlap/concurrency/failure case, run focused and canonical gates, and
   ship only through the authorized release path.

**Deletion/merge recommendation.**

Remove after the capability-guided request workflow, Admin access lane, exact claim lifecycle, and
connection action contract are deployed; all four human litmus entries pass; S82 consumes the
handoff; and durable product/security tests plus current documentation own every remaining rule.
