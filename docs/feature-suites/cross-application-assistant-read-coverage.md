<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: dashboard-assistant-read-v2 -->

# S101 — Deterministic cross-application assistant read coverage

> Status: Specified follow-on and not implemented. It starts only after S87 and the complete S88-S95
> V1 Dashboard assistant are deployed and verified; it does not widen or delay V1.

**Goal.**

Extend the deployed deterministic Dashboard assistant from its eight V1 question families to a
closed set of actor-scoped, read-only Maintenance, Workflow Communications, Connections, Internal
Processes, Notifications, and Admin-readiness questions, with exact owning-surface links and honest
complete/partial/unavailable state.

**Current state / intended end state.**

The S88-S95 V1 contract intentionally answers only My Work, approval, submitted-request, renewal,
access, and published-guidance questions. Current product services separately expose Maintenance
tickets, workflow-linked communications, connection classification, process definitions and runs,
the unified notification hub, and Admin readiness. Some current page loaders treat a failed
dependency as an empty array or configuration-only result so the page can continue rendering. Those
fallbacks are appropriate for a nonfatal page but cannot support an assistant claim that nothing
needs attention.

After S87 is complete, S101 adds one additive registry/manifest version and seven deterministic read
adapters over the same owning services. Each adapter preserves actor and Space filtering, source
currency, caps, and failure truth; the assistant never reads provider APIs directly. Results link to
the existing owning surface and reauthorize on open. The change adds no Dashboard region, durable
assistant memory, model tool, autonomous work, or product mutation.

**Actors and entry conditions.**

- The S88 authenticated managed-staff gate remains the first boundary. Vendor, disabled, personal,
  wrong-domain, malformed-claim, signed-out, and service identities are refused before an S101
  adapter or owning service is constructed.
- Maintenance and Workflow Communications results require the corresponding actor-visible Space.
  Process definitions/runs are filtered by their existing Space-scope rules. Notifications are the
  actor's existing personal/role-filtered feed. Connections are read-visible to managed staff but
  Admin setup detail stays Admin-only. Admin readiness requires `manageAdmin`.
- S87 and S88-S95 must be deployed and their authenticated production gates green. Rollback to the
  V1 registry leaves all eight V1 intents unchanged and makes every S101 family unsupported.
- Every query is still independent. Prior turns are not accepted as context, and no S101 phrase may
  rely on a prior result, pronoun, selected row, or hidden page state.
- A page-compatible catch-to-empty or catch-to-configuration fallback is not authoritative assistant
  evidence. Before registration, each source used by an S101 adapter must expose a typed outcome.

**What it is / how it functions.**

### Additive V2 registry and capability manifest

Create `AssistantIntentRegistryV2` as an additive version over the exact S88 V1 registry. V2 keeps
the original eight keys, matcher behavior, examples, output contracts, and S94 renewal action
boundary byte-compatible, then appends these exact keys in this order:

| Intent key                 | Exact example question                          | Owning read boundary                                                                                     |
| -------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `maintenance.attention`    | `Which maintenance tickets need attention?`     | Actor/Space-filtered Live ticket queue                                                                   |
| `communications.attention` | `Which workflow communications need attention?` | Actor-owned active workflow-communication links; renewal and maintenance lanes remain separate           |
| `connections.attention`    | `Which connections need attention?`             | Existing configuration-presence, cached-verification, and connection-lifecycle classification            |
| `processes.available`      | `Which internal processes can I open?`          | Actor-filtered process definitions and current status                                                    |
| `processes.active_runs`    | `Which workflow runs are active?`               | Actor-filtered nonterminal workflow runs                                                                 |
| `notifications.unread`     | `What unread notifications need my attention?`  | The same actor-filtered unified notification feed and current low-alarm preferences used by the bell/hub |
| `admin.readiness`          | `What Admin readiness issues need attention?`   | Admin-only, value-minimized readiness/health outcomes already assembled for the owning Admin surfaces    |

The public projection becomes `AssistantCapabilityManifestV2`. It presents all 15 keys in registry
order, retains `question_context: "independent"`, adds only the exact examples above for S101, and
keeps the V1 action sentence unchanged. S93's existing `What can I ask?` disclosure renders the
version returned by the server; no component-maintained list, promotional claim such as `Ask about
anything`, or inferred capability is allowed.

