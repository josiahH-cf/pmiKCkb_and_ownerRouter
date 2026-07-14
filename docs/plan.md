# PMI KC Three-Product Plan

## Product Summary

This repo governs three purchased PMI KC products:

- PMI KC KB: existing source-backed web app runtime and future workflow-control layer.
- Lease Renewal Agent: first backend automation target after KB production lift.
- Workflow Communications: workflow-linked Gmail communication and evidence for renewal
  and maintenance, with Gmail remaining the message system of record.

Older KB-only and separate Owner Router repo plans are legacy unless this plan or a
product doc explicitly preserves a safety boundary.

## Current Audit Snapshot

- The client-owned Cloud Run application is deployed and its auth, cited Ask, Console,
  Notifications, renewal review, Maintenance desk, and Gmail transport have direct production
  evidence. The 2026-07-14 Workflow Communications boundary is fully verified locally but is not
  committed or deployed.
- PMI KC-owned GCP/Firebase, billing, domain auth, the $10 kill switch, Rentvine reads, renewal-Sheet
  DWD reads, Gmail DWD transport, and the first Admin path are established. They are not current V1
  blockers.
- Round 3 locks the expanded external-user V1 contract. Internal Editors directly execute enabled
  Low/Medium instances; Admin approves consequential High work and may self-approve at every risk;
  every named Lease Renewal and Maintenance output is final-V1 app execution scope; trusted Editor
  publication is immediate; Console is live-only in production; exact retention/artifact/AI policies
  are approved; and the MFA/assigned-ticket/per-vendor-Gmail-OAuth Vendor portal is required. S20–S27
  and `docs/v1-gap-implementation-program-2026-07-14.md` are the implementation contract.
- Lease Renewal has a deterministic read/reconcile/flag engine, live read capability, app-plane
  review/resolution/writeback-approval controls, and simulation/test-run surfaces. No Sheet or
  Rentvine writeback executes today. Final V1 requires app-executed Gmail, Sheet, Rentvine, Dotloop,
  portal chat, SMS, and conditional Boom actions under S25. Undocumented/provider-gated actions block
  final V1 rather than becoming tracked-manual fallbacks.
- Workflow Communications is the active Gmail product boundary. The KB-hosted surface exposes
  only authorized workflow links, value-free attention, governed labels, approved drafts, and
  exact-confirmed replies; it does not expose a recent inbox, arbitrary search, or generic compose.
- The evidence map starts at `docs/v1-readiness-audit-2026-07-14.html`; the final owner contract is
  `docs/v1-readiness-audit-round-3-2026-07-14.html`, and implementation starts from
  `docs/v1-gap-implementation-program-2026-07-14.md`.
- The old sibling Owner Router artifact repo exists locally and may be mined for Gmail
  Inbox 0 source material, but active governance now lives in this monorepo.

## Local Development Exhaustion Gate

Local development should continue while it moves the products closer to a clean
client-owned production cutover. It should stop producing new local product surface
when the remaining blockers are client-owned access, approved sources, production
configuration, migration approval, or real product decisions.

Allowed work after that point is readiness work: verification, regression fixes,
preflight/dry-run improvements, source manifest templates, cutover docs, acceptance
scenarios, handoff notes, client asks, and research backlog updates. Defer speculative
workflow, Approval Queue, Lease Renewal, Gmail, or demo-only expansion unless it
directly satisfies a migration, acceptance, or approved quality gate.

## Cross-Product Phases

Each phase carries a `Status:` line — `done`, `in progress`, `blocked`, or `not started`,
kept current as work lands (a `blocked` phase names what it waits on). The Status line is the
at-a-glance answer to "where are we"; `docs/status.md` holds the narrative history and
`docs/loop-state.md` the active resume pointer. `tests/unit/plan-status-sync.test.mjs` enforces
that every phase keeps a valid Status.

### P0 - Governance Realignment

Status: done

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

Status: in progress — default approvers are named; final acceptance, support, rollback, source, and
workflow-artifact owners still need confirmation.

Acceptance criteria:

- Product owners and acceptance reviewers are named.
- Client answers the concrete asks in `docs/client-checklist.md`.
- `docs/research-backlog.md` is updated with answered, open, and blocked items.
- Each product lane distinguishes confirmed facts from assumptions.
- Confirmed facts, labeled assumptions, and open questions are tracked in `docs/facts.md` and gated
  by `npm run verify:context-freshness`.

