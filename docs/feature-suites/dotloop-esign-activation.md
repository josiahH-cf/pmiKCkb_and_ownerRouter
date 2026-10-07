<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: dotloop-pdf-renewal-v1-2026-10 -->

# S34 — Versioned renewal PDFs in new or existing Dotloop loops

> Intake: READY, revision 2026-10-06, intake 053. Existing packet controls, S20 claims/receipts and provider adapters are deployed with deterministic-provider evidence. The new/existing-loop, revision and transport repairs below are not implemented by this authoring run. Both Dotloop keys remain closed; live testing/demo/activation are deferred.

**Goal.**

Staff preview and confirm their exact approved PDFs into a new or explicitly selected existing lease loop, revise them without losing history or creating duplicate loops, and finish signature setup/sending in Dotloop with honest status and completion tracking in the app.

**Current state / intended end state.**

Starting source: `60145e926a477a35990c48b1123489d98822fe8b`; inspected Dotloop source matches the serving `e8bc616d144c6600da8394313153e1a0c75659da` release. Existing normal controls, S20 queue/ledger, approved-byte resolver, loop links and receipt recovery exist. Missing input authoring/current-term resolution is S66. Runtime loop creation does not wire all available property/fact data; multipart upload builds a binary string that is subsequently UTF-8 encoded; upload-folder reuse is only local memory. Current approval ownership follows the last selection recorder, and loop replacement is tied to changed snapshot hash. Completion/refresh controls require wiring verification. Historical fake-provider PASS does not prove the live transport or new behavior.

End state: explicit loop choice bound to the lease/cycle, exact immutable document versions and durable folder/attempt identities; current app versions and prior uploaded versions remain distinguishable. The final app-filled PDF set is the source for transport; Dotloop-native Autofill is not its substitute.

**Actors and entry conditions.**

Renewal staff use the company connection under their own app identity and S182 permissions, regardless of who last saved company settings or a lease assignment. Admins manage connection/template/policy publication. Actual execution needs current S106 connection/resources, S66 complete approved snapshot, S130 exact approved bytes, and the exact open action for the chosen operation. Staff prepare local files while any provider prerequisite is absent. Verification identities never execute.

**What it is / how it functions.**

