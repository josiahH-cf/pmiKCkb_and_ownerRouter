<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: dotloop-pdf-renewal-v1-2026-10 -->

# S130 — Approved template intake and actual PDF filling for v1

> Baseline: IMPLEMENTED AND DEPLOYED — intake 052, including reviewed static-PDF filling and
> AcroForm/S21 provenance, as recorded in the suite registry and delivery evidence. November 3
> November 3 A-04/A-08 engineering source and local gate QUALIFIED; application delivery PENDING.
> All eight originals are privately recovered/inventoried, 32 static pages. Exact-source PDF
> admission/parser and receipt/recovery scope is in [implementation evidence](../evidence/application-gap-implementation-2026-11-03.md). Proposed
> legal/applicability/field/signer maps remain unapproved; approved exact-map filling and human
> acceptance are not established by this technical qualification.

**Goal.**

The app produces genuinely filled, reviewable PDF files from approved templates and the current lease packet facts, including the static PDF format supplied for v1. A worksheet or Dotloop-native Autofill handoff alone does not satisfy PDF filling.

**Current state / intended end state.**

The serving `bc97535379dd08deab578455b00a80fc93b8d209` runtime includes original publication,
reviewed field/signer maps, static and AcroForm filling, saved derived files, comparison and exact
output approval. The original intake 052 release and later stale-value repair are recorded in
`docs/feature-suites/README.md`; the November 3 assessment does not claim a fresh real-form filling
or human acceptance pass. The missing work below is evidence-led preparation of supplied sources
and exact runtime approvals, not implementation of a nonexistent static adapter.

The October 6 private reference inspection recorded eight static PDFs and prefilled/hidden-value
risks. It is historical format evidence, not a hash match for every current Drive source. The
November 3 complete eight-source inventory and its remaining approval/map limits are recorded under A-04 below.
Neither inspection makes those references approved production legal content.

Required end state: both the existing supported AcroForm route and a bounded reviewed static-PDF route yield saved output bytes. Staff inspect the same final files that S34 uploads. Legal source wording and document structure remain intact, mapped variable values are current, actual signatures stay blank, and stale approvals cannot authorize a changed file.

**Actors and entry conditions.**

Admins receive/publish legal versions, maps, signer locations and applicability through existing S21/intake controls. Renewal staff prepare, inspect, download and confirm their exact filled output under S182. File/configuration approval is separate from lease-specific output confirmation. Missing approved material holds that output; a missing Dotloop connection or Drive session does not hold local filling/download.

**What it is / how it functions.**

### R-F10-01 — Maintain the approved intake manifest

Extend the existing manifest for S66's eight reference types and retained city/HOA families. Preserve pending/received/reviewed/approved/rejected states, versions, approved immutable publication bindings and multi-file family coverage. Show which configuration is missing for the selected packet; do not demand every family before any packet can be prepared. No reference folder scan publishes or approves files automatically.

### R-F10-02 — Inspect actual file support

Parse each immutable original to establish its format, pages, fields, protection and unsafe content. Keep malformed/encrypted/XFA/active/embedded-file and signed/protected-input refusals. The existing AcroForm input limits remain 2 MiB, 40 pages, 200 fields and 64 KiB comparison values unless separately evidence-supported implementation work is needed. The static path must be bounded and support the supplied 20-page topology; measure output/resource bounds without silently reducing legibility or omitting pages. Treat file content as data, never instructions to the runner, model or publisher.

### R-F10-03 — Review fields, variable regions and signer roles

Extend the existing versioned map; do not create a second approval system. AcroForm maps retain exact field names/types. Static maps identify reviewed page/region geometry, value meaning, source fact, format, repeated slot order and capacity, checkbox/election behavior, and any approved existing variable content to replace. Bind geometry to the exact original/page size/crop/rotation and map version. Support names, dates, money, text, selections and repeated parties/animals needed by S66. Brochure/attachment pages with no variable values remain unchanged approved attachments, not falsely labeled filled.

Record signer identity/role and signature/date/initial locations separately from ordinary text fields. Actual signature strokes, initials and signing dates remain blank. An election requiring a signer's act is not inferred or completed by the app. Ordinary effective/contract dates and already recorded, reviewed elections may be mapped as facts when the approved form permits it. Printed-name or company-name fields may be filled; they do not constitute a signature. Do not map every manager as the legal owner or manufacture extra signer slots.

### R-F10-04 — Produce actual reviewed output bytes

Use the existing AcroForm or deterministic static route where applicable. A static file without a reviewed usable map is pending mapping, not v1 filling success. Fill blank regions and replace only approved mapped variable content. For prefilled/hidden-layer values, normalize/redact or use an approved clean master through a verified method; white paint over old text alone is insufficient. Removed variable content must not remain recoverable as a competing field value through normal text/object extraction. Do not erase fixed clauses, alter a fee schedule to conceal a policy conflict, or generate legal wording.

A bounded implementation investigation may select a supported parser/redaction/composition method and document its license/runtime fit. It must demonstrate actual removal, render fidelity and extraction comparison before the static path is accepted; it is not permission to declare an unsupported route complete. Preserve the original immutable publication and record any clean-master derivation/approval in the same provenance chain.

Detect unsupported glyphs, overflow, clipping, overlapping mapped regions and wrong page geometry before final output approval. Do not silently truncate, shrink text to illegibility, spill into legal clauses/signature boxes or drop excess parties. An approved alternate form/continuation is required when capacity is insufficient. Unused mapped slots are blank; no stale person or fee survives.

