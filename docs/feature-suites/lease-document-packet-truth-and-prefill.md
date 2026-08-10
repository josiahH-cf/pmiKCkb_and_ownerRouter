<!-- spec-shape: overhaul-v1 -->

# S66 — Lease document packet truth, conditional artifacts, and prefill

> New 2026-08-10. Derived from the 2026-08-07 PMI KC training transcript and the owner's
> 2026-08-10 approval of the recommended specification plan. This is a **specification-only** suite.
> It does not authorize product implementation, publication of a legal artifact, provider
> activation, a Dotloop call, a send, or a system-of-record write. S43 presents this contract, S21
> governs artifact publication, S25 governs external execution, and S34 transports an approved
> packet to Dotloop.

**Goal.** A staff member can build the correct lease document package from verified lease,
property, participant, charge, animal, policy, and legal-artifact facts without retyping known data
or guessing missing data. A standard existing PMI lease receives the approved extension package;
an inherited, nonstandard, or new lease receives the approved full package. Conditional documents
and fields appear only when their source-backed rules apply. The tenant package never contains the
owner-only acknowledgment, and the owner acknowledgment becomes available to every owner of record
only after the complete tenant package is verified as executed. The system proves why every
artifact and value was included, excluded, or blocked before any provider is contacted.

**What it is / how it functions.** S66 is the shared document-truth layer for lease renewals and
new-lease packet preparation. It defines packet choice, fact provenance, artifact versions,
conditional rules, participant visibility, readiness, and immutable preview snapshots independently
of the UI or e-sign provider.

- **Core outcome contract.** The current state is a partially modeled renewal-readiness checklist,
  scattered source data, a generic template slot, and a Dotloop executor that cannot determine the
  correct legal package. The intended state is one deterministic packet manifest whose artifacts,
  fields, sources, participants, and blockers can be inspected before execution. The minimum real
  capability is: classify the packet from verified facts; resolve every required field from an
  approved source; evaluate conditional artifacts; separate tenant and owner audiences; bind the
  result to exact artifact versions and a hash; refuse on missing/conflicting truth; and preserve an
  audit trail through retry, cancellation, and later execution. A result is incomplete if it selects
  only some required artifacts, fills a field without provenance, silently defaults an unknown,
  mixes owner-only and tenant-visible content, or calls a provider from a stale/partial manifest.

- **Packet contexts and deterministic choice.** `renewal_extension` is selected only when all of
  these are verified: the transaction is an existing-tenancy renewal, the active executed lease was
  issued from a PMI-managed form family, and that form family is marked extension-compatible in the
  active approved artifact catalog. `full_lease_packet` is selected when the transaction is a new
  tenancy, the active lease is confirmed inherited from another manager, or the lease form family is
  confirmed nonstandard/incompatible. Any unknown or conflict in transaction type, management
  origin, active executed document, or form-family compatibility yields `Needs input`/`Conflict`;
  it never defaults to the shorter extension. A human may correct source metadata, but may not
  relabel an unknown lease as standard without an attributable approved source.

- **Versioned artifact catalog.** Each approved artifact has an immutable artifact id, version,
  content hash, form family, status, effective dates, allowed packet contexts, jurisdiction and
  applicability predicates, required field bindings, signer/participant roles, visibility audience,
  signature locations defined by the artifact, superseded-version pointer, and publication source.
  Required catalog families include the standard lease, renewal extension, animal agreement,
  lead-based-paint disclosure, city addenda, applicable HOA artifact, and owner acknowledgment. An
  active pointer may move only through S21's validated publication/approval/rollback contract; old
  snapshots retain their exact versions. Missing or inactive legal copy blocks only manifests that
  require it and is displayed as `Approved artifact unavailable: <artifact label>`.

- **Packet manifest and snapshot.** A `RenewalPacketSnapshot` (final symbol selected during future
  implementation discovery) contains at minimum: snapshot id/version; lease and transaction ids;
  packet context and classification evidence; artifact ids/versions/content hashes; included and
  excluded artifacts with rule results and reasons; every field binding; every participant and
  visibility role; missing/conflicting facts; source timestamps/versions; catalog version; actor;
  creation time; and a deterministic payload/content hash. The snapshot is immutable. A corrected
  fact or new artifact version creates a successor and marks the old snapshot `Superseded` rather
  than mutating it.

