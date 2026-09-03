<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: dashboard-assistant-v1 -->

# S93 — Dashboard assistant streaming and linked result experience

> Status: Specified on 2026-08-31; the current Dashboard still uses a process-picker-based,
> one-request/one-buffered-JSON `AskForm`, while S88–S92 and S94 define the future query, control,
> domain-adapter, narration, and action contracts this suite renders but does not replace.

**Goal.**

Let any managed staff user ask one plain-language question from the Dashboard and see an honest,
progressive, session-local exchange directly below the composer: authorized structured results, one
validated plain-language narration envelope for each answered result, and deterministic new-tab
links to the exact app records or pages that support the answer.

**Current state / intended end state.**

Both `/` and `/ask` render `components/console/ConsoleView.tsx`, which embeds
`components/ask/AskForm.tsx`. The current form labels a textarea `Question`, optionally renders a
`Process` picker, suggests a process through `detectProcess`, offers an explicit model classifier,
posts to `/api/ask`, waits for one buffered `AskResponseSchema` JSON object, and renders the result in
a side-by-side `aside`. Selecting a process also starts an ordinary workflow run. During answer
submission it uses a generic `Working` label; separate dictation/classification states also use
`Detecting…`, `Stopping…`, and `Processing…`. The result has prose, handling steps, citations, and a few feature-specific
controls, but it has no operational result groups, stream protocol, exchange stack, cancellation,
or deterministic app-record link contract.

The existing model seam in `lib/llm/model-provider.ts` exposes only buffered `generateText`. The
isolated `/api/ask/app-state` endpoint returns only `approvals`, `connections`, or `coverage`, and no
current Ask client or service consumes it. Current citation anchors open a new tab; current internal
result links do not share one validated link renderer.

The intended experience replaces that interaction with one `AI` composer and one vertically ordered
exchange stack. `POST /api/assistant/query/stream` accepts S88's strict
`AssistantQueryRequestV1`, streams protocol-versioned structured events as real query milestones
occur, and terminates with one authoritative S88 result or one bounded public error. The browser
renders complete result groups as they arrive, then reconciles them to the terminal result. It
renders exactly one fully validated S92 narration envelope for an `answered` result—model mode or
deterministic fallback—and none for other terminal states; it never exposes raw unvalidated model
tokens. S94's server-authored action projection appears only in the canonical terminal result.
Selecting an executable candidate opens a non-persistent Review; only a later exact Confirm may
create one My Work task. The UI contains no process picker, model-classification button,
chain-of-thought, generic confidence score, fabricated percentage, or model-authored link.

**Actors and entry conditions.**

- An actor is an authenticated, enabled, managed internal Editor, Approver, or Admin who passes the
  existing `read` page/API guard. Vendor and anonymous sessions cannot enter this boundary.
- S88 resolves role and Space scope from the verified server session. The assistant query request
  supplies no actor, role, scope, intent, filter, timezone, route, action, source, or model field;
  the preserved correction request's guarded `space_id` is the separate explicit exception defined
  below and never influences query authority.
- The V1 request is exactly `{ schema_version: "assistant-query-v1", question }`; `question` is
  trimmed, contains 3 through 2,000 Unicode code points, and the complete JSON body is at most 16
  KiB. Unknown fields fail before query work or response streaming begins.
- S89's request budget, concurrency, timeout, cancellation, privacy, and telemetry checks run before
  or around the stream. A budget or authentication refusal does not open a partial stream.
- S90 work/approval/access and S91 renewal adapters filter and minimize their domain evidence through
  S88 before it can enter S92 narration or S93 events. A link is renderable only when S88 supplied a
  server-authored, actor-authorized route reference.
- The composer remains usable without an S92 model call: the deterministic S88 result and S92
  fallback envelope are the minimum answered response. S92 failure cannot erase an authoritative
  result.
- The green S94 projector is result-optional: it may return `not_applicable` or typed `unavailable`
  without making the authoritative read result unavailable. Only rollback fixtures omit S94 itself.
  A terminal candidate/handoff never creates a task, proposal record, grant, or approval.

**What it is / how it functions.**

### Composer and exchange stack

The Dashboard assistant is one labelled task region headed `AI`. Its textarea has visible task
context from that heading and an accessible name `Message AI`; removing the visible `Question` label
does not remove the programmatic label. The exact screen-reader-only accessible description is `Ask
about work, approvals, renewals, access, or PMI KC processes.` It is referenced by the textarea and
does not render as visible Dashboard subtext. Retain the current Dictate capability and its microphone,
permission, transcript-review, typed-input-preservation, and focus-return behavior. The only visually
primary control in the region is `Send` while idle and `Sending…` while dispatch is being accepted.
`Enter` submits when the user is not composing with an input method editor; `Shift+Enter` inserts a
newline. The visible Send control remains the non-shortcut path.

Directly below the composer, render one secondary S86 disclosure labelled `What can I ask?`. It is
collapsed by default, remains keyboard/touch accessible without hover, and is part of the existing
`AI` region rather than a third Dashboard region or an idle result panel. When expanded it renders
only S88's validated `AssistantCapabilityManifestV1`: the eight supported V1 question families in
registry order, their exact example-question controls, the one-action boundary, and the visible
sentence `Each question is answered independently. Earlier turns are not sent as context.` Activating
an example copies that exact question into the composer and returns focus there; it never submits,
loads a source, starts a model, or creates work. The UI contains no separate example list, model-
generated suggestion, unsupported-domain teaser, source-health claim, or implication that every actor
can read every family.

Submitting snapshots the trimmed question into a new exchange, clears the composer only after the
request is accepted, and places that user turn immediately below the input. One tab may have at most
one in-flight exchange. While it is pending, the user can `Stop`; a second dispatch is not allowed.
The stack renders oldest to newest and scrolls the newly accepted exchange into view without moving
keyboard focus from the composer. S89 owns the bounded retained-exchange count. When that bound is
reached, remove the oldest completed exchange that does not own the single open/pending correction
flow from the DOM and announce that older results are no longer shown; never discard the in-flight
exchange or that one pinned correction exchange. The pin does not increase S89's 20-completed bound.

The stack exists only in client memory for the mounted Dashboard page. It is cleared by reload,
leaving `/` or `/ask`, sign-out, session invalidation, or closing the tab. It is not written to
Firestore, URL state, cookies, `localStorage`, `sessionStorage`, service-worker storage, analytics
bodies, or a model conversation. Only explicit `File correction` may persist that one exchange's
bounded question/citation snapshot under the separate contract below. Every query is independently
routed; prior visible turns are not silently added to a later request.

After the first exchange exists, show an exact `Clear conversation` button. It is disabled while one
exchange is in flight with accessible description `Stop the current response before clearing.` Once
no exchange or correction is pending/open, activation removes all completed/stopped/interrupted turns
from React memory, returns focus to `Message AI`, and creates no request, delete, log, or product
mutation. While a correction form is expanded, filing, failed but retryable, or awaiting payload-stable status recovery,
Clear is disabled with exact accessible description `Cancel or finish the open correction before
clearing.` S89's exact 20-completed-plus-one-in-flight bound evicts the oldest unpinned completed
exchange at the boundary and uses the same polite announcement.

S94 Review/Confirm state lives in one bounded action-status tray inside the `AI` region but outside
the exchange stack, so Clear and the 20-turn eviction cannot silently discard a dispatched action.
Only one Review/Confirm may be active in a tab. A `ready` Review may be cancelled and discarded with
no write. While Confirm is pending, Clear and another Review are disabled with exact description
`Wait for the current task confirmation before clearing.` An `applied`, `existing_task`,
`superseded`, `refused`, or `unavailable` state may be dismissed after its message is read. A
`reconciliation_required` tray remains until the user deliberately opens My Work or confirms
`Dismiss this task recovery? Check My Work before trying again.` Reload/unmount still clears the tray;
S94's deterministic source-version identity and owning My Work route are the recovery, not transcript
persistence.

A Confirm transport close, timeout, non-parseable response, or any returned response that fails the
strict Confirm union/receipt/HTTP/key-label-route validation after dispatch creates client-local
`confirmation_unknown`, not `unavailable` or success. This includes an unknown field, illegal
status/reason/message pairing, wrong endpoint variant, malformed receipt, or invalid route because
the task may already have committed before the unusable response. The tray retains only the same in-memory
`confirmation_ref`, `preview_hash`, Review `expires_at`, and the originating S88-normalized bounded
question, shows `Task result was not received.`, and offers `Check task result`. The question copy is
subject to S89's session-only privacy rules and remains in the tray even if the 20-exchange bound
evicts its original turn. That deliberate control resubmits the byte-identical Confirm body to S94;
it never creates a fresh token, changes fields, or retries automatically. While this state or its
check is pending, Clear and another Review remain disabled with description `Check the current task
result before clearing.` A strict S94 response replaces the local state normally. At expiry, discard
the token/hash, show `This task review expired. Run the question again before trying to create a
task.`, and offer `Run question again`; that deliberate action submits the retained normalized
question as one new S88 request with a new query id, then discards the tray copy. Dismissal/Clear is
also permitted after expiry. No link is manufactured for an unknown response; only a later typed S94
response may supply an action route. Reload/unmount may lose this session-only recovery but never
claims cancellation; the next exact query/projector lookup converges on an existing retained task
when one was created.

