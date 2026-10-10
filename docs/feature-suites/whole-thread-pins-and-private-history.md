<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S200 — Whole-thread pins and private conversation history

> Intake: READY, 2026-10-09, intake 072. Finalized specification; implementation, live verification and delivery have not run. Registration alone grants no execution authority.

**Goal.**

A user can pin and return to an entire continuing conversation while keeping all conversation history private to that user.

**Current state / intended end state.**

Deployed S148 stores private conversations; S149 pins individual saved questions and S150 can rerun their saved plans. `assistant-saved-questions.ts` identifies one item per user and turn. The requested outcome is a thread pin, which is not established by pinning one question. End state: thread pins open the whole continuing conversation without replaying inference, alongside preserved existing saved-question functionality.

**Actors and entry conditions.**

The authenticated thread owner. Ownership comes from the server session; pins confer no record access. Existing verification accounts remain unsaved and cannot gain persistent history or pin effects through this feature.

**What it is / how it functions.**

1. **R-S200-1: Pin the whole continuing thread.** Offer pin/unpin for a conversation, identifying its stable thread rather than one turn. A pin opens the full ordered conversation, including later appended turns; it is not a frozen answer or a saved query. Present pinned whole threads above unpinned history in the Dashboard/history workspace, or in an equivalent always-visible top pinned section, with enough title/excerpt and time to distinguish them.

2. **R-S200-2: Unpin without losing history.** Unpin removes only the shortcut. It neither deletes the conversation nor changes saved questions, recorded answers, active work or retention. Existing question pins remain usable with clear differentiation from conversation pins.

3. **R-S200-3: Reach all own history with honest states.** Keep paged private history available, distinguish empty history from load failure, and support retry without inference. Opening history or a pin only reads stored answers; requesting a current answer is an explicit new turn under the existing rerun behavior.

4. **R-S200-4: Isolate users and protect current access.** A thread or pin is private to its owner and does not become shared through a lease collection. Recheck current record access and S182 provenance on open/reuse. Account switches clear client caches. Guessed identifiers, stale cache or a pin to a newly inaccessible source cannot reveal protected content.

5. **R-S200-5: Retry and reconcile pin changes.** Pin/unpin is idempotent for the same desired state and uses the existing version-conflict pattern. A lost response or two-session conflict shows read-back current state and does not erase newer changes or create duplicate shortcuts.

**In scope / out of scope.**

In scope: private whole-thread pin controls, listing/opening, pagination and failure/concurrency handling compatible with deployed history. Out of scope: team transcript search/sharing, folders, export, deleting history, retention changes and replacing existing saved questions.

**Open questions & assumptions.**

No material product question remains. Labels and exact layout follow current UI conventions; they must clearly distinguish conversation pins from saved-question pins. No automatic conversion of existing question pins is required.

**Cross-product impacts.**

Existing Dashboard history and saved-item controls; `lib/assistant-history/`; server history/pin routes and stores; S199 thread continuity; S201 shared lease collections. No second history system or global identity change.

**Authority and evidence map.**

| Input                                                         | Classification                   | Use and limitation                                                                                                                                                                                                                     |
| ------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, current code/tests and serving readback          | Authority / implementation truth | Existing identity, Space, provider and exact-operation boundaries apply. Starting reference for this batch: WSL main `43bad3ad`, serving `337ac163` on 2026-10-08; recheck before implementation. A reference is not fresh live proof. |
| S148–S150 and `lib/firestore/assistant-saved-questions.ts`    | Project evidence                 | Existing history and saved questions are deployed; their per-turn pins do not establish whole-thread pins.                                                                                                                             |
| Owner's 2026-10-09 clarification and accepted recommendations | Confirmed desired behavior       | Whole conversations can be pinned; conversation history remains private.                                                                                                                                                               |
| Current record permissions and source availability            | Runtime dependency               | Resolve against current server authority; historical answers and saved references never grant access or effect authority.                                                                                                              |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S200-1** — Owner-scoped thread references extend the existing history boundary separately from saved-question turn IDs. A pin/open/append fixture fails if it restores just the pinned question or forks a snapshot; a rendered placement check requires a top pinned-thread section before unpinned history with accessible controls.
- **ARCH-S200-2** — Thread-pin mutation and versioning are independent of turn content and saved-question data. Unpin and legacy-item fixtures fail if either history or saved questions are removed or reinterpreted.
- **ARCH-S200-3** — Pinned and ordinary history listings use owner-scoped server reads, reachable pagination and explicit load states; reopening does not invoke the answer or action path. Older-page and failed-read fixtures must fail against truncation/empty-on-error.
- **ARCH-S200-4** — All pin writes and pin/history reads enforce server session ownership and source-access/provenance filtering. Cross-account and revoked-access fixtures fail against client-only hiding.
- **ARCH-S200-5** — Durable versioned thread-pin state handles repeated desired-state mutations, stale versions and reconciliation. Duplicate and concurrent fixtures fail against blind overwrite.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S200-1** — Pinning a conversation places it at the top of the Dashboard/history workspace; after more turns, opening the pin shows the same complete updated thread with original answer times.
- **BEH-S200-2** — After unpinning, the conversation remains findable in history and its saved questions still work exactly as before.
- **BEH-S200-3** — A user reaches an older unpinned conversation, sees dated stored answers and retries a failed list/open without accidentally asking again.
- **BEH-S200-4** — Another staff member cannot read a colleague's pinned conversation; a lease collection may be shared without exposing the chat that created it.
- **BEH-S200-5** — A failed or conflicting pin change is reported accurately; retrying the same change or loading the latest state yields one truthful shortcut.

