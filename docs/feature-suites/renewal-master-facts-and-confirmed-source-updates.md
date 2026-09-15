<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-operator-hub-v1 -->

# S117 — Master lease facts, rent and charges with confirmed source updates

> Status: SPECIFICATION READY; implementation and release have not been performed for this feature.

**Repository:** `josiahH-cf/pmiKCkb_and_ownerRouter` (`pmi-kc-kb`).  
**Canonical file:** `docs/feature-suites/renewal-master-facts-and-confirmed-source-updates.md`.  
**Authoring baseline:** `e903b68aa4efa2462f565f225d562924a57ccf8b`; re-read current main before implementation.  
**Requested execution order:** S114 → S115 → S116 → S117 → S118 → S119 → S120. This is feature 4 of 7 in this request, not the earlier September 14 batch.

**Goal.**

Make Rent and charges the clear working location for reviewing and changing supported rent/charge facts, reuse entered facts downstream, and let authorized staff execute exact approved changes through the existing RentVine and Sheet paths with a compact, comprehensive preview of what changes where.

**Current state / intended end state.**

`RenewalWorkspace.tsx` presents Rent and charges mainly as a read-only summary. `RenewalCorrections.tsx`, the page-supplied RentVine proposal panel and `OperatingSheetPanel.tsx` already expose separate correction/writeback controls. S113 F2.1–F2.5 and the deployed S97/S98 code support current-source corrections, future approved terms, exact renewal-date updates and recurring-charge create/update; write access is not an absent integration needing generic activation.

The desired change joins these existing controls into the understandable master fact/rent/charge experience requested by the transcript. Enter a business value once, distinguish app storage from each source update, and show its downstream use. The private capture's pages 3–6 illustrate the separated summary, correction and provider proposal controls.

**Actors and entry conditions.**

Renewals-space Editors retain app-owned recording and proposal preparation; existing Approvers retain reconciliation decisions; Admins retain pricing/source approvals and exact provider execution. Use the actual capability matrix in `lib/lease-renewal/role-action-governance.ts`, not a UI-only role inference. Current fact corrections may occur before renewal approval. Future renewal execution must satisfy its applicable explicit approved-term and tenant-response conditions; no checked approval is fabricated.

**What it is / how it functions.**

### R117.1 — One master working area, not a second source of truth

Place the relevant current rent/charge review and supported edit actions with **Rent and charges**. The information sidebar and downstream previews read the owning current projection; they do not require a second manual entry or maintain a competing “master” rent value. Keep source values, editable reviewed values and proposed/future values distinct. Preserve labels for contractual base rent (`baseRentAmount` from current lease detail), lease total, unit-listed reference, individual recurring charges and one-time fees.

Provide currency/date/select controls for the actual business input and keep known values prefilled with a concise source indication. Separate **correct current facts** from **prepare future owner-approved renewal terms**. Recording a lease term/review still uses the existing app-owned term-review contract; it does not rewrite lease dates or RentVine. Make field labels and adjacent help explain what recording changes in the app, what enters later preparation, and what still needs explicit source synchronization.

### R117.2 — Exact supported operation matrix

