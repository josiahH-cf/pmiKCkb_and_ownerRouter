<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: dashboard-assistant-v1 -->

# S88 — Deterministic assistant query foundation

> Status: Specified and not implemented. The current `/api/ask` path is a buffered, model-backed KB
> answer route; it has no actor-scoped operational query coordinator, structured result envelope, or
> completeness contract, and the existing Console Ask form can separately start a workflow run.

**Goal.**

Provide one server-owned, read-only assistant query boundary that deterministically understands the
bounded Dashboard intents, reads only data the authenticated actor may access, returns authoritative
structured results with honest completeness and safe application links, and remains useful when no
generative model is configured or available.

**Current state / intended end state.**

`app/api/ask/route.ts` currently authenticates, consumes/checks a per-user in-memory rate bucket,
then parses and validates `AskRequestSchema`, calls `answerQuestion` from `lib/ask/service.ts`, and
returns one JSON object after Vertex Search and, for a usable source state, Gemini answer generation.
Malformed current requests therefore consume a rate token; S89's desired validation/admission order
is a new contract, not present behavior. `AskRequestSchema` in `lib/schemas.ts` has a three-
character minimum but no maximum question or body size. `AskResponseSchema` represents prose,
handling steps, citations, a draft, and answer-model attribution; it cannot represent operational
items, applied filters, result-set bounds, data currency, adapter failure, or internal result links.

`lib/ask/app-state-context.ts` is a separate resolver used by `/api/ask/app-state` for only approvals,
connections, and coverage; the current Ask client and answer service do not consume it. Its approval
gather inherits catch-to-empty behavior from
`lib/approval/needs-decision-gather.ts`, so a failed read can be indistinguishable from a verified
empty result. `lib/processes/intent.ts` is a client-oriented process-name matcher, and the optional
model classifier selects only an allow-listed process. Neither is a server authority for operational
assistant intent. In `components/ask/AskForm.tsx`, a selected process causes a workflow-run POST after
the question is answered; `Capture Task` writes a Placeholder through `/api/ask/capture`, not a My
Work task.

The intended state introduces a transport-independent `runAssistantQuery` boundary with strict
input, a versioned deterministic intent registry, actor-scoped read adapters, server-authored route
references, explicit adapter and query terminal states, and a complete structured result. Exact
counts, rows, statuses, links, filters, and completeness come only from this boundary. S92's
mandatory answered-result narration may describe that result, using a model only when its gates
allow, but it cannot establish or change any authoritative field.
Submitting a query performs no product, workflow, approval, task, source, draft, provider, or client-
communication write.

The existing buffered `/api/ask` and `AskResponseSchema` remain compatible during the migration.
S93 owns the new streaming HTTP transport and consumes the S88 contract; it must not reimplement the
router or adapters. The Dashboard does not switch to the new boundary until its required adapters,
degraded states, S89 controls, and S93 rendering are green.

**Actors and entry conditions.**

- The actor is an authenticated, enabled, managed internal user for whom the server can establish the
  existing `read` capability, exact global role, and Space claim from the session boundary. Signed-
  out, disabled, wrong-domain, malformed-claim, Vendor, personal, and service identities are refused
  before intent-specific data loads.
- The client supplies only the versioned question object defined below. It never supplies role,
  capability, Space scope, actor id, adapter, intent, filters, timezone, model, link, action, source
  state, or completeness.
- Each adapter independently enforces the existing role, capability, Space, record-visibility, and
  source contracts before loading its domain. Registry membership is routing, not authorization.
- Existing app data remains authoritative in its owning boundary. In particular, My Work uses its
  actor-scoped snapshot, approvals use their actor-visible queue/decision projection, access uses
  current authenticated-session truth unless S83 supplies verified self-readback, and renewals use
  the canonical live-desk orchestration rather than a Console-only projection.
- A missing adapter, disabled feature, stale or incomplete source, timed-out read, permission denial,
  and verified empty result are distinct. None may be converted to a successful empty list.
- The query boundary is available without a model provider. S92 adds grounded knowledge only for its
  registered knowledge intent and adds one mandatory deterministic narration envelope to every
  `answered` S88 result. Only the model-backed attempt that may populate that envelope is optional;
  its validated deterministic fallback remains required under S89/S92.

**What it is / how it functions.**

### Strict assistant request

Define one closed `AssistantQueryRequestV1` contract for the new Dashboard assistant:

```text
{
  "schema_version": "assistant-query-v1",
  "question": string
}
```

After Unicode NFC normalization and trimming, `question` contains 3 through 2,000 Unicode code
points. The complete UTF-8 JSON request body is at most 16 KiB and uses `application/json`. Unknown
fields, arrays/batches, malformed JSON, non-string questions, oversize bodies, and unsupported schema
versions are rejected before routing or any source/model call. The original normalized question is
held only for the live request and S89's session transcript; it is not placed in a URL, route
reference, metric, durable query record, source receipt, or error.

After authentication and strict request validation, the server-only S88
`createAssistantQueryContextV1()` creates one random opaque `query_id` for correlation. S89 may do
this before rate/concurrency admission so a refused request can emit its bodyless outcome without
inventing an id; no adapter/model/source is constructed. The single-use context is then passed to
`runAssistantQuery` if admitted, and the same id is returned in the result. It is never accepted from
the client and is not an idempotency key, user identity, conversation identity, or authorization
token. A retry receives a new context/read. V1 accepts no client conversation history or prior answer because
follow-up resolution without a durable trusted state contract would force the server to guess hidden
context.

`AssistantQueryRequestV1` is transport-independent. S93 exposes it at
`POST /api/assistant/query/stream`; existing clients may continue using buffered `/api/ask` until the
Dashboard migration is complete. The new stream route must invoke `runAssistantQuery` rather than
call `/api/ask` as an HTTP service or construct a second query pipeline.

### Server-owned intent registry

Create one versioned `AssistantIntentRegistryV1` whose allowed intent keys are:

| Intent key                       | Observable question family                                 | Adapter composition boundary                                                                |
| -------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `work.today`                     | Work assigned to the actor for the resolved business date  | S90 actor-scoped My Work adapter                                                            |
| `work.blocked`                   | Work currently blocked for the actor                       | S90 actor-scoped blocked-work adapter                                                       |
| `approval.needs_my_decision`     | Decisions or approvals that the actor may review           | S90 availability-aware actor-visible decision adapter                                       |
| `approval.my_submitted_requests` | Requester-visible approvals the actor is waiting on        | S90 registered owning-domain histories; S83 access requests are the initial family          |
| `renewal.window`                 | Lease renewals in an explicit deterministic time window    | S91 canonical renewal adapter; dates resolve in the documented business timezone            |
| `renewal.blocked`                | Canonical renewal items with current causal blockers       | S91 adapter consuming S82 blocker truth or its explicit partial compatibility state         |
| `access.mine`                    | Current session role and Spaces plus S83 capability labels | S90 session projection; deployed S83 supplies only its verified effective-access projection |
| `guidance.knowledge`             | How-to, policy, or published-process guidance              | S92 source-backed knowledge adapter                                                         |

`unsupported` and `ambiguous` are router outcomes, not intents. An adapter or another suite cannot
add an intent by accepting a free-form name at runtime; registry parity fails until a new key has an
owner, deterministic matcher and parser, authorization declaration, adapter composition, result
schema, safe recovery, test corpus, and documentation.

