<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: connected-ai-batch-002 -->

# S136 — Supported low-cost Gemini backend

> Intake: ready, batch 002 item 003. Scope only; no model configuration or deployment changed by intake.

**Goal.**

The actual production AI callers use the least-cost supported Google Cloud Gemini model that passes this batch's retrieval, structured-result, and draft-refinement checks.

**Current state / intended end state.**

Read-only Cloud Run configuration on 2026-09-30 reported `GEMINI_MODEL_ANSWER=gemini-2.5-flash`, `GEMINI_MODEL_CLASSIFY=gemini-2.5-flash`, and `VERTEX_AI_LOCATION=us-central1` on the 100%-traffic revision `pmi-kc-app-rmundpf2v-249c945f2220`. Committed server defaults still include 2.5 Pro/Flash and the live-cost/deploy scripts select 2.5 Flash. Google Cloud lists 2.5 Flash retirement on 2026-10-20 and `gemini-3.1-flash-lite` as a GA replacement candidate. Selection and availability for this project remain untested. The Cloud Run region does not prove the model's processing location.

**Actors and entry conditions.**

Existing managed backend identity and Google Cloud Vertex AI client; no new key, account, or per-call sign-in. Project availability, model endpoint, and actual model behavior are implementation checks.

**What it is / how it functions.**

Inventory every serving `ModelProvider` caller and selection path, including Ask, process classification, renewal copy, maintenance intake, Gmail Hub replies, and anticipatory draft/summary paths. Verify official model ID, supported endpoint and pricing at execution. Start with `gemini-3.1-flash-lite`; use it if real structured-output, needed tool-call, quality, latency, and processing-location checks pass. Align source defaults, environment examples, deployment settings, cost guard, fallback behavior, labels, and tests. Keep failures explicit and retries bounded; do not fall back to an unwanted 2.5 model.

**In scope / out of scope.**

One shared production model selection and compatible client behavior for affected AI paths. No new provider, model-management UI, billing limit, identity, or relocation of the application. This spec does not claim that existing code currently uses model tool calling.

**Open questions & assumptions.**

No owner answer is required for intake. The project documents Cloud Run in `us-central1` but contains no verified Gemini data-residency rule. During implementation, select the cheapest endpoint consistent with any actual processing-location constraint; if a new owner policy decision is truly needed, hold only that choice and continue independent compatibility work. Model availability, cost, and output quality are not verified by documentation alone.

**Cross-product impacts.**

`lib/llm/model-provider.ts`, server config, deployment/cost scripts, Admin model display, and all affected caller tests. Changes to protected `scripts/check-budget-guard.mjs` require the router's explicit owner direction before push.

**Authority and evidence map.**

| Input                                            | Classification                   | Use and limitation                                                             |
| ------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------ |
| Serving Cloud Run config and committed code      | Verified readback / code         | Current model and endpoint setting; neither proves a successful inference.     |
| Source item 003                                  | Owner intent                     | Least-cost supported successor and end-to-end migration.                       |
| Google Cloud model, lifecycle, and pricing pages | Published provider documentation | Candidate ID, lifecycle, endpoint/rate options; recheck before implementation. |

Official references: [model](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-lite), [lifecycle](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/model-versions), [pricing](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing).

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S136-1** — One explicit selected model/endpoint reaches every affected backend caller and active deployment/default/fallback path; inventory and config tests fail against the current 2.5 selections.
- **ARCH-S136-2** — The existing authorized backend identity performs a real request through the selected model, with response contracts and bounded failure handling verified.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S136-1** — Representative operational and email-refinement inputs yield valid grounded/structured results at observed latency and token usage; unsuitable behavior is reported from evidence rather than a model name.
- **BEH-S136-2** — An unavailable selected model fails visibly without hidden fallback to a retiring model, a new provider, or a higher-cost tier.

**Human litmus outcome.**

### Ask and refine after migration

**If this was built correctly:** Staff obtain the expected answer and draft revision; Admin configuration and serving readback identify the model actually used. Record model verdict; if no human observes, use `Human verdict: NOT RUN — no human observer`.

**Requirement-to-outcome traceability.**

| Requirement             | Architecture outcome | Behavior outcome | Human litmus                   | Falsification                                             |
| ----------------------- | -------------------- | ---------------- | ------------------------------ | --------------------------------------------------------- |
| Whole-backend migration | ARCH-S136-1          | BEH-S136-1       | Ask and refine after migration | Caller/default/fallback inventory and real endpoint test. |
| Honest failure/cost     | ARCH-S136-2          | BEH-S136-2       | Ask and refine after migration | Endpoint error and token/latency readback.                |

**Preservation set.**

Current structured Ask, optional model paths, existing budget controls, data scoping, and no-send boundaries stay green.

**Adversarial acceptance checks.**

- **AC-S136-1** — The backend, not just a UI label, completes a request with the chosen supported model and verified endpoint.
- **AC-S136-2** — All active model selectors/fallbacks agree; structured results and representative Dashboard/email paths pass.
- **AC-S136-3** — Outage, latency/cost, and deployment readbacks are honest; no implicit 2.5/higher-tier fallback or credential change.

**Forbidden actions / hard gates.**

No secret in Git/chat, personal identity, unapproved budget/guardrail change, provider switch, or production migration claim from a local test. Protected paths obey `AGENTS.md`.

**Dependencies / sequencing.**

Intake order 003; S137–S139 consume the selected model. Model/endpoint suitability is assessed with their representative requests, without treating this intake as execution authority.

**Standalone delivery contract.**

The model/config migration, compatibility tests, and explicit refusal path can ship independently; integrated workflow validation belongs to S141. If project availability is absent, record the exact live proof blocked while code tests continue.

**Verification and delivery contract.**

Baseline current config and caller list, fail-first selection tests, real authorized model request, focused/canonical checks, protected-path and secret audit, and exact serving config/inference readback if later release is authorized.

**Ordered prompt sequence.**

1. Recheck official model/endpoint/prices and current project policy/availability.
2. Record fail-first caller/config/response checks.
3. Migrate the shared client and all active selections together.
4. Verify model behavior and delivery gates; record the tested environment and actual limits.

**Deletion/merge recommendation.**

Retire only when current facts and tests own the final selection and its live evidence.
