<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: dashboard-assistant-v1 -->

# S89 — Assistant privacy, observability, and cost controls

> Status: Specified and not implemented. Current Ask persists full question/answer records, exposes
> coarse Firestore-derived counts, uses per-instance model throttles, and has no assistant transcript,
> cancellation, concurrency, usage, or operational-evaluation contract.

**Goal.**

Make the Dashboard assistant safe to operate in Production by keeping conversation content in the
current browser tab only, minimizing every model input, emitting bodyless diagnostics, bounding
requests/model/concurrency/time, cancelling abandoned work, and requiring deterministic privacy,
cost, failure, and quality gates before rollout.

**Current state / intended end state.**

`FirestoreAskLogWriter` in `lib/firestore/ask-logs.ts` currently persists the authenticated uid, complete
question, complete answer, draft, citations, grounding source ids, source state, and Space. The
`ask_logs` rule in `firestore.rules` allows every Editor-or-better client to read those records. This
does not satisfy the current `docs/engineering.md` rule that logs/evidence are bodyless and value-
minimized. `lib/admin/observability.ts` derives only recent Ask counts, source-state counts, and top
Spaces from those body-bearing records; it has no intent, latency, adapter availability, cancellation,
model-usage, or fallback measurement.

`lib/api/model-call-throttle.ts` supplies best-effort in-memory UID token buckets: Ask capacity 15
with 0.5 token/second refill and process-classification capacity 10 with 0.2 token/second refill.
They do not coordinate across Cloud Run instances. Production currently has one maximum instance,
concurrency 10, and a 60-second request timeout. `lib/llm/model-provider.ts` buffers model output;
only its local fetch transport has an explicit 30-second abort timer, and the provider response has
no usage or finish metadata. The current 50-case `tests/eval/eval.test.ts` checks the KB source-state
contract using injected fixtures; it does not evaluate operational intent, scope, completeness,
links, cancellation, cost, prompt minimization, or no-write behavior.

The intended state keeps the visible transcript only in memory for the mounted Dashboard tab. No
question, answer, operational item, narration, route, customer value, or conversation history is
written to Firestore, browser storage, cookies, URLs, analytics, or routine logs merely because it was
asked or answered. S93's separately confirmed knowledge-correction record is the one explicit
human-filed exception below. S88's structured
result remains authoritative; S92 supplies one mandatory narration envelope for every answered
result, and its optional model-backed path receives one bounded minimized fact envelope and may make
at most one model call. The assistant has explicit admission, concurrency, stage, overall
deadline, and cancellation controls. One allow-listed bodyless telemetry event reports safe outcome,
timing, source health, and numeric model usage without user/content identifiers. A deterministic
evaluation suite and staged rollout must pass before the Dashboard exposes the endpoint.

Existing global controls remain unchanged: the $25 project alert, $100 project hard stop, $100
account alert backstop, Node.js 22 guardrail with cap 100, current Cloud Run maximum instance count,
and all provider quotas. Passing an assistant limit never establishes budget or provider eligibility.

**Actors and entry conditions.**

- The user is an S88-eligible authenticated managed staff actor. UID is used transiently only for
  existing authorization and in-memory rate-limit keys; it is never an assistant metric label or
  transcript id.
- The client sends one S88 `AssistantQueryRequestV1`. It sends no history, identity, scope, model,
  prompt, data envelope, telemetry fields, timeout, or cost override.
- S88 must produce an authorized structured result without a model. The S92 model call is optional
  and can begin only after S88 data minimization succeeds and all S89 cost/capacity/deadline gates
  allow it. Every `answered` result still receives exactly one validated S92 narration envelope via
  deterministic fallback when the model is skipped or invalid. A model refusal never withholds an
  otherwise valid deterministic result.
- S93 owns the stream transport and in-memory transcript rendering. It must propagate request abort,
  use S89 event/retention rules, and render S88 plus the deterministic envelope when the model call is
  skipped.
- Production continues to use the configured Vertex/Gemini path. The local model remains non-
  Production only. There is no automatic provider/model failover.
- Current budget, runtime, logging-retention, and model configuration are read back before a cost-
  bearing release. No stale document or local fallback can establish live budget truth.

**What it is / how it functions.**

### Session-only transcript

The V1 transcript exists only in React memory owned by the mounted Dashboard assistant instance. A
turn contains the user's normalized visible question, S88 progress/final result, and exactly one S92
narration envelope for an `answered` result; non-answered terminals have no narration envelope. It has
no server conversation id and is never sent back with a later turn. Full reload,
tab close, sign-out, or Dashboard unmount clears it; the product does not restore it.

The mounted instance retains at most 20 completed exchanges plus the single permitted in-flight
exchange. When a 21st exchange becomes terminal, S93 removes the oldest evictable completed exchange
and announces that older results are no longer shown; it never evicts the in-flight exchange. S93 may
pin exactly one completed exchange only while its one correction form is expanded, filing, failed but
retryable, or awaiting payload-stable status recovery. The next-oldest unpinned completed exchange is
then evicted, so the 20-exchange ceiling never increases. Cancel or verified filing releases the pin.
No other UI state can pin an exchange. This is a client-memory/render bound only and does not
summarize, persist, or send prior turns.

