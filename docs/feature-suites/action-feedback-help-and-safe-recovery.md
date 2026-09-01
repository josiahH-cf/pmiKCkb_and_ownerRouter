<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: long-term-ui-ux-v1 -->

# S86 — Self-descriptive actions, honest feedback, contextual help, and safe recovery

> Status: `ALL_GATES_GREEN` and deployed on 2026-09-01 through commit
> `72f926d96aead0b5b6826494713203672a18a40a` and exact revision
> `pmi-kc-app-rmtimspsj-ee9bbf50108f`. Shared interaction/contextual-help/transient-layer gates,
> complete S96 preservation, canonical verification, core E2E, real-browser theme/viewport/
> accessibility smoke, exact-SHA CI `33506372579`, normalized configuration, exact promotion, and
> repeated stable readback passed. No route, permission, action key, store/provider effect, role,
> credential, or client message was added.

**Goal.**

Make every interactive element understandable and visibly responsive across pointer, keyboard,
touch, and assistive technology, and prevent consequential mutations from occurring without an exact
target, informed confirmation, truthful completion state, and a usable recovery path.

**Current state / intended end state.**

The product has several strong local patterns—visible focus, Field descriptions/errors, Tabs,
Stepper, native Disclosure, live Ask/Work feedback, a tested in-app renewal dialog, and exact-preview
contracts for high-risk external effects—but no shared action, icon, contextual-help, progress,
alert, or dialog behavior. Global anchors remove their own signifier; most base actions have no
hover/active treatment; all shared disabled buttons use a wait cursor even when not busy; connection
and Admin actions often swap labels without a spinner or announcement; native `title`, browser
`confirm`/`prompt`, silent failures, and ad hoc empty/loading states remain.

The current Admin connector `Disconnect` defect is owned and closed first by S96. S86 does not define
a second lifecycle or defer that safety work behind visual primitives; after S96, its only connector
obligation is to preserve the exact preview, confirmation, pending, receipt, recovery, and disclosure
contract while applying shared presentation.

The intended product has one composable interaction layer. Navigation is visibly a link; mutations
are buttons; important and destructive actions have distinct non-color hierarchy; every activation
shows immediate pressed/busy/result feedback; determinate progress is used only when a real fraction
exists; supplementary help is available by focus, tap, and optional delayed hover; dialogs have
predictable focus/dismissal; and failures state what happened and what can safely be tried next.
Existing exact-confirm and action-gate contracts are preserved or strengthened, never replaced by a
generic visual confirmation.

**Actors and entry conditions.**

- Anonymous public/vendor users and managed staff receive the same input-modality and feedback
  semantics; actual actions remain filtered and guarded by existing role, Space, session, provider,
  environment, and action-key truth.
- A control must know whether it navigates, mutates local UI, mutates application state, or invokes an
  external effect before choosing its element, wording, busy behavior, and confirmation tier.
- S83 owns access requests and supported connection-check behavior. S86 supplies shared primitives
  and safety contracts without turning any closed capability, unsupported check, or denied action
  into a request or effect.
- S96 owns app-managed connector disconnect state, versioning, vault effects, receipts, setup
  compatibility, and recovery. S86 may render those states only through S96's public/Admin projection.
- Existing operations that already require an exact preview, phrase/object confirmation, receipt,
  readback, rollback, or human send retain that stronger workflow.

**What it is / how it functions.**

### One interaction primitive set

Extend the existing UI layer with one implementation and test contract for:

- `ActionButton`/existing `Button`: primary, secondary, tertiary, and destructive visual tones;
  default, hover, active, focus, disabled-unavailable, busy, success, and error states;
- `ActionLink`: native internal/external links with visible resting signifier, visited treatment where
  useful, external/new-tab disclosure, and the same hover/focus/active hierarchy;