The empty assistant has no `Results appear here` panel. A result region exists only after a
submission. The compact capability disclosure is composer guidance, not a result or third task region;
that keeps the idle Dashboard to the AI composer/help and S95's My Work handoff.

### Canonical stream request and response

Add `POST /api/assistant/query/stream` as the only V1 Dashboard stream transport. Preserve the
existing buffered `/api/ask`, `AskRequestSchema`, and `AskResponseSchema` during migration for
existing callers and tests; S93 does not change their response media type or implicitly redirect
them.

The new endpoint:

- authenticates, enforces media/body bounds, and parses the complete strict S88 request before
  creating a query context or committing response headers;
- calls S88 `createAssistantQueryContextV1()` exactly once after that validation, passes that same
  single-use context through S89's per-user-rate and four-query concurrency admission, and neither
  copies nor replaces its `query_id`; a rate/concurrency refusal uses the id only in S89's one
  bodyless closed telemetry event, constructs no adapter/model/source, returns the bounded ordinary
  429/503 response, and commits no NDJSON headers;
- only after admission commits the NDJSON response and invokes S88
  `runAssistantQuery(actor, request, context, { signal, observer })` exactly once with that admitted
  context and an abort signal
  connected to client disconnect, explicit Stop, S89 timeout, and server shutdown; the observer maps
  S88's transport-neutral validated milestones and cannot alter query inputs or results;
- returns `application/x-ndjson; charset=utf-8`, `Cache-Control: no-store`, and no compression or
  intermediary buffering that would withhold accepted/progress records until completion;
- encodes one complete JSON object followed by `\n` per event; an event never spans lines and no
  non-event bytes, Markdown fences, comments, or keep-alive prose enter the body; and
- when the transport remains writable, closes immediately after exactly one `terminal` or `error`
  event. Client Stop or disconnect is a local stopped/interrupted terminal state and may end in EOF
  because the server has no writable consumer; that expected abort is not protocol corruption.

`runAssistantQuery` returns the server-only S88 `AssistantQueryExecutionV1`; S93 must not serialize
that carrier or hand it wholesale to another layer. Finalization validates and uses its members in
this exact order: provide public `result` plus only `private_projector_inputs.knowledge_citation_registry`
to S92's registered narration builder; provide public `result` plus only
`private_projector_inputs.renewal_action_bindings` to S94's registered action projector; then discard all
references to the private projector inputs before encoding the terminal event. An absent registered member
is handled only by its owner's typed fallback/unavailable rule. S92's model minimizer sees public
facts and query-local citation refs, never the registry hrefs; S92 expands validated refs into
`narration.external_citations` only after narration validation. S94 exposes a private binding only
through its actor-bound sealed action token. Observer milestones, NDJSON events, client state,
correction payloads, model input/output, telemetry, logs, and durable stores receive neither private
member. The final event sequence contains only the validated public result, narration, and action-
projection contracts: narration is carried only by `narration_ready`; `terminal` contains exactly
`result`, `action_projection`, and `emitted_group_ids` and does not duplicate narration.

Finalization is write-atomic at the protocol boundary. Build and validate the narration envelope,
action projection, emitted-group-id list, and complete terminal event in memory; serialize both the
complete `narration_ready` and `terminal` lines, including their common fields and newline bytes, and
prove each 1-MiB line bound plus the pair's 2-MiB reserved-total bound before writing either final
event. Only then write the single `narration_ready` line followed immediately by `terminal` for an
answered result. A known S92/S94/schema/size/deadline failure before those writes emits one `error`
with zero narration events. A transport failure between the two final writes is an interrupted stream
handled by the client's existing incomplete-response rule; the server never emits a contradictory
error after narration.

Every event contains exactly these common fields plus its discriminated payload:

| Field         | Contract                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| `protocol`    | Exact literal `assistant-stream-v1`.                                                                         |
| `query_id`    | Opaque server-issued id from S88; it is never accepted from the client and contains no user or record value. |
| `sequence`    | Zero-based contiguous integer. `accepted` is `0`; every later event increments by exactly one.               |
| `type`        | One of `accepted`, `progress`, `group_ready`, `narration_ready`, `terminal`, or `error`.                     |
| `occurred_at` | Server ISO timestamp for the actual event milestone; it is not used to estimate a percentage.                |

The payload union is exact:

| Event type        | Required payload and rule                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accepted`        | `{ request_schema: "assistant-query-v1" }`. It maps S88's first `query_started` milestone, is the first body record, and proves the request passed auth, validation, and pre-stream budget checks.                                                                                                                                                                                                                                                      |
| `progress`        | `{ stage, message }`, where `stage` is `routing`, `reading`, `narrating`, or `finalizing`; `message` is the corresponding server-owned public label `Understanding your request`, `Checking authorized app sources`, `Preparing a plain-language summary`, or `Preparing linked results`. Emit only when that real stage begins.                                                                                                                        |
| `group_ready`     | `{ group, route_refs }`, where `group` is one complete S88 group and `route_refs` is the de-duplicated validated subset referenced, in first-reference order, by the group's ordered `route_ref_ids`, then its canonical item order, then its notices. This includes group-level owning-surface refs even when `items` is empty. A later event may replace only the same group id with a complete newer snapshot; unknown/unused/cross-group refs fail. |
| `narration_ready` | `{ narration }`, where `narration` is one complete S92 `AssistantNarrationEnvelopeV1`. Its `external_citations` member is the complete bounded `AssistantExternalCitationV1[]` registry; no sibling citation field exists. V1 emits exactly one for `answered`—model mode or deterministic fallback—and zero for non-answered states.                                                                                                                   |
| `terminal`        | `{ result, action_projection, emitted_group_ids }`. `result` is the complete canonical S88 `AssistantQueryResultV1`; `action_projection` is exactly one S94 `AssistantActionProjectionV1` object and contains all candidates/handoffs only at terminal. `emitted_group_ids` is stable/ordered/duplicate-free and names server-emitted group milestones, never what the browser rendered.                                                                |
| `error`           | `{ code, message, retryable, recovery }`, where `code` is `timeout`, `cancelled`, `stream_interrupted`, or `unexpected`. It contains no stack/provider/raw evidence. This is terminal only for a failure after `accepted`; domain unavailable/denied/unsupported outcomes use `terminal`.                                                                                                                                                               |

The `error` payload has no optional or extra fields and uses only these exact pairings:

| `code`               | Exact `message`                                   | `retryable` | `recovery` |
| -------------------- | ------------------------------------------------- | ----------- | ---------- |
| `timeout`            | `This request took too long. Try again.`          | `true`      | `retry`    |
| `cancelled`          | `This request stopped before it finished.`        | `true`      | `retry`    |
| `stream_interrupted` | `The response was interrupted. Try again.`        | `true`      | `retry`    |
| `unexpected`         | `Results are temporarily unavailable. Try again.` | `true`      | `retry`    |

`recovery` is the enum literal `retry`, not a URL, route ref, callback, or arbitrary label. The
client renders one manual `Retry` control from that literal. A wrong message/boolean/recovery pairing,
unknown field, control/bidi character, source/provider detail, or customer value makes the event a
protocol failure rather than displayable error content. Explicit user Stop or transport disconnect
still follows the EOF behavior below and does not require the unwritable server to emit `cancelled`.

The legal event order is `accepted`, zero or more `progress`/`group_ready` events, then exactly one
`narration_ready` before `terminal` when the result is `answered`, then exactly one `terminal`; a
non-answered terminal or any `error` has zero narration events. A group/narration event may not
precede `accepted`; duplicate/missing/wrong-terminal narration, an unknown type/version, a sequence
gap, an event after termination, or EOF without a terminal/error while the client did not Stop or
disconnect is a protocol failure. The client keeps already rendered data visibly marked `Incomplete
response`, stops accepting events, and offers one manual `Retry` using the preserved question and a
new server-issued id. Stop/disconnect instead keeps the local `Stopped`/interrupted state and expects
EOF without requiring an unwritable server event.

When S94 finds no applicable action, the terminal still carries this exact object:

```text
{
  schema_version: "assistant-action-projection-v1",
  state: "not_applicable",
  entries: [],
  notices: []
}
```

`action_projection` is never a string literal, `null`, omitted, or an unversioned default. The same
strict object shape applies to every state and is validated before the terminal event is written.

Each progress stage appears at most once and, when entered, follows `routing`, `reading`, optional
model-work stage `narrating`, then `finalizing`. S88 supplies only real routing/reading milestones;
S89/S92 supply `narrating` only when the model call begins, while deterministic fallback still emits
the required narration envelope without a fake model stage. S93 emits finalizing only when terminal
reconciliation begins. A skipped stage emits nothing.

The encoder and incremental decoder enforce S89's exact 96-event, 1-MiB-per-line, and 4-MiB-total
bounds before allocation/append. A line/count/total/unterminated-buffer overflow, invalid UTF-8, or
oversize terminal is a protocol failure: retain already shown content as `Incomplete response`, stop
reading, offer manual Retry, and start no second query/model automatically.

Authentication, strict-schema, body-size, and pre-stream S89 budget failures use ordinary bounded
JSON error responses with their truthful 4xx/429/503 status and no NDJSON body. Once `accepted` has
been emitted, the HTTP status remains 200; a post-header problem uses the public `error` event. An
S88 `unavailable` result is not rewritten into an HTTP or stream error.

Streaming is evidence-driven, not theatrical. Tests must prove `accepted` reaches the client before
the delayed query completes and that `group_ready` is emitted when a real adapter group is ready.
Do not split a completed buffer on a timer, cycle canned messages, or advance a fake percentage. The
current buffered model provider means V1 narration arrives once as `narration_ready`. A future
`narration_delta` event is forbidden until S92 owns a real provider stream plus sentence/chunk-level
grounding, citation, redaction, schema, abort, and fallback validation; it is not part of
`assistant-stream-v1` or V1 completion.

### Terminal-state presentation

Incremental groups appear as an active list directly below their user turn. On `terminal`, replace
the accumulated groups with the canonical `result.groups` ordering and content before announcing
completion. This prevents an interrupted, duplicated, or superseded intermediate group from
becoming final truth. Render each terminal state distinctly:

| S88 terminal state       | Visible behavior                                                                                                                                                                                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `answered`               | Show the source/completeness statement, structured groups, required validated narration envelope, and terminal S94 action projection. An authoritative empty set reads `No matching items.`                                                                                                          |
| `clarification_required` | Heading `More detail is needed`, the one S88-owned clarification prompt, and no invented result. The user answers through a new independent query; V1 has no hidden conversational memory. S88's top-level clarification notice supplies the only typed Internal Processes recovery link when legal. |
| `unsupported`            | Heading `That question isn't supported yet` and exact body `Try one of the supported examples.` Show `What can I ask?` using the same S88 manifest; never describe the failure as a missing process or fabricate a broader suggestion.                                                               |
| `denied`                 | Heading `Access needed`, a non-enumerating explanation, and only an S88/S83 server-authored access handoff when permitted. Do not reveal hidden record counts, names, routes, or source existence.                                                                                                   |
| `unavailable`            | Heading `Results unavailable`, the affected public source label/completeness truth and one safe retry or owning-surface recovery from S88. Never render an unavailable read as zero.                                                                                                                 |

