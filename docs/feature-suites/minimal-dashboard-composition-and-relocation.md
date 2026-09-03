<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: dashboard-assistant-v1 -->

# S95 — Minimal Dashboard composition and relocation

> Status: Specified and not implemented. Production still renders the current Console composition at
> both `/` and `/ask`; S82–S86 are deployed prerequisites, S88–S94 remain implementation
> prerequisites, and S95 consumes S87's already-specified `SF-06`/`CB-01`/`CB-17` manifest before
> S87 performs the final cross-suite reconciliation.

**Goal.**

Make the authenticated front page a zero-clutter Dashboard with exactly two task regions—S93's `AI`
assistant and one compact, fully clickable `My Work` handoff—while preserving every useful removed
capability on its authoritative owning surface and retiring the standalone user-facing Space Coverage
concept everywhere.

**Current state / intended end state.**

`app/page.tsx` and `app/ask/page.tsx` both require `read`, wrap the same
`components/console/ConsoleView.tsx` in `AppShell`, and intentionally preserve `/ask` for smoke/auth
compatibility. `ConsoleView` currently renders visible `Console` identity, a purpose sentence,
`AskForm`, a three-card `ConsoleActionDeck`, `ConsoleAnticipatedWork`, `ConsoleProcessStrip`, and
`ConsoleLiveDataPanel`.

The component also performs substantial work before the page can render: a RentVine Console
projection, process-definition read, renewal decision gather, connection and coverage projections,
and a second 120-day renewal-desk load for anticipated work. Hiding those panels with CSS would leave
their latency, provider/store load, scope risk, and failure modes on the first screen.

The intended Dashboard renders one H1 `Dashboard`, then S93's complete `AI` region, then a compact
full-card `My Work` link to `/work`. It renders no general page introduction, dashboard counts,
decision/setup/coverage cards, anticipated-work cards, process strip, live-operation records, or
other background state. The body performs no panel-era read. AppShell's separately owned top-level
brand, environment, S84 navigation, Notifications, S85 Appearance, role chip, and Sign out remain.

Removed information is not copied into a second new dashboard model. Decisions remain in
Notifications and Approval Queue; connections remain in Connections under S84's Admin group; renewal
facts and blockers remain in the canonical renewal desk/workspace; process entry and management remain
in Internal Processes and Processes; the full task/accountability experience remains at My Work.
Standalone Space Coverage cards, notification lane/family/preferences, and legacy Ask app-state query
are retired from user-facing behavior. Record-specific Internal Process setup states continue to use
`computeSpaceCardState` and are not renamed or removed.

**Actors and entry conditions.**

- Any authenticated, enabled, managed internal Editor, Approver, or Admin who passes the existing
  `read` page guard can enter `/` or `/ask`. Anonymous and Vendor identities retain their current
  boundary and cannot infer Dashboard content.
- Both aliases receive the same verified `AuthenticatedUser` and render the same body. Role and Space
  scope do not change whether AI or My Work is present; S88–S94 filter assistant results and `/work`
  filters its own records.
- S93 must be available as a bounded error-capable task region before the old Dashboard body is
  removed. An assistant outage renders S93's own truthful recovery and does not restore retired
  panels, block the My Work link, or turn the front page blank.
- `/work`, `/notifications`, `/approval-queue`, `/connections`, `/lease-renewal`, `/spaces`, and
  `/processes` retain their existing direct guards. Relocation never broadens access.
- S84 owns visible `Dashboard`/`Internal Processes` presentation aliases and navbar disclosure;
  internal `Console*` names, `/`, `/ask`, `/spaces`, stored Space identifiers, and persisted
  `Started from the Console` provenance remain compatible.

**What it is / how it functions.**

### Exact Dashboard composition

The Dashboard body has this complete default order:

1. one page H1 with exact visible text `Dashboard`;
2. S93's bounded `AI` task region, including its composer, collapsed `What can I ask?` disclosure,
   and exchanges created during this mounted page session; and
3. one compact `My Work` handoff region.

The `AI` region remains `OUT-SF-06`, S87's one primary Dashboard outcome. `My Work` is a secondary
navigation handoff, not a second outcome and not a miniature accountability board. Within the body,
only S93 Send may have primary-action emphasis. My Work uses S85/S86 secondary navigation treatment.

The My Work handoff is one semantic full-card link with visible text `My Work`, accessible name
`Open My Work`, and exact target `/work`. It has no nested button/link, count, task preview, status,
due date, explanatory paragraph, actor name, background fetch, mutation, or provider call. A local
direction glyph may be present through S86 but conveys no unique meaning. The full card—including its
padding—is the link target. Opening it in the current tab is unchanged ordinary app navigation; S93's
new-tab result-link rule does not apply to this Dashboard handoff.

No idle placeholder or empty result panel appears below AI. The page adds no purpose/subtitle below
`Dashboard`, no “what this page does” text, and no explanation below My Work. S93's collapsed
capability disclosure and independent-question sentence are point-of-use composer help inside AI, not
a third region or page introduction. S93 owns that help, field guidance, validation, current
processing/result, and recovery.

S84 has already removed the obsolete Dashboard description
`See priorities, activity, and app-wide operating status.` S84 remains the navbar-manifest owner and
defines two exact composition-aware values. S95's atomic cutover switches the active row from
`Review current operations and ask about approved PMI KC guidance.` to `Ask AI about current work,
then open My Work to act.` in the same delivery that activates the two-region body at both aliases.
This consumes S84's frozen transition and requires no new navbar decision, route rename, runtime flag,
or global Console-symbol rename. Rollback restores both the former body and former copy.

