# Active feature suites

This directory contains only current operating contracts, genuine unfinished work, and one explicitly
unauthorized proposal. Completed and superseded suite narratives were removed from the active tree on
2026-08-26 and remain recoverable from Git at `1356918`.

## Canonical unattended implementation queue

This is the only enqueueable order for the 2026-08-31 UI/UX, source-of-truth writeback, Maintenance,
resident-channel, Space-pilot, and Dashboard initiative, as reordered by the owner's 2026-09-03
renewal-completion direction (rows 12-22 execute before S36 and the assistant program). Bundle-local
tables below are ownership/dependency summaries, not additional queue entries. Each suite executes once. A failed prerequisite
stops the queue; a join row is verification, not a second suite run.

Approved direction, preserved verbatim: **Close UX-005 before visual expansion. Then use S83 for
access and authority relocation, S84 for primary navigation, and S82 for renewal desk/workspace
changes. No P1–P3 score is assigned without task-frequency evidence.**

| Order | Suite / gate                                                                                                                                                     | Prerequisites                          | Exact completion gate before advancing                                                                                                                                                                                                                                                                            |
| ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|     0 | Documentation readiness gate — **COMPLETE**                                                                                                                      | Current baseline inspected             | Prior closure `081fa90071170054e53a2182a68466fbccf4ebf4` passed aggregate CI `33425658400`; the current owner-decision reconciliation closes all product questions and adds no feature implementation or deployment.                                                                                              |
|     1 | S96 — Safe connector disconnect and reconciliation — **COMPLETE**                                                                                                | Gate 0                                 | Focused/canonical/core-E2E/CI gates passed; exact zero-traffic candidate version/config/routes and no-target inertness passed; exact promotion/stable readback passed; no credential or vault effect ran.                                                                                                         |
|     2 | S85 — Global theme and visual system — **COMPLETE**                                                                                                              | S96                                    | Technical implementation `ALL_GATES_GREEN`; `brand_conformance` RESOLVED 2026-09-02 with the official extracted PMI Brand Style Guide values (orange #ff6d00, black, white, Poppins) live in production.                                                                                                          |
|     3 | S86 — Action feedback, help, and safe recovery — **COMPLETE**                                                                                                    | S85, S96                               | Shared interaction gates green and the complete S96 preservation suite still green.                                                                                                                                                                                                                               |
|     4 | S83 — Capability-guided Admin access requests and approvals — **COMPLETE**                                                                                       | S86                                    | Catalog/request/Admin-lane/apply/readback gates green; no self-grant or generic queue mirror.                                                                                                                                                                                                                     |
|     5 | S84 — Navbar dropdown navigation — **COMPLETE**                                                                                                                  | S83, S85, S86                          | Actor/Space, disclosure, terminology, utility-preservation, responsive, and route gates green; exact candidate/promotion/stable readback passed.                                                                                                                                                                  |
|     6 | S82 — Table-first renewal desk and guided lease workspace — **REOPENED: ACTIVE / UNRELEASED REMEDIATION**                                                        | S83, S84, S85, S86                     | The 2026-09-01 baseline is deployed. The reopened conformance slice closes source-projection, nullable-rent, auxiliary-read, filter, destination, and phase-placement gaps, then passes S51/S54 candidate and post-promotion assurance. Do not describe the remediation as deployed before that readback.         |
|     7 | S97 — Governed RentVine renewal writeback — **BASELINE DEPLOYED; INTEGRITY REMEDIATION ACTIVE / UNRELEASED**                                                     | S82 baseline, S83, S86                 | The three exact keys remain proof-qualified and open. Active-generation binding, full duplicate readback, fail-closed ambiguous-create handling, and reversal binding must pass the shared S51/S54 release gate; no live proof is rerun.                                                                          |
|     8 | S98 — Operating renewal Sheet append and fixed-row capability boundary — **BASELINE DEPLOYED; APPEND-ONLY INTEGRITY/CAPABILITY REMEDIATION ACTIVE / UNRELEASED** | S97 remediation                        | Both exact keys remain proof-qualified/open and the proof row remains absent. The hardened product path keeps server-derived append, lease-scoped generation/claim/history, and honest ambiguity; it refuses field update and fixed-row reversal until a stable provider seam exists. No proof mutation is rerun. |
|     9 | S99 — RentVine Maintenance work-order writeback — **COMPLETE / DEPLOYED**                                                                                        | S83, S86, S98                          | Official read/create/status contracts, exact mapping/catalog/preview/confirm/receipt/recovery/correction gates, live proof, activation, release, and readback are green; no notification, vendor, attachment, chat-post, or send effect was added.                                                                |
|    10 | S100 — RentVine work-order chat sync and resident draft — **BLOCKED**                                                                                            | S83, S86, S99                          | Chat sync is complete, proven, open, and deployed. The sole remaining blocker is a mapped resident with a verified email on a synchronized thread so the separately governed unsent-draft key can receive live proof and exact activation; no polling/webhook/chat-post/send is reachable.                        |
|    11 | S51/S54 — Production assurance expansion — **ACTIVE / UNRELEASED**                                                                                               | S82/S97/S98 remediation implementation | Deterministic candidate, managed Admin/Editor authenticated routes, source reconciliation, monitoring readback, CI fixture coverage, promotion, and five-minute observation all pass.                                                                                                                             |
|    12 | S102 — Tenant current rent from the active RentVine lease — **IMPLEMENTED / UNRELEASED (renewal-completion R1)**                                                 | S82 remediation released               | Lease-detail `baseRentAmount` drives every consumer, unit rent is a labelled reference, null/discrepancy/refresh behavior preserved; focused, canonical, and rehearsal-browser gates green.                                                                                                                       |
|    13 | S103 — Lease term and renewal eligibility — **COMMITTED / CANDIDATE-DEPLOYED (R2)**                                                                              | S102                                   | Term projection, audited term review record, `periodic_review` disposition, desk/workspace/query term display, and assistant reuse green; no provider write.                                                                                                                                                      |
|    14 | S104 — Renewal desk and workspace parity closure — **COMMITTED / CANDIDATE-DEPLOYED (R3)**                                                                       | S102, S103                             | Table/workspace parity and open/write/return continuation proofs green; S82 preservation green.                                                                                                                                                                                                                   |
|    15 | S105 — End-to-end renewal lifecycle closure — **COMMITTED / CANDIDATE-DEPLOYED except the Dotloop phase (R4)**                                                   | S102-S104                              | Typed owner outcomes, version-binding audit, and the fixed-term lifecycle plus branch fixtures green through owning services.                                                                                                                                                                                     |
|    16 | S106 — Dotloop connection and renewal readiness — **COMMITTED / CANDIDATE-DEPLOYED; live check BLOCKED (R5)**                                                    | Independent                            | Fake-provider connect/deny/expire/refresh/revoke/reconnect matrix, selection record, readiness projection, and health wiring green; live check `BLOCKED` only on the owner's OAuth app and account.                                                                                                               |
|    17 | S34 — Dotloop renewal packet lifecycle — **SPEC ONLY (R6)**                                                                                                      | S105, S106, S66 catalog                | Provider over the official API, one loop per packet hash, readback, refresh, and signature handoff green through fakes; live proof and key activation remain owner-gated.                                                                                                                                         |
|    18 | S107 — Confirmed renewal effect continuation and recovery — **SPEC ONLY (R7)**                                                                                   | S105, S34                              | Detached completion, load-time read-only reconciliation, attempt summary, abort/replay/isolation fixtures green; no scheduler, worker, or autonomous retry.                                                                                                                                                       |
|    19 | S108 — Maintenance work-order alignment, blockers, and preapproval routing — **SPEC ONLY (R8)**                                                                  | Independent (S99, S100 deployed)       | Provider snapshot from human-initiated reads, waiting-on projection, Admin preapproval record, routing, and report green; attachments to RentVine stay closed.                                                                                                                                                    |
|    20 | S109 — Maintenance intake triage and troubleshooting assistant — **SPEC ONLY (R9)**                                                                              | S108                                   | Structured intake, deterministic triage, fire/flooding/normal copy, reviewed catalog, optional schema-validated model interpretation, and promotion carry-over green; public upload stays forbidden.                                                                                                              |
|    21 | S110 — Dashboard assistant V1: three read-only intents — **SPEC ONLY (R10)**                                                                                     | S102-S104, S108                        | S88 boundary with a three-intent registry, My Work and renewal adapters over owning services, envelope, form routing, parity, and zero-write proof green.                                                                                                                                                         |
|    22 | S111 — Integrated model-run proof and operator training guide — **SPEC ONLY (R11)**                                                                              | S102-S110, S34, S106                   | Integration suite on one fixture portfolio, extended browser smokes, exact outcome report, and the registered training guide green; live Dotloop and owner inputs reported as blocked, never as a human gate.                                                                                                     |
|    23 | S36 — Temporary Space provisioning pilot — **NOT STARTED**                                                                                                       | S83, S86, S100                         | Deterministic source-copy packet, provision/import/query/readback, exact retirement/temp-object deletion, final eleven-store/config restoration, and runtime-flag-false readback all pass. No pilot has run.                                                                                                      |
|    24 | S88 — Deterministic assistant query foundation — **SPEC ONLY**                                                                                                   | S82/S83 route contracts available      | Strict eight-intent registry, capability manifest, representative-language corpus, public/private carrier, filter/notice/result, zero-write, and preservation gates green.                                                                                                                                        |
|    25 | S89 — Assistant privacy, observability, and cost controls — **SPEC ONLY**                                                                                        | S88                                    | Privacy-safe Ask baseline deployed as the rollback floor; budgets/cancellation/evaluations, authenticated served-browser checks, bodyless client-error telemetry, and alert delivery are green.                                                                                                                   |
|    26 | S90 — Assistant Work, approval, and access adapters — **SPEC ONLY**                                                                                              | S83, S88, S89                          | Actor/source/availability/link/no-effect matrices green.                                                                                                                                                                                                                                                          |
|    27 | S91 — Assistant renewal query adapter — **SPEC ONLY**                                                                                                            | S82, S88, S89                          | One source-generation snapshot drives desk/workspace/assistant; nullable-rent, typed auxiliary-state, date/range/blocker/party-link/cancellation, and candidate/post-promotion source-reconciliation gates are green.                                                                                             |
|    28 | S92 — Assistant knowledge and grounded narration — **SPEC ONLY**                                                                                                 | S88-S91                                | Knowledge adapter, minimized input, bounded citation/narration, deterministic fallback, and no-action gates green.                                                                                                                                                                                                |
|    29 | S94 — Assistant human-confirmed action proposals — **SPEC ONLY**                                                                                                 | S88, S89, S91                          | Backend/projector/token/Review/Confirm/readback gates green against strict S93-slot fixtures; no UI exposure yet.                                                                                                                                                                                                 |
|    30 | S93 — Dashboard assistant streaming and linked results — **SPEC ONLY**                                                                                           | S85, S86, S88-S92, S94                 | Complete stream/UI implemented once against real S94; registry-backed capability help, honest unsupported recovery, atomic finalization, client-error delivery, accessibility, and preservation are green.                                                                                                        |
|    31 | S93/S94 integration verification gate — **SPEC ONLY**                                                                                                            | S93, S94                               | Candidate, Review, Confirm, cancellation, receipt, refusal, response-loss, terminal-size, and accessibility integration green; no suite re-executes.                                                                                                                                                              |
|    32 | S95 — Minimal Dashboard composition and relocation — **SPEC ONLY**                                                                                               | Gate 20, S84, S87 specified manifest   | Atomic `/`/`/ask` cutover, destination parity, no eager legacy reads, non-destructive coverage compatibility, authenticated Editor/Admin candidate and post-promotion checks, S91 reconciliation, and alert readback are green.                                                                                   |
|    33 | S87 — Product-wide content hierarchy and decluttering — **SPEC ONLY**                                                                                            | S36 and S82-S100 implemented           | Six ordered cohorts, exact CB authority, S91 source reconciliation, authenticated full-surface state/route/error/accessibility/max-result checks, and candidate/post-promotion verification are green.                                                                                                            |
|    34 | S101 — Cross-application assistant read coverage — **SPEC ONLY**                                                                                                 | S87 and S88-S95 deployed               | Additive 15-intent V2 registry/manifest/corpus, seven actor-scoped typed read adapters, owning-page parity, zero-effect proof, authenticated candidate/post-promotion checks, and exact V1 rollback are green.                                                                                                    |

Gate 0 completed once through the audited specification closure; do not repeat it. S96 and the S85-
S86 interaction foundation, S83 access workflow, S84 navigation, and the original S82 renewal desk
baseline are deployed. S85 brand conformance is resolved against the approved official PMI Brand
Style Guide. S97 and S98 have deployed proof-qualified baselines. Their bounded integrity hardening
is active and unreleased; S98's end state is append-only until the provider can safely bind a fixed
logical row. S99 is complete and deployed. S100 chat sync is complete, proven, open, and
deployed; only the resident-draft live proof and activation remain blocked on a mapped resident with
a verified email on a synchronized thread. The current Registry mirror reads 48 entries and 16
executable keys.

S82 is reopened only for a bounded conformance remediation. Its fixes, the S97/S98 integrity
hardening, and the expanded S51/S54 production-assurance contracts are active but unreleased; no
active document may imply those changes have reached Production before candidate, promotion,
observation, and exact readback succeed. S36 has not started. S87-S95 and S101 remain specifications
only.

Default execution is serialized because suites update shared registries, shell components, and
governance docs. The sole optional parallel group is bounded S90 and S91 domain work in isolated
worktrees after S82, S83, S88, and S89 are green, with one integration owner and serialized central
registry/schema edits and delivery. All shared-checkout work; facts/status/plan/loop-state updates;
S96/S85/S86; S83/S84/S82; S97-S100/S36; S82/S91; S94/S93; S95/S87; S87/S101; and every join gate
remain serialized.

Every suite uses only `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED`, or `BLOCKED` as its implementation
terminal. `BUDGET_EXHAUSTED` is unavailable unless a user supplies an explicit run budget. `BLOCKED`
names one exact unavailable input/authority only after all independent fail-closed work is complete.
Brand sign-off, human litmus, live-vault proof, and runtime source availability are separately named
evidence and do not create custom terminal states. For each code delivery, freeze fail-first and
preservation evidence, run focused adversarial checks, `bash scripts/verify.sh`, and
`npm run test:e2e:core`; audit secrets/PII/protected paths/runtime/effects/diff; commit/push and require
exact-SHA CI; then use the existing zero-traffic candidate, exact smoke/promotion/readback/rollback
contract for served code. No dependent starts after any failed gate.

Human litmus fields never authorize a runner to impersonate an observer. When no human observer is
present, record the exact value `Human verdict: NOT RUN — no human observer` and continue using the
required deterministic, model, accessibility, and served-readback evidence. A human verdict blocks a
suite only if a later explicit owner instruction makes that exact verdict a completion gate.

## Dashboard assistant, minimal-home, and read-coverage bundle

S88-S95 are the bounded V1 implementation contracts for the 2026-08-31 Dashboard AI-integration and
decluttering notes; their S82/S83 route and data dependencies are deployed. S101 is a separate,
post-S87 read-only expansion for Maintenance, Workflow Communications, Connections, Internal
Processes, Notifications, and Admin readiness. It is not a V1 prerequisite. Desired assistant
behavior must not be described as current truth until its own implementation and readback pass.

### Intent-to-outcome ownership

| User intent                                                               | Owning suite(s) | Required outcome boundary                                                                                                                                                                  |
| ------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ask operational questions without making the model authoritative          | S88             | Closed server intent registry, actor-scoped adapters, typed evidence/completeness, canonical route refs, deterministic final result, and zero mutation on query                            |
| Keep operational AI private, bounded, observable, and affordable          | S89             | Session-only transcript, bodyless telemetry, request/context/model budgets, timeouts/cancellation, prompt/data minimization, evaluations, and rollout/rollback gates                       |
| Ask about blocked/due My Work, decisions, submitted requests, and access  | S90             | Actor-owned work, availability-aware decision state, requester-history registration, current-session access, and S83 integration without generic approval inference                        |
| Ask which renewals are upcoming or blocked                                | S91             | Canonical renewal-desk orchestration, exact Kansas City date windows, S82 blocker truth/compatibility, complete/partial source state, and exact lease/table destinations                   |
| Preserve grounded knowledge answers and add safe narration                | S92             | Current source-state/citation protections as one adapter, mandatory answered-result narration, an optional one-call model path, schema validation, and deterministic fallback              |
| Use a simple chat-like Dashboard assistant with linked structured results | S93             | AI-labelled composer, session-local exchange stack, truthful streamed stages/result groups, terminal states, accessibility, safe new-tab links, and no process picker                      |
| Create one supported app task only after human confirmation               | S94             | One exact renewal-to-self My Work task, stateless Review/Confirm, stable source identity, idempotency/readback, and inert S83/owning-domain navigation handoffs                            |
| Reduce the Dashboard to AI and one clickable My Work handoff              | S95             | Final `/`/`/ask` cutover, removal of obsolete panels and eager reads, exact relocation/parity gates, and user-facing Space Coverage lane retirement                                        |
| Ask read-only questions across the remaining application lanes            | S101            | Post-S87 additive deterministic Maintenance, Communications, Connections, Internal Processes, workflow-run, Notifications, and Admin-readiness adapters with owning links and zero effects |

### Current-to-desired boundary decisions

| Rough-note phrase or current behavior                        | Governing resolution                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Feed every application component into the model`            | V1 exposes only the closed S90-S92 adapter catalog. After S87, S101 may add seven closed read-only adapter families through an additive registry version. Adapters authorize facts before optional model-backed narration; there is no arbitrary database reflection or model tool loop. |
| `Show the thinking process`                                  | S93 shows truthful execution stages and a `How this was checked` receipt. Hidden chain-of-thought, prompts, reasoning tokens, and source instructions are never exposed or stored.                                                                                                       |
| `Show a confidence score`                                    | Use deterministic `Complete coverage`, `Partial coverage`, or `Unavailable` plus source/as-of/truncation truth. No uncalibrated model-confidence percentage is shown.                                                                                                                    |
| `Create tasks`                                               | Current Ask `Capture Task` creates a KB Placeholder and is intentionally removed from Dashboard. S94 creates one real self-assigned My Work task only from an exact reviewed renewal candidate through the owning Work service.                                                          |
| `Request approvals`                                          | Read decisions and requester-visible domain requests. S83 owns access requests; other approvals use an existing owning workflow or refuse. No generic model-authored queue item exists.                                                                                                  |
| Current process selection starts a run when Ask is submitted | S93 removes the picker and a Dashboard question never starts a run. V1 assistant actions do not start/cancel workflows; explicit run controls remain on owning Process pages.                                                                                                            |
| `Open all upcoming renewals in new tabs`                     | Each deliberate result activation opens one validated destination in a new tab. No automatic or bulk popup behavior is added.                                                                                                                                                            |
| `Remind me`                                                  | The current query may return an on-demand recap. No scheduled/background reminder, monitor, autonomous notification, or client communication is authorized.                                                                                                                              |
| `Space Coverage goes nowhere`                                | S95 retires the aggregate user-facing Dashboard/notification/preference/query lane after compatibility checks; Internal Processes keeps its own truthful card-state computation.                                                                                                         |
| ChatGPT/Gemini-style history                                 | S93 keeps only the current page-session exchange stack and routes each question independently. Durable transcript/memory requires a separate retention/access/deletion contract.                                                                                                         |

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
| K     | S101             | Post-S87 additive read-only coverage for the six remaining product lanes, with typed source truth, exact owning links, zero effects, and V1 rollback               |

The canonical queue above requires S83/S82 before S90/S91 and S90/S91 before S92 so the unattended
end state is complete rather than compatibility-partial. Absence fixtures remain rollback tests, not
the desired terminal. S95
removes no current Dashboard capability until its
named destination and compatibility evidence exist. S101 starts only after S87 and cannot be pulled
into V1 to widen its completion gate. Neither model availability nor a UI label can
open an action key, grant a role/Space, create an approval, send a client message, or write RentVine/
the operating Sheet. Any executable assistant action beyond S94 requires a separate future exact-
action program; S101 neither specifies nor creates that program.

## Renewal completion bundle (owner direction 2026-09-03)

The owner's 2026-09-03 specification package (grounded here as `feature-handoff:
renewal-completion-v1`) supersedes D-DOTLOOP-DEFER and reorders the queue so that correct rent, lease
term, the complete renewal lifecycle, Dotloop, confirmed-effect continuation, maintenance alignment,
intake triage, a three-intent Dashboard assistant, and one integrated proof execute before S36 and
the remaining S88-S95/S87/S101 program. It adds no send, autonomous effect, generic provider call, or
new governance scheme; every effect keeps its exact key, human confirmation, receipt, and readback.

### Package requirement classification

| Package item                                 | Suite | Classification summary                                                                                                                  |
| -------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------- |
| PMI-01 correct current rent                  | S102  | Incorrect source (`unit.rent`); discovered lease-detail `baseRentAmount` is the fix; null/discrepancy/refresh already satisfied         |
| PMI-02 lease term and eligibility            | S103  | Partially satisfied (heuristic skip); visible term, review anchor, periodic review missing                                              |
| PMI-03 desk/workspace alignment              | S104  | Already satisfied by S82 remediation except rent/term parity and one continuation proof                                                 |
| PMI-04 end-to-end renewal                    | S105  | Already satisfied by S72/S97/S98/S77 except typed owner outcomes and the Dotloop phase                                                  |
| PMI-05 Dotloop connection                    | S106  | Scaffolding only; connection lifecycle, selection, readiness missing                                                                    |
| PMI-06 Dotloop packet lifecycle              | S34   | Typed seam only; provider, link, readback, handoff missing                                                                              |
| PMI-07 unattended orchestration              | S107  | No job platform exists; claims/receipts/reconcile already satisfy recovery; autonomous retry conflicts with `AGENTS.md` and is kept out |
| PMI-08 maintenance sync/blockers/preapproval | S108  | Links and S99/S100 satisfy identity/no-duplicates; snapshot, waiting-on, preapproval missing; attachments to RentVine stay closed       |
| PMI-09 maintenance AI intake                 | S109  | S47 intake satisfies the surface; triage, copy, catalog, handoff missing; public photo upload stays forbidden                           |
| PMI-10 Dashboard assistant V1                | S110  | Missing; first executable slice of S88/S90/S91                                                                                          |
| PMI-11 integrated proof and training         | S111  | Missing; composes the suites above                                                                                                      |

### Dependency order (not a second queue)

| Order | Suite(s) | Standalone output before the next stage consumes it                                               |
| ----- | -------- | ------------------------------------------------------------------------------------------------- |
| R1    | S102     | Lease-scoped `currentRent`, `unitListedRent`, and month-to-month detail fields on the lease view  |
| R2    | S103     | `leaseTerm`, `periodic_review` disposition, term review record, desk/workspace/query term display |
| R3    | S104     | Desk/workspace parity assertion and continuation proof                                            |
| R4    | S105     | Typed owner outcomes, version-binding audit, lifecycle and branch fixtures                        |
| R5    | S106     | Dotloop connection service, selection record, readiness projection (independent of R1-R4)         |
| R6    | S34      | Dotloop provider, loop link, readback, signature handoff                                          |
| R7    | S107     | Detached completion, load-time reconciliation, attempt summary                                    |
| R8    | S108     | Provider snapshot, waiting-on projection, preapproval record and routing (independent of R1-R7)   |
| R9    | S109     | Intake triage, copy, catalog, promotion carry-over                                                |
| R10   | S110     | Three-intent assistant boundary, adapters, envelope, form routing                                 |
| R11   | S111     | Integrated proof, browser smokes, proof report, operator training guide                           |

R5 and R8 may proceed independently of the renewal data suites; everything else is serial. Live
Dotloop proof requires the owner's OAuth application registration and a connected account; its
absence blocks only that live check.

### Recorded conflicts and external inputs

| Item                                                       | Disposition                                                                                                    |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Automatic retry / unattended chaining of writes            | Conflicts with the permanent safety boundaries; S107 keeps human re-confirmation and read-only reconciliation. |
| Public resident photo upload                               | Conflicts with S47's hard gate; S109 records `photos_needed` as a blocker and uses the staff photo action.     |
| Photos/attachments synchronized into RentVine              | Attachment key closed by S99; S108 keeps photos app-side.                                                      |
| Dotloop OAuth app registration and account                 | External input (owner); recorded in `docs/client-checklist.md`.                                                |
| Troubleshooting links, evidence table, preapproval amounts | External inputs (owner); absence disables only the dependent offer or routing.                                 |
| Month-to-month review cadence                              | Owner direction 2026-09-03: 12 months after the anchor; in-app visibility only.                                |

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
placement; S88-S95 own bounded Dashboard V1 and the aggregate user-facing Space Coverage retirement,
while S101 owns only the post-S87 deterministic read expansion.

### Intent-to-outcome ownership

| User intent                                                         | Owning suite(s) | Required outcome boundary                                                                                                                                                                                                           |
| ------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Support coherent Light and Dark modes across the whole application  | S85             | Device/Light/Dark choice, pre-paint resolution, semantic theme roles, contrast/non-color gates, Appearance utility, and a bounded all-surface migration                                                                             |
| Make buttons, links, hover, icons, and state visibly understandable | S85/S86         | Theme-aware action hierarchy plus shared link/icon/focus/hover/active/disabled/busy/error/success behavior without color-only or hover-only meaning                                                                                 |
| Show honest loading and completion                                  | S86/S83         | Immediate busy feedback, indeterminate progress when no real fraction exists, verified success only after readback, and S83-owned supported connection checks                                                                       |
| Put supplementary descriptions behind accessible contextual help    | S86             | Explicit focus/tap trigger, 600 ms fine-pointer hover, Escape/focus return, touch support, and no essential label/state/safety/error hidden                                                                                         |
| Prevent and recover from connector disconnection                    | S96             | Cancel-first exact confirmation, versioned pending/revoked lifecycle, vault outcome, receipt/readback, response-loss recovery, and replacement safety                                                                               |
| Prevent and recover from other consequential actions                | S86             | Effect tiers, accessible feature-specific confirmation, preserved exact-confirm contracts, and S96 preservation                                                                                                                     |
| Remove persistent clutter across product surfaces                   | S87/S95         | S87 owns the global manifest; S95 supplies the later Dashboard disposition/relocation ledger and removes no region before destination parity                                                                                        |
| Preserve self-explanatory navbar destination descriptions           | S84/S87         | S84's concise descriptions remain visible inside opened navigation panels; the no-persistent-subtext rule applies to nonessential page exposition                                                                                   |
| Keep overlapping product behavior explicitly owned                  | S36/S82-S101    | S82 renewal UI; S83 access; S84 navigation; S85 theme; S86 interaction; S87 placement; S88-S95 Dashboard V1; S96 connector disconnect; S97-S100 exact source effects; S101 read-only assistant expansion; S36 temporary Space pilot |

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

S85 brand conformance is resolved against the approved official PMI Brand Style Guide; its extracted
values are the production brand source. Missing analytics block only usage-based claims, not directly evidenced
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

## Source-of-truth and Maintenance activation bundle

S97-S100 and the hardened S36 pilot are the implementation contracts for the owner's 2026-08-31
writeback decisions. They replace categorical read-only posture with exact, human-confirmed provider
operations while preserving the permanent no-autonomous-send and no-generic-effect boundaries. The
router, current code/live readback, `docs/facts.md`, and each suite's official-provider contract remain
the sources of execution truth.

### Intent-to-outcome ownership

| Owner intent                                                         | Owning suite | Exact outcome boundary                                                                                                                                                                                                               |
| -------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Let the renewal app update RentVine                                  | S97          | Exact renewal-date and recurring-charge create/update keys; the create key includes only its receipt-bound reversal DELETE; every effect is individually confirmed, receipted, read back, and reconciled                             |
| Let the app add/update renewal checklist data in the operating Sheet | S98          | Current safe product capability is one server-derived row append. Historical field-update/delete proof receipts remain valid, but normal fixed-row mutations refuse until a provider-owned stable-row/generation/status seam exists. |
| Let staff create or advance Maintenance work orders in RentVine      | S99          | Exact official read/create/status operations; notifications off, no vendor assignment, attachment, chat post, or send                                                                                                                |
| Bring authenticated resident work-order messages into the app        | S100         | Explicit manual sync that discloses RentVine's mark-read effect, exact role/lease/contact mapping and dedupe/review, 365-day message retention, and a separate signed-in-mailbox unsent Gmail draft                                  |
| Prove one complete temporary Space lifecycle                         | S36          | Deterministic approved source copy, provision/import/query/readback, exact retirement/temp cleanup, and restoration to eleven stores with the flag false                                                                             |

### Closed decisions and boundaries

| Topic                                    | Governing resolution                                                                                                                                                                                                                                            |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| “Everything is in scope for writeback”   | Every renewal-relevant operation supported by S97/S98 and every selected Maintenance/resident operation in S99/S100 is in scope. No generic API, arbitrary field, bulk, scheduled, or model action exists.                                                      |
| RentVine proof target                    | S97's owner-designated proof is complete and its final state was read back. Do not rerun it or substitute another target; normal S97 operations use fresh human-confirmed proposals under their exact open keys.                                                |
| Operating Sheet proof                    | S98's marked temporary-row proof is complete; the row was deleted and read back absent. Do not append a replacement proof row or rerun any proof mutation. Normal append remains human-confirmed and receipted; fixed-row update/delete/restore is unavailable. |
| Resident channel                         | Official work-order chat GET is a manual sync because retrieval marks manager messages read. No undocumented webhook/polling or RentVine outbound chat is invented.                                                                                             |
| Outbound Maintenance communication       | Only a separately reviewed unsent Gmail draft in the signed-in user's connected mailbox is authorized. A person edits/sends in Gmail.                                                                                                                           |
| Provider success followed by app failure | Persist provider success/receipt before projection. Reconcile the app projection without issuing a second provider write or pretending cross-provider atomicity.                                                                                                |
| Dotloop and LeadSimple                   | Deferred until these RentVine/Sheet suites are enabled and read back; each later provider receives a separately grounded scope.                                                                                                                                 |

S97 preserves the one-attempt/readback safety primitives established by retired S30 while owning the
normal product route. S97-S99 and S100 chat sync have completed their proof/activation lifecycle and
must not be rerun. S100 resident-draft remains the only pending proof key; its missing exact resident
message/email blocks only that proof and S100's completion. S98's obsolete copy-only Sheet path and
S99's synthetic work-order executor are absent.

| Suite | Contract                                                                   | Present status                                                                                      |
| ----- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| S31   | `docs/feature-suites/gmail-watch-inbound.md`                               | Continuous watch retired; manual refresh and follow-up integration complete                         |
| S34   | `docs/feature-suites/dotloop-esign-activation.md`                          | Rewritten 2026-09-03 as the Dotloop renewal packet lifecycle; typed seam only, not implemented      |
| S35   | `docs/feature-suites/leadsimple-activation.md`                             | Internal lifecycle complete; selected account contract and credential required                      |
| S36   | `docs/feature-suites/space-self-provisioning.md`                           | Not started; hardened temporary lifecycle and authorized pilot remain specified                     |
| S37   | `docs/feature-suites/nocode-page-builder.md`                               | Bounded operational-process builder complete and deployed                                           |
| S47   | `docs/feature-suites/resident-maintenance-intake.md`                       | Tokenized app intake usable; S100 owns the selected provider sync/draft workflow                    |
| S51   | `docs/feature-suites/production-operational-readiness.md`                  | Expanded production-assurance contract active; new assurance slice is unreleased                    |
| S52   | `docs/feature-suites/production-cost-governance.md`                        | Complete and live-verified                                                                          |
| S53   | `docs/feature-suites/greenlight-activation-and-gate-integrity.md`          | Current per-key activation contract                                                                 |
| S54   | `docs/feature-suites/verification-and-ci-parity.md`                        | Expanded verification contract active; new assurance fixtures are unreleased                        |
| S56   | `docs/feature-suites/production-live-only-test-lane-retirement.md`         | Complete; current environment contract                                                              |
| S59   | `docs/feature-suites/rentcast-live-activation.md`                          | Complete and deployed; query/evidence/reference-only contract is preserved                          |
| S64   | `docs/feature-suites/per-person-approval-authority.md`                     | Specified but NOT authorized                                                                        |
| S66   | `docs/feature-suites/lease-document-packet-truth-and-prefill.md`           | Truth machinery built; approved catalog/provider mapping required                                   |
| S72   | `docs/feature-suites/renewal-step-model-and-workspace-defaults.md`         | Complete and deployed; exact six-step/evidence/compatibility model                                  |
| S74   | `docs/feature-suites/tenant-offer-copy-and-channel-truth.md`               | Complete/deployed review-only boundary; approved wording/channel evidence remains                   |
| S75   | `docs/feature-suites/renewal-follow-up-state.md`                           | Shared unset-safe projection built; live confirmed timing policy still external                     |
| S77   | `docs/feature-suites/renewal-draft-preview-confirm-reliability.md`         | Complete and deployed; exact-confirm/reconcile contract is downstream foundation                    |
| S78   | `docs/feature-suites/renewal-desk-triage-and-canonical-journey.md`         | Complete and deployed; canonical role-consistent desk/query/route contract is live                  |
| S79   | `docs/feature-suites/renewal-comp-screenshot-gmail-attachment.md`          | Complete/deployed closed-safe receipt/MIME/readback path; live Drive effect blocked                 |
| S80   | `docs/feature-suites/renewal-role-and-action-governance.md`                | Complete and deployed; exact role/Space/effect matrix is downstream foundation                      |
| S81   | `docs/feature-suites/task-oriented-admin-connections-navigation.md`        | Complete and deployed; navigation/readiness does not grant authority                                |
| S82   | `docs/feature-suites/guided-renewal-desk-and-workspace.md`                 | Baseline deployed; reopened conformance remediation active and unreleased                           |
| S83   | `docs/feature-suites/unified-admin-access-and-connection-actions.md`       | Complete and deployed; capability-guided access, Admin review, and connection feedback are live     |
| S84   | `docs/feature-suites/navbar-dropdown-navigation.md`                        | Complete and deployed; grouped descriptive navbar disclosures and visible terminology are live      |
| S85   | `docs/feature-suites/global-theme-and-visual-system.md`                    | Complete and deployed; official PMI brand conformance is resolved                                   |
| S86   | `docs/feature-suites/action-feedback-help-and-safe-recovery.md`            | Complete and deployed; shared interaction, contextual-help, and safe-recovery system is live        |
| S87   | `docs/feature-suites/content-hierarchy-and-surface-decluttering.md`        | Specified; task-first content hierarchy and product-wide decluttering are not implemented           |
| S88   | `docs/feature-suites/deterministic-assistant-query-foundation.md`          | Specified; deterministic assistant query/evidence/link foundation is not implemented                |
| S89   | `docs/feature-suites/assistant-privacy-observability-and-cost-controls.md` | Specified; assistant privacy, telemetry, cost, and evaluation controls are not implemented          |
| S90   | `docs/feature-suites/assistant-work-approval-and-access-adapters.md`       | Specified; work, approval, submitted-request, and access adapters are not implemented               |
| S91   | `docs/feature-suites/assistant-renewal-query-adapter.md`                   | Specified; canonical upcoming/blocked renewal adapter is not implemented                            |
| S92   | `docs/feature-suites/assistant-knowledge-and-grounded-narration.md`        | Specified; grounded knowledge adapter and mandatory answered narration are not implemented          |
| S93   | `docs/feature-suites/dashboard-assistant-streaming-and-linked-results.md`  | Specified; streamed assistant conversation and linked result UX are not implemented                 |
| S94   | `docs/feature-suites/assistant-human-confirmed-action-proposals.md`        | Specified; one human-confirmed renewal-to-self task action is not implemented                       |
| S95   | `docs/feature-suites/minimal-dashboard-composition-and-relocation.md`      | Specified; minimal Dashboard cutover and capability relocation are not implemented                  |
| S97   | `docs/feature-suites/governed-rentvine-renewal-writeback.md`               | Baseline deployed/proven/open; bounded integrity remediation active and unreleased                  |
| S98   | `docs/feature-suites/operating-renewal-sheet-writeback.md`                 | Baseline deployed/proven/open; append-only integrity/capability remediation active and unreleased   |
| S99   | `docs/feature-suites/rentvine-maintenance-work-order-writeback.md`         | Complete and deployed; exact work-order read/create/status actions are proven and open              |
| S100  | `docs/feature-suites/rentvine-work-order-chat-sync.md`                     | Blocked solely on resident-draft proof/activation; chat sync is complete, open, and deployed        |
| S101  | `docs/feature-suites/cross-application-assistant-read-coverage.md`         | Specified follow-on; deterministic cross-application read coverage starts only after S87            |
| S102  | `docs/feature-suites/tenant-current-rent-source.md`                        | Implemented 2026-09-03 (lease-detail base rent on the shared view); unreleased pending release gate |
| S103  | `docs/feature-suites/lease-term-and-renewal-eligibility.md`                | Specified 2026-09-03; visible lease term, review record, and periodic review are not implemented    |
| S104  | `docs/feature-suites/renewal-desk-workspace-parity-closure.md`             | Specified 2026-09-03; rent/term parity and continuation proof are not implemented                   |
| S105  | `docs/feature-suites/end-to-end-renewal-lifecycle.md`                      | Specified 2026-09-03; typed owner outcomes and lifecycle proof are not implemented                  |
| S106  | `docs/feature-suites/dotloop-connection-and-readiness.md`                  | Specified 2026-09-03; Dotloop OAuth connection, selection, and readiness are not implemented        |
| S107  | `docs/feature-suites/confirmed-renewal-effect-continuation.md`             | Specified 2026-09-03; detached completion and load-time reconciliation are not implemented          |
| S108  | `docs/feature-suites/maintenance-sync-blockers-and-preapproval-routing.md` | Specified 2026-09-03; provider snapshot, waiting-on, and preapproval routing are not implemented    |
| S109  | `docs/feature-suites/maintenance-intake-assistant.md`                      | Specified 2026-09-03; intake triage, copy, catalog, and handoff are not implemented                 |
| S110  | `docs/feature-suites/dashboard-assistant-three-intents.md`                 | Specified 2026-09-03; the three-intent read-only Dashboard assistant is not implemented             |
| S111  | `docs/feature-suites/renewal-completion-integrated-proof-and-training.md`  | Specified 2026-09-03; integrated proof and operator training guide are not produced                 |

A status in this table is authoritative for planning. A suite body is the acceptance contract, not a
historical progress log.