| Intent                                                                                         | Existing supported behavior and boundary                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correct current base-rent billing                                                              | Prepare an update to a specifically selected current rent-account recurring charge using `rentvine.lease.recurring_charge.update`. Resolve the actual account/schedule/charge from the existing inventory. Do not divide an aggregate across charges or infer billing meaning solely from a label. Read both the changed charge and refreshed lease detail; charge success is not proof that another displayed base-rent field changed.                                       |
| Prepare future approved base rent                                                              | Save exact owner-approved rent/effective/end dates in app state. Prepare only supported future charge create/update operations against the reviewed existing schedule, preserving current billing before the effective date. Show any current-charge end/change and future charge separately; do not invent end-date inclusivity or hide overlaps/gaps. The user’s final execute scenario is after actual owner approval and tenant acceptance; preparation is not execution. |
| Supported lease renewal dates                                                                  | Use `rentvine.lease.renewal_dates.update`; preserve current start date and untouched fields and the existing allowed end-date/increase-eligibility-date transitions. Do not add an arbitrary lease-detail setter.                                                                                                                                                                                                                                                             |
| Recurring pet/insurance/RBP/utility charges                                                    | Reuse `rentvine.lease.recurring_charge.create` or `.update` for the resolved account, amount, cadence/day due and effective schedule. Prefill from actual records/approved input; only unresolved business fields need manual attention. An email-template line does not create a charge or establish applicability.                                                                                                                                                          |
| Operating Sheet facts/tracking                                                                 | Reuse the recognized typed fields, fresh exact row/header association and existing field-update path; preserve checkbox/date/currency semantics. Future offered rent must not overwrite `current_rent` before it is current. S118 supplies the separately reviewed `market_value` meaning.                                                                                                                                                                                    |
| One entered value applicable to both systems                                                   | Prepare two independently reviewed/confirmed effects. Display each destination's current value, proposed value, result and unfinished work. There is no cross-provider atomic transaction or automatic rollback of the first successful effect.                                                                                                                                                                                                                               |
| One-time fee posting, deposit/ledger/party edits, arbitrary lease status, insurance enrollment | These are outside the three current RentVine keys. Keep their legitimate facts/communication inputs separate and point to the actual provider task when needed; do not emulate one-time fees with a recurring schedule, expand a key or claim an unsupported write.                                                                                                                                                                                                           |

### R117.3 — Dense exact preview and deliberate confirmation

Show, in one readable review, the lease/unit identity, source system, exact business field or selected charge/account, current and proposed amounts/dates/schedule, any effective timing and the per-destination consequence. Do not force staff to enter IDs, A1 ranges, hashes or action keys. Technical receipt history may remain in disclosure, but exact old/new terms and confirmation consequences must remain visible at the decision point.

An existing “I approve” business control is not permission for arbitrary writes. The execution confirmation must bind the current proposal, exact terms/destination and authorized actor. A source change, approval change, expired preview or conflicting schedule requires a fresh review. Never auto-check review, approval, delivery or execution confirmations because a field is prefilled.

### R117.4 — Enter once, synchronize visibly, recover honestly

An app-owned fact/progress save retains the entered reviewed value and prepares its supported source intent where the current workflow already supports that handoff. Do not make the operator retype it into a second form. The app-owned record and each pending/prepared/verified/unavailable source update stay distinguishable until real readback. Refresh the owning lease/Sheet projection through existing freshness mechanisms after a confirmed update so the sidebar, table, comparison and later message facts reflect current verified state.

Preserve server-side actor/key/switch/source checks, current proposal generation/expiry, exact prior-value comparison, one-attempt/idempotency claims, receipt/readback and separately confirmed current-state correction. A lost response or uncertain attempt must use the existing reconcile path; refreshing or preparing new terms must not retry an unresolved effect. Drift or partial success remains visible without discarding the app record or mislabeling a pending source write as synchronized.

Show a fresh, actionable mismatch when the provider charge update succeeds but refreshed contractual base rent remains different; never hide the discrepancy by substituting the selected charge or lease total. Preserve corrected source versions for downstream review invalidation. No calendar-triggered activation or background source write is added.

**In scope / out of scope.**

Own the coherent master current/future fact editing and supported confirmed source-update handoff. No new provider operations, approval regime, account/catalog creation, tax/fee policy, global spreadsheet editor, automatic mutation or Dotloop implementation is requested. S116 owns Sheet row/contact integrity; S118 owns market defaults; S120 owns message/doc field propagation and final-copy UX using these facts.

**Open questions & assumptions.**

No unresolved product decision remains. “We have write access” means expose and correctly complete the existing exact operations, not reopen retired broad writeback keys. Current correction and future renewal are different intents. Unsupported setters remain explicitly unavailable only for the affected operation, rather than blocking supported rent-charge changes.

**Cross-product impacts.**

Owning code: `components/lease-renewal/RenewalWorkspace.tsx`, `RenewalCorrections.tsx`, `OperatingSheetPanel.tsx`, `RenewalManualWorkspace.tsx`; `app/lease-renewal/live/desk/lease/[leaseId]/page.tsx`; `lib/lease-renewal/writeback/charge-inventory.ts`, `workspace-state.ts`, `workspace-sheet-sync.ts`, `sheet-writeback/field-intent.ts`, `sheet-writeback/workspace-resolution.ts`, `sheet-writeback/execution-service.ts`, `role-action-governance.ts`; current RentVine writeback services under `lib/lease-renewal/writeback/`.

