<!-- spec-shape: overhaul-v1 -->

# S51 — Production operational readiness

> New 2026-07-29 (operator note). Implements the settled owner decisions D09 (runtime emergency
> stop), D13 (monitoring and alerting — phase-blocking), D14 (incident process), D15 (retention and
> deletion), D18 (capacity), D19 (rollback rehearsal), and D26 (log hygiene), inside the operating
> frame set by D08 (bounded pilot) and D20 (staff readiness). S40 owns the environment/cutover
> contract and carries the D13 and D19 acceptance criteria; S51 owns the build behind them. S52 owns
> the production cost ceiling; S51 owns the alerting that reaches a human before that ceiling bites
> and a distinct alert if the kill switch fires.
> Disposable packet path, if the build slice authors one:
> `docs/temp/production-operational-readiness-plan.md` (local-only and gitignored; no such file exists
> on disk as of 2026-07-29, so nothing in this spec depends on it).

**Goal.** PMI KC can run the live product without a human being the only monitor. Today three things
are true and all three are unsafe for a live phase: stopping a bad live action requires a code change
plus a deploy, or a revision rollback, so containment is measured in minutes-to-tens-of-minutes;
nothing reaches a person when production breaks, because no alert policy and no notification channel
exist anywhere (the monitoring plan in `docs/v1-monitoring-and-rollback-plan-2026-07-14.md` is prose
that describes what to watch, with nothing watching); and the recorded rollback rehearsal predates the
S40 blue/green promotion flow, so the one recovery path we claim has not been exercised against the
shape we now deploy. End state: an Admin can close any live action in seconds from inside the app,
audited, with a switch that is structurally incapable of opening anything; three operational alert
policies, a separate kill-switch-outcome policy, and one internal notification channel exist so a 5xx
spike, an unresolved live effect, a pre-ceiling cost threshold, and an actual or failed billing
disable each reach a named human without conflating warning with outage; two incident severities carry explicit
acknowledgement windows and a standing same-day reporting rule to Dan for any wrong client-facing
output; product-record retention is declared without disturbing the built communications retention
contract; the accepted one-instance capacity ceiling and the exact signal that would force a change are
recorded rather than assumed; and a fresh blue/green rollback rehearsal is a procedure the loop can
re-run, not a memory. Every claim below traces to the owner decision row named in it, to code read for
this spec, or is labeled an assumption.

**What it is / how it functions.**

