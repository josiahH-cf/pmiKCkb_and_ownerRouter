<!-- spec-shape: overhaul-v1 -->

# S54 — Verification and continuous assurance

> Status: Active verification contract with an unreleased S51 assurance remediation. Canonical
> local/CI lanes remain current; the new deterministic checks do not become deployed evidence until
> their exact revision passes the managed live gates.

**Goal.**

Prevent local, CI, candidate, and promoted-revision results from disagreeing silently, while keeping
all automated CI evidence fixture-only, bounded, deterministic, and free of production data.

**What it is / how it functions.**

The canonical verifier continues to cover clean install, format, lint, typecheck, unit, Firestore,
router, falsification, context, spec, copy, redaction, budget, and production build. Core E2E remains
a separately bounded lane. On WSL Windows mounts, the unit lane may use its disposable native-Linux
worktree and lockfile-keyed dependency cache, but it cannot omit a tracked test or copy ignored
client/scratch material.

S54 adds deterministic coverage for the S51 assurance harness:

- the Admin/Editor route manifests are complete, have unique symbolic keys, and encode only current
  route/guard behavior;
- managed-browser startup is order-tested: persistent context launches offline with Service Workers
  blocked and background networking disabled, the GET/HEAD firewall installs, restored pages close,
  surviving workers fail closed, and only then may the context go online;
- the request firewall accepts GET/HEAD case-insensitively and refuses every other method, including
  when the diagnostic callback itself fails;
- each browser signal maps to one symbolic diagnostic count without retaining message, URL, body, or
  stack;
- immutable revision fixtures prove the exact Cloud Run resource and SHA-256 configuration
  fingerprint, include future runtime fields, exclude only output-only observation fields, and refuse
  a missing/stale/mismatched digest before a live source read;
- revision-Sheet fixtures require exactly one configured Sheet id, target-project service account,
  and managed delegation subject, then require exact `spreadsheetId` echoes from evaluated and
  FORMULA reads;
- exact evidence schemas reject unknown, missing, malformed, identity-bearing, browser-content, and
  customer-value fields;
- reconciliation fixtures independently project RentVine, paired Sheet values/FORMULA links, exact
  `live-review` current-rent decisions, and tracked-incomplete progress; they separately validate
  app-owned S72 process/current-step/waiting markers and deterministically map them to guidance, then
  cover exact match,
  missing/unexpected/duplicate rows, malformed or duplicate progress, wrong independent
  disposition/retention, missing/malformed S72 markers, wrong rent verification/overall/blocked/
  resolution state, wrong
  blocker/action/link cardinality, invalid destinations, partial/unavailable or stale application
  source state, and source/decision/progress change between before and after reads;
- release fixtures cover wrong revision, traffic drift, role failure, browser diagnostics,
  reconciliation mismatch, monitoring unavailability, candidate 5xx, unresolved live effects,
  incomplete or single-checkpoint observation, exact five-minute success with two checkpoints and
  already complete monitoring, minute-five through minute-seven ingestion grace, minute-seven hard
  failure, exact-predecessor rollback, and rollback-only legacy lease-link compatibility;
- receipt fixtures cover strict exact-key schemas, expiry, origin/commit/revision/configuration/
  predecessor binding, exclusive create-only paths, aggregate candidate gating, promotion readback,
  durable persistence, and compensating predecessor restoration after every post-traffic failure;
- command-contract tests prove every production runner refuses without `--live`, an exact HTTPS Cloud
  Run origin/commit/revision/configuration fingerprint, and exact Admin and Editor candidate-origin
  managed profile directories outside the repository.
- environment/cleanup tests prove live reconciliation refuses emulator, key-file, wrong project/
  database, and non-managed ADC state before source reads, and that deadline expiry aborts requests,
  closes browser/Firestore resources, and suppresses late evidence.

CI runs only pure and fixture-backed tests. It never receives a Firebase cookie, managed browser
profile, provider secret, Gmail body, customer value, monitoring operator address, or live project
credential. Live canaries, reconciliation, monitoring reads, the five-minute closed interval with
its bounded two-minute ingestion grace, and any traffic rollback are release gates run from a managed
local operator context after exact-SHA CI.

The local fixture harness uses a production build or deterministic page doubles with Admin and
Editor roles. It injects one failure at a time and proves no diagnostic class is ignored. Browser
timeouts, server startup, emulator lifecycle, polling, and teardown remain bounded. Fixture evidence
uses invented non-production shapes only and is never presented as proof of live source truth.

Any change to S51 route inventory, browser-startup boundary, evidence schema, revision fingerprint,
Sheet binding, diagnostic taxonomy, source/decision oracle, rendered semantic markers,
reconciliation counts, receipt schema/hand-off, monitoring fields, observation timing, or rollback
predicates must update
both the implementation tests and local/CI inventory in the same commit. The live release step
consumes the exact committed harness that CI tested.

**Open questions & assumptions.**

No product question remains open. CI intentionally cannot prove managed authentication, provider
availability, deployed configuration, monitoring delivery readiness, or live data parity. Those are
explicit S51 managed-runtime gates, not optional omissions and not reasons to inject secrets into CI.

**Cross-product impacts.**

Every merge and release; S51 production assurance; local WSL execution; GitHub Actions; Firestore
emulator and core E2E; browser tooling; source-reconciliation fixtures; and documentation/redaction
gates. It does not change product behavior, production records, action authority, auth claims, or
deployment configuration.

**Adversarial acceptance checks.**

- **AC-S54-1** — Local and CI command inventories remain parity-tested whenever an automated gate is
  added, removed, or renamed.