Validation:

```bash
npm run format:check
```

### P2 - Access And Account Setup

Status: in progress — GCP/Firebase, billing, domain auth, Rentvine/Sheets reads, and Gmail transport
are confirmed; approved launch-Space sources/sensitivity and final operator roster remain.

Acceptance criteria:

- PMI KC-owned GCP/Firebase project and billing path are confirmed.
- Workspace domains, test users, and authorized domains are approved.
- Drive folder/source ownership is known.
- Gmail transport setup authority and safe synthetic test approach are approved.
- No secrets or raw client data are committed.

Validation:

```bash
npm run host:check
npm run preflight:production -- --env-file=.env.production.local
```

### P3 - Integration Capability Verification

Status: in progress — Rentvine lease reads, renewal-Sheet reads, Drive DWD capability, and Gmail
transport are live-proven; workflow-boundary promotion and every non-Gmail external write remain
separately gated.

Acceptance criteria:

- KB production integrations are verified against client-owned or approved staging
  resources.
- Workflow Communications label, draft, targeted-read, reply, and on-demand analysis boundaries
  are verified without exposing unrelated live mail.
- Lease Renewal Agent candidate integrations are classified as read-only, write-capable,
  unsupported, or blocked. The verified starting classification and per-vendor evidence
  live in `docs/integration-architecture.md`; client confirmation can still change it.
- Unverified capabilities remain in `docs/research-backlog.md`.

Validation:

```bash
npm test
npm run test:firestore
```

### P4 - Product V1 Scope Lock

Status: done — R01–R09 lock the expanded external-user V1, risk-bounded Editor authority, all-risk
Admin self-approval, every Lease/Maintenance action, immediate trusted publication, Vendor invite/TOTP/
Gmail OAuth, exact retention/artifacts/AI policy, Console live/test boundary, and staged final release.
S20–S27 turn those decisions into falsifiable implementation contracts.

Acceptance criteria:

- PMI KC KB production cutover scope is locked.
- Lease Renewal Agent has approved v1 inputs, outputs, trigger model, permissions,
  source requirements, and acceptance scenarios.
- Workflow Communications has approved workflow-context, human-confirmation, sender-binding, safe
  testing, per-item authority, Vendor OAuth identity, three v1.0 base artifacts, source-visible AI reply
  policy, and exact retention values. S24 policy is Local green; S22 implements Vendor identity/OAuth
  before promotion.
- KB automation has approved workflow-run framework, per-action approval model, and the
  first Lease Renewal integration/source map.
- Source/process publication becomes Active immediately after S21's configured-root/scope/type/size/
  malware/sensitivity validation, immutable version/rollback, and audit. Publishing content never
  enables an external action, changes configuration/system prompt, or widens a role.
- Workflow-run UX/audit model is approved: top summary, timeline, visually separate test
  runs, production-metric exclusion for test runs unless included by an Admin, and
  visible source links, confidence, and reasoning for AI recommendations.
- Workflow-run status and notification model is approved: standard run statuses,
  final-approver ownership, source due date or today default, and in-app notifications for
  approval-ready, blocked, failed automation, and overdue events.
- Escalation/failure model is approved: blocking automation failures fail the run,
  non-blocking automation failures fail the step and block the run, failed notification
  processing creates Admin-visible in-app health, and external action failures keep attempted
  payload, error, target system, timestamp, and retry status.
- External-action type governance is approved by target system plus action type. S20 makes enabled
  Low/Medium instances direct for internal Editors, routes consequential High work to Admin, permits
  Admin self-approval, and keeps technical Blocked conditions non-executable. Planned actions remain
  visible while non-executable.
- External-action readiness model is approved: readiness states are `Planned`,
  `Needs Connection`, `Needs Permission`, `Ready for Test`, `Approved for Execution`,
  and `Disabled`; execution requires a change preview and rollback/correction note; and
  Admins can disable an action type without deleting the process definition.
- Action Registry is the acceptance artifact for the model above: one record per external
  action type carrying target system, documented evidence, required permissions, plan
  tier, readiness, preview, rollback, and a `production_allowed` gate that stays false
  until an approved spec changes it. See `docs/integration-architecture.md`.
