<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: navbar-dropdown-navigation-v1 -->

# S84 — Task-grouped navbar dropdown navigation

> Status: Specified and not implemented. The deployed AppShell, route guards, Space filtering,
> notification menu, S81 task destinations, and the specified S83 access and S85 Appearance
> contracts are the starting truth.

**Goal.**

Replace the flat, wrapping primary navbar with three compact, self-explanatory navigation groups so
new and returning staff can identify the correct work area from its title, icon, and one-line
description without weakening route permissions or moving unrelated topbar controls.

**Current state / intended end state.**

The current AppShell renders up to nine flat text links between the wordmark/environment badge and
the notification, role, and sign-out controls. The links have no hierarchy, icon, or explanation;
their active treatment is only bold underlined text; and the entire list wraps as the viewport
narrows. The server correctly filters Lease Renewal, Maintenance, Approval Queue, and Admin entries
using current Space/role truth, while direct pages enforce their own guards.

The intended desktop navbar renders exactly three primary disclosure buttons—`My Work`,
`Operations`, and `Admin`—in that order. Each opens one shallow, single-column panel containing the
three user-requested destinations. Every destination is a full-row link with a unique local icon,
short title, exact explanatory subtext, group-coded accent treatment, and visible hover/focus/current
feedback. Click, tap, and keyboard activation are authoritative; supported pointer hover is a
delayed preview, not the only way to open a panel. On narrow layouts one `Menu` disclosure exposes
the same three groups as accessible accordions. Notifications, S85's Appearance control, the
user-role chip, sign out, the wordmark, and the environment badge remain top-level shell elements.

**Actors and entry conditions.**

- An actor is an authenticated, enabled managed staff user. Existing Editor, Approver, Admin, named
  Space, and backward-compatible `All spaces` behavior remain authoritative.
- Server-side route and control guards remain the security boundary. Hiding an unavailable link is
  discoverability behavior and never substitutes for direct-route authorization.
- S83 is implemented before S84 for the all-staff Admin destination and the Admin-only access-request
  queue lane. S84 consumes those routes and permissions; it does not recreate their logic.
- S85 is implemented before the final S84 shell presentation. S84 places its Appearance utility
  after Notifications and before the role/sign-out controls without duplicating theme state.
- Role and Space truth is resolved before constructing the navigation. An unresolved authenticated
  user fails through the existing AppShell/session behavior rather than receiving an unfiltered
  client-only menu.
- Opening, closing, hovering, focusing, or selecting navigation causes no workflow transition,
  approval, access grant, provider call, client communication, or source write.

**What it is / how it functions.**

### Research-informed pattern choice

