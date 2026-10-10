<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S202 — Open best-effort PMI chat and explicit staff operations

> Intake: READY, 2026-10-09, intake 074. Finalized specification; implementation, live verification and delivery have not run. Registration alone grants no execution authority.

**Goal.**

Staff receive useful best-effort answers with clear fact, inference and source boundaries, and can request supported operations through the same concrete admission contract used by normal staff controls.

**Current state / intended end state.**

The current assistant combines deterministic operational interpretation with knowledge answering, explicit source/coverage labels and bounded supported subjects. Meeting evidence shows repetitive date clarification and a desire for more useful conversation; S199 supplies continuous meaning. End state: the assistant answers broadly when useful information is available, distinguishes supported facts from inference, asks only material unresolved questions and routes explicit supported operation requests through existing staff controls/contracts. General conversation does not itself grant execution authority.

**Actors and entry conditions.**

Existing managed staff in current app/Space scope. The authenticated actual actor authorizes an operation. Source access, current freshness and concrete operation readiness apply equally to chat and ordinary controls. Verification identities retain effect refusals.

**What it is / how it functions.**

1. **R-S202-1: Answer best effort with labeled uncertainty.** Provide useful available information for PMI knowledge, operational questions and open-ended discussion rather than requiring every question to fit a rigid supported-query shape. Distinguish verified source facts, historical facts, inference/recommendation and unknowns in the answer. Unavailable sources limit the relevant claim, not every useful answer. Never fabricate a record, citation or provider capability.

2. **R-S202-2: Use context and ask only material questions.** Use the explicit wording, current accessible context and S199's settled dates/intent before asking again. If a safe ordinary interpretation allows a useful answer, disclose that interpretation and proceed. Ask a focused question when plausible meanings materially change the target, data semantics, permissions, effect or correctness. A factual value needed for an operation cannot be invented or supplied by acceptance of an unrelated recommendation.

3. **R-S202-3: Show concise source and certainty context.** Include a compact, readable footer or equivalent consistent answer context naming relevant sources, answer/as-of time, material coverage gaps and fact/inference status. Keep citations or record links close to the claim where useful. Stored answers retain their historical date and labels; refreshing is an explicit new answer. Do not expose internal prompts, hidden reasoning or excluded data as explanation.

4. **R-S202-4: Admit explicit operations as the actual staff actor.** When a user explicitly requests a supported operation, resolve and present its exact target, inputs and consequences through the same normal staff operation contract reconciled by S183/S184. Chat may prepare or navigate to the actual control and collect required intent, but execution uses the concrete server capability, current state, required preview/confirmation, bounded durable claim, receipt/readback and correction rules. Existing no-confirmation app-owned operations may keep their normal contract; chat adds no blanket Admin or autonomous-approval requirement and no provider exemption.

5. **R-S202-5: Preserve origin, privacy and effect limits.** Apply S182's complete Dotloop API-origin exclusion before every model, retrieval/history save/reuse, cache and AI telemetry/training sink. Keep independently sourced PMI facts and private history available. An explicit request cannot bypass closed keys, missing provider contracts, identity/Space scope or the separate authority rules in S183/S184. A model may not invent approval, signatures, receipts or an unattended plan.

**In scope / out of scope.**

In scope: best-effort composition, practical clarification, source/uncertainty context and explicit supported-operation routing under current normal staff contracts. Out of scope: new provider methods, arbitrary tool execution, autonomous operation planning, new model/provider/budget choices, public chat sharing or changing the S182 exclusion.

**Open questions & assumptions.**

No product decision remains for chat behavior. Exact operation availability follows S183/S184 and each owning suite; this spec does not infer a send, permission or provider grant. Unknown factual operation inputs remain exact localized holds.

**Cross-product impacts.**

Existing assistant/knowledge routing, operational interpretation, answer and stored-answer rendering; S199 semantic continuity; S183/S184 staff-operation governance; S182 origin enforcement and current operational capability checks.

**Authority and evidence map.**

