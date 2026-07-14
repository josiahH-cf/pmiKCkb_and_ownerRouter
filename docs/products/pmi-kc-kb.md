# PMI KC KB Product Lane

## Current State

PMI KC KB is the deployed source-backed web app runtime in this repository. It supports
Google sign-in boundaries, editable Spaces, SOP/template/tool/placeholder records,
Approval Queue behavior, Ask logging, source-state handling, citation validation,
Gemini answer validation, Admin observability, and demo/deploy scripts.

The client-owned Cloud Run/Firebase/GCP foundation, canonical auth host, first Admin path, live
Rentvine/renewal-Sheet reads, and bounded production smoke are established. Round 1 approved the tab
visions and named Dan for business acceptance and Josiah for technical go-live/monitoring/rollback.
Round 3 locks final V1 as an external-user release with risk-bounded Editor execution, all-risk Admin
self-approval, immediate trusted publication, live-only production Console data, every R02/R03 workflow
action, and an MFA/assigned-ticket/per-vendor-Gmail-OAuth Vendor portal. S20–S27 are decision-complete;
their implementation, provider/source readiness, action-by-action proof, and browser acceptance remain.
The 2026-07-14 Workflow Communications boundary is verified locally but not committed/deployed.

Production Approval Queue views should not fall back to fake/demo queue items. An empty
production queue should plainly say nothing is currently waiting for review. Demo/test
items can appear only when the run is clearly marked as a test/demo run.

Approval Queue permissions remain explicit by role/action. S20's target lets internal Editors directly
execute enabled Low/Medium instances, routes consequential High work to Admin, permits Admin self-
approval at every risk, and never lets approval waive a technical Blocked condition.
External Vendors are a separate assigned-ticket-only role, not Editors. Admins manage all queue
items, disabled actions, health, and expanded Activity/audit details. Permission errors explain the
missing role or action and route to a safe next step.

## Confirmed Product Direction

PMI KC KB remains the production source-backed app while expanded workflow automation is specified
and added in staged slices. Intermediate candidates may remain internal/pre-V1, but final V1 includes
external Vendor users and named system-of-record actions. Internal roles remain optionally narrowed
by renewals/maintenance scopes:

- `Editor`: asks questions, edits app-plane records, starts safe test workflows, and directly
  executes enabled Low/Medium actions within scope. Consequential High work goes to Admin. S20 is
  Local green; Registry-closed later adapters remain non-executable until their own suites pass.
- `Approver`: has Editor capabilities plus app-plane approval and exact-confirmed linked-reply
  authority where the relevant action and workflow context are approved.
- `Admin`: has Approver capabilities plus user/access, readiness, settings, high-risk approval,
  and action-governance administration; Round 2 explicitly permits all-risk self-approval/execution.
- `Vendor` (new for V1): Admin-invited external account with one-time password setup and verified-email
  TOTP before detail; sees only assigned Maintenance tickets and connects the same Gmail/Workspace
  address through per-vendor OAuth. It never grants internal Console/Spaces/Approval Queue/Connections/
  Admin or DWD reach.

Initial Admins are Josiah and Dan. Admins may grant the Admin role to additional users
they choose.

Dan and Josiah remain initial internal Admins. Final V1 additionally requires at least one external
Vendor acceptance user; internal delegation continues to use Editor or Approver plus optional space
scopes and does not introduce a generic `User` role.

Approval notifications are in-app for the first release. The legacy event-driven Gmail sender is
hard-disabled and must not be treated as an approved delivery lane. S25/S26 authorize only workflow-
specific human-confirmed communications; automatic approval-notification email remains outside V1.

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

Owner Onboarding remains the likely fourth/fallback workflow. Automation means actual backend
actions in connected systems, not only checklists or drafts. Current implementation has four
narrowly scoped workflow Gmail actions but no approved non-Gmail system-of-record write path. R02/R03
make every S25/S26 action app-executed final-V1 scope; none is silently tracked-manual/later. Every
executable write/send/update still needs its own documented endpoint,
per-action spec, least-privilege permission, preview, idempotency, tests, audit, failure behavior,
and rollback before its Action Registry gate may open.
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
rollback, and whether production execution is allowed. Four narrowly scoped Gmail workflow
transport actions are currently allowlisted; generic send and every non-Gmail external
system-of-record write remain non-executable.

