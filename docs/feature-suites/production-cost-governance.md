<!-- spec-shape: overhaul-v1 -->

# S52 — Production cost governance and kill-switch redesign

> New 2026-07-29. Implements owner decision **D01** (the highest-consequence item in the
> 64-decision production-unblock audit) plus **D22** (provider quota and terms headroom), under
> `F-PRODUCTION-PHASE-AUTHORIZED` and `F-COST-CEILING-S52`. Its app-plane, read-only, and
> protected-path preparation runs before any cost-bearing deploy or live eval. S51 may build its
> print-only monitoring definitions first, but cloud activation waits for S52's non-null verified
> ceiling; the alert-only threshold is not operator-delivered until S51's channel exists. Every
> change under `infra/budget-guardrail/` is a
> D12 protected path: prepared and surfaced for owner review, never pushed under the standing
> loop grant.

**Goal.** Today a cost overrun on the production project becomes an availability incident: the
budget kill switch's only behaviour is to clear the project's billing account association, which
takes the live app down for residents and staff, is deliberately not auto-reversible, and tells
nobody it happened. That was a defensible design for a scale-to-zero demo. It is the wrong design
for a system PMI KC operators depend on. End state: the hard stop stays armed but sits well above
realistic monthly burn, a mid-level threshold below it reaches the operator directly as an alert
that changes nothing, the kill switch firing is itself an alerted event rather than a silent
outage, every project on the billing account is either covered or unlinked, and the ceiling is one
named value that cannot drift between its two enforcement points. The retired flat figure is
removed as an active rule everywhere it is still asserted, and its per-calendar-month nature is
stated correctly wherever it was described as a lifetime total. No dollar figure is invented by
this suite: the owner sets it at activation from a measured baseline this suite establishes first.
Until that ceiling and its alert value are non-null and verified against the live enforcement points,
there is no approved cost headroom for a deploy, live eval, or other cost-bearing step. The currently
observed flat `$10` monthly enforcement remains a historical/live-state fact until reprovisioning; it
is not authority to spend up to that number and is not a bootstrap ceiling.

**What it is / how it functions.** Five verified mechanical facts drive the design; each was read
in the code before this spec was written.

- **Fact 1 — the two enforcement points multiply, they do not add.**
  `infra/budget-guardrail/decide.mjs:54-55` computes
  `effectiveCap = Math.min(cap, budgetAmount)` whenever the notification carries a positive
  `budgetAmount` (`cap` is the normalized `capUsd` from `decide.mjs:42`), and
  `infra/budget-guardrail/handler.mjs:27` sources `capUsd` from
  `process.env.KILL_SWITCH_CAP_USD ?? DEFAULT_CAP_USD`. Raising the GCP budget alone therefore does
  NOT raise the hard stop — the function's baked env var still clamps it. Both must move in one
  reviewed change or the result is false headroom.
- **Fact 2 — the ceiling is per calendar month.** All three budgets on billing account
  `01A5A3-65CA5A-614D45` carry `calendarPeriod: MONTH` (live `gcloud` read recorded by the audit
  verifier, 2026-07-29). The phrase "total" in `docs/away-mode.md:20` and every doc that copied it
  is wrong, not merely imprecise: it makes a monthly allowance read as a lifetime allowance.
  `docs/budget-and-cost-policy.md` already carries the correction on the governance route
  (its superseded cap banner, `:14-15`); the rest of the corpus does not.
- **Fact 3 — the figure is a corpus, not a constant.** The execution slice derives the current
  occurrence inventory from the worktree instead of pinning counts that become stale as governance
  is repaired. The scan covers active docs, scripts, tests, and operator surfaces while separately
  allowlisting dated historical evidence. Three sites carry the number as a bare literal that a
  `$10`-only scan misses entirely:
  `scripts/check-budget-guard.mjs:14`, `infra/budget-guardrail/decide.mjs:8`,
  and `scripts/setup-budget-killswitch.mjs:19`. A four-file edit leaves most of the corpus stale.
- **Fact 4 — the posture guard enforces no dollars.** `evaluateBudgetGuard`
  (`scripts/check-budget-guard.mjs:59-131`) compares model name, Space count, notification flag and
  away-mode posture. The `cap` value appears only inside error/warning message interpolation and in
  the returned `budgetCapUsd` field (`:127`); no branch reads spend. Changing `BUDGET_CAP_USD`
  changes nothing operationally. If the phase wants a
  real enforcement point, this suite must name one — and it does: the budget amount and
  `KILL_SWITCH_CAP_USD`, moved together, verified against live state.
- **Fact 5 — the number is already operator-visible.** `lib/admin/migration-readiness.ts:18,298`
  imports `BUDGET_CAP_USD` through `readBudgetGuardConfig` and publishes it as `budget.cap_usd`,
  which `app/admin/migration/page.tsx:141` renders as `Posture: <posture>, cap $<n>.` A stale
  constant is not an internal detail; an Admin reads it on screen.