- **Close-only runtime suspend — an unprotected wrapper around the protected
  `lib/integrations/action-gate.ts` seam (D09).** Today
  `isActionExecutable(key, registry = ACTION_REGISTRY_SEED)` finds the seed entry, re-parses it through
  `CreateActionRegistryInputSchema`, and returns `production_allowed === true`; `assertActionExecutable`
  throws `ActionNotExecutableError` (`code: "action_not_production_allowed"`, `status: 409`). The seed is
  read deliberately instead of Firestore so only a reviewed code change can OPEN a gate. That rule is
  preserved exactly, and this suite does not edit that D12 path. What is added in new modules and
  migrated call sites is a second, one-directional term:
  - **The combinator and gate wrapper — `lib/operations/runtime-suspension.ts` and
    `lib/operations/runtime-suspension-gate.ts` (new).** A pure
    `resolveRuntimeExecutable(seedAllowed: boolean, suspension: RuntimeSuspensionState): boolean` whose
    entire body is a logical AND: `seedAllowed && !isSuspended(suspension)`. There is no branch, field,
    override, or admin value that can return `true` when `seedAllowed` is `false`. `isSuspended` returns
    `true` for an active suspension of the exact key, `true` for an active global suspension (`"*"`), and
    `true` when the suspension store is unreadable — an unreadable store closes actions, never opens
    them. This is the whole of D09's "cannot open a gate" requirement expressed as a type-and-arity fact
    rather than a convention, and AC-S51-1 enumerates all four (seed × suspension) combinations.
    The wrapper reads the seed decision through the existing public `isActionExecutable` /
    `assertActionExecutable` APIs, combines it with the suspension state, and never writes or
    changes `lib/integrations/action-gate.ts`.
  - **Distinct refusal.** A suspended attempt throws a new `ActionRuntimeSuspendedError` from the
    new wrapper module
    (`code: "action_runtime_suspended"`, `status: 409`) rather than reusing
    `action_not_production_allowed`, so an operator can tell "an operator stopped this" from "this was
    never enabled" without reading the seed.
  - **Store — one Admin-scoped, server-written Firestore collection.** `runtime_action_suspensions`,
    one doc per suspended action key plus the reserved `"*"` doc, following the exact
    `owner_transactional_destination` rules pattern already in `firestore.rules`
    (`allow read: if signedIn() && admin();` / `allow create, update, delete: if false;`), so the browser
    can never forge a suspension state in either direction. The app-plane store and tests build first;
    the corresponding `firestore.rules` declaration is a D12 protected-path change that is staged for
    owner review and is never pushed under the unattended standing grant.
  - **Route — `app/api/admin/runtime-suspension/route.ts` (new).** Guarded by
    `requireCapability("manageAdmin")` exactly like `app/api/admin/transactional-destination/route.ts`,
    body validated by a strict schema in `lib/firestore/schemas.ts`. `POST` accepts
    `{ action: "suspend" | "clear", actionKey, reasonCode, incidentRef?, confirmation }`.
    `reasonCode` is an enum, never free text:
    `wrong_client_output | ambiguous_or_duplicate_effect | provider_outage | security_containment |
planned_maintenance | incident_resolved`. `incidentRef`, when present, is an opaque
    operator-owned identifier matching `^[A-Z0-9][A-Z0-9._-]{0,63}$`; it cannot carry an address,
    message, token, path, or customer value. The Admin must type the exact action key into
    `confirmation`; a mismatch, an unknown reason code, an invalid incident reference, or an unknown
    key is a 400 that writes nothing. That mirrors the exact-confirmation discipline already
    enforced for live effects (`authority.exactConfirmationHash === previewHash`,
    `lib/external-execution/authority.ts`).
  - **Audit — append-only, surfaced in-app.** Each transition appends one immutable record to
    `runtime_suspension_changes`, shaped like `lib/firestore/admin-role-changes.ts`
    (`actor_uid`, `actor_email`, `reason_code`, optional opaque `incident_ref`, `created_at`, plus
    `action_key` and
    `previous_state`/`new_state`), and the merged Admin activity list in `lib/admin/activity-log.ts`
    gains it as a third kind so "who stopped what, when, and why" is visible without the Firestore
    console. The record carries no free-form reason and no customer value.
  - **Where it binds.** The wrapper replaces every execution-path site that reads the gate, not one
    convenient one. The current discovery includes reads that throw:
    `lib/execution/service.ts` (`assertActionExecutable`, line 199),
    `lib/lease-renewal/execution/renewal-draft-request.ts` (line 203),
    `lib/maintenance/execution/owner-notice-draft-request.ts` (line 87), and
    `lib/notifications/internal-transactional.ts` (line 119). Reads that return a blocker inside the
    execution path: `lib/external-execution/orchestrator.ts` (`isExecutable`, lines 190 and 285) and
    `lib/gmail-hub/dependencies.ts` / `lib/gmail-hub/service.ts` (`isActionExecutable`, reached by
    `app/api/gmail-hub/pubsub/route.ts`). Reads that shape a view or a route response, where a
    suspension must render the closed state rather than throw:
    `app/api/lease-renewal/market-comps/route.ts` (line 50),
    `lib/lease-renewal/comp-screenshot-action.ts` (line 34), and `lib/maintenance/photo-action.ts`
    (line 27), plus S53's Sheet write-back execution boundary. This dated list is diagnostic, not
    deletion or completeness proof. A repository-derived sentinel enumerates direct action-gate
    imports/calls in execution roots and fails with every unwired path named, so a newly added call
    cannot silently bypass suspension. The maintenance owner-notice draft and the internal transactional send are the two
    that matter most for containment, because both reach a real provider. A negative-import and
    call-count sentinel proves no live path reaches a provider constructor without passing through
    the combinator, and it fails if a new gate read appears anywhere without the suspension term.
  - **What it explicitly is not.** It never writes the seed, never touches either `EXECUTABLE_ALLOWLIST`
    copy (`scripts/seed-action-registry.ts`, `lib/admin/migration-readiness.ts`), never sets
    `production_allowed:true`, and clearing a suspension only restores the seed's own value. The
    read-only reconciliation carve-out already present in `lib/external-execution/authority.ts` (a
    Registry kill switch must not strand a consumed, ambiguous attempt) is preserved: a suspension blocks
    new attempts and never blocks reconciling one already consumed.
