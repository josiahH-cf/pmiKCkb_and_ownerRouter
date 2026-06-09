# PMI KC KB Product Lane

## Current State

PMI KC KB is the existing source-backed web app runtime in this repository. It supports
Google sign-in boundaries, editable Spaces, SOP/template/tool/placeholder records,
Approval Queue behavior, Ask logging, source-state handling, citation validation,
Gemini answer validation, Admin observability, and demo/deploy scripts.

The current working demo is not production cutover. Production requires client-owned
Google resources, approved sources, and acceptance testing.

Production Approval Queue views should not fall back to fake/demo queue items. An empty
production queue should plainly say nothing is currently waiting for review. Demo/test
items can appear only when the run is clearly marked as a test/demo run.

Approval Queue permissions follow the simple product-facing role model. Normal users can
act only on assigned or otherwise relevant items. Admins can see and manage all queue
items, high-risk approvals, disabled actions, health, email settings, and expanded
Activity/audit details. Permission errors should explain the missing role or action and
route to a safe next step.

## Confirmed Product Direction

PMI KC KB should launch first as the production source-backed app while the backend
automation layer is scoped and added in phases. The first production launch is internal
only and uses a simple product-facing role model:

- `Admin`: manages sources, approvals, settings, and backend action approvals.
- `User`: asks questions, starts workflows, and suggests edits, but cannot approve final
  source changes or backend actions.

Initial Admins are Josiah and Dan. Admins may grant the Admin role to additional users
they choose.

The first launch does not need separate `User` accounts beyond Josiah and Dan. The
`User` role remains available for later delegation.

Gmail send-only approval notifications should be enabled for production launch and
incorporated into the Gmail Inbox 0 vision. Launch recipients are Dan and Josiah's PMI
KC account. Notifications should come from `kb-automation@pmikcmetro.com`, use a clear
approval subject line, and apply the `KB Approval` Gmail label. If delivery fails, the
system should create an in-app alert, retry email once, and then escalate to Dan/Josiah
Admins in-app and by email if the retry fails.

The first production Spaces are:

- Lease Renewals.
- Maintenance Work Order Intake.
- Move-Out + Deposit Disposition.
- Owner Onboarding.

Existing demo/sanitized materials may bootstrap those Spaces, but they must quickly be
replaced or reinforced by Admin-approved production sources of truth.

The Lease Renewals Space starter source set can include a video demo, context from the
client, and information from the team. Once captured in the client-accessible source
location, those materials should be treated as source-of-truth inputs rather than split
into separate raw-discovery and approved-source areas.

Captured Lease Renewal workflow notes should first live in a client-accessible source
location where PMI KC can add context. The preferred location should also be connectable
to whatever retrieval, indexing, or app capability gives the KB the strongest approved
source-backed behavior. The exact folder, system, or connector is still TBD.

The default first source location is a PMI KC-accessible Google Drive folder unless
setup discovers a better client-accessible, app-connected source. Drive can serve as the
human collaboration folder even if the production retrieval/indexing path later uses a
different approved target.

The source-of-truth folder should be curated frequently through AI-proposed changes,
Dan's human review, and continuous documentation improvement. Dan decides the review
cadence. Source updates should sync automatically and continuously from the
team-editable source-of-truth folder rather than wait for Dan approval or rely on manual
import-on-demand. The exact connector/indexing implementation still needs setup
validation.

The likely implementation is that the Google Drive source-of-truth folder feeds an
indexed source layer automatically, rather than the app relying only on direct Drive
reads. Research/setup should confirm the best path before implementation.

The first indexed-source candidate to test is Cloud Storage plus Agent Search periodic
ingestion, with Drive remaining the team-facing collaboration folder.

For the Drive-to-Cloud-Storage handoff, assume the simplest low-cost automation that
works for users: copy changes from the team-editable Drive source folder into Cloud
Storage for indexing, then let the index/app handle freshness. Cloud costs are
pass-through, so implementation should minimize ongoing services, indexed volume,
polling frequency, duplicate stores, and unnecessary automation.

Do not start with a narrow file-type whitelist for the Lease Renewal source folder. All
useful source file types may live there and be eligible for the copy path, subject to
sensitivity rules and setup validation. If a useful file type cannot be indexed
directly, the automation should convert, summarize, or skip it with a visible reason
rather than forcing users to manage indexing formats.

The Lease Renewal source folder should stay clean: non-sources-of-truth should be moved
out of the source folder instead of left there for the copy or indexing path to skip.
The destination for non-source, reference, or archive material is TBD.

For the Lease Renewal source-of-truth folder specifically, the whole PMI KC team should
be allowed to edit directly at first so they can add context quickly. This does not
define the later curation, indexing, or automation approval workflow.

## Automation Target

The KB's end state includes AI-started backend automation for three client-defined
processes:

1. Lease Renewal end to end.
2. Maintenance Work Order Intake end to end.
3. Move-Out + Deposit Disposition end to end.

Owner Onboarding remains the likely fourth/fallback workflow. Automation means actual
backend actions in connected systems, not only checklists or drafts. Current
implementation still has no approved external write paths; every write/send/update path
requires a future per-process spec, permissions, tests, audit logging, and rollback.
Each external action type must be individually approved before it becomes executable.
Approval is scoped by target system and action type, not blanket system access.
External action readiness states should be `Planned`, `Needs Connection`,
`Needs Permission`, `Ready for Test`, `Approved for Execution`, and `Disabled`.

