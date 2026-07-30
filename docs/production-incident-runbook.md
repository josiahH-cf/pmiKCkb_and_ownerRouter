# Production incident runbook

This runbook applies to the bounded Production pilot. It records the incident contract settled in
D14 and the containment sequence used by the Admin action-stop control. It does not authorize a
client-facing send, a system-of-record write, a cloud change, or a broader Action Registry gate.

## First action

For a Sev-1 incident, stop the affected Production action in the Admin action-stop panel first. Do
not wait for a deploy. If the affected action cannot be isolated, use the global stop for all
listed provider actions. A deploy or revision rollback is a remedy after containment, not the first
stop.

If the Admin panel itself is unavailable, declare a manual operational stop immediately: tell all
staff to stop initiating app actions, record the opaque incident reference, and escalate to Josiah.
Use only a documented provider-specific disable/revoke procedure or the captured exact-revision
rollback when its D05 preconditions pass and it is known to contain the cause. Do not improvise a
Firestore write, IAM change, credential action, or guessed cloud command. This fallback is not
equivalent to a verified runtime stop, so the incident remains Sev-1 until containment is read back.

The action stop blocks new provider actions. It does not erase an attempt, disconnect a provider, or
block read-only reconciliation of an already consumed ambiguous attempt. Preserve the receipt and
audit trail. Never make a blind second provider attempt.

## Sev-1: client-visible or containment-required

Treat any of these as Sev-1:

- wrong client-facing output was delivered;
- a system-of-record write is wrong;
- a Live execution is ambiguous, so the provider outcome is unknown; or
- the app is unusable for staff.

The acknowledgement window is 30 minutes during business hours and the same business day
otherwise. Acknowledgement means an operator has seen the incident, started containment, and
recorded an opaque incident reference. It does not mean the incident is already fixed.

## Sev-2: degraded but contained

Treat any of these as Sev-2 when there is no client-visible effect:

- elevated 5xx responses;
- a failed Live effect that reached no client;
- a connector outage; or
- a stale synchronization.

The acknowledgement window is one business day. Escalate to Sev-1 immediately if a client-visible
effect, wrong system-of-record write, ambiguous result, or loss of staff access is discovered.

## Same-day Dan reporting rule

Report any wrong client-facing output to Dan on the same day it is discovered. This rule applies
regardless of severity, whether the output was already corrected, and whether a client noticed.
Reporting is required in addition to containment and correction.

## Contain, recover, and verify

1. Stop the exact Production action in Admin. Use the global stop only when the affected action
   cannot be isolated. If Admin is unavailable, invoke the manual operational stop and escalation
   above; do not claim containment until a documented stop, disable, or rollback is verified.
2. Preserve immutable execution and audit records. Mark an ambiguous Live result for
   reconciliation and do not retry the provider action.
3. Revoke or disable an affected credential, account, session, watch, or job only through its
   documented owner-approved procedure.
4. If the application revision is part of the incident, use the S51 rollback rehearsal procedure to
   restore 100 percent traffic to the captured prior revision. Preserve the service and revision
   history.
5. Reconcile provider state using the idempotency key or provider reference and readback. Apply only
   the documented correction operation.
6. Verify sign-in, environment separation, the affected action's closed state, and the relevant
   read-only recovery path.
7. Clear a runtime stop only after the cause is resolved. The Admin must confirm the exact current
   action key and the current stop generation.

## Repository evidence boundary

Repository evidence may contain only sanitized metadata:

- timestamps;
- severity;
- opaque incident reference;
- affected action key;
- containment and resolution state;
- revision names;
- HTTP status codes and counts; and
- an approved external evidence reference.

Do not put a customer or recipient name, address, unit, message, provider payload, response body,
token, credential, or other customer value in git. Raw incident detail stays in the approved
external incident system.
