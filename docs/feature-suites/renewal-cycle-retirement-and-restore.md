<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-ux-followup-2026-11 -->

# S255 — Retire and restore a renewal cycle

> Status: AUTHORING READY, intake 122. Owner-confirmed November 7 scope. Implementation and qualification await an execution instruction.

**Goal.**

An Editor can take a specific inactive renewal out of current work with a recorded reason.
The team can find it, understand why it was retired and restore it when appropriate.

**Current state / intended end state.**

At `ef81b891`, the shared target projection already excludes source-reported Closed and
Pending leases. The browser rehearsal showed ten synthetic closed leases in the counted
exclusion group. The staff work-status picker has no retirement option. The owner reported
additional inactive leases appearing in a November to December scope. The specific production
records were outside the rehearsal. A staff-confirmed retirement supplies an app-owned
disposition for one verified cycle while keeping its source state and history readable.

**Actors and entry conditions.**

An Editor or higher with the existing authority to edit the specific lease in Renewals
can retire or restore it. A reader within scope can see the disposition and audit. Use
the current server-resolved lease and renewal or annual-review cycle identity, and its
current revision. A missing or ambiguous identity offers an existing source check before
a disposition can be confirmed.

**What it is / how it functions.**

- **R-S255-1 — Retire the named cycle.** From S248's header work control, open a deliberate
  "Retire from renewals" action. Identify the lease and cycle, require a reason and show
  how retirement affects the desk, assistant and current renewal actions. Save only on
  explicit confirmation. Record the reason, authorized actor and timestamp. Show the
  resulting state beside the lease identity and in the Status log. Keep the explanation
  and focus on a failed or stale request. Cancel returns to the triggering control.
- **R-S255-2 — Resolve pending outgoing work first.** A current-cycle send or schedule that
  is still eligible to dispatch, or an in-flight or ambiguous attempt, holds retirement.
  Show the exact item and its existing Pause, Cancel or reconcile route as applicable.
  Confirm retirement only after the server establishes there is no pending dispatch.
  Retire and dispatch claims must enforce this invariant when they race, including stale
  tabs and scheduled workers. Existing external Gmail drafts and prior receipts stay
  inspectable with their actual status. Staff handle external drafts through their
  existing mailbox handoff. Retirement records an app disposition only.
- **R-S255-3 — Reflect the same disposition wherever staff look.** A retired current cycle
  leaves active renewal targeting and preparation, including batch and assistant results.
  Count it once under "Retired" and keep it findable in "All leases" and via its existing
  link. Show its reason and the distinct RentVine status. Keep historical records and
  existing collection membership. The collection row shows current retirement or a cycle
  change through S201's existing projection. New renewal send, schedule, Resume, linked
  reply or Gmail draft export for the retired cycle requires restoring it first. Viewing
  history, recording notes and legitimate independent source corrections keep their own
  applicable gates. An unreadable disposition remains visible as unavailable and holds
  automatic preparation and affected outgoing admission until it can be checked.
- **R-S255-4 — Restore a current retirement.** An authorized Editor can review and confirm
  "Restore to renewals" for the exact current retirement and record a reason. Retain both
  events in history. Recompute eligibility from current facts. A restored cycle may still
  be excluded for its source state or another applicable reason. A later verified cycle
  starts with its own eligibility. A stale restore shows the current cycle and leaves
  both cycles intact. Restoring never resumes a message or restarts a comparison by itself.

**In scope / out of scope.**

This is a cycle disposition within the app. Source status, actual tenancy closure,
document/signature evidence, old deliveries and future cycle eligibility retain their
own owners. The workflow uses the existing roles and action boundaries.

**Open questions & assumptions.**

The owner accepted Q2. The confirmed unit is the current cycle, even when the lease has
no existing work record. Resolve its identity through the existing lease/cycle evidence
used by desk, workspace and collections. The design must preserve that identity when
ordinary work is first recorded and distinguish it from a verified new cycle. An earlier
date correction to the same cycle retains the disposition. The reason is supplied by
staff at runtime.

**Cross-product impacts.**

S246 target partition, S247 path, S248 header and evidence history, S249 preparation and S201
collection status. Reuse the cycle evidence and scope in `lib/lease-renewal/renewal-target.ts`,
`lib/lease-renewal/cycle-source-date.ts` and `lib/lease-renewal/shared-collection-source.ts`.
Verify at the existing Communications and Gmail draft action owners. Keep the read-only
canary landmarks and independent reconciliation in step with any changed desk or lease
rendering under R-S252-7.

**Authority and evidence map.**

| Input                                                           | Classification              | Use and limitation                                                                   |
| --------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------ |
| `AGENTS.md`, current scope and exact-effect contracts           | Authority                   | The disposition is local and attributed. Existing provider admission stays in force. |
| `ef81b891` rehearsal, target projection and staff status picker | Browser and source evidence | Closed leases have a counted exclusion. The staff picker has no retirement.          |
| November 7 reported inactive records and accepted Q2            | Report and confirmed intent | An authorized Editor needs a reasoned and reversible current-cycle disposition.      |
| Existing cycle and schedule evidence                            | Runtime dependency          | Server reads establish exact cycle identity and whether dispatch is pending.         |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S255-1** — One versioned, cycle-bound disposition and history survive reload and
  retry. An active source lease with no workspace can acquire a disposition for its own
  verified cycle without minting a milestone. A different cycle resolves independently.
