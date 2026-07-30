<!-- spec-shape: overhaul-v1 -->

# S40 — Demo/Production environment and deployment separation

> New 2026-07-28. Implements D-01 and the environment portion of D-08/D-14 under
> `F-UIUX-RECALIBRATION-AUTHORIZED`. This is the first suite in the S40–S50 program.
>
> Amended 2026-07-29 (production-unblock audit). Folds in the settled owner decisions D11 (Demo is
> a NEW dedicated GCP project, and four verified gaps that decision exposes), D56 (rename the
> Production Cloud Run service to `pmi-kc-app` during this cutover), D13 (monitoring/alerting is an
> S40 cutover gate), D19 (a fresh blue/green rollback rehearsal is an S40 exit criterion), and the
> D07 pre-deploy emulator hazard. Existing `AC-S40-1`–`AC-S40-8` are unchanged; the new checks
> continue at `AC-S40-9`.

**Goal.** PMI KC operates the same product in two unmistakably separate environments: Demo safely
rehearses real workflows with realistic invented data, while Production contains Live data only.
Neither environment can borrow the other’s records, credentials, effects, or receipts. Demo may
optionally show one explicitly selected Live read-only context, but never combines it with Demo data
or enables a Live effect. Production releases use a deliberate blue/green revision promotion and
rollback flow. The current dual-lane Production implementation remains a historical/current-state
fact until this suite’s migration is verified; this suite changes the target and then the runtime.
As of the 2026-07-29 production-unblock decisions the end-state is also concrete in three further
ways: Demo lives in its own GCP project rather than a corner of Production, the Production service
carries a name that says what it is (`pmi-kc-app`, not `pmi-kc-kb-demo`), and no live-data cutover
happens until alerting exists and a rollback has actually been rehearsed on the real service.

**What it is / how it functions.**

- **Server-owned environment descriptor.** Add or consolidate a typed, fail-closed boundary such as
  `lib/environment/descriptor.ts` with `environmentKind: "demo" | "production"` and
  `dataContext: "demo" | "live_readonly" | "live"`. Environment and context come from validated
  server configuration, never query parameters, local storage, record names, or a browser toggle.
  Valid combinations are Demo+Demo, Demo+Live-read-only, and Production+Live. Missing, conflicting,
  or unknown values stop startup/cutover rather than defaulting to Production or Live.
- **Independent resource manifest.** Extend the existing environment/cutover manifest rather than
  hard-code a resource name. Demo and Production must resolve different project/service, Firestore
  database/namespace, storage/folder, queue/topic, Secret Manager, OAuth redirect/audience, and
  runtime identity values. A preflight compares the resolved identifiers and refuses any
  cross-environment alias. File/module locations are illustrative; equivalent boundaries are fine.
- **One product, environment-specific effect boundary.** Both environments render the same routes,
  roles, components, validation, preview, decision, and receipt shapes. Demo data uses Demo-owned
  persistence and no-client/Demo transports; it cannot construct a Production provider client.
  Production does not expose a Demo adapter, Demo seeder, Test workspace, mode chooser, or simulated
  action. Feature forks such as `if demo render old page else render new page` are forbidden.
- **Optional Live read-only in Demo.** When separately configured under a managed read identity, Demo
  can select `Live read-only`. The selection is explicit at session/context level, changes the
  persistent shell banner, invalidates any prepared confirmation, and loads a separate projection.
  It cannot create/update app workflow state, draft/send, execute a provider action, or write a
  receipt. Counts, queues, and lists never merge Demo and Live-read-only records.
- **Data classification and migration.** New product records require an explicit classification.
  Production accepts only Live. Demo accepts Demo and the transient Live-read-only projection. Stage
  current `data_mode:test` records as legacy Demo candidates, export a non-sensitive inventory,
  recreate or move only invented fixtures into Demo-owned stores, verify role/task parity, and then
  remove them from Production through a reviewed, backed-up migration. Unknown/missing mode fails
  closed; names containing “Demo” or “Test” never determine the mode.
- **Persistent identity and copy.** The authenticated shell always renders `Demo environment` or
  `Production`. Demo renders `Demo data` or `Live read-only` on every page and visibly watermarks
  Demo data. Production renders no Demo/Test copy or control. `Test` remains an engineering term for
  automated verification, not an operator data mode.
- **Production blue/green delivery.** Extend the release script/runbook to deploy a named candidate
  revision at zero traffic, validate manifest/identity/data restrictions and public/authenticated
  smoke paths, promote that exact revision deliberately, capture the prior serving revision, and
  rehearse or verify traffic rollback. Demo/Production separation is not implemented by calling
  those two environments “blue” and “green.”