- Integration build order is approved: Maintenance Work Order Intake is the first
  executable-write target (documented Rentvine work-order writes plus the LeadSimple
  Rentvine maintenance sync); the Rentvine lease-renewal writeback stays non-executable
  until vendor-confirmed and approved.
- Source-vocabulary normalization is a gate before any live connector work: canonical
  stage, system, record-ID, and approval names are frozen so authoritative field meaning
  is unambiguous across legacy and current systems.

Validation:

```bash
npm run format:check
```

### P5 - Build And Migration Preparation

Status: in progress — dry-runs for imports/setup/seeders/preflights exist (`npm run cutover:dry-run`);
KB production source manifests await approved client sources, and the verified local Workflow
Communications boundary awaits owner review before commit/deploy.

Acceptance criteria:

- KB production source manifests are prepared from approved PMI KC sources.
- Lease Renewal Agent implementation tickets and tests are created only after P4.
- Workflow Communications tickets require workflow entity authorization, approved artifacts, and
  targeted-read acceptance criteria; general mailbox scans are not a prerequisite or product goal.
- Dry-runs exist for imports, setup scripts, seeders, and preflights.
- The migration-readiness stop gate is evaluated before any additional local feature
  slice; nonessential local expansion is deferred once migration/client unblock is the
  next real dependency.

Validation:

```bash
npm run corpus:plan -- --manifest=<approved-manifest> --project=<client-project-id> --location=us --dry-run
npm run seed:launch-skeletons -- --dry-run
```

### P6 - Testing, Training, And Acceptance

Status: in progress — the final Round 3 contract and S20–S27 specs are locked. S20 execution authority,
S21 trusted publication, S23 Console live/test boundary, and S24 Communications policy are Local green; S22/S25–S27 implementation,
provider/live-action acceptance, release-candidate browser review, and internal plus Vendor operator
training/signoff remain.

Acceptance criteria:

- KB production smoke covers auth, Ask, citations, no-source behavior, edits,
  approvals, and Admin visibility.
- Lease Renewal Agent acceptance scenarios pass once runtime exists.
- Workflow Communications tests prove unrelated threads cannot be fetched and use only fake
  transports, approved synthetic threads, or sanitized fallback text.
- S19 fake-transport tests prove per-user subject isolation, bounded/safe MIME reads,
  exact-payload confirmation, one-attempt idempotency, ambiguous-send reconciliation,
  reply headers/thread ID, authenticated push replay/cursor handling, and the simulator
  no-Gmail fallback before any live test.
- Dan, Bailey, and named operators complete training and signoff tasks.
- Backend automation tests prove explicit approval, audit fields, rollback/error
  handling, and no unapproved external writes.
- S20 tests prove immutable server risk floors, Editor direct enabled Low/Medium work, exact-preview
  Admin-approved High work (including self-approval), technical Blocked non-bypass, one attempt,
  ambiguity reconciliation, atomic queue/ledger transitions, and server-only bodyless audit.
- S21 tests prove root/Space/path/type/size/MIME/scanner/sensitivity refusal before persistence,
  immutable ordered versions, one Active pointer, additive rollback, bodyless rejection audit,
  Admin-only tightening policy, process action-reference validation, authority-field inertness, and
  no routine Approval Queue item for validation-passing publication.
- S23 tests prove server-only live/test mode selection, wrong-Space omission, value provenance and
  freshness, visible source outage without fixture fallback, persistent non-production test badge,
  bounded inert metadata/snippet, zero initial body/attachment calls, and one targeted authorized
  full-body call only after opening the workflow communication panel.
- Process-definition tests prove simulation-only behavior for Draft/Testing runs,
  versioned Active copies, activation gates, and pending automation visibility.
- Workflow-run tests prove the summary, timeline, test-run separation, production-metric
  exclusion, and reviewer-visible AI evidence.
- Workflow-run notification tests prove status-triggered in-app notifications,
  final-approver ownership, next-action recipient routing, starter routing limits, and due-date
  defaulting. Any future out-of-app delivery requires a separate approved spec.
