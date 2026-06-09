# Lease Renewal Agent Product Lane

## Current State

Lease Renewal Agent is a purchased product track, but it does not yet have a confirmed
runtime spec. It is now confirmed as the first backend automation target after the KB is
stood up in production. The existing KB Lease Renewals Space, demo source templates, and
Ask scenarios are useful reference material only; they do not identify the live systems,
permissions, or write paths needed for the full workflow.

Verified tool-stack research (`docs/integration-architecture.md`, backed by
`docs/research/integration-capability-2026-06.md`) clarifies the roles this lane depends
on: Rentvine is the operational system of record and is read-authoritative for renewal
candidate discovery (lease dates, tenant contacts, property/owner context); LeadSimple
orchestrates the workflow; Dotloop is the candidate document-package/signing layer; Boom
is optional resident rent-reporting at move-in/renewal. Critically, the Rentvine
lease-renewal writeback (executing a renewal or changing renewal charges) is undocumented
in the public API and is gated as vendor-confirmation-required.

## Planning Default

Treat Lease Renewal Agent as a separate product lane in this monorepo. Do not build
runtime behavior until discovery answers are recorded and acceptance gates are approved.

## Known Facts

- PMI KC has purchased a Lease Renewal Agent.
- The repo already contains a Lease Renewals KB demo workflow.
- The desired first milestone is a full end-to-end workflow, not a reminder-only or
  draft-only prototype.
- A team member intentionally starts the workflow, but the system should anticipate due
  renewals and remind the team from lease timing.
- The first authoritative renewal timing source is the signed lease or lease-term
  record, pending client system confirmation. Manual start remains allowed.
- The system where signed leases live is TBD and must be confirmed with the client.
- Candidate systems include RentVine, DotLoop, LeadSimple, Drive, Sheets, Gmail,
  Calendar, internal tasks, and Slack or Google Chat.
- Starter discovery/source material can include a video demo, context from the client,
  and information from the team.
- Captured workflow notes should live in a client-accessible source location where the
  client can add context and where the app can connect for the strongest approved
  source-backed capability. The exact location or connector is TBD.
- The default first location is a PMI KC-accessible Google Drive folder unless setup
  discovers a better client-accessible, app-connected source. Drive may be the human
  collaboration folder even if app retrieval/indexing uses another approved target.
- Material in the Lease Renewal source folder should be treated as source-of-truth, not
  divided into raw-discovery and approved-source areas.
- The whole PMI KC team should be allowed to directly edit the Lease Renewal
  source-of-truth folder at first.
- The source-of-truth folder should be curated frequently through AI-proposed changes,
  Dan's human review, and continuous documentation improvement. Dan decides the review
  cadence. Source updates should sync automatically and continuously from the
  team-editable source-of-truth folder rather than wait for Dan approval or rely on
  manual import-on-demand. The exact connector/indexing implementation still needs setup
  validation.
- The likely implementation is that Drive feeds an indexed source layer automatically.
  Research/setup should decide the exact mechanism before runtime implementation.
- The first indexed-source candidate to test is Cloud Storage plus Agent Search periodic
  ingestion, with Drive remaining the team-facing collaboration folder.
- The Drive-to-Cloud-Storage handoff should start with the simplest low-cost automation
  that works for users: copy changes from the team-editable Drive source folder into
  Cloud Storage for indexing, then let the index/app handle freshness. Cloud costs are
  pass-through, so design choices should minimize ongoing services, indexed volume,
  polling frequency, duplicate stores, and unnecessary automation.
- The first copy path should not restrict the Lease Renewal source folder to only Docs,
  text, or PDF files. All useful source file types are eligible, subject to sensitivity
  rules and setup validation. If a useful file type cannot be indexed directly, the
  automation should convert, summarize, or skip it with a visible reason.
- Non-sources-of-truth should be moved out of the Lease Renewal source folder instead
  of left there for the copy or indexing path to skip. The destination for non-source,
  reference, or archive material is TBD.
- Dan approves owner communications and the accuracy of imported/updated owner-facing
  information.
- Internal preparation may happen before Dan approval if the specific write paths are
  approved. Owner-facing communication sends only after Dan approves the package.
- Dan can edit any generated or prepared document because he has Admin authority.
- Human send authority remains preserved: Dan approves and sends first; later send
  automation can be layered only after testing and a future approved spec.
- Renewal work must remain source-backed and must not invent legal, fee, timing,
  owner-approval, tenant-notice, or system-of-record facts.
- Process definitions should be loosely editable at first. The whole team should be
  able to propose or edit process steps, create new process definitions, and point those
  processes to new documentation as discovery matures. Those changes go through approval
  before becoming active. This does not approve external system-of-record writes by
  itself.
- Dan and Josiah are the default Admin approvers for process-definition changes until
  they delegate that approval authority.
- Process definition statuses should be `Draft`, `Testing`, `Pending Approval`,
  `Active`, `Needs Revision`, and `Retired`.
- Draft or Testing process definitions may be started for test runs, but test runs must
  be clearly marked and simulation-only: no external writes, no sends, and no live
  system updates.
