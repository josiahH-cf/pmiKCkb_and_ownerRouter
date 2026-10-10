<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S223 — Approved chargeback guidance and attributable staff responsibility review

> Status: READY — finalized specification for later authorized implementation; no application, provider or Registry change is performed by authoring.
> Intake: 095. Authored: 2026-10-09. Source baseline: WSL main `43bad3ad`; recorded serving baseline: `337ac163` (2026-10-08). These are contextual baselines, not new live verification.
> Bundle: `operations-communications-maintenance-2026-10`.

**Goal.**

PMI can apply its actual approved responsibility and chargeback guidance at the appropriate assessed point, explain and revise staff decisions, and preserve cost evidence without warning residents indiscriminately or creating an unauthorized charge.

**Current state / intended end state.**

Current intake/maintenance code captures issue facts, trade/urgency and estimate-oriented workflow information, but has no complete versioned responsibility/chargeback policy or reviewed financial decision model. Meeting feedback describes a chargeback warning during intake contributing to a resident declining assistance; that is reported experience, not proof of every current intake behavior or a universal rule about liability.

Responsibility is an attributable staff review based on actual facts and approved source policy. Relevant guidance appears at its policy-approved stage, urgent care and normal issue logging remain available, and proposed charges stay clearly separate from owner cost approval, invoicing, payment and ledger posting.

**Actors and entry conditions.**

Authorized PMI policy managers maintain actual approved guidance and applicability. PMI staff assess facts, review supporting lease/policy evidence, record responsibility decisions and handle disputes/corrections. Residents and vendors supply observations/evidence but cannot be assigned liability by a model inference. A real charge or communication uses its separately supported and authorized operation, never the existence of this review alone.

**What it is / how it functions.**

- **R-S223-1 — Approved guidance and applicability.** Provide maintained versioned chargeback/responsibility guidance with real approved wording/source, applicability, effective/revoked state, approved timing and required review conditions. Unset guidance is explicitly unavailable. Do not seed legal language, fixed fee, resident-liability presumption or a warning at every intake. The configurable owner/property preapproval threshold from S213 is not a chargeback threshold or legal responsibility rule.
- **R-S223-2 — Evidence-grounded responsibility review.** Capture a pending-assessment/review state until staff have the required actual facts and applicable source. Record the staff decision, responsible party or allocation when supported, rationale, referenced policy/lease evidence, known amount/basis when applicable, actor and time. Unknown facts and disputed decisions remain explicit. Estimate or a vendor assertion alone never proves resident fault, billability, contractual liability or verified payment.
- **R-S223-3 — Contextual communication and continuing care.** Offer policy-approved responsibility guidance only when its required facts/stage/review are met, with reviewed actual wording and financial distinctions. Staff may prepare a relevant message through the established communications workflow. A resident expressing concern/refusal is recorded for staff follow-up; it does not automatically cancel the report, close the ticket, imply agreement to pay or suppress urgent guidance. Preserve non-coercive issue logging and assessment without a forced intake owner/resident email.
- **R-S223-4 — Dispute, correction and audit history.** Support a visible dispute/needs-review condition and an attributable staff correction or superseding decision. Preserve the previous decision and reason/evidence; material evidence/policy changes require re-review rather than silently editing liability history. Reports and handoffs identify which decision/version they used and distinguish a current correction from a historical export.
- **R-S223-5 — Financial and authority separation.** Keep recorded responsibility/proposed charge separate from vendor estimate, reviewed vendor invoice, owner markup, verified payment and actual tenant/owner ledger posting. Report only known reviewed categories with their provenance. This suite records, reviews, reconciles and reports; it neither posts a charge nor collects payment, automatically withholds vendor work, or opens an accounting/provider action. Vendor views expose only information relevant to assigned work, not internal liability deliberation or owner markup.

**In scope / out of scope.**

In scope: actual approved-guidance management, staff responsibility review, appropriate message preparation context, disputes/corrections, evidence retention and financial/reporting distinctions. Out of scope: inventing binding liability or legal terms, universal warning/fee, automatic charge generation, tenant/owner accounting posting, payment collection, customer send, and replacing PMI judgment with sentiment or model output.

**Open questions & assumptions.**

Actual approved lease/policy sources, legal wording, timing, fees/amounts and decision permissions are runtime inputs supplied and reviewed by PMI under the current role/governance model. The capability is complete with explicit unset/needs-review states; an actual responsibility assertion or guidance-dependent message waits for those real inputs.

