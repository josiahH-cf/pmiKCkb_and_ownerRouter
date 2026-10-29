<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-novdec-2026-10-28 -->

# S236 — Returned documents, who still must sign and evidence-qualified completion

> Status: IN PROGRESS (merged to main at bf0c03f9, a786fa16, be8c0bf4 and 8c84ed04 by PR #161; not served) — ARCH-S236-1 (the persisted staff record keyed by lease, cycle, snapshot, document kind and content hash with actor/time audit, `app/api/lease-renewal/returned-state` and the Returned documents and signatures screen on the lease page), ARCH-S236-2 (projection, with the PR #160 latest-observation and document-identity fixes and earlier snapshots shown as earlier versions) and ARCH-S236-3 are implemented with emulator, unit and component tests. R-S236-5 shows the Dotloop line beside the records; R-S236-6 derives Required signatures complete when every included document is prepared with a reviewed signer map and otherwise keeps the staff record, labeled "Recorded by staff without signer detail" (the PR #161 review fix judges signatures by the Working term revisions the packet's approval facts name, so an independent Working rent or date save after signing ends completion and refuses Done while the records stay as earlier-terms history); R-S236-7 follows recorded returns for an approved family. Originally finalized 2026-10-28 from the November/December renewal Clarify Features initialization (intake 103). Signing stays a person-controlled Dotloop handoff; real returns for real leases and reviewed signer maps (C08, C11) hold only their records.

**Goal.**

For each renewal packet, staff can see which exact document version went out for signature, who has
signed, who still must sign and in what capacity, what evidence supports each entry and what to do
next. "Fully executed" appears only when every required signer of every required document of the
current version is recorded with evidence, and the app never presents staff records or document
presence as provider-verified signatures.

**Current state / intended end state.**

Inspected at `a1c0fe8c` (source read, not a production observation):

- No state exists for sent for signature, partially signed, returned or fully executed, and there is
  no per-signer status. The only related control is "Open in Dotloop to send for signature"
  (`lib/lease-documents/dotloop-loop-link.ts`).
- Staff activities in `lib/lease-renewal/workspace-state.ts` include `documents` "Required documents
  prepared", `document_delivery` "Required documents delivered" and `signatures` "Required
  signatures complete" (Not applicable refused), with choices "Not started", "Waiting", "Done:
  recorded by staff" and optional "Source or channel", "Comment" and "When the work happened"
  (`components/lease-renewal/RenewalManualWorkspace.tsx`). They record actor, time and terms
  revision but no packet snapshot, document version, signer or artifact reference; they go stale
  ("Recorded before the terms changed") when terms change. The operating Sheet carries
  `lease_docs_sent` and `esign_complete`.
- `components/lease-renewal/DotloopPacketLinkPanel.tsx` shows a staff report ("A staff report is not
  provider-verified or signed-artifact evidence…") and a fixed "Required signers" list from the
  packet, not who still must sign.
- Defined but never written: evidence keys `signer-roster`, `signature-state`, `signatures-complete`
  and sources `dotloop_receipt`, `signed_artifact` (`lib/lease-renewal/renewal-process.ts`); the
  tenant completion proof type in `lib/lease-documents/packet-types.ts` has no producer; the intake
  checkpoint "inspect returned state" is hard-coded false (`app/admin/page.tsx`,
  `app/api/admin/lease-artifact-intake/route.ts`).
- Dotloop documents no signature send or status operation; loop readback is metadata only (status,
  participant count) and document readback is presence only; there is no webhook.

Intended: a per-document, per-signer returned-state record entered by staff with evidence and bound
to the exact snapshot and document version, a business-state display with who still must sign,
separate provider metadata, version and lease safety, and the existing manual completion path kept
for work done outside an app packet.

**Actors and entry conditions.**

Renewal staff (Editor or higher) who observe Dotloop or receive signed copies record what they saw;
signers act only in Dotloop. A per-signer roster requires a current app packet snapshot with a
reviewed signer map (C08 in `docs/open-blockers.md`); without one, staff use the existing manual
activity, labeled as such. Nothing here sends, uploads or requests a signature.

**What it is / how it functions.**

- **R-S236-1 — Signing roster per document.** For the current snapshot, each included document lists
  its required signers from the reviewed map's `signers[]` (`signerRole`, `participantKind`,
  `required`, `location`) joined to the packet's people and roles (`personId`, `kind`, `fullName`,
  `order`). Without a reviewed signer map the document reads "Signer requirements pending the
  reviewed map" and cannot reach "Fully executed".