- **Field truth envelope.** Every value used by a packet carries `fieldKey`, normalized value,
  display value, source system/document and exact source reference, source-retrieved/effective time,
  confidence (`Verified`, `Likely`, `Needs Review`, or `Conflict`), applicability, verifying actor or
  rule version, target artifact/field, and blocking scope. A fact is document-ready only when its
  field policy permits that source and confidence. Blank, stale, malformed, incompatible, or
  conflicting values are explicit blockers; no empty string, `0`, generic `N/A`, model completion,
  or prior unrelated value stands in for missing truth.

- **Source policy, not one blanket precedence.** The active executed lease and approved legal
  artifacts govern existing legal wording and executed terms. RentVine is the primary operational
  source for canonical lease/property/unit ids, active tenancy, participants, base rent, portfolio,
  and other fields its documented read contract actually returns. Versioned owner-policy rules and
  published company policy govern applicability and allowed charge treatment. The renewal Sheet may
  supply explicitly mapped workflow/operator facts but cannot silently override an executed lease
  or RentVine identity. An approved human resolution may settle a displayed conflict only with a
  reason, actor, source reference, and scope. Boom is not a document-fact source unless Spike S66-B
  proves a documented read contract. When two permitted authoritative sources disagree, the system
  records `Conflict`; it does not pick the newest or most convenient value implicitly.

- **Required fact inventory.** Packet evaluation covers, where applicable: canonical property,
  unit, lease, portfolio, and transaction identity; all adult/minor occupants and all owners of
  record; participant names, emails, and signing roles; lease start/end and renewal term; current and
  approved offered rent; proration; deposit amount and deposit type; landlord legal name including
  LLC suffix; utilities and lawn-care responsibility; appliances and other non-real property;
  building year; city/jurisdiction; HOA applicability; charges and coverage; and the per-animal
  facts below. A field absent from a particular artifact is shown as not consumed, not silently
  discarded from the shared truth model.

- **Charges and coverage.** Every potential charge records `applicable`, normalized cents when
  applicable, source reference, policy/catalog version, verification state, and target artifact.
  Resident Benefit Package applicability is required; when applicable, its current approved amount
  is required. Insurance coverage method is required: `PMI program`, `verified external coverage`,
  `not applicable under approved policy`, or `unknown`. A PMI insurance charge is required only when
  the approved policy and coverage method require one; verified external coverage does not acquire
  a PMI charge by default. Unknown coverage blocks the dependent document. The system must not
  hard-code the discussed `$100` value, animal charges, deposits, or any fee without an active
  approved source.

- **One record per animal.** Each animal has a stable local record id and source-backed species/type,
  name when present, breed, weight, verification status, approved policy treatment, agreement
  applicability, deposit/one-time/monthly charge applicability and cents, and source references.
  The app never decides whether an animal is a pet, service animal, assistance animal, emotional
  support animal, or accommodation. It records only an approved source's verified treatment.
  Verified non-pet/accommodation status suppresses charges only when the active policy says so and
  does not suppress the animal or agreement from the packet unless the policy explicitly does.
  Unknown classification, breed, weight, or required charge blocks only the dependent fields or
  artifact and remains visible per animal.

- **Conditional artifact rules.** Rules are versioned, deterministic, and explain their inputs.
  Pre-1978 lead-paint handling uses the verified year built and the active approved disclosure rule;
  missing year blocks the disclosure decision. City and HOA artifacts require verified jurisdiction
  and an approved applicability map; a city name alone is not permission to invent legal copy. The
  animal agreement, proration, deposit language, LLC naming, appliances/non-real-property schedule,
  responsibility terms, and other conditional content follow their active source rules. An
  excluded artifact remains visible with `Not applicable` plus the deciding facts/rule; an unknown
  never appears as `Not applicable`.

- **Participant and audience separation.** The tenant packet contains only tenant-visible
  artifacts and addresses every required tenant signer from the authoritative participant set. The
  owner acknowledgment is a separate owner-only artifact/packet, is never attached to or visible in
  the tenant packet, and addresses all owners of record under S61. Its text, signature fields, and
  signer requirements come from the approved artifact—not generated copy. It cannot reach
  `Ready for preview` until the tenant packet has an authenticated provider receipt proving every
  required tenant artifact is fully executed. A partial signature, webhook trigger without
  authenticated readback, or app-local checkbox is not sufficient. Repeated completion events create
  at most one acknowledgment readiness record for the same tenant-packet hash.

