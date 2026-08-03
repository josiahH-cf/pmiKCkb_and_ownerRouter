<!-- spec-shape: overhaul-v1 -->

# S27 — Working-app V1 release and provider activation

> New 2026-07-14; working-app contract revised 2026-07-15. Implements R09 and turns S20–S26 into a
> falsifiable production application contract without conflating app readiness with every provider's
> activation.
>
> **Historical release record, 2026-07-15.** The original V1 acceptance used manifest `2.0`, report
> `2.1`, and a visibly isolated Production Test workspace to prove complete app behavior without Live
> provider effects. The pinned `38ebcf5 / pmi-kc-kb-demo-rmrm9mp6v-04c897acee28` release and its
> predecessor rollback/restore remain valid dated evidence. They do not describe the current runtime.
>
> **Live-only continuation, 2026-08-03.** S56 retires the Production Test workspace, product Test
> routes, and Test executors while retaining automated contract coverage. The current verifier is
> `v1-release-manifest:3.0`; report `2.3`; application workflow evidence lanes are exactly
> `local_rehearsal | live`. `production_test` is invalid. Production is Live-only, and local rehearsal
> resolves explicit Demo + Live-read-only with no Live effect. Provider state `test_ready` remains only
> as a technical compatibility/readiness enum and never names a product data lane or release-evidence
> lane.

**Goal.** PMI KC deploys a stable V1 application whose ordinary app-plane workflows work in
Production over Live records and can be rehearsed locally over bounded Live read-only data without
creating an external effect. Real provider reads/writes activate per named action. V1 acceptance
requires production application evidence and safety, not Live proof for every optional provider,
optional TTL automation, or business/technical signatures.

**What it is / how it functions.**

- **Application readiness.** V1 requires a production commit/revision, pinned Firestore rules/index
  configuration (including an explicit none-required/current configuration pin), S20–S26 suite
  acceptance, `local_rehearsal` or `live` workflow coverage for every required action, one-attempt/
  idempotency/correction verification, deploy/build/auth/safety/browser/smoke/monitoring/rollback
  evidence, and environment isolation. The canonical bodyless production evidence record is
  authoritative; a local report cannot promote or demote it.
- **Provider activation is separate.** Each action reports
  `unavailable|test_ready|live_configured|live_proven|enabled|suspended`. V1 does not require
  `live_proven` or `enabled`. However, a claim of `live_configured`, `live_proven`, `enabled`, or
  `suspended` must have lane-correct Registry, provider, evidence, monitoring, and rollback integrity;
  a fake/synthetic/Test reference can never prove Live.
- **Release manifest inventory.** `v1-release-manifest:3.0` validates the shape and integrity of commit,
  revision, production environment,
  rules/index configuration, normalized Action Registry hash, exact unique action set, S20–S26 AC
  sets, workflow evidence lane, provider activation, communication artifact/retention versions,
  migrations/none-required proof, smokes, monitoring, rollback, and browser acceptance. Evidence lives
  in durable bodyless `docs/evidence/` references and contains no secret/customer value. Because the
  repository has no production manifest loader/CLI, this is an advisory falsification/inventory tool;
  `docs/evidence/working-app-v1-production-2026-07-15.md` is the acceptance record.
- **Release report.** Bodyless report `2.3` is deliberately non-accepting and groups open items into release
  identity/pins, suites, application workflows, and core production evidence. Provider activation
  counts and Dan/Josiah signoffs are advisory sections. It must not turn each missing provider proof
  field into repeated application blockers or say the application is Pre-V1 merely because an action
  is technically `test_ready`.
- **Visible environment contract.** Ordinary Production renders Live product state only. Local
  rehearsal resolves `environmentKind:"demo"` + `dataContext:"live_readonly"` with
  `source:"explicit"`, renders “Live data, read only”, and is denied every durable writer and Live
  provider effect. The retained `data_mode` field supports legacy fail-closed reads; it does not create
  a second Production lane.
- **Workflow acceptance.** Ordinary human-started `/runs` exercises the app-plane workflow without a
  Test executor. Automated tests retain the typed S25/S26 provider contracts, one-attempt receipts,
  role/authority failures, Vendor isolation, and recovery cases under test-owned helpers. Those helpers
  are automated evidence only and are unreachable from product routes.
- **Tab acceptance.** Console, Spaces, Approval Queue, Workflow Communications, Connections, Admin,
  and Notifications each have purpose, source/failure state, role behavior, Live behavior,
  desktop/phone scenario, and no-dead-end acceptance. Vendor portal is the eighth external surface and
  proves password/TOTP, assigned-Live-ticket isolation, disabled/revoked state, stale-session denial,
  and wrong-ticket behavior without a product Test mailbox.
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

- _Answered 2026-08-03:_ V1 is the stable working production application; proof comes from
  `local_rehearsal` and `live` workflow evidence, not a Production Test lane and not a requirement that
  every provider be Live.
- _Answered 2026-07-15:_ provider activation and Dan/Josiah signoffs are advisory to app readiness;
  false Live claims remain release-integrity failures.
- _Answered 2026-07-15:_ TTL/index/scheduler activation is an optional operational optimization, not a
  V1 gate. The release still pins the actual rules/index configuration used by the revision.
- _Default:_ a required action needs automated typed-adapter/safety coverage and a valid
  `local_rehearsal` or `live` application-evidence record even when its provider is not used at launch.
  `test_ready` describes provider readiness only.
- _Operational inputs, not product questions:_ each activated Live provider needs its exact credential,
  mapping, approved record, monitor, and correction/rollback evidence at activation time.

