<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: operations-communications-maintenance-2026-10 -->

# S216 — Bounded acquisition source and target contract investigation

> Intake: READY, 2026-10-09, intake 088. READY for a bounded read-only contract investigation only. Downstream extraction/import remains pending; no posting, customer communication or execution authority is supplied by this intake.

**Goal.**

Establish the actual acquisition inputs, exact target object scope and supported destination contracts so subsequent acquisition specifications can be finalized without guessed mappings or effects.

**Current state / intended end state.**

The October 8 meeting describes an incoming acquisition, document gathering, tenant letters, insurance/owner paperwork and matching data into RentVine and the app. These are intended workload categories, not an established source schema, imported-object set or cutover contract. Existing RentVine/Sheet integrations support bounded specific operations; they do not establish general acquisition creation/import. The owner accepted the acquisition category, but no actual source format, exact object set or financial/cutover values were supplied. End state: those factual gaps are resolved or explicitly blocked with bounded evidence.

**Execution investigation readback — 2026-10-10 UTC.** The owner started this program on
October 9. The bounded source inventory checked only the named Windows repository: 67 PDF,
CSV, XLSX, DOCX or EML files were listed by metadata, with zero filenames identifying an
acquisition/onboarding/cutover/opening-balance source. This is not proof that an unlabelled file
contains no acquisition material; no acquisition sample or authorized custodian/access path has
been identified. The supplied meeting evidence establishes workload intent, not source fields,
a target list or financial opening state. Private inventory remains outside Git.

Current owning code has specific property/contact/lease reads in
`lib/integrations/rentvine/client.ts`; the exact Registry contains no generic acquisition/import
action. Those reads and existing renewal/work-order writes do not establish property, unit,
contact, lease, balance or document creation/import permissions. No target operation is confirmed,
so no account effect or capability proof was attempted and no provider endpoint is presumed.
S182's Dotloop API-origin exclusion remains mandatory for any later extraction boundary.

R-S216-1/2/3/4 retain named material holds: an identified real sample and custodian; the exact
object/document inventory and existing/new matching basis; financial inclusion or explicit
exclusion with opening/cutover decisions; and each confirmed destination's documented account
contract, readback and correction semantics. S217/S218 remain PENDING. These are scoped missing
inputs, not permission to invent a CSV schema or to narrow acquisition out of the program.

An additional authorized read on October 10 inspected three Dan-linked threads (eleven messages,
no further page) since October 1 for acquisition/native-answering material. It found no new actual
source sample, phone account/coverage or approved operating-policy inputs. Existing Vendoroo and
Dotloop correspondence supplies no missing acquisition/native contract. Raw replies remain private;
no external follow-up was sent and the same downstream pending outcomes remain required.

**Actors and entry conditions.**

A separately authorized investigator and existing staff who own the real source data, acquisition scope and cutover decisions. Use accessible project evidence and authorized read-only provider/source access. Real documents and customer values remain private; permission to read one source does not grant import, posting or account provisioning.

**What it is / how it functions.**

1. **R-S216-1: Inventory actual sources and profiles.** Locate the real acquisition inputs and their authorized custodian/access path. Inspect bounded representative actual samples and identify formats, versions, fields/sections, stable identifiers, quality, completeness, duplicates, document families and available ownership/provenance. Record limits explicitly; the approximate property count in meeting notes is not an exact target list. If sources are unavailable, name the precise sample/access needed and stop that row rather than inventing a schema.

2. **R-S216-2: Resolve exact business object and cutover scope.** Establish the exact objects and document families intended for transfer, which already exist versus must be created, and which system is authoritative for each. Investigate candidate categories such as properties/units, owners/residents, leases, balances/charges/deposits and documents only to resolve scope; do not assume all are imported. Obtain explicit financial scope, effective/cutover dates, matching decisions and ownership for unresolved business choices. Historical maintenance backfill remains excluded.

3. **R-S216-3: Verify actual target capabilities and permissions.** For each confirmed target operation, inspect current code and official provider documentation plus authorized read-only capability/account evidence. Establish supported schemas, endpoints/actions where documented, required permissions, identifiers, limits, validation, idempotency, readback and correction/rollback semantics. Distinguish app-owned staging from RentVine/Sheet/Dotloop or other provider effects. Missing capability is a bounded gap; do not guess endpoints or infer rights from the existence of a credential.

4. **R-S216-4: Resolve document, privacy and downstream handoff.** Identify required document outputs, destinations, association rules and legal-content ownership from real inputs. Determine which extraction may be deterministic or use permitted AI; S182 still excludes Dotloop API-origin data at AI boundaries. Reconcile findings into S217/S218 and native references, keeping raw documents/customer mappings outside Git. Ask remaining material business questions directly in the console; do not create a new approval framework or an extra alignment report.

