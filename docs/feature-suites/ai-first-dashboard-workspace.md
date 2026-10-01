<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: ai-first-dashboard-batch-004 -->

# S146 — AI-first Dashboard conversational workspace

> Intake: ready, batch 004 item 013. Layout and submission scope over the deployed S138 assistant; implementation and release not started.

**Goal.**

The Dashboard is the front door for asking about application work: the question composer is the first primary content, each answer and follow-up appears below it in order, and nobody has to pick a process, data source or mode before asking.

**Current state / intended end state.**

Verified at `23c79dac` (serving `2ec46806`): `/` and `/ask` both render `components/console/ConsoleView.tsx`. One server `Promise.all` gathers the console projection, process definitions, decision attention and a 120-day live renewal desk before anything renders, so the composer waits on every panel read, and a console data-mode error replaces the whole page. `components/ask/AskForm.tsx` is already first, but answers render in a separate panel beside the form above 760 px. Every question goes first to `/api/assistant/query` (`app/api/assistant/query/route.ts`; strict `{question, conversation}`, no process field). Policy questions continue to `/api/ask` with an optional `process_id`. A picked process starts a run, and “Detect process with AI” calls `/api/processes/classify`. The conversation lives in page state only; a network rejection leaves the form pending with no retry. Intended end state: the composer leads the main column; turns stack below it with their own loading, partial, error and retry states; the Dashboard has no process picker, process suggestion, process detection or run start; the composer renders and accepts questions even when a panel read is slow or fails; history and saved items (S148, S149) sit in compact secondary navigation.

**Actors and entry conditions.**

Any signed-in user with the existing `read` capability, as today. Answers keep S135/S137 actor, role and Space scoping. No new sign-in, activation, acknowledgement or AI-specific approval.

**What it is / how it functions.**

Keep the application shell, navigation and both entry routes. Put a short explanation and a few existing examples above the composer. Submitting appends a turn below the composer; follow-ups continue the same S138 conversation and keep record links, interpretation lines and source or coverage notes. Each turn owns its pending, partial, failed and retry state; typed input survives a failed request and the stuck-pending defect is fixed. A new-conversation action starts a separate inquiry without discarding the persisted one; opening an older conversation (S148) restores it without resubmitting. Remove the Dashboard's process picker, “Use …” suggestions, “Detect process with AI” and run start; operational questions keep the S138 path, and policy questions keep the existing knowledge path (`app/api/ask/route.ts`) without a Dashboard-selected `process_id`, so process-backed knowledge still informs answers. Process browsing, definitions and run start stay in Internal Processes (`/spaces`, `/processes`). Remove any client or server assumption that requires a process for ordinary submission, then confirm through the real route that none remains. Nothing submits, refreshes or summarizes on mount or history navigation.

**In scope / out of scope.**

In scope: Dashboard composition order, turn layout, per-turn states, new-conversation behaviour, removal of Dashboard process selection and launch, decoupling the composer from panel reads, and responsive and keyboard behaviour at existing viewports. Out of scope: a second chatbot, a model change (S136 stays), the per-lease dashboard, the Focus view, the email draft editor, deleting processes, bottom-mounted composers, and the panel moves owned by S147.

**Open questions & assumptions.**

No intake-blocking question. Working assumption from item 013: process removal covers Dashboard selectors, launch controls and process-driven submission only; Internal Processes content and process-backed knowledge remain. Chat products are interaction references, not designs to copy. `/ask` remains an entry route to the same workspace. The examples reuse current example text rather than new marketing copy.

**Cross-product impacts.**

`ConsoleView`, `AskForm`, the S138 conversation contract, the knowledge path, S84 navigation (`lib/navigation/primary-navigation.ts`, its `ACTIVE_DASHBOARD_COMPOSITION` value and terminology tests), Dashboard smokes (`scripts/smoke-dashboard-assistant-browser.mjs`) and process-audit cases that assert the old composer. Pinned tests change only where this request changes the asserted behaviour, and each change names this suite.

**Authority and evidence map.**