- **Settled topology (D11) — a dedicated Demo GCP project.** Demo is a NEW GCP project. It is not a
  Firestore namespace inside `pmi-kc-kb-prod`, not a second database in the Production project, and
  not a second Cloud Run service beside Production. Every value in the manifest therefore resolves
  inside the Demo project, and the owner supplies the exact identifiers once. The four bullets that
  follow are the verified consequences of that choice; none of them is satisfied by code that
  exists today, so each is a required slice rather than a note.
- **The isolation manifest omits the knowledge base — `lib/environment/manifest.ts`.**
  `ISOLATED_RESOURCE_FIELDS` currently enumerates nine resource classes (`projectId`,
  `serviceName`, `firestoreDatabaseId`, `storageTarget`, `queueTopic`, `secretBoundary`,
  `oauthRedirectUri`, `oauthAudience`, `runtimeServiceAccount`) and no knowledge-base field. The KB
  corpus is configured elsewhere, as the `SPACE_VERTEX_DATA_STORE_IDS` (Vertex AI Search data
  stores) and `SPACE_DRIVE_FOLDER_IDS` (Drive source folders) maps validated in
  `lib/config/server.ts`. So `checkEnvironmentIsolation` returns `{ ok: true }` for a manifest pair
  in which Demo answers every question out of the real client knowledge base — the isolation check
  passes while the most sensitive shared resource is still shared. Add a KB-corpus field, compare
  the two maps entry-by-entry rather than as opaque strings, and report the colliding Space id.
  Two related facts belong in the same slice: `checkEnvironmentIsolation` has no production caller
  at all today (only `tests/unit/environment-manifest.test.ts` imports it), and
  `lib/gmail-hub/pubsub.ts` hard-codes `pmi-kc-kb-prod` in three places — the topic prefix, the
  push service-account suffix, and the subscription prefix — so a Demo project’s Pub/Sub identity
  is refused by literal string rather than by manifest.
- **A Demo project sits outside the armed kill switch — `scripts/setup-budget-killswitch.mjs`.**
  The existing guardrail is project-scoped by construction: the runbook creates the budget with
  `--filter-projects="projects/<production project number>"`, deploys the `budget-guardrail`
  function into the Production project, and grants that function `roles/billing.projectManager` on
  the Production project only. A new Demo GCP project inherits none of it, so Demo spend would be
  both unbounded and unattributed on its first day. The Demo provisioning plan must therefore emit
  its own budget, its own Pub/Sub topic, its own kill-switch function and service account, and its
  own threshold rules — sized and governed by the production cost ceiling defined by S52, which
  owns cost governance for both environments. Note also that `scripts/deploy-demo-cloud-run.mjs`
  refuses to run without `--budget-confirmed`, and that flag’s message still cites the superseded
  flat figure; re-point it at the S52 ceiling in the same slice.
- **No tool can deploy a Demo environment today — `scripts/deploy-demo-cloud-run.mjs`.** Despite
  the file name, `npm run deploy` and `npm run deploy:demo` are the same script, and it
  hard-defaults to `DEFAULT_PROJECT_ID = "pmi-kc-kb-prod"` and `DEFAULT_SERVICE = "pmi-kc-kb-demo"`
  — the Production project and the Production service. `--project`/`--service`/`GCP_PROJECT_ID`
  override those defaults, but nothing refuses the combination “deploy the Demo environment while
  the resolved project is Production”, so a mis-invocation leaks Production identifiers into a Demo
  build or ships a Demo build over Production traffic. The same builder never emits
  `ENVIRONMENT_KIND` or `DATA_CONTEXT` in `readRuntimeEnv`, so every deployed revision resolves
  through the `legacy-node-env` bridge in `lib/environment/descriptor.ts` — the exact descriptor
  source the module’s own docstring says the Production cutover preflight refuses, except that no
  script imports the descriptor, so nothing enforces it. Split the script into an
  environment-parameterized deploy that requires a validated manifest pair, refuses any Demo target
  resolving a Production identifier, and always emits explicit descriptor variables.
- **Demo needs its own identity plane — `scripts/setup-firebase-auth-demo.mjs`,
  `scripts/set-firebase-user-role.mjs`, `lib/auth/roles.ts`.** Operator roles (`Admin`, `Approver`,
  `Editor`) are Firebase Auth custom claims set per user per Firebase project; there is no
  portable user directory to copy. An independent Demo project therefore needs its own Firebase
  Auth initialization, its own authorized domains and Google provider, and a re-created operator
  directory. Nothing covers this today: no `ISOLATED_RESOURCE_FIELDS` entry names the Firebase Auth
  project (the list stops at `oauthRedirectUri`/`oauthAudience`/`runtimeServiceAccount`), and
  `docs/environment-handoff.md` records no Demo auth project. Add an auth-project manifest field and
  a Demo operator-directory provisioning step whose report is a role-to-count summary, never a list
  of addresses.
