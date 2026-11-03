<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-novdec-2026-10-28 -->

# S235 — Per-family packet readiness, party/animal field binding and duplicate-safe Dotloop handoff

> Status: IMPLEMENTED AND DEPLOYED. The stabilization baseline run `d4c109a0-6dce-4c4d-8928-ec77e9a58c73` at `bc975353` retains [its delivery evidence](../evidence/application-delivery-2026-11-03.md); current A-03 source/application delivery and normal configuration are verified in [delivery and configuration evidence](../evidence/application-gap-delivery-2026-11-03.md). R-S235-7 still requires an approved original/reviewed map. Both Dotloop write keys remain closed; real legal output, first effects and human acceptance retain their exact gates.

**Goal.**

For any renewal, staff can see — without writing anything — which of the ten form families apply,
why, which approved original, field map and signer map each needs and exactly what is missing and
from whom. When approved content exists, co-tenants and animals fill their own places, the packet
state shows what actually happened, and no second loop can be created for the same lease by
accident.

**Current state / intended end state.**

Inspected at `a1c0fe8c` plus the October 27 Admin readback (`docs/facts.md`, private receipt):

- Ten families in `lib/lease-documents/artifact-catalog.ts` and `lib/lease-documents/family-use.ts`:
  `standard_lease` (Required, full lease packet), `renewal_extension` (Required, extension),
  `owner_acknowledgment` (Required, owner acknowledgment), `animal_agreement` (when any animal
  applies), `lead_disclosure` (when `property.year_built` is before 1978), `city_addendum` (when
  `property.city_addendum_required`), `hoa_artifact` (when `property.hoa_governed`),
  and `kcrar_additional_disclosures`, `brokerage_disclosure` and `insurance_program_addendum` (Not
  used by default and excluded whatever their predicate; if made conditional, the first two follow
  an explicit applicability fact and the insurance addendum follows `insurance.coverage_method`
  equal to `pmi_program`).
  On 2026-10-27 all ten read the engineering default `family-use-default-v1` (version 0), the
  intake manifest held ten empty entries, checkpoints read intake pending, review coverage /
  approve mappings / verify filled values / approve packet blocked, confirm provider effect and
  inspect returned state pending; eight Drive references were saved unverified at resource version 8;
  no city/HOA source, charge policy or policy material is recorded.
- The map contract (`lib/lease-documents/artifact-intake-contract.ts`, `artifact-field-map/v1`)
  requires `templateVersion` (`publication:` reference), `mapVersion`, `fields[]` {`fieldId`,
  `factKey`, `meaning`, `required`, `multiplicity` `single|per_party|per_animal`, `pdfFieldNames`,
  `allowedSourceSystems`}, `signers[]` {`signerRole` `tenant|owner|property_manager|broker|guarantor`,
  `participantKind` `tenant|owner|agent|guarantor`, `required`, `location`} and, for static PDFs,
  pages and regions {`slot`, `rect`, `format`, `existing`} with protected `signature`, `initial` and
  `signing_date` regions. Only approved intake entries with a publication content hash and map enter
  the catalog; otherwise the catalog is the empty `unavailable-2026-08-10`.
- `lib/lease-documents/evaluate-packet.ts` chooses `renewal_extension` only for `existing_renewal` +
  `pmi_managed` + `active_lease.executed` true + one extension-compatible form family policy, else
  `full_lease_packet`; unknown applicability is "Needs input". The read-only
  `lib/lease-documents/packet-inputs-view.ts` lists missing inputs, but `projectFamilyReadiness` in
  `lib/lease-documents/artifact-intake.ts` is used by no route or page, and "Evaluate packet" writes a
  snapshot.
- Per-party and per-animal map fields are not bound to packet people/roles or animals, so co-tenants
  and second animals cannot fill their own places.
