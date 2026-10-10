<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S206 — Reliable maintenance creation, progress, deduplication and reconciliation

> Status: READY — finalized specification for later authorized implementation; no application, provider or Registry change is performed by authoring.
> Intake: 078. Authored: 2026-10-09. Source baseline: WSL main `43bad3ad`; recorded serving baseline: `337ac163` (2026-10-08). These are contextual baselines, not new live verification.
> Bundle: `operations-communications-maintenance-2026-10`.

**Goal.**

Creating a maintenance ticket shows honest progress, reveals the saved ticket immediately and reconciles an unknown outcome before offering another attempt.

**Current state / intended end state.**

`MaintenanceCapture.tsx` prevents same-component concurrent clicks but sends no durable creation identity and tells the user to reload after success. `createMaintenanceTicket` allocates a fresh ticket ID per call. Queue filtering/loading is separate. The reported MF-20261008-B duplicate ticket effects have not been independently established.

One user creation intent has a durable identity and local pending state through save, interruption and reopening. Success links/reveals the persisted ticket with filter-aware visibility. Uncertain outcomes remain recoverable and cannot silently become a second ticket or provider operation.

**Actors and entry conditions.**

Authorized maintenance staff create app tickets from actual captured data. Quarantine promotion and provider work-order creation retain their own services/claims. The same user intent must remain identifiable across transport failure and refresh.

**What it is / how it functions.**

- **R-S206-1 — Visible bounded pending state.** Show local creation progress and preserve entered work while saving. Prevent repeated UI submission for the same intent; cancellation before dispatch has no effect and interruption after dispatch is an unknown outcome.
- **R-S206-2 — One durable app creation.** Make retries of the same creation intent return its one persisted ticket and initial activity. Bind intent to actor and captured content; changed content becomes a deliberate new intent, not a mutation of the old attempt.
- **R-S206-3 — Immediate filter-aware reveal.** After confirmed save, update the current queue and provide the exact ticket link without requiring a page reload. Preserve the user's chosen filters; explain when the new ticket is outside them and offer a deliberate reveal.
- **R-S206-4 — Reconcile before retry.** Provide a bounded lookup/readback for the same creation intent and show pending, found, failed-before-commit or unresolved. Never treat elapsed time, a list/query failure or inability to find a row as proof of non-creation.
- **R-S206-5 — Keep app and provider effects separate.** Track app-ticket result and separately requested RentVine work-order result independently. Diagnose creation/readback/query failures with exact bounded evidence; repair only verified causes and do not record reported two-effect hypotheses as facts.

**In scope / out of scope.**

In scope: app creation identity, local pending/result UI, queue reveal, bounded reconciliation and targeted creation/readback diagnosis. Out of scope: live reproduction with customer records, automatic retries of ambiguous provider effects, automatic work-order creation, or speculative infrastructure/schema repairs.

**Open questions & assumptions.**

MF-20261008-B is intent evidence of confusing creation behavior. The number and nature of actual live ticket effects remain unverified; preserve that uncertainty without making more live mutations to investigate it.

No material product decision is deferred inside this READY scope. Actual identities, approved runtime policies, financial values and provider configuration are inputs, not values the implementation runner invents. Their absence blocks only the named dependent operation; implementation and independent verification proceed.

**Cross-product impacts.**

- `components/maintenance/MaintenanceCapture.tsx`, `MaintenanceQueue.tsx`; `app/api/maintenance/tickets/route.ts` — current save/queue behavior.
- `lib/firestore/maintenance-tickets.ts`, `lib/maintenance/verified-ticket-property.ts` — ticket/initial activity transaction and verified property binding.
- `lib/firestore/maintenance-intake-review.ts`, `maintenance-work-order-links.ts` and S99 — distinct promotion/provider identity/claim owners.

**Authority and evidence map.**

