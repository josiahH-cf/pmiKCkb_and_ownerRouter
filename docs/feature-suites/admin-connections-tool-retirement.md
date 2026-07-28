<!-- spec-shape: overhaul-v1 -->

# S48 — Workflow Communications, provider Connections, task Admin, and end-state tool retirement

> New 2026-07-28. Implements D-08 and D-09, plus WS-07. There is intentionally no replacement
> “Test Lab.”

**Goal.** Communications contains real workflow-linked message work, Connections contains provider
setup/health/action availability, and Admin contains a small set of task-based management areas.
Operator work is not interrupted by Registry diagnostics, browser-only simulations, hard-coded
actors, no-op Sample controls, or duplicate readiness tools. Shipped Test/developer tools are
removed; automated verification, Demo environment behavior, security primitives, and real provider
seams remain.

**What it is / how it functions.**

- **Workflow-only Communications.** The index shows authorized renewal/maintenance threads and
  attention that originate from a workflow entity. Detail supports the existing bounded read,
  approved labels, governed drafts, and exact-confirmed replies. Remove browser-only simulated email
  chains, hard-coded actors, anticipatory demo drafts, generic inbox/compose, and lab-only template/
  triage/thread-summary evaluators. A useful evaluator becomes an automated test or a bounded Admin
  configuration preview only if it directly validates a retained end-state rule.
- **Provider-focused Connections.** Each provider has one setup/health area: purpose, connection
  status, connect/reconnect/revoke where authorized, reviewed generic front door, affected
  capabilities, and a plain next step. Expandable Advanced detail contains exact account/identity,
  Registry keys/readiness/evidence, endpoint/version, last proof/error, kill switch, and setup
  diagnostics. Never put credentials or secret values in rendered state.
- **Task-based Admin.** Replace the twenty-panel page with a compact dashboard and bounded subroutes:
  `People & access`; `Spaces & sources`; `Decisions & content rules`; `Notifications & support`;
  `Retention & audit`; and `Advanced`. Equivalent labels/grouping are allowed only if every current
  retained task has one owner and daily users no longer scan an all-panels page.
- **Advanced ownership.** Migration/readiness internals, model/index controls, technical action
  matrices, source health details, and compatibility instrumentation live under named Advanced
  tasks. Destructive or cost-bearing controls retain exact preview, role, cost preflight, audit, and
  rollback.
- **End-state tool classification.** For every current Test/developer control classify:
  `REMOVE_SHIPPED_UI`, `CONVERT_TO_AUTOMATED_TEST`, `KEEP_DEMO_PRODUCT_FLOW`,
  `KEEP_PROVIDER_ACTIVATION_SEAM`, `KEEP_SECURITY/ROLLBACK`, or `INVESTIGATE_S49`. No “keep in Test
  Lab” category exists.
- **Explicit removals.** Stage-one remove/hide browser-only simulated email, hard-coded actor chains,
  no-op owner/tenant preparation controls, operator action simulators, full Test handoffs, duplicate
  readiness matrices, and the disabled legacy notification sender card. Keep redirects/adapters only
  when S49 consumer proof requires them.
- **Explicit keeps.** Keep automated unit/e2e/security tests, deterministic fixtures, emulators/fake
  transports used only by tests, Demo-environment adapters/workflows, provider/OAuth implementations
  awaiting one real setup dependency, kill switches, migration/rollback tools, current Vendor TOTP,
  and exact action contracts.
- **TOTP/verification disposition.** Do not invent or expose a new self-registration/onboarding
  product in this recalibration. Existing Vendor password+TOTP remains. Test-only primitives such as
  TOTP enrollment/verification-code helpers are retained only if current security, a documented
  provider seam, or an explicitly authorized future suite owns them; otherwise S49 proves and
  deletes them. They are not shipped “Test tools.”
- **Buildable now (app-plane).** Communications cleanup, Connections structure, Admin routing,
  task ownership, progressive diagnostics, tool inventory/classification, stage-one UI retirement,
  role/a11y/browser tests, and compatibility instrumentation.
- **Build to the seam (live provider).** Preserve and surface each real provider activation seam in
  Connections. Provider implementations/credentials remain in their owning suites; this suite
  neither replaces them with fake tools nor blocks unrelated UI.
- **Owner dependency (the one flip).** None for S48. Individual provider connection steps remain
  their already named external dependencies.

**Open questions & assumptions.**

- _Answered 2026-07-28 (D-08):_ delete Test tools that do not contribute to the end state now;
  provider setup-awaiting tools/seams are fine.
- _Answered 2026-07-28:_ do not create an Admin Test Lab to preserve removed simulations.
- _Answered 2026-07-28 (D-09):_ Admin is task-based; Connections is provider-focused.
- _Answered for this program:_ no new self-registration/onboarding UI is inferred from dormant TOTP
  or verification-code primitives. Existing Vendor TOTP remains mandatory.
- _Assumption:_ an evaluator with real value is best converted to a deterministic test unless an
  Admin must edit an approved rule; in that case only the rule preview/configuration belongs in UI.