`clarification_required` and `unsupported` retain the submitted wording in the user turn and add one
secondary `Edit question` control. When the composer is empty and no request is in flight, activation
copies that exact bounded wording back into the composer and focuses it without submitting. When the
composer already contains text, the control is disabled with accessible description `Clear the current
draft before editing this question.` The result also exposes `What can I ask?` by expanding/focusing
the single disclosure above; it does not create a second example list. Retry, Edit, and example
selection always start only through a later explicit Send and receive a new server query id.

Immediately after the source/completeness statement and before result groups, render one labelled
`Status` list from `result.notices` in its exact validated order. That array is the sole visible
notice projection: do not also render `group.notices`. Before display, recompute and compare S88's
stable first-occurrence sequence—coordinator notices first, then each canonical group's notices in
group order—and fail the terminal closed if a notice is missing, duplicated, reordered, or altered.
Each row renders only its exact message and text-labelled kind. A non-null
`recovery_route_ref_id` resolves through the S88 typed route branch and renders that route's exact
label as the row's new-tab recovery action; null renders no action. Thus mixed allowed/denied answers
cannot lose `assistant.access_partial*`, router-level clarification/unsupported notices remain
visible, and a domain notice is never shown twice.

The validated narration renders its evidence-bound `summary` once, then its zero-to-five supplemental `segments`, then
server-built `limitations`; the first statement is never repeated as both summary and segment. Do not
render model HTML, raw Markdown, model URLs, scripts, event handlers, data attributes, or controls.
Result groups remain the authority when narration wording and deterministic fields
disagree; a mismatch is an S92 refusal/fallback, not a client-side winner selection.

Replace the requested “thinking process” with one closed `How this was checked` S86 Disclosure. It
may show only S88/S92 public facts already in the terminal envelope: matched intent label, source
labels checked, as-of timestamps, returned/total/truncated state, complete/partial/unavailable
status, deterministic-fallback-versus-model-backed narration label, and canonical citations. It never shows
hidden reasoning, prompts, tokens, scores, aliases, raw evidence, provider payloads, stack traces, or
security filters. Do not display a generic confidence percentage. A current RAG grounding score or
process-term count is not a calibrated portfolio-completeness score.

### Typed linked results

S93 owns one typed link renderer with three closed branches: S88 `AssistantRouteRefV1` for same-origin
query-result destinations; S92 `AssistantExternalCitationV1` records read only from
`narration.external_citations` for already validated external knowledge evidence; and S94
`AssistantActionRouteRefV1` records read only from the current strict terminal action projection,
Review/Confirm response, or its `AssistantTaskReceiptV1`. The branches do not convert into one
another. An S94 owning-payload-local ref is validated against S94's closed destination keys and
S88-equivalent same-origin builder rules, remains valid only in that terminal projection or response's
action tray, and is never looked up in or copied from the query-result registry. The renderer never turns narration text, a model URL, a raw item field, or client-supplied
`href` into a link. An unresolved, malformed, stale, or no-longer-authorized reference renders the
record as text plus its truthful recovery and records no navigation attempt.

Every valid result destination is a full-row or clearly labelled item action that opens in a new
browser tab with `target="_blank"` and `rel="noopener noreferrer"`. Its accessible description says
`opens in a new tab`; a visible local new-tab glyph from S86 supplements but does not replace that
text. Internal destinations use the canonical app URL and query state supplied by the owning S88
route manifest—especially S82 renewal `deskView`/workspace links. Trusted external evidence uses only
S92's already validated canonical source destination. S93 never guesses a provider URL, lease id,
record id, anchor, filter, or return path.

The renderer resolves each group's ordered `route_ref_ids` before item routes and presents those
destinations as clearly labelled group-level actions adjacent to that group's label/state, outside
any item row. A `complete` group with zero items still renders `No matching items.` and any valid
owning-surface group action; absence of an item never suppresses that link. A missing, duplicate,
unused, cross-group, stale, or unauthorized group ref follows the same fail-closed text/recovery rule
as an item ref and never falls back to an item URL or guessed owning page.

### Knowledge correction preservation

Only after an `answered` terminal whose exact S88 intent is `guidance.knowledge`, render one collapsed
secondary result control labelled `Suggest a correction`. It is part of that completed exchange, not
an idle/default Dashboard panel, and it is absent for operational, clarification, unsupported,
denied, unavailable, interrupted, or stopped results. Activating it expands an inline S86 form with
the current `What was wrong` choices (`Wrong fact`, `Wrong source`, `Missing detail`, `Wrong
process`), a required `Correction` note, one currently authorized writable Space selector required
by the preserved endpoint, exact subtext `Filing a correction changes nothing on its own. An Admin
reviews it.`, and `File correction` and `Cancel`. A uniquely resolved writable knowledge Space may
be preselected; wildcard/multi-Space results require a deliberate selection and never reuse the
current first-Space fallback. The visible choices map exactly to current schema values: `Wrong fact`
→ `wrong_fact`, `Wrong source` → `wrong_source`, `Missing detail` → `missing_detail`, and `Wrong
process` → `wrong_process`.

The guarded Dashboard page supplies the selector options by filtering the existing static
`launchSpaces` registry to directory-visible, writable Spaces allowed by the already verified actor's
exact Space claim using the same `assertSpaceIdAccess` semantics. This performs no process-definition,
Firestore, connector, or provider read and supplies only `{ value: space.id, label: space.name }`.
The correction route reauthorizes the submitted id. Zero authorized writable options omits the filing
form and renders `Correction filing is not available for your current access`; it never falls back to
`lease-renewals`, the first global Space, or a client-selected hidden id.

`File correction` explicitly posts to the existing `POST /api/ask/correct` route under its current
`edit` capability and Space-access guard. The client supplies only the human-selected `space_id`,
correction `kind`, and trimmed `note`; it copies `question` from that
exchange's exact validated submitted question and deterministically maps only that exchange's
validated `narration.external_citations` to the current citation snapshot shape:

```text
source_id: AssistantExternalCitationV1.citation_ref (query-local context only, never stable authority)
title: AssistantExternalCitationV1.label
url: AssistantExternalCitationV1.href
last_reviewed_at: omit when null; otherwise exact validated timestamp
freshness: { status: AssistantExternalCitationV1.freshness }
```

The request omits `ask_log_id`, `source_state`, excerpts, narration text, model output, operational
items, action projection, routes, hidden ids, and all prior exchanges. The persisted citations remain
the current non-authoritative reviewer context; the query-local `source_id` compatibility value may
never resolve or authorize a source. Submission uses S86 indeterminate feedback and current button
copy `Filing`; success renders exact current copy `Correction filed for review. The answer is
unchanged.` The existing endpoint alone appends one `Proposed` correction and performs its readback;
it does not rerun or mutate the answer, citation source, KB, source metadata, model, task, workflow,
approval, or provider.

