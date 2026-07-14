# Lease Renewal Agent Product Lane

## Current State

Lease Renewal Agent is a purchased product track and the first backend automation target. Its
deterministic Phase-1 read/reconcile/flag engine, live Rentvine and renewal-Sheet read seams,
renewal desk, mobile/desktop decision surfaces, app-plane resolutions, and append-only writeback
authorization controls are built. The visible operational run is still narrower than the full
end-to-end product: current renewal runs are simulation/sample-backed, communication initiation is
preview-only, and no Sheet, Rentvine, Dotloop, LeadSimple, QuickBooks, or Boom write executes.

Verified tool-stack research (`docs/integration-architecture.md`, backed by
`docs/research/integration-capability-2026-06.md`) clarifies the roles this lane depends
on: Rentvine is the operational system of record and is read-authoritative for renewal
candidate discovery (lease dates, tenant contacts, property/owner context); LeadSimple
orchestrates the workflow; Dotloop is the candidate document-package/signing layer; Boom
is optional resident rent-reporting at move-in/renewal. Critically, the Rentvine
lease-renewal writeback (executing a renewal or changing renewal charges) is undocumented
in the public API and is gated as vendor-confirmation-required.

## Planning Default

Treat Lease Renewal Agent as a separate product lane in this monorepo. Preserve the existing
read/reconcile/review runtime, and do not widen it to a real operational mutation or external action
until the exact source, permission, preview, approval, acceptance, and rollback gates are approved.

## Gmail Communication Boundary (2026-07-14)

Gmail is a communication adapter for a real renewal run, not a renewal inbox. Owner outreach
starts from source-backed run facts; missing or conflicting owner, term, rent, fee, timing, or legal
facts block an external draft. An approved unsent draft and any later exact-confirmed reply store only
bodyless Gmail identifiers, workflow purpose, actor, template/rule version, status, and timestamps.

A reply on a linked owner or tenant thread creates value-free attention. On-demand analysis may propose
owner direction, tenant intent, unanswered questions, or follow-up tasks, but every proposal begins as
`Needs Review` with Gmail provenance. Confirmation may update only the KB workflow Activity/task/status;
it cannot write Rentvine, the tracking sheet, LeadSimple, or Dotloop. Owner direction must be confirmed
before tenant commitment, and email alone never satisfies the documented portal-chat plus SMS channel
requirements or tenant agreement gate.

Current implementation is intentionally narrower: the renewal pages expose a nonmutating communication
panel, and the owner/tenant notice routes return deterministic unaddressed previews from sample data.
`gmail.renewal_notice.draft_create` remains Planned until real-run authoritative recipients/values are
wired. R07 approves the exact current owner/tenant generators as v1.0 base artifacts plus S24's
source-visible AI rewrite policy. No renewal initiation or external write is executable yet.

## Known Facts

- PMI KC has purchased a Lease Renewal Agent.
- The repo already contains a Lease Renewals KB demo workflow.
- The desired first milestone is a full end-to-end workflow, not a reminder-only or
  draft-only prototype.
- A team member intentionally starts the workflow, but the system should anticipate due
  renewals and remind the team from lease timing.
- The authoritative renewal-timing source is the **Rentvine lease record** (lease dates;
  read-authoritative); the tracking sheet's Tab 3 `Renewal Date` corroborates. Manual start
  remains allowed. (Confirmed 2026-06-20 — see
  [`lease-renewal-discovery-reference.md`](lease-renewal-discovery-reference.md) §2 and
  [`lease-renewal-connector-design.md`](lease-renewal-connector-design.md) §3.4.)
- **Signed leases live in Dotloop** (the e-signature workspace and home of executed leases),
  confirmed 2026-06-20 ([`lease-renewal-discovery-reference.md`](lease-renewal-discovery-reference.md) §2).
  The earlier "candidate systems" TBD is **closed**: Rentvine = read-authoritative system of
  record, Dotloop = signing + signed-lease home, the tracking spreadsheet = operational control
  plane (not a system of record).
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
- S21's launch policy admits only configured/detected allowed types and sizes after malware/sensitivity
  validation. Useful denied types may receive a reviewed converter later; they never bypass validation
  or become Active merely because they exist in the source folder.
- Non-sources-of-truth should be moved out of the Lease Renewal source folder instead
  of left there for the copy or indexing path to skip. The destination for non-source,
  reference, or archive material is TBD.
- Dan approves owner communications and the accuracy of imported/updated owner-facing
  information.
- Internal preparation may happen before Dan approval. S20 directs internal Editors to execute enabled
  Low/Medium instances, including exact-confirmed workflow communication, while consequential High
  Sheet/Rentvine/Dotloop/Boom work requires Admin. Admin may self-approve every risk. S20 is Local
  green; runtime stays narrower until S25 implements each adapter and each live action is separately
  promoted.
- Dan can edit any generated or prepared document because he has Admin authority.
- Human send authority remains preserved. Dan is primary business approver; Admin all-risk
  self-approval and Editor Medium exact-confirmation are approved. Autonomous send is not V1.
- Renewal work must remain source-backed and must not invent legal, fee, timing,
  owner-approval, tenant-notice, or system-of-record facts.
- Process definitions are loosely editable. S21 now makes validation-passing Editor
  additions Active immediately after configured root/scope/type/size/malware/sensitivity checks, with
  immutable version/rollback/audit; publication never enables an action or widens a role.
- Current code has `Draft`, `Testing`, `Pending Approval`, `Active`, `Needs Revision`, and `Retired`.
  S21 skips content `Pending Approval` for validation-passing Editor saves and creates
  an audited/versioned Active update immediately. Test runs stay marked and simulation-only.