- **Buildable now (app-plane).**
  - **S52-A — the named, single-sourced ceiling.** Add `infra/budget-guardrail/ceiling.mjs`
    exporting `PRODUCTION_MONTHLY_CEILING_USD`, `PRODUCTION_MONTHLY_ALERT_USD`, and
    `COST_CEILING_PROJECTS` (one row per known project: `projectId`, `projectNumber`, `ceilingUsd`,
    `alertUsd`, `posture: "armed" | "unlinked" | "pending_verification"`). A pending row carries null
    dollar values, is always execution-ineligible, and exists so unknown live state is never falsely
    encoded as armed or unlinked. It must live inside `infra/budget-guardrail/`
    because that directory is a standalone package (`infra/budget-guardrail/package.json`,
    `"type": "module"`) deployed with `--source=infra/budget-guardrail`; the function bundle cannot
    import from `scripts/`. Consumers import it: `infra/budget-guardrail/decide.mjs` replaces
    `DEFAULT_CAP_USD`, `scripts/check-budget-guard.mjs` replaces `BUDGET_CAP_USD`, and
    `scripts/setup-budget-killswitch.mjs` replaces the `capUsd: "10"` default. The two dollar
    exports ship **unset** (`null`) until the owner sets them at activation, and unset is a refusal
    everywhere it is read — never a fallback number.
  - **S52-B — three-state decision, alert-only middle.** Widen `decideBillingAction` from
    `{ disable: boolean }` to `{ action: "none" | "alert" | "disable", ... }` with a second
    `alertUsd` option, keeping the existing `Math.min` clamp and the existing non-numeric-cost
    no-op. `handler.mjs` performs a billing mutation only on `disable`; on `alert` it emits exactly
    one structured line and returns without constructing the billing client at all.
  - **S52-C — the kill switch stops being silent and tells the truth about outcome.** `handler.mjs`
    emits stable markers with disjoint semantics:
    `COST_ALERT_THRESHOLD_CROSSED` (mid threshold reached, nothing changed);
    `KILL_SWITCH_FIRED` only after an enabled project is successfully unlinked and readback confirms
    billing is disabled; `KILL_SWITCH_ALREADY_DISABLED` when a repeated notification finds billing
    already disabled, with zero update; and `KILL_SWITCH_DISABLE_FAILED` when the read, update, or
    confirming readback fails, never `FIRED`. Each carries `projectId`, `costAmount`, `alertUsd`,
    `effectiveCap`, `currencyCode`, and `costIntervalStart` — the calendar-month boundary that proves
    Fact 2 in the payload itself. Delivery is Cloud Logging plus S51 log-based alerting and its
    notification channel (D13); `FIRED` and `DISABLE_FAILED` are page-worthy, while the already-
    disabled marker makes retries observable without pretending a second effect happened. The
    function itself gains no send capability, no new dependency, and no new IAM role. Its service
    account holds only project-scoped
    `roles/billing.projectManager` and `roles/run.invoker` (`scripts/setup-budget-killswitch.mjs`
    steps 2 and 3b), and widening a billing-privileged identity to send mail for a notification is
    not a trade this suite makes. The function also stays stateless: Cloud Billing republishes on
    every update, and de-duplication belongs to the alert policy's condition duration, not to
    Firestore state inside a billing function.
  - **S52-D — lockstep by construction, then by test.** `buildRunbook`
    (`scripts/setup-budget-killswitch.mjs:49-118`) already derives both the deployed
    `KILL_SWITCH_CAP_USD` (step 3) and `--budget-amount=<n>USD` (step 4) from one `capUsd`, so the
    generator is lockstep today. What is missing is a proof: a new
    `tests/unit/budget-ceiling-lockstep.test.mjs` asserts, for every `COST_CEILING_PROJECTS` row,
    that the rendered runbook's two figures are identical, that they equal the row's `ceilingUsd`,
    and that `decideBillingAction` fed that pair returns `effectiveCap === ceilingUsd` (i.e. the
    `Math.min` clamp is not silently lowering the stop).
  - **S52-E — the wrong-project footgun.** `resolveConfig`
    (`scripts/setup-budget-killswitch.mjs:24-47`) reads `project` with a `GCP_PROJECT_ID` fallback
    but `project-number` with **no** env fallback. A partial invocation
    (`--project=<other>` without `--project-number`) silently keeps `558870356522`, producing a
    runbook that filters the budget to the PMI production project while baking a different
    `KILL_SWITCH_PROJECT_ID` into the function. The generator must refuse to render unless the pair
    is supplied together and matches a `COST_CEILING_PROJECTS` row, exiting non-zero with zero
    `gcloud` lines emitted.
    **UNPROTECTED PREREQUISITE COMPLETE locally (2026-07-30):** the print-only planner now has no
    numeric fallback, dollar CLI/environment authority, ambient project/location authority, or
    billing-account override. Both renderers require one frozen, source-validated configuration;
    project id/number, Production-row/export coherence, posture, uniqueness, ordered thresholds,
    shell-safe identifiers, exact alert/ceiling encoding, and the below-alert manual trigger are
    pinned by fixture and real-subprocess refusal tests. The actual CLI intentionally emits zero
    stdout and exits non-zero because no D12-protected source is imported yet. This closes the local
    refusal/planner seam for S52-A/D/E; it does not claim AC-S52-1/2/3/6/7 or activation complete.
    AC-S52-9 must validate baseline id/rationale before the protected source may be wired.
  - **S52-F — live/repo drift becomes visible.** `scripts/reality-check.mjs:22` currently lists
    "Billing spend vs the $10 cap, and whether the budget kill switch is still wired" under
    `NOT_COVERED`. Move it into a covered dimension: per project, read the budget amount, its
    `calendarPeriod`, whether the Pub/Sub topic is connected, and the deployed
    `KILL_SWITCH_CAP_USD`, and compare against `ceiling.mjs`. These are free metadata reads, so the
    script's "never spends" contract (`scripts/reality-check.mjs:12-15`) holds. Follow the existing
    shape: the live read is injected and `summarizeReality` stays pure, so the verdicts are
    unit-tested without a network call, and no ADC still yields `unverified` with exit 0.
  - **S52-G — honest posture copy.** `check:budget-guard` and `docs/budget-and-cost-policy.md` must
    say what the guard actually does: it refuses an unsafe _configuration_, it does not observe
    spend, and it is not the ceiling's enforcement point. The rendered Admin line at
    `app/admin/migration/page.tsx:141` must read from the single source and must not present a
    posture check as a spend check.
  - **S52-H — the retired-figure sweep with a sentinel.** One pass over the corpus in the
    supersession table below, plus `tests/unit/cost-ceiling-corpus.test.mjs`: a scan that fails when
    the retired literal appears outside an explicit allowlist of dated historical files. Without the
    sentinel the corpus silently regrows, because 27 feature-suite specs copy the clause from
    `docs/feature-suites/TEMPLATE.md`.
  - **S52-I — provider quota and terms column (D22).** Add a `Documented quota / terms` column to
    the **Provider activation registry** table in `docs/environment-handoff.md` (the real provider
    table, currently `System | App role | Non-secret activation anchors | Secret owner/location |
Safe default`) and fill each row as its credential lands. Unfilled cells carry the standard
    `Needs Verification` marker, never a blank. The failure handling already exists and is not the
    gap: `RentVineRateLimitError` parses `Retry-After` on HTTP 429
    (`lib/integrations/rentvine/client.ts:66-71,253-259`) and `GmailRuntimeError` treats 408/429/5xx
    as ambiguous-and-retryable (`lib/gmail-runtime/client.ts:46-48`). What no document records is
    the actual ceiling, or whether intended live volume fits inside it. RentCast is called out
    by name: confirm the plan permits storing comp data and displaying it to a property owner
    before S28b activates.
    **COMPLETE locally (2026-07-30):** the provider registry now has the required nonblank column
    for every row, cites official Gmail/Sheets/Drive and RentCast material where public limits or
    terms are known, and keeps account-specific quotas, plans, intended-volume fit, and third-party
    terms explicitly `Needs Verification`. The RentCast owner-facing storage/display/caching
    dependency is routed to `docs/client-checklist.md`; S28b remains unavailable.
  - **S52-J — per-user throttles stated as the third layer.** `lib/api/model-call-throttle.ts`
    already bounds the two paid model routes per user (Ask: capacity 15, refill 0.5/s; classify:
    capacity 10, refill 0.2/s), and its header already states the division of labour correctly: the
    global kill switch bounds total spend, not one user's call rate. Record it in the cost-control
    model rather than rebuilding it.
    **COMPLETE locally (2026-07-30):** `docs/budget-and-cost-policy.md` records the exact two
    authenticated-UID token buckets as an independent third layer, including their in-memory,
    per-instance boundary. Frozen exported policy constants and pinned tests prevent value/keying
    drift without misrepresenting these throttles as global spend enforcement.