S88's representative-language corpus becomes an additive V2 corpus. Each new intent accepts its
exact example plus case, whitespace, declared filler-token, singular/plural, and punctuation variants
only. The deterministic matcher requires one exact subject family and one exact qualifier:

| Intent                     | Required subject tokens                                   | Required qualifier tokens                                                            |
| -------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `maintenance.attention`    | `maintenance ticket` or `maintenance tickets`             | `need attention`, `needs attention`, or `active`                                     |
| `communications.attention` | `workflow communication` or `workflow communications`     | `need attention`, `needs attention`, or `waiting`                                    |
| `connections.attention`    | `connection`, `connections`, `connector`, or `connectors` | `need attention`, `needs attention`, `need setup`, `needs setup`, or `not connected` |
| `processes.available`      | `internal process` or `internal processes`                | `available`, `can i open`, or `can i access`                                         |
| `processes.active_runs`    | `workflow run` or `workflow runs`                         | `active`, `in progress`, or `running`                                                |
| `notifications.unread`     | `notification` or `notifications`                         | `unread` and optionally `need my attention`                                          |
| `admin.readiness`          | `admin readiness`                                         | `issue`, `issues`, `need attention`, or `needs attention`                            |

Existing S88 normalization and filler tokens apply unchanged. A question matching two new families,
combining a V1 and V2 family, omitting the qualifier, asking for a mutation, or using `this`, `that`,
`those`, `them`, `same`, or `again` as required identity returns clarification or unsupported before
any source read. A misspelling, semantic embedding, model classification, substring match, invented
synonym, inferred customer label, or free-form status does not expand the grammar. V2 golden fixtures
include one-token additions/removals and all pairwise domain collisions.

### Shared S101 read envelope

Every S101 adapter produces the existing S88 result envelope and a typed source outcome of
`complete`, `partial`, or `unavailable`. A successful read with no matching rows is `complete` with a
zero matched count. `partial` requires an exact named source notice and owning recovery route;
`unavailable` cannot carry an all-clear summary. Every item uses an S88 allow-listed application
route reference created from a stable server-side id. Request text, stored labels, model output, and
provider payloads never create or alter a destination.

Each adapter returns at most 50 items and sorts deterministically before applying the cap. A complete
source with more matches becomes `partial`/truncated and links to the owning surface. A source whose
own list call has an unknown or implicit cap cannot claim a total. S89 request, concurrency, timing,
cancellation, minimization, telemetry, retention, abuse, and rollback controls apply without a new
counter or content-bearing event. S92 narration may describe only the validated minimized V2
envelope; deterministic narration remains available without a model.

The result-group registry is closed to these exact rows. All groups use an empty `applied_filters`
array because the state selection is part of the intent definition, not a user-selected filter.

| Intent                     | `group_key`                  | Exact group label               | Required recovery route |
| -------------------------- | ---------------------------- | ------------------------------- | ----------------------- |
| `maintenance.attention`    | `maintenance.attention`      | `Maintenance tickets`           | `/maintenance`          |
| `communications.attention` | `communications.renewals`    | `Renewal communications`        | `/gmail-hub`            |
| `communications.attention` | `communications.maintenance` | `Maintenance communications`    | `/gmail-hub`            |
| `connections.attention`    | `connections.attention`      | `Connections needing attention` | `/connections`          |
| `processes.available`      | `processes.available`        | `Internal processes`            | `/processes`            |
| `processes.active_runs`    | `processes.active_runs`      | `Active workflow runs`          | `/processes`            |
| `notifications.unread`     | `notifications.unread`       | `Unread notifications`          | `/notifications`        |
| `admin.readiness`          | `admin.readiness`            | `Admin readiness`               | `/admin`                |

`communications.attention` emits the renewal group first and the maintenance group second; all other
intents emit their sole group.

Each group also freezes its `item_kind`, exact `data` fields, and source-summary keys. Nullable means
the JSON field is present with `null`; an adapter cannot omit it or add another field. Every nonempty
item has exactly one owning-record route ref, and every group has exactly one owning-surface route ref.

