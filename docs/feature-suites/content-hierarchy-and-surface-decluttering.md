<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: long-term-ui-ux-v1 -->

# S87 — Product-wide content hierarchy and surface decluttering

> Status: Specified and not implemented. The 2026-08-31 source audit inventories 29 current
> experiences across 36 routes; the target manifest includes the deployed S83 `/admin/access`
> experience as SF-30. S82-S86 and S96 are deployed owners; S82 owns renewal desk/workspace behavior;
> S83 owns access requests,
> grants, and supported connector read-check behavior; S84 owns navbar destinations, terminology,
> and within-navbar disclosure behavior; S96 owns connector disconnect/reconciliation and S86 owns
> generic interaction feedback plus connection-store degradation presentation. S88-S95 own the later Dashboard assistant,
> its data/action boundaries, and its two-region cutover. S87 owns all remaining content hierarchy
> and placement and delegates SF-06 to that newer bundle.

**Goal.**

Make every product surface lead with the current task, state, and next safe action, removing repeated
explanation and internal implementation detail while keeping the labels, source truth, safety,
errors, and recovery information a person needs to complete the task without training.

**Current state / intended end state.**

The application exposes substantial source-backed capability, but presentation was assembled by
feature and has accumulated persistent explanations, repeated boundaries, duplicate entry points,
internal policy language, and dense Admin/renewal panels. The audit found 319 paragraph/description/
subtitle-like source occurrences across app/components; that count shows density but is not evidence
that every node should be removed. Admin currently combines more than 19 panels; Connections repeats
authority and setup explanations; Communications repeats its workflow-only boundary; Dashboard
repeats its Ask example; Maintenance and My Work repeat operational boundaries; renewal surfaces
still expose dense phase/evidence/action detail and require S91's shared-projection conformance;
Vendor pages repeat a Gmail boundary and
offer no visible sign-out. Empty and unavailable states vary, and some collections can render a blank
region.

The intended experience has exactly one primary outcome per surface. A surface may contain several
bounded task regions, but each region has at most one visually primary action in any rendered state;
a read-only, empty, blocked, or completed region may have none. Persistent copy is limited to task
labels, current facts/state, first-use input guidance that prevents an error, material authority/
safety boundaries at the point of action, and specific error/recovery text. Supplementary rationale,
diagnostics, provenance detail, history, and provider mechanics move into an accessible Disclosure or
S86 InfoTip. Duplicate and internal-only prose is removed. Existing capability stays reachable;
removing words never removes an action, audit trail, source fact, permission boundary, or recovery
path. Every applicable empty/loading/error/permission state names a safe next step.

**Actors and entry conditions.**

- Anonymous staff sign-in and vendor setup/sign-in visitors need the smallest safe path to
  authentication and recovery.
- Managed Editor, Approver, and Admin users see the same plain-language task hierarchy, filtered by
  current role/Space truth. Hidden navigation or progressive disclosure never replaces authorization.
- Vendors see only assigned-ticket truth and their own session controls; missing/removed tickets
  retain current non-disclosure behavior.
- First-time and occasional users must understand a surface from its visible title, controls, state,
  and next action. Experienced users must not traverse introductions before acting.
- Deployed S85 theme and S86 interaction primitives are mandatory for every migration cohort; a
  cohort fails rather than creating a second temporary presentation pattern.

**What it is / how it functions.**

### Visible-copy decision contract

Before editing a surface, freeze representative populated, first-use/empty, loading, error,
permission-disabled, and destructive states. Inventory every always-visible explanatory block and
assign exactly one evidence-backed disposition:

| Action class    | Use when                                                                                               | Result                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `Preserve`      | Removing it would hide a label, current fact/state, input expectation, safety consequence, or recovery | Keep at the point where the user decides or acts; slim only without losing the required meaning. |
| `Slim / remove` | It repeats another visible element, narrates the interface, or exposes internal implementation detail  | Delete the duplicate/internal text; do not replace it with a tooltip.                            |
| `Hide`          | It is legitimate secondary evidence, rationale, diagnostics, provider mechanics, or history            | Move to S86 InfoTip for one short sentence or Disclosure for structured/interactive detail.      |
| `Merge`         | Multiple blocks express one boundary/state or send the user to the same action                         | Keep one concise block at the decision point; remove the rest.                                   |
| `Rename`        | A label conflicts with current product terminology or describes implementation rather than user intent | Use the approved visible name; keep compatible routes/data terms internal.                       |
| `Reorganize`    | Useful actions/facts are in the wrong default region or order                                          | Put task/current state/next action first; move secondary sections without changing authority.    |
| `Add`           | A source-evidenced missing state/control prevents the surface outcome                                  | Add only through the named owning suite, with acceptance evidence and a review condition.        |

Every audit finding, recommendation, and persistent-block row uses exactly one of these seven action
classes. Usage frequency is unknown; do not remove a capability or hide a primary action by claiming
it is rarely used.

The default visible hierarchy is:

1. page identity and, only when needed, one concise current-scope/environment/source state;
2. the surface's one primary outcome, expressed through its leading task region;
3. primary task inputs and, within each bounded task region, at most one visually primary action;
4. blockers, validation, pending/result, and the next safe action;
5. compact facts needed to compare or decide;
6. secondary actions;
7. closed supplementary evidence, diagnostics, history, and policy rationale.

A _bounded task region_ is one labelled form, card, table action cell, disclosure panel, or modal with
one local state/result lifecycle. A _visually primary action_ is any control rendered with the S85/S86
primary-action emphasis, regardless of its HTML element. Semantic importance does not require primary
styling: destructive, cancel, back, disclosure, and secondary workflow controls retain their own
tones. The implementation manifest gives every surface one `primaryOutcomeId`; every task region one
stable `taskRegionId` in the form `REG-SF-##-{purpose}` (a semantic purpose token, never a render
index); and zero or one existing control ID as `primaryActionId` for each reachable region state. DOM
tests fail if a surface has zero or multiple primary outcomes, if a region renders more than one
primary-emphasis control, or if a blocked/read-only state promotes an unavailable action.

The following content remains visible and is excluded from any prose-reduction count:

- page/section/action/field/table labels, required indicators, input formats, and current values;
- source identity/freshness when it changes whether data can be trusted or an action can run;
- current status, causal blocker, permission state, counts, selected filters, and next safe action;
- validation and error text naming the problem and recovery;
- material consequence, exact-confirmation content, unsent-draft truth, irreversible-effect warning,
  receipt/readback, and rollback/reconciliation state;
- empty-state explanation and reachable recovery; and
- screen-reader-only names, descriptions, announcements, and structural context.

Internal step-engine terms, version/source footers that do not change a user decision, repeated
governance disclaimers, training-style `Next:` paragraphs, descriptions that merely restate a label,
and duplicate introductions are not retained. Do not hide required meaning in hover, placeholder
text, `title`, color, or an icon.

### Surface outcome matrix

The matrix is the minimum migration contract. `Primary outcome` contains exactly one outcome for
each surface. `Default visible surface` describes what remains visible; `Progressive/remove`
determines the rest. Current route aliases, guards, and backend behavior remain unchanged unless an
owning suite says otherwise. The stable `primaryOutcomeId` is exactly `OUT-SF-##`, using the row's
two-digit surface suffix; no second outcome ID may exist for that surface.

The V1 persistent-block manifest below is the sole edit authority. A matrix phrase such as `remove`,
`hide`, `merge`, or `close` is executable in this suite only when the exact surface/block pair appears
in CB-01 through CB-16 or S95's named Dashboard ledger. This is not permission to infer a selector or
rewrite a similar paragraph. The actionable map is: SF-04/05→CB-12/16, SF-06→CB-01 plus S95,
SF-08→CB-10, SF-09→CB-11, SF-13→CB-06, SF-14→CB-02/03, SF-15→CB-04,
SF-16→CB-05, SF-18→CB-15, SF-19→CB-07/09, SF-20→CB-09, SF-23→CB-08,
SF-25→CB-13, and SF-26/27→CB-14. Every other matrix disposition is `PRESERVE-V1` for V1,
including SF-28 and S83-delivered SF-30, until a later authorized CB row names exact current evidence,
replacement, placement, owner, and parity check.