| Input                                                         | Classification                             | Use and limitation                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, current owning code and tests, `docs/facts.md`   | Authority / implementation baseline        | Current safety, identity and exact-action boundaries persist until a later explicitly authorized governance change; source behavior is not automatically desired behavior.                                                                                                                                   |
| Owner clarification on 2026-10-09                             | Confirmed desired outcome                  | Complete staff-managed maintenance, PMI final closure, assigned-vendor contributions, future-only history, durable reporting evidence, configurable policy and explicit financial distinctions. Authoring is not execution authority.                                                                        |
| October 8 meeting intake and feedback aliases MF-20261008-A/B | Intent / reported experience               | Assessment before owner approval; no forced intake email; standing preapproval; visible creation progress, queue reveal and honest reconciliation. Reported duplicate ticket effects remain unverified; the reported creation experience establishes desired usability, not a proven number of live effects. |
| WSL main `43bad3ad`; recorded serving `337ac163`              | Inspected source / supplied batch baseline | Establishes the starting owners listed above. Local code checks and deterministic adapters do not prove a live provider effect, human observation or actual account entitlement.                                                                                                                             |
| Actual provider/configuration/approved-policy inputs          | External dependency                        | Use only verified real inputs for their exact operation. Do not create customer records, provider actions or policy values to demonstrate completion.                                                                                                                                                        |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S206-1** — Connect capture state to a durable server-resolved app creation identity while retaining current access/property validation. Freeze a focused falsification before changing this boundary.
- **ARCH-S206-2** — Extend the transactional ticket creation owner; claim, ticket and initial activity settle atomically and conflict on reused identity with different content. Freeze a focused falsification before changing this boundary.
- **ARCH-S206-3** — Use shared creation-result/queue projection instead of mutating independent copies or discarding filter state. Freeze a focused falsification before changing this boundary.
- **ARCH-S206-4** — Separate durable intent readback from provider execution and from queue-query health; reuse known creation identity for recovery. Freeze a focused falsification before changing this boundary.
- **ARCH-S206-5** — Preserve S99 existing link/create claims and S47 promotion deduplication; creation UI cannot trigger a provider write as recovery. Freeze a focused falsification before changing this boundary.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S206-1** — Staff see Creating, Created or Needs reconciliation rather than a stalled form or an unfounded failure.
- **BEH-S206-2** — A double click, browser retry or reopened tab finds the original ticket; it does not silently produce another.
- **BEH-S206-3** — The saved ticket can be opened immediately; a My tickets or status filter does not make success look like disappearance.
- **BEH-S206-4** — An uncertain save offers Check result; a verified prior ticket opens, while an unresolved result does not offer blind Create again.
- **BEH-S206-5** — Staff can tell whether the app ticket exists and whether a separate work order is linked, pending or ambiguous.

**Human litmus outcome.**

### Create once and find the maintenance ticket immediately

**If this was built correctly:** A staff member submits a report, sees that it is saving, and then gets a direct link to the created ticket with a way to reveal it in the queue without losing their filters. If the response is lost, the app checks the original submission and explains the known outcome before offering another attempt.

- Model verdict: LOCAL EVIDENCE — implementation and mapped engineering checks are recorded per requirement in `docs/evidence/operations-communications-maintenance-2026-10.json`; the complete local canonical gate and core E2E passed in their recorded scopes; exact-main CI and runtime/delivery remain separately verified gates. No live provider effect or human observation is claimed.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                      | Architecture outcome | Behavior outcome | Human litmus                                            | Acceptance / deterministic falsification                                                                                                                            |
| ------------------------------------------------ | -------------------- | ---------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S206-1: Visible bounded pending state          | ARCH-S206-1          | BEH-S206-1       | Create once and find the maintenance ticket immediately | AC-S206-1: Delay and abort the transport before/after commit; ensure entered values persist and each displayed state matches known dispatch/outcome.                |
| R-S206-2: One durable app creation               | ARCH-S206-2          | BEH-S206-2       | Create once and find the maintenance ticket immediately | AC-S206-2: Concurrent identical intents produce one ticket/activity; identity/content mismatch refuses; transaction failure leaves no partial ticket.               |
| R-S206-3: Immediate filter-aware reveal          | ARCH-S206-3          | BEH-S206-3       | Create once and find the maintenance ticket immediately | AC-S206-3: Create under matching/nonmatching filters, then reveal and return; queue count, ticket identity and original filters remain coherent.                    |
| R-S206-4: Reconcile before retry                 | ARCH-S206-4          | BEH-S206-4       | Create once and find the maintenance ticket immediately | AC-S206-4: Lose the response after commit, fail queue reads and return delayed readback; assert no second app/provider dispatch until exact outcome is established. |
| R-S206-5: Keep app and provider effects separate | ARCH-S206-5          | BEH-S206-5       | Create once and find the maintenance ticket immediately | AC-S206-5: Inject an app success plus provider ambiguity and queue read failure; all three remain distinguishable and no new provider create runs.                  |

**Preservation set.**