- Failure-handling tests prove run-vs-step failure behavior, Admin-visible in-app health, and
  external-action failure audit fields; the legacy event-driven Gmail sender remains hard-disabled.
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
- Approval queue bulk-action tests prove selected-item bulk approve, return, disable,
  execute, assign, and snooze paths; per-item permission/risk/readiness enforcement;
  plain-English preview and confirmation; clear ineligible-item handling; per-item
  Activity entries; and no bypass of external-action approval, send authority, or
  high-risk confirmation.
- Approval queue notification tests prove in-app delivery, recipient routing, single reminders,
  required notification content, and Admin-visible health for unresolved important `Blocked` or
  overdue items.
- Approval queue legacy-email tests prove configuration cannot activate the hard-disabled sender;
  historical preferences remain audit-only and Console/Notifications remains the source of truth.
- Approval queue Admin-health tests prove visible health fields, health-state
  classification, `Action Required` conditions, and direct links into affected queue
  items or audit records, with any historical email state labeled inactive.
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
- Testing focuses on production readiness and accepted behavior. New local-only
  workflow, queue, Lease Renewal, Gmail, or demo surfaces are deferred unless they are
  required for cutover, acceptance, or a known quality issue.

Validation:

```bash
npm run typecheck
npm test
bash scripts/verify.sh
```

### P7 - Production Cutover And Monitoring

Status: in progress — production revision `pmi-kc-kb-demo-00020-24d` proves the S19 transport
baseline; the locally verified workflow-boundary candidate is not deployed. Dan/Josiah release
ownership and tab direction are resolved. S20/S21/S23/S24 are Local green; the external Vendor portal
and named workflow writes now expand V1. R01–R09 and S22/S25–S27 are decision-complete but unbuilt; final release needs their implementation,
approved production source/provider mappings, action-by-action proof, integrated browser acceptance,
and explicit deploy/smoke/final-acceptance approval.

Acceptance criteria:

- Go-live owner, support window, rollback owner, and monitoring owner are named.
- Production deploy/setup steps are executed from client-owned resources.
- Smoke tests pass after cutover.
- Exceptions and next iteration work are recorded in `docs/status.md`.
- Post-cutover iteration decisions are based on production smoke, user acceptance,
  client-approved scope, and recorded blockers rather than pre-cutover local feature
  loops.

Validation:

```bash
npm run preflight:production -- --env-file=.env.production.local
bash scripts/verify.sh
```

## Product Lane Gates

### PMI KC KB

Current state: the client-owned service is live and directly verified; the 2026-07-14 local candidate
adds the narrower workflow-communication product boundary. Round 3 defines final V1 as an external-user
release with S20–S27 risk, publication, Vendor, Console, communications, workflow-action, and staged
acceptance contracts. S20/S21/S23/S24 are Local green; S22/S25–S27 are not built merely because their
product scope is approved. S23's live adapters and browser acceptance, and S24 live TTL/scheduler and
authoritative workflow mappings, remain gated despite their local contracts being green.

Key gates:

- Approved production sources and source-state metadata.
- Approved source files, sensitivity decisions, source maps, and data-store maps for the launch
  Spaces. The underlying GCP/Firebase/Auth service and canonical URL already exist.
- Final operator roles plus named go-live, acceptance, support, monitoring, and rollback owners.
- In-app approval notifications remain the V1 delivery path; legacy event-driven Gmail delivery is
  disabled and is not a launch dependency.
- Internal staff retain `Editor`, `Approver`, and `Admin` capability tiers, optionally narrowed by
  renewals/maintenance scopes. V1 adds a separate external Vendor role with assigned-ticket-only
  access; it never inherits internal Editor/Admin/Connections/cross-Space reach.
- First launch Spaces: Lease Renewals, Maintenance Work Order Intake, Move-Out +
  Deposit Disposition, and Owner Onboarding.
- Backend automation write paths are built through S25/S26 and become live only after documented
  provider evidence, focused acceptance, Action Registry review, and explicit per-action authority.

### Lease Renewal Agent

Current state: deterministic Phase-1 read/reconcile/review is built; one live Rentvine export and the
renewal Sheet DWD read are proven. App-plane resolution and writeback authorization exist, while
every Sheet/Rentvine/Dotloop/LeadSimple/QuickBooks/Boom write remains non-executable. R02 makes
the named end-to-end outputs V1 product scope; Round 3 classifies every R02 Gmail/Sheet/Rentvine/
Dotloop/portal/SMS/conditional-Boom group as app-executed final-V1 work under S25. None is silently
manual/later, and provider-contract gaps block release.