- **Build to the seam (live provider).** The "provider" here is the Cloud Billing budget plus the
  deployed `budget-guardrail` function on each project. The loop builds the full parameterized
  provisioning/reprovisioning runbook, the lockstep proof, the drift check, and the per-project
  coverage table, and it verifies live state read-only when ADC is fresh. A stale auth check parks
  only that read; the local and injected-fixture work continues. It never creates a budget, deploys
  the function, changes an env var on a deployed function, or unlinks a project's billing.
- **Named activation dependencies.** S52 has five explicit inputs/actions, none of which is replaced by
  a runner-invented default: (1) one full-calendar-month measured burn baseline, which cannot exist for
  the July 2026 production month before 2026-08-01; (2) owner-selected non-null values for
  `PRODUCTION_MONTHLY_CEILING_USD` and `PRODUCTION_MONTHLY_ALERT_USD`, justified by that baseline;
  (3) the owner decision to arm or unlink the second project `adept-primacy-499822-d7`; (4) the internal
  `pmikcmetro.com` operator channel S51 will activate; and (5) owner review of the protected
  `infra/budget-guardrail/` commit followed by the owner-run enforcement change. That final packet
  updates each budget's amount and threshold rules, redeploys each function with the matching
  `KILL_SWITCH_CAP_USD`, and confirms the Console-only topic attachment survived. The topic attach step
  is unavoidably Console-only: the budgets publisher
  `billing-budget-alert@system.gserviceaccount.com` cannot be bound through `gcloud`, and this org's
  `iam.allowedPolicyMemberDomains` constraint must be relaxed on that one project and re-locked
  (`docs/budget-killswitch.md`, "How the last link was wired"). While any dependency remains, the loop
  records S52 as built-to-seam, performs no cost-bearing operation, and continues with local/app-plane
  work in other suites.

**Open questions & assumptions.**

- _Answered 2026-07-29 (D01):_ raise the hard cap above realistic monthly burn, keep it armed, and
  add a mid-level alert-only threshold that reaches the operator directly. The failure mode, not
  the number, was the substance of the decision.
- _Open (GAP-19):_ **no full-month burn measurement exists.** Nothing in the repo records observed
  spend for a full production calendar month; `scripts/reality-check.mjs` explicitly lists billing
  spend as not covered, and there is no BigQuery billing export. The July 2026 calendar month is not
  complete before 2026-08-01, so the suite records the earliest honest measurement date and does not
  synthesize a partial-month, annualized, zero-dollar, or other bootstrap baseline. The two dollar
  values therefore stay named, null parameters until the owner supplies the full-month measurement
  and chooses both values. Record the question as a `Q-` row at build time and resolve it with a
  measurement, not an estimate.
