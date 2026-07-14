# Product Definition Gap Plan

This document turns the current three-product plan into a practical alignment loop. Use
it when the question is not "can we code this?" but "what are we actually trying to
create, and what still needs to be decided?"

## Current Reality

| Product                 | What exists now                                                                                                                     | What is not proven yet                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| PMI KC KB               | Deployed source-backed runtime with auth, Console, Spaces, approvals, Admin, notifications, and connected read seams.               | S20–S27 implementation, approved launch/provider mappings, action proof, and release-candidate acceptance.                                       |
| Lease Renewal Agent     | Built deterministic read/reconcile/review runtime with live Rentvine/Sheet reads and app-plane decision controls.                   | S25 operational-run wiring and every R02 provider action/proof.                                                                                  |
| Workflow Communications | Proven managed-user Gmail transport plus Local-green workflow boundary and S24 policy/artifacts; external Vendor mail is not built. | S22/S25/S26 implementation, authoritative recipients/provider setup, live TTL activation, and release promotion. Josiah owns watch/OAuth health. |

## Answered Direction

- PMI KC KB and Workflow Communications move forward in one application. Communications is a
  workflow adapter, not a separate Dan-mailbox or general-inbox product.
- KB should launch first as the source-backed app, then add backend automation in
  phases.
- KB success means at least three client-defined processes can be started with AI and
  carried through backend automation after explicit approval.
- The first three automation processes are Lease Renewal, Maintenance Work Order Intake,
  and Move-Out + Deposit Disposition. Owner Onboarding is the fourth/fallback process.
- Backend automation means actual actions in connected systems. S20 lets internal Editors directly
  execute enabled Low/Medium instances, routes consequential High work to Admin, permits Admin self-
  approval, and keeps technical Blocked conditions non-executable.
- Current production KB is internal-only with the implemented `Editor` / `Approver` / `Admin`
  tiers. Final V1 adds S22's assigned-ticket-only TOTP/per-vendor-OAuth Vendor and every S25/S26 action.
- Initial Admins are Josiah and Dan, with the ability for Admins to grant Admin access
  to additional users they choose.
- Dan and Josiah remain initial internal Admins; final V1 also needs an external Vendor acceptance
  user. Internal delegation uses Editor/Approver and optional space scopes.
- The first production KB Spaces are Lease Renewals, Maintenance Work Order Intake,
  Move-Out + Deposit Disposition, and Owner Onboarding.
- Workflow Communications starts from an authorized renewal run, maintenance ticket, or linked-reply
  attention item. It does not scan or display a user's whole mailbox.
- Only the four approved workflow labels may be applied, with an approved rule reference and reason.
- S20 now lets internal Editors exact-confirm enabled Medium workflow communication through the same
  strict linked-context route; generic compose and autonomous, scheduled, event-triggered,
  model-triggered, or bulk sends remain disabled. Consequential High work routes to Admin.
- The Admin page governs synthetic fallback tools and future approved rule/template versions; model
  output cannot approve or activate an artifact.
- Approval notifications are in-app for the first release. The legacy event-driven Gmail sender is
  hard-disabled; later human-confirmed notification drafts require a separate spec.

## Definition Targets

### PMI KC KB

The KB should be defined as the source-backed operating knowledge app. It answers
approved operational questions, shows citations, exposes uncertainty, supports editable
SOP/template/tool/placeholder records, and routes authority-bearing changes through human approval
while S21 validation-passing content publishes through its automated trust boundary.

The KB should also become the workflow-control layer for approved backend automations.
It may start workflows, show workflow-run pages, propose backend actions, capture
feedback, and execute approved writes/sends/updates once a process-specific spec exists.
It should not silently take over email, renewal, maintenance, move-out, or
system-of-record workflows without explicit approval.

