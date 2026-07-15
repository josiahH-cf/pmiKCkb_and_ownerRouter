<!-- spec-shape: overhaul-v1 -->

# S27 — Working-app V1 release and provider activation

> New 2026-07-14; working-app contract revised 2026-07-15. Implements R09 and turns S20–S26 into a
> falsifiable production application contract without conflating app readiness with every provider's
> activation.

**Implementation status (2026-07-15): Release model green; final production evidence refresh in
progress.** Manifest schema/verifier `2.0`, bodyless report `2.1`, V1 application banner, application-
workflow coverage, isolated production Test workspace, provider activation summary, optional advisory
Dan/Josiah signoffs, role/mobile/failure browser plan, monitoring/rollback plan, and cutover rehearsal
are built. The old 169 repeated external gates are replaced by grouped application-readiness gates
plus a separate per-action provider snapshot. The local report is advisory inventory because no
production-manifest loader exists. The canonical acceptance authority is the bodyless production
evidence document with immutable pins and browser/rollback results; this does not require all providers
to be Live.

**Goal.** PMI KC can deploy a stable V1 application whose internal and Vendor workflows work with
visibly isolated Live and Test records. Production Test journeys prove application state, roles,
confirmation, receipts, failure handling, and completion with zero external calls. Real provider reads/
writes activate per action. V1 acceptance requires production application evidence and safety—not
Live proof for every provider, optional TTL automation, or business/technical signatures.

**What it is / how it functions.**

- **Application readiness.** V1 requires a production commit/revision, pinned Firestore rules/index
  configuration (including an explicit none-required/current configuration pin), S20–S26 suite
  acceptance, production Test or Live workflow coverage for every required action, one-attempt/
  idempotency/correction verification, deploy/build/auth/safety/browser/smoke/monitoring/rollback
  evidence, and lane isolation. A Test-covered action must be at least `test_ready`. The canonical
  bodyless production evidence record is authoritative; a local report cannot promote or demote it.
- **Provider activation is separate.** Each action reports
  `unavailable|test_ready|live_configured|live_proven|enabled|suspended`. V1 does not require
  `live_proven` or `enabled`. However, a claim of `live_configured`, `live_proven`, `enabled`, or
  `suspended` must have lane-correct Registry, provider, evidence, monitoring, and rollback integrity;
  a fake/synthetic/Test reference can never prove Live.
- **Release manifest inventory.** `v1-release-manifest:2.0` validates the shape and integrity of commit,
  revision, production environment,
  rules/index configuration, normalized Action Registry hash, exact unique action set, S20–S26 AC
  sets, workflow evidence lane, provider activation, communication artifact/retention versions,
  migrations/none-required proof, smokes, monitoring, rollback, and browser acceptance. Evidence lives
  in durable bodyless `docs/evidence/` references and contains no secret/customer value. Because the
  repository has no production manifest loader/CLI, this is an advisory falsification/inventory tool;
  `docs/evidence/working-app-v1-production-2026-07-15.md` is the acceptance record.
- **Release report.** The local report is deliberately non-accepting and groups open items into release
  identity/pins, suites, application workflows, and core production evidence. Provider activation
  counts and Dan/Josiah signoffs are advisory sections. It must not turn each missing provider proof
  field into repeated application blockers or say the application is Pre-V1 merely because an action
  is Test-ready.
- **Visible lane contract.** The application banner identifies V1 and says Live/Test records are
  labeled. Every data-bearing surface shows the lane at the record/action/receipt boundary. Test
  completion can reach `Done`/`Closed` but always remains `liveEvidenceEligible:false`; Live failure
  never falls back to Test.
- **Production Test acceptance.** The Admin workspace traverses all 11 S25 and 19 S26 typed executor
  selections, one attempt/receipt each, plus Vendor invite/password/TOTP/assignment/Test-mailbox/
  disable behavior, using invented aliases and zero Live calls. Normal product tabs also persist the
  full user journeys: Lease records all 11 explicit actions before Done; Maintenance uses
  `unit:test-maple-204` and `vendor:test-summit-plumbing` and closes inside app-owned Firestore. The
  Admin workspace is diagnostic typed-adapter evidence, not the primary user workflow.