- _No default:_ this suite offers no multiplier, floor, bootstrap value, or inherited figure. Once
  the baseline exists, the owner selects the alert and hard-stop values; the runner records the
  calculation or rationale next to them and verifies ordering and lockstep, but never chooses the
  values.
- _New-Demo bootstrap, explicit and owner-selected:_ a project that has never incurred a full
  calendar month cannot satisfy a per-project historical baseline before its first billed operation.
  The only exception is the newly created S40 Demo project: after a verified full-calendar Production
  baseline exists, the owner may select explicit initial Demo alert/ceiling dollar values and record a
  rationale plus the Production baseline reference. The runner supplies no multiplier, projection, or
  inherited number. That bootstrap expires after Demo's first complete calendar month; subsequent
  eligibility requires Demo's own full-calendar baseline and owner-selected recalibration. Until the
  owner supplies those initial values, Demo activation remains blocked while print-only/local work
  continues.
- _Assumption:_ unset is a refusal, not a default. With either dollar value unset, `killswitch:plan`
  refuses to render and `handleBudgetEvent` takes no billing action. For a _disable_ action the safe
  failure is loud inaction, because an unconfigured cap that causes an unplanned production outage
  is strictly worse than one that causes a loud alert.
- _Assumption:_ retiring the language disarms nothing. The currently deployed switch keeps whatever
  `KILL_SWITCH_CAP_USD` and budget amount the cloud holds until the owner runs the reprovision. No
  repo edit in this suite can change live enforcement.
- _Answered 2026-07-29 (D22):_ add a quota and terms column to the provider table and fill it as
  each credential lands.
- _Client-owned:_ the RentCast plan's storage/display/redistribution terms for comp data shown to a
  property owner; route as confirm-with-default in `docs/client-checklist.md` before S28b.
- _Open (IN-03 / D11):_ whether `adept-primacy-499822-d7` is unlinked or armed. Until a live read
  resolves it, its `COST_CEILING_PROJECTS` row is `pending_verification` with null values and all
  cost-bearing eligibility checks fail closed. The owner chooses unlinked or armed only from verified
  state; the runner never forces an unknown project into either posture.

**Cross-product impacts.**

- New: `infra/budget-guardrail/ceiling.mjs`, `docs/cost-baseline.md` (aggregate, non-secret,
  per-project monthly totals with the date and source of each reading — no customer identifier and
  no invoice attachment), `tests/unit/budget-ceiling-lockstep.test.mjs`,
  `tests/unit/cost-ceiling-corpus.test.mjs`, `tests/unit/environment-handoff-provider-table.test.mjs`.
- Modified: `infra/budget-guardrail/decide.mjs`, `infra/budget-guardrail/handler.mjs`,
  `infra/budget-guardrail/README.md`, `scripts/setup-budget-killswitch.mjs`,
  `scripts/check-budget-guard.mjs`, `scripts/reality-check.mjs`, `lib/admin/migration-readiness.ts`,
  `app/admin/migration/page.tsx`, `docs/budget-and-cost-policy.md`, `docs/budget-killswitch.md`,
  `docs/away-mode.md`, `docs/environment-handoff.md`, `docs/google-setup.md`, and the existing
  `tests/unit/budget-guard.test.mjs` / `tests/unit/budget-killswitch.test.mjs` /
  `tests/unit/reality-check.test.mjs` / `tests/unit/migration-readiness.test.ts` pins.
- **Protected paths (D12).** `infra/budget-guardrail/**` and
  `scripts/check-budget-guard.mjs` are the protected paths this suite touches. Slices touching them
  are prepared and surfaced for owner review rather than pushed under the standing commit/push grant,
  even when the gate is green. The deploy wrapper is not itself a D12 protected path; its changes
  still require tests and must preserve the exact env/secret allowlist.
- **Coordination with S51.** S52 owns the four marker strings and their payload fields; S51 owns the
  notification channel and the log-based alert policies that match them (D13). Neither invents the
  other's half. Until S51's channel is live, S52 reports the alert threshold as built-not-delivered
  rather than claiming an operator is reachable.
- **Ordering boundary.** S51's and S52's local/app-plane or print-only slices may interleave. No
  cost-bearing deploy, S54 live eval, monitoring activation, or provider activation may run until S52
  records non-null owner-selected values, the lockstep tests pass, and the read-only live check verifies
  the active enforcement posture. A red or unavailable live check parks only those operations; it does
  not stop unrelated local implementation.
- **Coordination with S40/D11.** A Demo GCP project must be created _with_ budget and kill-switch
  coverage, not retrofitted. S40 supplies the identifiers; S52 supplies the requirement and the row.
  Because a new project has no historical month, its one-time owner-selected initial values follow the
  constrained Demo bootstrap above and expire after the first full Demo calendar month.
- Supersedes the retired flat cloud cap. `AGENTS.md`, `docs/facts.md` (`F-BUDGET-1`,
  `F-COST-CEILING-S52`, Supersede Log marker `BUDGET-FLAT-TOTAL-CAP`), `docs/loop-state.md`, and
  `docs/autonomous-agent-runner.md` were already updated on the governance route and are **not**
  edited by this suite. The table below is the authoring-time routing inventory, not a live count or
  claim that every listed occurrence still exists. The 2026-07-29 governance sweep already
  reconciled the normative policy, active launchers, template, and active suite boilerplate. At
  execution, regenerate the scan and act only on actual survivors:

| Disposition                        | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Action                                                                                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Already retired (do not edit)      | `AGENTS.md`, `docs/loop-state.md`, `docs/autonomous-agent-runner.md` (0 remaining), `docs/facts.md` (4 remaining, all inside Verified historical rows)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Orchestrator-owned. Verify only that no active `$10` claim remains; `docs/facts.md` goes on the sentinel allowlist rather than being edited.                                          |
| Normative cost policy (reconciled) | `docs/budget-and-cost-policy.md`, `docs/budget-killswitch.md`, `docs/away-mode.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Reconciled 2026-07-29. Preserve the explicitly labeled legacy live-state value as history; verify no line grants headroom from it.                                                    |
| Code carrying the number           | `scripts/check-budget-guard.mjs` (:12, :14, :18), `infra/budget-guardrail/decide.mjs` (:5, :8), `scripts/setup-budget-killswitch.mjs` (:19), `infra/budget-guardrail/README.md` (:6), `lib/admin/migration-readiness.ts` + `app/admin/migration/page.tsx`                                                                                                                                                                                                                                                                                                                                                                                                              | Resolve from `ceiling.mjs`. Note that the three bare constants do not match a `$10` scan and must be found by name.                                                                   |
| Incidental code prose              | `scripts/reality-check.mjs` (:13, :22), `scripts/cutover-dry-run.mjs` (:9), `scripts/preflight-rentvine.mjs` (:7), `scripts/deploy-demo-cloud-run.mjs` (:211), `lib/gmail-inbox-zero/anticipatory-draft.ts` (:21)                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Reword to "the production cost ceiling defined by S52". `--budget-confirmed` stays a hard refusal; only its message changes.                                                          |
| Test pins                          | `tests/unit/budget-guard.test.mjs` (:28-29), `tests/unit/budget-killswitch.test.mjs` (:12, :51, :73, :83, and the `capUsd: 10` handler deps), `tests/unit/migration-readiness.test.ts` (:299)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Re-pin to the named parameter or to fixture-local values, so no test re-asserts the retired figure as policy.                                                                         |
| Active operator prompts / setup    | Production/UI launchers, `docs/meta-prompts/scaffold.md`, `docs/meta-prompts/space-teeth-wave2.md`, `docs/meta-prompts/writeback-approval-followons.md`, and `docs/google-setup.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Reconciled 2026-07-29. The corpus sentinel keeps the S52 ceiling and auth-parking behavior from regrowing stale instructions.                                                         |
| Suite boilerplate                  | `docs/feature-suites/TEMPLATE.md` and active sibling specs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Reconciled 2026-07-29. The corpus sentinel fails any reintroduced operative flat-cap clause.                                                                                          |
| Dated historical record (annotate) | `docs/products/lease-renewal-build-plan.md`, `docs/local-app-interactive-audit-checklist-2026-07-13.json`, `docs/roadmap-unblock-2026-07-23.md`, `docs/whats-next.md`, `docs/spec.md`, `docs/specs/spec-1-technical-spec.md`, `docs/research-backlog.md`, `docs/products/rentvine-connection-setup.md`, `docs/overnight-build-run-2026-07-22.md`, `docs/demo-lane-retirement.md`, `docs/auth-identity-and-access-strategy.md`, `docs/status.md` (46 dated entries), and the three dated `.html` deliverables `docs/customer-demo-walkthrough-2026-07-21.html` (2), `docs/audit-2026-07-22.html` (2), `docs/production-release-and-live-test-guide-2026-07-11.html` (1) | Keep the figure as an honest record of what was true then; add a dated superseded-by marker where the format allows. These plus `docs/facts.md` form the corpus sentinel's allowlist. |

**Adversarial acceptance checks.**

- **AC-S52-1** — One source, no survivors. `infra/budget-guardrail/ceiling.mjs` is the only module
  defining a cost-ceiling number; `scripts/check-budget-guard.mjs`,
  `scripts/setup-budget-killswitch.mjs`, and `infra/budget-guardrail/decide.mjs` each resolve from
  it, and a scan of those four files finds zero remaining numeric cap literal. Editing the value in
  `ceiling.mjs` alone changes every consumer, including the string rendered at
  `app/admin/migration/page.tsx:141`. _Verify:_
  `npm test -- tests/unit/budget-ceiling-lockstep.test.mjs`; keep `tests/unit/budget-guard.test.mjs`,
  `tests/unit/budget-killswitch.test.mjs`, and `tests/unit/migration-readiness.test.ts` green.
- **AC-S52-2** — Lockstep is proven, not assumed. For every `COST_CEILING_PROJECTS` row the rendered
  runbook contains `KILL_SWITCH_CAP_USD=<n>` and `--budget-amount=<n>USD` with byte-identical `<n>`
  equal to that row's `ceilingUsd`, and `decideBillingAction({costAmount: n, budgetAmount: n}, {capUsd: n})`
  returns `effectiveCap === n` with `action === "disable"`. A fixture that raises only one of the two
  yields a refusal naming the mismatched pair and emits zero `gcloud` lines. _Verify:_
  `npm test -- tests/unit/budget-ceiling-lockstep.test.mjs`, `npm test -- tests/unit/budget-killswitch.test.mjs`.
- **AC-S52-3** — Unset invents nothing and disarms nothing. With `PRODUCTION_MONTHLY_CEILING_USD`
  unset, with `PRODUCTION_MONTHLY_ALERT_USD` unset, with both unset, with either non-finite or
  non-positive, or with `alertUsd >= ceilingUsd`, `npm run killswitch:plan` exits non-zero, prints a
  refusal naming the invalid parameter/order, emits zero `gcloud` lines, and constructs no cloud
  client. `handleBudgetEvent` with either required option absent/invalid logs
  `BUDGET_GUARDRAIL_MISCONFIGURED` and makes zero `getProjectBillingInfo` /
  `updateProjectBillingInfo` calls. No repo state change alters a deployed function's env var.
  _Verify:_ `npm test -- tests/unit/budget-killswitch.test.mjs`,
  `npm test -- tests/unit/budget-ceiling-lockstep.test.mjs`.