- Shown packet states (`lib/lease-documents/packet-types.ts`) only reach "Needs input", "Conflict",
  "Ready for preview", "Superseded" and an always-written "Partially executed"; "Previewed",
  "Approved", "Provider pending", "Executed", "Failed" and "Cancelled" are defined but never
  assigned, although filled-output approval exists (`app/api/lease-renewal/filled-artifact/route.ts`,
  Editor-level `approve_filled_artifact`).
- Loop safety (`lib/integrations/dotloop/renewal-provider.ts`, `lib/firestore/lease-document-loop-association.ts`):
  app loops are named "PMI renewal packet {snapshotId}", creation is reserved once, a same-name loop
  refuses, existing-loop links are bound to a reviewed hash and refuse another lease's or an archived
  loop, uploads append versions with `supersedesContentHash`, recovery uses only a saved receipt. The
  name check keys on the current snapshot id, so an orphan loop from an earlier snapshot of the same
  lease is not caught.
- The saved selection (profile 20701283, template 228954, `LEASE_OFFER`, `PRE_OFFER`, version 1) is
  re-checked at preview, execution and claim (`lib/connections/dotloop-resource-selection.ts`); both
  keys `dotloop.loop.create_from_template` and `dotloop.document.upload` are closed; Dotloop exposes
  no signature operation (`signatureApiAvailable` false); Dotloop API-origin data stays outside AI
  (`lib/ai-boundary/dotloop-origin.ts`).

Intended: a read-only per-family readiness view with the packet-context basis, labeled engineering
defaults, slot-bound party/animal fields, a packet state that reflects recorded events, a
lease-wide orphan-loop check, and a visible selection freshness — with the same keys closed.

**Actors and entry conditions.**

Renewal staff (Editor or higher) prepare, preview and approve filled output and, when keys are open
and authorized, confirm packet effects; an Admin records originals, maps, family use and policies
through the S66/S130 Admin controls; the client-designated document/policy approver confirms
content, applicability and signer capacity (C01, C02, C08 in `docs/open-blockers.md`). Entry for any
provider effect requires approved content, current owner approval (S234), an open exact key and the
owner's exact authorization for the first real loop.

**What it is / how it functions.**

- **R-S235-1 — Read-only per-family readiness.** For a lease and its packet context, show each of the
  ten families with: use and its source (client-approved or engineering default), applicability
  (applies, does not apply, or unknown with the missing fact), approved original (publication,
  version, content hash, or missing), field map and signer map (versions and hashes, or missing),
  and each missing input with who supplies it (client document approver, Admin, staff). Show the
  context decision and its basis facts (`transaction.type`, `management.origin`,
  `active_lease.executed`, form family policy). Viewing writes nothing; "Evaluate packet" stays the
  explicit snapshot step.
- **R-S235-2 — Defaults are labeled, not policy.** Families at `family-use-default-v1` and default
  predicates (for example the 1978 lead-disclosure boundary) read "Engineering default — not yet
  approved by the client" until an Admin records the client's decision; unused families never hold
  unrelated output.
- **R-S235-3 — Party and animal slots.** `per_party` fields bind to packet people in their reviewed
  role order and `per_animal` fields to animals in their recorded order, each to its own slot or
  repeated PDF field. More parties or animals than the map provides refuses with "This form has
  places for {n} {parties|animals}; {m} are recorded." Organizations and persons stay distinct; no
  deduplication by name or email.
- **R-S235-4 — State from recorded events.** "Previewed" appears when the exact preview exists for the
  current snapshot, "Approved" when every included filled output for that snapshot is approved,
  "Provider pending" while an effect is claimed, "Partially executed" when some required documents
  are current in the linked loop, "Executed" when every required document of the current snapshot is
  uploaded current with receipts, "Failed" on a definite provider refusal and "Cancelled" when staff
  cancel before dispatch. "Executed" is labeled as provider operations complete, not signatures.
