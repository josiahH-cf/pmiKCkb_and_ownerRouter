<!-- spec-shape: overhaul-v1 -->

# S46 — Focused Maintenance operator workspace

> New 2026-07-28. Implements WS-05 and the Maintenance portion of D-08/D-09/D-14.

**Goal.** Maintenance staff can create, find, understand, progress, communicate about, close, and
reopen a ticket without navigating a developer harness. The normal workspace shows work status,
assignment, resident/vendor context, the next permitted action, evidence, communication, and
history. Full provider readiness, simulations, and nineteen-action matrices leave the ticket. Demo
uses this exact workspace with Demo records; Production uses Live records only.

**What it is / how it functions.**

- **Owning list and detail.** Use a focused queue/list with search and task filters, plus one ticket
  detail. A two-pane desktop/list-to-detail mobile pattern is an example, not a mandated component
  split. Each list row shows ticket/unit, urgency, status, assignee/vendor, next action, due/age, and
  blocker—never the whole action graph.
- **Ticket information hierarchy.** Detail begins with plain issue/unit/resident-safe context and
  current next action, then status/assignment, work notes/photos, workflow-linked communications,
  evidence/activity, and closeout. Architecture/readiness appears only as point-of-use unavailability
  text with a Connections link.
- **Create intake.** Staff form copy says what to enter and what happens next. Validate unit,
  category, urgency, description, contact/source, and photo handling without exposing internal
  execution jargon. Unknown authoritative facts remain Needs Verification.
- **Progress and assignment.** Reuse current ticket state, assignment, Vendor authorization,
  note/activity, close/reopen, business closeout gates, and exact action contracts. Show only actions
  valid for the current state/role; every mutation revalidates current ticket/version/assignment.
- **Provider actions at point of use.** An enabled action shows target/effect preview and required
  confirmation. An unavailable action shows one plain blocker and `Review connection`; the complete
  Registry/readiness record lives in Connections Advanced. No operator simulator or fake button is
  rendered.
- **Communications boundary.** Ticket-linked owner/resident/Vendor threads and drafts remain inside
  the ticket’s communication section or open the workflow-only Communications detail. No generic
  inbox or compose is introduced.
- **Environment parity.** Shared components/services render Demo and Production. Demo effects write
  only Demo receipts in Demo-owned state; Production has no Test vendor/action selector, simulator,
  or readiness lab.
- **Buildable now (app-plane).** Information hierarchy, list/detail composition, plain intake copy,
  point-of-use capability summaries, removal/hiding of lab UI, responsive/a11y/task tests, and
  compatibility adapters.
- **Build to the seam (live provider).** Reuse S26/S38 and existing provider executors. Any
  incomplete Live provider remains owned by its activation suite; S46 connects the verified action
  to the correct ticket state but does not invent a provider method.
- **Owner dependency (the one flip).** None for the workspace. Provider-specific dependencies remain
  isolated to their existing suite/action.

**Open questions & assumptions.**

- _Answered 2026-07-28 (D-08):_ developer/Test tools leave the shipped workspace; a provider seam
  awaiting documented setup remains in code and in Connections, not as a simulator on the ticket.
- _Answered 2026-07-28 (D-14):_ staff-facing copy leads with the task and next step.
- _Assumption:_ the executor may use sections, tabs, or progressive disclosure after measuring the
  existing page; the fixed end state is that task/next action precede diagnostics and the whole
  ticket remains keyboard/mobile usable.
- _Assumption:_ existing closeout gates and Vendor assignment security remain canonical unless a
  failing test shows a conflict; simplification cannot remove them.
- Decision-complete.

**Cross-product impacts.**

- Likely touchpoints include Maintenance routes/components, ticket form/list/card/detail, action
  readiness presenter, assignment/status/note/activity services, workflow communications, and
  responsive styles.
