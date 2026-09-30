<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: connected-ai-batch-002 -->

# S135 — Operational Dashboard answers without extra AI read gates

> Intake: ready, batch 002 item 002. Scope only; implementation and release require a later explicit instruction.

**Goal.**

A signed-in staff member can get an answer from operational records they may already read, without an approved KB article or a second AI-specific permission.

**Current state / intended end state.**

At main `41ad65cb`, the Dashboard `AskForm` calls `/api/assistant/query` first. Its closed S110 matcher answers three read intents; unsupported questions fall through to `/api/ask`, whose KB grounding can return `No Reliable Source Found`. The route uses the ordinary `read` capability, so the reported blanket refusal is plausible for unsupported operational questions, but its exact production cause has not been reproduced. Trace a real failing question before assigning cause. Keep genuine record/Space boundaries and honest missing-source states; remove discretionary document-only or AI-only barriers.

**Actors and entry conditions.**

Authenticated staff, with server-resolved role and Space access; only records available to that actor may answer. No model-supplied role or user identity.

**What it is / how it functions.**

Route operational questions to applicable actor-scoped application reads before KB-only fallback. Distinguish unsupported coverage, inaccessible records, empty results, and failed or stale sources. Return the supported portion of a mixed question with a short limitation. Ask only for ambiguity that changes the answer. Remove stale prompts, flags, copy, and tests that impose an extra approval for ordinary permitted reads.

**In scope / out of scope.**

This suite corrects the refusal and access-routing boundary. S137 supplies broad shared retrieval and S138 supplies conversation and the full question set. It does not grant Admin visibility, activate a connector or action key, create a Dashboard write, or alter draft editing in S139.

**Open questions & assumptions.**

No scope question blocks intake. The user's refusal text is a report, not a verified production trace. Capture the actual request path during implementation; if its cause differs from this code path, fix the observed cause and preserve the same acceptance result.

**Cross-product impacts.**

Dashboard and retained `/ask` route, assistant/Ask services, role and Space read scoping, KB source-state behavior, and associated tests/copy.

**Authority and evidence map.**

| Input                                    | Classification            | Use and limitation                                                                                     |
| ---------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, current S110 code and tests | Authority / verified code | Existing read and no-effect boundaries; only three operational intents implemented.                    |
| Source item 002                          | Owner intent              | Broader useful answers and fewer discretionary read barriers; not proof of the reported failure cause. |
| Runtime question trace                   | Unverified                | Required to identify the exact original refusal mechanism.                                             |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S135-1** — An actor-scoped operational retrieval path takes precedence over document-only grounding for accessible records; a regression fails on an unsupported S110 phrasing before implementation and passes afterward.
- **ARCH-S135-2** — Ordinary read access has no additional AI-specific approval, while server role/Space filtering remains; denied-record and mixed-source fixtures prove both sides.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S135-1** — A question supported by an operational record answers without a KB citation; an unavailable second source yields a partial answer rather than a blanket refusal.
- **BEH-S135-2** — A genuine empty result, absent adapter, failed source, and denied source produce distinct truthful outcomes; no record is invented.

**Human litmus outcome.**

### Ask about current work

**If this was built correctly:** Staff ask about work they can already see and get matching records or a precise source limitation without an extra AI approval. Model verdict and human verdict are recorded during implementation; absent an observer use `Human verdict: NOT RUN — no human observer`.

**Requirement-to-outcome traceability.**

| Requirement                               | Architecture outcome | Behavior outcome | Human litmus           | Falsification                                            |
| ----------------------------------------- | -------------------- | ---------------- | ---------------------- | -------------------------------------------------------- |
| Operational facts without KB-only refusal | ARCH-S135-1          | BEH-S135-1       | Ask about current work | Unsupported S110 phrasing with an accessible app record. |
| Existing access and honest gaps           | ARCH-S135-2          | BEH-S135-2       | Ask about current work | Denied, empty, failed, and mixed-source fixtures.        |

**Preservation set.**

S110's delivered three answers, KB source-state/citation truth, ordinary role/Space checks, and no query side effects remain green.

**Adversarial acceptance checks.**

- **AC-S135-1** — An accessible operational record answers even without a matching approved KB document; trace the original failure to its actual gate or missing wiring.
- **AC-S135-2** — A failed unrelated source does not suppress supported facts, and the answer labels the failed scope.
- **AC-S135-3** — No extra AI permission, privilege widening, provider effect, or fabricated fact appears.

**Forbidden actions / hard gates.**

No role/claim change, unrestricted inbox read, autonomous process run, business write, provider activation, or client send. Preserve protected-path rules.

**Dependencies / sequencing.**

Intake order 002. S137 and S138 consume this correction but do not turn this suite into a second implementation of their retrieval or UI contracts.

**Standalone delivery contract.**

Deliver the refusal-path correction and regression independently. Broader cross-module coverage remains S137/S138; lack of an adapter is reported as such, not masked as a KB policy refusal.

**Verification and delivery contract.**

Fail-first tests on the reported path and access/mixed-source cases; focused and canonical gates, diff/PII audit, then only an explicitly authorized code release with exact serving readback. Keep implementation, deployed, and human-observed states separate.

**Ordered prompt sequence.**

1. Recheck the current code, serving revision, and an authorized failure trace.
2. Record fail-first and preservation evidence.
3. Correct the exact refusal/routing cause, preserving access and no-effect boundaries.
4. Run focused, canonical, and served checks when release is authorized; update the loop with actual outcomes.

**Deletion/merge recommendation.**

Retire this planning file only after its remaining acceptance checks are owned by shipped code/tests and current facts; Git retains intake history.