- **AC-S52-4** — Decision and handler outcomes are observable without false success. Below the
  alert value: `action:"none"`, no marker line, zero billing-client construction. At or above the
  alert value and below the effective cap: `action:"alert"`, exactly one
  `COST_ALERT_THRESHOLD_CROSSED` line carrying `projectId`, `costAmount`, `alertUsd`,
  `effectiveCap`, `currencyCode`, and `costIntervalStart`, and zero calls to
  `getProjectBillingInfo` / `updateProjectBillingInfo`. At or above the effective cap, the decision
  is `action:"disable"` and the handler has three disjoint tested outcomes: enabled → exactly one
  update, confirming readback, then one `KILL_SWITCH_FIRED`; already disabled → zero updates and one
  `KILL_SWITCH_ALREADY_DISABLED`; read/update/readback failure → no `FIRED`, one
  `KILL_SWITCH_DISABLE_FAILED`, and a failed invocation so monitoring can page. A notification with
  a non-numeric `costAmount` still produces no action and no marker. _Verify:_
  `npm test -- tests/unit/budget-killswitch.test.mjs`.
- **AC-S52-5** — The switch can no longer fire or fail silently, and it gains no send power. All
  four marker strings are pinned by test and are byte-identical to the strings S51's log-based
  alert policies match where appropriate; a negative-import assertion shows
  `infra/budget-guardrail/` declares no transport,
  notification, or Gmail dependency beyond `@google-cloud/billing` and
  `@google-cloud/functions-framework`, and requests no IAM role beyond project-scoped
  `roles/billing.projectManager` and `roles/run.invoker`. Until S51's channel exists the suite
  reports the alert path as built-not-delivered. _Verify:_
  `npm test -- tests/unit/budget-killswitch.test.mjs`; owner-run `gcloud logging read` against the
  existing safe no-op wiring test in `npm run killswitch:plan` step 5.
- **AC-S52-6** — Every project is covered, unlinked, or explicitly unresolved.
  `COST_CEILING_PROJECTS` holds a row for each
  project linked to billing account `01A5A3-65CA5A-614D45` — the PMI production project
  (`pmi-kc-kb-prod`, number `558870356522`), the second project (`adept-primacy-499822-d7`, number
  `910739668168`), and the Demo project once D11 supplies it. Only a live-verified `armed` row with
  valid values or a live-verified `unlinked` row is settled. `pending_verification` is permitted as an
  honest representation but always reports `drifted`/ineligible and emits no command. Against an
  injected live-state fixture the coverage check exits non-zero when a linked project has no row,
  when state disagrees with its row, or when a pending row is used for execution. _Verify:_
  `npm test -- tests/unit/budget-ceiling-lockstep.test.mjs`, `npm run reality:check`.
- **AC-S52-7** — The wrong-project footgun is closed. `node scripts/setup-budget-killswitch.mjs --project=adept-primacy-499822-d7`
  without `--project-number` exits non-zero, names both flags in the refusal, and emits zero
  commands. With both supplied and matching a row, every `--project=`, `--filter-projects=`,
  `KILL_SWITCH_PROJECT_ID=`, and service-account email in the rendered runbook names that same
  project, and none names another row's project. _Verify:_
  `npm test -- tests/unit/budget-ceiling-lockstep.test.mjs`.
- **AC-S52-8** — Drift between repo and cloud is visible. `NOT_COVERED` in
  `scripts/reality-check.mjs` no longer contains the billing-spend / kill-switch-wiring entry;
  against an injected live-state fixture the report carries, per project, the budget amount, its
  `calendarPeriod`, whether the Pub/Sub topic is connected, and the deployed `KILL_SWITCH_CAP_USD`,
  marking `in-sync` only when both enforcement points equal the row's `ceilingUsd` and the period is
  `MONTH`. Without ADC the verdict is `unverified` and the exit code is 0. _Verify:_
  `npm test -- tests/unit/reality-check.test.mjs`, `npm run reality:check`.
- **AC-S52-9** — A baseline exists before a number does. `docs/cost-baseline.md` records, per
  armed project, a schema-parsed interval from the first instant of one calendar month through the
  first instant of the next, measured aggregate spend, reading date, source, and stable baseline id;
  it contains no customer name, address, invoice, or account identifier. The sentinel rejects an
  empty/placeholder file, partial interval, projection, annualization, bootstrap row for an existing
  project, missing armed project, or date range that is not a complete calendar month.
  `ceiling.mjs` records next to each non-null alert/ceiling pair the exact baseline id and
  owner-selection rationale, and the sentinel proves the pair resolves to that project's eligible
  row. The sole alternate row kind is `owner-approved-initial-demo`: it is allowed only for the new
  S40 Demo project, must reference an eligible Production full-calendar baseline, records explicit
  owner-selected values and rationale, and expires after Demo's first complete calendar month; after
  expiry it cannot license a plan until a Demo full-calendar row replaces it. Setting either value
  while no eligible linked baseline row exists fails the corpus sentinel. _Verify:_
  `npm test -- tests/unit/cost-ceiling-corpus.test.mjs`, `npm run verify:redaction`.
