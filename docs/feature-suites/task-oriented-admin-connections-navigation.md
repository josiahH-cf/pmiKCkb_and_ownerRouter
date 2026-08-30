<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-stabilization-v2 -->

# S81 — Task-oriented Admin and Connections navigation

> Status: Implemented and canonically verified locally; production delivery is pending. The narrow
> discoverability scope changes no permission, data ownership, action grant, or provider effect.

**Goal.**

Help staff find connection health and help Admins find the exact setup or policy control for a task
without merging read-only status, privileged mutations, or unrelated product surfaces.

**Current state / intended end state.**

Connections correctly exposes status to every role and management controls only to Admins. Admin is
already divided into People and Access, Activity and Logs, and App Info and Readiness, but it is long
and mixes renewal policy, connections-adjacent setup, migration, publishing, and operational tools.
The intended state adds a task-oriented index, stable section links, and contextual handoffs while
leaving each underlying store, route, role, and effect boundary intact.

**Actors and entry conditions.**

Any authenticated managed user may read connection status. Only current `manageAdmin` users may reach
mutation controls. Every link must resolve to an existing authorized page/section or a new purely
navigational wrapper; rendering a link never grants its target capability.

**What it is / how it functions.**

Connections groups status by operator job—renewal data, communications, documents/storage, and other
operations—and explains whether the next step is refresh, Admin setup, external input, or a closed
action. Admin provides a compact task index for People & Access, Operational Safety, Renewal Policy,
Connected Services/Migration, and Content/Publishing, using stable anchors/deep links and preserving
the existing sections and controls. Cross-links return users to the originating task where practical.

**In scope / out of scope.**

In scope: labels, grouping, anchors, deep links, contextual readiness explanations, active-state and
keyboard behavior, and tests. Out of scope: merging `/connections` and `/admin`, changing roles,
moving stores or provider logic, showing secrets, redesigning every page, creating new setup powers,
or opening actions.

**Open questions & assumptions.**

The approved scope is this narrow navigation/readiness layer. Existing connector status terminology
remains authoritative unless a label is demonstrably misleading.

**Cross-product impacts.**

AppShell navigation, Connections center, Admin section layout, renewal degraded-state links,
connector readiness, migration, users/roles, timing/pricing rules, suspensions, and accessibility.

**Authority and evidence map.**