### Public V1 capability manifest and representative-language corpus

The same registry also owns one value-only `AssistantCapabilityManifestV1` projection for S93. It
contains only `schema_version: "assistant-capability-manifest-v1"`,
`question_context: "independent"`, the eight intent keys above in registry order, one short
user-facing title and one or more exact example questions for each intent, and the fixed action
boundary `Only an eligible renewal result can offer Create my task after Review and Confirm.` It
contains no actor id, role, Space membership, source availability, customer value, result count,
route parameter, model field, or runtime registration. The manifest explains what V1 recognizes; it
does not claim that the current actor may read every domain or that a source is healthy. S93 renders
this projection as its compact `What can I ask?` disclosure and renders the independent-question
statement beside it. No UI-maintained example list or broader marketing copy may diverge from the
registry.

The registry test package owns a versioned, non-production `AssistantRepresentativeLanguageV1`
corpus. For every intent it includes the exact examples named in the approved feature notes and suite
litmus checks, plus supported case, Unicode punctuation, whitespace, approved contraction, and
declared filler-word variants. It also includes intentionally rejected near misses: misspellings,
abbreviated or locale-ambiguous dates, fuzzy owner/tenant labels, unregistered domains, unsupported
follow-ups, and phrases that tie two intent families. Each row declares only `intent_key` or the exact
`clarification_required`/`unsupported` outcome and its symbolic filters; it contains no live customer
data. The deterministic evaluation report lists accepted and rejected counts by intent and variant
class, rather than hiding one weak family inside an aggregate score. A rejected representative phrase
cannot be made green by a model, fuzzy match, silent grammar expansion, or test deletion.

The matcher operates on a normalized matching copy of the question and retains the original only for
the in-memory transcript. Normalization is exact: Unicode NFC; Unicode case fold; trim; collapse every
run of Unicode whitespace to one ASCII space; and tokenize letters/numbers while treating other
punctuation as boundaries. Before punctuation tokenization, straight/curly apostrophe variants of
`I'm` normalize to tokens `i am`, and `what's` normalizes to tokens `what is`; no other contraction is
expanded implicitly. The router does not stem, embed, fuzzy-match, spell-correct, or call a model.

The closed V1 matcher manifest is the following exact list. Each `|` below separates literal
alternatives inside code, not document-table columns:

- **Attention composite:** exact token sequence `what needs my attention today` or `remind me what
needs attention today`. It has highest precedence and composes only `work.today`, then
  `approval.needs_my_decision`.
- **`renewal.blocked`:** one renewal subject from `renewal | renewals | lease renewal | lease
renewals` and one blocker term from `block | blocked | blocking | blocker | blockers`, with optional
  S91 date and quoted owner/tenant modifier. A renewal subject wins over Work blocker routing.
- **`work.blocked`:** one work subject from `work | task | tasks | my work | my tasks | work assigned
to me | tasks assigned to me` and one blocker term from `block | blocked | blocking | blocker |
blockers | stopping`; or one exact normalized token sequence from `what is blocking me`, `what tasks
are currently blocked and what information is needed to unblock them`, or `what tasks are blocked and
what is needed to unblock them`. Renewal subjects route to `renewal.blocked`; approval/access subjects
  at the same boundary require clarification.
- **`work.today`:** one work subject plus `today | daily`, including exact `what should i work on
today`, `show my daily work`, and `what is my work today`. A blocker term routes to `work.blocked`;
  the attention composite is handled first.
- **`approval.needs_my_decision`:** subject `approval | approvals | decision | decisions` plus one
  complete phrase from `need my decision | needs my decision | need my approval | needs my approval |
waiting on me | i need to approve | i need to review | for me to approve | my approval queue |
decisions are waiting`. Directional `i am waiting on | waiting for approval | i submitted | my
requests` belongs to submitted requests.
- **`approval.my_submitted_requests`:** a request/approval subject plus `i am waiting on | waiting for
approval | i submitted | my submitted request | my submitted requests | my requests | pending
outside users`; or exact `what approvals am i pending outside users`. `waiting on me` belongs to
  decisions; questions containing both directional sets require clarification.
- **`renewal.window`:** a renewal subject plus one S91 date, or exact verbal form `lease | leases`
  followed by `renew | renews | is up for renewal | are up for renewal` and one date; optional quoted
  owner/tenant modifier. Owner/tenant without a date and without blocked status requests the missing
  window/status; multiple dates require clarification.
- **`access.mine`:** subject `role | roles | access | permission | permissions` plus self/current phrase
  `my | mine | i have | do i have | can i access | current | currently`. Change/grant requests are not
  self-read intents; S83 may follow only a server-owned requestable denial.
- **`guidance.knowledge`:** lead `how | what is the policy | what is our policy | procedure | process |
remind me how` plus a nonempty process/policy subject. Bare `remind me`, bare `how`, or an
  operational subject matching another row clarifies rather than guessing.

Allowed filler tokens are only `a|an|the|is|are|do|does|for|on|right now|currently|please|show
me|tell me|which|what`; they may appear around, but not inside, a multi-token directional/date
phrase. Possessive names, unknown labels, extra domain subjects, or required terms outside this
manifest do not become a match. Punctuation/case/filler variants that preserve the grammar route
identically. Registry fixtures include every required phrase, competing directional phrase,
exclusion, and one-token addition/removal at each material boundary. The golden corpus explicitly
contains every example utterance named in the Dashboard feature notes and S90/S91—including all
three exact blocked-work forms above—so a broad category fixture cannot hide a rejected product example.
Adding a synonym requires a manifest, owner, and golden-test change rather than an ad hoc regex.

The only V1 customer-label modifier is a terminal clause exactly `for owner "<label>"` or `for
tenant "<label>"` after the required date/blocker grammar. `<label>` is taken from the pre-tokenized
NFC question, trimmed, 1 through 100 UTF-16 code units, and contains no quote/control character.
Exactly one modifier is allowed. Unquoted, unterminated, nonterminal, owner-plus-tenant, or oversize
forms return clarification before an adapter. The router passes the literal only to S91's exact
authorized display-label comparator; it never enters narration, a URL, or identity resolution.

Deterministic parsing yields only manifest-defined symbolic filters, such as `today` or
`next_calendar_month`. Domain adapters resolve those symbols against an injected clock and their
documented business timezone. The router never derives a customer, lease, staff, provider, Space, or
record identity from a fuzzy name. A manifest may carry a bounded literal owner/tenant display-label
filter only when the owning adapter compares it with the existing canonical exact-normalization rule
against already-authorized rows, returns every exact-label match, and never resolves the label to an
opaque identity. Partial/fuzzy identity guesses are unsupported or require clarification. An explicit
opaque identifier may be accepted only by a later versioned intent contract whose adapter validates
it; V1 has no identifier field.