- **Three operational alerts, one kill-switch-outcome alert, and one notification channel —
  `infra/monitoring/` (D13).** Built to the same
  print-only pattern as `scripts/setup-budget-killswitch.mjs` / `npm run killswitch:plan`, which emits
  exact owner-run commands and never executes a cloud call. The suite adds committed policy definitions
  under `infra/monitoring/policies/` plus `scripts/setup-monitoring.mjs` (`npm run monitoring:plan`),
  parameterized on this project's non-secret identifiers — the same defaults the deploy wrapper already
  carries in `scripts/deploy-demo-cloud-run.mjs` (project `pmi-kc-kb-prod`, region `us-central1`, service
  `pmi-kc-kb-demo`).
  - **A1 — service error rate.** Cloud Run `run.googleapis.com/request_count` on the deployed service,
    filtered to `response_code_class="5xx"`, alerting when 5xx crosses its threshold over a rolling
    window. The Cloud Run service is the only ingress, so this is the generic "production is broken"
    signal, and nothing watches it today.
  - **A2 — unresolved live effect.** A log-based metric over a new structured, value-free log line
    emitted when an external execution reaches a terminal bad state. The real transition already exists:
    `FirestoreExternalExecutionStore.fail(id, ambiguous)` in
    `lib/firestore/external-action-executions.ts` writes `state: "failed"` or `state: "ambiguous"`, and
    `ambiguous` is the state that matters most — it means one live attempt was consumed and its outcome
    is unknown, which must reach a human before anyone considers a retry. The emitted line carries action
    key, execution id, state, and data mode only; never a recipient, address, body, tenant, unit, or any
    customer value, preserving the metadata-only discipline the internal-notification path already keeps.
    The same emitter covers a recorded `delivered:false` on the internal transactional receipt path
    (`lib/firestore/internal-transactional-receipts.ts`).
  - **A3 — pre-ceiling cost threshold.** S52 adds the stable
    `COST_ALERT_THRESHOLD_CROSSED` marker for the alert-only middle state. A3 matches only that
    marker, so a below-threshold no-op does not page and a billing disable cannot masquerade as a
    warning. The alert value is the non-null production monthly alert value defined by S52; S51 owns
    only the alert policy and its delivery channel.
  - **A4 — kill switch fired or failed.** S52 emits `KILL_SWITCH_FIRED` only after a successful
    disable/readback and `KILL_SWITCH_DISABLE_FAILED` when read, update, or confirming readback
    fails. A4 matches either page-worthy outcome and pages as a Sev-1; it does not match
    `KILL_SWITCH_ALREADY_DISABLED`. A3 and A4 are separate Cloud Monitoring policies with
    independently testable filters: crossing the warning threshold must not imply a disable, while
    a confirmed billing disable or failed containment must never be silent.
  - **The channel.** Exactly one email notification channel, addressed to the internal
    `pmikcmetro.com` operator address, supplied as configuration and never committed as a literal. Never
    a personal account and never a client address — the existing `assertPmikcmetroEmailList` guard in
    `scripts/preflight-production-cutover.mjs` is the precedent this reuses in the plan generator.
  - **Ownership split.** S40 carries the acceptance criterion (its cutover does not pass while these are
    absent). S51 owns the definitions, the generator, and the verifier that reports whether the four
    policies and the channel exist. Creating them is an owner-run cloud operation.
- **Incident process — two severities, two windows, one standing rule (D14).** Recorded as a runbook the
  loop can assert against, and surfaced where an operator is already standing (the Admin suspend panel
  states the Sev-1 first action).
  - **Sev-1 — client-visible or containment-required.** Wrong client-facing output already delivered; a
    system-of-record write that is wrong; any A2 `ambiguous` execution; the app unusable for staff.
    Acknowledgement window: 30 minutes inside business hours, same business day otherwise. The first
    action is always containment through the D09 runtime suspend, never a deploy — a deploy is the
    remedy, not the stop.
  - **Sev-2 — degraded but contained.** Elevated 5xx with no client-visible effect; a `failed` (not
    ambiguous) live effect that reached no client; a connector down; a stale sync. Acknowledgement
    window: one business day.
  - **The Dan rule.** Any wrong client-facing output is reported to Dan the same day it is discovered,
    regardless of severity, regardless of whether it was already corrected, and regardless of whether a
    client noticed. It is a reporting obligation, not a severity level, so it can never be argued down by
    triage. `docs/status.md` records only sanitized metadata, timestamps, severity, containment/
    resolution state, and an approved external evidence reference. Raw customer, recipient,
    provider payload, message, address, token, or other incident detail stays in the approved
    external incident system and never enters git.
- **Retention and deletion for product records (D15).** Declaration: live resident and renewal product
  records are retained indefinitely; legal holds are authoritative; deletion requests are handled
  manually by Josiah with Dan. This governs the product record stores (renewal progress/resolutions,
  maintenance tickets, approval queue, workflow runs, support reports). It explicitly does **not**
  override the built communications retention contract in `lib/gmail-hub/retention-policy.ts` — the
  frozen `communications-retention:v1.0` classes (10-minute confirmation usability separate from 30-day
  confirmation deletion, 7-day Pub/Sub dedupe, 90-day sync audit, 365-day workflow link, 7-year bodyless
  audit) stay exactly as built and as recorded in `Q-GMAIL-RETENTION` / `F-COMMUNICATIONS-POLICY-BUILT`.
  Where a record is both (a workflow-linked communication), the communications class wins for that
  record: "retain indefinitely" never extends a message body, a Gmail-derived row, or any collection in
  `COMMUNICATIONS_RETENTION_TARGETS` past its class. The suite adds no deletion automation and no new
  scheduler; it adds the declaration plus a separation gate that keeps the two regimes from leaking into
  each other in either direction.
