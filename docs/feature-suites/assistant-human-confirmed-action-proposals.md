<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: dashboard-assistant-v1 -->

# S94 — Assistant human-confirmed action proposals

> Status: Specified and not implemented. Current My Work can create verified linked tasks, but its
> public schema accepts a caller idempotency key and an existing-key replay does not compare the
> original payload; current Ask can implicitly start a selected process and its `Capture Task` control
> creates a KB placeholder, while no assistant action-token, review, or confirmation boundary exists.

**Goal.**

Let a managed user turn one exact, current lease-renewal assistant result into one self-assigned My
Work task only after a separate review and confirmation, while every query, result link, access or
approval handoff, model response, and local-rehearsal path remains non-mutating.

**Current state / intended end state.**

The current My Work create route authenticates an actor, requires `edit`, resolves the source through
the Work source resolver, enforces Space access and non-Admin self-assignment, writes a deterministic
task plus `created` activity transactionally, and returns the task. `CreateTaskSchema` nevertheless
accepts `idempotency_key` from the browser. The store derives the task id from actor plus that value;
when the id already exists it returns the readable task without proving that source and input match.
That is the present replay-collision gap, not a trusted assistant execution identity.

The renewal Work source type `renewal_lease`, its canonical `lease-renewals` Space, source resolver,
source version, task record, activity record, cancellation transition, canonical source link, and
12-month Work retention policy already exist. Current Ask does not use that path: `Capture Task`
creates a knowledge-gap placeholder, and submitting Ask with a selected process can start a workflow
run. S83 access requests and the new Dashboard assistant are specified but not implemented. There is
no generic approval-request writer, and current config has neither required
`ASSISTANT_ACTION_TOKEN_KEY` nor the distinct required `ASSISTANT_ACTION_IDEMPOTENCY_KEY`; the
optional `ASSISTANT_ACTION_TOKEN_PREVIOUS_KEY` rotation slot is also absent.

The intended state keeps S88-S93 query and narration read-only. After one completed answer, a
server-only S94 projector may issue at most 20 short-lived, opaque candidates for individually
eligible S91 renewal rows. Selecting `Create my task` performs a current source and authority read,
returns an exact preview plus a sealed confirmation, and persists nothing. Only the later explicit
confirmation calls the existing My Work owner with a server-derived idempotency identity, then reads
back the exact task and activity. No S94 proposal or transcript store is introduced. Process-run
starts stay on their owning Process surfaces until a later specification defines an exact process
query/mapping and correction contract.

**Actors and entry conditions.**

- The actor is a current managed user whom the existing My Work create service authorizes for
  `edit`, self-assignment, `lease-renewals`, and the exact `renewal_lease` source. The server derives
  identity, role, Space claims, environment, and source authority on Review and Confirm; the client
  supplies none of them.
- The starting assistant result is S88 `answered`. Aggregate coverage may be partial only when the
  specific S91 row still has a complete, current, verified identity/version binding and the missing
  or truncated material cannot change this task's source or eligibility. An unresolved, stale,
  unverified, denied, unavailable, or truncated-away row has no executable candidate.
- The candidate requires an exact S91 `renewal_lease` item. Existing S90 Work rows open their current
  task or source; they never offer duplicate task creation. Approval decisions, submitted requests,
  access denials, and knowledge results use the handoff rules below and never enter S94 confirmation.
- Review requires the candidate to be authentic, unexpired, bound to the current actor/environment,
  and backed by a currently readable source. Confirm additionally requires an authentic unexpired
  confirmation, exact preview hash, unchanged authority/source version/fingerprint, and a
  persistence-allowed environment.
- Production remains Live-only. Demo + Live-read-only/local rehearsal may exercise token, preview,
  refusal, and injected-store tests, but Confirm returns `environment_read_only` before constructing
  a persistent Work store. No rehearsal path writes a proposal, task, activity, provider, or source.

**What it is / how it functions.**

### Closed V1 action and handoff catalog

S94 has one executable V1 kind:

| Kind                  | Eligible source                        | Exact consequence                                                                                                       |
| --------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `create_my_work_task` | One current verified S91 renewal lease | Create one self-assigned app-owned My Work task; it does not change the lease, run a process, or call a provider write. |

One server-owned manifest freezes the kind, accepted S91 item kind, required capability and Space,
source resolver, editable input schema, exact derived fields, preview projector, token purposes,
Work executor, readback comparator, receipt projector, and recovery routes. Unknown kinds, source
types, runtime registrations, client/model kinds, or prose-derived actions fail closed.

The following are not S94 executable kinds and never call its Review or Confirm APIs:

- an S90 Work result activates its existing task or canonical source route;
- `approval.needs_my_decision` opens the owning approval detail, where current guards and controls
  remain authoritative;
- a submitted access/domain request opens its existing requester-visible detail;
- a requestable missing-role/missing-Space result may activate S83's bounded `Request access`
  handoff, after which S83 alone rereads claims, previews, confirms, queues, applies, receipts, and
  reconciles the request;
- another domain may expose `Request approval` only by registering an existing typed owning
  request/preview route; absent that registration, show `Approval request is not available for this
item` and the record's safe route; and
- knowledge, unsupported, clarification, non-requestable denial, and unavailable results expose no
  action. A requestable S83 denial may expose only the inert access handoff above.

These are deliberate navigation handoffs, not proposal records. They create no S94 token or durable
state, never auto-submit, and never call `createApprovalQueueItem`, an S83 writer, a queue decision,
or a claim mutation.

All S94-owned navigation uses a strict `AssistantActionRouteRefV1`, separate from S88's result-local
route registry:

```text
schema_version: "assistant-action-route-ref-v1"
ref_id: owning-payload-local id, 1 through 128 ASCII characters matching ^[A-Za-z0-9_-]+$
destination_key: "my_work" | "my_work_task" | "renewal_workspace"
label: server-authored accessible label, trimmed NFC plain text, 1 through 160 Unicode code points
href: normalized same-origin application path, at most 2,048 UTF-8 bytes
open_in_new_tab: true
```

The key/label/builder registry is exact:

| `destination_key`   | Exact `label`        | Exact builder                                                              |
| ------------------- | -------------------- | -------------------------------------------------------------------------- |
| `my_work`           | `Open My Work`       | fixed `/work`                                                              |
| `my_work_task`      | `Open My Work task`  | existing S88-approved canonical Work task-anchor builder                   |
| `renewal_workspace` | `Open lease renewal` | existing S88-approved canonical authorized renewal-lease workspace builder |

The same normalization, stable-id inputs, fragment ownership, label bounds, and injection refusals
as S88's destination registry apply. Any altered key/label/builder combination fails the payload.
A ref is unique within its owning terminal projection, Review
response, or Confirm response; is valid only for presentation of that payload; is never accepted by a
later request; and is never copied from the originating query result. Unknown destinations, unused
duplicate refs, client/model values, or a route that cannot be built from the current authorized
binding/readback fail that payload before serialization.

### Terminal action projection and fixed bound

After S88 has produced the canonical result and before S93 emits terminal, the S94 projector inspects
only registered server-side producer bindings. S91 supplies one private binding beside each eligible
adapter item while its current authorized row is in memory. S88 validates the public/private pair,
creates the query-local item ref, stamps that ref into the exact
`AssistantRenewalActionBindingV1`, and passes only that private type to the registered S94 projector.
It contains `source_type: renewal_lease`, opaque source id, stable action source version,
`space_id: lease-renewals`, and S91's exact allow-listed preview fingerprint input. S88 strips it
before observer/model/result
serialization, and never persists it. S94 does not reverse-resolve `item_ref`, read a query registry,
or derive a source from narration/route text.

The current Work renewal resolver version includes the read observation time and is therefore not a
stable action identity. S94/S91 must not reuse it. Add
`RenewalLeaseActionSourceV1.action_source_version` as literal prefix `renewal-term-v1:` plus base64url
SHA-256 without padding over the UTF-8 bytes of ECMAScript `JSON.stringify` on an object inserted in
the exact key order `{ "lease_id": <exact canonical RentVine lease id>, "end_date": <YYYY-MM-DD> }`.
Both values are JSON strings under standard JSON escaping; the object has no other keys or inserted
whitespace. The end date is lease data from the RentVine source of truth; read time, current status,
progress, blocker, label, Sheet state, actor, and model text are excluded. A changed lease term
creates a new version; merely rereading the same term does not. If either exact field is absent/
conflicted or source currency is insufficient, no candidate is eligible.

