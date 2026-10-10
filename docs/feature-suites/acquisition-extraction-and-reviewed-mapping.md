<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S217 — Acquisition extraction and reviewed mapping

> Intake: PENDING CLARIFICATION, 2026-10-09, intake 089. Not finalized and not ready for unattended implementation. Actual source formats, exact object/financial scope, identity matching and target contracts must first be established by S216.

**Execution dependency readback — 2026-10-10 UTC.** The authorized S216 investigation has
completed accessible evidence review and records precise missing material inputs in its native
specification and `docs/open-blockers.md`. This contract remains PENDING and required in the
overall program. No actual source schema, provider/phone interface, business financial or consent
policy was supplied by that review; implementation admission is held for those exact inputs.

**Goal.**

Turn the confirmed acquisition sources into a staff-reviewed, traceable mapping of the confirmed in-scope records and documents before any import effect.

**Current state / intended end state.**

Acquisition extraction/mapping was proposed in the October 8 meeting and the owner accepted the category. There is no established actual input schema, object list or source-to-destination mapping in the supplied context. Existing document/renewal tools are not proof of acquisition import support. Desired direction: privately stage extracted source values with provenance, review identity/field mappings and expose ambiguities without altering live records. This direction is pending the concrete S216 contract.

**Actors and entry conditions.**

Existing authorized acquisition staff reviewing actual permitted sources and confirmed target scope. A later implementation uses the actual actor and current source permissions. No source is eligible merely because it is attached to the acquisition discussion.

**What it is / how it functions.**

1. **R-S217-1: Extract only confirmed sources with provenance.** After S216 identifies actual formats and allowed processing, extract the confirmed fields/documents into an app-owned reviewed staging representation. Retain exact source reference/location and distinguish observed value, proposed normalization and inference. Required field rules, document families and parser/AI eligibility remain unresolved until actual source evidence is available.

2. **R-S217-2: Review identity and field mappings.** Map only the confirmed objects and fields into documented supported targets. Separate matched existing records, proposed new records, duplicates and ambiguous candidates; require staff resolution where identity or data meaning is material. Do not match solely by fuzzy address/name or silently overwrite existing authoritative values. Exact object-specific match/merge rules and financial mappings remain blockers.

3. **R-S217-3: Keep review changes auditable and resumable.** Preserve reviewed decisions, source version and actual actor/time across interruption. Changed sources or mappings invalidate only dependent review, not unrelated completed work. Repeated saves and concurrent edits must use normal app-owned idempotency/version-conflict behavior. Exact staging version semantics must be finalized with the actual input model.

4. **R-S217-4: Handoff reviewed data without posting.** Produce only the exact reviewed mapping/version for S218's independently governed import and document handoff. Extraction or AI output cannot itself approve or execute live creation/update. Keep raw sources/customer values private, and preserve S182's Dotloop API-origin exclusion at every AI sink.

**In scope / out of scope.**

Intended in scope: confirmed-source extraction, provenance, reviewed identity/field mapping and resumable private staging. Exact fields, objects, financial categories and formats are unfinalized. Out of scope: live import, provider activation, tenant communication, invented legal content and historical maintenance backfill.

**Open questions & assumptions.**

Blocking inputs: S216 actual source samples/formats/profile; confirmed object and document families; financial scope; source-to-target field meaning; stable identity and duplicate/merge rules; new versus existing target policy; source version semantics; allowed extraction method and supported destination contracts. No recommendation acceptance supplies these factual values.

**Cross-product impacts.**

Prospective app-owned acquisition staging and review; actual target adapters to be identified by S216; S218 import/document handoff; S182 provenance/privacy. No precise new path/schema/endpoint is asserted.

**Authority and evidence map.**

| Input                                                                         | Classification                   | Use and limitation                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, current code/tests and serving readback                          | Authority / implementation truth | Existing identity, Space, provider and exact-operation boundaries apply. Starting reference for this batch: WSL main `43bad3ad`, serving `337ac163` on 2026-10-08; recheck before implementation. A reference is not fresh live proof. |
| October 8 meeting acquisition discussion and S216 investigation specification | Project evidence                 | Establishes intended workload and required research; it does not establish a parser, schema or mapping.                                                                                                                                |
| Owner's 2026-10-09 clarification and accepted recommendations                 | Confirmed desired behavior       | Include acquisition extraction/mapping, subject to actual contract finalization.                                                                                                                                                       |
| S216 real source/object/mapping/provider contract outputs                     | Blocking finalization dependency | This suite remains pending until every materially relevant input is established and its acceptance fixtures can be concrete.                                                                                                           |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S217-1** — The future extraction boundary must enforce the approved source/profile and permitted lineage before staging or model use. A real-source fixture contract is required before designing a parser/schema; unsupported formats must remain explicit.
- **ARCH-S217-2** — Versioned review separates extracted values from target identity/mapping decisions and preserves their source basis. Before READY, define each confirmed object's stable-key and conflict policy from S216 evidence.
- **ARCH-S217-3** — A future bounded staging/review contract must bind decisions to source and mapping versions without cross-record overwrite. It cannot be finalized until the actual object and source-version semantics are known.
- **ARCH-S217-4** — The reviewed handoff must identify its allowed object set, unresolved count and source/mapping versions; effect dispatch is outside extraction. Missing required review prevents an import-ready handoff.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S217-1** — Staff can compare each proposed value with its actual source and see an extraction failure or uncertainty rather than a fabricated value.
- **BEH-S217-2** — Staff see the proposed mapping and unresolved conflicts before any import, with new versus existing targets unambiguous.
- **BEH-S217-3** — Staff resume review without losing accepted decisions and see precisely which changed inputs need another review.
- **BEH-S217-4** — Staff can tell whether mapping review is complete and which exact item still blocks transfer; no extraction result appears as a completed import.