- Decision-complete; provider credentials/endpoints stay isolated dependencies.

**Cross-product impacts.**

- Likely touchpoints include Communications routes/components, simulated chain/evaluators,
  Connections cards/status/setup routes, Admin index/panels/subroutes, readiness presenters,
  navigation, notification legacy UI, and tool-owned tests.
- Reuses S19/S24 communications, S40 environment, S41 shell, S44 provider links, and all S28–S39
  provider seams. S49 owns stage-two code deletion.
- Supersedes S15 browser fallback/demo UI and any active “Test Lab” preservation direction, while
  retaining useful communication policy/testing evidence.

**Adversarial acceptance checks.**

- **AC-S48-1** — Communications renders only workflow-authorized threads/actions and contains no
  simulated chain, hard-coded actor, generic inbox/compose, anticipatory demo draft, or lab
  evaluator. An unrelated mailbox/thread remains undiscoverable. _Verify:_ S19 auth/query/component
  tests and rendered DOM scan.
- **AC-S48-2** — Each supported provider has one Connections owner with reviewed generic front door,
  status, setup/revoke/reconnect as applicable, affected capabilities, and plain next step;
  Advanced reveals exact non-secret diagnostics. A non-Admin cannot read or invoke setup.
  _Verify:_ Connections role/URL/secret-redaction tests.
- **AC-S48-3** — Admin’s landing renders only categorized task destinations and bounded status, not
  the former twenty full panels. Every retained Admin task is reachable at one stable subroute with
  server-side role protection and a return to Admin. _Verify:_ route inventory and Admin browser
  task.
- **AC-S48-4** — Every inventoried Test/developer control has exactly one allowed disposition and
  no shipped control is left merely because a test imports its helper. Automated tests, Demo
  workflow, provider seam, security, and rollback categories remain green/reachable only in their
  proper context. _Verify:_ checked inventory plus product-route scan.
- **AC-S48-5** — Disabled legacy notification/simulation/no-op controls are absent from shipped UI;
  direct compatibility access redirects or returns the defined retired response without executing,
  and rollback can restore the prior UI during stage one. _Verify:_ compatibility route tests.
- **AC-S48-6** — Existing Vendor password/TOTP lifecycle still works and no internal self-register/
  verification-code route is introduced. Dormant primitive disposition is evidence-backed and
  handed to S49. _Verify:_ Vendor auth and route graph tests.
- **AC-S48-7** — Desktop/390×844 Admin, Connections, and Communications have one H1, usable task
  order, no horizontal overflow/overlay, correct keyboard/focus, and plain primary copy.
  _Verify:_ authenticated Admin/Editor browser tasks.
- **AC-S48-8** — `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run test:e2e:core`, `npm run verify:spec-traceability`, and `npm run build` pass; keep Gmail
  scope/send, provider gate, Admin role, Vendor TOTP, secret redaction, environment, and route-link
  sentinels green.

**Forbidden actions / hard gates.** Removing Test UI must not remove tests, Demo parity, provider
implementations, security, receipts, kill switches, or rollback. Do not expose secrets/provider
bodies in Connections. Do not turn Communications into a general inbox or generic compose/send.
Do not create self-registration from dormant code. Never weaken server auth because navigation is
cleaner. External provider setup, send, and writes retain their owning confirmation/gate/evidence;
no undocumented gate flips here. Preserve managed identity, no personal auth, no PII/secrets in git,
no autonomous client send, generic-send closure, reversible effects, and the cost cap.

**Ordered prompt sequence.**

1. _Discovery:_ inventory every Communications simulation/evaluator, Connections card/setup/health
   path, Admin panel/task, Test/developer control, dormant auth primitive, and their runtime/test/
   script consumers.
2. _Understanding:_ produce the one-owner task map and required tool-disposition ledger. Pin retained
   Gmail, provider, Admin, Vendor, security, and rollback behavior with tests.
3. _Build:_ reduce Communications to workflow-linked work; convert useful lab evaluators to tests or
   bounded approved-rule previews.
4. _Build:_ restructure Connections and Admin into provider/task owners with role guards,
   progressive Advanced detail, safe links, and secret redaction.
5. _Build:_ stage-one remove the explicit obsolete controls and add compatibility instrumentation/
   redirects required by S49; preserve allowed infrastructure categories.
6. _Verify:_ run AC-S48-1 through AC-S48-8 and falsify general mailbox access, secret exposure,
   non-Admin setup, orphan Admin tasks, hidden simulator routes, security-helper deletion, and
   environment leakage.
7. _Gate:_ no aggregate gate flip. Provider actions remain independently activated by their owner
   specs; finished configured actions are shown normally, not as a Test tool.
8. _Context update:_ record S48’s fact and disposition ledger, update guide/manual QA/facts, and
   advance `docs/loop-state.md` to S49.

**Deletion/merge recommendation.** KEEP this spec. MERGE provider status/setup under Connections and
Admin tasks under subroutes. RETIRE_UI all named obsolete tools now; S49 performs bounded code
deletion only after proof. Preserve historical S15 as evidence, not active product direction.
