<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: dashboard-assistant-v1 -->

# S90 — Assistant work, approval, and access read adapters

> Status: Specified and not implemented. Current My Work, Approval Queue, authenticated-session, and
> deployed S83 access-request services exist, but the current Ask pipeline does not query them.

**Goal.**

Let a signed-in staff user ask what work is blocked or due, what decisions need their approval, what
requests they are waiting on, and what access they currently have, and receive one permission-scoped,
deep-linked, completeness-labelled result derived from the owning application services rather than
from model inference.

**Current state / intended end state.**

`GET /api/work?view=mine` already returns `{ snapshot: WorkAccountabilitySnapshot }` for the actor,
including task state, due time, next action, blocker reason, current session, server time, and
truncation truth.
`resolveApprovalsState` returns the merged `Needs your decision` projection, but its underlying gather
can currently convert a failed read into an empty list. The authenticated session exposes one global
role and optional Space scopes. Current Ask uses none of those sources. Its separate app-state route
knows only `approvals`, `connections`, and `coverage`, and it cannot distinguish an approval-source
outage from a real zero.

The intended adapters call the same actor-scoped domain services as their owning pages, preserve
empty versus partial versus unavailable truth, and return S88 evidence envelopes with S88 canonical
link references. Exact operational answers remain useful without a model. The deployed S83 contract
supplies access/request truth to that adapter; it does not become a second role authority or generic
approval system.

**Actors and entry conditions.**

- A managed Editor, Approver, or Admin with `read` may query their own work and current session
  access. The server derives the actor from the authenticated session; the request cannot name a uid.
- Approval results contain only items the existing queue/renewal visibility contracts permit the
  actor to see. Approval/denial capability is reported separately from visibility.
- A current session with valid claims can answer current role and Space reach. Deployed S83 supplies
  its effective-access projection without representing current session truth as a newer Firebase
  directory grant.
- The adapter uses S83 to list the actor's submitted access requests and offer the exact access-
  request destination. A rollback fixture in which S83 is absent yields a typed unsupported
  dependency for that subquery, not an invented empty history.
- A source outage, capped My Work snapshot, or failed approval-family read is a partial/unavailable
  entry condition and cannot produce `Nothing is waiting` or `All clear`.

**What it is / how it functions.**

### Closed query catalog

S88 registers these exact adapter intents and no free-form database query:

| Intent                           | Example language                                         | Authoritative result                                                                                                                                            |
| -------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `work.blocked`                   | `What work is blocked?`, `What is stopping my tasks?`    | The actor's nonterminal My Work tasks whose exact state is `Blocked`, with stored blocker reason, next action, source status, and canonical task destination.   |
| `work.today`                     | `What should I work on today?`, `Show my daily work`     | Current active session, open tasks due on or before the resolved local date, blocked tasks, and a count/link for remaining future or undated open work.         |
| `approval.needs_my_decision`     | `What needs my approval?`, `What decisions are waiting?` | An availability-aware projection over the same owning queue and renewal source services used to build their decision surfaces, with eligibility stated per row. |
| `approval.my_submitted_requests` | `What approvals am I waiting on?`                        | Only requester-visible statuses supplied by an owning domain request service; S83 access requests are the initial supported family.                             |
| `access.mine`                    | `What role do I have?`, `What can I access?`             | Current authenticated role and Space representation plus deployed S83 capability labels and request handoffs.                                                   |

The deterministic router combines `work.today` and `approval.needs_my_decision` only for S88's
registered broad phrase family such as `What needs my attention today?`; `What is my work today?`
routes to `work.today` alone. A composite renders the domains as separately named groups. An approval
item is never converted into a My Work task, and a My Work task is never described as an approval. An
ambiguous phrase such as `What am I waiting on?` asks whether the user means their submitted requests
or items waiting for their decision unless only one interpretation is made explicit by the rest of
the question.

### My Work adapter

The adapter invokes the owning server service equivalent of
`WorkAccountabilityStore.listSnapshot(actor, "mine")`; it does not fetch a team snapshot and filter
it afterward. It preserves `server_now`, `record_limit`, and `may_be_truncated` in the evidence
envelope. The business date is derived from `server_now` in `America/Chicago`, matching the product's
explicit Kansas City time-zone usage. The model never performs date arithmetic.

The current mine snapshot intentionally includes historical tasks recovered through the actor's
past sessions, including records later reassigned to someone else. For current-work queries, the
adapter treats a task as assigned only when its id is present in `editable_task_ids` and its current
`assignee_uid` is the actor. Historical/noneditable rows are excluded from due, blocked, other-open,
and counts. The one exception is an exact current active session owned by the actor: its task may be
shown as `Active now` with `Historical/noneditable context` when assignment changed, but it receives
no task-mutation or duplicate-task candidate.

`work.today` groups results in this order:

1. `Active now`: the exact current active session and its task, when present;
2. `Due or overdue`: nonterminal currently assigned/editable tasks whose present `due_at` local calendar date is today
   or earlier;
3. `Blocked`: other currently assigned/editable tasks with exact state `Blocked`; and
4. `Other open work`: a count plus the canonical My Work link for future-due or undated nonterminal
   currently assigned/editable work. V1 has no `all open work` expansion intent; the user follows the
   canonical My Work link for the full list.

The same task appears once, in the earliest applicable group. Terminal `Completed` and `Cancelled`
tasks are excluded unless explicitly supported by a future catalog entry. An absent due date remains
`No due time`; the adapter does not make it due today. `work.blocked` requires exact `Blocked` state;
it does not infer blockage from age, material fields, inactivity, a paused session, or model text.
Every linked task carries a verified stable task id and an allow-listed `/work#work-task-<id>` route
reference. It also carries the owning source resolver's verified canonical `source_link` as a
separate S88 route ref when available, so the user can open the exact record that supplies blocker/
next-action context rather than stopping at the task card. The destination reauthorizes on open. If
the owning source reference is missing, stale, unverified, or has no allow-listed route, the row says
`Linked source unavailable`, omits that link, retains the task link, and offers no source-derived
action candidate.

If `may_be_truncated` is true, the response is `partial`, states that the scan reached its limit, never
claims a portfolio-wide count, and links to My Work for narrowing. Store failure is `unavailable`.
A successfully read snapshot with zero matching rows is S88 `complete` with `matched_count=0` and
names the applied date or state filter; it does not introduce a separate empty envelope state.
Each Work or approval adapter returns at most 50 rows under S88's V1 adapter ceiling, preserves a
known total only when its source read is complete, and marks a larger match `partial` and truncated.
The access adapter is a fixed single actor projection and never uses the row allowance to enumerate
other users.

### Approval adapters

Refactor the merged needs-decision gather behind a typed source-outcome contract before using it for
assistant completeness. Each contributing source returns `complete` with an explicit matched count
(including zero) or `unavailable`, plus its as-of time. Compatibility callers may keep their nonfatal
rendering, but the assistant consumes the richer outcome and reports `partial` when any required
source failed. It must not translate a caught exception into zero decisions.

The current Approval Queue page assembles its own feeds; `gatherNeedsDecisionInbox` is the shared
outside-the-queue projection and is not the queue page's authoritative resolver. S90 therefore does
not claim that its present row array can simply be reused as the Approval Queue result. It extracts a
typed, availability-aware source layer beneath the projections, then builds the assistant rows with
the same visibility, de-duplication, status, severity, and canonical-link rules. Parity tests compare
the assistant projection with each owning surface for the same frozen source receipts. The source
layer may run the exact actor-scoped Firestore and provider reads already required by
`listApprovalQueue`, `loadRenewalRunViews`, and their owning read services. It may not add an ad hoc
provider query, broaden a provider request, or perform a provider write or other effect.

`approval.needs_my_decision` returns only visible items and their canonical owning links. It states
whether the actor can decide the row now or only inspect/route it; it does not expose a disabled
Approve control in generated prose. Opening the link reauthorizes the actor. Counts, labels, ids, and
existence of filtered-out items never enter the evidence envelope or model context.

`approval.my_submitted_requests` is an aggregation of explicit requester-history services, not a
query over all generic queue items. Initially it consumes S83's own access-request history. A future
domain may register only after it supplies requester visibility, stable status, source version, and
an owning detail route. If no family is registered, the router returns S88 terminal `unsupported`
with `Submitted approval history is not available for this request.`; no adapter runs and this is not
a complete zero-match list. S88 owns that exact router-level copy as
`assistant.approval_history_unsupported`; S90 does not fabricate a domain group/notice when no family
exists.

### Access adapter

In the required S83-absent rollback/compatibility state, `access.mine` reports exactly:

- the current session role (`Editor`, `Approver`, or `Admin`);
- the optional exact Space-scope claim, or `All spaces` only when the claim is absent under the
  current session contract; and
- `Session access can remain unchanged until your sign-in session refreshes after an Admin update.`

It does not infer a plural role list, individual capability override, renewal authority, action-key
readiness, provider access, or another user's claims. In the current deployed baseline, the adapter consumes S83's
`AccessEffectiveProjectionV1`: current-session authority facts, catalog-derived capability labels,
and directory comparison state. It never substitutes newer directory claims for the current ID-token
role/Spaces or says a newly applied grant is usable before authentication refresh. Request history is
queried only by `approval.my_submitted_requests`; it never
changes `access.mine` completeness or items. S83 remains sole owner of request creation,
approval, denial, merged claim mutation, readback, and reconciliation.

### Closed result-group and item manifests