Separately, S94 combines the binding's action version with S91's exact
`preview_fingerprint_input`: source label, renewal date, declared overall-status or current-stage
projection, and blocker/next-action facts shown in Review. Review computes its fingerprint after
reread and Confirm recomputes it; a change forces
fresh Review without changing the stable one-task identity.

The preview fingerprint is lowercase 64-character SHA-256 hex over the UTF-8 bytes of ECMAScript
`JSON.stringify` applied directly to the strict S91 `preview_fingerprint_input` object in its
declared key order: `schema_version`, `source_label`, `renewal_date_iso`, `stage_id`, `status_key`,
`status_label`, `blocker_coverage`, `blocker_count`, `blocker_labels`, `blockers_truncated`, then
`next_action_label`. Nulls are explicit JSON null, `blocker_labels` preserves its canonical array
order, strings use standard JSON escaping, and there are no undefined values, other keys, or
inserted whitespace. Projector, Review, and Confirm share this serializer or pass the same golden
fixtures byte-for-byte.

The projector retains canonical group/item order, evaluates at most the first 20 eligible source
bindings, and returns exactly one `AssistantActionProjectionV1` in terminal:

```text
schema_version: "assistant-action-projection-v1"
state: "complete" | "partial" | "unavailable" | "not_applicable"
entries: 0 through 20 ordered AssistantActionEntryV1 records
notices: 0 through 4 server-authored allow-listed notices
```

`not_applicable` is valid only as the exact object with `entries: []` and `notices: []`. Any entry,
notice, sibling field, string literal, null, or omitted projection in that state fails closed before
terminal assembly. `complete` has one or more entries, except that zero entries is legal only with
exactly one `multiple_existing` notice and its generic My Work route. `partial` has the exact partial
notice and zero or more entries; zero entries is legal only when the same projection also has exactly
one `multiple_existing` notice. `unavailable` has zero entries plus exactly one unavailable notice.
Each notice code appears at most once; `unavailable` is exclusive, while a partial projection orders
`partial` before `multiple_existing` when both are present.

Every notice is one strict `AssistantActionNoticeV1`:

```text
schema_version: "assistant-action-notice-v1"
code: "assistant_action.unavailable" | "assistant_action.partial" |
      "assistant_action.multiple_existing"
message: exact server-authored message paired below
route_ref: null | one validated AssistantActionRouteRefV1
```

`unavailable` pairs only with `Task actions are temporarily unavailable` and null route;
`partial` pairs only with `Actions are available for the first 20 eligible results. Refine your
question to review others.` and null route; `multiple_existing` pairs only with `Multiple tasks
already reference this renewal. Open My Work to continue.` and the generic `/work` route. An unknown
code, message mismatch, wrong nullability, arbitrary text, or unvalidated route makes the complete
projection unavailable; no notice contains a source id, customer value, token, error, or authority.

The complete UTF-8 JSON serialization of `AssistantActionProjectionV1`, including every token,
entry, route, label, and notice, is at most 128 KiB. Enforce that bound before terminal assembly. An
otherwise valid projection larger than 128 KiB is replaced by the bounded `unavailable` projection
with zero entries and exact notice `Task actions are temporarily unavailable`; it never truncates a
token, entry, or route. Combined with S88's 768-KiB result ceiling, this reserves at least 128 KiB of
S89's 1-MiB terminal-line ceiling for the terminal envelope, group ids, and framing.

`AssistantActionEntryV1` is one of:

```text
candidate:
  entry_kind: "candidate"
  item_ref: matching query-local S88 item ref, for presentation only
  candidate: AssistantActionCandidateV1

handoff:
  entry_kind: "handoff"
  item_ref: matching renewal item ref
  handoff_kind: "open_existing_task"
  route_ref: validated AssistantActionRouteRefV1
```

The handoff has no independent label. S93 renders only `route_ref.label` from S94's exact
key/label/builder registry; a redundant `label` field or any other sibling key fails projection
validation.

`AssistantActionCandidateV1` contains exactly:

```text
schema_version: "assistant-action-candidate-v1"
candidate_ref: opaque authenticated-encryption token
action_kind: "create_my_work_task"
label: "Create my task"
expires_at: ISO timestamp
```

The sealed token, not `item_ref` or `query_id`, carries the server's candidate binding. It contains:

```text
schema_version: "assistant-action-candidate-claims-v1"
purpose: "assistant_action_review"
environment_kind and data_context
actor_uid
action_kind: "create_my_work_task"
source_type: "renewal_lease"
source_id: exact opaque lease id
action_source_version: stable `renewal-term-v1:*` value from the registered S91 sidecar
space_id: "lease-renewals"
query_id: random S88 correlation id only
candidate_nonce: random 128-bit value encoded as exactly 22 unpadded base64url characters
issued_at and expires_at: integer Unix seconds
```

The source/actor/version binding is encrypted, not exposed as token payload fields. The token grants
nothing: Review always authenticates, authorizes, and rereads. `item_ref` and `query_id` remain
presentation/correlation values and are never accepted as authority.

S94 projection contains only renewal task candidates and `open_existing_task`; S90/S83/S88 continue
to carry approval/access/domain routes outside this projection. One bounded Work source-index read
checks all 20 source keys. Any retained deterministic assistant task for the actor and exact action
source version—including `Not started`, `In progress`, `Paused`, `Blocked`, `Completed`, or
`Cancelled`—suppresses creation. Any unrelated current nonterminal task bound to the same source also
suppresses creation. Exactly one readable match yields `open_existing_task`. One or more bindings with
multiple matches yield no item-specific entry for those bindings and exactly one de-duplicated
projection-level `multiple_existing` notice carrying the generic `/work` handoff; the projector never
selects a task or source row arbitrarily. Other eligible bindings may still produce entries in the
same complete or partial projection under the state rules above.

Projection stays inside the already-admitted S89 assistant query: it receives the coordinator's same
`AbortSignal`, absolute 50-second deadline, and remaining-time clock, and its one Work source-index
read gets only the smaller of the ten-second app-local ceiling or overall remaining time. It consumes
no second query, adapter, or narration permit, starts no detached/background work, and has no retry.
No index read starts after abort; a late non-cancellable result is discarded; no candidate token,
projection, or terminal event may be emitted after Stop, disconnect, abort, or deadline; and the
existing query permit is released by the same coordinator cleanup path on success, refusal, throw,
timeout, or cancellation.

The projector first validates/counts registered private bindings without reading token/idempotency
configuration or the Work index. Zero otherwise-actionable bindings returns the exact
`not_applicable` empty projection and performs none of those reads; this includes knowledge,
unsupported, clarification, nonrequestable-denial, unavailable, and renewal results with no eligible
binding. Only when at least one binding would otherwise be actionable does missing token/idempotency
configuration or an unavailable task index make projection `unavailable`, with zero candidates and
exact notice `Task actions are temporarily unavailable`. Individually ineligible rows are absent.
Review and Confirm repeat the applicable lookup under their endpoint rules, so projection is
convenience, not authority.

If more than 20 eligible result bindings exist, projection is `partial` and adds exact notice
`Actions are available for the first 20 eligible results. Refine your question to review others.`
This bound does not truncate S88 facts or alter their completeness. S93 terminal carries the complete
projection; there is no candidate-only stream event and completion timing cannot change entries.
Projection and every handoff are in-memory/read-only and create no source/domain record.

### Purpose-specific token and idempotency configuration

Candidate and confirmation tokens use AES-256-GCM authenticated encryption with distinct
purpose/version associated data. Add a dedicated server-only active key configuration
`ASSISTANT_ACTION_TOKEN_KEY` and optional rotation key
`ASSISTANT_ACTION_TOKEN_PREVIOUS_KEY`; each value is base64url for exactly 32 random bytes. Do not
reuse maintenance-intake HMAC, session, Firebase, connector, model, or provider secrets.