### Source-backed removal and relocation matrix

This matrix is the complete S87 `CB-17` disposition for the current Dashboard. An implementation may
not preserve, move, or add another current Dashboard block outside these rows.

| Current block / source                                                                                | S87 action class | Required Dashboard result                                                      | Authoritative survivor / relocation                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Visible H1 `Console` in `ConsoleView`                                                                 | `Rename`         | Exact H1 `Dashboard`.                                                          | S84 owns the visible alias at both `/` and `/ask`; internal Console names remain.                                                                                                                                                                                                                                              |
| `console-purpose`: `Ask about a property, lease, or process…`                                         | `Slim / remove`  | Delete without replacement.                                                    | S93 labels/instructs the composer at the input. This also satisfies S87 `CB-01`'s existing purpose-line removal.                                                                                                                                                                                                               |
| Current `AskForm` two-column form/result, Process picker, deterministic suggestion, classifier button | `Reorganize`     | Replace with the one S93 AI region; no Process control remains.                | S93 owns composer, session exchange stack, structured streaming, linked results, Dictate preservation, terminal states, and S94 action projection. Process definitions/runs remain under `/spaces`, `/processes`, and `/workflow-runs/*`; a Dashboard question starts none.                                                    |
| Generated `AskResponse.draft` preview                                                                 | `Slim / remove`  | Do not render or request it from the Dashboard assistant.                      | The buffered `/api/ask` response remains compatibility-only during rollback. Governed domain drafts stay on their owning surfaces; no general model draft is copied into S93 or treated as an action. Existing data is not migrated or deleted.                                                                                |
| Inline `RenewalNoticeDraftComposer` shown from a current Ask result                                   | `Reorganize`     | Remove it from Dashboard results.                                              | The guarded composer remains on the canonical renewal notice/workspace surfaces and continues to end in an unsent Gmail draft under its existing exact gate. S91 links users to the owning lease; S93/S94 never draft or send.                                                                                                 |
| `Capture Task` and `/api/ask/capture` Placeholder creation                                            | `Slim / remove`  | Remove the Dashboard control; do not relabel it as My Work.                    | S94 may create one real self-assigned My Work task only for an exact eligible renewal row after Review and Confirm. Other results get no task action. The legacy endpoint remains compatible for rollback/non-Dashboard callers until a separate removal, and existing Placeholder records are neither migrated nor deleted.   |
| `Suggest a correction` and `/api/ask/correct`                                                         | `Merge`          | Keep only inside the answered knowledge result's collapsed secondary controls. | S93 preserves the current explicit human-note correction schema, guard, and persistence for `guidance.knowledge`; it is not shown for operational results, never submits from the query/model/action path, and remains part of AI rather than a third Dashboard region.                                                        |
| `ConsoleActionDeck` — `Needs your decision` card and inline Approve                                   | `Reorganize`     | Remove card and inline action.                                                 | `/notifications` retains the actor's attention view; `/approval-queue` retains eligible decisions and exact controls. Do not copy approval records into `/work` or create a Dashboard queue. S83's access-request lane remains separately owned.                                                                               |
| `ConsoleActionDeck` — `Connections to set up` card                                                    | `Reorganize`     | Remove card.                                                                   | `/connections` is the canonical status/setup/check surface and appears under S84's Admin group. The existing Notifications connection setup lane may remain because the user asked to remove the Dashboard duplicate, not all connection attention.                                                                            |
| `ConsoleActionDeck` — `Space coverage` card                                                           | `Slim / remove`  | Remove card and retire the user-facing concept globally.                       | No replacement page, card, assistant intent, notification lane, family, preference, or count. Preserve only per-record Internal Process setup state from `computeSpaceCardState`, `SPACE_CARD_STATE_LABEL`, and the actual `/spaces` cards.                                                                                    |
| `ConsoleAnticipatedWork` and `buildAnticipatedWork`                                                   | `Reorganize`     | Remove the entire lane and its Start-run controls.                             | Real lease/follow-up/notice records remain in `/lease-renewal/live/desk` and S82's table/filter/action model. Process run entry remains on `/spaces`/`/processes`. Zero-count `Waiting on a maintenance signal` and `Waiting on a compliance or new-user signal` placeholders are removed, not relocated or presented as data. |
| `ConsoleProcessStrip`                                                                                 | `Reorganize`     | Remove the strip.                                                              | `/spaces` is the S84 `Internal Processes` directory; `/processes` remains the actual process-definition/run surface.                                                                                                                                                                                                           |
| `ConsoleLiveDataPanel` and Console RentVine projection                                                | `Reorganize`     | Remove the complete panel.                                                     | Every current provider row is `spaceId: lease-renewals`; canonical lease facts/work are `/lease-renewal/live/desk` and S82's table/workspace. Workflow-linked messages remain in owning communication panels. No generic `Live operations` destination is created.                                                             |
| Compact My Work handoff                                                                               | `Add`            | Render once below AI.                                                          | `/work` remains the sole full `WorkAccountabilityBoard` for owned tasks/sessions.                                                                                                                                                                                                                                              |

“Relocation” means the owning route remains reachable and receives no new duplicate store merely to
replace the Dashboard card. It does not require moving Firestore records, provider data, or existing
actions. Where S82/S83 presentation is not yet implemented, the current guarded canonical route
remains the fallback. The Dashboard may cut over without waiting for a provider write or adding a
temporary duplicate.

### Remove panel-era Dashboard reads

After cutover, the Dashboard body must not call, import for side effects, preload, or serialize data
from these current `ConsoleView` gathers:

- `loadConsoleProjection` / `resolveConsoleDataMode`;
- `listProcessDefinitions` for picker, coverage, process strip, or anticipated-work startability;
- `gatherDecisionAttention`;
- `resolveConnectionsState`;
- `resolveCoverageState`;
- `readConnectorPresence`, `computeSpaceCardState`, and launch-Space processing for Dashboard cards;
- `loadLiveRenewalDesk` and `buildAnticipatedWork`; or
- any replacement Dashboard count/summary call for the same removed content.

S93 performs actor-scoped reads only after a user submits a query. The My Work handoff performs none.
AppShell's own NotificationMenu fetch/poll and S84/S85 shell state are outside this body-read rule and
must not be disabled to make a test pass.

After runtime call-site removal, delete a Dashboard-only component/provider/projection only when a
repository-wide reference check proves it has no non-test consumer. Do not delete a shared resolver,
desk loader, process list, connection projection, attention gather, route, schema, or test helper that
still owns another surface. Tests for retired modules are removed with the module; tests for shared
behavior stay and gain target-surface coverage.

### Global user-facing Space Coverage retirement

The standalone Space Coverage concept currently extends beyond `ConsoleActionDeck` through
`resolveCoverageState`, `/api/ask/app-state?query=coverage`, `lib/attention/lanes.ts`,
`lib/attention/standing-signals.ts`, `lib/notifications/families.ts`,
`lib/notifications/hub.ts`, `app/notifications/page.tsx`, NotificationMenu preferences, and their
tests. S95 retires it as follows:

- no new `coverage` attention signal or `space_coverage` notification family item is produced;
- Notifications renders no Space Coverage heading, all-clear copy, rows, count, family toggle,
  threshold, or snooze control, and its full loader skips the coverage resolver/read;
- NotificationMenu's served family catalog omits Space Coverage;
- after the existing authentication guard, a legacy direct
  `/api/ask/app-state?query=coverage` request returns HTTP 410, header
  `Cache-Control: no-store`, and exactly
  `{ "type": "RetiredAppStateQuery", "message": "Space coverage is no longer a user-facing query." }`.
  It performs no process-definition/connector read. Other unknown query values retain their existing
  HTTP 400 behavior;
- S88's intent registry and S90/S91 adapters do not map any assistant question to a coverage query;
- legacy stored `space_coverage` mute and `coverage` snooze values remain decode-compatible so an old
  preference document cannot break the rest of Notifications. They are ignored and omitted from
  served active preferences, but every preference write round-trips the deprecated keys byte-for-byte
  so rollback cannot lose user state. S95 performs no stripping or destructive migration. A later
  separately authorized schema migration may remove them only after no permitted rollback revision
  can consume or emit them and backup/dry-run/readback requirements are specified;
- a defensive feed supplied a legacy coverage signal drops it before counts, sorting, badges,
  rendering, or telemetry; and
- static user-facing copy contains no `Space coverage`/`Spaces that need setup` surface label or
  all-clear text after implementation.

The compatibility seam is server-only `DeprecatedCoveragePreferencesV1`, captured from the exact raw
Firestore snapshot before normalization. It contains no uid or unrelated preference value and records:

- the count and relative order of exact `space_coverage` entries in raw `muted_families`;
- presence plus the exact raw string (maximum 256 UTF-8 bytes, including malformed dates) at
  `snoozed_lanes.coverage`;
- presence plus the exact current finite value at `lane_thresholds.coverage`; and
- the count and relative order of exact `coverage` entries in raw `digest_lanes`.

The public GET omits this carrier. PATCH runs in one transaction, rereads the raw current document,
parses only active submitted keys, and writes active map members through exact field paths so the
deprecated `coverage` members are neither overwritten nor deleted. For array fields it combines the
new canonical active subsequence first, followed by every captured deprecated occurrence in its
original raw relative order; duplicate deprecated occurrences are preserved exactly. This ordering
is the canonical rollback-compatible write regardless of whether deprecated entries were before,
between, or after active entries in the prior raw array. The active API can neither add nor remove a
deprecated occurrence. The transaction rejects an
oversize/unsupported deprecated raw type without modifying the document and shows a bounded preference
error; it never silently strips the value. Immediate raw readback must equal the prewrite deprecated
carrier and the requested active values before success. This seam is compatibility state only—never
served, rendered, counted, logged, or accepted from the client—and is deleted only by the later
authorized migration named above.

`Canonical active subsequence` is not a registry sort. For a submitted array, it is the validated
active values in client-submitted order after only the deduplication already owned by that field
(`muted_families` keeps first occurrence; `digest_lanes` preserves its current duplicate/order
behavior). For an omitted optional array, it is the current raw active sequence in original relative
order after the field's existing validation; no omission reorders it. The deprecated occurrences are
then appended as declared above.

This does not remove the concept of whether one actual Internal Process is configured. `/spaces`
continues to read process definitions and connector presence, call `computeSpaceCardState`, and show
record-specific state such as `Needs a process`, `Connections needed`, `Process ready`, or status
unavailable. `SPACE_CONNECTOR_IDS`, the connection center, S83 access/connection behavior, release
coverage, insurance coverage, test coverage, and other unrelated uses of the word “coverage” are
outside this retirement.

### Empty, unavailable, and responsive behavior

The Dashboard has no data-driven empty state because its two regions are always present for a managed
staff session. S93 owns AI source unavailable/refusal/retry. `/work` owns My Work empty/error states.
An AI failure cannot disable or visually subordinate the My Work link; a `/work` failure occurs only
after navigation and cannot manufacture a Dashboard task count.