- **Tab acceptance.** Console, Spaces, Approval Queue, Workflow Communications, Connections, Admin,
  and Notifications each have purpose, source/failure state, role behavior, Live/Test behavior,
  desktop/phone scenario, and no-dead-end acceptance. Vendor portal is the eighth external surface and
  proves password/TOTP, assignment, Test mailbox, disabled/revoked, and wrong-ticket behavior.
- **Operations.** Cutover uses one reviewed GCP/Firebase/runtime identity set and captures the currently
  serving and prior Cloud Run revisions. Rollback restores traffic to the exact prior revision and
  never deletes the service. Ambiguous external effects use reconciliation/correction, not retry.
  Dependency findings are reported by severity/disposition. TTL, composite indexes, and Scheduler are
  optional optimizations; their absence is recorded but is not a release gate.
- **Signoffs.** Dan business and Josiah technical acceptance remain valuable advisory metadata and may
  be attached to the release identity. Missing, stale, or malformed signoff is reported but cannot
  demote an otherwise accepted application. Concrete failing tests, missing production evidence, or an
  invalid Live claim still fail closed.

**Open questions & assumptions.**

- _Answered 2026-07-15:_ V1 is the stable working production application; proof comes through use of
  the isolated Test lane and configured Live actions, not a requirement that every provider be Live.
- _Answered 2026-07-15:_ provider activation and Dan/Josiah signoffs are advisory to app readiness;
  false Live claims remain release-integrity failures.
- _Answered 2026-07-15:_ TTL/index/scheduler activation is an optional operational optimization, not a
  V1 gate. The release still pins the actual rules/index configuration used by the revision.
- _Default:_ a required action needs working production Test coverage even when its provider is not
  used at launch; `unavailable` becomes `test_ready` only after the isolated typed adapter and safety
  checks pass.
- _Operational inputs, not product questions:_ each activated Live provider needs its exact credential,
  mapping, approved record, monitor, and correction/rollback evidence at activation time.

**Cross-product impacts.** Covers every primary route/tab, S20–S26, data-mode isolation, Action
Registry/provider status, cutover reports, environment handoff, status/plan/loop, Cloud Run/Firebase,
monitoring, smoke/browser runbooks, dependency/security reports, and rollback. Supersede markers:
`V1-INTERNAL-GMAIL-ONLY-RELEASE`, `ALL-PROVIDERS-LIVE-BEFORE-V1`, `ALL-SIGNATURES-BEFORE-V1`, and
`TTL-SCHEDULER-AS-V1-GATE`.

**Adversarial acceptance checks.**

- **AC-S27-1** — Manifest verifier rejects malformed production stage/environment/pins, S20–S26 AC sets,
  exact unique required action set, lane-correct durable workflow coverage, one-attempt/idempotency/
  correction, Registry hash, and core production evidence. Every action is at least Test-ready; no
  action must be Live. Missing/extra/duplicate/path-aliased evidence or pin drift fails the supplied
  inventory. Production acceptance comes from the canonical bodyless evidence record rather than an
  invented `stage:v1` command. _Verify:_ `npm
test -- v1-release-manifest v1-manifest-report`; `npm run release:manifest-report`; `npm run
cutover:report -- --help`.
- **AC-S27-2** — Production renders the V1 application banner and persistent Live/Test markers. Test
  receipts/completion never say Live; unavailable/suspended Live actions remain explicit and usable
  Test workflows do not inherit their state. No manual checkbox or other-channel receipt can fabricate
  completion. _Verify:_ `npm test -- release-label vendor-release-label execution-completion data-mode`.
- **AC-S27-3** — Production Test acceptance invokes all 11 S25 and 19 S26 typed selections plus the
  Vendor password/TOTP/assignment/Test-mailbox lifecycle with exactly one attempt/receipt per action
  and zero Live-provider calls. Persistent Lease Test data reaches Done only after 11 receipts;
  persistent Maintenance Test data closes. Failure/timeout/drift/
  revocation stops dependencies without duplicate attempt or cross-lane leak. _Verify:_ `npm test --
v1-synthetic-execution v1-production-test-workspace-route lease-renewal-test-workflow maintenance-test-workflow
vendor-test-mailbox`; `npm run test:e2e:core -- v1-fake-execution`.
- **AC-S27-4** — Deployed browser acceptance covers Console, Spaces, Approval Queue, Workflow
  Communications, Connections, Admin, Notifications, and Vendor portal at desktop/phone widths, with
  role/scope, both lanes, provider unavailable, success/failure/reconciliation, and no-dead-end states.
  _Verify:_ approved browser runbook/evidence against the pinned revision.
