<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: connected-ai-batch-002 -->

# S138 — Natural-language operational Dashboard conversation

> Intake: ready, batch 002 item 005. Scope only; the serving three-intent assistant remains the verified baseline.
>
> Amendment 2026-10-01 (batch 004 intake): this suite is deployed and is the baseline for S146–S150. S146 changes the Dashboard composition, and S148 supersedes the session-local transcript choice below for the Dashboard conversation.

**Goal.**

Signed-in staff can ask ordinary-language, multi-source questions about accessible work and follow up in the Dashboard without memorizing a three-phrase command list.

**Current state / intended end state.**

`/` and `/ask` render `ConsoleView` and `AskForm`. The S110 matcher has only `work.assigned_today`, `renewal.blocked`, and `renewal.window`; Ask falls back to KB-only grounding. The form holds one question/result and a selected process can start a workflow run on submission. None of that proves the requested conversation or combined filters. The intended Dashboard uses S137's scoped records and S136's model as needed for interpretation/narration; records and counts remain server-derived.

**Actors and entry conditions.**

Any authenticated staff member with ordinary read access, restricted to their own role and Spaces. A follow-up may refer only to records still accessible to that same actor.

**What it is / how it functions.**

Interpret natural variants and combinations of due leases, own/other assignments, blockers, approvals, connections, freshness, recorded communication, process/work status and source-backed policy. Keep session-local selected IDs, filters, and references for follow-ups such as “only mine,” “next month,” and “why the second one?” Re-read current state before a changed answer; invalidate context on actor/Space change. Return a short answer, exact count/scope, linked record list and relevant as-of/partial evidence. Resolve people via accessible identifiers, not guessed names. Display the interpreted America/Chicago date range and the exact date field; ask once only when “due” or a person reference materially changes the answer. Do not auto-start a process from a query.

**In scope / out of scope.**

The existing Dashboard and retained route, including real server/model/data path. No second chatbot, hard-coded phrase-only pass, general inbox search, task creation, approval, provider write, or send. S94's old task-action proposal is separate, remains unimplemented, and is not a dependency of these read answers. S95's unrelated minimal-home relocation is not implied by this request.

**Open questions & assumptions.**

No owner clarification blocks intake. The application uses the Kansas City business calendar; the meaning of “due” varies by field, so the assistant must show its selected field/range or ask rather than invent a deadline. Durable transcript retention is not requested; use session-local context and existing privacy boundaries.

**Cross-product impacts.**

`AskForm`, Console routes, assistant query envelope, shared retrieval from S137, model narration from S136, record-link rendering, role/Space tests and accessibility behavior.

**Authority and evidence map.**

| Input                               | Classification             | Use and limitation                                                           |
| ----------------------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| S110 code/tests and serving release | Verified baseline          | Three bounded intents and current form; no multi-turn evidence.              |
| Source item 005                     | Owner intent               | Required question families, follow-ups, direct answers and no query effects. |
| Current records and source health   | Runtime evidence to obtain | Required for live answer parity; documentation alone is insufficient.        |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S138-1** — Dashboard conversation binds session-local references to the actor and current data reads; follow-up, access-change and stale-response fixtures fail against the one-question form.
- **ARCH-S138-2** — Server-derived filters, ranges, counts, coverage and validated record links drive answers; no model-authored record ID or implicit process-run dispatch.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S138-1** — Variants and combined questions across leases, work, approvals, connections, freshness and communications return direct linked facts or precise partial states, without KB-only refusal.
- **BEH-S138-2** — “Only mine,” “now next month,” and “the second one” preserve relevant context while refreshing facts; ambiguous due-field/person references prompt one focused clarification.

**Human litmus outcome.**

### Ask and follow up on current operations

**If this was built correctly:** Staff ask about next week's work, narrow the answer, open a record and see the same facts there; an unavailable source is named briefly. Record model verdict; absent an observer use `Human verdict: NOT RUN — no human observer`.

**Requirement-to-outcome traceability.**

| Requirement               | Architecture outcome | Behavior outcome | Human litmus                            | Falsification                                                  |
| ------------------------- | -------------------- | ---------------- | --------------------------------------- | -------------------------------------------------------------- |
| Broad grounded questions  | ARCH-S138-2          | BEH-S138-1       | Ask and follow up on current operations | Alternate phrasing and owning-record parity.                   |
| Context, dates and access | ARCH-S138-1          | BEH-S138-2       | Ask and follow up on current operations | Multi-turn, timezone, ambiguous names, and actor-switch cases. |

**Preservation set.**

S110's three queries, KB answers, record authorization, existing explicit process actions on their owning surfaces, and no autonomous effect stay green.

**Adversarial acceptance checks.**

- **AC-S138-1** — The supplied question families and paraphrases work through the actual Dashboard/backend, with counts and IDs matching source records.
- **AC-S138-2** — Combined filters/follow-ups survive an ordinary conversation, re-read changing records, and do not expose another actor's data.
- **AC-S138-3** — Business-date, ambiguous-person, true-empty, multi-page, and partial-source cases remain truthful; asking never starts a run or writes.

**Forbidden actions / hard gates.**

No model-triggered task, approval, process run, source update, stateful provider GET, general inbox access, or client send. Keep existing read scoping and no invented policy.

**Dependencies / sequencing.**

Intake order 005. Consumes S135/S137 and compatible S136 model support; S141 validates the integrated result. Supersedes the overlapping S93 conversation plan and the old closed-intent expansion, not S94 action work or S95 relocation.

**Standalone delivery contract.**

Deliver the conversational Dashboard over the available shared context, with precise partial states for unavailable sources. No extra approval or S94 action implementation is part of this outcome.

**Verification and delivery contract.**

Fail-first alternative phrasing, combined filters, dates, follow-ups, multi-page counts, role/Space and no-effect tests; focused/canonical and authorized served-browser checks before any implementation completion claim.

**Ordered prompt sequence.**

1. Recheck the serving UI/backend and current source availability.
2. Record fail-first conversation, access and date cases plus preservation baseline.
3. Implement the read-only conversational path and links over S137.
4. Verify real path and exact records, then report implemented versus live-verified scope.

**Deletion/merge recommendation.**

Retire only once shipped tests and present facts own the conversation and its remaining limits.
