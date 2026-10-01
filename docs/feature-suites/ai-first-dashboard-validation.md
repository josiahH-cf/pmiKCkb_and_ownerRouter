<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: ai-first-dashboard-batch-004 -->

# S151 — AI-first Dashboard, history and reuse validation

> Intake: ready, batch 004 item 018. Integrated validation of S146–S150 through real application boundaries; implementation and release not started.

**Goal.**

Prove the whole path a user takes: an uncluttered Dashboard, a question answered below the composer, history that survives leaving and returning, saved and pinned questions, and reuse without avoidable model calls or stale answers, while moved functions stay reachable and nothing else regresses.

**Current state / intended end state.**

At intake no batch 004 behaviour exists; S138's tests and smokes cover the current assistant, and S141 recorded local rehearsal evidence but no production inference or signed-in Dashboard parity. Intended end state: one evidence map records, per criterion, the environment that produced it (unit, Firestore emulator, compiled browser, rehearsal, production), with fixes made during validation and every unexercised seam named.

**Actors and entry conditions.**

Validation runs as the existing test identities in controlled environments and, in production, only as the owner's managed browser profile (`josiah@pmikcmetro.com`) under the owner's bounded live-check authority of 2026-10-01. Verification accounts stay effect-free.

**What it is / how it functions.**

Build targeted checks with each suite and consolidate them here:

| Area                | Required outcome                                                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Primary layout      | AI is the first working area; answers and follow-ups display below it.                                                           |
| Process removal     | An ordinary prompt reaches the real backend without a process selection; process knowledge and Internal Processes stay usable.   |
| Panel relocation    | The five named panels are absent from the Dashboard and their functions are reachable at their owners; any exception is genuine. |
| Attention queue     | Eligible, accessible items only, correct links and authority, distinct empty, unavailable and partial states.                    |
| Durable history     | Question, answer, context and as-of survive reload, navigation, sign-out and a later session.                                    |
| Saved and pinned    | Save, pin, unpin and reopen keep their associations with no duplicates or lost history.                                          |
| Reopening cost      | History, reopen, save, pin and navigation make no model call.                                                                    |
| Current-query reuse | A saved structured question returns current records through the data services with no reinterpretation or narration call.        |
| Date semantics      | Historical answers keep their period; current runs re-evaluate relative periods and keep fixed ones on the business calendar.    |
| Freshness           | Changed data or access invalidates current reuse; unavailable sources stay distinct from empty and from history.                 |
| User isolation      | Another account never sees the first user's history, pins or cached answers.                                                     |

