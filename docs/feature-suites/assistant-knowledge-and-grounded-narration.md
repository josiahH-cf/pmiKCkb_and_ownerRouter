<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: dashboard-assistant-v1 -->

# S92 — Assistant knowledge and grounded narration

> Status: Specified and not implemented. The deployed Ask service answers source-backed KB questions
> through scoped retrieval and structured model output, but it is not an S88 assistant adapter and no
> operational result currently has the minimized, injection-resistant narration envelope defined
> here.

**Goal.**

Let a managed user receive a concise, source-grounded explanation of authorized knowledge or
deterministic operational results without making model prose, hidden reasoning, or model confidence
the source of truth, and without losing the structured result when narration is unavailable.

**Current state / intended end state.**

The current `/api/ask` route requires `read`, scopes the request to the authenticated user's
accessible Spaces, retrieves from configured Vertex AI Search data stores, excludes deprecated and
high-sensitivity sources, classifies source support before generation, and canonicalizes every model-
selected citation against the server retrieval set. `Partial Source`, `Open Placeholder`, `Conflict
Found`, and `No Reliable Source Found` cannot be promoted to verified truth by the model. The direct
Ask response can also contain handling steps and an optional draft, and its configured answer
generator retries malformed structured output once. This remains compatibility behavior during the
assistant migration.

The current Ask path does not consume the application's deterministic operational state. Its prompt
does not explicitly declare retrieved excerpts and record labels to be untrusted data, and its answer
shape is not a safe action or link contract. The current dashboard therefore cannot treat Ask output
as a comprehensive operational answer.

The intended state registers current KB Ask behavior as one actor-scoped S88 knowledge adapter while
keeping deterministic operational adapters separate. The dashboard adapter requests no draft and
starts no workflow. After S88 has produced authorized, minimized evidence, S92 may invoke one optional
model narrator under S89's budget. The narrator returns plain-text, evidence-referenced segments only.
The server validates the complete output before exposure, expands only canonical server-held
citations, and otherwise returns a deterministic summary over the same structured evidence. The
structured groups, completeness state, and canonical destinations remain usable even when no model
is configured, the budget gate refuses a call, the model times out, or output validation fails.

**Actors and entry conditions.**

- A managed `pmikcmetro.com` Editor, Approver, or Admin begins with a valid current session and may ask
  a knowledge question or an S88-supported operational question.
- The S88 router has already resolved the actor and, for operational narration, produced only
  authorized `AssistantAdapterEnvelopeV1` evidence. An unavailable or denied adapter is not converted
  into an invented narrative.
- A knowledge request is limited to a server-resolved authorized scope. A wildcard actor retains the
  current whole-KB behavior; one explicitly scoped Space is selected directly; an actor with multiple
  named scopes must name exactly one registered Space/process term or receives clarification before
  retrieval. Client-supplied role, actor, Space entitlement, source ids, citations, or destination
  URLs are never trusted.
- Model generation is optional, but the S92 narration envelope is mandatory for every S88
  `answered` result. The model path is entered only after S89 admits the one cost-bearing narration
  call and after minimized evidence exists. A missing model, exhausted budget, timeout, rate limit,
  or capacity refusal selects deterministic narration rather than blocking the result. Non-answered
  terminal states never carry a narration envelope.
- `No Reliable Source Found`, conflict, stale/review-due, partial coverage, unavailable data, and
  truncation remain explicit entry facts. They are not hidden to make an answer sound complete.

**What it is / how it functions.**

### Knowledge adapter boundary

Register one `guidance.knowledge` adapter through S88. It reuses the existing server-side retrieval,
source-metadata, source-state, and citation-canonicalization boundaries directly; it does not call the
public `/api/ask` route over HTTP and does not duplicate a second retrieval implementation. Its
assistant invocation has these fixed differences from the preserved direct Ask route:

- `draft_enabled` is always `false` and no draft field crosses into an assistant result;
- `process_id` is absent, so asking cannot select or start a workflow run;
- scope resolution uses this exact rule: wildcard claims search the current whole-KB target set; one
  named scope maps to its existing default Space; multiple named scopes require exactly one full,
  case-insensitive registered Space display name or process-definition label in the normalized
  question and map it through the current Space/process-scope registry. Zero or multiple matches
  return S88 `clarification_required` with `Name one Internal Process or Space` and the authorized
  Internal Processes recovery link; no retrieval runs and the current first-scope fallback is not
  reused by the Dashboard assistant;
- the adapter registers `maximum_result_size: 8`. More than eight authorized sources/citations keeps
  the current canonical retrieval order, returns the first eight, and marks the envelope
  `partial`/truncated; a total is shown only when the retrieval boundary establishes it;
- one dashboard query may make at most one optional S92 narration model invocation under S89, with no
  automatic model retry; and
- the adapter returns the exact `AssistantAdapterEnvelopeV1<KnowledgeSourceItemV1>` group/item/data
  projection and query-local citation refs rather than executable prose, Markdown, HTML, or actions;
  S92's canonical external-citation registry remains the separate answered-envelope transport below.

Preserve `/api/ask` and its response contract during migration. Existing bookmarks, tests, direct Ask
correction/capture behavior, and the direct route's current bounded invalid-JSON retry are not silently
changed by the dashboard adapter. A later migration may converge the direct route only through an
explicit compatibility proof.