**Cross-product impacts.** Covers every primary route/tab, S20–S26, Production Live-only and local
Live-read-only isolation, Action
Registry/provider status, cutover reports, environment handoff, status/plan/loop, Cloud Run/Firebase,
monitoring, smoke/browser runbooks, dependency/security reports, and rollback. Supersede markers:
`V1-INTERNAL-GMAIL-ONLY-RELEASE`, `ALL-PROVIDERS-LIVE-BEFORE-V1`, `ALL-SIGNATURES-BEFORE-V1`, and
`TTL-SCHEDULER-AS-V1-GATE`.

**Adversarial acceptance checks.**

- **AC-S27-1** — Manifest verifier rejects malformed production stage/environment/pins, S20–S26 AC sets,
  exact unique required action set, lane-correct durable workflow coverage, one-attempt/idempotency/
  correction, Registry hash, and core production evidence. Manifest schema is exactly
  `v1-release-manifest:3.0`; every application evidence lane is `local_rehearsal` or `live`, and
  `production_test` is rejected. Every action may remain technically `test_ready`; no action must be
  Live. Missing/extra/duplicate/path-aliased evidence or pin drift fails the supplied inventory.
  Production acceptance comes from the canonical bodyless evidence record rather than an invented
  `stage:v1` command. _Verify:_ `npm
test -- v1-release-manifest v1-manifest-report`; `npm run release:manifest-report`; `npm run
cutover:report -- --help`.
- **AC-S27-2** — Production renders only Live product records and offers no Test-workspace navigation,
  route, badge, seeder, simulator, or product receipt. Local rehearsal resolves explicit Demo +
  Live-read-only, renders “Live data, read only”, and cannot execute a durable writer or Live provider
  effect. No manual checkbox or other-channel receipt can fabricate completion. _Verify:_ `npm test --
release-label vendor-release-label execution-completion data-mode test-lane-environment`.
- **AC-S27-3** — Automated acceptance retains all S25/S26 typed selections, one-attempt/receipt,
  authority, failure, reconciliation, Vendor isolation, and recovery coverage in test-owned helpers,
  while a source/route sentinel proves those helpers are unreachable from `app/**`, `components/**`,
  and `lib/**` product runtime. Ordinary human-started `/runs` exercises workflow persistence through
  the non-fixture app-plane path and constructs no provider. _Verify:_ the retained typed-contract and
  workflow unit tests plus `tests/unit/test-lane-route-fence.test.mjs`.
- **AC-S27-4** — Deployed browser acceptance covers Console, Spaces, Approval Queue, Workflow
  Communications, Connections, Admin, Notifications, and Vendor portal at desktop/phone widths, with
  role/scope, Production Live state, local Live-read-only refusal, provider unavailable,
  success/failure/reconciliation, and no-dead-end states. Vendor coverage uses assigned Live records and
  proves password/TOTP, wrong-ticket denial, disable/revoke, and stale-session denial. _Verify:_ approved
  browser runbook/evidence against the pinned revision plus local-rehearsal browser evidence.
- **AC-S27-5** — Security release check proves no secret/customer/mail body in git/log/audit, no Vendor
  cross-ticket/internal access, no generic/autonomous send, no unexpected Registry key, no data-lane
  fallback, and no product Test route/workspace/executor/provider construction. Any present `vendor`, `vendor_id`, or
  `data_mode` claim key—including false/empty/malformed—must fail closed from internal roster,
  role/scope, ID-token, and session authority; Vendor access requires the exact valid Live tuple. Legacy
  `data_mode:"test"` input refuses rather than normalizing to Live. Setup links remain response-only/
  `no-store`, partial failure stays disabled, and audits contain no Firebase UID, link, plaintext
  reason, or secret. _Verify:_ `npm run verify:redaction`, route-fence, router/falsification/security/
  Firestore tests.
- **AC-S27-6** — Every claimed Live-configured/proven/enabled action has its own documented Registry
  contract, exact authority/confirmation, budget preflight, bodyless evidence, monitoring,
  reconciliation/correction, and rollback. Local-rehearsal/synthetic evidence or another provider
  cannot satisfy a Live claim. Technically `test_ready`/unactivated actions are valid V1 application
  states but are not product data lanes. _Verify:_ manifest
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

**Forbidden actions / hard gates.** No product Test lane, Test-to-Live fallback, local-rehearsal
evidence cited as Live,
autonomous/bulk/generic send, blind retry, guessed provider contract, customer evidence in git, or
provider activation inherited from another action. No Live read/write/send occurs unless that action's
identity, contract, Registry/health, target/effect, authority, exact human confirmation, one-attempt
claim, receipt, and correction/reconciliation are green. Deployment requires authenticated production
identity, budget preflight, captured rollback revision, and verification; it does not itself authorize
an unavailable provider. The verified non-null S52 production cost ceiling and its kill switches
apply; if the ceiling is unset, cost-bearing/live/cloud work is closed while local/app-plane work
continues. Routine release follows D05: after the full local gate, auth and budget preflights,
prior-revision capture, and a captured rollback command are green, the runner may deploy; it must
smoke the new revision successfully before promoting traffic. Interactive authentication,
credentials/scopes, IAM, billing/quota, provider inputs, and destructive operations remain
owner-run.

**Ordered prompt sequence.**

1. _Application proof:_ run focused/full verification, ordinary app-plane workflow tests, and local
   Live-read-only refusal proof; persist no rehearsal record or external effect.
2. _Release candidate:_ build/deploy the exact commit, pin revision/rules/index configuration/Registry,
   and validate authentication, smoke, monitoring, and rollback with no provider activation changes.
3. _Browser acceptance:_ exercise all eight surfaces with internal roles and a scoped Live Vendor at
   desktop/phone widths, including Live unavailable and ordinary workflow completion/failure/
   reconciliation states; separately prove local Live-read-only cannot create an effect.
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
