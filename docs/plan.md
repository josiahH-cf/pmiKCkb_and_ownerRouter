# PMI KC Three-Product Plan

## Product Summary

This repo governs three purchased PMI KC products:

- PMI KC KB: existing source-backed web app runtime and future workflow-control layer.
- Lease Renewal Agent: first backend automation target after KB production lift.
- Gmail Inbox 0: Dan-email-first Gmail workflow, successor to Owner Router/Dan's AI
  Assistant.

Older KB-only and separate Owner Router repo plans are legacy unless this plan or a
product doc explicitly preserves a safety boundary.

## Current Audit Snapshot

- PMI KC KB has a working demo/runtime foundation: auth boundaries, editable API/UI
  paths, Approval Queue behavior, Admin observability, live retrieval boundaries, Gemini
  answer validation, Ask logging/capture, source-state handling, tests, demo scripts,
  and deployment helpers.
- The KB is not client-production complete. It still needs PMI KC-owned resources,
  approved production sources, auth/domain/role setup, source/data-store maps, Gmail
  notification decision, and final acceptance.
- The KB target state now includes AI-started backend automation for Lease Renewal,
  Maintenance Work Order Intake, and Move-Out + Deposit Disposition. Production launch
  should happen before these external write paths are built.
- Lease Renewal Agent is the first automation build after the KB is stood up in
  production. Existing Lease Renewals KB material is reference material; signed-lease
  storage, central workflow record, integrations, and write permissions remain TBD.
- Gmail Inbox 0 is the active client-facing name for the Owner Router/Dan's AI
  Assistant direction. The pilot starts with Dan's whole mailbox, two low-disruption
  labels, manual send authority, and a minimal KB-hosted management page.
- The old sibling Owner Router artifact repo exists locally and may be mined for Gmail
  Inbox 0 source material, but active governance now lives in this monorepo.

## Cross-Product Phases

### P0 - Governance Realignment

Acceptance criteria:

- `AGENTS.md` routes to the three product lanes.
- `docs/north-star.md`, `docs/products/`, and cross-product checklists exist.
- Legacy separate-Owner-Router docs are moved or marked as superseded.
- `docs/status.md` records the realignment and next step.

Validation:

```bash
npm run format:check
git diff --check
```

### P1 - Discovery And Source Inventory

Acceptance criteria:

- Product owners and acceptance reviewers are named.
- Client answers the concrete asks in `docs/client-checklist.md`.
- `docs/research-backlog.md` is updated with answered, open, and blocked items.
- Each product lane distinguishes confirmed facts from assumptions.

Validation:

```bash
npm run format:check
```

### P2 - Access And Account Setup

Acceptance criteria:

- PMI KC-owned GCP/Firebase project and billing path are confirmed.
- Workspace domains, test users, and authorized domains are approved.
- Drive folder/source ownership is known.
- Gmail Inbox 0 setup authority and safe test approach are approved.
- No secrets or raw client data are committed.

Validation:

```bash
npm run host:check
npm run preflight:production -- --env-file=.env.production.local
```

### P3 - Integration Capability Verification

Acceptance criteria:

- KB production integrations are verified against client-owned or approved staging
  resources.
- Gmail Inbox 0 label/filter/Gem or prompt-pack capability is verified without touching
  live client mail unsafely.
- Lease Renewal Agent candidate integrations are classified as read-only, write-capable,
  unsupported, or blocked.
- Unverified capabilities remain in `docs/research-backlog.md`.

Validation:

```bash
npm test
npm run test:firestore
```

### P4 - Product V1 Scope Lock

Acceptance criteria:

- PMI KC KB production cutover scope is locked.
- Lease Renewal Agent has approved v1 inputs, outputs, trigger model, permissions,
  source requirements, and acceptance scenarios.
- Gmail Inbox 0 has approved label names, owner-email sender rules, human send model,
  source files, and live testing plan.
- KB automation has approved workflow-run framework, per-action approval model, and the
  first Lease Renewal integration/source map.
- Process-definition activation gates are approved: Draft/Testing runs are
  simulation-only, Active definitions are versioned with history/rollback, activation
  requires source links plus a successful test run unless Dan/Josiah override, and
  pending automations show their missing permissions or connections.