- **Production service replacement to `pmi-kc-app` (D56) and its full blast radius.** The Production Cloud Run
  service is literally named `pmi-kc-kb-demo`, which is the single most confusing artifact of the
  old topology. Cloud Run services are not renamed in place: the cutover creates `pmi-kc-app`,
  deploys and smokes it at its own URL, redirects every dependency, retains the old service/revision
  as the rollback target, and retires it only after the observation window and owner-reviewed
  deletion. That service-replacement slice must update, in one reviewed change: the Cloud Run
  target; `DEFAULT_SERVICE` in
  `scripts/deploy-demo-cloud-run.mjs`; `DEFAULT_CUTOVER_SERVICE` in
  `scripts/build-cutover-report.mjs`; `APP_BASE_URL`; the Firebase Auth authorized domains and the
  Google OAuth redirect URIs; and — the item that actually breaks a live path — the Gmail inbound
  push subscription `gmail-inbox0-push`. That subscription posts to the current service URL’s
  `/api/gmail-hub/pubsub` and carries an OIDC token whose audience exactly matches that URL
  (`docs/evidence/gmail-production-activation-2026-07-13.md`). `lib/gmail-hub/pubsub.ts` verifies
  the token against `GMAIL_PUBSUB_AUDIENCE` and rejects a mismatch, so after replacement the
  subscription would keep posting at the old URL while the new service receives nothing
  while every in-app surface still looks healthy. Service replacement and subscription update are one atomic
  step with one rollback.
- **Monitoring is a cutover gate, not a follow-up (D13).** Before any live-data cutover, the four
  alert policies (three operational plus the separate kill-switch-outcome policy) and at least one
  notification channel declared by S51
  (`docs/feature-suites/production-operational-readiness.md`) must exist in the Production project
  and be attached to those policies. S40 owns the GATE and refuses the cutover when the readiness
  report is short a policy or a channel, or when any policy's project/resource/filter targets a
  resource outside the current Production manifest. In particular, A1's Cloud Run filter must name
  the manifest's current `serviceName`, so four policies aimed at retired `pmi-kc-kb-demo` cannot
  pass after the `pmi-kc-app` replacement. S51 owns the policy definitions, thresholds, and the
  channel itself. The gate reads S51’s declared policy list rather than a list restated here, so the
  two suites cannot drift.
- **A fresh rollback rehearsal is an exit criterion (D19).** Before any live-data cutover, the loop
  must have rehearsed the full blue/green path on the real Production service — deploy a candidate
  at zero traffic, promote that exact revision, roll traffic back to the captured prior revision,
  and record both revision names and both timestamps. Older evidence does not satisfy this: the
  rehearsal must postdate both the service replacement and the monitoring gate, because those are exactly the
  changes that could break it. The rehearsal procedure lives in S51; the exit criterion lives here.
- **Pre-deploy local-configuration hazard (D07).** `.env.local` currently carries
  `FIRESTORE_EMULATOR_HOST` under a `# TEMP local walkthrough — Firestore emulator (remove after)`
  comment. `scripts/deploy-demo-cloud-run.mjs` merges `.env.local` into its build env via
  `readLocalEnv()`, and two things happen to keep the emulator host out of the deployed service:
  `readRuntimeEnv` forwards only an explicit allowlist of keys, and the `--source=.` upload skips
  `.env.local` because the repository has no `.gcloudignore` and `.gitignore` ignores `.env.*`.
  Both are incidental — neither is a named guard, and neither fails the deploy. By contrast
  `scripts/prepare-production-env.mjs` names the risk explicitly: `FORBIDDEN_OUTPUT_KEYS` strips
  `FIRESTORE_EMULATOR_HOST`, `GOOGLE_APPLICATION_CREDENTIALS`, the local-model variables, and the
  RentVine key/secret — but that script is not on the `npm run deploy` path. Add the same explicit
  refusal to the deploy preflight. Do not mutate or delete `.env.local` as a deployment step:
  construct the Production plan from an isolated sanitized environment and refuse if any resolved
  source contains an emulator/local-only key. Local runs may continue using the emulator and remain
  local evidence.
- **Buildable now (app-plane).** Typed descriptor and guards; strict record classification; Demo-only
  fixture lifecycle; Production route/control exclusion; shell banners; read-only-context guard;
  manifest collision checks; migration inventory/dry-run/backup tooling; blue/green preflight and
  tests; documentation. Added 2026-07-29: the KB-corpus manifest field and the Firebase-Auth-project
  manifest field; wiring `checkEnvironmentIsolation` into `scripts/build-cutover-report.mjs` and
  `scripts/preflight-production-cutover.mjs` so it has a real caller; environment-parameterizing the
  deploy builder and refusing a Demo target that resolves a Production identifier; emitting explicit
  `ENVIRONMENT_KIND`/`DATA_CONTEXT` on every deploy; the named local-only/emulator refusal in the
  deploy preflight; replacing the `pmi-kc-kb-prod` string literals in `lib/gmail-hub/pubsub.ts` with
  manifest-resolved values; and the service-replacement checklist in the cutover report. Build all of these
  without inventing cloud identifiers.