`tests/unit/maintenance-capture.test.tsx`, `maintenance-tickets.test.ts`, `maintenance-tickets-route.test.ts`, `maintenance-queue-component.test.tsx`, `s99-work-order-link-store.test.ts`; public promotion concurrency and Live-only checks.

Preservation is a separate result from new behavior. Existing tests are retained where they cover unchanged contracts; new checks must demonstrate the new outcome rather than repeat implementation details.

**Adversarial acceptance checks.**

- **AC-S206-1** — R-S206-1, ARCH-S206-1, BEH-S206-1: Delay and abort the transport before/after commit; ensure entered values persist and each displayed state matches known dispatch/outcome.
- **AC-S206-2** — R-S206-2, ARCH-S206-2, BEH-S206-2: Concurrent identical intents produce one ticket/activity; identity/content mismatch refuses; transaction failure leaves no partial ticket.
- **AC-S206-3** — R-S206-3, ARCH-S206-3, BEH-S206-3: Create under matching/nonmatching filters, then reveal and return; queue count, ticket identity and original filters remain coherent.
- **AC-S206-4** — R-S206-4, ARCH-S206-4, BEH-S206-4: Lose the response after commit, fail queue reads and return delayed readback; assert no second app/provider dispatch until exact outcome is established.
- **AC-S206-5** — R-S206-5, ARCH-S206-5, BEH-S206-5: Inject an app success plus provider ambiguity and queue read failure; all three remain distinguishable and no new provider create runs.

**Forbidden actions / hard gates.**

No blind retry after unknown commit, UI-only idempotency claim, guessed repair, deletion of possible duplicates, or automatic provider action as a queue refresh.

Across this suite: no fabricated customer/provider identity or amount, secret/raw customer evidence in Git, guessed provider endpoint or recipient, silent historical-evidence rewrite, or claim of unrun human/provider success. Writing this file opens no exact Action Registry key and grants no account, privilege or live proof target. Preserve S100's explicit warning/confirmation for reads that mark manager messages read; do not relabel them harmless background imports.

**Dependencies / sequencing.**

Extends current ticket creation directly. S205/S209 consume its stable ticket/intent identity. S215 verifies the whole journey and retiring reload-only guidance.

**Standalone delivery contract.**

- **Deliverable now:** Durable creation/reconciliation service contract, capture/queue result UI, conflict/unavailable handling and fail-first concurrency/interruption tests.
- **Consumes, but does not assume:** Actual capture data and current unit/property evidence; source provider execution remains a separate explicit operation.
- **Externally blocked effect:** None for app-owned implementation. Any later real datastore/configuration repair requires an observed exact need and verified readback under existing deployment authority.
- **Produces for downstream suites:** Stable creation-intent result and canonical ticket reference for downstream history/workflow; evidence that app and provider outcomes are separate.

**Verification and delivery contract.**

1. Re-read current owners and refresh the baseline before implementation. Materialize the named architecture, behavior and acceptance falsifications; record pre-existing unrelated failures separately.
2. Exercise every row with service/transaction and rendered journeys appropriate to the outcome, including denial, interruption, concurrency and partial completion. Use isolated local fixtures and deterministic external adapters; keep the preservation result separate.
3. Read back saved artifacts/state and reconcile them with the acted-on identity/version. A UI success label, supplied example or passing adapter cannot establish live provider success.
4. Run focused checks, then `bash scripts/verify.sh` and applicable compiled-browser checks for any later ship candidate. Audit secrets/PII, authority, runtime configuration and cross-suite traceability.
5. A later authorized implementation reports ALL_GATES_GREEN only for completed declared engineering checks; a named live/account proof remains separately BLOCKED when its input is missing. BUDGET_EXHAUSTED applies only to an explicit budget. Never label the whole operational outcome complete from a partial green slice.
6. Authoring registration/validation is documentary only. Commit, push, deployment, implementation-loop start and external communication require their own explicit instruction.

**Ordered prompt sequence.**

1. Re-verify current source, accepted decisions, dependency contracts and relevant read-only state.
2. Freeze the requirement/architecture/behavior/acceptance matrix and preservation baseline before implementation.
3. Implement the bounded owner and all unavailable/recovery paths; reuse existing services and keep adjacent suite ownership explicit.
4. Falsify every row, read back persisted results, run focused/canonical checks, update verified current documentation and deliver only when separately authorized.

**Deletion/merge recommendation.**

Retain this suite until its full behavior, remaining dependencies and acceptance evidence are represented in current code/tests/facts. Then merge its operating contract into current maintenance documentation; preserve historical evidence without keeping duplicate active instructions.