- Workflow-run UX/audit model is approved: top summary, timeline, visually separate test
  runs, production-metric exclusion for test runs unless included by an Admin, and
  visible source links, confidence, and reasoning for AI recommendations.
- Workflow-run status and notification model is approved: standard run statuses,
  final-approver ownership, source due date or today default, and internal email
  plus in-app notifications for approval-ready, blocked, failed automation, and overdue
  events. Recipients and subject structure are approved for v1.
- Escalation/failure model is approved: blocking automation failures fail the run,
  non-blocking automation failures fail the step and block the run, failed notification
  email retries once then escalates to Dan/Josiah Admins, and external action failures
  keep attempted payload, error, target system, timestamp, and retry status.
- External-action approval model is approved: every executable external action type is
  approved by target system plus action type, first executable actions still require
  per-run human approval, and planned actions remain visible while non-executable.
- External-action readiness model is approved: readiness states are `Planned`,
  `Needs Connection`, `Needs Permission`, `Ready for Test`, `Approved for Execution`,
  and `Disabled`; execution requires a change preview and rollback/correction note; and
  Admins can disable an action type without deleting the process definition.

Validation:

```bash
npm run format:check
```

### P5 - Build And Migration Preparation

Acceptance criteria:

- KB production source manifests are prepared from approved PMI KC sources.
- Lease Renewal Agent implementation tickets and tests are created only after P4.
- Gmail Inbox 0 management-page tickets and Gmail/Gemini integration tickets are created
  only after the Dan mailbox access and safe-scan model are approved.
- Dry-runs exist for imports, setup scripts, seeders, and preflights.

Validation:

```bash
npm run corpus:plan -- --manifest=<approved-manifest> --project=<client-project-id> --location=us --dry-run
npm run seed:launch-skeletons -- --dry-run
```

### P6 - Testing, Training, And Acceptance

Acceptance criteria:

- KB production smoke covers auth, Ask, citations, no-source behavior, edits,
  approvals, and Admin visibility.
- Lease Renewal Agent acceptance scenarios pass once runtime exists.
- Gmail Inbox 0 test scenarios pass against approved safe threads or sanitized threads.
- Dan, Bailey, and named operators complete training and signoff tasks.
- Backend automation tests prove explicit approval, audit fields, rollback/error
  handling, and no unapproved external writes.
- Process-definition tests prove simulation-only behavior for Draft/Testing runs,
  versioned Active copies, activation gates, and pending automation visibility.
- Workflow-run tests prove the summary, timeline, test-run separation, production-metric
  exclusion, and reviewer-visible AI evidence.
- Workflow-run notification tests prove status-triggered notifications, email inclusion,
  in-app inclusion, final-approver ownership, next-action recipient routing, starter
  routing limits, subject structure, and due-date defaulting.
- Failure-handling tests prove run-vs-step failure behavior, one notification retry,
  Dan/Josiah escalation after retry failure, and external-action failure audit fields.
- External-action approval tests prove target-system/action-type scoping, no blanket
  system access, per-run approval for first executable actions, and visible
  non-executable planned actions.
- External-action readiness tests prove readiness state transitions, execution preview,
  rollback/correction notes, and Admin disable without process deletion.
- Approval queue tests prove risk-level classification, confirm-popup behavior for
  high-risk items, default queue ordering, filters, and staff/Admin view differences.
- Approval queue lifecycle tests prove assignee/approver ownership, return-reason
  capture, snooze date/reason and reactivation behavior, and Admin-only disable history.
- Approval queue creation/cleanup tests prove source event creation, duplicate merging,
  refresh with prior-version history, and automatic closure when approval or blocking
  conditions are resolved.
- Approval queue closed-item tests prove changed underlying facts/drafts/actions create a
  new linked queue item instead of silently reopening or editing closed records, and
  prove direct links remain stable.
- Approval queue bulk-action tests prove selected-item bulk approve, disable, execute,
  assign, and snooze paths; per-item permission/risk/readiness enforcement;
  plain-English preview and confirmation; clear ineligible-item handling; per-item
  Activity entries; and no bypass of external-action approval, send authority, or
  high-risk confirmation.