One separate bounded action-recovery copy is allowed without pinning an exchange or raising that
ceiling. When S93 dispatches the sole in-tab S94 Confirm, its action tray may copy that exchange's
exact S88-normalized question (within the existing question bound) only while Confirm is pending,
the outcome is `confirmation_unknown`, or the expired tray still offers the deliberate
`Run question again` recovery. A strict Confirm outcome discards the question immediately while
retaining only its bodyless action status; expiry dismissal, Clear after expiry, reload, unmount,
sign-out, or successful `Run question again` also clears it. It is never copied from another turn,
included in telemetry/logging/model history, persisted, or sent anywhere except as the user's
explicit new S88 request through `Run question again`. The action tray remains singular and the
source exchange may be evicted normally while this copy exists.

Do not persist transcript content or derived summaries in `localStorage`, `sessionStorage`, IndexedDB,
Cache Storage, cookies, service-worker caches, URL/query/fragment state, Firestore, server session,
Cloud Logging, analytics, error reporting, notifications, or an Ask log. Browser-native user actions
such as selecting or copying visible text are not an application persistence feature. S93 provides a
visible `Clear conversation` control that removes all in-memory turns and returns focus to the Ask
input without deleting any product record because none exists.

One narrow existing product-write boundary is intentionally preserved: after an answered
`guidance.knowledge` exchange, S93 may show collapsed `Suggest a correction`; only the user's separate
`File correction` activation may send that exchange's exact question, validated citation snapshot,
selected writable Space, correction kind, and human note to the current guarded `/api/ask/correct`
route. That route appends at most one `Proposed` correction for the same actor and exact normalized
payload under S93's payload-stable identity/readback contract; an ambiguous byte-equivalent replay
returns the existing filer-safe receipt rather than appending another record.
It is not a query log, transcript/history save, automatic feedback loop, model action, or telemetry
exception; it receives no prior/other exchanges and no operational result. Opening/closing the form,
query completion, Clear, model output, link activation, or S94 action state makes zero correction
writes. Clear never deletes a deliberately filed correction. S93/S95 own its exact visible disclosure
and scope; S89 permits no other assistant-content persistence.

Result links open a new tab as required by S88/S93, so the originating Dashboard tab can retain its
in-memory transcript while the user works. A same-tab route change may unmount and clear it; V1 makes
no promise of recovery after navigation, crash, reload, browser restart, or another device. A future
durable or cross-device history requires a separate retention/access/delete/export specification.

### Two-level data minimization

The authorized S88 render envelope and a narration model-input envelope are different contracts. The
browser may receive all S88 fields required to show the authorized result. The model receives only a
server-built `AssistantNarrationFactsV1` allowlist:

- intent key, terminal/completeness state, safe as-of/currency labels, and applied symbolic filters;
- bounded aggregate counts and non-identifying status/date/category summaries required to explain
  the result;
- result-local ordinal references for visible groups/items, never internal/provider ids or hrefs;
- S92-approved KB excerpts/citations only after existing status, sensitivity, scope, and source
  validation; and
- for `guidance.knowledge` only, the normalized current question because it is required to answer the
  user's explicit knowledge request; operational intents instead receive a server-authored intent/
  symbolic-filter paraphrase with owner, tenant, resident, vendor, record, and free-text labels omitted.

Operational owner/tenant/resident/vendor names, addresses, emails, phone numbers, messages, reasons,
task free text, Gmail bodies/subjects, provider payloads, stable record ids, route hrefs, source ids,
secrets, tokens, claim values, and raw errors are excluded from narration unless a later explicit
field-level contract proves the exact value necessary and permitted. Structured Dashboard rows, not
model prose, carry authorized identity-bearing detail.

The one V1 user-content exception is the current normalized `guidance.knowledge` question described
above. It is sent only to the configured fenced provider after auth/scope/admission, never with prior
turns, and never logged or retained. The product does not claim that free-form user text is PII-free;
operational questions with customer labels are deterministically paraphrased so those labels do not
reach narration. Tests place canary identities in both families and permit them only in the one
knowledge-question field.

The serialized narration user payload is at most 32 KiB UTF-8, contains at most 20 item summaries per
result group, and includes exact returned/total/truncation facts when additional authoritative rows
remain only in the structured result. Deterministic compaction drops nonessential narration facts in a
fixed order and never truncates a JSON string or alters S88. If required facts do not fit, the model
call is skipped as `deterministic_input_too_large`; the structured result and S92's bounded
deterministic narration envelope remain available.

All retrieved excerpts and fact strings are labelled untrusted data. System instructions explicitly
forbid following embedded instructions, changing authority, inventing facts, or emitting actions/
links. Output is schema-validated and may reference only S88 result-local ids or S92 canonical
citations. Prompt/output validation failure uses deterministic fallback and is never retried by the
Dashboard narrator.

### Model invocation and output bounds

The Dashboard assistant may invoke the optional model-backed narrator at most once per admitted
query. Intent
routing, filter/date resolution, adapter selection, authorization, counts, links, actions, and
completeness never invoke a model. The one narration request has:

- the configured Production model and project/location fencing from `lib/config/server.ts`;
- temperature no greater than 0.2;
- maximum 1,024 output tokens;
- the 32 KiB minimized user payload above;
- one composed abort signal covering client cancellation, model-stage timeout, and the overall query
  deadline; and
- response metadata for input/output token counts, finish reason, provider/model key, and cancelled/
  timeout status when the configured provider exposes them.

Extend the model-provider seam rather than bypass it. Missing usage metadata is recorded as
`unavailable`, never estimated from customer content or reported as zero. A malformed, safety-
refused, empty, timed-out, capacity-skipped, rate-limited, cancelled, or provider-error model output
is discarded. An `answered` S88 result receives S92's deterministic narration envelope; a non-
answered result receives only S93's exact terminal copy. There is no Dashboard narration retry or
automatic billable fallback. The legacy direct `/api/ask` compatibility route may retain its current
two-attempt structured-answer behavior until its owning migration retires it; that exception cannot
be imported into the Dashboard narrator.