Key gates:

- Confirm signed-lease storage, source systems, allowed reads/writes, central workflow
  record, human review points, and acceptance scenarios.
- Treat signed lease or lease-term record as the first authoritative renewal trigger
  source, pending client system confirmation, while preserving manual start.
- Build read/gather actions before write actions: signed lease and dates,
  tenant/property facts, owner information, current rent/terms, and renewal timeline.
- Keep the Rentvine lease-renewal writeback non-executable: the renewal-write endpoint is
  undocumented in the public API, so it stays vendor-confirmation-required and gated
  behind an approved per-action spec even after reads are working.
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
- Approval queue items are created from approval packages, failed/blocked automation, external-action
  readiness, and source/fact conflicts. S21 publication failures instead create a safe bodyless audit
  and no Active pointer; validation-passing Editor content/process changes publish immediately under
  its configured-root, scope, type/size, malware/sensitivity, version/rollback, and audit boundary.
  Duplicate items for the same run/action merge into one open item with history. When
  the underlying fact, draft, action, or preview changes, the queue item refreshes and
  preserves the prior version. Queue items close automatically when approved, completed,
  cancelled, disabled, or when the blocker is resolved and no approval remains.
- When a fact, draft, action, or preview changes after a queue item is closed, the app
  creates a new queue item linked to prior Activity history instead of silently reopening
  or editing the closed record. Queue item direct links remain stable after status
  changes.
- Approval Queue v1 includes bulk approve, bulk return, bulk disable, bulk execute,
  bulk assign, and bulk snooze for selected visible items. Bulk actions respect every
  selected item's individual permissions, risk level, required approver, and readiness state. Bulk
  actions show a plain-English preview, require confirmation, skip or block ineligible
  items with a clear reason, and write per-item Activity entries. Bulk execute does not
  bypass external-action approval, owner/tenant-facing send authority, or high-risk
  confirmation rules.
- Approval queue notifications appear in the app console for item created, assigned,
  returned for revision, unsnoozed, blocked, unblocked, overdue, and closed events.
  V1 delivery is in-app only. Queue notifications go to the current assignee and required
  approver. Creators/editors are
  notified only when their action is needed or their item closes. Reminders start as a
  single console notification, not a repeating sequence, with no default 24-hour
  follow-up or Admin escalation sequence unless configured later. Each notification
  includes the plain-English action needed, due date, risk level, affected process/run,
  and direct queue-item link.
- Approval queue delivery is in-app for V1. Historical email settings may remain visible for audit,
  but configuration cannot activate the hard-disabled legacy sender. Any future human-confirmed
  notification-draft lane requires its own approved spec, preview, tests, and audit.
- Approval queue Admin health shows in-app processing status, stale overdue count, and blocked item
  count, with historical email state labeled inactive. Health
  status uses `Healthy`, `Needs Attention`, and `Action Required`. `Action Required`
  means something is broken or blocking work, such as failed notification processing or an
  unresolved blocked high-risk item. Admins can open health details directly into affected queue
  items or audit records.
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
- Renewal-flag decisions use S14's phone-first, one-card-at-a-time decider over the same
  `RenewalRunView` as the established desktop cards. Low/Medium suggested-source choices
  are one tap; High/Blocked and manual overrides keep the full audited form. The desktop
  list and run-page bulk bar remain available as the alternate review mode.
- The unified Approval Queue remains an urgent-first, value-free triage list. A safe
  Low/Medium `queue_item` may expose one inline app-plane approval; renewal-flag and
  write-back rows remain deep links to their value-bearing run page.
- Approval Queue empty, loading, and error states are plain and production-safe. Empty
  queues say nothing is currently waiting for review and do not show fake/demo queue
  items. Loading and error states use plain-English messages with one obvious retry or
  open action. Missing evidence, permissions, or connections create or route to a
  `Blocked` queue item instead of appearing as a vague broken screen. Production queue
  views never show demo/test items unless the run is clearly marked as a test/demo run.
