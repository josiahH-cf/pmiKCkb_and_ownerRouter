<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: dotloop-pdf-renewal-v1-2026-10 -->

# S34 — Versioned renewal PDFs in new or existing Dotloop loops

> Baseline: IMPLEMENTED AND DEPLOYED — intake 053 new/existing-loop lifecycle, exact-byte transport,
> durable association/recovery and human signing handoff. November 3 U5 technical source and local
> gate QUALIFIED; application delivery PENDING. Readiness, isolated execution and recovery scope
> is in [implementation evidence](../evidence/application-gap-implementation-2026-11-03.md); prior final v8 runtime qualification creates no provider effect.
> Both Dotloop business-write keys remain closed.
> The planned separately gated activation below is not authorized by this specification.

**Goal.**

Staff preview and confirm their exact approved PDFs into a new or explicitly selected existing lease loop, revise them without losing history or creating duplicate loops, and finish signature setup/sending in Dotloop with honest status and completion tracking in the app.

**Current state / intended end state.**

Serving source `bc97535379dd08deab578455b00a80fc93b8d209` contains the normal S20/S21 packet
controls, reviewed current inputs, binary upload transport, persistent loop/folder associations,
new/existing-loop choice, document successors and owned-attempt recovery. The original intake 053
release and later S235 lease-wide duplicate checks are recorded in the registry and November 3
delivery evidence. The historical transport/settings-recorder defects are not current gaps.
Fresh November 3 reads verify the integrations account and selected supported renewal template;
the cached observation remains separately dated. Both keys are closed, actual content/maps remain
unapproved and no real create/upload/signature was assessment proof. U5 below plans the remaining
technical readiness and separate exact-key activation pathway without executing either.

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

In scope: the existing new/existing-loop lifecycle, exact conditional admission, binary upload,
durable recovery, revised versions and human handoff, plus the November 3 plan for technical
readiness and separately gated activation of its two existing keys. Out of scope: executing that
activation now, new provider mutation keys, modifying existing-loop people/details through an
upload key, API deletion/reversal invention, automatic signature assignment/sending, required
webhooks, automatic loop LEASED changes, Drive setup and live business effects in this authoring run.

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

- **ARCH-S34-1** — Preserve the existing provider/executor/link and completion owners without a duplicate workflow or executor. Exact target/byte transport checks fail if binary corruption or missing control wiring is reintroduced.
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

## November 3 finalized follow-up — U5 technical readiness and separate activation

> Authoring: FINAL. Follow-up implementation: IN PROGRESS after the owner's launch; delivery pending.
> The owner selected
> inclusion of the existing app-created loop and upload paths through technical readiness and a
> separately gated activation plan. This specification grants no activation or provider business
> write. Signing remains a human Dotloop handoff; both existing keys stay closed now.

**Goal.**

The project can finish technical qualification of both existing operations, prepare a concrete
per-key activation decision and identify the exact remaining authority/content, then support normal
staff-confirmed real work only after those separate gates actually pass.

**Current state / intended end state.**

The November 3 assessment verified `integrations@pmikcmetro.com` and selected office individual
profile/template visibility. Selection version 1 is settled; no membership, template recreation,
new credential or status-choice request remains. `normal-packet-action.ts` (lines 71–72,
169–181,242–260) evaluates the create and upload keys independently. Its current assembly binds
current snapshot/terms, selected resource, exact parties and the lease's association before
admission (lines 310–403). No app-created loop, customer upload or provider receipt was newly
created to verify that code.

The missing operational evidence is not a broken OAuth connection: required real content/approval,
provider consequence qualification, exact activation authority and ordinary real-work readback are
separate. Intended: label those separately, complete isolated engineering qualification and deliver
an exact per-key activation package. Only a later specific authority may change protected metadata
or admit an actual operation; no signature API or generic Dotloop action is introduced.

**Actors and entry conditions.**