Make that app-record append idempotent for the same actor and normalized correction identity. After
normalization, define `correction_identity` with exactly these keys in order: `space_id`, `question`,
`kind`, and `note`. Hash the UTF-8 bytes of ECMAScript `JSON.stringify` for that object with SHA-256 to
lowercase hexadecimal as `correction_identity_hash`. The compatibility-only `ask_log_id`,
`source_state`, citations, and each query-local citation `source_id` are persisted on first filing but
are deliberately excluded from identity; a new query-local ref or refreshed citation snapshot cannot
defeat response-loss/reload deduplication or rewrite the first reviewer context. The new correction's direct-read document id is
literal prefix `corrv1_` plus lowercase SHA-256 hexadecimal over UTF-8
`ask-correction:v1\0<authenticated uid>\0<correction_identity_hash>`; the raw uid and correction text
never appear in that id. This stable identity means the same normalized correction after response
loss, reload, navigation, tab close, process restart, or a fresh knowledge query resolves the original
record instead of appending a duplicate; no browser/server-session recovery key or transcript
persistence is required. The same identity remains one correction even after Admin decision; changing
the Space, question, kind, or note is a distinct deliberate correction. Legacy UUID-v7 correction ids remain
readable and decidable unchanged.

In one Firestore transaction, the server reads that exact correction document before writing:

1. an absent document creates exactly one Proposed correction with its authenticated uid,
   `correction_identity_hash`, and current correction fields;
2. an existing document with the same authenticated uid and correction identity hash reads back
   that correction and returns it as an idempotent replay, whether Proposed or later decided; and
3. an existing document with any mismatched actor/identity hash returns a bounded conflict and writes
   nothing.

The correction record is its own idempotency receipt, so there is no secondary index, linked-record
failure, query, array growth, client read, or cleanup race in replay. The public response never
returns `user_uid`, `decided_by_uid`, question, note, Space, citations, or another reviewer field.
Its strict filer-safe receipt is:

```text
AssistantCorrectionReceiptV1 {
  schema_version: "assistant-correction-receipt-v1"
  correction_ref: exact opaque corrv1_ plus 64 lowercase hexadecimal characters
  state: "Proposed" | "Approved" | "Dismissed"
  created_at: ISO offset date-time
  updated_at: ISO offset date-time
}
```

The exact `AssistantCorrectionSubmitResponseV1` domain response union has no other keys:

```text
filed/replayed:
  schema_version: "assistant-correction-submit-response-v1"
  status: "filed" | "replayed"
  message: exact paired message below
  receipt: AssistantCorrectionReceiptV1

conflict/unavailable:
  schema_version: "assistant-correction-submit-response-v1"
  status: "idempotency_conflict" | "unavailable"
  message: exact paired message below
  commit_state: "not_committed" | "unknown"
```

`filed` pairs only with HTTP 201 and `Correction filed for review. The answer is unchanged.` and a
`Proposed` receipt; `replayed` pairs only with HTTP 200 and
`This correction was already filed. The answer is unchanged.` plus any receipt state;
`idempotency_conflict` pairs only with HTTP 409, `commit_state:unknown`, and `This correction could
not be matched safely. Report the issue before trying again.` `unavailable` with a proven absent
commit pairs only with HTTP 503, `commit_state:not_committed`, and `Corrections are temporarily
unavailable. Try again.` `unavailable` with an unproved commit/readback pairs only with HTTP 503,
`commit_state:unknown`, and `Correction status could not be verified. Check filing status before
trying again.` Success variants have no `commit_state`; failure variants have no `receipt`.

Unknown fields and status/message/commit-state/HTTP mismatches fail schema validation. On the server
they never authorize a different outcome. On either migrated client, any such invalid response
received after File dispatch enters `correction_unknown` under the recovery contract below because
the append may already have committed; it is never treated as a definite no-commit failure. The
retained buffered `AskForm` caller uses the same normalization, response union, and ambiguous-outcome
recovery in the same S93 slice, so its visible correction behavior remains compatible without
preserving the unsafe no-idempotency shape.

Harden the preserved endpoint rather than relying on its current unbounded schema/body parser. The
complete UTF-8 JSON body is at most 64 KiB and contains only the existing exact fields. After NFC and
trim, `space_id` is 1..128 code points and must pass the existing allow-listed Space guard; `question`
is 3..2,000 code points; `note` is 1..1,000 code points; optional `ask_log_id` is 1..128 code points;
`kind` is one current enum value; optional `source_state` is one current `SOURCE_STATES` value; and
`citations` contains at most eight entries. Each citation has a 1..128-code-point query-local
`source_id`, 1..200-code-point title, validated `https` URL of at most 2,048 UTF-8 bytes, optional
validated `last_reviewed_at`, optional plain-text `excerpt` of 0..600 code points, and optional strict
legacy freshness object. That object contains only current status, optional `dueDateIso` as exact
`YYYY-MM-DD`, and optional nonnegative integer `daysOverdue` no greater than 36,500; unknown fields
are rejected. The S93 citation mapper deliberately omits excerpt/due fields, while the retained
buffered AskForm may submit those bounded legacy fields unchanged. Parse body bytes with an enforcing
limit before JSON allocation/schema validation. Render all stored reviewer context as escaped text
and validated links, never HTML/Markdown. Existing bounded legitimate callers remain compatible;
over-limit or malformed legacy input receives a bounded validation refusal and zero write.

At most one correction form may be expanded in a tab. Its exchange is pinned against S89 eviction;
other `Suggest a correction` controls are disabled with accessible description `Cancel or finish the
open correction first.` `Cancel` discards the unsent note and selection, releases the
pin, collapses the form, returns focus to `Suggest a correction`, and writes nothing. Query submission,
terminal rendering, model/narration output, action projection, opening a link, hover/focus, Clear, and
S94 Review/Confirm never open or submit the form.

After `File correction` dispatches, the form controls and `Clear conversation` stay disabled until a
strict response. A strict recognized validation/authorization outcome that proves the handler made
no commit, or a valid `commit_state:not_committed` union, re-enables editing and offers `Try filing
again`; normalization maps an unchanged retry to the same record identity, while a human edit
produces the new payload identity. A transport close, timeout, non-parseable response,
`commit_state:unknown`, or any response that fails the strict correction union/receipt/HTTP validation
after dispatch creates `correction_unknown`, retains
the exact normalized body in page memory, keeps the exchange pinned, shows
`Correction status was not received.`, and offers `Check correction status`. That control resubmits
the byte-identical body to the same deterministic-document route; it never creates a different identity or retries
automatically. `filed` and `replayed` with `receipt.state=Proposed` render their exact paired success
copy plus `This correction is awaiting Admin review.`, release the pin, and clear the body.
`replayed` with `receipt.state=Approved` renders its exact paired success copy plus
`This correction was approved.`, releases the pin, and clears the body. `replayed` with
`receipt.state=Dismissed` renders its exact paired success copy plus
`This correction was dismissed. Revise it before filing another correction.`, retains the normalized
Space/kind/note in page memory, keeps the exchange pinned, and offers `Revise correction` and
`Cancel`. `Revise correction` returns the retained form to editable state; `File correction` remains
disabled until normalization shows that Space, kind, or note changed and therefore produces a new
identity. The question remains immutable as part of the answered exchange. `Cancel` releases the
pin and clears the retained body. This is the only S93 recovery from a dismissed identity: it never
reopens or overwrites the Admin-decided record and never implies that cosmetic whitespace changes
create a revision. A `filed` response with a non-Proposed state, an unknown state, or a state/copy/UI
pairing outside this registry fails strict validation and, because File was dispatched, enters the
same `correction_unknown` byte-identical status-check flow rather than being dismissed or treated as
no commit.

Reload/navigation/tab close may clear the visible recovery form, but any later filing with the same
normalized Space/question/kind/note converges on the same durable record and returns `replayed`, even
when query-local citation refs changed; that replay again surfaces the exact terminal state and the
dismissed revision path when applicable. A deterministic hash
conflict means the addressed record does not safely match this filing. It keeps the form pinned,
offers `Report issue`, and prohibits another File/status attempt from that form. `Report issue` uses
one shared client trigger contract owned by the already-mounted global feedback reporter; it focuses
and opens that existing dialog rather than rendering a second reporter or calling its endpoint. The
shared trigger passes only the invoking control as the focus-return/stable-element source. The
reporter continues to derive the current pathname and its existing allow-listed element identity
(`tag`, `role`, `type`, `id`, and `testId` only); it receives no question, answer, correction body,
token, hash, citation, customer value, or prefilled description. Closing the reporter returns focus
to the invoking `Report issue` control. Where the global reporter is intentionally unavailable under
the existing environment boundary, the conflict remains pinned and no substitute write/control is
invented. After reporting, explicit Cancel may release the local form but does not claim no prior
record or recommend a fresh identity. It never overwrites the existing record.
This intentional correction
persistence is separate from S94's action tray and one-task contract.

### Terminal action projection and task confirmation

S93 renders S94 `AssistantActionProjectionV1` only after an `answered` terminal reconciles all result
groups. Before rendering, it validates S94's exact state/entry/notice counts, code/message/route
pairings, notice order and uniqueness, item refs, and 128-KiB bound. An illegal pairing fails closed to
the exact local unavailable presentation and never renders a candidate or route. `not_applicable`
renders nothing. `unavailable` preserves the read answer and shows only `Task actions are temporarily
unavailable` with no link. `partial` renders every valid entry plus `Actions are available for the
first 20 eligible results. Refine your question to review others.` A legal `multiple_existing` notice
renders `Multiple tasks already reference this renewal. Open My Work to continue.` and its one
validated generic My Work new-tab action, whether the projection is complete or partial; S93 never
suppresses it because other entries exist. Each projection entry is tied to one terminal item ref. A
`handoff` entry is a deliberate typed new-tab link through the S94 branch of the shared safe renderer.
A `candidate` entry is an ordinary same-page button labelled `Create my task`; it never auto-opens,
prefetches, or calls Confirm.