No material product decision is deferred inside this READY scope. Actual identities, approved runtime policies, financial values and provider configuration are inputs, not values the implementation runner invents. Their absence blocks only the named dependent operation; implementation and independent verification proceed.

**Cross-product impacts.**

- Assessment/intake owners: `lib/maintenance/ticket-model.ts`, `lib/firestore/maintenance-tickets.ts`, `lib/maintenance/intake-triage.ts`, staff capture/queue and governed workflow communications.
- Related new owners: S205 assessed lifecycle, S209 durable evidence, S212 vendor invoice/evidence submission, S213 financial attribution/preapproval, S214 history reports and S222 emergency guidance.
- Authorization/privacy boundaries: current staff roles, `lib/vendor/assignment.ts`, assigned-ticket API projection and current exact action/communication gates.

**Authority and evidence map.**

| Input                                                         | Classification                             | Use and limitation                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, current owning code and tests, `docs/facts.md`   | Authority / implementation baseline        | Current safety, identity and exact-action boundaries persist until a later explicitly authorized governance change; source behavior is not automatically desired behavior.                                                                                                                                   |
| Owner clarification on 2026-10-09                             | Confirmed desired outcome                  | Complete staff-managed maintenance, PMI final closure, assigned-vendor contributions, future-only history, durable reporting evidence, configurable policy and explicit financial distinctions. Authoring is not execution authority.                                                                        |
| October 8 meeting intake and feedback aliases MF-20261008-A/B | Intent / reported experience               | Assessment before owner approval; no forced intake email; standing preapproval; visible creation progress, queue reveal and honest reconciliation. Reported duplicate ticket effects remain unverified; the reported creation experience establishes desired usability, not a proven number of live effects. |
| WSL main `43bad3ad`; recorded serving `337ac163`              | Inspected source / supplied batch baseline | Establishes the starting owners listed above. Local code checks and deterministic adapters do not prove a live provider effect, human observation or actual account entitlement.                                                                                                                             |
| Actual provider/configuration/approved-policy inputs          | External dependency                        | Use only verified real inputs for their exact operation. Do not create customer records, provider actions or policy values to demonstrate completion.                                                                                                                                                        |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S223-1** — A scoped policy repository/applicability projection separates approved source-backed guidance from draft/model prose and distinguishes it from emergency and owner-preapproval policies. Its selected version is attached to the reviewed decision/message context. Freeze a focused falsification before changing this boundary.
- **ARCH-S223-2** — A staff-owned responsibility record links to S205 assessment, S209 durable history and S213 financial entries, with source version/identity and reviewed-state validation. Advisory AI text cannot commit a decision or manufacture a missing source/amount. Freeze a focused falsification before changing this boundary.
- **ARCH-S223-3** — Maintenance guidance is a projection from the current reviewed context, separate from ticket closure and communication dispatch. Workflow communication handoff carries the selected policy/decision version and invalidates stale proposed wording when relevant facts change. Freeze a focused falsification before changing this boundary.
- **ARCH-S223-4** — Append/version records support concurrent review and compare the acted-on facts/policy/decision version. S209 retention preserves original and correcting evidence; report lineage consumes the revised projection without rewriting saved historic artifacts. Freeze a focused falsification before changing this boundary.
- **ARCH-S223-5** — Typed responsibility and financial references preserve S213 category/source semantics and enforce staff/vendor authorization at reads and exports. No chargeback-review transition calls a ledger/payment/provider-write adapter. Freeze a focused falsification before changing this boundary.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S223-1** — Staff can see the applicable approved guidance and its timing, or an honest no-approved-policy state; a newly reported issue does not automatically receive an unsupported liability warning.
- **BEH-S223-2** — Staff can explain a responsibility decision from the assessment and actual approved policy; when facts are incomplete the work shows needs review rather than a fabricated chargeable party.
- **BEH-S223-3** — A resident can report a problem and staff can assess it without an automatic blanket chargeback message. Staff can record concern, continue appropriate urgent handling and review the right message without falsely showing it was sent.
- **BEH-S223-4** — PMI can revisit a disputed chargeback, explain the original basis and see the corrected current decision. An old exported report keeps its original snapshot and a new report identifies the updated facts.
- **BEH-S223-5** — A staff member sees what was assessed, proposed, invoiced and actually verified separately; the vendor receives the approved work context and cannot inspect internal chargeback discussion. Saving a decision creates no ledger charge/payment.