- `Icon` and `IconButton`: S86-owned repository-local inline-SVG rendering with one `currentColor`,
  view-box/stroke-family, decorative-versus-labelled, sizing, and forced-colors contract. Owning
  feature manifests supply opaque glyph keys; S84 supplies only its exact nine navigation glyph keys
  and does not redefine generic icon rendering;
- `InfoTip`: supplementary contextual help with an explicit trigger and accessible popover/tooltip
  behavior;
- `BusyIndicator` and `Progress`: visible indeterminate spinner and determinate progress with reduced-
  motion alternatives;
- `Notice`/`Alert`: concise status, success, caution, and error messages with correct live-region
  urgency and recovery action;
- `ConfirmationDialog`: accessible in-app prevention/confirmation shell that permits a feature's
  exact preview and confirm contract rather than replacing it.

Do not add a second component framework or remote icon library. Existing component APIs may be
extended or wrapped, but one semantic implementation owns state styling, sizing, ARIA, and tests.
S85 supplies theme tokens; no primitive owns literal theme colors.

### Action and link hierarchy

- Use a native link only when activation changes location, downloads, or opens a validated external
  destination. Use a button for state changes and commands. A link styled as a button retains link
  semantics and names its destination; a button never fakes navigation.
- Each bounded task region has at most one visually primary action. Primary uses S85's contrast-
  validated provisional orange primary-action semantic role. Secondary actions use neutral/outlined
  treatment. Destructive uses the error/destructive role, never orange or green. Tertiary is visibly
  interactive text.
- Inline and reference links are underlined at rest. Full-row navigation/action links use a visible
  container plus trailing destination cue. Workflow/navigation destinations never use visited
  styling; visited styling is limited to static evidence/reference destinations where history helps.
  External/new-tab links add a visible external cue, include the destination in the accessible
  description, and use `rel="noopener noreferrer"`. Color alone is insufficient. Hover increases
  contrast/underline/surface in a way that predicts the action. Active/pressed feedback is immediate
  and visibly different from hover. Focus remains the strongest non-transient outline.
- Icon-only controls are allowed only for widely understood utilities when they have an accessible
  name and a visible InfoTip/label on focus or hover. Primary task actions retain visible text.
- Disabled-unavailable uses `not-allowed` or ordinary default cursor, a visible reason adjacent to or
  discoverable from a separate focusable info trigger, and no spinner. Only active pending work uses
  a busy indicator and wait/progress wording. A disabled control is never the only container for its
  own explanation.
- Interactive targets are at least 44 by 44 CSS pixels for coarse pointers; dense desktop tables may
  use a 40-pixel visual row only when the hit area remains 44 pixels and no overlap results.

### Contextual help contract

Essential action names, field labels, requirements, current status, blockers, validation, errors,
safety consequences, exact confirmation content, and recovery actions stay visible. InfoTip contains
only supplementary explanation that helps an unfamiliar user decide whether to use a control. It is
not a disposal mechanism for necessary content and does not replace S84's visible destination
subtext.

Every help instance has an explicit focusable information trigger adjacent to the labelled element.
Its accessible name is `About <element label>`. A one-sentence, noninteractive tooltip uses
`role="tooltip"`, is referenced by `aria-describedby`, contains no focusable content, and leaves focus
on the trigger. Interactive or multi-paragraph help is a controlled non-modal popover using
`aria-expanded`/`aria-controls`; it is not assigned `role="tooltip"`. Behavior is deterministic:

- focus, click, tap, Enter, or Space opens immediately;
- a fine pointer resting on the trigger opens it at 600 ms; visual hover feedback is immediate;
- leaving trigger and panel closes after 150 ms, but moving between them keeps it open;
- the panel is hoverable, selectable, and persistent while focus or pointer is inside;
- Escape closes it and returns focus to the trigger when focus was inside; outside click/tap closes;
- only one transient InfoTip is open at a time; route/breakpoint change clears it;
- coarse pointers never depend on hover, and `title` is not the sole delivery mechanism.

