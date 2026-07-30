<!-- spec-shape: overhaul-v1 -->

# S54 — Verification and CI parity

> New 2026-07-29. Implements the production-unblock decisions D23 (phase-blocking), D24, D25,
> D27, and D28. D23 is a prerequisite of the standing commit-and-push grant: that grant is
> conditioned on "the full local gate is green", so this suite makes the gate actually full.
>
> **2026-07-29 local slice evidence.** The app-plane portion of AC-S54-1 is complete:
> `scripts/verify.sh` and `.github/workflows/ci.yml` both invoke `npm run test:firestore`; CI
> declares Temurin 21 and an emulator-jar cache; the isolated local Firestore run under the Windows
> Node runtime passed 17 files / 59 tests; a temporary permissive `allow read, write: if true;` rule
> made the widened local gate
> fail at its Firestore step (15 files and 42 tests failed, including the named
> `Firestore security rules > requires authentication for editable reads` case); removing the
> seed restored `firestore.rules` to SHA-256
> `057273a52b04d8731da36dfb66c814dece18f56bfcae15cbd34aeab94d120628`, and the full widened
> local gate passed in 239 seconds. No remote CI run or live eval is claimed by this evidence.

**Goal.** The command the loop runs before it pushes must be the same command CI runs, and it
must cover the code paths that decide who can read what. At production-phase entry it did not;
the local AC-S54-1 slice now wires the seventeen Firestore security-rules test files into both
gate definitions, while remote CI evidence remains outstanding. No single command runs the whole
end-to-end suite; the Vendor
journey has zero end-to-end coverage; the anti-hallucination eval that `docs/spec.md` §15.2
declares deploy-blocking never calls a model; CI and `verify.sh` each run one gate the other
does not; the last open release gate is a by-hand walkthrough that S41–S48 will invalidate;
and the blocker ledger the loop reads every cycle lives on a gitignored path. End state: one
verification contract, identical locally and in CI, that runs unit + rules + end-to-end +
build, reports dependency findings without blocking, carries a recorded one-time live eval as
its anti-hallucination evidence, keeps its ledger tracked and non-secret, and closes P8 into
the S50 acceptance walkthrough. Every claim below traces to a file read while authoring this
spec or is labeled an assumption.

**What it is / how it functions.**

- **The measured entry-state gate and the first repair.** At the start of this suite,
  `scripts/verify.sh` ran, in order: `npm ci`,
  `format:check`, `lint`, `typecheck`, `test`, `verify:router-boundary`,
  `verify:falsification`, `verify:context-freshness`, `verify:spec-traceability`,
  `verify:copy-voice`, `verify:redaction`, `build`. The single `verify` job in
  `.github/workflows/ci.yml` runs the same list with two differences: it omits
  `verify:copy-voice` and it added `check:budget-guard`. Neither file ran `test:firestore`,
  `test:e2e`, `test:e2e:core`, or any dependency audit. AC-S54-1 has now added
  `test:firestore` to both definitions locally; the end-to-end, copy-voice, budget-guard, and audit
  deltas remain. Every executing slice re-derives the current delta from both files rather than
  treating this historical entry-state paragraph as live truth.
- **D23 — Firestore rules tests join both gates.** `npm run test:firestore` runs
  `scripts/run-firestore-tests.mjs`, which shells `firebase emulators:exec` for the
  `firestore` emulator on project `pmi-kc-kb-test` around
  `vitest run --config vitest.firestore.config.ts`. That config includes
  `tests/firestore/**/*.test.ts` — seventeen test files plus the shared
  `tests/firestore/emulator-target.ts` helper — covering action executions, the Action
  Registry, admin scope changes, the approval queue, communications retention, external
  action executions, the Gmail hub, lease-renewal resolutions and test workflows, maintenance
  intake, notifications, renewal decider progress, trusted publication, the Vendor portal,
  and workflow rules. The runner already chooses a free port when 8080 is occupied and
  already merges Machine/User `Path` plus `JAVA_HOME` on Windows, so the local addition is a
  one-line insertion into `scripts/verify.sh` after `npm test`. CI additionally needs a JDK
  (the emulator is a Java process) and a cached emulator jar; `firebase` itself resolves from
  the existing `firebase-tools` devDependency through the npm-script `PATH`.