1. **Choose a loop explicitly.** Offer create from the verified company renewal template or select/link an existing loop readable through the company connection. Show profile, loop identity/address, relevant lease/cycle and existing participants/documents for review. Validate server-side access and target consistency at confirmation. Matching names/addresses are hints, not automatic linking or proof of app creation. Refuse a known different lease; reuse across cycles of the same verified lease requires explicit reviewed association. App linking has its own audited current-state correction; it grants no historical provider receipt or reversal authority.
2. **Create once where chosen.** Preserve `dotloop.loop.create_from_template` and the existing typed Loop-It path. Preview selected profile/template, name, transaction type/status, address, reviewed participant identities/roles and any documented included property details. Wire actual supported address/participant inputs; do not guess custom-field names or an API form-edit endpoint. A created loop has a durable lease/cycle association and its own causal receipt. Changing a PDF snapshot afterward does not silently create a replacement loop; a new-loop choice requires a new exact confirmation.
3. **Use app-filled files intentionally.** Company template configuration/handoff identifies native copied attachments separately from the app's current PDF set. Do not pass copied blanks off as filled outputs. If a native template or existing loop also contains obsolete/duplicate documents, show them for the human Dotloop review/retirement step before signature sending, or choose a compatible template. No undocumented API deletion is promised. Do not treat an extra native document as a satisfied required app-filled output.
4. **Preview and confirm the exact operation.** Reuse S20/S21 preview, approval, one-attempt claim, queue, receipt and own-receipt recovery. Freeze actor, lease/cycle, connection generation, selected target, applicable action keys and each approved document identity/hash before dispatch. Revalidate current terms/approval/maps and target/resources at admission. Do not assign approval to the last settings editor or require another Admin for ordinary staff confirmation. Creating a new loop requires its create key; attaching PDFs to an existing verified loop requires the upload key, not the unused create key. Preparation does not require either key. The existing-loop path uploads only; participant/metadata changes on pre-existing loops are a human handoff unless separately scoped under an exact action contract.
5. **Preserve binary bytes and folder identity.** Multipart transport carries the exact approved PDF bytes, including bytes above ASCII and zero bytes; no binary-to-UTF-8 conversion or refill at dispatch. Persist/recover the selected or app-created destination folder and document-attempt identities so multiple documents, workers and restarts do not create a folder each time. Keep observed provider document ids/metadata separate from the outgoing content hash. Provider document presence/name is not returned-content equality; claim equality only if the documented returned bytes are actually retrieved and compared under the separate live proof.
6. **Recover without redispatch.** Duplicate confirmations and callbacks reconcile the owned attempt/receipt. After a definitive rejected request, only the owning documented retry/correction contract applies. Timeout, ambiguous create/upload or partial packet preserves known loop/folder/document results and leaves an explicit unresolved remainder. A matching external name cannot resolve causality. Do not recreate a loop, repeat an uncertain file upload or roll back unrelated documents. Independently reviewed adoption of an existing loop remains distinct from recovering an app-created receipt.
7. **Revise documents after upload.** Staff can edit S66 facts and prepare/approve a new S130 snapshot/version. Preview only the newly required uploads into the chosen linked loop; unchanged document identities reuse their valid receipts. The app marks which version is current and which it supersedes without rewriting prior files, receipts, signatures or execution claims. Human Dotloop retirement of obsolete files is explicit. Signed artifacts stay unchanged; a changed unsigned successor does not mean a signed agreement was amended or re-executed. Changes affecting economic terms require the current owner-approval contract again.
8. **Hand off to real signers.** Show the exact permitted loop link, current document set, verified signer identities/roles and required signature/initial locations. Staff review/assign those fields, retire obsolete/duplicate documents and send for signature inside Dotloop. V1 has no automatic field-placement/send/signature-status endpoint and never signs for anyone. Potential provider participant/contact or notification consequences must be established and included in the live preview/proof before its creation path is activated; unknown behavior is not asserted harmless.
9. **Track truthful status and completion.** Mount usable readback/refresh controls, labeled freshness and recoverable errors. Retain loop status, observed counts, app upload attempts and document versions separately from signatures. Staff record actual outside completion, actor/time, executed date and supporting artifact/reference through the existing manual/evidence journey; wire its desk/workspace milestone as staff-reported execution. Preserve the distinction from provider-verified or signed-artifact evidence. Loop status, document counts, webhook authenticity and an upload hash never prove signatures. Correcting a staff completion report is audited and does not erase a provider receipt.
10. **Correction is concrete.** Show exact affected loop/folder/document ids and whether the app created or merely linked them. App link/version correction uses a new reviewed current-state action. Provider document retirement and any loop/participant correction lacking the exact authorized API contract are manual in Dotloop. The API's inability to delete loops/documents must replace the old generic delete/rollback promise in affected descriptors during implementation. Do not archive a pre-existing adopted loop or remove its people as an automatic rollback.

**In scope / out of scope.**

In scope: new/existing-loop choice/linking, create input repairs, exact conditional admission, binary upload and durable folder/attempt recovery, revised versions, status/handoff and staff completion wiring. Out of scope: new action activation, new provider mutation keys, modifying existing-loop people/details through an upload key, API deletion/reversal invention, actual signature assignment/sending, required webhooks, automatic loop LEASED status changes, Drive setup and live tests/demo in this cycle.

**Open questions & assumptions.**

No feature decision remains open. Actual template/loop ids, signature locations and approved values are configuration/customer inputs. Existing-loop selection and later versions were explicitly accepted. Notification/contact consequences and returned-document behavior need bounded provider verification in the deferred live flow. Do not infer these from a fake; unresolved consequences hold only the affected live operation. Signed copies remain in the existing permitted evidence/provider workflow; no new bulk Dotloop archive or retention scheme is introduced.

**Cross-product impacts.**

Verified owners: `lib/lease-renewal/execution/normal-packet-action.ts`, `lib/lease-renewal/execution/dotloop-runtime.ts`; `lib/integrations/dotloop/client.ts`, `lib/integrations/dotloop/renewal-provider.ts`; `lib/lease-documents/packet-execution.ts`, `lib/lease-documents/dotloop-packet-binding.ts`, `lib/lease-documents/dotloop-loop-link.ts`, `lib/lease-documents/derived-packet-binding.ts`; `components/lease-renewal/DotloopPacketLinkPanel.tsx`; `app/api/lease-renewal/document-handoff/route.ts`; existing S20/S21 execution stores and manual completion/evidence owners. Correction wording also affects Dotloop Registry metadata; a `production_allowed` change remains protected and outside this request.