When exactly one registry rule wins, the coordinator uses its declared adapters and filter schema.
When two materially different intent families tie, a required filter is missing, or a phrase could
change the requested domain, it returns `clarification_required` with one server-authored
`clarification_prompt` of 1 through 240 Unicode code points and zero through three server-authored
plain-language choices, each 1 through 120 code points, and runs no domain adapter. Zero choices is
valid only when the safe recovery is a server-authored owning-surface route such as selecting one
authorized Internal Process.
A registry-declared broad phrase such as `What
needs my attention today?` or `Remind me what needs attention today` may deterministically compose
`work.today` and `approval.needs_my_decision`; no other broad fan-out is allowed. `Remind me how
<process> works` maps to `guidance.knowledge`; bare `Remind me` returns clarification choices between
the current attention recap and process guidance. These are on-demand reads and create no reminder.
No match returns the typed terminal state `unsupported`, not `No Reliable Source` or an empty domain
result. S93 alone maps that state to the requested exact `No process found` presentation copy; the
phrase is not an intent, adapter state, or source fact.
Matching and adapter order are stable under repeated runs and cannot depend on object enumeration,
source return order, a model response, or the actor's hidden data.

### Actor-scoped adapter contract

One server-only adapter registry maps every intent to exact implementations. Each registration
declares an immutable adapter id/version, supported intent/filter schemas, required base capability,
optional exact Space, source class, timeout class, maximum result size, item schema, and safe route-
reference builders. `runAssistantQuery` passes an `AuthenticatedUser` produced by the server, an
injected clock, the parsed allow-listed filter, and an `AbortSignal`. It does not pass raw cookies or
allow an adapter to reinterpret client claims.

`maximum_result_size` is a required integer from 1 through 50 for every V1 adapter registration.
An adapter may declare a lower domain-specific value but never exceed 50 returned items. Exceeding
the declared value yields a bounded `partial` envelope with `truncated=true`; it never silently drops
rows while claiming complete. S89's three-adapter fan-out ceiling therefore bounds one V1 query to
at most 150 returned items before S93 rendering and S89 applies a separately smaller model-input
projection.

Every adapter returns `AssistantAdapterEnvelopeV1<T>` with these required fields:

```text
schema_version: "assistant-adapter-v1"
adapter_id: allow-listed id and version
state: "complete" | "partial" | "unavailable" | "not_applicable"
as_of: ISO timestamp or null
applied_filters: allow-listed typed filter object
matched_count: nonnegative integer or null
returned_count: nonnegative integer
truncated: boolean
items: validated T[]
route_refs: AssistantRouteRefV1[]
source_receipts: value-minimized typed receipts
notices: allow-listed code/recovery references
```

`applied_filters` is the adapter's exact server-only typed input and may include a bounded literal
needed for authorized comparison. Before any public result, milestone, narration input, or UI receipt,
the adapter must project it to zero through 12 `AssistantAppliedFilterV1` records:

```text
schema_version: "assistant-applied-filter-v1"
filter_key: adapter-manifest key, 1..64 ASCII characters
label: server-authored display label, 1..80 Unicode code points
value: one strict adapter-declared boolean, enum, integer, ISO date, or ISO time-zone value
```

The registry freezes legal filter keys, value type/range, ordering, and presentation label per intent.
No public filter contains the raw question, free text, customer/staff label, stable record id, provider
id, URL, or authority. S91 publishes resolved `from`, `through`, and `America/Chicago`; a quoted owner/
tenant modifier publishes only `party_filter_applied=true` plus `party_kind=owner|tenant`. Public
filters may enter S92's minimized narration input and S93's factual receipt, but never URLs, metrics,
logs, durable transcript, or action authority.

Every public notice is one strict `AssistantNoticeV1`:

```text
schema_version: "assistant-notice-v1"
code: allow-listed registry code, 1..64 ASCII characters
kind: "information" | "partial" | "unavailable" | "denied" | "truncated"
message: exact server-authored text, 1..240 Unicode code points
recovery_route_ref_id: null | one referenced AssistantRouteRefV1 id
```

The registry freezes each legal code/kind/message/recovery-required pairing. A notice cannot contain
source/provider errors, customer values, raw input, arbitrary presentation text, or an unregistered
route. Its recovery ref must occur in the same group/result route registry and be absent when the
pairing declares no recovery.

The coordinator, rather than a domain adapter, owns only these exact notice rows:

| Code                                       | Kind          | Exact message                                                   | Recovery pairing                                                  |
| ------------------------------------------ | ------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| `assistant.access_partial_requestable`     | `denied`      | `Some requested sources are not available for your access.`     | exactly one S83 access route required                             |
| `assistant.access_partial`                 | `denied`      | `Some requested sources are not available for your access.`     | null required                                                     |
| `assistant.access_required`                | `denied`      | `Access is needed before this request can be answered.`         | exactly one S83 access route required                             |
| `assistant.access_denied`                  | `denied`      | `You do not have access to answer this request.`                | null required                                                     |
| `assistant.clarification_internal_process` | `information` | `Open Internal Processes to choose one.`                        | exactly one guarded `internal_processes` `/spaces` route required |
| `assistant.approval_history_unsupported`   | `unavailable` | `Submitted approval history is not available for this request.` | null required                                                     |

For selected denied adapters, de-duplicate non-null S83 handoffs by canonical href. Exactly one
unique handoff remains exact. Two or more distinct requestable handoffs collapse to one plain guarded
S83 `access.home` `/admin/access` route with label `Open Access` and no preselection; zero handoffs
produces no route. A mixed allowed-plus-denied result uses one `access_partial*` row according to that route's
presence. An all-denied result uses `assistant.access_required` when the route exists and
`assistant.access_denied` otherwise. The clarification row is legal only for S92's multi-named-Space
knowledge clarification and attaches its typed collection route. The approval-history row is legal
only when S90 routes exact `approval.my_submitted_requests` and its requester-history registry has no
family, so no domain adapter runs. Coordinator notices precede domain
notices in the top-level first-occurrence order. No result may carry an otherwise-unused coordinator
route, multiple access recovery refs, or a domain/source label in this notice family.

The validated adapter envelope is server-only and cannot be serialized directly. Its public
group/result projection is strict and has no extension, sidecar, raw-record, private filter,
URL-registry, or action field. When a registered downstream server stage needs current authority that must not become public
answer data, the adapter registration may additionally declare exactly one closed private projector
schema and its one consumer. `runAssistantQuery` then returns this server-only turn object:

```text
AssistantQueryExecutionV1 {
  result: validated AssistantQueryResultV1
  private_projector_inputs: {
    knowledge_citation_registry: AssistantKnowledgeCitationRegistryV1 | absent
    renewal_action_bindings: AssistantRenewalActionBindingV1[] | absent
  }
}
```

Only S92 may register and consume `knowledge_citation_registry`; only S91 may produce and S94 may
consume `renewal_action_bindings`. Each payload is validated before it enters this request-scoped
carrier, is bound to the current query and authenticated actor in memory, and is discarded when its
consumer completes, the request aborts, or the response closes. It is never a field of
`AssistantAdapterEnvelopeV1`, `AssistantQueryResultV1`, an observer milestone, model input, stream
event, log, metric, transcript, URL, token, or durable record. The coordinator exposes only the
declared typed slice to its registered consumer; an unknown producer/consumer, second consumer,
schema mismatch, or attempt to serialize the carrier fails closed. S91 and S92 own the exact private
payload schemas and minimization; S89 owns shared deadline/cancellation and S93 serializes only the
public result plus S94's separately validated terminal action projection.

The state invariants are:

- `complete`: every required source for the requested actor/filter was read under its currency rule,
  the full matched set is known, `matched_count` is present, and `truncated` is false. Zero items is a
  verified empty result, not an error.
