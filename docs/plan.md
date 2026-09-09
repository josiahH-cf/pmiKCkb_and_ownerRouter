# Current plan

Updated: 2026-09-09.

## Outcome

Give a first-time operator one reusable, visual guide for any lease, plus a simple agenda,
blocker sheet and delivery readout. The Wednesday meeting is user-supplied; time and attendees
are unverified. The proposed agenda is 45 minutes.

| Deliverable                                                            | Purpose                                                    | Acceptance                                                                                   |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [Training guide](products/renewal-client-walkthrough-2026-09-09.md)    | Click, check the result, know the next step or exact stop. | Real labels and phase links; lease-agnostic; diagram, branches, recovery and current limits. |
| [Agenda](products/client-call-agenda-2026-09-09.md)                    | What we did, what we show today, what comes next.          | Short timed sequence; assign decisions and follow-up.                                        |
| [Blocker sheet](products/wednesday-decisions-and-inputs-2026-09-09.md) | Explain impact and obtain exact missing inputs.            | Suggested owner, resume condition and a private record for names/dates.                      |
| [Delivery readout](products/wednesday-delivery-readout-2026-09-09.md)  | Separate delivered behavior from pending work.             | Current evidence; measurable completion and repeatability criteria.                          |

The Markdown documents are maintained sources. docs/products/build-renewal-handouts.py renders
a printable training guide and meeting brief in output/pdf. The guide uses schematic navigation,
not customer screenshots. The prior presentation is not the training source.

## Current implementation baseline

The canonical public endpoint still serves d243911cb20ffb01773072c0e27c723648eeea34 /
pmi-kc-app-rmtkmhj1z-8855e4c6dbfb. The new candidate endpoint serves
6e77d18f6d9916ba94078550d4b5ba73751e86c8 / pmi-kc-app-rmtt039q1-c1463245a94c.
Both were read on September 9. The watcher is in assurance and blocked on authentication.
CLI and ADC now require reauth. The 24-hour proof, managed-browser receipt, promotion and
observation are not complete. See docs/loop-state.md for the exact candidate fingerprint.

S96 — safe connector disconnect and reconciliation is serving. The candidate retains the
reviewed provider-revoke/readback extension without claiming a live Dotloop proof.

## Canonical closure sequence

1. Restore the approved authentication, finish release assurance and resolve B-REH1 browser
   failures on the intended origin. Preserve unchanged timing limits and meaningful assertions.
2. Close B-FLOW1: connect sent owner-message evidence to the response, mount the normal governed
   packet path, and connect real provider/signature/compliance evidence to verified completion.
   A legacy local completion marker or arbitrary evidence input is not a substitute.
3. Resolve approved forms/mappings and Dotloop inputs through B-DL1/B-DL2/B-DL3, then complete the
   exact bounded provider proof and activation gates. Forms alone do not finish implementation.
4. Have a new operator follow the guide on varied real cases. Record time, failures, repeated
   clicks and last verified step privately. Agree the throughput target after measuring baseline.
5. Handle maintenance inputs B-S100 and B-MNT1 separately. S36 is queued behind complete S100.

## Authority and closed decisions

B-GOLD1 is closed with the approved label correction and unchanged assertions. The green
implementation and documentation foundation are pushed; no history rewrite or branch deletion.
The owner-authorized local auth scope, exact action keys, roles, preview/confirmation, receipts,
readback and correction remain mandatory. No new identity, IAM, claim, cost or send grant.
Claim-less managed accounts remain Editor with all Spaces.
Completed S97-S99 and S100 chat proofs are not rerun. The corrected S98 path
refuses fixed-row update/delete/restore; it preserves only the bounded normal append.

## Per-suite delivery rule

Push only a green slice. Code release uses exact-SHA CI, isolated candidate smoke, configuration,
domain readback, managed-browser receipt, exact promotion and 300,000 ms observation.
Documentation-only changes do not deploy. Authentication pauses only dependent work.

The wider queue remains S100, S36, S88-S92, S94, S93 and its integration gate, S95, S87, then S101.
S87 — final six-cohort product-wide content reconciliation retains its dependency gates.
The completion program precedes S36. ALL_GATES_GREEN requires all actual live acceptance gates.
