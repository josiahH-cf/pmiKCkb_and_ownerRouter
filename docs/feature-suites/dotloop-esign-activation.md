<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-completion-v1 -->

# S34 — Dotloop renewal packet lifecycle

> Status: IMPLEMENTED / UNRELEASED for the closed slice. `LiveDotloopProvider` implements the typed
> seam over the S106 client, loop identity is bound to the packet snapshot hash, the loop link rides
> on the packet execution projection, and the workspace shows the link with an explicit signature
> handoff. Live loop creation stays BLOCKED on the owner's OAuth application, connected account,
> approved artifact content source, and key activation; both Dotloop keys remain closed.

**Goal.**

An approved current renewal creates or reuses exactly one linked Dotloop loop from the selected
profile and template, shows and refreshes its state in the workspace, and hands the operator to
Dotloop for signature work the API cannot perform.

**Current state / intended end state.**

| Package requirement (PMI-06)                      | Classification    | Evidence                                                                                                                                                                                                                                                         |
| ------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create only from an approved current proposal     | Already satisfied | `bindCurrentPacketForDotloop` refuses stale or incomplete S66 snapshots (`lib/lease-documents/dotloop-packet-binding.ts`)                                                                                                                                        |
| Selected profile and template                     | Missing           | Delivered by S106 selection record                                                                                                                                                                                                                               |
| Populate property, participants, terms, documents | Partially         | `LiveDotloopProvider` creates the loop from the selected template, patches `Property Address`, adds documented-role participants, and creates the packet folder; the document upload refuses without the approved artifact content source rather than pretending |
| Store loop id and URL on the owning record        | Partially         | `recordPacketExecutionProjection` exists (`lib/firestore/lease-document-packet-snapshots.ts`); no loop fields                                                                                                                                                    |
| Repeat creates no second loop                     | Partially         | One-attempt claim pattern exists for S97/S98; Dotloop has no idempotency key                                                                                                                                                                                     |
| Material change makes the relationship explicit   | Already satisfied | Packet snapshot hash and `Superseded` state (S66)                                                                                                                                                                                                                |
| Readback and status link                          | Missing           | No client                                                                                                                                                                                                                                                        |
| Webhooks optional                                 | Missing           | Subscription probe from S106                                                                                                                                                                                                                                     |
| Signature handoff, never assumed complete         | Partially         | `lib/lease-renewal/dotloop-followup-draft.ts` drafts a chase note; no loop link                                                                                                                                                                                  |
| Provider errors and missing data as blockers      | Already satisfied | `PacketBlocker` and `Failed`/`Partially executed` states                                                                                                                                                                                                         |

Intended end state: a concrete `DotloopProvider` over the official API, one durable loop link per
packet snapshot hash, readback-driven status, and an explicit signature handoff.

**Actors and entry conditions.**

A document coordinator or renewal operator (Editor or higher, Renewals Space) previews and confirms
loop creation for one lease whose S66 snapshot is `Ready for preview` and whose owner outcome is
`approved_terms`. Execution requires S106 readiness `connected` with selected profile and template,
the exact production-allowed keys `dotloop.loop.create_from_template` and `dotloop.document.upload`,
exact preview/confirmation, and the existing approval tier for High-risk effects.

**Provider contract (official Dotloop Public API v2, read 2026-09-03).**

- `POST /profile/{profile_id}/loop` body `name` (≤200 chars), `status`, `transactionType`; or
  `POST /loop-it?profile_id=` with address fields, `participants[]` (`fullName`, `email`, `role`),
  and `templateId`. Response carries `id` and `loopUrl`.
- `PATCH /profile/{profile_id}/loop/{loop_id}/detail` sections such as `Property Address` and
  `Contract Dates`; `GET/POST/PATCH/DELETE .../participant`; `GET/POST .../folder`;
  `POST .../folder/{folder_id}/document/` multipart upload; `GET .../loop/{loop_id}` readback.
- Participant roles include `TENANT`, `LANDLORD`, `PROPERTY_MANAGER`, `ADMIN`, `OTHER`. Lease
  transaction types are `LISTING_FOR_LEASE` and `LEASE_OFFER` with documented status sets.