- `partial`: at least one authoritative item or aggregate is usable, but a required source, field,
  currency check, page, or response-bound segment is missing. `truncated=true` always makes the
  envelope partial and states `Showing {returned_count} of {matched_count}` when the total is known.
- `unavailable`: the adapter cannot establish any usable current result because configuration,
  source, timeout, authentication-to-provider, or read failed. Items are empty, counts are not
  presented as zero, and an allow-listed retry/recovery notice is required.
- `not_applicable`: the registered adapter does not apply to the resolved intent/filter after a
  non-sensitive deterministic check. It is not used for permission denial, source failure, or an
  empty collection.

An adapter may expose customer/lease/work values in `items` only when they are needed for the
authorized answer. Receipts contain source kind, read/completeness/currency state, and observation
time, never provider payloads, Gmail bodies, questions, names, addresses, emails, money values,
reasons, or secrets. Raw provider errors become stable allow-listed error codes plus safe recovery.

Exceptions never become empty envelopes. The coordinator converts a typed adapter exception or
deadline into `unavailable`; malformed adapter output fails closed as `unavailable` and emits S89
bodyless diagnostics. Adapters do not catch authorization failure and continue loading. The
coordinator authorizes before invocation, and domain services retain their own guard as defense in
depth.

For every adapter selected by one intent/composite, the coordinator first creates a private
`AssistantAdapterInvocationV1` outcome:

```text
state: "allowed" | "denied"
denial_code: null | "missing_requestable_capability" |
              "missing_requestable_space" | "not_authorized"
access_handoff_ref: AssistantRouteRefV1 or null
envelope: AssistantAdapterEnvelopeV1 or null
```

`allowed` has null denial/handoff fields and may invoke the adapter, then carries its validated
four-state envelope. `denied` has null envelope and invokes no adapter/source; it never becomes a
result group, source summary, count, or existence signal. A handoff is non-null only for the first
two codes when S83's server catalog proves that exact capability/Space is requestable, the actor is
eligible to request it, and the guarded route exists. `not_authorized`, disabled S83, record-level
denial, malformed claims, and nonrequestable authority expose no handoff. Vendor/anonymous/domain
failures remain pre-query refusals rather than invocation outcomes.

In a mixed composite, allowed groups remain usable while the exact `assistant.access_partial*`
notice makes aggregate coverage partial. An all-denied result may carry only the one safe S83 access
recovery selected above, without a hidden source label. This coordinator outcome is the sole carrier
for denial precedence.

### Typed groups, items, and evidence references

Each adapter registration freezes one or more finite group keys and a discriminated item schema.
The coordinator converts a validated adapter envelope into `AssistantResultGroupV1` records:

```text
schema_version: "assistant-result-group-v1"
group_id: query-local id derived from an allow-listed group key
group_key: allow-listed manifest key
label: server-authored accessible label
state: "complete" | "partial" | "unavailable" | "not_applicable"
as_of: ISO timestamp or null
applied_filters: 0 through 12 ordered AssistantAppliedFilterV1 records
matched_count: nonnegative integer or null
returned_count: nonnegative integer
truncated: boolean
evidence_refs: ordered query-local refs supporting group counts/state
items: AssistantResultItemV1[]
route_ref_ids: 0 through 4 ordered group-level route refs
notices: 0 through 8 strict AssistantNoticeV1 records
```

`AssistantResultItemV1` contains an opaque query-local `item_ref`, one allow-listed `item_kind`, the
adapter's strict minimized `data` projection, ordered `evidence_refs`, and ordered `route_ref_ids`.
Each adapter specification owns the exact fields allowed in `data`, item routes, and group routes;
unknown item kinds/fields or unreferenced/cross-group route refs fail the envelope. Group refs carry
only a destination that applies to the whole group, including an owning surface for a verified-empty
result. `group_id`, `item_ref`, and `evidence_ref` are created in memory for this query and are
reused byte-for-byte in every milestone and terminal result. They contain no provider/stable record
id, customer value, or authorization capability and are not valid in a later request.

Every query/result-local reference—`query_id`, `group_id`, `item_ref`, `evidence_ref`, and
`AssistantRouteRefV1.ref_id`—is a server-created string from 1 through 128 ASCII characters matching
`^[A-Za-z0-9_-]+$`. The server creates each independently of customer values, stable/provider record
ids, client or model text, and authorization capabilities. A reference is unique within its owning
query result and is valid only for that result; it is neither accepted as authority nor resolved by a
later request. S92 citation refs use this same alphabet and bound but remain a distinct query-local
namespace whose entries must map one-to-one to that result's returned knowledge items.

The coordinator permits at most eight result groups, 150 items across the declared three-adapter
ceiling, 4 KiB UTF-8 for one serialized item's `data`, 512 KiB for one serialized group, and 768 KiB for
the complete serialized `AssistantQueryResultV1`. It applies these bounds before any transport
observer runs. A larger authorized match is truncated in canonical adapter/group/item order, marks
the affected group and aggregate result `partial`, retains the known total when trustworthy, and
adds the owning-surface recovery. A schema-valid result therefore always fits S89/S93's terminal-line
ceiling; a transport cannot rebuild or reinterpret it.

Evidence refs map only to the current result's `AssistantSourceSummaryV1` index. Each summary contains
exactly a query-local `evidence_ref`, allow-listed `source_key`, server-authored public source label,
four-state source outcome, safe `as_of`, and ordered applicable `group_ids`. It contains no provider/
record/source id, customer value, raw receipt, error, payload, URL, or action data. Group-level refs
support aggregate counts/completeness; item-level refs support returned facts. They let S92 cite a
fact and S93 explain which public sources were checked without exposing raw evidence or letting a
model choose a record. Route refs remain the separate S88 destination contract. S94 action candidates,
when eligible, use their own actor-bound sealed handoff contract; no result-local id or route ref
becomes action authority.

### Query result and completeness

The public `result` member of `AssistantQueryExecutionV1` is one validated
`AssistantQueryResultV1`:

```text
schema_version: "assistant-query-result-v1"
query_id: server-generated opaque id
intent: registered intent key or null
terminal_state: "answered" | "clarification_required" | "unsupported" |
                "denied" | "unavailable"
completeness: "complete" | "partial" | "unavailable" | "not_applicable" |
              "not_evaluated"
as_of: least-fresh timestamp among required usable sources, or null
groups: ordered AssistantResultGroupV1 records built from adapter envelopes
applied_filters: de-duplicated ordered AssistantAppliedFilterV1 records used by those groups
source_summaries: ordered AssistantSourceSummaryV1 public evidence index
route_refs: de-duplicated server-authored route references
clarification_prompt: bounded server-authored text or null
choices: server-authored clarification choices only
notices: 0 through 16 strict AssistantNoticeV1 records
```

The structured `groups`, counts, item fields, public applied filters, states, and links are the
authoritative answer. Top-level `applied_filters` is the stable first-occurrence de-duplication of
group filters in canonical group/filter order; a conflicting value for the same filter key fails
closed instead of choosing one.
A deterministic presentation builder supplies the concise empty, partial, denied, unavailable, and
unsupported text so every result remains understandable without a model.

Each group keeps its own `as_of` and per-source receipts. Aggregate `as_of` is the oldest observation
time among required usable sources, never the newest; a missing/unavailable required source also
forces partial/unavailable completeness and its notice, so the aggregate cannot overstate freshness.

