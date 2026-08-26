<!-- spec-shape: overhaul-v1 -->

# S68 — Staff work assignment and accountable work sessions

> New 2026-08-10. Derived from the 2026-08-07 training transcript and the owner's
> 2026-08-10 approval of the recommended specification plan. This is a **specification-only** suite.
> It does not authorize implementation, employee-policy changes, monitoring, deployment, a provider
> effect, or an HR decision. Because this feature processes employee activity, every omission in the
> permitted-data contract is a prohibition, not room for expansive telemetry.

> **Implementation amendment — 2026-08-26.** In response to the `/work` support report, a task may
> additionally carry three optional, bounded operator-entered facts: job location, materials needed,
> and materials bought/on hand. Create validation, app-owned storage, and the task card use the same
> fields. They do not expand session telemetry, copy a customer record body, affect task timing, or
> perform a provider/system-of-record write.

**Goal.** Staff and managers can answer, from explicit application records, what work is assigned,
what is active, what is blocked or complete, the manager-set expected time range, and how much
explicit session time was recorded. A staff member sees and corrects their own task/session history;
an Admin sees the team view needed to assign and follow up. Timing begins only when a person chooses
`Start work` and pauses visibly on task switch, manual pause, blocking, completion, or 15 minutes of
in-app inactivity. The result provides operational accountability without keystroke logging,
screenshots, content capture, background tracking, inferred effort, rankings, productivity scores,
or automated employment judgments.

**What it is / how it functions.** S68 adds an app-owned `Task` plus explicit `Work session` model
that links to existing work rather than replacing workflow runs, renewal records, maintenance
tickets, Approval items, or their owning state machines.

- **Core outcome contract.** Today workflow runs expose owner, next action, due date, status,
  checklist, and timeline; Maintenance and Approvals have assignees; Admin exposes sign-in/activity
  administration. None proves who was asked to do a bounded piece of work, what the manager expected,
  or the time a person explicitly spent. The intended state adds one assignable task identity and an
  auditable sequence of user-controlled sessions. The minimum real capability is create/derive,
  assign, start, pause/switch, block, complete/cancel/reopen, correct, retain, and view tasks/sessions
  with exact access controls. The result is incomplete if time starts implicitly, concurrent active
  sessions exist, idle/disconnected time is hidden, expectations are inferred from workers, staff
  cannot correct records, or telemetry exceeds the allowlist.

- **Bounded task scope.** A task represents one internal staff action linked to exactly one owning
  Space and optionally one canonical source record: workflow run/step, renewal lease/stage,
  maintenance ticket, Approval item, or a manual internal task. It is not a general project manager,
  CRM, payroll/timecard, employee-presence system, client portal, or replacement for the source
  record. Completing a task does not automatically complete/approve/send/write the linked record;
  the task links to the owning surface, which retains its authority and transition rules.

- **Entry conditions.** A task is created by (a) an Admin assignment, (b) a staff member creating a
  task assigned to themself inside a Space they can access, or (c) a versioned, Admin-approved mapping
  that derives a task when an existing workflow step/renewal stage/maintenance state becomes
  actionable. A derived task uses a deterministic generation key composed of source type/id,
  actionable unit, mapping version, and assignee; replay creates no duplicate. Missing assignee or
  inaccessible/unknown source yields an explicit unassigned/blocked Admin item and cannot be inferred
  from creator, last editor, fastest worker, or prior assignee.

- **Task record.** Each task stores: id; Space id; source type/id and exact owning link when present;
  task type and concise title; assignee uid; assigner/creator uid; state; next action; due date/time
  when set; blocker/cancel/reopen reason where required; expectation snapshot or
  `Expected time not set`; created/updated/completed/cancelled timestamps; source/mapping version;
  optimistic record version; retention/policy version; and allowed outcome notes. Do not copy a
  customer record body into the task: show the minimum identity already permitted by the owning
  surface and link to it for detail.

- **Task states and transitions.** States are exactly `Not started`, `In progress`, `Paused`,
  `Blocked`, `Completed`, and `Cancelled`. `Start work`/`Resume work` atomically starts a session and
  sets `In progress`. Manual/idle/switch pause ends the active session and sets `Paused` unless the
  task was concurrently made terminal. `Block` requires a nonblank reason, ends the active session,
  and sets `Blocked`; `Resume work` from Blocked records that the blocker was cleared. `Complete`
  ends an active session and records the outcome; it never alters the linked work. `Cancel` requires
  a reason and ends an active session. Only an Admin may reopen Completed/Cancelled work, with a
  reason, to `Paused`; the old completion/cancellation and every transition remain in activity.