- Webhook subscriptions (`POST /subscription`, event types `LOOP_CREATED`, `LOOP_UPDATED`,
  `LOOP_PARTICIPANT_*`) are optional. No document-level event and no signature status is documented.

**What it is / how it functions.**

1. **Provider implementation.** A new Dotloop provider module under the integrations library implements `DotloopProvider`
   over the S106 client: `createLoop` uses the selected template with an app-chosen loop name that
   embeds the packet snapshot id (the provider-observable identity for reconciliation), sets
   `transactionType` and initial `status` from the selection record (owner-selected from the
   documented enumeration, never hard-coded), adds participants from the packet snapshot's
   tenant/owner participants with documented roles, patches `Property Address`, creates the packet
   folder, and uploads each packet artifact from Drive. `readLoop` and `readDocument` map the
   official responses; `reconcile` lists the profile's loops by batch and matches the exact name.
2. **Lifecycle.** Reuse the existing external-execution preview/confirm/claim/receipt/readback path
   through `DotloopRenewalExecutor`. The loop link (`loopId`, `loopUrl`, `profileId`,
   `templateId`, `packetSnapshotHash`) is recorded with `recordPacketExecutionProjection`. A repeat
   for the same snapshot hash returns the existing link; a new snapshot hash marks the prior loop
   `Superseded` and requires a new confirmation for a replacement loop.
3. **Status.** The workspace `document-packet` and `signatures-follow-up` phases show the loop link,
   last readback time, loop status, participant count, document count, and a `Refresh from Dotloop`
   control; when webhooks are available, `LOOP_UPDATED` events only schedule a readback.
4. **Signature handoff.** Because the API exposes no signature operation, the phase shows `Open in
Dotloop to send for signature` with the exact loop URL and the required signers; signature
   completion is recorded only from the existing S72 signed-artifact evidence path, never inferred.

**Observed limitation (recorded, not worked around).**

`uploadDocument` refuses with an exact reason until an approved artifact content source is injected:
the S66 binding supplies a document reference and content hash, not the artifact bytes, and this
provider transports approved content rather than inventing it. The documented multipart upload and
its folder readback are implemented and proved against the fake through an injected content reader,
so wiring the real source is the only remaining step for that one operation.

**In scope / out of scope.**

In scope: provider, executor wiring, loop link, readback, refresh, optional webhook readback, handoff
copy, and fakes. Out of scope: legal content, broad Dotloop administration, requiring webhooks, or
any signature API.

**Open questions & assumptions.**

The owner selects transaction type and initial status during S106 selection; the approved S66
artifact catalog remains the document source. Both are external inputs, not assumptions.

**Cross-product impacts.**

Packet snapshots and execution projections, external execution claims and receipts, action
registry (`production_allowed` flips are protected-path changes surfaced for owner direction), S72
phases, S107 continuation, S111 proof.

**Authority and evidence map.**

| Input                                                                | Classification                   | Use and limitation                                                                        |
| -------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------- |
| `AGENTS.md` effect model, S66, S72, execution providers, S97 pattern | Authority / implementation truth | Exact preview/confirm/claim/receipt/readback; protected activation; no autonomous effect. |
| Official Dotloop Public API v2                                       | Provider contract                | Endpoints, bodies, roles, statuses; no signature API.                                     |
| Owner package PMI-06                                                 | Intent evidence                  | One loop per renewal, visible state, explicit handoff.                                    |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S34-1** — One provider implementation behind the existing `DotloopProvider` interface; the
  executor fixture that expects a loop link after confirmation fails today.
- **ARCH-S34-2** — Loop identity is bound to the packet snapshot hash; a second create for the same
  hash returns the stored link without a provider call.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S34-1** — One approved renewal yields one loop with the selected profile/template, expected
  participants, address, folder, and documents through the fake.
- **BEH-S34-2** — Missing template, participant email, property address, or connection blocks
  creation with the exact next action.
- **BEH-S34-3** — Readback updates the workspace state; webhook and polling modes converge to the
  same state; signature work is never marked complete without artifact evidence.

**Human litmus outcome.**

### The renewal packet appears in Dotloop once

**If this was built correctly:** After approval the operator previews and confirms the packet. One
loop appears in Dotloop with the right people and documents, the workspace shows its link and status,
and repeating the action does not create another loop. The workspace tells the operator to open
Dotloop to send for signatures.