- **R-S235-5 — Lease-wide duplicate prevention.** Before a new-loop preview or claim, check for any
  app-created loop of any earlier snapshot of the same lease (by recorded association and the app's
  loop name pattern) and any unresolved creation; if found, refuse creation and offer to review and
  link that loop. Comparison uses loop ids and recorded associations, never address similarity.
- **R-S235-6 — Selection freshness.** The readiness view shows the saved profile, template,
  transaction type, initial status and version with the time of the last successful resource
  observation; a failed, stale or regressed observation names the reason. No re-selection or
  template recreation unless a fresh read actually regresses.
- **R-S235-7 — Map verification from synthetic values.** The verify-filled-values checkpoint is
  satisfied only by a recorded review of a filled copy for the exact original and map versions.
  Engineering prepares that copy locally with the existing filler and synthetic values, inspects
  every page, repeated slot and protected region, confirms that `replace` regions clear only their
  mapped area, and keeps the file in private evidence; no lease
  value is used and nothing is uploaded.

**In scope / out of scope.**

In scope: readiness projection and page, default labels, slot binding, state projection,
lease-wide loop check, freshness display, local map-verification procedure, tests. Out of scope:
opening either Dotloop key, creating a real loop or upload, signature placement or sending through
an API, inventing PDF field names or coordinates, approving legal content, recreating the template,
deriving any family policy, new provider endpoints.

**Open questions & assumptions.**

- No product decision blocks this slice. Missing client content (C01 originals/applicability, C02
  field maps, C07 extension eligibility facts, C08 parties/signers, C09 property/addenda, C10
  fees/animal/insurance/Rhino) holds only the affected family's output.
- Actual PDF field names and static geometry are unknown until the approved originals arrive;
  engineering inventories them from the files and prepares the map for the client's confirmation.
- Assumption (labeled): a lease's earlier snapshots are discoverable from its stored snapshot
  history; if a history read fails, new-loop creation refuses.

**Cross-product impacts.**

`lib/lease-documents/artifact-intake.ts`, `lib/lease-documents/evaluate-packet.ts`,
`lib/lease-documents/packet-types.ts`, `lib/lease-documents/packet-inputs-view.ts`,
`lib/lease-documents/packet-assembly.ts`, `lib/firestore/lease-document-packet-snapshots.ts`,
`lib/lease-renewal/execution/normal-packet-action.ts`, `lib/lease-renewal/execution/dotloop-runtime.ts`,
`lib/integrations/dotloop/renewal-provider.ts`, `lib/firestore/lease-document-loop-association.ts`,
`components/lease-renewal/PacketTruthPanel.tsx`, `components/lease-renewal/RenewalDocumentHandoff.tsx`,
the Admin intake page, S236 returned-state inputs, the operator guide.

**Authority and evidence map.**

| Input                                                                      | Classification       | Use and limitation                                                                      |
| -------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| `AGENTS.md`, D-DOTLOOP-PDF-RENEWAL-V1, S182, both closed keys              | Authority            | Human signing in Dotloop; no guessed content, participants or placements; keys closed.  |
| Committed code/tests at `a1c0fe8c`; October 27 Admin and Dotloop readbacks | Implementation truth | Families, defaults, contract, states, loop safety and selection above.                  |
| 2026-10-28 Clarify Features initialization and roadmap (Obsidian inbox)    | Intent evidence      | No-write readiness first, exact maps, signer capacity, duplicate safety, honest states. |
| Approved originals, maps, policies and facts (C01, C02, C07–C10)           | External dependency  | Hold only the affected family's output; never substituted by defaults or examples.      |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S235-1** — A read-only readiness projection composes family use (with source), predicate
  result, intake entry, publication and map versions, context basis and missing inputs, served by a
  read route without snapshot writes. Fail-first: `projectFamilyReadiness` has no consumer and the
  only evaluation path writes a snapshot.
- **ARCH-S235-2** — Map field binding resolves `per_party` and `per_animal` multiplicity to ordered
  slots from packet people/roles and animals, with overflow refusal. Fail-first: those fields are
  not bound.