- **Explicit work session.** A session contains id, task id, staff uid, server start/end time,
  state (`Active` or `Ended`), end reason (`manual_pause`, `task_switch`, `idle_timeout`, `blocked`,
  `completed`, `cancelled`, `disconnect_review`, or `admin_correction`), last acknowledged in-app
  activity time, effective minutes, correction state, idempotency key, and retention/policy version.
  Duration is computed from server timestamps after corrections; paused/blocked gaps are excluded.
  A task may have many sessions, but a staff uid may have only one Active session across the product.
  Merely opening, focusing, viewing, editing, signing in, or being present in the app never starts one.

- **One-active-session invariant.** Starting the already-active task is idempotent and returns the
  current session. Starting a different task acquires a server-owned per-user active-session lock,
  ends the prior session at the same server transaction time with `task_switch`, changes the prior
  task to `Paused` when applicable, starts the new session, and sets the new task `In progress`.
  The UI names both outcomes: `Paused <prior task>; started <new task>.` Concurrent starts from two
  tabs leave exactly one Active session; the losing client refreshes to server truth and never
  accumulates overlapping time.

- **Fifteen-minute in-app inactivity rule.** While an explicit session is Active and the app document
  is visible, allowlisted interaction (pointer, keyboard, touch, or scroll) may refresh a coarse
  last-activity time; event type, key, coordinates, target, text, value, and frequency are not stored.
  Heartbeats are coalesced to no more than one per minute and carry only session id/version and server-
  comparable activity time. At 13 minutes without acknowledged in-app activity, show an accessible
  two-minute warning with `Continue work` and `Pause now`. At 15 minutes, pause automatically with
  end time `last acknowledged activity + 15 minutes`; the 15-minute grace is included in effective
  time, labeled `Auto-paused after inactivity`, and is correctable. A hidden/background app sends no
  activity heartbeat and records no OS/browser activity.

- **Disconnect and sleeping-tab recovery.** The client timer, any subsequent authenticated task API
  call/list load, and a bounded server reconciliation path all enforce the same 15-minute cutoff.
  If a tab closes, sleeps, crashes, or goes offline long enough to cross the cutoff, the session ends
  at `last acknowledged activity + 15 minutes`, is marked `Needs review — connection ended`, and the
  staff member is prompted to confirm or correct it on return. A late heartbeat cannot reopen or
  extend a closed session. If connectivity returns before the cutoff, server truth controls and the
  session may continue; no offline activity is inferred.

- **Corrections are append-only.** The staff member may apply a validated correction to their own
  session start/end or mistaken task association with a nonblank reason; it takes effect immediately,
  is visible to Admin, and does not require a hidden approval queue. An Admin may correct any team
  session with a reason. The original session is immutable. A correction record stores previous
  effective values, proposed/new values, actor, reason, time, and version; the latest valid correction
  determines displayed/effective time. Corrections must have end ≥ start, cannot overlap another
  effective session for that staff uid, cannot create an Active historical session, and cannot alter
  the source task or employee identity without a separately audited reassignment correction. A
  refused correction changes nothing.

- **Manager-set expectations.** An Admin manages versioned `Task expectation` records keyed by a
  named task type and, when relevant, process/step or Space. Each version contains a positive integer
  minimum and maximum expected minutes (`maximum ≥ minimum`), effective time, manager, rationale, and
  status. An exact expectation uses equal minimum/maximum. Task creation snapshots the active version
  and values; later version changes affect new tasks only unless an Admin explicitly rebases an open
  task with an audit reason. A task with no applicable expectation displays
  `Expected time not set`, remains workable/completable, and is excluded from expected-versus-actual
  comparison. The system never derives expectations from the fastest, slowest, average, median, or
  any employee's recorded duration.

- **Allowed calculations.** For each task, actual time is the sum of nonoverlapping effective session
  minutes. Once completed, it may show `Below expected range`, `Within expected range`, or
  `Above expected range` plus the arithmetic difference, with neutral copy and the expectation
  version. Team views may total assigned/open/blocked/overdue/completed tasks and effective session
  minutes for a selected date range, and show per-person task/session records to Admins. They may not
  rank people, display a leaderboard, produce a productivity/performance score, infer effort/quality,
  declare good/bad performance, predict employment outcomes, recommend discipline/pay/termination,
  or use completion speed to change an expectation.