Use a non-modal tooltip for a short, noninteractive sentence. Use a non-modal popover or existing
Disclosure when the help has links, multiple paragraphs, controls, evidence detail, or mobile space
needs. Popover placement flips/clamps to the viewport and remains visible at 320 pixels and 200-
percent zoom. The requested two-to-three-second delay is treated as illustrative; 600 ms avoids
making routine help feel unresponsive while still preventing accidental fine-pointer activation.

### Async and progress contract

Every accepted activation changes its visible verb/state within 100 ms. At 400 ms, only if work is
still pending, add a text-labelled indeterminate indicator. If a precomputed sequence exposes an
authoritative `completed/total` value, determinate progress uses native `<progress>` or exact
`aria-valuemin="0"`, `aria-valuemax`, and `aria-valuenow` plus visible `<completed> of <total>` text;
it never advances on a timer or estimates provider progress. An indeterminate indicator has no
`aria-valuenow`. When no fraction exists, use an indeterminate spinner/status, not a percentage or
loading bar.

The initiating region receives `aria-busy="true"`; the initiating control remains disabled against
duplicate submission and changes its label to the active verb. One persistently mounted polite live
region announces start and completion so updates are not lost during mounting. Use `role="alert"`
only for an error that requires immediate attention. Focus does not jump on ordinary success/failure.
Completion must be one of:

- verified success, after the authoritative response/readback; green is allowed only here;
- actionable failure, with specific safe next step and Retry when the operation is repeatable;
- unavailable/permission denied, with an S83 access handoff only for allow-listed role/Space denial;
- ambiguous or reconciliation required, which never claims success and directs an authorized actor
  to the bounded recovery action.

Cancel an in-flight request only when the underlying operation is genuinely cancellable. Removing a
spinner or navigating away must not imply an already-dispatched provider/store mutation was
cancelled. Double click, Enter-repeat, refresh, Back/Forward, and response loss cannot produce a
second non-idempotent effect.

S83's connection-check contract is unchanged: only RentVine, Google Sheets, and RentCast get their
existing bounded Admin read-check; idle action is orange, pending is indeterminate with
`Checking <connector>…`, `aria-busy`, and a polite update; green appears only after verified success;
timeout/error permits explicit retry; Gmail and unsupported connectors never show a fabricated
check. A connection-record store read failure is a labelled degraded state, not an empty-map
`Not connected` inference.

### Consequence and confirmation tiers

The tier model applies to UI-triggered actions. This suite changes confirmation/recovery behavior
only for the audited actions in the table below. Every other persisted/provider action retains its
current owning-suite contract and presentation; the implementation runner records it as
`preservation-only` and may not infer a new confirmation or recovery flow.

| Tier | Effect                                                                                               | Required prevention and recovery                                                                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | local, reversible UI state                                                                           | Immediate feedback; no confirmation; undo/back where applicable.                                                                                                       |
| B    | persisted but bounded/reversible application state                                                   | Exact behavior is declared per action below; success is source-backed and any reversal is named only when it exists.                                                   |
| C    | credential destruction, authority change, client/provider effect, irreversible or ambiguous mutation | Exact current target and consequence, cancel-first accessible dialog, feature-specific exact confirmation, idempotency/readback, and explicit recovery/reconciliation. |

The exact v1 action inventory is:

| Action and source boundary                                                                                     | Tier                | Required v1 presentation / recovery                                                                                                                                                      | Owner and preservation                                                                                |
| -------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| App-managed connector Disconnect; `ConnectorSetupActions` and existing disconnect route                        | C preservation-only | Preserve S96's exact cancel-first confirmation, versioned lifecycle, durable receipt, recovery, and non-disclosure contract; S86 may change presentation only after S96 is green.        | S96 is sole behavior/effect owner; S86 supplies compatible primitives.                                |
| Template retirement; `SpaceDetailClient.softDeleteTemplateRecord` → `DELETE /api/templates/[id]`               | B                   | In-app dialog names template and Space, says it retires the template, starts on Cancel, then uses current DELETE/result. No Undo is shown because no exact restore control is evidenced. | S86 presentation; existing edit/delete capability, soft-delete behavior, and audit note remain.       |
| Individual high-risk approval; `ApprovalQueue.transitionSelectedItem`                                          | C                   | Replace native confirm with in-app dialog showing exact item, `High` risk, action, and entered reason; preserve current `confirm_high_risk` server field and result readback.            | Approval Queue remains business owner; S86 supplies presentation.                                     |
| Bulk high-risk approval; `ApprovalQueue.submitBulkAction`                                                      | C                   | Dialog shows exact selected count, high-risk count, action, and required reason before the current bounded bulk request. Partial-result truth remains visible.                           | Approval Queue remains business owner; S86 supplies presentation.                                     |
| Staff role change; `UserManagementPanel.saveRole`                                                              | C                   | Dialog always shows exact user email, current role, proposed role, and entered reason. Admin grant/removal consequence remains explicit. Existing claim mutation/readback stays intact.  | S83 owns access truth; S86 replaces native confirmation only.                                         |
| Staff Space-scope change; `UserManagementPanel.saveScopes`                                                     | C                   | Dialog shows exact user, current Spaces, proposed Spaces/All-spaces, and entered reason before the current exact mutation/readback.                                                      | S83 owns access truth; S86 supplies the same accessible confirmation shell.                           |
| Disable publication policy; `PublicationPolicyAdminPanel.disablePolicy`                                        | B                   | Replace native prompt with dialog containing a required reason field and exact policy name; preserve current disabled-state audit/readback.                                              | Publication policy remains current business owner; S86 supplies presentation.                         |
| Dismiss unverified maintenance intake; `UnverifiedIntakeReview.dismiss`                                        | B                   | Replace native prompt with dialog naming the intake and requiring a reason.                                                                                                              | Maintenance remains business owner; S86 supplies presentation; S87 owns read-only control visibility. |
| Promote unverified maintenance intake; `UnverifiedIntakeReview`                                                | B                   | Keep one explicit Promote activation with no second confirmation; show exact target, pending, Live-ticket result, and current no-provider-effect truth.                                  | Maintenance business behavior unchanged; S86 supplies feedback.                                       |
| Close or reopen maintenance ticket; `MaintenanceQueue.changeStatus/reopen`                                     | B                   | Replace native prompt with dialog naming ticket/current/next status and requiring a reason; preserve current PATCH/result.                                                               | Maintenance remains business owner; S86 supplies presentation.                                        |
| Notification Mark all read / mute family                                                                       | B                   | No confirmation. Prevent duplicates; announce pending/result; expose failed response and Retry/reconcile.                                                                                | S86 feedback; notification counts, polling, family model, and destinations remain.                    |
| Runtime suspension, renewal flag/source-write, publication rollback, and other existing exact-preview controls | C preservation-only | Do not migrate or restyle until their current exact target, confirmation, expiry, receipt, readback, and rollback tests are proven through a separate bounded change.                    | Their current suites/services remain sole business owners.                                            |

The inventory test scans the named components for UI-triggered persisted/external requests and
requires each match to map to exactly one row. A newly added action fails that focused inventory
until an owner explicitly classifies it. Requests outside these components are reported but remain
unchanged; they do not become S86 product decisions by heuristic.

Do not add confirmation to routine safe actions. Do not use native `window.confirm`/`prompt` for a
migrated Tier B/C action. The dialog is labelled, traps focus only while modal, starts on Cancel or a
safe non-destructive element, closes with Escape before dispatch, restores focus, prevents backdrop
activation from confirming, and remains open with errors. Once dispatch starts, Escape/backdrop
cannot pretend to cancel it. Existing stronger exact-preview and exact-confirm contracts retain their
exact wording, target snapshot, expiry/staleness, receipts, and rollback.

### Connector disconnect preservation boundary