Engineering owns qualification and the exact readback/activation package. Existing authorized
renewal staff own operation previews and confirmations; current app roles/Space and canary refusals
remain. Dan is the ASK contact only for unresolved business choices or actual counterpart/signing
meaning, after existing evidence is recovered. The owner of protected action authority decides
later activation from a concrete package. An integration identity or technical readiness result
cannot supply that authority.

**What it is / how it functions.**

- **R-S34-11 — Separate readiness dimensions.** For `dotloop.loop.create_from_template` and
  `dotloop.document.upload`, identify technical qualification, actual content/map/owner-approval,
  current connection/resource/target, exact-key state and execution authority separately. A closed
  key remains an intentional authority hold rather than a failed provider connection. Local file
  preparation and isolated checks remain available.
- **R-S34-12 — Qualify each existing path and its consequences.** Reuse the typed client, normal
  executor, S20 claims/receipts and S21 exact bytes. Exercise new-loop creation and existing-loop
  upload independently with deterministic external adapters and real isolated stores/control paths.
  Establish documented participant/contact/notification, copied-template-document and returned-byte
  limitations using existing evidence and official provider contracts. Unsupported or unknown
  consequences are named explicitly; do not create a customer effect to investigate them or assume
  document presence proves byte equality/signature.
- **R-S34-13 — Prepare exact separate activation.** Produce a reviewable package for each existing
  key: operation/scope, code/config/actor prerequisites, consequence/correction limits, required
  content/target evidence, current closed state, proposed narrow metadata change, backup,
  concurrency/CAS/readback procedure, failure/ambiguity response and stop conditions. Keep create
  and upload authority independent; an existing-loop upload never requires opening the create key.
  Any actual protected patch/activation needs a later exact owner instruction and its established
  technical gates; the plan, READY label or historical program is insufficient.
- **R-S34-14 — Admit ordinary real work and hand off signing honestly.** After actual content and
  exact authority exist, use the existing staff preview/confirmation with current source/recipient
  or participant/target/version, one-attempt claim, receipt and readback. Duplicate confirmation
  reuses the owned result; ambiguity recovers the same attempt without a new create/upload. Show
  current app PDFs and copied/native/obsolete documents separately for human Dotloop review and
  signature assignment/sending. Keep staff-reported returns, provider presence and signed evidence
  distinct through S236; no production test record or send-for-proof is required.

**In scope / out of scope.**

In scope: readiness classification, focused isolated qualification, source/provider-contract
diagnosis and exact per-key activation/correction plan for the two existing operations. Out of
scope now: activation, registry/configuration/permission changes, live create/upload/participant
effects, signatures/sends, synthetic production records, paid proof, undocumented endpoints and
generic/bulk/model-driven execution. Existing human signing is intentional.

**Open questions & assumptions.**

No material product-design question remains: both existing paths and the human signing handoff are
included in the plan. Actual originals/maps, current case approval and targets, specific provider
consequence evidence and later exact activation authority remain bounded runtime gates. Complete
accessible investigation before identifying an external provider fact as unavailable. Ask Dan only
an unresolved business meaning, not to supply engineering evidence or decide an already-settled
new/existing-loop feature. No indefinite credential or signature-state capability is assumed.

**Cross-product impacts.**

S106/S228 own managed connection/readiness and settled resource selection; S130 owns exact approved
bytes/maps; S66/S234 own current facts/economics/owner-term evidence; S235 owns applicability,
duplicate prevention and packet state; S236 owns returned/signature evidence; S238 owns integrated
staff/client handoff. S20/S21 and existing normal executors remain the only effect/provenance owners.

**Authority and evidence map.**