The stream coordinator invokes terminal projection inside the already-admitted S89 query and passes
the same `AbortSignal`, absolute 50-second deadline, and remaining-time clock. The projector may use
only the smaller of its ten-second app-local ceiling or the overall remaining time, takes no second
query/adaptor/model capacity permit, and has no retry or detached continuation. S93 emits no action
token, projection, or terminal after Stop, disconnect, abort, or deadline and releases the one query
permit through the same coordinator cleanup path.

Activating a candidate first opens S86's cancel-first accessible input dialog with S94's value-free
title default, required `Next action`, optional due time, and buttons `Cancel` and `Review task`.
`Review task` submits exactly this strict object to S94 Review, where `candidate_ref` is the exact
opaque value from the activated S94 candidate and `due_at` is omitted when the user chose no due
time:

```text
{
  schema_version: "assistant-action-review-request-v1",
  candidate_ref: <exact activated candidate_ref>,
  input: {
    title: <current title field>,
    next_action: <current next-action field>,
    due_at?: <current explicit-offset timestamp>
  }
}
```

It submits no result item, route, source, actor, role, Space, action kind, model value, or extra key.
A `ready` `AssistantActionReviewResponseV1` moves
the same dialog to preview phase, renders its exact `message` as the dialog introduction, and then
renders only its exact `review` fields: source, Space, task type,
the complete `Current renewal context` date/stage/status/blocker/source-next-action fields, title,
signed-in assignee, human-entered task next action, due timestamp or `No due time`, consequence, and
expiry. The
preview never renders the confirmation ref or preview hash. It offers `Back`, `Cancel`, and `Create
task`.
`Back` discards the confirmation ref and returns to editable input; a later Review is a fresh
non-persistent request. `Cancel` closes, discards in-memory tokens, returns focus to the originating
candidate, and writes nothing. `Create task` sends exactly this strict object and no other key:

```text
{
  schema_version: "assistant-action-confirm-request-v1",
  confirmation_ref: <exact sealed confirmation_ref from this Review>,
  preview_hash: <exact lowercase SHA-256 hex from this Review>
}
```

It moves state to the separate action tray, disables repeat activation while pending, and uses S86
indeterminate feedback.

S93 strictly parses the endpoint-specific S94 response union. Review accepts only `ready`,
`existing_task`, `superseded`, `refused`, or `unavailable`; Confirm accepts only `applied`,
`existing_task`, `superseded`, `reconciliation_required`, `refused`, or `unavailable`. A valid
non-`ready` Review closes the dialog, discards its candidate/confirmation material, returns focus to
the originating control, and moves the exact response into the action tray. A valid Confirm closes
the dialog and moves the exact response into that tray. It attempts the strict union parse for every
S94-listed `200|201|400|403|409|410|422|503` domain status before consulting `response.ok`; bounded
media/body/auth API errors without an action-response schema follow the endpoint-specific recovery
below. The tray
renders the response `message` byte-for-byte and only its typed `route_refs`; for `applied`, those
routes come only from the strictly validated `AssistantTaskReceiptV1`. Every route is a complete
S94 `AssistantActionRouteRefV1` from that same response; S93 never carries an S88 result-local ref
into Review/Confirm or resolves one after the query. It does not display opaque
task refs, record/source versions, hashes, readback markers, or `replayed`. All routes use the shared
typed new-tab renderer. The UI never derives copy, recovery, a URL, or success from `status`,
`reason_code`, or `replayed`. A projection or Review response with an unknown field, illegal
status/reason pairing, wrong endpoint variant, malformed receipt, or invalid route fails closed to
exact client-local copy `Task actions are temporarily unavailable` with no link or automatic retry.
The same validation failure on any returned Confirm response after dispatch enters
`confirmation_unknown` under the preceding contract and may not be dismissed as `unavailable`.

“Ordinary error recovery” is endpoint-specific. A Review transport or response-validation failure
has made no write: discard any incomplete response, retain the still-valid candidate/input in memory,
show `Task review was not received.`, and offer one deliberate `Review task` retry. Every Confirm
transport or response-validation failure after dispatch uses only the `confirmation_unknown` flow
above because the write outcome may be ambiguous. A definitive bounded client-side refusal before
Confirm dispatch discards the invalid token and follows its safe sign-in/fresh-review recovery; it
never enters unknown state or retries automatically.

No receipt/handoff/task/source link opens automatically. After `applied` or `existing_task`, the user
may deliberately activate the server-authored task/My Work route in a new tab. A typed
`reconciliation_required` response keeps its exact route in the tray; response loss instead uses the
link-free `confirmation_unknown` check flow until a strict response arrives or the token expires. The
query's result and narration remain read-only regardless of Review/Confirm outcome.

### Pending, cancellation, retry, and accessibility

Accepted activation changes the visible control state within 100 ms. If still pending at 400 ms,
show S86's text-labelled indeterminate indicator; no `aria-valuenow` is present. Progress events
replace the one visible status message but do not create multiple spinners. `Stop` aborts the client
request and causes the server signal to stop downstream work. The local exchange reads `Stopped` and
keeps its submitted question. Stop never rolls back or implies a completed query, and it does not
automatically retry.

Retry is manual, uses the exact preserved question as a new strict V1 request, receives a new
`query_id`, and cannot duplicate a write because S88 is read-only and S94 confirmation is a separate
contract. A network close, invalid event, sequence error, parse error, or terminal-less stream shows
`Response interrupted` and Retry. A 401/403 after session expiry offers sign-in/reload recovery; a
429 shows S89's retry timing without a countdown guessed by the UI.

Use one polite live status for accepted/progress/error and one terminal completion announcement;
do not announce every NDJSON line or re-read an entire growing narrative. The exchange list uses
semantic headings/lists, status and source states are text-labelled rather than color-only, keyboard
order follows visible order, focus indicators meet S85/S86, and result links have one hit target
without nested interactive controls. Reduced motion removes typing/pulse animation while retaining
all status text. At 320 CSS pixels and 200% zoom, composer, Stop/Retry, groups, action-candidate/
review/confirmation controls, and new-tab links remain operable without page-level horizontal
scrolling.

**In scope / out of scope.**

In scope: the `AI` composer; removal of the process picker/classifier/run-start behavior from this
surface; current Dictate preservation; the in-memory exchange state machine; canonical
`/api/assistant/query/stream` NDJSON framing; abort/error/terminal reconciliation; progressive
structured groups; one validated S92 narration event; the terminal S94 action-projection slot and
Review/Confirm rendering; typed new-tab result links; the collapsed `guidance.knowledge` correction
form over the preserved `/api/ask/correct` contract; terminal states; deterministic processing
disclosure; accessibility; and compatibility with buffered `/api/ask` during migration.

Out of scope: S88 intent rules, evidence minimization, result schema, or route manifest; S89
retention, telemetry, budgets, cost controls, or evaluation policy; S90/S91 domain reads, filters,
completeness, row minimization, or route-reference creation; S92 prompt/retrieval/model
choice, narration validation, or citations; S94 candidate projection, Review/Confirm execution,
idempotency, receipt, or reconciliation; S95 Dashboard page composition and panel relocation; S82
renewal blocker computation; S83 access lifecycle; persistent or cross-device conversation history;
multi-turn context; raw token streaming; speech-provider changes; arbitrary Markdown/HTML; generic
approval creation; autonomous task/workflow/provider execution; or route renames.

**Open questions & assumptions.**

No material product question remains open for V1.

- Decision: “Chat-style” means a vertically ordered page-session exchange stack, not persistent
  history or implicit multi-turn model memory.
- Decision: “Streaming” means real structured accepted/progress/group/result milestones. Because the
  current provider and S92 validation are buffered, V1 emits narration only after complete validation
  and does not simulate token streaming.
- Decision: “Thinking process” is satisfied only by the factual `How this was checked` disclosure;
  hidden reasoning is never exposed.
- Decision: no confidence score ships. Source completeness, truncation, freshness, counts, and
  deterministic/model role are the supported trust signals.
- Decision: every S88 internal result route and every S92 trusted external citation opens in a new
  tab. Their validation contracts stay separate, and this does not alter navigation elsewhere in the
  product.
- Assumption: S89 supplies the exact exchange/event/query size and duration budgets. If a budget is
  unavailable, its public bounded refusal is rendered; S93 does not invent a fallback limit.

**Cross-product impacts.**

- `components/ask/AskForm.tsx` and its tests are replaced or decomposed into the composer, exchange
  stack, stream decoder, result-group renderer, route-reference link, and S94 action-candidate slot.
- The new `POST /api/assistant/query/stream` App Router handler becomes the stream adapter over S88.
  Existing `app/api/ask/route.ts` remains buffered and compatible during migration.
- Existing `POST /api/ask/correct`, `edit`/Space guards, and Proposed-only correction store remain the
  sole knowledge-correction write boundary. S93 adds deterministic payload-stable direct-read
  correction identity, a strict filer-safe outcome union, and the collapsed current-exchange
  adapter described above; no second correction writer or provider effect is introduced.