- **D25 — parity plus a non-blocking audit report.** CI gains `verify:copy-voice`;
  `scripts/verify.sh` gains `check:budget-guard`; both gain `test:firestore` and the
  end-to-end runner. CI gains one reporting-only step running `npm audit --omit=dev` — the
  exact form already used as evidence in `F-WORKING-APP-V1-VERIFIER` — marked
  non-blocking so a transient advisory cannot wall the push grant. Parity stops being a
  convention: a sentinel test parses `scripts/verify.sh` and every step of every job in
  `.github/workflows/ci.yml` and fails naming any command present in one and absent from the
  other, with an explicit, short, reviewed exception list for reporting-only steps.
- **End-to-end completeness.** There are two runners and neither is complete.
  `npm run test:e2e:core` passes `--no-firestore`, so the three suites wrapped in
  `describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)` self-skip
  (`tests/e2e/approval-queue.e2e.test.mjs`, `tests/e2e/capture.e2e.test.mjs`,
  `tests/e2e/process-definitions.e2e.test.mjs`) along with the emulator-gated case in
  `tests/e2e/lease-renewal-runs.e2e.test.mjs`. `npm run test:e2e` runs inside the emulator, so
  the two suites wrapped in `describe.skipIf(process.env.FIRESTORE_EMULATOR_HOST)` self-skip
  instead (`tests/e2e/admin-migration.e2e.test.mjs`, `tests/e2e/degraded.e2e.test.mjs`). The
  `tests/e2e/README.md` claim that `npm run test:e2e` "runs every suite" is therefore false as
  written. Add one command that runs both passes and fails if either fails, and correct that
  README line.
- **Vendor journey coverage.** `tests/e2e/` contains no vendor file, while the product ships
  `app/vendor/page.tsx`, `app/vendor/sign-in/page.tsx`,
  `app/vendor/tickets/[ticketId]/page.tsx`,
  `app/api/vendor/auth/session/route.ts`, `app/api/vendor/tickets/route.ts`, and
  `app/api/vendor/tickets/[ticketId]/route.ts`. The Vendor identity boundary is exactly the
  place where a silent regression is most expensive, and three of the S40 defect-register
  entries (D-003, D-005, D-006) were Vendor lane defects. Add a Vendor end-to-end suite.
- **D24 — one bounded live eval as the declared evidence.** `docs/spec.md` §15.2 makes
  hallucination in a No-Source case, a prompt-injection bypass, a PII leak, and a generic-PM
  answer deploy-blocking hard failures, and `tests/eval/kb-eval-seed.json` carries the fifty
  labeled cases (including `Prompt Injection`, two `PII`, one `Generic PM Trap`, and four
  `No Source`). But `tests/eval/eval.test.ts` injects `evalAnswerGenerator`, a literal stub
  that returns `"Eval grounded answer."`, so today the declared gate proves only that
  `answerQuestion` routes a source state. Add `npm run eval:live` (`scripts/run-live-eval.mjs`)
  that drives the same fifty seed cases through `answerQuestion` (`lib/ask/service.ts`) with
  the real `GoogleGenAiAnswerGenerator` (`lib/llm/answer.ts`) at `gemini-2.5-flash`
  (`CHEAP_LIVE_MODEL` in `scripts/check-live-cost.mjs`), holding retrieval on the same
  deterministic fixture shapes the stub test uses so the run measures model behavior rather
  than index state. Bounds: it refuses to start unless `evaluateBudgetGuard` reports a passing
  posture and the resolved answer model equals `CHEAP_LIVE_MODEL`; it caps at fifty cases and
  one attempt per case with no retry; it is read-only (no send, no Firestore write, no Sheet
  write, `AskLogWriter` no-op). Cost bound: fifty short Flash answer calls, expected to be a few
  cents; that estimate is a bound, not spending authority, and the runner may not execute it until
  S52's non-null ceiling and alert value are verified against live enforcement.
  Per-case request/response text lands in gitignored `temp/live-eval/`; the committed evidence
  is a non-sensitive summary — run date, commit, model id, case count, per-category pass
  counts, and zero violations in the four hard-fail categories — recorded once in the ledger and
  promoted to a `docs/facts.md` `F-*` row citing this suite's acceptance ids.
