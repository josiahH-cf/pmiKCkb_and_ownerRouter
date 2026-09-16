<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-operator-hub-v1 -->

# S115 — Plain-language section help and lower-noise renewal workspaces

> Status: COMPLETE / DEPLOYED. Implemented at `dffc4f71`; released on 2026-09-16 as head `3ca35870` / `pmi-kc-app-rmu4awn6p-67bd97a8824e` on its second attempt (attempt 1 rolled back with verification after the production canary raced the work board's loading heading, fixed in `f3406f3d`). verify.sh, core E2E, both compiled renewal browser checks, candidate assurance, receipt-bound promotion, the 300,000 ms observation and the independent readbacks passed. Human verdict: NOT RUN — no human observer.

**Repository:** `josiahH-cf/pmiKCkb_and_ownerRouter` (`pmi-kc-kb`).  
**Canonical file:** `docs/feature-suites/renewal-plain-language-section-guidance.md`.  
**Authoring baseline:** `e903b68aa4efa2462f565f225d562924a57ccf8b`; re-read current main before implementation.  
**Requested execution order:** S114 → S115 → S116 → S117 → S118 → S119 → S120. This is feature 2 of 7 in this request, not the earlier September 14 batch.

**Goal.**

Make every renewal section understandable to a first-time operator while keeping the main work surface focused on headings, actual facts, inputs, actions and actionable missing information. Move supplementary process prose into small PMI-styled information controls and the existing process guide, not into more visible paragraphs.

**Current state / intended end state.**

The current `RenewalWorkspace.tsx`, `dashboard-sections.ts` and child panels retain introductory/subsection paragraphs, including “Start here,” source-update explanations and message-preparation guidance. The process glossary already describes many outcomes, but it is not the separate section-level help requested by the transcript. The existing `components/ui/InfoTip.tsx` provides hover, focus and transient-layer behavior; this is an integration/content change, not a need for a new tooltip library.

The intended result is consistent section-specific `i` help throughout this lease-renewal workspace, for every lease, with plain-English ordered instructions that identify what the section does, which input matters, what saving changes and what does not happen. The supplied capture's pages 2–19 define the affected work surface; this is not the unrelated product-wide decluttering backlog.

**Actors and entry conditions.**

All existing authorized viewers can use the guidance, including first-time users and keyboard/touch users. The wording and next-action routing must respect the viewer’s current capabilities and the lease’s actual readiness; help cannot grant an Editor Admin execution or turn inspection-only work into writable work.

**What it is / how it functions.**

### R115.1 — Separate section help from the process sidebar

Add the requested small, contrasting white/black `i` treatment in the existing PMI visual system at relevant section and subsection headings. Reuse `InfoTip` and existing accessible controls. Hover reveals the help; focus/keyboard and touch provide equivalent access. Keep it readable, dismissible and within the viewport. A process guide is a table of contents; an information control explains the work at its own heading. Do not collapse those two purposes into one long global help block.

Reprocess, rather than merely relocate, the existing subtext. Use plain English addressed to someone seeing the concept for the first time: a short purpose and numbered Step 1/Step 2/Step 3 where a real sequence exists, what is saved, where it goes, and the next real action. Do not invent steps to fill a format or expose internal hashes/action keys as instructions. Field labels must still make their requested business value clear without requiring a tooltip to identify the field.

### R115.2 — Cover the actual renewal work surface

| Area                                             | Required help meaning and visible distinction                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lease details / lease term / cycle               | Inspect the live term and dates; record a supported term review with its reason and reviewed anchor when applicable. Explain that this is an app-owned review used by term/renewal eligibility, not a RentVine rewrite, signature or owner approval. Distinguish lease-end date, renewal date and month-to-month review anchor; explain which later cycle/preparation uses them. |
| Rent and charges / corrections                   | Identify current contractual base rent, lease total, unit-listed reference and separate charges. Distinguish correcting today's facts from future approved terms. Show the selected destination and the fact that an app save/proposal is not source synchronization. S117 delivered the master editing interaction inside the Rent and charges working area.                    |
| Data check                                       | Explain source agreement, single-source, conflict, missing/stale and resolved states; a provider-sourced badge is not proof of cross-source agreement. The operator must be able to reach the actual comparison or source.                                                                                                                                                       |
| RentVine updates / Review Sheet updates          | Explain what is prepared, what an authorized person reviews/confirms, and how success or recovery is established. Replace opaque prose such as “An Editor can assemble one from fresh state and exact terms” with the actual input/action/role and saved destination. An absent proposal is not a source failure.                                                                |
| Market comparison                                | Explain starting defaults versus sourced results, review/save, reference-only pricing, the explicit lookup and its source link. S118 owns the accepted formula/default and fallback changes; do not present a future implementation as already available.                                                                                                                        |
| Owner / tenant preparation and response          | Explain the correct communicate-then-record-response sequence; distinguish saved preparation, copying, an unsent draft, actual sending and recorded delivery/response. Explain which saved terms supply the next audience.                                                                                                                                                       |
| Message fields / missing inputs                  | Explain response-request wording as a paragraph replacement, not a workflow action. Required gaps remain linked to the actual field; optional wording is not a blocker. S120 owns the completed auto-fill/copy-gate interaction.                                                                                                                                                 |
| Documents / signatures / follow-ups / completion | Explain existing applicable document and follow-up work, its fact sources, existing human/provider handoffs, and separate staff-recorded versus provider-verified completion. A static form location is not approved legal content or a signature.                                                                                                                               |

Apply the same distinction to source-update summaries, prior evidence/history and resource locations. Keep deep technical/historical detail in the existing disclosures or appropriate help, not duplicated inline. The entire actual form/control inventory matters, not only the five top-level headings.

### R115.3 — Hide explanation, not the information needed to act

Remove the standalone “Start here” introduction and redundant procedural paragraphs from the work area once their useful meaning is available in the sidebar/help. Keep headings, meaningful labels, source values and destinations, the next actionable control and unresolved required input/error/refusal visible. Do not hide fresh errors, expired confirmation windows, ambiguous execution, costs/consequences that must precede confirmation, or the fact that a message is unsent inside hover-only text.

Genuinely manual required fields must be visibly called out through the existing error/attention styling and a textual cue; color alone is insufficient under the existing accessibility contract. A source-filled/read-only field should not look like unfinished manual work. A generic “needs input” paragraph, tooltip or disabled button is insufficient when the actual missing field can be identified. Maintain spacing and hierarchy using existing tokens rather than introducing a new design system.

### R115.4 — Guidance remains true after subsequent changes

Keep help aligned with owning behavior and the real current control targets. S116–S120 each update only help made inaccurate by their feature, rather than adding parallel explanatory prose. Existing exact preview/confirmation, source fidelity, manual completion and draft/send boundaries must be expressed in accessible business language. Do not claim a live source write or document effect merely because a section is visible or data was entered.

**In scope / out of scope.**

Only this renewal workspace and its directly used help/labels/styles/control mappings are in scope. This is not a general app redesign, S87 backlog implementation, new onboarding workflow, tutorial product, checklist expansion, additional acceptance round or documentation rewrite unrelated to changed controls.

**Open questions & assumptions.**

No unresolved interpretation remains. The transcript’s section-level information icon is distinct from the process glossary. “Less information noise” does not remove required consequence/confirmation information or conceal actual blocking fields. All instructional copy is grounded in the existing owning operation and the requested feature behavior, not generic property-management advice.

**Cross-product impacts.**

Primary code: `components/lease-renewal/RenewalWorkspace.tsx`, `RenewalDashboardNavigation.tsx`, `RenewalManualWorkspace.tsx`, `RenewalMessagePreparation.tsx`, `RenewalCompPreparation.tsx`, `RenewalCorrections.tsx`, `OperatingSheetPanel.tsx`, `RenewalDocumentHandoff.tsx`, `PacketTruthPanel.tsx`; `lib/lease-renewal/dashboard-sections.ts` and `lease-term.ts`. Reuse `components/ui/InfoTip.tsx`, `Field.tsx` and the current shared theme/layer contracts.

Consult `docs/voice-and-audience.md`, `docs/products/renewal-operator-guide.md` and its machine-read step-to-control mapping, plus `docs/products/renewal-client-walkthrough-2026-09-09.md`. Reconcile changed instructions in place during implementation. Do not alter the underlying role, term, approval or execution models in this feature.

**Authority and evidence map.**

| Source                                                                                                                               | Classification                                               | Application here                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`; current committed code and actual readbacks; `docs/facts.md`                                                            | Governing repository boundaries and implementation evidence  | Re-establish current truth before implementation. The earlier September 14 features and S113 are the baseline, not work to repeat. Older contradictory “candidate-only” prose does not override current code and facts.                              |
| The owner's September 15 renewal notes, transcript, summary, mindmap and supplied 19-page application capture                        | Requested product intent and reported behavior               | The requirements below incorporate the relevant details. “Rent volume” is RentVine; the spoken “Excel” is the configured Google operating Sheet. These private source materials need not be imported or available in an implementation conversation. |
| Owner acceptance of Q1A, Q2A and Q3A                                                                                                 | Resolved specification decisions                             | Where relevant, this file states the complete accepted rule. Acceptance was not a live-write, integration-activation or send authorization.                                                                                                          |
| `docs/autonomous-agent-runner.md`, `docs/environment-handoff.md`, `docs/feature-suites/TEMPLATE.md`, `docs/feature-suites/README.md` | Existing implementation, specification and release contracts | Use the existing complete loop below. No new release process, extra independent review gate or blanket PR requirement is introduced.                                                                                                                 |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S115-1** — Section help reuses current accessible UI and real owning operation semantics, without maintaining a second workflow state or hidden write path.
- **ARCH-S115-2** — Presentation separates supplementary instructions from current actionable state; tests must distinguish explanation relocation from lost blockers/confirmation context.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S115-1** — A first-time operator can discover the purpose, actual steps, saved destination and next action for each affected section through its `i` control without being faced with the old inline prose.
- **BEH-S115-2** — Required missing/manual inputs, live errors and execution consequences remain visible and actionable; optional information is not mislabeled as required.
- **BEH-S115-3** — Keyboard/touch/hover users obtain equivalent help without losing focus, page position, data or permissions.

**Human litmus outcome.**

### Know what a field changes without reading a wall of text

**If this was built correctly:** A new operator sees the lease-term inputs, opens the adjacent information control, and understands what recording a term changes in the app and why it does not edit RentVine. Elsewhere, a genuinely missing field is visibly identified and reachable without searching a paragraph. The workspace is shorter without hiding errors or confirmation consequences.

The implementation runner records the model verdict with actual evidence. Record `Human verdict: NOT RUN — no human observer` when no observer is present; do not invent human acceptance or add it as a release gate.

**Requirement-to-outcome traceability.**

| Requirement                                              | Architecture             | Behavior / human litmus                           | Evidence / falsification                                                                          |
| -------------------------------------------------------- | ------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| R115.1 distinct section help in plain-English steps      | ARCH-S115-1              | BEH-S115-1, BEH-S115-3; know what a field changes | Separate sidebar/help behavior and supported input methods; AC-S115-1.                            |
| R115.2 all existing affected sections covered accurately | ARCH-S115-1              | BEH-S115-1                                        | Each inventory row checked against owning code/control and saved destination; AC-S115-2.          |
| R115.3 reduced noise without hidden blockers             | ARCH-S115-2              | BEH-S115-2                                        | Missing-field, stale-source, pending-write and ambiguous-attempt states remain usable; AC-S115-3. |
| R115.4 truthful guidance and preserved semantics         | ARCH-S115-1, ARCH-S115-2 | BEH-S115-1, BEH-S115-2                            | Labels/help do not assert sends, writes, approval or signatures; AC-S115-4.                       |

**Preservation set.**

Preserve the existing S113 dashboard behavior and source/progress gates, `tests/unit/s113-dashboard.test.tsx`, `tests/unit/s82-desk-copy-contract.test.ts`, current InfoTip/Field/layer accessibility behavior and applicable renewal desk/guide browser coverage. Update intentional wording/selector changes without dropping coverage or weakening the existing compiled guide.

**Adversarial acceptance checks.**

- **AC-S115-1** — R115.1 / ARCH-S115-1 / BEH-S115-1,3: use the section help via hover, focus/keyboard and touch. It must not merely open the global glossary or obscure the needed control.
- **AC-S115-2** — R115.2 / ARCH-S115-1 / BEH-S115-1: check every area in the coverage inventory against the actual save/execute route; a term-review description that promises a RentVine edit, or a response field that implies sending, fails.
- **AC-S115-3** — R115.3 / ARCH-S115-2 / BEH-S115-2: compare normal, missing-input, stale-source and uncertain-write states. Redundant “Start here” prose is relocated; the real next action, required manual field and confirmation consequence remain visible.
- **AC-S115-4** — R115.4 / ARCH-S115-1 / BEH-S115-2: retained guide/control references resolve after relocation, opening help creates no effects, and staff/provider completion and unsent-draft meanings remain separate.

**Forbidden actions / hard gates.**

Preserve managed identity, Renewals Space and role checks; exact Action Registry authority; the Production + Live boundary; and the distinction between source facts, staff reports and provider-verified effects. Never add autonomous/bulk/model-triggered writes or client sends. Gmail initiation ends in an explicitly confirmed unsent draft; a person sends. A link, a saved fact, a chosen status or a checked business decision is not a provider-effect receipt.

Do not widen action keys, change protected paths without their separately required authority, manufacture customer values, use test data in production, rerun completed provider proofs, or add new accounts, dependencies, services, background processes or billing headroom. Preserve `firestore.rules`, `lib/integrations/action-gate.ts`, `lib/auth/**`, action-seed activation flags, budget guards and `scripts/auth/**` under the router's protected-path rules. Customer values, source exports, message bodies, credentials and raw live evidence remain outside Git. Use deterministic synthetic data only in automated tests.

**Dependencies / sequencing.**

Begin only after S114 completes its own applicable release. Consume the resulting accessible sidebar/target layout from current repository code, not the previous conversation. No future pricing, Sheet or messaging feature is required to make current help accurate. Later features own updating the same help for their changed behavior.

**Standalone delivery contract.**

**Deliverable now:** complete section-help integration, reduced inline noise, field-level attention and its existing verification/release evidence. **Consumes, but does not assume:** actual current field/readiness projections and sidebar targets. **Externally blocked effect:** none; missing provider resources are explained, not provisioned. **Produces for downstream suites:** an accessible help/attention convention and accurate current instructions for the existing renewal controls.

**Verification and delivery contract.**

This is a future implementation handoff. Authoring or importing this Markdown is not implementation or release completion.

1. **Re-ground from a fresh context.** Read `AGENTS.md` and `docs/README.md`, then current `docs/facts.md`, `docs/loop-state.md`, `docs/open-blockers.md`, `docs/plan.md`, this file, the relevant owning contracts listed here, and `docs/environment-handoff.md`. Inspect the actual checkout, diff, current main, relevant code and read-only application state; preserve unrelated/user-owned changes. On the approved implementation host run `npm run auth:ensure` using the existing approved identity/store. A human authentication challenge pauses only its dependent phase; never substitute an identity or request secrets. Do not reuse a preceding conversation's source snapshot, lease state, release receipt, candidate or rollback revision.
2. **Establish this feature's evidence.** Record its current behavior and the smallest applicable preservation baseline. Materialize the architecture/behavior falsifications below before the implementation edit, using the existing test harnesses. A requirement already satisfied is preserved, not broken to fabricate fail-first evidence. A historical test-pass claim is not a new result. Implement only this objective, including its applicable error, partial-result and recovery paths.
3. **Run the existing gates for the changed slice.** Run focused tests and an intentional adversarial case, retaining preservation results separately. From the repository root in the documented WSL/native Node environment run:

   ```bash
   bash scripts/verify.sh
   npm run test:e2e:core
   ```

   `scripts/verify.sh` already performs the lockfile install, formatting, lint, type checks, units, Firestore/backend tests, router/falsification/context/path/spec-traceability/copy/redaction gates, budget guard and production build. Keep the documented two-worker Vitest ceiling. Exercise the existing applicable compiled renewal-desk and renewal-guide browser checks; use the existing navbar/theme coverage when this slice touches their shared controls. Do not replace or relax those checks, freshness requirements, role coverage, deadlines or failure accounting. No new blanket test or review program is required by this specification.

4. **Review and record the bounded result.** Audit the diff, secrets/PII, source destinations, exact action gates, runtime configuration, protected paths and rollback. Update only documentation made inaccurate by this feature, including its named operator/control references and the existing facts/status/plan/loop-state records. Do not claim deployed behavior before release. Keep private source captures and receipts outside Git.
5. **Integrate a green feature.** The router permits a green commit/push directly to `main`. When the actual checkout uses a feature branch, complete its applicable existing merge/integration path into `main`; do not invent a mandatory PR or bypass an applicable repository restriction. Preserve unrelated changes and never force-push, rewrite history, delete branches or create a release tag. Require successful CI for the exact integrated main SHA, not merely the branch or PR SHA.
6. **Complete this feature's serialized release.** Reuse the existing release watcher and lock described in `docs/environment-handoff.md`; do not start a competing watcher. `npm run release:watch:dry-run` is the documented print-only inspection. The existing watcher, or its documented `npm run release:watch:once` single-pass path only when it can run without competing ownership, carries the exact-main green change through the established driver. Follow that handoff's current arguments rather than inventing candidate identifiers. The required sequence is print-only plan, captured predecessor/configuration, zero-traffic Cloud Run candidate, exact commit/tag/revision anonymous smoke, authorized-domain and runtime readback, complete Admin assurance plus independent source reconciliation and monitoring, a fresh aggregate candidate-assurance receipt, then receipt-bound exact-revision promotion and 100% traffic readback. Production is project `pmi-kc-kb-prod`, region `us-central1`, service `pmi-kc-app`. Preserve its reviewed runtime identity, eleven Spaces, provider bindings, Sheet switch and allowance unless this feature explicitly changes a named business default in application code.
7. **Reach the actual completion boundary.** Complete the canonical-origin 300,000 ms observation with its immediate and end checkpoints and the bound promotion receipt. Independently read back `/api/version`, Ready state, exact serving commit/revision, traffic, runtime configuration, action state and the feature's applicable owning-page evidence. The current approved browser policy uses the enrolled owner Admin session and records Editor `not_run`; backend Editor/role tests remain required. Candidate and post-promotion assurance remain read-only with zero mutation attempts. The old exception for one exact historical predecessor is not reusable for a new failure. A required rollback must restore and verify the receipt-bound predecessor through the existing recovery path; preserve failed receipts/checkpoints and resume this same feature's loop, not the next feature. Diagnostics alone do not replace aggregate receipts or observation.
8. **Close and only then advance.** Record verified present truth in `docs/facts.md`, `docs/status.md`, `docs/plan.md`, `docs/loop-state.md` and this suite's status/evidence as applicable. Use `ALL_GATES_GREEN` only for passed applicable implementation and release gates; use `BLOCKED` for an exact unresolved required input/authority after independent fail-closed work, and `BUDGET_EXHAUSTED` only with an explicit user budget. Separately identify a resource-dependent live effect not exercised; do not call it operationally verified. A documentation-only import does not deploy an app, but the code/UI changes requested here do require their own release. Complete this feature's applicable cycle before beginning the next objective, then re-read the updated repository and project state as a fresh-context model.

**Ordered prompt sequence.**

1. Re-ground; compare the actual section/control inventory and source/write meanings with the supplied intent embedded here.
2. Establish the help-accessibility, coverage and visible-blocker preservation falsifications.
3. Apply this content/presentation change without absorbing later source, status, pricing or messaging work.
4. Finish this feature's complete verification/integration/release cycle and re-ground before S116.

**Deletion/merge recommendation.**

Register this file once in the existing `docs/feature-suites/README.md` when importing it; use the suite ID, canonical path and sequence given above without replacing unrelated queue rows or marking work complete. No registration or queue edit has been performed by specification authoring. After implementation and applicable release completion, follow the repository's existing retirement rule only when every remaining requirement/dependency is represented by code, tests and current facts. Do not merge these features into one implementation followed by a single final deployment.

Import registration row for the existing suite table (add once; do not replace its other rows):

```markdown
| S115 | `docs/feature-suites/renewal-plain-language-section-guidance.md` | SPECIFICATION READY; feature 2 of 7 in renewal-operator-hub-v1; implementation/release not started. |
```