- **Capacity — the accepted ceiling and its change signal (D18).** `scripts/deploy-demo-cloud-run.mjs`
  pins `--min-instances=0 --max-instances=1 --memory=512Mi --cpu=1 --concurrency=10 --timeout=60`. The
  accepted ceiling for the pilot is therefore one instance and ten concurrent in-flight requests;
  beyond that, requests queue and fail at the 60-second timeout. That ceiling is also load-bearing for
  abuse control, which is the coupling D18 exists to surface: both rate limiters are in-memory and
  per-instance and say so in their own headers — `lib/maintenance/intake-rate-limit.ts` ("it does NOT
  coordinate across Cloud Run instances") and `lib/api/model-call-throttle.ts` ("not coordinated across
  Cloud Run instances") — so raising `--max-instances` to N silently multiplies both effective limits by
  N. Capacity and abuse control are one decision, and the record states them together. The bound that
  makes this acceptable is
  D08's pilot: one named property set or the next renewal cohort, for two to four weeks — a handful of
  staff sessions plus a bounded cohort, comfortably inside ten. The exact signal that forces a change:
  sustained request queueing or saturation-attributable 5xx on A1 during normal pilot use, or any
  expansion of scope past the named cohort. Raising `--max-instances` is a deliberate flag change
  re-checked against the S52 cost ceiling AND against the two per-instance limiters — which then need a
  shared backing store, or a written acceptance that both limits are multiplied by the new instance
  count — never a silent bump, and the ceiling is asserted by test so it cannot drift unnoticed.
- **Blue/green rollback rehearsal (D19).** The recorded rehearsal in
  `docs/v1-monitoring-and-rollback-plan-2026-07-14.md` is stale: it predates the S40 candidate/promote
  flow. The deploy wrapper already implements the shape to rehearse — `createDeployRevisionSuffix`
  builds a timestamp-plus-48-bit-entropy suffix, `buildDemoDeployCommand` passes
  `--revision-suffix=<suffix>`, and `buildRevisionTrafficCommand` refuses any revision that is not
  exactly `<service>-<suffix>` before emitting `--to-revisions=<revision>=100`. The rehearsal procedure
  (`scripts/rehearse-rollback.mjs`, `npm run rehearse:rollback`) is print-first: resolve the candidate
  revision, capture the prior serving revision **before** promotion, promote the exact candidate, verify
  the unauthenticated redirect and the authenticated shell, restore 100% traffic to the captured prior
  revision, verify again, then restore forward. Evidence is revision names, timestamps, HTTP codes, and
  counts only. S40 owns the exit criterion that a fresh rehearsal exists before live-data cutover; S51
  owns the procedure and its dry-run report.
- **Log hygiene (D26).** Cloud Run logs land in Cloud Logging's `_Default` bucket at the project
  default, readable by anyone holding a broad project role, and `npm run verify:redaction`
  (`scripts/check-redaction.mjs`) only inspects `.gitignore` plus `git ls-files` — it is a git gate and
  says nothing about Cloud Logging. Three parts: (a) the printed runbook sets an explicit 30-day
  retention on the `_Default` log bucket; (b) it grants log viewing to named operator identities
  explicitly (`roles/logging.viewer`, and `roles/logging.privateLogViewer` only where actually needed)
  instead of leaving it inherited from a broad primitive role; (c) an error-path spot-check test drives
  the shared responder `apiErrorResponse` (`lib/api/editable.ts`) and the new A2 emitter with fixtures
  that contain an address, a message body, and a token, and asserts none of those substrings reach the
  emitted payload.
- **Buildable now (app-plane and print-only first).** The suspension combinator, store, schema, route,
  audit record, Admin panel, and wiring at every gate call site; the A2 structured emitter; the four
  committed alert policy definitions and the `monitoring:plan` generator and verifier; the rollback
  rehearsal script and its non-mutating dry-run report; the retention declaration and its separation
  gate; the capacity assertion; the log-hygiene runbook and the error-path spot-check. None adds a
  system-of-record write, an autonomous client-facing send, or a new external scope. The loop builds and
  verifies these locally and may ship the unprotected app-plane and print-only pieces under the
  standing grant. `lib/integrations/action-gate.ts` stays unchanged. It stages the
  `firestore.rules` declaration separately for owner review, and it does not claim the complete
  browser-visible suspension boundary until that protected change is reviewed.
- **Build to the seam (live provider).** S51 introduces no new external provider. Its two seams are (1)
  the live gate itself — the suspension term must be inside every live-effect path, proven by sentinel,
  not merely available for callers to remember; and (2) the cloud control surfaces — everything up to
  and including exact, redacted, ready-to-run `gcloud` commands for the channel, the four policies, the
  log-bucket retention, and the log-viewer grants, plus a read-only verifier that reports which of them
  exist.
- **Owner dependency (the cloud activation packet).** The owner supplies the internal
  `pmikcmetro.com` operator address, reviews the staged `firestore.rules` change, and runs the printed
  commands that create or update the monitoring channel, four alert policies, `_Default` bucket
  retention, and log-viewer IAM while authenticated as `josiah@pmikcmetro.com`. Monitoring resource
  creation, IAM, log-retention policy, billing, secrets, credentials, and scope grants remain owner-run.
  Routine application deploy, smoke, exact-revision traffic promotion, and rollback may be run by the
  loop under D05 after the full gate, auth and cost preflights, prior-revision capture, and smoke pass.
  Cloud activation is parked until S52 has a non-null verified ceiling and the owner packet is complete;
  the loop records that named dependency and continues with later local/app-plane slices.

**Open questions & assumptions.**

- _Answered 2026-07-29 (D09):_ containment is a close-only runtime suspend — Admin-confirmed, audited,
  structurally unable to open a gate. The reviewed-code-opens-gates rule is preserved unchanged.
- _Answered 2026-07-29 (D13):_ three operational alert policies plus a separate
  kill-switch-outcome policy matching `KILL_SWITCH_FIRED` or `KILL_SWITCH_DISABLE_FAILED`, and one
  notification channel exist before cutover; this is
  phase-blocking. S40 carries the acceptance criterion; S51 owns the build.
- _Answered 2026-07-29 (D14):_ two severities, an acknowledgement window each, and any wrong
  client-facing output reported to Dan the same day.
- _Answered 2026-07-29 (D15):_ retain indefinitely, legal holds authoritative, deletion requests handled
  manually by Josiah and Dan — for live product records. The `communications-retention:v1.0` contract is
  untouched and still governs communications collections.
- _Answered 2026-07-29 (D18):_ `max-instances=1` stays for the pilot and the ten-concurrent ceiling is
  accepted, bounded by the D08 pilot scope.
- _Answered 2026-07-29 (D19):_ a fresh blue/green rehearsal is required before live-data cutover; S40
  carries that exit criterion, S51 owns the procedure.
- _Answered 2026-07-29 (D26):_ explicit log retention plus a restricted log-viewer role, then an
  error-path spot-check.
- _Answered 2026-07-29 (D08):_ the operating frame is a bounded pilot — a named property set or the next
  renewal cohort, two to four weeks, with a stated abort trigger. The abort trigger for this suite's
  purposes is any Sev-1 that a runtime suspend cannot contain, or a second Sev-1 of the same cause.
- _Answered 2026-07-29 (D20):_ the sender mailbox is set and one training session runs with Dan's team
  before the first live renewal. S51 assumes trained staff when it sets a 30-minute Sev-1
  acknowledgement window; that window is a staffing commitment, not a system guarantee.
- _Assumption:_ concrete alert thresholds (5xx count over a rolling window for A1; any occurrence for
  A2; the non-null alert value from S52 for A3; any `KILL_SWITCH_FIRED` or
  `KILL_SWITCH_DISABLE_FAILED` occurrence for A4) start
  deliberately noisy-safe and are tuned after the first pilot week. The loop records the starting
  values and the tuning outcome as a `Q-`/`A-` row in `docs/facts.md` at build time.
- _Assumption:_ 30 days is the log retention value, matching the Cloud Logging `_Default` bucket default
  so the change is an explicit setting rather than a behavior change. Owner-tunable; recorded as a
  `Q-`/`A-` row at build time.
- _Assumption:_ the suspension state is read once per live-effect attempt rather than cached, because the
  pilot's request volume is bounded by the same ten-concurrent ceiling recorded above and a cache would
  add exactly the delay the switch exists to remove. Revisit only if A1 shows read latency.
- _Client-owned:_ creating the notification channel and alert policies, setting log-bucket retention,
  and granting log-viewer IAM remain owner-run operations after the loop produces the exact commands.
  D05 separately authorizes routine application deploy, smoke, exact-revision promotion, and rollback
  once their gates and preflights pass.
- Decision-complete: no product choice is open. The protected rules review, operator email value, S52
  ceiling, and owner-run cloud create commands remain named activation dependencies and do not stop
  unrelated app-plane work.

**Cross-product impacts.** New files: `lib/operations/runtime-suspension.ts`,
`lib/operations/runtime-suspension-gate.ts`,
`lib/firestore/runtime-action-suspensions.ts`, `app/api/admin/runtime-suspension/route.ts`, an Admin
panel under `components/admin/`, `infra/monitoring/policies/*.json`, `scripts/setup-monitoring.mjs`,
`scripts/rehearse-rollback.mjs`, a production incident runbook under `docs/`, and their tests
(`tests/unit/runtime-suspension.test.ts`, `tests/unit/runtime-suspension-route.test.ts`,
`tests/unit/monitoring-plan.test.mjs`, `tests/unit/rollback-rehearsal.test.mjs`,
`tests/unit/product-record-retention.test.ts`, `tests/unit/log-hygiene.test.ts`). Extended:
the execution-path callers of the existing action-gate API, including
`lib/execution/service.ts`, `lib/external-execution/orchestrator.ts`, `lib/gmail-hub/dependencies.ts`,
`lib/lease-renewal/execution/renewal-draft-request.ts`,
`lib/maintenance/execution/owner-notice-draft-request.ts`, `lib/notifications/internal-transactional.ts`,
`app/api/lease-renewal/market-comps/route.ts`, `lib/lease-renewal/comp-screenshot-action.ts`,
`lib/maintenance/photo-action.ts`,
`lib/firestore/external-action-executions.ts` (emit the A2 line on the `failed`/`ambiguous` transition),
`lib/firestore/schemas.ts`, `lib/admin/activity-log.ts` (a third audit kind), `firestore.rules` (two
Admin-read/server-write collections following the `owner_transactional_destination` pattern), and
`package.json` (`monitoring:plan`, `rehearse:rollback`). Interacts with: S40 (which carries the D13 and
D19 acceptance criteria and whose blue/green tooling this rehearsal exercises), S52 (which defines the
production alert value that A3 watches and the hard ceiling whose firing A4 watches — S51 states no
numeric value of its own),
`F-EXTERNAL-ACTION-GATE` (the seed-only open rule is preserved; only a close term is added),
`F-DEPLOY-EXACT-REVISION-TRAFFIC` (the rehearsal uses that exact-revision promotion/rollback contract),
`F-COST-CEILING-S52` (the replacement hard stop stays armed; A3 adds the human-reaching signal in
front of it and A4 reports an actual or failed billing-disable event),
`F-COMMUNICATIONS-POLICY-BUILT` / `Q-GMAIL-RETENTION` (unchanged and explicitly not overridden), and
`F-INTERNAL-NOTIFY` (the internal-only auto-send lane, which alerting does not replace or extend).
Delete-on-supersede: when the fresh rehearsal is recorded, mark the `## 2026-07-15 rehearsal results`
section of `docs/v1-monitoring-and-rollback-plan-2026-07-14.md` as historical evidence for a pre-S40
shape and point it at the new record, and delete any claim there that the retention operations section
is the whole retention posture; record both in the `docs/facts.md` Supersede Log with a unique marker.

**Adversarial acceptance checks.**

- **AC-S51-1** — Close-only is a property, not a promise. For a fabricated registry entry with
  `production_allowed:true`, an active suspension makes the executability check return `false` and the
  assert throw `action_runtime_suspended`; for a seed entry with `production_allowed:false`, NO
  suspension-store content makes it executable — including a doc with `suspended:false`, a doc carrying a
  forged `production_allowed:true` field, an unknown extra field, and a cleared/absent doc. All four
  (seed × suspension) combinations are enumerated, and an unreadable store yields `false`, never `true`.
  _Verify:_ `npm run test -- tests/unit/runtime-suspension.test.ts`; keep `tests/unit/action-gate.test.ts`
  and `tests/unit/action-registry-schema.test.ts` green.
- **AC-S51-2** — Admin-confirmed and audited. A Viewer/Editor `POST /api/admin/runtime-suspension`
  returns 403; an Admin POST whose `confirmation` is not byte-equal to the action key, whose
  `reasonCode` is outside the fixed enum, whose optional `incidentRef` fails the opaque-id regex, or
  whose `actionKey` is unknown, returns 400 and leaves the store unchanged. A valid POST returns 200
  and appends exactly one immutable audit record naming the managed internal actor email, action key,
  previous/new state, enumerated reason code, optional opaque incident reference, and ISO timestamp,
  which then appears in the merged Admin activity list. Adversarial values containing an email
  address, resident/unit name, message, URL/path, whitespace, or token-shaped text are rejected
  before persistence. No audit record contains a customer/recipient address, body, free-form text,
  or customer value. _Verify:_
  `npm run test -- tests/unit/runtime-suspension-route.test.ts`; keep
  `tests/unit/route-auth-boundary.test.ts` green.
- **AC-S51-3** — Containment needs no deploy and reaches every path. With a suspension active, an
  execution attempt through each wired call site refuses before any provider client is constructed, in
  the same process, with the same environment descriptor and the same serving-revision inputs as the
  attempt that succeeded moments earlier; a call-count/negative-import sentinel shows zero provider
  constructions on the refusal path; and an already-consumed ambiguous attempt can still be reconciled
  read-only while suspended. _Verify:_ `npm run test -- tests/unit/runtime-suspension.test.ts`; keep the
  provider-construction sentinels and `tests/unit/gmail-hub-action-gate.test.ts` green.
- **AC-S51-4** — Four policies and one channel exist as committed, executable-free definitions.
  `npm run monitoring:plan` exits 0, prints commands creating exactly one notification channel and
  exactly four alert policies, names each policy's real signal (Cloud Run 5xx `request_count` on the
  deployed service; the failed/ambiguous live-effect log metric; only
  `COST_ALERT_THRESHOLD_CROSSED`; and, separately, `KILL_SWITCH_FIRED` or
  `KILL_SWITCH_DISABLE_FAILED` but not `KILL_SWITCH_ALREADY_DISABLED`), spawns no process and opens
  no socket, and its output contains no secret, no token, and no non-`pmikcmetro.com` address. A
  fixture carrying only the pre-ceiling marker never matches the kill-switch policy; `FIRED` and
  `DISABLE_FAILED` never match the warning policy; and `ALREADY_DISABLED` matches neither paging
  policy. _Verify:_
  `npm run test -- tests/unit/monitoring-plan.test.mjs`.