- **Build to the seam (environment activation).** Produce an idempotent, parameterized Demo
  provisioning/deploy plan and a Production migration/cutover report that resolve all resources,
  identities, redirects, data counts, candidate revision, and rollback revision before mutation.
  Added 2026-07-29: the Demo plan also covers the Demo project’s own budget, Pub/Sub topic and
  kill-switch function; the Demo Firebase Auth project, authorized domains, Google provider and
  operator directory; and the Demo KB corpus targets. The Production report additionally enumerates
  the service-replacement steps including the `gmail-inbox0-push` push-endpoint and audience update, and reports
  monitoring-gate and rollback-rehearsal status as pass/fail rows. The loop may verify read-only
  state after valid managed authentication. Project/billing/Auth/IAM provisioning, new Cloud Run
  service creation, Pub/Sub endpoint/OIDC-audience mutation, Firebase authorized-domain/OAuth
  redirect changes, and destructive migration/deletion remain owner-run. After those resources and
  dependency redirects exist, routine revision deploy, smoke, traffic promotion, and rollback on the
  provisioned application service may run under D05 after all gates, preflights, prior-target
  capture, and rollback proof pass.
- **Owner dependency (the one flip).** The owner creates the Demo GCP project and supplies its exact
  identifiers — project id and number, region, **Demo Cloud Run service name**, Firestore database
  id, storage target, Pub/Sub topic, Secret Manager boundary, OAuth redirect and audience, runtime
  service account, Firebase Auth project and authorized domain, Demo KB data-store and Drive-folder
  ids, and the billing account and S52-governed initial budget/guardrail values — then creates the
  named Demo Cloud Run service and runs the generated project/billing/Auth/IAM provisioning and any
  destructive migration/deletion commands after their dry-run and backup report are green. The
  owner also creates the Production `pmi-kc-app` service and applies the reviewed Pub/Sub,
  Firebase-domain, and OAuth redirect mutations. Once those inputs, resources, and redirects exist,
  the runner may execute a routine revision deploy, smoke, traffic promotion, and rollback under
  D05. No Demo service identifier may be inferred from the Production name.

**Open questions & assumptions.**

- _Answered 2026-07-28 (D-01):_ Demo and Production are separate environments; Production is
  Live-only; Demo owns realistic invented data and may also expose an explicitly selected Live
  read-only context.
- _Answered 2026-07-28:_ Demo and Production run the same product contract. Demo is not a separate
  simplified UI and Production is not allowed to retain a hidden Test workspace.
- _Answered 2026-07-28:_ blue/green describes Production revision promotion/rollback, not the
  data-environment boundary.
- _Answered 2026-07-29 (D11):_ the Demo topology question is closed. Demo is a NEW dedicated GCP
  project — not a namespace, not a second database, and not a split inside the Production project.
  The exact identifiers are still owner-supplied and do not yet exist in durable context, so code
  and scripts continue to accept validated parameters and fail closed until they arrive; what is no
  longer open is WHAT they identify.
- _Answered 2026-07-29 (D11):_ the manifest’s isolation surface is incomplete as written. The KB
  corpus and the Firebase Auth project are isolated resources and become manifest fields in this
  suite; an isolation result of `ok` that omits them is not evidence of isolation.
- _Answered 2026-07-29 (D11):_ the Demo project gets its own budget and kill switch. The armed
  guardrail is project-scoped to Production and does not extend to a new project by default.
- _Answered 2026-07-29 (D56):_ the Production Cloud Run target moves from `pmi-kc-kb-demo` to
  `pmi-kc-app` as part of this cutover. Because Cloud Run does not rename a service in place, the
  suite prepares the new-service and dependency-redirection packet; the owner creates the service
  and updates the `gmail-inbox0-push` endpoint/audience plus Firebase/OAuth configuration. The
  runner may then deploy/smoke/promote a routine revision under D05. The old target is retained for
  rollback and retired only after verified observation and owner-reviewed deletion.
- _Answered 2026-07-29 (D13):_ monitoring/alerting is an S40 acceptance criterion, not a later
  suite’s problem. S40 refuses the cutover without it; S51 builds the policies and the channel.
- _Answered 2026-07-29 (D19):_ a fresh blue/green rollback rehearsal on the real Production service
  is an explicit S40 exit criterion that must precede any live-data cutover.
- _Answered 2026-07-29 (D01 cost posture):_ the earlier flat project-budget figure is superseded for
  this phase. The governing limit for both environments is the production cost ceiling defined by
  S52; scripts and messages that still quote the old figure are updated to point at it.
- _Assumption:_ existing invented Test records may be recreated from deterministic fixtures rather
  than copied record-for-record if that better prevents customer content from crossing boundaries.
- _Client-owned:_ cloud project/billing/Auth/IAM provisioning, OAuth redirect approval, and
  destructive Production data/service deletion remain owner-run after the loop produces the exact
  report. Routine application deploy, smoke, and traffic promotion follow D05.