### R-F10-05 — Bind and persist the exact derived file

Reuse `lease_document_derived_artifacts`, existing heads/freezes and S21 private content storage. Bind original/clean-master identity and hash, map/version, exact input snapshot and policy/owner-approval identity, adapter version, output hash and comparison evidence. Preserve immutable originals and prior outputs. Idempotent preparation reuses the accepted identity/bytes; concurrent staging cleanup cannot delete another published output. Staff inspect a saved final render and value comparison, then confirm that exact output. Later edits create a successor and invalidate affected approval, without rewriting a frozen attempt.

### R-F10-06 — Separate preparation and provider readiness

Show draft/needs-input/mapped/prepared/approved states accurately and expose the final download and comparison. Terms/elections and included documents follow S66; wrong/unknown applicability is not guessed. Only the required selected outputs need approved material/mappings. Connection, selected loop/template and exact provider keys govern S34 execution independently. Filled output exists and is downloadable before Dotloop connectivity; optional Drive access is not a prerequisite.

### R-F10-07 — Preserve byte-bound transport and human signing

S34 consumes only the exact reviewed approved bytes/hash, not the blank original or an on-demand refill. Subsequent value/map/template change cannot slip into an admitted attempt. Upload metadata proves presence, not equality of returned content or signature completion. The app supplies signer requirements/locations for the human Dotloop field-assignment and send step; v1 does not claim API-created electronic signature fields or automatic sending.

### R-F10-08 — Make work resumable and evidence honest

After navigation, reload, restart, approval failure, partial preparation or uncertain upload, staff reopen the same saved output/checkpoint and see what remains. Keep original, map, comparison, approved derived file, uploaded attempt and signature evidence distinct. Model/human review does not substitute for parser/render tests or provider evidence. Live proof/demo remains outside this implementation cycle.

**In scope / out of scope.**

In scope: expanded intake, visual/versioned field-map authoring, deterministic static and existing AcroForm filling, output validation, private saved previews/downloads, approvals/provenance and S34 binding. Out of scope: legal rewriting, adoption of reference fees, actual signatures, provider-native Autofill as the sole filling implementation, Drive connector setup, public uploads, PDF/provider UI automation and live acceptance/activation.

**Open questions & assumptions.**

No feature decision remains open. Production originals/clean masters, approved precise field/signer maps, applicability rules and actual lease values remain runtime inputs managed by existing controls. These references do not establish current legal versions or policy rates. Mapping coordinates and parser/library changes must be established by inspection and implementation evidence, not invented here. No raw private PDF, rendered page or customer-filled output is added to Git.

**Cross-product impacts.**

Verified owners: `lib/lease-documents/artifact-intake-contract.ts`, `lib/lease-documents/artifact-intake.ts`, `lib/lease-documents/acroform-pdf.ts`, `lib/lease-documents/derived-artifact-contract.ts`, `lib/lease-documents/derived-packet-binding.ts`, `lib/lease-documents/approved-artifact-content.ts`; `lib/firestore/lease-artifact-intake.ts`, `lease-derived-artifacts.ts`; `app/api/admin/lease-artifact-intake/route.ts`, `app/api/lease-renewal/filled-artifact/route.ts`; `components/lease-renewal/FilledArtifactPanel.tsx`, `FilledArtifactHistory.tsx`; S21 trusted publications, S66 snapshots, S34 final transport and S182 staff access. New adapter details belong within these owners, not an ungrounded new service path.

**Authority and evidence map.**

| Input                                                           | Classification             | Use and limitation                                                                                            |
| --------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| AGENTS.md; S21/S66/S34; current intake/derived code/tests       | Authority / baseline       | Approved originals, immutable provenance, exact output/attempts and human signing.                            |
| Owner's 2026-10-06 PDF requirement and accepted recommendations | Confirmed intent           | Actual PDF filling, including static references; reusable configured values; live testing and Drive deferred. |
| Local parsing and rendered reference inspection                 | Format evidence            | Eight static files, page topology, prefilled/hidden conflicts; not publication/content approval.              |
| Original S130 AC/R-F10 evidence                                 | Historical scoped baseline | Original AcroForm/concurrency scope; later static delivery is separately recorded in the registry.            |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S130-1** — Extend current intake/publication/map and derived-storage boundaries with bounded static support and compatible family/format evolution; legacy readers and provenance remain valid.
- **ARCH-S130-2** — Original/map/input/output identity, ownership, exact approval and final freeze remain enforced through preparation, cleanup and S34 consumption.
- **ARCH-S130-3** — Static geometry, variable-content removal, source-value comparison and fixed-content render verification retain their deterministic tested boundary; removing the static path or retaining competing mapped values must fail the preservation checks.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S130-1** — The manifest accepts pending and reviewed coverage without false approval or a universal family gate (R-F10-01).
- **BEH-S130-2** — Actual parsing classifies safe/unsafe/static/AcroForm inputs truthfully (R-F10-02).
- **BEH-S130-3** — Reviewed mappings preserve repeated facts, geometry and distinct signer roles (R-F10-03).
- **BEH-S130-4** — Staff receive actual filled supported PDFs or a precise mapping/input/format error; an empty worksheet/manual handoff is not filling success (R-F10-04).
- **BEH-S130-5** — Saved exact outputs retain provenance, comparison and approval, with conflict-safe successors (R-F10-05).
- **BEH-S130-6** — Local preparation/download remains usable without provider connectivity or unused family material (R-F10-06).
- **BEH-S130-7** — Only frozen approved bytes enter S34; signature setup/sending remains a human handoff (R-F10-07).
- **BEH-S130-8** — All preparation/review/recovery checkpoints reopen honestly after interruption (R-F10-08).