- **Own and Admin surfaces.** `My work` shows only the signed-in staff member's assigned tasks,
  current session, states, due/expected/actual facts, correction state, and exact owning links, with
  Start/Pause/Resume/Block/Complete controls permitted by state. Console `Work now` may show only a
  compact own-task count/current-task link under S42. `Admin > Team work` shows all internal staff
  tasks/sessions, assignment and expectation controls, filters by staff/Space/type/state/date, and
  retention/correction flags. Empty states say `No tasks assigned` or `No team tasks match these
filters`; loading preserves current rows; failed mutations preserve input/focus and show whether
  server state changed before offering refresh/retry.

- **Permissions and scope.** Editors/Approvers may create self-assigned tasks in their permitted
  Spaces, view/update only tasks assigned to them, and view/correct only their own sessions. They may
  follow a source link only if the source's existing Space/resource guard permits it. Admins may
  create, assign/reassign, view, update, reopen, and correct team work and manage expectation
  versions. Assignees must be active managed internal staff identities; owners, tenants, vendors,
  personal accounts, and service identities cannot be timed/assigned as employees. A role/scope
  refusal occurs before data access/write and reveals no task title, source, assignee, or duration.

- **Retention.** S68 staff assignment, session, activity, correction, expectation-snapshot, and
  derived accountability records are retained for 12 months from the task's terminal time or the
  session/activity time, whichever governs that record, then deleted/anonymized by a bounded,
  auditable retention process. An approved employee-record policy or lawful hold may set a different
  versioned period; absent such a policy, 12 months is mandatory. The underlying workflow/renewal/
  maintenance/Approval product record keeps its own retention class. Retention cleanup must not
  rewrite history before expiry, leave orphaned active locks, or preserve a shadow analytics copy.

- **Permitted observability only.** Operational logs may contain task/session ids, actor uid already
  authorized for server audit, state transition, reason code (not free-text reason), version,
  duration bucket, response code, and latency. Free-text titles, notes/reasons, source record content,
  customer identity, keystrokes, coordinates, screenshots, window/app names, URLs beyond approved
  source ids, clipboard, microphone/camera, browser history, Google Chat/presence, IP/device
  fingerprint, foreground/background app activity, and raw heartbeat events are prohibited from
  logs/analytics. Last sign-in is authentication evidence and must never be labeled time worked.

- **Buildable later under separate implementation authority (app-plane).** Task/session/expectation/
  correction schemas and pure transition math; server transactions and retention; My work/Admin team
  surfaces; bounded links to existing work; privacy/access/a11y tests. App-owned bookkeeping has no
  Action Registry gate.
- **Build to the seam (live provider).** None. S68 creates no external provider action, send, client
  communication, system-of-record write, payroll export, or HR integration.
- **Owner dependency.** None for the approved 12-month default. A later approved employee-record
  policy may supersede retention prospectively through its own authority-bearing decision; the
  absence of such a policy does not block the specification or justify indefinite retention.

**Open questions & assumptions.** Decision-complete for implementation.

- _Answered 2026-08-10:_ accountability is based on assigned tasks and explicit work sessions, not
  passive surveillance; staff see their own records and Admins see the team view.
- _Answered 2026-08-10:_ at most one active session exists per user; starting different work pauses
  the prior task; 15 minutes of in-app inactivity auto-pauses visibly and correctably.
- _Answered 2026-08-10:_ expected duration/range is versioned and manager-set, never inferred from
  worker speed or aggregates.
- _Answered 2026-08-10:_ S68 employee records default to 12-month retention unless an approved
  employee policy establishes a different period; corrections are append-only.
- _Assumption:_ the existing `Admin` role is the manager authority for this first contract; no new
  Manager role or per-person approval widening is implied.
- _Assumption:_ expectation comparison is informational arithmetic only and carries no automatic
  consequence. Human employment decisions remain wholly outside this product feature.