| Surface ID | Experience and routes                                             | Primary outcome (exactly one)                                                  | Default visible surface after migration                                                      | Progressive disclosure or removal                                                                                      | Owner/dependency                              |
| ---------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| SF-01      | Staff sign-in `/sign-in`                                          | Reach Dashboard with a managed staff session.                                  | Product identity, environment when nonordinary, sign-in action, pending/error/retry.         | Remove repeated authentication narration; keep domain/account restriction at the refusal point.                        | S85/S86/S87                                   |
| SF-02      | Vendor setup `/vendor/setup`                                      | Reach secure enrollment from one validated setup link.                         | Setup state, one next action, invalid/expired recovery.                                      | Hide protocol mechanics; never expose fragment token or secret detail.                                                 | S85/S86/S87                                   |
| SF-03      | Vendor sign-in `/vendor/sign-in`                                  | Reach assigned tickets with a verified Vendor session.                         | Credentials/TOTP fields, one sign-in action, challenge/enrollment/error/retry.               | Remove repeated security narration; retain requirements beside affected inputs.                                        | S85/S86/S87                                   |
| SF-04      | Vendor ticket list `/vendor`                                      | Open one exactly assigned maintenance ticket.                                  | Signed-in identity, `Sign out`, assigned tickets or the exact empty state.                   | Remove the standalone Vendor Gmail explainer; show a communication boundary only at a future permitted action.         | S86/S87                                       |
| SF-05      | Vendor ticket detail `/vendor/tickets/[ticketId]`                 | Understand one assigned ticket and return safely to the assigned list.         | Back link, ticket state/facts, permitted actions, and `Sign out`.                            | Remove the repeated Gmail boundary panel; keep future communication constraints at their owning action.                | S86/S87                                       |
| SF-06      | Dashboard `/`, `/ask`                                             | Understand current authorized work and reach the exact place to act.           | S93 AI conversation/result/action region plus S95's compact clickable My Work handoff.       | S95 removes the old deck, anticipation, process, live-data, purpose, and picker regions only after destination parity. | S84/S86; S88-S95, including S94 action states |
| SF-07      | Internal Processes directory `/spaces`                            | Enter one authorized operating area.                                           | Reachable Space cards and a truthful empty/unavailable state.                                | Remove directory narration; unavailable definitions keep one recovery; no blank grid.                                  | S83 access handoff; S84 rename                |
| SF-08      | Internal Process detail `/spaces/[spaceId]`                       | Enter the next available task for one authorized Space.                        | Space identity, current process/page/run state, and one next task in each region.            | Put communication reference and immutable definition/version evidence in `Process details`.                            | S84/S87                                       |
| SF-09      | Published operational page `/spaces/[spaceId]/pages/[slug]`       | Read one trusted published operational page.                                   | Published content and trust-relevant source/update state.                                    | Move non-secret version/source identifiers to `Page details`.                                                          | S87                                           |
| SF-10      | Processes list `/processes`                                       | Enter one process definition or recent run.                                    | Definitions/runs, create when authorized, and explicit empty/unavailable recovery.           | Remove duplicate list purpose; move configuration/history behind disclosure.                                           | S87                                           |
| SF-11      | Process detail `/processes/[definitionId]`                        | Prepare one scoped process definition for its next authorized use.             | Definition, current validation/state, and authorized edit/publish/retire/start regions.      | Keep secondary configuration/history progressive; consequential effects consume S86.                                   | S86/S87                                       |
| SF-12      | Workflow run `/workflow-runs/[runId]`                             | Review or advance one exact workflow run.                                      | Current step/outcome and next permitted transition.                                          | Keep timeline/evidence/history closed by default; errors and closed state stay visible.                                | S86/S87                                       |
| SF-13      | My Work `/work`                                                   | Identify and update the next owned task or active session.                     | Owned work, current session/time state, correction, and phase-appropriate controls.          | Merge repeated record caveats at their affected controls; keep notices/history progressive.                            | S86/S87                                       |
| SF-14      | Connections `/connections`                                        | Identify one connector's current readiness and take its authorized next step.  | Connector name, source-backed status/freshness, and one next action per card.                | Keep provider powers/setup/action-key mechanics and diagnostics in `Connection details`; S83 owns checks.              | S83/S85/S86/S87                               |
| SF-15      | Communications `/gmail-hub`                                       | Open or refresh one workflow-linked communication context requiring attention. | Connection/degraded state, workflow-linked attention, and permitted controls.                | Merge repeated boundary text at the first communication action; close Admin recovery detail.                           | S86/S87                                       |
| SF-16      | Maintenance `/maintenance`                                        | Record or advance one maintenance item.                                        | Intake/tickets/blockers and one phase-appropriate action in each task region.                | Remove route narration; move provider matrix to `Provider readiness`; keep effect truth at dispatch.                   | S86/S87                                       |
| SF-17      | Approval Queue `/approval-queue`                                  | Decide or route one eligible queue item.                                       | Pending decisions, filters, causal state, exact action, and safety consequence.              | Close metrics/policy rationale/evidence/history; preserve S83 Access lane and role filters.                            | S83/S86/S87                                   |
| SF-18      | Notifications `/notifications`                                    | Open the owning surface for one attention signal.                              | Actionable lanes, truthful all-clear/empty/error, and preference controls.                   | Keep S84's `Dashboard` terminology; make secondary recent activity/setup detail progressive.                           | S84/S86/S87                                   |
| SF-19      | Admin hub `/admin`                                                | Enter one exact Admin task or task domain.                                     | Task index followed by current attention and compact task links.                             | Use the exact existing-route/anchor mapping below; keep diagnostics closed unless attention-expanded.                  | S81/S83/S84/S87                               |
| SF-20      | Admin People `/admin/users`                                       | Align one managed user's role and Space truth.                                 | People roster, per-user truth, exact controls, and pending/success/error.                    | Keep one S83 access handoff; remove duplicated role training copy.                                                     | S83/S86/S87                                   |
| SF-21      | Team Work `/admin/team-work`                                      | Create, assign, or review one team work item.                                  | Assignment/accountability work and empty/error/retry.                                        | Remove duplicate Admin/task purpose; keep history/details progressive.                                                 | S86/S87                                       |
| SF-22      | Vendor Admin `/admin/vendors`                                     | Prepare, execute, or reconcile one exact Vendor lifecycle action.              | Current phase, exact target, consequence, and safe action/result.                            | Close policy/mechanics/evidence detail; production/live refusal remains visible.                                       | S86/S87                                       |
| SF-23      | Migration `/admin/migration`                                      | Determine the current migration-readiness verdict and its cause.               | Preflight verdict, blockers/warnings, and safe next action.                                  | Put owner, registry, and implementation mechanics in labelled section disclosures.                                     | S86/S87                                       |
| SF-24      | Space request `/admin/spaces/request`                             | Save or operate one exact Space request plan.                                  | Saved request/plan and exact authorized action/refusal.                                      | Close provisioning mechanics/history; current runtime closure remains visible.                                         | S86/S87                                       |
| SF-25      | Gmail governance `/admin/gmail-inbox-zero`                        | Understand workflow-Gmail readiness and reach its owning workspace.            | Connection/governance state and the available Admin navigation action.                       | Merge repetitive scope copy; put artifacts/evaluator mechanics in labelled disclosures.                                | S86/S87                                       |
| SF-26      | Renewal desk `/lease-renewal/live/desk`                           | Find the next eligible renewal lease.                                          | S82 table, filters, blockers, and current actions.                                           | Renewal Authority and process/retention prose change only under S82/S83.                                               | S82/S83/S85/S86                               |
| SF-27      | Renewal workspace `/lease-renewal/live/desk/lease/[leaseId]`      | Complete the next safe renewal step for one lease.                             | S82 phase rail, selected/current action, and source/blocker/safety/error truth.              | Backend substeps/evidence stay progressive; authority is absent only after S83.                                        | S82/S83/S85/S86                               |
| SF-28      | Renewal reconciliation `/lease-renewal/live`                      | Resolve or defer one discrepancy within the actor's exact authority.           | Preserve the current exact discrepancy/action presentation for V1.                           | `PRESERVE-V1`; no exact S87 block owner is authorized.                                                                 | Current renewal owner                         |
| SF-29      | Property decision history `/lease-renewal/property/[propertyKey]` | Understand the current projection and prior decisions for one property.        | Current projection, decision timeline, and safe return.                                      | Close internal source/version detail; history remains the primary read-only content.                                   | S82/S87                                       |
| SF-30      | My access `/admin/access`                                         | Understand current effective access and request one missing capability.        | S83 effective access, capability catalog, own request history, current action, and recovery. | `PRESERVE-V1`; S87 adds no alternate access copy, state, action, or authority after S83 delivery.                      | S83/S84/S86                                   |

The six renewal compatibility aliases remain redirects with their current authorization and query
sanitization. They do not render duplicate page content and therefore are verified as navigation
paths rather than additional experiences. The table records present behavior; S82 alone owns the
explicit AL-03 lease-id-preserving upgrade described after it.

| Alias ID | Current route                                           | Current canonical destination         |
| -------- | ------------------------------------------------------- | ------------------------------------- |
| AL-01    | `/lease-renewal`                                        | `/lease-renewal/live/desk`            |
| AL-02    | `/lease-renewal/live/notices`                           | `/lease-renewal/live/desk`            |
| AL-03    | `/lease-renewal/lease/[leaseId]`                        | `/lease-renewal/live/desk`            |
| AL-04    | `/lease-renewal/runs`                                   | `/lease-renewal/live`                 |
| AL-05    | `/lease-renewal/runs/[runId]`                           | `/lease-renewal/live`                 |
| AL-06    | `/lease-renewal/runs/[runId]/reconciliation/[fieldKey]` | `/lease-renewal/live?flag=[fieldKey]` |

S82 intentionally changes AL-03 to the exact guarded workspace
`/lease-renewal/live/desk/lease/[leaseId]` while preserving validated desk/step state and existing
authorization ambiguity. Until S82's compatibility tests pass, S87 treats the current id-dropping
redirect as baseline truth and does not call the desired target current behavior.

### Deterministic per-surface state, truth, copy, and recovery map

S86 owns reusable state behavior and primitives; this table owns which content-changing state applies
to each S87 surface, the truth that may select it, its visible wording, and its allowed recovery. The
state codes below have fixed predicates and copy. A state cannot be selected from a missing value,
timeout, or caught exception unless its predicate says so.