- **AC-S54-2** — Unit, Firestore, E2E, browser, and assurance fixture setup/teardown are time-bounded
  and fail with a symbolic error instead of hanging or truncating output.
- **AC-S54-3** — Candidate and post-promotion runners refuse without exact version identity and the
  captured immutable configuration fingerprint even when every fixture test is green.
- **AC-S54-4** — The complete unit lane remains under ten minutes on the supported WSL workspace;
  acceleration cannot omit a file, disable per-file isolation, or copy ignored client material.
- **AC-S54-5** — Manifest tests cover every Admin/Editor key exactly once per role and prove Editor
  Admin-route denials remain negative assertions.
- **AC-S54-6** — Startup-order tests prove the managed context cannot go online before the GET/HEAD
  firewall is installed and Service Workers are blocked/absent; the firewall and diagnostic matrix
  make every non-read method and each defined browser failure independently fatal.
- **AC-S54-7** — Evidence tests attempt unknown fields and representative email, URL/query, DOM,
  console, stack, cookie/token, provider-body, and customer-value payloads; none can serialize.
- **AC-S54-8** — Reconciliation fixtures independently falsify
  RentVine/Sheet/`live-review`/tracked-progress source joins, Sheet response identity, source-currency
  markers, and independent disposition/retention; they separately reject malformed S72 process
  markers and verify their exact status/blocker/action/link mapping. Before/after source drift and
  changed/unavailable inputs are inconclusive and never treated as empty success, while a stable
  application contradiction is fatal. Fixtures do not represent S72 markers as independent
  Gmail/policy/packet source corroboration.
- **AC-S54-9** — Observation fixtures cannot pass at 299,999 ms and pass at 300,000 ms only with exact
  revision/traffic/configuration, both role manifests, matched reconciliation, complete corroborated
  monitoring, two successful full checkpoints, zero candidate 5xx, and zero unresolved live effects.
  One checkpoint remains observing at minute five and requires rollback at minute seven. With monitoring configuration
  ready, missing metric/log corroboration remains `observing` at 300,000 and 419,999 ms and is
  `rollback_required` at 420,000 ms; unready configuration fails immediately.
- **AC-S54-10** — A rollback result contains one distinct exact predecessor and no command, shell
  interpolation, latest alias, or inferred revision. Fixtures prove the legacy workspace-link
  fallback is available only in `phase=rollback`; candidate and post-promotion phases still require
  the new eligibility marker.
- **AC-S54-11** — Production command tests prove missing `--live`, in-repository profiles, malformed
  targets/fingerprints, or other statically missing managed inputs refuse before browser, source,
  monitoring, or cloud calls. A supplied profile without exact candidate-origin authentication fails
  the live role manifest and cannot authorize promotion.
- **AC-S54-12** — Exact-SHA CI and the canonical verifier pass before live assurance; managed live
  results are recorded separately and never backfilled by fixtures.
- **AC-S54-13** — Command and filesystem fixtures prove production promotion accepts only one fresh
  aggregate candidate receipt and a new exclusive promotion-receipt path. Injected promotion
  readback, receipt build/write/fsync, rollback command, and rollback-readback failures prove that
  traffic is either still on the predecessor, restored and verified there, or reported as unverified;
  no path reports a safe successful promotion without its durable receipt.
- **AC-S54-14** — Observation fixtures accept only the bound promotion receipt and reject caller-
  supplied predecessor or promotion time, stale receipts, and any mismatch in exact release
  coordinates.
- **AC-S54-15** — Receipt fixtures prove one candidate id can be claimed once, every traffic attempt
  permanently consumes it, pending/failed promotion artifacts never parse as final receipts, and an
  erroring traffic command still restores the exact predecessor. The recorded observation start is
  before invocation and independent from the later verification time.
- **AC-S54-16** — Timing fixtures reject an initial checkpoint outside the immediate grace and a
  second checkpoint before minute five, including two late back-to-back green snapshots. Recovery
  fixtures require the complete receipt-bound predecessor baseline after restoration.
- **AC-S54-17** — Environment and cancellation fixtures inject emulator/key-file/wrong-principal
  state, hanging browser launch, late-created context, Firestore read, monitoring request, and child
  work; each refuses or terminates within its exact deadline with no surviving handle or evidence.

**Forbidden actions / hard gates.**

No skipped gate by environment; no unbounded browser/emulator/poll wait; no browser-online gap before
the firewall; no Service Worker bypass; no success on partial, stale, or truncated output; no CI
production session/secret/profile; no networked live test in CI; no golden file containing client
data; no screenshot/DOM/raw diagnostic fixture presented as evidence; no performance shortcut that
changes inventory; no monitoring wait beyond minute seven; and no local fixture result labeled a live
canary.

**Ordered prompt sequence.**

1. Add fail-first pure tests for the S51 manifest, offline-first browser startup/firewall, diagnostic
   classifier, evidence schema, immutable revision/Sheet binding, independent source/decision
   reconciliation, observation, and rollback state machine.
2. Add bounded command-contract tests proving all live runners refuse before I/O without exact
   managed inputs.
3. Run focused assurance tests and typecheck; inject each browser/reconciliation/release failure
   independently.
4. Run the complete unit/Firestore/policy/build inventory and core E2E; verify local/CI parity.
5. Require exact-SHA CI before handing the tested harness to S51 managed runtime execution.
6. Record fixture and live evidence as separate classes; never substitute one for the other.

**Deletion/merge recommendation.**

Keep as the sole S54 verification contract. Fold all assurance fixture tests into the normal unit
inventory; do not create a privileged CI lane with production credentials.