- **AC-S51-5** — The A2 signal is real and value-free. Driving an external execution to `failed` and to
  `ambiguous` each emits exactly one structured log line carrying action key, execution id, state, and
  data mode; replaying the same transition emits no second line; and a fixture whose payload contains an
  email address, a message body, a tenant name, and a unit label produces a line containing none of those
  substrings. _Verify:_ `npm run test -- tests/unit/external-execution-alert-log.test.ts`; keep the
  existing external-execution store and orchestrator tests green.
- **AC-S51-6** — The incident contract is stated where it is used. The production incident runbook
  contains both severity labels, both acknowledgement windows (30 minutes in business hours for Sev-1,
  one business day for Sev-2), the standing same-day Dan reporting rule for any wrong client-facing
  output, and the instruction that the Sev-1 first action is the runtime suspend rather than a deploy;
  the Admin suspend panel renders that same first-action instruction, and a copy scan finds no jargon or
  em dash in the rendered strings. _Verify:_ `npm run test -- tests/unit/production-incident-runbook.test.mjs`,
  `npm run verify:copy-voice`.
- **AC-S51-7** — The two retention regimes cannot leak. No product-record collection appears in
  `COMMUNICATIONS_RETENTION_TARGETS`; no collection listed in that map acquires an indefinite/no-expiry
  marker; a newly written communications row still receives its class-derived `expires_at` and matching
  `expires_at_ms` and is still cleanup-eligible on schedule; a newly written product record carries the
  indefinite classification, is never selected by `planCommunicationsCleanup`, and honors `legal_hold`.
  _Verify:_ `npm run test -- tests/unit/product-record-retention.test.ts`; keep
  `tests/unit/communications-retention.test.ts` and
  `tests/unit/communications-retention-worker.test.ts` green.