The supplied [dropdown](https://www.navbar.gallery/type/dropdowns) and
[static](https://www.navbar.gallery/type/static) Navbar Gallery collections are visual inspiration,
not behavior or accessibility authority. Their strongest applicable pattern is a restrained top bar
that reveals a small, visually grouped set of descriptive destinations without turning every
destination into a permanent top-level label. Current production examples such as
[Browserbase](https://www.browserbase.com/) also demonstrate that a destination title paired with a
short explanation can make grouped navigation self-describing.

The implementation contract adopts the following research-backed constraints:

- The [U.S. Web Design System header guidance](https://designsystem.digital.gov/components/header/)
  recommends a basic dropdown for shallow navigation and reserves mega-menus for substantially larger
  groups. Each PMI group has only three links, so S84 uses compact single-column dropdowns, not a
  mega-menu, grid, promoted card, or nested flyout.
- The [WAI-ARIA disclosure navigation example](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation/)
  uses native buttons controlling lists of ordinary links and explicitly avoids `menu`, `menubar`,
  and `menuitem` roles for normal site navigation. S84 follows that semantic model and retains normal
  Tab order.
- [WCAG 2.2 guidance for content on hover or focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)
  requires transient content to be dismissible, hoverable, and persistent. The panel therefore
  accepts Escape, permits the pointer to cross from trigger to panel, and remains open while pointer
  or keyboard focus is within the disclosure.
- [Baymard's hover-menu research](https://baymard.com/blog/dropdown-menu-flickering-issue) identifies
  a 300–500 ms delay as protection against accidental hover activation. S84 fixes the pointer-open
  delay at 350 ms while keeping click, tap, Enter, and Space immediate.

These sources establish interaction patterns only. PMI retains its own information architecture,
copy, access rules, tokens, and safety boundaries; no third-party layout or branding is copied.

### One authoritative navigation manifest

Create one typed, server-consumable navigation manifest that owns group order, destination order,
visible labels, subtext, icon key, group tone, canonical route, active-route aliases, and visibility
predicate. AppShell resolves the actor-specific manifest before the client disclosure component
renders it. Components do not duplicate route strings, copy, or permission tests.

The manifest contract is:

| Group        | Destination          | Exact subtext                                                        | Exact local glyph key and meaning           | Canonical target and active match                                                  | Visibility / route resolution                                                                                                                                                          |
| ------------ | -------------------- | -------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `My Work`    | `My Work`            | `See assigned work, follow-ups, and items you own.`                  | `clipboard-checklist` — assigned task list  | `/work`; active for `/work` and descendants                                        | Every managed staff user                                                                                                                                                               |
| `My Work`    | `Dashboard`          | See the exact composition-aware copy below.                          | `assistant-spark` — message with one spark  | `/ask`; also active for `/` and `/ask` descendants                                 | Every managed staff user                                                                                                                                                               |
| `My Work`    | `Approval Queue`     | See the role-aware copy below.                                       | `approval-tray` — tray with one check       | `/approval-queue`; active for the route regardless of an allow-listed `view` query | Render for a Renewals-scoped user or a `manageAdmin` user. Renewals-scoped actors target `/approval-queue`; an Admin without Renewals targets `/approval-queue?view=access` after S83. |
| `Operations` | `Lease Renewal`      | `Review upcoming renewals and complete the next required action.`    | `calendar-renew` — calendar with cycle mark | `/lease-renewal` and descendants                                                   | Current Renewals Space access                                                                                                                                                          |
| `Operations` | `Maintenance`        | `Track maintenance intake and active repair work.`                   | `wrench` — single maintenance wrench        | `/maintenance` and descendants                                                     | Current Maintenance Space access                                                                                                                                                       |
| `Operations` | `Internal Processes` | `Browse internal workflows and the process areas that support them.` | `workflow-nodes` — three connected nodes    | `/spaces` and descendants; also active for preserved `/processes` routes           | Every managed staff user; the destination continues to filter its own Space records                                                                                                    |
| `Admin`      | `Admin`              | See the role-aware copy below.                                       | `shield-user` — shield with person          | Admin: `/admin` and descendants. Non-Admin: `/admin/access` and descendants.       | Every managed staff user after S83. The target is `/admin` only for `manageAdmin`; otherwise it is `/admin/access`.                                                                    |
| `Admin`      | `Connections`        | `Check connected-service status and available setup actions.`        | `plug-connected` — joined plug              | `/connections` and descendants                                                     | Every managed staff user; current page-level control permissions remain unchanged                                                                                                      |
| `Admin`      | `Communications`     | `Review workflow-linked messages, replies, and unsent drafts.`       | `message-envelope` — message with envelope  | `/gmail-hub` and descendants                                                       | Every managed staff user; this remains workflow-linked communications, not a general inbox                                                                                             |

The role-aware subtext is deterministic:

- `Dashboard` uses `Review current operations and ask about approved PMI KC guidance.` from S84
  delivery until S95 has atomically activated its shared two-region composition at both `/` and
  `/ask`. S84 exports both bounded values; S95's cutover changes the active manifest row to `Ask AI
about current work, then open My Work to act.` in the same code delivery as the shared Dashboard
  body. There is no runtime inference or feature flag. S95 rollback restores the former copy with the
  former composition, and no pre-S95 UI may advertise operational assistant answers.
- `Approval Queue` uses `Review work waiting for an authorized decision.` for a non-Admin Renewals
  user, `Review work and access requests waiting for a decision.` for an Admin with Renewals, and
  `Review access requests waiting for an Admin decision.` for an Admin without Renewals.
- `Admin` uses `Manage people, access, policies, and app readiness.` for a `manageAdmin` user and
  `View your access and request the permissions you need.` for every other managed staff user.

If a user cannot reach a destination, omit that destination rather than rendering a disabled or
dead control. Omit a group only if all of its children are absent. With current contracts, My Work
always contains My Work and Dashboard, Operations always contains Internal Processes, and Admin
always contains Connections and Communications; tests must nevertheless cover the empty-group rule
so future manifest changes fail safely.

For a `manageAdmin` user, S83's required pending access-request count appears on the Admin and
Approval Queue rows only from S83's one authoritative projection. A non-Admin never receives that
count. A read failure omits the badge and exposes S83's truthful review-health state rather than
displaying zero. S84 adds no count query, polling loop, status inference, or queue record.

### Terminology and route compatibility

`Console` becomes `Dashboard`, and the top-level `Spaces` destination becomes `Internal Processes`,
in user-facing navigation context. To avoid a link/page-name mismatch, update the corresponding
landing-page H1, browser/page title where the current route provides one, and direct back-link label
to use the new terms. The exact routes remain `/ask`, `/`, and `/spaces`; bookmarks, deep links,
smokes, route guards, and active aliases remain compatible.

The source-backed v1 occurrence inventory is exact:

| Current source occurrence                                                                                                                                                         | Classification                    | Required result                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/layout/AppShell.tsx` flat `Console` and `Spaces` nav labels                                                                                                           | Replace presentation              | Remove the flat entries when the manifest renderer lands; its exact destinations are `Dashboard` and `Internal Processes`.                                                                                                                               |
| `components/console/ConsoleView.tsx` visible H1 `Console`                                                                                                                         | Rename visible copy               | Render exact H1 `Dashboard` at both `/` and `/ask`.                                                                                                                                                                                                      |
| `components/console/ConsoleAnticipatedWork.tsx` visible `ANTICIPATION_CAPTION`                                                                                                    | Temporary compatibility rename    | If S84 lands before S95, render `Computed on request · it runs only when you open the Dashboard, and a person sends every message.` S95 then removes this Dashboard-only region after renewal-destination parity; do not preserve the caption elsewhere. |
| `app/notifications/page.tsx` visible introduction containing `The Console stays your at-a-glance home`                                                                            | Slim and rename                   | Render `Everything that needs your attention, newest first.` Remove the false home-summary comparison; S95's Dashboard no longer contains the static attention deck.                                                                                     |
| `components/admin/ApprovalQueueAdminPanel.tsx` visible sentence `Console notifications stay on.`                                                                                  | Rename the owning concept         | Preserve the surrounding legacy-sender warning and render `In-app notifications stay on.` The notification system, not the Dashboard, owns that state.                                                                                                   |
| `app/spaces/page.tsx` visible H1 `Spaces`                                                                                                                                         | Rename collection destination     | Render exact H1 `Internal Processes`.                                                                                                                                                                                                                    |
| `app/spaces/[spaceId]/page.tsx` visible `Back to Spaces` link                                                                                                                     | Rename collection return          | Render exact link text `Back to Internal Processes` over the unchanged `/spaces` target.                                                                                                                                                                 |
| `components/work/WorkAccountabilityBoard.tsx` `All Spaces`; Admin `Top Spaces`/`Spaces`; `UserManagementPanel` `Spaces`; `PublicationPolicyAdminPanel` `Allowed Spaces`           | Preserve entity/scope terminology | These labels describe actual Space records or access/policy scopes, not the renamed collection destination. They remain unchanged.                                                                                                                       |
| `components/ask/AskForm.tsx` stored note prefix `Started from the Console.` and `components/console/StartRunButton.tsx` stored note `Started from the Console anticipation lane.` | Preserve persisted provenance     | Do not rewrite historical or newly stored audit/run note values in this suite. If a UI renders either field as navigation-facing prose, map only its display copy to `Dashboard`; never mutate the stored value.                                         |
| Component/type/service names, comments, metrics, APIs, Space ids/claims, and process/provider records                                                                             | Preserve internal terminology     | No source-schema or internal-code rename. Static terminology checks use this row and the persisted-provenance row as explicit allow-list entries.                                                                                                        |

This is not a global schema or source-code rename. Existing Console component/service/type names,
Space ids, Space claims, `spaceId` values, Space entity labels, process definitions, APIs, persisted
records, metrics, and provider/action terminology remain unchanged. A detail page may still describe
an actual `Space`; its collection-return affordance reads `Back to Internal Processes`.

### Desktop disclosure behavior

The top-level labels are disclosure buttons, not links. This removes the ambiguity created by a
parent such as `My Work` or `Admin` sharing a name with one child: the button always opens its panel,
and only the child link navigates.

The exact authenticated header DOM/keyboard order is wordmark, optional environment badge, a labelled
primary `<nav>` containing only the three group controls (or narrow `Menu`), NotificationMenu, S85
Appearance, user-role chip, and Sign out. Current AppShell utilities must be separated from the
primary navigation landmark. Visual spacing may adapt, but that semantic order does not.

- A mouse click, pen click, touch activation, Enter, or Space toggles the focused group immediately.
- On devices matching both fine pointer and hover capability, resting on a closed trigger for 350 ms
  opens it. Leaving before 350 ms cancels opening. Hover never runs on coarse/touch-only pointers.
- The trigger and its panel form one hover region. Leaving both schedules close after 250 ms; moving
  into either before that delay cancels close. Keyboard focus anywhere in the group keeps it open.
- Only one navbar dropdown is open. Opening another group closes the previous group. S84 registers
  its navbar layer with S86's cross-family transient coordinator; that coordinator handles mutual
  exclusion with Notifications and Appearance without changing their content or behavior.
- Escape closes the open dropdown and returns focus to its trigger when focus was inside. If Escape
  was used while the pointer still hovers the trigger, that trigger remains suppressed until the
  pointer leaves and re-enters or the user deliberately activates it.
- Clicking outside the primary navigation, moving keyboard focus out of the disclosure, selecting a
  destination, signing out, or completing a route change closes transient navigation state.
- A visual hover/focus response begins immediately; the 350 ms delay applies only to revealing the
  panel. The full row changes surface/border treatment, the pointer is a standard link pointer, and
  a trailing direction indicator becomes more prominent. Reduced-motion mode makes the state change
  instantaneous without translation or rotation.
- Panels align beneath their trigger, remain above page content, and clamp or reverse alignment to
  stay inside the viewport. There is no pointer gap between a trigger and panel and no page-level
  horizontal overflow.

The disclosure markup is a labelled primary `<nav>` containing a list of group buttons and nested
lists of links. Each trigger has a stable `aria-controls` reference and accurate `aria-expanded`.
Do not apply `role="menu"`, `role="menubar"`, or `role="menuitem"`.

Keyboard behavior is:

- Tab and Shift+Tab use normal document order. Closed-panel links are not focusable. When a panel is
  open, its links follow its trigger in Tab order before the next top-level control.
- Enter and Space toggle a focused trigger. Down Arrow opens a closed group and moves focus to its
  first visible link; Up Arrow opens it and moves focus to its last visible link.
- Escape closes and returns focus to the owning trigger. No focus trap is introduced on desktop.
- A current destination link has `aria-current="page"`. Its owning trigger receives a visible
  current-group marker and a screen-reader description that it contains the current page, but the
  non-link trigger does not receive `aria-current`.

### Visual hierarchy, icons, and color coding

Each panel is a compact single-column surface. Every destination is one full-width link; its icon,
title, subtext, optional badge, and trailing indicator share one hit area of at least 44 by 44 CSS
pixels. The title is the accessible link name and the subtext is its associated description. Icons
and chevrons are decorative when the visible text is present and are hidden from assistive
technology.

The manifest declares exactly nine local destination icon keys/glyph choices. Rendering, labelling,
`currentColor`, view-box/stroke consistency, and forced-color behavior come from S86's shared Icon
primitive. Do not add a remote request, font icon, emoji, or package; an icon cannot supply the only
distinction between destinations.

Color communicates the group, not status or permission:

- My Work rows use S85 `--nav-work-tile` and `--nav-work-icon`.
- Operations rows use S85 `--nav-operations-tile` and `--nav-operations-icon`.
- Admin rows use S85 `--nav-admin-tile` and `--nav-admin-icon`.

Every destination therefore carries a stable group color while its unique icon/title supplies the
non-color distinction. Do not reuse verified, warning, conflict, error, or reference status colors
as navigation categories. Do not add literal color values or claim the provisional orange as an
official PMI value. Top-level triggers use S85 `--topbar-text` on `--topbar-surface`; open/current
state uses weight, chevron, surface, and the semantic selected marker rather than color alone.

Panels use the existing surface, border, radius, shadow, type, focus, and spacing tokens. Titles are
left-aligned and scan as the primary line; subtext wraps to at most two ordinary-width lines without
truncating the title. Long text may increase row height. No tooltip is required to understand a
destination.

### Narrow and touch layouts

At the existing 760 CSS-pixel responsive tier and below, replace the three horizontal disclosure
buttons with one top-level `Menu` button. Activating it reveals an inline navigation region directly
below the topbar; it pushes page content rather than obscuring it and therefore requires no modal
dialog or focus trap.

- The region contains `My Work`, `Operations`, and `Admin` as accordion disclosure buttons in that
  order, followed by the same filtered destination rows, copy, icons, colors, active state, and
  badges as desktop. It is not a native `<select>` and has no hover-only behavior.
- Opening the mobile region expands the group containing the current route. If no group is current,
  My Work is expanded. Opening another group collapses the previous group.
- Menu and group buttons expose accurate `aria-expanded`/`aria-controls`; Enter, Space, normal Tab,
  Shift+Tab, and Escape remain sufficient. Escape first closes an expanded group when focus is in
  it, then closes the overall region on the next Escape; the overall close returns focus to `Menu`.
- Selecting a link closes the overall region. Crossing the responsive breakpoint clears transient
  desktop/mobile open state but preserves route-derived current state.
- The wordmark, environment badge when present, NotificationMenu, S85 Appearance, role chip, and
  Sign out remain outside the navigation region and are not hidden inside `Menu`. They may wrap using
  the existing topbar layout, but no element overlaps, clips, or creates page-level horizontal
  scrolling.
- At 320 CSS pixels and 200-percent zoom, every label/subtext remains readable, every control remains
  reachable, and the page has no horizontal scroll caused by the topbar or navigation.

### Error, edge, and recovery behavior

- A malformed, duplicate, empty, unauthorized, or dead manifest entry fails a deterministic build
  or test; the component does not guess a route, icon, label, permission, or fallback destination.
- A route query never changes which destination is current. S83's allow-listed Approval Queue
  `view` selects an authorized lane/target but the current destination remains `Approval Queue`.
  Hash fragments and query ordering cannot create a second current link.
- If current route data changes while a panel is open, current-link and parent-current treatment
  update from the pathname and transient panels close after navigation.
- A missing icon is a test/build failure. A temporarily unavailable destination page retains its
  normal route-level error/recovery UI; navigation does not relabel it healthy or substitute a
  different page.
- No item is disabled for connection health, action-key state, provider readiness, or workload
  count. Those are destination-page truths unless the existing route itself is unauthorized.

**In scope / out of scope.**

In scope: one actor-filtered navigation manifest; the exact three groups and nine destinations;
Console/Dashboard and Spaces/Internal Processes visible terminology; desktop disclosure interaction;
hover-intent timing; icons, title/subtext, group color treatments, current/hover/focus feedback;
mobile Menu/accordion behavior; S86 coordinator registration; responsive/zoom/forced-color/reduced-
motion behavior; permission/active-route parity; and deterministic tests.

Out of scope: route renames or redirects; new pages other than S83's separately owned `/admin/access`;
global Console/Space model renames; role, capability, Space, queue, notification, or action changes;
S85 theme state or dark-palette logic; new counts or analytics; a command palette, global search,
sidebar, breadcrumb system, account menu, mega-menu, third navigation level, customizable favorites,
recent-history links, or whole-app visual redesign; provider calls, source writes, messages, or cloud
configuration.

**Open questions & assumptions.**

No material product question remains open. The duplicate parent/child labels `My Work` and `Admin`
are intentional: each parent is a non-navigating disclosure and each identically named child is the
actual destination. The requested hover behavior is retained as a fine-pointer enhancement with a
350 ms anti-flicker delay; click/tap and keyboard remain the primary behavior. “Color-coded” is
implemented as consistent group-coded icon treatment plus unique icons and text, avoiding nine
arbitrary colors and preventing color from becoming the only distinction. Existing routes remain
stable, while the destination H1/back-link terminology changes where necessary to avoid showing an
old tab name immediately after navigation.

**Cross-product impacts.**

AppShell composition; PrimaryNav route matching/state and S86 transient registration; NotificationMenu
and S85 Appearance preservation; topbar/responsive/focus tokens; Dashboard and Internal Processes landing labels; `/spaces` return
copy; route and Space visibility tests; S81 destination manifest/anchors; S83 `/admin/access`,
Admin-only queue route, and pending-count projection; smoke/accessibility/browser checks. There is no
data schema, API, provider, action-registry, or migration impact.

**Authority and evidence map.**

| Input                                                                           | Classification                   | Use and limitation                                                                                                                                                                    |
| ------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, current role/Space guards, and `docs/facts.md`                     | Authority / present truth        | Navigation may expose authorized destinations but cannot grant access, open an action, or weaken a direct-route guard.                                                                |
| Current AppShell, PrimaryNav, NotificationMenu, topbar tokens, pages, and tests | Verified implementation truth    | Supply exact routes, active aliases, top-level utilities, Space filtering, current contrast/focus behavior, and responsive baseline.                                                  |
| S81                                                                             | Deployed dependency              | Supplies stable Admin/Connections task destinations without merging status and mutation ownership.                                                                                    |
| S83                                                                             | Required predecessor             | Supplies all-staff `/admin/access`, the Admin-only access queue lane, role-aware queue reachability, and any access-request badge projection.                                         |
| S85                                                                             | Required visual predecessor      | Supplies semantic Light/Dark roles and the one Appearance utility that remains top-level; S84 only composes it.                                                                       |
| S86                                                                             | Required interaction predecessor | Supplies shared Icon rendering and cross-family transient-layer coordination; S84 retains only within-navbar disclosure state.                                                        |
| User's navbar note and two Navbar Gallery collections                           | Intent / visual evidence         | Require the exact hierarchy, labels, descriptive items, icons, color coding, hover feedback, and top-level utility preservation. They do not override accessibility or app authority. |
| W3C APG/WCAG, USWDS, Baymard, and inspected current examples                    | External research                | Support disclosure semantics, shallow panels, hover/focus persistence, and hover delay. They do not supply PMI routes, copy, colors, or permissions.                                  |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S84-1** — One typed manifest owns the complete group/item/copy/icon/tone/route/active/
  visibility contract. Parity tests reject duplicate ids/routes, missing copy/icons, dead routes,
  order drift, and visibility that disagrees with existing role/Space/S83 guards.
- **ARCH-S84-2** — One navbar-internal disclosure state machine owns click, pointer intent, focus,
  Escape, outside interaction, route close, and breakpoint reset, and registers with S86's transient
  coordinator. Fake-timer/event-order tests prove exactly one navbar panel and no flicker/reopen loop.
- **ARCH-S84-3** — Desktop and mobile renderers consume the same already-filtered manifest and active
  matcher. Their presentation differs, but item order, copy, routes, accessibility descriptions, and
  current state cannot drift.
- **ARCH-S84-4** — One nine-key glyph/tone manifest consumes S86 Icon and exact S85 navigation roles,
  contains no remote assets or status-color category semantics, and remains valid under computed
  contrast, forced colors, reduced motion, 200-percent zoom, and 320-pixel checks.
- **ARCH-S84-5** — Terminology changes are presentation aliases over stable `/`, `/ask`, and `/spaces`
  routes. Internal Console/Space contracts and direct-route guards remain byte-for-byte compatible
  unless a separately authorized dependency requires otherwise.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S84-1** — Desktop shows only the three ordered group triggers plus the required top-level
  shell utilities, including S85 Appearance; each group reveals exactly its filtered, ordered,
  descriptive destinations.
- **BEH-S84-2** — Click/tap/keyboard work immediately, fine-pointer hover opens after 350 ms without
  flicker, the pointer can enter the panel, and Escape/outside/focus/route behavior closes reliably.
- **BEH-S84-3** — Every destination has one full-row target, exact composition-aware title/subtext,
  unique icon, group-coded non-status treatment, visible focus/hover/current state, and correct active
  parent. Dashboard copy never promises the S93/S95 operational assistant before that composition is
  active.
- **BEH-S84-4** — Editor/Approver/Admin and Renewals/Maintenance/All-spaces combinations see only
  reachable links; an Admin without Renewals can still reach S83 access requests without loading or
  exposing renewal queue lanes.
- **BEH-S84-5** — Narrow/touch users receive one Menu with three accessible accordion groups and the
  same destinations; notifications, Appearance, role, sign out, brand, and environment remain top
  level with no overflow.
- **BEH-S84-6** — Users see `Dashboard` and `Internal Processes` at the navbar and corresponding
  landing context while old routes and internal Console/Space data semantics continue to work.

**Human litmus outcome.**

### Find and open renewal work without knowing the application

**If this was built correctly:** A first-time Renewals user recognizes Operations, previews or opens
it, understands the Lease Renewal description, and reaches the renewal desk from the entire labelled
row without scanning unrelated Admin or personal-work links.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Navigate by keyboard and touch

**If this was built correctly:** A keyboard user can open, traverse, close, and re-open every group
with visible focus and no trap, while a phone user can reach the same destinations through Menu and
accordions without hover or horizontal scrolling.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Respect each user's access while preserving the Admin queue

**If this was built correctly:** A maintenance-only Editor sees Maintenance but not Lease Renewal or
the operational Approval Queue, can still request access through Admin, and an Admin without
Renewals can still open the access-request queue without seeing renewal data.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                             | Architecture outcome       | Behavior outcome         | Human litmus                   | Deterministic evidence / falsification                                                                                                                                |
| ------------------------------------------------------- | -------------------------- | ------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exact three-group information architecture              | `ARCH-S84-1`, `ARCH-S84-3` | `BEH-S84-1`              | Find renewal work              | Manifest snapshot/parity tests assert group/item order, exact copy, icons, routes, and no leftover flat primary links.                                                |
| Role/Space-aware destinations                           | `ARCH-S84-1`, `ARCH-S84-5` | `BEH-S84-4`              | Respect each user's access     | Actor × role × Space matrix checks rendered routes and separately proves direct-route guards remain authoritative.                                                    |
| Stable accessible disclosure behavior                   | `ARCH-S84-2`, `ARCH-S84-3` | `BEH-S84-2`, `BEH-S84-5` | Navigate by keyboard and touch | Fake-timer, keyboard, fine/coarse-pointer, focus, outside-click, Escape, route-change, breakpoint, and S86 coordinator-registration tests fail first.                 |
| Icons, colors, title, and subtext                       | `ARCH-S84-1`, `ARCH-S84-4` | `BEH-S84-3`              | Find renewal work              | DOM/token/icon tests assert one hit area, exact accessible name/description, unique local icon, non-status group tone, and non-color feedback.                        |
| Console/Spaces visible renames with route compatibility | `ARCH-S84-5`               | `BEH-S84-6`              | Find renewal work              | Route/e2e tests assert Dashboard at `/` and `/ask`, Internal Processes at `/spaces`, active aliases, back-link copy, and unchanged URLs/guards.                       |
| Responsive topbar and utility functions                 | `ARCH-S84-2`, `ARCH-S84-3` | `BEH-S84-5`              | Navigate by keyboard and touch | Desktop/tablet/320px/200%-zoom tests assert no overlap/overflow and preserve notification count/polling, Appearance, role, sign-out, brand, and environment behavior. |

**Preservation set.**

Current AppShell authentication, direct-route role/Space guards, S81 status-versus-mutation
ownership, S83 access-request authority, home/ask route equivalence, Space record filtering,
NotificationMenu polling/count/routes, environment-badge truth, sign-out/session timeout, report-
issue availability, topbar focus ring, reduced-motion rule, provider-call counts, secret/PII gates,
and every external action refusal remain green separately.

**Adversarial acceptance checks.**

- **AC-S84-1** — The manifest renders exactly the three group buttons in requested order and exactly
  the nine declared destination definitions before actor filtering; no former flat primary link is
  duplicated outside its group.
- **AC-S84-2** — Role/Space fixtures prove Lease Renewal and Maintenance filtering, operational queue
  filtering, all-staff S83 Admin access, and Admin-without-Renewals routing to `view=access`; direct
  URLs remain independently denied when unauthorized.
- **AC-S84-3** — Click/tap/Enter/Space open immediately; fine-pointer hover does not open at 349 ms
  and does at 350 ms; leave closes after 250 ms; trigger-to-panel crossing cancels close; coarse
  pointer does not hover-open; only one navbar panel remains and S86 receives accurate open/close
  registration.
- **AC-S84-4** — Tab order, Down/Up Arrow entry, Escape focus return and hover suppression,
  `aria-expanded`, `aria-controls`, nested lists, link names/descriptions, `aria-current`, and current
  parent markers pass without `menu`/`menubar`/`menuitem` roles or a desktop focus trap.
- **AC-S84-5** — Every row has one full hit area, exact copy, unique local SVG, group token mapping,
  pointer/focus/current feedback, at least a 44-pixel target, AA text/control contrast, and usable
  forced-colors and reduced-motion states. No icon or color is the only identifying cue.
- **AC-S84-6** — At and below 760 px, Menu and three one-at-a-time accordions expose the same filtered
  manifest, default to the current group, close on selection/Escape, reset transient state across the
  breakpoint, and produce no topbar/page overflow at 320 px or 200-percent zoom.
- **AC-S84-7** — S86 coordinator tests prove navbar/Notification/Appearance mutual exclusion;
  Notification open/count/poll/destination, S85 Appearance selection/focus, role chip, Sign out,
  wordmark, environment badge, session timeout, and Report an issue retain their owning contracts.
- **AC-S84-8** — `/`, `/ask`, `/spaces`, preserved `/processes` routes, and nested routes satisfy
  every row of the exact occurrence inventory and show the correct active group/item. Old URLs,
  internal Console/Space types, entity/scope labels, persisted provenance values, records, and access
  claims remain unchanged; a presentation of preserved provenance uses the Dashboard display alias.
- **AC-S84-9** — Route/provider/store/action spies prove opening and using navigation performs no
  queue mutation, workflow change, access grant, source read/write, connection check, notification
  acknowledgement, draft, or send.
- **AC-S84-10** — A duplicate id/route, missing icon/subtext, dead destination, mismatched guard,
  untrusted external URL, status-color category, remote icon asset, unauthorized rendered link, or
  Dashboard copy/body cross-pairing fails before delivery. Composition fixtures prove the S84
  transitional copy and S95 final copy cannot appear with the wrong Dashboard body at either alias.

**Forbidden actions / hard gates.**

No route/security rewrite, client-only authorization, new role/Space/capability/action, S64 authority,
queue or notification data change, provider call, source write, draft/send, remote icon/font asset,
literal official-brand claim, analytics/PII logging, or protected auth/Rules/gate push without exact
owner direction. The navigation implementation should consume existing public authorization helpers;
if correctness unexpectedly requires a protected `lib/auth/**` or Rules change, prepare and surface
that dependency but do not push it without the required direction.

**Dependencies / sequencing.**

S84 consumes the deployed S81 route/anchor ownership, the specified S83 role-aware Admin/access-
queue contract, S85 Appearance/theme roles, and S86 Icon/transient-layer behavior. Close S96, then
implement S85, S86, and S83 before S84. Dashboard/Internal Processes terminology, the base
manifest, desktop disclosure, and mobile presentation can be developed behind fail-first tests, but
S84 is not complete until non-Admin Admin access and Admin-without-Renewals Approval Queue behavior
match S83. S82 is independent except that its Lease Renewal destination and access handoffs must
remain reachable through this navbar.

**Standalone delivery contract.**

- **Deliverable now:** manifest, exact copy/icon keys/tone mapping, actor filtering, desktop/mobile
  within-navbar disclosure behavior, visible terminology aliases, coordinator registration,
  accessibility/responsive behavior, and preservation/refusal tests can reach `ALL_GATES_GREEN`
  after S85, S86, and S83 without external provider or cloud work.
- **Consumes, but does not assume during fail-first development:** S81 destinations, S83 access
  routes/count projection, S85 roles, and S86 interaction primitives. An unavailable count omits its
  badge and retains S83's review-health recovery; an unavailable required S83 route blocks S84
  completion rather than producing a dead or unauthorized link.
- **Externally blocked effect:** none. This is application navigation with no provider effect or data
  migration.
- **Produces for downstream suites:** one reusable actor-filtered primary-navigation manifest,
  disclosure state machine, and tested terminology/active-route contract.

**Verification and delivery contract.**

1. Before implementation, snapshot the current flat-link order, actor/Space visibility, nested-route
   active states, notification behavior, old landing labels, responsive wrapping, and direct-route
   guards. Add fail-first manifest, interaction, terminology, and mobile checks.
2. Run focused AppShell/PrimaryNav/NotificationMenu/role/Space/page component tests, using fake timers
   for hover intent and actor matrices for every role with Renewals-only, Maintenance-only, both,
   wildcard, and no named Space access where the current contract permits it.
3. Run browser checks with mouse, keyboard, coarse/touch emulation, Back/Forward, route changes,
   outside clicks, notifications, 760/320-pixel viewports, 200-percent zoom, forced colors, and
   reduced motion. Include a screen-reader smoke for trigger state, current link, and description.
4. Run route/e2e preservation for `/`, `/ask`, `/work`, `/spaces`, `/processes`, `/lease-renewal`,
   `/maintenance`, `/approval-queue`, `/admin`, `/admin/access`, `/connections`, and `/gmail-hub`;
   prove direct guards separately from link visibility.
5. Run `bash scripts/verify.sh`, inspect the diff and protected paths, and audit secrets/PII, remote
   assets, route strings, role/Space behavior, provider/store/action calls, contrast, focus, overflow,
   and traceability before authorized delivery.
6. Report `ALL_GATES_GREEN` only when manifest, every actor, all input modes, terminology, responsive
   behavior, unchanged utilities, and preservation pass. `BLOCKED` names only an exact S83/protected-
   path dependency after every independent part is complete.
7. Report one implementation terminal state: `ALL_GATES_GREEN`; `BUDGET_EXHAUSTED` only if a future
   user supplies an explicit budget; or `BLOCKED` only for one exact unavailable input/authority after
   every independent fail-closed path is complete. Do not invent a navigation-specific status.

**Ordered prompt sequence.**

1. Re-verify current routes, active aliases, role/Space guards, topbar utilities, S81 targets, and S83
   access/queue outputs.
2. Freeze preservation and add failing manifest parity, actor matrix, disclosure state-machine,
   terminology, icon/token, and responsive/accessibility tests.
3. Build the shared filtered manifest and nine icon-key/tone contract using S85/S86 without changing
   route authority.
4. Replace the desktop flat links with the disclosure renderer and register it with S86's coordinator.
5. Add the mobile Menu/accordion renderer and the bounded Dashboard/Internal Processes visible-copy
   updates over stable routes.
6. Falsify every actor, pointer, keyboard, touch, route, popover, breakpoint, error, forced-color,
   reduced-motion, and zoom state; run focused and canonical gates before authorized delivery.

**Deletion/merge recommendation.**

Remove after the grouped navbar is deployed, all three human litmus entries pass, and durable product
documentation plus layout/manifest/accessibility tests own the information architecture, interaction,
terminology, and permission contracts.