- Approval queue notification tests prove console-only default delivery, configurable
  email delivery, recipient routing, single console reminders, and required notification
  content, plus portal/email escalation for unresolved important `Blocked` or overdue
  items.
- Approval queue email-configuration tests prove Admin-only configuration by event type
  and recipient role, assigned/Admin-selected email recipients, settings visibility,
  console source-of-truth behavior, and non-blocking email failure health/audit records.
- Approval queue Admin-health tests prove visible health fields, health-state
  classification, `Action Required` conditions, and direct links into affected queue
  items, email settings, or audit records.
- Approval queue audit/history tests prove the single append-only Activity log,
  required audit fields, staff/Admin visibility, prior-version preservation, correction
  entries, collapsed low-level system entries by default, and best-practice
  retention/export behavior.
- Approval queue simplicity tests prove limited user-facing controls, Admin-only
  settings placement, fixed structured fields for AI/automation, and new-setting gates
  for owner, default, disable path, and test coverage.
- Approval queue fixed-field tests prove the v1 field set, source-link/preview/Activity
  evidence attachment, AI-readable state boundaries, no custom fields, and new-field
  guardrail enforcement.
- Approval queue MVP-screen tests prove one-list/detail-view layout, limited list
  columns, detail content, and Admin-only health/settings separation.
- Approval queue mobile/responsive tests prove same model on desktop/mobile, stacked
  mobile readability, limited mobile list fields, visible primary actions, and shared
  fixed-field/Activity source.
- Approval queue empty/error-state tests prove production-safe empty states, no fake/demo
  production queue items, plain loading/error messages, `Blocked` routing for missing
  evidence/permissions/connections, and clear test/demo run marking.
- Approval queue permission tests prove normal user/Admin boundaries, self-approval
  blocking, safe permission-error messages, and Admin triage routing for missing assignee
  or approver.
- Approval queue AI-boundary tests prove AI can suggest fixed-field values but cannot
  approve, disable, close, execute, override permissions, or make suggestions effective
  outside the normal action/approval path.
- Approval queue comment/reason tests prove comments and reasons are Activity entries,
  not direct fact/draft/process/source/action mutations, and that proposed updates are
  created when comments identify needed changes.

Validation:

```bash
npm run typecheck
npm test
bash scripts/verify.sh
```

### P7 - Production Cutover And Monitoring

Acceptance criteria:

- Go-live owner, support window, rollback owner, and monitoring owner are named.
- Production deploy/setup steps are executed from client-owned resources.
- Smoke tests pass after cutover.
- Exceptions and next iteration work are recorded in `docs/status.md`.

Validation:

```bash
npm run preflight:production -- --env-file=.env.production.local
bash scripts/verify.sh
```

## Product Lane Gates

### PMI KC KB

Current state: runtime exists; production cutover remains.

Key gates:

- Approved production sources and source-state metadata.
- Client-owned GCP/Firebase/Auth/Firestore/Agent Search setup.
- Production `APP_BASE_URL`, source maps, data-store maps, and role assignments.
- KB approval Gmail notification enabled only after sender/recipient approval, or
  explicitly disabled.
- Internal-only launch with `Admin` and `User` as the product-facing roles.
- First launch Spaces: Lease Renewals, Maintenance Work Order Intake, Move-Out +
  Deposit Disposition, and Owner Onboarding.
- Backend automation write paths added only after approved per-process specs.

### Lease Renewal Agent

Current state: first backend automation target, but integration/source discovery remains
required.

Key gates:

- Confirm signed-lease storage, source systems, allowed reads/writes, central workflow
  record, human review points, and acceptance scenarios.
- Treat signed lease or lease-term record as the first authoritative renewal trigger
  source, pending client system confirmation, while preserving manual start.
- Build read/gather actions before write actions: signed lease and dates,
  tenant/property facts, owner information, current rent/terms, and renewal timeline.
- Show imported fact source, timestamp, and confidence before approval; block conflicting
  facts until a human chooses the correct source; and maintain a missing-facts list with
  AI-suggested locations plus links to add the missing resource or description.
