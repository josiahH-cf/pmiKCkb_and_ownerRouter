# Renewal proof program — owner decision record, 2026-08-06

This is the citable provenance for the S57–S63 program. It records the owner's answers from the
2026-08-06 decision round, given in response to a numbered blocker packet after the 2026-08-05
Cherry Bridge + PMI call.

**Provenance and its limits, stated plainly.** The 2026-08-05 call itself is **not** committed to
this repository. It exists as a meeting recording and an auto-generated transcript held outside the
repo. Quotations attributed to that call in the S57–S63 specs are therefore **uncitable from the
repository alone** and should be read as reported speech recorded here, not as verifiable artifacts.
The owner answers below are different: they were given directly to the runner in text and are
reproduced faithfully. Where a decision rests on the call rather than on this record, the specs say so.

No client name, address, rent figure, or contact detail appears in this file.

## Decisions

| Id  | Question                  | Owner answer                                                                                                                                                                                                                               |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1  | Four-lease test set       | Sheet rows 507–510, sent 2026-08-03. Resolve and record exact RentVine lease ids and addresses. The two already-negotiated leases were deliberately NOT identified — do not infer them.                                                    |
| Q2  | Test-set pass condition   | Process **and** number. A numeric tolerance was **not** specified; record it as an unresolved acceptance value rather than inventing one.                                                                                                  |
| Q3  | RentCast sequencing       | RentCast goes live **before** the test set. First provide explicit setup instructions and establish it as a stable, repeatable process across eight named areas.                                                                           |
| Q4  | MKD rule                  | Produce an Admin-approvable suggestion labeled as an owner-policy rule, keyed on the RentVine portfolio id. It must not set the offered rent without approval.                                                                             |
| Q5  | MKD owner email           | **Reversal.** The prior premise is incorrect. MKD owner recipients **are** emailed, and that communication is included in the process test. No outreach-skip path. Update all stale notes.                                                 |
| Q6  | Owner recipients          | Cc all owners of record, mirroring the shipped tenant behavior. Tie behavior and the structural separation test were **not** answered — keep both visible as unresolved.                                                                   |
| Q7  | RentCast credentials      | One shared company key with caching and a usage counter. Stability first. Per-user accounts may be evaluated later; do not build that subsystem now. Trend presentation format left open.                                                  |
| Q8  | Bailey's access           | Make Bailey an Admin **now**, accounting for the role change taking effect on next sign-in.                                                                                                                                                |
| Q9  | Program authorization     | Authorized. Add a standing-grant section to `AGENTS.md` scoped to: the four-lease test set; RentCast integration and validation; owner and tenant recipient handling; owner-policy rules. Update all governance materials for consistency. |
| Q10 | Hard-refresh depth        | Field-map validation, live Sheet read, fresh golden capture, and a frozen pre-test snapshot. Plus define ongoing refresh behavior across eight named areas, and never conflate the frozen snapshot with the live view.                     |
| Q11 | Evidence location         | A Firestore record per lease **and** a report artifact for Dan. Whether Dan inspects evidence in-app was not specified.                                                                                                                    |
| Q12 | Cohort enforcement        | Procedural, via per-lease deep links. Do not build a code boundary for this test.                                                                                                                                                          |
| Q13 | Approval relaxation axis  | **Per person.** A person-specific trust and authorization model, not a universal action-type relaxation.                                                                                                                                   |
| Q14 | Client-facing corrections | Draft the correction note **first**, covering reply handling, the RentVine "toggle" claim, notification email, and per-item approval relaxation. Ready before the training.                                                                |

## Nonblocking answers

| Id  | Item                       | Owner answer                                                                                                                                                                                                                                                                                                                |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | Under-market flag          | Build it as part of the RentCast integration. No threshold number was supplied.                                                                                                                                                                                                                                             |
| N2  | Date discrepancy           | Leave as-is. Do not restore the Sheet-versus-RentVine lease-date comparison.                                                                                                                                                                                                                                                |
| N3  | Product name               | Keep the current placeholder this cycle. The rename is out of scope.                                                                                                                                                                                                                                                        |
| N4  | Feedback triage            | Add a close control.                                                                                                                                                                                                                                                                                                        |
| N5  | Guardrail Node 20 upgrade  | Defer, keep visible for future handling.                                                                                                                                                                                                                                                                                    |
| N6  | Contact-by-topic directory | Defer until after the test set, but **explicitly record as future work** so it does not disappear from scope.                                                                                                                                                                                                               |
| N7  | Rent-suggestion clamp      | Prepare and include the repair in the owner-rules and RentCast-related slice.                                                                                                                                                                                                                                               |
| N8  | Local write-back flag      | A verified restorable backup must exist **before** any write-back or related flag change. The backup must not be deleted or overwritten, the test must be reversible, and none of this authorizes a RentVine write transport or destructive behavior. Sheet-write risk is not eliminated by the absence of RentVine writes. |

## Owner actions from the same round

- Google session refreshed, so live Google reads were available to the runner.
- The RentCast API key was supplied. It was **not** written to any file, command line, log, or this
  repository; the owner was given the Secret Manager paste-at-prompt procedure instead.
- Alert address: an alias preferred, with no new user and no new cost.
- Renewal notices come from whoever sends them, which is the existing per-user mailbox behavior.

## What this record does not settle

These stayed open by the owner's explicit instruction or by absence of an answer, and are tracked as
`Q-` rows in `docs/facts.md`: the rent-comparison tolerance; which two leases are already negotiated;
the equal-ownership tie behavior; whether the structural owner-tenant separation assertion is
required; the historical-trend presentation format; the under-market threshold; the named daily owner
for the test window; the MKD portfolio identifier and ownership structure; whether Dan inspects
evidence in-app; and whether Q5's direction extends to a reviewed human send during the test window.
