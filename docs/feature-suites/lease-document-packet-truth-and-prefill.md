<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: dotloop-pdf-renewal-v1-2026-10 -->

# S66 — Editable renewal packet facts, participants and charge policy

> Intake: READY, revision 2026-10-06, intake 051. Existing truth/snapshot/binding machinery is deployed. Canonical input authoring, current-term integration and expanded configurable form coverage are specified here; no implementation or live write is started.

**Goal.**

Staff enter or correct lease facts once, review applicable documents, signer roles and charges, and prepare a consistent versioned renewal packet from the exact owner-approved terms. Missing facts hold only the output that needs them.

**Current state / intended end state.**

At `60145e926a477a35990c48b1123489d98822fe8b`, packet evaluation and immutable snapshots exist. `lib/lease-documents/live-input.ts` reads a private approved catalog and per-lease source mapping, but no ordinary application writer creates that mapping. It still derives approved terms from `workspace.ownerResponse.terms` while current working/effective terms have separate owners. Catalog/schema require the original seven families and do not model KCRAR additional disclosures, the brokerage disclosure brochure or Second Nature separately. Animal and participant models do not supply all fields needed by the references.

End state: one app-owned, durable packet input record reuses current source-backed facts and working terms, supports staff corrections and typed missing inputs, and produces exact snapshots for S130/S34. It does not become a competing lease ledger or silently amend RentVine/Sheets.

**Actors and entry conditions.**

Renewal staff operate any lease they may access in the Renewals Space, including unassigned leases under the existing workability contract. Admins publish company fee policy, form versions and mapping/applicability configuration. Staff can edit per-lease facts and review/confirm their packet under S182; owner approval of exact renewal terms remains a distinct factual decision. Verification accounts remain effect-free.

**What it is / how it functions.**

1. Use existing lease/cycle identity, working-record/effective-term owners and current verified source reads. Surface source, time, confidence and conflict per field. Persist staff-supplied values with actor/time and provenance; do not mutate or relabel a provider source. Wire the ordinary authoring path to the mapping/snapshot consumers so a correctly configured lease can actually produce a packet.
2. Scope v1 to renewals, including a replacement full lease when the approved form-family rules require it. A new-tenancy application/intake workflow is outside scope. Packet contexts retain distinct tenant and owner audiences; an owner acknowledgment is not mixed into tenant signature instructions.
3. Extend configurable coverage for all eight local reference document types: residential lease, extension, animal agreement, lead disclosure, owner acknowledgment, KCRAR additional disclosures, Missouri brokerage disclosure brochure and Second Nature insurance addendum. Preserve city/HOA family support for properties requiring supplied approved material. Family counts, filenames and the word Required in a filename do not establish applicability. Preserve compatibility with existing catalogs/maps/snapshots; do not reinterpret historical records under a new schema.
4. Admin configuration records which forms are mandatory or conditional by packet context/form family and relevant property/lease facts. Staff review the applicable checklist and document selection before finalization. Known-not-applicable families do not hold a packet; unknown applicability holds the affected ready output with a specific question. Staff cannot silently omit a configured required form. Local references are reference-only until the existing publication/approval process establishes the production version and mapping. No standard-renewal legal checklist is inferred from these files.
5. Required ordinary facts follow reviewed mappings: property/unit address, landlord legal entity, tenants/owners, original lease date, renewal dates/rent, return-by deadline, any selected month-to-month or termination fallback, relevant disclosures and policy elections. Do not supply guessed fallback terms, assistance-animal treatment or insurance/credit-reporting elections. Names/firm identities printed in old exports are not authoritative defaults.
6. Separate actual people/organizations from signer roles. Capture and validate tenant, owner/landlord, PMI manager/agent, broker or guarantor where the approved form requires them. One person may hold multiple mapped roles; do not collapse a PMI manager into the actual property owner. Populate participant names/emails from verified contacts or explicitly reviewed staff entries, with documented Dotloop roles for handoff. The shared API user and last settings editor do not automatically become the PMI signer or packet approver. Repeated slots and order come from the reviewed template; excess parties require an approved capacity-compatible form/attachment rather than dropping people.
7. Admins maintain versioned fee/policy configuration. Capture missing per-animal species/type, name, weight/unit and maturity basis where required, FIDO score, treatment category, deposit and recurring/one-time charge facts. Reuse verified existing charge/source data where suitable. Calculate only approved applicable rules, with per-animal amounts and visible totals separated into rent, recurring fees, one-time fees and refundable deposits. Unknown applicability/inputs do not become zero. Reject overlapping/undefined policy tiers and inconsistent form/config economics; never adopt the visible or hidden printed fee schedule as policy automatically. Staff may record an explicit reviewed per-lease override with reason and provenance; it is not a shared policy edit.
8. Bind the owner-approval evidence to the exact current working renewal terms revision and included economic decisions. Approval records who reported the owner's decision and its source/time; it is not a model inference or staff replacement for that decision. Changes to covered terms, charges, parties, relevant facts, form version or mapping invalidate the affected packet/output approval. Optional pricing review alone is not owner approval. Staff can continue drafts and corrections while approval is pending, but cannot finalize/upload them as approved legal packets.
9. Review snapshots consistently across all documents. A changed snapshot creates a successor without rewriting the original. Reopen saved work after navigation/restart, reject stale concurrent writes, and expose conflicting changes for resolution. Policy updates mark affected previews stale; frozen/provider-attempt records retain their original versions and evidence. No packet save or fee calculation itself writes RentVine charges or Sheet values; existing source-update workflows retain their separate exact confirmations.