- **D27 — P8 folds into the S50 acceptance walkthrough.** `docs/plan.md` §P8 records one
  remaining gate: "the signed-in by-hand human walkthrough of every macro feature, guided by
  `docs/manual-qa-walkthrough-2026-07-21.md`". That script is keyed to the pre-recalibration
  shell — its P8.1–P8.6 steps address the Gmail connection workspace, the anticipatory draft
  composer, the template workspace, and the simulated chain — all of which S41 (shell and
  vocabulary), S45 (one-card approvals), S46 (Maintenance), and S48 (Admin/Connections
  retirement) change. Rather than re-running an invalidated script, migrate its still-true
  acceptance rows into the S50 acceptance walkthrough and mark P8 closed with a pointer, so
  the release gate lives in one place that the recalibration keeps current.
- **D28 — the blocker ledger becomes tracked.** The loop's Phase-0D consolidated blocker
  ledger is `docs/temp/ui-ux-recalibration-execution-ledger-2026-07-28.md`, which cannot be
  committed: `.gitignore` lines 50–52 unignore `docs/temp/` only to re-ignore `docs/temp/*`
  except `docs/temp/README.md`. A fresh-context loop therefore cannot read the ledger it is
  instructed to depend on. Move it to the tracked path `docs/execution-ledger.md`, keep it
  program-agnostic so S51+ append to the same file, and carry its non-secret rule across as
  code rather than as a sentence: extend `scripts/check-redaction.mjs` (whose evaluator is
  already pure and unit-tested) with a content scan of the tracked ledger that fails on
  credential-shaped, token-shaped, or PII-shaped content. Repair the contradiction at move
  time: row L-019 still reads `OPEN` / `NOT_REQUIRED_FOR_CURRENT_SLICE` for the
  `notification-menu-component.test.tsx` title race, while the same document's defect register
  records the identical defect as D-011, verdict `REAL`, fixed in `7c98bf2`.
- **Four gate blind spots found while measuring the gate.** (1) `.env.example:28` ships
  `GROUNDING_CONFIDENCE_THRESHOLD=` empty; `lib/config/server.ts:70` declares
  `z.coerce.number().min(0).max(1).default(0.65)` and `readServerConfig` calls
  `EnvSchema.parse(env)` directly on the environment, so an empty string coerces to `0` — a
  valid value that passes `.min(0)` — and the grounding floor consulted at
  `lib/ask/service.ts:115` and `lib/retrieval/vertex-search.ts:203` silently disappears
  instead of defaulting to 0.65. (2) `scripts/prepare-production-env.mjs` `COPY_KEYS` is a
  fixed twenty-seven-name list while `EnvSchema` declares thirty-seven keys, and the two lists
  only partly overlap: eighteen names are common, so nineteen runtime variables are
  structurally invisible to the production-env artifact and its preflight — including
  `MAINTENANCE_INTAKE_TOKEN_SECRET`, `MAINTENANCE_INTAKE_IP_HASH_SALT`,
  `MAINTENANCE_INTAKE_DAILY_CAP`, `MARKET_COMP_PROVIDER`, `IMAGE_STORE`, `SPEECH_PROVIDER`,
  and `MODEL_PROVIDER` — and, in the other direction, nine `COPY_KEYS` names (among them
  `GMAIL_DWD_SA`, `RENEWAL_SHEET_ID`, and `RENTVINE_API_BASE_URL`) are not `EnvSchema` keys at
  all and are therefore copied with no schema validation. Every future variable is invisible by
  default too. The executing slice re-derives both counts from the two files rather than
  trusting these numbers. (3) The current Production and Demo/Test record shapes are still
  co-resident, while Firebase Admin SDK server writes bypass `firestore.rules`; Rules also cannot
  observe Cloud Run's `ENVIRONMENT_KIND` or `DATA_CONTEXT`. The enforceable target is separate
  projects/databases selected by the server descriptor plus schema/repository and
  provider-construction guards — never a fictional Rules-only environment check. (4) The D-14 vocabulary
  retirement has no automated enforcement: `scripts/check-copy-voice.mjs` is already wired
  into `scripts/verify.sh` but its `FORBIDDEN_JARGON` is only
  `["control plane", "PMI handles", "source of truth"]`, while the retired terms still render
  today — `"raw reconciliation"` in `components/lease-renewal/RenewalDesk.tsx`, `"bodyless"` in
  `app/spaces/[spaceId]/page.tsx`, `"Final-V1"` in
  `components/lease-renewal/LeaseExecutionReadiness.tsx`, `production_allowed` in
  `components/lease-renewal/LiveRenewalReview.tsx`, and `"Test data"` across five operator
  components (`components/admin/VendorAdminPanel.tsx`,
  `components/console/ConsoleLiveDataPanel.tsx`,
  `components/maintenance/MaintenanceQueue.tsx`, `components/vendor/VendorPortal.tsx`, and
  `components/vendor/VendorTestMailboxPanel.tsx`). `Test data` is retired by S40's Demo rename
  and S41's `Demo environment` plain-language map rather than by S41's four-term diagnostics
  list; the other four terms are named verbatim in that list.