- **AC-S51-8** — The accepted capacity ceiling cannot drift silently. The generated deploy command still
  contains `--max-instances=1`, `--concurrency=10`, `--min-instances=0`, and `--timeout=60`; a test that
  asserts those exact flags fails if any is changed or removed, and the runbook states the ten-concurrent
  ceiling, the pilot bound, the named change signal, and the limiter coupling (raising
  `--max-instances` to N multiplies both per-instance limiters by N). _Verify:_
  `npm run test -- tests/unit/live-cost-scripts.test.mjs`.
- **AC-S51-9** — The rollback rehearsal is re-runnable and refuses a wrong target. A dry-run prints the
  candidate revision, the captured prior serving revision, the promote command, and the rollback command,
  executes nothing, and REFUSES with a named error when the prior revision is absent, is not prefixed by
  the service name, or exceeds the 63-character Cloud Run revision limit — the same guard
  `buildRevisionTrafficCommand` already enforces. A completed rehearsal record contains revision names,
  timestamps, HTTP codes, and counts only, and no customer record or log body. _Verify:_
  `npm run test -- tests/unit/rollback-rehearsal.test.mjs`; keep
  `tests/unit/live-cost-scripts.test.mjs` green.
- **AC-S51-10** — Log hygiene is explicit and the error paths are clean. The printed runbook sets the
  `_Default` log bucket retention to 30 days and grants log viewing to named identities rather than a
  broad primitive role; driving `apiErrorResponse` and the A2 emitter with fixtures containing an email
  address, a message body, and a token produces payloads containing none of those substrings; and
  `npm run verify:redaction` remains green and remains a git-only gate (its scope is unchanged).
  _Verify:_ `npm run test -- tests/unit/log-hygiene.test.ts`, `npm run verify:redaction`.