The task execution identity uses a different stable server-only 32-byte base64url secret
`ASSISTANT_ACTION_IDEMPOTENCY_KEY`. It is HMAC key material, not the active/previous token-encryption
key, and a token-key rotation cannot change a source-version task identity. It is injected in tests
and Secret Manager-bound/read back with the token key before candidate exposure. Missing either
required key makes task actions unavailable. No browser/public Work schema receives this key or the
raw HMAC inputs.

The token's clear header contains only format version and a non-secret `kid` derived from the key;
nonce, ciphertext, and authentication tag are base64url encoded. A verifier accepts only the active
key or the one configured previous key, constant-time validates the tag, checks exact purpose before
claims use, and rejects unknown version/key/purpose or any decode/schema error with one
non-enumerating response. Keys and full tokens never enter logs, metrics, URLs, analytics, HTML data
attributes, model input, error text, or durable records.

The compact token wire is frozen as four nonempty, unpadded base64url segments joined by literal
dots, with no prefix, suffix, compression, or alternate encoding:

```text
base64url(header UTF-8) . base64url(12-byte nonce) . base64url(ciphertext) . base64url(16-byte tag)
```

The header bytes are UTF-8 ECMAScript `JSON.stringify` of an object inserted in exact key order
`{ "v": "assistant-action-token-v1", "kid": <kid> }`, with no other keys or whitespace. `kid` is
the first 12 bytes of SHA-256 over the raw 32-byte key, encoded as 16 unpadded base64url characters;
a configured active/previous pair must be distinct and have distinct `kid` values. Each issuance
uses a fresh cryptographically random 12-byte nonce that is never reused with the same key. AES-GCM
associated data is UTF-8 `JSON.stringify`, in exact key order and without whitespace, of
`{ "v": "assistant-action-aad-v1", "purpose": <expected purpose>, "kid": <kid> }`. The only purpose
literals are `assistant_action_review` for a candidate token and `assistant_action_confirm` for a
confirmation token. The endpoint supplies the expected purpose; a token cannot select or downgrade
it.

For both purposes, issuance sets `issued_at=floor(now_ms/1000)` and
`expires_at=issued_at+600`. Verification requires integer values, that exact 600-second difference,
`issued_at <= floor(now_ms/1000)+60`, and `floor(now_ms/1000) < expires_at+60`; equality at the final
bound is expired. Clock skew never changes claims or produces a longer token. `candidate_nonce`
decodes canonically to exactly 16 random bytes and is independent of the 12-byte AES-GCM nonce. These
rules run before source/store work and are covered at -61/-60/0/+599/+600/+659/+660-second boundaries
with an injected clock.

Claims plaintext is UTF-8 `JSON.stringify` of the strict claims object in its declared schema order,
with no undefined values or extra whitespace. Candidate claims use the order shown above.
Confirmation claims contain exactly, in this order: `schema_version:
assistant-action-confirmation-claims-v1`, `purpose: assistant_action_confirm`, `environment_kind`,
`data_context`, `actor_uid`, `action_kind`, `source_type`, `source_id`, `action_source_version`,
`space_id`, `query_id`, `candidate_nonce`, normalized `input` in `title|next_action|due_at` order,
`preview_fingerprint`, `preview_hash`, `execution_identity`, `issued_at`, and `expires_at`. Nullable
`due_at` is explicit JSON null. The decoder enforces exactly four segments, decoded header/nonce/tag
lengths, the 4-KiB token bound, strict header/claims schemas, canonical base64url, and matching
header/AAD/derived-key `kid` before any source or store call.

Both required keys must be injected separately in tests and separately bound from Secret Manager and
read back before Production candidate exposure. When either is absent or invalid, the assistant
answer remains available, candidate projection returns typed action-unavailable state, and Review/
Confirm return 503 before any source or store call. Rotation moves the former active token key to
`PREVIOUS` for at least 11 minutes—the ten-minute token lifetime plus 60 seconds allowed clock skew—
before removal. A deployment or rollback that cannot verify the active token key, the distinct
idempotency key, or an optional previous key while that previous key is configured safely expires the
affected control and tells the user to review again; it never weakens verification.

Idempotency-key rotation uses a fail-closed issuance drain. Add the non-secret server runtime setting
`ASSISTANT_ACTION_ISSUANCE_MODE` with exactly `enabled|draining`; it resolves to `draining` when
absent/unknown and is read back before exposure.
`draining` makes projection expose typed action-unavailable and makes Review return
`unavailable/idempotency_config_unavailable` before a source read; it does not disable Confirm, so an
already issued confirmation can reconcile under the still-bound old key. Set and read back
`draining`, then wait at least 11 minutes from the last possible Review/confirmation issuance so all
previous candidate and confirmation tokens have passed their ten-minute lifetime plus 60-second
skew. After that wait, prove zero in-flight Confirms, read back the retained-task source index, bind
and read back the new idempotency key, run same-source/deterministic-target regression proof, then set
and read back `enabled`. Candidate issuance and Review remain disabled for the entire drain; a
client-held candidate cannot mint a confirmation near the end of the wait. Existing retained tasks
still suppress candidates by actor/source/version regardless of which key created them. Rotating
without that drain is forbidden; no routine deployment or rollback changes this key.

### Non-persistent Review contract

`POST /api/assistant/action-reviews` requires `application/json`, a complete body no larger than 16
KiB UTF-8, and only this strict JSON body:

```text
schema_version: "assistant-action-review-request-v1"
candidate_ref: opaque token, 1 through 4096 UTF-8 bytes
input:
  title: owning Work shortText(160)
  next_action: owning Work shortText(240)
  due_at: optional ISO 8601 timestamp with an explicit offset
```

Review reuses the owning Work service normalization byte-for-byte: trim; collapse every whitespace
run to one ASCII space; then require 1 through the named maximum JavaScript UTF-16 code units. It
parses `due_at` with the same finite ISO check and canonicalizes it to `Date.toISOString()` before the
preview/hash. Review does not substitute a Unicode-code-point counter or retain spacing/offset text
that the Work owner would change. Unknown fields, actor/role/Space/assignee, kind, source/target id,
version, task type, idempotency key,
URL, action key, model text, arbitrary payload, relative date, empty value, invalid offset, malformed
token, and oversize body are rejected before a source read. The UI may prefill the value-free title
`Follow up on lease renewal`; the model never fills title, next action, or due time. `next_action`
requires deliberate human input. Omitting `due_at` means the existing My Work copy `No due time` in
the preview and rendered task; the stored field remains absent.

Review performs, in order:

1. authenticate the current actor and validate body/media bounds;
2. normalize and semantically validate `title`, `next_action`, and optional `due_at` exactly once,
   rejecting an invalid/empty value before any source read and retaining only these normalized values;
3. decrypt and validate candidate version, purpose, actor, environment/data context, issue/expiry
   time, kind, source type, Space, and nonce;
4. recheck current `edit`, Space, and source visibility through the owning Work/renewal boundary;
5. reread the exact lease source once through the existing source resolver, allowing its bounded
   authorized provider reads but no provider write/effect;
6. require a verified current source id/action version, calculate the canonical preview fingerprint,
   and repeat the exact retained-assistant-task plus unrelated-current-task lookup described above;
7. derive the task-editable fields from the retained normalized human input, while deriving the
   server execution identity only from the authenticated actor and exact action kind, source type,
   source id, and current source action version declared below; and
8. return one exact `ready` `AssistantActionReviewResponseV1`, whose strict
   `AssistantActionReviewV1` contains the sealed confirmation token, without persistence.

The exact derived Work command is:

```text
space_id: "lease-renewals"
source.type: "renewal_lease"
source.id: token-bound current lease id
source.version: stable action_source_version
task_type: "lease renewal follow-up"
assignee_uid: current actor uid
title, next_action, due_at: exact reviewed normalized input
idempotency_key: server-only assistant execution identity
```

The execution identity decodes `ASSISTANT_ACTION_IDEMPOTENCY_KEY` from canonical unpadded base64url to
exactly 32 raw key bytes, then computes HMAC-SHA-256 over the UTF-8 bytes of ECMAScript
`JSON.stringify` on an object inserted in this exact key order:

```text
{
  "domain": "assistant-my-work-task:v1",
  "actor_uid": <exact authenticated uid>,
  "action_kind": "create_my_work_task",
  "source_type": "renewal_lease",
  "source_id": <exact canonical RentVine lease id>,
  "action_source_version": <exact stable renewal-term-v1:* value>
}
```