The first workflow-control layer is loosely editable. S21 now makes validation-passing in-scope Editor
process templates, steps, source links, files, and folders Active immediately after configured root/
scope/type/size/malware/sensitivity checks, with immutable version/rollback/audit. Publication never enables an external action, grants a role,
or widens a credential.

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
`Ready for Approval`, `Blocked`, failed automation, and overdue due dates, using in-app
notifications. Other channels remain future/TBD. Default
recipients are the workflow owner/final approver and the person assigned the next
action. The starter receives notifications only when their action is needed or when the
run completes or fails. Failed notification processing creates Admin-visible in-app health. Failed
automation should mark the run `Failed` only when the failure blocks the run; otherwise,
the step is marked `Failed` and the run moves to `Blocked`. Any external action failure
should preserve attempted payload, error message, target system, timestamp, and retry
status in the audit trail.

Minimum v1 process-definition fields should be: process name, short outcome, trigger or
manual start condition, process owner/default approver, source/documentation links,
required starting inputs, initial steps, action references with execution status, and a
success, stop, or escalation condition.

Current code uses `Draft`, `Testing`, `Pending Approval`, `Active`, `Needs Revision`, and `Retired`.
S21 no longer puts validation-passing Editor content/process saves into `Pending Approval`; each creates
a versioned Active update with history/rollback under the automated trust boundary. Simulation-only
runs remain marked and cannot write/send/update externally.
Pending automation steps should show target system, expected action, missing permission
or connection, and approval owner.

Each external action type must be individually approved before it becomes executable.
Approval should be scoped by target system and action type, not blanket system access.
Per-run authority follows S20: Editor direct Low/Medium, Admin-approved High, no technical Blocked
override, and all-risk Admin self-approval. Current gates stay unchanged until implemented. Planned actions remain visible while non-executable so the team can
keep refining workflows before integrations are live.

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
owner communication, route Dan approval, and prepare an approved unsent draft or separately
exact-confirmed linked reply. No autonomous send is part of V1.

The Rentvine lease record is read-authoritative for lease timing and Dotloop holds executed signed
leases. Manual workflow start also remains available.

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

The legacy approval email sender is hard-disabled. Historical email preferences may remain visible
for audit but cannot activate delivery. Any future human-confirmed notification-draft lane requires
a separate approved spec. Console/Notifications remains the source of truth, and failed in-app
notification processing creates Admin-visible health rather than an automatic email retry.

Approval queue Admin health should show in-app processing status, stale overdue count, and blocked
item count, with historical email state explicitly labeled inactive. Health status
should use `Healthy`, `Needs Attention`, and `Action Required`. `Action Required` means
something is broken or blocking work, such as failed notification processing or unresolved blocked
high-risk items. Admins should be able to open health details directly into the affected queue
items or audit records.

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

S14 replaces the earlier list-only mobile direction for renewal decisions. The shipped
review surface pages one value-bearing renewal flag at a time over the existing
`RenewalRunView`, with a phone-first suggested-source action and an explicit switch back
to the established desktop cards and run-page bulk bar. High/Blocked flags and manual
overrides retain the full audited form.

The unified Approval Queue remains a value-free urgent list. Only a safe Low/Medium
`queue_item` may expose one inline app-plane approval; renewal-flag and write-back rows
remain deep links to the run page where their values and governed actions live.

Approval Queue empty, loading, and error states should be plain and production-safe. An
empty queue should say there is nothing currently waiting for review and should not show
fake/demo queue items. Loading and error states should use plain-English messages with
one obvious retry or open action. Missing evidence, permissions, or connections should
create or route to a `Blocked` queue item instead of appearing as a vague broken screen.
Production queue views should never show demo/test items unless the run is clearly marked
as a test/demo run.

Approval Queue permissions stay explicit by role/action. S20 allows internal Editors to directly
execute enabled Low/Medium instances, routes consequential High work to Admin, permits Admin self-
approval, and preserves technical Blocked conditions. Admins can view all queue items, disable actions, view health,
and expand full Activity/audit details. Permission errors explain the missing role/action and route
to a safe next step instead of showing a generic failure.

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