- **Buildable now (app-plane).** Every local implementation item in this suite. Gate-file edits, the parity
  sentinel, the CI JDK/emulator-cache steps, the combined end-to-end runner, the Vendor
  end-to-end suite, the copy-voice surface split (daily operator surfaces versus Admin and
  Connections diagnostics), the fail-closed grounding-threshold parse, the derived `COPY_KEYS`,
  the server-owned environment/resource-boundary sentinels, the ledger move plus its content scan,
  and the P8 fold. None of these adds a system-of-record write, an autonomous send, a new external
  scope, or a `firestore.rules` change, so none carries an Action Registry or D12 gate.
- **Build to the seam (live provider).** The live eval runner is the only step that touches a
  real provider. Build it complete: budget-posture and model-id preconditions, the fifty-case
  bound, one attempt per case, gitignored raw artifacts, the non-sensitive summary writer, and
  the refusal paths. It reads a model; it sends nothing and writes no system of record. It must
  refuse before constructing the provider unless S52's ceiling and alert value are non-null and
  the read-only live posture check verifies both enforcement points.
- **Named dependencies.** The live eval requires fresh ADC and S52's non-null verified ceiling;
  neither condition is replaced
  by the retired enforcement figure or by `check:budget-guard`, which checks configuration rather than
  spend. If ADC is stale, the only auth remediation handed back is `npm run auth:session`. If the cost
  precondition is red, the loop records an S52 cost blocker and does not mislabel it as an auth problem.
  In both cases it parks the live eval and continues app-plane work. Routine application deploy, smoke,
  and exact-revision promotion follow D05 after the full gate and preflights pass; interactive auth,
  credentials, and scope grants remain owner-run.

**Open questions & assumptions.**

- _Answered 2026-07-29 (D23):_ `npm run test:firestore` joins CI and `scripts/verify.sh` now,
  as a prerequisite of the standing push grant. It is phase-blocking: no other slice in this
  phase merges before its local gate and first remote CI execution are green.
- _Answered 2026-07-29 (D24):_ one bounded live eval run is authorized as a capability; its
  expected Flash cost does not create spending authority. It remains parked until ADC is fresh and
  S52 has a non-null ceiling and alert value verified against live enforcement. Its recorded summary
  is the gate evidence only after those preconditions pass.
- _Answered 2026-07-29 (D25):_ CI is brought to parity with `scripts/verify.sh` and gains a
  non-blocking `npm audit` report.
- _Answered 2026-07-29 (D27):_ the P8 walkthrough folds into the S50 acceptance walkthrough and
  P8 closes.
- _Answered 2026-07-29 (D28):_ the ledger moves to a tracked `docs/` path and keeps its
  non-secret rule.
- _Assumption:_ the tracked ledger path is `docs/execution-ledger.md` — undated and
  program-agnostic, so S51+ append rather than forking a second ledger. Recorded as a `Q-`/`A-`
  row in `docs/facts.md` at build time; the executing slice may choose an equivalent tracked
  `docs/` path if it updates every pointer in one change.
- _Assumption:_ the live eval holds retrieval on the deterministic fixture shapes already used
  by `tests/eval/eval.test.ts` rather than querying Vertex AI Search, so the run isolates model
  behavior, costs less, and cannot vary with index state. A live-retrieval variant is a
  separate, separately budgeted run.
- _Assumption:_ the copy-voice surface split treats `app/admin/**` and `app/connections/**`
  plus their components as the allowed diagnostics home for retired vocabulary, matching S41's
  "live only in expandable Connections/Admin diagnostics" rule. The exact allowlist is the
  executing slice's to derive from S41 and pin in a test.
- _Assumption:_ the empty-string fix is fail-closed rejection with a named error, not silent
  substitution of 0.65, because a Production start on a silently defaulted safety floor is the
  failure mode this suite exists to remove. The `.env.example` line gets the documented value.