The first workflow-management layer is loosely editable. S21 now makes every validation-passing in-scope
Editor-added process template, step, source link, file, or folder Active immediately after configured-
root/scope/type/size/malware/sensitivity checks, with immutable version/rollback/audit. A
published content/process change can never enable an external action, grant a role, or widen a
credential; those remain Admin/action-governance operations.

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

Workflow notifications should fire in-app for `Ready for Approval`, `Blocked`, failed
automation, and overdue due dates. Other delivery channels remain future/TBD. The
default recipients are the workflow owner/final approver and the person assigned the
next action. The workflow starter receives notifications only when their action is
needed or when the run completes or fails. This does not authorize customer-facing sends.
Failed internal notification processing creates an Admin-visible in-app health warning; it never
triggers an automatic email retry.

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

Current code retains `Pending Approval`/`Needs Revision` for legacy queued records alongside `Draft`,
`Testing`, `Active`, and `Retired`. S21 no longer routes validation-passing Editor content/process saves through
`Pending Approval`: they create an audited, versioned Active update immediately. Test runs remain
clearly marked and simulation-only; publication never makes a referenced external action executable.

Future automation steps should remain visible as pending automation. The AI can describe
how the automation is expected to work, but the app must show the action as pending and
non-executable until a future spec approves the integration.

Pending automation steps should show at least the target system, expected action,
missing permission or connection, and approval owner.

Before any external action executes, the app should show a preview of exactly what will
change, where it will change, and why. Every executable external action should have a
rollback or correction note before approval. Admins should be able to disable any action
type immediately without deleting the process definition.

Every validation-passing Editor save should create a versioned Active copy with history and rollback
under S21. External-action enablement remains separate.

Initial automation authority follows S20:

- AI prepares proposed workflow actions.
- Admins may self-approve at every risk; internal Editors directly execute enabled Low/Medium actions;
  consequential High work requires Admin; technical Blocked conditions remain closed.
- The system executes only actions whose type, actor/scope, workflow context, preview, and production
  gate are all valid.
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

- Run `docs/v1-gap-implementation-program-2026-07-14.md` from S20 through S27 with fake providers/
  emulators, keeping current live gates closed.
- Preserve the current Workflow Communications worktree and keep verification green at each slice.
- Build one provider/action adapter per slice with preview, authority, idempotency, reconciliation,
  audit, rollback/correction, and tests.
- Prepare source/provider manifests and exact live approval packets; stop before credentials, live
  reads/writes/sends, configuration, deploy, or smoke.

## Current Blockers

- S20–S27 implementation and action-by-action external provider proof.
- Approved production source folders/files, sensitivity decisions, `sources_meta`, and
  source/data-store maps for the launch Spaces.
- Named acceptance, go-live, monitoring/support, and rollback owners plus the final operator roster.
- Browser acceptance of the release candidate, followed by explicit deploy/smoke approval.

R01–R09 remove the prior assumption that the Vendor portal or non-Gmail workflow outputs are post-V1.
Every S25/S26 action blocks the final V1 label until implemented and accepted. Product inclusion still
does not authorize a live action.

## Acceptance Gates

- `npm run preflight:production` passes against client-owned settings.
- Managed internal sign-in remains `pmikcmetro.com`-only. The separate Vendor sign-in accepts only
  Admin-invited external accounts and enforces assigned-ticket-only authorization.
- At least one approved production Space returns cited answers from approved sources.
- Unsupported questions return `No Reliable Source Found`.
- Admins may self-approve at every risk; internal Editors directly execute enabled Low/Medium actions
  under S20. External Vendors remain assigned-ticket-only and use only S22/S26 actions.
- No writes occur to external systems or client Drive folders outside explicitly allowed
  production setup.
- Editors can start safe test workflows, immediately publish S21-validated content/process changes,
  and execute enabled Low/Medium actions under S20; each backend action remains separately gated by its
  documented Action Registry contract.
- In-app approval notifications and Admin-visible delivery health are enabled; the legacy Gmail
  sender remains disabled.
- Failed notification processing surfaces for in-app escalation instead of failing silently.