### Admission, concurrency, deadlines, and cancellation

Apply controls in this order: authenticate, enforce content type/body bound, parse S88 schema, create
one single-use server-only S88 query context/id, apply the per-user request bucket, claim assistant
concurrency, run deterministic routing/adapters, then optionally claim narration capacity. Rejected
media/body/schema inputs and denied actors receive no query context; rate/concurrency refusals may use
the already-created random id only in bodyless telemetry and construct no adapter/model. An admitted
request passes that exact context into `runAssistantQuery`; neither S89 nor the client synthesizes or
replaces the id.

- Preserve the current Ask token-bucket values for the new assistant request gate: capacity 15,
  refill 0.5 token/second, maximum 10,000 in-memory keys, keyed by authenticated uid. Exceeding it
  returns the S93 safe 429 response and `Retry-After` without a source/model call or echoing content.
- Production currently has one maximum Cloud Run instance and request concurrency 10. Add a bounded
  per-instance assistant coordinator with at most four active assistant queries and at most two
  active Dashboard narration calls. Capacity excess is refused before the affected stage; narration
  capacity excess skips only the model call, returns S88, and emits S92's deterministic narration
  envelope for an answered result.
- One declared composite intent may run at most three S88 adapters concurrently. An unregistered
  adapter cannot consume a slot, and a single failing adapter does not cancel independent successful
  reads unless the overall request is cancelled.
- The complete stream has a 50-second server deadline, leaving ten seconds below the current 60-
  second Cloud Run timeout for terminal serialization/cleanup. App-local adapter reads have a
  10-second ceiling; explicitly registered external/live reads have a 30-second ceiling; narration
  has a 20-second ceiling and also receives only the overall remaining time.
- S93 client disconnect, explicit Stop, stream cancellation, stage timeout, and overall deadline
  propagate one `AbortSignal` to coordinator, adapters, retrieval, and model provider. No later stage
  starts after abort. A dependency that cannot cancel may finish internally, but its result is
  discarded and it may perform no write. Cancellation is not automatically retried.
- S88's closed private projector inputs remain inside the same request and deadline. After S88
  validates the public result and private registry, S92 may read only the registry's validated
  query-local ref allowlist while constructing and validating narration; it may dereference the
  corresponding labels/hrefs into the public narration envelope only after the complete narration
  output validates. The registry object, hrefs, and records never enter the model. S94 may consume
  only its renewal bindings while building the terminal action projection. Their app-local reads receive the
  same `AbortSignal`, the smaller of ten seconds or the remaining overall time, and no separate retry.
  They cannot emit a late narration, token, projection, or terminal event after Stop, disconnect, or
  deadline.

The current in-memory rate limiter is sufficient only while live readback continues to show one
maximum Cloud Run instance. Any scale-out above one instance is blocked until a coordinated gateway
or durable rate boundary with equivalent per-user behavior is implemented and load-tested. This
suite does not raise Cloud Run max instances, concurrency, timeout, budget, or model/provider quota.

### Stream and client-memory bounds

S93's `assistant-stream-v1` transport accepts at most 96 NDJSON events, 1 MiB UTF-8 including the
newline for any one event, and 4 MiB UTF-8 for the complete response body. The client decoder holds
at most 1 MiB of unterminated bytes while waiting for a newline and never concatenates beyond the
4 MiB response ceiling. These limits include `accepted`, progress, groups, narration, terminal, and
error records; no event type has an exempt side channel. S94 action-candidate entries appear only
inside the bounded terminal `action_projection` and have no candidate-only milestone.

S88 applies its deterministic item/group/result byte bounds before observation, S92 applies its
narration bounds before streaming, and S94 caps action-projection entries at 20. The stream always
reserves two event slots and 2 MiB of the total response budget before emitting optional milestones:
one complete line for `narration_ready` and one for `terminal`. A non-answered terminal or an error
uses only the latter slot; the unused narration reserve is not repurposed after milestones have been
emitted. If an optional group milestone would consume either reserved slot, consume the 2-MiB final
reserve, or exceed a line/total bound, S93 omits only that intermediate milestone and excludes its group id from
`emitted_group_ids`; it does not alter S88's authoritative result or claim the milestone rendered.
Action-projection completion/order never depends on milestone capacity. S93 preflights the complete
answered pair, including common event fields and both newline bytes, against the 1-MiB per-line and
2-MiB reserved-total limits before either final line is written. If either final record violates the
upstream invariant, the server emits a bounded `error` when safe and closes; otherwise S93 reports
`Response interrupted`. The client takes the same path for an oversized line, count, total, invalid
UTF-8/JSON, or unterminated overflow and discards later bytes. No overflow fallback starts a second
query/model call or changes canonical completeness.

### Bodyless telemetry

Emit one best-effort structured Cloud Run log event per terminal request and optional phase events
only where required for latency measurement. The allow-listed `AssistantTelemetryEventV1` contains:

- fixed marker and schema/event version;
- random S88 `query_id` from the post-schema server context and route version, with no actor/session/
  conversation identity; media/body/schema/auth failures emit no assistant event, while rate/
  concurrency refusals use this id without pretending the coordinator ran;
- allow-listed intent or `none`, terminal state, five-state aggregate completeness (`complete`,
  `partial`, `unavailable`, `not_applicable`, or `not_evaluated`), adapter ids/versions and four-state
  outcomes;
