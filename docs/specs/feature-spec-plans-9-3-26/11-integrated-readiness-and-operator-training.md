---
spec_id: PMI-11
sequence: 11
title: Integrated Model-Driven Proof and Operator Training Guide
depends_on:
  - 01-renewal-data-contract.md
  - 02-lease-term-and-renewal-eligibility.md
  - 03-renewal-desk-and-workspace.md
  - 04-end-to-end-renewal-workflow.md
  - 05-dotloop-connection-and-capability-discovery.md
  - 06-dotloop-renewal-packet-lifecycle.md
  - 07-unattended-renewal-orchestration.md
  - 08-maintenance-sync-blockers-and-approval-routing.md
  - 09-maintenance-ai-intake-and-troubleshooting.md
  - 10-dashboard-assistant-v1.md
---

# Integrated Model-Driven Proof and Operator Training Guide

## End state

The implementation model proves that the completed features work together in the actual application and produces a practical training guide that Bailey and Chasity can use to practice the renewal workflow. Product completion does not depend on a human verification gate.

## Required behavior

### Integrated proof

Use the repository’s own test, browser, provider-fake, sandbox, and execution conventions. Build the smallest additional integration coverage needed to prove these outcomes on one coherent application state:

1. **Renewal foundation:** actual current rent is correct; market rent does not replace it; lease term and eligibility are consistent; table and workspace agree; filters and return context work.
2. **Fixed-term renewal:** a representative eligible lease moves through verification, owner decision, proposal, approval, Dotloop packet or supported handoff, RentVine and operating-sheet updates, tenant communication, and truthful completion.
3. **Alternate renewal paths:** missing or conflicting rent, needs-review lease term, owner revision, decline, no response, missing recipient, unavailable Dotloop resource, provider failure, and uncertain external result each stop at the correct visible state.
4. **Dotloop authentication lifecycle:** connect, deny or callback failure, token expiration and refresh, loss of access or disconnect, reconnect, profile/template readiness, packet creation, repeated execution, and status refresh are all exercised by the model. Use a model-operated live or sandbox account when available; otherwise use the project’s full provider contract harness and report the missing live environment as unverified rather than delegating proof to a person.
5. **Unattended continuation:** closing the page, restarting the worker, repeated delivery, and a blocked lease do not lose work or duplicate effects.
6. **Maintenance:** RentVine synchronization, duplicate protection, blocker reporting, preapproval routing, resident photo intake, flooding, fire, normal follow-up, and vetted troubleshooting work together.
7. **Dashboard assistant:** the three supported questions return the same records and states as their owning application views and remain read-only.

## Proof expectations

- Inspect the actual repository and use its existing feature lifecycle and loop behavior.
- Reuse checks that already prove an outcome; add only missing coverage.
- Exercise owning services rather than setting final states directly in fixtures.
- Include failure and recovery paths that can expose duplicate, stale, disconnected, or falsely completed work.
- Record exact passed, failed, unavailable, and environment-limited outcomes. Do not convert an unavailable live provider account into a human verification task.

## Operator training guide

Create a project-native guide for a future screen-sharing session in which Bailey and Chasity drive the application. The guide should use safe training data or an established test environment and include:

1. How to open the renewal worklist and filter to the current cohort.
2. How to read current rent, market-rent reference, lease term, renewal timing, blocker, and next action.
3. How to open a lease and return without losing the working set.
4. How to resolve or route a rent discrepancy and a lease-term review case using the actual application controls.
5. How to record the owner decision, prepare the proposal, complete approval, create or open the Dotloop packet, and follow any Dotloop signature handoff.
6. How to understand background progress, retry or reconciliation states, and lease-specific blockers.
7. How to recognize a completed renewal and where RentVine, the operating sheet, communication, and Dotloop results appear.
8. A small set of practice cases and reset instructions that do not require source-code knowledge or direct data edits.

The training guide is an implementation deliverable. The future training session may reveal later improvements, but its completion or human sign-off is not a condition for the model’s implementation proof.

## Model-run acceptance evidence

- **READY-01:** One complete fixed-term renewal passes through all implemented stages using the actual application boundaries.
- **READY-02:** The alternate renewal cases stop at the expected state and recover through the documented next action.
- **READY-03:** Dotloop authentication and packet lifecycle scenarios are fully exercised by the model with exact environment limitations stated.
- **READY-04:** Background interruption and repeated delivery do not lose work or create duplicates.
- **READY-05:** The integrated maintenance and AI intake scenarios produce the same ticket, blocker, approval, evidence, and next-step state across the application and RentVine boundary supported by the provider harness.
- **READY-06:** The three Dashboard questions match their owning views and execute no writes.
- **READY-07:** The generated training guide maps every step to a real application control and observable result and requires no developer-only workaround.

## Outside scope

- Human pass/fail verdicts as an implementation gate.
- LeadSimple and unrelated roadmap work.
- Copying meeting transcripts, personal scheduling, or implementation-history material into the training guide or proof package.
