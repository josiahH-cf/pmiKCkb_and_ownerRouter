<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S199 — Continuous PMI knowledge and operational conversations

> Intake: READY, 2026-10-09, intake 071. Finalized specification; implementation, live verification and delivery have not run. Registration alone grants no execution authority.

**Goal.**

A staff member continues one coherent PMI conversation across questions, navigation and reload, retaining the relevant answers, records and settled intent.

**Current state / intended end state.**

S138/S146 and deployed S148 already provide ordered turns, operational follow-ups, private durable history and model-free reopening. The inspected `AskForm.tsx` initializes a new active conversation on mount; the interpreter's model context uses the last three question texts and executed plans, while the operational context has a separate bounded turn window. Those mechanisms do not establish continuity of full answer meaning or automatic active-thread restoration. End state: the same authorized user's active conversation resumes from durable state and its later answers use relevant prior answers, referenced records and settled decisions, including a switch between knowledge and operational topics.

**Actors and entry conditions.**

Existing signed-in managed staff within current application/Space access. The server resolves ownership and record access. Verification accounts retain their existing visibly unsaved mode. A missing or failed history read must not expose another user or silently claim a fresh empty history.

**What it is / how it functions.**

1. **R-S199-1: One continuous thread.** Knowledge and operational turns share stable conversation and turn identities, original order and per-turn state. Changing topic does not discard the thread or create a process. An explicit New conversation action starts an independent thread; returning to an earlier thread continues that thread.

2. **R-S199-2: Restore the active conversation.** Remember the user's active thread durably and restore it after in-app navigation, reload and a later authenticated visit. Do not rerun inference or execute an action during restore. An unavailable/deleted/inaccessible pointer yields a clear recovery choice and accessible history, never another user's thread.

3. **R-S199-3: Use relevant answer meaning and settled intent.** Build permitted follow-up context from prior questions, displayed answers, record references, resolved dates/filters and explicit corrections or decisions. Preserve material older intent when it remains relevant; do not rely on only the last three questions. Context may be bounded or summarized, but must retain source lineage, contradictory corrections and relevant older records, and must not invent a decision or treat an old source value as current.

4. **R-S199-4: Truthful failures and concurrent continuation.** Reuse idempotent turn saving and lifecycle states. A failed save stays visibly unsaved and retries the same displayed result without inference; interrupted generation remains interrupted. Concurrent sessions and late completions cannot overwrite another accepted turn or silently switch a currently selected thread.

5. **R-S199-5: Private permitted context only.** Enforce current ownership and record access when restoring, assembling context and saving. Preserve S182's exclusion of Dotloop API-derived content and transformations from every AI sink, history and reuse path; unknown provenance is excluded. Independent permitted PMI facts remain available. Changing accounts clears client state.

**In scope / out of scope.**

In scope: continuation, active-thread restoration, mixed knowledge/operational turns, relevant semantic context and compatible recovery. Out of scope: team transcript sharing, a second history store, unlimited model context, automatic operational effects, retention changes and recovering never-saved answers.

**Open questions & assumptions.**

No material product decision remains. Exact bounded context representation is an implementation choice subject to the answer-dependent and correction tests above; a fixed count alone cannot satisfy semantic continuity. Existing unsaved verification modes are preserved.

**Cross-product impacts.**

`components/ask/AskForm.tsx`; `lib/assistant/conversation.ts`, `conversation-plan.ts`, `interpret.ts`; knowledge-answer fallback; `lib/assistant-history/`; existing server history stores/routes; S182 provenance and S200 thread pins. Reuse actual boundaries after re-verifying current code.

**Authority and evidence map.**