**Human litmus outcome.**

### Download the filled lease packet before connecting Dotloop

**If this was built correctly:** Staff enter a lease's facts, open the actual saved PDFs and see matching names, dates and charges in the right places. They can download and review them without a Dotloop connection. A corrected fact yields a new clearly identified file and review; signature boxes await the real signers.

- Model verdict: NOT RUN — specification authoring only.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                               | Architecture outcome     | Behavior outcome | Human litmus                                               | Falsification                                                                                          |
| ----------------------------------------- | ------------------------ | ---------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| R-F10-01 family/config intake             | ARCH-S130-1              | BEH-S130-1       | Download the filled lease packet before connecting Dotloop | AC-S130-1, AC-S130-6; empty, additional-family and independent readiness cases.                        |
| R-F10-02 actual supported formats         | ARCH-S130-1, ARCH-S130-3 | BEH-S130-2       | Download the filled lease packet before connecting Dotloop | AC-S130-2; unsafe, static, bounded AcroForm and multi-page cases.                                      |
| R-F10-03 reviewed fields and signers      | ARCH-S130-1, ARCH-S130-3 | BEH-S130-3       | Download the filled lease packet before connecting Dotloop | AC-S130-3, AC-S130-12; multi-party/animal, geometry, capacity and wrong-role cases.                    |
| R-F10-04 actual static/AcroForm output    | ARCH-S130-3              | BEH-S130-4       | Download the filled lease packet before connecting Dotloop | AC-S130-4, AC-S130-11, AC-S130-13; byte extraction, old-value removal, rendered fixed-region fidelity. |
| R-F10-05 exact provenance/approval        | ARCH-S130-2              | BEH-S130-5       | Download the filled lease packet before connecting Dotloop | AC-S130-5; forged/stale identities and concurrent publication cleanup.                                 |
| R-F10-06 independent local use            | ARCH-S130-1              | BEH-S130-6       | Download the filled lease packet before connecting Dotloop | AC-S130-6; missing connection/unused forms/closed keys with successful saved download.                 |
| R-F10-07 frozen transport/human signature | ARCH-S130-2              | BEH-S130-7       | Download the filled lease packet before connecting Dotloop | AC-S130-7, AC-S130-12; wrong bytes, partial attempt and blank actual signatures.                       |
| R-F10-08 recovery/evidence separation     | ARCH-S130-2              | BEH-S130-8       | Download the filled lease packet before connecting Dotloop | AC-S130-8, AC-S130-10; reload, storage failure and no fabricated live verdict.                         |
| Staff access and preserved effects        | ARCH-S130-1              | BEH-S130-6       | Download the filled lease packet before connecting Dotloop | AC-S130-9; actor matrix and no-effect checks.                                                          |

**Preservation set.**

Existing `s130-artifact-intake`, `s130-intake-route`, `s130-intake-store`, `s130-filled-pdf`, `s130-derived-artifact`, `s130-derived-publication-ownership`, `s130-filled-artifact-panel` and controls/history tests; S66/S21 ownership and snapshots; exact S20/S34 transport; existing AcroForm field/object comparison and bounded safety refusals. Preserve the current reviewed Sheet=true contract rather than resurrecting the old S128/F08 pause. Keep preservation separate from the finalized source-preparation follow-up.

**Adversarial acceptance checks.**

- **AC-S130-1** — Empty/pending manifest is usable; filenames/count do not satisfy coverage, and one family may use multiple files or be inapplicable (ARCH-S130-1 / BEH-S130-1).
- **AC-S130-2** — Corrupt/unsafe/encrypted/XFA/signed/protected input is refused; actual parser results distinguish static from AcroForm and cannot activate content or provider keys (BEH-S130-2).
- **AC-S130-3** — Repeated parties/animals populate exact reviewed slots consistently; wrong role, missing source, renamed required field or conflicting template/map fails before approval (BEH-S130-3).
- **AC-S130-4** — Supported AcroForm bytes reopen with expected values and unchanged protected content. Mapped static output is tested under AC-S130-11; unmapped static/manual handoff never passes actual filling (BEH-S130-4).
- **AC-S130-5** — A changed term/template/map yields a new output identity; forged/stale approval cannot reach upload. Concurrent preparation/cleanup preserves the winning published peer (ARCH-S130-2).
- **AC-S130-6** — Missing required/unknown applicable material holds its output; absent unrelated pet/city/HOA material, provider connection or closed keys does not prevent valid local filled output/download (BEH-S130-6).
- **AC-S130-7** — Controlled S34 integration covers one attempt, duplicate confirmation, partial/lost responses and exact byte binding without another create; uploaded presence does not prove signatures (BEH-S130-7).
- **AC-S130-8** — Local service/emulator/UI journeys exercise all intake/fill/review/download/recovery checkpoints from empty to reviewed synthetic material; reload retains identities. No test value becomes a production record (BEH-S130-8).
- **AC-S130-9** — Ordinary staff prepare/inspect/confirm lease-specific output; shared template publication stays Admin. No implicit customer send, provider/source effect, historical rewrite, unrelated role grant or background work occurs (ARCH-S130-1).
- **AC-S130-10** — Report actual engineering evidence, any separately authorized deployment, deferred real inputs/live proof and human verdicts distinctly; no unrun/static/fake result becomes live acceptance.
- **AC-S130-11** — Actual saved static PDFs fill approved blank/variable regions with the exact snapshot values. Reopening/extraction reveals no obsolete competing mapped amount/name; rendered fixed clauses, page count/order and layout match the approved source outside authorized regions. Independently inspect all eight private reference topologies without publishing their content to Git (ARCH-S130-3).
- **AC-S130-12** — Empty/unused slots stay blank. Wrong rotation/crop, overlap, unsupported glyphs, overflow and excess parties are explicit errors or use a separately approved compatible form. Required actual signatures/initials are never forged or treated as filled facts (BEH-S130-3, BEH-S130-7).
- **AC-S130-13** — Two preparations of the same accepted identity reuse saved exact bytes; text worksheet, guessed visible fee or masked stale hidden value cannot satisfy output comparison. An unchanged approved attachment is labeled as such (BEH-S130-4).