- Model verdict: PASS for the closed slice - why: one approved packet creates exactly one loop from
  the selected profile and template with the documented transaction type, initial status,
  documented-role participants, and the property address section; a repeat of the same confirmed
  action finds the loop by its exact name and creates no second one; a mismatched template, an empty
  participant list, or a participant without a verified email blocks before any provider call; the
  loop reads back and an archived loop reads inactive; the stored link is reused for the same packet
  snapshot hash without touching the provider and marked superseded for a different hash; and the
  signature handoff shows the exact loop URL and required signers while claiming no signature state.
  The document upload refuses outright until the approved artifact content source is wired. Live
  creation is BLOCKED on the owner's OAuth application, connected account, and key activation.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                       | Architecture outcome       | Behavior outcome | Human litmus                               | Deterministic evidence / falsification        |
| --------------------------------- | -------------------------- | ---------------- | ------------------------------------------ | --------------------------------------------- |
| DLPKT-01, DLPKT-02 one loop       | `ARCH-S34-1`, `ARCH-S34-2` | `BEH-S34-1`      | The renewal packet appears in Dotloop once | Create and repeat fixtures                    |
| DLPKT-03 link and refresh         | `ARCH-S34-1`               | `BEH-S34-3`      | The renewal packet appears in Dotloop once | Readback fixture                              |
| DLPKT-04, DLPKT-05 blockers/stale | `ARCH-S34-2`               | `BEH-S34-2`      | The renewal packet appears in Dotloop once | Missing-data and superseded-snapshot fixtures |
| DLPKT-06, DLPKT-07 handoff/modes  | `ARCH-S34-1`               | `BEH-S34-3`      | The renewal packet appears in Dotloop once | Handoff copy and webhook/polling parity       |

**Preservation set.**

`tests/unit/dotloop-renewal-executor.test.ts`, `s66-dotloop-packet-binding.test.ts`,
`s66-packet-truth-boundary.test.ts`, `dotloop-followup-draft.test.ts`, and `lease-execution-matrix.test.ts`
stay green.

**Adversarial acceptance checks.**

- **AC-S34-1** — `ARCH-S34-2`: an incomplete or stale S66 snapshot cannot create a provider request.
- **AC-S34-2** — `BEH-S34-1`: one confirmed request is claimed once, read back, and receipted before
  completion is claimed.
- **AC-S34-3** — `BEH-S34-3`: no guessed legal copy, participant, signature placement, template, or
  webhook authentication is accepted, and signature completion is never inferred.
- **AC-S34-4** — `ARCH-S34-1`: a lost create response reconciles by exact loop name without a second
  create.

**Forbidden actions / hard gates.**

No UI/RPA automation, no invented signature endpoint, no unsigned legal content, no autonomous
execution, and no `production_allowed` flip without owner direction and a passed bounded proof.

**Dependencies / sequencing.**

Requires S106 readiness and the S66 catalog; consumed by S105, S107, and S111.

**Standalone delivery contract.**

- **Deliverable now:** provider, executor wiring, loop link, readback, refresh, handoff, fakes.
- **Consumes, but does not assume:** S106 connection and selection; absent readiness is the
  `document-packet` blocker.
- **Externally blocked effect:** live loop creation until the OAuth app, connected account, approved
  catalog, and key activation exist; recorded as `BLOCKED` for the live proof only.
- **Produces for downstream suites:** loop link, packet execution state, handoff state.

**Verification and delivery contract.**

1. Freeze the create, repeat, blocker, readback, and handoff fixtures failing for the expected
   reason.
2. Run focused provider, executor, snapshot, and workspace checks.
3. Run `bash scripts/verify.sh` and `npm run test:e2e:core`; audit action gates and secrets.
4. Report `ALL_GATES_GREEN` for the closed slice; `BLOCKED` names only the live proof inputs;
   `BUDGET_EXHAUSTED` only with an explicit budget.

**Ordered prompt sequence.**

1. Re-verify the S66 binding and executor seam.
2. Materialize the fail-first provider and lifecycle fixtures.
3. Implement the provider, link, readback, and handoff.
4. Run focused and canonical checks; record the live limitation; update current docs.

**Deletion/merge recommendation.**

Keep until one live packet creation, readback, and correction proof completes.