- _Open:_ whether the combined end-to-end command joins CI as its own job or stays local-only
  on the first pass. Default for this suite: it joins as a separate CI job, and the parity
  sentinel compares the union of all job steps against `verify.sh` so job splitting never
  reads as a parity break. Recorded as a `Q-` row at build time.
- Decision-complete: no owner product choice is open. A builder can implement every local item here
  without another question and park the live eval without blocking later app-plane slices.

**Cross-product impacts.**

- Edited: `scripts/verify.sh`, `.github/workflows/ci.yml`, `package.json` scripts,
  `scripts/run-e2e-tests.mjs`, `tests/e2e/README.md`, `scripts/check-copy-voice.mjs`,
  `scripts/check-redaction.mjs`, `scripts/prepare-production-env.mjs`, `lib/config/server.ts`,
  `.env.example`, `docs/plan.md` (P8 closure), `docs/loop-state.md` and
  `docs/status.md` (ledger pointers), and
  `docs/meta-prompts/ui-ux-recalibration-unattended-loop.md` (the §0D ledger path).
- New: `scripts/run-live-eval.mjs`, `docs/execution-ledger.md` (moved, tracked),
  `tests/e2e/vendor.e2e.test.mjs`, and unit tests
  `tests/unit/gate-parity.test.mjs`, `tests/unit/live-eval-runner.test.mjs`,
  `tests/unit/environment-record-classifier.test.ts`, and
  `tests/unit/provider-construction-boundary.test.ts`. Extends the
  existing `tests/unit/check-copy-voice.test.mjs`, `tests/unit/check-redaction.test.mjs`, and
  `tests/unit/prepare-production-env.test.mjs`.
- Deleted on move: `docs/temp/ui-ux-recalibration-execution-ledger-2026-07-28.md` (an ignored
  working file, so nothing leaves git history) once every pointer resolves to the tracked path.
- Interacts with S40 (`data_mode` classification: this suite pins the separate-resource,
  server-descriptor, schema/repository, and provider-construction boundary S40 builds), S41 (this
  suite supplies the automated enforcement for the D-14 vocabulary S41 defines), S49 (the
  retirement suite depends on a gate that actually runs rules and end-to-end tests before it
  deletes anything), S50 (receives the folded P8 walkthrough rows), and S52 (this suite runs
  the live eval only after the production cost ceiling S52 defines is non-null and verified, and
  never restates or substitutes a ceiling of its own).
- **Rules boundary.** `firestore.rules` remains protected under D12 and unchanged by AC-S54-9.
  Existing emulator tests still run in every gate, but no completion claim suggests Rules can
  constrain Admin SDK writes or infer a Cloud Run environment.
- Supersedes the P8 release-gate claim in `docs/plan.md` §P8 and the "runs every suite" line in
  `tests/e2e/README.md`. Both get a `docs/facts.md` Supersede Log marker on completion, along
  with any active claim that the verification gate covers Firestore rules.

**Adversarial acceptance checks.**

- **AC-S54-1** — `bash scripts/verify.sh` and the CI workflow both execute
  `npm run test:firestore`, and a deliberately permissive `allow read, write: if true;` clause
  seeded into `firestore.rules` makes both exit non-zero at that step with a named failing
  rules test, not a skip and not a pass. Removing the seeded clause returns both to green.
  _Local status 2026-07-29:_ complete with the 17-file / 59-test green run, the 15-file /
  42-test permissive-rule failure, exact rule restoration hash, and 239-second widened gate
  recorded at the top of this spec. The CI workflow is wired, but remote execution evidence is
  still pending and is not inferred from the local run. _Verify:_ `npm run test:firestore`;
  `bash scripts/verify.sh`.
- **AC-S54-2** — Deleting any one command from `scripts/verify.sh`, or any one step from any
  job in `.github/workflows/ci.yml`, fails `npm test -- tests/unit/gate-parity.test.mjs` with
  the missing command named in the assertion message; the two files agree on every command
  outside a short reviewed reporting-only exception list, and the test reads both files rather
  than a hard-coded copy of the list. _Verify:_ `npm test -- tests/unit/gate-parity.test.mjs`.
- **AC-S54-3** — A CI run whose `npm audit --omit=dev` step reports findings still reports the
  job as successful, and the audit output is present in the job log; a real gate failure in the
  same run still fails the job. _Verify:_ `npm run lint`,
  `npm test -- tests/unit/gate-parity.test.mjs`;
  inspect one CI run's step outcomes.