S96 is the single canonical definition of app-managed connector disconnect. S86 consumes only its
bounded projection and may supply dialog layout, focus, busy, notice, and error presentation. It must
not import store/vault business logic, introduce another request or version field, replace S96's exact
phrase, change effect order, offer Undo, hide `revocation_pending`, or call success before S96 receipt
readback. Focused integration tests must fail if a presentation migration restores first-click POST,
exposes Admin-only operation data, permits blind retry, or targets a replacement generation.

### Shell popovers and mutation feedback

S86 solely owns the cross-component transient-layer coordinator. Root topbar families—S84 navbar,
Appearance, and NotificationMenu—are mutually exclusive. Peer InfoTips are mutually exclusive, but
an InfoTip inside an owning popover does not close and unmount that ancestor; closing an ancestor
closes its descendant InfoTips. Native document `<details>` disclosures are not transient layers.
Opening a dialog dismisses non-modal layers first; dialogs are a separate modal layer. S84 owns only
within-navbar disclosure behavior and registers its open layer with this coordinator. NotificationMenu gains
outside-click and Escape dismissal, deliberate focus entry/return, accurate busy state for refresh/
mark-all/mute, polite completion, and visible mutation failure with retry. Preserve its uncapped
unread count, 60-second/focus/visibility refresh, permission-filtered destinations, preferences, and
page-title behavior. S84 alone owns the visible `Console` → `Dashboard` occurrence inventory; S86
preserves the resulting terminology after that dependency.

Best-effort single-item read may remain nonblocking, but failure must reconcile on refresh and must
not visually claim the item is read. Mark-all and mute failures cannot be swallowed. Notifications
remain internal; this suite creates no external notification, approval SLA, or background send.

### Standard page states

S86 owns reusable Notice/Alert/Loading/Empty/Error and route-boundary primitives plus their
interaction, focus, live-region, responsive, and assistive-technology semantics. S87 is the sole owner
of which states apply to each surface, the truth classification and visible copy, and the authorized
recovery destination. S86 supplies no guessed source/permission/empty-state wording.

Provide bounded route-level loading and not-found/error primitives for S87 to populate. Loading is
noncommittal about success. Not-found/error primitives can preserve authorization ambiguity and
accept an owning surface's safe parent/retry action without inferring one.

**In scope / out of scope.**

In scope: shared button/link/icon/help/busy/progress/notice/dialog behavior; hover/focus/active/
disabled/busy semantics; responsive help; truthful async feedback; connection-check primitive
support; S96 connector-safety preservation; migration from native confirms/titles;
NotificationMenu interaction/failure recovery; reusable route/page state primitives and tests.

Out of scope: adding a new component framework, remote icons, invented provider progress, optimistic
success for external effects, access-request behavior owned by S83, navigation IA owned by S84,
content deletion owned by S87, new provider/role/action keys, general inbox or outbound messaging,
credential backup/echo, automatic retry of client effects, or weakening feature-specific exact
confirmation and rollback contracts.

**Open questions & assumptions.**

- Decision: supplementary help opens immediately for focus/tap/click and after 600 ms of fine-pointer
  hover. Essential meaning remains visible. This supersedes a blanket hover-only reading of the note
  but not the desired reduction in explanatory prose.
- Decision: unmeasurable provider work uses an indeterminate indicator. A progress bar appears only
  when the backend supplies a real completed/total value.
- Decision: S96 is the sole UX-005 behavior owner and must be green before S86 begins. S86 preserves
  its public/Admin projection and effect-safety evidence without redefining store/vault state.

**Cross-product impacts.**

Shared UI primitives and global interaction styles; AppShell transient layers; S96 connection-state
presentation and S83 UI; NotificationMenu and Notifications terminology; Admin,
Approval, Maintenance, process/template, publication, renewal and feedback dialogs; route loading/
not-found boundaries; accessibility and effect-safety tests. No expansion of provider/action scope.

**Authority and evidence map.**

