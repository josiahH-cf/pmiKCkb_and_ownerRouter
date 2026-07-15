# PMI KC KB Product Lane

## Working V1

PMI KC KB is the deployed source-backed application and shared runtime for the three product
lanes. Its production V1 includes:

- Firebase staff authentication, Editor/Approver/Admin capabilities, optional renewal and
  maintenance scopes, user administration, and bodyless audit;
- Console, source-backed Ask, Spaces/process definitions, approval/attention, Notifications,
  Connections, Lease Renewals, Maintenance, Workflow Communications, and Admin;
- validated immediate publication with immutable versions and rollback;
- Live in-app records and persistent, visibly labeled Test records;
- S20 exact execution authority and per-action provider activation;
- Maintenance tickets and an external Vendor password/TOTP assigned-ticket workflow.

The production Console shows separate Live and Test projections. A failure in a Live source is
shown as unavailable and never filled with Test data. Test records use reserved aliases, write
real app/Firestore state, may reach Done, and cannot call providers or count as Live proof.

## Roles

| Role     | Product authority                                                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor   | Ask, edit app records, publish through the trust boundary, run in-scope workflows, and execute enabled Low/Medium work with required exact confirmation. |
| Approver | Editor capabilities plus app-plane decisions and permitted exact-confirmed workflow replies.                                                             |
| Admin    | Approver capabilities plus users/scopes, configuration, readiness, High-risk exact decisions, provider activation, and kill switches.                    |
| Vendor   | Separate external Firebase principal; assigned Maintenance tickets only, no internal Console/Spaces/Admin/DWD authority.                                 |

Technical Blocked conditions cannot be approved away. Admin self-approval is allowed only on the
exact current preview with a reason and cannot bypass missing provider/identity/source evidence.

## Primary Spaces and Workflows

- Lease Renewals
- Maintenance Work Order Intake
- Move-Out + Deposit Disposition
- Owner Onboarding

The app owns the central workflow-run record: human summary, status, next action, blocker,
owner, due date, timeline, decisions, receipts, and provider backlinks. Rentvine remains
authoritative for property/lease/contact/work-order facts; other providers retain their own
records.

Workflow statuses are `Not Started`, `In Progress`, `Waiting on Team`, `Waiting on Outside`,
`Blocked`, `Ready for Approval`, `Approved`, `Completed`, `Cancelled`, and `Failed`.

## Maintenance and Vendor

Live staff tickets are real app records. The canonical Test workflow uses:

- unit `unit:test-maple-204` / `TEST — 204 Maple Court Unit 2`;
- Vendor `vendor:test-summit-plumbing` / `Summit Plumbing Test Vendor`;
- email `service@summit-plumbing.example.invalid`.

It covers ticket creation, staff/Vendor assignment, notes/activity, statuses, explicit provider-
shaped Test actions, receipts, close, and reopen. Test actions show their target/effect, require
the exact confirmation phrase, contact no provider, and write non-Live receipts.

Admin can exact-preview and provision the canonical Test Vendor, show a one-response Firebase
password setup link, and exact-preview disable/revoke. The Vendor enrolls TOTP, signs in again
with password+TOTP, sees only matching Test assignments, and uses an app-only assigned-ticket
mailbox for drafts, labels, and exact-confirmed simulated replies. A Test principal cannot reach
OAuth or Gmail construction.

A Live Vendor additionally needs a routable verified email and same-address OAuth/vault before
that Live mailbox action can be activated.

## External Actions

The Action Registry reports each action independently as unavailable, Test-ready,
Live-configured, Live-proven, enabled, or suspended.

A Live write/send requires:

1. documented provider semantics and authoritative target mapping;
2. least-privilege identity/credential storage;
3. exact action/target/effect preview;
4. role-specific human confirmation or Admin decision;
5. one deterministic claim and idempotency;
6. bodyless receipt/readback and reconciliation;
7. monitoring, kill switch, and correction/rollback.

When those are unavailable, the complete Test path remains usable; no endpoint or customer value
is invented for Live.

## Sources and Publication

Editors may add in-scope files/folders/process definitions through the configured publication
policy. Server validation enforces root, Space, type, MIME, size, malware, sensitivity, source
state, citations, and process/action references before creating an immutable Active version.
A published document cannot change roles, system prompts, Registry state, provider credentials,
or execution authority.

Missing facts display `Needs Verification: <fact>` or `No Reliable Source Found`. Customer
records, secrets, Gmail bodies, and sensitive excluded tabs never enter repository evidence.

## Communications and Attention

Workflow Communications begins from an authorized renewal or maintenance entity. It supports
bodyless linked-message attention, targeted thread read, governed labels, unsent drafts, and
exact-confirmed replies. It has no general inbox, arbitrary compose, cross-mailbox Admin view,
or autonomous send. Approval and workflow notifications are in-app; the legacy event-driven
approval email sender remains disabled.

## Retention and Operations

The V1 baseline is bodyless operational state, versioned retention periods, explicit legal hold,
bounded on-demand cleanup, and visible health. TTL policies, extra indexes, and Scheduler jobs are
optional volume-driven improvements.

## Acceptance

- Staff and Test Vendor authentication work in production.
- Every primary tab has a real purpose, safe empty/failure state, and desktop/phone coverage.
- Live/Test labels and structural isolation are visible and adversarially tested.
- A complete Maintenance/Vendor Test journey and the full typed Lease/Maintenance action graph run
  with zero Live-provider calls.
- Enabled Live provider actions retain exact preview, confirmation, receipt, monitoring, and
  rollback evidence.
- No secrets/customer content enter git, logs, notifications, or bodyless audit.