- **AC-S54-4** — One command runs both end-to-end passes, and across the combined run zero
  suites report "skipped" for an environment reason: `tests/e2e/approval-queue.e2e.test.mjs`,
  `tests/e2e/capture.e2e.test.mjs`, and `tests/e2e/process-definitions.e2e.test.mjs` execute in
  the emulator pass, and `tests/e2e/admin-migration.e2e.test.mjs` and
  `tests/e2e/degraded.e2e.test.mjs` execute in the no-emulator pass. A failure in either pass
  fails the command. `tests/e2e/README.md` no longer claims a single command runs every suite.
  _Verify:_ the combined end-to-end command; `npm run test:e2e:core`.
- **AC-S54-5** — A Vendor end-to-end suite exists and observes the boundary, not the
  implementation: an authenticated Vendor requesting an internal route receives a refusal
  rather than the internal shell; `GET /api/vendor/tickets/{id}` for a ticket assigned to a
  different vendor returns a not-found or forbidden status and no ticket body; a disabled
  vendor's session request is refused; and a Vendor principal missing any one of the required
  `vendor` / `vendor_id` / `data_mode` claims is refused. _Verify:_ the combined end-to-end
  command; keep `tests/firestore/vendor-portal.rules.test.ts` green.
- **AC-S54-6** — `npm run verify:copy-voice` fails, naming file and line, when a retired D-14
  term (`raw reconciliation`, `bodyless`, `Final-V1 external execution`, `persistent Test`,
  `production_allowed`, `Test data`) appears in a daily operator surface, and passes when the
  same term appears in an Admin or Connections diagnostics surface on the reviewed allowlist.
  The current occurrences are relocated or renamed so the gate is green at HEAD. _Verify:_
  `npm run verify:copy-voice`; `npm test -- tests/unit/check-copy-voice.test.mjs`.
- **AC-S54-7** — `readServerConfig` with `GROUNDING_CONFIDENCE_THRESHOLD=""` throws a named
  configuration error instead of returning `groundingConfidenceThreshold: 0`; with the variable
  absent it returns `0.65`; and `.env.example` ships the documented default rather than an
  empty assignment. _Verify:_ `npm test -- tests/unit/server-config.test.ts`;
  `npm run typecheck`.
- **AC-S54-8** — `COPY_KEYS` in `scripts/prepare-production-env.mjs` is derived from the
  runtime configuration schema rather than hand-listed: adding a key to `EnvSchema` in
  `lib/config/server.ts` without classifying it fails
  `npm test -- tests/unit/prepare-production-env.test.mjs` with the unclassified key named, and
  the produced artifact still contains no key in `FORBIDDEN_OUTPUT_KEYS`. _Verify:_
  `npm test -- tests/unit/prepare-production-env.test.mjs`.
- **AC-S54-9** — The Live/Demo boundary is enforced by resource isolation plus server-owned
  classification, not by an impossible Firestore Rules claim. Demo and Production resolve distinct
  project/database identifiers before any Admin SDK client is constructed; collision or an unknown
  descriptor refuses. Server repository/schema guards reject missing, unknown, or descriptor-
  contradictory `data_mode`, and provider-construction guards prevent Demo or Live-read-only from
  acquiring Live effect clients. Firestore Rules continue to validate only actual client-SDK
  requests inside the selected database; the spec explicitly records that Admin SDK writes bypass
  Rules and therefore never claims Rules can read Cloud Run's environment. _Verify:_
  `npm test -- tests/unit/environment-descriptor.test.ts`,
  `npm test -- tests/unit/environment-record-classifier.test.ts`,
  `npm test -- tests/unit/provider-construction-boundary.test.ts`,
  `npm run test:firestore`.
- **AC-S54-10** — One live eval run is recorded as evidence: `npm run eval:live` executes at
  most fifty cases with exactly one model attempt per case, refuses to start when ADC is stale,
  S52's ceiling or alert value is null, the live enforcement check is unverified or drifted, the
  budget posture check fails, or the resolved answer model is not `gemini-2.5-flash`, writes per-case
  request and response text only under gitignored `temp/live-eval/`, and emits a summary
  reporting zero violations across the `Prompt Injection`, `PII`, `Generic PM Trap`, and
  `No Source` categories. The run performs no send, no Firestore write, and no Sheet write.
  _Verify:_ `npm test -- tests/unit/live-eval-runner.test.mjs` for the bounds and refusals;
  one recorded `npm run eval:live` run for the evidence summary.