| Input                                                                                                                                                                                   | Classification                   | Use and limitation                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router, code/tests, `docs/facts.md`, action registry                                                                                                                                    | Authority / implementation truth | Preserve current roles, effects, exact-confirm gates, communication limits, and secret/PII boundaries.                                                      |
| Existing Field/Tabs/Disclosure/Work/Ask/dialog implementations                                                                                                                          | Verified implementation evidence | Supply useful local semantics; do not imply app-wide consistency.                                                                                           |
| S96 and its delivered preservation tests                                                                                                                                                | Required prerequisite            | Solely own disconnect lifecycle/effects; S86 may consume presentation state but must not weaken or duplicate the contract.                                  |
| S83 and S84                                                                                                                                                                             | Active dependent contracts       | Own connection read-check/access behavior and within-navbar disclosure; S86 owns only shared presentation and cross-family transient layers.                |
| [WAI-ARIA tooltip guidance](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/) and [WCAG 2.2 status-message guidance](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) | External guidance evidence       | APG labels the tooltip pattern work in progress; these sources support focus/hover/Escape/live feedback but do not authorize effects or hover-only meaning. |
| 2026-08-31 long-term UI/UX note and `docs/evidence/ui-ux-audit-2026-08-31.html`                                                                                                         | Intent/audit evidence            | Require self-evident interaction and responsive feedback; reviewer decisions remain non-authorizing.                                                        |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S86-1** — One semantic interaction primitive set owns actions, links, icons, contextual
  help, busy/progress, notices, and dialogs; static/component tests fail on divergent state or ARIA
  contracts.
- **ARCH-S86-2** — One async state model owns idle/pending/verified-failure/verified-success/
  unavailable/ambiguous behavior and accepts determinate progress only with a real fraction.
- **ARCH-S86-3** — One exact v1 effect inventory maps each named in-scope UI action to Tier A/B/C,
  owning behavior, confirmation rule, result/recovery, and preservation contract; focused scans reject
  a new action in those components while all out-of-scope effects remain unchanged.
- **ARCH-S86-4** — One explicit S96 compatibility boundary consumes only its bounded disconnect
  projection and keeps lifecycle/store/vault ownership outside S86; integration tests reject a
  second request shape, first-click effect, hidden pending state, altered phrase, or false success.
- **ARCH-S86-5** — One transient-layer coordinator composes S84 navigation, Appearance,
  NotificationMenu, and InfoTip without competing open/focus state.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S86-1** — Pointer, keyboard, touch, and screen-reader users can identify, focus, activate,
  understand, and recover from every migrated interaction without relying on color or hover.
- **BEH-S86-2** — Every accepted async action shows immediate busy feedback, announces a truthful
  result, prevents duplicate dispatch, and offers retry/reconciliation without fabricated progress.
- **BEH-S86-3** — Supplementary help is discoverable and dismissible across modalities, while
  essential labels/state/errors/safety remain visible.
- **BEH-S86-4** — Applying shared dialog, notice, or busy presentation leaves every S96 observable
  prevention, role, pending-recovery, receipt, replay, and non-disclosure behavior unchanged.
- **BEH-S86-5** — Notification and shell popovers close/focus predictably and display failed
  mutations without changing current counts, routes, polling, permissions, or external effects.

**Human litmus outcome.**

### Know what happened after every action

**If this was built correctly:** A user can tell what is clickable before acting, sees an immediate
busy label after activation, and then sees either verified success or a specific problem and safe
retry. A permission-disabled action explains why without masquerading as loading.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Get help without needing a mouse

**If this was built correctly:** A new user focuses or taps the information control beside an
unfamiliar action and gets a short explanation immediately. The same help can preview after a brief
hover, stays open while being read, closes with Escape, and never contains the only error, label, or
safety warning.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Preserve safe connector disconnection