- **Readiness and state transitions.** Preparation states are `Not evaluated`, `Needs input`,
  `Conflict`, `Ready for preview`, `Previewed`, `Approved`, and `Superseded`. S25/S34 may project
  execution states `Provider pending`, `Partially executed`, `Executed`, `Failed`, and `Cancelled`
  after exact confirmation. Only a complete current snapshot can become `Ready for preview`; only
  an exact preview hash can be approved. `Partially executed` is never shown as complete. A failed
  attempt preserves the snapshot, receipt, provider state, and safe reconciliation path. Cancelling
  preparation stops local continuation but does not delete evidence or imply provider rollback.

- **Validation, retries, and concurrency.** Currency is stored as integer cents and dates/ids use
  the existing canonical parsers. Arrays preserve authoritative order while deduplicating only by a
  documented stable identity. Evaluation is pure for the same fact/catalog versions. Snapshot
  creation uses optimistic version checks; two concurrent saves cannot both become current. Repeating
  the same request/hash is idempotent. Any fact, participant, rule, artifact, or amount change
  invalidates the bound preview/approval before another provider attempt. Retry reconciles an
  ambiguous S34 attempt by idempotency key before creating anything else.

- **User-visible behavior in S43.** `Build documents` shows packet type, included/excluded artifacts
  and reasons, required participants/audiences, source evidence, missing/conflicting facts, active
  artifact versions, current state, and the exact next action. Empty state says no packet has been
  evaluated. Loading leaves prior committed truth visible and disables only the changing action.
  Error preserves entered values/focus and offers explicit retry. A blocker deep-links to its field
  and source when S44 has an exact destination; no generic provider homepage is represented as field
  evidence. Mobile and keyboard users receive the same facts and controls without horizontal-only or
  hover-only disclosure.

- **Roles and permissions.** A Space-scoped Editor may view packet truth, enter explicitly permitted
  operator facts, and request a preview; an Editor cannot publish an artifact, override a High/legal
  conflict, approve a packet, choose a missing participant role, or execute a provider action. An
  Admin may publish/activate artifact versions through S21, resolve a High conflict with source and
  reason, and approve an exact packet preview under S25/S34. Existing role/Space guards remain
  authoritative and every refusal occurs before a write/provider construction. Vendors and clients
  receive no S66 management surface.

- **Persistence, audit, and observability.** Store normalized facts, immutable snapshots,
  supersession links, rule/catalog versions, readiness changes, corrections, actor/time, and S34
  receipt references under the existing product-record retention/legal-hold policy. Logs contain
  ids, state, hash, counts, error class, and latency—not names, addresses, legal text, contact data,
  audio, or document bodies. Corrections append evidence and never rewrite an executed snapshot.

- **Buildable later under separate implementation authority (app-plane).** The shared fact/catalog/
  classifier/evaluator/snapshot contract, S43 readiness presentation, persistence/audit rules, and
  pure tests. S66 has no Action Registry gate of its own.
- **Build to the seam (live provider).** S66 itself does not add a provider. S21 supplies validated
  artifacts; S34 consumes the exact snapshot and owns Dotloop preview/confirm/receipt/reconcile/
  rollback. No fake document or fallback legal copy is an acceptable seam.
- **External dependencies.** Current approved artifacts plus their exact form-family, field,
  participant, signature, and conditional-rule metadata must be supplied through trusted
  publication. Dotloop connection/activation remains S34's separate named dependency. Missing
  content blocks only dependent document output and does not authorize invention.

**Open questions & assumptions.** The product behavior is decision-complete; the two remaining
unknowns require bounded evidence rather than another owner preference round.

- _Answered 2026-08-10:_ standard existing PMI lease → extension; inherited, nonstandard, and new
  tenancy → full packet; an unknown classification blocks rather than defaulting.
- _Answered 2026-08-10:_ charges require applicability, amount when applicable, source, and
  verification; RBP applicability and insurance coverage method are required; no discussed price is
  hard-coded without an approved source.