- **ARCH-S235-3** — The shown packet state is a projection over preview, filled-output approval,
  claim, receipt and refusal records for the current snapshot. Fail-first: the six unassigned states
  never appear.
- **ARCH-S235-4** — New-loop admission consults the lease's full snapshot and association history.
  Fail-first: a fixture orphan loop named for an earlier snapshot does not refuse creation.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S235-1** — Opening the readiness view for a fixture lease lists all ten families with use
  source, applicability and missing inputs, and writes nothing.
- **BEH-S235-2** — A fixture with two tenants and two animals fills four distinct slots; three
  animals on a two-slot map refuses with the places message.
- **BEH-S235-3** — Preview, approval and fixture uploads advance the shown state in order; a definite
  refusal shows "Failed"; "Executed" says it is not signature evidence.
- **BEH-S235-4** — An orphan loop from an earlier snapshot refuses new creation and offers review and
  link.
- **BEH-S235-5** — The readiness view shows the saved selection and its last observation time; a
  failed observation shows its reason.

**Human litmus outcome.**

### Staff know which forms this renewal needs and what is still missing

**If this was built correctly:** A staff member opens a lease's documents and sees which forms apply
and why, which approved file and map each uses, and exactly what is missing and who supplies it,
without changing anything. When everything is approved, each tenant and each animal lands in its own
place, the packet shows how far it got, and the app will not start a second loop by mistake.

- Model verdict: NOT RUN — to be completed by the implementation runner with evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                         | Architecture outcome | Behavior outcome | Human litmus                                                        | Deterministic evidence / falsification                                                                                                           |
| ----------------------------------- | -------------------- | ---------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| R-S235-1 read-only family readiness | ARCH-S235-1          | BEH-S235-1       | Staff know which forms this renewal needs and what is still missing | Extend `tests/unit/s130-artifact-intake.test.ts` and `tests/unit/lease-document-packet-truth.test.ts`: ten rows; zero writes.                    |
| R-S235-2 defaults labeled           | ARCH-S235-1          | BEH-S235-1       | Staff know which forms this renewal needs and what is still missing | Extend `tests/unit/s66-family-use.test.ts`: default source label; unused family never holds output.                                              |
| R-S235-3 party and animal slots     | ARCH-S235-2          | BEH-S235-2       | Staff know which forms this renewal needs and what is still missing | Extend `tests/unit/s66-packet-assembly.test.ts`: ordered slots, overflow refusal, person/organization distinct.                                  |
| R-S235-4 state from events          | ARCH-S235-3          | BEH-S235-3       | Staff know which forms this renewal needs and what is still missing | Extend `tests/unit/packet-truth-panel.test.tsx` and `tests/unit/s34-dotloop-packet-lifecycle.test.ts`: each state from its record.               |
| R-S235-5 lease-wide duplicate check | ARCH-S235-4          | BEH-S235-4       | Staff know which forms this renewal needs and what is still missing | Extend `tests/unit/s34-loop-association.test.ts`: orphan from earlier snapshot and unresolved creation both refuse.                              |
| R-S235-6 selection freshness        | ARCH-S235-1          | BEH-S235-5       | Staff know which forms this renewal needs and what is still missing | Extend `tests/unit/oct20-template-process-readiness.test.ts`: saved selection, observation age, failure reason.                                  |
| R-S235-7 synthetic map verification | ARCH-S235-2          | BEH-S235-2       | Staff know which forms this renewal needs and what is still missing | Procedure check: local synthetic render per map version; protected regions untouched; evidence private; checkpoint stays blocked until reviewed. |

**Preservation set.**

