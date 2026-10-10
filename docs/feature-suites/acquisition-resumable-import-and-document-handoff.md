<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S218 — Acquisition resumable import and document handoff

> Intake: PENDING CLARIFICATION, 2026-10-09, intake 090. Not finalized and not ready for unattended implementation. Actual formats/object set, existing/new and financial semantics, cutover, document destinations and provider safety contracts are still required.

**Execution dependency readback — 2026-10-10 UTC.** The authorized S216 investigation has
completed accessible evidence review and records precise missing material inputs in its native
specification and `docs/open-blockers.md`. This contract remains PENDING and required in the
overall program. No actual source schema, provider/phone interface, business financial or consent
policy was supplied by that review; implementation admission is held for those exact inputs.

**Goal.**

Transfer the exact reviewed acquisition data and required documents through supported, recoverable operations without duplicate records, hidden partial failure or premature cutover.

**Current state / intended end state.**

The owner accepted acquisition automation, including downstream transfer/document work, but actual targets and provider contracts have not been supplied. Existing open RentVine/Sheet actions are narrow operations, not general property/lease/accounting import authority. Desired direction: consume reviewed S217 mapping, preview exact effects, resume acknowledged work safely and hand off documents under verified destinations. This direction remains unfinalized until S216 establishes the real contract.

**Actors and entry conditions.**

Existing authorized staff with the actual destination capabilities and reviewed acquisition scope. Live system-of-record effects require the real actor and each concrete operation's normal exact-preview/confirmation, durable claim, receipt/readback and correction contract. No new role, key or provider permission is inferred.

**What it is / how it functions.**

1. **R-S218-1: Preview only exact reviewed supported effects.** Consume the exact reviewed mapping/source version and confirmed target object set. Show precise new/create/update association and financial/document consequences before confirmation. Refuse missing review, changed sources, unsupported operations and unresolved identity conflicts. The precise object operations, target keys and previews must be finalized from S216/S217.

2. **R-S218-2: Resume without duplicate or ambiguous redispatch.** Track per-confirmed-operation state and provider receipts/readback through existing durable claim patterns. Repeated confirmation and lost responses must reconcile exact acknowledged effects before retry; a timeout is not failure proof. Independent successfully verified items remain distinguishable from unattempted, failed and ambiguous ones. Actual idempotency/reconciliation bounds depend on each provider contract and remain blockers.

3. **R-S218-3: Handoff actual documents and communication work.** Associate only the required actual documents with verified correct targets/destinations and preserve original provenance and versions. Distinguish uploaded/present documents from approved legal content, provider-owned content verification and signatures. Tenant letters, insurance/owner paperwork or loop preparation require their actual content, recipients/resources and separately governed operation contracts; do not infer delivery/sending or signatures from document presence.

4. **R-S218-4: Controlled cutover and correction.** Adopt the actual approved effective/cutover and source-authority rules. Verified completion and staff review precede switching operational use. Preserve history and current authoritative records; define supported per-operation correction/rollback and manual recovery from real contracts before enabling effects. Historical maintenance backfill is explicitly excluded.

**In scope / out of scope.**

Intended in scope: exact reviewed supported import, per-operation recovery and actual document handoff/cutover. Exact targets, object set and financial operations are unresolved. Out of scope: generic bulk mutation authority, source deletion, historical maintenance backfill, automatic client sends, invented forms/signatures or changing cloud/security/budget controls.

**Open questions & assumptions.**

Blocking inputs: all relevant S216/S217 contracts; exact destination object operations and permissions/keys; financial semantics; stable target/new-record matching; provider idempotency/readback/correction support; actual required documents/resources and association rules; effective/cutover and completion policy; actual communication content/recipients when in scope. These are not nonblocking assumptions.

**Cross-product impacts.**

Potential RentVine/Sheet and document integration seams identified by S216; app-owned operation ledger and review; S217 staged mapping; existing document/S182 and communication governance. Exact new paths/endpoints remain undetermined.

**Authority and evidence map.**