- A process definition may reference future external actions before those actions are
  connected or approved. The app should show those as pending future automation steps,
  and the AI can explain how they are expected to work, but the actions must remain
  non-executable until a future spec approves the integration, permission, tests, audit
  behavior, and rollback/error handling.
- Pending automation steps should show the target system, expected action, missing
  permission or connection, and approval owner.
- Each external action type must be individually approved before it becomes executable.
  Approval is scoped by target system and action type, not blanket system access.
- Per-run authority follows S20: Editor direct Low/Medium, Admin-approved High, and no technical Blocked
  override. No runtime gate changes before S20/S25 acceptance.
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

Missing-fact links should offer two first actions: `Add process note` and `Add source document`.
Under Round 2, a validation-passing process note/source update becomes active immediately with audit
and rollback; `Add source document` uses the Round 3 approved root/connector trust boundary. When a
missing fact is filled, the run re-checks only affected facts and steps instead of restarting.

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
V1 delivery is in-app only. Queue notifications should go to the current assignee and
required approver. Creators or editors should be notified only when their action is
needed or their item closes. Reminders should start as a single console notification,
not a repeating reminder sequence; there should be no default 24-hour follow-up or
Admin escalation sequence for queue reminders unless configured later. Each queue
notification should include the plain-English action needed, due date, risk level,
affected process/run, and a direct link to the queue item.

Approval queue delivery is in-app for V1. Historical email preferences may remain visible for
audit, but configuration cannot activate the hard-disabled legacy sender. Any later
human-confirmed notification-draft lane needs a separate approved spec and cannot replace the
Console/Notifications source of truth.

Approval queue Admin health should show in-app processing status, stale overdue count, and blocked
item count. Historical email state may be labeled as inactive audit context. Health status
should use `Healthy`, `Needs Attention`, and `Action Required`. `Action Required` means
something is broken or blocking work, such as failed in-app notification processing or an
unresolved blocked high-risk item. Admins should be able to open health details directly into the
affected queue items or audit records.

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

S14 replaces the earlier list-only mobile direction for renewal decisions. The review
surface pages one value-bearing renewal flag at a time over the existing
`RenewalRunView`, offers a one-tap Low/Medium suggested-source path, and keeps the
established desktop cards and run-page bulk bar as an alternate mode. High/Blocked flags
and every manual override retain the full audited form.

The unified Approval Queue remains a value-free urgent list. Only a safe Low/Medium,
Ready, actor-eligible, non-self-assigned `queue_item` may expose one inline app-plane
approval; renewal-flag and write-back rows remain deep links to their governed run page.

Approval Queue empty, loading, and error states should be plain and production-safe. An
empty queue should say there is nothing currently waiting for review and should not show
fake/demo queue items. Loading and error states should use plain-English messages with
one obvious retry or open action. Missing evidence, permissions, or connections should
create or route to a `Blocked` queue item instead of appearing as a vague broken screen.
Production queue views should never show demo/test items unless the run is clearly marked
as a test/demo run.

Approval Queue permissions stay explicit by role/action. S20 allows Admins to self-approve every risk,
lets internal Editors execute enabled Low/Medium instances, and retains Admin review for consequential
High work while technical Blocked conditions remain closed. Admins can view all queue items, disable actions, view
health, and expand full Activity/audit details. Permission errors explain the missing role/action
and route to a safe next step instead of showing a generic failure.

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

For unresolved important `Blocked` or overdue queue items, the V1 escalation path is in-app
attention plus Admin health. Recipients are assigned and/or Admin-selected rather than inferred
broadly. There is no automatic email exception.

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

Workflow notifications should fire in-app for `Ready for Approval`, `Blocked`, failed
automation, and overdue due dates. Other delivery channels remain future/TBD. The
default recipients are the workflow owner/final approver and the person assigned the
next action. The workflow starter receives notifications only when their action is
needed or when the run completes or fails. This does not authorize owner-facing or
tenant-facing sends. Failed notification processing creates an Admin-visible in-app health warning;
it never triggers an automatic email retry.

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

- ~~Where signed leases live and how lease timing can be read safely.~~ RESOLVED 2026-06-20:
  signed leases live in Dotloop; lease timing reads from the Rentvine lease record
  ([`lease-renewal-discovery-reference.md`](lease-renewal-discovery-reference.md) §2).
- Whether Rentvine exposes a private or vendor-confirmed lease-renewal-write endpoint
  (renewal execution, rent-increase, or renewal charge update). Public API docs do not
  document one; this is the gate on renewal writeback.
- Dotloop **is** the renewal signing/document workspace (confirmed 2026-06-20). Still open: the
  exact signature-state lifecycle to model (send for signature, remind, completed, declined).
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
  browser session to map workflow steps and provider contracts. S25 authorizes local adapter/runtime
  implementation; real browser/provider actions remain separately gated.
- Turn a client-led show-and-tell or client-to-Josiah walkthrough into structured source
  notes for the source-of-truth folder.
- Propose documentation improvements from team edits, walkthroughs, and app feedback for
  Dan's review.

## Do Not Execute Live Yet

- Build S20/S24/S25 locally with fake providers, but do not enable or run Gmail/Sheet/Rentvine/Dotloop/
  portal/SMS/Boom actions without their documented contract, registry review, explicit live authority,
  and rollback/proof. LeadSimple/QuickBooks are Maintenance S26 actions, not invented Lease actions.
- No Rentvine lease-renewal endpoint guessing or browser automation; the undocumented contract blocks
  final V1 until vendor evidence exists.
- No autonomous renewal sender, bank write, blind retry, or confident policy output without approved
  PMI KC sources.