**Human litmus outcome.**

### Review acquisition data before it changes anything

**If this was built correctly:** Staff compare extracted values with their real sources, resolve duplicates and identity conflicts, then resume later without losing reviewed work. Nothing changes in a live source system merely because extraction succeeded. The actual fields and target objects still need to be established before this experience can be finalized.

- Model verdict: PENDING — genuine material contract inputs remain absent; retain this same specification and registration until complete. No READY, implementation or delivery claim.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                              | Architecture outcome | Behavior outcome | Human litmus                                       | Deterministic evidence / falsification                                                                                                                                                                                                 |
| -------------------------------------------------------- | -------------------- | ---------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S217-1: Extract only confirmed sources with provenance | ARCH-S217-1          | BEH-S217-1       | Review acquisition data before it changes anything | AC-S217-1: PENDING: instantiate against the actual S216 source profiles and permitted extraction contract. Verify real-source provenance, partial failures and unknown values; no synthetic fixture establishes actual format support. |
| R-S217-2: Review identity and field mappings             | ARCH-S217-2          | BEH-S217-2       | Review acquisition data before it changes anything | AC-S217-2: PENDING: use confirmed object/key and financial rules to falsify duplicate, conflicting identity, missing-key and existing/new cases. Every mapped destination must have a real supported contract.                         |
| R-S217-3: Keep review changes auditable and resumable    | ARCH-S217-3          | BEH-S217-3       | Review acquisition data before it changes anything | AC-S217-3: PENDING: define actual source-version fixtures, then exercise reload, changed source, duplicate save and two-reviewer conflicts with readback.                                                                              |
| R-S217-4: Handoff reviewed data without posting          | ARCH-S217-4          | BEH-S217-4       | Review acquisition data before it changes anything | AC-S217-4: PENDING: trace every reviewed item into the S218 contract, inject unresolved/changed mappings and Dotloop-origin sentinels, and assert zero provider writes/drafts/sends.                                                   |

**Preservation set.**

Actual source truth, existing records, exact-operation authority, current privacy/access and S182 exclusions. Retain the explicit no-historical-maintenance-backfill boundary.

**Adversarial acceptance checks.**

- **AC-S217-1** — PENDING: instantiate against the actual S216 source profiles and permitted extraction contract. Verify real-source provenance, partial failures and unknown values; no synthetic fixture establishes actual format support. This falsifies ARCH-S217-1 / BEH-S217-1 and the named human litmus.
- **AC-S217-2** — PENDING: use confirmed object/key and financial rules to falsify duplicate, conflicting identity, missing-key and existing/new cases. Every mapped destination must have a real supported contract. This falsifies ARCH-S217-2 / BEH-S217-2 and the named human litmus.
- **AC-S217-3** — PENDING: define actual source-version fixtures, then exercise reload, changed source, duplicate save and two-reviewer conflicts with readback. This falsifies ARCH-S217-3 / BEH-S217-3 and the named human litmus.
- **AC-S217-4** — PENDING: trace every reviewed item into the S218 contract, inject unresolved/changed mappings and Dotloop-origin sentinels, and assert zero provider writes/drafts/sends. This falsifies ARCH-S217-4 / BEH-S217-4 and the named human litmus.

**Forbidden actions / hard gates.**

Do not implement an invented acquisition schema, source format, match threshold, financial policy, provider endpoint or target list. No source posting, model-triggered import, draft/send or Git storage of customer values. Do not mark READY with material inputs in an open-questions section.

**Dependencies / sequencing.**

S216 must resolve the concrete source/object/target contract; S218 later consumes only an exact reviewed handoff. Pending status is a real dependency hold, not permission to implement presumed defaults.

**Standalone delivery contract.**

- **Deliverable now:** This honest pending intent and blocker specification only; no finalized implementation deliverable is claimed.
- **Consumes, but does not assume:** Verified S216 contracts when available; absence remains PENDING/BLOCKED rather than an empty successful mapping.
- **Externally blocked effect:** All extraction/mapping implementation admission and live import are held until the material contract is finalized. Later import effects also require S218's exact operation contract.
- **Produces for downstream suites:** Once finalized and implemented, a provenance-backed reviewed mapping for S218. No such mapping exists or is promised by current authoring.

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