- A process definition may reference future external actions before those actions are
  connected or approved. The app should show those as pending future automation steps,
  and the AI can explain how they are expected to work, but the actions must remain
  non-executable until a future spec approves the integration, permission, tests, audit
  behavior, and rollback/error handling.
- Pending automation steps should show the target system, expected action, missing
  permission or connection, and approval owner.
- Each external action type must be individually approved before it becomes executable.
  Approval is scoped by target system and action type, not blanket system access.
- The first executable external actions still require per-run human approval even after
  the target-system/action-type approval exists.
- External action readiness states should be `Planned`, `Needs Connection`,
  `Needs Permission`, `Ready for Test`, `Approved for Execution`, and `Disabled`.
- Before any external action executes, the app should show a preview of exactly what
  will change, where it will change, and why.
- Every executable external action should have a rollback or correction note before
  approval.
- Admins should be able to disable any action type immediately without deleting the
  process definition.
- Every approved process definition should create a versioned Active copy with history
  and rollback. Activating a process definition should require source/documentation links
  and at least one successful test run unless Dan or Josiah explicitly override the gate.

## Target Workflow Shape

The desired end state is: a team member starts the process, the automation gathers facts
from connected systems, updates approved internal systems with backlinks, prepares a
review package and owner email, Dan approves, and the system sends the approved owner
communication.

Lease renewal is a multi-step operational chain, not a single system action. The verified
stage model is: candidate detection, owner decision, tenant intake, document package,
signature/confirmation, system-of-record update, service/charge verification, and
closeout. Detection and reads come from Rentvine; orchestration from LeadSimple; document
packages from Dotloop; optional resident enrollment from Boom. The system-of-record
update stage (writing the renewal back into Rentvine) stays non-executable until the
Rentvine renewal-write endpoint is vendor-confirmed and an approved per-action spec,
tests, and rollback exist. Renewal preparation and verification can proceed read-only
before that gate clears.

The first Lease Renewal planned actions should be read/gather actions before write
actions. Initial planned reads should include signed lease and lease dates,
tenant/property facts, owner information, current rent/terms, and renewal timeline.
Initial planned outputs should be a workflow summary, owner communication draft,
internal update preview, and approval package.

Imported facts should show source, timestamp, and confidence before approval. If the
same fact conflicts across systems, the run should block until a human chooses the
correct source. The app should keep a missing-facts list, let AI suggest where to find
each missing fact, and include a link to add the missing resource or description through
the right path, such as editing the process in place or adding source material to the
approved Drive/source folder.

Imported fact confidence should display as `Verified`, `Likely`, `Needs Review`, or
`Conflict`. Only facts that are both `Verified` and approved can flow into owner-facing
drafts without a visible warning. Drafts should always show traceable links, sources,
and supporting facts so the process can improve over time. `Likely` facts can be used
in internal summaries, but must be reviewed before approval. `Conflict` facts block
owner-facing drafts and executable actions until resolved.

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
sync/indexing path. When a missing fact is filled, the run should re-check only the
affected facts and steps instead of restarting the whole run.

The writing/update side should still be designed and refined early. During process
editing, AI should suggest write actions to add or remove, identify missing source facts,
and explain how each future write/update/send action would work. Deterministic checks,
not model judgment alone, should verify that API connections are configured and healthy
for each app the workflow consumes before an action can move toward execution.

First executable write/send actions should wait until after the read/gather flow and
approval package are tested.

An approval package should include the workflow summary, the draft/output for whatever
the workflow is automating at that time, verified fact list, unresolved warnings,
planned internal updates, pending automation notes, and send/update preview. For Lease
Renewal, that includes the owner communication draft; for other processes, it should
adapt to the relevant automated output or action.

Dan approval should approve the owner communication and the facts used by it. External
writes can also be approved from the package when they are explicitly included as
separate action approvals, but approval of the owner communication does not silently
approve unrelated external writes. Internal update previews remain separately approvable
by action through an obvious, low-friction approval queue designed for the client and
staff audience.

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

Approval Queue v1 should include bulk approve, bulk return, bulk disable, bulk execute,
bulk assign, and bulk snooze for selected visible items. Bulk actions must respect every
selected item's individual permissions, risk level, required approver, and readiness state. Bulk
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
assume non-technical, new users who do not understand the automation internals. High-risk
items should use a simple confirm popup before approval; low-risk internal updates can
be one-click after review.

Approval package history should preserve every revision Dan reviewed. Where APIs allow
correction, the app should support correction-style rollback by storing the previous
entry and re-entering that previous value through the API, rather than pretending there
is a true universal revert.

The KB app should own and provide a single workflow-run page for each renewal run. It
should track steps, statuses, approvals, backlinks, connected app actions, imported
facts, owner communication draft/send status, and audit details. External systems can
be linked from the run, but the first central workflow context should live in the KB so
the non-technical team has one place to understand and refine the process.