- **R-S236-2 — Staff-attested status with evidence.** Staff record, per document version, "Sent for
  signature" (date and how), and per required signer "Signed" or "Declined / voided" with the date
  observed and the evidence: observed in Dotloop (document name and time viewed) or a signed copy
  received (its private storage reference). Each record carries actor, time, lease, cycle, snapshot
  id and document content hash and reads "Recorded by staff — not provider-verified".
- **R-S236-3 — Business states and who still must sign.** Per document and overall: Prepared (filled
  output approved), Uploaded (current in the linked loop), Sent for signature, Partially signed,
  Fully executed. The lease shows by name and capacity who still must sign each document and the next
  action ("Ask Sam Example to sign the renewal extension in Dotloop").
- **R-S236-4 — Version and lease safety.** A signature recorded against a superseded document version
  reads "Signed an earlier version — not current" and does not count; a record cannot attach to
  another lease or cycle; a terms change after signing shows "Signed before the terms changed" and is
  passed to S237's basis as a mismatch, never silently treated as current.
- **R-S236-5 — Provider metadata kept separate.** "Refresh from Dotloop" results appear as "Dotloop
  shows {loop status, documents present} as of {time}" beside, never inside, the signature records,
  and never set a signed state. Dotloop API-origin values stay excluded from AI context (S182).
- **R-S236-6 — Manual completion preserved and reconciled.** When a current app snapshot exists,
  "Required signatures complete" is derived from R-S236-3 and cannot be recorded Done while a
  required signer is missing. When no app packet exists, staff can still record it with source and
  date, labeled "Recorded by staff without signer detail". Existing Sheet `esign_complete` updates
  keep their exact preview/confirmation.
- **R-S236-7 — Returned-state checkpoint from records.** The Admin intake "inspect returned state"
  checkpoint reflects whether a returned-state record has been reviewed for a packet using that
  family, instead of a constant.

**In scope / out of scope.**

In scope: roster derivation, attestation records and storage, state and who-still-must-sign display,
version/lease guards, metadata separation, manual-path reconciliation, checkpoint derivation, tests.
Out of scope: any Dotloop signature request, send, reminder or status API; webhooks; uploading
signed files into Git; inferring signatures from document presence, hashes, loop status, email or
color; legal validity review; changing who may sign.

**Open questions & assumptions.**

- No product decision blocks this slice. Reviewed signer capacities, order and locations for each
  form are client content (C08); until supplied, the roster reads pending.
- Assumption (labeled): signed copies, when kept, live in the client's approved private storage; the
  app stores only a reference.
- Synthetic illustration for tests only: co-tenants "Alex Example" and "Sam Example", owner
  "Example Owner LLC", PMI property manager as a separate signer role.

**Cross-product impacts.**

`lib/lease-renewal/workspace-state.ts`, `components/lease-renewal/RenewalManualWorkspace.tsx`,
`components/lease-renewal/DotloopPacketLinkPanel.tsx`, `components/lease-renewal/RenewalDocumentHandoff.tsx`,
`lib/lease-renewal/execution/normal-packet-action.ts`, `lib/lease-renewal/renewal-process.ts`,
`lib/lease-documents/packet-types.ts`, `lib/ai-boundary/dotloop-origin.ts`, `app/admin/page.tsx`,
`app/api/admin/lease-artifact-intake/route.ts`, `lib/lease-renewal/sheet-writeback/field-intent.ts`,
S237 basis, S238 evidence rows, the operator guide.

