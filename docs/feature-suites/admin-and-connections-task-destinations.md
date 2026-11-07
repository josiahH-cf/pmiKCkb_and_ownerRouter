<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-ux-followup-2026-11 -->

# S257 — Open the Admin or Connections task you need

> Status: AUTHORING READY, intake 127. Owner-confirmed November 7 scope. Implementation and qualification await an execution instruction.

**Goal.**

An Admin can find the task they came to do and open the controls for it. Staff can
understand which connection needs attention and which action they are allowed to take.

**Current state / intended end state.**

On `ef81b891`, the browser rehearsal showed the Admin task index above the full
settings page. "Renewal notice rules" correctly jumped to its anchor lower on Admin,
and "Renewal connection status" opened the renewal data section of Connections.
At 1280 by 800 the Admin document was about 20,000 pixels tall in the fixture.
Connections showed Dotloop readiness and diagnostics before the service groups.
The revision makes the existing task index the entry to focused work and gives
Connections a short service health and action overview.

**Actors and entry conditions.**

Admin actions retain their existing permissions. Staff with read access can inspect the
permitted connection status and follow the existing access or support path. Current,
stale, missing and unreadable data come from the actual status owners.

**What it is / how it functions.**

- **R-S257-1 — Start Admin with tasks.** Make the Admin entry a compact index of existing
  work grouped by purpose. Use People and access, Operational safety, Renewal policy,
  Connected services and migration, and Content and publishing. Keep emergency action
  stops and access to their current status prominent. Use the established task destinations
  first. Give long clusters a focused page with the matching controls and a clear return
  to the index. Reuse actual operations. Avoid embedding full settings forms on the index.
- **R-S257-2 — Open the exact setting, including from old links.** Inventory all
  existing Admin panels, subroutes, link targets and actions before regrouping.
  Assign each one a destination and preserve its capabilities. Existing `/admin#…`
  links, query routes, Help links and service-setting anchors resolve to the intended
  control or region. Use the existing routes or a compatibility handoff that retains the
  anchor, authorized context and focus. Recheck the real route/operation guard at
  every destination. Keep exact confirmation and recovery with the action.
- **R-S257-3 — Connections starts with what needs attention.** Show the existing service
  groups in a compact summary with each service's actual health, freshness and next
  available action. Distinguish unavailable, unconfigured, verified and blocked action
  states using the existing projections. Put long setup and troubleshooting behind a
  labeled link or disclosure for that service. Expose exact setup or verification
  actions only for the existing authorized role, and show the existing access/support
  path where relevant. Keep the Dotloop connection, resource selection and operation
  readiness distinct. Keep shared renewal resource links reachable at their named
  destination, including existing notice and message handoffs.
- **R-S257-4 — Complete a task in context.** A task page or section names the task and
  provides the exact current state, action, visible save/readback, retry and return.
  Loading or failed reads affect only the relevant task and report the last known
  state honestly. Existing explicit checks and setup operations keep their bounded
  trigger. Navigation and page layout do not add provider verification calls or grant
  authority. Keep essential actions and the return path usable at 390 pixels and with
  keyboard focus.

**In scope / out of scope.**

Presentation, routing, deep-link compatibility and feedback for existing Admin and
Connections tasks. Provider configuration, security, action keys, budgets and runtime
permissions follow their existing contracts. S256 owns the staff primary navigation.

**Open questions & assumptions.**

The owner accepted the compact index and focused destinations in Q6. Subpage paths
and the choice of disclosure versus subpage for a small service detail are
implementation choices. Every existing task has an explicit reachable destination.

**Cross-product impacts.**

`app/admin/page.tsx`, its existing subroutes, `components/admin/AdminTaskIndex.tsx`,
`lib/navigation/admin-connections.ts`, `app/connections/page.tsx`,
`components/connections/ConnectionCenter.tsx`, the existing role and status projections,
and the S242–S244 Help coverage and guides.

**Authority and evidence map.**

| Input                                               | Classification             | Use and limitation                                                                                              |
| --------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Router and delivered S81 task navigation            | Authority and preservation | Reuse exact role, readiness and action boundaries.                                                              |
| November 7 Admin and Editor rehearsal at `ef81b891` | Current UI evidence        | Links reach valid tasks but the index and long panels share the same surface. Provider readiness was synthetic. |
| Accepted November 7 Q6                              | Confirmed intent           | Short Admin and Connections entries with focused task routes and clear staff handoffs.                          |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S257-1** — One task-to-destination inventory preserves each panel and deep link.
  The starting Admin index mounts the long settings groups after its task links.