- Reuses S22 Vendor identity, S26 external actions, S38 notices, S40 environment, S41 shell, S44
  links, and feeds S47 resident intake. S48 owns Connections/Admin destinations.
- Supersedes the combined ticket+simulator+full-readiness-card presentation, not the underlying S26
  contracts or automated tests.

**Adversarial acceptance checks.**

- **AC-S46-1** — An Editor with Maintenance scope can create a valid ticket, find it, assign/progress
  it within authority, add a note/photo reference, reach closeout, close, and reopen through one
  owning workspace; refresh preserves state/history. _Verify:_ end-to-end desktop/mobile task.
- **AC-S46-2** — Normal list/detail contains no simulator, Demo/Test selector, fake Vendor assignment
  control, full nineteen-action matrix, registry key, or `production_allowed` copy. Unavailable
  actions show a plain blocker and exact Connections link. _Verify:_ rendered-copy/DOM assertions.
- **AC-S46-3** — Every status/assignment/note/close/reopen/action mutation revalidates current
  ticket/version, role/scope, Vendor identity class where applicable, and environment before writing;
  stale/out-of-scope/cross-environment attempts write nothing. _Verify:_ route/service concurrency
  and authorization tests.
- **AC-S46-4** — An enabled provider action still shows exact target/effect, requires its established
  confirmation/approval, makes one attempt, and yields a receipt/readback/rollback state; UI
  consolidation does not bypass S26. _Verify:_ S26 action-contract sentinels.
- **AC-S46-5** — Demo completes the same staff task with Demo-owned state and zero Live provider
  construction; Production renders Live tickets only and cannot accept a Demo alias. _Verify:_ S40
  environment/provider-construction tests.
- **AC-S46-6** — At 390×844 the issue, status, next action, evidence, and primary control are usable
  without horizontal overflow, giant header, fixed overlay, or nested focus trap; headings and
  announcements are correct. _Verify:_ authenticated browser/a11y task.
- **AC-S46-7** — `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run test:e2e:core`, `npm run verify:spec-traceability`, and `npm run build` pass; keep ticket
  lifecycle, Vendor isolation, S26 action, environment, photo/redaction, and receipt sentinels green.

**Forbidden actions / hard gates.** Do not delete closeout, assignment, Vendor, authority,
idempotency, or receipt protections to make the page shorter. Do not move diagnostics into a hidden
operator DOM where they still overwhelm assistive technology. Demo never calls providers;
Production never accepts Demo IDs. No autonomous client-facing send, generic inbox/compose, guessed
provider action, secrets/PII in git/logs, or personal auth. Every Live send/write retains exact
human confirmation and reversible one-attempt behavior. This UI suite does not preflip an
undocumented provider gate.

**Ordered prompt sequence.**

1. _Discovery:_ inventory Maintenance list/card/detail/form/action/communication components and all
   route/service guards; map daily fields/actions versus diagnostics/Test controls.
2. _Understanding:_ write the ticket information hierarchy and state/role/action matrix; pin current
   security/closeout behaviors with tests before decomposition.
3. _Build:_ create the focused list/detail and plain staff intake, preserving state services and S44
   exact links.
4. _Build:_ replace full readiness/simulation rendering with point-of-use status and Connections
   links; hide obsolete lab UI for S49 retirement.
5. _Verify:_ falsify stale/cross-scope/cross-environment mutation, Demo provider construction,
   simulator leakage, confirmation bypass, mobile overflow, and closeout regression.
6. _Gate:_ preserve provider gates; if an already-documented S26 action is finished in its owner
   suite, surface it normally rather than leaving a fake preview here.
7. _Context update:_ record S46’s fact/ACs, update the staff walkthrough, and advance
   `docs/loop-state.md` to S47.

**Deletion/merge recommendation.** KEEP this spec. MERGE ticket status/actions/evidence into one
workspace. RETIRE_UI simulation and readiness-matrix components now; S49 deletes only after
consumer/import/role/route proof.