- _Answered 2026-08-10:_ animals are modeled separately and the app never makes an accommodation or
  legal classification. Verified policy treatment alone controls charge suppression.
- _Answered 2026-08-10:_ the owner acknowledgment is separate, owner-only, sent to all owners of
  record, and becomes eligible only after authenticated proof of the fully executed tenant packet.
- _Answered 2026-08-10:_ renewal and new-lease preparation share document truth; S43 is the renewal
  consumer and this suite does not create a new general-purpose leasing UI by implication.
- _Assumption:_ existing product-record retention/legal-hold policy remains applicable; this suite
  does not create a shorter legal-document retention class.

**Cross-product impacts.** Likely new bounded modules are
`lib/lease-documents/packet-types.ts`, `lib/lease-documents/fact-policy.ts`,
`lib/lease-documents/artifact-catalog.ts`, `lib/lease-documents/evaluate-packet.ts`, and a server-only
snapshot store under `lib/firestore/`; exact filenames are candidates until implementation discovery
proves the least-duplicative placement. Existing relevant paths include
`lib/lease-renewal/renewal-readiness.ts`, `lib/lease-renewal/facts.ts`,
`lib/lease-renewal/renewal-progress.ts`, `lib/lease-renewal/recipient-resolution.ts`,
`components/lease-renewal/RenewalWorkspace.tsx`,
`components/lease-renewal/RenewalProgressControls.tsx`, S21 publication types/service,
`lib/firestore/approved-templates.ts`, and the S25/S34 execution providers. S66 supersedes S43's
single generic template-slot interpretation and S34's operator-selected template/participant
default; it extends rather than discards the valid current readiness checks. S61 remains recipient
truth, S29/S62 remain rent-suggestion truth, and S28/S60 remain comp truth. No authority, gate, or
shipped fact changes in this specification pass.

**Feature spike S66-A — Approved artifact and field map.**

- **Decision enabled:** whether the trusted publication/template stores already contain enough
  exact metadata to build extension, full, conditional, and owner-acknowledgment manifests, and the
  precise catalog schema required if they do not.
- **Exact unknown:** approved artifact ids/versions/content hashes; PMI form-family compatibility;
  field identifiers; signer/participant roles; signature locations; conditional addenda; effective
  dates; and how an active executed lease proves its form family.
- **Hypotheses:** (A) existing published artifacts and Dotloop template metadata can be mapped
  without new content; (B) artifacts exist but require a catalog metadata layer; (C) one or more
  legal artifacts or authoritative classifications are absent and must remain named blockers.
- **Relevant areas/evidence:** S21 publication records/content, approved-template records, current
  client-owned artifacts, documented Dotloop template/schema export, active executed-lease metadata,
  and S63 representative leases. Evidence must be source exports or approved artifacts—not memory,
  screenshots without identity, or model reconstruction.
- **Required scenarios:** standard existing lease; inherited/nonstandard lease; new tenancy; pre-1978
  conditional disclosure; multiple tenants/owners; multiple animals including verified non-pet
  treatment; missing artifact; stale version; and field/source conflict.
- **Output:** a reviewed versioned artifact/field/participant catalog fixture and gap ledger in which
  every required binding is mapped or named as an exact blocker with its owner/source.
- **Success:** all required packet branches can be evaluated deterministically and every emitted
  field/participant maps to an approved artifact/source. **Inconclusive/failure:** a legal artifact,
  classification, or signer rule cannot be verified. **Non-goals:** drafting legal copy, changing a
  form, calling Dotloop, or implementing the UI. **Stop condition:** stop when each required binding
  is either proven or assigned one exact external-content blocker. The result replaces candidate
  catalog details in this spec; it cannot relax a hard gate.

**Feature spike S66-B — Boom document-fact source boundary.**

- **Decision enabled:** whether Boom contributes any read-only fact to lease-document preparation or
  remains solely the separately governed conditional enrollment action in S25.
- **Exact unknown:** whether Boom exposes a documented authorized read/export for insurance or
  resident-program facts, its identity mapping, freshness, field semantics, rate/cost boundary, and
  correction path.
- **Hypotheses:** (A) a vendor packet proves a stable read contract that can supply one or more
  explicitly mapped facts; (B) it exposes enrollment effects only and supplies no document truth;
  (C) evidence is insufficient, so Boom remains excluded from S66.
