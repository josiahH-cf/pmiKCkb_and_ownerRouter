<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: dotloop-pdf-renewal-v1-2026-10 -->

# S66 — Editable renewal packet facts, participants and charge policy

> Baseline: IMPLEMENTED AND DEPLOYED — intake 051, including durable staff inputs, current
> Working-term approval, ten form families and configured charges. November 3 U2 engineering
> source and local gate QUALIFIED; application delivery PENDING. Private source/economics
> proposals remain unapproved and unpublished; corrected full07/prior final v8 technical scopes are in
> [implementation evidence](../evidence/application-gap-implementation-2026-11-03.md). This does not verify approved maps, legal content or human acceptance.

**Goal.**

Staff enter or correct lease facts once, review applicable documents, signer roles and charges, and prepare a consistent versioned renewal packet from the exact owner-approved terms. Missing facts hold only the output that needs them.

**Current state / intended end state.**

The serving `bc97535379dd08deab578455b00a80fc93b8d209` runtime includes durable packet facts,
people/roles, animals and reviewed overrides; current Working-term/owner-approval binding;
versioned charge policy and family use; ten configurable form families and immutable snapshots.
The suite registry and November 3 delivery evidence establish that baseline. The assessment read
family use version 0 engineering defaults, no published charge/Rhino policy, and no approved intake
entries; that is missing actual configuration/evidence, not proof that the authoring code is absent.
The finalized U2 follow-up below recovers existing decisions and defines precise unresolved asks
and their use in these existing controls.

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

- **ARCH-S66-1** — Existing lease/cycle and working-term owners retain one durable input-authoring/snapshot path with provenance and concurrency control; removing the actual writer must fail the route-to-store-to-evaluator preservation case.
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

The delivered authoring/term-source repairs retain their original evidence. Any later follow-up
first reproduces its named remaining gap instead of assuming those historical failures remain.
Use synthetic data only in isolation; actual legal/policy approval and live acceptance remain
separate. This finalized authoring revision initiates no implementation or release.

**Ordered prompt sequence.**

1. Recheck current fact, Working terms, catalog and actor owners; preserve correct baseline behavior.
2. Freeze fail-first durable authoring, applicability, party, charge, approval-version and concurrency checks.
3. Wire/extend existing input and snapshot owners and staff controls; keep unresolved facts explicit.
4. Falsify changed-version and no-effect boundaries, verify preservation, and report runtime inputs separately.

**Deletion/merge recommendation.**

Keep until the new authoring/resolution contracts and scoped readiness are represented in verified owners. Earlier packet-truth evidence remains historical proof of its original checks, not these new outcomes.

## November 3 finalized follow-up — U2 evidence, applicability and economics

> Authoring: FINAL. Follow-up source and local gate QUALIFIED; application delivery PENDING.
> Dan is the ASK contact only for exact unresolved business decisions. Private proposals preserve
> source and authority; no message, legal approval or provider effect is inferred.

**Goal.**

Staff use already-available source facts and established decisions to prepare one consistent
renewal. Only genuinely unresolved context, policy, party or signing meaning reaches Dan, with a
supported recommendation; the answer then feeds the existing versioned configuration and lease
records instead of another checklist or approval system.

**Current state / intended end state.**

The November 3 assessment establishes the deployed S66/S234/S235 baseline and explicit missing
runtime configuration. Source owners already exist: `lib/lease-documents/packet-assembly.ts`
adopts source facts with provenance; `packet-inputs.ts` records staff facts/people/animals;
`evaluate-packet.ts` classifies extension/full-lease contexts; `family-use.ts` distinguishes
engineering defaults from recorded decisions; `charge-policy.ts` calculates versioned approved
rules and reviewed overrides; `owner-approval-binding.ts` binds exact Working terms/economics.
No new general source-write permission or competing policy store is needed.