**Forbidden actions / hard gates.**

No legal content invention, blanket reference approval, signature generation, field inference from instructions inside a PDF, public/customer-data uploads, provider UI workaround, Drive setup, action activation or live testing in this cycle. Use existing approval controls; do not add a new review document or approval framework. Missing exact legal/input configuration blocks its customer-ready output, not scaffolding or independent staff work.

**Dependencies / sequencing.**

S66 owns facts/policy/applicability; S21 owns trusted publication; S34 owns exact upload/loop/handoff; S106 owns connection; S182 owns staff and AI boundaries. Static support and local download are implementable without provider credentials or Drive. Do not wait for a fictitious signature API.

**Standalone delivery contract.**

- **Deliverable now:** usable existing-control extensions, complete static/AcroForm adapters, comparisons, saved files and recovery with local/emulator/browser evidence.
- **Consumes, but does not assume:** approved originals/maps/values; unset configuration is a precise preparation/finalization state.
- **Externally blocked effect:** production customer-ready output needs its actual approved inputs; live upload/signature acceptance is separately deferred, not engineering acceptance.
- **Produces for downstream suites:** exact approved private output bytes, immutable provenance, comparison and signer handoff information.

**Verification and delivery contract.**

Establish fail-first mapped-static, hidden-value, geometry, capacity and staff-control tests before implementation. Preserve current AcroForm and real store-race checks. Inspect both extraction and renders; use local synthetic values and private reference topology without writing test production records. Run focused service/emulator/browser checks and the repository's required verification for an expressly authorized delivery. Do not claim static filling from an empty field count, rendered worksheet or fake provider. This authoring request starts no implementation, release, live proof or demo.

**Ordered prompt sequence.**

1. Recheck the original/map/derived owners and privately inspect actual template topology.
2. Freeze static/AcroForm, hidden-value, render, geometry/capacity, version and recovery checks.
3. Establish a verified bounded removal/composition method; extend existing map/intake/derived controls and staff access.
4. Validate every selected document/output and no-effect boundary; preserve prior evidence and report deferred runtime/live inputs.

**Deletion/merge recommendation.**

Retain until actual filling and the preserved provenance/control behavior are owned by verified code and tests, with remaining real-input/live acceptance accurately scoped. Original R-F10 and AC-S130-1–10 identifiers are retained; historical AcroForm proof does not attest to added static outcomes.

## November 3 assessment follow-up — A-04

> Authoring status: FINAL. Implementation/execution is IN PROGRESS after the owner's launch;
> cumulative qualification and delivery are pending. The static/AcroForm filling
> baseline was delivered by the runs registered under intake 052; its earlier authoring narrative
> above is provenance, not a new implementation queue. Source inventory/proposals import, publish,
> approve and save no form, mapping or source selection.

**Goal.**

Engineering recovers existing decisions and turns the eight accessible source references into a
private inventory and proposed map review. Only exact unresolved version, use, fee or signer-meaning
questions go to Dan, the owner's designated business-question contact. The app's existing records
then embody informed Dan/team decisions with their actual authority and provenance.

**Current state / intended end state.**

Current source was inspected on 2026-11-03 at `3943591918bd9c5443bffef381db3d8b32e959d3`; production
serves runtime source `bc97535379dd08deab578455b00a80fc93b8d209`. The assessment readback found
resource settings version 8 with eight unverified references, ten empty intake entries, and
family-use version 0 with labeled engineering defaults. Owner-browser access to the supplied
`dotloop_templates` folder succeeds separately from the Drive connector's account/resource result.
Neither browser access nor a saved reference supplies an approved publication or reviewed map.
Individual content observations and their limits belong in the assessment's evidence inventory;
filename-level identification is not content or format verification.

Fresh signed-in browser inspection on 2026-11-03 matched all eight folder row identifiers to the
saved version-8 references. Previews showed additional disclosures (2 pages), lead disclosure
(1), extension (1), Missouri lease (20; pages 1–5 and 18–20 inspected), brokerage brochure (2),
owner acknowledgment (1), pet agreement (3), and insurance addendum (2). The extension includes
four tenant lines; the pet agreement has four animal rows. Several sources have preprinted
organization/agency text, fixed fee/policy text, manager prefill or visible alterations alongside
blank facts/signature areas. The two-page checklist has unanswered approval, signer and filling
questions for the seven older families. These observations establish useful source coverage and
review questions, not clean-master suitability, legal applicability or usable fill coordinates.
The managed-browser download subsequently completed. All eight original binaries and hashes are
inventoried privately: 32 static pages, zero AcroForm fields, with complete independent text,
geometry and visually inspected renders. The earlier four recovered copies match byte-for-byte.
The app's full-lease and insurance previews truncate at 5,000 text runs; the independent inventory
does not. The brochure has actual rotated-page geometry. Private proposals identify 39 meaning
candidates and 225 observed blank-text candidates, including repeated animal rows and protected
signing exclusions. These are not approved/executable maps or hidden-content-removal proof.
Printed elections, overlapping fee text, signing roles and clean-master suitability retain their
exact substantive questions. Source access is resolved; no duplicate client file request is needed.

