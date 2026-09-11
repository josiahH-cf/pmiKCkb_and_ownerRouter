<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-completion-v1 -->

# S107 — Confirmed renewal effect continuation and recovery

> Status: DEPLOYED in `f5faf1665121db9cacff913a57e7fdcc80513116` / `pmi-kc-app-rmtwdl4di-4439f17911f4`. Exact CI 34556917662 and S51/S54 candidate, promotion, observation and readback passed. Read-only continuation covers RentVine, Sheet and normal S34 packet state. Status mounts use genuine GETs; only exact Admin controls reconcile. Confirmed execution and own-receipt recovery add no autonomous queue, scheduler, worker, sweep or automatic retry.

**Goal.**

Once a person confirms an exact renewal effect, that effect completes and is recorded even if the
initiating page closes; interrupted or repeated attempts recover to one truthful state; and one
blocked lease never stops another.

**Current state / intended end state.**

| Package requirement (PMI-07)                          | Classification                     | Evidence                                                                                                                                                                |
| ----------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Use the project's existing background mechanism       | Unsupported (none exists)          | No Cloud Tasks, Scheduler, Pub/Sub work queue, or worker; operator-triggered scripts state "There is no Cloud Scheduler" (`scripts/run-notice-reminders.ts`)            |
| Persist per-renewal progress and resume after restart | Already satisfied                  | Firestore progress, execution records with `attemptCount`, receipts, and `reconcile` operations (`lib/firestore/lease-renewal-writeback-executions.ts`, S97/S98 claims) |
| Bind work to the current proposal identity            | Already satisfied                  | Generation-bound claims (`lib/firestore/s97-renewal-writeback-claim.ts`)                                                                                                |
| Repeated delivery yields one effective action         | Already satisfied                  | One-attempt claims and idempotent preview creation                                                                                                                      |
| Retry transient failures automatically                | Conflicting with project authority | `AGENTS.md`: an uncertain attempt never retries; every live write is human-initiated and exact-confirmed                                                                |
| Continue unrelated leases                             | Already satisfied                  | Per-lease claims and guidance                                                                                                                                           |
| Visible background state and next action              | Deployed                           | One read-only durable continuation card and owning panels show attempt state and authorized next action.                                                                |
| Reuse existing pause/resume/retry/reconcile controls  | Already satisfied                  | `reconcile` operations in S97/S98/S99 routes                                                                                                                            |
| Recover abandoned work without database edits         | Deployed                           | Orphaned attempts are surfaced read-only; only an explicit authorized reconciliation can settle them.                                                                   |
| Leave the page and let work continue                  | Deployed                           | Exact confirmed server execution does not forward the browser abort signal; durable readback and explicit recovery own uncertainty.                                     |

Intended end state: no new job platform. A confirmed effect runs to completion server-side with the
request detached from the browser connection; on the next load of the workspace, orphaned attempts
are surfaced read-only with the Admin-gated reconcile as the exact next action; the workspace shows
one consolidated attempt summary.
Autonomous chaining of writes and blind retry stay outside the product.

**Actors and entry conditions.**

The same actors and gates as S97, S98, S34, and the renewal draft contracts. Continuation starts only
after an exact human confirmation. A workspace load projects the durable attempts read-only for any Renewals-space staff member;
reconciliation itself is only the Admin-gated route control.

**What it is / how it functions.**

1. **Detach after confirmation.** Route handlers that execute a confirmed effect do not abort the
   provider call, receipt, or readback when the client disconnects; the response is recorded before
   any projection, and a later load reads the receipt.
2. **Recover on load.** `projectWorkspaceAttemptSummary(leaseId)` runs during workspace load and
   only reads the durable attempts: an attempt still claimed after the shared reconcile minimum age
   is projected as orphaned with the existing Admin-gated `reconcile` control as its exact next
   action; the load never calls a service, a provider, or the store's write path.
3. **Attempt summary.** The workspace current-action card shows `last confirmed step`, `last attempt`
   time and state, `blocker`, and `next action` from one projection over execution records and
   receipts.
4. **Isolation.** Existing per-lease claims remain; the desk continues to render other leases when
   one lease is `ambiguous` or `blocked`.
5. **Recorded conflict.** Automatic retry of a failed or uncertain provider write and unattended
   chaining of steps conflict with the permanent safety boundaries. The suite keeps the project's
   rule; the operator retries through the existing exact re-confirmation.

**In scope / out of scope.**

In scope: detached completion, load-time read-only projection of orphaned attempts, attempt
summary, tests for interruption and
duplicate delivery. Out of scope: a queue vendor, worker, scheduler, autonomous retry, or
model-triggered effects.

**Open questions & assumptions.**

None. The conflict above is recorded, not reopened.

**Cross-product impacts.**

