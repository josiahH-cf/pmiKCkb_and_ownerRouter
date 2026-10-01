<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: ai-first-dashboard-batch-004 -->

# S148 — Durable per-user AI conversation history

> Intake: ready, batch 004 item 015. New owner-scoped persistence beside the deployed S138 path; implementation and release not started.

**Goal.**

A question and its displayed answer survive navigation, reload, sign-out and a later visit by the same user, and reopen exactly as they were without asking the model again.

**Current state / intended end state.**

Verified at `23c79dac`: the Dashboard conversation lives only in page state; no collection stores conversations, turns, saved prompts or model usage. `ask_logs` (`lib/firestore/ask-logs.ts`) records knowledge answers for review, is readable by Editors and Approvers and is not user history. Firestore is reached only through the Admin SDK on the server (`lib/firestore/admin.ts`); the browser loads only Firebase Auth, and the rules end in a catch-all deny, so a server-only collection needs no rules change. S138 chose session-local context, and S89/S93 excluded persistent history; item 015 supersedes those choices for the Dashboard conversation. Static scans in `tests/unit/s138-dashboard-conversation.test.ts` forbid writes in the query route, `lib/assistant` and `lib/operational-context`. Intended end state: each user's turns are stored server-side with stable conversation and turn identity, listed in a compact paged history, and restored read-only with their as-of context.

**Actors and entry conditions.**

The signed-in user, identified from the session on the server. Client-supplied user identifiers never select or grant access. Verification accounts (`lib/auth/canary-policy.ts`) stay effect-free: their turns are answered and visibly not saved.

**What it is / how it functions.**

A dedicated owner-scoped store module and routes outside `lib/assistant` and `lib/operational-context` hold conversations and turns. Each turn records the question, the displayed answer (summary, groups, items, record references and links, interpretation lines), the resolved plan and filters, the interpreted date range, the answer time and structured source as-of, currency and coverage, and its lifecycle state (submitted, completed, failed or interrupted). Credentials, hidden reasoning and internal prompts are never stored. `/api/assistant/query` stays a read: it remains in the verification read set and the release assurance, and it may only read a completed turn by operation id to replay it. Saving uses a separate idempotent write keyed by a client operation id (the deterministic-id and replay patterns in `lib/firestore/work-accountability.ts` and `lib/firestore/runtime-action-suspensions.ts`), appends turns without replacing the thread, and refuses or reconciles a late write against newer accepted turns. A failed save keeps the visible answer marked not saved, and retry saves that same result with no model call. Listing pages through all of a user's conversations with question excerpts and times, and distinguishes none from failed or partial. Opening reads stored data only, labels it with its answer time, and re-checks current record access before showing stored links or groups. Client state is cleared when the signed-in account changes. Retention follows existing rules; no silent expiry and no deletion interface are added.

**In scope / out of scope.**

In scope: the store, routes, lifecycle states, idempotency, concurrency, paging, restore, access re-check, account-change clearing and the history navigation used by S146. Out of scope: sharing, team transcript search, export, folders, real-time collaboration, retention management, browser-only storage as the durable record, and recovering history that was never saved.

**Open questions & assumptions.**

No intake-blocking question. Assumptions: Firestore remains the store (no second database); history covers operational and knowledge answers shown on the Dashboard; a stored answer is always historical; verification accounts are not persisted. The rehearsal may allow only the new owner-scoped history routes in `lib/environment/live-readonly-request-policy.ts`; provider and business writes stay refused there.

**Cross-product impacts.**

S146 workspace and navigation, S149 saved items, S150 reuse, S137 actor scoping, session handling, live read-only policy, Firestore emulator tests, and the release assurance (which must stay mutation-free). `firestore.rules`, `lib/auth` and the verification read set do not change.

**Authority and evidence map.**

