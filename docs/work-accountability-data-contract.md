# Work accountability permitted-data contract

**Status:** implementation boundary for S68, approved 2026-08-10 and recorded 2026-08-11.

S68 records explicit internal assignments and user-started work sessions. It is not presence,
surveillance, payroll, performance management, or a replacement for the linked product workflow.
Anything not allowed below is prohibited.

## Permitted persisted records

| Record                            | Allowed fields                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Task                              | Opaque id; Space id; canonical source type/id/link and source or mapping version; task type; concise staff-entered title; assignee, assigner, and creator uid; exact state; next action; optional due time; required blocker/cancel/reopen reason; allowed outcome note; immutable expectation snapshot or not-set marker; optimistic version; created/updated/terminal times; S68 retention policy/version/expiry/legal hold. |
| Session                           | Opaque id; task id; staff uid; server start/end; Active/Ended; enumerated end reason; coarse last acknowledged in-app activity time; corrected effective start/end/minutes; correction/connection-review state; idempotency key hash; optimistic version; S68 retention fields.                                                                                                                                                |
| Task activity                     | Opaque id; task id; actor uid; enumerated action and prior/new state; reason code; required staff-entered reason when the transition contract allows it; optimistic/idempotency versions; server time; S68 retention fields.                                                                                                                                                                                                   |
| Correction                        | Opaque id; session id; task/staff identity; previous and new effective start/end/task association; actor uid; nonblank reason; prior/new versions; server time; S68 retention fields. The original session fields stay immutable.                                                                                                                                                                                              |
| Expectation or derivation mapping | Named task/source key; positive manager-set range or deterministic mapping fields; version/status/effective time; Admin uid/rationale; supersession and S68 retention fields. No employee duration is an input.                                                                                                                                                                                                                |
| Retention receipt                 | Opaque plan/receipt ids and hash; Admin uid; enumerated target collection/id pairs; counts; server time; result codes. No removed record body.                                                                                                                                                                                                                                                                                 |

## Permitted transient client signals

- A visible document may treat pointer, keyboard, touch, or scroll as one boolean indication that
  the person interacted in this app. The handler does not read the event object.
- The signal may schedule at most one heartbeat per minute for the already-explicit Active session.
- A heartbeat carries only session id/version. The server supplies the acknowledged time.
- The 13-minute warning and 15-minute cutoff derive from the last server-acknowledged time. Hidden
  documents send no heartbeat and claim no background activity.

## Permitted operational logs

Only task/session ids, already-authorized actor uid, enumerated transition/reason code, record
version, coarse duration bucket, response code, route name, and latency. The current implementation
emits no S68 application log by default.

## Prohibited collection, persistence, display, and inference

- No key values, typed content, DOM/input text, event type or frequency, target, coordinates,
  screenshots, clipboard, microphone/camera, browser/OS/app history, foreground/background app
  activity, IP/device fingerprint, Google Chat/presence, or raw heartbeat event.
- No linked customer record body, customer identity, free-text task/reason/note, or source content in
  logs, analytics, retention receipts, or derived aggregates.
- No implicit timer from sign-in, presence, focus, page open, edit, view, or last-sign-in metadata.
- No rank, leaderboard, score, inferred effort/quality, fastest/average/median-worker baseline,
  prediction, comparison between people, or employment/pay/discipline/scheduling recommendation.
- No provider action, send, external/system-of-record mutation, payroll/timecard export, or task
  completion side effect on the linked workflow.
- No indefinite S68 default retention and no shadow analytics copy after cleanup.

## Authority and access boundary

Editors and Approvers see/mutate only their own assigned tasks and sessions in permitted Spaces.
Admins manage team assignments, expectations, mappings, corrections, and bounded exact-confirmed
retention. Assignable identities come only from the active internal Firebase roster filtered to the
managed hosted domain; Vendor, personal, disabled, malformed-scope, customer, and service identities
are excluded. All S68 collections are server-only and stay denied to direct clients by the existing
default Firestore rule. A future explicit rule declaration or auth change is D12-protected.