Knowledge retrieval completion and knowledge quality are independent. A successful bounded search
with no supporting source is a completed read with `No Reliable Source Found`, not an infrastructure
failure. Conversely, an unavailable data store is `unavailable`, not `No Reliable Source Found`.
`Verified Source`, `Partial Source`, `Open Placeholder`, and `Conflict Found` retain their current
meanings and never stand in for S88's operational `complete|partial|unavailable|not_applicable`
coverage state.

Current retrieval is not approved-only: it excludes `Deprecated` and `High`-sensitivity sources,
while an otherwise usable `Unreviewed`, `Transcript-derived`, or metadata-missing source can remain
visible under the current partial/review semantics. S92 preserves that distinction. It does not
rewrite every returned source as Approved or imply that `Partial Source` is an infrastructure error.

### Closed knowledge result and citation manifests

`guidance.knowledge` registers exactly one S88 group key, `guidance.knowledge.sources`, with exact
group label `Knowledge sources`, and exactly one item kind, `knowledge_source`. The producer,
coordinator, and renderer reject a substituted query-derived or source-derived group label. Its
`AssistantResultItemV1.data` has exactly these fields:

```text
source_title: trimmed NFC plain text, 1 through 200 code points
source_state: "Verified Source" | "Partial Source" | "Open Placeholder" |
              "Conflict Found"
approval_status: "Approved" | "Unreviewed" | "Transcript-derived" | null
excerpt: trimmed NFC plain text, 1 through 600 code points, or null
last_reviewed_at: ISO timestamp or null
freshness: "fresh" | "review-due" | "stale" | "unknown"
citation_ref: opaque query-local S92 citation ref, 1 through 128 ASCII characters from the S88 local-ref alphabet
```

Control/bidi-override characters, Markdown/HTML/link syntax in presentation fields, unknown keys,
`Deprecated`, `High` sensitivity, stable source/Drive/data-store ids, raw retrieval scores, and URLs
outside the citation registry fail closed before the S88 envelope is exposed. Canonical retrieval
order is retained. A complete bounded read with no support emits the same group with zero items,
`matched_count=0`, and exact notice `knowledge.no_reliable_source`; it does not manufacture a source
item. The other exact source-state notices are `knowledge.verified_source`,
`knowledge.partial_source`, `knowledge.open_placeholder`, and `knowledge.conflict_found`. S88 group
state continues to represent read coverage; these S92 notices represent knowledge quality.

The group's public `applied_filters` has exactly one record: `filter_key: "knowledge_scope"`, label
`Knowledge scope`, and enum value `all_authorized_spaces` when wildcard claims use the authorized
whole-KB target set or `one_authorized_space` when the resolver selects exactly one registered Space.
It never contains a Space/process label or id, question fragment, source title, retrieval token, or
customer/staff value. Every group has exactly one S88 `internal_processes` group route built as the
guarded same-origin `/spaces` destination; external source citations remain the separate registry
below.

S92's sole S88 route registration is exact: `destination_key: "internal_processes"`, label `Open
Internal Processes`, fixed builder `/spaces`, and `open_in_new_tab:true`. The current guarded route
reauthorizes on open. An altered label/path, query, fragment, dynamic value, external URL, or another
destination key fails the adapter envelope; knowledge items never create internal route refs of their
own.

S92 may emit only these S88 notices, in table order after exact-code de-duplication. Each row freezes
the kind, exact message, and whether the `internal_processes` group route is required as recovery.

| Code                             | Kind          | Exact message                                                                      | Recovery                    | Exact trigger                                                                              |
| -------------------------------- | ------------- | ---------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| `knowledge.no_reliable_source`   | `information` | `No reliable source supports this answer.`                                         | internal processes required | a complete bounded read has zero supporting sources                                        |
| `knowledge.verified_source`      | `information` | `Verified source material supports this answer.`                                   | none                        | at least one returned item has `Verified Source`                                           |
| `knowledge.partial_source`       | `partial`     | `Some source material is incomplete or still under review.`                        | internal processes required | at least one returned item has `Partial Source`                                            |
| `knowledge.open_placeholder`     | `partial`     | `A source contains an open placeholder that still needs review.`                   | internal processes required | at least one returned item has `Open Placeholder`                                          |
| `knowledge.conflict_found`       | `partial`     | `Available sources conflict. Review the cited source material.`                    | internal processes required | at least one returned item has `Conflict Found`                                            |
| `knowledge.citation_unavailable` | `partial`     | `A source link is unavailable. Open Internal Processes to review source material.` | internal processes required | one or more otherwise usable sources lack a valid canonical citation destination           |
| `knowledge.sources_truncated`    | `truncated`   | `More knowledge sources match. Open Internal Processes to review them.`            | internal processes required | a trustworthy match exceeds the eight-item return cap                                      |
| `knowledge.source_unavailable`   | `unavailable` | `Knowledge sources are temporarily unavailable.`                                   | internal processes required | the authorized retrieval or required metadata boundary cannot produce a trustworthy result |

`knowledge.no_reliable_source` is mutually exclusive with every returned-item source-state notice.
Multiple returned source states emit their notices in table order. An unknown code, wrong kind/copy,
missing or extra recovery, or notice whose trigger is false fails the adapter envelope.

The server builds one closed external-link registry from the authorized canonical retrieval set,
never from model output. `AssistantExternalCitationV1` has exactly:

```text
schema_version: "assistant-external-citation-v1"
citation_ref: opaque query-local id, 1 through 128 ASCII characters from the S88 local-ref alphabet,
              also present on exactly one returned knowledge_source item
