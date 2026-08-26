# Production incident runbook

Updated: 2026-08-26.

This runbook contains the current containment contract. It does not authorize a client-facing send,
system-of-record write, gate change, credential mutation, or improvised cloud action.

## First action

For a Sev-1 incident, stop the affected Production action in the Admin action-stop panel first. Do
not wait for a deploy. If the affected action cannot be isolated, use the global stop for all listed
provider actions. A deploy or revision rollback is a remedy after containment, not the first stop.

If the Admin panel itself is unavailable, declare a manual operational stop immediately: tell all
staff to stop initiating app actions, record an opaque incident reference, and escalate to Josiah.
Use only a documented provider-specific disable/revoke procedure or the captured exact-revision
rollback when its preconditions pass and it is known to contain the cause. Do not improvise a
Firestore write, IAM change, credential action, or guessed cloud command. This fallback is not
verified containment, so the incident remains Sev-1 until containment is read back.

The action stop blocks new provider effects. It does not erase an attempt or block read-only
reconciliation of an ambiguous result. Preserve the receipt/audit and never make a blind retry.

## Sev-1: client-visible or containment-required

Treat any of these as Sev-1:

- wrong client-facing output was delivered;
- a system-of-record write is wrong;
- a Live effect is ambiguous and the provider outcome is unknown; or
- the app is unusable for staff.

The acknowledgement window is 30 minutes during business hours and the same business day otherwise.
Acknowledgement means an operator has seen the incident, started containment, and recorded an opaque
incident reference. It does not mean the incident is fixed.

## Sev-2: degraded but contained

Treat elevated errors, a contained failed effect, connector outage, or stale synchronization as
Sev-2 when there is no client-visible or ambiguous effect. The acknowledgement window is one business
day. Escalate to Sev-1 if client impact, a wrong write, ambiguity, or loss of staff access is found.

## Same-day Dan reporting rule

Report any wrong client-facing output to Dan on the same day it is discovered. This applies whether
the output was corrected and whether a client noticed. Reporting is required in addition to
containment and correction.

## Contain, recover, and verify

1. Stop the exact Production action in Admin. Use the global stop only when isolation is impossible.
2. Preserve immutable execution and audit records. Mark ambiguity for reconciliation and do not
   retry.
3. Revoke or disable an affected credential, account, session, watch, or job only through its
   documented procedure.
4. If the serving revision is implicated, restore 100% traffic to the captured prior revision.
5. Read traffic back and smoke root, sign-in, protected routes, and exact version behavior.
6. Reconcile provider state using the idempotency key/reference and fresh provider readback. Apply
   only the documented correction.
7. Clear a runtime stop only after the cause is resolved and the Admin confirms the exact current
   action key and stop generation.

## Data and cost incidents

For destructive/broad data risk: backup, exact scope, dry-run, two-stage confirmation, and rollback
are mandatory. Do not use broad globs, unresolved environment variables, or guessed ids.

For cost risk, check the $25 alert, $100 project hard stop, $100 account backstop, function ACTIVE
state, Node.js 22 runtime, and cap 100. Restoring billing or lowering/removing a control requires owner
direction.

## Repository evidence boundary

Repository evidence may contain only timestamps, severity, opaque incident reference, affected
action key, containment/resolution state, revision names, HTTP status/counts, and an approved external
evidence reference. Never commit customer/recipient names, addresses, units, messages, provider
payloads, response bodies, tokens, or credentials.

## Closeout

Record root cause, affected revision/action, exact recovery, residual risk, and prevention in current
facts/status. Rewrite or delete every active document whose prior claim was disproved.