S90 registers the following exact S88 group keys. A registration may emit only the groups listed for
its intent, in the listed order; a zero-match complete group is retained with no items. Unknown keys
or an item placed in the wrong group fail the adapter envelope.

| Intent                           | Ordered `group_key` values                                                  |
| -------------------------------- | --------------------------------------------------------------------------- |
| `work.today`                     | `work.active_now`, `work.due_or_overdue`, `work.blocked`, `work.other_open` |
| `work.blocked`                   | `work.blocked`                                                              |
| `approval.needs_my_decision`     | `approval.needs_my_decision`                                                |
| `approval.my_submitted_requests` | `approval.my_submitted_requests`                                            |
| `access.mine`                    | `access.mine`                                                               |

Every listed key also has one exact S88 `AssistantResultGroupV1.label`; request wording, item
content, dates, counts, and source state never change it.

| `group_key`                      | Exact `label`           |
| -------------------------------- | ----------------------- |
| `work.active_now`                | `Active now`            |
| `work.due_or_overdue`            | `Due or overdue`        |
| `work.blocked`                   | `Blocked work`          |
| `work.other_open`                | `Other open work`       |
| `approval.needs_my_decision`     | `Needs my decision`     |
| `approval.my_submitted_requests` | `My submitted requests` |
| `access.mine`                    | `My access`             |

An unknown or altered key/label pairing fails the adapter envelope.

The public `applied_filters` registry is also closed. Each emitted group uses exactly the records in
this table, in order; the top-level result performs S88's stable first-occurrence de-duplication. A
date is the exact server-derived `YYYY-MM-DD` business date. No other S90 filter is public in V1.

| Intent / groups                  | Ordered filters                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| every `work.today` group         | `business_date`, label `Business date`, ISO-date value; then `time_zone`, label `Time zone`, value `America/Chicago` |
| `work.blocked` / `work.blocked`  | `task_state`, label `Task state`, enum value `Blocked`                                                               |
| `approval.needs_my_decision`     | empty array                                                                                                          |
| `approval.my_submitted_requests` | empty array                                                                                                          |
| `access.mine`                    | empty array                                                                                                          |

S90 may emit only the following S88 notices. Each row freezes the code, kind, exact message, recovery
requirement, and trigger. The recovery route is built in the same group registry and is required
exactly where named.

| Code                                 | Kind          | Exact message                                                                             | Recovery destination                 | Exact trigger                                                                     |
| ------------------------------------ | ------------- | ----------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| `work.snapshot_truncated`            | `truncated`   | `My Work scan reached its record limit and may be incomplete. Open My Work to narrow it.` | `/work` required                     | the owning mine snapshot has `may_be_truncated=true`                              |
| `work.result_truncated`              | `truncated`   | `More My Work items match. Open My Work to see the full list.`                            | `/work` required                     | a complete source match exceeds the S88 returned-item ceiling                     |
| `work.source_unavailable`            | `unavailable` | `My Work is temporarily unavailable.`                                                     | `/work` required                     | the owning mine snapshot read is unavailable                                      |
| `approval.source_partial`            | `partial`     | `Some approval sources are unavailable, so this list may be incomplete.`                  | `/approval-queue` required           | at least one required decision source is unavailable while another remains usable |
| `approval.source_unavailable`        | `unavailable` | `Approval items are temporarily unavailable.`                                             | `/approval-queue` required           | every required decision source is unavailable                                     |
| `approval.result_truncated`          | `truncated`   | `More approval items match. Open Approval Queue to see the full list.`                    | `/approval-queue` required           | a complete decision-source match exceeds the S88 returned-item ceiling            |
| `approval.history_unavailable`       | `unavailable` | `Submitted request history is temporarily unavailable.`                                   | `/admin/access#my-requests` required | S83 is registered and authorized but its own-history read is unavailable          |
| `approval.history_truncated`         | `truncated`   | `More submitted access requests exist. Open My requests to see the complete history.`     | `/admin/access#my-requests` required | S83's first requester-history page returns `has_more=true`                        |
| `access.current_unavailable`         | `unavailable` | `Current access is temporarily unavailable.`                                              | `/admin/access` required             | authenticated claims/effective-access projection cannot be verified               |
| `access.session_refresh_required`    | `information` | `Your access was updated. Sign out and back in to use the latest access.`                 | `/admin/access` required             | S83 projection has `directory_sync_state=refresh_required`                        |
| `access.directory_check_unavailable` | `partial`     | `Current session access is shown. Newer access changes could not be checked.`             | `/admin/access` required             | S83 projection has `directory_sync_state=unavailable`                             |
| `access.details_truncated`           | `truncated`   | `Some access details are summarized. Open Access to review the complete list.`            | `/admin/access` required             | deployed-S83 effective-access labels require byte compaction                      |
| `access.session_details_truncated`   | `truncated`   | `Some Space access details are summarized.`                                               | none                                 | S83-absent compatibility-only session Space labels require byte compaction        |