- **Relevant areas/evidence:** `health.boom.partner_api`, `boom.resident.enroll`, the S25 Boom
  executor/registry evidence, an official vendor packet/schema, and representative read responses
  containing no customer data in committed fixtures.
- **Required scenarios:** enrolled resident, explicitly not applicable, missing identity, stale/
  conflicting coverage, provider refusal, and duplicate identity.
- **Output:** a provider-source decision record and, only if proven, an exact field/source/freshness
  map plus redacted contract fixture. **Success:** the read semantics and identity are documented
  sufficiently for deterministic `Verified`/`Conflict` results. **Inconclusive/failure:** endpoint,
  permission, identity, or semantics are guessed. **Non-goals:** activating enrollment, widening the
  Boom write, or treating presence in Boom as insurance/accommodation proof. **Stop condition:** stop
  at a yes/no source decision; absent evidence means `Boom is not a document-fact source`. The final
  decision updates only the source-policy subsection and its tests.

**Adversarial acceptance checks.** These are future implementation acceptance contracts; this
specification pass is complete when their wording and traceability validate.

- **AC-S66-1** — Verified `existing renewal + PMI standard compatible form` produces exactly one
  `renewal_extension` manifest; verified new, inherited, or nonstandard context produces exactly one
  `full_lease_packet`; unknown/conflicting classification produces no manifest and names the missing
  deciding facts. _Verify:_ packet-classifier table tests.
- **AC-S66-2** — Every included field and artifact exposes its exact source, rule/catalog version,
  applicability, confidence, and snapshot hash; deleting any required provenance turns readiness to
  `Needs input`, never a partially ready packet. _Verify:_ schema/property tests and rendered source
  assertions.
- **AC-S66-3** — Two authoritative permitted sources that disagree yield `Conflict` and zero provider
  construction. A reasonless or source-less override is refused; a scoped approved resolution creates
  a successor snapshot and preserves the conflict history. _Verify:_ conflict/override transaction
  tests with provider spy.
- **AC-S66-4** — RBP applicability and insurance coverage method are required. An applicable charge
  without approved cents/source blocks its target artifact; verified external insurance coverage
  does not receive a PMI charge unless policy explicitly requires it. No fixture acquires `$100` or
  any animal fee from a constant/default. _Verify:_ charge matrix and no-hardcoded-price sentinel.
- **AC-S66-5** — Multiple animals remain separate through persistence, preview, and artifact binding.
  Missing facts block only the affected animal/artifact. The app never emits an inferred service/
  assistance/accommodation classification; verified non-pet treatment suppresses charges only under
  the exact active policy. _Verify:_ per-animal identity, policy, leakage, and classification tests.
- **AC-S66-6** — Year `1977` with an applicable approved rule includes the exact active lead artifact;
  year `1978` follows the rule's non-applicable branch; unknown year is `Needs input`. City/HOA and
  every other conditional artifact apply the same three-way include/exclude/unknown behavior.
  _Verify:_ conditional-rule boundary table tests.
- **AC-S66-7** — Removing or superseding one required artifact blocks only manifests that consume it,
  shows its label/version dependency, and generates no placeholder or paraphrased legal copy. Prior
  executed snapshots continue to resolve their immutable old version. _Verify:_ catalog lifecycle,
  rollback, and copy-generation negative tests.
- **AC-S66-8** — The tenant manifest contains all required tenants and zero owner-only artifacts or
  fields. The owner acknowledgment contains all S61 owners and zero tenant visibility. Before an
  authenticated readback proves every tenant artifact executed, no owner acknowledgment can reach
  ready/preview/provider state. _Verify:_ audience/recipient matrix and early-trigger falsification.
- **AC-S66-9** — Replaying the same authenticated tenant-completion event yields one owner-
  acknowledgment readiness record for the tenant-packet hash. A partial signature, untrusted webhook
  payload, or stale hash yields none. _Verify:_ idempotency and authenticated-readback tests.
- **AC-S66-10** — A fact, participant, charge, rule, or artifact change after preview marks the old
  snapshot/preview/approval `Superseded` before any new attempt. Repeating an unchanged request is a
  no-op; concurrent competing saves leave one current successor and an auditable conflict/refusal.
  _Verify:_ hash, optimistic concurrency, and stale-approval tests.