- **ARCH-S257-2** — A compact Connections overview and each service detail consume the
  same existing status and authorization owners. The starting landing presents a long
  provider detail before the service list.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S257-1** — An Admin lands on the task index, picks a task, and works in its
  actual controls with a visible return. An old direct link reaches the same task.
- **BEH-S257-2** — An Editor and Admin can tell whether a service needs attention and
  see their own next action. A failure preserves accurate state and offers recovery.
- **BEH-S257-3** — Keyboard and phone users reach a task, its status and its return
  without traversing the other settings.

**Human litmus outcome.**

### Find one setting or connection and finish the task

**If this was built correctly:** An Admin can find renewal notice rules and see the
current setting in one place. A staff member looking at connection health can tell which
service needs attention and how to act or get help. Both can find their way back.

- Model verdict: NOT RUN for the November 7 specification.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                            | Architecture outcome     | Behavior outcome | Human litmus                                       | Deterministic evidence / falsification                                         |
| -------------------------------------- | ------------------------ | ---------------- | -------------------------------------------------- | ------------------------------------------------------------------------------ |
| R-S257-1 Admin task index              | ARCH-S257-1              | BEH-S257-1       | Find one setting or connection and finish the task | AC-S257-1. Follow representative routine and urgent tasks from the landing.    |
| R-S257-2 destination and compatibility | ARCH-S257-1              | BEH-S257-1       | Find one setting or connection and finish the task | AC-S257-2. Compare every existing task link, anchor, role and operation owner. |
| R-S257-3 Connections overview          | ARCH-S257-2              | BEH-S257-2       | Find one setting or connection and finish the task | AC-S257-3. Walk healthy, unknown and action-required states as each role.      |
| R-S257-4 completion and recovery       | ARCH-S257-1, ARCH-S257-2 | BEH-S257-3       | Find one setting or connection and finish the task | AC-S257-4. Exercise narrow, keyboard, failed read/save, retry and return.      |

**Preservation set.**

All authorized panels, forms, exact effects and readbacks, the action-stop shortcut,
managed role checks, connection state semantics, the existing query and deep-link
destinations, independent provider and action gates, and the Help inventory.

**Adversarial acceptance checks.**

- **AC-S257-1** — From Admin, open user access, action stops, renewal notice rules,
  renewal resources and publication policy. Check the actual task's state, primary
  control and return on a short landing without the full settings payload.
- **AC-S257-2** — Walk the pre-change panel and link inventory after the change. Open
  original hashes, queries and Help links directly and check actual landed controls,
  focus, and server refusal for an unauthorized actor.
- **AC-S257-3** — In the isolated browser, exercise fixture states for ready, missing,
  stale and unreadable services as Editor and Admin. Follow the exact service detail
  and setup/read path. Check that selection readiness, connectivity and ability to
  perform the operation are distinct.
- **AC-S257-4** — Verify keyboard focus, phone-width layout, failed read and scoped
  recovery on a settings form and a service. Verify save/readback with deterministic
  seams and preserve the original confirmation behavior. Check that opening or
  switching destinations adds no provider effects.

**Forbidden actions / hard gates.**

Exercise exact role, provider, action and confirmation contracts with synthetic fixtures.
Keep security, identity, cost and provider permissions under their original owners.

**Dependencies / sequencing.**

Consumes the current Admin/Connections task manifest, roles, forms and health readers.
The change can ship independently from S256. Reuse S242 and S243 to verify revised
Help and screenshot scenes with the same implementation.

**Standalone delivery contract.**

Deliver the two entry points, focused task destinations, legacy link coverage, role
and recovery checks and current Help. The synthetic environment supplies examples
for both healthy and unavailable states.

**Verification and delivery contract.**

1. Freeze the baseline task and anchor inventory before implementation.
2. Verify every inventory destination and the role, view and recovery scenarios.
3. Run focused and canonical checks, and record `ALL_GATES_GREEN` only for the
   verified implementation scope.

**Ordered prompt sequence.**

1. Inspect all current settings and service controls and map their ownership.
2. Run the fail-first task and compatibility checks.
3. Build the focused destinations, verify the primary journeys, and update Help and
   any affected read-only assurance landmarks.

**Deletion/merge recommendation.**

Keep this specification until every existing task and the revised journeys are
represented in code, tests and current facts.