- `/` and `/ask` consume the same S93 component through S95; route guards and AppShell remain the
  page owners.
- `lib/processes/intent.ts` and `/api/processes/classify` may remain for other proven consumers, but
  the Dashboard no longer calls or exposes them. Process definitions/runs remain under Internal
  Processes and Processes.
- S90/S91 app-state adapters, S82 renewal route state, S83 access links, S92 citations/narration, and
  S94 action projection and Review/Confirm states cross the boundary only through their typed server
  envelopes.
- S89 owns bodyless metrics and any operational alert. S93 adds no transcript, prompt, result value,
  customer value, or raw event body to telemetry.

**Authority and evidence map.**

| Input                                                                                         | Classification                    | Use and limitation                                                                                                                                              |
| --------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router, `AGENTS.md`, current auth/action gates, committed code/tests, and `docs/facts.md`     | Authority / implementation truth  | Preserve managed-user guards, Live-only data, exact effect gates, non-disclosure, no autonomous sends, and protected-path restrictions.                         |
| `AskForm`, `/api/ask`, `lib/ask/service.ts`, schemas, model provider, and Ask/app-state tests | Implementation truth              | Establish buffered one-shot Ask, process-picker side effects, disconnected app state, current Dictate/correction/citation behavior, and no stream provider.     |
| S88                                                                                           | Required architecture contract    | Owns strict request, deterministic intent/adapters, minimized envelopes, terminal states, source truth, route references, and read-only orchestration.          |
| S89                                                                                           | Required control contract         | Owns session-only privacy, budgets, cancellation/timeouts, bodyless observability, and evaluation gates.                                                        |
| S90 / S91                                                                                     | Required domain adapter contracts | Supply actor-scoped Work/approval/access and canonical renewal groups, completeness, minimization, and route references through S88.                            |
| S92 / S94                                                                                     | Adjacent typed contracts          | Supply mandatory answered-result narration and one stateless human-confirmed renewal-task action; S93 transports/renders but cannot create or authorize either. |
| S82, S83, S85, and S86                                                                        | Existing specified dependencies   | Supply canonical renewal links, access handoffs, semantic visual roles, and honest shared interaction/accessibility behavior.                                   |
| Dashboard AI and decluttering feature notes                                                   | Intent evidence only              | Require chat-style linked actionable results, real processing visibility, implicit routing, no process picker, and a minimal first-screen experience.           |
| A future provider capable of validated incremental narration                                  | External/adjacent input           | May support a later protocol version only after S92 owns chunk validation; it is absent and does not block V1 structured streaming.                             |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S93-1** — One strict POST stream route consumes only S88 `AssistantQueryRequestV1`, binds
  the verified actor server-side, creates one single-use S88 query context only after strict
  validation, passes that exact context through S89 admission into one `runAssistantQuery` call with
  an abort signal, and preserves buffered `/api/ask`. Only admission success may commit NDJSON.
  Route/contract tests fail first on the absent endpoint and reject every actor/intent/filter/link/
  action/model field.
- **ARCH-S93-2** — One protocol-versioned NDJSON encoder and one incremental decoder enforce the
  exact common fields, event union, contiguous sequence, legal ordering, single terminal, bounded
  public error, and terminal canonical-result reconciliation. Protocol fixtures fail first against
  the current buffered response.
- **ARCH-S93-3** — One client state machine owns composer, one-in-flight dispatch, Stop, retry, and
  the S89-bounded in-memory exchange stack. Storage spies prove no transcript or prior-turn context
  exits the mounted page.
- **ARCH-S93-4** — One result renderer consumes only S88 groups/route references and S92/S94 typed
  envelopes. Link-manifest, DOM, and injection fixtures prove model/plain-text/raw URLs cannot create
  a link or control.
- **ARCH-S93-5** — One public-status projection maps real query milestones and terminal states onto
  S86 busy/progress/notice/disclosure primitives without chain-of-thought, scores, percentages, raw
  diagnostics, or per-token live-region noise.
- **ARCH-S93-6** — The transport is cancellation- and failure-safe: disconnect/Stop/timeout abort
  downstream work, pre-header refusals stay bounded JSON, post-header failures terminate through one
  error event, and incomplete results can never be relabelled final.
- **ARCH-S93-7** — One collapsed knowledge-correction adapter maps only the current answered
  `guidance.knowledge` exchange into the hardened `/api/ask/correct` schema. One deterministic
  direct-read correction document makes equivalent File/status replay converge across response loss,
  reload, navigation, or process restart. Route/store spies prove explicit
  `File correction` is the sole correction write and no model, query, action, or other exchange can
  supply or submit its context.
- **ARCH-S93-8** — One compact capability/help renderer consumes only S88's public manifest and owns
  example-to-composer, independent-question disclosure, unsupported/clarification recovery, focus,
  and no-submit behavior. DOM/registry parity fails on UI-authored examples, a ninth V1 family, a
  broader action claim, duplicate help, or hidden conversation-context behavior.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S93-1** — A managed user sees `AI`, Dictate, an accessible `Message AI` composer, and Send,
  with no Process field, suggestion, classifier, `Just ask`, or implicit workflow-run creation.
- **BEH-S93-2** — Submitting a valid question immediately appends the user turn; actual routing/read/
  result milestones appear below it while work continues, and one terminal result replaces the
  incremental snapshots in canonical order.
- **BEH-S93-3** — Answered, authoritative-empty, clarification, unsupported, denied, unavailable,
  interrupted, stopped, and rate-limited fixtures render distinct truthful states and recovery; no
  state silently produces a blank result.
- **BEH-S93-4** — Every valid item route opens the exact server-authored destination in a new tab with
  safe rel/accessibility treatment; invalid, stale, denied, raw, or model-authored destinations do
  not render as links.
- **BEH-S93-5** — Exchanges remain visible only for the mounted page session, never influence later
  query routing, and disappear on reload/navigation/sign-out without durable transcript writes.
- **BEH-S93-6** — Pending work supplies immediate and 400 ms indeterminate feedback, Stop is prompt
  and idempotent, Retry preserves the question but receives a new query id, and no retry duplicates an
  S94 action.
- **BEH-S93-7** — `How this was checked` shows only factual source/completeness/narration-role data.
  No hidden reasoning, prompt, generic confidence, timer-made progress, or unvalidated narrative
  fragment reaches visible or accessibility output.
- **BEH-S93-8** — An answered knowledge exchange alone offers collapsed `Suggest a correction`;
  explicit filing sends its validated question/citation snapshot plus current human inputs to the
  guarded Proposed-review path once for the same actor and exact normalized payload. One open/unknown
  correction remains pinned and recoverable with that same payload while Cancel and every automatic assistant lifecycle
  write nothing.
- **BEH-S93-9** — At any time a user can open `What can I ask?`, inspect exactly eight V1 families,
  copy an example without sending, and understand that visible prior turns are not query context. An
  unsupported or ambiguous turn keeps its wording, offers Edit plus the same bounded help, and never
  says that a process, source, or record is missing when only the question is unsupported.

**Human litmus outcome.**

### Ask for linked work

**If this was built correctly:** A user asks which renewals are blocked, sees that the app is checking
authorized sources, sees complete linked result rows appear below the question, reads whether the
source set was complete or partial, and opens one exact renewal in a new tab. No process is selected
and no workflow or provider action starts.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Understand a refusal or interruption

**If this was built correctly:** An unsupported request says that the question is not supported yet,
keeps the submitted wording, and offers the exact supported examples; a source outage says results
are unavailable rather than zero; a broken stream keeps any preview visibly incomplete and offers
Retry; and Stop ends pending work without losing the submitted question.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Trust what the assistant shows