**In scope / out of scope.**

In scope: bounded read-only discovery of actual sources, profiles, object/financial/cutover scope, destination contracts, permissions and document handoff needed to finalize acquisition specs. Out of scope: extraction/import implementation, live posting, tenant letters/drafts/sends, credentials/accounts/IAM changes, provider activation or historical maintenance backfill.

**Open questions & assumptions.**

Material downstream gaps: actual source formats/samples; exact source and destination object set; exact existing/new matching basis; financial scope; effective/cutover decisions; document families and destinations; current provider capability/permission and idempotency/correction contracts. These are this investigation's required outputs, not assumed values. Acceptance of recommendations does not supply them.

**Cross-product impacts.**

S217 extraction/mapping and S218 resumable import/document handoff; existing RentVine/Sheet adapters, app-owned staging, document stores and S182 source-origin enforcement. Reuse existing evidence/specification paths; create no agent loop or new management system.

**Authority and evidence map.**

| Input                                                                                                         | Classification                   | Use and limitation                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`, current code/tests and serving readback                                                          | Authority / implementation truth | Existing identity, Space, provider and exact-operation boundaries apply. Starting reference for this batch: WSL main `43bad3ad`, serving `337ac163` on 2026-10-08; recheck before implementation. A reference is not fresh live proof. |
| October 8 meeting transcript 00:12:56–00:13:55; current integration code and exact Action Registry            | Project evidence                 | Establishes acquisition workload and existing bounded action limits, not an import schema or account permission.                                                                                                                       |
| Owner's 2026-10-09 clarification and accepted recommendations                                                 | Confirmed desired behavior       | Include acquisition automation in scope, beginning with concrete factual contract investigation.                                                                                                                                       |
| Real acquisition source samples, destination account capability and explicit business scope/cutover decisions | Required investigation inputs    | Missing inputs block the corresponding investigation row and downstream finalization; record precise access/value gaps without guessing.                                                                                               |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S216-1** — A bounded source inventory maps each observed source family to a real private evidence reference and a reproducible profile, with observed versus unknown fields separated. Inventory review fails when an asserted format or identifier has no actual source evidence.
- **ARCH-S216-2** — An object-level source/target/authority matrix distinguishes confirmed in-scope, excluded and unresolved categories, with existing-record versus new-record handling and cutover basis. A matrix completeness check fails if financial or new/existing semantics are silently assumed.
- **ARCH-S216-3** — Each proposed destination operation has documented provider support, actual account/access evidence and the applicable existing action/authority boundary. Capability checks fail when a generic import is inferred from unrelated open keys.
- **ARCH-S216-4** — Downstream specs receive traceable confirmed contract inputs and exact remaining blockers through the established native mechanism. A readiness audit fails if S217/S218 is declared ready while any source format, object set, financial/cutover or provider-effect contract remains material and unresolved.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S216-1** — Staff can identify what real inputs are available, what each contains and which missing inputs prevent mapping, without exposing raw customer data in Git.
- **BEH-S216-2** — The owner and implementer can tell exactly what will move, which records must match existing ones, what financial data is included and when the acquisition becomes current.
- **BEH-S216-3** — The future loop receives an evidence-backed contract or exact provider hold per operation and cannot mistake an app preview for completed source-of-truth creation.
- **BEH-S216-4** — Staff receive a concise evidence-grounded contract summary and only the decisions research cannot answer; downstream work is either concrete and finalized or honestly pending.

**Human litmus outcome.**

### Know exactly what the acquisition can import

**If this was built correctly:** Staff can point to the real files, the exact records and documents to transfer, the matching and financial rules, the supported destinations and the cutover decision. Anything still unavailable is named precisely before the import work starts.

- Model verdict: PARTIAL — accessible bounded investigation is complete; actual account/source/operational inputs remain missing. See the native program ledger; no completed external contract or delivery is claimed.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                                 | Architecture outcome | Behavior outcome | Human litmus                                 | Deterministic evidence / falsification                                                                                                                                                                                        |
| ----------------------------------------------------------- | -------------------- | ---------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-S216-1: Inventory actual sources and profiles             | ARCH-S216-1          | BEH-S216-1       | Know exactly what the acquisition can import | AC-S216-1: Trace every source profile claim to a bounded real sample/readback; inspect format, keys, duplicates and coverage. Missing actual samples are BLOCKED, never represented by a synthetic schema.                    |
| R-S216-2: Resolve exact business object and cutover scope   | ARCH-S216-2          | BEH-S216-2       | Know exactly what the acquisition can import | AC-S216-2: Read back the actual object inventory and obtain explicit non-discoverable scope/cutover decisions. No unspecified financial objects, exact target count or historical maintenance import may appear as confirmed. |
| R-S216-3: Verify actual target capabilities and permissions | ARCH-S216-3          | BEH-S216-3       | Know exactly what the acquisition can import | AC-S216-3: Cross-check every destination operation against official docs and actual existing keys/permissions; verify reads only. No probe creates a property, lease, balance, document, draft or provider proof.             |
| R-S216-4: Resolve document, privacy and downstream handoff  | ARCH-S216-4          | BEH-S216-4       | Know exactly what the acquisition can import | AC-S216-4: Compare S217/S218 against every inventory/object/capability/document decision; verify private evidence handling, origin boundaries, native references and absence of unsupported READY claims.                     |

**Preservation set.**

Existing exact provider gates, staff-initiated preview/confirmation and receipt/readback boundaries; source truth and private evidence handling; S182 exclusion; no historical maintenance backfill; existing acquisition records remain untouched.

**Adversarial acceptance checks.**

- **AC-S216-1** — Trace every source profile claim to a bounded real sample/readback; inspect format, keys, duplicates and coverage. Missing actual samples are BLOCKED, never represented by a synthetic schema. This falsifies ARCH-S216-1 / BEH-S216-1 and the named human litmus.
- **AC-S216-2** — Read back the actual object inventory and obtain explicit non-discoverable scope/cutover decisions. No unspecified financial objects, exact target count or historical maintenance import may appear as confirmed. This falsifies ARCH-S216-2 / BEH-S216-2 and the named human litmus.
- **AC-S216-3** — Cross-check every destination operation against official docs and actual existing keys/permissions; verify reads only. No probe creates a property, lease, balance, document, draft or provider proof. This falsifies ARCH-S216-3 / BEH-S216-3 and the named human litmus.
- **AC-S216-4** — Compare S217/S218 against every inventory/object/capability/document decision; verify private evidence handling, origin boundaries, native references and absence of unsupported READY claims. This falsifies ARCH-S216-4 / BEH-S216-4 and the named human litmus.

**Forbidden actions / hard gates.**

No source-of-truth posting, provider proof, import test against real targets, draft/send, new credentials/identity, guessed endpoint/schema/target list or claim that missing factual inputs were accepted by recommendation. Do not place raw source documents, customer values or private mappings in Git.

**Dependencies / sequencing.**

Independent read-only investigation. It enables finalization of S217/S218; its READY registration does not make either downstream implementation ready.

**Standalone delivery contract.**

- **Deliverable now:** A bounded, evidence-backed source/target contract investigation and native-spec reconciliation, with truthful missing-input states.
- **Consumes, but does not assume:** Actual privately accessible sources, current documented provider contracts and explicit owner business decisions; unavailable items remain named BLOCKED rows.
- **Externally blocked effect:** All downstream import/document/customer effects remain outside this investigation. Missing source or scope inputs also block the exact investigation acceptance row.
- **Produces for downstream suites:** Verified acquisition source profiles, exact confirmed object/cutover scope, destination capability constraints and concrete inputs for S217/S218, with private raw evidence outside Git.

**Verification and delivery contract.**

1. Recheck existing code, source access and relevant official provider documentation. Record which exact required input is present and which is unavailable; do not start implementation or request a live effect as research.
2. For each architecture/behavior/acceptance row, retain bounded private source evidence and report the non-secret conclusion in the console and the existing specification/facts mechanism. Cross-check an actual representative source against its proposed contract; synthetic material cannot prove provider support or a real acquisition/phone configuration.
3. Audit scope, authority, privacy and references; run native specification validators after any separately authorized specification revisions. `bash scripts/verify.sh` is required if a later authorized code change occurs; a read-only investigation does not invent an application implementation or require unrelated release tests.
4. Report `ALL_GATES_GREEN` for this investigation only when every required factual contract and decision is resolved with evidence and the dependent specifications have no hidden material gap. Missing exact inputs remain `BLOCKED` for the affected acceptance rows, with independent findings delivered. Use `BUDGET_EXHAUSTED` only for an explicit budget. An investigation result neither activates provider effects nor claims the downstream feature is implemented.

**Ordered prompt sequence.**

1. Recheck current app/provider boundaries and inventory the actual available inputs without posting or changing routing.
2. Inspect bounded real source evidence and official contracts; map each requirement to a factual conclusion or exact unavailable input.
3. Ask only business/policy questions that the evidence cannot answer, in the console; do not substitute inferred values for owner decisions.
4. Resolve the contract, revise dependent native specs and validate references. Report resolved versus blocked rows accurately; execute no downstream import, call, message or cutover.

**Deletion/merge recommendation.**

Retire or merge only after code, tests and current facts own every requirement and preservation check, with actual delivery evidence. Do not retire because a related suite is deployed or the spec is registered.