**In scope / out of scope.**

In scope: durable packet inputs/editor, working-term approval binding, per-party/per-animal facts, configured fees/applicability, reusable snapshots and truthful missing-input states. Out of scope: invented legal terms/fee amounts, adoption of references as approved forms, new-tenancy intake, new pet-screening/insurance connectors, automatic billing, unrestricted source edits, team AI transcripts and signature execution.

**Open questions & assumptions.**

No authoring decision remains open. Current legal-version approval, actual mandatory-form rules, company signer identities, exact fee amounts/treatment rules, and customer facts are runtime configuration/data inputs. Their unset states and refusal behavior are part of this contract; they are not silently defaulted. The owner accepted configurable rules and staff review, not particular legal content or numerical rates. The local references do not supply city/HOA material. Stable Drive access is explicitly deferred.

**Cross-product impacts.**

Verified owners: `lib/lease-documents/live-input.ts`, `lib/lease-documents/live-source-schema.ts`, `lib/lease-documents/packet-types.ts`, `lib/lease-documents/artifact-catalog.ts`, `lib/lease-documents/evaluate-packet.ts`, `lib/lease-documents/fact-resolution.ts`; packet binding/execution; `lib/firestore/renewal-working-record.ts`, `renewal-effective-terms.ts`; `lib/lease-renewal/working-record.ts`, `lib/lease-renewal/effective-terms.ts`; `components/lease-renewal/PacketTruthPanel.tsx`; S130 intake and filled artifacts. Extend existing owners and native stores; do not invent a second process engine. S34 consumes complete versioned snapshots; S182 governs operational access and AI provenance.

**Authority and evidence map.**

| Input                                                  | Classification       | Use and limitation                                                                                    |
| ------------------------------------------------------ | -------------------- | ----------------------------------------------------------------------------------------------------- |
| AGENTS.md; S113/S154/S156/S167 and current source      | Authority / baseline | Workable leases, exact source effects, working terms and separate owner direction.                    |
| 2026-10-06 answers and accepted Q4–Q11 recommendations | Confirmed intent     | Renewals/replacement leases, app-driven filling, configurable charges, broad staff operations.        |
| Eight local reference PDFs                             | Reference evidence   | Document families, field/signer capacity and printed-value conflicts; not legal/publication approval. |
| Missing per-lease/policy values                        | Runtime inputs       | Exact dependent output waits; draft/editor and independent preparation remain available.              |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S66-1** — Existing lease/cycle and working-term owners feed one durable input-authoring/snapshot path with provenance and concurrency control; a route-to-store-to-evaluator case exposes today's missing writer.
- **ARCH-S66-2** — Versioned catalogs, policy and distinct identities/roles resolve applicability, repeated fields and approved terms without reinterpreting historical records.
- **ARCH-S66-3** — Snapshot and output identities bind exact input, approval, policy, template and mapping versions; stale successor/restart cases cannot reuse old approval.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S66-1** — Staff edit a lease once and see consistent saved facts, signers, missing inputs and document selections across the packet.
- **BEH-S66-2** — Approved configurable fees yield auditable per-animal and aggregate totals; unknown/conflicting inputs and elections are never guessed.
- **BEH-S66-3** — Current working terms can produce an approved snapshot; changed terms/facts/config require renewed review/approval only where affected, without erasing prior evidence or executing a source write.

**Human litmus outcome.**

### Enter the renewal facts once

**If this was built correctly:** Staff open a lease, complete missing pet/contact details, inspect charges and the document checklist, and see the same approved dates, rent, people and amounts in every form. A later correction clearly requires a new review and preserves earlier work.

- Model verdict: NOT RUN — specification authoring only.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                        | Architecture outcome | Behavior outcome | Human litmus                 | Falsification                                                                                           |
| -------------------------------------------------- | -------------------- | ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| Usable durable fact/participant authoring          | ARCH-S66-1           | BEH-S66-1        | Enter the renewal facts once | AC-S66-1, AC-S66-4, AC-S66-5; route/store/evaluator journey, reload, missing writer and conflict cases. |
| Correct configured document families/applicability | ARCH-S66-2           | BEH-S66-1        | Enter the renewal facts once | AC-S66-6; independent missing family, audience, unknown/required/conditional cases.                     |
| Charge policy and source semantics                 | ARCH-S66-2           | BEH-S66-2        | Enter the renewal facts once | AC-S66-7; per-pet/tier boundaries, override and conflicting printed values.                             |
| Exact approved terms and immutable successors      | ARCH-S66-3           | BEH-S66-3        | Enter the renewal facts once | AC-S66-2, AC-S66-3, AC-S66-8, AC-S66-9; Working terms, changed version, freeze and no-effect checks.    |