Bailey's October 1 correspondence supplies source forms and guidance to use an extension when a
tenant is already on PMI's lease. This attributed evidence is consistent with investigating the
executed-lease/form-family basis; it is not proof that every current lease is compatible, every
form version is approved, or printed charges are current policy. Current `evaluate-packet.ts`
(lines 175–266) requires actual renewal/management/execution/family facts; missing or conflicting
facts remain unknown.

Intended: an evidence-first case worksheet and precise decision closure through those current
owners. Technical investigation and isolated checks complete independently; only an actual
unavailable business fact/approval holds its dependent real output.

**Actors and entry conditions.**

Engineering and authorized staff recover accessible source facts/decisions before asking. Dan is
the designated business-question contact and coordinates an informed team answer when needed.
The record names the actual landlord/representative, document, policy or financial authority for
the decision; Dan's contact role does not invent delegation. Current staff and shared-configuration
roles remain those enforced by the existing controls. The separate November 3 timing-basis rule is
owned by its timing suite; this specification adds no Admin re-confirmation step to it.

**What it is / how it functions.**

- **R-S66-10 — Recover a case's existing basis.** Resolve the actual lease/cycle and accessible
  executed lease, current RentVine/Sheet/Working facts, prior decisions and applicable policy
  evidence. For each material value show source/time/version, whether adequate/current, and an
  exact conflict or unknown. Do not ask again for a readable fact or invent a legal value from a
  familiar form name.
- **R-S66-11 — Close only unresolved business questions.** Prepare one concise Dan question per
  independent unresolved decision, grouped for review: known evidence, conflict/missing fact,
  supported recommendation, exact decision and affected output. Cover form-family compatibility,
  return-by/fallback, legal entity/representatives, signing order/capacity, actual conditional
  property facts, fees/elections/exemptions and relevant insurance/Rhino material only where needed.
  Recovered adequate decisions are carried forward with attribution, not resubmitted for consent.
- **R-S66-12 — Record informed rules and facts once.** Map the recovered or Dan/team decision into
  existing family use, charge policy, per-case facts/people/animals/overrides and S234 approval
  evidence with effective date, decision source and current version. Separate business agreement
  from app publication mechanics. A changed source, map, rule or covered economics creates a new
  version and invalidates only affected unexecuted approval; ordinary supported corrections retain
  their existing visible Save/Apply and exact-effect contract.
- **R-S66-13 — Produce a complete bounded review handoff.** Supply S130/S235 the version-bound
  context, applicability, economics and signer basis, plus a small unresolved remainder. Use the
  existing S238 client/staff review handoff and canonical blocker register; no separate approval
  portal, bulk customer export or duplicate lease ledger. Preparing this handoff sends nothing.

**In scope / out of scope.**

In scope: source/decision recovery, case worksheet, precise Dan questions, existing-control
configuration/data mapping, version/refusal checks and downstream handoff. Out of scope: deciding
law or fees, legal wording invention, treating email delivery as approval, blanket ten-form requests,
new-tenancy intake, general identity/privilege changes, actual publication/saves/sends or provider
effects in this authoring run. Provider activation remains the separately gated S34 plan.

**Open questions & assumptions.**

No material design question remains. Actual case identity, approved policy amounts/effective dates,
authority/delegation and unavailable source facts are bounded runtime inputs. Investigate existing
information first, then address exact unresolved meaning to Dan. Do not silently make the
designated contact the approver of every legal or financial matter. Unknown assistance-animal,
insurance, fallback or city/HOA applicability remains explicit, never false or zero.

**Cross-product impacts.**

S130 source/map preparation consumes the actual approved meanings and versions; S235 consumes
current applicability with precise missing suppliers; S234 owns actual owner-term approval;
S236 owns distinct signer/returned evidence; S237 retains its source-update preview and claims;
S238 owns the integrated review/communication package. No schema or engine duplication is planned.

**Authority and evidence map.**