- Approval Queue permissions remain explicit by role and action. S20 lets internal Editors directly
  execute enabled Low/Medium instances, routes consequential High work to Admin, permits Admin
  self-approval at every risk, and never lets approval bypass a technical Blocked condition. The
  separate external Vendor role sees only assigned Maintenance tickets and never inherits Editor,
  Approval Queue, Admin, Connections, or cross-Space reach. Permission errors explain the missing
  role/action and route to a safe next step.
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
- Unresolved important `Blocked` or overdue queue items escalate through the in-app attention and
  Admin-health surfaces. No automatic email exception exists in V1.
- Approval queue risk levels are `Low`, `Medium`, `High`, and `Blocked`. `Low` covers reads, health,
  local drafts, governed reversible labels, notes, assignments, and cleanup. `Medium` covers exact-
  confirmed workflow email/portal/SMS, S21 trusted publication, and S26's validated append-only
  assigned-ticket photo. `High` covers system-of-record values/status, documents, accounts/roles/
  OAuth lifecycle, accounting, and unbounded/overwrite/delete Drive mutations. `Blocked` means missing
  facts, validation, documented contract, connection, permission, scope, or approver; Admin may own the
  decision but cannot waive a technical blocker.
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

### Workflow Communications

Current state: S19 retains the owner-approved per-authenticated-user Gmail transport and its
production proof, but the application is now workflow-bounded. DWD still carries readonly,
compose, labels, and modify. The Action Registry exposes workflow-targeted read, governed draft,
exact-confirmed reply, and approved-label actions; generic send is disabled, and renewal and
maintenance notice drafts remain Planned in current code. R07 approves the exact current three base
generators as v1.0 plus the S24 AI policy; S25/S26 must still wire authoritative runtime recipients and
values before those actions can be promoted.

Key gates:

- Enter through an authorized renewal run or maintenance ticket, or a value-free linked-reply
  attention item; no recent-inbox entry point exists.
- Store only opaque Gmail identifiers, workflow references, state, timestamps, version references,
  and bodyless audit. S24 policy is confirmation usable 10 minutes/delete 30 days, dedupe 7 days, sync
  90 days, workflow link 365 days from last authorized update, bodyless action audit 7 years, no
  persisted V1 AI/extracted Gmail facts, with Admin legal hold/later written policy overriding deletion.
- Pub/Sub is a change signal only: match already-linked thread IDs and create deduplicated,
  value-free attention without fetching unrelated message content or invoking AI.
- AI analysis is on demand over one linked thread and returns `Needs Review` proposals only.
- `mail.google.com`, cross-mailbox browsing, automatic processing, generic compose, and autonomous
  send remain absent.
- Preserve human send authority. No autonomous/background/model-triggered/scheduled
  send, automatic retry of an ambiguous result, cross-mailbox Admin access, persisted
  mailbox body, or system-of-record write.

## Risks And Unknowns

- Client production resources, domain auth, and the initial Admin path are available; approved
  content scope and final operational ownership remain incomplete.
- Lease Renewal Agent requires integrations and permissions not yet known; the full
  system list remains TBD until scoped with the client.
- Maintenance automation requires further chatbot/phone-system product alignment; tools,
  services, and connections remain TBD until scoped with the client.
- Workflow Communications derives the mailbox only from the server-verified session and requires
  an authorized workflow context before a targeted thread read, so no other domain mailbox or
  unrelated thread is scanned merely because DWD could impersonate or read it.
- Some historical demo/status/spec material still mentions Bailey Brain, Dan's AI
  Assistant, and Owner Router; those names must be read as demo/legacy context unless
  updated by product docs.
- Raw client source material must stay out of git.
- Google credentials on this host have recently required reauth for Google-backed demo
  paths.

## Recommended Development Sequence

1. Keep the KB demo and verification path green.
2. Stand up PMI KC KB production with the first four internal Spaces.
3. Operate Workflow Communications through S19's workflow-linked boundary; keep historical
   processing and general mailbox automation out of scope unless a later privacy/governance spec
   explicitly reopens them.
4. Scope and build Lease Renewal as the first full backend automation with connected
   apps and explicit approval.
5. Scope Maintenance automation after chatbot/phone intake behavior is aligned and
   tested.
6. Scope Move-Out + Deposit Disposition automation after the workflow-run and approval
   patterns mature.