- _Client-owned:_ creating the Demo GCP project, linking its billing account, connecting the Demo
  budget to its Pub/Sub topic in the billing console, and any IAM/destructive migration are owner-run.
  Creating the exact owner-supplied Demo Cloud Run service and Production `pmi-kc-app`, and updating
  the `gmail-inbox0-push` endpoint/audience, Firebase authorized domains, and OAuth redirects are
  also owner-run dependency mutations. After those dependencies land, the runner may deploy a
  revision to either already-provisioned application service, smoke, promote, and roll back under
  D05.
- Decision-complete for product behavior; exact infrastructure values and owner-run provisioning/
  destructive operations remain activation dependencies.

**Cross-product impacts.**

- Likely boundaries include `lib/console/environment.ts`, data-mode schemas/guards, session/context
  construction, Demo seed/reset scripts, provider factories, receipt schemas, `AppShell`, production
  preflight/cutover/deploy scripts, `.env.example`, Firestore rules, and environment handoff docs.
  The executor may choose equivalent modules after discovery.
- Confirmed paths for the 2026-07-29 additions: `lib/environment/manifest.ts` (isolation fields),
  `lib/environment/descriptor.ts` (descriptor source), `lib/config/server.ts`
  (`SPACE_VERTEX_DATA_STORE_IDS`, `SPACE_DRIVE_FOLDER_IDS`), `lib/auth/roles.ts`,
  `lib/gmail-hub/pubsub.ts` and `app/api/gmail-hub/pubsub/route.ts`,
  `scripts/deploy-demo-cloud-run.mjs`, `scripts/build-cutover-report.mjs`,
  `scripts/preflight-production-cutover.mjs`, `scripts/prepare-production-env.mjs`,
  `scripts/setup-budget-killswitch.mjs`, `scripts/setup-firebase-auth-demo.mjs`,
  `scripts/set-firebase-user-role.mjs`, `docs/environment-handoff.md`,
  `docs/client-production-cutover.md`, and `docs/evidence/gmail-production-activation-2026-07-13.md`.
- S51 (`docs/feature-suites/production-operational-readiness.md`) builds the alert policies, the
  notification channel, and the rollback-rehearsal procedure that S40 gates on; S52 owns the cost
  ceiling that both the Production and the new Demo budget are sized against. S40 must not restate
  either suite’s thresholds — it reads their declared lists so the pair cannot drift.
- The D56 rename touches S31/gmail-watch inbound: the live `gmail-inbox0-push` subscription and the
  `GMAIL_PUBSUB_AUDIENCE` runtime value are part of the rename’s atomic change set, and the
  post-rename inbound proof is part of this suite’s exit evidence rather than S31’s.
- Supersedes the **target posture** of S23 and `F-PRODUCTION-DUAL-DATA-LANES`; that fact remains an
  honest current implementation fact until migration completes. At completion, add a new built fact
  and a Supersede Log entry for the dual-lane Production claim.
- S41–S50 consume the environment/context vocabulary. S25/S26 Test adapters become Demo-environment
  adapters or engineering fixtures; their no-Live-client invariant is preserved.
- Existing action-level activation remains per provider. Environment separation never changes a
  false action gate to true by itself.

**Adversarial acceptance checks.**

- **AC-S40-1** — Startup and the production cutover preflight refuse a missing, unknown, or invalid
  environment/context combination; Production cannot be constructed with Demo/Test mode and no
  record without explicit Live classification is rendered or mutated. _Verify:_ focused
  environment/schema/preflight tests plus `npm run typecheck`.
- **AC-S40-2** — A manifest using the same project, database/namespace, storage target, queue/topic,
  Secret Manager boundary, OAuth redirect/audience, or runtime identity for Demo and Production is
  rejected with the conflicting field named and emits no executable provisioning/deploy command.
  _Verify:_ manifest and cutover adversarial tests.
- **AC-S40-3** — The same canonical renewal, approval, and maintenance task renders in Demo and
  Production through shared product components; Demo persists only Demo receipts and makes zero Live
  provider constructions, while Production source contains no reachable Demo seeder/simulator route
  or product control. _Verify:_ provider-construction sentinels, route tests, and targeted browser
  tasks in both descriptors.
- **AC-S40-4** — Demo Live-read-only visibly labels every authenticated page, returns separate
  read-only projections, invalidates stale confirmations on context change, and refuses every
  mutation/send/write/receipt path before provider construction. No list/count combines Demo and
  Live-read-only records. _Verify:_ session, aggregation, route, and negative effect tests.
- **AC-S40-5** — The migration dry-run identifies legacy invented records without emitting content,
  records a backup/rollback target, refuses missing/ambiguous classification, and cannot delete a
  Live record. After a fixture migration rehearsal, Production counts contain zero Demo/Test records
  and Demo task parity remains green. _Verify:_ emulator migration tests and redaction checks.