If a condition does not match one row, S90 emits no substitute notice. Multiple legal notices use
the table order after group order and exact-code de-duplication. Complete zero results carry no
unavailable/truncated notice. Unknown code/kind/message/template value, missing or extra recovery,
or customer/source/error text fails the adapter envelope.

The discriminated `AssistantResultItemV1.data` projections are closed as follows. All strings are
trimmed, NFC-normalized plain text with control/bidi-override characters rejected and with the
owning source's current field bound applied before S88's 4-KiB item cap. `null` is serialized where
listed; omission is not a third state. Stable task, request, queue, run, lease, source, actor, or
Space ids never appear in `data`; they remain behind server-built route refs and result-local refs.

- `work_task` is legal in `work.active_now`, `work.due_or_overdue`, and `work.blocked`. Its data has
  exactly `title` (1-160 JavaScript UTF-16 code units), `task_type` (1-100 UTF-16 units), `state` (one current
  `WorkTaskState`), `next_action` (1-240 UTF-16 units), `due_at` (ISO offset date-time or `null`),
  `blocker_reason` (1-500 UTF-16 units or `null`), `source_type` (one current
  `WorkSourceType`), `source_status` (`verified|unverified`), `assignment_context`
  (`current_assigned_editable|active_historical_noneditable`), and `active_since` (the exact current
  session `effective_start_at` ISO offset date-time or `null`). `active_since` is non-null only in `work.active_now`;
  `active_historical_noneditable` is legal only there and never receives a mutation candidate.
- `work_open_aggregate` is legal only in `work.other_open`. Its data has exactly `count`
  (nonnegative integer) and `scope: "future_or_undated_open_current_assignment"`. It is emitted only
  when the actor-owned snapshot is complete and that exact count is known. A capped/partial snapshot
  emits no aggregate item, retains the partial group notice and My Work recovery route, and never
  substitutes a returned-page count.
- `approval_decision` is legal only in `approval.needs_my_decision`. Its data has exactly
  `decision_kind` (`queue_item|renewal_flag|writeback`), `label` (1-160), `detail` (1-240),
  `severity` (`High|Blocked|Medium|Low`), and `decision_capability`
  (`may_decide_on_owning_surface|inspect_or_route_only`). The capability is calculated from the
  owning domain's current actor check; it does not authorize an inline assistant decision.
- `submitted_access_request` is the only V1 item kind in
  `approval.my_submitted_requests`. It is registered only with S83 and has exactly `intent_kind`
  (`capability|role|spaces`), `intent_label` (S83's immutable request-time catalog-label snapshot,
  1-160 code points), `state`
  (`pending|applying|applied|denied|cancelled|superseded|reconciliation_required`), `updated_at`
  (ISO offset date-time), and `outcome_summary` (the exact non-null 1-240-code-point state message
  owned by S83). It never carries a requester/Admin reason. A future request family requires a new
  versioned item kind and manifest change; it cannot
  serialize an arbitrary queue record through this kind.

`approval.my_submitted_requests` consumes exactly S83's first 50-record requester-history page and
never follows its cursor. `has_more=false` permits a complete group with exact match count;
`has_more=true` makes the group `partial` and `truncated`, sets `matched_count=null`, and adds exactly
`approval.history_truncated` plus the canonical My requests recovery. It never substitutes 50 as the
total. A page read failure remains `approval.history_unavailable`, not a zero or truncated result.

- `session_access` and `effective_access` are the only item kinds in `access.mine`, and exactly one
  item is returned. `session_access` is the S83-absent rollback projection with exactly `role`
  (`Editor|Approver|Admin`), `space_access` (`{ kind: "all_spaces" }` or
  `{ kind: "named", labels: string[] }` with 0-50 distinct 1-120-code-point labels retained in
  canonical registry order), `space_labels_truncated` (boolean; `false` for `all_spaces` and when
  every named label is present), and
  `detail_scope: "role_and_spaces_only"`. `effective_access` is the normal deployed-S83 projection and has exactly
  the same `role`, `space_access`, and `space_labels_truncated` fields plus `capability_labels` (the
  retained canonical-order labels from the exact current S83 catalog entries for which
  `can(role, capability)` is true; the source subset contains 0 through 7 distinct
  1-120-code-point labels and is never the full catalog merely because all seven entries exist),
  `capability_labels_truncated` (boolean), and
  `authority_source: "current_session"`,
  `directory_sync_state: "matched" | "refresh_required" | "unavailable"`, and
  `detail_scope: "effective_access"`. The role, Space labels, and capability labels always describe
  the same current session. Neither form contains a uid,
  email, action key, provider readiness, or another user's request.