| Input                                                                                                                       | Classification                | Use and limitation                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` identity, role, protected-path, connection, action, and secret boundaries                                       | Authority                     | Navigation can reveal current status and authorized destinations only; it cannot grant a role/action, expose a secret, or relocate an effect owner. |
| Current `/connections`, `/admin`, AppShell, connection-state/verification projections, Admin panels/routes, and role guards | Verified implementation truth | Read-only status and Admin mutations are correctly separated, but the long Admin surface and connector grouping are not task-oriented.              |
| Connection status/center/verification, Admin route/panel, role/direct-URL, AppShell, and accessibility tests                | Verification baseline         | Existing authorization/status truth is preservation; manifest target/capability and task-flow tests must fail first.                                |
| Stabilization intake request to verify access and simplify Admin/Connections                                                | Intent evidence only          | It supports discoverability/readiness improvements, not credential setup by the UI, auth-provider redesign, or a whole-app navigation rewrite.      |
| S59/S75/S76 and other connector/action readiness projections                                                                | Compatible dependency         | Navigation links to their present honest state; incomplete/closed status is not relabeled healthy or disconnected.                                  |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S81-1** — One navigation manifest maps task labels to existing route/anchor targets and
  required capability; a deterministic check proves targets exist, ids are unique, and no link leaks a
  privileged control into a read-only surface.
- **ARCH-S81-2** — Connections remains the source-backed status projection and Admin remains the
  mutation owner. Navigation components consume those projections without duplicating provider/store
  truth.
- **ARCH-S81-3** — Authorization and accessibility checks cover direct URL access, hidden controls,
  active state, anchors, focus, and keyboard navigation independently of visual grouping.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S81-1** — A non-Admin can identify renewal/Gmail/Drive/RentCast status and the appropriate safe
  next step but cannot see or invoke Admin mutations.
- **BEH-S81-2** — An Admin can reach people, suspension, renewal policy, rehearsal Sheet, connection,
  migration, and publishing controls from the task index and return without losing context.
- **BEH-S81-3** — Missing/unverified/closed/suspended/healthy states remain distinct; the navigation
  never labels credentials as authorization or a closed action as disconnected.

**Human litmus outcome.**

### Find setup and connection answers

**If this was built correctly:** A staff member can tell whether renewal data or messaging is
connected and where to ask for help. An Admin can reach the relevant setting quickly, while neither
person is shown controls they are not allowed to use.

- Model verdict: PASS - why: the manifest, both actor journeys, route/control capability parity,
  status-only mutation refusals, stable anchors, focus/keyboard behavior, and preservation set pass
  the full canonical verifier (545 unit files / 4,983 tests plus 25 Firestore files / 115 tests).
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                                     | Architecture outcome | Behavior outcome         | Human litmus                                         | Deterministic evidence / falsification                                                                                               |
| --------------------------------------------------------------- | -------------------- | ------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Every task link has one real target and matching capability     | `ARCH-S81-1`         | `BEH-S81-1`, `BEH-S81-2` | Find setup and connection answers                    | Manifest tests resolve every route/anchor, reject duplicates/dead targets, and compare advertised capability with destination guard. |
| Status remains in Connections and mutation remains in Admin     | `ARCH-S81-2`         | `BEH-S81-3`              | Staff see status; Admin reaches the setting          | Projection/DOM tests prove grouping and labels consume, never duplicate or overwrite, connection/action truth.                       |
| Direct access and visual navigation enforce the same permission | `ARCH-S81-3`         | `BEH-S81-1`, `BEH-S81-2` | Neither actor sees unusable power                    | Role × route/API/control tests cover non-Admin, Admin, missing Space/managed identity, direct URLs, and back-links.                  |
| Keyboard, focus, active state, and narrow layout remain usable  | `ARCH-S81-3`         | `BEH-S81-1`, `BEH-S81-2` | Both actors complete the task without losing context | Accessibility/component tests cover focus targets, heading/anchor landing, active item, keyboard order, and narrow viewport.         |

**Preservation set.**

Connection-state construction/verification tests, every-role read-only visibility, Admin route/API
guards, AppShell active states, secret redaction, connector health semantics, and direct-URL denials
remain green separately.

**Adversarial acceptance checks.**

- **AC-S81-1** — `ARCH-S81-1` proves every indexed target exists exactly once and advertises the same
  capability its destination enforces.
- **AC-S81-2** — `ARCH-S81-2` and `BEH-S81-3` prove UI grouping cannot manufacture or overwrite
  connection/action truth.
- **AC-S81-3** — `ARCH-S81-3` proves non-Admins remain denied even by direct URL/API access, not merely
  by hidden buttons.
- **AC-S81-4** — `BEH-S81-1/2` pass at desktop and narrow viewport with keyboard-visible focus and
  stable anchor behavior.
- **AC-S81-5** — No secret value, credential detail, or customer data enters navigation labels,
  markup, logs, or tests.

**Forbidden actions / hard gates.**

No page/permission/store merge, new management capability, role change, secret display, provider
call, action activation, whole-app redesign, or protected auth/Rules push.

**Dependencies / sequencing.**

Can be implemented independently after recording S80's matrix. It may link to S59/S75/S76 readiness
but must render accurate current state when those suites remain incomplete or closed.

**Standalone delivery contract.**

- **Deliverable now:** navigation manifest, task groupings, stable anchors/deep links, contextual
  readiness/return links, active/focus/keyboard/narrow behavior, and target/capability tests can reach
  `ALL_GATES_GREEN` without changing any underlying connector or Admin feature.
- **Consumes, but does not assume:** S80 capability and connector/action projections are read through
  current interfaces; missing or incomplete suites retain their precise unverified/closed/suspended
  state and safe next action.
- **Externally blocked effect:** none for navigation. If a required correction touches protected
  `lib/auth/**` or Rules, that patch/delivery is `BLOCKED` pending owner direction while unprotected
  manifest/layout work completes.
- **Produces for downstream suites:** one validated task-to-route/anchor/capability manifest and stable
  contextual links from renewal degraded states.

**Verification and delivery contract.**

1. Before editing, inventory every destination/heading/guard and make dead-target, duplicate-id,
   capability-parity, task-flow, and accessibility tests fail for the missing manifest/index; freeze
   connection/auth/secret behavior.
2. Run `npm run test:direct -- tests/unit/connection-status.test.ts tests/unit/connection-center-component.test.tsx tests/unit/connections-verification.test.ts tests/unit/roles.test.ts` plus new Admin-index/AppShell/manifest/direct-route/accessibility tests.
3. Run `bash scripts/verify.sh`, inspect the diff/protected paths, and audit secrets/credential details,
   customer data, direct URLs, role/Space guards, connection-vs-action terminology, provider calls,
   focus, active state, and narrow layout.
4. Report `ALL_GATES_GREEN` only when manifest, both actor journeys, authorization, accessibility, and
   preservation pass; `BUDGET_EXHAUSTED` requires an explicit budget. Use `BLOCKED` only for an exact
   protected-path delivery dependency, never for a connector that is honestly unavailable.

**Ordered prompt sequence.**

1. Inventory current destinations, headings, roles, and connector/action state vocabulary.
2. Add failing manifest/role/accessibility/navigation checks and freeze current auth/status behavior.
3. Build the narrow index, grouping, anchors, and contextual handoffs without relocating ownership.
4. Test every role, direct URLs, null/unavailable status, keyboard/narrow layouts, and the canonical
   gate.

**Deletion/merge recommendation.**

Remove after task-oriented navigation is deployed and durable information architecture/accessibility
contracts live in product and layout tests.