At desktop, AI takes the primary content width and My Work remains compact below it. At 760 px and
below, both remain in one document column in the same order. At 320 CSS pixels and 200% zoom, neither
creates page-level horizontal scrolling. `Dashboard`, `AI`, and `My Work` provide the visible
structure; there is no unlabeled generic panel. The full-card My Work focus/hover/active/current state
uses S85/S86 non-color cues, remains at least the shared target size, and works by keyboard, touch,
and pointer. Reduced motion changes no information or reachability.

### Authenticated cutover and rollback gate

The two-region body cannot replace the current Console on the strength of build output or anonymous
route smoke alone. On the exact zero-traffic candidate, run S89's content-free served-browser harness
with one existing managed Editor and one existing managed Admin session supplied outside Git. At both
`/` and `/ask`, each actor must see the same two-region order, open the S88 capability disclosure,
submit every fixed V1 example for which that actor has access, receive the truthful denied/access
handoff for one fixture outside their scope, open at least one validated result destination in a new
tab, and open My Work in the current tab. The matrix also visits the relocated owning routes named in
the disposition table and proves their direct guards and primary capability still work.

The candidate gate fails on any uncaught browser error, unhandled promise rejection, unexplained
failed same-origin request, route/guard mismatch, blank region, false empty/unavailable state, missing
terminal, duplicate submit, stale S91 renewal projection, invalid destination, eager retired loader,
content-bearing telemetry, or unverified client-error alert delivery. It records only actor class,
route family, intent key, terminal category, pass/fail, and exact revision; no uid, URL parameter,
question/answer, customer value, response body, screenshot, token, or provider payload is retained.
After exact promotion, repeat the bounded root/Ask/help/My Work path, one allowed operational intent,
one denied path, S91 read-only reconciliation, and client-error delivery readback during the stable
observation window. Failure restores the captured predecessor; it never brings back a mixed old/new
Dashboard composition or silently disables the gate.

**In scope / out of scope.**

In scope: final `/` and `/ask` body composition; exact H1/region order; compact `/work` handoff;
removal and authoritative relocation of every current Dashboard block; elimination of panel-era
Dashboard reads; retirement/cleanup of Dashboard-only components after reference proof; global
user-facing Space Coverage lane/family/query/preference retirement with legacy decode compatibility;
route/term compatibility; S82–S87 reconciliation; accessibility; focused/adversarial tests; and
current documentation reconciliation during implementation.

Out of scope: S93 assistant internals; S88–S94 query/adapters/narration/actions/privacy; My Work
redesign or task preview/count; merging approval records into Work tasks; Approval Queue, Connections,
renewal, Internal Processes, Processes, or Notifications redesign beyond removing Space Coverage;
new Admin/anticipated/live-operation pages; provider/store migration; new routes or redirects;
global source-code/type/schema renaming from Console/Space; changing role/Space access; connection
checks; process-run behavior on its owning surface; Action Registry changes; writes/sends; S85 theme
implementation; or S86 primitive implementation.

**Open questions & assumptions.**

No material product question remains open.

- Decision: the Dashboard has one primary assistant outcome and one secondary My Work navigation
  handoff. “Only AI and My Work” does not authorize task previews, dashboard statistics, onboarding
  prose, recent items, suggestions, or another card.
- Decision: Needs your decision stays in Notifications/Approval Queue rather than becoming a My Work
  task. The stores and authority lifecycles are different; existing derived work may still appear in
  My Work through its own mapping.
- Decision: Connections stays at `/connections` under S84 Admin navigation rather than moving its
  status/check controls into the Dashboard or duplicating them on `/admin`.
- Decision: renewal-backed anticipated/live facts use the canonical renewal desk/S82 presentation;
  no anticipated-work panel is moved to Admin. No-source maintenance/compliance placeholders are
  removed rather than preserved as apparent work.
- Decision: Space Coverage is retired only as a standalone user-facing aggregate/lane/query. Exact
  per-Internal-Process setup state remains because S95 explicitly preserves `computeSpaceCardState`.
- Decision: the My Work card navigates in the current tab. S93's requested new-tab behavior belongs
  only to assistant result references.

**Cross-product impacts.**

- `ConsoleView` becomes a minimal composition wrapper or is renamed internally only if a separate
  refactor justifies it; S84 does not require an internal rename.
- `ConsoleActionDeck`, `ConsoleAnticipatedWork`, `ConsoleProcessStrip`, `ConsoleLiveDataPanel`,
  `StartRunButton`, `lib/anticipation/projection.ts`, and `lib/console/*` require reference audits;
  remove only Dashboard-only dead code.
- `/notifications`, notification hub/feed/families/preferences, attention lanes/standing signals,
  `/api/ask/app-state`, and their tests change only for Space Coverage retirement. Connections,
  decisions, review, support, renewal, maintenance, and communication families remain.
- `/work`, `/approval-queue`, `/connections`, `/lease-renewal`, `/spaces`, and `/processes` gain no
  duplicate records or authority. Their existing direct guards remain the final boundary.
- S84's Dashboard navigation transition is already reconciled and must be switched atomically. S87
  `SF-06`/`CB-01`/`CB-17` implementation evidence must reconcile to the newer exact outcomes below;
  current internal identifiers remain.
- Page-load performance and failure isolation improve because removed RentVine/Firestore/process/
  coverage reads run only on their owning routes or an explicit S93 query.

**Authority and evidence map.**