- total and stage durations, timeout/cancellation/rate/concurrency outcome, and stable error code;
- narration outcome (`not_applicable`, `model_completed`, `deterministic_no_model`,
  `deterministic_skipped_rate`, `deterministic_skipped_capacity`,
  `deterministic_input_too_large`, `deterministic_cancelled`, `deterministic_timed_out`,
  `deterministic_invalid`, or `deterministic_failed`), configured allow-listed model key only when a
  call began, and numeric input/output token usage only when actually reported; and
- deployment environment/version fields already safe for production diagnostics.

It never contains uid, email, role/Space claim values, IP/user-agent, question, answer, narration,
item/group values, counts of customer/business records, filters/dates, ids, links, citations/excerpts,
source/provider payload, task/approval/request reason, messages, stack traces, prompts, tokens/secrets,
or raw errors. Error mapping happens before emission. Metric/log labels use finite allowlists so
customer text cannot create high-cardinality labels.

The one exception to `ids` is the random per-request S88 `query_id` explicitly listed above. It is
not derived from or reusable as an actor, session, conversation, source, record, route, candidate,
proposal, execution, or provider id. Every stable, business, source, actor, and action id/hash remains
forbidden.

For a request that reaches S88, the terminal telemetry `terminal_state`, `completeness`, and intent
mirror the validated public result. The two refusals that happen after query-context creation but
before S88 are telemetry-only outcomes; they do not manufacture an S88 result. Their values are
frozen as follows:

| Refusal boundary                     | HTTP result | `intent` | telemetry `terminal_state` | `completeness`  | `rate_outcome` | `concurrency_outcome` | `stable_error_code`                  | adapters/model/narration       |
| ------------------------------------ | ----------- | -------- | -------------------------- | --------------- | -------------- | --------------------- | ------------------------------------ | ------------------------------ |
| Per-user request bucket is exhausted | `429`       | `none`   | `refused`                  | `not_evaluated` | `refused`      | `not_evaluated`       | `assistant_request_rate_limited`     | none / none / `not_applicable` |
| Four-query coordinator is full       | `503`       | `none`   | `refused`                  | `not_evaluated` | `admitted`     | `refused`             | `assistant_query_capacity_exhausted` | none / none / `not_applicable` |

`refused` is an `AssistantTelemetryEventV1` terminal value only and is never accepted as an
`AssistantQueryResultV1.terminal_state`. For these two rows, adapter ids/outcomes and stage
durations are empty, cancellation and timeout are false, no model key or usage field is present,
and one `closed` event uses the single S88 context id. Schema/media/auth failures create no context
and no assistant event. An admitted coordinator run uses `rate_outcome: admitted` and
`concurrency_outcome: admitted`; phases that were never evaluated use the exact
`not_evaluated` value. No other error code or terminal/completeness pairing represents either
pre-coordinator refusal.

The sink is non-authoritative and best effort: telemetry failure neither changes the user result nor
causes a retry. New assistant queries never call `FirestoreAskLogWriter` or create a Firestore query/
transcript record. Before the Dashboard may reuse legacy knowledge answering, the direct Ask path
must stop creating new body-bearing `ask_logs` and emit the same bodyless outcome contract instead;
its response compatibility may remain unchanged.

Historical `ask_logs` are not deleted, rewritten, copied, or reclassified by this suite. Such a
destructive retention/rules change requires exact owner direction and a separate backup/readback
plan. `lib/admin/observability.ts` may not present the historical collection as current assistant
activity after writes stop; it must either label the old window `Legacy Ask` with its last event time
or consume bodyless log-based aggregate metrics. No UI may expose raw telemetry events to non-Admins.

Use Cloud Run structured logging and the project's existing logging retention as read back before
rollout; do not create a parallel Firestore telemetry collection or change log retention under this
suite. Log-based counters/histograms cover query terminal state, completeness, adapter availability,
latency, rate/capacity refusal, cancellation, narration use/fallback, and reported token totals. They
do not count or label customer records.

### Evaluation and release gates

Create a synthetic-only, table-driven `dashboard-assistant-v1` evaluation corpus. Fixtures contain
invented opaque ids and values and never load Production, live provider exports, Gmail content, or
recorded prompts. Every case records expected intent, filter symbols, adapter calls, role/Space
decision, envelope/terminal/completeness state, result/link contract, model eligibility, and telemetry
shape. Required families are:

- every S88 intent plus ambiguity, unsupported, invalid request, denied, and no-existence-leak cases;
- Editor/Approver/Admin with allowed, missing, malformed, and wildcard Space claims;
- complete non-empty, complete empty, partial, truncated, unavailable, not-applicable, mixed, timeout,
  exception, malformed adapter, and randomized completion order;
- symbolic `today`/`next_calendar_month` around month/year/leap/DST boundaries using an injected clock
  and owning adapter timezone;
- internal route allowlist, encoding, dead-route parity, and malicious URL/label/id attempts;
- no-model, model-complete, malformed, injected-instruction, unknown-ref, added-fact/link/action,
  provider error, reported/missing usage, capacity skip, timeout, and cancellation;
- transcript clear/reload/unmount/sign-out/storage/cookie/URL/network assertions;
- telemetry field allowlist with seeded emails, names, addresses, money, questions, answers, ids,
  links, prompts, source excerpts, secrets, errors, and stack traces that must never appear;
- fake-clock rate refill, 4-query/2-model concurrency, three-adapter fan-out, 10/20/30/50-second
  deadline ordering, abort propagation, cleanup, and no retry; and
- full store/provider/action spies proving query, narration, telemetry failure, cancellation, and
  evaluation execute no product/provider effect.