| Input                                                   | Classification          | Use and limitation                                                                                        |
| ------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------- |
| November 3 owner answers and `AGENTS.md`                | Authoring authority     | Recover decisions, ask Dan only unresolved matters, specify existing controls; no execution/send/release. |
| Current named S66 code and November 3 assessment        | Implementation evidence | Existing inputs/calculator/classification and actual unset configuration, separately from human approval. |
| Attributed October 1 Bailey guidance and supplied forms | Intent/source evidence  | Supports the proposed extension-rule investigation; not blanket current policy/version/lease approval.    |
| Actual Dan/team/landlord evidence                       | Runtime decision input  | Must identify its proper authority and exact covered case/rule; cannot be guessed or silently broadened.  |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S66-4** — Existing fact/decision owners provide an attributed known/conflicting/unknown
  basis and a filtered unresolved-question set. A starting fixture with a recovered answer must
  fail if the answer is asked again or if an unverified default is relabeled as client policy.
- **ARCH-S66-5** — Existing versioned policy/input/approval stores are the sole destination for
  informed decisions; the handoff binds source, effective/version identity and covered economics.
  Wrong-version or uncited decisions fail before ready output; no shadow approval record counts.
- **ARCH-S66-6** — The existing handoff composes independently ready families and exact unknowns
  without source/provider writes or a new communication dispatcher. Missing one conditional input
  cannot block an unrelated supported preparation.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S66-4** — A known compatible executed-family case yields its supported extension context
  and basis; a known inherited case yields the existing full-lease context. Only an unknown or
  conflicting basis receives an exact unresolved question, not an invented extension decision or
  blanket restart.
- **BEH-S66-5** — Dan receives only the evidence-backed unresolved choice, recommendation and
  impact. An adequate existing answer creates no repeated consent requirement.
- **BEH-S66-6** — Approved effective fee/animal/insurance choices produce separated cents-accurate
  totals and exact version coverage; unknown input remains missing and changed economics makes
  covered approval stale without rewriting history or updating RentVine/Sheet automatically.
- **BEH-S66-7** — The review package names ready work and the precise remaining supplier; unused or
  excluded city/HOA/other-context material creates no universal intake prerequisite.

**Human litmus outcome.**

### Answer only what the team could not establish

**If this was built correctly:** Dan sees the information already recovered, a short recommendation
and only the remaining business choices. Staff then see those informed decisions and their sources
in the normal renewal screens. The same names, dates and charges flow into applicable documents;
an unresolved policy choice holds its own output without stopping unrelated preparation.

- Model verdict: NOT RUN — source inventory and private decision proposals are prepared; approved configuration, cumulative qualification and the complete litmus remain unverified.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                              | Architecture outcome | Behavior outcome | Human litmus                                  | Deterministic evidence / falsification                                                                                 |
| ---------------------------------------- | -------------------- | ---------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| R-S66-10 recovered case basis            | ARCH-S66-4           | BEH-S66-4        | Answer only what the team could not establish | Known/unknown/inherited/conflicting family and source fixtures through current resolver/evaluator.                     |
| R-S66-11 exact Dan questions             | ARCH-S66-4           | BEH-S66-5        | Answer only what the team could not establish | Recovered-answer suppression; supported recommendation, actual supplier and no inferred legal approval.                |
| R-S66-12 existing versioned destinations | ARCH-S66-5           | BEH-S66-6        | Answer only what the team could not establish | Existing route/store/calculator and owner-coverage tests; changed rule/source/economics invalidates affected approval. |
| R-S66-13 independent handoff             | ARCH-S66-6           | BEH-S66-7        | Answer only what the team could not establish | Applicable/excluded/unknown family fixture, exact remaining input and zero external effect.                            |

**Preservation set.**

Preserve `s66-packet-assembly`, `s66-packet-inputs`, `s66-family-use`, `s66-charge-policy`,
`s66-packet-truth-boundary` and current S234 approval-coverage checks; S130 original/map/output
provenance; S235 slots/context; actual Editor/Space rules; exact source-update confirmations and
no automatic provider effect. These are separate preservation gates, not proof of current legal
approval. No new test or real-case approval was performed in this authoring step.