A fresh bounded provider read at 2026-11-03T08:41:41Z verified the approved integrations account
and the selected Lease Renewal template among nine templates on its supported office individual
profile. One normal OAuth refresh recovered the initial authentication refusal through the existing
credential-metadata contract. No saved selection, resource observation or business record changed;
both Dotloop write keys remained closed. This establishes current resource visibility separately
from the still-unapproved source originals and maps.

The existing catalog already represents the eight reference types plus conditional city/HOA
families (`lib/lease-documents/artifact-catalog.ts`, lines 13 and 56). Its existing intake can bind an
exact validated publication, inspect the original and record a reviewed map
(`lib/firestore/lease-artifact-intake.ts`, lines 92, 229, 372, 535 and 554). The map contract
already records field meaning, source, multiplicity, PDF field names or static geometry, separate
signer roles and protected signature areas
(`lib/lease-documents/artifact-intake-contract.ts` (line 325)). Intake itself exists. Subsequent
implementation diagnosis established a separate missing upstream production PDF-publication
provider, tracked as A-08/Q-ENG-PUB2 below; approvals/maps alone cannot resolve that technical seam.

Intended: a private, source-bound technical inventory and reviewable proposal using the accessible
files. If the approver adopts one of those exact source hashes, reuse its inventory; if a clean or
new approved original differs, re-inventory only that successor. Legal approval, final applicability,
fee policy and map approval remain [B-DL3/C01–C02](../open-blockers.md). Technical analysis is owned
by engineering and is not a client dependency.

**Actors and entry conditions.**

Engineering reads verified owner-browser resources and accessible correspondence/records through
existing authenticated paths; no credential/profile copying or broader grant is assumed. Dan is
the ASK contact for unresolved business decisions and can resolve them with the appropriate team
or document authority. That assignment does not make a job title a legal signature grant. The team
records an adequately evidenced decision through existing S21/S66/S130 controls, identifying the
actual decision maker/source; do not ask the owner to approve the same settled decision again.
Ordinary role requirements of those controls remain unless separately amended.

**What it is / how it functions.**

- **R-S130-9 — Inventory existing sources.** For every accessible source, record its exact
  private reference and access actor, read time, family candidate, completeness, page count/format
  where actually established, and version/content hash when complete bytes are available. Record
  visible prefilled content, fields, signatures/protection or hidden-value risks as findings, not
  adopted facts. Distinguish browser-visible pages from a complete parsed-byte inventory.
- **R-S130-10 — Prepare the technical map proposal.** Engineering inventories actual fields or
  static regions and prepares a private highlighted map with meanings, allowed fact sources,
  repeated slots/order/capacity and separate signer locations. Each proposal binds the precise
  inspected original; uninspected destinations remain unknown. The approver reviews human-readable
  blanks and choices, not a request to author JSON or derive coordinates.
- **R-S130-11 — Make review and verification ready.** State the smallest unresolved decision per
  relevant form, reuse existing source evidence, and prepare the procedure/sample plan for exact
  synthetic filling. Once the original and map are approved, engineering performs S235 R-S235-7:
  every page and repeated slot, overflow refusal, protected regions, extraction/render comparison
  and exact source/map hashes. An unapproved reference exercise does not complete that checkpoint.
- **R-S130-12 — Recover before asking; bind informed decisions.** Search existing accessible
  records, supplied sources and prior decisions before drafting a question. Bailey's October 1
  email supplied source forms and described extension use for a tenant already on PMI's lease;
  retain that attributed guidance, its date and limitations as evidence, not blanket current
  legal/version/fee approval. Ask Dan only the remaining precise discrepancy: the candidate and
  source, what is known, the team's supported recommendation, the decision needed and its affected
  output. Carry a resolved answer into existing version/hash/use/map records; no competing approval
  portal, redundant file collection or automatic source adoption.

**In scope / out of scope.**

In scope: read-only source diagnosis, private inventory, existing-family crosswalk, proposed field
and signer review, and a bounded synthetic verification plan through existing S130 tools. Out of
scope: a replacement form system, legal rewriting or approval, guessed coordinates/fees/signers,
blanket city/HOA requests, importing/publishing/saving material during this assessment, access
changes, Dotloop selection/activation, customer output, provider effects and signature work.

**Open questions & assumptions.**

No material design question remains open. Which accessible file/hash is the current approved
original remains a bounded runtime decision unless existing adequate evidence already resolves it.
Dan is the question contact, with the actual document/policy authority named in resulting evidence.
Do not assume a source is blank, current, safe, fillable or legally approved
from its name. If a source contains old values or signed/protected content, document the precise
need for a clean approved original or a supported reviewed derivation. Request a replacement only
for that established deficiency. No global integration-access defect follows from a connector 404;
the permitted browser read and application identity have independent resource scopes.

**Cross-product impacts.**