The current 50-case KB eval remains a preservation gate, not evidence that operational evaluation
passes. Run a bounded ten-concurrent-request rehearsal against fake adapters to match the current
Cloud Run request envelope; prove that only four assistant coordinators and two narrators run, excess
work receives the declared refusal/fallback, all permits release after completion/throw/abort, and no
test waits beyond the declared deadline.

Roll out in this order:

1. land bodyless event schema/redaction tests, request/concurrency/deadline utilities, provider
   abort/usage seam, and the complete synthetic evaluation corpus with no UI exposure;
2. create and promote a privacy-compatibility baseline that changes the legacy direct Ask route only
   enough to stop new body-bearing `ask_logs` and emit the bodyless outcome contract, while preserving
   its response, retrieval, correction/capture, and UI behavior. Smoke the exact revision, read back
   zero new body-bearing records, and record that promoted privacy-safe revision as the minimum legal
   rollback floor. Do not expose the new assistant in this release; and
3. close S89 after its exact promoted privacy baseline, runtime/budget/logging readback, bodyless-
   metric proof, and zero product/provider-write proof are recorded. S89 neither re-lands S88 nor
   implements or exposes S92, S93, S94, or S95.

Downstream suites preserve that floor. S93 captures the then-current privacy-safe serving revision—
never a pre-privacy revision—as its candidate predecessor and first proves deterministic narration
with the optional model call unavailable. The model-backed path is admitted only after S92/S89
minimization, one-call, token, malformed-output, capacity, and budget gates pass. S95 later exposes
the final Dashboard composition only through its own exact zero-traffic candidate, unavailable/admitted
model-path smoke, promotion, and readback gate. These are downstream completion gates, not additional
S89 execution steps.

Rollback disables the Dashboard assistant route/model-backed narration while preserving existing
application routes and deterministic fallback. There is no transcript or assistant business record
to migrate. Historical logs remain untouched. A pre-privacy revision that can write body-bearing Ask
logs is not a permitted assistant rollback target; if no privacy-safe predecessor has been captured
and proven, assistant exposure is blocked.

**In scope / out of scope.**

In scope: in-tab in-memory transcript policy and clear lifecycle; render/model envelope separation;
field-level prompt minimization; prompt-injection/output validation boundary; one-call/output/input
model bounds; provider abort/usage seam; existing-rate preservation; query/model concurrency; adapter,
model, and total deadlines; cancellation/cleanup; bodyless structured event and aggregate metrics;
legacy body-bearing-log stop; historical-log non-destruction; synthetic operational/privacy/cost/load
evaluation; staged enablement, rollback, and production readback gates.

Out of scope: persistent/synced/searchable/exported conversation history; prompt/answer analytics;
user-level monitoring; raw trace or replay; model training/fine-tuning; automated learning from
feedback; new model/provider or fallback; pricing recommendation; budget/headroom/Cloud Run scale
change; deleting or changing access to historical `ask_logs`; new Firestore telemetry store; product
analytics dashboard; scheduled reminders; assistant action execution beyond S94's one confirmed My
Work task; client/provider/source write;
and any role, Space, action-key, quota, secret, or logging-retention change.

**Open questions & assumptions.**

No material product question remains open. `Session-only` means the current mounted browser-tab
instance, not `sessionStorage` and not a server login session. This is the smallest privacy-preserving
behavior that supports a useful chat-like surface; result links open a new tab so normal task work
does not require transcript persistence.

The exact V1 client-memory bounds are 20 completed exchanges plus one in-flight exchange, 96 stream
events, 1 MiB per encoded event/decoder line, and 4 MiB per response. Changing them is a reviewed
contract/configuration change with matching server/client/property tests, not a browser-only tweak.

The fixed 15/0.5 request bucket preserves the present Ask limit. The four-query/two-narrator caps are
conservative within the verified one-instance, one-CPU, concurrency-10 Production envelope. They are
not performance claims or a reason to raise infrastructure. Exact token pricing is intentionally not
stored or guessed; reported provider token usage and live billing controls are the cost evidence.

Bodyless observability permits an opaque per-request query id because it carries no actor or content
and is needed to reconcile stream phases. It does not permit a stable user hash. Current Cloud
Logging retention is an implementation readback, not a product claim; S89 neither extends nor lowers
it.

**Cross-product impacts.**

S88 query/result contracts; S92 knowledge/narration prompt and model seam; S93 stream/cancel/transcript
UI; S94 action-state telemetry separation; S95 Dashboard rollout; current `/api/ask` logging; model
provider/config; per-user limiter; Cloud Run capacity; Cloud Logging/Monitoring; Admin observability;
KB and operational evals; privacy/security/static gates; budgets and incident runbook; release
candidate smoke. No application data, provider state, customer communication, or external action is
created.

**Authority and evidence map.**