| Input                                                                                | Classification                   | Use and limitation                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, current code/tests and serving readback                                 | Authority / implementation truth | Existing identity, Space, provider and exact-operation boundaries apply. Starting reference for this batch: WSL main `43bad3ad`, serving `337ac163` on 2026-10-08; recheck before implementation. A reference is not fresh live proof. |
| Meeting transcript 00:48:31–00:50:11 and existing assistant/knowledge/history source | Project evidence                 | Supports fewer unnecessary clarifications and useful source-backed replies; transcript suggestions alone never establish provider or execution authority.                                                                              |
| Owner's 2026-10-09 clarification and accepted recommendations                        | Confirmed desired behavior       | Open best-effort conversation, clear fact/inference/source context and explicit staff-requested supported operations using the normal action contract.                                                                                 |
| Current record permissions and source availability                                   | Runtime dependency               | Resolve against current server authority; historical answers and saved references never grant access or effect authority.                                                                                                              |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S202-1** — The existing assistant/knowledge pipeline supports best-effort composition with structured provenance/coverage metadata and clear unsupported claims. Deterministic routing and source-sentinel fixtures fail against either blanket refusal or unlabeled invented facts.
- **ARCH-S202-2** — Interpretation and clarification use permitted semantic context and distinguish answer assumptions from effect admission inputs. Answerable-date and ambiguous-target fixtures fail against repetitive questioning or guessed effect targets.
- **ARCH-S202-3** — Answer metadata survives rendering and private-history save/reopen through the existing stored-answer contract. Mixed certainty and historical restore fixtures fail if the footer disappears or implies current verification.
- **ARCH-S202-4** — An operation request references an allowlisted existing staff operation and the real actor, with server admission independent of model text. Deterministic route/store tests fail against either blanket AI-operation refusal for an otherwise permitted explicit request or direct unconfirmed model dispatch.
- **ARCH-S202-5** — Provenance and exact operation gates remain outside model discretion at actual input/persistence/dispatch boundaries. Dotloop, prompt-injection and closed-key fixtures fail if best-effort chat or explicit intent bypasses them.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S202-1** — A staff member gets a useful answer to an open question; sourced statements and assumptions are recognizable, and missing data is stated precisely.
- **BEH-S202-2** — The assistant does not repeatedly ask a date already settled; it explains a reasonable read-only interpretation and answers. It pauses a consequential action only for the exact unresolved input.
- **BEH-S202-3** — A user can tell what an answer relies on, what is inferred and how current it is without reading implementation detail; reopened history remains visibly historical.
- **BEH-S202-4** — A staff member asks for a supported change, reviews the exact normal preview and confirms it where required; the app reports the real result. A read, suggestion, old request or model continuation does not execute it.
- **BEH-S202-5** — Permitted PMI chat continues when Dotloop content is excluded; a blocked operation names its actual missing prerequisite and other useful discussion remains available.

**Human litmus outcome.**

### Get an answer and carry out an explicit supported request

**If this was built correctly:** A staff member asks an imperfect question and gets the useful part answered with sources and uncertainty visible. A date already agreed is not requested again. When they explicitly ask for a supported change, they use the same exact review and confirmation they would see from the normal control, then see an honest result or precise hold.

- Model verdict: LOCAL EVIDENCE — implementation and mapped engineering checks are recorded per requirement in `docs/evidence/operations-communications-maintenance-2026-10.json`; the complete local canonical gate and core E2E passed in their recorded scopes; exact-main CI and runtime/delivery remain separately verified gates. No live provider effect or human observation is claimed.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                                   | Architecture outcome | Behavior outcome | Human litmus                                              | Deterministic evidence / falsification                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------- | -------------------- | ---------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S202-1: Answer best effort with labeled uncertainty         | ARCH-S202-1          | BEH-S202-1       | Get an answer and carry out an explicit supported request | AC-S202-1: Exercise supported facts, mixed knowledge/operations, open discussion and partial/unavailable sources. Inspect source support for factual claims and labels for inference; unsupported provider claims cannot pass.                                                            |
| R-S202-2: Use context and ask only material questions         | ARCH-S202-2          | BEH-S202-2       | Get an answer and carry out an explicit supported request | AC-S202-2: Test explicit dates, prior settled dates, ordinary relative dates, multiple plausible leases and a missing required operation value. Assert useful answer vs one material clarification and zero guessed targets.                                                              |
| R-S202-3: Show concise source and certainty context           | ARCH-S202-3          | BEH-S202-3       | Get an answer and carry out an explicit supported request | AC-S202-3: Render/save/reopen mixed fact/inference and degraded-source answers; assert consistent source/as-of/coverage context, accurate links and no hidden/excluded content.                                                                                                           |
| R-S202-4: Admit explicit operations as the actual staff actor | ARCH-S202-4          | BEH-S202-4       | Get an answer and carry out an explicit supported request | AC-S202-4: Compare the same operation through normal UI and chat for allowed staff, denied scope, missing input, stale preview, duplicate confirmation, ambiguous response and readback. Assert equivalent admission and actual actor; no effect before the concrete contract permits it. |
| R-S202-5: Preserve origin, privacy and effect limits          | ARCH-S202-5          | BEH-S202-5       | Get an answer and carry out an explicit supported request | AC-S202-5: Instrument transformed/mixed/unknown-lineage Dotloop content, malicious retrieved instructions, cross-user history, closed action keys and unrequested follow-on effects. Assert exclusion/refusal while preserving independent facts.                                         |