| Input                                                                                                    | Classification                    | Use and limitation                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router, `AGENTS.md`, committed code/tests, live readback, and `docs/facts.md`                            | Authority / implementation truth  | Preserve current routes, managed-user guards, Live-only posture, role/Space boundaries, provider/action safety, and protected paths.                                                      |
| `ConsoleView`, its five child surfaces, current routes/loaders/providers, and Console/notification tests | Implementation truth              | Establish exact page blocks, eager reads, inline approval, renewal-only Live rows, placeholder anticipation, and cross-surface coverage footprint.                                        |
| `/work`, `/notifications`, `/approval-queue`, `/connections`, renewal, `/spaces`, and `/processes`       | Implementation truth              | Establish real guarded owners for relocated information/actions; their existence does not authorize copying data or bypassing guards.                                                     |
| S82 / S83 / S84 / S85 / S86 / S87                                                                        | Deployed owners plus S87 contract | S82–S86 own deployed renewal, access/connections, navbar/terms, theme, and interactions; S87 specifies content hierarchy. S95 supersedes only the exact conflicting Dashboard rows named. |
| S88–S94                                                                                                  | Dashboard assistant contracts     | Supply the complete S93 assistant region and typed read/action/privacy behavior. S95 composes them but does not redefine them.                                                            |
| Dashboard decluttering and deeper-AI feature notes                                                       | Intent evidence only              | Require an AI-first zero-clutter home, clickable My Work handoff, panel relocation, no process picker, and Space Coverage removal.                                                        |
| Missing S82/S83 presentation at cutover                                                                  | Adjacent dependency               | Use the current guarded owning route and truthful present state; never keep a duplicate Dashboard panel or guess future behavior.                                                         |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S95-1** — One shared Dashboard body serves `/` and `/ask` and declares an exact two-region
  manifest: S93 AI as `OUT-SF-06` and a secondary `/work` handoff. DOM/route tests fail first against
  the current seven-block Console.
- **ARCH-S95-2** — One source-backed disposition manifest names every retired Dashboard block, its
  S87 action class, authoritative surviving route, and no-duplicate rule. Reachability and route-
  guard tests prevent a useful action from disappearing or moving across authority boundaries.
- **ARCH-S95-3** — Dashboard server-call boundaries exclude every panel-era gather/import and any
  replacement summary/count call. Loader/provider/store spies fail first on current eager reads and
  pass only when the idle body is data-free apart from verified session/AppShell behavior.
- **ARCH-S95-4** — One retirement boundary removes `coverage`/`space_coverage` from all user-facing
  production, new emissions, active preferences, app-state queries, counts, and assistant intents
  while preserving legacy preference decode/drop and `computeSpaceCardState` for `/spaces`.
- **ARCH-S95-5** — Presentation aliases and compatibility are explicit: visible Dashboard and
  Internal Processes follow S84; `/`, `/ask`, `/spaces`, internal Console/Space symbols, claims,
  records, metrics, and persisted provenance do not change.
- **ARCH-S95-6** — Dead-code cleanup is reference-driven: Dashboard-only components/providers/tests
  can retire, but shared attention, connection, process, work, renewal, and notification contracts
  remain independently imported/tested on their owning surfaces.
- **ARCH-S95-7** — One content-free authenticated release matrix binds Admin/Editor browser journeys,
  S91 reconciliation, S89 client/server telemetry, owning-route reachability, exact revision, and
  rollback. Anonymous smoke, local fixtures, build success, or server 5xx counts cannot substitute.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S95-1** — At both `/` and `/ask`, a managed user sees exact H1 `Dashboard`, then AI, then one
  compact My Work card—and no purpose line, Process picker, decision/setup/coverage deck,
  anticipated work, process strip, Live operations, counts, or idle result placeholder.
- **BEH-S95-2** — The whole My Work card opens exact `/work` in the current tab for every managed
  staff actor, with no fetch, count, preview, nested control, or mutation on the Dashboard.
- **BEH-S95-3** — Removed actions remain reachable only on their named guarded owners: decisions on
  Notifications/Approval Queue, connections on Connections, renewal facts/actions on Renewals, and
  process entry/run controls on Internal Processes/Processes.
- **BEH-S95-4** — Loading either Dashboard alias without submitting AI performs none of the retired
  body reads or external/provider effects; an AI failure remains localized and My Work stays usable.
- **BEH-S95-5** — No managed actor can see, request, mute, snooze, count, query, or receive a standalone
  Space Coverage item. Legacy preference values do not break the feed and are ignored/round-tripped, while
  actual Internal Process cards still show truthful setup state.
- **BEH-S95-6** — Dashboard/Internal Processes visible aliases, route compatibility, current guards,
  keyboard/touch/focus behavior, 320px/200%-zoom layout, reduced motion, and AppShell utilities remain
  correct across Editor/Approver/Admin and Space-scope combinations.
- **BEH-S95-7** — An authenticated Editor and Admin can load either Dashboard alias, understand the
  bounded assistant, receive allowed and denied results, open exact work destinations, and continue
  on My Work without a page error, stale renewal answer, lost capability, or leaked browser evidence.

**Human litmus outcome.**

### Land on a simple Dashboard

**If this was built correctly:** A newly onboarded staff user opens the app and sees Dashboard, one
obvious place to ask AI, and one compact My Work card. There is no setup/coverage/anticipated/process/
live-data wall and no explanation they must read before acting.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Continue work on the owning surface

**If this was built correctly:** The user opens My Work from the full card. They can still reach
decisions, connections, renewals, and internal processes from the navbar/owning routes, and those
surfaces enforce the same access and action rules as before. Nothing important was copied into a new
Dashboard store or silently deleted.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Remove Space Coverage without breaking real setup truth