**Human litmus outcome.**

### Explain responsibility without blocking maintenance intake

**If this was built correctly:** A staff member reviews the actual issue and policy, records a supported responsibility decision or a need for review, and can explain or correct it later. The resident can still report the problem and receive urgent guidance; the app never silently turns a proposal into a charge or payment.

- Model verdict: LOCAL EVIDENCE — implementation and mapped engineering checks are recorded per requirement in `docs/evidence/operations-communications-maintenance-2026-10.json`; the complete local canonical gate and core E2E passed in their recorded scopes; exact-main CI and runtime/delivery remain separately verified gates. No live provider effect or human observation is claimed.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                            | Architecture outcome | Behavior outcome | Human litmus                                               | Acceptance / deterministic falsification                                                                                                                                                                                                                                           |
| ------------------------------------------------------ | -------------------- | ---------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S223-1: Approved guidance and applicability          | ARCH-S223-1          | BEH-S223-1       | Explain responsibility without blocking maintenance intake | AC-S223-1: Exercise unset, draft, revoked, conflicting and applicable approved versions plus S213 threshold values. Assert only approved applicable guidance is offered at its approved stage and no dollar threshold is converted into resident liability.                        |
| R-S223-2: Evidence-grounded responsibility review      | ARCH-S223-2          | BEH-S223-2       | Explain responsibility without blocking maintenance intake | AC-S223-2: Assess incomplete and conflicting evidence, unsupported vendor blame, model-only suggestion and a supported staff review. Assert only attributable supported staff review records a decision, absent amounts stay unknown, and original facts remain retrievable.       |
| R-S223-3: Contextual communication and continuing care | ARCH-S223-3          | BEH-S223-3       | Explain responsibility without blocking maintenance intake | AC-S223-3: Record intake, refusal/concern and later changed facts. Verify the issue remains recorded/open for staff action, S222 urgent guidance remains available, no charge agreement is inferred, stale message review is required and local preparation never claims delivery. |
| R-S223-4: Dispute, correction and audit history        | ARCH-S223-4          | BEH-S223-4       | Explain responsibility without blocking maintenance intake | AC-S223-4: Race two staff decisions, submit a dispute and correct responsibility/amount after an export. Verify stale writes do not overwrite each other, all decision versions remain attributable and current versus prior report meanings are distinct.                         |
| R-S223-5: Financial and authority separation           | ARCH-S223-5          | BEH-S223-5       | Explain responsibility without blocking maintenance intake | AC-S223-5: Read the same ticket as staff and assigned vendor; assert internal decision/markup omission for vendor. Save/revise responsibility and confirm no posting/payment call. Export unknown versus reviewed amount and verified payment distinctly without double counting.  |

**Preservation set.**

Preserve stored intake without forced email, existing urgent guidance, staff-only ticket decisions, vendor assignment-bound access and governed unsent communication review. Relevant checks include `tests/unit/maintenance-intake-public-route.test.ts`, `maintenance-intake-review.test.ts`, `s109-intake-triage.test.ts`, `maintenance-execution-authority.test.ts`, `maintenance-execution-matrix.test.ts`, `vendor-assignment-boundary.test.ts` and `vendor-readonly-access.test.ts`.

Preservation is a separate result from new behavior. Existing tests are retained where they cover unchanged contracts; new checks must demonstrate the new outcome rather than repeat implementation details.

**Adversarial acceptance checks.**

- **AC-S223-1** — R-S223-1, ARCH-S223-1, BEH-S223-1: Exercise unset, draft, revoked, conflicting and applicable approved versions plus S213 threshold values. Assert only approved applicable guidance is offered at its approved stage and no dollar threshold is converted into resident liability.
- **AC-S223-2** — R-S223-2, ARCH-S223-2, BEH-S223-2: Assess incomplete and conflicting evidence, unsupported vendor blame, model-only suggestion and a supported staff review. Assert only attributable supported staff review records a decision, absent amounts stay unknown, and original facts remain retrievable.
- **AC-S223-3** — R-S223-3, ARCH-S223-3, BEH-S223-3: Record intake, refusal/concern and later changed facts. Verify the issue remains recorded/open for staff action, S222 urgent guidance remains available, no charge agreement is inferred, stale message review is required and local preparation never claims delivery.
- **AC-S223-4** — R-S223-4, ARCH-S223-4, BEH-S223-4: Race two staff decisions, submit a dispute and correct responsibility/amount after an export. Verify stale writes do not overwrite each other, all decision versions remain attributable and current versus prior report meanings are distinct.
- **AC-S223-5** — R-S223-5, ARCH-S223-5, BEH-S223-5: Read the same ticket as staff and assigned vendor; assert internal decision/markup omission for vendor. Save/revise responsibility and confirm no posting/payment call. Export unknown versus reviewed amount and verified payment distinctly without double counting.