**Preservation set.**

Existing `s66-packet-truth-boundary` and `s66-dotloop-packet-binding`; S113 manual progress/source truth; current effective-term behavior and supported RentVine/Sheet write contracts; S21 publications; S130 derived provenance; S20 own-receipt recovery. Preserve existing source and audience boundaries and the current reviewed Sheet switch.

**Adversarial acceptance checks.**

- **AC-S66-1** — Missing required catalog/source/participant/signature requirements hold the dependent final output, while staff can save draft work and see the exact missing input (ARCH-S66-1).
- **AC-S66-2** — Snapshot creation is immutable/idempotent by exact source/version identity and conflict-safe across users and restart (ARCH-S66-3).
- **AC-S66-3** — Provider binding rejects incomplete, stale, mismatched or locally asserted provider completion (ARCH-S66-3).
- **AC-S66-4** — An ordinary staff editor actually persists the inputs consumed by the evaluator; current verified source facts and reviewed staff additions survive reload and do not mutate source systems (BEH-S66-1).
- **AC-S66-5** — Multi-tenant, multiple-owner, PMI manager/broker and multi-animal cases preserve identity, roles, verified emails, order and capacity; no absent or excess party is dropped or invented (BEH-S66-1).
- **AC-S66-6** — All eight reference types are representable alongside legacy city/HOA support. Missing unrelated families do not hold a valid selected packet; missing required/unknown applicability does. Tenant/owner audiences stay distinct (ARCH-S66-2).
- **AC-S66-7** — Versioned policy produces correct per-animal and total recurring/one-time/refundable amounts; tier overlap/gaps, unknown FIDO/treatment/elections and form/config conflicts require review, not a guessed rate. Overrides preserve reason/source (BEH-S66-2).
- **AC-S66-8** — A current Working terms revision with actual recorded owner approval is accepted; old `ownerResponse.terms`, optional pricing review, or changed covered facts cannot substitute for that approval (BEH-S66-3).
- **AC-S66-9** — Changed inputs/policy/maps create a successor and invalidate affected approvals without altering frozen attempts; saving the facts or calculating fees produces no RentVine/Sheet/Dotloop write (ARCH-S66-3).

**Forbidden actions / hard gates.**

No legal/financial value invention, guessed signer/email, silent policy adoption, unreviewed mandatory-form omission, automatic source billing, false owner approval, signature inference, send or provider action from an app-owned save. Do not broaden global auth roles or cast a staff actor as Admin. Exact provider actions remain S34/governed source workflows.

**Dependencies / sequencing.**

Consume current source/working-term services and S21/S130 configuration. Produce inputs and immutable snapshots for S130 and S34. S182 removes unnecessary operational role bottlenecks; Admin publication/policy remains separate. Live credentials, Drive connectivity and provider keys are unnecessary for draft/input/snapshot engineering.

**Standalone delivery contract.**

- **Deliverable now:** full authoring/policy/checklist and source-resolution slice with local/emulator/service tests, no effects, including empty/missing/conflicting configuration.
- **Consumes, but does not assume:** approved production form/policy data, customer facts and exact owner-direction evidence; missing inputs are named per output.
- **Externally blocked effect:** customer-ready final packet needs its actual approved/configured values. Provider upload additionally needs S34/S106 and separate activation; neither holds code delivery.
- **Produces for downstream suites:** provenance-bearing facts, separate identities/roles, reviewed inclusion set and immutable version/approval-bound snapshots.

**Verification and delivery contract.**

Before implementation establish the missing-writer and obsolete-term-source failures, then execute each declared service/route/emulator/UI scenario and a separate preservation gate. Use synthetic data only locally. An authorized implementation delivery runs the relevant backend/browser checks and repository verification. Engineering completion is separate from current legal/policy approval and live acceptance. This authoring revision initiates no implementation/release.

**Ordered prompt sequence.**

1. Recheck current fact, Working terms, catalog and actor owners; preserve correct baseline behavior.
2. Freeze fail-first durable authoring, applicability, party, charge, approval-version and concurrency checks.
3. Wire/extend existing input and snapshot owners and staff controls; keep unresolved facts explicit.
4. Falsify changed-version and no-effect boundaries, verify preservation, and report runtime inputs separately.

**Deletion/merge recommendation.**

Keep until the new authoring/resolution contracts and scoped readiness are represented in verified owners. Earlier packet-truth evidence remains historical proof of its original checks, not these new outcomes.
