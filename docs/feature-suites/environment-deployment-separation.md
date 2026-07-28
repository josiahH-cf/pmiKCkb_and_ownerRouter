<!-- spec-shape: overhaul-v1 -->

# S40 — Demo/Production environment and deployment separation

> New 2026-07-28. Implements D-01 and the environment portion of D-08/D-14 under
> `F-UIUX-RECALIBRATION-AUTHORIZED`. This is the first suite in the S40–S50 program.

**Goal.** PMI KC operates the same product in two unmistakably separate environments: Demo safely
rehearses real workflows with realistic invented data, while Production contains Live data only.
Neither environment can borrow the other’s records, credentials, effects, or receipts. Demo may
optionally show one explicitly selected Live read-only context, but never combines it with Demo data
or enables a Live effect. Production releases use a deliberate blue/green revision promotion and
rollback flow. The current dual-lane Production implementation remains a historical/current-state
fact until this suite’s migration is verified; this suite changes the target and then the runtime.

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
- **Buildable now (app-plane).** Typed descriptor and guards; strict record classification; Demo-only
  fixture lifecycle; Production route/control exclusion; shell banners; read-only-context guard;
  manifest collision checks; migration inventory/dry-run/backup tooling; blue/green preflight and
  tests; documentation. Build all of these without inventing cloud identifiers.
- **Build to the seam (environment activation).** Produce an idempotent, parameterized Demo
  provisioning/deploy plan and a Production migration/cutover report that resolve all resources,
  identities, redirects, data counts, candidate revision, and rollback revision before mutation.
  The loop may verify read-only state after valid managed authentication, but it does not silently
  create resources, move traffic, or delete Production records.
- **Owner dependency (the one flip).** The owner supplies/approves the exact Demo cloud resource
  identifiers and runs the generated provisioning/deploy/migration commands after their dry-run and
  backup report are green. No identifier may be guessed from the existing service name.

**Open questions & assumptions.**

- _Answered 2026-07-28 (D-01):_ Demo and Production are separate environments; Production is
  Live-only; Demo owns realistic invented data and may also expose an explicitly selected Live
  read-only context.
- _Answered 2026-07-28:_ Demo and Production run the same product contract. Demo is not a separate
  simplified UI and Production is not allowed to retain a hidden Test workspace.
- _Answered 2026-07-28:_ blue/green describes Production revision promotion/rollback, not the
  data-environment boundary.
- _Assumption:_ exact Demo resource IDs do not yet exist in durable context. Code and scripts accept
  validated parameters and fail closed until the owner supplies them.
- _Assumption:_ existing invented Test records may be recreated from deterministic fixtures rather
  than copied record-for-record if that better prevents customer content from crossing boundaries.
- _Client-owned:_ cloud provisioning, OAuth redirect approval, Production data deletion, and traffic
  promotion remain owner-run operations after the loop produces the exact report.
- Decision-complete: no product choice is open; only exact infrastructure values and the owner-run
  activation remain.

**Cross-product impacts.**

- Likely boundaries include `lib/console/environment.ts`, data-mode schemas/guards, session/context
  construction, Demo seed/reset scripts, provider factories, receipt schemas, `AppShell`, production
  preflight/cutover/deploy scripts, `.env.example`, Firestore rules, and environment handoff docs.
  The executor may choose equivalent modules after discovery.
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

**Forbidden actions / hard gates.** Never share Demo and Production data stores, effect credentials,
receipts, queues, storage, OAuth audiences, or runtime identities. Never infer Live from a missing
field or record name. Never let Demo Live-read-only mutate app or provider state. Never copy customer
content into git, fixtures, logs, or migration evidence. Never delete Production records without a
reviewed inventory, backup, target proof, and owner-run command. No autonomous client-facing send;
every Live client-facing send or system-of-record write remains human-confirmed, one-attempt,
idempotent, receipted, reconciled, monitored, and reversible. Generic Gmail send stays closed,
personal identity stays outside auth, secrets stay in Secret Manager, and the ~$10 cap remains.
This suite does not preflip any provider `production_allowed` gate.

**Ordered prompt sequence.**

1. _Discovery:_ read the environment, data-mode, session, provider-factory, seed/reset, receipt,
   cutover/deploy, Firestore-rule, and release-test paths; inventory current Production Test/Demo
   records by schema/count only; do not run a live read until ADC preflight passes.
2. _Understanding:_ write the resolved environment/resource matrix and current-to-target migration
   map. Prove which current facts describe deployed reality and which target rules this suite
   supersedes.
3. _Build:_ implement the server descriptor, valid-combination matrix, strict classification,
   Production exclusions, Demo effect boundary, persistent banners, and Live-read-only refusal.
4. _Build:_ implement independent manifest validation, Demo provisioning plan, migration
   inventory/dry-run/backup/rollback, and exact blue/green candidate promotion/rollback tooling.
5. _Verify:_ run AC-S40-1 through AC-S40-8; explicitly falsify missing mode, browser-forged context,
   shared resource IDs, Demo provider construction, mixed counts, stale confirmation, live-record
   deletion, smoke failure, and wrong-revision promotion.
6. _Gate:_ keep all unrelated action gates unchanged. If S40 exposes an already-documented Live
   action through the new Production shell, reuse its existing gate; environment config is not an
   action authorization.
7. _Owner:_ hand back one exact, redacted provisioning/migration/deploy packet naming the required
   Demo values, candidate revision, prior revision, counts, backup, commands, and rollback. The owner
   runs it.
8. _Context update:_ after code is green but before owner activation, record a built-to-seam fact and
   the named dependency. After activation/smoke, add the verified S40 fact, supersede the
   dual-lane-Production target claim, update environment handoff/status, and advance
   `docs/loop-state.md` to S41.

**Deletion/merge recommendation.** KEEP this spec as the durable environment contract. MERGE S23’s
still-useful isolation and fail-closed tests into S40 behavior; do not delete historical S23. DELETE
disposable migration packets only after their non-sensitive outcomes are recorded durably.