For a named-Space item, an empty `labels` array is legal only when
`space_labels_truncated=true`; otherwise named access retains at least one label. The producer first
collects the complete authorized source lists within their 50/7 cardinality bounds. It serializes the
exact item `data` with UTF-8 `JSON.stringify`; while the result exceeds S88's 4,096-byte ceiling, it
removes the last Space label and reserializes until the Space list is empty, then removes the last
capability label until the item fits. The applicable truncation flag turns true on the first removal.
The fixed scalar/empty-list form must fit by boundary fixture, so the producer never clips a label,
splits a Unicode code point, removes role/scope truth, or emits an over-limit item.

Any byte-driven removal makes the group `partial`. An `effective_access` result adds exactly
`access.details_truncated` and its Access recovery; the compatibility-only `session_access` result
adds exactly `access.session_details_truncated` without inventing an unavailable S83 route. The item is exhaustive
only when both applicable truncation flags are false. The route remains the authoritative complete
view when compaction occurred. A consumer validates both the discriminated fields/flags and final
4-KiB byte bound; a field-valid but un-compacted oversized combination is not a legal producer output.

For an otherwise complete `effective_access` item, `directory_sync_state=matched` adds no access
notice and leaves the group complete; `refresh_required` adds exactly
`access.session_refresh_required` but remains complete for the question of current usable access;
`unavailable` makes the group partial and adds exactly `access.directory_check_unavailable` while
retaining verified current-session facts. Invalid or unavailable current-session claims instead emit
no item and use `access.current_unavailable`; directory values are never used as a fallback.

Every item has the supporting S88 evidence refs and only the route refs permitted for its kind:
`work_task` may reference its My Work task and verified source; `work_open_aggregate` may reference
My Work; `approval_decision` may reference only the owning decision detail;
`submitted_access_request` may reference only S83's `/admin/access#my-requests` owning region; and access items may
reference the deployed `/admin/access` route only through S83's direct guard. There is no unowned generic
row URL, provider URL, model-authored recovery, or request id in the URL. Multiple request rows may therefore
share the same owning-region route; S93 renders each row's current safe summary before that handoff.

Group-level `route_ref_ids` are also closed. Every `work.*` group references the canonical My Work
surface; `approval.needs_my_decision` references the Approval Queue; the S83-backed submitted-request
group references only `access.my_requests`; the deployed-S83 effective-access group references only
`access.home`; and the S83-absent rollback `session_access` has no group route.
These refs remain valid for complete-empty groups and are the only owning-surface links the renderer
may add outside an item. An unavailable/denied dependency uses its typed recovery notice instead of
silently adding a different group destination.

S90 registers exactly these S88 destination keys. Labels are literal server-authored copy; every
dynamic segment first passes the current `normalizeOpaqueId` grammar
`^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$` and is then encoded as one component. No stored `direct_link`
is copied through. A current owning link outside this table leaves the row as escaped text with its
supporting evidence and the group-level owning route; it cannot widen the registry.

| `destination_key`                 | Exact label                   | Typed builder / eligibility                                                                                                          |
| --------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `work.home`                       | `Open My Work`                | fixed `/work`; every `work.*` group and its aggregate/recovery notices                                                               |
| `work.task`                       | `Open My Work task`           | `/work#work-task-{encoded task id}`; one actor-visible task                                                                          |
| `work.source.workflow_run`        | `Open workflow run`           | `/workflow-runs/{encoded source id}` only for verified `workflow_run`                                                                |
| `work.source.renewal_lease`       | `Open lease renewal`          | `/lease-renewal/live/desk/lease/{encoded source id}` only for verified `renewal_lease`                                               |
| `work.source.maintenance_ticket`  | `Open maintenance ticket`     | `/maintenance?ticket_id={encoded source id}` only for verified `maintenance_ticket`                                                  |
| `work.source.approval_item`       | `Open approval item`          | `/approval-queue?item_id={encoded source id}` only for verified `approval_item`                                                      |
| `approval.home`                   | `Open Approval Queue`         | fixed `/approval-queue`; the needs-decision group and its recovery notices                                                           |
| `approval.queue_item`             | `Open approval item`          | `/approval-queue?item_id={encoded queue item id}` for an actor-visible `queue_item`                                                  |
| `approval.renewal_run`            | `Open renewal review`         | `/lease-renewal/runs/{encoded run id}` for a visible `renewal_flag` or `writeback` row                                               |
| `approval.renewal_reconciliation` | `Open renewal reconciliation` | `/lease-renewal/runs/{encoded run id}/reconciliation/{encoded field key}` only when the owning renewal mapping proves both ids       |
| `approval.process_definition`     | `Open internal process`       | `/processes/{encoded definition id}` only for a queue item produced by the current process-definition review owner                   |
| `approval.vendor_admin`           | `Open vendor review`          | fixed `/admin/vendors` only for a queue item produced by the current vendor-lifecycle approval owner and an actor authorized on open |
| `access.home`                     | `Open Access`                 | fixed `/admin/access`, using the deployed S83 direct-route/guard contract                                                            |
| `access.my_requests`              | `Open my access requests`     | fixed `/admin/access#my-requests`, using the same deployed S83 guard                                                                 |

