<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: ai-first-dashboard-batch-004 -->

# S150 — Answer reuse and structured rerun without model calls

> Intake: ready, batch 004 item 017. Execution and reuse scope over the S138 engine and S148/S149 records; implementation and release not started.

**Goal.**

Viewing or reusing a question does not pay for a new model answer: stored answers reopen with no inference, and a saved supported operational question gets current results through the existing data services without the model reinterpreting it, while stale answers are never presented as current.

**Current state / intended end state.**

Verified at `23c79dac`: `runAssistantConversation` in `lib/assistant/conversation.ts` is the only exported entry, and it always interprets the question text (a model plan when allowed, otherwise the deterministic interpreter); nothing executes a supplied plan. Passing no interpreter makes zero model calls, every answer records `interpretedBy`, each request logs a bodyless `assistant_conversation` line, and `lib/llm/model-provider.ts` emits a bodyless `model_call` event per Gemini call. Reads come from `lib/operational-context/server-context.ts`, whose results carry as-of, currency and coverage, but answers expose them only as note text. Knowledge answers (`lib/ask/service.ts`) always generate. Intended end state: three distinct paths (stored-answer reopen, structured current run, new model-assisted request), each provable from tests and bodyless logs.

**Actors and entry conditions.**

The signed-in user. Current runs resolve identity and access on the server for every execution; owning a saved item is never authority to read what it references.

**What it is / how it functions.**

Reopen, history listing, save, pin and navigation read stored data only (S148, S149); a reopened answer keeps its original time, range and coverage and is always labelled historical. Add a read-only executor beside the conversation engine that runs a stored, schema-valid plan through the same subject executors, operational context, filtering, counting, pagination and Chicago business dates, with no interpretation step, for the supported repeatable kinds: lease lists and due-date ranges, assignments and My Work, recorded blockers, approval queues, and connection and freshness summaries. Rendering uses the existing deterministic answer shape, with no narration call. The executor never accepts a plan from the client: the server loads the user's saved plan by id. Stored answers are never re-labelled current; “current” always means a fresh execution through the authorized read path, using existing source caches and showing their real as-of and coverage, so no universal cache lifetime is introduced. Knowledge, narrative, unsupported or incomplete plans, and any changed meaning, go through the existing model path and are labelled as new synthesis; a material ambiguity asks instead of guessing. Duplicate delivery of one submission replays the completed turn by operation id (S148) or joins the in-flight request, so one execution never makes a second model call. A failed or partial current run is shown as such, and the earlier answer stays historical.

**In scope / out of scope.**

In scope: the plan executor, routing between the three paths, freshness and partial-result labelling, duplicate-delivery protection and model-call measurement. Out of scope: a general query compiler, a second rules engine, stored executable code, a new model, a billing dashboard, approval thresholds, subscriptions, schedulers, and any write or provider effect as a freshness shortcut.

**Open questions & assumptions.**

No intake-blocking question. Design decision recorded at intake: no stored answer is ever reused as current; current means re-execution, which removes the need for cross-source invalidation markers while keeping model calls off the repeat path. Measurement uses test seams and bodyless logs only; no message body is logged.

**Cross-product impacts.**

The S138 engine and its static bans (the executor stays read-only inside `lib/assistant`), S137 context, the model throttle (`lib/api/model-call-throttle.ts`), telemetry, S148 turns, S149 saved items and S146 turn rendering.

**Authority and evidence map.**

| Input                                                               | Classification                | Use and limitation                                                      |
| ------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| S138 engine, operational context, model provider and telemetry code | Authority / verified baseline | Existing executors, zero-model seam and bodyless instrumentation.       |
| Source item 017                                                     | Owner intent                  | Avoid paid inference on reuse without serving stale answers as current. |
| Counted test seams and bodyless production logs                     | Implementation evidence       | Proves zero-model paths; a “cached” label is not evidence.              |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S150-1** — A server-loaded, schema-valid plan executes through the existing subject executors with no interpreter and no narration call; a counted-model fixture fails against today's interpret-every-time path.
- **ARCH-S150-2** — Reopen, list, save and pin make zero model calls, duplicate delivery of one operation makes at most one, and every current result carries its actual execution range, as-of and coverage.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S150-1** — A saved lease-list or count question returns current records on rerun with zero model calls, matching the desk's own filtered result for the same data.
- **BEH-S150-2** — A changed range, access scope or source state is never served from an old answer as current; a failed or partial current run is distinct from a historical success and from a true empty result.

**Human litmus outcome.**

### Rerun for free, never stale

**If this was built correctly:** A user reruns a saved renewal question and gets today's list quickly, the cost record shows no model call, and an old answer always says when it was true. Record model verdict; without an observer use `Human verdict: NOT RUN — no human observer`.

**Requirement-to-outcome traceability.**

| Requirement            | Architecture outcome | Behavior outcome | Human litmus                | Falsification                                                             |
| ---------------------- | -------------------- | ---------------- | --------------------------- | ------------------------------------------------------------------------- |
| No inference on reuse  | ARCH-S150-1          | BEH-S150-1       | Rerun for free, never stale | Counted model seams per path and bodyless call logs; desk-parity check.   |
| Never stale as current | ARCH-S150-2          | BEH-S150-2       | Rerun for free, never stale | Month rollover, changed record, revoked access, partial and failed reads. |

**Preservation set.**

S138 answers for new questions, S135/S137 access and partial-source truth, the knowledge path's sources, the model throttle, the read-only query route and its static write bans, and S136 model selection.

**Adversarial acceptance checks.**

- **AC-S150-1** — Opening a stored answer, loading history, saving and changing a pin make zero model requests, proven by counted seams and bodyless logs.
- **AC-S150-2** — A saved supported lease-list or count question returns current results through its stored plan with no interpretation or narration call, and matches the data layer's own result.
- **AC-S150-3** — An unchanged prompt with a changed range, access scope or source state is never served from an incompatible stored result as current; current runs record their actual range and coverage while reopened answers keep their original metadata.
- **AC-S150-4** — New synthesis uses the model only when needed, unsupported reuse never fabricates a result, retried persistence or duplicate delivery never regenerates an obtained answer, and failed or partial current reads are distinct from history and from empty.

**Forbidden actions / hard gates.**

No executable code or client-supplied plan is run; no write, approval, send or provider effect from a current run; no stale answer labelled current; no new model, scheduler or billing feature; no message bodies in logs.

**Dependencies / sequencing.**

Requires S148 (stored turns and operation ids) and S149 (saved plans); renders through S146. S138 is the deployed baseline.

**Standalone delivery contract.**

Deliver the executor, path routing, labelling and duplicate protection with counted-seam tests; record live zero-model evidence only from the owner's bounded production check (S151).

**Verification and delivery contract.**

Record fail-first counted-model, desk-parity, rollover, invalidation, partial-read and duplicate-delivery tests before changing the engine. Run focused tests and canonical `bash scripts/verify.sh` under an authorized execution run; audit the exact diff and result evidence. Use `ALL_GATES_GREEN` for tested scope, `BLOCKED` only for a precise external input and `BUDGET_EXHAUSTED` only with an explicit budget.

**Ordered prompt sequence.**

1. Recheck the engine's executors, interpretation seam, telemetry and source as-of fields at the latest source.
2. Record fail-first counted-model, parity, rollover, invalidation and duplicate cases.
3. Add the read-only plan executor, path routing, structured as-of and duplicate protection.
4. Falsify stale-as-current, partial-read and duplicate paths and report exact tested versus live scope.

**Deletion/merge recommendation.**

Retire after S151 and serving evidence show zero-model reuse and truthful currency are owned by code, tests and current facts.
