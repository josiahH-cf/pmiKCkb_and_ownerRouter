# Active feature suites

This directory contains only current operating contracts, genuine unfinished work, and one explicitly
unauthorized proposal. Completed and superseded suite narratives were removed from the active tree on
2026-08-26 and remain recoverable from Git at `1356918`.

## Canonical S82-S96 unattended implementation queue

This is the only enqueueable order for the 2026-08-31 UI/UX and Dashboard initiative. Bundle-local
tables below are ownership/dependency summaries, not additional queue entries. Each suite executes
once. A failed prerequisite stops the queue; a join row is verification, not a second suite run.

Approved direction, preserved verbatim: **Close UX-005 before visual expansion. Then use S83 for
access and authority relocation, S84 for primary navigation, and S82 for renewal desk/workspace
changes. No P1–P3 score is assigned without task-frequency evidence.**

| Order | Suite / gate                                                | Prerequisites                        | Exact completion gate before advancing                                                                                                                         |
| ----: | ----------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     0 | Documentation readiness gate — **COMPLETE**                 | Current baseline inspected           | Closure `081fa90071170054e53a2182a68466fbccf4ebf4` passed aggregate CI `33425658400`; pointer-only handoff armed S96; no feature implementation or deployment. |
|     1 | S96 — Safe connector disconnect and reconciliation          | Gate 0                               | `ALL_GATES_GREEN`, served first-click inertness/readback green, and no live credential destroy required.                                                       |
|     2 | S85 — Global theme and visual system                        | S96                                  | Technical implementation `ALL_GATES_GREEN`; separate `brand_conformance: BLOCKED` is recorded without claiming official brand.                                 |
|     3 | S86 — Action feedback, help, and safe recovery              | S85, S96                             | Shared interaction gates green and the complete S96 preservation suite still green.                                                                            |
|     4 | S83 — Capability-guided Admin access requests and approvals | S86                                  | Catalog/request/Admin-lane/apply/readback gates green; no self-grant or generic queue mirror.                                                                  |
|     5 | S84 — Navbar dropdown navigation                            | S83, S85, S86                        | Actor/Space, disclosure, terminology, utility-preservation, responsive, and route gates green.                                                                 |
|     6 | S82 — Table-first renewal desk and guided lease workspace   | S83, S84, S85, S86                   | Projection/query/privacy/link/workspace/compatibility gates green, including opaque party keys and bounded date ranges.                                        |
|     7 | S88 — Deterministic assistant query foundation              | S82/S83 route contracts available    | Strict registry, public/private carrier, filter/notice/result, zero-write, and preservation gates green.                                                       |
|     8 | S89 — Assistant privacy, observability, and cost controls   | S88                                  | Privacy-safe Ask baseline deployed and established as the rollback floor; budgets/cancellation/evaluations green.                                              |
|     9 | S90 — Assistant Work, approval, and access adapters         | S83, S88, S89                        | Actor/source/availability/link/no-effect matrices green.                                                                                                       |
|    10 | S91 — Assistant renewal query adapter                       | S82, S88, S89                        | Canonical date/range/blocker/party-link/cancellation/source matrices green.                                                                                    |
|    11 | S92 — Assistant knowledge and grounded narration            | S88-S91                              | Knowledge adapter, minimized input, bounded citation/narration, deterministic fallback, and no-action gates green.                                             |
|    12 | S94 — Assistant human-confirmed action proposals            | S88, S89, S91                        | Backend/projector/token/Review/Confirm/readback gates green against strict S93-slot fixtures; no UI exposure yet.                                              |
|    13 | S93 — Dashboard assistant streaming and linked results      | S85, S86, S88-S92, S94               | Complete stream/UI implemented once against real S94; atomic finalization, correction bounds, accessibility, and preservation green.                           |
|    14 | S93/S94 integration verification gate                       | S93, S94                             | Candidate, Review, Confirm, cancellation, receipt, refusal, response-loss, terminal-size, and accessibility integration green; no suite re-executes.           |
|    15 | S95 — Minimal Dashboard composition and relocation          | Gate 14, S84, S87 specified manifest | Atomic `/`/`/ask` cutover, destination parity, no eager legacy reads, and non-destructive coverage compatibility green.                                        |
|    16 | S87 — Product-wide content hierarchy and decluttering       | S82-S86 and S88-S96 implemented      | Six ordered cohorts, exact CB authority, all preservation/state/route/accessibility gates, and final end-to-end verification green.                            |

Gate 0 completed once through the audited specification closure
`081fa90071170054e53a2182a68466fbccf4ebf4`, whose local canonical verification and exact-SHA
aggregate CI run `33425658400` passed, followed by the pointer-only queue handoff. Neither step
deployed or changed a production feature. Do not repeat the audit or documentation-readiness gate.
From a green checkout of the armed queue, begin S96 from `docs/loop-state.md`; do not begin S85 until
S96 reaches its completion gate.