- **AC-S40-6** — A release candidate receives zero traffic until manifest and smoke checks pass;
  promotion targets the exact candidate revision, captures the prior serving revision, and the
  rollback command restores that exact prior revision. _Verify:_ deploy-script unit tests and a
  non-mutating cutover report.
- **AC-S40-7** — Authenticated Admin and Editor desktop plus 390×844 checks show an unambiguous
  environment/context label with no header collision, and Production contains no Sample/Test/Demo
  operator copy. _Verify:_ browser task tests and copy scan.
- **AC-S40-8** — Full gates pass: `npm run format:check`, `npm run lint`, `npm run typecheck`,
  `npm test`, `npm run test:e2e:core`, `npm run verify:spec-traceability`,
  `npm run verify:context-freshness`, and `npm run build`; keep action-gate, auth-identity,
  data-lane, provider-construction, redaction, and cutover sentinels green.

The following continue the series under the 2026-07-29 decisions. They are additional to, not
replacements for, AC-S40-1 through AC-S40-8.

- **AC-S40-9** — A manifest pair whose Demo and Production knowledge-base targets share any Vertex
  data-store id or Drive source-folder id is rejected, the refusal message names the knowledge-base
  field and the colliding Space id, and `buildEnvironmentProvisioningPlan` returns no `commands`
  key for that pair. The same pair is rejected when only ONE Space id collides and every other
  field differs. A manifest with an empty or missing knowledge-base target is rejected as unset
  rather than treated as isolated. _Verify:_ `npm test -- tests/unit/environment-manifest.test.ts`;
  `npm run typecheck`.
- **AC-S40-10** — `checkEnvironmentIsolation` has a production caller: running
  `npm run cutover:report` against a manifest pair that shares any isolated field exits non-zero
  and prints the conflicting field names, and running `npm run preflight:production` against the
  same pair fails with the same field names. A grep for `environment/manifest` resolves to at least
  one module under `scripts/` or `lib/` that is not a test. _Verify:_
  `npm test -- tests/unit/cutover-report.test.mjs tests/unit/cutover-readiness-golden.test.mjs`;
  `npm run cutover:report` (non-mutating).
- **AC-S40-11** — The deploy builder cannot silently target Production. Invoked for a Demo
  environment while the resolved project or service equals a Production identifier, it returns
  `ok:false` with an error naming the offending field and emits no gcloud argument list. Invoked
  for either environment it always includes `ENVIRONMENT_KIND=` and `DATA_CONTEXT=` in its
  `--set-env-vars` map, matching that environment’s manifest. A descriptor resolved from the
  deployed revision reports `source: "explicit"`, never `"legacy-node-env"`, and the production
  cutover preflight fails when the source is `legacy-node-env`. _Verify:_
  `npm test -- tests/unit/live-cost-scripts.test.mjs tests/unit/environment-descriptor.test.ts`;
  `npm run deploy -- --plan-only --environment=production` (a new guaranteed non-executing branch
  that runs before auth/S52 execution eligibility, prints the candidate command, and never invokes
  gcloud) and confirm the printed command carries both descriptor variables. `--plan-only` cannot
  be combined with an execute/promote flag and makes no `--budget-confirmed` claim while S52 is null.
- **AC-S40-12** — The deploy path refuses local-only configuration by name. With
  `FIRESTORE_EMULATOR_HOST` (or `GOOGLE_APPLICATION_CREDENTIALS`, or a local-model variable)
  present in the resolved deploy env, the deploy preflight exits non-zero and names the variable;
  it does not merely omit it. With those variables absent the same invocation succeeds. _Verify:_
  `npm test -- tests/unit/live-cost-scripts.test.mjs tests/unit/prepare-production-env.test.mjs`;
  `npm run deploy -- --plan-only --environment=production` with the variable set, expecting a
  non-zero exit whose message NAMES `FIRESTORE_EMULATOR_HOST`. A bare non-zero exit does not satisfy
  this check; the plan-only branch must distinguish unsafe environment from execution eligibility.
- **AC-S40-13** — The owner-created service and owner-applied dependency redirects are verified
  before the runner's routine revision deployment. After replacement, the serving Cloud Run service
  is named `pmi-kc-app`, no repo default still resolves `pmi-kc-kb-demo` as the Production service
  (`DEFAULT_SERVICE` and `DEFAULT_CUTOVER_SERVICE` both read `pmi-kc-app`), and inbound Gmail works
  end to end: a
  live authenticated push to the renamed service’s `/api/gmail-hub/pubsub` returns 2xx, while a
  push carrying the pre-rename audience returns 401 with `Pub/Sub OIDC token is invalid.` The
  cutover report lists the service-replacement change set including the `gmail-inbox0-push` push-endpoint and
  audience update, and refuses to mark replacement complete while the subscription still resolves
  the old URL. _Verify:_ `npm test -- tests/unit/gmail-hub-pubsub.test.ts`,
  `npm test -- tests/unit/cutover-report.test.mjs`, `npm run cutover:report`; record the
  post-rename inbound proof as identifiers and status only.
