<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: ai-first-dashboard-batch-004 -->

# S149 — Saved and pinned questions

> Intake: ready, batch 004 item 016. Owner-scoped saved-question records over S148 history; implementation and release not started.

**Goal.**

A user saves a question they ask repeatedly, pins it for quick return, and later either reopens its last answer or runs it again for current results, without retyping it or rebuilding its context.

**Current state / intended end state.**

Verified at `23c79dac`: nothing saves or pins questions. The S138 plan (`lib/assistant/conversation-plan.ts`) is a strict schema with closed enums for subjects, filters (range preset or month, date field, assignee, people, flags, text) and follow-up; it carries no ids, actor, role or Space, and relative presets re-resolve at run time on the Chicago business calendar (`lib/assistant/business-dates.ts`). Follow-ups merge with earlier turns, so a short follow-up's own words do not carry its meaning. Intended end state: a saved item belongs to its user and records the original question, its conversation and turn, the merged executable plan, its date intent, and a label; pinning is a navigation preference; reopening and running for current results are two distinct actions.

**Actors and entry conditions.**

The signed-in user, identified on the server. Saved items are private to that user; running one re-checks current access. Verification accounts cannot save or pin.

**What it is / how it functions.**

Offer Save on a completed turn or conversation and Pin or Unpin on saved items. Store each saved item owner-scoped and idempotent per user and turn: the question text, the conversation and turn reference, the merged plan validated against the existing schema, the concrete range used by the original run, whether its period is relative (“this month”) or fixed (a named month or range), the date field it meant (for example lease expiration versus a renewal milestone), named people and record filters, and an optional plain label (default: a question excerpt, no AI naming). Pin state is a versioned flag; repeating a save or pin never duplicates, and unpinning keeps the item and its history. Separate inquiries with the same wording stay separate. Reopen shows the stored answer with its original as-of and makes no model request. Run for current results hands the saved plan to S150, re-evaluates a relative period on the business calendar at run time, keeps a fixed period fixed, resolves “my work” from the signed-in user, and records the result as a new turn so the earlier answer stays intact. Editing the question in the composer creates a variation and never rewrites the saved definition or its history. Saved and pinned items sit in compact navigation next to the AI workspace.

**In scope / out of scope.**

In scope: save, pin, unpin, label, reopen versus run current, date-intent preservation, persistence, failure states and compact navigation. Out of scope: scheduled or background runs, polling, notifications, monthly jobs, folders, tags, sharing, a prompt marketplace, saved-query cards on the Dashboard, and AI-generated names.

**Open questions & assumptions.**

No intake-blocking question. From item 016: a “monthly query” is a question the user runs when needed, never a schedule. A genuinely ambiguous date intention is resolved from conversation context first, then by one focused clarification at run time. Control labels are an implementation choice; the reopen versus run-current distinction is required.

**Cross-product impacts.**

S146 navigation, S148 history records, S150 execution, the S138 plan schema and business-date utilities, and Firestore emulator tests. No rules, auth or provider change.

**Authority and evidence map.**

| Input                                                | Classification                | Use and limitation                                                           |
| ---------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------- |
| S138 plan schema, merge logic and business-date code | Authority / verified baseline | The executable representation and calendar semantics a saved item must keep. |
| Source item 016                                      | Owner intent                  | Save, pin and reuse; “monthly” means on demand.                              |
| Emulator, route and date tests                       | Implementation evidence       | Proves idempotency, privacy and period semantics without production writes.  |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S149-1** — A saved item stores the merged, schema-valid plan and its date intent, so a context-dependent follow-up reruns with its resolved meaning; a fixture saving only the follow-up's words fails.
- **ARCH-S149-2** — Save and pin are idempotent, owner-scoped and versioned; repeated or retried writes yield one item, and a failed write is never shown as saved.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S149-1** — A pinned item reopens in a later session with its original answer and dates and no model request; unpinning leaves it saved.
- **BEH-S149-2** — Running for current results re-evaluates “this month” in the new month, keeps a named month fixed, shows the concrete range, and adds a new result without changing the earlier one.

**Human litmus outcome.**

### Rerun my monthly question

**If this was built correctly:** A user pins “leases expiring this month that are mine”, comes back next month, and either rereads last month's answer or gets this month's list with one action. Record model verdict; without an observer use `Human verdict: NOT RUN — no human observer`.

**Requirement-to-outcome traceability.**

| Requirement           | Architecture outcome | Behavior outcome | Human litmus              | Falsification                                                                 |
| --------------------- | -------------------- | ---------------- | ------------------------- | ----------------------------------------------------------------------------- |
| Save the real meaning | ARCH-S149-1          | BEH-S149-2       | Rerun my monthly question | Follow-up save, relative-month rollover, fixed-month and date-field fixtures. |
| Reliable private pins | ARCH-S149-2          | BEH-S149-1       | Rerun my monthly question | Repeated save and pin, failed write, second account and unpin tests.          |

**Preservation set.**

S148 history and its timestamps, the S138 plan schema and calendar semantics, current access checks, and the composer's normal editing.

**Adversarial acceptance checks.**

- **AC-S149-1** — A user saves a question from history, pins it, and in a later session reopens its original answer without retyping or any model request.
- **AC-S149-2** — Unpinning removes quick access only; repeated save or pin operations create no duplicates; a failed write is never displayed as durable.
- **AC-S149-3** — A saved context-dependent follow-up keeps its resolved filters, people and record references; a relative period is re-evaluated and a fixed period preserved on each run, with historical ranges unchanged.
- **AC-S149-4** — Reopen and run-current are distinct, navigation alone never runs a saved question, a new run or its failure never overwrites the earlier result, and saved items stay private to their user.

**Forbidden actions / hard gates.**

No scheduled or automatic execution, no write to business records, no sharing, and no execution of anything but a schema-valid plan through S150.

**Dependencies / sequencing.**

Requires S148 records and S150 execution; surfaces in S146 navigation. Build after S148.

**Standalone delivery contract.**

Deliver saved items, pins, reopen and the run-current hand-off with tests; until S150 lands, run-current uses the existing model path and says so.

**Verification and delivery contract.**

Record fail-first idempotency, privacy, follow-up-meaning and date-rollover tests (with a controlled clock) before wiring the UI. Run focused tests, `npm run test:firestore` and canonical `bash scripts/verify.sh` under an authorized execution run; audit the exact diff and result evidence. Use `ALL_GATES_GREEN` for tested scope, `BLOCKED` only for a precise external input and `BUDGET_EXHAUSTED` only with an explicit budget.

**Ordered prompt sequence.**

1. Recheck the plan schema, merge behaviour and business-date resolution at the latest source.
2. Record fail-first save, pin, privacy, follow-up and period cases.
3. Add the saved-item store and routes, the save, pin and label controls, and reopen versus run current.
4. Falsify duplicate, failure, rollover and isolation paths and report exact tested versus live scope.

**Deletion/merge recommendation.**

Retire after S151 and serving evidence show saved and pinned questions and their date semantics are owned by code, tests and current facts.