- **AC-S51-11** — Full gates pass: `npm run format:check`, `npm run lint`, `npm run typecheck`,
  `npm test`, `npm run test:firestore`, `npm run test:e2e:core`, `npm run verify:copy-voice`,
  `npm run verify:spec-traceability`, `npm run verify:context-freshness`, and `npm run build`; keep the
  action-gate, action-registry-schema, seed-allowlist, route-auth, environment-descriptor,
  environment-manifest, provider-construction, and redaction sentinels green.

**Forbidden actions / hard gates.** The runtime suspend may only CLOSE: never a code path, field, admin
value, cache state, or store error that turns a `production_allowed:false` seed entry into an executable
action; never a write to the seed, to either `EXECUTABLE_ALLOWLIST` copy, or to `production_allowed`; and
never a suspension that blocks read-only reconciliation of an already-consumed ambiguous attempt. Any of
those is itself a falsification. No autonomous CLIENT-facing send — internal-staff notifications may
auto-send per `D-AUTOMATION-LINE`, and the monitoring channel is infrastructure alerting to an internal
operator address, never a client-reaching product send; every client-facing send and every
system-of-record write stays human-confirmed, one-attempt, idempotent, receipted, and reversible. Generic
non-workflow `gmail.message.send` stays Registry-closed and is not touched by this suite. No personal
account in any auth path: the notification channel, the log-viewer grants, and every printed command use
the `pmikcmetro.com` identity only. No secret, credential, token, customer value, PII, or guessed endpoint
in git, in an alert policy definition, in a log line, in an audit record, or in rehearsal evidence. The
monitoring generator is print-only: it never executes a `gcloud` command and never creates or deletes a
cloud resource. The rehearsal defaults to a non-mutating dry run; a real bounded promotion or rollback
is permitted only under D05 after the full gate, auth and cost preflights, prior-revision capture, and
smoke pass, and it never deletes a Cloud Run service or revision history. This suite states no numeric
budget figure of its own — the production alert value and hard ceiling are defined by S52, and A3/A4
alert on distinct markers rather than restating either value. Monitoring resource creation, IAM grants,
log-retention changes, billing changes, and credential/scope grants stay owner-run. Routine application
deploy and exact-revision traffic operations follow D05. Under the S40 target, Production accepts
Live data only; nothing here introduces a Demo path into Production or a Live effect into Demo. This suite
sets no provider `production_allowed:true`.