`tests/unit/s34-dotloop-packet-lifecycle.test.ts` (never claims a signature operation),
`tests/unit/s182-dotloop-origin-stores.test.ts`, `tests/unit/s106-dotloop-connection.test.ts`,
`tests/unit/oct15-dotloop-discovery.test.ts`, `tests/unit/s120-resource-configuration.test.tsx`,
`tests/unit/s66-charge-policy.test.ts`, `tests/unit/s130-intake-checkpoints-local.test.ts`, both keys
closed in the seed, and the canonical gate.

**Adversarial acceptance checks.**

- **AC-S235-1** — The readiness view issues no Firestore write and no provider request; an unknown
  applicability fact names that fact and its supplier (ARCH-S235-1, BEH-S235-1).
- **AC-S235-2** — A default family use is never labeled client-approved; a not-used family's missing
  original never blocks another family (ARCH-S235-1, BEH-S235-1).
- **AC-S235-3** — Co-tenants "Alex Example" and "Sam Example" plus organization "Example Owner LLC"
  fill distinct slots in role order; overflow refuses; nothing deduplicates by name or email
  (ARCH-S235-2, BEH-S235-2).
- **AC-S235-4** — No shown state skips its recorded event; "Executed" never appears with an
  unresolved or missing required upload and always carries the not-signatures label (ARCH-S235-3,
  BEH-S235-3).
- **AC-S235-5** — An earlier-snapshot orphan loop, an unresolved creation and a failed history read
  each refuse new-loop creation (ARCH-S235-4, BEH-S235-4).
- **AC-S235-6** — No test or procedure invents a PDF field name, coordinate, signer capacity or legal
  text; synthetic renders never leave private evidence (preservation of B-DL3 boundaries).

**Forbidden actions / hard gates.**

No Dotloop loop, upload, signature request or template change; no key opening or registry change;
no invented field names, geometry, signer roles or legal content; no customer document or value in
Git; no AI processing of Dotloop API-origin data.

**Dependencies / sequencing.**

Consumes S66 facts/charges, S130 intake/filling, S34 loop machinery, S106/S228 selection, S234
approval coverage and the client content in C01–C10. Produces readiness, slot binding, state and
duplicate safety for S236 and S238.

**Standalone delivery contract.**

- **Deliverable now:** R-S235-1 to R-S235-6 in code and tests, plus the R-S235-7 procedure.
- **Consumes, but does not assume:** approved originals and maps (unset → missing with supplier);
  client family-use decisions (unset → engineering default label).
- **Externally blocked effect:** real filled output for a lease needs B-DL3 content (C01, C02,
  C07–C10); any provider effect needs an open exact key and the owner's exact authorization for the
  first real loop — `BLOCKED` until then.
- **Produces for downstream suites:** current snapshot identity, document versions, signer roster
  and packet state.

**Verification and delivery contract.**

1. Before edits, record the current readback, the preservation baseline and each ARCH/BEH check
   failing for the stated reason.
2. Run the focused checks for every ARCH, BEH and AC row; keep preservation separate.
3. Run `bash scripts/verify.sh` and `npm run test:e2e:core`; audit secrets, PII, keys, runtime
   configuration and diff scope before any authorized delivery.