**Human litmus outcome.**

### Pin the conversation and return later

**If this was built correctly:** A user pins an ongoing discussion, adds more questions and returns another day. One shortcut opens the complete discussion. Unpinning leaves it in their private history. A colleague sees a shared lease collection without seeing the user's conversation.

- Model verdict: LOCAL EVIDENCE — implementation and mapped engineering checks are recorded per requirement in `docs/evidence/operations-communications-maintenance-2026-10.json`; the complete local canonical gate and core E2E passed in their recorded scopes; exact-main CI and runtime/delivery remain separately verified gates. No live provider effect or human observation is claimed.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                        | Architecture outcome | Behavior outcome | Human litmus                          | Deterministic evidence / falsification                                                                                                                                                                        |
| -------------------------------------------------- | -------------------- | ---------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S200-1: Pin the whole continuing thread          | ARCH-S200-1          | BEH-S200-1       | Pin the conversation and return later | AC-S200-1: Pin a multi-turn thread, append later turns, navigate/reload and open its pin. Assert one thread, all accepted turns, visible historical times and zero model calls.                               |
| R-S200-2: Unpin without losing history             | ARCH-S200-2          | BEH-S200-2       | Pin the conversation and return later | AC-S200-2: Snapshot thread/turn and saved-question identities before pin/unpin; assert only pin state changes, and reopen both through their normal controls.                                                 |
| R-S200-3: Reach all own history with honest states | ARCH-S200-3          | BEH-S200-3       | Pin the conversation and return later | AC-S200-3: Populate more than one history page, reach the oldest thread, inject list/open failure and retry; count zero inference and operational dispatches.                                                 |
| R-S200-4: Isolate users and protect current access | ARCH-S200-4          | BEH-S200-4       | Pin the conversation and return later | AC-S200-4: Exercise direct route/store access with another user, spoofed owner, stale response and revoked record scope; test Dotloop-origin sentinels in stored/reused data and separate collection sharing. |
| R-S200-5: Retry and reconcile pin changes          | ARCH-S200-5          | BEH-S200-5       | Pin the conversation and return later | AC-S200-5: Repeat pin/unpin, lose the response and race two sessions with stale versions. Assert read-back state, no duplicates and no transcript overwrite.                                                  |

**Preservation set.**

S148 private history and current-access checks; S149 question save/pin labels and S150 explicit current rerun; model-free reopening, save failure states, verification-account effect freedom and S182 exclusions.

**Adversarial acceptance checks.**

- **AC-S200-1** — Pin a multi-turn thread, append later turns, navigate/reload and open its pin. Assert top placement above unpinned history in the Dashboard/history workspace, accessible pin/open controls, one complete thread, visible historical times and zero model calls. This falsifies ARCH-S200-1 / BEH-S200-1 and the named human litmus.
- **AC-S200-2** — Snapshot thread/turn and saved-question identities before pin/unpin; assert only pin state changes, and reopen both through their normal controls. This falsifies ARCH-S200-2 / BEH-S200-2 and the named human litmus.
- **AC-S200-3** — Populate more than one history page, reach the oldest thread, inject list/open failure and retry; count zero inference and operational dispatches. This falsifies ARCH-S200-3 / BEH-S200-3 and the named human litmus.
- **AC-S200-4** — Exercise direct route/store access with another user, spoofed owner, stale response and revoked record scope; test Dotloop-origin sentinels in stored/reused data and separate collection sharing. This falsifies ARCH-S200-4 / BEH-S200-4 and the named human litmus.
- **AC-S200-5** — Repeat pin/unpin, lose the response and race two sessions with stale versions. Assert read-back state, no duplicates and no transcript overwrite. This falsifies ARCH-S200-5 / BEH-S200-5 and the named human litmus.

**Forbidden actions / hard gates.**

No sharing private transcripts, deleting history through unpin, silently migrating question pins, client-chosen ownership, auto inference on reopen or bypass of provenance/access. A pin confers no provider, send or approval authority.

**Dependencies / sequencing.**

Uses deployed private history and S199 stable continuing threads. It can be implemented without S201; sharing lease membership never shares this suite's chat content.

**Standalone delivery contract.**

- **Deliverable now:** Whole-thread pin/unpin/list/open with isolation, concurrency, failure and backward-compatibility tests.
- **Consumes, but does not assume:** Existing history thread IDs and display-safe metadata; inaccessible or missing threads show a scoped unavailable state.
- **Externally blocked effect:** None for the application feature. No live provider effect is part of pinning or history reading.
- **Produces for downstream suites:** Private thread shortcuts and compatible history semantics for the continuous chat workspace.

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
