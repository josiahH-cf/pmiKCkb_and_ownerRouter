<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: application-usability-reliability-2026-10 -->

# S168 — Measured application latency and reliability repairs

> Original October 4 authoring checkpoint: READY — finalized owner-accepted F01 of batch 005. This historical label does not start work or describe the delivered November 3 A-05 follow-up below.

**Goal.**

Remove measured avoidable waiting and unreliable completion across existing workflows without trading away source freshness, isolation or effect safety.

**Current state / intended end state.**

Current: Shared pages orchestrate server reads; the desk and assistant share loadRenewalAssistantSource, operational context memoizes reads within an execution, and model interpretation has a bounded fallback. Initial live page inspections took different amounts of time but were single end-to-end samples including inspection overhead, not performance benchmarks. No specific backend bottleneck or universal latency promise is established.

Required end state: A comparable before/after baseline identifies and repairs actual repeated work, serial waits, expensive rendering and unreliable read completion. Fast acknowledgment and service completion are measured separately.

The 2026-10-04 guarded Admin inspection read the canonical application's version as e106a88a50d541b4a012111019b09c2183f6ce20 / pmi-kc-app-rmusp7ehl-7ea8703905ca and inspected initial Dashboard, desk, lease workspace, Communications, Connections, and Admin screens. Its completed pass recorded zero mutation attempts. This establishes those observed presentations only; it does not establish failure handling, persistence, AI inference, all roles, accessibility certification, or a new release. Earlier failed access attempts remain failed. Customer values, raw reports, captures, profiles, and credentials remain outside Git.

**Actors and entry conditions.**

Staff using navigation, tables, panels, AI, autosaves and supported action controls; Admin diagnostics remain private. Performance work uses existing authorized data services and test workloads.

**What it is / how it functions.**

This is one finalized change in batch 005, handoff application-usability-reliability-2026-10, registered in the canonical suite index. The owner accepted the recommendations on 2026-10-04 and requested specifications plus a launch prompt; authoring does not start execution. The future launch instruction selects only this program. Read the program contract in README.md and AGENTS.md; completed, superseded, and unrelated suites remain baselines rather than queued work.

Use the current owners below as verified starting points, then discover every actual consumer within this scope. They are not a frozen selector allowlist. The architecture obligations define the bounded change; the behavior outcomes define the observable success, failure and recovery. Before implementation, bind each trace row to actual tests/readbacks in the native evidence. A missing behavior must fail on the starting source for its intended reason; already-correct behavior gets preservation evidence.

**In scope / out of scope.**

Existing request/render orchestration, bounded read caching/deduplication, event/render work and failure handling. No infrastructure migration, model migration, new paid lookup, larger quota, new provider endpoint, or blanket freshness relaxation.

**Open questions & assumptions.**

The causal bottlenecks remain to be measured by the implementation runner. This is a required bounded engineering investigation with defined repairs and falsification, not an open product choice. An external service's irreducible latency is reported honestly.

No material product question remains for this authored scope. Ordinary implementation choices are resolved from current evidence. Missing authority or real customer/provider input blocks only its exact effect and is never guessed.

**Cross-product impacts.**

Inspected starting owners:

- `app/lease-renewal/live/desk/page.tsx`
- `lib/lease-renewal/assistant-source.ts`
- `lib/operational-context/server-context.ts`
- `lib/assistant/interpret.ts`
- `components/ask/AskForm.tsx`

Shared presentation and service changes must preserve other current consumers, direct entry routes, account boundaries and compatible return links. Coordinate with the named dependencies rather than creating parallel owners. Record exact revised source/test ownership in the current native docs after implementation.

**Authority and evidence map.**