| Code | Truth predicate                                                                                                     | Canonical visible copy                                                                                                            | Recovery contract                                                                                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `L`  | A named read or action is actually in flight.                                                                       | `Loading {surfaceLabel}…` or `{actionLabel}…`; never a percentage without exact completed/total truth.                            | No recovery while pending. The owning surface resolves to populated/success or any state its row permits—`E`, `F`, `U`, `P`, `X`, `N`, or `A`—and S86 presents that outcome; navigation cannot imply cancellation. |
| `E`  | An authoritative read succeeded, no result-changing filter is active, and the exact collection count is zero.       | The row's exact `emptyCopy`; never infer empty from a failed read.                                                                | Only the row's named actor-authorized action; otherwise no action.                                                                                                                                                 |
| `F`  | An authoritative read succeeded, at least one result-changing filter is active, and the filtered count is zero.     | `No {itemLabel} match these filters.`                                                                                             | `Clear filters`, preserving the unfiltered source result.                                                                                                                                                          |
| `U`  | The named source/read explicitly returned unavailable, degraded, expired, or failed.                                | `{sourceLabel} is unavailable.` Last-known data appears only when the current owner already supports it and labels its timestamp. | The row's safe `Retry`/reload or parent destination; never display zero/disconnected.                                                                                                                              |
| `P`  | The surface is visible, but the current direct capability/Space contract denies the named action or data.           | `You do not have access to {capabilityLabel}.`                                                                                    | `Review access` only when S83 allow-lists that role/Space request; otherwise the named parent destination or no action.                                                                                            |
| `X`  | A named operation was accepted locally and returned a definite failure before verified success.                     | `{actionLabel} could not be completed.` The owner appends its specific cause when safe.                                           | Preserve input/local state; show `Retry` only when the owning contract proves repetition safe.                                                                                                                     |
| `N`  | An authorized exact lookup returned missing/unavailable without permission to disclose whether the resource exists. | `This {resourceLabel} is unavailable.`                                                                                            | `Back to {parentLabel}` using the table's exact safe parent.                                                                                                                                                       |
| `A`  | A consequential request left the browser but exact completion/readback is unresolved.                               | `{actionLabel} may have completed. Do not try again until you check {reconciliationTarget}.`                                      | Only the owning suite's exact status/readback/reconciliation action; never a blind retry.                                                                                                                          |

`PRESERVE-V1` is the exact default for every state or copy role not named in the row: keep the frozen
pre-migration DOM order, text, labels, ARIA relationships, controls, focus destination, and recovery
unchanged. `OWNER-PRESERVE(S##[/S##…])` means S87 renders the exact current snapshot until every named
owner needed by that state ships, then consumes those suites' exact state/copy output without
modifying it. Neither default permits a
new tooltip, deletion, paraphrase, action, or recovery. Populated/success, validation, destructive,
long-content, narrow/zoom, keyboard/focus, and assistive-technology states therefore remain
`PRESERVE-V1` unless the row names an owner; they are still required cohort fixtures.