- Display imported fact confidence as `Verified`, `Likely`, `Needs Review`, or
  `Conflict`; only facts that are both `Verified` and approved flow into owner-facing
  drafts without visible warning, drafts always show traceable links/sources/supporting
  facts, `Likely` facts require review before approval, and `Conflict` facts block
  owner-facing drafts and executable actions until resolved.
- Resolve conflicts by human source selection or corrected value, recording resolver,
  reason, chosen source/corrected value, and timestamp. Corrected values create proposed
  source/process updates. Legal, financial, and notice-timing conflicts require
  Dan/Josiah Admin approval.
- Missing-fact links offer `Add process note` and `Add source document`; process notes
  create approval-gated proposed updates, source documents point to the approved
  Drive/source folder and source sync, and filled facts trigger targeted re-checks of
  only affected facts/steps.
- Build first outputs as workflow summary, owner communication draft, internal update
  preview, and approval package.
- Approval packages include workflow summary, relevant draft/output/action, verified
  fact list, unresolved warnings, planned internal updates, pending automation notes,
  and send/update preview.
- Dan approval covers the owner communication and facts used by it. Explicit external
  write approvals can be included as separate actions, while unrelated external writes
  are not silently approved.
- Internal update previews remain separately approvable by action through an obvious,
  low-friction approval queue for client and staff review.
- Approval queue items are grouped by audience: Dan/Admin decisions, team follow-up,
  outside waiting, and failed/blocked automation. Items show plain-English action, risk,
  source evidence, affected system, before/after preview, and required approver.
- Approval queue actions are `Approve`, `Return for Revision`, `Assign`, `Snooze`,
  `Disable Action`, and `Open Run`.
- Approval queue items have one current assignee and one required approver. The return
  action requires a plain-English reason and sends the item back to the creator or last
  editor. `Snooze` requires a date and reason, then returns the item to the active queue
  on that date or if risk/status changes. `Disable Action` is Admin-only, requires a
  reason, and preserves the disabled action in history.
- Approval queue items are created from approval packages, process-definition changes,
  failed/blocked automation, external-action readiness, and source/fact conflicts.
  Duplicate items for the same run/action merge into one open item with history. When
  the underlying fact, draft, action, or preview changes, the queue item refreshes and
  preserves the prior version. Queue items close automatically when approved, completed,
  cancelled, disabled, or when the blocker is resolved and no approval remains.
- When a fact, draft, action, or preview changes after a queue item is closed, the app
  creates a new queue item linked to prior Activity history instead of silently reopening
  or editing the closed record. Queue item direct links remain stable after status
  changes.
- Approval Queue v1 includes bulk approve, bulk disable, bulk execute, bulk assign, and
  bulk snooze for selected visible items. Bulk actions respect every selected item's
  individual permissions, risk level, required approver, and readiness state. Bulk
  actions show a plain-English preview, require confirmation, skip or block ineligible
  items with a clear reason, and write per-item Activity entries. Bulk execute does not
  bypass external-action approval, owner/tenant-facing send authority, or high-risk
  confirmation rules.
- Approval queue notifications appear in the app console for item created, assigned,
  returned for revision, unsnoozed, blocked, unblocked, overdue, and closed events.
  These events do not all send email by default; email delivery is configurable. Queue
  notifications go to the current assignee and required approver. Creators/editors are
  notified only when their action is needed or their item closes. Reminders start as a
  single console notification, not a repeating sequence, with no default 24-hour
  follow-up or Admin escalation sequence unless configured later. Each notification
  includes the plain-English action needed, due date, risk level, affected process/run,
  and direct queue-item link.
- Routine approval queue email delivery is off by default and configurable by Admins per
  event type and recipient role. The built-in exception is unresolved important
  `Blocked` or overdue escalation, which sends portal and email notifications to
  assigned and/or Admin-selected recipients. Email settings show event type, enabled
  state, recipient roles, trigger condition, frequency/cooldown, subject preview, and
  last send/error status. Email never replaces console notifications; the app console
  remains the default source of truth. Email delivery failure does not block the queue
  item, but creates an Admin-visible health warning and audit entry.