**Forbidden actions / hard gates.**

No invented legal determination, resident assent, fee or recipient. No model-owned responsibility approval, automatic billing/post/payment or new accounting/action grant. A refusal or unpaid proposal does not itself close the work, suppress urgent guidance or authorize withholding necessary care. Actual communication dispatch retains its current or later explicitly authorized separate contract.

Across this suite: no fabricated customer/provider identity or amount, secret/raw customer evidence in Git, guessed provider endpoint or recipient, silent historical-evidence rewrite, or claim of unrun human/provider success. Writing this file opens no exact Action Registry key and grants no account, privilege or live proof target. Preserve S100's explicit warning/confirmation for reads that mark manager messages read; do not relabel them harmless background imports.

**Dependencies / sequencing.**

Consumes S205 assessment, S209 evidence/history, S213 distinct financial meanings and S222 urgent handling. Integrates reviewed guidance with the separately scoped communications workspace. Can implement policy/decision/recovery/privacy capability with explicit missing actual policy; does not wait for accounting-posting functionality outside scope.

**Standalone delivery contract.**

- **Deliverable now:** Approved-guidance configuration/resolution, attributable staff responsibility and dispute/correction workflow, version-bound message preparation context, financial/report projection and privacy/refusal checks.
- **Consumes, but does not assume:** Real approved lease/policy text, applicability/timing and reviewed actual facts/amounts. Unset, disputed and missing-evidence states remain explicit; no recommendation fills an actual policy value.
- **Externally blocked effect:** An actual policy-based responsibility assertion or guidance-dependent message remains BLOCKED until the applicable real approved source and review exist. Any accounting posting/payment remains outside this authorization and scope.
- **Produces for downstream suites:** Versioned reviewed responsibility/guidance context, dispute/correction provenance and distinct financial/report references without creating a ledger charge or payment.

**Verification and delivery contract.**

1. Re-read current owners and refresh the baseline before implementation. Materialize the named architecture, behavior and acceptance falsifications; record pre-existing unrelated failures separately.
2. Exercise every row with service/transaction and rendered journeys appropriate to the outcome, including denial, interruption, concurrency and partial completion. Use isolated local fixtures and deterministic external adapters; keep the preservation result separate.
3. Read back saved artifacts/state and reconcile them with the acted-on identity/version. A UI success label, supplied example or passing adapter cannot establish live provider success.
4. Run focused checks, then `bash scripts/verify.sh` and applicable compiled-browser checks for any later ship candidate. Audit secrets/PII, authority, runtime configuration and cross-suite traceability.
5. A later authorized implementation reports ALL_GATES_GREEN only for completed declared engineering checks; a named live/account proof remains separately BLOCKED when its input is missing. BUDGET_EXHAUSTED applies only to an explicit budget. Never label the whole operational outcome complete from a partial green slice.
6. Authoring registration/validation is documentary only. Commit, push, deployment, implementation-loop start and external communication require their own explicit instruction.

**Ordered prompt sequence.**

1. Re-verify current source, accepted decisions, dependency contracts and relevant read-only state.
2. Freeze the requirement/architecture/behavior/acceptance matrix and preservation baseline before implementation.
3. Implement the bounded owner and all unavailable/recovery paths; reuse existing services and keep adjacent suite ownership explicit.
4. Falsify every row, read back persisted results, run focused/canonical checks, update verified current documentation and deliver only when separately authorized.

**Deletion/merge recommendation.**

Retain this suite until its full behavior, remaining dependencies and acceptance evidence are represented in current code/tests/facts. Then merge its operating contract into current maintenance documentation; preserve historical evidence without keeping duplicate active instructions.
