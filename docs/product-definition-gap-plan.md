# Product Definition Gap Plan

This document turns the current three-product plan into a practical alignment loop. Use
it when the question is not "can we code this?" but "what are we actually trying to
create, and what still needs to be decided?"

## Current Reality

| Product             | What exists now                                                                                               | What is not proven yet                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| PMI KC KB           | A working source-backed web app runtime and demo path.                                                        | Client production cutover, approved production sources, and approved backend automation write specs.                     |
| Lease Renewal Agent | First confirmed backend automation target after KB production.                                                | Signed-lease system, central workflow record, live integrations, write permissions, and acceptance tests.                |
| Gmail Inbox 0       | A Gmail-native Dan-email pilot lane with legacy Owner Router/Dan's AI Assistant artifacts as source material. | Dan mailbox access, historical scan protocol, Gmail/Gemini scopes, draft/reply spec, and management page implementation. |

## Answered Direction

- PMI KC KB and Gmail Inbox 0 move forward in tandem. KB is the main development and
  production-lift lane; Gmail Inbox 0 is an ongoing Dan workflow project.
- KB should launch first as the source-backed app, then add backend automation in
  phases.
- KB success means at least three client-defined processes can be started with AI and
  carried through backend automation after explicit approval.
- The first three automation processes are Lease Renewal, Maintenance Work Order Intake,
  and Move-Out + Deposit Disposition. Owner Onboarding is the fourth/fallback process.
- Backend automation means actual actions in connected systems, but initial execution
  requires per-action human approval.
- Production KB is internal-only with a simple `Admin` / `User` product-facing role
  model. Users can ask, suggest edits, and start workflows; Admins approve source
  changes and backend actions.
- Initial Admins are Josiah and Dan, with the ability for Admins to grant Admin access
  to additional users they choose.
- The first launch does not need separate User accounts beyond Josiah and Dan; the User
  role remains available for later delegation.
- The first production KB Spaces are Lease Renewals, Maintenance Work Order Intake,
  Move-Out + Deposit Disposition, and Owner Onboarding.
- Gmail Inbox 0 starts with Dan's whole mailbox, not owner-email-only. It begins with
  `Waiting on Outside` and `Waiting on Team`, then later adds `Dan Decision` and
  `Draft Ready`.
- Gmail Inbox 0 suggests labels by default and auto-applies labels only for exact
  matches or repeated Dan-approved patterns.
- Dan manually presses Send for now. Draft/reply automation can be added in layers after
  approval, testing, and a scoped Gmail spec.
- Gmail Inbox 0 needs a minimal Admin-only management page inside the KB app for labels,
  rules, approved replies, change history, and Gmail/Gemini status.
- KB Gmail send-only approval notifications should be enabled at launch and incorporated
  into the Gmail Inbox 0 vision.
- Launch recipients for KB approval notifications are Dan and Josiah's PMI KC account.
- Notification sender identity is `kb-automation@pmikcmetro.com`.
- KB approval notifications should use a clear approval subject line and apply the
  `KB Approval` Gmail label.
- KB approval notification failures should create an in-app alert, retry email once,
  and then escalate to Dan/Josiah Admins in-app and by email if the retry fails.

## Definition Targets

### PMI KC KB

The KB should be defined as the source-backed operating knowledge app. It answers
approved operational questions, shows citations, exposes uncertainty, supports editable
SOP/template/tool/placeholder records, and routes changes through human approval.

The KB should also become the workflow-control layer for approved backend automations.
It may start workflows, show workflow-run pages, propose backend actions, capture
feedback, and execute approved writes/sends/updates once a process-specific spec exists.
It should not silently take over email, renewal, maintenance, move-out, or
system-of-record workflows without explicit approval.

The first workflow-control layer should be loosely editable for process definitions.
The whole team should be able to propose or edit process templates, steps, source links,
and documentation pointers as new processes are discovered. Those changes should go
through approval before becoming active. That is configuration editability, not automatic
permission to write into external systems of record.

Dan and Josiah should be the default Admin approvers for process-definition changes
until they delegate that authority.

The KB should own the first workflow-run record and keep context in one central,
non-technical place. Other systems can be referenced through backlinks and action
records. This supports gradual refinement and later merging of separate processes into
larger workflows.