| Input                                                                              | Classification                   | Use and limitation                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, current code/tests and serving readback                               | Authority / implementation truth | Existing identity, Space, provider and exact-operation boundaries apply. Starting reference for this batch: WSL main `43bad3ad`, serving `337ac163` on 2026-10-08; recheck before implementation. A reference is not fresh live proof. |
| Existing narrow integration/action contracts and acquisition discussion; S216/S217 | Project evidence                 | Shows why a general acquisition import cannot be inferred from existing provider access or proposed workload categories.                                                                                                               |
| Owner's 2026-10-09 clarification and accepted recommendations                      | Confirmed desired behavior       | Include resumable acquisition transfer/document handoff after the real inputs and contracts are established.                                                                                                                           |
| Actual reviewed object/mapping, provider-effect, document and cutover contracts    | Blocking finalization dependency | No implementation-ready operation exists until the target and safety semantics are verified; unrelated read-only investigation continues.                                                                                              |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S218-1** — The future import admission boundary must bind reviewed mapping/version, actual actor, stable target identity and documented operation authority. No generic import endpoint or bulk key is assumed.
- **ARCH-S218-2** — A future operation ledger must bind one reviewed target/effect to one admitted attempt and supported reconciliation/correction semantics. Unsupported provider safety primitives require a scoped hold, not invented idempotency.
- **ARCH-S218-3** — Document handoff must consume confirmed families, target associations, resources and supported provider contracts separately from data import receipts. No destination/schema or legal wording is invented before those inputs exist.
- **ARCH-S218-4** — The future completion/cutover contract must depend on required readbacks and verified correction paths, not a staged import count. Financial/cutover/recovery policies remain blocking until resolved by S216.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S218-1** — Staff can inspect exactly which confirmed records and documents will change; unsupported or ambiguous items are held rather than partially guessed.
- **BEH-S218-2** — Staff resume an interrupted transfer and see what truly completed, what is safe to continue and what needs investigation; duplicate source records are not created by blind retry.
- **BEH-S218-3** — Staff can find the real transferred document and its exact association/status, with a precise hold for missing content or destination; no unsent letter is reported as delivered.
- **BEH-S218-4** — Staff see whether the acquisition is ready for operational use and what remains unresolved; incomplete transfer cannot silently become current production truth.

**Human litmus outcome.**

### Resume the acquisition transfer and know what completed

**If this was built correctly:** Staff review the real intended changes and documents, confirm supported operations, then return after interruption to see verified completions and precise holds without duplicate records. The acquisition becomes current only under its actual cutover rules, which still need to be supplied and verified.

- Model verdict: BLOCKED — accessible investigation is recorded in the native program ledger; required material inputs remain absent. This contract is still PENDING and no implementation or delivery is claimed.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                                | Architecture outcome | Behavior outcome | Human litmus                                            | Deterministic evidence / falsification                                                                                                                                                                                                          |
| ---------------------------------------------------------- | -------------------- | ---------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S218-1: Preview only exact reviewed supported effects    | ARCH-S218-1          | BEH-S218-1       | Resume the acquisition transfer and know what completed | AC-S218-1: PENDING: define actual object-operation fixtures after S216/S217, then falsify stale mapping, unresolved identity, changed source, unsupported financial category and denied scope/key admission.                                    |
| R-S218-2: Resume without duplicate or ambiguous redispatch | ARCH-S218-2          | BEH-S218-2       | Resume the acquisition transfer and know what completed | AC-S218-2: PENDING: instantiate documented create/update/readback semantics, then exercise duplicate delivery, crash before/after dispatch, response loss, mixed outcomes and provider outage without live proof effects.                       |
| R-S218-3: Handoff actual documents and communication work  | ARCH-S218-3          | BEH-S218-3       | Resume the acquisition transfer and know what completed | AC-S218-3: PENDING: use actual required document families/destinations and owning operation rules to check wrong association, changed content, missing resource, partial upload and presence-versus-signature claims.                           |
| R-S218-4: Controlled cutover and correction                | ARCH-S218-4          | BEH-S218-4       | Resume the acquisition transfer and know what completed | AC-S218-4: PENDING: define approved required object/readback/cutover set, then falsify partial completion, mismatched financial totals where applicable, unsupported reversal and premature cutover. Assert no historical maintenance backfill. |