`manual` Work sources deliberately have no destination key. `approval.my_submitted_requests` uses
only `access.my_requests`; normal `access.mine` uses only `access.home`; and no access route is
registered for the S83-absent rollback `session_access`. Registry parity tests enumerate every table row, reject an
unknown key/label/builder combination, and prove each item/group/notice kind can reference only the
keys stated here.

### Results, links, and model boundary

Each adapter produces the S88 structured group contract: stable adapter/version, interpreted filters,
coverage state, source outcomes/as-of times, total/returned counts, truncation, minimized rows,
canonical route references, and recovery. S93 decides presentation and new-tab behavior. S92 may
narrate those already-authorized facts, but it cannot choose a task, approval, user, role, scope,
date, status, count, link, or action. A narration failure leaves the deterministic groups intact.

**In scope / out of scope.**

In scope: actor-owned My Work reads; blocked/today definitions; explicit date/time-zone semantics;
availability-aware decision reads; requester-history registration; current-session access; S83
effective-access integration; canonical record links; complete/partial/empty/unavailable behavior;
minimized model facts; tests across role, Space, source, date, and truncation states.

Out of scope: team-work or other-user reads; productivity scoring; inferred urgency; recurring or
push reminders; generic approval creation; approval/denial; task creation or mutation; role/Space
grant; action-key/provider readiness inference; Gmail bodies; arbitrary collection queries; renewal
query behavior (S91); UI/streaming (S93); action proposals (S94).

**Open questions & assumptions.**

- Decision: `my work today` returns current/due/blocked My Work only. The broader registered
  `needs my attention today` family may compose that result with decisions, in separately labelled
  authoritative groups and never as one blended priority score.
- Decision: due/overdue uses `America/Chicago` calendar dates from the server clock. Missing dates
  stay undated and are never guessed.
- Decision: `What approvals am I waiting on?` means requester-visible domain requests, while `What
needs my approval?` means items awaiting the actor's decision. The assistant asks a clarification
  when the wording does not distinguish them.
- Decision: normal access answers use deployed S83 current-session/effective-access truth. In the
  required S83-absent rollback fixture, submitted requests and exhaustive capability explanations
  remain unavailable rather than guessed.
- Assumption: the existing stable `work-task-<id>` anchor remains the canonical My Work record
  destination. If an owning My Work route contract replaces it, S88's route-manifest parity check
  must update atomically.

**Cross-product impacts.**

My Work snapshot service and record anchors; merged decision sources and Approval Queue links;
current session role/Space projection; deployed S83 effective-access catalog plus requester history
owned only by `approval.my_submitted_requests`; S88 intent/adapter/link
contracts; S92 narration; S93 result UI; S94 proposals; bodyless assistant telemetry. Existing exact
owning provider reads may occur while resolving renewal decisions. No provider write, new provider
query class, source write, queue transition, role change, or production data migration is added.

**Authority and evidence map.**

| Input                                                              | Classification                   | Use and limitation                                                                                                                                       |
| ------------------------------------------------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router, `docs/facts.md`, current auth/work/approval code and tests | Authority / implementation truth | Establish roles, Space filtering, current task schema, actor-owned snapshots, approval visibility, and permanent no-model-triggered-effect boundaries.   |
| S83                                                                | Deployed prerequisite            | Owns effective access, access requests, Admin review, claim changes, request history, and the guarded Access destinations consumed here.                 |
| S88, S89, S92-S95                                                  | Active bundle contracts          | Own query envelopes/links, telemetry, narration, presentation, action proposals, and final Dashboard composition without duplicating this adapter logic. |
| Current Dashboard AI integration notes                             | Intent evidence                  | Require blocked/daily work, approvals, and role answers; do not authorize arbitrary reads, automated reminders, approvals, grants, or writes.            |
| A future domain requester-history service                          | Missing dependency               | Must supply explicit requester visibility/status/version/route before that approval family can register.                                                 |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S90-1** — A closed, versioned adapter manifest registers exactly the five named intents,
  their actor requirements, source service, filter schema, terminal states, and canonical route
  builders. Inventory checks fail on an unregistered operational resolver or a client-supplied uid.
- **ARCH-S90-2** — My Work reads only `listSnapshot(actor, "mine")`, derives local-date groups from
  `server_now`, preserves record-limit/truncation/source truth, deduplicates by stable task id, and
  emits no mutation or provider effect. Decision reads may invoke only the exact bounded owning
  provider reads declared above.
- **ARCH-S90-3** — The needs-decision gather exposes per-source availability so valid zero, partial,
  and unavailable outcomes are distinct; no caught source error can become an all-clear answer.
