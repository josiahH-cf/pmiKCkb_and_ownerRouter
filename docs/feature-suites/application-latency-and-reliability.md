<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: application-usability-reliability-2026-10 -->

# S168 — Measured application latency and reliability repairs

> Status: READY — finalized owner-accepted F01 of batch 005 on 2026-10-04; implementation and delivery NOT RUN. Spec authoring alone does not start execution.

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