- Approval queue Admin health shows queue email status, failed delivery count, last
  failure, disabled event types, stale overdue count, and blocked item count. Health
  status uses `Healthy`, `Needs Attention`, and `Action Required`. `Action Required`
  means something is broken or blocking work, such as failed notification delivery,
  disconnected email config, or unresolved blocked high-risk items. Admins can open
  health details directly into affected queue items, email settings, or audit records.
- Approval queue audit/history stays simple: one automatic, append-only Activity log per
  queue item rather than multiple audit modes or toggle-heavy options. Each meaningful
  queue state change records actor, timestamp, action, previous state, new state, reason
  when supplied or required, and source trigger. Staff see a plain-English Activity
  summary only when it affects what they need to do. Admins can expand the same Activity
  feed for full audit fields when needed. The log automatically preserves prior versions
  of approval-critical facts, drafts, previews, notification settings, and disabled
  actions. Corrections create new entries instead of editing or deleting old entries, and
  low-level system entries can collapse by default to avoid clutter.
- Activity/audit retention and export follow standard SaaS audit best practices until a
  client/legal policy overrides them: append-only records, Admin-readable history,
  reasonable export for support/review, and no unnecessary sensitive raw data in audit
  payloads.
- Approval Queue v1 avoids extra user-facing toggles, per-user customization, and
  complex settings unless they solve an observed workflow problem. Normal users see only
  the core queue actions and one plain `Activity` view. Admin-only details and settings
  live behind obvious Admin surfaces. AI and automation rely on a small fixed set of
  structured fields, not many optional UI settings. Any new setting requires an owner, a
  plain-English default, a disable path, and test coverage before it is added.
- Approval Queue v1 item fields are limited to process/run, item type/source trigger,
  status, risk, audience group, assignee, required approver, due date, action needed,
  affected system/action, direct link, created timestamp, and updated timestamp.
  Evidence and details attach through source links, previews, and the `Activity` log
  instead of extra toggles or custom fields. AI-readable queue state comes from these
  fixed fields plus `Activity`, not user-specific settings. V1 has no custom queue
  fields; any new field goes through the new-setting guardrail.
- Approval Queue v1 uses one main queue table/list plus a right-side or modal detail
  view, not multiple queue dashboards. The list shows only status, risk, action needed,
  process/run, assignee, required approver, due date, and a direct link or open action.
  The detail view shows summary, evidence links/previews, available actions, and
  `Activity`. Admin-only health and settings are reachable from a simple Admin area, not
  mixed into every normal queue item.
- Mobile Approval Queue v1 uses the same queue list and detail view, with rows or cards
  stacked for readability instead of a separate mobile workflow. Mobile list items show
  only status, risk, action needed, due date, and open action; other fixed fields can
  appear in the detail view. Primary actions remain visible in the detail view without
  requiring users to understand Admin settings. Desktop and mobile use the same fixed
  fields and `Activity` source so AI and automation see one queue model.
- Approval Queue empty, loading, and error states are plain and production-safe. Empty
  queues say nothing is currently waiting for review and do not show fake/demo queue
  items. Loading and error states use plain-English messages with one obvious retry or
  open action. Missing evidence, permissions, or connections create or route to a
  `Blocked` queue item instead of appearing as a vague broken screen. Production queue
  views never show demo/test items unless the run is clearly marked as a test/demo run.
- Approval Queue permissions stay role-simple. Normal users can view assigned or
  otherwise relevant items, open details, take assigned actions, add comments/reasons,
  and return items for revision when they are the assignee. Admins can view all queue
  items, approve high-risk items, disable actions, manage email settings, view health,
  and expand full Activity/audit details. Users cannot approve their own proposed
  process, source, or fact change unless they are Admin and explicitly acting as
  approver. Permission errors explain the missing role/action and route to a safe next
  step.
- Process-specific approvers beyond Dan and Josiah remain TBD, but the app makes them
  easy to add and manage through an Admin console rather than hardcoding people into
  workflow definitions.
- Missing required assignee or required approver moves the queue item to `Blocked` and
  routes it to Admin triage rather than guessing from the starter, creator, or last
  editor. AI can suggest assignee, approver, risk, status, and action-needed values from
  fixed fields, source evidence, and `Activity`, but AI cannot approve, disable, close,
  execute, or override permission checks. AI suggestions become effective only through
  the normal queue action or approval path.