Existing S21 immutable publication, S66 family use/facts/policy, S130 format/map/filler/provenance,
S235 readiness and synthetic verification, S34 byte-bound upload and S182 source-origin exclusion.
No private source, legal text, customer value, PDF render or draft mapping is committed to Git.

**Authority and evidence map.**

| Input                                                                   | Classification              | Use and limitation                                                                                                    |
| ----------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Current assessment instruction and `AGENTS.md`                          | Authority                   | Inspect and specify only; no form/import/publication/configuration write in this review.                              |
| November 3 browser/resource/intake readbacks                            | Resource evidence           | Existing files and saved-reference state, separately qualified by actor and completeness; not approval.               |
| Current S130 source and delivered intake 052 evidence                   | Implementation evidence     | Existing bounded PDF intake/filling and exact provenance; not real-map verification or human acceptance.              |
| C01–C02 and applicable C07–C10                                          | External dependency         | Client supplies version/meaning/policy/authority decisions; engineering supplies technical preparation.               |
| November 3 owner answers and attributed October 1 Bailey correspondence | Direction / intent evidence | Dan receives exact unresolved questions after recovery; correspondence is not blanket approval or an execution grant. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S130-4** — A private inventory and proposal bind the exact inspected source and the
  existing family/map schema. The starting missing-inventory/coverage check fails until each source
  is accounted for with explicit completeness and provenance; a successor hash invalidates its old
  geometry. Reuse existing tools; add code only if a later scoped instruction establishes a gap.
- **ARCH-S130-5** — Proposed map and verification readiness stay separate from approved catalog
  entries and R-S235-7 evidence. No read or generated local sample can set approval, publish bytes,
  activate a key or produce a provider receipt.
- **ARCH-S130-6** — Existing source/inventory/intake owners preserve decision provenance and
  version/hash bindings from recovered evidence or an informed Dan/team answer. A fixture question
  set fails when it asks for a resolved decision again, omits the actual source or treats an email
  attachment as approval; recording uses existing controls, not a new review system.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S130-9** — Every supplied reference is privately accounted for as inspected, partly
  inspected or unavailable through the exact checked path; it is not requested again without a
  precise deficiency. City/HOA is asked only for a demonstrated applicable requirement.
- **BEH-S130-10** — The document approver receives engineering-prepared highlighted destinations
  and plain questions about meaning/version/use, with unknowns explicit and technical coordinates
  owned by engineering.
- **BEH-S130-11** — Once actual approval exists, synthetic verification uses the exact accepted
  original/map, all slots and preserved signature regions. Until then the checkpoint remains
  honestly NOT RUN and the prepared review package is still a complete engineering deliverable.
- **BEH-S130-12** — A known answer is shown with its source instead of becoming another client ask.
  Dan receives only an exact unresolved choice and supported recommendation; an answer changes
  only the applicable recorded decision/version, not unrelated legal or fee content.

**Human litmus outcome.**

### Review the forms already supplied

**If this was built correctly:** The form approver sees which existing file each proposal uses,
which blanks engineering has highlighted and the few decisions that still need confirmation.
They can confirm or correct meaning, version, attachments and signer roles without finding all
eight files again or working out technical field locations. No form becomes approved or sent just
because the team inspected it.

- Model verdict: NOT RUN — eight-source inventory/proposals are complete; approved exact-map filling and the complete litmus remain unverified.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                | Architecture outcome | Behavior outcome | Human litmus                      | Deterministic evidence / falsification                                                                                              |
| ------------------------------------------ | -------------------- | ---------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| R-S130-9 exact source inventory            | ARCH-S130-4          | BEH-S130-9       | Review the forms already supplied | All eight references have dated actor/completeness entries; only parsed complete bytes receive a byte hash/field inventory.         |
| R-S130-10 proposed reviewed destinations   | ARCH-S130-4          | BEH-S130-10      | Review the forms already supplied | Proposed destinations trace to inspected source geometry/fields and supported fact keys; changed hash refuses reuse.                |
| R-S130-11 approval/verification separation | ARCH-S130-5          | BEH-S130-11      | Review the forms already supplied | Missing approval remains NOT RUN; later exact-map synthetic comparison satisfies the existing procedure without production effects. |
| R-S130-12 evidence-led decision recovery   | ARCH-S130-6          | BEH-S130-12      | Review the forms already supplied | Recovered-answer, conflicting-source, unanswered-choice and changed-original cases; exact attribution and existing-control binding. |

**Preservation set.**

Preserve the delivered static/AcroForm adapters and S130 safety, stale-value removal, repeated-slot
and provenance checks; existing S21 publication/approval, S66 applicability and fees, S235 exact-map
verification and S182 origin rules. Keep source-link attestation distinct from approval. Preserve
the already-settled Dotloop selection and both closed business-write keys. No adapter test was run
to verify an actual supplied legal original in this assessment.

**Adversarial acceptance checks.**

- **AC-S130-14** — Each supplied source has an explicit private inspection result; incomplete
  browser visibility is not a complete parsed-file PASS, and a connector failure is not absence
  (ARCH-S130-4, BEH-S130-9).
- **AC-S130-15** — Every proposed field/region/signature location traces to the actual inspected
  source and records capacity/meaning. A changed original/hash makes the proposal stale; absent
  content yields an exact unknown, never invented geometry (ARCH-S130-4, BEH-S130-10).
- **AC-S130-16** — Prefilled, conflicting hidden-value, protected/signed or missing-page findings
  produce a precise correction/clean-original question. Unaffected sources and unused/conditional
  city/HOA material do not become blanket replacement requests (BEH-S130-9).