Default execution is serialized because suites update shared registries, shell components, and
governance docs. The sole optional parallel group is bounded S90 and S91 domain work in isolated
worktrees after S82, S83, S88, and S89 are green, with one integration owner and serialized central
registry/schema edits and delivery. All shared-checkout work; facts/status/plan/loop-state updates;
S96/S85/S86; S83/S84/S82; S82/S91; S94/S93; S95/S87; and every join gate remain serialized.

Every suite uses only `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED`, or `BLOCKED` as its implementation
terminal. `BUDGET_EXHAUSTED` is unavailable unless a user supplies an explicit run budget. `BLOCKED`
names one exact unavailable input/authority only after all independent fail-closed work is complete.
Brand sign-off, human litmus, live-vault proof, and runtime source availability are separately named
evidence and do not create custom terminal states. For each code delivery, freeze fail-first and
preservation evidence, run focused adversarial checks, `bash scripts/verify.sh`, and
`npm run test:e2e:core`; audit secrets/PII/protected paths/runtime/effects/diff; commit/push and require
exact-SHA CI; then use the existing zero-traffic candidate, exact smoke/promotion/readback/rollback
contract for served code. No dependent starts after any failed gate.

## Dashboard assistant and minimal-home bundle

S88-S95 are the implementation contracts for the 2026-08-31 Dashboard AI-integration and
decluttering notes. Current production still renders the `Console` implementation at `/` and `/ask`:
one buffered knowledge-RAG form plus an action deck, anticipated renewals, process strip, and live
renewal data. Operational app-state reads exist beside Ask but do not feed its model or response.
S82-S96 remain specified and not implemented. The desired Dashboard and assistant behavior below
must not be described as current truth until its own implementation/readback passes.

### Intent-to-outcome ownership

| User intent                                                               | Owning suite(s) | Required outcome boundary                                                                                                                                                     |
| ------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ask operational questions without making the model authoritative          | S88             | Closed server intent registry, actor-scoped adapters, typed evidence/completeness, canonical route refs, deterministic final result, and zero mutation on query               |
| Keep operational AI private, bounded, observable, and affordable          | S89             | Session-only transcript, bodyless telemetry, request/context/model budgets, timeouts/cancellation, prompt/data minimization, evaluations, and rollout/rollback gates          |
| Ask about blocked/due My Work, decisions, submitted requests, and access  | S90             | Actor-owned work, availability-aware decision state, requester-history registration, current-session access, and S83 integration without generic approval inference           |
| Ask which renewals are upcoming or blocked                                | S91             | Canonical renewal-desk orchestration, exact Kansas City date windows, S82 blocker truth/compatibility, complete/partial source state, and exact lease/table destinations      |
| Preserve grounded knowledge answers and add safe narration                | S92             | Current source-state/citation protections as one adapter, mandatory answered-result narration, an optional one-call model path, schema validation, and deterministic fallback |
| Use a simple chat-like Dashboard assistant with linked structured results | S93             | AI-labelled composer, session-local exchange stack, truthful streamed stages/result groups, terminal states, accessibility, safe new-tab links, and no process picker         |
| Create one supported app task only after human confirmation               | S94             | One exact renewal-to-self My Work task, stateless Review/Confirm, stable source identity, idempotency/readback, and inert S83/owning-domain navigation handoffs               |
| Reduce the Dashboard to AI and one clickable My Work handoff              | S95             | Final `/`/`/ask` cutover, removal of obsolete panels and eager reads, exact relocation/parity gates, and user-facing Space Coverage lane retirement                           |

### Current-to-desired boundary decisions