**Preservation set.**

Source-backed knowledge and scoped operational reads; private durable history; verification effect refusals; S182 exclusions; exact operation preview/confirmation, idempotency/claim, receipt/readback and correction. Preserve general answer availability when one effect is held.

**Adversarial acceptance checks.**

- **AC-S202-1** — Exercise supported facts, mixed knowledge/operations, open discussion and partial/unavailable sources. Inspect source support for factual claims and labels for inference; unsupported provider claims cannot pass. This falsifies ARCH-S202-1 / BEH-S202-1 and the named human litmus.
- **AC-S202-2** — Test explicit dates, prior settled dates, ordinary relative dates, multiple plausible leases and a missing required operation value. Assert useful answer vs one material clarification and zero guessed targets. This falsifies ARCH-S202-2 / BEH-S202-2 and the named human litmus.
- **AC-S202-3** — Render/save/reopen mixed fact/inference and degraded-source answers; assert consistent source/as-of/coverage context, accurate links and no hidden/excluded content. This falsifies ARCH-S202-3 / BEH-S202-3 and the named human litmus.
- **AC-S202-4** — Compare the same operation through normal UI and chat for allowed staff, denied scope, missing input, stale preview, duplicate confirmation, ambiguous response and readback. Assert equivalent admission and actual actor; no effect before the concrete contract permits it. This falsifies ARCH-S202-4 / BEH-S202-4 and the named human litmus.
- **AC-S202-5** — Instrument transformed/mixed/unknown-lineage Dotloop content, malicious retrieved instructions, cross-user history, closed action keys and unrequested follow-on effects. Assert exclusion/refusal while preserving independent facts. This falsifies ARCH-S202-5 / BEH-S202-5 and the named human litmus.

**Forbidden actions / hard gates.**

No model-created grants, guessed record targets/values, hidden reasoning persistence, Dotloop API-derived AI content, autonomous follow-on effects, invented provider receipts or signatures. Sends and other separately governed effects require S183/S184 and their exact owning operation contract; this spec itself grants none.

**Dependencies / sequencing.**

S199 supplies continuous context; S182 defines origin exclusion. S183/S184 own reconciled governance and ordinary staff operations. Existing per-operation suites retain their data and execution contracts.

**Standalone delivery contract.**

- **Deliverable now:** Best-effort answers, concise evidence context, material clarification and safe explicit-operation routing with deterministic boundary tests.
- **Consumes, but does not assume:** Permitted source context and supported server-owned staff capabilities; unavailable operations remain scoped unavailable and do not suppress other useful answers.
- **Externally blocked effect:** Any operation missing its exact required input, connection, authority/key or provider contract stays blocked at admission; answer/routing implementation proceeds independently.
- **Produces for downstream suites:** Useful labeled conversations and explicit request handoffs to concrete normal staff operations, without blanket AI autonomy.

**Verification and delivery contract.**

1. Before implementation edits, recheck the current source and serving readback; record the preservation baseline and the named architecture/behavior cases failing for the expected missing behavior. Historical specification prose is not the current baseline.
2. Exercise every traceability and adversarial row through the actual server, store and rendered controls where applicable; use deterministic adapters and the Firestore emulator for isolation, concurrency and failure cases. Keep preservation results separate.
3. Under a separately authorized implementation run, run focused checks and `bash scripts/verify.sh`; review the mechanical diff, source lineage, privacy, action admission and runtime configuration before authorized delivery. No live customer effect is required to prove this suite.
4. Report `ALL_GATES_GREEN` only for the fully verified implementation scope; use `BLOCKED` for an exact unavailable input after independent work is complete, and `BUDGET_EXHAUSTED` only when an explicit budget exists. Authoring this READY spec is neither execution authorization nor an implementation verdict.

**Ordered prompt sequence.**

1. Re-verify the source, serving state and existing authority contract.
2. Materialize each architecture/behavior falsification, the named human litmus and preservation baseline before implementation edits.
3. Implement the bounded slice and its recovery/refusal paths through existing boundaries.
4. Exercise every acceptance row, run focused and canonical checks, report exact evidence and deliver only under a separate authorized implementation run.

**Deletion/merge recommendation.**

Retire or merge only after code, tests and current facts own every requirement and preservation check, with actual delivery evidence. Do not retire because a related suite is deployed or the spec is registered.