- **AC-S27-5** — Security release check proves no secret/customer/mail body in git/log/audit, no Vendor
  cross-ticket/internal access, no generic/autonomous send, no unexpected Registry key, no lane
  fallback, and no Test external provider construction. _Verify:_ `npm run verify:redaction`, router/
  falsification/security/Firestore tests.
- **AC-S27-6** — Every claimed Live-configured/proven/enabled action has its own documented Registry
  contract, exact authority/confirmation, budget preflight, bodyless evidence, monitoring,
  reconciliation/correction, and rollback. Test/synthetic evidence or another provider cannot satisfy
  the claim. Test-ready/unactivated actions are valid V1 application states. _Verify:_ manifest
  activation-integrity review.
- **AC-S27-7** — Rollback rehearsal captures the serving and exact prior Cloud Run revision, restores
  traffic without deleting the service, and suppresses commands for conflicting project/identity/
  audience/source inputs. Provider ambiguity uses reconciliation/correction. _Verify:_ `npm run
cutover:dry-run -- --json`; cutover/rollback/source-command boundary tests and one bounded deployed
  rollback rehearsal.
- **AC-S27-8** — Dependency/security findings are regenerated; High/Critical findings are remediated or
  explicitly block release, and retained lower findings have named, time-bounded disposition/recheck.
  Optional TTL/index/scheduler absence is reported as optimization state, not failure. _Verify:_ `npm
audit`, `bash scripts/verify.sh`, dependency disposition and operations report.
- **AC-S27-9** — Final V1 acceptance is based on green application readiness and the authoritative
  production evidence. Dan/Josiah signoffs are reported separately as `pending|accepted|invalid`; their
  absence cannot alter `state:v1`, while stale/invalid Live evidence still can. The production evidence
  document records the verdict; manifest schema/verifier and report tests remain advisory
  falsification checks.

**Forbidden actions / hard gates.** No Test-to-Live fallback, simulated evidence cited as Live,
autonomous/bulk/generic send, blind retry, guessed provider contract, customer evidence in git, or
provider activation inherited from another action. No Live read/write/send occurs unless that action's
identity, contract, Registry/health, target/effect, authority, exact human confirmation, one-attempt
claim, receipt, and correction/reconciliation are green. Deployment requires authenticated production
identity, budget preflight, captured rollback revision, and verification; it does not itself authorize
an unavailable provider. ~$10 cap and kill switches remain.

**Ordered prompt sequence.**

1. _Application proof:_ run focused/full verification and the production Test journeys; persist only
   invented app data and bodyless evidence; repair any lane/role/state/dead-end failure.
2. _Release candidate:_ build/deploy the exact commit, pin revision/rules/index configuration/Registry,
   and validate authentication, smoke, monitoring, and rollback with no provider activation changes.
3. _Browser acceptance:_ exercise all eight surfaces with internal roles and Vendor Test identity at
   desktop/phone widths, including Live unavailable and Test completion/failure/reconciliation states.
4. _Evidence acceptance:_ publish the bodyless production evidence record when grouped application
   gates pass. Run the local manifest report as advisory inventory; report provider activation and
   signoffs separately.
5. _Live activation:_ configure/prove individual provider actions as needed without reopening V1 or
   waiting on unrelated providers; update the Registry/evidence snapshot after each change.
6. _Context update:_ add the working-app release fact and independent provider activation facts; update
   environment/status/plan/loop and retain rollback/monitor ownership.

**Deletion/merge recommendation.** KEEP as the V1 application release contract. After acceptance,
MERGE operational steps into the standing cutover/runbook and retain this file as the versioned
application/provider-separation contract.
