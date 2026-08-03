<!-- spec-shape: overhaul-v1 -->

# S55 — Production service rename and stale identifier cleanup

> New 2026-08-01 (owner decision, Q&A round 2). Implements D56's rename of the Production Cloud Run
> service from `pmi-kc-kb-demo` to `pmi-kc-app`, which S40 listed as a cutover item but never scoped.
> The owner directed the rename be done AND that hardcoded/stale identifiers be researched
> recursively first, anticipating that stale values would make it tricky. That research is complete
> and is recorded below; it found one load-bearing runtime coupling that would have failed closed,
> and one dead legacy bucket still referenced by a tracked manifest.

**Goal.** The service that serves real client data stops being named `pmi-kc-kb-demo`. Stage one is
complete: `pmi-kc-app` serves Production at the canonical URL, its exact hosts are authorized,
Pub/Sub and monitoring target it, and the old service remains only as the rollback target. Stage two
retires that rollback service after S56 and a recorded rollback rehearsal. Sign-in and vendor
lifecycle actions must continue working throughout. Separately, identifiers belonging to the retired
`pmikckb-test` project stop being carried in tracked files as though they were live.

**What it is / how it functions.**

- **The load-bearing coupling — `lib/vendor/live-lifecycle-runtime.ts`.** The former single-host
  constant is now an exact set accepting the old and new Production hosts. Tests prove both accepted
  hosts and reject an unrelated `run.app` host. This widening landed before promotion, so the vendor
  lifecycle gates did not fail closed during the rename.
- **Two-stage, never a flag day.** Stage one widens every allowlist and default to accept both names
  and stands up `pmi-kc-app` alongside the existing service, verified at its zero-traffic tag URL via
  the S40 `npm run release` path. Stage two retires `pmi-kc-kb-demo` only after the new service has
  served real traffic and a rollback has been rehearsed. This follows the standing rule that nothing
  is deleted big-bang: hide and instrument first, delete only with consumer, route, test, and
  rollback proof.
- **Firebase authorized domains were a hard prerequisite.** The live Identity Toolkit config now
  contains both Cloud Run URL forms for `pmi-kc-app`; both old-service forms remain during stage two.
  The values were read back before promotion rather than inferred.
- **`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` is not affected.** It resolves to
  `pmi-kc-kb-prod.firebaseapp.com`, which is project-derived and survives the rename. Verified live
  on the running revision, so it is explicitly out of scope rather than merely assumed safe.
- **Ops and monitoring defaults moved in stage one.** Deploy, rollback rehearsal, cutover report,
  operator entrypoints, and the monitoring manifest all name `pmi-kc-app`; pinned tests keep them
  from drifting back to the retired name.
- **Dead legacy bucket retired.** The former `pmikckb-test` source manifest is no longer presented as
  a live catalog, and readiness coverage pins that retirement.
- **`DEMO_VALUE_PATTERNS` is correct and stays.** `scripts/preflight-production-cutover.mjs:12`
  denylists `pmikckb-test`, `lease-renewals-686407`, `800237451321`, and `cherrybridge.ai`. It does
  NOT denylist the substring "demo", so the current `pmi-kc-kb-demo` URL does not trip it. This was
  checked explicitly because a preflight that rejected the live Production URL would be a latent
  blocker; it does not.

Stage-one implementation and promotion are complete. Stage two is buildable without an owner
dependency: after S56 is green and deployed, run the print-only rollback plan with the exact serving
and prior `pmi-kc-app` revisions, execute and verify candidate → prior → candidate traffic, then
delete the old service and read back its absence. The standing cloud-automation grant covers those
steps.

**Open questions & assumptions.**

All formerly open S55 questions are resolved; the current configuration facts are:

- The live service readback proves the canonical legacy-form URL is
  `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`; both actual URL forms are authorized.
- The earlier sender refusal is resolved by owner-supplied managed configuration. It is not an open
  S55 dependency.
- The Gmail push endpoint and OIDC audience both name the new canonical URL and were read back after
  the stage-one flip.
- Production release configuration is merged from `.env.production.local`, not `.env.local`. The
  release path's own `--plan-only` output is the authority for proving `APP_BASE_URL` and
  `GMAIL_PUBSUB_AUDIENCE` reached the merged map; neither environment file is edited to clear a gate.
- The Friday update carries the one-time address-change note, so an unknown external bookmark is not
  an implementation blocker. The old host is deliberately retired only after rollback proof.

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
- **AC-S55-4** — `pmi-kc-app` was deployed with `--no-traffic`, verified at its exact tag, promoted by
  exact revision, and read back serving 100 percent while `pmi-kc-kb-demo` remained available as the
  independent rollback service.
- **AC-S55-5** — `infra/monitoring/manifest.mjs` targets the new service, and a test asserts no alert
  policy references a service name that no longer exists, so monitoring cannot go silently quiet.
- **AC-S55-6** — Every ops script default (`deploy`, `rehearse-rollback`, `build-cutover-report`, both
  `demo-operator` entrypoints) names `pmi-kc-app`, with tests pinning each.
- **AC-S55-7** — `docs/source-corpus/demo-live-source-manifest.json` is marked retired in place with
  its dead bucket named, or removed with its consumer updated. Either way a test or the readiness
  script proves no tracked manifest presents a 404 bucket as a live catalog.
- **AC-S55-9** — stage two is runnable without further owner input: `npm run rehearse-rollback`
  executes against `pmi-kc-app`, its result is recorded, and only then is `pmi-kc-kb-demo` deleted.
  The old service's deletion is the LAST step of the whole programme, after S56 has emptied the Test
  lane, so a rollback target still exists throughout the riskiest work.
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

**Deletion/merge recommendation.** KEEP for acceptance traceability. After stage two, the current
deployment state is also summarized in S40 and the fact ledger; this file remains the declaration
site for `AC-S55-*` and the ordered cutover evidence.