Terminal derivation is fixed:

1. Invalid request and authentication failure are refused before a query result.
2. A routing tie or missing material filter is `clarification_required`, completeness is
   `not_evaluated`, `clarification_prompt` is present, and no adapter runs.
3. No registered intent/adapter is `unsupported`, completeness is `not_evaluated`, and no adapter
   runs.
4. If at least one requested adapter returns usable `complete` or `partial` data, terminal state is
   `answered`. Completeness is `partial` when any applicable adapter is partial, unavailable, or
   denied; it is `complete` only when every applicable adapter is complete and untruncated.
   `not_applicable` adapters are excluded from the applicable set after their non-sensitive check.
5. With no usable adapter, any coordinator-owned invocation denial takes precedence: terminal state
   is `denied`, completeness is `not_evaluated`, no protected source is loaded or disclosed, and no
   existence/count detail is returned. This covers all-denied, denied-plus-unavailable, and
   denied-plus-not-applicable combinations.
6. With no usable or denied adapter, any `unavailable` state yields terminal state and completeness
   `unavailable`; the result never says there are no items. This covers unavailable plus
   not-applicable.
7. If every registered adapter is `not_applicable`, terminal state is `unsupported`, completeness is
   `not_applicable`, and the result provides only its allow-listed safe recovery; it never claims an
   empty source.
8. A complete zero-match envelope is an `answered` result with `complete` completeness and the exact
   domain empty state. `not_applicable` never means zero matches.

`clarification_prompt` is non-null only for `clarification_required`; `choices` is empty for every
other terminal. `as_of` is null and groups/source summaries are empty for clarification, router-level
unsupported, and all-denied. S92's multi-Space knowledge clarification includes exactly
`assistant.clarification_internal_process`; other clarification families carry no route unless their
own future version adds a coordinator notice. A mixed answered-plus-denied composite exposes only
allowed groups and the exact `assistant.access_partial*` notice; it never identifies or counts the
denied source.

Group and item ordering comes from each owning domain's canonical order. The coordinator does not
alphabetize, reprioritize, or let a model reorder authoritative results. It returns explicit
`returned_count`, known total, and truncation state rather than implying that the visible list is all
matching work.

### Transport-neutral query milestones

`runAssistantQuery` accepts the single-use server-owned query context, an optional server-owned
observer, and its `AbortSignal` so S93 can stream real work without rebuilding the coordinator. After
admission and request defense-in-depth validation, the coordinator emits `query_started` first with
the context's opaque `query_id`. It may then emit only
`stage_started` for actual `routing|reading` transitions and `group_ready` for a complete,
schema-validated, actor-authorized result group. A `group_ready` observer payload is exactly
`{ group, route_refs }`, where `route_refs` is the de-duplicated ordered subset of validated
`AssistantRouteRefV1` objects referenced first by the group's own `route_ref_ids`, then its items and
notices in canonical order; unknown, unused, duplicate-after-deduplication, or cross-group refs fail
before observation. The terminal return carries the same `query_id`, repeats the
canonical route registry, and remains the sole canonical final result.

The observer receives no raw source/provider payload, preauthorization data, hidden count, exception,
or unvalidated link. It cannot supply an actor, intent, filter, adapter, ordering, result, or route,
and changing or omitting the observer cannot change the returned result. Observer callback exceptions
are caught and reduced to a no-op; with an un-aborted query, the terminal result remains byte-
equivalent. Adapter completion order may affect when a validated group milestone is available, but
terminal groups retain canonical order. Separately, S93 may detect an unwritable/disconnected
transport and abort the shared signal; that explicit cancellation may end computation without a
terminal result because there is no writable consumer. Tests distinguish observer failure from
transport abort. S93 alone maps milestones to NDJSON and owns its later finalizing stage; S89/S92 add
narration lifecycle without making the observer a log, queue, retry engine, or write side channel.

### Safe application route references

All result navigation uses `AssistantRouteRefV1` records created by a server-only destination
registry:

```text
ref_id: opaque result-local id
destination_key: allow-listed application destination
label: server-authored accessible label, trimmed NFC plain text, 1 through 160 Unicode code points
href: normalized same-origin application path, at most 2,048 UTF-8 bytes
open_in_new_tab: true
```

Route labels reject C0/C1 controls, bidi override/isolate characters, Markdown/HTML/link syntax, and
client/model/customer text. They are escaped only as text. Route hrefs use ASCII percent encoding
where required and contain no credentials or control characters.

Destination builders reuse existing canonical route helpers where they exist, including
`canonicalSourceLink` from `lib/work-accountability/model.ts`, the current `/work`, `/approval-queue`,
and `/lease-renewal/live/desk` destinations, and the exact renewal lease pattern
`/lease-renewal/live/desk/lease/{encodedLeaseId}`. They accept only a destination's typed stable ids
and allow-listed URL-state keys. A destination builder may add only its own canonical, server-authored
fragment for an exact stable record anchor (for example, the existing My Work task anchor) or an
explicitly registered immutable page-region anchor. The sole V1 non-record region anchor is S83/S90
`access.my_requests` with literal fragment `my-requests`; it is registered only after the guarded
region/focus contract exists and carries no request id. Neither a client nor a model may submit or
alter a fragment. Builders reject every other fragment,
absolute/protocol-relative URLs, credentials, encoded path traversal, control characters,
unsupported query keys, raw customer text, question text, email, address, reason, and model-provided
strings.

S83's deployed `/admin/access` destination is registered only through its current direct guard and
return-state contract. An S83-absent rollback fixture omits the route ref and uses typed unavailable
recovery; S88 never invents a replacement path.

S83's general first-party `access.request` builder may accept a larger nested `return_to`, but its S88
import is the strict intersection with this contract: the complete percent-encoded href must be at
most 2,048 UTF-8 bytes. If the otherwise valid assembled handoff is larger, rebuild it once without
`return_to` while preserving only the exact capability/Space preselection; if that bounded form is
valid, emit it, otherwise omit the handoff. Never truncate, partially decode, drop another query key,
or substitute a customer value. The original result remains open because S88 links use a new tab.

The result references `ref_id` from items and notices instead of duplicating arbitrary links. A
client cannot submit a route ref. A later narrator may mention only returned ref ids and cannot add or
alter labels, hrefs, destination keys, targets, or open behavior. External KB citations remain a
separate S92 contract and never pass through the internal destination registry.

### Model independence and zero query mutation

Intent, authorization, filters, date windows, adapter selection, source reads, totals, ordering,
completeness, terminal state, item data, notices, and links are resolved without importing or
constructing a model provider. A model outage, malformed narration, cost refusal, or S89 capacity
skip leaves the same authoritative `AssistantQueryResultV1` available. A narrator cannot suppress a
partial/unavailable notice or convert unsupported, denied, or unavailable into answered.

The query coordinator and every S88 adapter are read-only. Query submission cannot create or update a
workflow run, Placeholder, correction, My Work task/session, approval, access request, notification,
renewal progress, Gmail draft/message/label, provider record, source, evidence, action receipt, or
Action Registry state. It does not call `FirestoreAskLogWriter`; S89 may emit only its explicitly
bodyless, non-authoritative telemetry, and telemetry failure never changes the query result.