- **ARCH-S90-4** — Current access comes from authenticated claims and, only after implementation,
  S83's effective-access/catalog projection. Its values remain current-session authority; the fresh
  directory read contributes only the exact matched/refresh-required/unavailable comparison state.
  Requester history remains a separate approval intent.
  Role, capability, Space, action-key, and provider conditions remain
  separate typed facts.
- **ARCH-S90-5** — Every row validates against the closed group/item/data manifest before optional
  narration and references only an S88 allow-listed stable route. Authorization occurs before row
  construction and again at the owning destination.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S90-1** — A user asking for blocked work sees only their exact `Blocked` tasks, each with its
  stored blocker, next action, source state, and a working My Work link; no inferred blocker appears.
- **BEH-S90-2** — A user asking what to do today sees active, due/overdue, blocked, and remaining-open
  truth under explicit Kansas City date semantics, without treating undated or future work as due.
- **BEH-S90-3** — Decision and submitted-request questions produce different labelled results;
  ambiguity asks for clarification, and missing submitted-history support is not reported as zero.
- **BEH-S90-4** — Current role/Space answers describe only the signed-in actor and distinguish session
  truth from S83-verified request/catalog truth.
- **BEH-S90-5** — A failed or capped source produces partial/unavailable guidance and a safe owning
  destination; the deterministic rows remain usable when the model is down.

**Human litmus outcome.**

### Find what is blocking today's work

**If this was built correctly:** A staff member asks what is blocked or due today and receives short,
separate lists that match My Work, with the stored reason and next action on each row. Opening a row
lands on that exact task, and a source failure is plainly different from having nothing assigned.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Distinguish decisions from requests

**If this was built correctly:** A user can ask both `What needs my approval?` and `What approvals am I
waiting on?` and sees, respectively, decisions assigned to them and requester-visible statuses. The
assistant never claims a generic approval exists when the application has no owning request flow.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Understand current access without overclaiming

**If this was built correctly:** A user sees one current role and exact Space reach, understands when
the value reflects their current session, and can use S83's request handoff only when that workflow
exists. No closed provider action is presented as a missing role.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                | Architecture outcome | Behavior outcome | Human litmus                        | Deterministic evidence / falsification                                                                                  |
| ------------------------------------------ | -------------------- | ---------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Actor-owned blocked and today work         | `ARCH-S90-1/2/5`     | `BEH-S90-1/2/5`  | Find what is blocking today's work  | Role/Space/date/task-state/truncation fixtures plus service/provider spies and task-anchor route checks.                |
| Truthful decisions and requester histories | `ARCH-S90-1/3/5`     | `BEH-S90-3/5`    | Distinguish decisions from requests | Per-family success/empty/error combinations, visibility fixtures, ambiguity grammar tests, and unsupported-family test. |
| Current access and S83 integration         | `ARCH-S90-1/4/5`     | `BEH-S90-4/5`    | Understand current access           | Role x Space x S83-present/absent/stale-session tests and no-other-user/no-action-key leakage sentinels.                |
| Model-independent operational truth        | `ARCH-S90-2/3/4/5`   | `BEH-S90-1/3/5`  | All                                 | Model outage/malicious-output fixtures preserve byte-equivalent structured groups and server-owned links.               |

**Preservation set.**

Keep current My Work source verification, assignment restrictions, state transitions, idempotency,
activity history, record limits, and time/session truth; Approval Queue visibility, risk, scope,
transition, and renewal-decision contracts; authenticated domain/role/Space guards; S83's deployed
catalog and claim lifecycle; S86 interaction semantics; current route authorization; bodyless data
boundaries. Existing `/api/work`, Approval Queue, and Admin behaviors remain their owners.

**Adversarial acceptance checks.**

- **AC-S90-1** — `ARCH-S90-1/5` rejects unknown intent, client uid/role/scope, team-view substitution,
  arbitrary filters, model-authored record ids/URLs, a row the actor cannot open, and every altered
  group-key/label pairing. Producer, coordinator, renderer, zero-result, and snapshot fixtures
  preserve the exact seven-entry group-label registry.
- **AC-S90-2** — `ARCH-S90-2` and `BEH-S90-1/2` cover active, due, overdue, future, undated, blocked,
  paused, completed, cancelled, duplicate-group, daylight-saving, exactly-midnight, capped, and store-
  failure fixtures against an injected server clock.
- **AC-S90-3** — `ARCH-S90-3` and `BEH-S90-3/5` inject each approval-family outage independently and
  fail if the answer says none/all-clear, hides the partial source, leaks a hidden item/count, or
  permits a decision the actor cannot make. S83 requester-history fixtures at 0, 1, 50, and 51-plus
  records prove one page only, null total when `has_more`, the exact history-truncated notice and My
  requests recovery, and no misuse of the decision-queue truncation notice.