- **AC-S54-11** — `git ls-files docs/execution-ledger.md` lists the file, no tracked file
  references `docs/temp/ui-ux-recalibration-execution-ledger-2026-07-28.md`, and
  `npm run verify:redaction` fails when a credential-shaped, token-shaped, or PII-shaped string
  is seeded into the tracked ledger and passes with it removed. In the moved ledger, the
  `notification-menu-component.test.tsx` row and defect-register row D-011 report the same
  state: closed, fixed in `7c98bf2`. _Verify:_ `npm run verify:redaction`;
  `npm test -- tests/unit/check-redaction.test.mjs`.
- **AC-S54-12** — `docs/plan.md` §P8 records no open gate and points to the S50 acceptance
  walkthrough; every still-true P8 acceptance row appears there; and no tracked document
  instructs a reader to execute `docs/manual-qa-walkthrough-2026-07-21.md` as a release gate.
  _Verify:_ `npm run verify:context-freshness`; `npm run verify:spec-traceability`.
- **AC-S54-13** — The full gate is green end to end at the completing commit:
  `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run test:firestore`, the combined end-to-end command, `npm run verify:router-boundary`,
  `npm run verify:falsification`, `npm run verify:context-freshness`,
  `npm run verify:spec-traceability`, `npm run verify:copy-voice`, `npm run verify:redaction`,
  `npm run check:budget-guard`, and `npm run build` all pass; keep the spec-shape,
  copy-voice, redaction, budget-guard, environment-descriptor, and prepare-production-env
  sentinels green. _Verify:_ `bash scripts/verify.sh`.

**Forbidden actions / hard gates.** Never weaken, skip, or exception a check to make the gate
green; a red gate is repaired or the slice stops, and deleting a step to satisfy the parity
sentinel is itself a falsification. No autonomous CLIENT-facing send — internal-staff
notifications may auto-send per `D-AUTOMATION-LINE`, and the live eval sends nothing at all.
The generic non-workflow `gmail.message.send` stays Registry-closed and this suite flips no
`production_allowed` gate. No personal account in any auth path; the eval runs under managed
credentials on the `pmikcmetro.com` identity only. No secrets, PII, customer content, or
guessed endpoint in git: the eval's raw per-case text stays in gitignored `temp/live-eval/`,
only the non-sensitive summary is committed, and moving the ledger to a tracked path must not
carry one credential, token, provider payload, customer record, or personal detail across —
the new content scan enforces that as code, not as a sentence. Every live effect is
one-attempt, idempotent, receipted, and reversible; every client-facing send and every
system-of-record write stays human-confirmed. Routine application deploy, smoke, and exact-revision
traffic promotion follow D05 after the full gate and preflights pass; interactive auth,
credential/scope grants, IAM/billing changes, and destructive operations stay owner-run. The live eval
is one bounded run at `gemini-2.5-flash` with a fifty-case cap, no retries, and no re-run without a
fresh ADC check plus a non-null S52 ceiling and alert value verified against live enforcement.
`check:budget-guard` is a separate configuration check and cannot substitute for that cost
precondition. Under the S40 target, Production accepts Live data only; the eval
and every test in this suite run against Demo or emulator data and never read or mutate
Production records. Suite-specific hard stop: `npm run test:firestore` must be present in BOTH
`scripts/verify.sh` and `.github/workflows/ci.yml` before any other slice in this phase merges
— that is what the standing commit-and-push grant is conditioned on, and shipping any other
work first is a falsification of this suite.

**Ordered prompt sequence.**

1. _Discovery:_ read `scripts/verify.sh`, `.github/workflows/ci.yml`, `package.json` scripts,
   `scripts/run-firestore-tests.mjs`, `scripts/run-e2e-tests.mjs`, `vitest.firestore.config.ts`,
   `vitest.e2e.config.ts`, and every `describe.skipIf` in `tests/e2e/`. Write down the measured
   gate delta and the skip matrix; do not trust this spec's paragraph without re-deriving it.
2. _Build (phase-blocking, ship first):_ add `npm run test:firestore` to `scripts/verify.sh`
   and to CI with a JDK step and an emulator-jar cache. Prove it can fail by seeding a
   permissive rule, then remove the seed (AC-S54-1). Nothing else in this phase merges before
   this step is green on both.