label: the canonical source title, trimmed NFC plain text, 1 through 200 code points
href: canonical absolute HTTPS source URL, at most 2,048 UTF-8 bytes
last_reviewed_at: ISO timestamp or null
freshness: "fresh" | "review-due" | "stale" | "unknown"
```

The request-scoped producer type is exact:

```text
AssistantKnowledgeCitationRegistryV1 {
  schema_version: "assistant-knowledge-citation-registry-v1"
  entries: 0 through 8 AssistantExternalCitationV1 records
}
```

The registry contains at most eight entries in returned-item order, has unique refs and canonical
URLs, serializes to at most 24 KiB UTF-8, and contains no `source_id`, Drive id, data-store id, excerpt, provider score, credentials, or
client/model value. Non-HTTPS, credential-bearing, malformed, `data:`, `javascript:`, and rewritten
destinations are rejected. A source without a valid canonical destination is omitted from returned
items, forces `partial` when other usable sources remain, and adds exact notice
`knowledge.citation_unavailable`; if none remain, the adapter is `unavailable`, not a verified
zero-support answer.

The knowledge adapter places `AssistantKnowledgeCitationRegistryV1` only in S88's registered private
projector carrier beside its strict public envelope. S89 passes that request-scoped value only to
S92's narrator/fallback builder after S88 validates the result. The model receives allowed citation
refs and public knowledge facts but never the registry object or any `href`; after complete model
output validation, the server expands refs from this registry. The private registry is transported
publicly only inside the mandatory answered-result `AssistantNarrationEnvelopeV1` as
`external_citations`. It is not an S88 `AssistantRouteRefV1`, result field, observer milestone,
`group_ready` value, model input, log, metric, URL parameter, transcript record, or durable record.
Operational results have no private registry and receive an empty `external_citations` array. A
missing, mismatched, duplicate, or unknown registry/ref on an otherwise knowledge-answered path fails
the model envelope and uses the deterministic builder from the same validated registry; if that
registry itself cannot be validated, the knowledge adapter is `unavailable`, not an unlinked answer.
S93 may initially render a knowledge row as text, then attach its external link only after the
validated `narration_ready` envelope supplies the matching entry.

One adapter invocation makes exactly one logical `RetrievalClient.search` call after scope and
authorization succeed. With the current `VertexSearchRetrievalClient`, that call performs exactly one
bounded, non-autopaginated Search RPC (page size 10) per resolved configured target: one for a named
scope and the number of configured authorized launch-Space targets for wildcard scope. It then makes
one bounded source-metadata reader invocation over the deduplicated returned Drive-file ids (which may
perform its current per-id Firestore reads). Clarification, denial, invalid scope, or an unavailable
required S88 predecessor makes zero retrieval/model calls. No S92 path retries retrieval at the
adapter layer, ingests/indexes a source, or performs a provider write/effect.

### Minimized narration input

S89's server-only narration-fact builder consumes an already-authorized S88 query result and emits
the frozen `AssistantNarrationFactsV1` contract. S92 supplies only its registered knowledge fields to
that builder: already-authorized canonical citation reference ids, titles, review/freshness state,
and bounded short excerpts. The remaining allowed fields, 32 KiB/20-item bounds, deterministic
compaction order, and excluded identity/customer/provider/link/secret/error fields are exactly S89's
two-level minimization contract; S92 does not define a parallel or wider prompt shape.

For `guidance.knowledge`, the normalized current question is included under S89's sole user-content
exception because retrieval/answering requires it. Operational narration receives only S89's server-
authored, identity-free intent/filter paraphrase; owner/tenant/customer labels in the original
question never reach that model input. Prior turns are excluded in both cases. Every excerpt and fact
string is marked as untrusted quoted data. Adapter items are bounded before model construction;
exceeding a bound is represented by S88's `truncated` fact and never solved by silently sending more
data.

### Instruction and output boundary

The system instruction states that only the server instruction and registered output schema are
instructions. The question, source excerpts, property/tenant/owner labels, process text, stored notes,
and provider fields are untrusted data even when they contain phrases such as “ignore previous
instructions,” role claims, links, or action requests. The model has no tools and receives no
endpoint, credential, action registry, or write capability.

The complete model response must first validate as strict `AssistantNarrationModelOutputV1`. It has
only two keys and serializes to at most 32 KiB UTF-8 before parsing into the public envelope:

- `segments`: 1 through 6 objects. Each object has exactly `text` and `evidence_refs`; `text` is NFC-
  normalized, trimmed plain text from 1 through 400 Unicode code points, and `evidence_refs` contains
  1 through 5 distinct ids from S88's allowed result-local evidence index. Across all segments there
  are at most 12 distinct evidence refs.
- `citation_refs`: 0 through 8 distinct ids copied from S92's allowed
  `AssistantExternalCitationV1` registry. Each ref must correspond to a `knowledge_source` item
  evidence ref used by at least one segment; operational narration therefore supplies an empty
  array.

Unknown keys, unknown/duplicate refs, empty factual evidence, excessive counts/lengths, control or
bidi-override characters, HTML/Markdown/link syntax, action-shaped data, or source-state/coverage
claims that disagree with S88 discard the complete model output before it reaches S93. The model does
not emit `mode`, `summary`, `limitations`, `answered_by`, a URL/title, or a schema version.

After validation, the server creates `AssistantNarrationEnvelopeV1` with these exact keys:

```text
schema_version: "assistant-narration-v1"
mode: "model" | "deterministic"
summary: trimmed NFC plain text, 1 through 400 code points
summary_evidence_refs: 1 through 5 distinct S88 result-local evidence refs
segments: 0 through 5 { text, evidence_refs } objects under the model segment bounds
citation_refs: 0 through 8 distinct citation_ref strings
external_citations: 0 through 8 AssistantExternalCitationV1 records
limitations: 0 through 4 server-built strings, each 1 through 240 code points
answered_by: configured friendly model label | "Deterministic summary"
```

The complete serialized envelope is at most 64 KiB UTF-8. S93 validates that bound and the 24-KiB
citation-registry/2,048-byte-href sub-bounds before emitting `narration_ready`; an over-limit model
output is discarded and the deterministic builder must itself fit the same limit. If the validated
deterministic envelope cannot fit, finalization fails before any narration event rather than truncating
one evidence binding or violating the stream line budget.

`summary` is the first validated model segment or first deterministic statement, and
`summary_evidence_refs` are copied from that same statement before it is removed from `segments`.
The remaining segment objects retain their own evidence refs, so no factual statement loses its
binding and the summary is not duplicated. There are at most 12 distinct evidence refs across the
summary and remaining segments. Every evidence ref exists in the same terminal S88 result; every
model `citation_ref` exists in `external_citations` and is supported by a knowledge item referenced
by the summary or a segment. `external_citations` contains the complete bounded server registry,
including canonical sources not selected by the model, so deterministic results never lose source
links. `limitations` are copied from explicit S88 source-state/coverage facts. The server stamps
`mode` and `answered_by`; model titles, URLs, review dates, freshness values, mode, limitations, and
attribution are never accepted.

S92 does not stream raw model tokens. The whole envelope, including evidence binding and external
citation registry, validates before narration is exposed. S93 may
stream truthful query/adapter progress as it occurs and then deliver one validated
`narration_ready` payload. A future incremental narration mode requires a separately proven S92
sentence/chunk validator and real provider streaming; timers, artificial chunking, and exposure of
unvalidated deltas cannot satisfy this suite.

Call count is deterministic. First evaluate the complete returned knowledge-state set: if any item is
`Open Placeholder` or `Conflict Found`, or the result is `No Reliable Source Found`, the whole result
uses the deterministic renderer and makes zero narrator calls even when another returned item is
`Verified Source` or `Partial Source`. Otherwise, an S88 answered operational result or a knowledge
result containing `Verified Source` and/or `Partial Source` makes exactly one narrator invocation when
S89 admits it, and zero when S89 refuses or no model is configured. This precedence preserves the
current review/no-support boundary for every mixed-state result. An admitted invocation makes one
provider generation request and has no
S92 repair retry; invalid output, timeout, rate limit, response loss, or provider exception goes
straight to deterministic narration. These generation calls and the exact Vertex reads above are
the only permitted S92 provider calls. Provider ingestion, source mutation, tools, drafts, messages,
labels, and every other provider write/effect remain at zero.

### Deterministic fallback

One pure renderer accepts the same minimized S88 result and produces
`AssistantNarrationEnvelopeV1` with `mode: deterministic` inside the same exact counts/string bounds.
It copies the evidence refs supporting each fixed statement into `summary_evidence_refs` or that
segment's `evidence_refs`, carries the complete validated external-citation registry for knowledge
results, and never performs retrieval or reads a store. For operational results it
states the interpreted scope and exact authorized counts, then points to the already-present
structured result groups. For knowledge results:

- `Verified Source` or `Partial Source` with citations returns `I found <n> relevant PMI KC
source(s), but an AI summary is unavailable. Review the sources below.` plus the exact source-state
  limitation, where `<n>` is the validated external-citation registry length;
- `Open Placeholder` and `Conflict Found` preserve the current review-only meaning and canonical
  sources without choosing a winner;
- `No Reliable Source Found` preserves the current no-support meaning and never writes a generic
  property-management answer.

Retrieval `unavailable` is a non-answered S88 terminal result, so it bypasses this renderer and uses
only S93's deterministic terminal retry/recovery copy. It never receives an
`AssistantNarrationEnvelopeV1`.

The renderer uses fixed templates and server facts. It does not derive policy, recommend an effect,
or manufacture a citation. A narration failure never removes S88 groups, counts, coverage,
destinations, or recovery.

For every S88 `answered` result, S92 returns exactly one validated
`AssistantNarrationEnvelopeV1`: model mode after a valid admitted call, otherwise deterministic mode
with the exact fallback reason kept only in bodyless telemetry. Non-answered terminal states use
S93's deterministic terminal copy and emit no narration envelope. This makes model failure a visible
plain-language fallback without creating a second model attempt or a missing/ambiguous stream slot.

### Transparency without hidden reasoning

The narration contract contains no chain-of-thought, scratchpad, reasoning trace, system prompt,
provider log-probability, retrieval-score display, or general `confidence` field. S93's separate
“How this was checked” view consumes only S88/S89 deterministic metadata: matched intent,
interpreted filters and dates, systems successfully checked, `as_of` and freshness, authorized counts,
completeness/truncation, source state, and whether narration was model-generated or deterministic.

A numeric model confidence is not displayed. Current retrieval confidence remains an internal
threshold input, not a calibrated promise that every record was found. Knowledge source state and
operational coverage use their separate exact vocabularies. No UI may relabel either as “AI
confidence.”

### Prompt and narration audit boundary

S92 emits only S89's value-minimized events: request correlation, intent, narrator mode, admitted or
refused model-call category, adapter/source-state categories, validation outcome, duration, numeric
provider-reported token usage when available, and terminal fallback reason. It does not add the
question, prompt, generated prose, excerpts, citations, customer values, Gmail bodies, or raw evidence
to routine logs, metrics, traces, or source control. S89 owns retention, access, redaction, rate,
concurrency, timeout, and total-cost controls.

**In scope / out of scope.**

In scope: current KB Ask as an S88 knowledge adapter; the closed knowledge group/item/data manifest;
direct-route compatibility; assistant-specific no-draft/no-process behavior; exact bounded Vertex
read counts; minimized narration input; explicit untrusted-data instructions; strict summary/segment
evidence binding; canonical external-citation registry and transport; deterministic fallback;
zero-or-one-call S89 admission; mandatory answered-result envelope; source/coverage limitations;
no-hidden-reasoning transparency; injected-model tests; and value-minimized narration telemetry.

Out of scope: S88 operational intent routing or domain reads; S89 budgets, transcript persistence,
metrics storage, or rollout controls; S93 transport, streaming UI, chat layout, result cards, link
rendering, copy, or focus behavior; S94 action proposals; S95 Dashboard composition; a general inbox;
raw Gmail-body analysis; autonomous or scheduled reminders; model tools; workflow/task/approval/
provider execution; source ingestion or approval; changing Action Registry keys; changing the current
meaning of knowledge source states; or migrating/removing `/api/ask`.

**Open questions & assumptions.**

- **Assumption — one optional narrator:** S89's one optional dashboard narration invocation per query
  is the cost authority. Invalid or unavailable output falls back immediately; the assistant path does
  not spend a second call repairing JSON.
- **Assumption — locale:** V1 uses the application's current English copy and server-supplied time-zone
  label. S92 does not infer a locale or time zone from prose.
- **Assumption — conversation memory:** S89's session-local transcript contract applies. S92 receives
  only the current bounded request plus explicit S88 context; it does not create durable chat memory.
- **Assumption — operational facts:** S92 narrates only S88-registered envelopes. The absence of a
  domain adapter produces unsupported/not-applicable behavior rather than a model answer about live
  state.
- **No material unresolved product decision:** These defaults preserve current authority and permit a
  complete fail-closed implementation without new provider credentials or action grants.

**Cross-product impacts.**

Affected boundaries are the shared Ask service and model-provider seam, Vertex Search retrieval and
source metadata, citation/source-state helpers, the S88 assistant query result, S89 model admission and
telemetry, and the S93 presentation stream. Current Ask/correction/capture routes and existing
knowledge records remain compatible. No provider writer, approval store, Work store, workflow-run
store, role claim, Action Registry entry, connection record, Gmail draft/message, renewal record, or
operating Sheet cell is changed by S92.

**Authority and evidence map.**

| Input                                                                                         | Classification                  | Use and limitation                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `docs/integration-architecture.md`, and `docs/engineering.md`                    | Authority / safety contract     | Model output cannot widen action authority; authentication is server-side; stale/ambiguous data is not Verified; logs remain value-minimized.                                                  |
| Current Ask route/service, retrieval, source-state, prompt, citation, schema, and model tests | Implementation truth            | Supplies scoped KB retrieval, current source-state behavior, canonical citations, structured output, direct-route compatibility, and the exact gaps above.                                     |
| S88 deterministic assistant query foundation                                                  | Required predecessor contract   | Supplies the read-only intent registry, actor-scoped adapters, evidence ids, completeness, structured groups, route refs, and terminal query states.                                           |
| S89 assistant privacy, observability, and cost controls                                       | Required rollout contract       | Supplies session-local context, minimization enforcement, one optional narrator-model call, timeout/rate/concurrency/cost gates, telemetry, and production rollout.                            |
| S90 assistant work, approval, and access read adapters                                        | Required operational input      | Supplies actor-scoped Work, approval, and access groups with verified source receipts and server-authored route refs; S92 may narrate but cannot reinterpret them.                             |
| S91 canonical lease-renewal assistant query adapter                                           | Required renewal input          | Supplies canonical, scoped renewal facts, coverage, source receipts, and route refs; S92 may narrate only the returned minimized projection.                                                   |
| S93 dashboard assistant streaming and linked results                                          | Downstream presentation owner   | Renders structured results, real progress, canonical links, narration mode, and deterministic transparency; it does not expose raw narrator output.                                            |
| S94 assistant human-confirmed action proposals                                                | Independent downstream contract | Its server projector may issue a sealed candidate only from S94's exact eligible S91 source binding. Result-local refs are presentation trace only; narration never supplies action authority. |
| User's dashboard AI notes                                                                     | Intent evidence only            | Require plain-language explanations, current work analysis, clickable structured results, and visible processing; do not authorize hidden reasoning or effects.                                |
| Model availability or a future provider-stream contract                                       | Optional dependency             | Its absence selects deterministic narration. It cannot block structured results or justify artificial streaming.                                                                               |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S92-1** — One `guidance.knowledge` adapter reuses the current scoped retrieval/source-state/
  citation services, makes no draft or process request, and returns the exact closed S88
  group/item/data manifest plus S92 citation registry without calling the public route or starting
  work. An architecture test fails while the adapter is absent or imports a route/client action path.
- **ARCH-S92-2** — One minimized narration builder is the only path from S88 evidence to a model. A
  schema/parity test rejects a raw adapter record, unauthorized count, arbitrary URL, action field,
  Gmail body, credential/config value, or unbounded collection before provider construction.
- **ARCH-S92-3** — One strict output validator requires plain-text evidence-referenced segments,
  preserves the summary's evidence refs, and expands citation ids only from the closed canonical
  `AssistantExternalCitationV1` registry. Provider, action, route, and store spies prove model output
  cannot construct a link or effect.
- **ARCH-S92-4** — One pure deterministic renderer produces a valid narration envelope for every S88
  `answered` coverage/knowledge-state combination. It is always available and requires no model,
  network, wall clock, or store access. Non-answered terminal states produce no narration envelope.
- **ARCH-S92-5** — Model admission consumes S89 and permits exactly zero or one dashboard narration
  call under the fixed source-state/admission matrix. The assistant path has no repair retry; legacy
  `/api/ask` retry behavior remains separately compatible until an explicit migration.
- **ARCH-S92-6** — Narration telemetry is an allow-listed S89 event projection. Static and runtime
  checks reject prompt, answer, excerpt, citation URL/title, customer value, and raw evidence fields.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S92-1** — An authorized knowledge question returns current source state and canonical sources;
  no-support, conflict, open-placeholder, partial, unavailable, and denied cases remain distinct.
- **BEH-S92-2** — An authorized operational query keeps all S88 structured groups and coverage whether
  narration is model-generated, deterministically rendered, invalid, rate-limited, timed out, or
  unavailable, and every `answered` result carries exactly one validated narration envelope.
- **BEH-S92-3** — An excerpt, record label, note, or question containing injected instructions, role
  claims, action requests, or a hostile URL cannot change intent, evidence, source state, citations,
  destinations, permissions, or execution.
- **BEH-S92-4** — Unknown evidence/citation ids, unsupported claims, malformed JSON, extra keys,
  Markdown/HTML/link syntax, or conflicting coverage claims discard the entire model narration and
  show the deterministic fallback without a second call.
- **BEH-S92-5** — The user sees source/coverage limitations and narrator mode but never chain-of-
  thought, system instructions, provider reasoning tokens, or a generic/numeric AI confidence score.
- **BEH-S92-6** — A dashboard knowledge query requests no draft and starts no workflow, task,
  approval, provider action, or correction/capture record. Existing direct Ask behavior remains
  reachable through its preserved route.

**Human litmus outcome.**

### Ask a current knowledge question safely

**If this was built correctly:** A user asks a process question and receives a concise explanation
with the exact current source-state label and source links. A partial or conflicting source remains
clearly limited, and the answer never presents unsupported policy as fact.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Keep working when narration is unavailable

**If this was built correctly:** A user asks for current operational work while the model is disabled
or returns invalid output. The authorized result list, counts, as-of state, and links remain visible,
with a short deterministic summary and no instruction to wait for AI.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Understand coverage without seeing hidden reasoning

**If this was built correctly:** A user can inspect what systems were checked, when they were read,
whether coverage was partial or truncated, and which sources support the response. They see no
“thinking” transcript or unexplained confidence percentage.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                       | Architecture outcome       | Behavior outcome         | Human litmus                                 | Deterministic evidence / falsification                                                                                                                                                                            |
| ------------------------------------------------- | -------------------------- | ------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current Ask becomes a no-effect assistant adapter | `ARCH-S92-1`, `ARCH-S92-5` | `BEH-S92-1`, `BEH-S92-6` | Ask a current knowledge question safely      | Adapter tests assert exact authorized-target Vertex read counts, zero-or-one narrator calls, and zero draft/process/work/approval/provider writes or effects; direct-route fixtures pass.                         |
| Narration receives only minimized evidence        | `ARCH-S92-2`, `ARCH-S92-6` | `BEH-S92-2`, `BEH-S92-3` | Keep working when narration is unavailable   | Forbidden-field, over-bound, wrong-scope, and log-capture fixtures stop before model construction or prove value-free events.                                                                                     |
| Prompt/source injection cannot control behavior   | `ARCH-S92-2`, `ARCH-S92-3` | `BEH-S92-3`, `BEH-S92-4` | Ask a current knowledge question safely      | Malicious question/excerpt/record-label fixtures preserve intent/evidence and produce no untrusted link/action or unauthorized fact.                                                                              |
| Citations remain canonical                        | `ARCH-S92-1`, `ARCH-S92-3` | `BEH-S92-1`, `BEH-S92-4` | Ask a current knowledge question safely      | Manifest/transport tests bind each item ref to one HTTPS registry entry; rewritten/unknown URLs, ids, titles, and freshness discard the complete envelope.                                                        |
| Deterministic fallback is always usable           | `ARCH-S92-4`, `ARCH-S92-5` | `BEH-S92-2`, `BEH-S92-4` | Keep working when narration is unavailable   | Missing model config, budget refusal, narrator timeout, malformed output, and generation exception fixtures retain identical answered S88 groups/coverage; missing retrieval config remains unavailable.          |
| One optional model call, no repair retry          | `ARCH-S92-5`               | `BEH-S92-2`, `BEH-S92-4` | Keep working when narration is unavailable   | Provider-count tests prove zero calls when refused and one call on admitted invalid/success paths.                                                                                                                |
| Coverage replaces CoT/confidence                  | `ARCH-S92-3`, `ARCH-S92-4` | `BEH-S92-5`              | Understand coverage without hidden reasoning | Schema/DOM/serialization scans reject reasoning/confidence fields and assert exact deterministic coverage/source metadata.                                                                                        |
| Narration never becomes an action envelope        | `ARCH-S92-2`, `ARCH-S92-3` | `BEH-S92-3`, `BEH-S92-6` | All three litmus entries                     | Cross-suite tests prove only S94's server projector can seal a candidate from its exact eligible S91 source binding; result-local refs are trace-only and S92 text/evidence/citations are never action authority. |

**Preservation set.**

Keep current Ask authentication/domain/Space scoping; Vertex Search target resolution; deprecated/
high-sensitivity exclusion; grounding threshold; source freshness; `Verified Source`, `Partial
Source`, `Open Placeholder`, `Conflict Found`, and `No Reliable Source Found` behavior; canonical
citation replacement; answer/draft banner separation; Live-read-only draft refusal; model-provider
production fencing; current direct Ask schema/route, corrections, capture, dictation, rate-limit, and
runtime-error tests; S88 read-only query invariant; S89 budget/privacy gates; S86 link/action semantics;
production Live-only truth; and every current Action Registry key remain green as separate gates.

**Adversarial acceptance checks.**

- **AC-S92-1** — `ARCH-S92-1/5` prove one dashboard knowledge query makes one logical retrieval call,
  one current bounded Vertex Search RPC per resolved authorized target, one bounded metadata-reader
  invocation, and exactly zero or one narrator request under the fixed matrix. It supplies no process
  id and writes no Ask log/capture/correction, workflow, Work, approval, provider, or action record.
- **AC-S92-2** — `ARCH-S92-2/6` reject another user's record, hidden-Space count, raw RentVine/Sheet
  response, Gmail body, secret/config value, unbounded items, raw prompt/prose, or customer value in
  narration input, logs, metrics, traces, or thrown errors.
- **AC-S92-3** — `ARCH-S92-3` gives the model unknown and rewritten evidence/citation ids, hostile
  absolute/data/javascript URLs, HTML, Markdown, action JSON, and extra schema keys; none reaches S93,
  every accepted summary/segment retains its own valid evidence refs, and only exact HTTPS canonical
  registry entries survive.
- **AC-S92-4** — `BEH-S92-3` embeds “ignore instructions,” fake Admin authority, fake complete
  coverage, and “approve/send/open this URL” in a question, source excerpt, tenant label, and process
  note; intent, scope, result, route refs, source state, and zero-effect spies remain unchanged.
- **AC-S92-5** — `ARCH-S92-4` snapshots every S88 `answered` coverage combination and every applicable
  knowledge source state twice; output is byte-stable for the same input, retains statement evidence
  bindings and the canonical citation registry, and the renderer imports no model, network, clock,
  route, action, or store module. Every non-answered terminal fixture has no narration envelope.
  Producer, coordinator, renderer, zero-result, and snapshot fixtures preserve
  `guidance.knowledge.sources` with exact label `Knowledge sources`; question text, source title,
  source state, and zero-result status cannot alter it.
- **AC-S92-6** — `BEH-S92-2/4` prove rate/cost refusal, narrator timeout/exception, empty text,
  malformed JSON, and conflicting claims end in deterministic narration while preserving the exact
  answered evidence and terminal state. Missing required retrieval setup or a failed required read
  remains S88 `unavailable` with no narration envelope; a transport response loss remains S93's
  interrupted-stream behavior rather than being relabelled as narrator fallback.
- **AC-S92-7** — `BEH-S92-5` rejects `reasoning`, `thinking`, `chain_of_thought`, `scratchpad`,
  `confidence`, log-probability, system-prompt, and retrieval-score fields in schemas, serialized
  events, and rendered fixtures; deterministic coverage/source-state metadata remains.
- **AC-S92-8** — Compatibility tests prove `/api/ask` retains current authenticated response,
  citation, direct-route retry, correction/capture, and Live-read-only behavior until a separately
  approved migration; the new adapter does not self-fetch that route.

**Forbidden actions / hard gates.**

- No model tool execution, model-selected intent/record/role/Space/action key, model-built URL, or
  parsing narration into an action proposal.
- No task, workflow run, approval, access request, claim, source, connection, renewal, Sheet,
  provider, draft, Gmail label/reply/message, notification, or client-facing write.
- No autonomous, scheduled, background, bulk, or model-triggered reminder or communication.
- No raw Gmail body, source document, provider dump, secret, token, credential, hidden record/count,
  customer message, prompt, answer, excerpt, or raw evidence in routine telemetry or Git.
- No synthetic/Demo identity or data in a Production answer or record, and no silent Live-to-synthetic
  fallback.
- No change to an Action Registry key, `production_allowed`, auth/Space policy, runtime suspension,
  quota, provider credential, or direct-send boundary.
- No raw token stream, artificial progress, hidden reasoning, or generic/numeric AI confidence.

**Dependencies / sequencing.**

S88 supplies the read-only query registry, actor-scoped envelope, evidence ids, coverage, route refs,
and terminal states before S92 integrates. S90 `Assistant work, approval, and access read adapters`
and S91 `Canonical lease-renewal assistant query adapter` supply the verified, actor-scoped
operational envelopes that S92 may narrate without changing their facts, coverage, or route refs. S89
supplies the production privacy/cost admission and is a rollout gate before enabling model narration.
Existing Ask retrieval/source-state/citation behavior is the knowledge foundation. S93 consumes the
validated S92 envelope and owns transport/rendering; S92 does not require S93 for service and contract
tests. S94's projector consumes only its registered S91 source binding and, when eligible, issues its
own sealed actor-bound candidate; any result-local item/evidence/citation refs remain presentation
trace and never authorize Review or Confirm. S95 composes the Dashboard only after these bounded
contracts exist. S85/S86/S87 presentation contracts remain downstream or preservation dependencies
and do not grant model authority.

Implement the pure schema/validator/fallback and knowledge adapter with injected S88/model seams first;
then integrate S89 admission; then let S93 expose only validated envelopes. Do not route dashboard
traffic to model narration before the S89 rollout gate is green. Dependency absence uses these exact
states: without implemented S88 registry/coordinator, S92 is not registered or exposed and the
preserved direct `/api/ask` route remains the only knowledge path; this is not a runtime
`not_applicable` result. Once S88 exists, missing/failed required knowledge retrieval is
`unavailable`. An unregistered S90/S91 operational intent remains S88 `unsupported` and does not run
the knowledge adapter. Missing/refused S89 model admission selects S92 deterministic narration for an
already-`answered` result, while non-answered states emit no narration. No missing dependency is
misreported as an empty or `not_applicable` knowledge read.

**Standalone delivery contract.**

- **Deliverable now:** registered no-effect knowledge adapter; minimized input builder; hardened
  instruction/schema; complete-output validator; canonical citation expansion; pure deterministic
  fallback; one-call admission seam; minimal event projection; compatibility/refusal/injection tests;
  and documentation capable of `ALL_GATES_GREEN` with injected retrieval and model providers.
- **Consumes, but does not assume:** S88 envelope/adapter registry, S89 admission/event interfaces,
  and the S90/S91 operational adapter envelopes when those domains are queried. Required-predecessor
  absence follows the exact disabled/unavailable/unsupported/fallback matrix above and never creates
  a parallel router, operational adapter, transcript, budget, or telemetry store.
- **Externally blocked effect:** none. Model generation is optional, every answered-result narration
  envelope has a deterministic path, and no effect is authorized. A
  production rollout remains disabled until S89's own rollout gate is green, but all S92 behavior and
  refusal checks can complete without a new credential or provider contract.
- **Produces for downstream suites:** stable `guidance.knowledge` adapter behavior,
  `AssistantNarrationFactsV1`, validated `AssistantNarrationModelOutputV1`, server-built
  `AssistantNarrationEnvelopeV1`, `AssistantExternalCitationV1`, canonical citation-ref expansion,
  deterministic narration, narrator-mode/validation telemetry categories, and explicit no-action/no-
  CoT boundaries for S93/S94/S95.

**Verification and delivery contract.**

1. Before implementation edits, record current Ask route/service behavior, the absent S88 knowledge
   registration and narration envelope, the S89 call-count gate, direct-route model call count, and
   zero-write/provider baselines; make the named architecture/behavior tests fail only for those gaps.
2. Run focused Ask adapter, source-state, citation, prompt-injection, minimization, output-validation,
   deterministic-fallback, call-count, compatibility, authorization, and telemetry-redaction tests.
   Keep direct Ask preservation results separate from new S92 outcomes.
3. Run `bash scripts/verify.sh`, inspect the mechanical diff, and audit secrets, PII, exact action
   gates, runtime configuration, dependency direction, generated client bundles, and scope
   traceability before any authorized delivery.
4. Report `ALL_GATES_GREEN` only when every S92 requirement and preservation gate passes.
   `BLOCKED` applies only to the separately named S89 production rollout gate after all independently
   implementable fail-closed S92 work is complete; model absence itself is a passing deterministic
   path.
5. Report one implementation terminal state: `ALL_GATES_GREEN`; `BUDGET_EXHAUSTED` only if a future
   user supplies an explicit budget; or `BLOCKED` only for one exact unavailable input/authority after
   every independent fail-closed path is complete. Model/fallback mode and rollout evidence are not
   alternate terminal names.

**Ordered prompt sequence.**

1. Re-verify current Ask, retrieval, source-state, citation, prompt, model, route, logging, S88, and S89
   truth without accepting active-suite behavior as deployed.
2. Add failing knowledge-adapter, minimization, injection, strict-output, citation, deterministic-
   fallback, call-count, zero-effect, and direct-route compatibility checks.
3. Build the pure contracts and adapter, then connect the optional one-call narrator through S89; keep
   S93/S94 imports out of the knowledge and validation layers.
4. Falsify hostile inputs, provider failures, cross-Space access, response loss, and forbidden fields;
   run focused and canonical gates, update current docs, and ship only when authorized.

**Deletion/merge recommendation.**

Remove S92 from the active tree only after its knowledge adapter, injection/minimization boundary,
validated narration, canonical citations, deterministic fallback, privacy/cost integration, and
preservation checks are represented by committed code/tests and present facts. Merge enduring
narration/citation safety into the product and engineering contracts; do not merge model prose into
S88 authority or S94 execution.