Each workflow run should show a top summary with current status, next action, blocker,
owner, and due date if known. The run should also show a timeline of steps, decisions,
approvals, comments, and system actions. Test runs should be visually separate from real
runs and excluded from production metrics unless an Admin explicitly includes them.

Workflow run statuses should be `Not Started`, `In Progress`, `Waiting on Team`,
`Waiting on Outside`, `Blocked`, `Ready for Approval`, `Approved`, `Completed`,
`Cancelled`, and `Failed`. The workflow run owner should be the final approver, not
necessarily the person who started the run. Due dates should use the source process due
date when one exists; otherwise, they should default to today.

Workflow notifications should fire for `Ready for Approval`, `Blocked`, failed
automation, and overdue due dates. Notifications should include internal email
notifications and in-app notifications first; other channels remain future/TBD. The
default recipients are the workflow owner/final approver and the person assigned the
next action. The workflow starter receives notifications only when their action is
needed or when the run completes or fails. Email subjects should include product/process
name, run status, property/context when available, and required action. This does not
authorize owner-facing or tenant-facing sends.

Failed internal notifications should create an in-app alert and retry email once. If
that retry fails, the failure escalates to Dan/Josiah Admins in-app and by email.

Failed automation marks the run `Failed` only when the failure blocks the run;
otherwise, the failed step is marked `Failed` and the run moves to `Blocked`. Any
external action failure preserves the attempted payload, error message, target system,
timestamp, and retry status in the audit trail.

Every AI-generated recommendation in a run should keep its source links, confidence, and
reasoning visible to the reviewer.

The workflow-run page pattern should later apply to Maintenance and Move-Out, but each
process needs its own domain-specific model.

Minimum v1 fields for a startable process definition are: process name, short outcome,
trigger or manual start condition, process owner/default approver, source/documentation
links, required starting inputs, initial steps, action references with execution status,
and success/stop/escalation condition.

## Discovery Needed

- Where signed leases live and how lease timing can be read safely.
- Whether Rentvine exposes a private or vendor-confirmed lease-renewal-write endpoint
  (renewal execution, rent-increase, or renewal charge update). Public API docs do not
  document one; this is the gate on renewal writeback.
- Whether Dotloop is the renewal signing/document workspace, and the exact
  signature-state lifecycle (send for signature, remind, completed, declined) needed.
- Whether the LeadSimple Operations plan and Rentvine direct integration are available
  for orchestration and read sync.
- Whether any external system later needs to mirror or receive workflow-run state from
  the KB-owned record.
- Which systems may be read, and which external system writes are allowed after an
  approved per-process spec. The full list remains TBD and should be scoped with the
  client when implementation reaches each connected system.
- Which internal updates may execute before Dan approval.
- Which sender identity, recipients, audit records, and failure behavior apply after Dan
  approves owner communication.
- What sources define timing, fees, notice language, legal constraints, exceptions, and
  escalation?
- Which video demo, client-context notes, and team-provided information should be added
  to the source-of-truth folder first.
- Which client-accessible source location should hold captured workflow notes and feed
  the app's retrieval or workflow capability after approval.
- Which Google Drive folder should be used as the default capture/collaboration folder,
  unless a better app-connected source is selected during setup.
- Which PMI KC team members are included in the initial whole-team edit access group for
  the Lease Renewal source-of-truth folder.
- Whether Cloud Storage plus Agent Search periodic ingestion can serve as the first
  automatic indexed-source path for the team-editable source folder.
- What simple, low-cost Drive-to-Cloud-Storage copy automation should be tested first.
- Which useful file types can be indexed directly, which need conversion or summary, and
  which should be skipped with a visible reason.
- Where non-source, reference, or archive material should live outside the Lease Renewal
  source folder.
- How to run both preferred discovery modes: a recorded walkthrough for repeatable
  review and a live supervised Chrome session for observed browser workflow details.
- Who leads the walkthrough: either the client runs a show-and-tell directly, or the
  client shows Josiah so he can capture and translate the workflow data.
- What does successful cutover look like for the renewal team?

## AI Can Do Now

- Extract reusable renewal concepts from existing KB demo docs into a discovery brief.
- Build a source inventory template for renewal documents.
- Draft acceptance-test scenarios without assuming system access.
- Track unanswered questions in `docs/research-backlog.md`.
- Use recorded demos, client context, team notes, and an explicitly approved supervised
  Chrome session to map browser-based workflow steps. This is discovery only unless a
  later approved spec authorizes production automation.
- Turn a client-led show-and-tell or client-to-Josiah walkthrough into structured source
  notes for the source-of-truth folder.
- Propose documentation improvements from team edits, walkthroughs, and app feedback for
  Dan's review.

## Do Not Build Yet

- No automated renewal sender.
- No RentVine, LeadSimple, DotLoop, QuickBooks, Boom, Sheets, or bank write path.
- No Rentvine lease-renewal writeback: the endpoint is undocumented in the public API and
  stays non-executable until vendor confirmation plus an approved per-action spec.
- No runtime trigger, queue, agent, or API integration until v1 scope is approved.
- No confident renewal policy output without approved PMI KC sources.