**Authority and evidence map.**

| Input                                                                           | Classification       | Use and limitation                                                                                      |
| ------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` (signing is a human Dotloop handoff; presence never proves signing) | Authority            | No signature API; staff records remain distinct from provider evidence.                                 |
| Committed code/tests at `a1c0fe8c`; Dotloop public API (S34 evidence map)       | Implementation truth | No returned state, metadata-only readback, unwritten evidence keys and constant checkpoint above.       |
| 2026-10-28 Clarify Features initialization (Obsidian inbox)                     | Intent evidence      | Who still must sign, exact version sent/returned, evidence qualification, partial/wrong-version safety. |
| Reviewed signer maps and real returns (C08, C11)                                | External dependency  | Hold only real records; fixtures prove behavior.                                                        |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S236-1** — A returned-state record keyed by lease, cycle, snapshot id and document content
  hash holds document-level sent status and signer-level entries with evidence, written through the
  existing app-owned staff-record path with actor/time audit. Fail-first: no such record exists.
- **ARCH-S236-2** — A projection joins reviewed signer maps, packet people/roles and returned-state
  records into per-document and overall business states and the who-still-must-sign list, and
  derives the `signatures` activity when a current snapshot exists. Fail-first: "Required signers" is
  a static list and the activity is free-standing.
- **ARCH-S236-3** — Provider metadata stays in its own store and view and never writes returned-state
  records. Fail-first check asserts no code path from loop/document readback to a signed state.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S236-1** — With a reviewed two-tenant map, recording one tenant's signature shows Partially
  signed and names the other tenant as still to sign.
- **BEH-S236-2** — Recording all required signers on all required documents of the current version
  shows Fully executed with "Recorded by staff — not provider-verified".
- **BEH-S236-3** — A signature recorded against a superseded version does not count and reads
  "Signed an earlier version — not current"; a record for another lease is refused.
- **BEH-S236-4** — "Refresh from Dotloop" updates only the "Dotloop shows" line.
- **BEH-S236-5** — Without an app packet, staff record "Required signatures complete" with source and
  date and see the without-signer-detail label.

**Human litmus outcome.**

### Staff can tell who still has to sign which document

**If this was built correctly:** Opening a renewal's documents, a staff member sees which version
went out, who has signed, who still must sign and in what role, and what each entry is based on.
When the last signature is recorded it says the packet is fully executed by staff record — not that
Dotloop confirmed it — and a signature on an older version does not count.

- Model verdict: NOT RUN — to be completed by the implementation runner with evidence.
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                             | Architecture outcome | Behavior outcome | Human litmus                                        | Deterministic evidence / falsification                                                                            |
| --------------------------------------- | -------------------- | ---------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| R-S236-1 signing roster per document    | ARCH-S236-2          | BEH-S236-1       | Staff can tell who still has to sign which document | Extend `tests/unit/s34-handoff-controls.test.tsx`: roster from map and roles; pending without a reviewed map.     |
| R-S236-2 staff-attested status          | ARCH-S236-1          | BEH-S236-2       | Staff can tell who still has to sign which document | New Firestore-emulator cases beside `tests/firestore/s66-packet-inputs-store.test.ts`: binding, audit, label.     |
| R-S236-3 states and who still must sign | ARCH-S236-2          | BEH-S236-1       | Staff can tell who still has to sign which document | Extend `tests/unit/s34-dotloop-packet-lifecycle.test.ts`: each business state from records; names and capacities. |
| R-S236-4 version and lease safety       | ARCH-S236-1          | BEH-S236-3       | Staff can tell who still has to sign which document | Emulator cases: superseded hash, other lease/cycle, terms change after signing.                                   |
| R-S236-5 provider metadata separate     | ARCH-S236-3          | BEH-S236-4       | Staff can tell who still has to sign which document | Extend `tests/unit/s182-dotloop-origin-stores.test.ts`: metadata never sets signed state or enters AI context.    |
| R-S236-6 manual completion reconciled   | ARCH-S236-2          | BEH-S236-5       | Staff can tell who still has to sign which document | Extend `tests/unit/s113-workspace-state.test.ts`: derived with snapshot; labeled manual without one.              |
| R-S236-7 checkpoint from records        | ARCH-S236-2          | BEH-S236-2       | Staff can tell who still has to sign which document | Extend `tests/unit/s130-intake-checkpoints-local.test.ts`: checkpoint follows reviewed records, not a constant.   |

**Preservation set.**

`tests/unit/s34-dotloop-packet-lifecycle.test.ts` (never claims a signature operation the provider
does not document), `tests/unit/s34-handoff-controls.test.tsx`, `tests/unit/s113-workspace-state.test.ts`
(manual completion and reopen), S98 `esign_complete` preview/confirmation, S182 exclusions, and the
canonical gate.

**Adversarial acceptance checks.**

- **AC-S236-1** — No combination of uploaded presence, loop status, document hash, staff report or
  Sheet value produces "Signed" or "Fully executed"; only signer-level records do (ARCH-S236-3,
  BEH-S236-4).
- **AC-S236-2** — Fully executed requires every required signer of every required document of the
  current snapshot; removing one record or superseding one document returns it to Partially signed
  (ARCH-S236-2, BEH-S236-1, BEH-S236-2).
- **AC-S236-3** — Records for a superseded hash, another lease or another cycle never count and are
  shown or refused as specified (ARCH-S236-1, BEH-S236-3).
- **AC-S236-4** — The manual path without an app packet still completes with its label, and an app
  packet's activity cannot be forced Done while a signer is missing (ARCH-S236-2, BEH-S236-5).
- **AC-S236-5** — Every signature-related string shown to staff distinguishes staff record from
  provider verification (preservation of the human-handoff boundary).

**Forbidden actions / hard gates.**

No signature request, send, reminder, upload, loop change or webhook; no signed document bytes or
customer names in Git; no inference of signing from metadata; no AI use of Dotloop API-origin data;
no protected-path or key change.

**Dependencies / sequencing.**

Consumes S235 snapshot identity, document versions and signer maps, S34 loop association, S113
manual activities and S182 exclusions. Produces executed-document status for S237's basis and S238's
evidence rows.

**Standalone delivery contract.**

- **Deliverable now:** R-S236-1 to R-S236-7 with tests and operator-guide wording.
- **Consumes, but does not assume:** reviewed signer maps (unset → pending roster); a current snapshot
  (unset → labeled manual path).
- **Externally blocked effect:** returned-state records for real November/December packets need
  reviewed signer maps (C08) and genuine signing in Dotloop under the owner's scope (C11) —
  `BLOCKED` until then.
- **Produces for downstream suites:** per-cycle executed-document status and who-still-must-sign.

**Verification and delivery contract.**

1. Before edits, record the current readback, the preservation baseline and each ARCH/BEH check
   failing for the stated reason.
2. Run the focused checks for every ARCH, BEH and AC row; keep preservation separate.
3. Run `bash scripts/verify.sh` and `npm run test:e2e:core`; audit secrets, PII, keys, runtime
   configuration and diff scope before any authorized delivery.
4. Report `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only under an explicit budget, or `BLOCKED` only for
   the named external input after all fail-closed work is green.

**Ordered prompt sequence.**

1. Re-verify current code and the handoff panels read-only.
2. Materialize the ARCH/BEH checks, litmus and preservation baseline; record fail-first results.
3. Build the record, projection, display, guards, metadata separation and manual reconciliation.
4. Falsify, run focused and canonical tests, update the operator guide, and ship only when
   authorized.

**Deletion/merge recommendation.**

Remove this suite when its checks are represented by code, tests and current facts; keep S34 and
S113 history unchanged.