**If this was built correctly:** Space Coverage appears nowhere on Dashboard, Notifications,
preferences, or AI, including for a user with old muted/snoozed values. The Notifications feed still
works, and an Internal Process card can still truthfully say that its own process or connection needs
setup.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                      | Architecture outcome | Behavior outcome | Human litmus                                      | Deterministic evidence / falsification                                                                                                                                              |
| ------------------------------------------------ | -------------------- | ---------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exactly AI plus clickable My Work                | `ARCH-S95-1`         | `BEH-S95-1/2`    | Land on a simple Dashboard                        | Exact DOM manifest/order/absence snapshots at both aliases and full-card link interaction tests.                                                                                    |
| Remove purpose, picker, panels, and idle clutter | `ARCH-S95-1/2/6`     | `BEH-S95-1`      | Land on a simple Dashboard                        | Named-block absence/static-reference checks; no unnamed CB-17 block survives or moves.                                                                                              |
| Preserve capability at authoritative owners      | `ARCH-S95-2/5/6`     | `BEH-S95-3/6`    | Continue work on the owning surface               | Destination/guard/role/Space matrix and action component tests remain green independently.                                                                                          |
| Remove obsolete eager reads                      | `ARCH-S95-3/6`       | `BEH-S95-4`      | Land on a simple Dashboard                        | Server-loader/provider/store call spies at `/` and `/ask`; AppShell polling is separately allow-listed.                                                                             |
| Resolve current Ask controls without hidden loss | `ARCH-S95-2/6`       | `BEH-S95-1/3/4`  | Continue work on the owning surface               | Draft/composer/capture/correction matrix proves exact Dashboard absence or knowledge-only preservation and the named owning survivor/API compatibility.                             |
| Retire Space Coverage globally                   | `ARCH-S95-4`         | `BEH-S95-5`      | Remove Space Coverage without breaking real truth | Producer/feed/catalog/UI/API/assistant/static-copy matrix; legacy query returns exact 410 without reads.                                                                            |
| Preserve Internal Process setup state            | `ARCH-S95-4/6`       | `BEH-S95-5/6`    | Remove Space Coverage without breaking real truth | `/spaces` state matrix still calls `computeSpaceCardState` and renders process/connection-ready/unavailable fixtures.                                                               |
| Preserve aliases, routes, and internal terms     | `ARCH-S95-1/5`       | `BEH-S95-6`      | Continue work on the owning surface               | `/`, `/ask`, `/spaces`, active-link, H1/copy, stored-provenance, source-symbol, and direct-guard compatibility tests.                                                               |
| Preserve AppShell and accessible layout          | `ARCH-S95-1/5`       | `BEH-S95-1/2/6`  | All                                               | Keyboard/touch/focus/landmark/target-size/forced-color/reduced-motion/320px/200%-zoom plus shell-utility preservation tests.                                                        |
| Localize assistant failure                       | `ARCH-S95-1/3`       | `BEH-S95-4`      | Land on a simple Dashboard                        | S93 unavailable/denied/timeout fixtures leave exact My Work link enabled and do not restore/load retired panels.                                                                    |
| No new data, authority, or effects               | `ARCH-S95-2/3/6`     | `BEH-S95-2/3/4`  | Continue work on the owning surface               | Network/store/provider/action spies prove only navigation/query-on-submit and no copies, inline approval, runs, checks, writes.                                                     |
| Authenticated production-safe cutover            | `ARCH-S95-7`         | `BEH-S95-3/6/7`  | All                                               | Exact-candidate Admin/Editor matrix, post-promotion bounded rerun, S91 reconciliation, console/network capture, alert-delivery readback, and predecessor restoration gate all pass. |

**Preservation set.**

- Existing `/` and `/ask` page guards, AppShell composition, smoke reachability, and shared-body
  equivalence remain green.
- S84 wordmark, environment badge, deployed grouped nav, NotificationMenu count/poll/open,
  S85 Appearance, role chip, Sign out, active-route aliases, and narrow-shell behavior remain.
- `/work` continues to render the full actor-filtered `WorkAccountabilityBoard`, its source links,
  session/task states, mutation gates, empty/error/retry, and Admin team separation.
- `/notifications` retains decisions, event activity, connection setup, review, support, renewal,
  maintenance, communication, mute/read, and low-alarm behavior except the exact retired coverage
  family/lane.
- `/approval-queue` retains queue/review/writeback/metrics behavior and exact decision authority;
  removing Dashboard inline Approve does not change queue transitions.
- `/connections` retains all-role visibility, Admin-only management/checks, S83 supported read-check
  rules, S86 disconnect recovery, and no-secret presentation.
- Renewal desk/workspace, `/spaces`, `/processes`, workflow runs, communication panels, their direct
  guards, and provider/action contracts remain green.
- `computeSpaceCardState`, `SPACE_CARD_STATE_LABEL`, `SPACE_CARD_STATE_TONE`, `SPACE_CONNECTOR_IDS`,
  record-specific setup-state tests, and unrelated meanings of coverage remain.
- S82–S94 outcomes and all exact action-key gates, unsent-draft rules, exact-confirm/idempotency/
  readback, no-autonomous-send, Live-only, identity, cost, and protected-path boundaries remain
  separate gates; Dashboard query/help/navigation invokes no executable source key.

**Adversarial acceptance checks.**

- **AC-S95-1** — `ARCH-S95-1` exact DOM tests at `/` and `/ask` allow only H1 Dashboard, one S93 AI
  task region, and one My Work handoff in the body; they reject every named old block, duplicate AI/
  My Work region, extra summary/count/copy, idle result panel, or second primary outcome.