**Cross-product impacts.** Candidate new bounded areas are `lib/work-accountability/` for pure task,
session, expectation, idle, metric, and correction contracts; server-only stores under
`lib/firestore/work-tasks.ts`, `work-sessions.ts`, and `work-expectations.ts`; routes under
`app/api/work/`; and `components/work/` plus `app/work/` and an Admin team-work surface. Exact names
remain candidates until future discovery proves the smallest architecture. Existing integrations
include `lib/firestore/workflows.ts` and workflow run/step-check pages, renewal desk/workspace,
maintenance ticket assignment, Approval source links, `lib/space-scope-resources.ts`,
`lib/auth/roles.ts`, S42 Console ownership, the product retention framework, and Firestore tests/
rules. S68 must not repurpose `components/layout/SessionTimeout.tsx`: authentication idle timeout and
explicit work-session idle pause are separate clocks and outcomes. Any future `firestore.rules` or
`lib/auth/**` change remains a D12 protected-path review item; this spec does not authorize one.

**Adversarial acceptance checks.** These are future implementation acceptance contracts; this
specification pass is complete when their wording and traceability validate.

- **AC-S68-1** — Admin-created, self-created, and approved mapping-derived tasks persist the complete
  task identity, source link/version, assignee, state, due/next action, and expectation snapshot or
  `Expected time not set`. Replaying a derived generation key creates one task. Missing assignee is
  visibly blocked/unassigned and never inferred. _Verify:_ create/generation/idempotency tests.
- **AC-S68-2** — The only task states are Not started, In progress, Paused, Blocked, Completed, and
  Cancelled; every allowed transition writes one append-only activity. Block/Cancel/Reopen without a
  reason is refused, and only Admin can reopen terminal work to Paused. _Verify:_ transition table and
  role tests.
- **AC-S68-3** — Starting a task creates no time before the explicit click. Starting the same active
  task is idempotent. Starting a second task atomically ends the first with `task_switch`, pauses its
  task, starts the second, and leaves exactly one Active per-user lock/session with no overlap.
  _Verify:_ transaction and two-tab race tests.
- **AC-S68-4** — At 13 minutes of no acknowledged in-app activity an accessible warning appears; at
  15 minutes the session ends exactly at last activity + 15 minutes with `idle_timeout`, includes the
  visible 15-minute grace, pauses the task, stops heartbeats, and is correctable. Activity at
  14:59 keeps it active and resets the clock without storing the event details. _Verify:_ server-
  clock/fake-timer 12:59/13:00/14:59/15:00 boundaries.
- **AC-S68-5** — Closing/sleeping/crashing/offline across the cutoff produces one ended
  `disconnect_review` session at last acknowledged activity + 15 minutes and a visible confirmation/
  correction prompt on return. A late heartbeat cannot extend/reopen it; returning before cutoff
  follows current server state without inferred offline activity. _Verify:_ missed-heartbeat,
  reconnect, late-request, and reconciliation tests.
- **AC-S68-6** — Complete, Block, Cancel, and manual Pause atomically end the user's active session
  with the correct reason. Completing a task leaves the linked workflow/renewal/maintenance/Approval
  record unchanged and creates no provider/send/write intent. _Verify:_ source-store and provider
  spies plus state tests.
- **AC-S68-7** — A valid own/Admin correction appends previous/new effective values, actor, reason,
  time, and version while preserving the original. Negative/reversed, overlapping, cross-user,
  stale-version, or Active-historical corrections are refused with no effective change. _Verify:_
  correction property, concurrency, and audit tests.
- **AC-S68-8** — An Admin-created expectation version with min 30/max 45 snapshots onto new matching
  tasks. A later 40–60 version leaves existing snapshots unchanged unless an explicit audited rebase
  occurs. Non-Admin mutation and max < min/zero values are refused. No expectation is computed from
  any session data. _Verify:_ expectation lifecycle and forbidden-inference tests.
- **AC-S68-9** — Actual time equals the sum of corrected, nonoverlapping ended sessions only; paused/
  blocked gaps and simultaneous double-tab attempts add zero. Below/within/above labels follow the
  snapshotted range and show neutral arithmetic. A task without expectation has no comparison.
  _Verify:_ duration/rounding/range boundary table tests.
- **AC-S68-10** — An Editor/Approver can see and mutate only their assigned tasks/own sessions inside
  permitted Spaces; another staff uid or out-of-scope source returns a non-enumerating refusal. Admin
  sees the team surface. No client owner, tenant, vendor, personal account, or service identity can be
  assigned/timed. _Verify:_ role/Space/identity matrix and response-leak tests.
- **AC-S68-11** — My work and Admin Team work render current-session, empty, loading, mutation error,
  blocked, overdue, completed, correction-needed, and retention-expiring states at desktop and
  390×844; focus returns to the changed task/control and no timer/status is color/hover-only.
  _Verify:_ component, a11y, focus, and mobile browser tests.