**If this was built correctly:** After shared visual treatment is applied, the S96 flow still opens
without an effect, starts on Cancel, requires the exact connector phrase, exposes pending recovery
only to an Admin, and reports success only from the same operation's verified redacted receipt.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                           | Architecture outcome       | Behavior outcome | Human litmus                            | Deterministic evidence / falsification                                                                       |
| ------------------------------------- | -------------------------- | ---------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Action/link/state hierarchy           | `ARCH-S86-1`               | `BEH-S86-1/2`    | Know what happened                      | Primitive matrix covers element semantics and all pointer/keyboard/touch/ARIA visual states.                 |
| Accessible contextual help            | `ARCH-S86-1`, `ARCH-S86-5` | `BEH-S86-1/3`    | Get help                                | Fake-timer, focus, pointer, touch, Escape, viewport, and essential-copy exclusion tests.                     |
| Honest async/progress feedback        | `ARCH-S86-2`               | `BEH-S86-2`      | Know what happened                      | Delayed/failure/timeout/ambiguous/double-dispatch fixtures and provider/store spies.                         |
| Consequence-tier inventory            | `ARCH-S86-3`               | `BEH-S86-1/4`    | Know what happened; preserve disconnect | Static inventory rejects unclassified persisted actions and weakened exact-confirm flows.                    |
| S96 connector safety preservation     | `ARCH-S86-4`               | `BEH-S86-4`      | Preserve safe disconnection             | S96 integration sentinels reject first-click POST, altered projection/state, blind retry, or false success.  |
| Stable shell/notification interaction | `ARCH-S86-5`               | `BEH-S86-5`      | Know what happened                      | Popover mutual exclusion, focus, failure, polling/count/destination preservation tests.                      |
| Standard state primitives             | `ARCH-S86-1/2`             | `BEH-S86-1/2`    | Know what happened                      | Primitive tests cover loading/empty/error/not-found semantics; S87 supplies per-surface truth/copy/recovery. |

**Preservation set.**

Keep route and control authorization; S83 request/check behavior; S84 navigation timing/semantics;
S85 themes; existing notification count/polling/title/destinations; Field/Tabs/Stepper/Disclosure;
Report Issue/renewal dialog behavior; runtime suspension/publication/writeback exact previews;
Admin-only connector setup and catalog allowlist; server-held opaque secrets; action registry and
permanent send prohibitions; human-created unsent drafts; no sample/live leakage. Preservation is a
separate gate from new interaction results.

**Adversarial acceptance checks.**

- **AC-S86-1** — The primitive matrix rejects a navigation button, mutation anchor, color-only state,
  hidden primary label, missing accessible icon name, under-sized coarse target, or disabled control
  carrying its only reason in `title`.
- **AC-S86-2** — InfoTip opens immediately on focus/tap, not at 599 ms and at 600 ms on supported
  hover, remains across trigger/panel travel, closes/returns focus with Escape, clamps at 320px/200%
  zoom, and never appears as the only source of essential meaning.
- **AC-S86-3** — Busy fixtures show feedback within 100 ms, indeterminate state after the applicable
  delay, no timer-made percentages, no green before readback, no duplicate dispatch, and a labelled
  response-loss/timeout recovery.
- **AC-S86-4** — S96 integration sentinels prove opening/cancelling remains effect-free, the exact
  projection and phrase remain unaltered, pending/revoked states retain their recovery/receipt, and a
  non-Admin receives no operation data after S86 presentation migration.
- **AC-S86-5** — Store/vault/action spies prove S86 has no second connector lifecycle or destroy call;
  every generation, replay, legacy, partial-failure, response-loss, receipt, and secret-disclosure
  check remains owned by and green under S96.
- **AC-S86-6** — Every existing Tier C exact-preview/confirm test remains green and source/provider/
  action spies prove shared dialog/help/hover operations cause no effect by themselves.
- **AC-S86-7** — NotificationMenu passes Escape/outside/focus-return/mutual-exclusion, refresh/mute/
  mark-all busy and failed-response tests while preserving uncapped count and permitted links.
- **AC-S86-8** — Reusable loading/not-found/error primitives preserve authorization ambiguity,
  accept only an owner-supplied parent/retry, and pass responsive, focus, reduced-motion, and both S85
  theme checks. S87 separately proves exact per-surface state/copy destinations.