| Surface | Applicable states and exact truth source                                                        | Exact copy values or owner-preservation default                                                                                                                                                                                                                                                                                                               | Authorized recovery and preservation                                                                                                                                                                                                                                                    |
| ------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SF-01   | `L/X`: staff auth/session request.                                                              | `{surfaceLabel}=staff sign-in`; `{actionLabel}=Sign-in`; domain/account refusals are `PRESERVE-V1`.                                                                                                                                                                                                                                                           | `X`: `Try again`, preserving the auth error context; all other states `PRESERVE-V1`.                                                                                                                                                                                                    |
| SF-02   | `L/N`: one-time Vendor setup token validation/submit.                                           | `L`: `{surfaceLabel}=secure Vendor setup`; `N` keeps `Setup link unavailable` and the existing setup-link reissue/Admin-review paragraph exactly.                                                                                                                                                                                                             | `N`: no guessed route or reissue action; the Vendor follows the preserved PMI KC contact instruction.                                                                                                                                                                                   |
| SF-03   | `L/X`: password/TOTP session request.                                                           | `{surfaceLabel}=Vendor sign-in`; `{actionLabel}=Vendor sign-in`; credential, challenge, and enrollment validation are `PRESERVE-V1`.                                                                                                                                                                                                                          | `X`: `Try again`, retaining entered non-secret fields when the auth owner permits; otherwise `PRESERVE-V1`.                                                                                                                                                                             |
| SF-04   | `L/E/U`: exact assigned-ticket collection read.                                                 | `E`: `No assigned tickets` and `Ask PMI KC to verify the assignment. Guessed or removed tickets stay hidden.`; `U`: `{sourceLabel}=Assigned tickets`.                                                                                                                                                                                                         | `U`: `Reload assigned tickets`; `E` has no in-app creation action; session/sign-out behavior remains S86/S87-owned below.                                                                                                                                                               |
| SF-05   | `L/U/N`: exact assigned-ticket lookup.                                                          | `{surfaceLabel}=assigned ticket`; `{sourceLabel}=Assigned ticket`; `{resourceLabel}=ticket`; `{parentLabel}=assigned tickets`.                                                                                                                                                                                                                                | `U`: reload the exact route; `N`: `Back to assigned tickets`; assigned-ticket non-disclosure is `PRESERVE-V1`.                                                                                                                                                                          |
| SF-06   | S88/S90-S94 query, adapter, model-fallback, stream, action, and S95 My Work-handoff states.     | `OWNER-PRESERVE(S88/S89/S90/S91/S92/S93/S94/S95)` for loading, valid empty, partial, unavailable, forbidden, unsupported, ambiguous, completed, cancelled, action review/confirm/applied/refused/superseded/reconciliation, and retry states.                                                                                                                 | Consume those suites' exact retained-input, retry, owning-destination, focus, confirmation, receipt, and no-duplicate-action behavior; S87 adds no assistant copy.                                                                                                                      |
| SF-07   | `E/U/P`: Space-filtered directory and per-Space definition reads.                               | `E`: `No Internal Processes are available.`; `{sourceLabel}=Process definitions`; `{capabilityLabel}=this Internal Process`.                                                                                                                                                                                                                                  | `E/P`: `Review access` only through S83 when allow-listed; `U`: `Reload Internal Processes`; otherwise no action.                                                                                                                                                                       |
| SF-08   | `E/U/P/N`: exact Space, definition, page, and run reads.                                        | `E`: `No process or published page is available for this Internal Process.`; `{sourceLabel}=Internal Process details`; `{capabilityLabel}=this Internal Process`; `{resourceLabel}=Internal Process`; `{parentLabel}=Internal Processes`.                                                                                                                     | Use the existing authorized create/open action when present; otherwise `Back to Internal Processes`. S83 alone may expose `Review access`.                                                                                                                                              |
| SF-09   | `U/N`: exact published-page read.                                                               | `{sourceLabel}=Published page`; `{resourceLabel}=page`; `{parentLabel}=Internal Process`. Unpublished and unauthorized lookup ambiguity is `PRESERVE-V1`.                                                                                                                                                                                                     | `U`: reload; `N`: `Back to Internal Process`.                                                                                                                                                                                                                                           |
| SF-10   | `L/E/U/P/X`: definitions, recent runs, and create request.                                      | `E1`: `No process definitions are available.`; `E2`: `No recent runs.`; `{sourceLabel}=Processes`; `{capabilityLabel}=create processes`; `{actionLabel}=Create process`.                                                                                                                                                                                      | `E1`: existing create action only for an authorized Editor; `E2`: no action; `U`: reload; `X`: safe retry with preserved input.                                                                                                                                                         |
| SF-11   | `L/E/U/P/X/N`: exact definition, runs, and mutation results.                                    | `E`: `No runs have been started for this process.`; `{sourceLabel}=Process definition`; `{capabilityLabel}=change this process`; `{actionLabel}=Process update`; `{resourceLabel}=process`; `{parentLabel}=Processes`.                                                                                                                                        | `E`: existing `Start run` only when authorized; `U`: reload; `P`: S83 handoff only if allow-listed; `X`: owner-approved retry; `N`: parent.                                                                                                                                             |
| SF-12   | `L/E/U/P/X/N`: exact run/timeline read and run update.                                          | `E`: `No timeline entries are available for this run.`; `{sourceLabel}=Workflow run`; `{capabilityLabel}=update this run`; `{actionLabel}=Run update`; `{resourceLabel}=workflow run`; `{parentLabel}=Process`.                                                                                                                                               | `E`: no fabricated transition; `U`: reload; `X`: safe retry only; `N`: `Back to Process`; direct guards remain `PRESERVE-V1`.                                                                                                                                                           |
| SF-13   | `L/E/F/U/P/X`: owned task/session reads and app-owned updates.                                  | `E`: `No tasks assigned.`; `{itemLabel}=tasks`; `{sourceLabel}=My work`; `{capabilityLabel}=change work`; `{actionLabel}=Work update`.                                                                                                                                                                                                                        | `F`: `Clear filters`; `U`: `Retry`; `P`: no mutation control and S83 handoff only if allow-listed; `X`: preserve session/task input.                                                                                                                                                    |
| SF-14   | `L/U/P/X/A`: connection-store read plus S83 checks and S96 disconnect actions.                  | `U`: `Connection status is unavailable.`; `P`: `An Admin manages this connection.`; checks are `OWNER-PRESERVE(S83/S86)`, while disconnect/error/reconciliation is `OWNER-PRESERVE(S96/S86)`.                                                                                                                                                                 | `U`: reload without showing disconnected; `P`: S83 `Review access` only when allow-listed; disconnect `X/A`: only S96's exact recovery through S86 presentation.                                                                                                                        |
| SF-15   | `L/E/U/P/X`: Gmail connection/attention read and manual refresh.                                | `E`: `No linked renewal or maintenance communication needs attention.`; `{sourceLabel}=Workflow Communications`; `{capabilityLabel}=Admin recovery tools`; `{actionLabel}=Workflow communication refresh`.                                                                                                                                                    | `U`: `Open Connections`; `P`: omit Admin tools for non-Admins; `X`: safe refresh retry with existing context.                                                                                                                                                                           |
| SF-16   | `L/E/F/U/P/X`: intake/ticket reads, filters, and app-owned actions.                             | `E1`: `No unverified requests.`; `E2`: `No active maintenance tickets.`; `{itemLabel}=maintenance tickets`; `{sourceLabel}=Maintenance`; `P`: `Maintenance is read-only for your current role.`; `{actionLabel}=Maintenance update`.                                                                                                                          | `E`: existing Capture only for Editors; `F`: `Clear filters`; `U`: `Retry`; `P`: no mutation controls; `X`: owner-approved retry preserving draft/filter state.                                                                                                                         |
| SF-17   | `L/E/F/U/P/X`: independently loaded queue lanes, filters, and exact item action.                | `E`: `No approval items need your attention.`; `{itemLabel}=approval items`; `{sourceLabel}=Approval Queue`; `{capabilityLabel}=act on this item`; `{actionLabel}=Approval action`.                                                                                                                                                                           | `F`: `Clear filters`; `U`: `Retry`; `P`: preserve item without an unavailable control and offer S83's allow-listed request handoff for any eligible first-party capability/Space denial. Only deciding Access requests remains the specialized Admin-only lane; `X`: exact queue retry. |
| SF-18   | `L/E/U`: independently loaded notification lanes.                                               | `E`: `Nothing needs your attention.`; `{sourceLabel}=Notifications`. Role-filtered absence is not an error.                                                                                                                                                                                                                                                   | `U`: `Reload notifications`; empty has no action. Notification destinations/count behavior is `OWNER-PRESERVE(S84/S86)`.                                                                                                                                                                |
| SF-19   | `L/E/U/X`: independent Admin panel reads and panel mutations.                                   | `E`: `No Admin tasks need attention.` while `AdminTaskIndex` remains visible; `{sourceLabel}=Admin status`; `{actionLabel}=Admin action`. Panel-specific copy is `PRESERVE-V1`.                                                                                                                                                                               | `U`: retry only the failed panel; `X`: its exact safe retry. Never collapse unavailable into empty or hide the task index.                                                                                                                                                              |
| SF-20   | `L/E/U/X`: managed-user roster and role/Space mutation.                                         | `E`: `No managed users are available.`; `{sourceLabel}=Managed users`; `{actionLabel}=Access update`. Exact confirmation and result text is `OWNER-PRESERVE(S83/S86)`.                                                                                                                                                                                        | `U`: `Retry`; `X`: preserve selected user and use the owner-approved readback/retry; `Back to Admin` remains.                                                                                                                                                                           |
| SF-21   | `L/E/F/U/P/X`: team-task reads, filters, and updates.                                           | `E`: `No team tasks.`; `{itemLabel}=team tasks`; `{sourceLabel}=Team work`; `{capabilityLabel}=change team work`; `{actionLabel}=Team work update`.                                                                                                                                                                                                           | `E`: existing create action only when enabled; `F`: `Clear filters`; `U`: `Retry`; `P`: no mutation control; `X`: preserve form/filter state.                                                                                                                                           |
| SF-22   | `L/U/P/X/A`: exact Vendor lifecycle readiness/effect.                                           | `{surfaceLabel}=Vendor lifecycle`; `{sourceLabel}=Vendor lifecycle`; `{capabilityLabel}=this Vendor action`; `X/A` are `OWNER-PRESERVE(S86)` so consequence and reconciliation wording cannot drift.                                                                                                                                                          | `U/P`: `Back to Admin` unless an existing exact recovery is rendered; `X/A`: only the S86 effect contract, never blind retry.                                                                                                                                                           |
| SF-23   | `L/U`: migration/preflight report read.                                                         | `{surfaceLabel}=migration readiness`; `U`: `Migration readiness is unavailable.` Blocker, warning, healthy, generated-at, and environment truth are `PRESERVE-V1`.                                                                                                                                                                                            | `U`: reload the report or `Back to Admin`; no action is inferred from a blocker.                                                                                                                                                                                                        |
| SF-24   | `L/E/U/P/X/A`: prior requests, current plan, runtime availability, and exact lifecycle actions. | `E`: `No Space requests have been saved.`; `{sourceLabel}=Space requests`; `{capabilityLabel}=provision or retire this Space`; `{actionLabel}=Space request action`; `A` is `OWNER-PRESERVE(S86)`.                                                                                                                                                            | `E`: existing create request action; `U`: `Retry`; `P`: keep exact runtime refusal with no unavailable control; `X/A`: owning recovery only.                                                                                                                                            |
| SF-25   | `L/U`: governance, connection, model, artifact, and evaluator reads.                            | `{surfaceLabel}=Workflow Communications governance`; `U`: `Workflow Communications readiness is unavailable.` Existing immutable-artifact and synthetic-only truth is `PRESERVE-V1`.                                                                                                                                                                          | `U`: `Open Workflow Communications` when that route remains authorized, or `Back to Admin`; no Gmail effect is added.                                                                                                                                                                   |
| SF-26   | `L/E/F/U/P/X`: renewal desk source/filter/action states.                                        | `OWNER-PRESERVE(S82/S83/S86/S91)` only after S91's shared-projection conformance passes; S87 supplies no alternate renewal truth. Missing rent remains unavailable rather than `$0`, and an auxiliary failure cannot become empty, verified, or unblocked.                                                                                                    | Consume the exact conformed desk recovery, visible default date scope, discoverable sort/filter controls, direct blocker/source destinations, and S83 access handoff; otherwise the renewal cohort cannot migrate.                                                                      |
| SF-27   | `L/E/U/P/X/N/A`: exact lease workspace source, blocker, action, and reconciliation states.      | `OWNER-PRESERVE(S82/S83/S86/S91)` only after desk/workspace/assistant parity passes; S87 supplies no alternate lease or effect copy.                                                                                                                                                                                                                          | Consume the exact conformed recovery and phase truth. Place an S97/S98 write Review/Confirm control only inside its owning selected phase; no top-level, unrelated-phase, or table navigation control may execute it.                                                                   |
| SF-28   | Current reconciliation source, filter, role, and action states.                                 | `PRESERVE-V1` for every state/copy/control/ARIA relationship in this version.                                                                                                                                                                                                                                                                                 | Preserve existing exact destinations and recovery; no S87 declutter or S82 ownership is inferred until a later CB row exists.                                                                                                                                                           |
| SF-29   | `L/E/U/N`: exact property projection/history reads.                                             | `E1`: `No current decision or write-back authorization is attributable to this property yet. Legacy or name-joined records are not guessed onto a property.`; `E2`: `No decisions have been recorded for this property yet.`; `U` keeps the current Firestore-unavailable copy exactly; `{resourceLabel}=property decision history`; `{parentLabel}=renewal`. | `U`: reload once the connection is back; `N`: sanitized `Back to renewal`; all property-key non-disclosure and role behavior is `PRESERVE-V1`.                                                                                                                                          |
| SF-30   | `L/E/U/P/X/A`: S83 effective-access, catalog, own-history, request, and reconciliation states.  | `OWNER-PRESERVE(S83/S86)` for every state and exact requester-facing copy. S87 defines no alternate empty, reviewer, grant, or completion claim.                                                                                                                                                                                                              | Consume S83's exact current-access, empty-history, submission, cancellation, unavailable-review, denied/superseded, applied/readback, and reconciliation recovery; navigation remains S84-owned.                                                                                        |

### V1 persistent-block disposition manifest

The source audit establishes the following exact first-pass decisions. These are product decisions,
not suggestions for the implementation runner. A frozen persistent block not named below receives
`Preserve` for this version; it cannot be removed, hidden, merged, renamed, or reorganized until a
later authorized manifest row replaces that default. Labels, controls, state, safety, recovery, and
assistive text are always preserved under the visible-copy contract.