Each workflow run should show a top summary with current status, next action, blocker,
owner, and due date if known. The run should include a timeline of steps, decisions,
approvals, comments, and system actions. Test runs should be visually separate from real
runs and excluded from production metrics unless explicitly included by an Admin. Every
AI-generated recommendation should keep source links, confidence, and reasoning visible
to the reviewer.

Workflow run statuses should be `Not Started`, `In Progress`, `Waiting on Team`,
`Waiting on Outside`, `Blocked`, `Ready for Approval`, `Approved`, `Completed`,
`Cancelled`, and `Failed`. The workflow run owner should be the final approver, not
necessarily the starter. Due dates should use the source process due date when one
exists; otherwise, they should default to today. Workflow notifications should fire for
`Ready for Approval`, `Blocked`, failed automation, and overdue due dates, including
internal email and in-app notifications first. Other channels remain future/TBD. Default
recipients are the workflow owner/final approver and the person assigned the next
action. The starter receives notifications only when their action is needed or when the
run completes or fails. Email subjects should include product/process name, run status,
property/context when available, and required action.

Failed internal notifications should create an in-app alert and retry email once. If
that retry fails, the failure escalates to Dan/Josiah Admins in-app and by email. Failed
automation should mark the run `Failed` only when the failure blocks the run; otherwise,
the step is marked `Failed` and the run moves to `Blocked`. Any external action failure
should preserve attempted payload, error message, target system, timestamp, and retry
status in the audit trail.

Minimum v1 process-definition fields should be: process name, short outcome, trigger or
manual start condition, process owner/default approver, source/documentation links,
required starting inputs, initial steps, action references with execution status, and a
success, stop, or escalation condition.

Process definition statuses should be `Draft`, `Testing`, `Pending Approval`, `Active`,
`Needs Revision`, and `Retired`. Draft or Testing definitions may be started for clearly
marked simulation-only test runs, but Active definitions are required for real
operational runs. Simulation-only means no external writes, no sends, and no live system
updates.

Every approved process definition should create a versioned Active copy with history
and rollback. Activating a process definition should require source/documentation links
and at least one successful test run unless Dan or Josiah explicitly override the gate.
Pending automation steps should show target system, expected action, missing permission
or connection, and approval owner.

Each external action type must be individually approved before it becomes executable.
Approval should be scoped by target system and action type, not blanket system access.
The first executable external actions should still require per-run human approval even
after the target-system/action-type approval exists. Planned actions should remain
visible while non-executable so the team can keep refining workflows before integrations
are live.

External action readiness states should be `Planned`, `Needs Connection`,
`Needs Permission`, `Ready for Test`, `Approved for Execution`, and `Disabled`. Before
any external action executes, the app should show a preview of exactly what will change,
where it will change, and why. Every executable external action should have a rollback
or correction note before approval. Admins should be able to disable any action type
immediately without deleting the process definition.

### Lease Renewal Agent

The Lease Renewal Agent is the first full backend automation target. A team member
starts it, but the system should anticipate renewal timing from the signed lease or
lease-term record and remind the team. The target end state is a full workflow: gather
facts, update approved internal systems with backlinks, prepare a review package and
owner email, route Dan approval, and send after approval.

The signed lease or lease-term record should be treated as the first authoritative
renewal trigger source, pending client system confirmation. Manual workflow start should
also remain available.

The first Lease Renewal planned actions should be read/gather actions before write
actions. Initial planned reads should include signed lease and lease dates,
tenant/property facts, owner information, current rent/terms, and renewal timeline.
Initial planned outputs should be a workflow summary, owner communication draft,
internal update preview, and approval package. First executable write/send actions
should wait until the read/gather flow and approval package are tested.

Imported facts should show source, timestamp, and confidence before approval. Conflicting
facts across systems should block the run until a human chooses the correct source. The
app should keep a missing-facts list, let AI suggest where to find each missing fact,
and include a link to add the missing resource or description through the appropriate
path, such as editing the process in place or adding source material to the approved
Drive/source folder.

Imported fact confidence should display as `Verified`, `Likely`, `Needs Review`, or
`Conflict`. Only facts that are both `Verified` and approved can flow into owner-facing
drafts without a visible warning. Drafts should always show traceable links, sources,
and supporting facts so the process can improve over time. `Likely` facts can be used
in internal summaries, but must be reviewed before approval. `Conflict` facts block
owner-facing drafts and executable actions until resolved.