- **AC-S40-14** — The cutover refuses to proceed while monitoring is incomplete. With fewer than
  S51's three operational policies plus its separate kill-switch-outcome policy (four total), or
  with zero human-reaching notification channels attached, the cutover readiness report prints a
  FAIL row naming each missing policy or channel and exits non-zero. It also resolves each policy's
  project/resource/filter against the current Production manifest and fails on any mismatch; after
  D56, an A1 filter naming `pmi-kc-kb-demo` fails even if all four policy names and the channel
  exist. Only four correctly targeted policies with the attached channel print PASS. The gate reads
  S51’s declared policy list rather than a list duplicated in S40. _Verify:_
  `npm test -- tests/unit/cutover-readiness-golden.test.mjs`; `npm run cutover:report`.
- **AC-S40-15** — The cutover refuses to proceed without a fresh rollback rehearsal. The readiness
  report records the rehearsal’s candidate revision name, promoted revision name, restored prior
  revision name, and both timestamps; it FAILs when no rehearsal is recorded, when the recorded
  rehearsal predates the service replacement or the monitoring gate, or when the restored revision does not
  equal the captured prior revision. _Verify:_
  `npm test -- tests/unit/cutover-report.test.mjs tests/unit/cutover-readiness-golden.test.mjs`;
  `npm run cutover:report`.
- **AC-S40-16** — The Demo provisioning plan emits a Demo-project budget, Pub/Sub topic, and
  kill-switch function/service account whose project equals the Demo project id, and the plan fails
  when any of those resolve the Production project. No Demo deploy command is emitted while the
  Demo budget/kill-switch section of the plan is unresolved, and the `--budget-confirmed` refusal
  message names the S52 ceiling rather than a flat figure. _Verify:_
  `npm test -- tests/unit/budget-killswitch.test.mjs tests/unit/budget-guard.test.mjs`;
  `npm run killswitch:plan -- --project=<demo-project> --project-number=<demo-project-number>`
  (print-only) and confirm every emitted
  resource resolves the Demo project.
- **AC-S40-17** — Demo has its own identity plane. The manifest rejects a pair whose Demo and
  Production Firebase Auth projects match, naming that field; the Demo provisioning plan includes
  Firebase Auth initialization, authorized domains, the Google provider, and an operator-directory
  step; and the directory report is a role-to-count summary containing no email address. A session
  bearing a Production-issued token is refused by the Demo deployment with an authentication
  failure rather than a role downgrade. _Verify:_
  `npm test -- tests/unit/environment-manifest.test.ts`,
  `npm test -- tests/unit/console-environment-boundary.test.ts`, `npm run verify:redaction`.

**Forbidden actions / hard gates.** Never share Demo and Production data stores, effect credentials,
receipts, queues, storage, OAuth audiences, runtime identities, knowledge-base corpora, or Firebase
Auth projects — the knowledge base and the auth project are isolated resources exactly like the
database, and an isolation result that omits them is not evidence. Never infer Live from a missing
field or record name. Never let Demo Live-read-only mutate app or provider state. Never copy customer
content into git, fixtures, logs, or migration evidence. Never delete Production records without a
reviewed inventory, backup, target proof, and owner-run command. Never deploy a Demo environment
onto the Production project, and never deploy with a local-only or emulator variable in the resolved
env. Never replace the Production Cloud Run service without updating the `gmail-inbox0-push`
subscription’s push endpoint and OIDC audience in the same reviewed change. Never perform a
live-data cutover before the monitoring gate and a fresh rollback rehearsal both pass. No autonomous
CLIENT-facing send; internal-staff notifications may auto-send per `D-AUTOMATION-LINE`. Every Live
client-facing send or system-of-record write remains human-confirmed, one-attempt, idempotent,
receipted, reconciled, monitored, and reversible. Generic non-workflow `gmail.message.send` stays
Registry-closed, personal identity stays outside every auth path, no secret, PII, or guessed
endpoint enters git, secrets stay in Secret Manager, and spend in BOTH environments stays under the
production cost ceiling defined by S52. This suite does not preflip any provider
`production_allowed` gate.

`lib/auth/**` and `firestore.rules` are exact D12 protected paths. Any S40 hunk under either path is
isolated, tested, and prepared for owner review; it is never included in an unattended push.
Independent descriptor, manifest, deployment-plan, UI, and test work continues with the protected
hunk parked. The suite must not silently substitute an unprotected duplicate for an auth or Rules
boundary merely to avoid that review.

**Ordered prompt sequence.**

