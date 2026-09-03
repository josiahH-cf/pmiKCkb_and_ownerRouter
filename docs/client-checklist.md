# Client, owner, and provider execution inputs

Updated: 2026-09-02.

All product-scope and authority questions for the canonical queue are closed. This file lists only
fresh runtime evidence that an implementing runner must resolve and validate; none is permission to
guess, substitute a record, or stop unrelated closed-safe work.

## Recorded owner decisions

- Production is Live-only. Use real source-backed values; never create a fake person, lease, work
  order, message, or customer value.
- The app updates in-scope systems of record only through exact active keys and their human-
  initiated preview/confirmation/receipt/readback contracts; no broad or sibling key inherits that
  authority.
- S97's three bounded proofs are complete and its exact renewal-date, recurring-charge-create, and
  recurring-charge-update keys are active. The designated proof lease must not be reused for another
  proof merely because it was the authorized test target.
- S98's bounded operating-Sheet proof is complete, both exact Registry keys remain open, and the
  temporary proof row was deleted and read back absent. Do not create a replacement proof row. The
  hardened normal product path is append-only; field update/delete/restore report unavailable until
  Google Sheets exposes the required stable logical-row and expected-generation operation.
- S99's bounded work-order proofs are complete and its exact read/create/status-update keys are
  active. Proof work order 1731 is already in its final `Cancelled` state and is not a future target.
- S100's manual authenticated inbound work-order-chat synchronization is active. Its unsent Gmail
  resident-reply draft key remains closed until one synchronized resident message maps to a verified
  resident email in the signed-in user's connected managed mailbox.
- S36 runs one temporary provision/import/query/readback/retirement pilot and restores the original
  eleven-store/config baseline.
- Dotloop is the next integration under the owner's 2026-09-03 renewal-completion direction (S106
  connection, S34 packet lifecycle). LeadSimple remains deferred to a later separately grounded scope.
- Month-to-month leases are reviewed twelve months after their month-to-month anchor date (owner
  direction 2026-09-03); the cadence drives in-app review visibility only.

## Renewal-completion inputs (S102-S111, S34, S106)

| Input                                                                               | Needed by   | Refusal rule when absent                                                                          |
| ----------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| Dotloop OAuth application (client id, secret, redirect URI) bound in Secret Manager | S106, S34   | Connection shows `credentials_not_configured`; only the live readiness/packet proof is `BLOCKED`. |
| A connected managed Dotloop account with the office profile and renewal template    | S106, S34   | Readiness reports `missing_resources`; fake-provider proof still completes.                       |
| Approved S66 artifact catalog                                                       | S34         | Packet creation stays blocked at `document-packet`.                                               |
| Property preapproval amounts entered by an Admin                                    | S108        | Every ticket waits on owner approval as today.                                                    |
| Reviewed troubleshooting links and required-evidence table                          | S109        | No resource is offered; default evidence table applies.                                           |
| Two authenticated managed Admin/Editor browser profiles                             | S51 release | Candidate assurance and promotion cannot run; the zero-traffic candidate waits.                   |

## Runtime evidence by suite

| Suite | Resolve immediately before the bounded effect                                                                                                                                                                                                                                      | Refusal/closeout rule                                                                                                                                                                                                                                                    |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S97   | For each normal action: current managed Admin/Renewals actor, exact account/lease/charge target, source-backed proposed values, fresh before read, exact preview/confirmation, runtime-suspension clearance, and active exact-key readback                                         | Stop on any target/state/actor/key/value drift; never infer a charge or term; every reversal/correction needs a new exact confirmation and readback. Completed proof phases and targets are not rerun.                                                                   |
| S98   | For a normal append: current managed Admin/Renewals actor, operating workbook/tab/schema/header identity, fresh one-to-one lease absence, server-derived source values, exact preview/confirmation, write-switch and active-key readback                                           | Stop on header, identity, source, proposal-generation, or recovery drift. Never rerun proof mutations or use fixed-row field update/delete/restore; correct an append manually from its receipt/destination until a separately reviewed stable-row provider seam exists. |
| S99   | For each normal action: current managed staff actor, RentVine account, official work-order/status/priority catalogs, exact ticket/property/unit/work-order mapping, fresh target state or exact create proposal, and exact preview/confirmation                                    | Never hardcode provider ids, send notifications, assign a vendor, attach a file, or post chat; correction must use the exact receipted work order. Do not reuse proof work order 1731 as a proof target.                                                                 |
| S100  | For manual chat sync: current managed actor, exact account/work-order/message identities, and disclosed mark-read effect. For the one remaining resident-draft proof: a synchronized resident message mapped to a verified resident email plus the signed-in managed Gmail mailbox | Manual sync only; deduplicate by account/message id; unmapped events go to review; no webhook/polling/chat post/direct send. The draft proof cannot run until the exact eligible message exists.                                                                         |
| S36   | Managed Admin, deterministic saved Space request, one existing approved source object selected by the suite rule, temporary copied-object generation/hash/schema/expected document ids/count, preview/expiry                                                                       | Retire only the exact temporary store, delete only the temporary copy, preserve the source object, prove eleven stores and flag false                                                                                                                                    |

## Existing policy inputs

- Renewal follow-up timing remains intentionally unset. No due time, reminder, task, draft, or send
  may be derived from a guessed schedule.
- RentCast keeps provider order and remains reference-only; no extra freshness/selection rule exists.
- Renewal/maintenance initiation ends with an unsent Gmail draft. A person edits and sends from
  Gmail; direct application send keys remain closed.
- Real human litmus observations are recorded as `NOT RUN — no human observer` when nobody is
  present; a runner or model never impersonates a reviewer.

## Delivery rule

Every provider/cloud/config mutation is human-initiated where the suite requires it, exact-previewed,
exact-confirmed, bounded to one target, claimed before the provider call, receipted, read back, and
separately reversible/correctable. S100's warned and confirmed manager-read marker is the sole
non-reversible stateful-read exception because RentVine documents no unread restoration. Unknown
provider outcome means reconciliation without blind retry.
Customer values, raw evidence, secrets, and mailbox bodies never enter Git or ordinary logs.