| Input                                                                | Classification                | Use and limitation                                                                              |
| -------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| Router, S138/S137 code and tests, Firestore access pattern and rules | Authority / verified baseline | Current scoping, read-only query route and server-only data access.                             |
| Source item 015                                                      | Owner intent                  | Durable, user-owned history restored without inference; supersedes S138's session-local choice. |
| Emulator and route tests                                             | Implementation evidence       | Proves ownership, idempotency, concurrency and failure behaviour without production writes.     |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S148-1** — Turns are stored server-side under the session user's identity with stable conversation and turn ids, and every read and write enforces ownership on the server; cross-user, guessed-id and spoofed-id fixtures fail without the store's checks.
- **ARCH-S148-2** — Saving is idempotent per operation id and append-only per turn, the query route performs no write, and a late or concurrent write cannot replace a newer accepted turn; duplicate, late-response and two-session fixtures fail against a whole-thread overwrite.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S148-1** — After reload, sign-out and sign-in, the same user reopens a conversation with its original order, content, links and as-of labels, and no model request is made.
- **BEH-S148-2** — A failed save shows the answer as not saved and a retry saves it without a new answer; failed or interrupted generation is never shown as complete; a failed history read is not shown as empty.

**Human litmus outcome.**

### Come back to yesterday's question

**If this was built correctly:** A user asks a question, closes the browser, signs in the next day, and finds the same question and answer in their history, clearly dated, without it being asked again. Record model verdict; without an observer use `Human verdict: NOT RUN — no human observer`.

**Requirement-to-outcome traceability.**

| Requirement                   | Architecture outcome | Behavior outcome | Human litmus                      | Falsification                                                                          |
| ----------------------------- | -------------------- | ---------------- | --------------------------------- | -------------------------------------------------------------------------------------- |
| Durable, owner-scoped history | ARCH-S148-1          | BEH-S148-1       | Come back to yesterday's question | Reload, re-sign-in, second account, guessed id and account-switch tests.               |
| Safe save lifecycle           | ARCH-S148-2          | BEH-S148-2       | Come back to yesterday's question | Save failure, retry, duplicate delivery, late response, two sessions and paging tests. |

**Preservation set.**

S138 answers and follow-up scoping, the read-only query route and its static write ban, S135/S137 access checks, `ask_logs` behaviour, verification-account effect freedom, the mutation-free release assurance, and unchanged Firestore rules and auth code.

**Adversarial acceptance checks.**

- **AC-S148-1** — A completed turn reopens after reload and a later authenticated session with its order, content, links and as-of context intact, from the server rather than browser storage.
- **AC-S148-2** — Another user, a guessed id, a stale client cache or an account switch never reveals one user's history; revoked record access hides the affected stored detail.
- **AC-S148-3** — Listing and opening history make zero model requests and rerun nothing; older history beyond the first page stays reachable; a failed read is not reported as empty.
- **AC-S148-4** — A failed save keeps the answer visibly unsaved and retries without inference or a duplicate turn; failed or interrupted generation is never marked complete; a late response or second session never replaces newer accepted turns.

**Forbidden actions / hard gates.**

No change to `firestore.rules`, `lib/auth` or the verification read set; no write from `/api/assistant/query`; no persistence for verification accounts; no storage of credentials, hidden reasoning or internal prompts; no new expiry, sharing or export.

**Dependencies / sequencing.**

Consumed by S146 (navigation), S149 (saved items reference turns) and S150 (stored answers and plans). Build after S146's turn model is settled; S138 is the deployed baseline.

**Standalone delivery contract.**

Deliver the store, routes, lifecycle and restore with emulator, route and UI tests. Live persistence is verified only within the owner's bounded production check (S151).

**Verification and delivery contract.**

Record fail-first ownership, idempotency, concurrency, failure and paging tests on the Firestore emulator before wiring the UI. Run focused tests, `npm run test:firestore` and canonical `bash scripts/verify.sh` under an authorized execution run; audit the exact diff and result evidence. Use `ALL_GATES_GREEN` for tested scope, `BLOCKED` only for a precise external input and `BUDGET_EXHAUSTED` only with an explicit budget.

**Ordered prompt sequence.**

1. Recheck the conversation contract, data-access pattern, rules and static write bans at the latest source.
2. Record fail-first ownership, lifecycle, idempotency, concurrency and paging cases.
3. Add the owner-scoped store and routes, wire save, list and restore, and clear client state on account change.
4. Falsify cross-user, duplicate, late-write and failure paths and report exact tested versus live scope.

**Deletion/merge recommendation.**

Retire after S151 and serving evidence show durable history, isolation and zero-inference restore are owned by code, tests and current facts.