| Input                                                                            | Classification                     | Use and limitation                                                                                                                                                                                               |
| -------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `docs/engineering.md`, `docs/facts.md`, and action registry         | Authority / present truth          | Require managed identities, bodyless/value-minimized evidence, Live-only operation, exact action gates, no autonomous send, and no source/provider effect.                                                       |
| `docs/budget-and-cost-policy.md` and `docs/production-capacity-and-pilot.md`     | Live/present control truth         | Establish $25/$100/$100/cap-100 controls and the one-instance, concurrency-10, timeout-60 envelope. S89 preserves rather than raises them.                                                                       |
| `lib/firestore/ask-logs.ts`, `firestore.rules`, and `lib/admin/observability.ts` | Implementation truth / privacy gap | Establish current body-bearing persistence, Editor+ read rule, and coarse metrics. Historical deletion/rule change is not inferred.                                                                              |
| `lib/api/model-call-throttle.ts` and `lib/llm/model-provider.ts`                 | Implementation truth / control gap | Establish exact current rate values, per-instance limitation, buffered provider, partial timeout behavior, and missing usage/cancellation metadata.                                                              |
| `tests/eval/eval.test.ts` and current Ask/model tests                            | Implementation truth / eval gap    | Preserve the KB/source-state corpus while adding synthetic operational, privacy, cancellation, and cost falsification.                                                                                           |
| S88 and Dashboard AI feature notes                                               | Active contract / intent evidence  | Supply deterministic results, mandatory answered-result narration with an optional model-backed attempt, streaming/chat expectation, and broad privacy/stability goal. They do not authorize history or effects. |
| Current Cloud Logging retention and provider usage metadata                      | Live readback dependency           | Read before rollout and represent missing usage as unavailable. Do not guess retention, pricing, tokens, or cost.                                                                                                |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S89-1** — One transcript boundary holds turns only in mounted Dashboard memory; static and
  browser tests fail on any server/browser/URL/log/analytics persistence or history resubmission.
- **ARCH-S89-2** — One allow-listed `AssistantNarrationFactsV1` builder separates authorized render
  data from model data, enforces 32 KiB/20-items-per-group compaction, labels untrusted text, and
  rejects unknown/sensitive fields before model construction.
- **ARCH-S89-3** — One Dashboard narration invocation seam enforces one call, 1,024 output tokens,
  temperature cap, provider fencing, usage/finish metadata, abort, deadline, schema validation, and
  deterministic fallback without changing S88.
- **ARCH-S89-4** — One admission/deadline controller enforces the existing 15/0.5/10,000-key request
  bucket, four active queries, two active narrators, three-adapter fan-out, 10/20/30/50-second stage/
  total limits, permit cleanup, cancellation propagation, and no automatic retry.
- **ARCH-S89-5** — One allow-listed `AssistantTelemetryEventV1` emits bodyless structured Cloud Run
  diagnostics and metrics without actor/content/business-value fields; new assistant and migrated
  legacy Ask paths create no body-bearing Ask log.
- **ARCH-S89-6** — One synthetic evaluation and rollout gate maps every intent, actor/scope, source
  state, route, prompt/output attack, limit, timeout, cancellation, telemetry, model fallback, and
  no-effect invariant to fail-first evidence before exposure.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S89-1** — A user can conduct and clear a multi-turn-looking Dashboard session in one tab; a
  reload, sign-out, unmount, or browser restart restores no conversation, while a new-tab result link
  leaves the originating tab intact.
- **BEH-S89-2** — Operational structured results and their deterministic narration render even when
  the model-backed narration call is skipped, unavailable, malformed, rate/capacity-limited, or timed
  out; no extra fact/link/action appears from model output. A cancelled turn follows the one explicit
  S93 cancellation state and emits no late narration.
- **BEH-S89-3** — Excess request/model concurrency and rate receive the declared fast refusal or
  deterministic fallback, do not exhaust unrelated app capacity, and release every permit on success,
  error, timeout, and abort.
- **BEH-S89-4** — Stop/disconnect/deadline halts later work, discards late output, produces one safe
  terminal/cancel state, and never retries or writes.
- **BEH-S89-5** — Operators can observe bodyless query volume, intent/state, adapter health, latency,
  cancellation, narration/fallback, and provider-reported token totals without seeing who asked or
  any question, answer, customer, source, route, or prompt value.
- **BEH-S89-6** — Candidate/release proceeds only after synthetic evaluation, privacy scans,
  cost/capacity readback, zero-write proof, exact revision smoke, and preservation gates pass; rollback
  leaves no assistant transcript/business-data cleanup.

**Human litmus outcome.**

### Use and clear a private Dashboard conversation

**If this was built correctly:** A user asks several questions in one Dashboard tab, opens results in
new tabs, and can clear the visible turns. Reloading or signing out does not restore them, and another
user cannot discover them in the app or logs.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Keep working without the model

**If this was built correctly:** When narration is busy, unavailable, slow, or invalid, the user still
receives the exact structured work result and a concise deterministic explanation rather than an
endless spinner, lost result, or invented fallback.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Stop an in-flight question

**If this was built correctly:** Selecting Stop promptly ends progress, prevents a later narration
from appearing, releases capacity, and does not create or change anything. The user can submit a new
question explicitly.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Diagnose operation without reading conversations