| Block ID | Current evidence / surface                                                                                                | Action class    | Surviving block or canonical replacement copy and exact destination/placement                                                                                                                                                                                                                                                                                                                                                                                                  | Owner                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| CB-01    | `ConsoleView` purpose plus `AskForm` question/example/hint on SF-06                                                       | `Merge`         | Surviving block `ASSISTANT-GUIDANCE-1`: `Ask about work, approvals, renewals, access, or PMI KC processes.` Expose it once as screen-reader-only descriptive text referenced by S93's input; do not render it as persistent visible Dashboard subtext. The visible region title is `AI`; the input retains exact accessible name `Message AI`. Remove `console-purpose`, the duplicate lease example, and the visible process picker/detection instructions when S93 is ready. | S93/S95                        |
| CB-02    | `ConnectionCenter` subtitle and repeated authority notice on SF-14                                                        | `Slim / remove` | Canonical block `CONNECTION-SCOPE-1`: `Connection status does not grant action authority.` Render it once as the `PageHeader` subtitle immediately below `Connections`; remove the separate page-level authority notice. S83 capability state and S86 degraded/refusal text remain at the affected card/action.                                                                                                                                                                | S87                            |
| CB-03    | `ConnectorCard` powers, setup, detail, and next-step prose on SF-14                                                       | `Hide`          | Surviving block `CONNECTION-DETAILS-1`: one disclosure with exact summary `Connection details`, inside each connector card after source-backed status/freshness and the card's available controls. Move the existing `def.powers`, method/setup note, `status.detail`, action-key-independence statement, and health-check steps under fixed labels `Powers`, `Setup`, and `What the app checks`; keep the visible `Next step:` block outside.                                 | S87 content; S83/S86 behavior  |
| CB-04    | `GmailHubHome` and `LiveGmailWorkspace` header/panel/footer workflow-boundary text on SF-15                               | `Merge`         | Canonical block `COMMUNICATION-BOUNDARY-1`: `Workflow Communications shows only Gmail activity linked to a renewal or maintenance workflow. Other mailbox work stays in Gmail.` Render it once inside `LiveGmailWorkspace`, immediately before the first enabled refresh/open communication control; remove the `GmailHubHome` introduction and workspace footer duplicates.                                                                                                   | S87                            |
| CB-05    | Maintenance route introduction, `MaintenanceExecutionReadiness` provider matrix, and capture/queue boundary text on SF-16 | `Reorganize`    | Surviving block `MAINTENANCE-ACTION-BOUNDARY-1`: `Creating a ticket writes to PMI KC only. Any provider action is separate and requires its exact target and confirmation.` Place it immediately beside the create/dispatch control in each affected task region. Move the unchanged provider matrix into `PROVIDER-READINESS-1`, a disclosure with summary `Provider readiness` after the Maintenance queue. Remove the route introduction after both destinations exist.     | S87 content; S86 action safety |
| CB-06    | `/work` route introduction and repeated `WorkAccountabilityBoard` caveats on SF-13                                        | `Merge`         | Surviving blocks: keep the current Start-work truth (`Start time only when you choose Start work…`) as `WORK-SESSION-TRUTH-1` immediately above session controls, and keep `Task completion changes this internal record only; linked product work keeps its own controls.` as `WORK-TASK-TRUTH-1` immediately above the task list. Remove only route/footer copies that repeat either named block.                                                                            | S87                            |
| CB-07    | `AdminTaskIndex`, section subtitles, and repeated Admin card descriptions on SF-19                                        | `Reorganize`    | Surviving block `ADMIN-TASK-INDEX-1`: exact heading `Find an Admin task`, first after the Admin page title, followed by one concise link per existing route/anchor in the mapping below. Remove its authority-training paragraph and parallel group/link descriptions. Each mapped attention panel keeps its source-derived count/state in its own disclosure summary at the exact mapped anchor.                                                                              | S87                            |
| CB-08    | Migration intro, owner explanation, registry exposition, and implementation mechanics on SF-23                            | `Hide`          | Surviving block `MIGRATION-VERDICT-1`: existing `Cutover Blockers` count, warnings, and generated-at/environment state, directly after `Migration Readiness`. Move unchanged owner actions to `Owner actions`, Registry paragraphs to `Action Registry details`, and implementation/preflight mechanics to `Readiness details`; each is a labelled disclosure in its current section position after the verdict.                                                               | S87                            |
| CB-09    | Repeated access explanation in SF-19 Access and SF-20 People                                                              | `Merge`         | Canonical block `ACCESS-HANDOFF-1`: `Use Access requests for requested role or Space changes; this page manages current user access.` Render once immediately below the `/admin/users` title with `Access requests` linked to S83 `/admin/access`. SF-19 retains only its existing compact task links to `/admin/access` and `/admin/users`; remove all other role-training duplicates.                                                                                        | S83 behavior; S87 placement    |
| CB-10    | `SpaceDesk` communication reference and immutable-definition/version exposition on SF-08                                  | `Hide`          | Surviving block `PROCESS-DETAILS-1`: disclosure summary `Process details`, after the leading current-state/next-action region and before recent runs. Move the unchanged `Workflow communication reference`, immutable version, definition status, step evidence, and version-pinned run evidence inside under their existing headings; keep current run state and next action outside.                                                                                        | S87                            |
| CB-11    | `OperationalPageRenderer` version/source footer on SF-09                                                                  | `Hide`          | Surviving block `PAGE-DETAILS-1`: disclosure summary `Page details`, immediately after the published page body and before `Back to Internal Process`. Move the same non-secret version/source values inside under labels `Version` and `Source`; keep freshness outside only when it changes whether the content can be trusted.                                                                                                                                               | S87                            |
| CB-12    | `VendorPortal` and assigned-ticket Gmail explanation panels on SF-04/SF-05                                                | `Slim / remove` | No replacement communication block. Remove the complete standalone `Vendor Gmail` and `Assigned-ticket Gmail` panels from the DOM. Preserve `VENDOR-ASSIGNMENT-SCOPE-1` (`Signed in as {verifiedEmail}. Only tickets assigned to this Vendor account appear here.`) directly below the SF-04 title and preserve exact assigned-ticket facts on SF-05. A future communication owner must add point-of-action copy through a new row.                                            | S87                            |
| CB-13    | Repetitive overview paragraphs on SF-25 Gmail governance                                                                  | `Merge`         | Canonical block `GMAIL-GOVERNANCE-SCOPE-1`: `Workflow Communications is limited to governed, workflow-linked Gmail activity. Sending remains a human action in Gmail.` Render once below the SF-25 title beside the existing `Open Workflow Communications` link. Move unchanged artifact records into `Approved communication artifacts` and evaluator/rule mechanics into `Evaluator details`, in disclosures after the connection/readiness summary.                        | S87                            |
| CB-14    | Renewal Authority and renewal process/retention exposition on SF-26/SF-27                                                 | `Reorganize`    | Surviving owner blocks are `RENEWAL-DESK-S82` at the SF-26 content root and `RENEWAL-WORKSPACE-S82` after the SF-27 back link; S82 defines their exact table/phase/blocker copy. Renewal Authority is replaced by S83 `My access` at `/admin/access`; no authority panel or generic authority paragraph remains on SF-26/SF-27 after that destination is reachable. S87 makes no independent renewal edit.                                                                     | S82/S83                        |
| CB-15    | Notifications-page visible `Console`/home-summary reference on SF-18                                                      | `Slim / remove` | Surviving block `NOTIFICATIONS-INTRO-1`: `Everything that needs your attention, newest first.` Render directly below `Notifications`. Remove the home-summary comparison because S95 retires the static Dashboard attention deck; compatible routes, notification destinations, and internal identifiers remain unchanged.                                                                                                                                                     | S84/S95                        |
| CB-16    | Missing vendor account/session action on SF-04/SF-05                                                                      | `Add`           | Canonical block `VENDOR-SESSION-1`: `Signed in as {verifiedEmail}` plus a visible `Sign out` button in the shared Vendor shell header, immediately after the page title and before ticket content on SF-04/SF-05. The button calls the existing Vendor-session DELETE boundary; S86 owns busy/error feedback, and success returns to `/vendor/sign-in`. The block never appears in staff chrome.                                                                               | S87 with S86 feedback          |
| CB-17    | Any frozen persistent block not identified by CB-01 through CB-16                                                         | `Preserve`      | Surviving block is the exact frozen `PRESERVE-V1` node at its current DOM position, with unchanged copy, ARIA relationships, controls, and recovery. A later authorized row must name both its replacement and destination before any change.                                                                                                                                                                                                                                  | Current owning suite           |

S95's Dashboard disposition ledger is the authorized later manifest required by CB-17. It must name
the exact replacement/destination and parity gate for `ConsoleActionDeck`,
`ConsoleAnticipatedWork`, `ConsoleProcessStrip`, `ConsoleLiveDataPanel`, the process selector and
automatic run-start coupling, the purpose subtitle, and every eager read that exists only for those
regions. Until the corresponding S90/S91/S93/S95 output and owning destination pass, CB-17 preserves
the current block. This delegation does not authorize deletion from non-Dashboard surfaces except
S95's explicit user-facing Space Coverage retirement.

### Admin and connection reorganization

S81's task-oriented destinations and S83's unified access page/Access queue are the authority. The
Admin default surface starts with `AdminTaskIndex`, followed by panels with current attention. It uses
the existing `/admin` route, anchors, and dedicated routes; no new route is inferred. A collapsed
panel is an accessible Disclosure whose summary exposes its title and current count/state. If a row
below says attention-expanded, unavailable/read-error counts as attention and remains visible.