**Adversarial acceptance checks.**

- **AC-S66-10** — A recovered adequate answer is not asked again; conflicting/obsolete evidence
  produces the exact unresolved question and source. Bailey guidance cannot approve an unrelated
  form version or all tenant cases (ARCH-S66-4, BEH-S66-4, BEH-S66-5).
- **AC-S66-11** — An unknown applicability/election/assistance treatment or fee stays missing; an
  excluded conditional family does not demand its material for another output
  (ARCH-S66-6, BEH-S66-7).
- **AC-S66-12** — A policy answer records the actual decision maker/source, effective date and
  exact version through existing controls. Printed source amounts, a contact title or an email
  attachment cannot become an approved shared rule by themselves (ARCH-S66-5, BEH-S66-6).
- **AC-S66-13** — Changed source/rule/economics marks affected approval stale; a private note or
  another case's approval cannot replace current S234 evidence. Frozen attempts and prior policy
  history remain unchanged (ARCH-S66-5, BEH-S66-6).
- **AC-S66-14** — Technical fixtures can complete while one actual client input remains unavailable;
  the handoff names only that dependent output and does not send, publish or update a system of
  record (ARCH-S66-6, BEH-S66-7).

**Forbidden actions / hard gates.**

No live save, publication, draft/send/schedule, provider business write, test customer record,
signature, key/permission change, invented value or automatic legal approval in this plan. A later
execution instruction retains the existing exact record/version/intent and provider gates. The
timing-basis clarification is not a blanket change to legal publication permissions.

**Dependencies / sequencing.**

Recover accessible evidence and map existing control destinations first. Send nothing during
authoring. Actual unresolved business facts go to Dan through the separately authorized client
handoff; accepted answers are recorded through current controls when work is authorized. S130
technical preparation and isolated checks proceed independently of those answers.

**Standalone delivery contract.**

- **Deliverable now:** finalized contract and precise source/decision/control mapping. A later
  bounded task can complete recovery, unresolved-question package and fixture checks without
  receiving new client values or opening keys.
- **Consumes, but does not assume:** adequate source/decision evidence; absent input remains exact
  unknown with its effect/supplier. No whole-program blocker or silent policy default.
- **Externally blocked effect:** a real approved packet needs its actual legal/policy/party and
  current owner-term evidence; only that named output remains held.
- **Produces for downstream suites:** attributed current context, applicable-family/economics/signer
  basis and a filtered unresolved remainder for S130/S235/S238.

**Verification and delivery contract.**

For a later authorized task, first show missing recovery/duplicate-question or incorrect binding
failures in isolated fixtures; a historical repaired defect is not new fail-first evidence. Exercise
each ARCH/BEH/AC row through actual existing owners and preserve unrelated behavior. Only a code
change under an authorized implementation invokes canonical delivery gates; legal/client values,
staff acceptance and operational provider effects remain separately evidenced. This plan executes
nothing and authoring READY is not implementation/delivery PASS.

**Ordered prompt sequence.**

1. Recheck current source/records and recover existing adequate decisions, including attributed
   correspondence and accessible signed-lease/property/policy evidence.
2. Prepare the case basis and only exact unresolved Dan questions with supported recommendations.
3. Under a later instruction, record informed answers through existing controls with correct
   authority/source/version and verify downstream context, calculations and stale-approval behavior.
4. Verify independent completion and all preserved effect boundaries; send/release only if separately
   authorized, never from the specification or an old suite label.

**Deletion/merge recommendation.**

Merge this follow-up into the current S66 contract after verified delivery; keep external runtime
holds solely in `docs/open-blockers.md`. Reuse S130/S235/S238 ownership and do not create another
approval portal, client intake suite or business ledger.