Dan can edit any generated or prepared document because he has Admin authority. Human
send authority remains preserved: Dan approves and sends first, and later send
automation can be layered only after testing and a future approved spec.

An approval package should include workflow summary, the draft/output for whatever the
workflow is automating at that time, verified fact list, unresolved warnings, planned
internal updates, pending automation notes, and send/update preview. For Lease Renewal,
that includes the owner communication draft; for later workflows, it should adapt to the
relevant automated output or action.

Dan approval should approve the owner communication and the facts used by it. External
writes can also be approved from the package when explicitly included as separate action
approvals, but communication approval does not silently approve unrelated external
writes. Internal update previews should remain separately approvable by action through
an obvious, low-friction approval queue designed for client and staff review.

Approval queue items should be grouped by audience: Dan/Admin decisions, team follow-up,
outside waiting, and failed/blocked automation. Each item should show plain-English
action, risk level, source evidence, affected system, before/after preview, and required
approver. Queue actions should be `Approve`, `Return for Revision`, `Assign`, `Snooze`,
`Disable Action`, and `Open Run`.

Each approval queue item should have one current assignee and one required approver.
`Return for Revision` should require a plain-English reason and send the item back to
the creator or last editor. `Snooze` should require a date and reason, then
automatically return the item to the active queue on that date or if risk/status
changes. `Disable Action` should be Admin-only, require a reason, and preserve the
disabled action in history.

Approval queue items should be created from approval packages, process-definition
changes, failed/blocked automation, external-action readiness, and source/fact
conflicts. Duplicate items for the same run/action should merge into one open item with
history instead of creating multiple tasks. If the underlying fact, draft, action, or
preview changes, the queue item should refresh and preserve the prior version in
history. A queue item should close automatically when approved, completed, cancelled,
disabled, or when the blocker is resolved and no approval remains.

If the underlying fact, draft, action, or preview changes after a queue item is already
closed, the app should create a new queue item linked to the prior Activity history
instead of silently reopening or editing the closed record. Queue item direct links
should remain stable after status changes so notifications, history, and backlinks do
not break.

Approval Queue v1 should include bulk approve, bulk disable, bulk execute, bulk assign,
and bulk snooze for selected visible items. Bulk actions must respect every selected
item's individual permissions, risk level, required approver, and readiness state. Bulk
actions should show a plain-English preview, require confirmation, skip or block
ineligible items with a clear reason, and write per-item Activity entries. Bulk execute
does not bypass external-action approval, owner/tenant-facing send authority, or
high-risk confirmation rules.

Approval queue notifications should appear in the app console when an item is created,
assigned, returned for revision, unsnoozed, blocked, unblocked, overdue, or closed.
These queue events should not all send email by default; email delivery can be
configured separately. Queue notifications should go to the current assignee and
required approver. Creators or editors should be notified only when their action is
needed or their item closes. Reminders should start as a single console notification,
not a repeating reminder sequence; there should be no default 24-hour follow-up or
Admin escalation sequence for queue reminders unless configured later. Each queue
notification should include the plain-English action needed, due date, risk level,
affected process/run, and a direct link to the queue item.

Routine approval queue email delivery should be off by default and configurable by
Admins per event type and recipient role. The built-in exception is unresolved important
`Blocked` or overdue escalation, which should send portal and email notifications to
assigned and/or Admin-selected recipients. Email settings should show event type,
enabled state, recipient roles, trigger condition, frequency/cooldown, subject preview,
and last send/error status. Email should never replace console notifications; the app
console remains the default source of truth. Email delivery failure should not block the
queue item, but should create an Admin-visible health warning and audit entry.

Approval queue Admin health should show queue email status, failed delivery count, last
failure, disabled event types, stale overdue count, and blocked item count. Health status
should use `Healthy`, `Needs Attention`, and `Action Required`. `Action Required` means
something is broken or blocking work, such as failed notification delivery, disconnected
email config, or unresolved blocked high-risk items. Admins should be able to open health
details directly into the affected queue items, email settings, or audit records.