| Current panel or card                                                                                           | Exact group / destination                                                                | Default presentation                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AdminTaskIndex`                                                                                                | Start of `/admin`                                                                        | Visible and first; one concise task link per existing destination/anchor.                                                                                |
| Access card                                                                                                     | People and Access; `/admin/access`, `/admin/users`, `/admin/team-work`, `/admin/vendors` | Visible compact link group. S83 request status and `/admin/users` management stay separate.                                                              |
| Domain card                                                                                                     | People and Access; `#admin-people-access`                                                | Collapsed `Domain and sign-in scope`; summary shows the configured domain, with no credential detail.                                                    |
| `RuntimeSuspensionAdminPanel`                                                                                   | Activity and Logs; `#admin-runtime-suspensions`                                          | Attention-expanded when any suspension exists or state is unavailable; otherwise collapsed.                                                              |
| Observability, Ask Volume, Approval Queue, Notification Failures, Top Spaces, Source States, Space Setup Health | Activity and Logs; `#admin-activity-logs`                                                | One collapsed `Usage and system health` disclosure. Summary reports available/degraded; existing metric contents remain intact.                          |
| `ApprovalQueueAdminPanel`                                                                                       | Activity and Logs; `#admin-approval-notifications`                                       | Attention-expanded when health is unavailable/degraded or failures are nonzero; otherwise collapsed.                                                     |
| `SupportReportsPanel`                                                                                           | Activity and Logs; `#admin-support-reports`                                              | Attention-expanded when new/follow-up counts are nonzero or state is unavailable; otherwise collapsed.                                                   |
| `AdminActivityLogPanel`                                                                                         | Activity and Logs; `#admin-activity-log`                                                 | Collapsed `Admin activity`; current entries and unavailable state remain reachable.                                                                      |
| `KbCorrectionsPanel`                                                                                            | App Info and Readiness; `#admin-kb-corrections`                                          | Attention-expanded when proposed corrections exist or state is unavailable; otherwise collapsed.                                                         |
| `ModelConfigPanel`                                                                                              | App Info and Readiness; `#admin-model-config`                                            | Collapsed `Model configuration`.                                                                                                                         |
| Legacy `RenewalRehearsalSheetPanel`                                                                             | Removed by S98; no replacement Admin destination                                         | Must be absent after S98, including its route/anchor/configuration copy and controls. Operating write status remains at the S81 Connections destination. |
| Approval Label and Indexing cards                                                                               | App Info and Readiness; `#admin-app-readiness`                                           | Merge into collapsed `Retrieval and approval configuration`; preserve the governance/config values.                                                      |
| Migration Readiness card                                                                                        | App Info and Readiness; `/admin/migration`                                               | Visible compact task link with current readiness state when available.                                                                                   |
| Spaces request card                                                                                             | App Info and Readiness; `/admin/spaces/request`                                          | Visible compact task link with current availability/refusal state.                                                                                       |
| `ReindexPanel`                                                                                                  | App Info and Readiness; `#admin-app-readiness`                                           | Collapsed `Re-index sources`.                                                                                                                            |
| `TransactionalDestinationPanel`                                                                                 | App Info and Readiness; `#admin-app-readiness`                                           | Collapsed `Transactional notice destination`.                                                                                                            |
| `NoticeRulesAdminPanel`                                                                                         | App Info and Readiness; `#admin-renewal-notice-rules`                                    | Collapsed `Renewal notice rules`; unavailable state appears in the summary.                                                                              |
| Renewal connection status                                                                                       | Connections; `/connections#connection-task-renewal-data`                                 | Visible compact task link using S81's existing destination and current source-backed state when available.                                               |
| `OperationalPageBuilderPanel`                                                                                   | App Info and Readiness; `#admin-content-builder`                                         | Collapsed `Operational page builder`.                                                                                                                    |
| `OwnerPolicyRulesAdminPanel`                                                                                    | App Info and Readiness; `#admin-owner-pricing-rules`                                     | Collapsed `Owner pricing rules`.                                                                                                                         |
| Workflow Communications card                                                                                    | App Info and Readiness; `/admin/gmail-inbox-zero`                                        | Visible compact task link with current governance/connection state when available.                                                                       |
| `CommunicationsRetentionAdminPanel`                                                                             | App Info and Readiness; `#admin-app-readiness`                                           | Collapsed `Communications retention`.                                                                                                                    |
| `PublicationPolicyAdminPanel`                                                                                   | App Info and Readiness; `#admin-publication-policies`                                    | Collapsed `Publication policies`; unavailable state appears in the summary.                                                                              |

All current controls remain in the mapped panel. Keyboard navigation, focus restoration, and direct
anchor entry open/focus the addressed disclosure without opening unrelated panels. The task index
links only to the routes/anchors above.

Connections cards show one source-backed state and one next action by default. S86 owns the
connection-store degraded presentation and S96 owns the disconnect lifecycle; a loader failure is `Connection
status unavailable`, not an empty map interpreted as disconnected. Grouped access and connection
buttons use S83 destinations. A connection link navigates; an actual supported read check uses S83
business behavior and S86 feedback. S87 owns only the card hierarchy: provider powers, setup notes,
action-key independence, and diagnostics sit in one labelled `Connection details` disclosure.

S97-S100 owning implementations must be delivered to their verified present state before S87 begins. Their
source-action, receipt, reconciliation, and manual-sync/draft surfaces remain with their owning
renewal or Maintenance workflow and follow S86's shared feedback hierarchy. Any exact key that has
not passed proof/activation remains visibly unavailable and cannot be described as active. S87 may
remove duplicate explanatory copy but cannot move, merge, hide, or relabel an exact effect,
confirmation, ambiguity, reversal, or mark-read disclosure.

### Empty, unavailable, and recovery states

The 30-row target-state map above is exhaustive for S87 V1. Its predicates distinguish authoritative empty,
filtered empty, source-unavailable, permission, definite error, not-found, and ambiguous outcomes.
Implementation must materialize each listed code as a fixture and prove that every unlisted state
uses `PRESERVE-V1` or the named `OWNER-PRESERVE` contract. The currently blank all-Spaces and
managed-user cases use their exact `E` rows; process/run empty states expose only the existing
authorized create/start action; Vendor empty retains its exact PMI-assignment recovery. No state may
fabricate zero data, a disconnected provider, access, an Admin reviewer, a setup action, a safe retry,
or a completed effect.

### Final authenticated conformance and stability gate

S87 is the final integration gate, not a claim that component/unit/build success proves the product is
error-free. Before each cohort promotion, use existing managed Editor and Admin sessions supplied
outside Git to exercise that cohort's populated, empty, filtered-empty, unavailable, denied, error,
not-found, pending, applied, and ambiguous states on the exact zero-traffic candidate. The complete
final matrix covers staff sign-in and both Dashboard aliases; My Work; Internal Processes, Processes,
and a workflow run; Maintenance and one exact ticket; Workflow Communications; Notifications;
Connections; Admin, Access, People, and Approval Queue; the renewal desk, one lease workspace, and
reconciliation. Vendor list/detail/sign-out use the existing assigned Vendor test boundary without
sharing a staff session. Each direct destination re-runs its own guard.

The final gate consumes S89/S93/S95's content-free browser-error and request-failure evidence and
S91's candidate/post-promotion RentVine/Sheet/application reconciliation. It fails on an uncaught
console error, unhandled rejection, unexplained failed same-origin request, route 5xx, blank task
region, false empty/zero/disconnected/no-proposal state, stale post-write renewal row, cross-page
status/blocker/rent/action/link drift, dead destination, hidden required recovery, or client-error
signal whose delivery was not read back. Routine evidence retains only actor class, surface/state
code, route family, pass/fail, exact revision, aggregate timing, and finite error code; it stores no
uid, URL parameter, record id, question/answer, customer value, body, screenshot, provider payload, or
secret.

Renewal conformance has additional observable gates. The default desk date scope is visible and never
described as all renewals; owner, tenant, renewal-date, status, blocker, and rent-verification controls
are keyboard/touch discoverable, reject invalid values without losing valid state, and retain one
obvious Clear filters control. Missing rent stays unavailable rather than `$0`. Every causal blocker
and verified-source destination resolves through the owning validated route/link contract. Navigation
never writes. An S97 or S98 Review/Confirm control appears only inside the selected phase that owns
that exact effect, with pending, receipt, reconciliation, and correction/reversal state local to that
phase; no table cell, phase label, page load, or unrelated phase can execute it.

The loaded-cohort performance check uses the owning page's maximum supported row/result fixture and
fails on a per-row provider/store request, repeated source load, unbounded render/event growth,
page-level overflow, missed current runtime timeout, or missing pending feedback. Candidate and stable
post-promotion aggregate timings are recorded for regression review without inventing a user promise.
The full keyboard, touch, screen-reader, forced-colors, reduced-motion, 320-pixel, and 200%-zoom matrix
must pass for every materially changed cohort. Anonymous route smoke, server-only 5xx monitoring, a
single test lease, or an implementation runner's visual assertion cannot replace these gates.

### Vendor session control and style integration

Vendor surfaces consume S85/S86 shared cards, fields, buttons, links, notices, and feedback instead
of visual class names without a defined global style. Ticket list/detail share one minimal vendor
shell with signed-in identity and a visible `Sign out` action. Sign out invokes the existing vendor
session DELETE boundary, prevents duplicate dispatch, clears only that vendor session, and returns to
vendor sign-in with a truthful success/error state. It never signs out a staff session, exposes a
ticket, or depends on an unavailable Gmail action.

### Copy source, quality, and governance

Use `docs/voice-and-audience.md`: direct verbs, plain language, exact product terms, no internal
architecture prose in default task surfaces, and specific recovery. `Dashboard` and `Internal
Processes` are visible aliases from S84; stable URLs, stored Space names, and code identifiers do not
change. `Communications` remains workflow-linked Gmail, not a general inbox. Renewal price/source,
draft, write, and send truth remain governed by their owning suites.

Maintain one versioned migration manifest keyed by stable surface, state, task-region, and block IDs.
For each surface it records exactly one `primaryOutcomeId`; every applicable state code, truth-source
selector/result, exact copy or preservation owner, and authorized recovery; every bounded
`taskRegionId` and its zero-or-one `primaryActionId` per state; and every frozen block's one action
class, evidence, surviving/replacement block ID, canonical copy when changed, exact destination
selector/placement, owner, and preservation reason. Implementation checks reject a missing/duplicate
field, a destination that does not render, a changed row without an exact survivor/replacement, or a
deleted block that contained a required label/state/safety/error/recovery role. The manifest is a
migration/test artifact, not runtime user data or product authority.