Every value is a JSON string under standard escaping; there are no other keys or inserted whitespace.
The Work `idempotency_key` is literal prefix `assistant-task-v1:` plus unpadded base64url of the raw
32-byte HMAC digest. It contains no browser input or candidate nonce. Review derives it; Confirm
rederives it from current authenticated/source facts and constant-time compares it with the encrypted
claim before the Work call. Therefore all concurrent/fresh candidates for one actor and exact source
version converge on one Work task.

This key uses a trusted internal-only Work service field with exact validator
`^assistant-task-v1:[A-Za-z0-9_-]{43}$`. It must not pass through the public `normalizeOpaqueId` or
the public `/api/work` request schema, whose existing caller-key alphabet and behavior remain
unchanged. Only the S94 server wrapper may populate the trusted field after actor/source revalidation;
a browser-supplied value with this prefix is refused.

Freeze this non-secret golden vector in S94 and internal Work-boundary tests: raw key bytes `00`
through `1f` (canonical base64url
`AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8`), `actor_uid: user-123`, `source_id: lease-456`, and
`action_source_version: renewal-term-v1:00fxb7wbdJs-7dMl-kWpBk2QR_Ao4o-D-i4AGf0ha2s` with the fixed
fields above must produce exactly
`assistant-task-v1:mIASoFBbpti-u3B9hQVnZ5IVnEIpkDXxSSERtF9zjHY`. The action-source value is the valid
S91 digest for exact canonical object `{ "lease_id":"lease-456", "end_date":"2026-10-31" }`, so
the shared fixture must pass the production action-source validator before its HMAC assertion. S94
Review, S94 Confirm,
the trusted Work wrapper, and collision/readback fixtures must share one implementation or pass this
same vector byte-for-byte; UTF-16 hashing, hex digest, padded/base64 encoding, reordered keys, or a
different prefix fails parity. V1 intentionally permits at most one retained assistant-created task
per actor and renewal action source version. A later duty requires a new authoritative source version
or the existing owning My Work/manual flow; the assistant does not invent a `create again`
discriminator.

`AssistantActionReviewV1` is strict and contains exactly:

```text
schema_version: "assistant-action-review-v1"
action_kind: "create_my_work_task"
source_label: server-owned public renewal source label
renewal_date_iso: exact current YYYY-MM-DD
stage_id: exact current S91 stage id or null
status_key: exact current S91 status key or null
status_label: exact current S91 status label or null
blocker_coverage: exact current S91 blocker coverage
blocker_count: exact current S91 blocker count or null
blocker_labels: exact current ordered S91 blocker labels
blockers_truncated: false
source_next_action: exact current S91 next-action label or null
space_label: server-owned public label for the canonical `lease-renewals` Space
task_type: "lease renewal follow-up"
title: exact normalized reviewed title
assignee_label: server-owned signed-in actor display label
next_action: exact normalized reviewed next action
due_at: canonical ISO timestamp or null
consequence: "This creates a PMI KC task only. It does not change the lease or contact anyone."
preview_hash: exact lowercase 64-character SHA-256 hex
expires_at: confirmation-token ISO expiry timestamp
confirmation_ref: opaque confirmation token, 1 through 4096 UTF-8 bytes
```

The preview renders the renewal fields above together under `Current renewal context` before the task
consequence, so the user sees every source fact bound by the preview fingerprint. A binding with
`blockers_truncated: true` is ineligible and can never reach Review. All public labels are bounded,
NFC plain text under the owning S91/Work display limits and contain no id, URL, Markdown, HTML, or
model/client value. In the preview, null `due_at` renders exact copy `No due time`; a non-null value
renders through the shared absolute date-time presenter using only the canonical timestamp.
`preview_hash` is lowercase 64-character SHA-256 hex over the UTF-8 bytes of ECMAScript
`JSON.stringify` on an object containing these exact keys in this exact order: `schema_version:
assistant-action-preview-hash-v1`, `action_kind`, `source_label`, `renewal_date_iso`, `stage_id`,
`status_key`, `status_label`, `blocker_coverage`, `blocker_count`, `blocker_labels`,
`blockers_truncated`, `source_next_action`, `space_label`, `task_type`, `title`, `assignee_label`,
`next_action`, `due_at`, then `consequence`. Values are exactly those in the strict review; nulls are
explicit, array order is preserved, strings use standard JSON escaping, and no other key or
whitespace is inserted. `preview_hash`, `expires_at`, and `confirmation_ref` are excluded. Review
and Confirm share this serializer or pass the same golden fixtures byte-for-byte. The hash is a
confirmation binding, not telemetry. The confirmation token contains exact candidate claims,
normalized input, source version/fingerprint, preview hash, execution identity, a new issued time,
and ten-minute expiry.

Review writes no proposal, receipt, transcript, task, activity, source, provider, or analytics record.
Repeating Review for the same candidate and normalized input yields the same semantic preview,
fingerprint, execution identity, and hash; authenticated encryption may use a fresh cryptographic
nonce. Changed input yields a changed preview/hash but the same one-task execution identity. Closing
or cancelling the dialog discards the in-memory response and writes nothing.

### Exact Confirm, idempotency, and readback

`POST /api/assistant/action-confirmations` requires `application/json`, a complete body no larger
than 8 KiB UTF-8, and accepts only:

```text
schema_version: "assistant-action-confirm-request-v1"
confirmation_ref: opaque token, 1 through 4096 UTF-8 bytes
preview_hash: exact lowercase SHA-256 hex returned by Review
```

Confirm performs this exact precedence before any persistence:

1. authenticate and strictly validate media, body size, outer schema, token/hash alphabets, and
   bounds;
2. decrypt the exact confirmation purpose and validate token version, actor, environment/data
   context, issue/expiry time, kind, source type/id/version, Space, nonce, and claim schema; an
   otherwise valid expired token is `refused/expired`, while another token/claim failure is
   `refused/invalid_token`;
3. recompute the frozen preview hash and execution identity from the token-bound normalized review
   fields and authoritative token claims; an internal mismatch with either sealed claim is
   `refused/invalid_token`;
4. constant-time compare the syntactically valid submitted `preview_hash` with the now-validated
   token claim; a mismatch is `refused/invalid_request`;
5. recheck current environment, `edit`, Space, and source visibility; read-only environment is
   `refused/environment_read_only`, and an access failure is `refused/denied`;
6. reread the exact source once. An unavailable current source is
   `unavailable/source_unavailable`; a changed source id/action version or recomputed preview
   fingerprint is `superseded/source_changed`; and
7. run the deterministic-target/source-index precedence below.

Confirm never accepts a boolean confirmation, a reconstructed task field, a caller route, or a
caller execution identity. A body `preview_hash` mismatch, a sealed-claim hash inconsistency, and
current source-fingerprint drift are therefore three distinct, fully tested branches and cannot
collapse into generic failure copy.

The task lookup has one non-overlapping precedence. First validate deterministic-id and source-index
integrity. A document at the derived deterministic id whose immutable binding (`id`, source type/id/
version, Space, task type, and creator uid) does not match or an index entry that points to a
different identity returns `reconciliation_required/idempotency_conflict`. A missing immutable
`created` activity returns `reconciliation_required/readback_missing`; an activity whose task,
actor, action, initial state, task version, or idempotency binding mismatches returns
`reconciliation_required/readback_mismatch`. None is treated as ordinary existing work. When
that immutable identity and creation activity are valid, a later change to mutable task fields or
state—including assignee, title, next action, due state, or any state other than the exact initial
`Not started` review—returns `existing_task` with the exact task route and never replays or
overwrites it. If the exact initial deterministic target is valid but any second readable same-source
current/retained task also exists, `existing_task` wins with the generic My Work route; Confirm does
not choose or replay one arbitrarily. With no deterministic target, exactly one other readable
same-source current/retained task returns `existing_task` with its exact route, while multiple return
`existing_task` with generic My Work. Only no matching task, or the sole exact unchanged initial
deterministic target, may proceed to the internal create/idempotent-replay transaction and exact
readback.