| Input                                                            | Classification                      | Use and limitation                                                                                                       |
| ---------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| November 3 owner scope answer and `AGENTS.md`                    | Authoring authority                 | Include both paths and separately gated activation in the plan; activate or execute neither now.                         |
| Fresh provider read, saved selection and current normal executor | Implementation/resource evidence    | Current supported resource and exact conditional keys; not content approval or live creation/upload proof.               |
| Accepted original S34 lifecycle and official Dotloop contract    | Existing design / provider evidence | New/existing loop choice, exact bytes, human signing and documented consequences; no invented API/correction capability. |
| Actual content/decision/activation authority                     | Runtime dependencies                | Bind exact case/version/operation; no grant follows from test, role, connection or metadata alone.                       |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S34-4** — Existing readiness and normal-action owners distinguish technical, content,
  resource and exact-authority states for each operation. A starting fixture fails if one closed
  key is described as missing OAuth or if existing upload depends on create authority.
- **ARCH-S34-5** — A per-key activation package references exact current artifacts, preserved
  metadata/configuration and the reviewed backup/CAS/readback/correction boundary. An incomplete,
  wrong-key or outdated package cannot be labeled activation-ready; preparing it performs no patch.
- **ARCH-S34-6** — Existing effect owners enforce exact admitted identity/bytes/target and own-receipt
  recovery across partial/lost responses. Human signature work and returned evidence never enter
  an invented provider operation or replace the execution receipt.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S34-4** — Staff see that technical preparation is qualified while a specific content or
  exact-key authority hold remains; local output and unrelated work continue.
- **BEH-S34-5** — New-loop and existing-loop upload fixtures exercise their actual conditional keys,
  approved bytes and consequences without live effects; uncertainty remains explicitly unproven.
- **BEH-S34-6** — The owner receives a concrete per-key activation package with exact proposed change,
  limits and readback, not a broad request to approve Dotloop or repeat setup. Preparing or reviewing
  the package opens no key.
- **BEH-S34-7** — Under later actual authority, one exact confirmation yields the owned result or
  an explicit unresolved attempt; unchanged files/duplicate confirmations never create a second
  effect, and signing remains a person-operated handoff.

**Human litmus outcome.**

### Know what is ready and what a later activation would allow

**If this was built correctly:** The team can explain which normal packet operations are technically
ready, which actual form/approval is missing and which exact action remains closed. The owner can
review a concrete upload-only or create-operation activation package. Once separately authorized,
staff review the right files and target once, recover the same attempt if needed, and finish
signature work in Dotloop without the app claiming that upload means signed.

- Model verdict: NOT RUN — separate operation readiness, passive activation packages and normal-operation recovery pass focused isolated checks; cumulative qualification, this model litmus and delivery remain pending. Neither key was activated and no provider business effect is claimed.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                      | Architecture outcome   | Behavior outcome | Human litmus                                               | Deterministic evidence / falsification                                                                    |
| ------------------------------------------------ | ---------------------- | ---------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| R-S34-11 separate readiness                      | ARCH-S34-4             | BEH-S34-4        | Know what is ready and what a later activation would allow | Closed create/upload, unavailable content and good connection fixtures; independent local preparation.    |
| R-S34-12 isolated path/consequence qualification | ARCH-S34-4, ARCH-S34-6 | BEH-S34-5        | Know what is ready and what a later activation would allow | Actual route/store/provider-adapter cases plus attributed provider-contract evidence; no customer effect. |
| R-S34-13 exact activation package                | ARCH-S34-5             | BEH-S34-6        | Know what is ready and what a later activation would allow | Required-field/version/current-state/backup/CAS/readback checks; no patch or key opening.                 |
| R-S34-14 exact effect/human handoff              | ARCH-S34-6             | BEH-S34-7        | Know what is ready and what a later activation would allow | One-attempt, duplicate, partial/timeout/restart fixtures; S236 signed/staff/provider evidence separation. |

**Preservation set.**

Preserve `dotloop-renewal-executor`, `s34-dotloop-packet-lifecycle`, current loop-association and S235
history/duplicate checks, `s66-dotloop-packet-binding`, S130 exact bytes/approval, S106 generation
and resource checks, S182 origin exclusion and existing S20 claims/receipts. Keep both registry keys
closed, all configured identities and the human signing boundary. Existing successful fixture and
release evidence retains its actual scope; this authoring performs no new provider qualification.

**Adversarial acceptance checks.**