- **AC-S95-2** — `ARCH-S95-2/6` source scan and route matrix prove each useful removed capability has
  its exact surviving owner/control/guard and that no Dashboard-specific mirror store, endpoint,
  loader, or replacement panel was introduced.
- **AC-S95-3** — `ARCH-S95-3` call-count tests fail if either alias invokes Console projection,
  process definitions, decision gather, connection/coverage state, connector presence, renewal desk,
  anticipation, or a substitute dashboard summary; AppShell Notification behavior remains green.
- **AC-S95-4** — `ARCH-S95-4` producer-to-renderer tests prove no coverage signal/family/preference/
  count/assistant result survives; after authentication, the legacy endpoint returns only the exact
  410 JSON/no-store contract with zero Firestore/provider/process/connector reads, while every other
  unknown query retains the existing 400 behavior.
- **AC-S95-5** — `ARCH-S95-4/6` legacy preference fixtures containing only or mixed
  `space_coverage`/`coverage`, duplicates, malformed dates, and current keys decode without blanking
  Notifications, never serve the retired keys, and preserve them byte-for-byte on authorized saves.
  Before/between/after and duplicate fixtures prove each saved array is the canonical active
  subsequence followed by all captured deprecated occurrences in original raw relative order; the
  active subsequence preserves submitted order/current field-specific deduplication or omitted raw
  order exactly, the client cannot add/remove deprecated occurrences, and no destructive migration
  occurs.
- **AC-S95-6** — `BEH-S95-5/6` Internal Process state fixtures prove needs-process,
  connections-needed, ready, reference, unavailable, role/Space filtering, and full-card navigation
  remain byte-equivalent apart from S84 visible aliases.
- **AC-S95-7** — `BEH-S95-2/4` pointer/touch/Enter/current-tab, no-nested-control, failed-assistant,
  `/work` denied/unavailable, and double-click fixtures leave the handoff truthful and perform only
  one ordinary navigation with no Dashboard read/mutation.
- **AC-S95-8** — `ARCH-S95-5` terminology scan permits internal Console/Space symbols and exact stored
  provenance while rejecting visible `Console` at Dashboard aliases, visible collection `Spaces`,
  and the S84 transitional Dashboard subtext on the implemented S95 UI. Candidate, promotion, and
  rollback composition tests reject either S84 Dashboard copy paired with the wrong body at `/` or
  `/ask`, without introducing a runtime flag.
- **AC-S95-9** — `BEH-S95-1/2/6` semantic heading/region/link, keyboard, screen-reader, focus,
  hover/touch, 44px shared target, forced-color, reduced-motion, 320px, and 200%-zoom checks pass with
  no hidden essential text or page-level overflow.
- **AC-S95-10** — Store/provider/action spies prove page render and My Work navigation perform no
  approval, task, workflow, draft, send, RentVine/Sheet, connector-check, preference, or action-key
  mutation. S93 query reads begin only after an accepted user submission.
- **AC-S95-11** — Focused targets plus `bash scripts/verify.sh` report S82–S94 and all preservation
  checks separately; deleting old tests without equivalent absence/owner/preservation proof fails.
- **AC-S95-12** — Populated current-Ask fixtures prove Dashboard query/results never request or render
  `AskResponse.draft`, `RenewalNoticeDraftComposer`, Process selection, or `Capture Task`; those
  interactions create no Placeholder, run, or draft. An answered `guidance.knowledge` result alone
  exposes the collapsed S93 correction control, Cancel writes nothing, explicit submit uses the
  current guarded correction schema once, and all operational results omit it. Canonical renewal
  surfaces retain their guarded unsent-draft composer independently.
- **AC-S95-13** — `ARCH-S95-7` runs the exact candidate with managed Editor/Admin sessions across both
  aliases, all actor-eligible fixed V1 examples, one denied scope, help/example copy, new-tab result,
  current-tab My Work, and every relocated owner route. The gate fails on console/unhandled/network/
  guard/terminal/link/reconciliation/eager-read/alert-delivery drift or any retained identity/content;
  post-promotion smoke repeats the bounded matrix and restores the exact predecessor on failure.

**Forbidden actions / hard gates.**

- Do not leave retired panels mounted, visually hidden, client-fetched, preloaded, or server-gathered.
- Do not add Dashboard task/approval/connection/renewal/process/live counts, previews, suggestions,
  onboarding text, saved layouts, personalization, analytics panels, or another region.
- Do not merge Approval Queue items or notification signals into My Work, create a dashboard mirror
  store, or infer one lifecycle from another.
- Do not remove or weaken direct-route role/Space guards because a navigation link is hidden or moved.
- Do not remove `computeSpaceCardState` or per-record Internal Process setup truth under the Space
  Coverage retirement. Do not treat insurance/test/release coverage as this UI concept.
- Do not destructively rewrite or strip legacy notification preferences. Decode, ignore, and round-
  trip deprecated keys through the bounded compatibility path until a separately authorized migration
  proves no permitted rollback depends on them.
- Do not rename `/`, `/ask`, `/spaces`, internal Console/Space types, ids, claims, metrics, records, or
  persisted provenance.
- Do not start a process, approve a queue item, create a task/draft, send, check a connector, write a
  system of record, open an action key, change production identity/runtime/budget, or alter protected
  auth/action-gate paths through this composition suite.

**Dependencies / sequencing.**

1. S96, S85, S86, S83, S84, and S82 are already green under the integrated queue; S95 preserves their
   connector safety, interaction, access, terminology, navigation, and complete renewal contracts.