4. Report `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only under an explicit budget, or `BLOCKED` only for
   the named content or authorization after all fail-closed work is green.

**Ordered prompt sequence.**

1. Re-verify current code, saved selection and Admin readbacks read-only.
2. Materialize the ARCH/BEH checks, litmus and preservation baseline; record fail-first results.
3. Build the readiness projection, labels, slot binding, state projection, duplicate check and
   freshness display.
4. Falsify, run focused and canonical tests, update the operator guide, and ship only when
   authorized.

**Deletion/merge recommendation.**

Remove this suite when its checks are represented by code, tests and current facts; keep S66, S130,
S34 and S228 history unchanged.

## November 3 assessment follow-up — A-03

> Authoring status: FINAL. A-03 source and application DELIVERED; current configuration/readback
> VERIFIED. Source-reference flags are verified at resource version 16. Dotloop refresh at
> 19:36:04Z returned two profiles, template counts 0/9 and unchanged saved selection version 1.
> See [delivery and configuration evidence](../evidence/application-gap-delivery-2026-11-03.md). R-S235-7 approved-map verification, actual legal/provider output
> and human acceptance retain their exact holds. No provider business effect was test proof.

**Goal.**

Staff can identify the selected packet context, its current evidence and only the material actually
needed for that output, without first saving an evaluation. The lease's selection display applies
the same account, connection-generation and time qualifications as Connections.

**Current state / intended end state.**

Source inspected on 2026-11-03 at `3943591918bd9c5443bffef381db3d8b32e959d3`; deployed application
source is `bc97535379dd08deab578455b00a80fc93b8d209`. The lease page passes only its saved
`packetSnapshot` into the readiness projection
(`app/lease-renewal/live/desk/lease/[leaseId]/page.tsx` (line 303)). With none, the table says "Not evaluated
yet; Evaluate packet records it" (`lib/lease-documents/lease-packet-readiness.ts` (line 36)). The table
does not display the packet-context decision or basis facts
(`components/lease-renewal/LeasePacketReadiness.tsx` (line 28)). Missing-original/map requests are
suppressed for `not_used`, but not for an evaluated `not_applicable` family
(`lib/lease-documents/lease-packet-readiness.ts` (line 69)).

Two private, synthetic-only reproductions called the actual exported functions on the identical
runtime tree in `/home/josiah/pmi-kc-work/auth-command-20261102`. An excluded city-addendum row read
"Does not apply to this lease" while requesting an approved original and map. A future resource
observation with matching fixture ids returned no freshness problems. These are deterministic
projection defects; no production customer case or unsafe provider admission was demonstrated.
The freshness reader does not read the current connection generation/status
(`lib/lease-documents/packet-selection-freshness-read.ts` (line 30)), and its age check does not reject a
future observation (`lib/lease-documents/packet-selection-freshness.ts` (line 74)). The established
Connections picker and execution admission already enforce stronger gates.

Intended: compose a read-only, current readiness result with context and dated basis; distinguish
an earlier saved snapshot from current facts; separate output blockers from optional catalog setup;
qualify the saved-selection display against the current approved connection. An unavailable fact
remains unknown with the exact missing field and supplier.

**Actors and entry conditions.**

Existing Renewal Space staff read their permitted lease. Engineering owns the projection and
verification. Shared legal/content configuration retains its existing authorized controls; S125's
notice-basis selection specifically requires no Admin confirmation under the new owner direction.
Recover documented PMI decisions first. Dan is the contact for unresolved business questions;
the actual document/policy authority supplies missing meaning, applicability or approved content
under [B-DL3](../open-blockers.md). No new customer
value, client decision, provider privilege or live effect is needed to implement this follow-up
with isolated fixtures.

**What it is / how it functions.**

- **R-S235-8 — Current context without a save.** Read the existing permitted fact owners and
  expose the context decision, basis versions/times and exact unknown facts without creating or
  updating a packet snapshot. If current resolution is unavailable, say which read failed and label
  retained evidence as saved evidence; never present it as a current determination.
- **R-S235-9 — Output-specific missing material.** A family excluded by the current context or
  reviewed applicability asks for no original/map for that output. Optional catalog setup may be
  shown separately and must not be phrased as its blocker. For unknown applicability, request the
  exact deciding fact first; an engineering default remains visibly unapproved.
- **R-S235-10 — Qualified selection display.** Compare the cached observation with the current
  connected generation, approved account and valid observation time. Failed, disconnected,
  wrong-generation, future, stale and wrong-account observations receive explicit reasons. Reading
  the table neither refreshes a provider nor changes the saved selection.

**In scope / out of scope.**

In scope: the existing readiness/freshness projections, lease-page composition, precise supplier
copy and isolated route/component checks. Out of scope: new form requirements, policy decisions,
changing execution gates, approving material, automatic refresh, provider calls, activation,
customer output generation, signing, implementation or delivery during this assessment.

**Open questions & assumptions.**

The excluded-family and future-time defects are reproduced. The consequences of changed facts,
reconnection or unavailable current reads are source-bounded uncertainties requiring the checks
below; they are not claimed production incidents. Reuse current fact-read owners, including their
documented narrow observation/invalidation behavior, rather than treating every GET as pure. A
new read-only projection must add no write or provider request of its own.
No feature-design question remains. Missing live facts, legal decisions and approved maps are
typed runtime inputs, with the exact output held; they do not prevent this standalone implementation.
The selected Dotloop template/profile/status remains settled. S34 separately plans the existing
create/upload paths through technical readiness and later exact-key activation; neither this
display nor Dan's response automatically activates a provider operation.

**Cross-product impacts.**

S66 current fact/applicability resolution, S130 material readiness, S106/S228 connection and
selection observation, the S235 lease table, and S236/S238 consumers. Execution, snapshots, approved
bytes, receipts and claims retain their existing owners and meanings.

**Authority and evidence map.**

| Input                                                                | Classification               | Use and limitation                                                                            |
| -------------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------- |
| Current assessment instruction and `AGENTS.md`                       | Authority                    | Assess/specify only; preserve settled selection, closed keys and exact human execution gates. |
| Named current source locations and two 2026-11-03 pure reproductions | Implementation evidence      | Establish projection defects, not a live provider failure or customer effect.                 |
| November 3 delivery and 39 focused tests in four files               | Scoped preservation evidence | Delivered baseline and tested fixture behavior; does not cover these new missing cases.       |
| B-DL3 approved content/applicability                                 | External dependency          | Required only for its real output; not for this engineering slice.                            |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S235-5** — The existing readiness boundary accepts current context/basis plus retained
  snapshot identity explicitly and emits output blockers independently of general catalog setup.
  Starting-state checks fail on missing context and the excluded-family original/map request.
- **ARCH-S235-6** — Display freshness consumes current connection status/generation and approved
  account evidence, with a bounded past-to-now observation interval. A future-time fixture fails
  against the starting projection; no display code can grant execution authority.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S235-6** — A known-context lease with no saved snapshot shows its context/basis with
  zero new writes; changed or unreadable facts visibly qualify a retained result.
- **BEH-S235-7** — Excluded city/HOA/other-context families request no output material, while an
  unknown rule names its exact fact and supplier and a required applicable original stays held.
- **BEH-S235-8** — Selection matching fixture ids is insufficient when account, generation,
  connection state or observation time fails; staff see the precise reason and existing refresh
  handoff without a new selection or template request.

**Human litmus outcome.**

### See what this renewal actually needs

**If this was built correctly:** Staff open a lease and see why it needs an extension or full lease,
which facts remain unknown, and which forms matter for that choice. They are not asked to obtain a
city or HOA form that does not apply. An old or mismatched connection check says why it cannot yet
be relied on, while the already-saved template remains visible.

- Model verdict: PASS for current-context, excluded-family, qualified-selection and source/application delivery within [delivery/configuration evidence](../evidence/application-gap-delivery-2026-11-03.md). Real-map verification, real provider output and human acceptance retain their exact holds.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                    | Architecture outcome | Behavior outcome | Human litmus                         | Deterministic evidence / falsification                                                                     |
| ------------------------------ | -------------------- | ---------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| R-S235-8 current context/basis | ARCH-S235-5          | BEH-S235-6       | See what this renewal actually needs | No-snapshot and changed/unreadable fact fixtures through the actual page/projection; zero added writes.    |
| R-S235-9 exact output blockers | ARCH-S235-5          | BEH-S235-7       | See what this renewal actually needs | Excluded-city reproduction, other-context and unknown-predicate fixtures in `s235-lease-packet-readiness`. |
| R-S235-10 qualified selection  | ARCH-S235-6          | BEH-S235-8       | See what this renewal actually needs | Future-time reproduction; wrong-generation/account/disconnected cases in `s235-slots-state-freshness`.     |

**Preservation set.**

On 2026-11-03 the existing `s235-lease-packet-readiness` (4),
`s235-slots-state-freshness` (7), `s106-dotloop-connection` (24) and
`oct15-dotloop-discovery` (4) checks passed: four files, 39 tests, process exit 0, Node 24.18.0,
Vitest 4.1.11, identical native runtime tree. Preserve those checks separately from new cases,
current Space/role refusals, explicit Evaluate snapshot writes, owner-term/output approval,
party/animal slots, closed exact keys, source lineage and human signing.

**Adversarial acceptance checks.**

- **AC-S235-7** — No-snapshot/current-known and saved-snapshot/changed-fact cases show dated
  context/basis with no projection-owned write/provider call; a failed basis read cannot become a
  fresh result (ARCH-S235-5, BEH-S235-6).
- **AC-S235-8** — Excluded city, HOA and other packet-context material produces no output
  original/map ask. Required applicable material remains named; unknown predicates name the exact
  missing fact and supplier (ARCH-S235-5, BEH-S235-7).
- **AC-S235-9** — Matching fixture ids with future/stale/unreadable time, wrong account,
  wrong-generation or disconnected status never yields an unqualified selection match. A current
  approved matching observation does (ARCH-S235-6, BEH-S235-8).
- **AC-S235-10** — No table view or test saves a selection, opens a key, evaluates/saves a
  production packet, calls Dotloop, approves content or sends/signs (preservation gate).

**Forbidden actions / hard gates.**

The original assessment made no production change. The later launched source repairs are qualified
and delivered, with current normal configuration/readback separately recorded. Verification uses isolated fixtures and existing
guarded reads. No production test record, draft/send, schedule, provider
business write, template recreation, key change, source approval or signature is proof.

**Dependencies / sequencing.**

First reproduce the named projection cases, then extend their existing owners. No B-DL3 input is
needed for fixture implementation; a real legal output still consumes approved content, reviewed
maps, applicability and current case facts. Existing selection is settled, subject to fresh
readback; do not reopen C00 merely because a cached observation ages.

**Standalone delivery contract.**

- **Deliverable now:** delivered bounded readiness display and qualification, with current source
  verification flags and fresh managed Dotloop observation read back. Approved maps/legal output
  and actual provider effects retain their independent gates.
- **Consumes, but does not assume:** readable current facts and connection observation; missing
  input is an explicit unknown/unavailable result with retained evidence clearly labeled.
- **Externally blocked effect:** actual legal output and first real Dotloop effects remain under
  B-DL3 and their exact authorization; they do not block these fixture checks.
- **Produces for downstream suites:** a current, qualified context/readiness result and precise
  output blocker list, without changing stored packet/claim/receipt contracts.

**Verification and delivery contract.**

Keep the two starting reproductions and the 39-test preservation result as dated evidence. A later
authorized implementation must materialize every ARCH/BEH/AC case before edits, run focused
projection/page checks and the separate preservation set, then the repository's required delivery
gates under the owner's launch. Those technical qualification/delivery gates are now evidenced;
they do not establish the complete approved-map litmus, human acceptance or provider completion.

**Ordered prompt sequence.**

1. Re-establish current runtime/source and retain the existing snapshot/connection readbacks.
2. Reproduce excluded material, absent/stale context and invalid observation cases in isolation.
3. Under a later scoped instruction, repair existing projections and qualify their actual page use.
4. Verify exact supplier/output copy, zero added effects and preservation; deliver only under the
   existing authority and technical gates.

**Deletion/merge recommendation.**

Merge this follow-up into S235's current implementation contract once its new checks are verified.
Do not create a second suite, relabel the original release as failed, or retire remaining content
and human holds because fixture checks pass.