**If this was built correctly:** A keyboard or screen-reader user can send, follow one concise status,
review grouped results and source completeness, open a labelled new-tab link, and inspect how the
answer was checked without seeing a confidence percentage or purported private reasoning. Reloading
the page clears the visible exchange history.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                        | Architecture outcome       | Behavior outcome         | Human litmus                         | Deterministic evidence / falsification                                                                                                                                                    |
| -------------------------------------------------- | -------------------------- | ------------------------ | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One AI composer; no process picker or implicit run | `ARCH-S93-3`               | `BEH-S93-1`              | Ask for linked work                  | DOM/network spies assert exact controls and zero classify/process-run requests.                                                                                                           |
| Strict actor-bound stream request                  | `ARCH-S93-1`, `ARCH-S93-6` | `BEH-S93-2`, `BEH-S93-3` | Understand a refusal or interruption | Schema/auth/body-size/unknown-field and one-orchestrator-call tests; client-supplied authority is rejected.                                                                               |
| True structured progressive delivery               | `ARCH-S93-2`, `ARCH-S93-5` | `BEH-S93-2`, `BEH-S93-6` | Ask for linked work                  | Delayed-adapter integration test receives accepted/progress/group bytes before terminal; timer-made chunks fail.                                                                          |
| Exact terminal/error reconciliation                | `ARCH-S93-2`, `ARCH-S93-6` | `BEH-S93-3`              | Understand a refusal or interruption | Event permutation/truncation/duplicate/unknown-version fixtures retain incomplete truth and expose bounded recovery.                                                                      |
| Typed actionable new-tab results                   | `ARCH-S93-4`               | `BEH-S93-4`              | Ask for linked work                  | Route-ref manifest and DOM tests assert exact href/target/rel/name; prompt/Markdown/foreign URL injection renders text.                                                                   |
| Session-local independent exchanges                | `ARCH-S93-3`               | `BEH-S93-5`              | Trust what the assistant shows       | Storage/request-body/router spies prove no history persistence or prior-turn replay; reload removes exchanges.                                                                            |
| Honest processing and accessible interaction       | `ARCH-S93-5`, `ARCH-S93-6` | `BEH-S93-6`, `BEH-S93-7` | Trust what the assistant shows       | Fake-clock, keyboard, live-region, reduced-motion, 320px, and 200%-zoom checks prove S86 timing and no noisy output.                                                                      |
| Validated narration only                           | `ARCH-S93-2`, `ARCH-S93-4` | `BEH-S93-2`, `BEH-S93-7` | Trust what the assistant shows       | Buffered-provider and invalid-narration fixtures prove zero raw deltas and deterministic result survival.                                                                                 |
| Human-confirmed task action only                   | `ARCH-S93-4`               | `BEH-S93-2`, `BEH-S93-6` | Ask for linked work                  | S94 projection/Review/Confirm schemas, expiry, and action spies prove display is inert until exact Confirm.                                                                               |
| Preserved explicit knowledge correction            | `ARCH-S93-7`               | `BEH-S93-8`              | Trust what the assistant shows       | Intent/state/body-capture/store spies prove only an expanded answered-knowledge form can append one Proposed correction per actor/exact normalized payload.                               |
| Buffered Ask compatibility                         | `ARCH-S93-1`               | `BEH-S93-1`              | Ask for linked work                  | Existing `/api/ask` schema/route tests stay green while the Dashboard calls only the new stream route.                                                                                    |
| No chain-of-thought or generic confidence          | `ARCH-S93-5`               | `BEH-S93-7`              | Trust what the assistant shows       | Static and DOM scans reject forbidden labels/fields, hidden prompt/reasoning, numeric confidence, and fake percentage.                                                                    |
| Discoverable bounded capability and edit recovery  | `ARCH-S93-3/8`             | `BEH-S93-5/9`            | Understand a refusal or interruption | S88-manifest/DOM/focus tests prove one collapsed disclosure, exactly eight families, copy-without-send, independent-question copy, retained wording, and no model/UI-authored suggestion. |

**Preservation set.**

- `/` and `/ask` remain guarded aliases and continue to render one shared Dashboard assistant under
  S95; no redirect or route rename is introduced.
- Existing managed-domain authentication, role/Space non-enumeration, server-side scope filtering,
  and vendor separation remain green.
- Current Dictate permission, recording, cancellation, transcription, review-before-submit, error,
  typed-input preservation, and focus behavior remain green.
- Buffered `/api/ask`, current Ask schema, source-state/citation validation, correction/capture APIs,
  and their non-Dashboard callers remain behaviorally compatible until an owning suite explicitly
  retires them; S93 atomically migrates every app-owned correction caller to the strict payload-stable
  response/replay contract.
  The Dashboard preserves correction only through the collapsed contract above. S95 intentionally
  removes the current `Draft`, inline renewal-notice composer, and `Capture Task` controls from the
  Dashboard; it does not mislabel the existing Ask capture placeholder as a My Work task or preserve
  those controls as assistant actions.
- Process definitions, `/processes`, `/spaces`, workflow runs, and their authorized start controls
  remain available on their owning surfaces even though the Dashboard picker is removed.
- S82 canonical renewal links and return state; S83 access-request non-disclosure; S85 theme roles;
  S86 async/link/focus/dialog behavior; S88 deterministic authority; S89 privacy/cost controls;
  S90/S91 domain reads; S92 grounding; and S94 confirmation remain separate green gates.
- Every current exact action-key gate, unsent-draft rule, exact-confirm/readback/idempotency contract,
  and no-autonomous-client-send boundary remains unchanged; query/help/link behavior invokes none of
  the separately executable source keys.

**Adversarial acceptance checks.**

- **AC-S93-1** — `ARCH-S93-1` request tests accept only exact V1 schema and bounds; reject extra actor,
  role, scope, timezone, intent, filter, route, URL, action, source, model, history, and prior-turn
  fields before context creation, stream headers, or orchestrator/model/provider work. Context/
  admission spies prove one context is created only after strict validation, rate/concurrency
  refusal uses it only for one bodyless closed event and commits no NDJSON, and an admitted request
  passes that same object/id into the sole `runAssistantQuery` call and every emitted record.
- **AC-S93-2** — `ARCH-S93-2/6` protocol matrix covers every legal event, zero intermediate events,
  multiple groups, replacement by id, contiguous sequence, duplicate narration/action projection, unknown
  protocol/type, invalid JSON, split network chunks, terminal duplication, bytes after terminal, and
  EOF without terminal.
- **AC-S93-3** — `BEH-S93-2/6` delayed-query proof observes accepted bytes before completion and a real
  group before terminal; fake timer chunking, estimated percentages, or a buffered response emitted
  only at the end fails.
- **AC-S93-4** — `ARCH-S93-4` prompt-injection fixtures containing Markdown links, HTML, JavaScript,
  lookalike internal paths, external URLs, route ids, and action labels create no link/control; only
  actor-authorized server route refs produce exact new-tab anchors. Group fixtures prove ordered
  `route_ref_ids` resolve before item/notice refs and a complete-empty group retains its exact owning-
  surface action without a guessed fallback. Coordinator-plus-domain notice fixtures recompute the
  top-level first-occurrence order, render each notice/recovery once before groups, and reject a
  missing mixed-denial notice, group-level duplicate rendering, or altered route pairing.
- **AC-S93-5** — `BEH-S93-3/4` actor × role × Space × complete/partial/truncated/unavailable matrix
  proves denied items/counts/routes never reach events, narration, DOM, accessibility tree, or
  telemetry and that unavailable never reads as an empty result. Private-carrier canaries prove the
  knowledge citation registry reaches only S92 after result validation, renewal action bindings
  reach only S94, and neither member reaches observers, model payloads, stream bytes, correction
  requests, logs, telemetry, client state, or durable storage.
- **AC-S93-6** — `ARCH-S93-3/6` Stop, disconnect, timeout, route exit, sign-out, double-submit, double-
  Stop, Retry, and late-event races abort once, ignore late events, retain truthful local state, and
  perform zero app/provider writes.
- **AC-S93-7** — `BEH-S93-5` storage and request-capture tests prove exchanges are page-memory-only
  absent explicit `File correction`, prior turns are not sent to S88/S92, and reload/navigation/
  session invalidation removes them; correction persistence is covered only by AC-S93-12.
- **AC-S93-8** — `BEH-S93-7` source disclosure fixtures expose only allow-listed intent/source/as-of/
  count/completeness/citation/narration-role facts; static scans reject chain-of-thought, prompt,
  token, score, raw evidence, stack, and generic confidence fields.
- **AC-S93-9** — `BEH-S93-1/3/6` keyboard, IME, Dictate, live-region, focus, reduced-motion, forced-
  colors, 320px, touch-target, and 200%-zoom tests prove one primary action and complete recovery
  without hover, color, animation, or pointer precision.
- **AC-S93-10** — Route/provider/store/action spies prove query, progress, result rendering, link
  opening, Stop, and Retry execute no Firestore mutation, workflow run, task, approval, draft, send,
  source write, connector check, or action-key change; exact S94 Confirm remains the only assistant
  task-write effect.
- **AC-S93-11** — Existing buffered Ask, auth, route alias, source-state/citation, Dictate, process,
  S82–S86, and canonical `bash scripts/verify.sh` checks remain a separately reported preservation
  gate rather than being averaged into S93.
- **AC-S93-12** — `ARCH-S93-7`/`BEH-S93-8` intent × terminal-state fixtures render collapsed
  `Suggest a correction` only for answered `guidance.knowledge`. Expanding, Cancel, Clear, query,
  model/narration, link, action projection, Review, and Confirm spies make zero correction calls;
  Cancel clears unsent inputs and restores focus. Explicit filing captures only one authorized
  writable Space, current kind/note, the exact current question, and the deterministic
  `external_citations` compatibility mapping; it rejects prior/operational/model/action context,
  preserves the current route/guard/201/readback/success copy, and never auto-retries a lost or failed
  response. Exact-boundary, double-click, changed-body collision, transaction-failure, response-loss,
  later-decision replay, deterministic-id collision, ambiguous transaction, filer-safe receipt, and
  legacy-record fixtures prove one correction record at most, byte-identical `Check correction
status`, no second Proposed record, no actor/reviewer identity in the response, and no false
  success. Proposed, Approved, and Dismissed replay fixtures expose the exact state copy; Dismissed
  retains the pinned local body and requires a normalized identity-field edit before the explicit
  revision filing can create a new Proposed record, while Cancel writes nothing and releases it. A 21st
  terminal exchange evicts the oldest unpinned result while the sole open/unknown correction remains
  pinned; Cancel releases it, the 20-result ceiling never grows, and Clear/other correction controls
  cannot silently discard its input. Deterministic-hash-conflict fixtures prove `Report issue`
  activates the one mounted global reporter, passes only stable invoking-element identity, sends no
  correction/query/customer data, creates no second reporter, and returns focus to its S93 trigger;
  an intentionally unavailable reporter leaves the conflict pinned with zero fallback write.