| Input                                                                 | Classification                     | Use and limitation                                                                                                                                           |
| --------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`                                                           | Authority and safety               | Exact scope, identities, protected paths, action and release gates; a spec or registry row is not execution authority.                                       |
| Current live readback, source/tests and `docs/facts.md`               | Implementation truth               | Establish actual baseline and preservation; revalidate before implementation. The October 4 read covers initial Admin screens, not every future requirement. |
| October 4 accepted recommendations and general UI/UX audit framework  | Clarified product intent           | Establish this bounded desired behavior. Audit timing/navigation heuristics are not measured guarantees or a mandate to invent new workflows.                |
| `docs/feature-suites/README.md`, `docs/plan.md`, `docs/loop-state.md` | Native program and resume contract | Identify selected specs, decisions, sequencing and evidence status; completed/superseded rows never restart themselves.                                      |
| Missing external input or human observation                           | Scoped dependency                  | Keep its actual unavailable or NOT RUN state; continue independent implementation and fail-closed verification.                                              |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S168-1** — Owning request/read boundaries expose privacy-safe phase timing, outcome and request counts with comparable cold/warm and native/compiled workloads; no record text or identifiers enter logs. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S168-2** — Reuse and parallelism stay bound to the authenticated actor, authorized scope, source generation and existing freshness/notice floors; actual writer/receipt boundaries remain unchanged. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.
- **ARCH-S168-3** — Front-end scheduling/rendering and bounded service waits return a terminal outcome without letting an earlier or failed execution overwrite a newer one. Structural falsification uses the associated requirement/AC rows below on the starting owners; record the actual check and before/after result.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S168-1** — Measurements identify the actual waiting phase and preserve their scope. Deterministic falsification: A delayed-source fixture and a slow-render fixture must be distinguishable; a first click's acknowledgment timing cannot be reported as provider completion.
- **BEH-S168-2** — Independent reads can finish without serial waterfalls or repeated per-row calls. Deterministic falsification: Use two actors, concurrent same-scope requests and a large existing-row fixture; verify call counts, isolation and unchanged projected records.
- **BEH-S168-3** — Changing a table view preserves current source truth while avoiding measured redundant work. Deterministic falsification: Change a filter repeatedly, then introduce a freshness floor and notice change; the latter must force the existing safe read/refusal.
- **BEH-S168-4** — Interaction remains usable under the largest supported workload. Deterministic falsification: Exercise long records and rapid interactions; reject missing rows, lost focused controls, unbounded DOM/effect growth or an inaccessible optimization.
- **BEH-S168-5** — A stalled source reaches an honest terminal or recoverable partial state. Deterministic falsification: Hold one source indefinitely and fail another; verify bounded recovery, preserved usable results and no false zero count.
- **BEH-S168-6** — Performance improvements do not admit stale approvals or duplicate effects. Deterministic falsification: Run freshness/revocation and uncertain-write cases alongside the timing checks; all safety preservation assertions remain green.
- **BEH-S168-7** — The result states what became faster or more reliable and what did not. Deterministic falsification: A repair with only a changed spinner or unmatched workload cannot satisfy the latency improvement claim; unavoidable waits remain visible and recoverable.

**Human litmus outcome.**

### Get a response and finish the work

**If this was built correctly:** A person navigates, filters, opens details and asks a question. Each action is acknowledged promptly; the information finishes loading or gives a usable recovery. Repeating the same task does not repeatedly fetch the same available information.

- Model verdict: NOT RUN — specification-only; implementation runner records PASS or FAIL against every trace row with actual evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                                                                                                                                                                                                                                                | Architecture outcome | Behavior outcome | Human litmus                       | Deterministic evidence / falsification                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | ---------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S168-1 — Record action-to-acknowledgment, navigation/render, network/service and AI interpretation/source phases separately, with comparable cold/warm runs and supported portfolio/long-content fixtures. Separate WSL/mounted-filesystem startup overhead from ready-process behavior. | ARCH-S168-1          | BEH-S168-1       | Get a response and finish the work | AC-S168-1; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S168-2 — Repair repeated source/store/provider loads and serial waits that the baseline proves unnecessary. Parallelize independent reads and deduplicate concurrent identical reads only within validated actor/scope/generation boundaries; no per-row provider fan-out.               | ARCH-S168-2          | BEH-S168-2       | Get a response and finish the work | AC-S168-2; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S168-3 — Filter and sort operations reuse the appropriate current admitted inventory when supported, rather than triggering unnecessary full reads. Explicit refresh, post-write freshness, revoked access and notice admission still take their owning path.                            | ARCH-S168-2          | BEH-S168-3       | Get a response and finish the work | AC-S168-3; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S168-4 — Repair measured expensive synchronous work or redundant render/effect loops that block input. Keep primary controls, focus, required rows and accessibility intact; virtualization or prefetch is permitted only with evidence and parity.                                      | ARCH-S168-3          | BEH-S168-4       | Get a response and finish the work | AC-S168-4; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S168-5 — Every affected read has a finite owning wait/failure/recovery contract. Diagnose and bound stalled paths using supported service deadlines; surface partial-source truth rather than zero/empty or success.                                                                     | ARCH-S168-3          | BEH-S168-5       | Get a response and finish the work | AC-S168-5; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S168-6 — Caching and retries preserve source freshness, notice invalidation, current working values, at-most-once claims, receipts and ambiguous-effect handling. Never cache across permissions or retry a potentially dispatched write as a read optimization.                         | ARCH-S168-2          | BEH-S168-6       | Get a response and finish the work | AC-S168-6; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |
| R-S168-7 — Report comparable before/after evidence for each repair and the preserved workloads. The target sub-~400ms visible feedback is separate from service latency; do not claim faster service, a numeric guarantee or improved human outcomes without evidence.                     | ARCH-S168-1          | BEH-S168-7       | Get a response and finish the work | AC-S168-7; bind the named scenario below to the real owning seam, record expected baseline failure or existing-preservation result, then actual post-change evidence. |

Every row is a completion obligation, including boundary and recovery behavior. Native implementation evidence names each actual test/readback, environment, observed result and any precise unavailable seam. Unit/adapted evidence, compiled-browser evidence, guarded production reads and human observations retain their separate meanings.

**Preservation set.**

Existing authenticated routes and direct guards; current staff/Admin/Vendor and private-account boundaries; complete/partial source and freshness meanings; all-lease visibility and current working values; source differences and notice invalidation; receipt/ambiguity recovery; editable as-displayed unsent drafts; no-send and closed-key refusals; compatible query/return links; keyboard, touch, themes, reduced motion and existing mobile workflows. Any preservation failure fails the slice independently of a visual or timing improvement.

Retain the existing relevant owning tests and add missing preservation checks where the inspected baseline lacks them. Do not weaken a preserved assertion to make a visual, performance or wording change pass. The full native gate remains required for implementation delivery.

**Adversarial acceptance checks.**

- **AC-S168-1** — Verify R-S168-1 through ARCH-S168-1, BEH-S168-1 and the "Get a response and finish the work" litmus: A delayed-source fixture and a slow-render fixture must be distinguishable; a first click's acknowledgment timing cannot be reported as provider completion.
- **AC-S168-2** — Verify R-S168-2 through ARCH-S168-2, BEH-S168-2 and the "Get a response and finish the work" litmus: Use two actors, concurrent same-scope requests and a large existing-row fixture; verify call counts, isolation and unchanged projected records.
- **AC-S168-3** — Verify R-S168-3 through ARCH-S168-2, BEH-S168-3 and the "Get a response and finish the work" litmus: Change a filter repeatedly, then introduce a freshness floor and notice change; the latter must force the existing safe read/refusal.
- **AC-S168-4** — Verify R-S168-4 through ARCH-S168-3, BEH-S168-4 and the "Get a response and finish the work" litmus: Exercise long records and rapid interactions; reject missing rows, lost focused controls, unbounded DOM/effect growth or an inaccessible optimization.
- **AC-S168-5** — Verify R-S168-5 through ARCH-S168-3, BEH-S168-5 and the "Get a response and finish the work" litmus: Hold one source indefinitely and fail another; verify bounded recovery, preserved usable results and no false zero count.
- **AC-S168-6** — Verify R-S168-6 through ARCH-S168-2, BEH-S168-6 and the "Get a response and finish the work" litmus: Run freshness/revocation and uncertain-write cases alongside the timing checks; all safety preservation assertions remain green.
- **AC-S168-7** — Verify R-S168-7 through ARCH-S168-1, BEH-S168-7 and the "Get a response and finish the work" litmus: A repair with only a changed spinner or unmatched workload cannot satisfy the latency improvement claim; unavoidable waits remain visible and recoverable.

**Forbidden actions / hard gates.**

No client send, autonomous provider action, proof rerun, fabricated production record, new Action Registry key/activation, permission/claim/identity change, credential-store substitution, cost/guardrail change, or unrelated feature execution. Existing source updates and unsent Gmail drafting keep their exact human preview/confirmation, claim, receipt, readback, and correction contracts. A cancel, timeout, navigation, or client abort never proves an external operation stopped. Preserve Production/Live, managed identity, eleven Spaces, Demo=false and the reviewed Sheet switch. Protected paths retain AGENTS.md's owner-direction requirement; design this program through existing interfaces without assuming a protected-path grant.

**Dependencies / sequencing.**

Measure first and feed evidence into S169-S171. Layout/AI/persistence changes must include their own before/after preservation and latency checks; S181 validates the combined program.

**Standalone delivery contract.**

- **Deliverable now:** Comparable baselines, diagnosed in-scope repairs and reliable terminal read/render paths with focused tests; unavailable live timings do not authorize invented improvements.
- **Consumes, but does not assume:** Compatible deployed behavior and the named program contracts. Missing optional source/layout data has an explicit default, unavailable or recoverable state; an unimplemented peer is never treated as deployed.
- **Externally blocked effect:** This authored change requires no new provider activation or business mutation as proof. Any unavailable real input, human verdict or protected authority is recorded only against its exact outcome, with its actual BLOCKED or NOT RUN meaning; independent engineering/release proceeds.
- **Produces for downstream suites:** Verified owning contracts, traceable new behavior and separate preservation evidence for S181's cumulative validation and delivery.

**Verification and delivery contract.**

1. At the start of an explicitly authorized execution, refresh approved WSL authentication, read the actual serving version and relevant source, and freeze the existing behavior and preservation checks. Materialize missing-behavior tests before implementation; they must fail for the expected defect. Already-satisfied requirements receive preservation evidence rather than an artificial failure.
2. Exercise every requirement, architecture outcome, behavior outcome, and adversarial case through the actual owning components and services. Distinguish unit, emulator/backend, compiled-browser, guarded live-read, and human evidence. A passing adapter or screenshot does not establish a customer/provider effect. Use privacy-safe fixtures only in tests.
3. Run focused checks and the existing canonical verification, including bash scripts/verify.sh and npm run test:e2e:core, before an authorized mainline delivery. Keep preservation results separate. Audit scope, diff, secrets/PII, permissions, action contracts, runtime configuration, and deterministic traceability; update any changed route-opening landmark in the release canary in the same slice.
4. Deliver this program cumulatively through the existing runner and release gates: one watcher/lock, exact-main green CI, fresh prerequisites and locked GO, one application build per run, a zero-traffic candidate, guarded exact-revision assurance and reconciliation, receipt-bound promotion, the full 300,000 ms observation, and independent final readbacks. Preserve the reviewed Sheet=true value on candidate/promoted revisions and the captured predecessor's actual value on its recovery target. Consumed receipts/permits never admit this program.
5. Keep actual failed attempts immutable outside Git and diagnose before resuming or replacing them. Pre-dispatch authentication holds recheck the same approved store/checkpoint after change; in-flight or ambiguous operations still require reconciliation. Report ALL_GATES_GREEN only for actually completed requirements and delivery; BLOCKED only for an exact unavailable dependency after independent work is complete; BUDGET_EXHAUSTED only when an explicit budget exists. Human verdicts stay NOT RUN unless a person actually observes.

**Ordered prompt sequence.**

1. Read this complete specification, the canonical program section, router, current facts/resume/plan, and inspected owning source/tests. Revalidate present behavior instead of reviving old prerequisites.
2. Record the relevant baseline, requirement-to-outcome checks, expected fail-first results and preservation checks before implementation. Resolve ordinary technical choices from evidence; never invent missing customer/provider input.
3. Implement the bounded change and its actual loading, failure, recovery, concurrency and compatibility paths in the existing owners. Preserve unsaved work and unrelated/user-owned files.
4. Verify every trace row and adversarial case, then integrate with the other named program changes and existing mobile behavior. Record exact tested environments and unavailable live seams.
5. Carry the verified slice into the native checkpoint and authorized cumulative delivery. Authoring or a registry row alone never runs this sequence.

**Deletion/merge recommendation.**

Keep this suite active through verified program delivery and any remaining acceptance dependency. Retire or merge its narrative only after current code/tests/facts own every contract and the registry retains the exact disposition. Never remove the only unmet requirement, fabricate a human/provider result or restart a completed baseline from its row.

## November 3 assessment follow-up — A-05

> Authoring: FINAL. A-05 source and application DELIVERED. The correlated upstream detail-GET
> 500 diagnosis and bounded options-only handling passed focused preservation/full07 checks and
> current delivery/readbacks in [delivery and configuration evidence](../evidence/application-gap-delivery-2026-11-03.md). Original request purpose/actor and
> provider-internal cause remain unknown. Earlier S168 evidence keeps its actual scope; no live
> replay or provider-internal repair is claimed.

**Goal.**

Establish the cause, or the precise remaining uncertainty, of the recorded November 2 renewal
endpoint HTTP 500 so recovery is not mistaken for a proven repair. The finalized implementation
plan includes a narrow repair only when diagnosis establishes a defect in this existing read path;
it does not require a new phase-only permission request within a later explicitly launched scope.

**Current state / intended end state.**

`docs/evidence/application-delivery-2026-11-03.md` records successful current desk/workspace and
strict read-only charge-options observations, but explicitly leaves the recovered November 2
renewal endpoint 500's root cause unproven. Source `39435919` contains that evidence; serving runtime
is `bc975353`. A successful later request establishes recovery under those checked conditions only.

Intended: a sanitized request/phase diagnosis tied to retained private evidence, with the actual
route, actor scope, source/revision, time and observed failure. If evidence cannot distinguish
causes, retain that bounded uncertainty and name the smallest discriminating check. No invented
authentication, provider or network cause is acceptable.

**Actors and entry conditions.**

Engineering uses existing approved private evidence and read-only Cloud Run/application logs
through the approved local identity/store. Identify the actual failed request from retained
evidence before selecting a route or repeating a read. A missing log or response is reported as
missing evidence; it is not a reason to reauthenticate, change configuration or replay an effect.

**What it is / how it functions.**

- **R-S168-8 / A-05 — Recover the failure envelope.** Locate the retained failed request's timestamp,
  method/route, status or missing response, actual revision and available privacy-safe correlation
  identifier. Keep customer/source values, request bodies and raw logs outside Git. Distinguish
  browser/harness failure from an observed server 500 and preserve every original failed outcome.
- **R-S168-9 / A-05 — Correlate the owning read phase.** Read the narrow relevant time window and
  existing request/phase diagnostics. Trace the actual handler into its configuration, source read,
  permission/provider boundary or rendering step. Compare with later successful requests only when
  their route/revision/actor conditions are compatible. Eliminate supported hypotheses explicitly;
  absence of retained diagnostics is not evidence that a particular dependency failed.
- **R-S168-10 / A-05 — Falsify or bound the conclusion.** If a cause is reproducible, identify the
  smallest existing fixture/emulator check or proposed fail-first regression that discriminates it
  without production effects. During later authorized implementation, materialize that regression
  before a repair. If unreproduced, record surviving hypotheses and the minimum diagnostic signal
  needed on recurrence. Do not rerun broad suites or production requests until one happens to pass.
- **R-S168-11 / A-05 — Repair only the demonstrated boundary.** If diagnosis and an isolated
  failing check establish a current defect in the implicated renewal read/service/render path,
  implement the smallest complete correction and its refusal/recovery behavior under this owner.
  Preserve response contracts, permissions, source freshness, deadlines, costs and write admission.
  Unproven hypotheses do not authorize speculative changes or deadline increases. If cause remains
  unknown, finish the bounded diagnosis with an exact recurrence signal and owner; do not claim
  a repair or hold unrelated engineering work for a client to explain a technical failure.

**In scope / out of scope.**

In scope for later implementation: the single recorded renewal failure, its retained evidence/logs,
owning request/read path, focused isolated discrimination and a demonstrated narrow repair under
R-S168-11. Out of scope: speculative instrumentation/rewrites, changing deadlines/retries,
permissions or runtime configuration, restarting services, blanket performance/audit runs and
business-effect verification. This authoring round implements nothing and initiates no release.

**Open questions & assumptions.**

The exact failing route, timing and retained log detail must come from evidence; no endpoint is
guessed from the phrase renewal endpoint. Logs may have expired or omit a correlation field. In
that case the honest result is a bounded unresolved diagnosis, with the missing artifact and next
check named. Root cause and repair cannot be claimed from recovery alone.

**Cross-product impacts.**

The discovered owning renewal route/read service and S238's integrated evidence/repair tracking
consume the result. S239's dependency patch remains a separately delivered dependency-audit scope;
this failure is not automatically attributed to it. KB, Communications and unrelated historical
programs are outside the investigation unless the actual trace identifies a shared dependency.

**Authority and evidence map.**

| Input                                                     | Classification          | Use and limitation                                                                                      |
| --------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| Current assessment request and `AGENTS.md`                | Authority               | Read-only assessment and specification; no fix, release or business effect.                             |
| `docs/evidence/application-delivery-2026-11-03.md`        | Dated evidence          | Establishes the recorded recovered 500 and successful later reads; explicitly does not establish cause. |
| Retained private failed request and narrow read-only logs | Causal evidence         | Bind only actual observed fields; missing response/logs remain unknown.                                 |
| Current owning route/service and isolated tests           | Implementation evidence | Explain candidate failure boundaries; fixture success/failure is not a production diagnosis by itself.  |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S168-4** — Every causal conclusion links the actual failure envelope to its owning read
  phase and evidence. Falsification: removing the request/time/phase linkage makes a causal claim
  unsupported; a later successful request alone cannot satisfy the check.
- **ARCH-S168-5** — Any proposed reproduction uses deterministic adapters/emulators and the actual
  implicated boundary. A reproduction depending on live business credentials/provider writes fails
  this contract; no production retry mechanism is added.
- **ARCH-S168-6** — A repair is bound to the demonstrated failing boundary and the existing
  owner, with separately passing preservation checks. No causal evidence means no speculative
  repair; that branch instead produces the bounded diagnosis and exact remaining evidence need.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S168-8** — The final result distinguishes recovered, reproduced, cause established and
  unresolved. A report saying fixed solely because the current screen opens fails.
- **BEH-S168-9** — The next action names the smallest check or bounded R-S168-11 repair and its
  engineering owner. Missing technical diagnosis is not relabeled a client dependency; genuine
  missing external evidence is scoped only after accessible investigation is exhausted.
- **BEH-S168-10** — A demonstrated defect fails on the original boundary and passes after the
  correction under compatible conditions; the report separates that result from historical
  recovery. An unresolved cause stays unknown without inventing a fixed outcome.

**Human litmus outcome.**

### Understand the recovered renewal error

**If this was built correctly:** Staff can see whether the earlier problem's cause is known,
what evidence supports that conclusion and what the project team will check next. A successful
reload does not hide the original failure or imply that someone needs to sign in again.

- Model verdict: PASS for the bounded diagnosis, options-only repair, preservation and application delivery in [delivery/configuration evidence](../evidence/application-gap-delivery-2026-11-03.md). Original POST purpose and provider-internal cause remain unknown; no live replay or internal provider repair is inferred.
- Human verdict: NOT RUN — no human observer

<!-- batch005-evidence: follow-up rows below are outside the automated evidence gate -->

The A-05 rows below are outside the batch 005 automated evidence gate, which covers R-S168-1
to R-S168-7 in `docs/evidence/application-usability-batch005.json`. Their verified status is
the model verdict above and the register in `docs/open-blockers.md`.

**Requirement-to-outcome traceability.**

| Requirement                     | Architecture outcome | Behavior outcome | Human litmus                           | Deterministic evidence / falsification                                                                                        |
| ------------------------------- | -------------------- | ---------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| R-S168-8 failure envelope       | ARCH-S168-4          | BEH-S168-8       | Understand the recovered renewal error | Actual failed request/time/route/status/revision or explicit unavailable fields; fabricated identifiers fail.                 |
| R-S168-9 phase correlation      | ARCH-S168-4          | BEH-S168-8       | Understand the recovered renewal error | Narrow log/source trace supports each eliminated/surviving cause; recovery alone fails causal proof.                          |
| R-S168-10 bounded falsification | ARCH-S168-5          | BEH-S168-9       | Understand the recovered renewal error | Existing isolated discriminating result, or exact unperformed regression/diagnostic signal and owner; no blind retry.         |
| R-S168-11 demonstrated repair   | ARCH-S168-6          | BEH-S168-10      | Understand the recovered renewal error | Failing-then-passing actual-boundary check and separate preservation gate, or explicit no-repair branch with bounded unknown. |

**Preservation set.**

Source/actor/Space isolation, current freshness/notice invalidation, immutable failures and receipts,
read deadlines, at-most-once claims and ambiguity handling, both closed Dotloop keys, current
production configuration and unrelated/untracked work. Existing successful read evidence remains
valid only within its originally recorded scope.

**Adversarial acceptance checks.**

- **AC-S168-8** — ARCH-S168-4 / BEH-S168-8: a browser/harness exception without retained HTTP
  response is not converted into a server 500; original server failure and later recovery differ.
- **AC-S168-9** — ARCH-S168-4 / BEH-S168-8: permission, authentication, timeout and provider errors
  require their actual trace; no login/configuration change is requested on an unproven hypothesis.
- **AC-S168-10** — ARCH-S168-5 / BEH-S168-9: reproduction uses the implicated isolated boundary;
  if evidence is insufficient, the report names the precise missing signal and keeps cause unknown.
- **AC-S168-11** — ARCH-S168-6 / BEH-S168-10: a reproduced current defect receives the smallest
  owning correction and a discriminating regression; an unreproduced failure produces no speculative
  source/configuration change or fixed claim. Compatible current behavior and safety checks pass.

**Forbidden actions / hard gates.**

The launched R-S168-11 repair, qualification and application delivery are verified. This bounded
repair permits no
service restart, configuration/permission/policy/key change, customer draft/send/schedule, business
write, paid request or production test record. Read
contracts are inspected before any repeated request; a GET label alone proves no absence of effects.
No raw customer/provider evidence or credentials enters tracked documentation.

**Dependencies / sequencing.**

Retained failure envelope precedes log selection; correlated phase precedes reproduction choice.
Engineering can complete the bounded investigation independently of legal forms, signatures or
staff acceptance. The delivered R-S168-11 repair belongs to the owner-launched finalized work
package; specification authoring alone never starts another scope or grants protected-path edits.

**Standalone delivery contract.**

- **Deliverable now:** the sanitized bounded diagnosis and options-only correction are qualified
  and delivered, with the original request/provider-internal uncertainty kept explicit.
- **Consumes, but does not assume:** Retained private request/log evidence and current source;
  unavailable fields remain explicitly unavailable.
- **Externally blocked effect:** None required to complete the bounded diagnostic report. Expired
  logs can limit causal certainty without making unrelated client action necessary.
- **Produces for downstream suites:** A supported cause and regression target, or an honest bounded
  unknown with the minimum recurrence signal; S238 links the result without claiming repair.

**Verification and delivery contract.**

1. Re-read current source/serving baseline and preserve the original failed report.
2. Read only the necessary private evidence/log window, then run an existing focused isolated check
   only when it discriminates a surviving hypothesis. No broad audit or full release verification.
3. Before an R-S168-11 correction, record the real failing check; afterwards run focused and
   separate preservation checks, then the canonical verification/CI and existing delivery gates
   applicable to any later authorized code release. A read-only diagnostic report requires only
   proportionate evidence/privacy/document checks. Never manufacture fail-first evidence.
4. Mark this investigation complete only with its bounded evidence-backed result. Cause may remain
   unresolved; implementation/repair/delivery status remains separate from diagnostic completion.

**Ordered prompt sequence.**

1. Recover the exact failed request and compatible source/runtime envelope.
2. Correlate the narrow read logs and owning handler; record supported exclusions and uncertainty.
3. Run a discriminating existing isolated check if available; otherwise specify the minimum next one.
4. Record the sanitized diagnosis; in an authorized implementation run, complete the demonstrated
   narrow repair and its gates, or retain the exact unresolved evidence need without a fixed claim.

**Deletion/merge recommendation.**

Merge this follow-up into S168's current evidence once the bounded diagnosis is recorded. Preserve
the original failure and uncertainty; a successful later page view never retires an unmet causal claim.