**If this was built correctly:** An operator can see whether queries are slow, partial, cancelled,
rate-limited, or using model tokens, but cannot recover a user's identity, wording, result records,
links, customer values, or model prompt from routine telemetry.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                   | Architecture outcome | Behavior outcome | Human litmus                   | Deterministic evidence / falsification                                                                                                                                                              |
| --------------------------------------------- | -------------------- | ---------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session-only transcript and clear             | `ARCH-S89-1`         | `BEH-S89-1`      | Use and clear                  | Browser/storage/network spies prove in-memory turns, clear/focus, new-tab retention, and no reload/unmount/sign-out/restart restoration or history submission.                                      |
| Prompt/data minimization and injection safety | `ARCH-S89-2/3`       | `BEH-S89-2`      | Keep working without model     | Seeded sensitive-field/property tests, 32 KiB/20-item bounds, untrusted-text attacks, unknown refs/facts/links/actions, and invalid output all refuse narration while preserving S88.               |
| Bounded one-call model use                    | `ARCH-S89-3/4`       | `BEH-S89-2/3`    | Keep working without model     | Provider spies prove ≤1 Dashboard narration call, ≤1,024 tokens, temperature ≤0.2, configured provider only, reported/missing usage truth, abort/deadline, and no retry/failover.                   |
| Rate/concurrency/time/deadline control        | `ARCH-S89-4`         | `BEH-S89-3/4`    | Stop an in-flight question     | Fake-clock/semaphore tests prove 15/0.5 bucket, 4/2/3 caps, 10/20/30/50-second precedence, Retry-After, capacity fallback, abort, late-result discard, and permit cleanup.                          |
| Bodyless useful telemetry                     | `ARCH-S89-5`         | `BEH-S89-5`      | Diagnose without conversations | Exact event-schema snapshots and canary-secret/PII scans reject every forbidden field/value, cap label cardinality, tolerate sink failure, and produce declared counters/timing/token aggregates.   |
| Stop new body-bearing Ask logs                | `ARCH-S89-5`         | `BEH-S89-1/5`    | Use and clear; Diagnose        | Firestore/log spies prove new assistant and migrated legacy calls create no question/answer/draft/citation/user record; historical records remain untouched and are not labelled current.           |
| Comprehensive safe rollout                    | `ARCH-S89-6`         | `BEH-S89-6`      | All                            | Synthetic matrix, ten-request load rehearsal, zero-effect spies, canonical gate, budget/capacity/config readback, exact candidate/post-promotion smoke, and rollback proof are independently green. |

**Preservation set.**

S88 deterministic request/result/no-write truth; current `/api/ask` response and two-attempt
compatibility until its owner retires it; KB source/citation/sensitivity and 50-case eval behavior;
Production Gemini/local non-Production fencing; server auth/Space isolation; current Cloud Run max
instances/concurrency/timeout; $25 alert, $100 project hard stop, $100 account backstop, cap-100
guardrail, and provider quotas; current direct route/action permissions; S80/S82 renewal truth; S83
access truth; S86 feedback/accessibility; permanent in-app send refusal; closed source writes;
historical `ask_logs` unchanged; secrets/PII gates; and canonical verification remain green separately.

**Adversarial acceptance checks.**

- **AC-S89-1** — `ARCH-S89-1` fails if transcript/history enters a query request after the first turn, a
  21st completed exchange does not evict exactly the oldest unpinned completed exchange, the sole
  S93 correction pin raises the 20-completed bound or applies to another state, the one action-tray
  question copy survives a strict outcome/expiry dismissal/Clear/reload/unmount/sign-out or pins its
  source exchange, or any Web Storage,
  IndexedDB, cache, cookie, URL, Firestore, server session, log, analytics, notification, crash report,
  hydration payload, or another user's render receives it; clear/reload/unmount/sign-out must remove
  it with no delete mutation. The sole exception fixture requires deliberate S93 `File correction`,
  sends only the current answered-knowledge correction payload through deliberate File or
  byte-equivalent status-replay calls to `/api/ask/correct`, and proves
  every automatic/operational/other-turn path remains at zero writes.
- **AC-S89-2** — `ARCH-S89-2/3` seed every forbidden identity/customer/source/link/prompt/error field,
  prompt-injection text, oversized Unicode, unknown output/ref/action/link, altered count/state, and
  hidden instruction. Model input/output scans and S88 comparison reject the leak or invention.
- **AC-S89-3** — `ARCH-S89-3/4` prove model construction happens only after an authorized S88 result
  and all gates; one Dashboard query cannot classify plus narrate, retry, fail over, exceed 1,024
  output tokens, ignore abort, or withhold S88 after narration failure.
- **AC-S89-4** — `ARCH-S89-4` uses fake clocks and deferred promises to saturate rate, four-query,
  two-model, and three-adapter limits; every success/throw/timeout/disconnect/late settlement releases
  exactly one permit, starts no later phase after abort, and finishes before the 60-second runtime
  cap. Exact event snapshots prove a token-bucket refusal is the declared `429`/rate row, a
  coordinator-capacity refusal is the declared `503`/concurrency row, both reuse their one
  server-created context id, and neither constructs S88, an adapter, or a model.
- **AC-S89-5** — Exact-boundary and plus-one fixtures cover 20 completed exchanges, 96 events,
  1 MiB lines/decoder buffers, and 4 MiB responses. Oversize/count/unterminated/invalid-UTF-8 input
  produces one bounded interruption path, no unbounded allocation, no second query/model call, and no
  silently complete result.
- **AC-S89-6** — `ARCH-S89-5` rejects uid/email/role/scope/IP/user-agent/question/answer/item/count/
  filter/date/link/citation/excerpt/reason/message/prompt/provider payload/raw error/stack/secret and
  every id/hash except the random S88 `query_id` in any telemetry key or value; dynamic labels outside
  finite enums fail schema validation. Media/body/schema/auth failures prove that no context or event
  exists; both post-context admission refusals prove exactly one bodyless `closed` event with the
  frozen `refused`/`not_evaluated` projection and no source/model fields.
- **AC-S89-7** — `ARCH-S89-5` proves telemetry outage cannot alter, delay, retry, or fail a query;
  `FirestoreAskLogWriter` is unreachable from the new route, new body-bearing legacy writes stop before
  reuse, and no historical deletion/rule mutation occurs.
- **AC-S89-8** — `ARCH-S89-6` rejects live/provider/customer fixtures, snapshot updates without
  reviewed expectations, missing actor/scope/source-state/route/model/cancel cases, or a passing KB
  corpus offered as operational evidence.
