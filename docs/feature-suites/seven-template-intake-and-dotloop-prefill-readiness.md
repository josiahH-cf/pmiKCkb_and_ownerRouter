<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: dotloop-pdf-renewal-v1-2026-10 -->

# S130 — Approved template intake and actual PDF filling for v1

> Intake: READY, revision 2026-10-06, intake 052. The deployed bounded AcroForm/S21-derived-artifact baseline remains. Static-reference filling and expanded coverage below are new requirements; no authoring result is an implementation or live acceptance PASS.

**Goal.**

The app produces genuinely filled, reviewable PDF files from approved templates and the current lease packet facts, including the static PDF format supplied for v1. A worksheet or Dotloop-native Autofill handoff alone does not satisfy PDF filling.

**Current state / intended end state.**

At `60145e926a477a35990c48b1123489d98822fe8b`, existing intake, original publication, reviewed field/signer maps, bounded AcroForm filling, derived-file persistence/download, comparison and exact-output approval are implemented. The adapter requires real form fields and cannot fill the supplied static files. Earlier AcroForm emulator, render and browser evidence retains that format's scope.

All eight files in the owner's local `docs/dotloop_template_references/` directory were parsed on 2026-10-06: zero AcroForm fields and zero widget annotations. Page counts are extension 1, full lease 20, animal agreement 3, lead disclosure 1, owner acknowledgment 1, additional disclosures 2, brokerage brochure 2, and Second Nature 2. Visual inspection confirms exported signature/initial boxes and prefilled variable content. Some visible values differ from underlying extracted text; naïve overprinting would retain obsolete amounts or names. These files are references, not automatically approved production legal content.

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

Use the current AcroForm adapter where applicable and add a deterministic static route. A static file without a reviewed usable map is pending mapping, not v1 filling success. Fill blank regions and replace only approved mapped variable content. For prefilled/hidden-layer values, normalize/redact or use an approved clean master through a verified method; white paint over old text alone is insufficient. Removed variable content must not remain recoverable as a competing field value through normal text/object extraction. Do not erase fixed clauses, alter a fee schedule to conceal a policy conflict, or generate legal wording.

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
| Original S130 AC/R-F10 evidence                                 | Historical scoped baseline | Existing AcroForm and concurrency behavior; does not prove the new static adapter.                            |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S130-1** — Extend current intake/publication/map and derived-storage boundaries with bounded static support and compatible family/format evolution; legacy readers and provenance remain valid.
- **ARCH-S130-2** — Original/map/input/output identity, ownership, exact approval and final freeze remain enforced through preparation, cleanup and S34 consumption.
- **ARCH-S130-3** — Static geometry, variable-content removal, source-value comparison and fixed-content render verification have a deterministic tested boundary; the current field-only adapter fails mapped-static acceptance.

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

Existing `s130-artifact-intake`, `s130-intake-route`, `s130-intake-store`, `s130-filled-pdf`, `s130-derived-artifact`, `s130-derived-publication-ownership`, `s130-filled-artifact-panel` and controls/history tests; S66/S21 ownership and snapshots; exact S20/S34 transport; existing AcroForm field/object comparison and bounded safety refusals. Preserve the current reviewed Sheet=true contract rather than resurrecting the old S128/F08 pause. Keep preservation separate from the new static requirements.

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