**Preservation set.**

Existing exact operation authority, receipt/readback and correction semantics; current records and financial truth; private evidence, document/signature distinctions and S182 exclusions; explicit no-historical-maintenance-backfill scope.

**Adversarial acceptance checks.**

- **AC-S218-1** — PENDING: define actual object-operation fixtures after S216/S217, then falsify stale mapping, unresolved identity, changed source, unsupported financial category and denied scope/key admission. This falsifies ARCH-S218-1 / BEH-S218-1 and the named human litmus.
- **AC-S218-2** — PENDING: instantiate documented create/update/readback semantics, then exercise duplicate delivery, crash before/after dispatch, response loss, mixed outcomes and provider outage without live proof effects. This falsifies ARCH-S218-2 / BEH-S218-2 and the named human litmus.
- **AC-S218-3** — PENDING: use actual required document families/destinations and owning operation rules to check wrong association, changed content, missing resource, partial upload and presence-versus-signature claims. This falsifies ARCH-S218-3 / BEH-S218-3 and the named human litmus.
- **AC-S218-4** — PENDING: define approved required object/readback/cutover set, then falsify partial completion, mismatched financial totals where applicable, unsupported reversal and premature cutover. Assert no historical maintenance backfill. This falsifies ARCH-S218-4 / BEH-S218-4 and the named human litmus.

**Forbidden actions / hard gates.**

No generic provider write/import grant, guessed objects/endpoints/recipients, blind retry of ambiguous effects, automatic cutover, invented signatures/content verification, client send or historical maintenance backfill. Pending specifications cannot enter unattended execution.

**Dependencies / sequencing.**

S216 actual contract investigation and finalized S217 reviewed mapping are prerequisite. Document/provider operations retain their separately verified keys and contracts; source credentials alone do not satisfy them.

**Standalone delivery contract.**

- **Deliverable now:** Pending desired outcome and exact dependency hold only; no implementation-ready import slice is claimed.
- **Consumes, but does not assume:** Actual reviewed mapping and verified destination/recovery contracts once established; missing values remain explicit blockers.
- **Externally blocked effect:** Import implementation admission, all live writes/document/customer effects and cutover until material data semantics and supported provider safety contracts are finalized.
- **Produces for downstream suites:** After finalization/implementation, truthful per-operation transfer/document outcomes and controlled cutover evidence. Current authoring produces no provider effect.

**Verification and delivery contract.**

1. This specification is PENDING CLARIFICATION, not finalized and not ready for unattended implementation. First obtain the prerequisite investigation's actual source/provider contracts and the missing owner business/policy decisions listed above.
2. Revise this file in the native authoring mechanism with concrete in-scope objects, inputs, boundaries and acceptance fixtures; preserve valid settled intent. Do not invent the missing values or hide them as nonblocking assumptions.
3. Once legitimately READY and separately execution-authorized, record real starting-state readback, fail-first architecture/behavior cases and preservation results; test every acceptance row through actual boundaries, run focused checks and `bash scripts/verify.sh`, audit the diff and deliver through existing gates.
4. At present, the downstream suite's terminal state is `BLOCKED` on the named contract inputs; do not report `ALL_GATES_GREEN` or operational readiness from this placeholder. `BUDGET_EXHAUSTED` applies only to an explicit budget. Investigation completion and document authoring are not implementation proof.

**Ordered prompt sequence.**

1. Keep this suite out of any unattended implementation queue while its named inputs remain unresolved.
2. Consume the prerequisite investigation's verified contracts and obtain the remaining explicit business/policy decisions.
3. Finalize the actual boundaries, mappings, failures and observable checks in this native file; run authoring validators and mark READY only when no material gap remains.
4. Under later separate implementation authority, record fail-first checks and preservation, build the bounded slice, falsify its edge cases and deliver through existing gates.

**Deletion/merge recommendation.**

Retire or merge only after code, tests and current facts own every requirement and preservation check, with actual delivery evidence. Do not retire because a related suite is deployed or the spec is registered.