Read the exact matrices in `docs/feature-suites/renewal-workflow-consolidation.md` F2.1–F2.5, `governed-rentvine-renewal-writeback.md`, `operating-renewal-sheet-writeback.md`, the current field-map contract and operator guide. Reconcile only their changed UI/control and current/future value-routing descriptions during implementation.

**Authority and evidence map.**

| Source                                                                                                                               | Classification                                               | Application here                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`; current committed code and actual readbacks; `docs/facts.md`                                                            | Governing repository boundaries and implementation evidence  | Re-establish current truth before implementation. The earlier September 14 features and S113 are the baseline, not work to repeat. Older contradictory “candidate-only” prose does not override current code and facts.                              |
| The owner's September 15 renewal notes, transcript, summary, mindmap and supplied 19-page application capture                        | Requested product intent and reported behavior               | The requirements below incorporate the relevant details. “Rent volume” is RentVine; the spoken “Excel” is the configured Google operating Sheet. These private source materials need not be imported or available in an implementation conversation. |
| Owner acceptance of Q1A, Q2A and Q3A                                                                                                 | Resolved specification decisions                             | Where relevant, this file states the complete accepted rule. Acceptance was not a live-write, integration-activation or send authorization.                                                                                                          |
| `docs/autonomous-agent-runner.md`, `docs/environment-handoff.md`, `docs/feature-suites/TEMPLATE.md`, `docs/feature-suites/README.md` | Existing implementation, specification and release contracts | Use the existing complete loop below. No new release process, extra independent review gate or blanket PR requirement is introduced.                                                                                                                 |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S117-1** — The master editing surface and consumers use owning current/source/proposal state; typed current/future intents cannot overwrite each other's meaning.
- **ARCH-S117-2** — Existing exact RentVine and Sheet executors remain the only live-write paths. Preparation/confirmation binds one operation and independent destination outcomes, preserving recovery and current-state correction.
- **ARCH-S117-3** — One entered app-owned business fact supplies supported pending source intents and fresh downstream projections without automatic execution or retyping.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S117-1** — The operator reviews and edits a supported current or future rent/charge value in Rent and charges, understands its source/destination/timing, and sees which fields still need input.
- **BEH-S117-2** — An authorized person reviews exact old/new data and confirms only the supported effect; unsupported operations and missing approvals remain explicit.
- **BEH-S117-3** — Success, pending second destination, drift and response-loss recovery stay independently truthful; downstream current values change only on the appropriate saved/read-back basis.

**Human litmus outcome.**

### Change a reviewed rent or charge once and see exactly what changed

**If this was built correctly:** The operator chooses current correction or future renewal, enters the necessary business value once and sees a readable before/after preview for each applicable system. After confirmation, a successful source update and any remaining step are clearly distinguished. A future offer does not alter today’s rent, and an uncertain response does not invite another blind write.

The implementation runner records the model verdict with actual evidence. Record `Human verdict: NOT RUN — no human observer` when no observer is present; do not invent human acceptance or add it as a release gate.

**Requirement-to-outcome traceability.**

| Requirement                                            | Architecture | Behavior / human litmus            | Evidence / falsification                                                                    |
| ------------------------------------------------------ | ------------ | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| R117.1 master area and distinct fact semantics         | ARCH-S117-1  | BEH-S117-1; change once/see result | Current, reference, charge and future-value separation; AC-S117-1.                          |
| R117.2 existing exact operation matrix                 | ARCH-S117-2  | BEH-S117-2                         | Supported current/future/date/charge operations and precise unsupported refusal; AC-S117-2. |
| R117.3 comprehensive exact review/confirmation         | ARCH-S117-2  | BEH-S117-2                         | Old/new destination/schedule visible, no automatic approvals, drift refusal; AC-S117-3.     |
| R117.4 enter-once propagation and independent recovery | ARCH-S117-3  | BEH-S117-3                         | App save/pending/confirmed/readback and partial/ambiguous outcomes; AC-S117-4.              |

**Preservation set.**

Preserve existing S97/S98 executor, charge inventory, approval/current-rent reconciliation, current/future correction, source-update, generation/replay and backend journey checks. Keep `tests/unit/s113-dashboard.test.tsx` and existing renewal guide/desk coverage green for changed controls. Never rerun historical live proofs or use a new real customer write merely to demonstrate acceptance.

**Adversarial acceptance checks.**

- **AC-S117-1** — R117.1 / ARCH-S117-1 / BEH-S117-1: selected current rent, lease total, unit reference, multiple charges and future terms remain distinguishable. Recording a term review must not become a source update.
- **AC-S117-2** — R117.2 / ARCH-S117-2 / BEH-S117-2: exercise the existing supported operations through owning routes with deterministic provider adapters; reject forged targets, unsupported setters, one-time-as-recurring workarounds and unresolved account/schedule mappings.
- **AC-S117-3** — R117.3 / ARCH-S117-2 / BEH-S117-2: an exact authorized confirmation is required after a clear old/new preview; changed terms, actor/role failure, expiration, missing applicable owner/tenant outcome and schedule ambiguity cannot execute.
- **AC-S117-4** — R117.4 / ARCH-S117-3 / BEH-S117-3: retain the recorded fact through a failed second destination; reconcile ambiguous attempts without another write; refresh actual provider/Sheet values. Charge success with a remaining base-rent mismatch cannot be labeled fully synchronized.

**Forbidden actions / hard gates.**

Preserve managed identity, Renewals Space and role checks; exact Action Registry authority; the Production + Live boundary; and the distinction between source facts, staff reports and provider-verified effects. Never add autonomous/bulk/model-triggered writes or client sends. Gmail initiation ends in an explicitly confirmed unsent draft; a person sends. A link, a saved fact, a chosen status or a checked business decision is not a provider-effect receipt.

Do not widen action keys, change protected paths without their separately required authority, manufacture customer values, use test data in production, rerun completed provider proofs, or add new accounts, dependencies, services, background processes or billing headroom. Preserve `firestore.rules`, `lib/integrations/action-gate.ts`, `lib/auth/**`, action-seed activation flags, budget guards and `scripts/auth/**` under the router's protected-path rules. Customer values, source exports, message bodies, credentials and raw live evidence remain outside Git. Use deterministic synthetic data only in automated tests.

**Dependencies / sequencing.**

Begin only after S116 completes its applicable release. Consume its current row/identity/destination behavior from the updated repository, not a prior chat. S118 and S120 use the source-backed values and pending-update semantics produced here; neither is required to complete this master editing release. Real missing account/schedule/source inputs hold only their exact operation.

**Standalone delivery contract.**

**Deliverable now:** the coherent supported rent/charge/fact editing, exact previews/confirmation, pending/result/recovery presentation and standalone release using existing execution contracts. **Consumes, but does not assume:** authoritative charge/account/schedule identity, reviewed source decisions, approved future terms and actual source readiness. **Externally blocked effect:** only an exact per-use missing source/mapping/approval or unsupported setter; do not activate new keys to remove it. **Produces for downstream suites:** current and future facts with sources, explicit pending synchronization and actual independently receipted results.

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

1. Re-ground and inspect current source values, charge inventory, correction/proposal controls and exact executor contracts.
2. Establish current/future routing, exact-preview and one-attempt/recovery preservation evidence.
3. Implement this master edit/confirmed update objective, preserving all source and role boundaries.
4. Finish verification, integration, exact deployment, observation and readback before re-grounding for S118.

**Deletion/merge recommendation.**

Register this file once in the existing `docs/feature-suites/README.md` when importing it; use the suite ID, canonical path and sequence given above without replacing unrelated queue rows or marking work complete. No registration or queue edit has been performed by specification authoring. After implementation and applicable release completion, follow the repository's existing retirement rule only when every remaining requirement/dependency is represented by code, tests and current facts. Do not merge these features into one implementation followed by a single final deployment.

Import registration row for the existing suite table (add once; do not replace its other rows):

```markdown
| S117 | `docs/feature-suites/renewal-master-facts-and-confirmed-source-updates.md` | SPECIFICATION READY; feature 4 of 7 in renewal-operator-hub-v1; implementation/release not started. |
```