Exercise representative questions (a recurring lease-date question, the user's own work and approvals, and a context-dependent follow-up) and check record identities, filters and counts against the data layer rather than the wording. Cover a failed history save and its retry without regeneration, a failed or interrupted generation, a late response and a second session, a failed history load, a failed pin write, repeated submission delivery, history beyond the first page, a relative-month rollover with a controlled clock, a changed source record with controlled data, and an explicit current-run failure. Check that relocated links, the per-lease dashboard, the Focus view and the email-draft navigation still work, that read failures never block asking, and that switching users leaks nothing. After deployment, confirm the serving revision and configuration, run the read-only assurance, then the owner's bounded live check: at most five read-only questions as the owner, then reopen, save, pin, unpin and one structured rerun, proving zero model calls on the no-model paths from bodyless production logs, with a request guard that allows only those calls.

**In scope / out of scope.**

In scope: integrated checks, targeted corrections in S146–S150, the evidence map and the bounded live check. Out of scope: a new test platform or release ceremony, reopening earlier batches, synthetic customer records or business writes in production, client messages, and committing private conversation content.

**Open questions & assumptions.**

No intake-blocking question. Owner decision 2026-10-01: the bounded live check as the owner is authorized; the resulting conversations remain in the owner's own history and cost a few cents of model use. Without an observer, human verdicts are recorded as `Human verdict: NOT RUN — no human observer`.

**Cross-product impacts.**

Unit, emulator, end-to-end and browser smoke suites, the release runbook's assurance and readbacks, and the existing feature-loop records.

**Authority and evidence map.**

| Input                                                          | Classification                | Use and limitation                                                                     |
| -------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| Router, release runbook and S146–S150 code and tests           | Authority / verified baseline | What each environment can prove; build and deploy commands are not behaviour evidence. |
| Source item 018 and the owner's 2026-10-01 live-check decision | Owner intent / decision       | Integrated outcomes and the bounded production check.                                  |
| Bodyless production logs and serving readbacks                 | Live evidence                 | Zero-model paths and the serving revision; never message bodies.                       |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S151-1** — The integrated checks drive the real UI, routes, store and data services in controlled environments, so each area above fails when its suite's behaviour is removed.
- **ARCH-S151-2** — Production verification is read-only except for the owner's bounded live check, whose request guard admits only the assistant question, history and saved-item calls and records zero business writes.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S151-1** — The full user path passes end to end on the emulator and compiled browser, including every failure and interruption scenario listed above.
- **BEH-S151-2** — On the serving revision, the owner's live check shows history, saved items and structured rerun working with zero model calls on the no-model paths.

**Human litmus outcome.**

### Ask, leave, return, reuse

**If this was built correctly:** A user asks on a clean Dashboard, leaves, returns the next day to the same conversation, pins it, and reruns it for this month's records with no stale answer and no extra AI cost. Record model verdict; without an observer use `Human verdict: NOT RUN — no human observer`.

**Requirement-to-outcome traceability.**

| Requirement                                | Architecture outcome | Behavior outcome | Human litmus              | Falsification                                               |
| ------------------------------------------ | -------------------- | ---------------- | ------------------------- | ----------------------------------------------------------- |
| Integrated path in controlled environments | ARCH-S151-1          | BEH-S151-1       | Ask, leave, return, reuse | Remove each suite's behaviour and watch its area fail.      |
| Truthful live verification                 | ARCH-S151-2          | BEH-S151-2       | Ask, leave, return, reuse | Guard refusals, bodyless call counts and serving readbacks. |

**Preservation set.**

The per-lease dashboard, Focus view, email-draft navigation, renewal desk, staff work, Internal Processes, Admin and connections, release assurance gates, and every earlier batch's recorded evidence.

**Adversarial acceptance checks.**

- **AC-S151-1** — Every area in the table passes in the environment its criterion requires, with record identities, filters and counts checked against the data layer.
- **AC-S151-2** — Every persistence, interruption, duplicate, paging, rollover, invalidation and current-run-failure scenario passes with controlled data and never with production business writes.
- **AC-S151-3** — After deployment, the serving revision and configuration are confirmed, the read-only assurance passes, and the owner's bounded live check passes within its five-question limit with zero model calls on the no-model paths.
- **AC-S151-4** — The evidence map names each criterion's environment, the fixes made, and every unverified seam, and the feature-loop entries distinguish implemented, tested and live-verified work.

**Forbidden actions / hard gates.**

No synthetic customer records, business writes, provider effects or client messages in production; no more than five live questions; no message bodies, credentials or private values in Git or logs; no relabelling of a failed or unverified result.

**Dependencies / sequencing.**

Runs alongside S146–S150 and closes after their release. Earlier batches and their evidence are not reopened.

**Standalone delivery contract.**

Deliver the integrated tests, the evidence map, the post-deployment checks and the records update; claim live verification only for what ran on the serving revision.

**Verification and delivery contract.**

Freeze the evidence-map criteria before the first fix, record fail-first evidence for each correction, and run focused tests, `npm run test:firestore`, `npm run test:e2e:core` and canonical `bash scripts/verify.sh` under an authorized execution run; audit the exact diff and result evidence. Use `ALL_GATES_GREEN` for tested scope, `BLOCKED` only for a precise external input and `BUDGET_EXHAUSTED` only with an explicit budget.

**Ordered prompt sequence.**

1. Ground the current Dashboard, assistant path, identity handling and destination screens at the latest source and serving version.
2. Build each suite's targeted checks with its implementation and consolidate the integrated scenarios here.
3. Run the full local gates, fix in-scope failures and rerun the affected checks.
4. After the authorized release, run the read-only assurance and the owner's bounded live check, then update the records with exact tested versus live scope.

**Deletion/merge recommendation.**

Retire after the evidence map and serving readbacks are current and S146–S150 are owned by code, tests and current facts.