- **ARCH-S255-2** — The existing delivery boundaries consult the same current cycle
  disposition used by the target projection. Retirement cannot commit concurrently
  with a pending dispatch claim for that cycle.
- **ARCH-S255-3** — The shared target and status projections use the same scoped read.
  Incomplete reads preserve discoverability and communicate the exact uncertainty.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S255-1** — An authorized Editor records and reads back one retirement with its
  reason. A refused attempt preserves the prior state and usable input.
- **BEH-S255-2** — Staff can find retired work under the stated reason and count, reopen
  the record, and see it in a collection with the same saved membership.
- **BEH-S255-3** — A pending send routes staff to the existing safe action. A confirmed
  restore shows current eligibility and keeps prior evidence.

**Human litmus outcome.**

### Take an inactive renewal out of the work list

**If this was built correctly:** An Editor opens an inactive renewal, sees what will
happen, enters the reason and confirms retirement. A colleague can find it under Retired
and see why. If the decision is corrected, the Editor can restore the same cycle and
see what the latest lease facts now require.

- Model verdict: NOT RUN for the November 7 specification.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement               | Architecture outcome     | Behavior outcome | Human litmus                                  | Deterministic evidence / falsification                                                   |
| ------------------------- | ------------------------ | ---------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| R-S255-1 exact retirement | ARCH-S255-1              | BEH-S255-1       | Take an inactive renewal out of the work list | AC-S255-1. Save, read back, reload, retry and test stale or unauthorized actions.        |
| R-S255-2 pending sends    | ARCH-S255-2              | BEH-S255-3       | Take an inactive renewal out of the work list | AC-S255-2. Exercise scheduled, in-flight, paused and ambiguous attempts and concurrency. |
| R-S255-3 projections      | ARCH-S255-2, ARCH-S255-3 | BEH-S255-2       | Take an inactive renewal out of the work list | AC-S255-3. Compare desk, assistant, direct link and collection outcomes.                 |
| R-S255-4 restore          | ARCH-S255-1, ARCH-S255-3 | BEH-S255-3       | Take an inactive renewal out of the work list | AC-S255-4. Restore, change source status and advance the source cycle.                   |

**Preservation set.**

D-OP-5 automatic exclusions, S246 exact counts, S201 membership versions, S123 cycle
evidence, S164 staff history, all source facts, links, scoped permissions, exact review,
claim, receipt and recovery. An archived local state carries no completion or provider
claim.

**Adversarial acceptance checks.**

- **AC-S255-1** — Retire a verified fixture cycle with and without prior staff work. Check
  reason validation, Cancel, actor/time readback and repeat confirmation. Refuse a guessed
  lease, another scope, a reader and a stale cycle or revision.
- **AC-S255-2** — Race retirement against an ordinary claim and a due scheduled occurrence.
  An active or ambiguous attempt blocks retirement. After existing pause/reconciliation,
  retire and refuse an outgoing attempt from a stale tab. Retain every prior receipt.
- **AC-S255-3** — Compare target results and counted reasons across desk, assistant and
  direct lease read. Reopen a collection and compare exact member identities. Exercise
  unavailable retirement and unavailable source reads and verify actionable states,
  counts and zero new preparation or outgoing attempts for the retired cycle.
- **AC-S255-4** — Restore the current retirement and verify stage, counts and two history
  events. Exercise an earlier date correction and a verified later cycle. A stale
  restore changes neither cycle. The outcome follows current source facts and creates
  no message or lookup.

**Forbidden actions / hard gates.**

Preserve the exact provider contracts and authorization checks. Retirement and restore
create only the scoped app-owned record. Retain underlying records and receipts. Use
synthetic provider seams for qualification and protect all production inputs.

**Dependencies / sequencing.**

Consumes existing cycle identity, scoped staff recording and communication claims.
S248 supplies the preferred header entry. The disposition and admission can be verified
with an accessible lease action before the presentation revision. S246 and S201 consume
the same status through their existing projections.

**Standalone delivery contract.**

Deliver the action, audit, restore, current-cycle projection, dispatch refusal, recovery,
browser evidence and guide updates as one bounded slice. Verify it with local synthetic
leases and deterministic mail seams. A live inactive case is unnecessary for engineering
proof. A real staff verdict requires an actual staff observation.

**Verification and delivery contract.**

1. Record the preserved scope and falsify the acceptance cases against the starting behavior.
2. Exercise real routes and stores with synthetic actors and provider adapters. Walk the
   desktop and narrow browser journeys including keyboard and save recovery.
3. Run the focused and canonical verification gates, and reconcile Help and assurance
   contracts in the same implementation change.
4. Record `ALL_GATES_GREEN` only after each required gate passes. Use `BLOCKED` or
   `BUDGET_EXHAUSTED` only under the existing exact loop conditions.

**Ordered prompt sequence.**

1. Verify the exact cycle and communication owners and map refusal cases.
2. Prove fail-first projection, retirement, admission, and restore cases.
3. Implement and verify the bounded app disposition with its existing scoped controls.

**Deletion/merge recommendation.**

Keep the contract active until the requirements are represented by implementation tests
and current evidence. Keep the distinct meanings of retirement and source closure.