The Work owner receives a trusted internal expected-action-source version/preview fingerprint and the
server-derived idempotency key; these fields are not added to the public `/api/work` schema. Add one
internal-only create boundary that reuses the current renewal resolver read but derives and compares
`RenewalLeaseActionSourceV1` before its transaction, then writes that stable action version to
`task.source.version`. The transaction consumes the trusted resolver's verified action-version
projection instead of the public create path's observation-time `source.version`; it never compares
the two strings or accepts a caller version. The existing public Work create path and its
observation-time source version remain compatible. The internal wrapper applies the exact lookup
precedence above. Only the sole deterministic task with matching immutable binding, exact reviewed
mutable fields, current actor assignee, exact `Not started` state, and matching immutable `created`
activity may return `applied/replayed`. A legitimate later mutable/state change is `existing_task`;
an immutable id/index/activity corruption is `reconciliation_required`; neither is a successful
idempotency replay or overwrite.

After create/replay, Confirm reads the task and its `created` activity through the owning Work store.
It returns `AssistantTaskReceiptV1` only when every reviewed field, `Not started` state, creation
activity, and current stable action source version match.

Review and Confirm build every action route from their current authorized readback. They never reuse
an S88 result-local ref or accept a route from the caller.

The strict `AssistantTaskReceiptV1` contains exactly:

```text
schema_version: "assistant-task-receipt-v1"
action_kind: "create_my_work_task"
status: "applied"
replayed: boolean
task_ref: opaque server-issued task reference
task_record_version: exact Work task record version read back
action_source_version: exact stable `renewal-term-v1:*` version read back
created_at: exact task creation ISO timestamp read back
readback_state: "exact"
route_refs: 1 or 2 validated AssistantActionRouteRefV1 records
```

`task_ref` must match the canonical Work `normalizeOpaqueId` grammar
`^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$`. `task_record_version` is a positive JavaScript safe integer.
`action_source_version` matches `^renewal-term-v1:[A-Za-z0-9_-]{43}$`. `created_at` is a valid exact
canonical UTC `YYYY-MM-DDTHH:mm:ss.sssZ` value whose parsed `Date.toISOString()` is byte-identical.
Any other representation fails the complete receipt before S93 can render it.

`route_refs` is ordered task route first, then the renewal source route when it is distinct; refs are
server-built from the read-back task/source and never accepted from Confirm. S93 renders these through
its typed renderer; no response automatically navigates or opens a tab. The durable receipt is the
existing Work task plus creation activity under the current Work retention/legal-hold policy; S94
adds no proposal/execution collection, cleanup job, retention rule, or second business record.

A repeated or response-loss Confirm may safely call the same internal idempotent task transaction
with the same server identity, then exact-compare readback; it can create at most one task. A
definitive pre-call validation failure makes no write. A thrown/timeout response after the internal
call, absent activity, or conflicting readback returns `reconciliation_required`, links to My Work,
and never claims success. It does not retry a provider/external effect because none is part of this
kind. The user can resubmit the same unexpired confirmation to reread/recover; after expiry, a fresh
query/review converges on the same source-version identity or opens the existing task.

The exact response status set is:

| Status                    | Meaning and next behavior                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `ready`                   | Review only: exact preview and confirmation are available; no write occurred.                                        |
| `applied`                 | Confirm exact-read the created/existing matching task and activity; `replayed` states whether it already existed.    |
| `existing_task`           | A retained assistant task or another current task already owns this source; open it/My Work, no new task.            |
| `superseded`              | Source version or preview binding changed before the Work call; run a fresh query/review.                            |
| `reconciliation_required` | The deterministic target cannot be proven exact after the internal call or an id collision mismatched; open My Work. |
| `refused`                 | Invalid/expired/wrong-actor token, invalid input, current access denial, or Live-read-only; no write.                |
| `unavailable`             | Required action config/source/Work read is unavailable; no write and retry only after recovery.                      |

Stable reason codes are finite: `invalid_request`, `invalid_token`, `expired`, `denied`,
`environment_read_only`, `token_config_unavailable`, `idempotency_config_unavailable`,
`source_unavailable`, `source_changed`, `existing_task`, `idempotency_conflict`, `readback_missing`,
`readback_mismatch`, and `internal_error`; `ok` is permitted only for `ready` and `applied`.

Every authenticated, schema-valid Review completion is exactly one strict
`AssistantActionReviewResponseV1` variant. Unknown keys and keys belonging to a sibling variant fail
the response contract:

```text
ready:
  schema_version: "assistant-action-review-response-v1"
  status: "ready"
  reason_code: "ok"
  message: "Review this task before creating it."
  review: AssistantActionReviewV1

existing task:
  schema_version: "assistant-action-review-response-v1"
  status: "existing_task"
  reason_code: "existing_task"
  message: "A task already exists for this renewal."
  route_refs: exactly 1 validated AssistantActionRouteRefV1

superseded/refused/unavailable:
  schema_version: "assistant-action-review-response-v1"
  status: exact non-ready discriminator
  reason_code: one permitted pairing below
  message: exact paired copy below
  route_refs: []
```

Every authenticated, schema-valid Confirm completion is exactly one strict
`AssistantActionConfirmResponseV1` variant:

```text
applied:
  schema_version: "assistant-action-confirm-response-v1"
  status: "applied"
  reason_code: "ok"
  message: "Task is ready in My Work."
  receipt: AssistantTaskReceiptV1

existing task:
  schema_version: "assistant-action-confirm-response-v1"
  status: "existing_task"
  reason_code: "existing_task"
  message: "A task already exists for this renewal."
  route_refs: exactly 1 validated AssistantActionRouteRefV1

reconciliation required:
  schema_version: "assistant-action-confirm-response-v1"
  status: "reconciliation_required"
  reason_code: "idempotency_conflict" | "readback_missing" | "readback_mismatch"
  message: "The task result could not be confirmed. Open My Work before trying again."
  route_refs: exactly 1 validated AssistantActionRouteRefV1 for `/work`

superseded/refused/unavailable:
  schema_version: "assistant-action-confirm-response-v1"
  status: exact non-applied discriminator
  reason_code: one permitted pairing below
  message: exact paired copy below
  route_refs: []
```

The remaining status/reason/message pairs are closed:

| Status        | Permitted reason code(s)                                                                             | Exact `message`                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `superseded`  | `source_changed`                                                                                     | `This renewal changed. Review the latest result before creating a task.` |
| `refused`     | `invalid_request`                                                                                    | `Review the task details and try again.`                                 |
| `refused`     | `invalid_token`, `expired`                                                                           | `This task review is no longer available. Review the result again.`      |
| `refused`     | `denied`                                                                                             | `You do not have access to create this task.`                            |
| `refused`     | `environment_read_only`                                                                              | `Task creation is unavailable in this read-only environment.`            |
| `unavailable` | `token_config_unavailable`, `idempotency_config_unavailable`, `source_unavailable`, `internal_error` | `Task actions are temporarily unavailable.`                              |

`environment_read_only` is Confirm-only because local rehearsal may complete Review. `ready` is
Review-only; `applied` and `reconciliation_required` are Confirm-only. `existing_task`,
`superseded`, `refused`, and `unavailable` are valid at either endpoint only with the pairings above.
An `existing_task` route is the uniquely known exact task route or the generic `/work` route when no
single task may be selected. Media-type, body-size, malformed-JSON, missing-session, and endpoint-
schema failures retain the existing bounded API error contract and never masquerade as one of these
domain unions. Neither endpoint returns null placeholders for fields owned by another variant.

HTTP status is transport metadata; every authenticated request whose outer endpoint schema parses
and reaches a domain outcome returns `application/json`, `Cache-Control: no-store`, and the complete
strict union body above even when the status is non-2xx. The mapping is exact:

| Endpoint | Union outcome                                                            | HTTP status |
| -------- | ------------------------------------------------------------------------ | ----------- |
| Review   | `ready`; `existing_task`                                                 | `200`       |
| Review   | `superseded`                                                             | `409`       |
| Review   | `refused/invalid_request`                                                | `422`       |
| Review   | `refused/invalid_token`                                                  | `400`       |
| Review   | `refused/expired`                                                        | `410`       |
| Review   | `refused/denied`                                                         | `403`       |
| Review   | any permitted `unavailable` reason                                       | `503`       |
| Confirm  | `applied` with `receipt.replayed: false`                                 | `201`       |
| Confirm  | `applied` with `receipt.replayed: true`; `existing_task`                 | `200`       |
| Confirm  | `superseded`; `reconciliation_required`; `refused/environment_read_only` | `409`       |
| Confirm  | `refused/invalid_request`                                                | `422`       |
| Confirm  | `refused/invalid_token`                                                  | `400`       |
| Confirm  | `refused/expired`                                                        | `410`       |
| Confirm  | `refused/denied`                                                         | `403`       |
| Confirm  | any permitted `unavailable` reason                                       | `503`       |

S93 parses the appropriate strict union for every listed status before rendering and never treats
`response.ok` as the domain discriminator. Unsupported media (`415`), oversized body (`413`),
malformed JSON or an outer strict-schema failure (`400`), missing/expired authentication (`401`),
and a base managed-user/session refusal before the domain boundary (`403`) use the existing bounded
API error envelope, never a partial action union. `refused/invalid_request` is reserved for a parsed
outer request whose bounded value fails the owning Work semantic normalization/validation; it is not
used to wrap malformed transport input.

### Privacy and action observability

Tokens, previews, source/task values, ids, hashes, and receipts are access-controlled response or
Work-domain data, not routine telemetry. S94 may emit a separate bodyless
`AssistantActionTelemetryEventV1` containing exactly: fixed marker/schema version; event name from
`candidate_projected|review_ready|review_refused|confirm_applied|confirm_replayed|confirm_refused|
confirm_reconciliation_required`; action kind `create_my_work_task`; one stable reason code above or
`ok`; total duration in milliseconds; and deployment environment/version fields already approved for
diagnostics. It contains no `query_id`, uid/session/role/Space, candidate/confirmation token,
source/task/proposal/execution/route id or hash, question, title, next action, due date, preview,
receipt, customer/provider value, URL, count, raw error, prompt, or stack.

Telemetry is best effort and never changes the response or triggers retry. Candidate count may be
enforced in memory but is not logged. Emit exactly one `candidate_projected` event after each
completed `AssistantActionProjectionV1`, regardless of whether it contains 0, 1, or 20 entries and
regardless of `complete|partial|unavailable|not_applicable`; emit zero when projection aborts or never
completes. This is one event per projection, never per candidate, item, group, or route, and it adds
no count, nonzero flag, bucket, projection state, or repeated timing sample from which candidate
multiplicity can be reconstructed. S89 continues to own query/model telemetry; S94 does not add an
exception to S89's identifier/value bans.

**In scope / out of scope.**

In scope: one closed renewal-to-self-task kind; max-20 candidate projection; exact actor-bound sealed
candidate/confirmation contracts and rotation; current source/task lookup; strict human inputs;
non-persistent review; exact preview/hash; server-owned one-task-per-source-version identity; trusted
expected-source extension to the internal Work boundary; exact task/activity readback; replay,
`existing_task`, expiry, refusal, and reconciliation behavior; bodyless action telemetry; S83 and
domain-owned inert handoff boundaries; S86/S93 presentation contracts; and adversarial tests.

Out of scope: workflow-run start/cancel; process lookup; arbitrary/manual or other-source task
creation; multiple assistant tasks for one actor/source version; other-user/team assignment; model-
filled task fields; work-session start or task transitions; durable assistant proposal/transcript/
execution store; approving, denying, assigning, snoozing, or bulk acting in the assistant; generic
approval creation; claim changes outside S83; provider/source writes; Gmail draft/reply/label/send;
RentCast; RentVine/Sheet writeback; new Action Registry keys or grants; reminders/background work;
and model tools/autonomous actions.

**Open questions & assumptions.**

- Decision: V1 executable support is deliberately one self-assigned renewal task. There is no safe
  V1 process-definition producer, so current Ask's implicit run start is removed by S93/S95 and
  explicit run starts remain on owning Process pages.
- Decision: one actor/stable renewal-term action version maps to one assistant task. This closes concurrent candidate and
  replay duplication without client intent; another task uses the existing My Work flow or waits for
  authoritative source version change.
- Decision: Review is stateless and tokens expire after ten minutes. This preserves the exact human
  boundary without adding a proposal retention/deletion/authorization system.
- Decision: only individually complete/current renewal rows are candidates. An aggregate partial
  answer does not disqualify an exact row when the missing material cannot affect that row's source
  binding; the matrix is tested per candidate.
- Decision: authorized lease/source reads may occur during Review and Confirm. S94 constructs no
  provider client and permits no provider write/effect.
- Decision: current observation-time Work source versions are not action identity. S91 and the
  trusted internal Work boundary must derive/read back `RenewalLeaseActionSourceV1`; until both pass
  parity on exact lease id/end date, Production candidates are unavailable.

**Cross-product impacts.**

S88 terminal orchestration; S89 privacy/telemetry separation; S90 Work/approval/access links; S91
renewal source bindings; S93 terminal schema and review dialog; S95 Dashboard cutover; S83 access
handoff; My Work source-index/read/create/activity/readback and internal expected-version contract;
Secret Manager/runtime config for both required assistant action keys, the optional previous token
key, and exact non-secret `ASSISTANT_ACTION_ISSUANCE_MODE`; current Ask process/capture removal. No provider writer, action gate,
role/Space claim, approval queue writer, or production data source is opened.

**Authority and evidence map.**

| Input                                                                                                                                                                                       | Classification                   | Use and limitation                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router, `docs/facts.md`, current Work schemas/store/source resolver/tests                                                                                                                   | Authority / implementation truth | Establish human-confirmed app-write safety, current source/version/task/activity/retention behavior, and the caller-key replay comparison gap.                                                                                                                                                                                    |
| Current Ask form/service and workflow-run services                                                                                                                                          | Implementation truth / boundary  | Establish the KB placeholder and implicit run side effect; they are removed from the new assistant, not treated as reusable action authority.                                                                                                                                                                                     |
| S83 and S88-S93                                                                                                                                                                             | Specified dependencies           | Own access lifecycle, query/results, privacy, adapters, narration, and UI. S94 consumes typed refs but never treats prose, query ids, or result-local ids as authority.                                                                                                                                                           |
| Dashboard AI integration/decluttering notes                                                                                                                                                 | Intent evidence only             | Require reviewed task and supported approval/access paths; do not authorize model execution, generic approvals, provider effects, or process guessing.                                                                                                                                                                            |
| Required `ASSISTANT_ACTION_TOKEN_KEY` and distinct required `ASSISTANT_ACTION_IDEMPOTENCY_KEY`; optional `ASSISTANT_ACTION_TOKEN_PREVIOUS_KEY`; non-secret `ASSISTANT_ACTION_ISSUANCE_MODE` | Missing desired configuration    | Both required keys must be separately Secret Manager-bound; mode must read back as `enabled` before Production candidate/Review exposure and as `draining` during an idempotency-key rotation. The previous token key is rotation-only. Missing/invalid key or mode leaves read-only answers green and actions typed unavailable. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S94-1** — One closed manifest and projector issue at most 20 candidates from exact eligible
  S91 rows in canonical order; parity/import tests reject every unregistered kind, source, runtime
  registration, model/client authority, durable query registry, or projection above the exact
  128-KiB terminal allocation.
- **ARCH-S94-2** — One purpose-specific AES-256-GCM token service owns strict candidate/confirmation
  claims, compact wire/header/`kid`/AAD/nonce serialization, ten-minute expiry, actor/environment
  binding, active/previous-key rotation, and non-enumerating refusal. Configuration and tamper tests
  fail against the current absent service.
- **ARCH-S94-3** — Review reauthorizes/rereads and returns a deterministic exact preview plus sealed
  confirmation with zero persistence. Store/provider-write spies fail any query, projection, Review,
  dialog cancel, or handoff mutation.
- **ARCH-S94-4** — One server-only execution identity and trusted expected-source Work command close
  the current caller-key/payload-replay gap. Its frozen UTF-8/JSON-order/raw-HMAC/base64url-prefix
  derivation is byte-identical across Review, Confirm, and the Work wrapper; exact comparison and
  source-version checks fail on any existing-id mismatch rather than returning success.
