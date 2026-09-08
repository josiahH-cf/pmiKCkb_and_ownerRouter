# Wednesday decisions and missing inputs

**Meeting source:** User-supplied meeting identity; not Calendar-verified. Prepared for Wednesday,
9 September 2026. Use this as the decision record during the call; named assignees and due dates
are to be agreed, not already committed.

## Three inputs to leave the meeting with

| Input                                | Who should own it                            | Exact handoff                                                                                                                                                                                                                                  | Accepted when                                                                                                                                                      | Named owner / due date |
| ------------------------------------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Approved renewal forms (B-DL3)       | Client forms owner, with Josiah coordinating | A private source location, approved version and coverage of standard lease, renewal extension, animal agreement, lead-based-paint disclosure, city addendum, HOA artifact and owner acknowledgment; field, participant and signature mappings. | Each required family resolves to approved content and verified mappings. A filename alone does not establish approval.                                             | To agree               |
| Resident reply example (B-S100)      | Maintenance operator                         | One work-order identifier with an actual resident chat message and a verified resident email. Provide it privately.                                                                                                                            | The exact work-order link and manual synchronization resolve an eligible resident message; the separate bounded draft proof and activation can then be considered. | To agree               |
| Property preapproval policy (B-MNT1) | Client policy owner and Admin                | Exact property identifiers, one preapproval amount per property and effective dates.                                                                                                                                                           | An Admin confirms the exact records and readback; missing or conflicting evidence continues to require owner approval.                                             | To agree               |

## Provider and release dependencies

| Dependency                         | Owner                          | Current state and next evidence                                                                                                                                                                                                             |
| ---------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dotloop OAuth credentials (B-DL1)  | Dotloop, coordinated by Josiah | Requested 4 September; client bindings are absent from the latest runtime readback. Delivery must use the recorded private binding path. No follow-up message was sent by this task.                                                        |
| Managed Dotloop connection (B-DL2) | Managed account owner          | Connect after credentials arrive; select a verified office profile, renewal template, transaction type and initial status. Readiness does not itself authorize loop creation or upload.                                                     |
| Release assurance (B-AUTH2)        | Josiah / release operator      | Local CLI and ADC refresh work after reboot. Still require existing Admin and Editor profiles on both exact origins, the candidate receipt, promotion and five-minute observation. The 24-hour authentication proof is also pending.        |
| October walkthrough lease          | Renewal operator / Josiah      | A provisional reading example is selected privately from ten October leases with complete detail reads. Verify its Sheet association and workflow evidence; retired proof targets are excluded. Selection does not authorize a transaction. |

Both Dotloop effect keys and the resident-reply draft key remain closed. S100 completion precedes
the temporary S36 pilot. The previous B-GOLD1 test hold is closed after owner review; it is not a
client input.

## Questions with a working default

| Decision                                                  | Default until a decision is recorded                                                                                                    | Meeting response     |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Should a monthly renewal answer include periodic reviews? | Keep lease-end-month results separate from periodic-review rows.                                                                        | To confirm           |
| Should annual review keep rolling forward?                | Use the next anniversary on or after the current month.                                                                                 | To confirm           |
| What counts as success at the next acceptance session?    | Staff can find one real lease, explain source conflicts, review the eligible unsent draft and identify the exact packet stopping point. | Agree owner and date |

The owner already confirmed Editor with all Spaces for claim-less managed accounts. No role change
is proposed. The internal questions about retired Demo sign-in domains and future candidate-domain
pruning remain in [the facts ledger](../facts.md); this release may replace only its superseded
candidate domain.

## Closeout record

Record each decision, a named accountable person, the private evidence destination and the agreed
due date during the meeting. Leave an unanswered item open. Source values, contact details, customer
documents and policy amounts stay outside Git. [The blocker register](../open-blockers.md) owns the
technical completion gates; [the client checklist](../client-checklist.md) owns the runtime inputs.