- **AC-S93-13** — `ARCH-S93-8`/`BEH-S93-9` registry/DOM fixtures render one collapsed `What can I
ask?` inside AI, exactly S88's eight ordered families, fixed action boundary, and independent-question
  sentence. Example activation and Edit copy text/focus only and make zero request; nonempty composer,
  keyboard/touch/zoom, unsupported, ambiguity, reload, and duplicate-help fixtures preserve input and
  reject overwrite, auto-submit, `No process found`, model-generated suggestions, a ninth family, or
  any customer/source availability claim.
- **AC-S93-14** — The S89 managed-session served-browser lane runs all eight fixed examples plus
  unsupported, ambiguity, Stop, timeout, malformed stream, link, and action-tray states against the
  exact candidate and promoted revision. Any console error, unhandled rejection, unexplained failed
  same-origin request, missing terminal, post-terminal event, false empty, absent client-failure alert,
  or content-bearing telemetry blocks Dashboard exposure.

**Forbidden actions / hard gates.**

- Do not accept client actor, role, Space, intent, filter, link, action, model, evidence, or history
  at the query/result/narration/S94 action boundaries. The preserved correction endpoint accepts only
  its current guarded `space_id` and exact bounded context mapping; it grants no query authority.
- Outside the explicit bounded question/citation snapshot filed through `/api/ask/correct`, do not
  persist or replay a chat transcript, raw stream event, prompt, result value, Gmail body, provider
  payload, customer value, or hidden diagnostic through this suite.
- Do not expose chain-of-thought, system/developer prompts, tokens, aliases, safety rules, raw model
  scores, or a generic/numeric confidence indicator.
- Do not simulate streaming, typing, source work, progress, percentages, completion, success, or a
  source count. Do not turn a partial/unavailable read into a complete or empty answer.
- Do not render raw/model/client URLs, HTML, Markdown controls, or guessed internal/provider routes.
- Do not start a process, create a placeholder/task/request/approval, mutate a queue, check a
  connector, create/send a draft, write RentVine/Sheets, or perform any provider/client effect from a
  query, progress event, result link, or model output.
- Do not weaken protected auth/action-gate paths, open an Action Registry key, change production
  identity/runtime/budget, or push a protected-path change without exact owner direction.

**Dependencies / sequencing.**

1. S85/S86 provide semantic visual roles, Icon/new-tab treatment, busy/progress, notices,
   Disclosure, focus, and responsive accessibility.
2. S88 provides the strict request, deterministic read-only orchestrator, result groups, terminal
   states, completeness, actor-authorized route references, and the only V1 capability/example
   manifest.
3. S89 wraps the query with minimization, bodyless telemetry, budget/concurrency/timeout/cancellation,
   client-failure reporting, authenticated served-browser assurance, and evaluation controls.
4. S90 and S91 supply Work/approval/access and canonical renewal read groups through the S88 adapter
   registry; their current-source fallback and completeness rules remain authoritative.
5. S92 supplies exactly one completed validated narration envelope for an answered result and none
   for non-answered states; deterministic fallback replaces an unavailable/invalid model. Raw
   model token streaming remains absent.
6. S94 first supplies the stateless terminal projector, sealed Review/Confirm contracts, one-task
   execution, exact receipt, and recovery states against strict S88/S91/S93-slot fixtures with no UI
   exposure.
7. Implement S93 exactly once over S88-S92 and the real S94 contracts, preserving buffered Ask
   compatibility. The exact `AssistantActionProjectionV1` object with `state: "not_applicable"`,
   empty entries, and empty notices remains the terminal value when S94 finds no eligible action; it
   is not a predecessor implementation milestone.
8. Run one S93/S94 integration verification gate covering projection, Review, Confirm, receipt,
   refusal, cancellation, response loss, capability help, authenticated served-browser behavior,
   client-error alert delivery, and accessibility; this gate is not another suite execution.
9. S95 then makes S93 the sole AI region at both Dashboard aliases and removes the obsolete Dashboard
   panels/eager reads.

S82 and S83 are green prerequisites in the canonical unattended queue, so the desired S93 delivery
must verify their exact renewal and access destinations. Fixtures where either dependency is absent
remain rollback-compatibility tests only: S88 omits the route ref or provides its truthful authorized
fallback and S93 renders that state without guessing. Those fixtures cannot substitute for the
integrated destination gates required for S93 `ALL_GATES_GREEN`.

**Standalone delivery contract.**

- **Deliverable now:** strict stream route/framing, encoder/decoder/state machine, AI composer,
  session-local exchange stack, real structured progress/groups, terminal/refusal/error/retry/Stop,
  typed new-tab links, validated narration, terminal action projection, Review/Confirm render slots,
  collapsed preserved knowledge-correction form/adapter, accessibility,
  buffered Ask
  compatibility, focused/adversarial tests, and documentation can reach `ALL_GATES_GREEN` with the
  already-green S94 backend plus fake injected S88/S92 edge fixtures and zero provider mutation.
- **Consumes:** green S82 renewal routes, S83 access handoffs, S85/S86 interaction primitives, S88
  result envelopes, S89 controls, S90/S91 domain groups, S92 narration, and the green S94 action
  projection and Review/Confirm responses. Absence is tested only as fail-closed rollback
  compatibility. An answered result always has one validated narration; an ineligible result uses
  the exact `not_applicable` action projection rather than omitting the terminal field. Missing/denied/
  unavailable sources and routes retain their
  typed S88 terminal/recovery state.
- **Externally blocked effect:** validated incremental model narration has no present provider/
  sentence-validation contract and is intentionally not in V1. It blocks no S93 acceptance check;
  adding it requires a new protocol and S92 amendment. No provider, source, client-facing, task, or
  workflow effect belongs here; the explicit preserved Proposed-correction submission is the sole
  S93-owned app-record write and remains under `/api/ask/correct`.
- **Produces for downstream suites:** one canonical Dashboard assistant component, V1 stream protocol,
  exchange state machine, typed result/new-tab renderer, factual processing disclosure, and proof
  that the UI cannot manufacture authority or effects outside explicit correction submission and
  S94 Confirm. S95 consumes the component as one bounded Dashboard task region.

**Verification and delivery contract.**

1. Before implementation edits, record the current `/` and `/ask` DOM/network behavior, `/api/ask`
   buffered contract, Process picker/run-start behavior, Dictate flow, absence of the new route, and
   S85/S86/S88/S89/S92/S94 preservation baseline. The expected fail-first result is only the absent
   S93 route/protocol/UI.
2. Run focused request-schema/auth, stream encoder/decoder, delayed-event, state-machine, DOM/link,
   terminal/error, cancellation/race, storage/privacy, correction-body/guard/cancel/no-auto-submit,
   accessibility, and action-spy tests for every `ARCH-*`, `BEH-*`, and adversarial row. Report
   preservation separately.
3. Run `bash scripts/verify.sh`, inspect the mechanical diff, and audit secrets, PII, exact action
   gates, runtime configuration, model/request budgets, route references, and scope traceability
   before any authorized delivery.
4. Report one implementation terminal state: `ALL_GATES_GREEN`; `BUDGET_EXHAUSTED` only when an
   explicit budget exists; or `BLOCKED` only for an exact unavailable external input/authority after
   all independent fail-closed work is complete. No live provider write is required; the query
   transport remains read-only and the preserved correction write is proven with injected-store/
   focused endpoint tests. Served S93 code still follows the manifest's zero-traffic candidate,
   exact-revision smoke, promotion, stable readback, and predecessor rollback contract.

**Ordered prompt sequence.**

1. Re-verify the current shared Dashboard routes, Ask DOM/network/state, model buffering, Dictate,
   process-classifier/run side effects, auth guards, and sibling suite contracts.
2. Freeze fail-first V1 request/event/error fixtures, terminal-state examples, actor/Space/link matrix,
   browser interaction states, and preservation snapshots before implementation.
3. Implement the actor-bound abortable stream adapter and exact NDJSON encoder over S88/S89 without
   changing buffered `/api/ask`.
4. Implement the incremental decoder/reconciliation state machine and session-memory exchange stack;
   prove malformed/truncated/late streams fail visibly.
5. Build the AI composer, Dictate integration, structured group/narration/action-projection and
   Review/Confirm renderers, typed new-tab link renderer, collapsed knowledge-correction adapter,
   factual disclosure, and S86 pending/Stop/Retry/accessibility behavior.
6. Exercise delayed, empty, partial, unavailable, denied, unsupported, malformed, disconnected,
   cancelled, rate-limited, injected-link, scope-denied, narrow-screen, keyboard, and reduced-motion
   fixtures with provider/store/action spies.
7. Run canonical verification and privacy/gate/diff audits; deliver only the green bounded slice.

**Deletion/merge recommendation.**

Remove S93 from the active tree only after the V1 stream protocol, assistant UI, typed linked-result
renderer, session/privacy behavior, cancellation/error/accessibility checks, buffered Ask compatibility,
and S95 Dashboard integration are represented by committed code/tests and current facts. Merge its
long-lived protocol and UI invariants into the product/engineering contracts; do not delete S88/S89/
S92/S94 ownership or reinterpret the absence of raw token streaming as unfinished V1 work.