| Input                                                         | Classification                | Use and limitation                                                                                      |
| ------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| Router, S138/S110 code and tests, serving revision `2ec46806` | Authority / verified baseline | Current assistant path, scopes and effects; layout is today's, not the target.                          |
| Source item 013                                               | Owner intent                  | AI-first composition and process-step removal; the reported AI completion is not a runtime observation. |
| Route request schemas and AskForm submission code             | Implementation evidence       | Proves whether any process requirement remains on the server.                                           |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S146-1** — The Dashboard renders the composer as its first primary element and streams or defers panel reads so the composer never waits on them; a render-order and slow-panel fixture fails against the current page.
- **ARCH-S146-2** — Ordinary Dashboard submission carries no process, Space or workflow selection end to end, and no process launch is reachable from the Dashboard; a request-capture fixture fails against the current picker and run start.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S146-1** — Asking shows the question and its answer below the composer; a follow-up appears below in order with its links and source notes; a failed request keeps the typed text and offers retry on that turn.
- **BEH-S146-2** — A new conversation leaves the previous one reopenable and unchanged; reopening or mounting submits nothing.

**Human litmus outcome.**

### Ask first, read the answer below

**If this was built correctly:** A staff member lands on the Dashboard, types a question straight away, reads the answer under it, asks a follow-up, and never has to choose a process. Record model verdict; without an observer use `Human verdict: NOT RUN — no human observer`.

**Requirement-to-outcome traceability.**

| Requirement                   | Architecture outcome | Behavior outcome | Human litmus                     | Falsification                                                                             |
| ----------------------------- | -------------------- | ---------------- | -------------------------------- | ----------------------------------------------------------------------------------------- |
| Composer first, answers below | ARCH-S146-1          | BEH-S146-1       | Ask first, read the answer below | Render order, slow and failed panel reads, viewport and keyboard checks.                  |
| No process step               | ARCH-S146-2          | BEH-S146-2       | Ask first, read the answer below | Captured requests through the real routes, plus a source scan for Dashboard launch paths. |

**Preservation set.**

S138 answers, follow-up scoping, record links, Chicago business dates and interpretation lines; S135/S137 access and partial-source truth; the knowledge path's sources and freshness; Internal Processes browsing and run start; the per-lease dashboard, Focus view and draft editor; and keyboard and focus behaviour.

**Adversarial acceptance checks.**

- **AC-S146-1** — The first primary element is the composer; the answer and every follow-up render below it in order, at each supported viewport.
- **AC-S146-2** — An ordinary question succeeds through the real backend contract with no process selected or sent, and the Dashboard exposes no process picker, detection or run start.
- **AC-S146-3** — A slow or failed panel read never delays or blocks asking; a failed request keeps the typed input and recovers on retry.
- **AC-S146-4** — A new conversation preserves the earlier one, and reopening it or loading the Dashboard sends no question and no model request.

**Forbidden actions / hard gates.**

No automatic submission on mount or navigation, no new approval or activation step, no model or provider change, no deletion of processes or their knowledge, and no change to per-lease, Focus or draft-editor behaviour.

**Dependencies / sequencing.**

Coordinates with S147 (panel destinations) and consumes S148 (history) and S149 (saved items) for its secondary navigation. S138 and S110 are deployed baselines, not queues. Implement S146's composition with S147 so the Dashboard is never left without a reachable destination.

**Standalone delivery contract.**

Deliver the reordered workspace, per-turn states and process-step removal with tests. Until S148 lands, describe conversation reopening as page-session only.

**Verification and delivery contract.**

Record the current render order, request shapes and pinned tests before code changes, then fail-first render-order, slow-panel, request-capture and retry tests. Run focused tests and canonical `bash scripts/verify.sh` under an authorized execution run; audit the exact diff and result evidence. Use `ALL_GATES_GREEN` for tested scope, `BLOCKED` only for a precise external input and `BUDGET_EXHAUSTED` only with an explicit budget.

**Ordered prompt sequence.**

1. Recheck the Dashboard render order, submission requests and pinned tests at the latest source and serving version.
2. Record fail-first composition, slow-panel, no-process and retry cases.
3. Rebuild the composition with the composer first and turns below, and remove the Dashboard process step.
4. Connect S147, S148 and S149 entry points; falsify regressions and report exact tested versus live scope.

**Deletion/merge recommendation.**

Retire after S151 and serving evidence show the AI-first composition and process-free submission are owned by code, tests and current facts.