| Group                                                    | `item_kind`              | Exact `data` fields                                                                                                                                         | Allowed source-summary keys                                                                                                                               |
| -------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maintenance.attention`                                  | `maintenance_ticket`     | `summary`, `unit_label` (string or null), `priority`, `status`, `assigned_to_actor` (boolean), `updated_at`                                                 | `maintenance.tickets`                                                                                                                                     |
| `communications.renewals` / `communications.maintenance` | `workflow_communication` | `lane`, `entity_type`, `purpose`, `status`, `waiting_on` (string or null), `contact_observation_state` (string or null), `last_contact_at` (string or null) | `communications.workflow_links`                                                                                                                           |
| `connections.attention`                                  | `connector_status`       | `connector_key`, `name`, `method_label`, `availability_label`, `state`, `detail`, `configured_count`, `required_count`                                      | `connections.configuration_presence`, `connections.cached_verification`, `connections.lifecycle`                                                          |
| `processes.available`                                    | `process_definition`     | `name`, `status`, `space_label`, `updated_at`                                                                                                               | `processes.definitions`                                                                                                                                   |
| `processes.active_runs`                                  | `workflow_run`           | `process_name`, `status`, `owner_label` (string or null), `created_at`, `updated_at`                                                                        | `processes.runs`                                                                                                                                          |
| `notifications.unread`                                   | `unread_notification`    | `family`, `lane`, `severity`, `title`, `message`, `created_at`                                                                                              | `notifications.preferences`, `notifications.approval_events`, `notifications.maintenance_events`, `notifications.communication_events`                    |
| `admin.readiness`                                        | `admin_readiness_issue`  | `category`, `status`, `count` (integer or null), `as_of` (string or null)                                                                                   | `admin.notification_delivery`, `admin.source_observability`, `admin.communications_retention`, `admin.publication_readiness`, `admin.migration_readiness` |

All strings inherit S88's per-item and aggregate byte ceilings. Domain enums must validate against
their owning code registry; `waiting_on` and observation state are null only when the stored link has
no such value. The Notifications adapter calls the hub with standing/decision enrichment disabled,
so S90 decisions and Connections standing state cannot enter the unread group through an unlisted
source key.

Each group may emit only the three standard S101 notice codes below, substituting its literal
`group_key` and exact label from the registry. A single-source adapter uses `source_unavailable`, not
`source_partial`, when that source fails. Connections, Notifications, and Admin readiness may use
`source_partial` because their owning views compose independent sources.

| Code pattern                     | Kind          | Exact message template                                                                          |
| -------------------------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| `<group_key>.source_unavailable` | `unavailable` | `<Exact group label> are temporarily unavailable. Open the owning page and try again.`          |
| `<group_key>.source_partial`     | `partial`     | `Some <exact group label, lowercased> sources are unavailable, so this list may be incomplete.` |
| `<group_key>.result_truncated`   | `truncated`   | `More <exact group label, lowercased> match. Open the owning page to see the full list.`        |

The server materializes these templates from the closed registry, not request or record text. Fixed
registry strings make the Admin variants grammatical: `Admin readiness is temporarily unavailable`
and `More Admin readiness issues match`. No general natural-language inflector or model participates.
Every notice includes the group's required recovery route. Unknown group/label/code/recovery
combinations fail the result envelope.

### Maintenance attention adapter

The adapter calls the same actor-authorized `listMaintenanceTickets` boundary as the Maintenance
queue and filters only Live tickets whose stored status is not `Closed`. It does not infer urgency or
blockage from description text. Results sort by `created_at` descending and stable id, matching the
owning list's current primary order while making ties deterministic. Each item may contain the
already-visible summary, unit display label, exact stored priority/status, assignment-to-current-
actor boolean, and updated time, plus `/maintenance?ticket_id=<encoded stable id>`. Description,
reporter contact, notes, photo references, provider ids, vendor details, and hidden roster entries do
not enter the assistant envelope or narration.

Read failure is `unavailable` and links to `/maintenance`. An empty successful Live queue is a true
zero. Opening a ticket performs only navigation; no status, assignment, RentVine work-order read,
chat sync, mark-read, draft, or provider action runs.

### Workflow Communications attention adapter

The adapter reuses the authenticated user's active `listCommunications` projection after its existing
mailbox, actor, retention, and Space checks. It selects links whose stored status is
`attention_required` or whose bodyless waiting state is one of `team`, `owner`, `resident`, `vendor`,
or `outside`; a `none` waiting state alone is not attention. Renewal and maintenance groups remain
separate. Items include only lane, entity type, purpose, status, waiting-on value, current/
needs-verification observation state, last-contact time, and the existing `workflowEntityHref` route.
They exclude mailbox address/key, Gmail message/thread/draft ids, source refs, reason hash, message
body, subject, sender/recipient, and customer contact values.

The adapter uses already-stored app state. It does not call Gmail, refresh a mailbox, retrieve a
thread, apply a label, create a draft, send, or mark a message read. A gated/unavailable mailbox read
is `unavailable`, not an empty communications list. The owning service may evaluate the existing
`gmail.mailbox.read` gate before its app-state read; no Gmail effect key or write key is evaluated.
An expired record remains excluded by the owning retention contract and is not disclosed in a count.

### Connection attention adapter

The adapter shares the Connection Center's complete view assembly: configuration presence,
cached-verification ids, and versioned connection lifecycle records. It returns cards whose current
classified state is `action`, `none`, or `closed` in connector-catalog order. A `closed` connector is
labelled unavailable by governance, not a setup task. Items contain only connector id/name, public
method/availability label, classified state/detail, configured and required counts, and
`/connections#connector-<catalog id>`.