S97/S98/S34 execution routes and stores, workspace card, desk guidance, S111 proof.

**Authority and evidence map.**

| Input                                                                 | Classification                   | Use and limitation                                                                      |
| --------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------- |
| `AGENTS.md` permanent safety boundaries, effect model, S97/S98 stores | Authority / implementation truth | No autonomous or blind retry; one attempt per confirmation; receipts before projection. |
| Owner package PMI-07                                                  | Intent evidence                  | Continuation, restart recovery, duplicate safety, isolation.                            |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S107-1** — Effect routes complete independently of the client connection; a source check
  proves no effect route forwards the request's abort signal into execution, and a confirmed effect
  is recorded before any projection.
- **ARCH-S107-2** — One read-only continuation projection covers S97 and S98 attempts (S34 has no
  runtime effect route); it issues no store or provider write.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S107-1** — An attempt interrupted after the provider call is shown on the next load as
  orphaned, with the Admin-gated reconcile as its exact next action; after an Admin reconciles it, it
  reads `succeeded` with its receipt or `ambiguous` with a visible next action. The load itself
  changes no record.
- **BEH-S107-2** — Two concurrent confirmations, or one replayed request, produce one provider
  effect and one receipt.
- **BEH-S107-3** — A lease in `ambiguous` state does not change another lease's status or actions.

**Human litmus outcome.**

### Confirm, close the tab, and find it done

**If this was built correctly:** The operator confirms an update and closes the browser. Later the
lease shows the update as done with its receipt, or says exactly what is uncertain and what to do.
Clicking confirm twice never doubles anything, and another lease keeps working.

- Model verdict: PASS - why: the abort, replay, concurrency, and two-lease isolation fixtures run
  against the real orchestrator and memory store: a request that ends before the provider call
  leaves the record `ready` with attempt count 0 and reconciles nothing; a caller that abandons the
  request still gets a persisted receipt because no route forwards an abort signal into execution;
  two concurrent confirmations and one replayed confirmation each yield one provider call and one
  receipt; and one lease left `ambiguous` leaves the other lease `ready` with an empty summary.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                          | Architecture outcome | Behavior outcome | Human litmus                             | Deterministic evidence / falsification    |
| ------------------------------------ | -------------------- | ---------------- | ---------------------------------------- | ----------------------------------------- |
| AUTO-01, AUTO-02 continue and resume | `ARCH-S107-1`        | `BEH-S107-1`     | Confirm, close the tab, and find it done | Aborted-request and restart fixtures      |
| AUTO-03 duplicate delivery           | `ARCH-S107-2`        | `BEH-S107-2`     | Confirm, close the tab, and find it done | Concurrent and replay fixtures            |
| AUTO-04, AUTO-05 failure/isolation   | `ARCH-S107-2`        | `BEH-S107-3`     | Confirm, close the tab, and find it done | Ambiguous-lease two-lease fixture         |
| AUTO-06, AUTO-07 controls/staleness  | `ARCH-S107-2`        | `BEH-S107-2`     | Confirm, close the tab, and find it done | Existing reconcile routes; S105 staleness |

**Preservation set.**

S97/S98/S99 execution, claim, and reconcile suites; S77 preview/confirm; desk guidance tests.

**Adversarial acceptance checks.**

- **AC-S107-1** — `ARCH-S107-2`: reconciliation cannot issue a provider write.
- **AC-S107-2** — `BEH-S107-2`: no path yields two receipts for one confirmation.
- **AC-S107-3** — `ARCH-S107-1`: a disconnect before the provider call leaves no attempt claimed as
  succeeded.
- **AC-S107-4** — No scheduler, worker, or autonomous retry is added.

**Forbidden actions / hard gates.**

No blind retry, no autonomous chaining, no queue platform, no send, no model-triggered effect.

**Dependencies / sequencing.**

After S105 and S34; before S111.

**Standalone delivery contract.**

- **Deliverable now:** detached completion, load-time read-only projection, attempt summary,
  fixtures.
- **Consumes, but does not assume:** S34 execution records; absent records reconcile nothing.
- **Externally blocked effect:** none.
- **Produces for downstream suites:** the attempt summary S111 verifies.

**Verification and delivery contract.**

1. Freeze abort, replay, and isolation fixtures failing for the expected reason.
2. Run focused route, store, and workspace checks.
3. Run `bash scripts/verify.sh` and `npm run test:e2e:core`.
4. Report `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only with an explicit budget, or `BLOCKED` (not
   expected).

**Ordered prompt sequence.**

1. Re-verify claim and reconcile stores.
2. Materialize fail-first abort and replay fixtures.
3. Implement detachment, reconciliation, and summary.
4. Run focused and canonical checks; update current docs.

**Deletion/merge recommendation.**

Merge into `docs/integration-architecture.md` effect model once deployed and read back.