- **AC-S52-10** — The retired figure is gone as an active rule and cannot regrow. A scan finds no
  occurrence of the retired literal outside the dated-historical allowlist, no active file describes
  the ceiling as a "total", and `docs/feature-suites/TEMPLATE.md` names the S52 ceiling so a new
  spec copies the corrected clause. Adding the literal to any non-allowlisted file fails the scan.
  _Verify:_ `npm test -- tests/unit/cost-ceiling-corpus.test.mjs`,
  `npm run verify:context-freshness`.
- **AC-S52-11** — The posture guard stops implying a spend check. `npm run check:budget-guard` output
  and `docs/budget-and-cost-policy.md` both state that it evaluates configuration, not spend, and
  that it is not the ceiling's enforcement point; `evaluateBudgetGuard` returns `ok:true` for a
  posture-safe config for any ceiling value, and `ok:false` for the Pro/multi-Space/notifications
  postures regardless of the ceiling — proving the dollar figure is not an enforcement input. The
  Admin line at `app/admin/migration/page.tsx:141` reflects the same distinction in its rendered
  text. _Verify:_ `npm test -- tests/unit/budget-guard.test.mjs`,
  `npm test -- tests/unit/migration-readiness.test.ts`.
- **AC-S52-12** — Provider quota and terms are recorded, not assumed (D22). The **Provider
  activation registry** table in `docs/environment-handoff.md` carries a `Documented quota / terms`
  column; every row has a cell, and an unfilled cell renders the standard `Needs Verification`
  marker rather than a blank. The RentCast entry distinguishes the public API terms from the exact
  PMI plan and any applicable third-party-data terms; it records those account-specific
  storage/display/caching rights as `Needs Verification`, and S28b activation remains blocked until
  they are confirmed.
  _Verify:_ `npm test -- tests/unit/environment-handoff-provider-table.test.mjs`;
  `npm run verify:context-freshness`.
- **AC-S52-13** — The cost-control model records all three independent layers without implying that
  one satisfies another: configuration posture (not a spend read or enforcement point), the global
  billing alert/hard ceiling (aggregate project spend), and per-user paid-model throttles. The third
  layer names the two implemented token buckets exactly — Ask capacity 15/refill 0.5 token/s and
  classify capacity 10/refill 0.2 token/s — plus their authenticated-UID key, in-memory,
  per-instance limitation. A test compares the documented values with the runtime options and
  behavior so either side drifting alone fails. _Verify:_
  `npm test -- tests/unit/model-call-throttle-policy.test.ts`.

Full-suite gate for every slice: `npm run format:check`, `npm run lint`, `npm run typecheck`,
`npm test`, `npm run verify:spec-traceability`, `npm run verify:context-freshness`,
`npm run verify:redaction`, `npm run test:firestore`, then `bash scripts/verify.sh`.

**Forbidden actions / hard gates.** A violation of any of these is itself a falsification. This
suite never runs a cost-bearing or billing-mutating command: creating or updating a budget,
deploying or redeploying `budget-guardrail`, changing a deployed env var, granting billing IAM,
attaching a Pub/Sub topic, unlinking or relinking a project's billing, and relaxing or re-locking
the `iam.allowedPolicyMemberDomains` org policy are all owner-run. **Never trip the real disable
path against a project anyone depends on** — the only sanctioned live exercise is the existing
no-op wiring test that publishes a below-threshold notification, and a genuine end-to-end disable is
proven on a throwaway project or by the injected-client unit tests, never against
`pmi-kc-kb-prod`. Never raise one enforcement point without the other in the same reviewed change;
never let an unset ceiling become a default number; never let a repo edit alter live enforcement.
Never grant the guardrail service account a send scope, a notification transport, or any role beyond
project-scoped `roles/billing.projectManager` and `roles/run.invoker`. Never put a billing account
id, invoice, customer name, or PII into `docs/cost-baseline.md` or any evidence file — aggregate
non-secret dollars and dates only. `infra/budget-guardrail/**` and
`scripts/check-budget-guard.mjs` are the D12 protected paths in this suite: prepare them for owner
review and never push them under the standing grant. Deploy-wrapper changes are tested routine code
unless they travel with one of those protected changes.
The standing safety NEVERs survive unchanged: no autonomous CLIENT-facing send (internal-staff
notification auto-send is permitted per `D-AUTOMATION-LINE`, and this suite's alerts are Cloud
Monitoring output, not application sends); generic non-workflow `gmail.message.send` stays
Registry-closed; the personal account never enters any auth path; no secrets, PII, or guessed
endpoint in git; every live effect stays one-attempt, idempotent, receipted, and reversible; and
every client-facing send or system-of-record write stays human-confirmed. The production cost
ceiling defined by S52 replaces the retired flat figure; while it is unset, no cost-bearing step may
assume headroom. The currently observed retired enforcement amount is not a spending allowance, and
neither a partial month nor a formula may be substituted for the missing full-month baseline. This
suite adds no Action Registry entry and sets `production_allowed:true` on
nothing. Suite-specific hard stop: the alert path must NEVER acquire a billing mutation; a
successful disable/readback must emit `KILL_SWITCH_FIRED`; an already-disabled repeat must emit only
`KILL_SWITCH_ALREADY_DISABLED`; and a failed read/update/readback must emit
`KILL_SWITCH_DISABLE_FAILED`, never `FIRED`. A silent or falsely successful disable is the exact
defect this suite exists to remove.

**Ordered prompt sequence.**