If lifecycle records cannot be read, the adapter reports `partial` and says connection-record state
could not be checked; it cannot silently substitute configuration-only truth. It may use a currently
valid cached verification but never runs `verifyConnectorNow`, connects, disconnects, reads a secret,
or claims an action key is open. Non-Admins get the same status facts the page permits and no Admin-
only recovery or lifecycle metadata; their link may lead to the existing request-access handoff.

### Internal Processes and run adapters

`processes.available` calls the existing process-definition list and
`filterProcessDefinitionsForUser`, retains only actor-visible records, and sorts by `updated_at`
descending and stable id. It preserves every exact stored status: `Draft`, `Pending Approval`,
`Active`, `Needs Revision`, or `Retired`. Each item contains only process name, current stored status,
owning Space label when already authorized, updated time, and `/processes/<encoded stable id>`. A user
who can read but not edit still receives readable definitions and no mutation affordance.

`processes.active_runs` calls the existing workflow-run list and
`filterWorkflowRunsForUser`, then selects the owning contract's exact nonterminal statuses: `Not
Started`, `In Progress`, `Waiting on Team`, `Waiting on Outside`, `Blocked`, `Ready for Approval`, and
`Approved`. Results sort by `created_at` descending and stable id. They return process name, exact
stored status, actor-visible owner label only when the owning surface already resolves it,
created/updated times, and `/workflow-runs/<encoded stable id>`. The list service must expose an
explicit scan/limit/completeness outcome before registration; the current six-row page preview is not
portfolio-completeness evidence. Definition/read or run/read failures are independent unavailable
states and never zero.

Neither intent creates, edits, submits, activates, retires, starts, advances, completes, cancels, or
approves a process or run. An intent result is not a process picker, action proposal, or workflow
instruction.

### Unread notification adapter

The adapter invokes the same actor-scoped unified hub assembly and the current user's muted-family,
threshold, snooze, and digest preferences. It selects only resulting event rows with no `read_at` and
preserves the hub's exact `unreadTotal`; standing signals and decision backlog are not silently mixed
into an unread-event answer. S90 continues to own decisions, and connection standing state is owned
by `connections.attention`. Each item uses only the already-client-safe family/lane, severity, title,
message, creation time, and validated owning href.

Before registration, each contributing hub source must expose `complete`, `empty`, or `unavailable`.
The current nonfatal source behavior may still render a thinner Notifications page, but any failed
source makes the assistant result `partial` with an exact source-family notice. The adapter does not
mark one/all read, change notification preferences, create a notification, or call any provider.

### Admin readiness adapter

Only an authenticated actor with `manageAdmin` reaches this adapter. It consumes bodyless health and
readiness outcomes already read for Admin surfaces, including source availability and counts by
finite state. It may report only an issue category, current status, bounded count when the source is
complete, exact as-of time, and one allow-listed owning Admin route. It cannot expose user/email
directories, support text, correction text, customer/provider values, secrets/config values,
credential presence names, action tokens, raw errors, request bodies, or another actor's identity.

The category registry is closed to these exact entries and routes: `notification_delivery` to
`/admin`, `source_observability` to `/admin`, `communications_retention` to
`/admin/gmail-inbox-zero`, `publication_readiness` to `/admin`, and `migration_readiness` to
`/admin/migration`. S101 extracts a bodyless typed state from each owning read if one does not already
exist; it does not drop a category. An unavailable category makes the result partial; an Admin-page
catch-to-default is not a verified all-clear. The adapter cannot update a policy, resolve a report/
correction, reindex, provision a Space, change suspension state, mutate access, or run a connection/
provider check.

**In scope / out of scope.**

In scope: one additive registry/manifest/corpus version; seven exact deterministic intent keys; typed
actor-scoped adapters; page/assistant parity; closed result groups/notices/routes; S89/S92/S93 reuse;
authenticated candidate and post-promotion read-only verification; V1 rollback compatibility; and
current documentation updates after deployment.

Out of scope: any change to the eight V1 meanings; an `ask anything` router; conversational memory;
model-selected tools/adapters/filters/ids/URLs/actions; arbitrary Firestore, provider, SQL, or search
queries; client-supplied role/Space; new Dashboard regions; new notification aggregation; Gmail inbox
browsing; message bodies; RentVine chat retrieval; connection verification; process/workflow
mutation; drafts, sends, labels, mark-read, role grants, source writes, action-key changes, or any
other product effect.

Executable assistant actions beyond the already specified S94 renewal-to-self task require a later,
separate exact-action program with independent authority, per-action Preview/Confirm/receipt/readback/
recovery contracts, and protected-path review. S101 neither specifies nor reserves that program,
creates no new action-suite identifier, and must not be widened to include it during implementation.

**Open questions & assumptions.**

No material product question remains. The narrow assumption is that each owning surface remains the
authority for its own records and routes when S101 begins. If S87 relocates a route or replaces a
projection, implementation must consume the verified post-S87 owner rather than preserve a stale
path. A missing typed source outcome blocks only the affected S101 intent registration; it does not
widen V1 or authorize a replacement data source.

**Cross-product impacts.**

- Dashboard: the existing help disclosure gains seven server-manifest examples; the two-region S95
  composition does not change.
- Maintenance, Communications, Connections, Internal Processes, Notifications, and Admin: share
  typed read outcomes and canonical route builders; their writes, controls, and ownership do not move.
- S88/S89/S92/S93: receive additive schema/registry/corpus/telemetry-enum fixtures and remain the sole
  owners of routing, privacy/rollout, narration, and streaming presentation respectively.
- S87: supplies the verified post-relocation surface/route map and full-product stability baseline.
- No Action Registry, runtime switch, provider credential, IAM, Firestore rule, schema migration,
  Scheduler, Pub/Sub, budget, or cloud resource change is required by this suite.

**Authority and evidence map.**

| Input                                                            | Classification                   | Use and limitation                                                                                                         |
| ---------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Router, live readback, committed code/tests, and `docs/facts.md` | Authority / implementation truth | Establish actor/Space gates, current owning reads/routes, provider/action boundaries, retention, and present deployment.   |
| S87-S95                                                          | Required deployed contracts      | Establish post-decluttering route truth plus deterministic query, privacy, narration, streaming, and Dashboard boundaries. |
| Existing domain pages/services                                   | Owning implementation evidence   | Supply exact actor-scoped read facts; a page fallback is not automatically assistant completeness evidence.                |
| Dashboard AI-integration planning notes                          | Intent evidence only             | Support broader useful application coverage without authorizing arbitrary data reflection, model tools, or effects.        |
| A future assistant action request                                | Not authority for S101           | Requires a separate exact-action program; it cannot be inferred from read coverage or existing product action keys.        |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S101-1** — `AssistantIntentRegistryV2`, its capability manifest, matcher, adapters, result-
  group schema, examples, and golden corpus have exact key/order parity: eight unchanged V1 keys plus
  seven S101 keys. Unknown, missing, reordered, or runtime-added entries fail startup/CI.
- **ARCH-S101-2** — One actor/Space authorization boundary precedes every adapter read, and each
  adapter invokes only its owning app service. Direct provider reads, cross-user post-filtering, and
  client-supplied authority/identity fail tests before I/O.
- **ARCH-S101-3** — Each owning source exposes a typed complete/empty/unavailable outcome and bounded
  currency/cap metadata. Catch-to-empty/default/configuration cannot enter an assistant envelope as
  complete.
- **ARCH-S101-4** — Every item uses one allow-listed server-authored canonical route ref, reauthorizes
  on open, and contains only the closed per-domain field projection. Raw provider/customer/identity/
  secret/message fields outside that actor-authorized projection fail public-schema and serialization
  scans; narration and telemetry remain subject to S89's narrower content-free contracts.
- **ARCH-S101-5** — S101 reuses S89 admission, cancellation, minimization, telemetry, client-error,
  alert, and rollout controls plus S92 deterministic/model narration. No second transport, transcript,
  telemetry store, prompt shape, model router, or Dashboard query pipeline exists.
- **ARCH-S101-6** — The read-path effect harness proves zero writes/provider effects/effect-key checks
  for all seven intents and every denial, clarification, empty, partial, timeout, cancellation, and
  model-fallback case. Only an owning service's already-required read-key evaluation, such as
  `gmail.mailbox.read`, may occur after actor/Space authorization.
- **ARCH-S101-7** — V2 is an independently reversible registration. Disabling/rolling back S101
  restores the byte-compatible V1 manifest and grammar without altering V1 results, S94 eligibility,
  owning domain state, routes, or source data.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S101-1** — Each exact example routes to its one named intent and returns authorized, stable-
  ordered, capped results with the owning link; all collision, prior-turn, unregistered-domain, and
  mutation requests clarify/refuse before a source read.
- **BEH-S101-2** — A complete zero says no matching current item exists; a failed, timed-out, partial,
  capped, or stale source identifies the affected domain and recovery route and never says all clear.
- **BEH-S101-3** — Editor/Approver/Admin and Space fixtures see only the same records and labels their
  owning pages permit. Denial never leaks a hidden count, id, label, route, or domain existence.
- **BEH-S101-4** — Selecting any result deliberately opens only its validated owning surface in the
  S93 new-tab result behavior. It does not refresh, verify, mark read, start a run, change state, create
  a draft/task, or execute another action.
- **BEH-S101-5** — The V2 `What can I ask?` view accurately lists all 15 independent question
  families, keeps the single S94 action boundary, and never implies that S101 questions can execute
  work.
- **BEH-S101-6** — Model absence, invalid output, timeout, or cancellation preserves the same
  deterministic structured facts and terminal state; no model can add an item, source claim, link,
  filter, status, or action.

**Human litmus outcome.**

### Ask across the rest of the application without triggering work

**If this was built correctly:** A managed staff user opens Dashboard, expands `What can I ask?`, and
sees the seven new examples alongside the original eight and the statement that questions are
independent. They ask the exact Maintenance, Communications, Connections, Internal Processes,
workflow-run, and Notifications questions and see only records they can open. An Admin also asks the
Admin-readiness question. Each result identifies current state and opens the owning screen in a new
tab. A simulated source outage says that source is unavailable rather than showing a false all-clear,
and no query changes any ticket, message, connector, process, notification, role, or source.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why; when no human observer is present, use the manifest's exact
  `Human verdict: NOT RUN — no human observer` value and continue unless the owner explicitly makes
  that verdict a completion gate.

**Requirement-to-outcome traceability.**

| Requirement                                    | Architecture outcome | Behavior outcome | Human litmus                       | Deterministic evidence / falsification                                                                  |
| ---------------------------------------------- | -------------------- | ---------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Exact additive read-only catalog               | `ARCH-S101-1/7`      | `BEH-S101-1/5`   | Discover and ask every new family  | Registry/manifest/schema/corpus parity and V1 byte-compatibility fixtures                               |
| Actor/Space/source truth                       | `ARCH-S101-2/3`      | `BEH-S101-2/3`   | See only authorized current facts  | Role/Space/source-outcome/cap/stale/timeout matrices and owning-page parity fixtures                    |
| Minimized exact links                          | `ARCH-S101-4`        | `BEH-S101-3/4`   | Open the owning screen             | Route allow-list, destination reauthorization, malicious-field, serialization, and no-leak tests        |
| Shared privacy, narration, and stream controls | `ARCH-S101-5`        | `BEH-S101-5/6`   | Receive a stable degraded answer   | S89/S92/S93 parity, model failure, cancellation, client-error, telemetry, and alert-delivery checks     |
| Zero effect and separate future actions        | `ARCH-S101-6/7`      | `BEH-S101-4/6`   | Ask without changing product state | Per-intent effect counters, database/provider spies, Action Registry sentinels, and rollback comparison |

**Preservation set.**

Keep all S87-S95 gates green; exact eight-key V1 routing/results/examples; independent-question
semantics; S94's one eligible renewal-to-self task; S95's two-region Dashboard; S83 authorization;
S84 routes; S86 links/transient states; actor/Space filters; notification preferences; communication
retention; S96 connector lifecycle; current domain action controls; exact Action Registry and runtime
suspension boundaries; human-confirmed source-write and unsent-draft policies; provider allowances;
zero query-path mutation; and current Production+Live descriptors.

**Adversarial acceptance checks.**

- **AC-S101-1** — Registry fixtures prove exactly 15 ordered keys, preserve all V1 normalized inputs
  and output snapshots byte-for-byte, and reject any key/example/adapter/group/action drift between
  registry, manifest, help UI, schema, corpus, and docs.
- **AC-S101-2** — Exact-example and allowed-variant fixtures route once; every pairwise family
  collision, mutation phrase, prior-turn pronoun, misspelling, unregistered subject, and missing
  qualifier clarifies/refuses with zero adapter/model/provider calls.
- **AC-S101-3** — Editor, Approver, Admin, Space-scoped, denied, disabled, signed-out, and wrong-domain
  matrices match owning-surface visibility. Hidden records leave no count, label, id, link, timing
  distinction, model fact, stream field, or telemetry attribute.
- **AC-S101-4** — Complete-zero, one/many/over-50, partial-source, all-source-unavailable, timeout,
  cancellation, stale, malformed, duplicate-id, and malicious-field fixtures preserve exact state,
  ordering, truncation, notices, recovery, and safe links for every adapter.
- **AC-S101-5** — Maintenance parity covers every exact stored status and confirms only non-Closed
  Live tickets; Communications parity covers retention/actor/Space/status/waiting/observation states
  without Gmail I/O or message metadata; Connection parity covers lifecycle-read failure without a
  false configuration-only all-clear.
- **AC-S101-6** — Process definition/run parity covers all statuses, Space filtering, and an uncapped-
  truth boundary; Notification parity covers every source outcome and current low-alarm preference;
  Admin readiness covers category registration, role denial, bodyless fields, and independent source
  failure.
- **AC-S101-7** — Public/stream schema scans permit only each actor-authorized domain projection and
  reject every undeclared field. Model/log/metric/error/cache/storage scans contain no mailbox or
  customer identifier, message body/subject/address, Gmail/provider id, ticket description/note/photo,
  secret/config value, support/correction text, request content, or raw error. Only S89-approved
  bodyless enums and counts persist.
- **AC-S101-8** — Per-intent spies prove zero Firestore writes, provider requests, mark-read calls,
  connection checks, workflow starts/transitions, drafts, sends, labels, source writes, task creation,
  effect-key evaluations, and hidden retries for success, refusal, empty, partial, model-fallback, and
  cancellation paths. The Communications success/unavailable fixtures permit exactly its existing
  `gmail.mailbox.read` evaluation and no other Action Registry key.
- **AC-S101-9** — Authenticated managed Editor and Admin candidate runs exercise the full manifest,
  all seven fixed examples, one denial, one source-unavailable state, one validated new-tab link per
  domain, S89 client-error delivery, alert delivery, and no console/unhandled/network/5xx/blank-page
  failure. Post-promotion rerun and owning-source/page parity are green before V2 remains enabled.
- **AC-S101-10** — Rollback disables only the seven new registrations, restores the exact V1 manifest
  and representative corpus, and leaves V1 result snapshots, S94 action eligibility, routes, records,
  provider effects, runtime config, and source generations unchanged.

**Forbidden actions / hard gates.**

Do not start S101 before S87 and S88-S95 are deployed/green. Do not add a free-form/model/embedding
router, conversation memory, page-state context, arbitrary data reflection, provider-direct adapter,
cross-user read, hidden retry, unbounded scan, or unvalidated link. Do not read Gmail message bodies or
RentVine chat, refresh a mailbox, mark a message/notification read, verify/connect/disconnect a
connector, change a preference/policy/role/Space, create/update a ticket/process/run/task/request,
draft/send/label, invoke RentCast, write RentVine/Sheets/Firestore/provider state, open/change an Action
Registry key, or create a future action-suite contract under this suite.

**Dependencies / sequencing.**

S101 is queue order 22 and starts only after S87. First read the post-S87 route/surface map and freeze
the deployed V1 registry, result, action, browser, and telemetry baselines. Add typed source outcomes
to owning read boundaries without changing their page behavior, then implement adapters and the V2
registry behind a reversible registration gate. S89/S92/S93 integration and authenticated candidate/
post-promotion verification follow. A failure stops S101 only; it never delays, rewrites, or weakens
the already-deployed V1 assistant.

Any later executable-assistant expansion is a separate authority and specification exercise after
S101. It must enumerate exact action keys and effects and cannot be inferred from an S101 item, link,
existing product button, or open application action key.

**Standalone delivery contract.**

- **Deliverable now:** After the stated deployed prerequisites, one additive V2 registry/manifest/
  corpus, seven typed read adapters, exact groups/notices/links, shared S89/S92/S93 integration,
  fail-closed source states, zero-effect proof, authenticated rollout evidence, and V1 rollback can
  reach `ALL_GATES_GREEN` without a new provider effect or external client decision.
- **Consumes, but does not assume:** Verified post-S87 owning routes/services and deployed S88-S95
  contracts. A missing typed outcome or route blocks only its exact intent registration and renders
  that family unsupported; it never authorizes a second source or false complete result.
- **Externally blocked effect:** none. This suite contains no external effect. Any future executable
  assistant action is out of scope and requires its own later authority/specification.
- **Produces for downstream suites:** A versioned read-only cross-application intent catalog, typed
  domain-source outcomes, minimized route-backed envelopes, authenticated parity evidence, and a
  stable boundary against which a separately authorized future action program could be evaluated.

**Verification and delivery contract.**

1. Record the deployed V1 registry/manifest/corpus/result/action/telemetry snapshots, post-S87 owning
   routes, actor/Space matrices, page result snapshots, source failure behavior, and zero-effect
   counters. Materialize the expected missing-V2 fail-first result without changing V1.
2. Add failing typed-source, matcher/collision, authorization, completeness, cap, route, minimization,
   no-effect, model-fallback, browser, alert, and V1-rollback checks before implementation edits.
3. Run focused tests covering every `ARCH-*`, `BEH-*`, and `AC-*`, then all S88-S95 preservation
   suites. Treat domain preservation and V1 byte-compatibility as separate hard gates.
4. Run `bash scripts/verify.sh`; audit secrets/PII, public/model/stream/log/metric shapes, route guards,
   source constructors, database/provider call counts, Action Registry references, runtime config,
   and documentation scope.
5. Deploy an exact zero-traffic candidate, run the authenticated Editor/Admin and page-parity matrix,
   verify client-error/alert delivery and zero effects, promote only that revision, rerun the bounded
   matrix, and restore the captured predecessor on any mismatch.
6. Report `ALL_GATES_GREEN` only when the exact V2 registration and post-promotion readback are green;
   report `BLOCKED` only for one exact prerequisite after every independent fail-closed slice is
   complete. Do not call partial registration or an unauthenticated smoke complete.

**Ordered prompt sequence.**

1. Re-verify deployed S87 and S88-S95, then freeze V1 and owning-page truth.
2. Materialize typed-source, exact-corpus, visibility, completeness, minimization, route, zero-effect,
   authenticated-browser, alert, and rollback fail-first checks.
3. Refactor only the necessary owning reads to typed outcomes, implement the seven adapters, and add
   the reversible additive V2 registry/manifest/corpus without changing V1.
4. Integrate S89/S92/S93, falsify every source/role/Space/collision/model/effect boundary, run full
   preservation and canonical verification, then candidate/promotion/readback under normal authority.
5. Update current truth documents to the verified deployed result; do not add or imply a future
   executable action suite.

**Deletion/merge recommendation.**

Remove S101 from the active tree when all seven intents are deployed behind the V2 registry, source/
page parity and authenticated post-promotion evidence are green, V1 rollback is tested, zero-effect
scans are code-owned, and current facts describe only the deployed read coverage and its explicit
action boundary.
