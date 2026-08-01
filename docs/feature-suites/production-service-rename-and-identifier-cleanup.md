<!-- spec-shape: overhaul-v1 -->

# S55 — Production service rename and stale identifier cleanup

> New 2026-08-01 (owner decision, Q&A round 2). Implements D56's rename of the Production Cloud Run
> service from `pmi-kc-kb-demo` to `pmi-kc-app`, which S40 listed as a cutover item but never scoped.
> The owner directed the rename be done AND that hardcoded/stale identifiers be researched
> recursively first, anticipating that stale values would make it tricky. That research is complete
> and is recorded below; it found one load-bearing runtime coupling that would have failed closed,
> and one dead legacy bucket still referenced by a tracked manifest.

**Goal.** The service that serves real client data stops being named `pmi-kc-kb-demo`. Today the
only live application service carries a name that says "demo", which is precisely the confusion the
whole Demo/Production separation programme exists to prevent: an operator or engineer reading the
console sees a service called demo and may reasonably assume it is a safe sandbox. After this suite
the Production service is named `pmi-kc-app`, sign-in keeps working throughout, vendor lifecycle
actions keep working throughout, and no user sees an interruption. Separately, identifiers belonging
to the retired `pmikckb-test` project stop being carried in tracked files as though they were live.

**What it is / how it functions.**

- **The load-bearing coupling — `lib/vendor/live-lifecycle-runtime.ts`.** Line 79 pins
  `CURRENT_PRODUCTION_APP_HOST = "pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app"`. That constant is read by
  `validProductionAppOrigin` (checked against `config.appBaseUrl`) and `validProductionAuthDomain`,
  both of which feed `ExecutionTechnicalGates`. Renaming the service changes the app's own URL, so
  `APP_BASE_URL` stops matching the allowlist and the vendor lifecycle gates fail closed. Failing
  closed is the safe direction, so this is a correctness bug rather than a safety one, but
  `vendor.account.invite`, `vendor.account.disable`, and `vendor.assignment.change` would silently
  stop being executable. **This constant must become a set that accepts the old and new hosts
  simultaneously, and it must be widened BEFORE the new service is promoted.**
- **Two-stage, never a flag day.** Stage one widens every allowlist and default to accept both names
  and stands up `pmi-kc-app` alongside the existing service, verified at its zero-traffic tag URL via
  the S40 `npm run release` path. Stage two retires `pmi-kc-kb-demo` only after the new service has
  served real traffic and a rollback has been rehearsed. This follows the standing rule that nothing
  is deleted big-bang: hide and instrument first, delete only with consumer, route, test, and
  rollback proof.
- **Firebase authorized domains are a hard prerequisite.** The Identity Toolkit config for
  `pmi-kc-kb-prod` currently authorizes `pmi-kc-kb-demo-558870356522.us-central1.run.app` and
  `pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app` (Cloud Run serves both a modern
  `<service>-<project-number>.<region>.run.app` form and a legacy `<service>-<hash>-uc.a.run.app`
  form for the same service). The `pmi-kc-app` equivalents must be ADDED to `authorizedDomains`
  before promotion, or Google sign-in breaks for every operator. The addition is purely additive;
  the old domains stay until stage two.
- **`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` is not affected.** It resolves to
  `pmi-kc-kb-prod.firebaseapp.com`, which is project-derived and survives the rename. Verified live
  on the running revision, so it is explicitly out of scope rather than merely assumed safe.
- **Ops scripts that default to the old service name.** `scripts/deploy-demo-cloud-run.mjs:22`
  (`DEFAULT_SERVICE`), `scripts/rehearse-rollback.mjs:13` (`DEFAULT_SERVICE`),
  `scripts/build-cutover-report.mjs:25` (`DEFAULT_CUTOVER_SERVICE`), and
  `scripts/demo-operator.mjs:16` plus `scripts/demo-operator.ps1:5` (hosted base URL). Each keeps
  working during stage one because the old service still exists; each must point at `pmi-kc-app`
  before stage two or it silently targets a retired service.
- **Monitoring watches the old service by name — `infra/monitoring/manifest.mjs:22,141`.** The alert
  policies carry `service: "pmi-kc-kb-demo"` as a resource label. If this is not moved in lockstep,
  monitoring goes quiet against the new service while continuing to look healthy, which is the worst
  possible failure shape for an alerting system: silence that reads as success.
- **Dead legacy bucket in a tracked manifest.** `docs/source-corpus/demo-live-source-manifest.json`
  carries ten-plus `gs://pmikckb-test-lease-renewals-686407/...` URIs. That bucket returns 404; the
  project is retired. `scripts/source-corpus-manifest.mjs:17` still names the file. The Admin
  migration-readiness surface reads `client-production-source-manifest.template.json` and NOT this
  file, so runtime severity is low, but it is dead data presented as a catalog and should be marked
  retired rather than silently carried.
- **`DEMO_VALUE_PATTERNS` is correct and stays.** `scripts/preflight-production-cutover.mjs:12`
  denylists `pmikckb-test`, `lease-renewals-686407`, `800237451321`, and `cherrybridge.ai`. It does
  NOT denylist the substring "demo", so the current `pmi-kc-kb-demo` URL does not trip it. This was
  checked explicitly because a preflight that rejected the live Production URL would be a latent
  blocker; it does not.

Buildable now (app-plane): the allowlist widening, every script/manifest default, and the tests that
pin them. Build to the seam: the `pmi-kc-app` service stood up with `--no-traffic` and verified at
its tag URL. Owner dependency: none remaining. The authorized-domain addition and the Cloud Run
deploy/promote are covered by the standing cloud-automation grant recorded 2026-08-01.

**Open questions & assumptions.**