`/api/ask/capture`, `/api/ask/correct`, `/api/work`, process-run endpoints, and all current governed
effect routes remain separate explicit controls with their existing permissions. S94 may later
consume only S91's registered private bindings to offer a typed action candidate, but the query
endpoint never accepts an action field or executes an action. The current AskForm process-picker
auto-start behavior is not called by the new
Dashboard assistant and is removed from that surface by its owning UI suite.

### Compatibility, rollout, and rollback

S88 is additive. Implement and test the pure schemas, router, adapter registry, coordinator, route-
reference registry, and deterministic response builder without switching the current Dashboard or
changing `/api/ask`. Downstream adapter suites register only their explicit contracts. S93 then adds
the new streaming transport and Dashboard client. Existing direct `/api/ask` behavior, KB evals,
capture/correction endpoints, and old Console route remain intact until their owning migration suite
explicitly retires them.

Do not expose the new route in navigation until every required V1 adapter returns all four declared
states under tests and S89/S93 gates pass. Rollback removes the new Dashboard entry/transport while
leaving no query-created product data to migrate or reconcile. Server logs and metrics follow S89;
no transcript or query record is a rollback dependency.

**In scope / out of scope.**

In scope: strict transport-independent request; request/body bounds; server query identity;
deterministic V1 intent manifest and ambiguity behavior; actor-scoped adapter registry/interface;
complete/partial/unavailable/not-applicable adapter semantics; query terminal/completeness derivation;
deterministic result groups and empty/error copy; canonical same-origin route-reference registry;
model-independent authoritative answers; the public capability projection and representative-language
corpus; zero product mutation; compatibility seam; focused
architecture, role/scope, error, and no-write tests.

Out of scope: streaming event framing/rendering; Dashboard layout; persistent conversation memory;
free-form follow-up context; model classification; narration or hidden reasoning; confidence scores;
KB prompt/citation behavior; implementation of each domain adapter; task/process/approval/access-
request creation; any action candidate or execution; notifications/reminders; provider writes;
external links other than S92 citations; new roles, Spaces, action keys, source semantics, route
authority, model/provider, analytics product, or production budget change. Operational questions
outside the eight-key registry—including Maintenance, Workflow Communications, Connections, Internal
Processes, Notifications, and Admin-readiness state—belong only to the post-S87 S101 expansion and
must remain `unsupported` in V1.

**Open questions & assumptions.**

No material product question remains open for the foundation. V1 is intentionally single-turn and
finite. `What is blocking me?` resolves to the registered actor-work family; the result presents
separate source-owned groups rather than fabricating one cross-product status. A question that names
two unrelated domains receives clarification unless the registry explicitly owns that composite.

`Current access` means the exact role/Space/capability projection in the authenticated session plus
the deployed S83 authorized self-readback contract. The answer must label that currency and may tell a
user to refresh authentication after a verified grant; it cannot claim the latest Firebase directory
state from client claims alone.

V1 result links open in a new tab because that preserves the in-memory Dashboard session while the
user works. This does not authorize an external URL or a bypass of the destination route's own guard.
`Confidence` is interpreted as deterministic completeness, never a model percentage. `Thinking` is
owned by S93 as safe progress/receipt presentation, never chain-of-thought.

**Cross-product impacts.**

Ask request/response compatibility; Dashboard and Ask UI; authenticated session and Space guards;
My Work snapshots and canonical source links; approval/decision projections; S83 access projection;
S82/canonical live renewal desk; KB retrieval through S92; shared route construction; S89 telemetry,
privacy, and cost gates; S93 streaming transport and linked-result UI; S94 action projection; S95
Dashboard composition; architecture sentinels, API schemas, eval fixtures, and current documentation.
No provider, source, Firebase claim, action gate, role, Space, or product record is changed.

**Authority and evidence map.**

| Input                                                                                 | Classification               | Use and limitation                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `docs/facts.md`, and `docs/engineering.md`                               | Authority / present truth    | Establish Live-only operation, server authorization, value-minimized evidence, stable provider ids, independent action gates, and the no-autonomous-send/write boundaries.                                           |
| `app/api/ask/route.ts`, `lib/ask/service.ts`, `lib/schemas.ts`, and Ask tests         | Implementation truth         | Establish the current buffered KB/model path, current unbounded maximum, current response shape, logging call, and compatibility behavior; they are not operational-query capability.                                |
| `lib/ask/app-state-context.ts` and `lib/approval/needs-decision-gather.ts`            | Implementation truth / gap   | Establish the isolated three-query app-state endpoint, its disconnection from the Ask client/answer service, and catch-to-empty risk. S88 replaces neither a source owner nor an error with a verified empty result. |
| `lib/processes/intent.ts`, process classifier route, and `components/ask/AskForm.tsx` | Implementation truth / gap   | Establish current process matching and UI-coupled run creation. Neither becomes assistant authority or an implicit query mutation.                                                                                   |
| Existing Work, approval, access, and renewal services                                 | Domain implementation truth  | Supply actor-visible reads, canonical order, identifiers, status, and routes. Adapters must compose these boundaries rather than query raw stores ad hoc.                                                            |
| Dashboard AI feature notes                                                            | Intent evidence only         | Require plain-language work/renewal/access queries, clickable results, stable deterministic data, and no model-invented work. They do not authorize writes or unrestricted app introspection.                        |
| Missing adapter, model, source, or exact domain contract                              | External/adjacent dependency | Is represented as unsupported, partial, unavailable, or not-applicable. It never becomes guessed data and does not block the standalone foundation.                                                                  |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S88-1** — One strict `AssistantQueryRequestV1` schema and transport-independent
  `runAssistantQuery` service reject oversize, unknown, batch, actor/scope/intent/model/action, and
  unsupported-version inputs before source/model construction.
- **ARCH-S88-2** — One versioned deterministic intent registry owns every V1 intent, matcher/parser,
  composite, adapter dependency, and ambiguity outcome. Parity fails on an unknown or unowned intent,
  model classifier import, non-deterministic tie, or broad adapter fan-out.
- **ARCH-S88-3** — One actor-scoped adapter registry, strict public
  `AssistantAdapterEnvelopeV1`, and closed request-scoped private-projector carrier enforce domain
  authorization, read bounds, abort, source receipts, four-state completeness, downstream authority
  minimization, and validation without treating exception, denial, missing configuration, or
  truncation as empty.
- **ARCH-S88-4** — One deterministic coordinator derives `AssistantQueryResultV1`, terminal state,
  aggregate completeness, group order, totals, notices, recovery, and transport-neutral validated
  milestones solely from router and adapter output; an observer cannot alter the result and a model
  is not reachable from this architecture.
- **ARCH-S88-5** — One server-only destination registry creates every same-origin
  `AssistantRouteRefV1` from allow-listed typed parameters and rejects client/model URLs, customer
  text in URLs, traversal, unsafe schemes, unsupported query state, and stale route patterns.
- **ARCH-S88-6** — Static import and effect-spy gates prove the query path has no product/business-
  data writer, provider-effect constructor, workflow runner, draft creator, generic executor, or
  Action Registry mutation. Only S89 bodyless telemetry is an allowed non-authoritative side channel.