- **AC-S130-17** — Local samples use synthetic values only. An unapproved reference sample does
  not satisfy R-S235-7; after approval, exact hashes, every page/repeat/protected region and overflow
  refusal are evidenced privately (ARCH-S130-5, BEH-S130-11).
- **AC-S130-18** — No source/map import, publication, approval/configuration save, provider call,
  key change, customer draft/send or signature occurs in this assessment; raw files and detailed
  maps remain outside Git (preservation gate).
- **AC-S130-19** — Existing adequate decisions remove duplicate questions. October 1 source
  guidance informs the proposal without silently approving current versions, use, fees or signer
  authority. An unresolved conflict produces one precise Dan question with source and affected
  output; an informed answer is recorded once against the exact source/map/use version
  (ARCH-S130-6, BEH-S130-12).

**Forbidden actions / hard gates.**

Do not modify, share, import, publish or approve the supplied files during this assessment. Do not
copy credentials/browser profiles, widen Drive access, infer legal approval, reuse a map against a
different original, fill real signatures or use customer data as verification. Future ordinary
publication and provider execution require their own existing exact controls and authority.

**Dependencies / sequencing.**

Inventory/read-only preparation can proceed with accessible sources. Client legal/version/use
decisions and reviewed meaning are B-DL3; engineering's proposed map and synthetic verification are
Category A tasks with that explicit dependency. Begin with the first intended renewal extension and
its actual attachments; cover other source references without requiring every family for every
packet. Existing Dotloop access is not a prerequisite to local technical preparation.

**Standalone delivery contract.**

- **Deliverable now:** this complete bounded task specification. Under a later work instruction,
  a private eight-source inventory, exact-source proposed-map review and synthetic verification
  readiness package can be completed without legal approval or production changes.
- **Consumes, but does not assume:** readable source pages/bytes and existing schema/tools; missing
  or incomplete access stays precisely qualified rather than treated as source absence.
- **Externally blocked effect:** approval of real originals/maps/policy and customer-ready output
  wait on B-DL3. R-S235-7 stays NOT RUN until its exact inputs are approved; no live proof follows.
- **Produces for downstream suites:** source-bound technical inventory/proposals and exact client
  questions for S66/S130 approval and S235 local map verification.

**Verification and delivery contract.**

A later technical-preparation run first records missing coverage, then inspects the actual source
and proves all inventory/proposal entries against it. Use existing parsing/render tools where
appropriate and keep content private; do not rerun the full release gate for a read-only inventory.
Only a demonstrated code change under a later implementation instruction invokes its focused and
canonical gates. Report proposed, reviewed, approved and synthetically verified separately. This
assessment changes documentation only and schedules no implementation, import or release.

**Ordered prompt sequence.**

1. Reuse the assessment's exact resource references and qualified content observations.
2. Under a later work instruction, complete private field/geometry/source inventory; account for
   every reference and unknown without requesting a duplicate source.
3. Recover accessible decisions, prepare highlighted proposals, and draft only exact unresolved
   questions for Dan; keep unapproved sources outside the production catalog. Sending remains a
   separate explicitly authorized action, not part of this authoring run.
4. After exact input approval, perform the existing local synthetic verification and record its
   actual limits; production publication/provider effects remain separately governed.

**Deletion/merge recommendation.**

Merge this technical-source preparation into S130's existing intake/map contract after its evidence
is complete. Retain B-DL3 as the only external hold register and R-S235-7 as the verification owner;
do not create a competing form-approval workflow or overlapping feature suite.

## November 3 implementation discovery — A-08 trusted original PDF publication

> Authoring FINAL; S130/P4 source and local gate QUALIFIED; application delivery PENDING. The
> genuine managed scanner utility at image `9b3ea5246c57` is promoted and read back; full06 and
> final v8 runtime scope are in [implementation evidence](../evidence/application-gap-implementation-2026-11-03.md). Application-runtime invocation,
> exact reviewed PDF policy and actual original publication remain unverified. Legal/source/map
> approval is separate; no supplied original was published or approved as verification proof.
> Canonical question: Q-ENG-PUB2.

**Goal / current versus intended behavior.**

An authorized Editor can publish one genuinely reviewed blank renewal-original PDF through the
existing trusted-publication control and receive its exact immutable bytes into S130 intake.
The existing file route supplies no exact resource context/policy to scanner resolution. General
production scanning is unavailable; the new S241 provider supports exact process JSON only.
S130 requires a current validated Live publication/hash but accepts only the legacy `renewals`
Space name while the canonical publication Space is `lease-renewals`. These technical seams cannot
be resolved by approvals/maps alone. No production upload was attempted to establish this finding.

Implement a distinct narrow PDF scope/provider over existing routes. Keep arbitrary files/folders
and other types unavailable. Preserve S241's process-only contract, S21 immutable bytes/current
policy checks and S130's independent map/catalog approval. No general upload grant or new portal.

**Requirements and preservation.**

- **R-S130-20 — Exact reviewed source.** Existing Admin policy controls bind one actual renewal
  family, canonical `lease-renewals` Space, file identity/path/name, SHA-256 and byte count within the
  existing intake bound. Record the real blank/no-client-record review and source authority.
  Policy metadata/hash review uploads no original and creates no active version. Changed bytes
  require explicit fresh review/CAS; other resources/families cannot inherit it. This review is
  neither general DLP nor legal/map approval.