| Input                                                         | Classification                   | Use and limitation                                                                                                                                                                                                                     |
| ------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, current code/tests and serving readback          | Authority / implementation truth | Existing identity, Space, provider and exact-operation boundaries apply. Starting reference for this batch: WSL main `43bad3ad`, serving `337ac163` on 2026-10-08; recheck before implementation. A reference is not fresh live proof. |
| S138/S146/S148 and inspected assistant/history source         | Project evidence                 | Establishes existing durable turns and bounded question-focused follow-up context, not complete active-thread continuity.                                                                                                              |
| Owner's 2026-10-09 clarification and accepted recommendations | Confirmed desired behavior       | Continue real knowledge and operational conversations with full relevant meaning rather than isolated questions.                                                                                                                       |
| Current record permissions and source availability            | Runtime dependency               | Resolve against current server authority; historical answers and saved references never grant access or effect authority.                                                                                                              |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S199-1** — The existing conversation/history boundary persists both answer families with one thread identity. A mixed knowledge/operations/reply fixture must fail if either fallback escapes the thread or replaces earlier turns.
- **ARCH-S199-2** — Owner-scoped active-thread selection is resolved and versioned through the existing server history boundary, without browser-only durability or mount submission. Navigation/reload and stale-pointer tests must fail against the fresh-empty initialization.
- **ARCH-S199-3** — Server-assembled follow-up context rechecks access and retains evidence-backed semantic state within the existing assistant pipeline. An instrumented answer-dependent follow-up more than three turns later must fail against question-only truncation; inspect the actual prompt/context rather than only final wording.
- **ARCH-S199-4** — Existing per-operation append/replay and optimistic-concurrency contracts extend to active selection and mixed turns. Duplicate, late-result and two-session fixtures fail against whole-thread replacement or stale-pointer overwrite.
- **ARCH-S199-5** — The existing history/operational boundaries apply actor and provenance checks before retrieval, prompt construction and persistence. Cross-user, revoked-access and Dotloop-sentinel fixtures must fail if continuity bypasses them.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S199-1** — A user asks a policy question, checks related lease facts and follows up on the earlier answer in the same visible ordered conversation; New conversation leaves the previous thread available.
- **BEH-S199-2** — Returning to the Dashboard restores the selected thread with original answers and as-of labels; a failed restore is shown as failed with retry, and retry loads stored results only.
- **BEH-S199-3** — After several intervening turns, the user can refer to a prior answer or selected lease without restating it. Their latest explicit correction supersedes earlier intent; genuine ambiguous references receive one focused question.
- **BEH-S199-4** — A user can retry saving a visible result and continue after an interrupted turn without duplicating the answer, losing newer work or being moved unexpectedly to a stale thread.
- **BEH-S199-5** — A user resumes their own permitted conversation; another user and revoked record details remain unavailable. Excluded provider content cannot be recalled through old turns or summaries.

**Human litmus outcome.**

### Return to the conversation and keep going

**If this was built correctly:** A staff member discusses a policy, checks leases, leaves the Dashboard and returns. The conversation is still open. They refer to an earlier answer after several turns and the assistant understands the relevant record and their latest correction without rerunning old questions.

