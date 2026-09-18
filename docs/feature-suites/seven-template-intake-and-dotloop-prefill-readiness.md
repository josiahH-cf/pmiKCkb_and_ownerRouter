<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-meeting-readiness-2026-09 -->

# S130 — Seven-template intake and Dotloop prefill readiness

> **Approval reference:** F10 (original feature #10).
> **Status:** SPECIFICATION ONLY — scope approved; no implementation, deployment, provider activation, or meeting validation performed by this export.
> **Export date:** 2026-09-18. **Repository baseline:** `d61eecf309fef75f5fe0a80f8f203c1d24c6804a`.
> **Registration:** S130 is a proposed allocation following the inspected S120 sequence, not a reservation or a claim of repository registration. Check for collisions on import, including the separately written F05 spec; preserve F10 when renumbering.
> **Classification:** Conditional scaffold and targeted extension of S66/S106/S34.

**Goal.**

Prepare the intake, mapping, preview, validation, and provider-handoff machinery now so approved forms can be uploaded later and the resulting real packet can be validated at a meeting, without inventing legal content or claiming a field preview already fills a document.

**Core outcome alignment.**

C05 — Templates can be received and reviewed without another architectural project; C06 — Exact approved content and mappings. See suite outcome contract (from the 2026-09-18 export-pack index). This file is a standalone feature specification; the index coordinates shared ownership and does not combine implementation scope.

**Current state / intended end state.**

**Current evidence:** S66 already owns immutable packet truth and mapping readiness; S106 owns connection/resource selection; S34 owns exact approved S21 bytes, normal approval/execution, loop/document upload, and recovery. Importantly, the inspected S34 contract says its mapped-field preview does not fill uploaded bytes: applicable fields are currently completed by a person in Dotloop. Actual forms/mappings and separately governed connection/key activation remain dependencies.

**Required end state:** All app-owned preparation is ready before receipt. A later authorized intake validates each actual template and mapping, produces a source-linked prefill preview, and either generates a reviewed filled artifact through a verified supported filling route or clearly identifies the exact manual/provider completion step. Actual autofill and live provider acceptance are not declared complete until demonstrated with the supplied forms.

Current statements are grounded in the source map below at the pinned revision; they are not a fresh production readback. All new data shapes, labels, and defaults introduced here are proposed requirements unless explicitly identified as existing code or an owner decision.

**Actors and entry conditions.**

Existing authorized content publishers approve legal artifacts and versions; Editors prepare lease-specific packets; current approval/execution roles review and confirm provider effects. Forms are received through authenticated existing trusted-source/Drive/S21 paths, never a new public upload endpoint.

**What it is / how it functions.**

### R-F10-01 — Prepare a seven-family intake manifest

Provide persistent readiness entries for standard lease, renewal extension, animal agreement, lead-based-paint disclosure, city addendum, HOA artifact, and owner acknowledgment, using the existing approved catalog. These repository families are a reconciliation starting point, not proof that the seven forthcoming files match one-to-one. For each actual upload capture approved family/coverage, version, original content hash, private source reference, field mapping, participants/signers, and review status. Empty entries remain Pending materials.

### R-F10-02 — Validate real uploads without inventing a parser result

Build authenticated receipt, file-integrity/format checks, safe metadata extraction, version binding, and review UI now using nonlegal local fixtures. For each real form, determine whether it is a supported fillable document, a native provider template, or a static/unsupported file. Treat all uploaded text/metadata as untrusted data, never executable instructions. Do not infer signature locations or legal clauses from file names, screenshots, or an LLM.

### R-F10-03 — Map exact fields and signer roles

Use a version-bound, reviewed field map from canonical lease/party/term/charge facts to actual form fields and signer roles. Every required mapping needs exact meaning, requiredness, repeat/multiplicity rules, and source. Reuse one known pet/party value across repeated mapped locations; do not duplicate or omit parties by display name. Missing or conflicting fields/signers block only the affected artifact/packet outcome.

### R-F10-04 — Distinguish preview from actual filled output

Build a deterministic filling boundary for the formats actually supported by the chosen existing tooling/provider. A mapping worksheet is labeled Preview only until the actual output bytes or provider-native field values are independently read and compared. If uploaded forms cannot be filled by a verified route, preserve a source-filled worksheet and exact manual Dotloop handoff; mark machine autofill unavailable for those forms, not completed. Do not silently substitute a new signing vendor.

### R-F10-05 — Bind derived artifacts to the approved originals

A generated filled artifact MUST bind original approved template version/hash, reviewed mapping version, exact current input snapshot, output hash, and review/approval evidence. Extend the owning S66/S21/S34 contract where needed; never substitute derived bytes under the blank original’s hash or bypass exact publication checks. Original legal content remains immutable; only reviewed mapped value slots may change. Any input/template/mapping change invalidates the dependent final preview.

### R-F10-06 — Prepare conditional packet and provider readiness

Packet applicability is lease-specific: not all seven families are required for every lease. Show required/missing/not-applicable/unknown separately. Keep approved forms/mappings, connection credentials/consent, selected profile/template/type/status, exact keys, and human confirmation as separate checks. Uploading a template or passing a fake-provider test does not connect an account or activate an effect.

### R-F10-07 — Preserve one-attempt packet execution and human signing

Reuse S34’s normal loop creation/upload, existing queue approval, one-attempt claims, own receipts, and readback. A duplicate confirmed packet must not create another loop; partial uploads remain individually visible and recover only through owned receipts. Document presence is not content equality or signature completion. Use the existing verified Dotloop handoff for human signing; no signature-send/status endpoint is assumed from the transcript or old docs.

### R-F10-08 — Make receipt-time and meeting validation resumable

Deliver a concise “when materials arrive” checklist and a meeting validation script. Intake -> review coverage -> approve mappings -> verify actual filled values -> approve packet -> confirm permitted provider effect -> inspect returned state are separate resumable checkpoints. Begin now with known missing inputs; do not wait to implement refusal/recovery/UI paths. Keep template-specific accuracy and live customer/provider observations pending until actually run.

**Data, state, and integration contract.**

Reuse private versioned source/publication records and immutable packet snapshots. New mapping/fill metadata is additive, bounded, and tied to existing access/retention patterns. Exact final format support is determined at real intake; this spec does not predeclare the actual form field names, legal wording, signer coordinates, or a replacement PDF stack.

**Failure, retry, cancellation, and concurrency.**

A failed upload/review keeps accepted earlier versions and unapplied draft mappings. Concurrent edits require revision review. Replacing an approved template invalidates dependent unexecuted preparations, not historical executed receipts. Ambiguous provider creation/upload is reconciled through the existing owning receipt path, never retried blindly.

**Agent and loop contract.**

The entry trigger is an explicit authorized user interaction or a later authorized implementation run, not file receipt, elapsed time, a model inference, or a meeting date. Inputs are the actual current source snapshot, app-owned state, reviewed configuration, and actor scope. Reads produce typed evidence/readiness; ordinary saves use existing audited state services; an external effect uses only its owning exact confirmed-action service. State changes are re-read before success is displayed. Cancelled undispatched actions have no effect; dispatched/ambiguous effects are reconciled, not blindly retried. No new background agent, worker, polling loop, or scheduler is created by this feature.

For F13, this contract applies to evidence gathering only: there is no application mutation loop. For F12, meeting preparation/observation does not execute the described customer actions. Future meetings, material receipt, and provider activation remain distinct from implementation termination.

**In scope / out of scope.**

In scope: material intake readiness, mapping/applicability schema, deterministic fill boundary, truthful previews, approved-derived-artifact binding, provider readiness/recovery, and later-validation script. Out of scope: drafting legal forms, signature forgery, public uploads, activation by file receipt, switching to DocuSign because notes use that name, or treating unsupported filling as successful autofill.

**Open questions & assumptions.**

External: actual seven files and their approved coverage; exact fields, repeated-field and signer mappings; real file-format support; provider credentials/selection/activation. These gate template-specific production outputs, not scaffolding. The raw transcript/current app use Dotloop; the note summary’s DocuSign reference is not a provider-switch instruction.

Unverified business/provider facts cannot be replaced by a plausible default. An explicitly labeled presentation/engineering default may be implemented within the approved scope; source semantics, policy applicability, legal wording, and provider permissions require their actual evidence. Missing input blocks only the dependent outcome identified below.

**Cross-product impacts.**

These are verified paths or explicitly marked candidate owners, not authorization to replace them:

- S66: `docs/feature-suites/lease-document-packet-truth-and-prefill.md` and existing `lib/lease-documents/` owners — packet truth, applicability, snapshot, and mapping.

- S34: `docs/feature-suites/dotloop-esign-activation.md` and its existing provider/executor — exact artifact bytes, loop identity, upload/readback, and recovery.

- S106: current Dotloop connection/readiness implementation and `app/connections/page.tsx` — credentials, selected resources, and setup status.

- Existing S21 trusted-content publication and Drive artifact paths — inspect concrete upload/approval owners; do not create a parallel document store.

Update only affected current contracts and facts after verification. Existing historical evidence remains historical. Original approval numbers remain stable; any later S-number remap must update all namespaced acceptance and outcome references consistently.

**Authority and evidence map.**

| Source          | Location                                                                                                                            | What it supports and what it does not                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T10             | Transcript 00:46:12–00:47:24; parsed lines 1644–1658                                                                                | Seven blank forms with field and signer mappings requested to reduce repeated paperwork entry.                                                                    |
| U10             | User clarification on 2026-09-18                                                                                                    | Scaffold all possible outcomes now; validation follows at meetings or when templates arrive.                                                                      |
| R10             | `docs/feature-suites/lease-document-packet-truth-and-prefill.md`; `dotloop-esign-activation.md`; `docs/open-blockers.md`            | Existing exact content/packet/provider boundaries; field preview is not filled bytes; seven artifact families have required approved mappings.                    |
| Shared baseline | `AGENTS.md`; `docs/facts.md`; `docs/loop-state.md`; `docs/feature-suites/TEMPLATE.md` at `d61eecf309fef75f5fe0a80f8f203c1d24c6804a` | Existing architecture/safety and document shape. The user’s latest approval controls new product scope; F08 expressly supersedes earlier enabled-Sheet execution. |

Transcript references use the supplied **Cherry Bridge + PMI: App Training, September 17, 2026** file and its conversation-parsed line numbers/timestamps. See source and decision log (from the 2026-09-18 export-pack evidence log) for filenames, source limitations, and conflicts. No raw customer details or secret values are reproduced here.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S130-1** — The owning boundaries listed above implement the data and state contract without a duplicate authoritative workflow, provider reader, or competing status model. A focused structural/service test or, for F13, a source-traceable assessment artifact demonstrates the named ownership and exact inputs/outputs.
- **ARCH-S130-2** — Actor scope, provenance/version binding, no-effect reads, explicit unavailable states, and existing effect/receipt boundaries remain enforced. Tests inject denied, missing, stale, conflicting, or interrupted evidence and assert the exact refusal/recovery described by each requirement.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S130-1** — R-F10-01: Prepare a seven-family intake manifest. The observable result must satisfy AC-S130-1; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S130-2** — R-F10-02: Validate real uploads without inventing a parser result. The observable result must satisfy AC-S130-2; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S130-3** — R-F10-03: Map exact fields and signer roles. The observable result must satisfy AC-S130-3; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S130-4** — R-F10-04: Distinguish preview from actual filled output. The observable result must satisfy AC-S130-4; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S130-5** — R-F10-05: Bind derived artifacts to the approved originals. The observable result must satisfy AC-S130-5; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S130-6** — R-F10-06: Prepare conditional packet and provider readiness. The observable result must satisfy AC-S130-6; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S130-7** — R-F10-07: Preserve one-attempt packet execution and human signing. The observable result must satisfy AC-S130-7; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S130-8** — R-F10-08: Make receipt-time and meeting validation resumable. The observable result must satisfy AC-S130-8; a UI label alone is insufficient where a service/provider boundary is required.

**Human litmus outcome.**

### Seven-template intake and Dotloop prefill readiness

**If this was built correctly:** When forms arrive, staff know where to upload and review them, see exactly what is missing, reuse lease facts across documents, and can tell the difference between a field worksheet, a genuinely filled file, an uploaded packet, and a signed lease.

- Model/engineering verdict: NOT RUN — this export specifies checks; it does not execute application tests or claim their results.
- Human verdict: NOT RUN — no human observer.
- Human/customer-specific validation is explicitly deferred to the next meetings or material-receipt review. Technical readiness may pass earlier without changing this verdict.

**Requirement-to-outcome traceability.**

| Requirement | Owning boundary                                    | Architecture             | Behavior   | Acceptance / test scenario                                         |
| ----------- | -------------------------------------------------- | ------------------------ | ---------- | ------------------------------------------------------------------ |
| R-F10-01    | S66 catalog / trusted-source intake                | ARCH-S130-1, ARCH-S130-2 | BEH-S130-1 | AC-S130-1: Prepare a seven-family intake manifest                  |
| R-F10-02    | existing intake / proposed bounded format adapter  | ARCH-S130-1, ARCH-S130-2 | BEH-S130-2 | AC-S130-2: Validate real uploads without inventing a parser result |
| R-F10-03    | S66 field/participant mapping                      | ARCH-S130-1, ARCH-S130-2 | BEH-S130-3 | AC-S130-3: Map exact fields and signer roles                       |
| R-F10-04    | proposed filling boundary / S34 handoff            | ARCH-S130-1, ARCH-S130-2 | BEH-S130-4 | AC-S130-4: Distinguish preview from actual filled output           |
| R-F10-05    | S66 snapshot / S21 publication / S34 byte resolver | ARCH-S130-1, ARCH-S130-2 | BEH-S130-5 | AC-S130-5: Bind derived artifacts to the approved originals        |
| R-F10-06    | S66 applicability / S106 readiness                 | ARCH-S130-1, ARCH-S130-2 | BEH-S130-6 | AC-S130-6: Prepare conditional packet and provider readiness       |
| R-F10-07    | S34 executor / evidence projection                 | ARCH-S130-1, ARCH-S130-2 | BEH-S130-7 | AC-S130-7: Preserve one-attempt packet execution and human signing |
| R-F10-08    | F12 checklist / S66-S34 integrated tests           | ARCH-S130-1, ARCH-S130-2 | BEH-S130-8 | AC-S130-8: Make receipt-time and meeting validation resumable      |

Every acceptance scenario below is a required test or evidence deliverable, not a reported pass. For unaffected already-implemented behavior, retain the existing test as preservation evidence rather than duplicating it.

**Preservation set.**

S66 immutable truth and applicability; S21 exact approved-byte checks; S106 connection guards; S34 one-attempt/receipt recovery and human signing; no legal text invention; F08 Sheet pause.

Keep preservation results separate from new-feature results. Passing one does not compensate for failing the other.

**Adversarial acceptance checks.**

- **AC-S130-1** — R-F10-01 / BEH-S130-1, ARCH-S130-1 and ARCH-S130-2: An empty manifest is usable and honestly pending; seven differently named files cannot satisfy seven families without reviewed coverage. One family may require multiple files or be not applicable to a particular lease.

- **AC-S130-2** — R-F10-02 / BEH-S130-2, ARCH-S130-1 and ARCH-S130-2: Wrong format, empty/corrupt file, malicious instructions, duplicate content, and static-versus-fillable fixtures produce explicit accepted-for-review or unsupported outcomes; none activates a template or provider key.

- **AC-S130-3** — R-F10-03 / BEH-S130-3, ARCH-S130-1 and ARCH-S130-2: A multi-tenant, multi-pet, multi-form local fixture populates all explicitly mapped repeats consistently; a renamed required field, wrong signer role, missing source, or conflicting template version fails before finalization.

- **AC-S130-4** — R-F10-04 / BEH-S130-4, ARCH-S130-1 and ARCH-S130-2: For a supported synthetic fillable fixture, inspect generated bytes/fields and match expected values. A static fixture yields a labeled manual handoff and does not pass the machine-autofill acceptance. No empty PDF is called prefilled.

- **AC-S130-5** — R-F10-05 / BEH-S130-5, ARCH-S130-1 and ARCH-S130-2: Changing one approved term, template byte, or mapping yields a new reviewed output identity; stale approvals fail. A forged output hash or unapproved derived file cannot reach upload.

- **AC-S130-6** — R-F10-06 / BEH-S130-6, ARCH-S130-1 and ARCH-S130-2: A no-pet/no-HOA reviewed fixture omits those conditional documents while a genuinely required form blocks its packet. Credentials without mappings, mappings without connection, and closed keys each show the exact separate dependency.

- **AC-S130-7** — R-F10-07 / BEH-S130-7, ARCH-S130-1 and ARCH-S130-2: Controlled provider tests cover one loop, duplicate confirmation, upload partial failure, lost response, wrong template, and recovery without extra creates. Signed state remains false/unknown without required signature evidence.

- **AC-S130-8** — R-F10-08 / BEH-S130-8, ARCH-S130-1 and ARCH-S130-2: A local end-to-end test moves from no materials to synthetic reviewed materials and exercises every checkpoint. The real meeting record remains pending, with no invented template content or successful live upload.

- **AC-S130-9** — ARCH-S130-2, preservation gate: run the named existing checks and assert no unintended customer sends, source mutations, paid lookups, actor widening, historical-evidence rewrite, or new background work. F08 must remain paused where installed; missing optional dependencies do not disable unrelated work.
- **AC-S130-10** — Evidence gate: the final result separately reports engineering tests, deployed readback if performed, missing external inputs, provider-specific verification, and human meeting observations. No unrun result is PASS, and no fake-provider success is described as a live customer outcome.

**Forbidden actions / hard gates.**

No autonomous customer sends, synthetic production customers, browser-driven provider workarounds, new identities, expanded roles, new action keys, or unreviewed protected-path changes. Opening, filtering, sorting, copying, inspecting, and refreshing must not authorize a write or advance a renewal. Preserve exact human confirmation, durable attempts, receipts, readback, and explicit reconciliation for separately authorized effects. A saved status, draft, uploaded file, matching provider record, or passed test is not proof of a sent message, valid signature, or completed customer workflow.

F08 is the only approved policy change in this pack: pause operating-Sheet mutations while preserving reads. It does not turn off supported RentVine operations or erase historical Sheet receipts. This export itself changes no runtime setting, repository file, account, calendar event, or provider record.

**Dependencies / sequencing.**

S66/S21/S106/S34 own their existing responsibilities. F06 formats app displays; F09 provides current reviewed terms; F11 supplies optional policy-content readiness; F12 owns meeting evidence. No new project or duplicate executor is started on receipt.

**Standalone delivery contract.**

- **Deliverable now, in a later implementation task:** The intake/manifest/mapping/fill contract and supported-format local harness, precise unsupported paths, integrated fake-provider tests, and receipt-time/meeting checklist. Real-form autofill acceptance remains a separate result.
- **Consumes, but does not assume:** the exact source/configuration/cross-feature inputs above; missing or unverified values retain their explicit unavailable representation.
- **Externally blocked or deferred outcome:** Approved real files and mappings; actual supported filling route for those files; managed connection and selected resources; separately authorized exact keys; future human/live validation.
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

Keep this specification independent of adjacent features until its own code/evidence and remaining dependencies are represented by current implementation contracts, tests, and facts. Preserve the original F10 approval mapping. Do not delete an external-input or meeting-validation gap merely because scaffolding passed. If existing behavior already meets part of the spec, link that evidence and merge only redundant explanatory prose—not acceptance coverage, history, or the user’s separate-feature boundary.