- **AC-S90-4** — `ARCH-S90-4` and `BEH-S90-4` cover every role and Space representation, stale-session
  copy, S83 absent/present, own/other request, and role-versus-action-key denial; no other user's
  identity or request existence crosses the envelope. ASCII and four-byte-Unicode access-label
  boundary fixtures prove exact Space-then-capability compaction, truthful flags/group state/notice/
  recovery, whole labels, and a final serialized `data` value no larger than 4,096 UTF-8 bytes.
  Session/directory equal, changed, unavailable, and invalid-session fixtures prove all displayed
  values come from one current token, refresh-required never exposes the newer grant as usable,
  directory outage is partial, and invalid session claims emit no item.
- **AC-S90-5** — Submitting any read query performs zero Firestore mutations, workflow transitions,
  queue creations/decisions, role changes, provider effects, sends, or source writes. A model outage or
  injected instruction cannot alter results, links, completeness, or access.

**Forbidden actions / hard gates.**

Do not query another user's work/access; infer productivity, due dates, blockers, roles, Spaces, or
approval eligibility; convert errors to zero; create generic approval items; approve/deny; create or
mutate tasks; start sessions/runs; request/grant access outside S83; expose Gmail bodies, customer
values not required for the row, secrets, raw provider records, or hidden counts; or let model output
author a record, URL, filter, permission, or action. No scheduled reminder, autonomous notification,
client communication, RentVine/Sheet write, or Action Registry change is authorized.

**Dependencies / sequencing.**

Re-verify deployed S83, then implement S88 and S89 first in the remaining canonical queue. S90 then ships all five intended families,
including submitted access requests, exhaustive capability labels, and the exact access handoff.
The S83-absent form remains a required rollback/compatibility refusal, not the desired queued terminal.
S92 may add narration after deterministic adapter tests pass. S93 renders the groups. S94 consumes
no S90 row as executable candidate authority: existing Work, decision, submitted-request, and access
results use only their registered owning navigation handoffs. S94's separate eligible S91 projector
may issue its own sealed candidate, and any S90 result-local ref remains presentation trace. S95
removes old Dashboard summaries only after the owning destinations and S90 result paths pass.

**Standalone delivery contract.**

- **Deliverable now:** Five closed intent registrations; actor-owned My Work and current-session
  access adapters; availability-aware decision adapter; S83 requester history for the submitted-
  requests intent and S83 effective access for `access.mine`, plus
  typed S83-absent rollback refusal;
  minimized canonical links; complete/partial/empty/error tests can reach `ALL_GATES_GREEN` without
  any provider write/effect or model availability.
- **Consumes:** the deployed green S83 effective-access contract for `access.mine` and requester-history
  contract for `approval.my_submitted_requests`. Absence remains the intent-specific typed rollback
  state, not a fabricated empty result or a reason to merge the two families.
- **Externally blocked effect:** None. Access-request creation and claim application belong to S83 and
  are not effects of this read suite.
- **Produces for downstream suites:** Versioned work/decision/request/access adapter envelopes,
  deterministic date semantics, source-availability outcomes, and verified row references.

**Verification and delivery contract.**

1. Freeze current My Work snapshot/anchor behavior, Approval Queue visibility and source-failure
   behavior, session role/Space shapes, zero write/effect counts, and the exact owning read-call
   counts used by each decision feed.
2. Add fail-first intent inventory, role/Space/date/grouping/truncation, per-source availability,
   S83-present/absent, canonical-link, privacy, and zero-effect checks before implementation edits.
3. Run focused adapter/service/route tests with injected clocks and stores; run S88/S89 contract,
   malicious-model, wrong-role/Space, and destination-reauthorization tests.
4. Run `bash scripts/verify.sh`, inspect the diff, and audit secrets/PII, auth/Space filtering,
   record/link inventories, model context, logs, runtime configuration, and action gates before any
   authorized delivery.
5. Report one implementation terminal state: `ALL_GATES_GREEN`; `BUDGET_EXHAUSTED` only if a future
   user supplies an explicit budget; or `BLOCKED` only for one exact unavailable input/authority after
   every independent fail-closed path is complete. S83-absent rollback compatibility is a typed result,
   not a custom terminal state.

**Ordered prompt sequence.**

1. Re-verify the My Work, needs-decision, authenticated-session, and S83 implementation state.
2. Materialize the closed intent manifest and failing actor/date/completeness/link/zero-effect checks.
3. Add the My Work and availability-aware approval adapters, then current-session access and the
   explicit S83 compatibility boundary.
4. Falsify every role/Space/source/date/truncation/model-failure state; run canonical verification and
   update current docs only to verified implementation truth.

**Deletion/merge recommendation.**

Remove S90 when all five intent/adapters and their S83 compatibility states are owned by versioned
code/tests, source failures cannot appear empty, links reauthorize correctly, and current docs state
only the verified deployed behavior.