1. _Discovery:_ read the environment, data-mode, session, provider-factory, seed/reset, receipt,
   cutover/deploy, Firestore-rule, and release-test paths; inventory current Production Test/Demo
   records by schema/count only; do not run a live read until ADC preflight passes.
2. _Understanding:_ write the resolved environment/resource matrix and current-to-target migration
   map. Prove which current facts describe deployed reality and which target rules this suite
   supersedes.
3. _Build:_ implement the server descriptor, valid-combination matrix, strict classification,
   Production exclusions, Demo effect boundary, persistent banners, and Live-read-only refusal.
   Isolate any required `lib/auth/**` or `firestore.rules` hunk as D12-protected work for owner review
   while continuing the unprotected app-plane slice.
4. _Build:_ implement independent manifest validation, Demo provisioning plan, migration
   inventory/dry-run/backup/rollback, and exact blue/green candidate promotion/rollback tooling.
5. _Build:_ extend the manifest with the knowledge-base and Firebase-Auth-project fields, give
   `checkEnvironmentIsolation` a real production caller in the cutover report and production
   preflight, and replace the `pmi-kc-kb-prod` string literals in `lib/gmail-hub/pubsub.ts` with
   manifest-resolved values. Satisfies AC-S40-9, AC-S40-10, AC-S40-17.
6. _Build:_ split `scripts/deploy-demo-cloud-run.mjs` into an environment-parameterized deploy that
   requires a validated manifest pair, refuses a Demo target resolving any Production identifier,
   always emits `ENVIRONMENT_KIND`/`DATA_CONTEXT`, and refuses a resolved env containing
   `FIRESTORE_EMULATOR_HOST`, `GOOGLE_APPLICATION_CREDENTIALS`, or a local-model variable by name.
   Add the mutually exclusive, guaranteed non-executing `--plan-only` path used while S52 is null.
   Satisfies AC-S40-11 and AC-S40-12.
7. _Build:_ add the Demo-project budget/topic/kill-switch section to the provisioning plan, re-point
   the `--budget-confirmed` message at the S52 ceiling, and add the monitoring-gate and
   rollback-rehearsal rows to the cutover readiness report, reading S51’s declared policy list
   rather than restating it and validating every policy target against the current Production
   manifest. Satisfies AC-S40-14, AC-S40-15, AC-S40-16.
8. _Build:_ produce the service-replacement change set for `pmi-kc-kb-demo` → `pmi-kc-app` as one
   atomic owner-operation packet covering new-service creation, the repo defaults, `APP_BASE_URL`,
   authorized domains and OAuth redirects, and the `gmail-inbox0-push` push endpoint plus OIDC
   audience. Retain the old service/revision as rollback and include its later reviewed retirement.
   After the owner-applied resources/redirects verify, D05 covers only the routine revision deploy,
   smoke, promotion, and rollback. Satisfies AC-S40-13.
9. _Verify:_ run AC-S40-1 through AC-S40-17; explicitly falsify missing mode, browser-forged
   context, shared resource IDs, a shared knowledge-base Space id, a shared Firebase Auth project,
   Demo provider construction, mixed counts, stale confirmation, live-record deletion, a Demo deploy
   resolving the Production project, a deploy carrying the emulator host, a `legacy-node-env`
   descriptor at cutover, a pre-rename OIDC audience, a missing alert policy, a missing notification
   channel, a stale rollback rehearsal, smoke failure, and wrong-revision promotion.
10. _Gate:_ keep all unrelated action gates unchanged. If S40 exposes an already-documented Live
    action through the new Production shell, reuse its existing gate; environment config is not an
    action authorization.
11. _Gate:_ hand back one exact, redacted packet naming the required Demo project identifiers, Demo
    Cloud Run service name, billing/budget values, Firebase Auth project and authorized domain,
    owner-run provisioning/IAM/destructive steps, both new-service creations and
    Pub/Sub/Firebase/OAuth dependency-update commands, candidate and prior targets, counts, backup,
    and rollback. After the owner-run dependencies exist, the runner may execute only the routine
    revision deploy, smoke, promotion, and rollback under D05.
12. _Context update:_ after code is green but before owner activation, record a built-to-seam fact
    and the named dependency. After activation/smoke, add the verified S40 fact citing the AC ids it
    satisfies, supersede the dual-lane-Production target claim and the pre-rename service name,
    update environment handoff/status, and advance `docs/loop-state.md` to the next suite.

**Deletion/merge recommendation.** KEEP this spec as the durable environment contract. MERGE S23’s
still-useful isolation and fail-closed tests into S40 behavior; do not delete historical S23. DELETE
disposable migration packets only after their non-sensitive outcomes are recorded durably. KEEP the
monitoring and rollback-rehearsal requirements here as GATES only — their definitions and procedures
belong to S51, and duplicating thresholds or policy names in this file is the drift this split
exists to prevent. DELETE the rename change set after the post-rename inbound-Gmail proof and the
superseded service-name entry are both recorded.