3. _Build:_ close the parity delta — `verify:copy-voice` into CI, `check:budget-guard` into
   `scripts/verify.sh`, the non-blocking `npm audit --omit=dev` report — and land
   `tests/unit/gate-parity.test.mjs` so parity is enforced rather than remembered
   (AC-S54-2, AC-S54-3).
4. _Build:_ add the combined end-to-end command that runs both passes and fails if either
   fails, correct the `tests/e2e/README.md` claim, and add the Vendor end-to-end suite covering
   internal-route refusal, cross-vendor ticket isolation, disabled-vendor refusal, and the
   incomplete-claim-tuple refusal (AC-S54-4, AC-S54-5).
5. _Build:_ close the four blind spots — the D-14 vocabulary enforcement with its
   Admin/Connections allowlist, the fail-closed grounding-threshold parse plus the `.env.example`
   value, the derived `COPY_KEYS`, and the resource-isolated/server-owned environment record boundary
   (AC-S54-6 through AC-S54-9). Preserve the existing Firestore Rules suite, but do not invent a Rules
   condition for Admin SDK writes or Cloud Run environment values that Rules cannot observe.
6. _Build:_ move the ledger to `docs/execution-ledger.md`, repair the L-019 / D-011
   contradiction in the same change, update every pointer in `docs/loop-state.md`,
   `docs/status.md`, and `docs/meta-prompts/ui-ux-recalibration-unattended-loop.md`, and extend
   `scripts/check-redaction.mjs` with the tracked-ledger content scan plus its unit test
   (AC-S54-11).
7. _Build:_ land `scripts/run-live-eval.mjs` with its preconditions, bounds, refusals, and
   summary writer, and prove every refusal path with a stubbed provider before any live call
   (AC-S54-10, unit half).
8. _Verify, auth first:_ run `npm run preflight:adc`. If it is red, hand back only
   `npm run auth:session` as the auth remediation, park the live eval, and continue every app-plane
   item. If auth is green, separately require S52's ceiling and alert value to be non-null, run the
   read-only live enforcement check, and run `npm run check:budget-guard`. A null, unverified,
   drifted, or posture-red cost result is a budget blocker, not an auth blocker: record it, do not
   suggest reauthentication as its remedy, park the eval, and continue other local work. Only when
   both classes of precondition are green may the loop run `npm run eval:live` exactly once, confirm
   zero violations in the four hard-fail categories, and record the non-sensitive summary in
   `docs/execution-ledger.md` (AC-S54-10, live half).
9. _Build:_ fold the still-true P8 acceptance rows into the S50 acceptance walkthrough, close
   `docs/plan.md` §P8 with a pointer, and record the Supersede Log markers for the P8 gate
   claim and the `tests/e2e/README.md` claim (AC-S54-12).
10. _Verify:_ run AC-S54-1 through AC-S54-13 and explicitly falsify each — delete a gate step
    and confirm the parity sentinel names it; seed a permissive rule and confirm the gate goes
    red; seed a retired vocabulary term in a daily surface and confirm copy-voice fails; set
    `GROUNDING_CONFIDENCE_THRESHOLD=""` and confirm startup refuses; add an unclassified env
    key and confirm the production-env test names it; collide Demo and Production resource ids,
    bypass the UI with a missing/contradictory `data_mode`, and confirm the server boundary refuses
    before Admin SDK/provider construction; seed a secret-shaped string in the tracked ledger and
    confirm redaction fails.
11. _Context update:_ promote the fully shipped work to a `docs/facts.md` `F-*` row (for example
    `F-GATE-PARITY`) only after AC-S54-1 through AC-S54-13 and remote CI evidence are complete. Add
    the live-eval evidence row citing AC-S54-10 only after the run
    actually occurs; until then record app-plane completion and the distinct auth, cost, or protected
    dependency without collapsing them. Record the `Q-`/`A-` rows for the ledger path and the
    end-to-end CI job placement, add the Supersede Log markers, and advance `docs/loop-state.md`.

**Deletion/merge recommendation.** KEEP as the durable verification contract for the live
production phase; every later suite's "full gates pass" line resolves to the command list this
file fixes. MERGE nothing into it — the per-suite gate lists in S40 through S53 stay as they
are and simply inherit the widened gate. DELETE the disposable
`docs/temp/verification-and-ci-parity-plan.md` packet once its outcomes are recorded here, in
`docs/facts.md`, and in `docs/execution-ledger.md`; the moved ledger itself is durable and is
never deleted.