Build order follows documented capability, per `docs/integration-architecture.md`.
Maintenance Work Order Intake is the first executable-write target because Rentvine
work-order writes and the LeadSimple Rentvine maintenance sync are documented; Rentvine
holds the work order, LeadSimple orchestrates, QuickBooks records the downstream
accounting artifact, and Sheets stays an exception/coordination surface. Lease Renewal
preparation can proceed read-only, but the Rentvine lease-renewal writeback is
undocumented in the public API and stays non-executable until vendor confirmation and an
approved per-action spec. Each external action type is catalogued in the Action Registry
(`action_registry` collection, seeded by `npm run seed:action-registry`), which records
target system, documented evidence, required permissions and plan, readiness, preview,
rollback, and whether production execution is allowed; every registry entry is
`production_allowed: false` until an approved spec changes it.

The first workflow-management layer should be loosely editable for process definitions.
The whole team should be able to propose or edit process templates, steps, source links,
and documentation pointers as new processes are discovered. Those changes should go
through approval before becoming active. That editability is for the KB and workflow
configuration layer; it does not by itself approve writes into external systems of
record.

Dan and Josiah should be the default Admin approvers for process-definition changes
until they delegate that approval authority to someone else.

The KB should own the first workflow-run record so context stays in one central,
non-technical place. External systems should be referenced with backlinks and action
records, not treated as the first source for workflow state. This keeps process context
together now and allows separate processes to merge into larger workflows later. Owning
the workflow-run record does not make the KB the system of record for external facts:
Rentvine stays authoritative for leases, properties, contacts, work orders, and
inspections, and the KB references those facts rather than replacing them.

Each workflow run should show a human-readable summary at the top with current status,
next action, blocker, owner, and due date if known. The run should also show a timeline
of steps, decisions, approvals, comments, and system actions.

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
authorize customer-facing sends.

Failed internal notifications should create an in-app alert and retry email once. If
that retry fails, the failure escalates to Dan/Josiah Admins in-app and by email.

Test runs should be visually separate from real operational runs and excluded from
production metrics unless an Admin explicitly includes them.

Minimum v1 fields for a startable process definition:

- Process name and short outcome.
- Trigger or manual start condition.
- Process owner and default approver.
- Source/documentation links.
- Required starting inputs.
- Initial step list.
- Action references marked as manual, draft-only, future automation pending, or approved
  executable action.
- Success condition, stop condition, or escalation condition.

Process definition statuses should be `Draft`, `Testing`, `Pending Approval`, `Active`,
`Needs Revision`, and `Retired`. Draft or Testing definitions may be started for test
runs, but test runs must be clearly marked and simulation-only: no external writes, no
sends, and no live system updates. Active definitions are required for real operational
runs.

Future automation steps should remain visible as pending automation. The AI can describe
how the automation is expected to work, but the app must show the action as pending and
non-executable until a future spec approves the integration.

Pending automation steps should show at least the target system, expected action,
missing permission or connection, and approval owner.

Before any external action executes, the app should show a preview of exactly what will
change, where it will change, and why. Every executable external action should have a
rollback or correction note before approval. Admins should be able to disable any action
type immediately without deleting the process definition.

Every approved process definition should create a versioned Active copy with history
and rollback. Activating a process definition should require source/documentation links
and at least one successful test run unless Dan or Josiah explicitly override the gate.

Initial automation should use explicit per-action approval:

- AI prepares proposed workflow actions.
- An Admin or process-specific approver reviews each write/send/update for that run.
- The system executes only approved actions.
- Each executed action records who approved it, what changed, source facts used,
  before/after values, target system, and timestamp.
- Each AI-generated recommendation keeps source links, confidence, and reasoning visible
  to the reviewer.
- A failed automation marks the run `Failed` only when the failure blocks the run;
  otherwise, the failed step is marked `Failed` and the run moves to `Blocked`.
- Any external action failure preserves the attempted payload, error message, target
  system, timestamp, and retry status in the audit trail.

Whole-workflow approval can be considered later after individual action approval is
proven reliable.

## Active Source Of Truth

- Product behavior: `docs/spec.md`, interpreted through `docs/north-star.md`.
- Milestones: `docs/plan.md`.
- Production runbook: `docs/client-production-cutover.md`.
- Google setup: `docs/google-setup.md` and `SETUP.md`.
- Current state: `docs/status.md`.

## What Can Proceed Now

- Keep verification green.
- Prepare source manifests and production preflight inputs.
- Improve docs, tests, and demo safety.
- Add production-hardening code only when it maps to the KB spec and current milestone.
- Scope workflow-run pages and action-approval models without adding external writes
  until the relevant process spec is approved.
- Apply the migration-readiness stop gate before starting another local workflow or
  Approval Queue slice. If the next change does not improve cutover readiness,
  verification, handoff, or a known quality issue, defer it until client-owned
  production context or approved product scope is available.

## Current Blockers

- PMI KC-owned GCP/Firebase project access and billing.
- Production Firebase Auth authorized domains and role assignments.
- Approved production source folders/files by Space.
- Source sensitivity review and `sources_meta` decisions.
- Agent Search data-store IDs and source/data-store maps.
- Gmail notification failure-escalation details: channel, owner, retry behavior, and
  alert surface.
- Final smoke users and acceptance reviewers.
- Approved write specs and integration permissions for any backend automation action.
- Process-specific approvers beyond the Admin default.
- Later User list, when Josiah or Dan choose to delegate access.

## Acceptance Gates

- `npm run preflight:production` passes against client-owned settings.
- Sign-in works for allowed-domain users and rejects wrong-domain users.
- At least one approved production Space returns cited answers from approved sources.
- Unsupported questions return `No Reliable Source Found`.
- Users cannot approve; Admins can approve/return/resolve.
- No writes occur to external systems or client Drive folders outside explicitly allowed
  production setup.
- Users can start workflows and suggest edits, while Admins approve source changes and
  backend actions.
- Gmail send-only approval notifications are enabled with approved sender, recipient,
  subject-line, and label settings.
- Failed approval notifications surface for escalation instead of failing silently.