1. _Discovery:_ read `infra/budget-guardrail/{decide,handler,index}.mjs` and its `package.json`,
   `scripts/{check-budget-guard,setup-budget-killswitch,reality-check}.mjs`,
   `lib/admin/migration-readiness.ts`, `app/admin/migration/page.tsx`,
   `docs/{budget-and-cost-policy,budget-killswitch,away-mode,environment-handoff}.md`, and S51's
   spec. Re-run the corpus scan and reconcile it against the supersession table before editing
   anything.
2. _Understanding:_ restate the five mechanical facts against the code as read, and write the
   coverage matrix of projects on billing account `01A5A3-65CA5A-614D45` with each project's current
   budget, `calendarPeriod`, topic attachment, and deployed cap. Mark anything not read live as
   unverified rather than assumed.
3. _Owner:_ request the burn baseline first — it is the one input every cost-bearing operation needs.
   Record that July 2026 cannot supply a full-calendar-month production baseline before 2026-08-01;
   once available, ask for the full month's spend per existing armed project from Cloud Billing
   reports and record it in `docs/cost-baseline.md` as aggregate non-secret figures with the reading
   date. Ask the owner to set both values from that evidence. Do not offer or apply a multiplier,
   floor, partial-month projection, or inherited dollar figure. For the brand-new Demo project only,
   present the constrained owner-selected initial-value record after the Production baseline exists
   and pin its first-full-month expiry; the runner still proposes no number.
4. _Build:_ land `infra/budget-guardrail/ceiling.mjs` with both values unset, wire every consumer to
   it, and add `tests/unit/budget-ceiling-lockstep.test.mjs` (AC-S52-1, AC-S52-2, AC-S52-3). Surface
   this slice for owner review — it is a protected path.
5. _Build:_ widen `decideBillingAction` to the three-state decision, emit the four truthful markers
   from `handler.mjs`, and prove every state plus the no-send / no-extra-IAM negative assertions
   (AC-S52-4, AC-S52-5). Coordinate the exact marker strings with S51 before pinning them.
6. _Build:_ close the runbook footgun and land the per-project coverage table and check (AC-S52-6,
   AC-S52-7); extend `scripts/reality-check.mjs` with the drift dimension, keeping `summarizeReality`
   pure and the live read injected (AC-S52-8).
7. _Build:_ sweep the corpus in the supersession table, correct "total" to "per calendar month",
   fix `docs/feature-suites/TEMPLATE.md` before its 26 siblings, add
   `tests/unit/cost-ceiling-corpus.test.mjs` with the dated-historical allowlist, and make the
   posture-guard copy honest (AC-S52-9, AC-S52-10, AC-S52-11). Do not edit `AGENTS.md`,
   `docs/facts.md`, `docs/loop-state.md`, or `docs/autonomous-agent-runner.md` — already retired on
   the governance route.
8. _Build:_ add the `Documented quota / terms` column to the Provider activation registry in
   `docs/environment-handoff.md`, fill what is already known, mark the rest `Needs Verification`, and
   route the RentCast display/caching question to `docs/client-checklist.md` (AC-S52-12).
9. _Build:_ record the existing authenticated-user paid-model token buckets as the third,
   independent cost-control layer. Pin the policy's exact values and the runtime behavior without
   presenting a per-instance throttle as global spend enforcement (AC-S52-13).
10. _Gate:_ run the full gate list. Adversarially falsify each check: raise one enforcement point
    alone, leave a value unset, feed a cost exactly at the alert value and exactly at the cap, feed a
    non-numeric `costAmount`, invoke the runbook with a half-supplied project pair, add the retired
    literal to a non-allowlisted file, and confirm each produces the stated refusal or marker.
11. _Owner:_ once the full-month baseline, both owner-selected values, second-project disposition, and
    S51 operator channel are known, hand back one exact, redacted reprovision packet per project —
    current versus target
    budget amount and threshold rules, current versus target `KILL_SWITCH_CAP_USD`, the redeploy
    command, the Console-only topic-attach step with the org-policy relax/re-lock note, the armed
    verification (`gcloud pubsub topics get-iam-policy` showing the
    `billing-budget-alert@system.gserviceaccount.com` publisher binding), the safe no-op wiring test,
    and the relink recovery command. The owner runs it.
12. _Verify:_ after the owner run, re-run `npm run reality:check` and confirm every project reports
    `in-sync` with `calendarPeriod: MONTH`, both enforcement points equal to the row's `ceilingUsd`,
    and the topic attached. Confirm with S51 that a `COST_ALERT_THRESHOLD_CROSSED` line reaches the
    notification channel.
13. _Context update:_ promote the shipped work to a `docs/facts.md` `F-*` row (for example
    `F-COST-CEILING-ARMED`) citing the `AC-S52-*` ids satisfied, extend the Supersede Log entry under
    the existing `BUDGET-FLAT-TOTAL-CAP` marker with the corpus-sweep completion, update
    `docs/environment-handoff.md` and `docs/status.md`, and advance `docs/loop-state.md` past S52.

**Deletion/merge recommendation.** KEEP this spec as the durable cost-governance contract; it is the
single place the ceiling, its two enforcement points, its alert threshold, and its per-project
coverage are defined. MERGE nothing into it — `docs/budget-and-cost-policy.md` stays the operational
day-to-day policy and `docs/budget-killswitch.md` stays the kill-switch runbook; this spec governs
what those two must say. DELETE the local-only `docs/temp/second-project-budget-guard.md` packet only
after its verified option (`unlinked` or `armed`) replaces the `pending_verification`
`COST_CEILING_PROJECTS` row and its
hardened prerequisites are folded into `scripts/setup-budget-killswitch.mjs`, since `docs/temp/` is
gitignored and would otherwise take the only copy of those steps with it.
