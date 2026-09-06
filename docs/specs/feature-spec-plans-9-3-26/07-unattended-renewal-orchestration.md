---
spec_id: PMI-07
sequence: 7
title: Unattended Renewal Workflow
depends_on:
  - 04-end-to-end-renewal-workflow.md
  - 05-dotloop-connection-and-capability-discovery.md
  - 06-dotloop-renewal-packet-lifecycle.md
---

# Unattended Renewal Workflow

## End state

Renewal work can continue in the background after the initiating page closes. The workflow resumes after interruption, retries recoverable failures without duplication, isolates blocked leases, and leaves each renewal in a truthful, visible state.

## Source-grounded requirements

- The planning goal explicitly calls for an accurate, stable unattended workflow that continues in the background and is unblocked before the implementation loop runs.
- Dotloop connection and packet behavior must be known before background renewal work depends on them.
- The completed workflow must be reliable enough to run end to end and support operator training.

## Required behavior

1. Use the project’s existing background job, queue, scheduler, or loop mechanism. Do not add a second orchestration platform when one already owns durable work.
2. Persist enough per-renewal progress to continue from the last confirmed step after a worker or process restarts.
3. Bind background work to the current renewal/proposal identity so old work cannot execute after the renewal changes.
4. Make repeated delivery, retry, and concurrent pickup result in one effective action for each external step.
5. Retry transient provider or network failures according to the project’s existing policy and stop at a visible blocker for non-recoverable or ambiguous results.
6. Continue processing unrelated eligible leases when one lease is waiting for data, an owner decision, Dotloop readiness, provider recovery, or reconciliation.
7. Keep current background state, last confirmed step, blocker, last attempt, and next action visible in the owning renewal view.
8. Reuse existing pause, resume, retry, or reconcile controls where they already exist. Do not create a parallel control model solely for this feature.
9. Close or recover abandoned work using the project’s normal stale-job behavior rather than requiring direct database edits.
10. Allow an operator to leave the page without keeping a browser session open for the work to continue.

## Project integration

- Adapt to the current project loop and lifecycle conventions.
- Use the existing renewal, Dotloop, RentVine, sheet, and messaging step implementations.
- Do not encode a new global terminal-state or governance scheme in the feature.

## Model-run acceptance evidence

- **AUTO-01:** Start a renewal job, close the initiating page, and prove the job continues through its next eligible steps.
- **AUTO-02:** Terminate and restart the worker between steps; the renewal resumes from confirmed state without repeating completed external effects.
- **AUTO-03:** Deliver the same work more than once or race two workers; only one effective packet, write, sheet entry, or message is produced.
- **AUTO-04:** A transient Dotloop or RentVine failure retries and recovers; an unresolved result stops only the affected renewal with a visible next action.
- **AUTO-05:** A blocked renewal does not stop another eligible renewal from progressing.
- **AUTO-06:** Existing pause, resume, retry, or reconcile controls remain connected to the actual background work when those controls exist in the application.
- **AUTO-07:** Changing the proposal while older work is queued prevents the older work from executing.

Run these interruption and concurrency cases through the repository’s normal test harness or model-operated local environment.

## Outside scope

- Introducing a new queue vendor or distributed workflow framework without a project requirement.
- Choosing renewal terms automatically.
- Blocking all work because one provider or lease is unavailable when independent work can continue.