2. S88, S89, S90, S91, and then S92 are green behind their closed read/narration contracts.
3. S94 is green once against strict S93-slot fixtures, then S93 is implemented once over the real S94
   projector/Review/Confirm contract. The joined verification gate proves all non-action and action
   states, cancellation, mandatory narration, links, Dictate, correction, receipt, and recovery.
4. After the complete S93 region has a bounded unavailable state, atomically cut both Dashboard
   aliases to S95 composition, retire panel-era reads/components, and apply non-destructive coverage
   compatibility behavior only in an exact candidate.
5. S95 consumes S87's already-specified `SF-06`, `CB-01`, and `CB-17` manifest contract; it does not
   require S87 implementation. S87 executes once, last, and reconciles all cohorts to the delivered
   S95 Dashboard without reopening this suite.
6. Promotion requires AC-S95-13: the S89/S93 authenticated browser matrix, S91 source/projection
   reconciliation, relocated-owner reachability, bodyless monitoring delivery, and exact rollback
   target all pass. Build, local browser, or unauthenticated route smoke alone cannot advance S95.

S95 is the later, narrower Dashboard content contract. It consumes and preserves S84's already-
reconciled Dashboard description and supersedes only S87's conflicting SF-06/CB-01/CB-17 Dashboard
rows. It does not supersede S84
disclosure/navigation ownership, S87's one-outcome/content rules elsewhere, or any S82/S83/S85/S86
business/interaction contract.

**Standalone delivery contract.**

- **Deliverable now:** exact two-region shared Dashboard, compact My Work handoff, complete old-block
  removal/relocation manifest, zero panel-era body reads, reference-safe dead-code cleanup, global
  user-facing Space Coverage retirement with legacy preference/query behavior, terminology/route/
  guard/accessibility preservation, focused/adversarial tests, and current documentation
  reconciliation can reach `ALL_GATES_GREEN` without a provider mutation.
- **Consumes:** green S93/S94 assistant/action integration, S82 renewal table/links, S83 access lane/
  connection grouping, S84 navigation/aliases, S85/S86 presentation, S96 preservation, and S87's
  specified content manifest. An unavailable runtime source renders its owning recovery; no missing
  source restores an old Dashboard panel.
- **Externally blocked effect:** none. The cutover is application presentation/read orchestration and
  performs no live provider or source write. A missing S93 implementation blocks only the final
  composition cutover, not coverage compatibility tests or removal planning; do not ship a blank
  placeholder Dashboard.
- **Produces for downstream suites:** one stable minimal Dashboard surface manifest, exact
  relocation/preservation ledger, page-load read boundary, deprecated coverage compatibility
  contract, and evidence that all useful operations remain on their owning surfaces.

**Verification and delivery contract.**

1. Before implementation edits, capture populated current DOM at `/` and `/ask`, Console child order,
   every Dashboard loader call, cross-surface route/guard reachability, Space Coverage producer/
   preference/API footprint, AppShell behavior, and S82–S94 preservation. Fail-first must name only
   the old composition/reads/coverage behavior.
2. Run focused shared-route, exact DOM/absence, My Work link, destination/guard, loader call-count,
   coverage producer/feed/catalog/preference/API, legacy compatibility, reference/dead-code,
   terminology, responsive/accessibility, and no-effect tests for every outcome and adversarial row.
3. Run `bash scripts/verify.sh`, inspect the mechanical diff, and audit secrets, PII, exact action
   gates, runtime configuration, old/new route reachability, user-facing copy, and scope traceability
   before any authorized delivery.
4. Report one implementation terminal state: `ALL_GATES_GREEN`; `BUDGET_EXHAUSTED` only when an
   explicit budget exists; or `BLOCKED` only for an exact unavailable external input/authority after
   all independent fail-closed work is complete. Do not call the suite complete when only one route
   alias, one theme, one role/Space fixture, or the visual removal without read cleanup passes.

**Ordered prompt sequence.**

1. Re-verify the current Dashboard aliases, DOM, server reads, child/runtime reference graph,
   AppShell, owning routes/guards, Space Coverage call graph, legacy preference shapes, and sibling
   suite contracts.
2. Freeze fail-first exact body manifest, relocation/owner matrix, no-read call list, coverage
   producer-to-consumer matrix, legacy decode fixtures, actor/Space routes, and preservation snapshots.
3. Re-run the already-green S93/S94 integration gate against the exact joined assistant region,
   including its local unavailable state and one human-confirmed renewal-task flow. S95 consumes that
   region unchanged; it does not rebuild S93 or integrate S94 a second time.
4. Replace the shared Dashboard body atomically with Dashboard H1, S93 AI, and the compact My Work
   link; remove all panel-era gathers and prove both aliases are equivalent.
5. Remove/rehome Dashboard-only code after reference proof; preserve and retest shared owner modules.
6. Retire Space Coverage production/served behavior across attention, Notifications, preferences,
   legacy app-state, and assistant routing while preserving legacy decode/drop and Internal Process
   card state.
7. Exercise destination reachability, failed assistant, role/Space, stale preference, direct legacy
   query, keyboard/touch, narrow/zoom, terminology, and no-effect adversarial matrices.
8. Run canonical verification and gate/PII/diff/docs audits; deliver only the complete green cutover.

**Deletion/merge recommendation.**

Remove S95 from the active tree only after both aliases render the exact minimal body, every old block
and body read is absent, all authoritative destinations and AppShell functions pass preservation,
Space Coverage is absent from every user-facing producer/consumer while legacy preferences remain
safe, `computeSpaceCardState` is still proven on Internal Processes, and S84/S87 current manifests no
longer contradict the deployed surface. Merge the long-lived body manifest, relocation map, and
coverage deprecation invariants into current product/engineering documentation.
