<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-ux-followup-2026-11 -->

# S256 — Find staff work and process guidance by task

> Status: AUTHORING READY, intake 126. Owner-confirmed November 7 scope. Implementation and qualification await an execution instruction.
> November 12 intake 164 is delivered at ba9a64f6 for renewal Spaces that show guidance and start no runs (S286).

**Goal.**

A staff member can go directly to the place to work a renewal, read the applicable process
or find a message. They can tell which destination a link will open.

**Current state / intended end state.**

In the November 7 Editor rehearsal at `ef81b891`, Operations opened Lease Renewal or
Internal Processes. The latter showed three similar renewal cards. Lease Renewals opened
the live desk, and Owner Renewal Outreach and Tenant Renewal Notice opened Space pages.
The same "Needs a process" label appeared on all three in that fixture. Communications
appeared in the Admin menu despite being an ordinary staff workflow. Dashboard's batch
answer reached the same target leases as the desk. My Work and Approval Queue each served
their distinct tasks. The revised navigation makes those boundaries visible at the point
of choice.

**Actors and entry conditions.**

Signed-in staff see the destinations their existing role and Space access allows.
Navigation supports pointer, keyboard and touch. Direct routes continue to enforce
their own authorization.

**What it is / how it functions.**

- **R-S256-1 — Find Communications with operational work.** Place the existing
  Communications destination under Operations alongside Lease Renewal and Internal
  Processes. Keep its existing visibility predicate and route. Its active and keyboard
  state follow the same navigation owner. Keep Admin's separate communication-governance
  entry under its current role and intended purpose.
- **R-S256-2 — Say where each renewal card leads.** The Internal Processes directory
  distinguishes the link to work leases on the desk from the owner outreach and tenant
  offer/document process links. Use a short action or destination label on each card.
  Show process availability on process destinations. Show work or review context that
  actually applies to the desk link. Keep each card as one accessible link. On a
  renewal process page, distinguish the process/checklist from the link to work a lease,
  with a clear return to the directory. Use the existing desk link and retain a known
  lease context if one was supplied and is still authorized.
- **R-S256-3 — Preserve the start and return points.** Dashboard's scoped answer still
  links to the exact lease set, My Work opens an assigned item in context, Approval Queue
  opens the corresponding review, and Communications can return staff to its linked
  work. Preserve existing same-tab paths, direct URLs, deep links, current-location
  indicators, mobile disclosure and focus behavior. Keep partial, empty and inaccessible
  states truthful and route staff to the relevant available action.

**In scope / out of scope.**

Staff navigation placement, three renewal directory handoffs and their context. The
existing ask, work, approval, process, and message capabilities and their data owners
define their content. S257 owns Admin and Connections task destinations.

**Open questions & assumptions.**

The owner accepted the staff navigation change in Q6. The specific short card wording
is chosen against the destination evidence and verified with the Help control map.

**Cross-product impacts.**

`lib/navigation/primary-navigation.ts`, the AppShell and its existing navigation contract,
`app/spaces/page.tsx`, `app/spaces/[spaceId]/page.tsx`, `lib/spaces.ts`, linked work,
and S242–S244 guide and reference coverage.

**Authority and evidence map.**

| Input                                               | Classification             | Use and limitation                                                                                                                        |
| --------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Router and S81/S84 delivered contracts              | Authority and preservation | Keep existing visibility, route guards and accessible menu behavior.                                                                      |
| `ef81b891` browser rehearsal and navigation sources | Current evidence           | Communications is under Admin. Similar renewal cards have different destinations. Fixture process availability is scoped to that fixture. |
| Accepted November 7 Q6                              | Confirmed intent           | Move the staff Communications entry and clarify the renewal handoffs.                                                                     |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S256-1** — One primary navigation manifest determines group, visibility, active
  route and menu behavior. The starting manifest puts Communications in Admin.
- **ARCH-S256-2** — Directory labels and context come from the existing destination and
  process/work projections. The starting cards use similar state and presentation
  for unlike destinations.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S256-1** — A staff member opens Operations and finds Communications, with
  role-appropriate access and a predictable way back.
- **BEH-S256-2** — A newcomer can pick the renewal desk to work leases or pick the
  matching process to read how the work is done, and recognize the destination. Amended
  on November 12, 2026 by owner direction (S286 R-S286-6): a renewal process is guidance
  and starts no checklist.
- **BEH-S256-3** — Existing direct and linked entries still land in the expected
  authorized record or list and communicate missing or unavailable context.

**Human litmus outcome.**

### Find the right place for renewal work

**If this was built correctly:** A staff member can choose between working this month's
leases, finding a related message and reading the procedure from the label on the link.
They can return to the same work after using that guidance.

- Model verdict: NOT RUN for the November 7 specification.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                         | Architecture outcome     | Behavior outcome | Human litmus                          | Deterministic evidence / falsification                                           |
| ----------------------------------- | ------------------------ | ---------------- | ------------------------------------- | -------------------------------------------------------------------------------- |
| R-S256-1 staff Communications entry | ARCH-S256-1              | BEH-S256-1       | Find the right place for renewal work | AC-S256-1. Exercise the live menu and active states under each existing role.    |
| R-S256-2 renewal destinations       | ARCH-S256-2              | BEH-S256-2       | Find the right place for renewal work | AC-S256-2. Choose the cards and read the actual destinations and return actions. |
| R-S256-3 continuation               | ARCH-S256-1, ARCH-S256-2 | BEH-S256-3       | Find the right place for renewal work | AC-S256-3. Exercise prior URLs and routes from task, answer and review surfaces. |

**Preservation set.**

The three menu disclosures, role and Space predicates, direct routes and aliases,
process/checklist actions, retirements of old product areas, existing deep links,
Dashboard result parity and task/approval state ownership.

**Adversarial acceptance checks.**

- **AC-S256-1** — Open the desktop menu and narrow disclosure by keyboard and pointer.
  Check Operations, Communications active state, Admin's governance link, Help and
  Escape/focus behavior for the applicable Editor, Approver and Admin sessions.
- **AC-S256-2** — From Internal Processes, follow the desk and the two process cards.
  Compare their labels and status to the real destination in present, empty and
  unreadable process fixtures. Follow the process return and the work link.
- **AC-S256-3** — Open an existing bookmarked route, a Dashboard scoped result, a My Work
  lease task and an Approval Queue item. Check actual destination, permission refusal
  and preserved context after Back or reload. Confirm the navigation creates no effect.

**Forbidden actions / hard gates.**

Use existing roles, record scopes, process and provider contracts. Keep a route's
admission independent from its visibility in navigation.

**Dependencies / sequencing.**

Consumes the existing S84 navigation and Space projections. Compatible with S246 and
S257 before or after their presentation changes.

**Standalone delivery contract.**

Deliver the navigation and directory changes with role, keyboard, continuation and Help
verification on the actual surfaces. The synthetic rehearsal supplies the test inputs.

**Verification and delivery contract.**

1. Capture the current links and their real destinations and run the fail-first scenarios.
2. Exercise the browser and route guards with deterministic fixtures and check preserved
   guide links and versioning.
3. Run focused and canonical checks under the existing delivery contract. Record
   `ALL_GATES_GREEN` only for the verified implementation scope.

**Ordered prompt sequence.**

1. Inventory the navigation and directory destinations and their guards.
2. Verify the intended current-location and link behaviors and their failure cases.
3. Reorganize the links, verify the journeys and update the corresponding Help.

**Deletion/merge recommendation.**

Keep this specification until its destination and preservation checks are represented
in code, tests and current facts.