Approval queue audit/history should stay simple. The app should maintain one automatic,
append-only Activity log per queue item rather than multiple audit modes or toggle-heavy
options. Each meaningful queue state change should record actor, timestamp, action,
previous state, new state, reason when supplied or required, and source trigger. Staff
should see a plain-English Activity summary only when it affects what they need to do.
Admins should be able to expand that same Activity feed for full audit fields when
needed. The log should automatically preserve prior versions of approval-critical facts,
drafts, previews, notification settings, and disabled actions. Corrections should create
new entries instead of editing or deleting old entries, and low-level system entries can
collapse by default to avoid clutter.

Activity/audit retention and export should follow standard SaaS audit best practices
until a client/legal policy overrides them: append-only records, Admin-readable history,
reasonable export for support/review, and no unnecessary sensitive raw data in the audit
payload.

Approval Queue v1 should avoid extra user-facing toggles, per-user customization, and
complex settings unless they solve an observed workflow problem. Normal users should see
only the core queue actions and one plain `Activity` view. Admin-only details and
settings should live behind obvious Admin surfaces. AI and automation should rely on a
small fixed set of structured fields, not many optional UI settings. Any new setting
should require an owner, a plain-English default, a disable path, and test coverage
before it is added.

Approval Queue v1 item fields should be limited to: process/run, item type/source
trigger, status, risk, audience group, assignee, required approver, due date, action
needed, affected system/action, direct link, created timestamp, and updated timestamp.
Evidence and details should attach through source links, previews, and the `Activity`
log instead of extra toggles or custom fields. AI-readable queue state should come from
these fixed fields plus `Activity`, not from user-specific settings. V1 should not
support custom queue fields; any new field should go through the new-setting guardrail.

Approval Queue v1 should use one main queue table/list plus a right-side or modal detail
view, not multiple queue dashboards. The list should show only status, risk, action
needed, process/run, assignee, required approver, due date, and a direct link or open
action. The detail view should show summary, evidence links/previews, available actions,
and `Activity`. Admin-only health and settings should be reachable from a simple Admin
area, not mixed into every normal queue item.

Mobile Approval Queue v1 should use the same queue list and detail view, with rows or
cards stacked for readability instead of a separate mobile workflow. Mobile list items
should show only status, risk, action needed, due date, and open action; other fixed
fields can appear in the detail view. Primary actions should remain visible in the detail
view without requiring users to understand Admin settings. Desktop and mobile should use
the same fixed fields and `Activity` source so AI and automation see one queue model.

Approval Queue empty, loading, and error states should be plain and production-safe. An
empty queue should say there is nothing currently waiting for review and should not show
fake/demo queue items. Loading and error states should use plain-English messages with
one obvious retry or open action. Missing evidence, permissions, or connections should
create or route to a `Blocked` queue item instead of appearing as a vague broken screen.
Production queue views should never show demo/test items unless the run is clearly marked
as a test/demo run.

Approval Queue permissions should stay role-simple. Normal users can view assigned or
otherwise relevant queue items, open details, take assigned actions, add comments or
reasons, and return items for revision when they are the assignee. Admins can view all
queue items, approve high-risk items, disable actions, manage email settings, view
health, and expand full Activity/audit details. Users cannot approve their own proposed
process, source, or fact change unless they are Admin and explicitly acting as the
approver. Permission errors should explain the missing role or action and route to a
safe next step instead of showing a generic failure.

Process-specific approvers beyond Dan and Josiah remain TBD, but the app should make
them easy to add and manage through an Admin console rather than hardcoding people into
workflow definitions.

If a queue item is missing a required assignee or required approver, it should become
`Blocked` and route to Admin triage rather than guessing from the starter, creator, or
last editor. AI can suggest assignee, approver, risk, status, and action-needed values
from fixed fields, source evidence, and `Activity`, but AI cannot approve, disable,
close, execute, or override permission checks. AI suggestions should be visible as
suggestions and become effective only through the normal queue action or approval path.

Queue comments and reasons should be stored as `Activity` entries. Comments/reasons
should not directly change facts, drafts, previews, process definitions, source records,
or external actions. If a comment identifies a needed source/process/fact change, the app
should create the appropriate proposed update or queue item instead of treating the
comment itself as the update.

For unresolved important `Blocked` or overdue queue items, the v1 escalation path should
be a portal notification and email notification for now. Recipients should be assigned
and/or Admin-selected rather than inferred broadly. This escalation email is the
exception to routine queue email being off by default.