For new or materially changed surfaces, the review template must identify the one primary outcome,
default visible hierarchy, bounded task regions, zero-or-one primary-emphasis action per region/state,
all applicable S86 states, each state's truth/copy/recovery, each persistent explanatory block's
role, and the recovery path. A heuristic paragraph count may flag review but cannot mechanically
delete or fail safe content. Reviewer choices in the audit workbench are direction only; accepted
implementation scope still comes from an authorized suite/change.

### Rollout and rollback

Migrate one cohort at a time: public/vendor; Dashboard/My Work; Internal Processes/processes/runs;
Maintenance/Communications/Notifications; Connections/Admin/Approval; renewal conformance. Freeze
DOM/copy/state and representative screenshots before each cohort. A cohort ships only when every
action remains reachable, every required copy role remains, state/accessibility/theme checks pass,
and the old duplicate blocks are removed. Rollback restores presentation only; no data migration or
provider state is involved.

**In scope / out of scope.**

In scope: visible-copy classification; persistent prose reduction; progressive disclosure;
information hierarchy; explicit outcomes for all 30 target experiences and aliases; Admin grouping;
connection-card composition; empty/unavailable/recovery consistency; Vendor shared style and sign
out; consumption of S84 terminology; content migration ledger and tests.

Out of scope: deleting capabilities based on assumed low use; changing routes/roles/Spaces/actions;
new analytics; UI mockups as authority; S82 renewal desk/workspace behavior; S83 access requests and
connection checks; S84 navigation mechanics; S85 visual tokens; S86 interaction primitives;
cross-application assistant coverage beyond S88's eight-intent V1; executable assistant actions
beyond S94's one self-task contract; general
Gmail inbox; autonomous communication; provider/source writes; or hiding labels, status, safety,
errors, and recovery solely to meet a percentage.

**Open questions & assumptions.**

- Decision: “No persistent subtext” means no persistent _nonessential explanatory prose_. Essential
  labels, current state/source, blockers, validation, safety, errors, and recovery remain visible.
- Decision: S84's concise destination descriptions remain visible inside opened navigation panels;
  removing them would defeat the accepted self-explanatory navigation goal. They do not remain on
  ordinary page canvases.
- Decision: the audit's paragraph count is a discovery signal, not a deletion quota. Completion is
  100-percent disposition coverage plus per-surface task/state acceptance, not an arbitrary global
  word reduction.
- Assumption: no reliable usage analytics or authenticated production visual capture exists. Remove,
  hide, and reorganize decisions therefore rely only on direct duplication/task/safety evidence.
  Representative-user review is recommended rollout validation but is not an implementation gate and
  cannot override deterministic preservation failures.

**Cross-product impacts.**

All 29 audited current experiences, S83's new SF-30, and six renewal aliases; page headers, panels, cards, disclosures,
empty/error states, Admin task index, connection cards, vendor shell/session control, terminology,
voice contract, S36, S82-S100 composition, snapshots/accessibility tests, and the audit
workbench. No provider, source, action, role, or production data change.

**Authority and evidence map.**

| Input                                                      | Classification                   | Use and limitation                                                                                                                                                                         |
| ---------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Router, committed routes/components/tests, `docs/facts.md` | Authority / implementation truth | Establish current surfaces, guards, states, actions, safety boundaries, and terminology compatibility.                                                                                     |
| `docs/evidence/ui-ux-audit-2026-08-31.html`                | Audit evidence                   | Supports density/duplication/state gaps; contains no live-user frequency or production-render claim.                                                                                       |
| 2026-08-31 long-term UI/UX note                            | Intent evidence                  | Requires less persistent prose and more obvious actions; does not override accessibility or safety meaning.                                                                                |
| S36 and S82-S100                                           | Active ownership/dependencies    | Own Space pilot, renewal/source effects, Maintenance/resident sync, access, navbar, theme, interaction, assistant/Dashboard, and connector contracts; S87 composes rather than duplicates. |
| `docs/voice-and-audience.md`                               | Current product writing contract | Governs plain-language labels, source truth, errors, and recovery.                                                                                                                         |
| Usage analytics and authenticated moderated observation    | Missing evidence                 | Required before any claim that a feature is rarely used or a broad migration improves first-click success.                                                                                 |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S87-1** — One stable surface/content manifest represents all 30 target experiences, six aliases,
  exactly one primary outcome per surface, applicable state truth/copy/recovery, bounded task-region
  IDs, persistent block IDs, exact disposition, survivor/replacement, owner, and destination; parity
  checks fail on an unclassified/dead/orphaned item.
- **ARCH-S87-2** — One page-hierarchy composition contract orders identity, the one surface outcome,
  task, state, facts, secondary actions, and progressive detail. Every bounded task-region/state maps
  to zero or one visually primary action without changing route/control authorization.
- **ARCH-S87-3** — One state contract distinguishes empty, filtered-empty, unavailable/degraded,
  permission, definite error, not-found, and ambiguous outcomes from fabricated zero/none, and maps
  all 30 target surfaces to an exact truth predicate, exact copy or preservation owner, and authorized
  recovery. S86 alone owns the reusable Notice/Alert/Loading/Empty/Error and route-boundary primitive
  semantics.
- **ARCH-S87-4** — One vendor shell consumes shared presentation/session behavior across list/detail
  while preserving exact assigned-ticket and staff/vendor session boundaries.
- **ARCH-S87-5** — One final release-conformance manifest binds every changed cohort to authenticated
  Admin/Editor state journeys, S89 client/server observability, S91 renewal source/projection
  reconciliation, direct-destination guards, bounded loaded-cohort behavior, accessibility, exact
  candidate/revision, and rollback. Local/unit/build or anonymous smoke cannot satisfy it.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S87-1** — A first-time user can identify the surface's one primary outcome, current state, and
  next available action without reading internal process explanations or opening a training panel;
  no bounded task region competes with multiple visually primary actions.
- **BEH-S87-2** — Repeated/internal prose is absent from default canvases; legitimate secondary
  evidence remains findable by keyboard/touch through one labelled disclosure/help destination.
- **BEH-S87-3** — Every applicable empty, delayed, failed, denied, and missing state is distinguishable
  and offers a safe recovery without losing input/filter/task context.
- **BEH-S87-4** — Every pre-migration action, fact, evidence path, authority/safety warning, and
  recovery remains reachable and truthful after its cohort; no hover is required for essential copy.
- **BEH-S87-5** — A vendor can identify their account, sign out, return to vendor sign-in, and never
  access an unassigned ticket or affect a staff session.
- **BEH-S87-6** — On the exact candidate and stable promoted revision, an authenticated user can load
  and act through every changed cohort without a blank page, console/network failure, false empty or
  zero, stale renewal projection, dead link, hidden recovery, misplaced source-write control, or lost
  input/filter state; a detected failure reaches the verified operator channel and blocks/rolls back
  the release.

**Human litmus outcome.**

### Start useful work without training copy

**If this was built correctly:** A new user opens any primary staff surface and sees what the page is,
what needs attention, and the one action to take next. Internal policy and provider mechanics do not
compete with the task, but source, safety, and recovery information is visible where it matters.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why; when no human observer is present, use the manifest's exact
  `Human verdict: NOT RUN — no human observer` value and continue unless the owner explicitly makes
  that verdict a completion gate.

### Find detail without losing the task

**If this was built correctly:** An experienced user opens a labelled detail/help control for
diagnostics, evidence, or history, reads or acts on it by keyboard or touch, closes it, and returns to
the same task and focus position.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Recover from an empty or unavailable view

**If this was built correctly:** A user never sees a blank grid or a false zero. The page says whether
there is no data, no filter match, a source failure, or missing permission and offers only a recovery
the user is allowed to take.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

### Complete the authenticated product journey without hidden failure

**If this was built correctly:** An Editor and Admin can traverse the changed pages, see the same
current renewal facts wherever one lease appears, use filters and exact destinations, and encounter
truthful unavailable/denied states without a blank page or silent error. A browser or source mismatch
stops the release and reaches the operator instead of being presented as success.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                | Architecture outcome | Behavior outcome | Human litmus                   | Deterministic evidence / falsification                                                                                                                                                  |
| ------------------------------------------ | -------------------- | ---------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete surface/content disposition       | `ARCH-S87-1`         | `BEH-S87-1/2/4`  | Start work; Find detail        | 30-surface/six-alias manifest and frozen-block parity reject missing/duplicate dispositions.                                                                                            |
| Task-first visible hierarchy               | `ARCH-S87-2`         | `BEH-S87-1/4`    | Start work                     | Manifest/DOM checks require one primary outcome per surface and at most one primary-emphasis action per bounded region/state.                                                           |
| Accessible progressive detail              | `ARCH-S87-1/2`       | `BEH-S87-2/4`    | Find detail                    | Keyboard/touch/zoom/theme tests plus exact moved-content reachability assertions.                                                                                                       |
| Truthful empty/unavailable/recovery states | `ARCH-S87-3`         | `BEH-S87-3/4`    | Recover                        | All 30 state rows materialize listed fixtures and exact copy/recovery or fail on any drift from `PRESERVE-V1`/owner output.                                                             |
| Admin/Connections decluttering             | `ARCH-S87-1/2/3`     | `BEH-S87-1/2/4`  | Start work; Find detail        | Panel/action/anchor parity, store-read-error, S81/S83 route, and no-dead-link tests.                                                                                                    |
| Vendor shell and sign out                  | `ARCH-S87-4`         | `BEH-S87-3/5`    | Recover                        | List/detail/empty/sign-out/failure/session-isolation/assignment-guard tests.                                                                                                            |
| No safety/access/source meaning lost       | `ARCH-S87-1/2/3`     | `BEH-S87-4`      | All                            | Required-content role assertions and existing action/source/permission preservation suites.                                                                                             |
| Authenticated full-product stability       | `ARCH-S87-3/5`       | `BEH-S87-3/4/6`  | Complete authenticated journey | Admin/Editor candidate and post-promotion matrices, S91 source parity, client-error delivery, loaded-cohort, direct-guard, accessibility, and rollback evidence all pass independently. |