- **AC-S68-12** — Team calculations can expose allowed counts and factual duration/range differences
  but contain no rank, leaderboard, score, quality/effort inference, fastest-worker baseline,
  performance verdict, prediction, or employment recommendation in data, UI, API, analytics, or
  tests. _Verify:_ schema/rendered-copy/analytics forbidden-field sentinels.
- **AC-S68-13** — No path captures or persists key values, text/content, coordinates, screenshots,
  clipboard, microphone/camera, browsing/app history, Google Chat/presence, device fingerprint,
  background activity, or raw heartbeat events. Last sign-in is never displayed or exported as time
  worked. _Verify:_ event-payload, log/analytics, permissions, and static forbidden-API scans.
- **AC-S68-14** — At the 12-month boundary, expired S68 staff records are removed/anonymized in
  bounded idempotent batches with an audit receipt, while active/unexpired/legal-hold or approved-
  policy records remain. No shadow aggregate or orphan active lock survives. The linked product
  record retains its independent policy. _Verify:_ retention clock, hold, rerun, batch, and orphan
  tests.
- **AC-S68-15** — Simultaneous assignment/state/session/expectation writes use versions and return
  deterministic conflict/refreshed state; retrying a committed idempotency key duplicates no task,
  session, activity, correction, or retention receipt. _Verify:_ transaction race and replay tests.
- **AC-S68-16** — Logs contain only the permitted metadata allowlist and never task free text,
  correction/blocker notes, source/customer content, raw activity, or session telemetry beyond the
  approved state/duration bucket. _Verify:_ structured-log capture and forbidden-field scan.
- **AC-S68-17** — `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run test:firestore`, `npm run test:e2e:core`, `npm run verify:spec-traceability`, and
  `npm run build` pass while workflow/renewal/maintenance/Approval ownership, auth scope, session
  timeout, retention, and zero-provider-effect sentinels remain green.

**Forbidden actions / hard gates.** No implicit timer start, multiple active sessions, hidden timer,
uncorrectable idle/disconnect interval, indefinite default retention, or task completion that mutates
linked work. Never collect keystrokes/values, text/DOM/input content, pointer coordinates, screenshots,
clipboard, microphone/camera, browser/OS/app history, IP/device fingerprint, Google Chat/presence,
background activity, or raw heartbeat events. Never rank, score, compare people as a leaderboard,
infer effort/quality, derive expected time from worker data, or automate/recommend an employment,
pay, discipline, scheduling, promotion, or termination decision. Do not treat sign-in/presence as
work. Do not widen roles, protected auth/rules paths, provider gates, sends, or systems-of-record.
S68 has no client-facing send or external effect. Personal identities, secrets, PII, free-text staff/
customer content, and guessed endpoints stay out of git/logs. Production Live-only, local Demo effect
refusal, managed identity, S52 cost, and existing source authority remain. This specification request
authorizes no implementation, monitoring, or employment-policy change.

**Ordered prompt sequence.** This is a future dependency order, not present implementation authority.

1. _Discovery:_ under separately authorized implementation, inventory workflow/renewal/maintenance/
   Approval ownership, Space guards, existing assignment/timeline/retention paths, and auth session
   timeout; write a permitted/prohibited data map before code changes.
2. _Understanding:_ freeze task/session/expectation/correction schemas, state transitions, active-
   session transaction, idle/disconnect clock, access matrix, calculations, and retention boundary.
3. _Build:_ add pure contracts and server transactions first, then My work/Admin surfaces and bounded
   source-link adapters; do not couple task completion to linked mutations.
4. _Verify:_ run AC-S68-1 through AC-S68-17 and adversarially test two tabs, sleep/offline, stale
   writes, corrections, cross-user/Space access, retention, prohibited telemetry, and forbidden
   inferences.
5. _Gate:_ confirm no external provider/action/send, no new role, no protected-path push without its
   required review, and no employee policy beyond the approved 12-month default.
6. _Context update:_ only after separately authorized work ships green, record verified behavior and
   update the loop; specification approval alone creates no shipped fact.

**Deletion/merge recommendation.** KEEP as a standalone sensitive-data contract. Reuse links and
state from workflow/renewal/maintenance/Approval owners, but do not merge explicit staff-session data
into those product records or authentication activity. Do not create the disposable
`docs/temp/staff-work-assignment-and-accountability-plan.md` packet during this specification-only
pass.