Approval risk levels should be `Low`, `Medium`, `High`, and `Blocked`. `High` means an
item is owner/tenant-facing, has legal/financial/timing impact, or writes to an external
system. `Medium` means an internal process/state update or fact correction affects a
workflow but does not touch an external system. `Low` means internal note, assignment,
snooze, or non-executable process cleanup. `Blocked` means the item cannot proceed until
a missing fact, conflict, connection, permission, or approver issue is resolved.

The default approval queue view should put `Ready for Approval`, `Blocked`, `Failed`,
and overdue items first. Queue filters should include process, owner/final approver,
assignee, risk level, status, due date, and audience group. Staff view should hide
technical details by default and show what happened, why it matters, and what to do next.
Admin view should allow expansion into technical details, source evidence, API or
connection status, and audit trail.

All clarification text, next steps, errors, and messaging in the approval queue should
assume non-technical, new users who do not understand automation internals. High-risk
items should use a simple confirm popup before approval; low-risk internal updates can
be one-click after review.

Approval package history should preserve every revision Dan reviewed. Where APIs allow
correction, the app should support correction-style rollback by storing the previous
entry and re-entering that previous value through the API rather than treating rollback
as a universal true revert.

Conflict resolution should require a human to pick the winning source or enter a
corrected value. The resolution should save who resolved it, why, source chosen or
corrected value, and timestamp. A corrected value should create a proposed source or
process update so the same conflict is less likely next time. If a conflict affects
legal, financial, or notice-timing facts, Dan/Josiah Admin approval is required even
when another user proposes the resolution.

Missing-fact links should offer two first actions: `Add process note` and
`Add source document`. `Add process note` creates a proposed process-definition or
source update that requires approval before becoming active. `Add source document`
points to the approved Drive/source folder and relies on the approved source
sync/indexing path. When a missing fact is filled, the run should re-check only affected
facts and steps rather than restarting the whole run.

The write/update side should still be AI-assisted during design and refinement. As a
process is entered and edited, AI should suggest write actions to add or remove,
identify missing source facts, and explain how each future write/update/send action
would work. Deterministic connection checks should verify that API connections are
configured and healthy for each consumed app before an action can move toward execution.

Starter renewal sources can include a video demo, context from the client, and
information from the team. Once captured in the client-accessible source location, those
materials should be treated as source-of-truth inputs rather than split into raw and
approved areas. Chrome-based process observation may help map browser workflows when
explicitly allowed, but it does not by itself approve production writes.

The preferred discovery method is both a recorded walkthrough and a live supervised
Chrome session: the recording gives repeatable review material, and the live session
shows the real browser workflow while a human is supervising.

The walkthrough can be client-led as a show-and-tell, or the client can show Josiah the
process so Josiah can capture the workflow data and turn it into reviewed source
material.

Captured renewal workflow notes should live first in a client-accessible source location
where PMI KC can add context. That location should be chosen for app capability: it
should be able to connect to the KB's source-backed retrieval or workflow layer after
review and approval. The exact folder, system, or connector remains TBD.

The default first location is a PMI KC-accessible Google Drive folder, unless setup
discovers a better client-accessible, app-connected source. This makes Drive the likely
collaboration/capture layer, while the app's final retrieval or indexing target can
still be whichever approved connector gives the strongest capability.

That source-of-truth location needs frequent curation through AI-proposed changes, Dan's
human review, and continuous documentation improvement. Dan decides the review cadence.
Updates should sync automatically and continuously from the team-editable
source-of-truth folder because the app reads from the source. This sync should not wait
for Dan approval. The current context does not yet define which connector or indexing
path provides that behavior in the client-owned setup.

The likely approach is that the Google Drive source-of-truth folder feeds an indexed
source layer automatically. Direct Drive reads remain a research option, but the current
direction prefers an indexed source layer if setup confirms it is stronger for the app.
The first indexed-source candidate to test is Cloud Storage plus Agent Search periodic
ingestion.

The first handoff assumption is deliberately simple and cost-aware: copy changes from
the team-editable Drive source folder into Cloud Storage for indexing, then let the
index/app handle freshness. Costs are pass-through, so the plan should favor the
cheapest working option for users and avoid unnecessary cloud services, polling,
duplicate stores, or indexed data volume.

The source folder should not start with a narrow file-type rule. All file types can be
included if they are useful source material, subject to sensitivity and setup limits.
When a useful file type cannot be indexed directly, the implementation should convert,
summarize, or visibly skip it instead of making the team manage technical formats.