- Model verdict: LOCAL EVIDENCE — implementation and mapped engineering checks are recorded per requirement in `docs/evidence/operations-communications-maintenance-2026-10.json`; the complete local canonical gate and core E2E passed in their recorded scopes; exact-main CI and runtime/delivery remain separately verified gates. No live provider effect or human observation is claimed.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                              | Architecture outcome | Behavior outcome | Human litmus                              | Deterministic evidence / falsification                                                                                                                                                                                                                                   |
| -------------------------------------------------------- | -------------------- | ---------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-S199-1: One continuous thread                          | ARCH-S199-1          | BEH-S199-1       | Return to the conversation and keep going | AC-S199-1: Exercise mixed knowledge/operational turns, explicit new-thread creation and reopening. Assert stable identity, answer order and no dropped fallback answer.                                                                                                  |
| R-S199-2: Restore the active conversation                | ARCH-S199-2          | BEH-S199-2       | Return to the conversation and keep going | AC-S199-2: Navigate away and back, reload, sign out/in and use a second session. Count zero inference/provider-effect requests on restore; cover stale pointer, read failure and account switch.                                                                         |
| R-S199-3: Use relevant answer meaning and settled intent | ARCH-S199-3          | BEH-S199-3       | Return to the conversation and keep going | AC-S199-3: Use an early answer containing a distinguishing record, four intervening turns, an answer-dependent reference and a later correction. Assert actual context contains the permitted meaning and newest correction, without treating historical facts as fresh. |
| R-S199-4: Truthful failures and concurrent continuation  | ARCH-S199-4          | BEH-S199-4       | Return to the conversation and keep going | AC-S199-4: Inject failed save, duplicate delivery, lost response, concurrent append/selection and late completion; assert honest states, stable ordering and no new inference on save retry.                                                                             |
| R-S199-5: Private permitted context only                 | ARCH-S199-5          | BEH-S199-5       | Return to the conversation and keep going | AC-S199-5: Probe guessed thread IDs, account switch, access revocation, mixed-source equal values and transformed Dotloop sentinels at actual prompt/history/reuse sinks; retain independent-source facts.                                                               |

**Preservation set.**

S148 owner isolation, idempotent saves, dated historical answers and model-free reopen; S149/S150 existing saved-question behavior; current source freshness/coverage, Space restrictions and verification-account effect freedom; S182 source exclusion; explicit operational admission.

**Adversarial acceptance checks.**

- **AC-S199-1** — Exercise mixed knowledge/operational turns, explicit new-thread creation and reopening. Assert stable identity, answer order and no dropped fallback answer. This falsifies ARCH-S199-1 / BEH-S199-1 and the named human litmus.
- **AC-S199-2** — Navigate away and back, reload, sign out/in and use a second session. Count zero inference/provider-effect requests on restore; cover stale pointer, read failure and account switch. This falsifies ARCH-S199-2 / BEH-S199-2 and the named human litmus.
- **AC-S199-3** — Use an early answer containing a distinguishing record, four intervening turns, an answer-dependent reference and a later correction. Assert actual context contains the permitted meaning and newest correction, without treating historical facts as fresh. This falsifies ARCH-S199-3 / BEH-S199-3 and the named human litmus.
- **AC-S199-4** — Inject failed save, duplicate delivery, lost response, concurrent append/selection and late completion; assert honest states, stable ordering and no new inference on save retry. This falsifies ARCH-S199-4 / BEH-S199-4 and the named human litmus.
- **AC-S199-5** — Probe guessed thread IDs, account switch, access revocation, mixed-source equal values and transformed Dotloop sentinels at actual prompt/history/reuse sinks; retain independent-source facts. This falsifies ARCH-S199-5 / BEH-S199-5 and the named human litmus.

**Forbidden actions / hard gates.**

No inferred access grants, cross-user transcripts, hidden reasoning or credentials in history, silent expiry, automatic re-asking on mount, or Dotloop-origin AI inputs. Continuity never approves terms/documents, sends, signs or opens action keys. New actions remain subject to S183/S184 and the concrete operation contract.

**Dependencies / sequencing.**

Extends deployed S138/S146/S148 rather than reviving their historical blockers. S182 supplies the source-origin boundary. S200 consumes stable threads; S202 consumes relevant context. S201 shares lease sets, not private transcripts.

**Standalone delivery contract.**

- **Deliverable now:** Complete continuous-thread and restoration behavior with context, ownership, lifecycle and compiled-browser verification.
- **Consumes, but does not assume:** Existing private history and permitted source projections; failed or unavailable storage stays visibly unsaved/unrestored.
- **Externally blocked effect:** None for deterministic application delivery. Provider writes/sends or live proofs are outside this suite and require their separate exact contracts.
- **Produces for downstream suites:** Stable continuing thread identities and permitted semantic context for S200/S202.

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