- _Assumption:_ the new service receives the legacy-form URL `pmi-kc-app-kq6wuvpiva-uc.a.run.app` in
  addition to `pmi-kc-app-558870356522.us-central1.run.app`, because `kq6wuvpiva` is a per-project,
  per-region hash rather than a per-service one. **This must be read back from the created service
  rather than assumed**, and both forms authorized if both resolve.
- _Open:_ whether any client-side bookmark, saved link, or externally configured webhook points at
  the `pmi-kc-kb-demo` host. Stage two retires that host, so anything still pointing at it breaks.
  The old service is kept serving through stage one specifically to make this discoverable.
- _Assumption:_ no Gmail Pub/Sub push endpoint carries the service host. Not yet verified against the
  live subscription; step 2 of the ordered sequence verifies it before any traffic moves.

**Cross-product impacts.** `lib/vendor/live-lifecycle-runtime.ts`;
`scripts/deploy-demo-cloud-run.mjs`; `scripts/rehearse-rollback.mjs`;
`scripts/build-cutover-report.mjs`; `scripts/demo-operator.mjs`; `scripts/demo-operator.ps1`;
`infra/monitoring/manifest.mjs`; `docs/source-corpus/demo-live-source-manifest.json`;
`scripts/source-corpus-manifest.mjs`. Tests pinning the current name:
`tests/unit/cutover-report.test.mjs`, `tests/unit/cutover-readiness-golden.test.mjs`,
`tests/unit/live-cost-scripts.test.mjs`, `tests/unit/rollback-rehearsal.test.mjs`,
`tests/unit/prepare-production-env.test.mjs`, `tests/unit/monitoring-plan.test.mjs`,
`tests/unit/release-candidate.test.mjs`. Roughly forty docs mention the old name; dated evidence
files and `*.html` walkthroughs are historical records and must NOT be rewritten.

**Adversarial acceptance checks.**

- **AC-S55-1** — `CURRENT_PRODUCTION_APP_HOST` is replaced by a set accepting both the old and new
  hosts, and a test asserts an `APP_BASE_URL` on EITHER host passes `validProductionAppOrigin`. A
  test proves an unrelated `*.run.app` host still fails, so widening did not become "any run.app".
- **AC-S55-2** — A test asserts the vendor lifecycle `ExecutionTechnicalGates` stay satisfied when
  `APP_BASE_URL` is the `pmi-kc-app` host, and that the three vendor action keys remain executable.
- **AC-S55-3** — Firebase `authorizedDomains` contains every URL form the new service actually
  resolves at, read back from the live Identity Toolkit config rather than assumed, with the old
  domains still present.
- **AC-S55-4** — `pmi-kc-app` exists, was deployed with `--no-traffic` and its own tag, and returns a
  signed-in-capable page at its tag URL while `pmi-kc-kb-demo` still serves 100 percent of traffic.
- **AC-S55-5** — `infra/monitoring/manifest.mjs` targets the new service, and a test asserts no alert
  policy references a service name that no longer exists, so monitoring cannot go silently quiet.
- **AC-S55-6** — Every ops script default (`deploy`, `rehearse-rollback`, `build-cutover-report`, both
  `demo-operator` entrypoints) names `pmi-kc-app`, with tests pinning each.
- **AC-S55-7** — `docs/source-corpus/demo-live-source-manifest.json` is marked retired in place with
  its dead bucket named, or removed with its consumer updated. Either way a test or the readiness
  script proves no tracked manifest presents a 404 bucket as a live catalog.
- **AC-S55-8** — Stage two retires `pmi-kc-kb-demo` only after a recorded rollback rehearsal against
  `pmi-kc-app`, and the retirement is reversible by redeploying the captured prior revision.

**Forbidden actions / hard gates.**

- Never promote `pmi-kc-app` to serving traffic before the authorized domains are added and read
  back. Doing so breaks sign-in for every operator with no in-app recovery path.
- Never delete `pmi-kc-kb-demo` in the same change that creates `pmi-kc-app`. Two stages, with proof
  between them.
- Never widen `validProductionAppOrigin` to accept any `run.app` host, any hostname suffix, or a
  wildcard. It is an authorization boundary; it takes an explicit set of exact hosts.
- Never rewrite dated evidence documents or `*.html` walkthroughs to say `pmi-kc-app`. They record
  what was true on their date; editing them destroys the audit trail.
- The rename does not touch any D12 protected path, any `production_allowed` value, or any Action
  Registry key.

**Ordered prompt sequence.**

1. _Discovery:_ read back the live `APP_BASE_URL`, `authorizedDomains`, and the Gmail Pub/Sub push
   endpoint, confirming which carry the service host.
2. _Understanding:_ confirm no push subscription or external webhook pins the old host.
3. _Build:_ widen `CURRENT_PRODUCTION_APP_HOST` to an exact-host set, with tests for both accept and
   reject cases.
4. _Build:_ point every ops script default and the monitoring manifest at `pmi-kc-app`, updating the
   tests that pin them.
5. _Verify:_ full gate green.
6. _Build:_ add the `pmi-kc-app` authorized domains, then deploy the service `--no-traffic` with a
   tag, and read back which URL forms it resolves at.
7. _Falsify:_ confirm sign-in works at the tag URL and that vendor lifecycle gates report executable.
8. _Build:_ promote by exact revision via the S40 release path, capturing the rollback command.
9. _Verify:_ rehearse rollback against the new service, then retire the old service.
10. _Document:_ record the outcome and mark the stale manifest retired.

**Deletion/merge recommendation.** KEEP until stage two completes, then MERGE the durable outcome
into `docs/feature-suites/environment-deployment-separation.md` (S40) as the closed D56 item and
delete this file. It exists to carry a cutover, not to become permanent guidance.