The source folder should not become a general holding area. Non-sources-of-truth should
be moved elsewhere rather than left in the folder for the copy or indexing path to
ignore. The destination for non-source, reference, or archive material is still TBD.

For Lease Renewal, the whole PMI KC team should be able to directly edit the
source-of-truth folder at first. This is about source capture and team context; it does
not by itself authorize app indexing rules, backend writes, or owner-facing automation.

The workflow configuration should also be loosely editable at first, including creating
new process definitions that can point to new documentation. Process definitions may
reference future external actions so they can be refined before integrations exist, but
those references should show as pending future automation and are not executable until
approved. The AI can explain how pending automation is expected to work while preserving
that non-executable boundary. It still needs client discovery for the signed-lease
system, integration ownership, and external write permissions.

### Gmail Inbox 0

Gmail Inbox 0 should be defined as a Gmail-native triage, drafting, and learning
workflow for Dan's email. It should keep Gmail as the front door, use visible state
labels, rely on approved reply patterns and routing rules, and preserve Dan's manual
send authority in the base layer.

Do not define it as a new inbox, autonomous sender, Gmail content ingestion service, or
system-of-record updater unless a later approved spec explicitly changes that boundary.

## Gap-Closing Loop

1. Start with the product lane doc and this gap plan.
2. Classify each unknown as one of three types: product definition, access/source, or
   implementation detail.
3. Ask only for decisions that change product scope, permissions, acceptance, or source
   authority.
4. Record the answer in the product lane doc when it changes scope, in
   `docs/research-backlog.md` when it remains open, and in `docs/client-checklist.md`
   when the client must act.
5. Do not create runtime work for Lease Renewal Agent or Gmail Inbox 0 until the v1
   definition target for that lane is answered well enough to write acceptance tests.

## Continuous Follow-Up Questions

Use these questions repeatedly until each product lane has a testable v1 definition.
They are not a script; they are the minimum decision set needed to avoid building the
wrong thing.

| Product             | Question                                                                           | Why it matters                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| All                 | Which product launches first, and what client pain proves it worked?               | Prevents demo order, engineering order, and sales language from diverging.                         |
| All                 | Who owns final wording, source approval, user acceptance, and post-launch support? | Prevents AI sessions from treating unowned assumptions as approved requirements.                   |
| PMI KC KB           | Which production Spaces launch first, and which approved source folders feed them? | Defines the first real retrieval/citation surface.                                                 |
| PMI KC KB           | What should escalation mean when approval notification delivery fails?             | Turns the enabled notification decision into production configuration.                             |
| Lease Renewal Agent | Where do signed leases live, and which system exposes lease timing?                | Determines the source of truth for anticipatory renewal reminders.                                 |
| Lease Renewal Agent | Which demo, client-context, and team materials are approved as starter sources?    | Prevents observed or informal context from being treated as final authority too early.             |
| Lease Renewal Agent | Which systems may be read or updated, and what requires approval?                  | Prevents unsafe write paths across RentVine, DotLoop, LeadSimple, Drive, Sheets, Gmail, and tasks. |
| Maintenance         | Where do maintenance requests and phone notes live?                                | Determines the source for tenant request and call-note triggers.                                   |
| Maintenance         | Which common issue templates and escalation rules are approved?                    | Determines when tenant-facing replies can be automated.                                            |
| Move-Out            | Which natural triggers are authoritative?                                          | Determines event sources for email notice, lease date, forms, inspections, and related events.     |
| Gmail Inbox 0       | What Gmail access, historical scan, and back-labeling permissions are approved?    | Determines safe rollout for Dan's whole mailbox.                                                   |
| Gmail Inbox 0       | How should Gmail drafts/replies be created and audited?                            | Determines the future scoped spec for draft/reply automation while Dan still sends manually.       |

## Decision Complete Means

A product lane is ready for implementation planning only when the repo can answer:

- What user problem v1 solves.
- What input starts the workflow.
- What sources are allowed.
- What output is produced.
- What the system is forbidden to do.
- Who reviews or approves the output.
- What acceptance scenarios prove it works.
- What validation or smoke test must pass before cutover.

If any of those answers are missing, the correct next artifact is a client ask,
research-backlog item, or source inventory template, not runtime code.