- **AC-S89-9** — `BEH-S89-6` reads back exact budgets, guardrail, Cloud Run envelope, provider/model,
  secrets-by-reference, Production+Live descriptor, and zero product/provider writes for candidate
  and stable revisions. Any drift blocks exposure without modifying the control.

**Forbidden actions / hard gates.**

No durable transcript, conversation history, prompt/answer/customer-value logging, stable user hash,
user-level analytics, raw trace/replay, model training, unrestricted operational data in a prompt,
model routing/filter/link/action authority, multi-call narration, automatic retry/failover, unbounded
context/output/concurrency/fan-out/time, ignored cancellation, late-result render, fake token/cost,
budget/headroom/instance/quota/retention change, deletion/rewrite of historical Ask logs, new
Firestore telemetry store, product/provider/source write, autonomous action/reminder/send, or action-
gate/role/Space mutation. Protected budget/guardrail, auth, Firestore Rules, and action-gate/registry
paths remain subject to `AGENTS.md`; this suite supplies no instruction to push them without required
owner direction.

**Dependencies / sequencing.**

S89 consumes S88 request/result/adapter/terminal/ref and no-write contracts. Its provider/control/
telemetry/eval foundation lands before S92 narration or S93 endpoint exposure. S92 consumes the
minimized fact envelope, one-call seam, validation, and fallback. S93 consumes the transcript policy,
request admission, abort/deadline, and bodyless events; it owns stream framing and the Stop/Clear UI.
S94 action projection and confirmation remain separate and may emit only their own bodyless action-
state metrics, never payload/target values. S95 does not expose the Dashboard assistant until S88-S93
gates pass.

**Standalone delivery contract.**

- **Deliverable now:** Complete transcript/privacy policy helpers, narration-fact schema/minimizer,
  provider abort/usage/output seam, admission/semaphore/deadline controller, bodyless event schema/
  sink, log-based metric definitions, synthetic eval corpus/runner, load/privacy/effect tests, legacy-
  log stop, rollout/readback checklist, and current documentation. Fake S88 data makes the slice fully
  testable before a live UI or model call.
- **Consumes:** the queued green S88 request/result envelopes and no-write contract, current Cloud
  Logging retention, and provider usage metadata. S92/S93 are intentionally absent during S89
  delivery and later consume these controls; strict fake downstream fixtures prove the seam without
  re-enqueuing either suite. Missing usage is `unavailable`, and telemetry outage is a non-authoritative
  degraded state.
- **Externally blocked effect:** Production assistant/narration exposure remains blocked until exact
  budget/runtime/provider/logging readback and S88-S93 candidate gates pass. No external write or
  client effect is requested, and all independent code/tests/docs can reach `ALL_GATES_GREEN`.
- **Produces for downstream suites:** Session-only transcript contract, `AssistantNarrationFactsV1`,
  model one-call/abort/usage bounds, admission/concurrency/deadline controller, cancellation semantics,
  `AssistantTelemetryEventV1`, metric allowlist, synthetic eval corpus, and rollout/rollback evidence.

**Verification and delivery contract.**

1. Before implementation edits, record current full Ask-log schema/rules/readers, rate-limit values,
   model timeout/usage behavior, Cloud Run/budget/log-retention readback, eval inventory, and the S88
   preservation baseline. Materialize failing transcript-leak, minimization, one-call, rate/concurrency,
   timeout/cancel, telemetry, legacy-log, and eval-completeness checks.
2. Run focused schema/property/browser/fake-clock/semaphore/provider/log/store/eval/load checks for
   every `ARCH-S89-*`, `BEH-S89-*`, and adversarial row. Keep current Ask/KB and global control
   preservation evidence separate.
3. Run `bash scripts/verify.sh`, inspect the mechanical diff, and audit secrets, PII/customer canaries,
   prompt/log/storage/network captures, exact action gates, runtime/budget configuration, and scope
   traceability before any authorized delivery.
4. Report one implementation terminal state: `ALL_GATES_GREEN`; `BUDGET_EXHAUSTED` only when an
   explicit budget exists; or `BLOCKED` only for an exact unavailable external input/authority after
   all independent fail-closed work is complete. Green controls do not claim a model call, live
   usability, persistent history, action, or provider effect.

**Ordered prompt sequence.**

1. Re-verify current Ask logging/rules/observability, model provider/limits, production capacity,
   budgets, logging retention, and evals; do not accept stale values.
2. Materialize the transcript-storage/network canary, narration minimizer, provider-call/abort,
   rate/concurrency/deadline, bodyless telemetry, legacy-log, and evaluation fail-first checks.
3. Build pure controls and fake-adapter evaluation first, then stop new body-bearing Ask logs; add no
   Dashboard exposure or Production model call.
4. Falsify every leak, injection, oversize, model failure, reported/missing usage, saturation,
   timeout, cancellation, telemetry outage, permit cleanup, no-effect, and preservation case.
5. Run canonical gates and the exact zero-traffic candidate/readback sequence for the no-new-body-log
   privacy baseline; promote only the exact green revision, record it as the rollback floor, run
   standard post-promotion bodyless-metric/runtime/write-effect checks, and restore only its captured
   predecessor on an S89 delivery failure. Streaming and Dashboard exposure remain downstream gates.

**Deletion/merge recommendation.**

Remove S89 from the active tree when transcript non-persistence, model minimization/bounds,
admission/concurrency/deadline/cancellation, bodyless telemetry, operational evaluations, and rollout
gates are enforced by code/tests/current facts, new body-bearing Ask logging is absent, and all
downstream assistant suites consume rather than restate these controls.