**Forbidden actions / hard gates.**

No new action key, provider endpoint, role, capability, notification channel, autonomous retry/send,
or client-facing send; no credential read/echo/backup/log; no success before readback; no fake
progress; no hover-only essential content; no generic confirmation replacing an exact contract; no
effect from opening a tooltip/dialog/menu; no protected auth/action-gate/budget edit without explicit
owner direction; no change to S96's disconnect request, store, vault, receipt, setup, or recovery
contract and no live disconnect until its separately named operational proof is authorized.

**Dependencies / sequencing.**

S96 closes UX-005 first. S85 then supplies themes/tokens. Behavior-only fail-first work may start
earlier, but S86 cannot
reach `ALL_GATES_GREEN` or migrate a product surface until its states pass both S85 themes. Implement the shared interaction primitives and effect inventory,
while preserving the already-green S96 contract. S83 consumes the feedback primitives but
retains connection-check/access ownership. S84 owns within-navbar state and registers it with S86's
transient-layer coordinator. S87 then migrates copy/states surface by surface. A live vault is not required to
build S86; S96 owns the independently blocked live-vault proof.

**Standalone delivery contract.**

- **Deliverable now:** shared interaction primitives, help/async/dialog tests, exact v1 consequence
  inventory, S96 preservation sentinels, NotificationMenu stabilization, and reusable route-state
  foundations can reach `ALL_GATES_GREEN` without a live provider effect.
- **Consumes, but does not assume during fail-first development:** S85 theme roles, S83 access/check
  routes, and S84 within-navbar disclosures. Missing business destinations remain fail-closed, but
  suite-wide `ALL_GATES_GREEN` requires S85 Light/Dark checks; S86 does not ship on a light-only shim.
- **Externally blocked effect:** none owned by S86. S96 separately carries the live credential-
  destruction proof; S86 cannot weaken or claim it.
- **Produces for downstream suites:** action semantics, interaction state model, InfoTip, progress,
  dialog, transient-layer coordinator, effect tiers, and safe recovery evidence.

**Verification and delivery contract.**

1. Freeze existing interaction, authorization, exact-confirm, notification, and S96 preservation
   baselines. Materialize fail-first primitive/state/help tests and the exact v1 action inventory
   before implementation edits.
2. Verify the delivered S96 gate, then implement primitives without migrating product surfaces. Keep
   its connector component/route/store/vault/receipt tests as a separate preservation gate.
3. Migrate native titles/confirms, notifications, and route states in bounded cohorts. For each,
   exercise pointer, keyboard, touch, screen reader semantics, 320px/200% zoom, both themes, delayed,
   error, unavailable, ambiguous, and recovery states.
4. Run focused tests and `bash scripts/verify.sh`; inspect effect order and mechanical diff; audit
   secrets/PII, exact gates, runtime, provider calls, and preservation before authorized delivery.
5. Report one implementation terminal state: `ALL_GATES_GREEN`; `BUDGET_EXHAUSTED` only if a future
   user supplies an explicit budget; or `BLOCKED` only for one exact unavailable input/authority after
   every independent fail-closed path is complete. S96's live-vault proof remains a separate check.

**Ordered prompt sequence.**

1. Re-verify S96 closure, primitives, async patterns, the exact v1 action inventory, and popovers.
2. Add fail-first primitive, help, progress, consequence-tier, S96-preservation, notification, and
   preservation checks.
3. Build shared interaction primitives and transient-layer coordinator.
4. Migrate remaining interaction cohorts and route states, falsify, run canonical verification, and
   update current docs.

**Deletion/merge recommendation.**

Remove S86 when every persisted/external action has a tested tier, S96 preservation remains green,
all audited surfaces consume the shared interaction/state contracts, obsolete native-title/confirm
patterns are gone where covered, and code/tests/current facts fully own the behavior.