- **ARCH-S88-7** — The server-owned intent registry produces the complete public capability manifest
  and representative-language corpus report. Registry/example/corpus parity fails on a missing or
  extra intent, UI-authored example, undeclared grammar expansion, hidden per-intent failure, actor or
  customer field, or action claim beyond S94's one exact V1 kind.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S88-1** — A valid plain-language V1 question reaches exactly one deterministic intent or an
  explicit clarification/unsupported result; it never silently chooses between tied domains or asks
  a model to route.
- **BEH-S88-2** — An authorized complete source returns exact ordered groups, filters, count, as-of
  time, and safe links; a verified zero-match result is visibly different from unavailable or denied.
- **BEH-S88-3** — Partial, truncated, failed, timed-out, not-applicable, and mixed-adapter results
  produce their exact declared completeness and recovery without claiming that every matching item
  was found.
- **BEH-S88-4** — Role/Space/record denial occurs before protected data load, returns no protected
  count or existence signal, and cannot be bypassed by client-supplied context or a direct destination
  link.
- **BEH-S88-5** — Every result item and recovery link opens the exact current same-origin destination
  in a new tab and remains subject to that destination's guard; malformed or model-authored links do
  not render.
- **BEH-S88-6** — The same authoritative result remains available with the model disabled, failing,
  malformed, rate-limited, timed out, or cancelled before narration.
- **BEH-S88-7** — Asking a question alone creates no task, process run, Placeholder, approval, access
  request, renewal progress, draft, notification, provider effect, or source/evidence change.
- **BEH-S88-8** — A user can inspect all and only the eight supported V1 question families, understand
  that each question is routed independently, and copy an exact example into the composer. An
  unsupported or ambiguous result points back to that same bounded capability projection without
  implying fuzzy matching, conversation memory, broader operational coverage, or current source
  availability.

**Human litmus outcome.**

### Ask for current work

**If this was built correctly:** A user asks what needs attention today and receives source-labelled,
ordered work groups with exact visible counts, current-state links, and an as-of/completeness receipt.
If one source cannot be read, the page identifies that gap instead of saying there is no work.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Ask an ambiguous or unsupported question

**If this was built correctly:** A question that could mean two materially different workflows asks
the user to choose between concise options without loading either workflow. An unsupported request
says the capability is not available; it does not show an empty list or a made-up process.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Recover from an incomplete source

**If this was built correctly:** When one requested source times out or only part of a bounded result
is available, the user still sees verified items, exactly what is incomplete, and the safe retry or
full-page destination. No count or wording implies the visible subset is exhaustive.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Ask without causing work

**If this was built correctly:** A user can ask, retry, clarify, and open a result without starting a
process, creating a task or approval, changing a lease, or contacting anyone.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                       | Architecture outcome | Behavior outcome         | Human litmus                             | Deterministic evidence / falsification                                                                                                                                                                                                         |
| ------------------------------------------------- | -------------------- | ------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict bounded request and server-owned actor     | `ARCH-S88-1`         | `BEH-S88-1`, `BEH-S88-4` | Ask an ambiguous question                | Schema/route tests reject unknown fields, unsupported versions, >2,000 code points, >16 KiB, arrays, client actor/role/scope/intent/filter/model/action, and prove no dependency call.                                                         |
| Deterministic finite intent routing               | `ARCH-S88-2`         | `BEH-S88-1`              | Ask for work; Ask an ambiguous question  | Golden phrase, punctuation/case/Unicode, tie, missing-filter, no-match, order, and registry parity tests run with a model-constructor spy.                                                                                                     |
| Actor-scoped adapter and four-state truth         | `ARCH-S88-3`         | `BEH-S88-2/3/4`          | Ask for work; Recover                    | Role × Space × source-state matrices prove pre-load denial, complete empty, partial, unavailable, not-applicable, exception, timeout, malformed output, truncation, and that each closed private payload reaches only its registered consumer. |
| Model-independent structured authoritative result | `ARCH-S88-4`         | `BEH-S88-2/3/6`          | Ask for work; Recover                    | Snapshot/property tests derive terminal/completeness/count/order/notices identically with no provider, failing provider, shuffled adapter completion, or absent/throwing/slow observer; milestones contain only validated public groups.       |
| Server-authored clickable application links       | `ARCH-S88-5`         | `BEH-S88-5`              | Ask for work                             | Destination parity and malicious-string tests accept exact canonical routes and reject absolute/protocol-relative/traversal/control/customer/query/model inputs.                                                                               |
| No write or effect from a query                   | `ARCH-S88-6`         | `BEH-S88-7`              | Ask without causing work                 | Static dependency sentinels plus store/provider/action spies prove zero product writes/effects for success, empty, partial, denied, unsupported, retry, and cancellation.                                                                      |
| Compatible incremental migration                  | `ARCH-S88-1/4/6`     | `BEH-S88-6/7`            | Ask without causing work                 | Existing `/api/ask`, KB eval, capture/correction, workflow, Work, approval, renewal, and auth suites remain green while the new service is unreferenced by legacy UI.                                                                          |
| Discoverable, honestly bounded V1 coverage        | `ARCH-S88-2/7`       | `BEH-S88-1/8`            | Ask an ambiguous or unsupported question | Manifest parity and per-intent corpus reports prove the UI exposes exactly eight families, every approved example routes deterministically, rejected near misses stay rejected, and no aggregate hides an uncovered family.                    |

**Preservation set.**

Current `/api/ask` source-state/citation/draft behavior and KB evals; existing process classifier and
explicit process-run permissions; Ask capture/correction route meaning; My Work actor isolation,
canonical source links, ordering, idempotency, and truncation; approval queue visibility and exact
transitions; S83 access semantics; S80/S82 renewal role/Space/source/action truth; S84 terminology;
S85/S86 interaction/accessibility contracts; S87 content ownership; Firebase/session guards;
Live-only environment; local Live-read-only refusal; Action Registry exact-key separation; permanent
in-app send refusal; query-path zero-write behavior even when separately governed exact RentVine or
operating-Sheet keys are executable; secrets/PII scans; and canonical
verification remain green as separate gates.

**Adversarial acceptance checks.**

- **AC-S88-1** — `ARCH-S88-1/2` reject oversize or recursive JSON, unknown schema/fields, client-
  selected actor/role/scope/intent/adapter/filter/timezone/model/link/action, Unicode/case tricks that
  alter routing, registry collision, missing owner, and model fallback routing before any adapter.
- **AC-S88-2** — `ARCH-S88-3` proves a signed-out/wrong-domain/Vendor/malformed-claim actor and a
  role/Space miss trigger no protected read; a thrown, timed-out, malformed, incomplete, stale, or
  truncated adapter cannot return `complete` or a zero count.
- **AC-S88-3** — `ARCH-S88-4` exhaustively derives each terminal/completeness combination, including
  complete empty, all unavailable, all denied, mixed complete/unavailable, mixed denied/allowed, and
  all not-applicable, with stable group/item order under randomized completion order. Observer tests
  require `query_started` first, matching terminal `query_id`, real validated group milestones only,
  and byte-equivalent terminal results when the observer is absent or throws while the transport is
  still writable. A shared transport abort is not an observer failure: it cancels remaining work and
  permits no late milestone, narration, action token, or terminal event. Boundary fixtures prove a
  schema-valid group and complete result remain within their 512 KiB and 768 KiB UTF-8 limits after
  public filters, notices, source summaries, and route registries are included.