**Ordered prompt sequence.**

1. _Discovery:_ read `lib/integrations/action-gate.ts`, `lib/integrations/action-registry-seed.ts`,
   `lib/execution/risk-policy.ts`, `lib/external-execution/orchestrator.ts` and `authority.ts`,
   `lib/firestore/external-action-executions.ts`, `scripts/deploy-demo-cloud-run.mjs`,
   `scripts/preflight-production-cutover.mjs`, `scripts/setup-budget-killswitch.mjs`,
   `infra/budget-guardrail/`, `lib/gmail-hub/retention-policy.ts`, `firestore.rules`, and
   `docs/v1-monitoring-and-rollback-plan-2026-07-14.md`. Confirm every call site that reads the action
   gate before touching one.
2. _Understanding:_ write the resolved map of live-effect call sites, the terminal execution states that
   must alert, and the exact separation line between product-record retention and
   `COMMUNICATIONS_RETENTION_TARGETS`. Prove which claims in the 2026-07-14 monitoring plan are still
   true and which the fresh rehearsal supersedes.
3. _Build:_ land the pure combinator, the new unprotected gate wrapper, and
   `ActionRuntimeSuspendedError` plus their four-combination sentinel FIRST, with no store and no
   route, so the close-only property is proven before anything can write it.
4. _Build:_ add the suspension store, strict enum/opaque-reference schema, `manageAdmin` route with
   exact-key confirmation, append-only value-free audit, the Admin panel, and the `firestore.rules`
   entries; wire the
   wrapper into every call site from step 2 and add the no-provider-construction sentinel. Keep the
   `firestore.rules` hunk in a separate protected-path commit for owner review while later app-plane
   work continues. Keep `lib/integrations/action-gate.ts` byte-unchanged and make the dynamic
   call-site sentinel name any direct execution-path gate use that has not migrated through the
   wrapper.
5. _Build:_ emit the value-free A2 line on the `failed`/`ambiguous` transition and on a `delivered:false`
   receipt; add the four committed alert policy definitions, `scripts/setup-monitoring.mjs`, and the
   read-only existence verifier.
6. _Build:_ add `scripts/rehearse-rollback.mjs` with its dry-run report and wrong-target refusals; add the
   production incident runbook (severities, windows, Dan rule, Sev-1-first-action) and the capacity
   record; add the retention declaration and its separation gate; add the log-hygiene runbook section and
   the error-path spot-check.
7. _Verify:_ run AC-S51-1 through AC-S51-11 and explicitly falsify: a forged suspension field opening a
   closed gate, a suspended action reaching a provider constructor, a non-Admin suspend, an unconfirmed
   suspend, an unreadable store defaulting open, a duplicate A2 line, a customer value in a log line or
   audit record, a product record entering the communications cleanup plan, a silent `max-instances`
   change, and a rehearsal promoting a revision that does not belong to the service.
8. _Gate:_ change no action gate. This suite adds a close term only; if a live action needs opening, that
   remains the separate reviewed seed/allowlist/pinned-test change owned by that action's suite.
9. _Owner:_ hand back one exact, redacted packet naming the internal operator address to use, the four
   `gcloud` alert-policy create commands (three operational signals plus the distinct kill-switch
   outcome filter for `KILL_SWITCH_FIRED` / `KILL_SWITCH_DISABLE_FAILED`), the channel create
   command, the `_Default` bucket retention command, and the log-viewer IAM grants. The owner runs
   them as `josiah@pmikcmetro.com`. Park that cloud
   activation until S52 has a non-null verified ceiling, record the dependency, and continue the loop.
10. _Context update:_ after code is green but before owner activation, record a built-to-seam fact plus the
    named owner dependency. After the owner runs the commands and the fresh rehearsal completes, add the
    verified S51 fact citing the `AC-S51-*` ids satisfied, record the alert-threshold and log-retention
    `Q-`/`A-` rows, mark the 2026-07-15 rehearsal section historical with a `docs/facts.md` Supersede Log
    marker, keep `docs/status.md` honest, and advance `docs/loop-state.md`.

**Deletion/merge recommendation.** KEEP this spec as the durable production-operations contract. MERGE the
still-true operational content of `docs/v1-monitoring-and-rollback-plan-2026-07-14.md` — the per-provider
monitor states, the rollback-and-correction sequence, and the required-rehearsal table — forward into this
suite's runbook, and keep that file as dated historical evidence rather than deleting it; its 2026-07-15
rehearsal results stay as the pre-S40 record. DELETE the disposable
`docs/temp/production-operational-readiness-plan.md` packet, if the build slice created one, once its
non-sensitive outcomes (thresholds chosen, rehearsal revisions, policy ids) are recorded durably in
`docs/facts.md` and `docs/status.md`.