Approval risk levels are `Low`, `Medium`, `High`, and `Blocked`. `Low` covers read/health/local draft/
governed reversible label and internal cleanup. `Medium` covers exact-confirmed workflow email/portal/
SMS, S21 trusted publication, and S26 validated append-only assigned-ticket photo. `High` covers SoR
value/status, document, account/role/OAuth, accounting, and unbounded/overwrite/delete Drive mutation.
`Blocked` means missing fact, validation, documented contract, connection, permission, scope, or
approver; Admin owns remediable review but cannot waive a technical blocker.

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

Missing-fact links should offer two first actions: `Add process note` and `Add source document`.
Under S21, a validation-passing process note/source update becomes Active immediately with audit and
rollback; `Add source document` uses the approved root/connector trust boundary. When a
missing fact is filled, the run re-checks only affected facts and steps rather than restarting.

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
that non-executable boundary. The signed-lease/lease-end sources are resolved (Dotloop/Rentvine);
it still needs final source ownership, operational acceptance, and separately approved external
write permissions.

### Workflow Communications

Workflow Communications is a Gmail-backed adapter and evidence source for renewal and maintenance.
The KB starts from workflow context, stores bodyless linkage and reviewed operational meaning, and
uses value-free attention for linked replies. Gmail remains the message system of record.

Do not define it as a new inbox, generic compose client, autonomous sender, historical mailbox
classifier, Gmail content warehouse, or system-of-record updater unless a later approved privacy and
governance spec explicitly changes that boundary.

## Gap-Closing Loop

1. Start with the product lane doc and this gap plan.
2. Classify each unknown as one of three types: product definition, access/source, or
   implementation detail.
3. Ask only for decisions that change product scope, permissions, acceptance, or source
   authority.
4. Record the answer in the product lane doc when it changes scope, in
   `docs/research-backlog.md` when it remains open, and in `docs/client-checklist.md`
   when the client must act.
5. Do not add a new runtime action or widen an existing one for Lease Renewal Agent or Workflow
   Communications until that exact target is answered well enough to write acceptance tests.

## Continuous Follow-Up Questions

Use these questions repeatedly until each product lane has a testable v1 definition.
They are not a script; they are the minimum decision set needed to avoid building the
wrong thing.

| Product                 | Question                                                                                                  | Why it matters                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| All                     | Which product launches first, and what client pain proves it worked?                                      | Prevents demo order, engineering order, and sales language from diverging.                         |
| All                     | Who owns final wording, source approval, user acceptance, and post-launch support?                        | Prevents AI sessions from treating unowned assumptions as approved requirements.                   |
| PMI KC KB               | Which production Spaces launch first, and which approved source folders feed them?                        | Defines the first real retrieval/citation surface.                                                 |
| PMI KC KB               | Which final acceptance/support/rollback owners sign off the expanded external V1?                         | Turns the deployed foundation into an operated release.                                            |
| Lease Renewal Agent     | Which exact Sheet scope and safe scenarios prove the operational V1?                                      | Locks production acceptance without reopening resolved source discovery.                           |
| Lease Renewal Agent     | Which demo, client-context, and team materials are approved as starter sources?                           | Prevents observed or informal context from being treated as final authority too early.             |
| Lease Renewal Agent     | Which systems may be read or updated, and what requires approval?                                         | Prevents unsafe write paths across RentVine, DotLoop, LeadSimple, Drive, Sheets, Gmail, and tasks. |
| Maintenance             | Where do maintenance requests and phone notes live?                                                       | Determines the source for tenant request and call-note triggers.                                   |
| Maintenance             | Which common issue templates and escalation rules are approved?                                           | Determines when tenant-facing replies can be automated.                                            |
| Move-Out                | Which natural triggers are authoritative?                                                                 | Determines event sources for email notice, lease date, forms, inspections, and related events.     |
| Workflow Communications | Which configured runtime adapters resolve renewal/maintenance recipients and values?                      | Gates source-backed initiation; R06/R07 retention/artifact/AI policy is already settled.           |
| External providers      | Which non-secret account/plan/template/stage/folder mappings and credentials support each S25/S26 action? | Converts the locked action matrix into documented, testable provider contracts.                    |

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