- **AC-S34-11** — A connected selected resource with closed create/upload keys is labeled as the
  appropriate authority hold. Upload into a verified existing loop depends only on upload
  authority; preparation depends on neither (ARCH-S34-4, BEH-S34-4, BEH-S34-5).
- **AC-S34-12** — Qualification uses actual normal-operation/claim/byte owners with isolated
  adapters and records participant/notification/returned-content limits without manufacturing
  provider proof. Unknown consequences hold only the dependent operation
  (ARCH-S34-4, ARCH-S34-6, BEH-S34-5).
- **AC-S34-13** — Missing exact key/scope/current state, stale source/version, absent consequence or
  backup/CAS/readback/correction instructions prevents an activation-ready package. A complete
  package still performs zero protected metadata writes (ARCH-S34-5, BEH-S34-6).
- **AC-S34-14** — Duplicate, partial, timeout, changed document and restart cases retain the original
  claim/known results and reconcile without another uncertain effect; matching provider names or
  document presence cannot fabricate causality or signatures (ARCH-S34-6, BEH-S34-7).
- **AC-S34-15** — Both keys remain closed throughout technical authoring/qualification. No test
  customer record, loop/upload, signature, mail send, role/configuration change or historical proof
  rerun is used to close this plan (all outcomes, preservation gate).

**Forbidden actions / hard gates.**

No execution, commit, deployment, protected activation, provider business effect or message sending
is authorized by this specification. Later exact activation is planned, not granted. Current
source/target/actor/Space/confirmation, at-most-once claim, receipt/readback and ambiguity gates
remain mandatory. No receipt reuse, guessed rollback/delete, model authority or signature endpoint.

**Dependencies / sequencing.**

Finish accessible diagnosis and isolated technical checks while legal inputs and activation remain
held. Recover existing decisions before any exact business question to Dan. S130/S66/S234 provide
actual approved content/terms when available; S106/S228 recheck current observation without
re-requesting settled membership/selection. Prepare the concrete per-key package next. Only a
later exact owner authorization can initiate protected activation and ordinary real work; human
signing follows through its actual Dotloop handoff, not a proof exercise.

**Standalone delivery contract.**

- **Deliverable now:** implemented separate readiness and passive per-key packages with passing
  focused isolated lifecycle/recovery checks. Cumulative qualification and delivery remain pending;
  both keys stay closed and real activation is separately gated.
- **Consumes, but does not assume:** approved content/maps, current source/target/connection and
  real authority; absent prerequisites are independent named holds, not false technical failure.
- **Externally blocked effect:** live create/upload requires actual content, exact activation
  authority/readback and staff confirmation; signing requires the real human process. Engineering
  completion does not claim those effects operationally complete.
- **Produces for downstream suites:** qualified per-operation readiness, reviewed consequence
  limits, exact activation packages and stable normal-work/human-handoff evidence boundaries.

**Verification and delivery contract.**

For a later authorized task, record current source/readiness and reproduce the named dimensional or
conditional-key failure before edits. Exercise all declared fixture and package checks, keeping the
preservation gate separate. Code changes invoke the repository's canonical verification and
authorized delivery process; a plan/inventory alone does not start a build/release. Record technical
completion, client/content holds, activation state and real-work evidence independently. Never
manufacture a live proof or treat a planned activation as executed.

**Ordered prompt sequence.**

1. Re-establish current source, two exact key states and generation-bound resource/selection reads.
2. Qualify each actual existing operation in isolation and recover documented consequence evidence.
3. Prepare exact independent activation packages and precise remaining business questions only.
4. Under a later explicit activation/execution instruction, apply the existing gates and readbacks;
   ordinary staff work and human signature handoff retain their distinct evidence.

**Deletion/merge recommendation.**

Merge this U5 plan into the current S34 lifecycle contract after verified delivery. Keep S106/S228
resource ownership, S130/S235 content/readiness and S236 signing evidence distinct; create neither
a new executor nor an approval portal. External holds remain in `docs/open-blockers.md`.
