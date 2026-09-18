<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-meeting-readiness-2026-09 -->

# S129 — Owner and tenant draft workflows: technical readiness for meeting validation

> **Approval reference:** F09 (original feature #9).
> **Status:** SPECIFICATION ONLY — scope approved; no implementation, deployment, provider activation, or meeting validation performed by this export.
> **Export date:** 2026-09-18. **Repository baseline:** `d61eecf309fef75f5fe0a80f8f203c1d24c6804a`.
> **Registration:** S129 is a proposed allocation following the inspected S120 sequence, not a reservation or a claim of repository registration. Check for collisions on import, including the separately written F05 spec; preserve F09 when renumbering.
> **Classification:** Scaffold, gap closure, and technical verification of existing communications.

**Goal.**

Before the meeting, all app-owned draft preparation, readiness checks, recovery, and handoff paths are implemented and technically tested; actual staff/customer workflow validation remains for the meeting.

**Core outcome alignment.**

C05 — Meeting-ready owner/tenant preparation; C04 — Human-reviewed, unsent effects only. See suite outcome contract (from the 2026-09-18 export-pack index). This file is a standalone feature specification; the index coordinates shared ownership and does not combine implementation scope.

**Current state / intended end state.**

**Current evidence:** S113/S120 record source-filled message preparation, missing-input routing, formatted/plain copy, same-sender signature reuse, deliberate charge fill, and governed Gmail draft creation as implemented. The transcript’s “last connector piece” is not proof of a specific missing component. The runner must trace the current path and fix demonstrated gaps rather than rebuilding email composition.

**Required end state:** Each audience has a tested path from known facts through missing-input review to final preview and a human-confirmed unsent Gmail draft or an honest blocked handoff. The meeting pack identifies exact external prerequisites and later validation steps; no live customer draft/send is created merely to claim readiness.

Current statements are grounded in the source map below at the pinned revision; they are not a fresh production readback. All new data shapes, labels, and defaults introduced here are proposed requirements unless explicitly identified as existing code or an owner decision.

**Actors and entry conditions.**

Existing authorized renewal operators prepare and review. The signed-in managed sender uses the existing Gmail draft permission/key and mailbox. Readers cannot mutate. Owner approval of business terms, staff review of the final body, and provider-action confirmation remain separate.

**What it is / how it functions.**

### R-F09-01 — Trace and certify the existing path

Inventory owner and tenant preparation through server validation, content generation, copy/preview, provider preview/confirmation, draft receipt/readback, and handoff. Record each dependency as available, missing input, permission/configuration unavailable, or not yet verified, with its owning control. A successful static preview does not certify Gmail delivery readiness. Do not invent the missing connector from the transcript.

### R-F09-02 — Prepare source-backed, audience-specific content

Fill owner/tenant names, verified contacts, property/unit, current base rent, dates, reviewed market evidence, and applicable terms from the existing authoritative projection. Tenant offers require explicit current owner-approved terms. Recurring and one-time charges stay distinct; unknown applicability/amounts remain missing inputs. Existing comp behavior is consumed unchanged: F05 is excluded.

### R-F09-03 — Make review and finalization a single coherent flow

As staff fill preparation, use one readiness result to explain missing fields and route to their exact controls. Preserve app-owned save and preview when a connector/resource is unavailable; block final copy/draft content only where required content is unresolved. No placeholder URLs, unsupported policy text, or unset charges may leak into a final customer-ready body. The final reviewed snapshot must match the one submitted.

### R-F09-04 — Preserve correct recipients, sender, and signature

Keep owner and tenant audiences separate; include the existing verified multi-recipient and staff-Cc rules without inventing new recipients. Reuse signatures only for the same signed-in managed sender. Show sender/mailbox and recipients for exact review; a changed sender/contact/source invalidates affected prior approval. Never adopt another operator’s signature or mailbox.

### R-F09-05 — Create an unsent draft only on explicit confirmation

Preserve the existing exact human preview/confirmation, current key/permission, one-attempt claim, receipt, and readback. Readiness checks, navigation, saving, copying, and meeting preflight MUST not create a draft. The app hands the operator to the verified Gmail destination after confirmed creation; only a person sends in Gmail. F03 confirmed non-renewal conflicts are rechecked at the effect boundary.

### R-F09-06 — Recover without duplicate or destructive drafts

Reuse the existing attempt/receipt/reconciliation path for duplicate submits, response loss, changed inputs, and partial provider success. Do not retry an ambiguous create, overwrite a human-edited Gmail draft, or treat an existing matching subject as proof this attempt created it. A stale preparation offers re-review; a missing connector offers the current connection handoff without discarding work.

### R-F09-07 — Deliver a meeting-ready preflight, not a live verdict

Provide an operator checklist with actual source-read freshness, required inputs, current actor/mailbox, template/resource versions, permitted actions, and exact fallback paths. Run deterministic unit/backend/integrated browser checks now using controlled providers. Keep actual selected-lease, Gmail-draft, sender/recipient, and human-wording validation marked Pending meeting until observed. Preflight must not send or perform paid comps.

**Data, state, and integration contract.**

Reuse existing preparation records, immutable current reviewed snapshots, source versions, managed-sender signature records, attempts, and receipts. Store no new generalized inbox or body archive. Any test fixture data is local-only; actual customer details remain within existing authorized stores.

**Failure, retry, cancellation, and concurrency.**

Save-before-handoff and reload resume the same preparation. Failed mailbox or resource checks leave app work intact. Revoked access fails closed; do not auto-reconnect, auto-authorize, or create a new account. An ambiguous provider result remains a named recovery case until the owning contract resolves it.

**Agent and loop contract.**

The entry trigger is an explicit authorized user interaction or a later authorized implementation run, not file receipt, elapsed time, a model inference, or a meeting date. Inputs are the actual current source snapshot, app-owned state, reviewed configuration, and actor scope. Reads produce typed evidence/readiness; ordinary saves use existing audited state services; an external effect uses only its owning exact confirmed-action service. State changes are re-read before success is displayed. Cancelled undispatched actions have no effect; dispatched/ambiguous effects are reconciled, not blindly retried. No new background agent, worker, polling loop, or scheduler is created by this feature.

For F13, this contract applies to evidence gathering only: there is no application mutation loop. For F12, meeting preparation/observation does not execute the described customer actions. Future meetings, material receipt, and provider activation remain distinct from implementation termination.

**In scope / out of scope.**

In scope: existing-path inventory, missing wiring, deterministic technical verification, source/resource readiness, recovery, and meeting preflight. Out of scope: general inbox features, autonomous sending, a new template policy, rebuilding excluded F05, or claiming the meeting has validated the workflow.

**Open questions & assumptions.**

Actual meeting lease(s), sender and recipient review, and any still-missing verified resource URLs are external inputs. The exact connector gap must be established from code/runtime evidence; none is presumed. Missing inputs constrain only their dependent live action.

Unverified business/provider facts cannot be replaced by a plausible default. An explicitly labeled presentation/engineering default may be implemented within the approved scope; source semantics, policy applicability, legal wording, and provider permissions require their actual evidence. Missing input blocks only the dependent outcome identified below.

**Cross-product impacts.**

These are verified paths or explicitly marked candidate owners, not authorization to replace them:

- `components/lease-renewal/RenewalProgressControls.tsx` and the existing notice-draft composer — preparation, preview, and missing-input controls.

- `lib/lease-renewal/owner-draft.ts`, `tenant-draft.ts`, and `recipient-resolution.ts` — existing audience-specific composition and contacts.

- `lib/lease-renewal/message-market-evidence.ts` and `workspace-state.ts` — saved evidence and preparation/cycle binding.

- `lib/firestore/renewal-sender-signatures.ts` — same-sender signature reuse.

- Existing `/api/lease-renewal/renewal-notice-draft` and owning Gmail draft service — inspect exact implementation before changing; preserve unsent-only effects.


Update only affected current contracts and facts after verification. Existing historical evidence remains historical. Original approval numbers remain stable; any later S-number remap must update all namespaced acceptance and outcome references consistently.

**Authority and evidence map.**

| Source | Location | What it supports and what it does not |
| --- | --- | --- |
| T09 | Transcript 00:40:49–00:42:50; parsed lines 1506–1542 | Source-filled owner/tenant preparation, previews, missing inputs, charges, and Gmail draft-folder handoff. |
| U09 | User clarification on 2026-09-18 | Scaffold everything possible now; actual validation occurs at the next meetings. |
| R09 | `docs/loop-state.md`; S113 F3; `docs/products/lease-renewal-agent.md` | Existing implementation is a reuse baseline, not a reason to assert live meeting acceptance. |
| Shared baseline | `AGENTS.md`; `docs/facts.md`; `docs/loop-state.md`; `docs/feature-suites/TEMPLATE.md` at `d61eecf309fef75f5fe0a80f8f203c1d24c6804a` | Existing architecture/safety and document shape. The user’s latest approval controls new product scope; F08 expressly supersedes earlier enabled-Sheet execution. |

Transcript references use the supplied **Cherry Bridge + PMI: App Training, September 17, 2026** file and its conversation-parsed line numbers/timestamps. See source and decision log (from the 2026-09-18 export-pack evidence log) for filenames, source limitations, and conflicts. No raw customer details or secret values are reproduced here.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S129-1** — The owning boundaries listed above implement the data and state contract without a duplicate authoritative workflow, provider reader, or competing status model. A focused structural/service test or, for F13, a source-traceable assessment artifact demonstrates the named ownership and exact inputs/outputs.
- **ARCH-S129-2** — Actor scope, provenance/version binding, no-effect reads, explicit unavailable states, and existing effect/receipt boundaries remain enforced. Tests inject denied, missing, stale, conflicting, or interrupted evidence and assert the exact refusal/recovery described by each requirement.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S129-1** — R-F09-01: Trace and certify the existing path. The observable result must satisfy AC-S129-1; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S129-2** — R-F09-02: Prepare source-backed, audience-specific content. The observable result must satisfy AC-S129-2; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S129-3** — R-F09-03: Make review and finalization a single coherent flow. The observable result must satisfy AC-S129-3; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S129-4** — R-F09-04: Preserve correct recipients, sender, and signature. The observable result must satisfy AC-S129-4; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S129-5** — R-F09-05: Create an unsent draft only on explicit confirmation. The observable result must satisfy AC-S129-5; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S129-6** — R-F09-06: Recover without duplicate or destructive drafts. The observable result must satisfy AC-S129-6; a UI label alone is insufficient where a service/provider boundary is required.

- **BEH-S129-7** — R-F09-07: Deliver a meeting-ready preflight, not a live verdict. The observable result must satisfy AC-S129-7; a UI label alone is insufficient where a service/provider boundary is required.


**Human litmus outcome.**

### Owner and tenant draft workflows: technical readiness for meeting validation

**If this was built correctly:** At the meeting, staff can prepare an owner message and a tenant offer from the lease, fix each missing input in place, review the exact content, and deliberately create one unsent draft when the real prerequisites allow it.

- Model/engineering verdict: NOT RUN — this export specifies checks; it does not execute application tests or claim their results.
- Human verdict: NOT RUN — no human observer.
- Human/customer-specific validation is explicitly deferred to the next meetings or material-receipt review. Technical readiness may pass earlier without changing this verdict.

**Requirement-to-outcome traceability.**

| Requirement | Owning boundary | Architecture | Behavior | Acceptance / test scenario |
| --- | --- | --- | --- | --- |
| R-F09-01 | composition / draft route / readiness | ARCH-S129-1, ARCH-S129-2 | BEH-S129-1 | AC-S129-1: Trace and certify the existing path |
| R-F09-02 | owner-draft / tenant-draft / recipient-resolution | ARCH-S129-1, ARCH-S129-2 | BEH-S129-2 | AC-S129-2: Prepare source-backed, audience-specific content |
| R-F09-03 | readiness / preparation / final-body validators | ARCH-S129-1, ARCH-S129-2 | BEH-S129-3 | AC-S129-3: Make review and finalization a single coherent flow |
| R-F09-04 | recipient-resolution / renewal-sender-signatures | ARCH-S129-1, ARCH-S129-2 | BEH-S129-4 | AC-S129-4: Preserve correct recipients, sender, and signature |
| R-F09-05 | Gmail owning effect service / F03 | ARCH-S129-1, ARCH-S129-2 | BEH-S129-5 | AC-S129-5: Create an unsent draft only on explicit confirmation |
| R-F09-06 | draft effect recovery / app projection | ARCH-S129-1, ARCH-S129-2 | BEH-S129-6 | AC-S129-6: Recover without duplicate or destructive drafts |
| R-F09-07 | F12 meeting pack / existing checks | ARCH-S129-1, ARCH-S129-2 | BEH-S129-7 | AC-S129-7: Deliver a meeting-ready preflight, not a live verdict |


Every acceptance scenario below is a required test or evidence deliverable, not a reported pass. For unaffected already-implemented behavior, retain the existing test as preservation evidence rather than duplicating it.

**Preservation set.**

Approved existing v2 templates; no autonomous sends; recipient separation; same-sender signature privacy; snapshot staleness and receipt recovery; F05 comp behavior; F08 read-only operating-Sheet policy.

Keep preservation results separate from new-feature results. Passing one does not compensate for failing the other.

**Adversarial acceptance checks.**

- **AC-S129-1** — R-F09-01 / BEH-S129-1, ARCH-S129-1 and ARCH-S129-2: An evidence matrix ties each user-visible step to the actual current service/control and a deterministic check; any missing path becomes a concrete bounded defect with no fabricated green status.

- **AC-S129-2** — R-F09-02 / BEH-S129-2, ARCH-S129-1 and ARCH-S129-2: Multi-owner/tenant, missing-contact, changed-owner-terms, missing-charge, and manual-versus-provider market evidence fixtures produce the correct audience-specific content and block only unsupported final output.

- **AC-S129-3** — R-F09-03 / BEH-S129-3, ARCH-S129-1 and ARCH-S129-2: Resolve missing inputs in sequence, save/reopen, and observe matching preview/plain/rich bodies. A missing required flyer or policy block cannot be bypassed by direct draft creation or an old reviewed snapshot.

- **AC-S129-4** — R-F09-04 / BEH-S129-4, ARCH-S129-1 and ARCH-S129-2: Two managed senders preparing the same lease receive only their own signatures/mailboxes; cross-audience email leakage, unknown contacts, and changed recipient snapshots are refused.

- **AC-S129-5** — R-F09-05 / BEH-S129-5, ARCH-S129-1 and ARCH-S129-2: Controlled Gmail tests show zero effects before confirmation, one correct unsent draft after confirmation, a receipted handoff, and no send path. A notice arriving after preview prevents a new ordinary renewal draft.

- **AC-S129-6** — R-F09-06 / BEH-S129-6, ARCH-S129-1 and ARCH-S129-2: Double clicks return the same known outcome; lost create response produces reconciliation rather than another draft; a manually edited provider draft is preserved; failed refresh cannot manufacture a sent status.

- **AC-S129-7** — R-F09-07 / BEH-S129-7, ARCH-S129-1 and ARCH-S129-2: The readiness record distinguishes technically tested composition from unavailable live input; the meeting script can proceed through preparation with Gmail unavailable and clearly identifies the unsent-draft validation step that remains pending.

- **AC-S129-8** — ARCH-S129-2, preservation gate: run the named existing checks and assert no unintended customer sends, source mutations, paid lookups, actor widening, historical-evidence rewrite, or new background work. F08 must remain paused where installed; missing optional dependencies do not disable unrelated work.
- **AC-S129-9** — Evidence gate: the final result separately reports engineering tests, deployed readback if performed, missing external inputs, provider-specific verification, and human meeting observations. No unrun result is PASS, and no fake-provider success is described as a live customer outcome.

**Forbidden actions / hard gates.**

No autonomous customer sends, synthetic production customers, browser-driven provider workarounds, new identities, expanded roles, new action keys, or unreviewed protected-path changes. Opening, filtering, sorting, copying, inspecting, and refreshing must not authorize a write or advance a renewal. Preserve exact human confirmation, durable attempts, receipts, readback, and explicit reconciliation for separately authorized effects. A saved status, draft, uploaded file, matching provider record, or passed test is not proof of a sent message, valid signature, or completed customer workflow.

F08 is the only approved policy change in this pack: pause operating-Sheet mutations while preserving reads. It does not turn off supported RentVine operations or erase historical Sheet receipts. This export itself changes no runtime setting, repository file, account, calendar event, or provider record.

**Dependencies / sequencing.**

F03/F07/F08/F06 affect disposition, guidance, pause, and dates. F11 supplies an inactive-safe policy-content contract; F12 owns the shared meeting record. Independent technical acceptance uses explicit unavailable fixtures.

**Standalone delivery contract.**

- **Deliverable now, in a later implementation task:** A technically complete and tested preparation/draft/recovery path, current dependency matrix, and rehearsal/meeting checks. Engineering acceptance is separate from future human and customer-specific validation.
- **Consumes, but does not assume:** the exact source/configuration/cross-feature inputs above; missing or unverified values retain their explicit unavailable representation.
- **Externally blocked or deferred outcome:** Actual selected-lease validation, live mailbox/recipient review, and any authorized draft creation during the meeting. Every live effect still needs its own permission and confirmation.
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

Keep this specification independent of adjacent features until its own code/evidence and remaining dependencies are represented by current implementation contracts, tests, and facts. Preserve the original F09 approval mapping. Do not delete an external-input or meeting-validation gap merely because scaffolding passed. If existing behavior already meets part of the spec, link that evidence and merge only redundant explanatory prose—not acceptance coverage, history, or the user’s separate-feature boundary.