| Rough-note phrase or current behavior                        | Governing resolution                                                                                                                                                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Feed every application component into the model`            | V1 exposes only the closed S90-S92 adapter catalog. Adapters authorize facts before the optional model-backed narration call; deterministic narration always exists for answered results. There is no arbitrary database reflection or model tool loop. |
| `Show the thinking process`                                  | S93 shows truthful execution stages and a `How this was checked` receipt. Hidden chain-of-thought, prompts, reasoning tokens, and source instructions are never exposed or stored.                                                                      |
| `Show a confidence score`                                    | Use deterministic `Complete coverage`, `Partial coverage`, or `Unavailable` plus source/as-of/truncation truth. No uncalibrated model-confidence percentage is shown.                                                                                   |
| `Create tasks`                                               | Current Ask `Capture Task` creates a KB Placeholder and is intentionally removed from Dashboard. S94 creates one real self-assigned My Work task only from an exact reviewed renewal candidate through the owning Work service.                         |
| `Request approvals`                                          | Read decisions and requester-visible domain requests. S83 owns access requests; other approvals use an existing owning workflow or refuse. No generic model-authored queue item exists.                                                                 |
| Current process selection starts a run when Ask is submitted | S93 removes the picker and a Dashboard question never starts a run. V1 assistant actions do not start/cancel workflows; explicit run controls remain on owning Process pages.                                                                           |
| `Open all upcoming renewals in new tabs`                     | Each deliberate result activation opens one validated destination in a new tab. No automatic or bulk popup behavior is added.                                                                                                                           |
| `Remind me`                                                  | The current query may return an on-demand recap. No scheduled/background reminder, monitor, autonomous notification, or client communication is authorized.                                                                                             |
| `Space Coverage goes nowhere`                                | S95 retires the aggregate user-facing Dashboard/notification/preference/query lane after compatibility checks; Internal Processes keeps its own truthful card-state computation.                                                                        |
| ChatGPT/Gemini-style history                                 | S93 keeps only the current page-session exchange stack and routes each question independently. Durable transcript/memory requires a separate retention/access/deletion contract.                                                                        |

### Dependency summary (not a second queue)

| Order | Suite(s)         | Standalone output before the next stage consumes it                                                                                                                |
| ----- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1    | S88              | Versioned query/intent/adapter/evidence/link/terminal-state foundation, closed private projector carrier, and a read-only deterministic result                     |
| A2    | S89              | Privacy-safe legacy Ask baseline, bodyless telemetry, session-only transcript boundary, cost/abuse/cancellation controls, adversarial evaluation, and rollout gate |
| A3    | S90/S91          | Closed Work/decision/request/access and renewal adapters after their S83/S82 prerequisites                                                                         |
| A4    | S92              | Knowledge adapter plus bounded mandatory narration over completed operational adapters                                                                             |
| B     | S85 then S86     | Theme foundation followed by link/action/progress/dialog/notice/focus/transient-state primitives while preserving S96                                              |
| J1    | S94              | One exact renewal-to-self task backend against strict S93-slot fixtures; S83/access and other approval actions remain inert owning-route handoffs                  |
| J2    | S93              | Complete streamed Dashboard core, mandatory narration, real S94 candidate/Review/Confirm/receipt/recovery, and `not_applicable` for ineligible results             |
| J3    | integration gate | Cross-suite S93/S94 verification only; no suite executes twice                                                                                                     |
| J4    | S95              | Dashboard cutover and old-panel/eager-read removal after the complete AI region, My Work handoff, and relocation/compatibility evidence pass                       |

The canonical queue above requires S83/S82 before S90/S91 and S90/S91 before S92 so the unattended
end state is complete rather than compatibility-partial. Absence fixtures remain rollback tests, not
the desired terminal. S95
removes no current Dashboard capability until its
named destination and compatibility evidence exist. Neither model availability nor a UI label can
open an action key, grant a role/Space, create an approval, send a client message, or write RentVine/
the operating Sheet.

## Long-term UI/UX integration bundle

The 2026-08-31 audit workbench at `docs/evidence/ui-ux-audit-2026-08-31.html` covers 29 distinct
user-facing experiences across 36 routes plus six renewal aliases. It is source/test/documentation
evidence, not a production usability certification: no authenticated browser session, analytics,
support corpus, or moderated user study was available. The audit's reviewer choices record direction
only and do not authorize implementation or external effects.

S85-S87 and S96 are the global implementation contracts. S82 owns renewal desk/workspace behavior. S83 owns
access requests, grants, and supported connector read-check business behavior. S84 owns navbar
destinations, visible terminology, and within-navbar disclosure behavior. S85 owns theme and visual
roles. S96 solely owns connector disconnect/reconciliation. S86 owns shared interaction feedback,
cross-family transient coordination, and connection-store degradation presentation. S87 owns general content hierarchy and
placement; the newer S88-S95 bundle is the specialized owner for Dashboard SF-06, assistant
behavior, and the aggregate user-facing Space Coverage retirement.

### Intent-to-outcome ownership

| User intent                                                         | Owning suite(s) | Required outcome boundary                                                                                                                                     |
| ------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Support coherent Light and Dark modes across the whole application  | S85             | Device/Light/Dark choice, pre-paint resolution, semantic theme roles, contrast/non-color gates, Appearance utility, and a bounded all-surface migration       |
| Make buttons, links, hover, icons, and state visibly understandable | S85/S86         | Theme-aware action hierarchy plus shared link/icon/focus/hover/active/disabled/busy/error/success behavior without color-only or hover-only meaning           |
| Show honest loading and completion                                  | S86/S83         | Immediate busy feedback, indeterminate progress when no real fraction exists, verified success only after readback, and S83-owned supported connection checks |
| Put supplementary descriptions behind accessible contextual help    | S86             | Explicit focus/tap trigger, 600 ms fine-pointer hover, Escape/focus return, touch support, and no essential label/state/safety/error hidden                   |
| Prevent and recover from connector disconnection                    | S96             | Cancel-first exact confirmation, versioned pending/revoked lifecycle, vault outcome, receipt/readback, response-loss recovery, and replacement safety         |
| Prevent and recover from other consequential actions                | S86             | Effect tiers, accessible feature-specific confirmation, preserved exact-confirm contracts, and S96 preservation                                               |
| Remove persistent clutter across product surfaces                   | S87/S95         | S87 owns the global manifest; S95 supplies the later Dashboard disposition/relocation ledger and removes no region before destination parity                  |
| Preserve self-explanatory navbar destination descriptions           | S84/S87         | S84's concise descriptions remain visible inside opened navigation panels; the no-persistent-subtext rule applies to nonessential page exposition             |
| Keep overlapping product behavior explicitly owned                  | S82-S96         | S82 renewal; S83 access; S84 navigation; S85 theme; S86 interaction; S87 placement; S88-S95 assistant/Dashboard; S96 connector disconnect                     |

### Source-conflict resolutions

| Context statement or proposal                      | Governing resolution                                                                                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove all persistent subtext                      | Remove nonessential explanatory prose. Labels, current source/state, blockers, validation, safety consequences, exact confirmation, errors, recovery, and AT text stay.   |
| Show description after a two-to-three-second hover | Supplementary help opens immediately on focus/tap/click and after 600 ms fine-pointer hover. Essential meaning is never hover-only; S84's 350 ms nav timing is unchanged. |
| Show a loading bar while checking a connection     | Use S83's truthful indeterminate check feedback because supported probes expose no measurable fraction; green appears only after verified success.                        |
| Add another supporting PMI color                   | No official supporting color is available. Neutral and functional state colors remain semantic UI colors, not claimed brand assets.                                       |
| Reverse white and black for dark mode              | Dark mode uses a complete semantic palette with distinct canvas/surface/border/action/status roles; it is not a literal inversion.                                        |
| Keep the product fully usable while simplifying it | Content disposition is evidence-led and capability-preserving; no feature is removed based on assumed low usage or a paragraph-count quota.                               |

### Dependency summary (not a second queue)

| Order | Suite | Standalone output before the next suite consumes it                                                                                                 |
| ----- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | S96   | UX-005 connector-disconnect closure before visual expansion                                                                                         |
| 1     | S85   | Semantic Light/Dark foundation, Appearance utility, shared visual roles, contrast gates, and 29-experience theme ledger                             |
| 2     | S86   | Interaction primitives, contextual help, honest async states, effect inventory, S96 preservation, and shell/notification stabilization              |
| 3     | S83   | Capability/access requests and S83-owned connection-check behavior using the shared presentation                                                    |
| 4     | S84   | Three-group navigation consuming S85 Appearance and S86 transient-layer behavior                                                                    |
| 5     | S82   | Renewal table/workspace consuming S83 access plus S84 navigation and S85/S86 presentation                                                           |
| final | S87   | Six ordered surface-content cohorts after every owning S82-S86 and S88-S96 contract is implemented; its Dashboard cohort consumes delivered S88-S95 |

Unavailable official brand assets do not block the accessible semantic foundation, but they keep
S85 `brand_conformance` and final production-brand sign-off blocked until approved assets are supplied
and revalidated. Missing analytics block only usage-based claims, not directly evidenced
duplication, state, accessibility, or recovery corrections. No suite opens an action key, adds a
provider effect, changes a role/Space grant, sends a client message, or writes RentVine/the operating
Sheet.

The canonical shared-checkout run serializes S84 before S82 and executes S87 last.

## Global navigation UX bundle

S84 is the implementation contract for the 2026-08-31 navbar redesign. It consumes S81's deployed
task destinations, S85 visual roles/Appearance utility, S86 icon/transient behavior, and S83's
specified all-staff access destination/Admin-only approval lane; it changes navigation presentation
and terminology without changing route authority, notifications, data, or provider effects.

### Intent-to-outcome ownership

| User intent                                                   | Owning suite | Required outcome boundary                                                                                                                                      |
| ------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Consolidate the flat navbar into three dropdowns              | S84          | Exactly My Work, Operations, and Admin disclosure groups with the requested three ordered destinations in each                                                 |
| Explain every destination with icon, color, text, and subtext | S84          | Full-row links, exact copy, unique local icons, group-coded non-status treatments, and non-color hover/focus/current feedback                                  |
| Rename Console and Spaces                                     | S84          | User-facing Dashboard/Internal Processes navigation and landing context over unchanged `/`, `/ask`, and `/spaces` routes and internal data terms               |
| Make hover intuitive without excluding keyboard or touch      | S84          | 350 ms fine-pointer preview, immediate click/tap/keyboard, WCAG disclosure semantics, Escape/persistence, and a narrow Menu/accordion presentation             |
| Preserve role/Space boundaries and top-level utilities        | S83/S84      | Actor-filtered links, Admin-without-Renewals access-queue route, unchanged direct guards, and unchanged notification/role/sign-out/brand/environment functions |

### Dependency summary (not a second queue)

| Order | Suite | Standalone output before the next suite consumes it                                                                                                            |
| ----- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | S96   | Required UX-005 closure before visual expansion                                                                                                                |
| 1     | S85   | Semantic navigation roles and the Appearance utility                                                                                                           |
| 2     | S86   | Shared Icon rendering and cross-family transient-layer coordinator                                                                                             |
| 3     | S83   | All-staff `/admin/access`, Admin-only access-request queue reachability, and the shared pending-count projection                                               |
| 4     | S84   | Actor-filtered navigation manifest, desktop/mobile disclosure behavior, nine destination glyph keys, terminology aliases, and accessibility/preservation proof |

The Navbar Gallery collections are inspiration only. S84's W3C/USWDS/research-informed interaction
contract, current route guards, and repository design tokens govern implementation. Neither suite
authorizes a role, Space, action, source, provider, notification, or client-communication effect.

## Renewal UI/UX overhaul bundle

This is the implementation contract for the 2026-08-31 lease-renewal decluttering, navigation, and
centralized-access request. The context note is intent evidence; the router, live readback, committed
code/tests, and `docs/facts.md` retain their normal precedence. Both suites marked
`feature-handoff: renewal-ui-guidance-v2` are standalone fail-closed slices, with S83 implemented
first so S82 can remove renewal authority without leaving an inaccessible handoff.

### Intent-to-outcome ownership

| User intent                                                            | Owning suite(s) | Required outcome boundary                                                                                                                                                                          |
| ---------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replace the renewal front page with a sortable/filterable lease table  | S82             | One semantic table, each lease once, required RentVine/identity/status/verification/action columns, column-owned controls, stable URL state, and no separate search/filter panel                   |
| Bring lease data and every current blocker forward                     | S82             | Location, owner, tenant, renewal date, RentVine current base rent, overall status, rent verification, and direct blocker/action links come from one bounded source/evidence projection             |
| Make all six phases and verification/evidence statuses clickable       | S82             | URL-backed internal phase targets and exact validated source destinations; navigation never verifies, advances, writes, or guesses an external URL                                                 |
| Show only current blockers while retaining stable backend workflows    | S82             | Every current causal blocker is linked from the table/current phase; operational substeps, rules, roles, and background diagnostics leave the default surfaces but remain in the evidence contract |
| Modernize contrast, active/blocked states, counts, and orange actions  | S82/S83/S85/S86 | S85 semantic roles and S86 interactions, one clear accent action, labelled non-color states, AA contrast, keyboard/focus, responsive, zoom, target-size, and reduced-motion checks                 |
| Move renewal authority into unified Admin and let staff request access | S83             | Capability-first requests derive the least existing role/Space bundle, enter an Admin-only Access lane, and apply only after exact claim readback and reconciliation                               |
| Make messaging and renewal-data connection actions obvious             | S83             | Orange group actions navigate to S81 anchors; only RentVine, Google Sheets, and RentCast run their existing read-only checks with honest pending/pass/fail UI                                      |

### Source-conflict resolutions

| Context statement or proposal                                                 | Governing resolution                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Remove roughly 80 percent of what is on screen                                | The workspace retains the 20-percent explanatory/operational copy budget. The newer desk requirement deliberately increases structured table data while removing duplicate cards, controls, steppers, metrics, and prose |
| Only blocking steps remain on the front end                                   | The table shows every current causal blocker and one action when unblocked; the workspace shows the current action/selected phase. The full evidence engine remains backend truth                                        |
| Clicking `Needs Verification` or a verified source should take the user to it | The click opens an exact in-app comparison or server-validated source URL. It never changes verification state; missing or untrusted URLs fail closed to the in-app destination                                          |
| “Sale data” should be brought forward                                         | The user clarified that this meant lease data. S82 adds no property-sale field, provider, query, or workflow                                                                                                             |
| “Lease price” should be visible                                               | S82 shows the current contractual base rent from the canonical RentVine export. It does not substitute the Sheet, recurring charges, comps, suggestions, or a proposed/approved renewal offer                            |
| Renewal authority is unique per user and all capabilities are requestable     | Every existing base capability is visible; a missing capability request derives the least higher Editor/Approver/Admin plus exact Space bundle. No S64 override, new role, or action-key grant is created                |
| Admin approvals should never become an access-request blocker                 | Valid requests enter one unassigned Admin pool immediately, preserve current access, allow independent intents and revised requests, and expose recovery; restricted work still waits for verified Admin approval        |
| Check messaging/data connection with a spinner or green loading bar           | Group actions are navigation, not checks. Supported per-connector reads show an indeterminate spinner; green appears only after verified success. Gmail has no live verifier and cannot display a fabricated check       |

### Dependency summary (not a second queue)

| Order | Suite | Standalone output before the next suite consumes it                                                                                                                   |
| ----- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | S96   | UX-005 connector safety closure before visual expansion                                                                                                               |
| 1     | S85   | Semantic Light/Dark roles used by renewal and Admin presentation                                                                                                      |
| 2     | S86   | Shared action, link, status, progress, notice, and safe-confirmation presentation preserving S96                                                                      |
| 3     | S83   | Capability catalog and handoffs, per-user access requests, Admin-only queue lane, exact merged-claim/readback lifecycle, and truthful connection actions/check states |
| 4     | S84   | Primary navigation and final Dashboard/Internal Processes terminology                                                                                                 |
| 5     | S82   | Enriched lease projection, table-owned sort/filter, persistent return state, direct blocker/source links, and selected-phase guided workspace                         |

Each suite must establish fail-first behavior and preservation evidence before implementation, run
focused actor/state/link/failure/accessibility falsification, then run `bash scripts/verify.sh`.
Unavailable external mappings remain exact internal fallbacks rather than blockers to the local UI
slice. Neither suite authorizes a source write, client send, action-key change, S64 grant, or provider
endpoint inference.

## Renewal stabilization implementation bundle

This is the exact fresh-context bundle for the 2026-08-28 renewal-stabilization request. The intake
note and 2026-08-26 PMI/Cherry Bridge meeting record are intent evidence, not executable instructions.
The router, live readback, committed code/tests, and `docs/facts.md` retain their normal precedence.
Every member marked `feature-handoff: renewal-stabilization-v2` is independently implementable: an
unavailable adjacent feature or external approval must become an explicit unset/refusal state, not an
excuse to invent data or leave the local contract ambiguous.

### Intent-to-outcome ownership

| User/meeting intent                                                                | Owning suite(s)   | Required outcome boundary                                                                                                                                                              |
| ---------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Make preview/create reliable and fix the boolean-versus-exact-confirm failure      | S77               | One shared exact-confirm contract, input invalidation, and one-attempt reconciliation; unsent draft only                                                                               |
| Accept currency/number inputs without misclassifying them as confirmation booleans | S77               | Parsed positive numeric offer fields remain numbers across component/route/service while `confirm` is absent for preview or the exact object for create                                |
| Explain RentCast web/app differences and make the reference result defensible      | S59               | Complete source-to-query provenance, two-mile/15-request policy, cache identity, evidence display, base rent kept separate from the human offer                                        |
| Reduce ordinary renewal-work approval friction without weakening safety            | S80               | One role/Space/effect matrix; Editor ordinary app work, stronger approvals/configuration unchanged, exact action gates still independent                                               |
| Represent the real process and its many substeps                                   | S72               | Exactly six versioned steps with substep evidence, branches, reopening, and base-rent semantics                                                                                        |
| Make waiting, last contact, and due work obvious                                   | S75               | One source-backed projection; timing remains unset until client-confirmed and never triggers outreach                                                                                  |
| “Watch” the created draft and import later communication truth                     | S75               | Deliberate targeted linked-thread refresh with cursor/idempotency evidence; continuous watch/polling remains retired                                                                   |
| Make current-month and in-progress work easy to find in a dense usable desk        | S78               | One canonical Live worklist with explicit search/sort/filter/null rules and renewal-scoped accessibility/density behavior                                                              |
| Stabilize owner/tenant copy, optional AI tailoring, and channel truth              | S74               | Approved versioned templates, immutable fact envelope, bounded operator-invoked rewrite, deterministic fallback, draft/contact states kept separate                                    |
| Put the reviewed comp screenshot in the owner Gmail draft                          | S79               | Receipt-bound one-image MIME attachment behind the still-closed Drive action; no general Drive or attachment primitive                                                                 |
| Make authentication, connection readiness, and Admin controls findable             | S81               | Task-oriented status/index navigation that preserves every existing permission and ownership boundary                                                                                  |
| Prove both process behavior and number/evidence behavior on four real cases        | S63               | Two separately reported verdict families, immutable exact app evidence, source-read-only execution, human verdicts not model-filled                                                    |
| Verify the operating Sheet/RentVine reads and reconcile conflicting facts          | S72/S63           | Fresh exact source snapshots and explicit conflict dispositions; no source write is inferred from a successful read                                                                    |
| Reach the exact RentVine write seam without pretending it is authorized            | S30               | Deployed closed/fail-first one-lease `endDate` boundary; live proof only after separate designation and protected owner direction, followed by rollback and mandatory gate restoration |
| Reach documents and Dotloop after renewal stabilization                            | S72, then S66/S34 | S72 exposes exact blocked document substeps and hands off to the existing S66/S34 contracts; no guessed catalog, OAuth, mapping, or completion claim                                   |

### Source-conflict resolutions

| Context statement or proposal                                                | Governing resolution                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automated three-day owner/tenant follow-up or broad multi-channel automation | S75 may compute/display due work only after confirmed policy. No scheduled, model-triggered, bulk, or autonomous client communication is permitted.                                                                                                             |
| Proposed 45-day signature follow-up                                          | It remains non-operative until entered as client-confirmed policy; no default is inferred from meeting notes.                                                                                                                                                   |
| A fake tenant/test identity or an informal property mention for a live proof | Production is Live-only and fake/sample identities cannot create drafts or writes. S63 uses the securely configured four real read-only cases; S30 needs a separately explicit client-designated live lease, date pair, managed actor, and protected direction. |
| Treating an existing recurring-charge POST as a complete S30 proof seam      | S30 executes only one lease `endDate`. Recurring-charge proof remains unreachable until exact provider readback is verified; no endpoint or state mapping is guessed.                                                                                           |
| “Hide the Sheet row” as proof of completion                                  | The operating Sheet write key is closed. App completion and provider/Sheet completion remain different facts; only a separately authorized receipt/readback may establish a source write.                                                                       |
| Write to the operating Sheet while stabilizing renewal                       | The operating Sheet remains read-only. S76 owns the distinct-copy compare-and-set rehearsal and is intentionally outside this implementation bundle until the required copy exists.                                                                             |
| Send owner/tenant messages from the application                              | The terminal client-facing effect is an unsent Gmail draft. A person sends from Gmail; direct application send keys remain permanently closed.                                                                                                                  |

### Required sequence and standalone outputs

| Order | Suite | Standalone output before the next suite consumes it                                                           |
| ----- | ----- | ------------------------------------------------------------------------------------------------------------- |
| 1     | S77   | Shared preview/confirm/reconcile contract with cross-layer checks                                             |
| 2     | S59   | Complete reference-query provenance, cache key, and visible evidence                                          |
| 3     | S80   | Tested renewal capability/effect matrix and exact refusals                                                    |
| 4     | S72   | Versioned six-step/substep state and evidence graph                                                           |
| 5     | S75   | Shared waiting/contact/due projection with unset-safe timing                                                  |
| 6     | S78   | Canonical searchable/sortable Live desk consuming explicit projections                                        |
| 7     | S74   | Versioned copy/fact-lock/optional-assistance contract; final publication may remain blocked on client copy    |
| 8     | S79   | Receipt-bound MIME attachment implementation; live storage remains closed until separately authorized         |
| 9     | S81   | Task-oriented Connections/Admin manifest and navigation                                                       |
| 10    | S63   | Secure exact-four read-only machinery; fresh report and real human review remain externally gated             |
| 11    | S30   | Green deployed one-lease `endDate` proof runner; separately authorized live proof remains an operational gate |

For each row, establish a clean-start readback, materialize its architecture and behavior tests before
implementation, keep preservation separate, run focused falsification, then run
`bash scripts/verify.sh`. Inspect the diff and audit secrets, PII, runtime descriptors, gates, and
scope before delivery. `ALL_GATES_GREEN` means that suite's independently deliverable implementation
is green; `BUDGET_EXHAUSTED` is valid only if an explicit budget exists; `BLOCKED` names the exact
external input/authority and affected acceptance checks after all other safe work is complete. A
green behind-a-closed-gate implementation is not a completed live proof, and a blocked live proof does
not block independent suites.

| Suite | Contract                                                                   | Present status                                                                               |
| ----- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| S30   | `docs/feature-suites/rentvine-write-activation.md`                         | Closed proof runner deployed; exact target and protected live review required                |
| S31   | `docs/feature-suites/gmail-watch-inbound.md`                               | Continuous watch retired; manual refresh and follow-up integration complete                  |
| S34   | `docs/feature-suites/dotloop-esign-activation.md`                          | Internal lifecycle complete; OAuth/catalog/exact provider mappings required                  |
| S35   | `docs/feature-suites/leadsimple-activation.md`                             | Internal lifecycle complete; selected account contract and credential required               |
| S36   | `docs/feature-suites/space-self-provisioning.md`                           | Fixed lifecycle complete; one owner-approved pilot packet required                           |
| S37   | `docs/feature-suites/nocode-page-builder.md`                               | Bounded operational-process builder complete and deployed                                    |
| S47   | `docs/feature-suites/resident-maintenance-intake.md`                       | App intake usable; internal channel lifecycle complete; official contract required           |
| S51   | `docs/feature-suites/production-operational-readiness.md`                  | Current production operating contract                                                        |
| S52   | `docs/feature-suites/production-cost-governance.md`                        | Complete and live-verified                                                                   |
| S53   | `docs/feature-suites/greenlight-activation-and-gate-integrity.md`          | Current per-key activation contract                                                          |
| S54   | `docs/feature-suites/verification-and-ci-parity.md`                        | Complete; canonical gate current                                                             |
| S56   | `docs/feature-suites/production-live-only-test-lane-retirement.md`         | Complete; current environment contract                                                       |
| S59   | `docs/feature-suites/rentcast-live-activation.md`                          | Complete and deployed; query/evidence/reference-only contract is preserved                   |
| S63   | `docs/feature-suites/four-lease-renewal-test-set.md`                       | Secure machinery implemented; fresh secure evidence and human review remain gated            |
| S64   | `docs/feature-suites/per-person-approval-authority.md`                     | Specified but NOT authorized                                                                 |
| S66   | `docs/feature-suites/lease-document-packet-truth-and-prefill.md`           | Truth machinery built; approved catalog/provider mapping required                            |
| S72   | `docs/feature-suites/renewal-step-model-and-workspace-defaults.md`         | Complete and deployed; exact six-step/evidence/compatibility model                           |
| S74   | `docs/feature-suites/tenant-offer-copy-and-channel-truth.md`               | Complete/deployed review-only boundary; approved wording/channel evidence remains            |
| S75   | `docs/feature-suites/renewal-follow-up-state.md`                           | Shared unset-safe projection built; live confirmed timing policy still external              |
| S76   | `docs/feature-suites/renewal-sheet-rehearsal-copy.md`                      | Admin configuration/proof seam complete; distinct copy and live proof required               |
| S77   | `docs/feature-suites/renewal-draft-preview-confirm-reliability.md`         | Complete and deployed; exact-confirm/reconcile contract is downstream foundation             |
| S78   | `docs/feature-suites/renewal-desk-triage-and-canonical-journey.md`         | Complete and deployed; canonical role-consistent desk/query/route contract is live           |
| S79   | `docs/feature-suites/renewal-comp-screenshot-gmail-attachment.md`          | Complete/deployed closed-safe receipt/MIME/readback path; live Drive effect blocked          |
| S80   | `docs/feature-suites/renewal-role-and-action-governance.md`                | Complete and deployed; exact role/Space/effect matrix is downstream foundation               |
| S81   | `docs/feature-suites/task-oriented-admin-connections-navigation.md`        | Complete and deployed; navigation/readiness does not grant authority                         |
| S82   | `docs/feature-suites/guided-renewal-desk-and-workspace.md`                 | Specified; table-first desk, persistence, and guided workspace are not implemented           |
| S83   | `docs/feature-suites/unified-admin-access-and-connection-actions.md`       | Specified; capability-guided Admin access workflow and connection UX are not implemented     |
| S84   | `docs/feature-suites/navbar-dropdown-navigation.md`                        | Specified; grouped descriptive navbar dropdowns and visible terminology are not implemented  |
| S85   | `docs/feature-suites/global-theme-and-visual-system.md`                    | Specified; semantic Light/Dark themes and global visual-system migration are not implemented |
| S86   | `docs/feature-suites/action-feedback-help-and-safe-recovery.md`            | Specified; interaction feedback, contextual help, and safe recovery are not implemented      |
| S87   | `docs/feature-suites/content-hierarchy-and-surface-decluttering.md`        | Specified; task-first content hierarchy and product-wide decluttering are not implemented    |
| S88   | `docs/feature-suites/deterministic-assistant-query-foundation.md`          | Specified; deterministic assistant query/evidence/link foundation is not implemented         |
| S89   | `docs/feature-suites/assistant-privacy-observability-and-cost-controls.md` | Specified; assistant privacy, telemetry, cost, and evaluation controls are not implemented   |
| S90   | `docs/feature-suites/assistant-work-approval-and-access-adapters.md`       | Specified; work, approval, submitted-request, and access adapters are not implemented        |
| S91   | `docs/feature-suites/assistant-renewal-query-adapter.md`                   | Specified; canonical upcoming/blocked renewal adapter is not implemented                     |
| S92   | `docs/feature-suites/assistant-knowledge-and-grounded-narration.md`        | Specified; grounded knowledge adapter and mandatory answered narration are not implemented   |
| S93   | `docs/feature-suites/dashboard-assistant-streaming-and-linked-results.md`  | Specified; streamed assistant conversation and linked result UX are not implemented          |
| S94   | `docs/feature-suites/assistant-human-confirmed-action-proposals.md`        | Specified; one human-confirmed renewal-to-self task action is not implemented                |
| S95   | `docs/feature-suites/minimal-dashboard-composition-and-relocation.md`      | Specified; minimal Dashboard cutover and capability relocation are not implemented           |
| S96   | `docs/feature-suites/safe-connector-disconnect-and-reconciliation.md`      | Specified; UX-005 safe connector disconnect/reconciliation is not implemented and is first   |

A status in this table is authoritative for planning. A suite body is the acceptance contract, not a
historical progress log.