- **R-S130-21 — Genuine bounded PDF checks.** Scan original PDF bytes using the managed real
  engine, authenticated exact endpoint and current verified signatures. Combine the existing safe
  parser with complete bounded sensitivity/credential tripwires for the reviewed blank scope.
  Preview truncation, incomplete/unsupported decode, unsafe content, outage, stale evidence or
  byte mismatch cannot produce clean. Preserve strict JSON behavior separately; no fake scanner
  or PDF bytes relabeled as JSON. No third-party customer-data processor or new identity.
- **R-S130-22 — Canonical publication and receipt.** Use the existing Editor Space control,
  role/Space/source metadata checks, authority firewall, actual immutable bytes and policy CAS.
  Resolve exact scope before loading/scanning an inadmissible resource. Persist bound family
  provenance; normal S130 receipt also rejects a different family, wrong/non-Live/stale version
  or hash. Accept canonical `lease-renewals` while preserving valid historical `renewals` bindings;
  unrelated Spaces remain refused. After the independent exact map/use approval, that same
  two-Space compatibility must continue through current packet availability, approved original-byte
  reads, filling and normal transport. Retained original audit reads accept the same two Spaces,
  preserve immutable byte/hash checks and confer no current execution eligibility after a successor.
  Current reads still require the exact active version; no records are migrated or rewritten.
  Publication does not approve legal use, fees, maps or signatures.
- **R-S130-23 — Correctable successors and history.** Existing controls audit exact prior-hash
  review for a successor without broadening resource/Space/source scope. Preserve immutable
  versions, stable policy/resource ownership, stale-map refusal and ambiguity/recovery semantics.
  No overwrite, invented provider result, new action key or customer effect.

**Affected owners / dependencies.**

Existing S130/shared S21, `app/api/spaces/[spaceId]/publications/route.ts`, `lib/publication/`,
the Space file control and `lib/firestore/lease-artifact-intake.ts`. Downstream continuation owners
are `lib/lease-documents/live-input.ts`, `approved-artifact-content.ts` and their exact shared
`publication-space.ts` predicate; existing derived-artifact/fill and transport owners consume their
verified results. The managed scanner stays in
the existing project under current identities/cost limits; image/resource/IAM changes require real
readback. Exact original/legal/map decisions remain U1/U2; source access is already resolved.
General arbitrary KB publication across all advertised types is outside this bounded delta.

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S130-7** — Exact reviewed PDF/family trust flows through real scanning and canonical S21
  immutable publication into S130 receipt and, after separate map/use approval, current packet and
  approved original/derived-byte resolution. One exact canonical/legacy Space predicate preserves
  the same boundary throughout; no file/process scope inheritance or unrelated Space admission.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S130-13** — One permitted original publishes/receives with exact bytes; wrong scope,
  incomplete/unsafe content, failed scanning or policy drift creates no active version. A separately
  mapped/approved canonical original remains eligible downstream; its Space name alone never turns
  it inactive or refuses approved bytes, filling or normal transport.
- **BEH-S130-14** — Successors retain history and stale-map refusal; source publication confers
  no legal, financial, applicability, map or signing approval.

**Human litmus.** Staff use the existing publication/intake controls when the exact original is
ready, understand precise refusals, and distinguish source receipt from approval. Model verdict:
NOT RUN — integrated qualification pending. Human verdict: NOT RUN — no human observer.

**Traceability / adversarial acceptance checks.**

- **AC-S130-20** — Exact PDF/family/resource/path/hash/size review admits only its source; wrong
  values and general files/folders/types refuse before byte load/scan (R-S130-20, ARCH-S130-7).
- **AC-S130-21** — Real original-byte malware and complete bounded sensitivity checks fail closed
  on malware, credentials, unsafe/incomplete decode, stale signatures, outage and mismatch;
  a capped preview never counts as complete (R-S130-21, BEH-S130-13).
- **AC-S130-22** — The real route/store owners publish exact synthetic bytes/hash and normal S130
  receipt binds only the intended family/current validated Live version, without approval or a
  provider effect. Continue the same synthetic original through normal map/approval/catalog owners,
  the actual packet reader, current approved-byte reader, static filling, derived-byte approval and
  normal binary transport over an isolated provider port. Do not replace the product packet or
  approved-byte readers. Both `lease-renewals` and valid historical `renewals` pass; unrelated and
  similarly named Spaces refuse before content load. After a successor, current packet/transport
  refuses the old version while immutable historical audit bytes remain readable. Existing Live,
  validation, content/hash/current-version, source-family, permission and history checks remain
  required. Synthetic approval is no real-original approval or provider completion
  (R-S130-22, ARCH-S130-7, BEH-S130-13, BEH-S130-14).
- **AC-S130-23** — Policy/source races and successors preserve old versions, resource ownership
  and map invalidation; process-only preservation checks still pass (R-S130-23, BEH-S130-14).
- **AC-S130-24** — No supplied original is published, no legal/map decision is invented, and no
  customer/provider write, signature or exact-key activation is qualification proof.

**Implementation / verification.** Record actual starting failures; implement the narrow seam;
exercise canonical owners with synthetic inputs and preserve existing process/S130 checks.
Qualify the exact managed image/service separately from fixtures, then complete native/CI/delivery
gates. Real publication waits on actual substantive authorization and ordinary current controls.
Complete extraction/runtime fit are bounded engineering investigations, with honest unsupported
refusal. No new client technical decision is required; do not request the eight files again.