- **AC-S66-11** — A partially executed provider packet is visibly `Partially executed`, never
  `Executed`; retry first reconciles the existing idempotency key. Failure/cancellation preserves
  facts, snapshot, receipt, and correction path and does not claim rollback or delete evidence.
  _Verify:_ S25/S34 partial/retry/cancel consumer tests.
- **AC-S66-12** — A scoped Editor can capture permitted facts and request preview but cannot publish
  artifacts, override High conflicts, approve, access another Space, or construct a provider. An
  Admin action is exact-snapshot-bound and audited. _Verify:_ role/Space matrix and pre-construction
  denial tests.
- **AC-S66-13** — The S43 document stage renders empty, loading, needs-input, conflict, ready,
  superseded, partial, failure, and executed states with exact next actions; keyboard/mobile users
  can reach every blocker/source without hover or horizontal-only disclosure. _Verify:_ component,
  focus, a11y, and 390×844 browser tests.
- **AC-S66-14** — Logs and analytics contain only allowed ids/hash/state/count/error/latency metadata;
  they contain no legal body, name, address, contact data, charge narrative, animal details, or
  document content. Boom contributes no fact unless Spike S66-B succeeds. _Verify:_ structured-log
  capture, forbidden-field scan, and Boom-source sentinel.
- **AC-S66-15** — `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run test:firestore`, `npm run test:e2e:core`, `npm run verify:spec-traceability`, and
  `npm run build` pass while the S21 publication, S25 execution, S34 packet-consumer, S43 workspace,
  S61 recipients, and no-provider-before-confirmation sentinels remain green.

**Forbidden actions / hard gates.** No model, fallback template, operator memory, generic URL, or
unverified source may supply legal text, a field, charge, participant, animal treatment, packet type,
or artifact. Unknown is never converted to not-applicable or the shorter extension. No tenant may
see owner-only content and no owner acknowledgment may precede authenticated proof of complete tenant
execution. S66 itself never contacts Dotloop, sends a message, writes RentVine/Sheet/Boom, activates
an Action Registry key, or widens a role. Every provider effect remains S25/S34 exact-preview,
human-confirmed, one-attempt, idempotent, receipted, reconciled, and reversible where supported. No
autonomous/scheduled/bulk/model-triggered client send; D33 draft-only notice handling remains. Generic
`gmail.message.send` stays disabled. No personal identity, secret, PII, document body, guessed
endpoint, or invented fixture enters git/logs. Production is Live-only, local Demo is explicit
Live-read-only/effect-refused, and the S52 cost ceiling remains. No implementation or external effect
is authorized by this specification request.

**Ordered prompt sequence.** This is a future dependency order, not present implementation authority.

1. _Discovery:_ under a separately authorized implementation turn, run Spikes S66-A and S66-B and
   inventory the current readiness/fact/publication/recipient/execution contracts; do not edit
   product code until the artifact and source boundaries are decision-relevant.
2. _Understanding:_ freeze the packet contexts, field/source policy, artifact catalog, audience map,
   state machine, and snapshot/hash schema against representative cases.
3. _Build:_ add the pure shared evaluator and immutable snapshot persistence, then adapt existing
   readiness checks rather than forking a second truth model.
4. _Build:_ expose the S66 result in S43 and bind exact snapshots to S25/S34; keep provider
   construction impossible from a partial/stale result.
5. _Verify:_ run AC-S66-1 through AC-S66-15 and falsify every unknown/conflict, stale/concurrent,
   participant-leakage, conditional-boundary, hard-coded-price, and partial-execution case.
6. _Gate:_ keep all provider/action/artifact authority in S21/S25/S34; stop at exact missing content
   or connector dependencies and never reinterpret specification approval as activation.
7. _Context update:_ only after separately authorized work ships and its full gate is green, record
   verified facts/AC evidence and update the loop; do not change authority from this suite.

**Deletion/merge recommendation.** KEEP as the single shared lease-document truth contract. S43
consumes its presentation model and S34 consumes its immutable provider payload; neither should
duplicate it. Do not merge it into the disposable `docs/temp/lease-document-packet-truth-and-prefill-plan.md`
packet, and do not create that implementation packet during this specification-only pass.
