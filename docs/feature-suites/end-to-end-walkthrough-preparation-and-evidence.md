<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-meeting-readiness-2026-09 -->

# S132 — End-to-end walkthrough preparation and meeting evidence

> **Approval reference:** F12 (original feature #12).
> **Status:** IMPLEMENTED and CI-GREEN at `f74468a1` (2026-09-20) as a technical rehearsal and documentation scaffold; release deferred by the billing incident; no deployment, provider activation, meeting, recording or meeting validation has occurred. Serving evidence: `docs/facts.md` F-S132.
> **Export date:** 2026-09-18. **Repository baseline:** `d61eecf309fef75f5fe0a80f8f203c1d24c6804a`.
> **Registration:** S132 is a proposed allocation following the inspected S120 sequence, not a reservation or a claim of repository registration. Check for collisions on import, including the separately written F05 spec; preserve F12 when renumbering.
> **Classification:** Technical rehearsal and documentation scaffold; human validation later.

**Goal.**

The next meeting has a tested route through the real application, an exact input/dependency checklist, a side-by-side manual-process runbook, and an honest evidence record ready for staff to validate one or two selected leases.

**Core outcome alignment.**

C05 — A prepared, observable end-to-end renewal walkthrough. See suite outcome contract (from the 2026-09-18 export-pack index). This file is a standalone feature specification; the index coordinates shared ownership and does not combine implementation scope.

**Current state / intended end state.**

**Current evidence:** The repository already has an operator guide, guide-to-control checks, backend journey tests, and a local Live-read-only rehearsal contract. The transcript proposes a recorded 90-minute session and one or two real cases, including a policy-related case. No meeting has been run or verified in this task; the user expressly defers validation to future meetings.

**Required end state:** Engineering checks and meeting materials can be completed beforehand without synthetic production activity. At the meeting, staff record actual observations, optional explicitly authorized real effects, deviations, and decisions; only then are human validation results and process documentation updated.

Current statements are grounded in the source map below at the pinned revision; they are not a fresh production readback. All new data shapes, labels, and defaults introduced here are proposed requirements unless explicitly identified as existing code or an owner decision.

**Actors and entry conditions.**

Bailey/Chasity or the designated operators demonstrate the actual workflow; the facilitator records observations and decisions; the project owner handles required authority/inputs. The implementation runner prepares technical evidence but cannot impersonate a human validator. Actual recording uses the team’s approved tool and consent process.

**What it is / how it functions.**

### R-F12-01 — Prepare a small, explicit case matrix

Define one ordinary renewal and, when provided, one policy-related case using team-selected real leases; include in-progress/advanced-date behavior and next-cycle preparation where applicable. Until selected, the case reference is Pending selection. Record source-read needs, current cycle, missing inputs, participant/role, intended walkthrough outcome, and which steps are observation-only. Keep real lease identifiers/customer values out of public Git and exported generic documentation.

### R-F12-02 — Provide a preflight with exact dependencies

Before the meeting, check current code/release identity, operator access, data-source availability/freshness, all-lease discoverability, F08 pause, approved templates/resources, managed mailbox, and Dotloop selections/closed keys. Label each check verified, failed, pending external input, or not run with timestamp/evidence. Preflight is effect-free and must not refresh a stateful provider endpoint that has undisclosed side effects.

### R-F12-03 — Write the side-by-side walkthrough script

For every step, pair the team’s known current manual step with the actual app control, required input, expected output, evidence type, permitted effect, and safe recovery. Cover find/open lease; verify facts; consume existing comps; prepare owner message; record actual owner terms; prepare tenant offer; record actual tenant response; prepare document packet; handle signing/follow-up; inspect completion and next-cycle work. Unknown manual steps stay marked for staff explanation, not invented process.

### R-F12-04 — Exercise engineering journeys before human validation

Run controlled end-to-end journeys through the actual owning app services, persistence/emulator, and compiled UI with deterministic external adapters. Cover fresh and underway renewals, date advancement, non-renewal, missing templates, policy materials absent, read failures, stale snapshots, duplicate confirmation, and interrupted work. Existing functionality already passing stays a preservation check. Technical results must not be relabeled as a human walkthrough or real provider success.

### R-F12-05 — Provide safe meeting branches

If a real input/provider is unavailable, switch to the documented inspection/preparation/manual-provider handoff without pretending the missing effect happened. Production must never be seeded or advanced merely to complete the demonstration. Local synthetic workflows may demonstrate otherwise unavailable branches only in their clearly labeled nonproduction context. A production action during the meeting still requires the exact normal actor approval/confirmation and must be genuine intended work.

### R-F12-06 — Capture observations and defects, not invented verdicts

Prepare an observation ledger with case/private reference, actual step, expected versus observed outcome, actor, time, evidence location, outcome (pass/fail/not run), issue owner, next action, and exact dependency. Recording is a planned human step with team consent, not an automatic app integration. Customer screenshots/transcripts stay in approved private storage; generic docs reference redacted evidence.

### R-F12-07 — Update process documentation only after observation

Before the meeting, mark the runbook Draft for validation. After real observations, update the canonical operator guide and knowledge/process materials with confirmed steps and decisions, retaining unresolved questions and applicable version/date. Do not publish raw customer material, overwrite legal wording, or remove technically necessary controls solely because an example skipped them.

### R-F12-08 — Make the session resumable and unscheduled by the app

Use the agreed approximate 90-minute scope as planning context, not a software timeout or enforced deadline. A paused meeting resumes from its last actual recorded step. The transcript’s proposed October 1, 2:00–3:30 meeting remains historical planning context, not a verified calendar event; do not schedule, invite, remind, or create an automation from this spec-writing request.

**Data, state, and integration contract.**

Prefer current markdown runbooks and private evidence references plus existing test result artifacts. Do not introduce a new meeting database, recording service, calendar integration, customer clone, or workflow engine. Use separate engineering, input-readiness, live-provider, and human-verdict dimensions.

**Failure, retry, cancellation, and concurrency.**

Record interruption and remaining steps; do not reset all results or claim a full pass after a partial session. Failed source checks retain their evidence and safe fallback. Follow-up defects become ordinary tracked work through existing mechanisms after approval, not automatic production patches.

**Agent and loop contract.**

The entry trigger is an explicit authorized user interaction or a later authorized implementation run, not file receipt, elapsed time, a model inference, or a meeting date. Inputs are the actual current source snapshot, app-owned state, reviewed configuration, and actor scope. Reads produce typed evidence/readiness; ordinary saves use existing audited state services; an external effect uses only its owning exact confirmed-action service. State changes are re-read before success is displayed. Cancelled undispatched actions have no effect; dispatched/ambiguous effects are reconciled, not blindly retried. No new background agent, worker, polling loop, or scheduler is created by this feature.

For F13, this contract applies to evidence gathering only: there is no application mutation loop. For F12, meeting preparation/observation does not execute the described customer actions. Future meetings, material receipt, and provider activation remain distinct from implementation termination.

**In scope / out of scope.**

In scope: case/input checklist, preflight, real-control script, technical rehearsal, evidence/defect template, and post-meeting documentation procedure. Out of scope: performing or scheduling the meeting now, promising provider availability, recording without consent, or manufacturing successful customer outcomes.

**Open questions & assumptions.**

External: chosen real cases, materials and mappings, actual staff availability/permissions, and meeting observations. Calendar timing was not verified in this task and is not a release or automation trigger. Missing specifics remain explicit blanks in the preparation materials.

Unverified business/provider facts cannot be replaced by a plausible default. An explicitly labeled presentation/engineering default may be implemented within the approved scope; source semantics, policy applicability, legal wording, and provider permissions require their actual evidence. Missing input blocks only the dependent outcome identified below.

**Cross-product impacts.**

These are verified paths or explicitly marked candidate owners, not authorization to replace them:

- `docs/products/renewal-operator-guide.md` and current training/meeting materials — canonical process and control map.

- `scripts/smoke-renewal-desk-browser.mjs` and current compiled guide check — use actual served controls and current implementation.

- Existing backend renewal journey tests, S113 evidence, and `lib/production-assurance/` readers — technical rehearsal and independent parity.

- `docs/loop-state.md` and `docs/open-blockers.md` — exact pending inputs; do not repeat stale closed blockers.

Update only affected current contracts and facts after verification. Existing historical evidence remains historical. Original approval numbers remain stable; any later S-number remap must update all namespaced acceptance and outcome references consistently.

**Authority and evidence map.**

| Source          | Location                                                                                                                            | What it supports and what it does not                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T12             | Transcript 00:54:14–00:55:15 and 00:57:36–00:58:51; parsed lines 1844–1876 and 1956–2000                                            | Side-by-side current/app workflow, recording for process documentation, one/two leases, policy case, next-cycle preparation, and templates.                       |
| U12             | User clarification on 2026-09-18                                                                                                    | Prepare everything possible, with validation reserved for the next meetings.                                                                                      |
| R12             | `docs/products/renewal-operator-guide.md`; `docs/autonomous-agent-runner.md`; current release/guide checks                          | Use existing controls and verification loop; no new testing environment or meeting automation assumed.                                                            |
| Shared baseline | `AGENTS.md`; `docs/facts.md`; `docs/loop-state.md`; `docs/feature-suites/TEMPLATE.md` at `d61eecf309fef75f5fe0a80f8f203c1d24c6804a` | Existing architecture/safety and document shape. The user’s latest approval controls new product scope; F08 expressly supersedes earlier enabled-Sheet execution. |

Transcript references use the supplied **Cherry Bridge + PMI: App Training, September 17, 2026** file and its conversation-parsed line numbers/timestamps. See source and decision log (from the 2026-09-18 export-pack evidence log) for filenames, source limitations, and conflicts. No raw customer details or secret values are reproduced here.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S132-1** — The owning boundaries listed above implement the data and state contract without a duplicate authoritative workflow, provider reader, or competing status model. A focused structural/service test or, for F13, a source-traceable assessment artifact demonstrates the named ownership and exact inputs/outputs.
- **ARCH-S132-2** — Actor scope, provenance/version binding, no-effect reads, explicit unavailable states, and existing effect/receipt boundaries remain enforced. Tests inject denied, missing, stale, conflicting, or interrupted evidence and assert the exact refusal/recovery described by each requirement.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S132-1** — R-F12-01: Prepare a small, explicit case matrix. The observable result must satisfy AC-S132-1; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S132-2** — R-F12-02: Provide a preflight with exact dependencies. The observable result must satisfy AC-S132-2; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S132-3** — R-F12-03: Write the side-by-side walkthrough script. The observable result must satisfy AC-S132-3; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S132-4** — R-F12-04: Exercise engineering journeys before human validation. The observable result must satisfy AC-S132-4; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S132-5** — R-F12-05: Provide safe meeting branches. The observable result must satisfy AC-S132-5; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S132-6** — R-F12-06: Capture observations and defects, not invented verdicts. The observable result must satisfy AC-S132-6; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S132-7** — R-F12-07: Update process documentation only after observation. The observable result must satisfy AC-S132-7; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S132-8** — R-F12-08: Make the session resumable and unscheduled by the app. The observable result must satisfy AC-S132-8; a UI label alone is insufficient where a service/provider boundary is required.

**Human litmus outcome.**

### End-to-end walkthrough preparation and meeting evidence

**If this was built correctly:** The facilitator starts the meeting knowing which inputs are ready, follows real controls alongside the team’s manual process, handles missing materials without improvising fake outcomes, and records exactly what staff validated.

- Model/engineering verdict: PASS in local engineering tests on `f74468a1` (2026-09-20): AC-S132-1 through AC-S132-8 covered by the preflight, matrix, script, branch, ledger, import and technical-ledger cases named in F-S132 on synthetic fixtures; the technical result ledger cites existing journey tests as preservation evidence; compiled browser checks NOT RUN while rehearsal auth is blocked; no deployed readback; no meeting run.
- Human verdict: NOT RUN — no human observer.
- Human/customer-specific validation is explicitly deferred to the next meetings or material-receipt review. Technical readiness may pass earlier without changing this verdict.

**Requirement-to-outcome traceability.**

| Requirement | Owning boundary                                    | Architecture             | Behavior   | Acceptance / test scenario                                         |
| ----------- | -------------------------------------------------- | ------------------------ | ---------- | ------------------------------------------------------------------ |
| R-F12-01    | meeting runbook / private evidence references      | ARCH-S132-1, ARCH-S132-2 | BEH-S132-1 | AC-S132-1: Prepare a small, explicit case matrix                   |
| R-F12-02    | existing read-only verification / readiness owners | ARCH-S132-1, ARCH-S132-2 | BEH-S132-2 | AC-S132-2: Provide a preflight with exact dependencies             |
| R-F12-03    | operator guide / F09-F10 workflows                 | ARCH-S132-1, ARCH-S132-2 | BEH-S132-3 | AC-S132-3: Write the side-by-side walkthrough script               |
| R-F12-04    | existing backend/integrated test runners           | ARCH-S132-1, ARCH-S132-2 | BEH-S132-4 | AC-S132-4: Exercise engineering journeys before human validation   |
| R-F12-05    | runbook / existing environment and effect guards   | ARCH-S132-1, ARCH-S132-2 | BEH-S132-5 | AC-S132-5: Provide safe meeting branches                           |
| R-F12-06    | meeting evidence template                          | ARCH-S132-1, ARCH-S132-2 | BEH-S132-6 | AC-S132-6: Capture observations and defects, not invented verdicts |
| R-F12-07    | operator guide / knowledge publication             | ARCH-S132-1, ARCH-S132-2 | BEH-S132-7 | AC-S132-7: Update process documentation only after observation     |
| R-F12-08    | meeting artifacts only                             | ARCH-S132-1, ARCH-S132-2 | BEH-S132-8 | AC-S132-8: Make the session resumable and unscheduled by the app   |

Every acceptance scenario below is a required test or evidence deliverable, not a reported pass. For unaffected already-implemented behavior, retain the existing test as preservation evidence rather than duplicating it.

**Preservation set.**

Existing guide control-map checks; local rehearsal versus Production boundaries; no synthetic production records/effects; per-action permissions; separate staff/provider/human evidence.

Keep preservation results separate from new-feature results. Passing one does not compensate for failing the other.

**Adversarial acceptance checks.**

- **AC-S132-1** — R-F12-01 / BEH-S132-1, ARCH-S132-1 and ARCH-S132-2: The case matrix is usable without real IDs, can later bind authorized private references, and does not invent a customer, policy, prior signature, or expected source value.

- **AC-S132-2** — R-F12-02 / BEH-S132-2, ARCH-S132-1 and ARCH-S132-2: A preflight with missing templates, unavailable Gmail, or closed Dotloop keys still supports an honest preparation walkthrough and identifies precisely which live steps cannot yet run. It creates no Sheet write, draft, paid comp, or provider record.

- **AC-S132-3** — R-F12-03 / BEH-S132-3, ARCH-S132-1 and ARCH-S132-2: Every named application control is found by the current guide/browser check; every missing manual-process detail is a visible meeting question. The script does not name buttons/routes that do not exist.

- **AC-S132-4** — R-F12-04 / BEH-S132-4, ARCH-S132-1 and ARCH-S132-2: A technical result ledger separately records each service/UI scenario, provider-call count, persistence/readback, and failure/recovery. Actual selected-lease and human verdict columns remain Not run.

- **AC-S132-5** — R-F12-05 / BEH-S132-5, ARCH-S132-1 and ARCH-S132-2: The facilitator can follow a no-template/no-mailbox/no-policy branch from the runbook. No “mark complete for demo,” fake signature, copied customer, or live proof replay is required.

- **AC-S132-6** — R-F12-06 / BEH-S132-6, ARCH-S132-1 and ARCH-S132-2: An unrun session has no pass verdicts or fabricated recording link. An actual failed step can be recorded with owner/action while later safe steps remain separately observable.

- **AC-S132-7** — R-F12-07 / BEH-S132-7, ARCH-S132-1 and ARCH-S132-2: A sample observation import differentiates confirmed procedure from open questions; the resulting generic guide contains no customer identifiers or unsupported claim that the full workflow passed.

- **AC-S132-8** — R-F12-08 / BEH-S132-8, ARCH-S132-1 and ARCH-S132-2: A partially completed meeting ledger resumes with untouched prior results; no calendar/provider activity is generated by creating or opening the preparation materials.

- **AC-S132-9** — ARCH-S132-2, preservation gate: run the named existing checks and assert no unintended customer sends, source mutations, paid lookups, actor widening, historical-evidence rewrite, or new background work. F08 must remain paused where installed; missing optional dependencies do not disable unrelated work.
- **AC-S132-10** — Evidence gate: the final result separately reports engineering tests, deployed readback if performed, missing external inputs, provider-specific verification, and human meeting observations. No unrun result is PASS, and no fake-provider success is described as a live customer outcome.

**Forbidden actions / hard gates.**

No autonomous customer sends, synthetic production customers, browser-driven provider workarounds, new identities, expanded roles, new action keys, or unreviewed protected-path changes. Opening, filtering, sorting, copying, inspecting, and refreshing must not authorize a write or advance a renewal. Preserve exact human confirmation, durable attempts, receipts, readback, and explicit reconciliation for separately authorized effects. A saved status, draft, uploaded file, matching provider record, or passed test is not proof of a sent message, valid signature, or completed customer workflow.

F08 is the only approved policy change in this pack: pause operating-Sheet mutations while preserving reads. It does not turn off supported RentVine operations or erase historical Sheet receipts. This export itself changes no runtime setting, repository file, account, calendar event, or provider record.

**Dependencies / sequencing.**

Integrates F01-F04/F06-F11/F14 while treating unavailable inputs as explicit branches. F13 maintenance assessment is separate and must not block a renewal walkthrough. F05 is consumed as existing/externally specified behavior, not changed here.

**Standalone delivery contract.**

- **Deliverable now, in a later implementation task:** Draft runbook, case/input/readiness matrices, controlled engineering journey evidence, and observation/defect templates prepared for later staff validation.
- **Consumes, but does not assume:** the exact source/configuration/cross-feature inputs above; missing or unverified values retain their explicit unavailable representation.
- **Externally blocked or deferred outcome:** Actual human walkthrough, selected-customer validation, consented recording, and resulting confirmed process documentation. These do not block the complete technical preparation slice.
- **Produces for downstream work:** the stable evidence/state contract and acceptance record defined here. No inferred approval or provider receipt is produced by a technical test.

**Verification and delivery contract.**

1. Re-read `AGENTS.md`, `docs/facts.md`, `docs/loop-state.md`, the current suite registry, and the implementation owners listed here. Compare the working revision with the pinned discovery baseline. Inspect only authorized read-only live evidence when needed. Do not treat repository deployment prose as a new live verification.
2. Record the preservation baseline and materialize each architecture, behavior, and adversarial check. A genuinely missing behavior must fail for its intended reason before its fix. An already-correct behavior is a preservation check; do not manufacture a failure or rebuild it merely to claim new work.
3. Run the focused checks, actual backend/service integration with controlled external adapters, and applicable served-browser checks. Keep source coverage, app-owned state, provider effects, and human observations separate in the result ledger. Use synthetic values only in local tests/emulators, never in Production.
4. Before an authorized code delivery, run `bash scripts/verify.sh`, `npm run test:firestore`, and `npm run test:e2e:core` as applicable under the current repository contract. Run the relevant compiled renewal desk/guide browser checks, inspect accessibility and source parity, and audit the diff for secrets, customer data, protected paths, provider gates, and unintended scope. Never weaken checks to fit a new label or bypass a missing input.
5. Implementation/release is a later task, not performed by this export. When authorized, use the existing serialized green-commit, exact-SHA CI, zero-traffic candidate, smoke/assurance, promotion, observation, readback, and captured-predecessor rollback path. Documentation-only changes do not trigger a production deploy unless they change a served asset. F08's pause must survive a rollback.
6. Report the implementation terminal as `ALL_GATES_GREEN`, `BLOCKED`, or `BUDGET_EXHAUSTED` (the last only with an explicit user-supplied run budget). External inputs and future meeting acceptance are tracked separately. A green scaffold does not make live validation complete. Record `Human verdict: NOT RUN — no human observer` until an actual authorized observation occurs. Do not set any verdict to PASS merely because this specification was written.

**Ordered prompt sequence.**

1. Inspect the current owning code and existing contracts; resolve only the bounded evidence questions identified here.
2. Freeze the feature-specific checks and preservation baseline. Establish the smallest complete change and the explicit no-effect boundary.
3. Build or reuse the owning implementation, including unavailable, stale, denied, interrupted, and recovery paths; do not introduce a parallel workflow engine.
4. Run every acceptance row and the preservation gates, then the repository's authorized verification/release loop. Record exact evidence and remaining external inputs.
5. Update current documentation only to what was demonstrated. Keep future meeting results, missing approved materials, and deferred provider activation pending rather than fabricating closure.

**Deletion/merge recommendation.**

Keep this specification independent of adjacent features until its own code/evidence and remaining dependencies are represented by current implementation contracts, tests, and facts. Preserve the original F12 approval mapping. Do not delete an external-input or meeting-validation gap merely because scaffolding passed. If existing behavior already meets part of the spec, link that evidence and merge only redundant explanatory prose—not acceptance coverage, history, or the user’s separate-feature boundary.