- **ARCH-S94-5** — Existing Work task plus `created` activity are the only durable consequence and
  receipt. Confirm exact-reads both; retry/reload converges on one target and no new S94 store or
  retention policy exists.
- **ARCH-S94-6** — Access, existing/requested approval, existing Work, and knowledge outcomes are
  allow-listed inert route handoffs or no-action states. Static/runtime sentinels reject generic
  queue, claim, decision, process-run, action-gate, and provider-writer imports.
- **ARCH-S94-7** — Action telemetry uses the exact finite bodyless schema and remains separate from
  S89 query telemetry; privacy tests reject every id/hash/token/customer/action-input field, and one
  completed projection emits exactly one count-independent `candidate_projected` event.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S94-1** — Asking, streaming, narrating, opening a result/handoff, hovering, focusing, or
  selecting Review performs no write; only the exact later Confirm may create one named task.
- **BEH-S94-2** — An eligible renewal row shows `Create my task`; Review shows exact self-assigned task
  values and consequence, and Confirm creates/read-backs one matching task and activity.
- **BEH-S94-3** — Concurrent candidates, double click, response loss, refresh, and fresh review for
  the same actor/source version converge on the same task or exact conflict and never duplicate it.
- **BEH-S94-4** — Expired/forged/wrong-user/wrong-environment tokens, changed role/Space/source,
  existing current work, source/read outage, local rehearsal, and mismatched readback produce the
  exact typed state with no hidden success or overwrite.
- **BEH-S94-5** — Approval/access activation opens the owning guarded route; only that owner may later
  preview/confirm/submit. Missing owner says unavailable and never manufactures a queue item.
- **BEH-S94-6** — Model/source prose containing action JSON, targets, due dates, roles, URLs, or
  confirmations cannot change candidate eligibility, input, preview, execution, or recovery.
- **BEH-S94-7** — A question with more than 20 eligible rows preserves all S88 facts/coverage, exposes
  candidates only for the canonical first 20, and states how to refine without logging the count.

**Human litmus outcome.**

### Create one task from a renewal result

**If this was built correctly:** A user chooses `Create my task` on one lease result, reviews the
source, title, next action, self-assignment, due state, and consequence, then confirms. One exact task
is created and a link lets the user deliberately open it in My Work; the lease and all external
systems remain unchanged.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Avoid duplicate work after a lost response

**If this was built correctly:** If Confirm times out or is clicked twice, the user either receives
the one matching task or an explicit reconciliation state. A fresh query offers the `existing_task`
link; it does not create another task or open a tab automatically.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Follow an access or approval handoff

**If this was built correctly:** A user can open a requestable access flow or an existing/registered
approval flow, but the destination shows and owns its own review. The assistant never grants access,
decides an approval, or creates a generic queue item.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Work safely when action support is unavailable

**If this was built correctly:** A read-only answer remains useful when either required action key,
the Work lookup, or the source is unavailable. The task action explains that it is unavailable, and
local rehearsal or a changed source never writes anything.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                           | Architecture outcome | Behavior outcome | Human litmus                              | Deterministic evidence / falsification                                                                                        |
| ----------------------------------------------------- | -------------------- | ---------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Closed bounded candidates, no query authority         | `ARCH-S94-1/3`       | `BEH-S94-1/6/7`  | Create one task; unavailable support      | Registry/order/cap/model-injection/store-spy tests prove only exact S91 rows produce max 20 inert candidates.                 |
| Sealed actor/environment/expiry contract              | `ARCH-S94-2`         | `BEH-S94-4`      | Work safely when unavailable              | Key absence/length/rotation, tag/purpose/claim mutation, actor/context, boundary-clock, deploy/rollback fixtures.             |
| Stateless exact Review and human-owned inputs         | `ARCH-S94-2/3`       | `BEH-S94-1/2/4`  | Create one task                           | Strict-body/normalization/preview/hash/dialog-cancel tests prove zero persistence and byte-equivalent semantic replay.        |
| One exact task under concurrency/replay               | `ARCH-S94-4/5`       | `BEH-S94-2/3/4`  | Avoid duplicate work                      | Same-source/version multi-candidate, double-confirm, response-loss, payload-collision, exact task/activity readback fixtures. |
| Existing task and all failure/recovery states         | `ARCH-S94-4/5`       | `BEH-S94-3/4`    | Avoid duplicate work; unavailable support | Source-index, terminal/current task, expiry, access/source change, store throw, missing/conflicting readback tests.           |
| Access and approvals remain domain-owned              | `ARCH-S94-6`         | `BEH-S94-5`      | Follow an access or approval handoff      | Registered/absent S83/domain route tests and import spies prove navigation only and zero generic queue/claim/decision writes. |
| No process/provider/external effect                   | `ARCH-S94-3/6`       | `BEH-S94-1/5/6`  | All four entries                          | Workflow/action/provider-writer spies stay zero while explicitly allowing bounded owner source reads.                         |
| Bodyless action telemetry and existing Work retention | `ARCH-S94-5/7`       | `BEH-S94-2/4`    | Avoid duplicate work; unavailable support | Schema snapshot/privacy fuzzing plus Work task/activity retention/readback prove no proposal store or identifier-bearing log. |

**Preservation set.**

Keep current auth/capability/role/Space/environment guards; S88 no-write and typed completeness;
S90/S91 actor filtering and exact links; S89 privacy/cost/model controls; S92 narration independence;
S83 request/claim lifecycle; approval visibility/risk/transition ownership; My Work public schema,
source verification, non-Admin self-assignment, transaction/activity, task states, cancellation,
source links, retention/legal hold, team/manual flows, sessions, and mappings; Process-page explicit
run starts; Action Registry/provider/runtime gates; Live-only production; local no-persistence;
unsent-draft/direct-send rules; and closed RentVine/Sheet writes remain separately green.

**Adversarial acceptance checks.**

- **AC-S94-1** — `ARCH-S94-1/3` reject unknown kind/item/source, partial row whose missing facts affect
  eligibility, candidate 21, forged result/item ref, model action, unregistered runtime handler, and
  candidate-store creation; S88 facts remain unchanged and candidate order is canonical. Exact
  128-KiB and 128-KiB-plus-one projection fixtures prove oversize replacement is bounded unavailable
  and the complete S88-result-plus-projection terminal stays within S89's 1-MiB line ceiling.
- **AC-S94-2** — `ARCH-S94-2` cover absent/short/malformed active token key and distinct idempotency
  key, wrong optional previous token key, rotation overlap/removal, modified header/nonce/ciphertext/
  tag, compact segment count/padding/header order, derived `kid`, AAD purpose/key binding, nonce/tag
  lengths and nonce reuse, claims serialization, purpose swap, clock skew/expiry, actor/env/data-
  context mismatch, token oversize, deploy, and rollback; no candidate is exposed until both required
  bindings read back, and no source/store call occurs on refusal.
- **AC-S94-3** — `ARCH-S94-3` cover every strict input bound, Work whitespace/UTF-16 normalization,
  offset-to-UTC date, no due time, changed source/access, existing task, repeated/changed Review,
  dialog Cancel, Back/Forward,
  and source-read failure; only a bounded authorized source read may occur and persistence spies stay zero.
- **AC-S94-4** — `ARCH-S94-4/5` cover two candidates and concurrent Confirms for the same actor/stable
  action version, repeated observation-time reads, idempotency-key rotation drain, current public
  caller-key collision behavior, exact HMAC JSON order/UTF-8/raw-digest/unpadded-base64url/prefix and
  the frozen golden vector across Review/Confirm/Work, exact/mismatched pre-existing deterministic
  target, source race, task-store throw, response loss, missing activity, and exact readback. At most
  one task exists and mismatch never returns success.
- **AC-S94-5** — `BEH-S94-4` cover Editor/Approver/Admin as currently authorized, self versus another
  actor, hidden Space/source, expired claims, local rehearsal, wrong Production data context,
  unavailable resolver/index/config, and every response status/reason pair with non-enumerating copy.
- **AC-S94-6** — `ARCH-S94-6` cover Work source/detail, approval decision/detail, submitted request,
  S83 present/absent requestable access, registered/absent domain request, and knowledge/no-source
  result. Activation performs navigation only and no S94 Review/Confirm call.
