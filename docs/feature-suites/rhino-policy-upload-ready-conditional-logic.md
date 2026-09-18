<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-meeting-readiness-2026-09 -->

# S131 — Rhino-policy conditional logic, ready for approved material upload

> **Approval reference:** F11 (original feature #11).
> **Status:** SPECIFICATION ONLY — scope approved; no implementation, deployment, provider activation, or meeting validation performed by this export.
> **Export date:** 2026-09-18. **Repository baseline:** `d61eecf309fef75f5fe0a80f8f203c1d24c6804a`.
> **Registration:** S131 is a proposed allocation following the inspected S120 sequence, not a reservation or a claim of repository registration. Check for collisions on import, including the separately written F05 spec; preserve F11 when renumbering.
> **Classification:** Tested inactive scaffold; policy-specific support remains unavailable.

**Goal.**

Implement and exhaustively test the conditional workflow/content logic now, while keeping policy-specific wording and live behavior unavailable until actual approved materials and applicability rules are uploaded and reviewed.

**Core outcome alignment.**

C06 — Policy-specific content is explicit, versioned, and never invented. See suite outcome contract (from the 2026-09-18 export-pack index). This file is a standalone feature specification; the index coordinates shared ownership and does not combine implementation scope.

**Current state / intended end state.**

**Current evidence:** The transcript identifies a future Rhino-policy test lease and a need for correct wording but supplies no actual policy, renewal terms, approved copy, or trigger rules. The repository already has a conditional Rhino follow-up and a Sheet semantic field; those are not proof of coverage, policy renewal, legal content, or a provider integration.

**Required end state:** A controlled policy-content extension supports unknown/not-applicable/applicable cases, versioned approved material intake, exact required input checks, downstream preview/staleness, and manual follow-up. With no materials, it truthfully stays Pending approved policy material; ordinary unaffected renewals still work.

Current statements are grounded in the source map below at the pinned revision; they are not a fresh production readback. All new data shapes, labels, and defaults introduced here are proposed requirements unless explicitly identified as existing code or an owner decision.

**Actors and entry conditions.**

Staff may record that policy review is required using existing app-owned controls. Authorized content/policy approvers publish the supplied material and applicability rules. A current Editor prepares a lease-specific use only from approved facts; provider effects keep their existing separate permissions.

**What it is / how it functions.**

### R-F11-01 — Model applicability without assuming coverage

Represent applicability as Unknown / Applicable / Not applicable with source, reviewer, applicable lease/cycle, and approved rule version when available. Merely mentioning Rhino, checking a manual task, uploading a document, or seeing a legacy Sheet field MUST NOT prove policy type, coverage, current renewal, or required wording. Conflicting/expired/unreadable evidence remains an explicit review state.

### R-F11-02 — Prepare approved material intake and bounded rules

Reuse authenticated trusted-source publication to receive policy material later. Support proposed bounded configuration for version/reference, reviewer/approval, approved text or artifact references, allowed output slots, applicability facts, and required input identifiers. Use typed declarative conditions over verified facts, not executable scripts, arbitrary prompts, or autonomous rule generation. Actual field meanings and approved rules are supplied later.

### R-F11-03 — Keep uploading, approving, and using separate

Upload creates pending material, not active policy support. Approved publication and mapping review make a version eligible; selecting it for an applicable lease and reviewing the final preparation are separate steps. Do not add a new approval role or bypass existing approval boundaries. Rejected/superseded material cannot silently remain current.

### R-F11-04 — Make absent support honest and local

Without approved specifics, show Pending approved policy material and the exact missing items. Staff may save facts and continue unrelated work. For a known applicable lease, final customer output/packet sections requiring that policy remain blocked; unknown applicability asks for review rather than silently asserting no policy. Do not force every unrelated renewal to wait for a global Rhino upload.

### R-F11-05 — Apply exact approved content without invented semantics

Once real approved content exists, substitute only mapped reviewed facts into approved slots, retaining policy/reference/version and per-output evidence. Preserve repeated-party/pet/term mappings through F10. Do not infer fees, premiums, coverage, claim deadlines, enrollment, renewability, or legal effect from product name or examples. Do not mix Rhino with renter insurance, resident benefit packages, or another guaranty product.

### R-F11-06 — Track manual follow-up independently from provider truth

Reuse the existing conditional follow-up checklist for staff-recorded work. Completed follow-up means staff recorded that task, not that Rhino renewed a policy or accepted a claim. No provider integration, premium change, enrollment, claim submission, or Sheet write is introduced. Revoking applicability reopens only dependent work through existing reviewed cycle semantics.

### R-F11-07 — Validate every logic branch now, real content later

Before real materials arrive, test all states, condition branches, schema rejection, role access, missing inputs, multiple parties, version staleness, concurrent publication, withdrawn/rejected material, cancellation, and response loss using unmistakably synthetic nonlegal local fixtures. Record logic verification separately from policy-specific wording/legal accuracy and selected-customer acceptance, which remain pending.

**Data, state, and integration contract.**

Prefer a narrow extension to existing versioned artifact/wording and applicability schemas, with current source IDs, revision checks, and private storage. Proposed configuration fields are engineering scaffolding, not facts about Rhino’s product. Absent material never becomes an implicit empty approved policy.

**Failure, retry, cancellation, and concurrency.**

Failed upload/approval retains the last actually approved version and the new pending candidate separately. A lost publication response requires readback; no duplicate activation. A stale policy or source invalidates only dependent current previews, not historical evidence. No automatic background activation when a file arrives.

**Agent and loop contract.**

The entry trigger is an explicit authorized user interaction or a later authorized implementation run, not file receipt, elapsed time, a model inference, or a meeting date. Inputs are the actual current source snapshot, app-owned state, reviewed configuration, and actor scope. Reads produce typed evidence/readiness; ordinary saves use existing audited state services; an external effect uses only its owning exact confirmed-action service. State changes are re-read before success is displayed. Cancelled undispatched actions have no effect; dispatched/ambiguous effects are reconciled, not blindly retried. No new background agent, worker, polling loop, or scheduler is created by this feature.

For F13, this contract applies to evidence gathering only: there is no application mutation loop. For F12, meeting preparation/observation does not execute the described customer actions. Future meetings, material receipt, and provider activation remain distinct from implementation termination.

**In scope / out of scope.**

In scope: typed conditional logic, upload-ready intake, approval/version binding, exact content-slot checks, local unknown-state behavior, tests, and manual follow-up. Out of scope: inventing policy terms, certifying coverage/legal accuracy, implementing a Rhino API, or enabling live policy-specific outputs before reviewed material exists.

**Open questions & assumptions.**

Await the actual policy/product details, approved wording, applicability rules, evidence requirements, and output mappings. These are intentionally unresolved inputs. The generic scaffold is implementation-ready now; actual product support and wording validation are not.

Unverified business/provider facts cannot be replaced by a plausible default. An explicitly labeled presentation/engineering default may be implemented within the approved scope; source semantics, policy applicability, legal wording, and provider permissions require their actual evidence. Missing input blocks only the dependent outcome identified below.

**Cross-product impacts.**

These are verified paths or explicitly marked candidate owners, not authorization to replace them:

- `lib/lease-renewal/workspace-state.ts` — existing conditional Rhino follow-up and cycle evidence.

- `lib/lease-renewal/sheet-writeback/field-intent.ts` — existing Rhino semantic field; preserve F08 no-write policy.

- Existing source publication/resource intake and S66 catalog/mapping owners — candidate extension for approved versioned policy material.

- `lib/lease-renewal/owner-draft.ts`, `tenant-draft.ts`, and `lib/lease-documents/` — consumers of approved applicable content only.

Update only affected current contracts and facts after verification. Existing historical evidence remains historical. Original approval numbers remain stable; any later S-number remap must update all namespaced acceptance and outcome references consistently.

**Authority and evidence map.**

| Source          | Location                                                                                                                            | What it supports and what it does not                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T11             | Transcript 00:57:36; parsed lines 1956–1974                                                                                         | A Rhino-related lease proposed for later wording validation; no actual policy details supplied.                                                                   |
| U11             | User clarification on 2026-09-18                                                                                                    | Validate all logic now; specifics are unavailable and support must wait for material upload/readiness.                                                            |
| R11             | `lib/lease-renewal/workspace-state.ts`; `lib/lease-renewal/sheet-writeback/field-intent.ts`; S66                                    | Existing conditional follow-up and approved-content boundaries; no product-specific wording authority.                                                            |
| Shared baseline | `AGENTS.md`; `docs/facts.md`; `docs/loop-state.md`; `docs/feature-suites/TEMPLATE.md` at `d61eecf309fef75f5fe0a80f8f203c1d24c6804a` | Existing architecture/safety and document shape. The user’s latest approval controls new product scope; F08 expressly supersedes earlier enabled-Sheet execution. |

Transcript references use the supplied **Cherry Bridge + PMI: App Training, September 17, 2026** file and its conversation-parsed line numbers/timestamps. See source and decision log (from the 2026-09-18 export-pack evidence log) for filenames, source limitations, and conflicts. No raw customer details or secret values are reproduced here.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S131-1** — The owning boundaries listed above implement the data and state contract without a duplicate authoritative workflow, provider reader, or competing status model. A focused structural/service test or, for F13, a source-traceable assessment artifact demonstrates the named ownership and exact inputs/outputs.
- **ARCH-S131-2** — Actor scope, provenance/version binding, no-effect reads, explicit unavailable states, and existing effect/receipt boundaries remain enforced. Tests inject denied, missing, stale, conflicting, or interrupted evidence and assert the exact refusal/recovery described by each requirement.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S131-1** — R-F11-01: Model applicability without assuming coverage. The observable result must satisfy AC-S131-1; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S131-2** — R-F11-02: Prepare approved material intake and bounded rules. The observable result must satisfy AC-S131-2; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S131-3** — R-F11-03: Keep uploading, approving, and using separate. The observable result must satisfy AC-S131-3; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S131-4** — R-F11-04: Make absent support honest and local. The observable result must satisfy AC-S131-4; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S131-5** — R-F11-05: Apply exact approved content without invented semantics. The observable result must satisfy AC-S131-5; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S131-6** — R-F11-06: Track manual follow-up independently from provider truth. The observable result must satisfy AC-S131-6; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S131-7** — R-F11-07: Validate every logic branch now, real content later. The observable result must satisfy AC-S131-7; a UI label alone is insufficient where a service/provider boundary is required.

**Human litmus outcome.**

### Rhino-policy conditional logic, ready for approved material upload

**If this was built correctly:** Staff can identify a policy-related renewal and see exactly which approved materials are needed. Once the real materials are reviewed, the existing workflow can use them without replacing the application’s logic or inventing terms.

- Model/engineering verdict: NOT RUN — this export specifies checks; it does not execute application tests or claim their results.
- Human verdict: NOT RUN — no human observer.
- Human/customer-specific validation is explicitly deferred to the next meetings or material-receipt review. Technical readiness may pass earlier without changing this verdict.

**Requirement-to-outcome traceability.**

| Requirement | Owning boundary                                       | Architecture             | Behavior   | Acceptance / test scenario                                          |
| ----------- | ----------------------------------------------------- | ------------------------ | ---------- | ------------------------------------------------------------------- |
| R-F11-01    | workspace state / conditional policy projection       | ARCH-S131-1, ARCH-S131-2 | BEH-S131-1 | AC-S131-1: Model applicability without assuming coverage            |
| R-F11-02    | trusted-source intake / proposed policy config schema | ARCH-S131-1, ARCH-S131-2 | BEH-S131-2 | AC-S131-2: Prepare approved material intake and bounded rules       |
| R-F11-03    | publication / policy version state                    | ARCH-S131-1, ARCH-S131-2 | BEH-S131-3 | AC-S131-3: Keep uploading, approving, and using separate            |
| R-F11-04    | message/packet readiness                              | ARCH-S131-1, ARCH-S131-2 | BEH-S131-4 | AC-S131-4: Make absent support honest and local                     |
| R-F11-05    | composition / S66 mapping                             | ARCH-S131-1, ARCH-S131-2 | BEH-S131-5 | AC-S131-5: Apply exact approved content without invented semantics  |
| R-F11-06    | workspace-state / manual progress                     | ARCH-S131-1, ARCH-S131-2 | BEH-S131-6 | AC-S131-6: Track manual follow-up independently from provider truth |
| R-F11-07    | unit/backend/consumer contract tests                  | ARCH-S131-1, ARCH-S131-2 | BEH-S131-7 | AC-S131-7: Validate every logic branch now, real content later      |

Every acceptance scenario below is a required test or evidence deliverable, not a reported pass. For unaffected already-implemented behavior, retain the existing test as preservation evidence rather than duplicating it.

**Preservation set.**

Existing conditional checklist; app-owned/provider-evidence distinction; no automatic charges or Sheet writes; approved publication/version rules; ordinary non-policy renewal preparation.

Keep preservation results separate from new-feature results. Passing one does not compensate for failing the other.

**Adversarial acceptance checks.**

- **AC-S131-1** — R-F11-01 / BEH-S131-1, ARCH-S131-1 and ARCH-S131-2: Name-only, legacy-checkbox, conflicting, expired, and missing-policy fixtures never become confirmed coverage or automatically insert wording; a reviewed not-applicable record clears only this conditional dependency.

- **AC-S131-2** — R-F11-02 / BEH-S131-2, ARCH-S131-1 and ARCH-S131-2: Local synthetic configuration fixtures validate the schema and reject unknown fields, unapproved sources, executable content, circular conditions, and missing version/binding information.

- **AC-S131-3** — R-F11-03 / BEH-S131-3, ARCH-S131-1 and ARCH-S131-2: An uploaded-but-unapproved fixture remains unusable for final output. Explicit approval enables only the exact version; a later superseding version invalidates affected unexecuted preparations.

- **AC-S131-4** — R-F11-04 / BEH-S131-4, ARCH-S131-1 and ARCH-S131-2: Ordinary not-applicable renewal fixtures complete their existing preparations while a known applicable fixture blocks only its dependent wording/document output. No generic invented Rhino paragraph appears.

- **AC-S131-5** — R-F11-05 / BEH-S131-5, ARCH-S131-1 and ARCH-S131-2: Synthetic approved text with bounded slots renders exactly the expected fixture values; absent amount/source/slot fails specifically. No unrelated insurance/charge terms or automatic provider calls are produced.

- **AC-S131-6** — R-F11-06 / BEH-S131-6, ARCH-S131-1 and ARCH-S131-2: Marking the manual follow-up done updates app-owned evidence only; provider spies remain zero and the UI never displays “coverage verified” without its required independent evidence.

- **AC-S131-7** — R-F11-07 / BEH-S131-7, ARCH-S131-1 and ARCH-S131-2: The branch matrix maps every conditional decision to a passing technical test and separately lists actual material/wording checks as not run; no fixture is copied into production or called approved policy.

- **AC-S131-8** — ARCH-S131-2, preservation gate: run the named existing checks and assert no unintended customer sends, source mutations, paid lookups, actor widening, historical-evidence rewrite, or new background work. F08 must remain paused where installed; missing optional dependencies do not disable unrelated work.
- **AC-S131-9** — Evidence gate: the final result separately reports engineering tests, deployed readback if performed, missing external inputs, provider-specific verification, and human meeting observations. No unrun result is PASS, and no fake-provider success is described as a live customer outcome.

**Forbidden actions / hard gates.**

No autonomous customer sends, synthetic production customers, browser-driven provider workarounds, new identities, expanded roles, new action keys, or unreviewed protected-path changes. Opening, filtering, sorting, copying, inspecting, and refreshing must not authorize a write or advance a renewal. Preserve exact human confirmation, durable attempts, receipts, readback, and explicit reconciliation for separately authorized effects. A saved status, draft, uploaded file, matching provider record, or passed test is not proof of a sent message, valid signature, or completed customer workflow.

F08 is the only approved policy change in this pack: pause operating-Sheet mutations while preserving reads. It does not turn off supported RentVine operations or erase historical Sheet receipts. This export itself changes no runtime setting, repository file, account, calendar event, or provider record.

**Dependencies / sequencing.**

F10 receives document/material mappings; F09 consumes applicable approved content; F12 later validates the selected policy lease. The logic must pass independently using local fixture adapters, with the real provider/material branch inactive.

**Standalone delivery contract.**

- **Deliverable now, in a later implementation task:** Complete generic conditional logic, private intake/review hooks, versioned mappings, safe pending/unknown behavior, and branch-complete technical tests.
- **Consumes, but does not assume:** the exact source/configuration/cross-feature inputs above; missing or unverified values retain their explicit unavailable representation.
- **Externally blocked or deferred outcome:** Approved real policy materials and business rules, exact lease applicability evidence, and later staff review of wording. Receipt alone is not activation.
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

Keep this specification independent of adjacent features until its own code/evidence and remaining dependencies are represented by current implementation contracts, tests, and facts. Preserve the original F11 approval mapping. Do not delete an external-input or meeting-validation gap merely because scaffolding passed. If existing behavior already meets part of the spec, link that evidence and merge only redundant explanatory prose—not acceptance coverage, history, or the user’s separate-feature boundary.