**Authority and evidence map.**

| Input                                                         | Classification       | Use and limitation                                                                                                        |
| ------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| AGENTS.md; S20/S21/S66/S72/S96; current code                  | Authority / baseline | Exact human action, owned claims, receipts, readback/correction and separate evidence meanings.                           |
| Accepted Q4a–d, Q5/Q7 and deferred-live direction, 2026-10-06 | Confirmed intent     | Renewals/replacement leases, new/existing loops, successor PDFs, human signature setup and staff operation.               |
| [Public API](https://dotloop.github.io/public-api/)           | Provider evidence    | Typed loop/participant/address/upload/read APIs; no documented document-edit/delete or e-signature send/status operation. |
| Prior deterministic provider evidence                         | Scoped baseline      | Existing claim/recovery/control behavior; does not prove byte transport or provider acceptance.                           |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S34-1** — Extend the existing provider/executor/link and completion owners; no duplicate workflow or provider executor. Typed exact target/byte transport exposes the current string corruption and missing wiring.
- **ARCH-S34-2** — Lease/cycle loop association is separate from immutable packet/document versions and durable owned attempts/folders; duplicate and changed-version cases cannot create a second loop implicitly.
- **ARCH-S34-3** — Readback, staff report and signed/provider evidence remain distinct state projections through failure, correction and reload.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S34-1** — One confirmed new-loop operation uses the correct selected resources, supported address/people and exact PDF bytes once; an explicitly linked existing loop accepts the approved upload without creating a loop.
- **BEH-S34-2** — Incomplete/stale inputs, wrong target/access, closed required key and ambiguous attempts show scoped recovery and never redispatch automatically.
- **BEH-S34-3** — Staff can inspect/refresh the linked loop, upload a reviewed successor into it, and record actual outside completion with clear version and evidence labels.

**Human litmus outcome.**

### Put the right version in the right loop

**If this was built correctly:** Staff choose a new or existing lease loop, review the exact files and confirm once. A corrected pet charge produces a new reviewed file in that loop while earlier evidence stays visible. Staff open Dotloop to assign and send signatures, then record the outside result without the app pretending an upload was a signature.

- Model verdict: NOT RUN — specification authoring only.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                        | Architecture outcome   | Behavior outcome | Human litmus                            | Falsification                                                                                  |
| -------------------------------------------------- | ---------------------- | ---------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Correct explicit new/existing target and ownership | ARCH-S34-1, ARCH-S34-2 | BEH-S34-1        | Put the right version in the right loop | AC-S34-2, AC-S34-5; new/existing, cross-lease, renamed loop and wrong-profile tests.           |
| Exact bytes and durable folder reuse               | ARCH-S34-1, ARCH-S34-2 | BEH-S34-1        | Put the right version in the right loop | AC-S34-6; real multipart recorder/parser, repeated documents and restart.                      |
| Stale/closed/duplicate/ambiguous action recovery   | ARCH-S34-2             | BEH-S34-2        | Put the right version in the right loop | AC-S34-1, AC-S34-4, AC-S34-8; conditional keys, lost response, own receipt and partial packet. |
| Successor document versions and corrections        | ARCH-S34-2             | BEH-S34-3        | Put the right version in the right loop | AC-S34-7, AC-S34-10; unchanged/current/signed version and adopted-loop protection.             |
| Human handoff and honest status/completion         | ARCH-S34-3             | BEH-S34-3        | Put the right version in the right loop | AC-S34-3, AC-S34-9; refresh, no signature API, staff report versus signed evidence.            |

**Preservation set.**

Existing `dotloop-renewal-executor`, `s34-dotloop-packet-lifecycle`, `s66-dotloop-packet-binding`, `s66-packet-truth-boundary`, `dotloop-followup-draft` and lease execution-matrix checks; S20 claims/own receipts; S21 approved bytes; S113 manual/evidence distinctions; exact-key activation gates. Preserve current provider receipt causality and source-effect contracts.

**Adversarial acceptance checks.**

- **AC-S34-1** — Incomplete/stale snapshot, approval, original/map/output or selected target cannot admit a provider request (ARCH-S34-2).
- **AC-S34-2** — One exact human confirmation is claimed once, receipted and read back; repeat uses the owned result and does not create another loop (BEH-S34-1).
- **AC-S34-3** — No guessed legal content, participant, signature placement or endpoint is accepted; uploaded/loop/webhook status never establishes signatures (ARCH-S34-3).
- **AC-S34-4** — Normal recovery uses its own durable response/readback receipt. A matching name cannot prove creation causality or authorize another create/upload after an ambiguous outcome (BEH-S34-2).
- **AC-S34-5** — Staff explicitly select/verify an existing lease loop or new-template path; existing upload makes zero create/participant-update calls, and new creation includes supported approved address/participants. Last settings editor does not control ordinary approval (BEH-S34-1).
- **AC-S34-6** — A real local multipart transport recorder extracts PDF bytes exactly matching the frozen artifact, including non-ASCII/zero bytes. Multiple documents/workers/restart reuse the durable target folder; metadata alone never claims content equality (ARCH-S34-1, ARCH-S34-2).
- **AC-S34-7** — A reviewed changed document uploads as a successor in the linked loop; unchanged documents reuse valid receipts. No loop/file/signature/receipt is overwritten; a signed version is not silently amended or re-executed (BEH-S34-3).
- **AC-S34-8** — Local preparation succeeds with both keys closed. Existing-loop upload depends on upload authority only; new-loop creation depends on its create authority. Partial/uncertain uploads retain known results and an exact unresolved remainder (BEH-S34-2).
- **AC-S34-9** — Mounted refresh/status/completion controls persist and reopen the true observations and staff-reported milestone. Wrong-key UI labels, unavailable refresh or absent completion writes fail a service-plus-UI journey. Staff reports stay distinct from signed/provider evidence (ARCH-S34-3).
- **AC-S34-10** — Correction shows provenance and exact targets; no nonexistent delete/automatic rollback is offered, no adopted loop is archived, and obsolete/duplicate file retirement is an explicit human Dotloop step (ARCH-S34-2, ARCH-S34-3).

**Forbidden actions / hard gates.**

No autonomous/model-triggered provider action, generic endpoint execution, fake production record, client send, signature fabrication, UI/RPA provider automation, causal-receipt adoption by name, key activation or deferred live proof. Existing-loop upload is not permission to modify people/details. Provider correction lacking an exact contract remains human-performed and honestly labeled.

**Dependencies / sequencing.**

S66 supplies approved snapshot/facts, S130 final exact bytes, S106 shared connection/resources and S182 staff capability/provenance. S20/S21 retain execution/publication ownership. All code and recovery paths can be implemented against controlled adapters without live credentials/proofs; actual activation is a later separate flow.

**Standalone delivery contract.**

- **Deliverable now:** complete target selection/link, execution/transport/recovery, version and handoff/status controls with local/emulator/service/compiled-browser evidence.
- **Consumes, but does not assume:** actual connection, template/loop ids, approved forms/facts/bytes and exact action authority; absent inputs remain scoped provider holds.
- **Externally blocked effect:** real create/upload, provider notification/content acceptance and live signature handoff require the deferred flow and exact activation; engineering acceptance does not depend on performing them now.
- **Produces for downstream suites:** auditable loop association, immutable document/attempt history, current-versus-prior version, real observed readback and separately labeled staff/evidence completion.

**Verification and delivery contract.**

An implementation runner establishes fail-first multipart, existing-loop, successor, conditional-key, refresh/completion and recovery checks; preserves correct causal receipts and exact byte resolution; runs service/emulator and compiled control journeys plus applicable repository gates for an authorized delivery. No real provider mutation is used as test proof in this cycle. Report engineering and deferred operational/live acceptance separately; this spec is not an implementation/release permit.

**Ordered prompt sequence.**

1. Recheck normal packet, exact artifact and provider/receipt owners and current action boundaries.
2. Freeze fail-first target, binary, folder/restart, successor, role/key and completion controls.
3. Extend current owners and recovery without new mutation keys or signature/delete assumptions.
4. Falsify every acceptance row, preserve old receipts and source contracts, and report live requirements separately.

**Deletion/merge recommendation.**

Keep until the revised lifecycle is represented by verified code/tests and separately recorded live acceptance. Historical S34 fake-provider and deployment evidence is retained with its original scope.
