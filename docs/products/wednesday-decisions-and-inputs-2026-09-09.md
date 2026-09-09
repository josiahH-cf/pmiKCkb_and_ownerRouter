# What is blocking us, and what we need

**Meeting source:** User-supplied meeting identity; not Calendar-verified. Wednesday, 9 September 2026.
Suggested owners are roles to assign. Names and dates are not yet commitments.

## Renewal blockers

| Blocker                                    | Impact / guide step                     | Next action and suggested owner                                                                                                                     | Resume when                                                               |
| ------------------------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Release and browser checks pending         | Reliable use of newer flow              | Josiah: restore sign-in, finish release checks and resolve slow/failed navigation.                                                                  | Intended build and actual browser journey pass.                           |
| Owner-message evidence not fully connected | Owner response; step 3                  | Implementation owner: connect the real sent message to the response step.                                                                           | A sent owner message enables the response with current verified evidence. |
| Dotloop access and setup incomplete        | Packet and signature handoff; steps 7-8 | Josiah/provider: obtain OAuth credentials. Account owner: connect and select office profile, renewal template, transaction type and initial status. | Setup reads ready and packet actions pass their separate checks.          |
| Approved forms and mappings missing        | Correct documents and signers; step 7   | Client forms owner: approved private source, version, applicability and field/signer mappings.                                                      | Required forms resolve to approved content and verified participants.     |
| Packet-to-completion click path unfinished | Verified finish; steps 7-9              | Implementation owner: finish preview/confirmation, provider evidence, signature return and completion controls.                                     | Real signed artifacts pass applicable completion checks.                  |

**Forms to cover:** standard lease, renewal extension, animal agreement, lead-based-paint disclosure,
city addendum, HOA artifact and owner acknowledgment. Approved rules determine which apply to each
lease; do not assume every lease needs every form.

## Side work and working defaults

| Item                  | Needed from whom                                                                                          | Scope                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Resident-reply draft  | Maintenance operator: one real work order with resident chat and verified resident email, privately.      | Blocks resident-reply and its dependent pilot, not every renewal. |
| Property preapprovals | Policy owner: property identifiers, amount per property and effective dates. Admin verifies and confirms. | Blocks that maintenance routing proof, not the renewal guide.     |
| Monthly renewal list  | Client decision if a change is wanted.                                                                    | Default: lease-end-month results separate from periodic reviews.  |
| Annual review date    | Client decision if a change is wanted.                                                                    | Default: next anniversary on or after the current month.          |

Keep side work out of the main walkthrough unless the client wants to decide it today.

## How to communicate a blocker

Use five facts: **where we stopped, what is missing, its impact, who supplies it, and what lets us
resume.** Record this in the approved private work record:

> We stopped at [step]. The app showed [message]. We need [item] from [person] by [date].
> Until then, [action] cannot proceed. We will resume at [step] after checking [evidence].

For example: "Packet creation is waiting on approved renewal forms and signer/field mappings.
Please provide the private approved source and version. We can resume packet verification once
those mappings are checked." This is prepared wording; no message has been sent.

## Leave with this record

| Decision or missing item  | Named owner | Agreed date | Private evidence location | Resume step and check |
| ------------------------- | ----------- | ----------- | ------------------------- | --------------------- |
| Assign during the meeting | To agree    | To agree    | To agree                  | To agree              |

Close an item after its evidence is checked. A promise alone does not close it.
Internal gates and identifiers: [blocker register](../open-blockers.md).