- **AC-S94-7** — `ARCH-S94-6` static/import/runtime spies prove no workflow-run start/cancel,
  `createApprovalQueueItem`, claim mutation, queue decision, Gmail, RentVine/Sheet writer, RentCast,
  connector effect, notification send, action-gate, or Action Registry call is reachable.
- **AC-S94-8** — `ARCH-S94-7` snapshot/fuzz tests admit only the finite bodyless action event fields;
  they reject query/actor/source/task/candidate/proposal/execution ids or hashes, tokens, values,
  previews, URLs, raw errors, prompts, and counts while telemetry failure leaves behavior unchanged.
  Projection fixtures with 0, 1, and 20 entries each emit exactly one indistinguishable-shape
  `candidate_projected` event; aborted projection emits zero; spies reject per-entry events or any
  count/nonzero/bucket/state field that could reveal multiplicity.
- **AC-S94-9** — Review/Confirm contract fixtures cover every legal status/reason/message/field/route
  variant and exact HTTP mapping, including first apply versus replay. S93 parses union bodies on all
  listed non-2xx statuses; unknown keys, illegal pairings, wrong-endpoint variants, null sibling
  fields, malformed receipts/routes, an altered S94 key/label/builder registry pairing, and an action
  union on an ordinary media/body/auth failure all fail closed without a write, navigation, or
  invented success.

**Forbidden actions / hard gates.**

- No write from query, routing, adapter read, narration, result/candidate rendering, link/handoff,
  Review, hover/focus, dialog Cancel, telemetry, refresh, or background lifecycle.
- No model executor, prose/Markdown/HTML parsing into an action, free-form tool call, client actor/
  authority/source/assignee/kind/task type/idempotency, or model-supplied action field.
- No workflow-run start/cancel from the assistant, implicit process start on submit, or guessed
  process/source mapping. Owning Process pages keep explicit run controls.
- No generic approval record, approval/denial/assignment/snooze/bulk/high-risk decision, S83 mirror,
  role/Space claim, other-user task, manual/source-less task, or automatic work-session start.
- No provider/source write, external effect, RentCast call, Gmail draft/reply/label/message/send,
  notification send, operating-Sheet/RentVine write, new/open Action Registry key, or runtime grant.
- No durable assistant proposal/execution/transcript store, token or preview in a URL/log/model,
  retention invention, deletion/overwrite of Work history, false Undo, or success without exact task
  and activity readback.
- No autonomous, scheduled, repeated, bulk, or model-triggered action, and no sample/synthetic/test
  identity or data in a live task.

**Dependencies / sequencing.**

S88-S92 first provide the read-only result and exact S91 renewal source/item contract; S85/S86 may
build their visual/dialog primitives independently. S94 is then implemented exactly once before S93:
strict fixtures represent S93's reserved terminal action slot while S94 supplies the stateless token/
projector/Review/Confirm backend with no UI exposure. S93 subsequently implements the complete stream/
UI exactly once against the real S94 contract and renders candidates, exact review, confirmation,
receipt, and recovery. One integration verification gate follows; it is not another S94 execution.
S95 cuts over only after that gate. S83 is a green prerequisite in the integrated queue and owns the
access handoff; an absence fixture proves fail-closed rollback compatibility but cannot satisfy the
final handoff gate. Task creation remains independently unavailable only when its own exact source,
actor, configuration, or Work contract fails. S92 is never imported by S94.

Implement S94 internally in this order: closed manifest and source-index contract; token config and
candidate projector; strict stateless Review; trusted expected-source/idempotency extension and exact
Work comparison; Confirm/readback/recovery; inert access/approval handoff parity; bodyless telemetry;
then strict S93-slot fixtures. Do not expose `Create my task` until S93 later integrates it and S94's token configuration, exact Work owner,
readback, conflict, and local-refusal tests are green.

**Standalone delivery contract.**

- **Deliverable now:** Closed one-kind manifest; max-20/128-KiB projection contract; purpose-specific
  active/previous-key compact token service; source-index read; strict stateless Review/Confirm APIs
  with exact HTTP mappings; exact preview/hash; trusted Work expected-source and server-idempotency
  boundary; task/activity readback and every response state; inert handoff registry; bodyless
  count-independent metrics; injected-store/config, concurrency, injection, privacy, zero-effect,
  and preservation tests capable of `ALL_GATES_GREEN`.
- **Consumes, but does not assume:** S88/S91 exact result bindings and S93 terminal slot. With a
  predecessor absent, fake strict fixtures prove this suite; runtime exposes no candidate rather than
  inventing a query registry/source. S83/domain request absence is typed handoff-unavailable.
- **Externally blocked effect:** Production candidate exposure requires both the dedicated
  `ASSISTANT_ACTION_TOKEN_KEY` and distinct `ASSISTANT_ACTION_IDEMPOTENCY_KEY` to be separately Secret
  Manager-bound and read back; `ASSISTANT_ACTION_TOKEN_PREVIOUS_KEY` remains optional and rotation-
  only; `ASSISTANT_ACTION_ISSUANCE_MODE` must read back as `enabled` after any required drain. Until
  both required bindings and the mode pass readback, AC-S94-2's live configuration/exposure evidence
  is `BLOCKED`, while the injected implementation and read-only assistant remain green. No provider,
  client-send, source-write, or role-grant proof belongs to this suite.
- **Produces for downstream suites:** Stable candidate, Review, confirmation, response-state,
  task-receipt, action-telemetry, and inert handoff contracts for S93/S95, plus evidence that query,
  model, approval, Process, and provider boundaries remain non-authoritative.

**Verification and delivery contract.**

1. Before implementation edits, record current Ask capture/run coupling, Work public caller-key and
   existing-id replay behavior, source/version/create/activity/readback, retention, both missing
   required action-key configs, issuance mode (plus optional previous-key state), S83 state, approval ownership, and
   zero-write/provider-effect baselines. Fail-first only the exact new S94 gaps.
2. Run focused manifest/cap/order, cryptography/config/rotation/expiry, strict schema, role/Space/
   environment, source/task index, Review zero-write, preview/hash, same-source concurrency,
   idempotency collision, response-loss/readback, handoff, injection, telemetry, and no-effect checks.
   Keep Work/query/approval/provider preservation suites separate.
3. Run `bash scripts/verify.sh`, inspect the mechanical diff and protected paths, and audit secrets,
   PII, runtime bindings, public versus trusted schemas, receipts, retention, route authorization,
   action gates, and rollback before any authorized delivery.
4. Report `ALL_GATES_GREEN` only when every supported app-owned path and refusal/preservation gate
   passes. Missing Production binding/readback for either required action key or an enabled issuance
   mode blocks only live candidate exposure and must not be reported as implemented or bypassed;
   absence of the optional previous token key is not a blocker outside a rotation window.
5. Report one implementation terminal state: `ALL_GATES_GREEN`; `BUDGET_EXHAUSTED` only if a future
   user supplies an explicit budget; or `BLOCKED` only for one exact unavailable input/authority after
   every independent fail-closed path is complete. Production candidate exposure remains a separately
   named configuration check until both required secrets are bound and read back.

**Ordered prompt sequence.**

1. Re-verify current Ask, S88-S93, Work source/create/idempotency/readback/retention, S83/approval,
   environment, config, and provider/action boundaries.
2. Materialize fail-first closed-manifest, max-20, token/rotation, stateless-review, exact-confirm,
   same-source concurrency, collision/readback, handoff, telemetry/privacy, and zero-effect tests.
3. Build pure contracts and crypto first, then bounded reads, then the trusted Work extension and one
   confirmed internal write; keep model, process, generic approval, and provider writers unreachable.
4. Falsify every actor/source/version/environment/token/concurrency/response-loss state, run focused
   and canonical gates, update present-truth docs only after readback, and ship only when authorized.

**Deletion/merge recommendation.**

Remove S94 from the active tree only after the closed action kind, sealed stateless Review/Confirm,
one-task idempotency/readback/recovery, inert access/approval handoffs, bodyless telemetry,
configuration/readback, zero-model/process/provider boundary, and preservation checks are represented
by committed code/tests and current facts. Merge enduring assistant action rules into the Work and
engineering contracts; do not merge action authority into S88 routing or S92 narration.