**Preservation set.**

Keep all current reachable capability, route guards, role/Space filtering, source freshness and
degradation truth, environment badges, exact confirmation, error recovery, unsent-draft and human-
send boundaries, action gates, S82 table/workspace, S83 access/check flows, S84 navigation, S85
themes, S86 interaction safety, S97-S100 exact effect/receipt/reconciliation/mark-read/draft meaning,
S36 closeout evidence, notification counts/destinations, Admin subroutes, vendor assignment
guards, and no-secrets/PII rules. Content-reduction results never average away a preservation failure.

**Adversarial acceptance checks.**

- **AC-S87-1** — The manifest contains exactly SF-01 through SF-30 and AL-01 through AL-06. Every
  surface has exactly one `primaryOutcomeId`, every listed state has truth/copy/recovery fields, every
  task region has state-specific primary-action cardinality, and every frozen block has one of the
  exact seven action classes, evidence, owner, survivor/replacement, and destination.
- **AC-S87-2** — Static/DOM checks fail when a changed CB-01 through CB-16 row does not render its
  named surviving/replacement block at the exact destination, renders retired copy elsewhere, or
  removes a label, source/state, blocker, validation, safety consequence, exact confirmation, error,
  recovery, or screen-reader relationship. CB-17 nodes must remain byte-equivalent in copy and
  equivalent in DOM role/relationship under `PRESERVE-V1`.
- **AC-S87-3** — Every rendered surface has exactly one manifest-backed primary outcome. In each
  populated/empty/loading/error/permission/destructive/long/narrow/keyboard/dark/light fixture, every
  bounded task region has zero or one primary-emphasis control; secondary/destructive/back/cancel
  controls cannot satisfy or duplicate that slot, and no essential meaning is hover-only.
- **AC-S87-4** — Admin panel/action counts, connection controls/anchors, process definitions/runs,
  renewal evidence links, and notification destinations have before/after parity; hidden detail is
  reachable in at most one labelled disclosure path from its owning surface.
- **AC-S87-5** — Tests materialize every state code listed for SF-01 through SF-30 and reject every
  truth/copy/recovery mismatch. In particular, a connection-store failure, zero Spaces/users,
  filtered-zero renewals, missing ticket, ambiguous action, and provider timeout render their mapped
  distinct states; no fixture fabricates zero, disconnected, reviewer availability, permission, safe
  retry, or completion.
- **AC-S87-6** — Vendor list/detail use defined shared styles, show account and Sign out, handle busy/
  failure, clear only vendor session on success, and preserve direct assigned-ticket guards.
- **AC-S87-7** — Search/source scans reject retired visible `Console`/`Spaces` terminology in the
  scoped user-facing locations after S84; S87 consumes that result and does not own a second rename
  implementation. Compatible routes and internal data identifiers remain unchanged.
- **AC-S87-8** — Provider/store/action spies prove opening disclosures, help, tabs, filters, or moved
  detail causes no workflow transition, source write, role grant, connection check, or client send.
- **AC-S87-9** — `ARCH-S87-5` runs the complete managed Editor/Admin surface/state matrix on the exact
  candidate and the bounded stable post-promotion path. Any console error, unhandled rejection,
  unexplained same-origin failure, route 5xx, missing terminal, blank region, dead destination,
  guard drift, content-bearing evidence, or unverified error-delivery path fails the cohort and
  restores the captured predecessor.
- **AC-S87-10** — SF-26/SF-27 fixtures consume S91's one source generation and reject missing-rent-to-
  zero, catch-to-empty/no-proposal, desk/workspace/assistant status or blocker drift, stale post-write
  state, hidden default scope, undiscoverable/invalid filter loss, unvalidated blocker/source link, or
  an S97/S98 Review/Confirm control outside its selected owning phase. Candidate and post-promotion
  read-only reconciliation must report zero mismatches and no customer values.
- **AC-S87-11** — Every materially changed cohort passes its maximum supported row/result fixture with
  no per-row provider/store request, repeated source load, unbounded DOM/event growth, runtime timeout,
  missing pending feedback, or page overflow, plus the full keyboard/touch/screen-reader/forced-color/
  reduced-motion/320-pixel/200%-zoom matrix. Aggregate timing is recorded, but no unevidenced latency
  promise is presented to users.

**Forbidden actions / hard gates.**

Do not mechanically delete all paragraphs; hide essential meaning; remove a capability based on
assumed frequency; invent analytics, routes, source facts, provider details, roles, actions, reviewers,
or official brand copy; expose raw evidence/PII/secrets; turn Communications into a general inbox;
send client communication; execute a RentVine/Sheet/cloud effect; bypass S36 or S82-S100 ownership; or
edit protected auth/action-gate/budget paths without explicit owner direction.

**Dependencies / sequencing.**

Close S96 first, then implement S85 and S86 foundations. Preserve the exact S83 → S84 → S82 order and
make S85/S86 presentation prerequisites for those product migrations. S87 implementation is last in
the canonical unattended queue so every owner contract is concrete before content is removed. Its
six cohorts remain separately reversible and ordered: public/vendor; Dashboard/My Work; Internal
Processes/processes/runs; Maintenance/Communications/Notifications; Connections/Admin/Approval;
renewal conformance. S87-wide `ALL_GATES_GREEN` requires S36, every owning S82-S100 contract, the
S88-S95 SF-06 result, S91 projection/source reconciliation, S89/S93/S95 authenticated browser and
error-delivery evidence, and all six cohorts. Do not hold safe copy classification on unavailable
analytics; usage-based claims remain unmade.

S101 starts only after S87 is green. It may expand deterministic read-only assistant coverage, but
no S101 intent, domain adapter, help example, or copy belongs in the S87 migration. Broader executable
assistant actions require a separate future exact-action program and are not implied by S87 or S101.

**Standalone delivery contract.**

- **Deliverable now:** complete content/surface/state manifests, six bounded migration cohorts,
  explicit empty/recovery behavior, Admin/Connections organization, vendor shell/sign-out, and
  accessibility/theme/preservation checks can be specified without provider writes or usage
  analytics. The full suite reaches `ALL_GATES_GREEN` only after S36, S82-S100, the applicable S88-S95
  Dashboard contracts, and every cohort pass their deterministic gates.
- **Consumes:** S36 and S82-S100, including S88-S95 for SF-06. A cohort whose required owner is absent
  remains current and fail-closed while unrelated cohorts proceed; moved content never points to a
  guessed route.
- **Externally blocked effect:** claims that usage, task time, first-click success, or user preference
  improved require separately gathered analytics/moderated evidence. They do not block structural
  and accessibility conformance but remain unclaimed.
- **Produces for downstream suites:** stable surface IDs, content-disposition manifest, page hierarchy,
  state/recovery contract, authenticated stability evidence, and before/after preservation evidence.
  S101 consumes those stable owning surfaces only after S87 closes.

**Verification and delivery contract.**

1. Freeze the 29 current audited experiences plus S83's delivered SF-30, six aliases, route/actor/
   state matrices, one primary outcome per surface, bounded task regions and action emphasis per
   state, persistent content blocks, actions, facts, and representative desktop/narrow screenshots
   before edits.
2. Materialize fail-first manifest completeness, all 30 state truth/copy/recovery rows, CB survivor/
   destination parity, one-outcome/region-action cardinality, required-content preservation,
   vendor-session, terminology, theme, and accessibility checks.
3. Migrate one cohort at a time. Compare populated and every applicable non-happy state. Record
   representative-user review when available as nonblocking rollout evidence; deterministic
   preservation checks govern whether compatibility presentation can be deleted.
4. Run focused tests and `bash scripts/verify.sh`; inspect the diff; audit secrets/PII, routes, roles,
   action gates, provider calls, runtime, and content ownership before authorized delivery.
5. Report one implementation terminal state: `ALL_GATES_GREEN`; `BUDGET_EXHAUSTED` only if a future
   user supplies an explicit budget; or `BLOCKED` only for one exact unavailable input/authority after
   every independent fail-closed path is complete. Usage/task-frequency evidence and human review are
   separate rollout evidence and never implementation terminal names.

**Ordered prompt sequence.**

1. Re-verify route/surface/state/action inventory and active S36/S82-S100 ownership.
2. Freeze and classify every persistent explanatory block, primary outcome, task region/action state,
   and applicable state truth/copy/recovery; add fail-first manifest/preservation checks.
3. Implement shared hierarchy/state composition without deleting product copy.
4. Migrate the six cohorts in order, deleting old blocks only after each cohort passes.
5. Falsify with role, source, error, narrow, keyboard, theme, and exact-action matrices; run canonical
   verification and update current docs.

**Deletion/merge recommendation.**

Remove S87 when all 30 target experiences and six aliases have complete outcome/task-region/state/block
evidence, every changed CB destination and `PRESERVE-V1` default passes parity, all cohorts pass
deterministic review, old duplicate/internal prose and compatibility styles are gone, and code/tests/
current facts own the final hierarchy without depending on this narrative. Human review remains
separately recorded rollout evidence and is not required to retire the specification.