- Queue comments and reasons are stored as `Activity` entries. Comments/reasons do not
  directly change facts, drafts, previews, process definitions, source records, or
  external actions. If a comment identifies a needed source/process/fact change, the app
  creates the appropriate proposed update or queue item.
- Unresolved important `Blocked` or overdue queue items escalate through portal
  notification and email notification for now. Recipients are assigned and/or
  Admin-selected rather than inferred broadly. This escalation email is the exception to
  routine queue email being off by default.
- Approval queue risk levels are `Low`, `Medium`, `High`, and `Blocked`, with `High`
  for owner/tenant-facing, legal/financial/timing impact, or external writes; `Medium`
  for internal workflow-affecting updates/corrections; `Low` for internal notes,
  assignments, snoozes, or non-executable cleanup; and `Blocked` for items waiting on
  missing facts, conflicts, connection, permission, or approver issues.
- Approval queue default view puts `Ready for Approval`, `Blocked`, `Failed`, and
  overdue items first. Filters include process, owner/final approver, assignee, risk
  level, status, due date, and audience group.
- Staff approval queue view hides technical details by default and shows what happened,
  why it matters, and what to do next. Admin view can expand technical details, source
  evidence, API/connection status, and audit trail.
- Approval queue clarification, next steps, errors, and messaging assume non-technical,
  new users. High-risk items use a simple confirm popup; low-risk internal updates can
  be one-click after review.
- Approval package history preserves every revision Dan reviewed and supports
  correction-style rollback where APIs allow it by storing/re-entering previous values.
- Use AI to suggest write actions to add/remove and explain future write/update/send
  behavior during process refinement, while deterministic API checks verify app
  connections before execution readiness.
- Build a workflow-run page model that tracks steps, statuses, approvals, backlinks,
  connected app actions, imported facts, owner draft/send status, and audit details.
- Dan can edit any generated or prepared document as Admin. Owner communication sends
  only after Dan approves the package; later send automation can be layered only after
  testing and a future approved spec.
- No executable external write/send action until the read/gather flow and approval
  package are tested and scope, permissions, and tests are locked.

### Gmail Inbox 0

Current state: Dan-email-first planning lane with reusable Owner Router artifacts.

Key gates:

- Start with `Waiting on Outside` and `Waiting on Team`; later add `Dan Decision` and
  `Draft Ready`.
- Confirm Dan mailbox access, historical scan model, approved auto-label rules, Drive
  source folder/files, Gem path, and safe live testing approach.
- Plan an Admin-only KB management page for labels, rules, approved replies, change
  history, and Gmail/Gemini status.
- Preserve human send authority.
- No autonomous send, no unapproved Gmail read/modify runtime, and no system-of-record
  writes.

## Risks And Unknowns

- Client production resources and admin access are not yet available.
- Lease Renewal Agent requires integrations and permissions not yet known; the full
  system list remains TBD until scoped with the client.
- Maintenance automation requires further chatbot/phone-system product alignment; tools,
  services, and connections remain TBD until scoped with the client.
- Gmail Inbox 0 requires careful all-mailbox scan permissions so Dan's inbox is not
  disrupted.
- Some historical demo/status/spec material still mentions Bailey Brain, Dan's AI
  Assistant, and Owner Router; those names must be read as demo/legacy context unless
  updated by product docs.
- Raw client source material must stay out of git.
- Google credentials on this host have recently required reauth for Google-backed demo
  paths.

## Recommended Development Sequence

1. Keep the KB demo and verification path green.
2. Stand up PMI KC KB production with the first four internal Spaces.
3. Move Gmail Inbox 0 in tandem as a non-disruptive Dan Gmail pilot, starting with two
   labels and a minimal KB management page.
4. Scope and build Lease Renewal as the first full backend automation with connected
   apps and explicit approval.
5. Scope Maintenance automation after chatbot/phone intake behavior is aligned and
   tested.
6. Scope Move-Out + Deposit Disposition automation after the workflow-run and approval
   patterns mature.