- **AC-S88-4** — `ARCH-S88-5` rejects `http:`, `https:`, `//`, credentials, client/model-supplied or
  noncanonical fragments, traversal, double encoding, CR/LF, unsupported query keys, labels/ids
  supplied by a model or client, raw question/customer values, and a route that no longer matches its
  canonical builder; a canonical server-built record anchor remains valid.
- **AC-S88-5** — `ARCH-S88-6` uses Firestore/store/provider/fetch/model/action spies and import scans
  to prove one query and every retry/cancel/error branch create zero product records, process runs,
  tasks, approvals, access requests, drafts/messages/labels, source writes, or action receipts.
- **AC-S88-6** — `BEH-S88-1/2/3` run the required work, blocked, approval, next-month renewal, access,
  ambiguity, unsupported, verified-empty, partial, and unavailable fixtures without any model and
  validate exact filter/as-of/count/completeness/recovery presentation data. Golden matcher fixtures
  accept each of the three exact `work.blocked` forms and reject their material one-token/domain
  neighbors rather than relying on a broad blocker regex. Contract tests accept
  only the registered `AssistantAppliedFilterV1` key/type/order/label tuples and exact
  `AssistantNoticeV1` code/kind/message/recovery pairings; they reject raw questions, customer/staff
  labels, stable ids, URLs, unknown notice copy, missing required recovery, and foreign route refs.
- **AC-S88-7** — `BEH-S88-4/5` prove direct-link reauthorization, no existence leakage, stable opaque-
  id encoding, exact destination/new-tab semantics, and safe link omission when the destination
  cannot be established.
- **AC-S88-8** — Existing Ask/KB/process/capture/correction/Work/approval/renewal tests and the full
  preservation set pass independently; a legacy behavior passing cannot substitute for a missing S88
  outcome.
- **AC-S88-9** — The capability-manifest schema, registry parity, S93 consumer snapshot, and
  representative-language report fail on any ninth V1 intent, missing registered intent, UI-only
  example, live-data field, action overclaim, aggregate-only result, model-routed corpus row, or
  accepted misspelling/fuzzy/unsupported-domain phrase. Every approved example and declared supported
  language variant passes under a model-constructor spy.

**Forbidden actions / hard gates.**

No model routing, model-derived filter/date/count/state/link/action, client-supplied authority, broad
database reflection, unrestricted adapter fan-out, raw provider/store access outside an owning
service, catch-to-empty behavior, guessed identity or provider mapping, arbitrary/external route,
query/body/identity in telemetry, persistent transcript, query-triggered product/evidence write,
workflow auto-start, generic executor, provider effect, Gmail draft/send/label, notification, source
write, role/Space/action mutation, hidden Demo/Test fallback, or bypass of exact destination guards.
No action key, role, Space, provider, source-of-truth, budget, runtime, or protected-path authority is
changed by this suite.

**Dependencies / sequencing.**

S88 consumes current auth/Space guards and owning domain read contracts. It is implemented before
the Dashboard operational adapters, S92 narration, S93 streaming UI, S94 action projection, and S95
Dashboard composition. Domain adapter suites may proceed in parallel after the S88 registry/envelope
contracts pass. S89 is a mandatory privacy/observability/cost gate before any new assistant endpoint
is exposed. S92 may add the `guidance.knowledge` adapter and optional model-backed narration without changing the
S88 authoritative result. S93 owns `/api/assistant/query/stream` serialization and cancellation but
must emit only S88 states and refs. S94 may project its own actor-bound sealed candidates server-side
from current authorized results; no result-local id/route ref becomes later authority, and S94 cannot
add a write to `runAssistantQuery`. S83 must exist before `access.mine` can
claim verified directory readback or offer an access request.

S101 is deliberately downstream of S87. It may add deterministic read-only intent contracts only
through a new registry version after the current eight-intent V1 is deployed and measured. No S101
domain or example may enter this suite's manifest, tests, or release gate.

**Standalone delivery contract.**

- **Deliverable now:** Complete request/result schemas, deterministic intent and destination
  registries, adapter interface, coordinator, deterministic state/text builder, fake read adapters,
  architecture sentinels, role/scope/state/link/no-write tests, and current documentation. They can
  reach `ALL_GATES_GREEN` without a model, streaming UI, production adapter, or source mutation.
- **Consumes, but does not assume:** Current Work, approval, access, renewal, and KB read services.
  Until a domain adapter is registered, its intent returns `unsupported`; an installed but unhealthy
  adapter returns `unavailable`. No fake result stands in for an absent dependency.
- **Externally blocked effect:** None. This suite authorizes no external effect. Production exposure
  remains intentionally absent until S89, required adapters, and S93 pass; that rollout dependency
  does not block the standalone read-only foundation.
- **Produces for downstream suites:** `AssistantQueryRequestV1`, `AssistantIntentRegistryV1`, adapter
  registration contract, `AssistantAdapterEnvelopeV1`, `AssistantQueryResultV1`, deterministic
  terminal/completeness rules, transport-neutral validated milestones, `AssistantRouteRefV1`, safe
  destination registry, and no-write/model-independence evidence.

**Verification and delivery contract.**

1. Before implementation edits, record current `/api/ask` schema/response/log/model flow, current
   process auto-start behavior, the isolated app-state endpoint and its Ask-client/service
   disconnection, catch-to-empty approval behavior, route
   helpers, auth/Space guards, and a preservation baseline. Materialize failing S88 schema, router,
   adapter-state, link, model-absence, and no-write tests.
2. Run the smallest focused schema/property/router/coordinator/authorization/destination/effect-spy
   checks that exercise every `ARCH-S88-*`, `BEH-S88-*`, and adversarial row. Keep legacy Ask and
   domain preservation results separate.
3. Run `bash scripts/verify.sh`, inspect the mechanical diff, and audit secrets, PII, imports, route
   authority, exact action gates, runtime configuration, and scope traceability before any authorized
   delivery.
4. Report one implementation terminal state: `ALL_GATES_GREEN`; `BUDGET_EXHAUSTED` only when an
   explicit budget exists; or `BLOCKED` only for an exact unavailable external input/authority after
   all independent fail-closed work is complete. Passing the foundation does not claim the Dashboard
   assistant, any adapter, streaming UI, narration, or action is operational.

**Ordered prompt sequence.**

1. Re-verify the current Ask route/service/UI, auth/Space boundaries, domain route helpers, and all
   current writer/provider imports before accepting this spec's starting claims.
2. Materialize fail-first request, intent, adapter-envelope, terminal-state, route-ref, model-absence,
   and zero-write checks plus the legacy preservation baseline.
3. Implement pure schemas/registries, then actor-scoped coordinator and deterministic presentation;
   register only fake adapters until each owning domain suite supplies its contract.
4. Falsify every request, ambiguity, role/Space, complete/empty/partial/unavailable/truncation,
   malicious-link, randomized-order, cancellation, and effect-spy case.
5. Run focused and canonical gates, reconcile current docs, and ship only within existing authority;
   do not expose the endpoint or change legacy Ask/UI as part of S88.

**Deletion/merge recommendation.**

Remove S88 from the active tree when its request, routing, adapter, result, completeness, route, and
zero-query-mutation contracts are enforced by code/tests and represented in current architecture
facts, and every downstream assistant suite references those live contracts rather than duplicating
them.
