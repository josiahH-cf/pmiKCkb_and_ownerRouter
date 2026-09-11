<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-completion-v1 -->

# S34 — Dotloop renewal packet lifecycle

> Status: DEPLOYED in `f5faf1665121db9cacff913a57e7fdcc80513116` / `pmi-kc-app-rmtwdl4di-4439f17911f4`. Exact CI 34556917662 and S51/S54 candidate, promotion, observation and readback passed. Normal packet controls/readers, exact S21 bytes, S20 approval/execution and own-receipt recovery pass actual backend paths with deterministic external adapters. Real approved catalog/forms/mappings, credentials/connection/selection and separate exact-key activation remain gates. Both keys stay closed; provider presence is not signature or content-hash verification.

**Goal.**

An approved current renewal creates or reuses exactly one linked Dotloop loop from the selected
profile and template, shows and refreshes its state in the workspace, and hands the operator to
Dotloop for signature work the API cannot perform.

**Current state / intended end state.**

September 10 code reread and focused tests establish the following deployed foundation.
This is not live provider acceptance.

| Component                        | Present implementation                                                                                                               | Remaining work                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| OAuth, vault, resource selection | S106 connection/runtime/client and selection stores exist.                                                                           | Actual client credentials, managed consent, verified profile/template and live lifecycle readback.                                                                       |
| Loop and document provider       | Typed LiveDotloopProvider implements loop-it, property/participants, folder creation, upload and metadata reads.                     | Normal controls/resolvers and receipt recovery pass the 201-test backend suite; actual provider proof remains separately gated.                                          |
| Approved artifact bytes          | resolveApprovedDotloopArtifact resolves an exact active validated S21 publication and checks Space/version/hash/bytes before upload. | Populate approved catalog and participant/field mappings; email examples do not provide legal forms.                                                                     |
| Durable loop relationship        | Runtime records receipted loop id/URL/profile/template/snapshot identity in packet execution.                                        | Mounted continuation, exact file download and receipt recovery pass actual backend paths with deterministic provider adapters; live acceptance remains separately gated. |
| Signature execution              | Verified loop URL handoff and separate signed-artifact evidence contract.                                                            | Public API exposes no signature-send/status operation. Human execution in Dotloop remains required.                                                                      |
| Production readiness             | Both exact Dotloop write keys remain closed; client credentials absent from current local configuration.                             | Existing exact activation/release requirements and B-DL1/B-DL2/B-DL3, independent of S113 manual work.                                                                   |

Intended end state: a real packet assembled from approved forms, exact confirmed creation/upload,
a durable loop link with honest document-presence readback, and a usable signature/returned-artifact
handoff. S113 F5.1 is the dashboard continuation contract; S34 remains the provider owner.

The current normal path uses the existing selected configuration's recorded Admin for its approval
queue; another current Admin may review the Editor's immutable preparation under existing S20
rules. Its durable companion retains the exact response/readback receipt so a lost packet projection
can be rebuilt without a provider write. A preexisting matching loop name cannot establish creation
by this normal attempt; without its own receipt, an uncertain outcome remains unresolved. This
normal path passes actual backend acceptance and does not claim live provider causality.

The included file download/upload transports exact approved S21 publication bytes. The mapped field
preview does not fill those bytes. Applicable fields must be completed and reviewed by a person in
Dotloop before signature work. Approved blank forms and mappings remain actual external inputs; no
legal text, form field names or signature coordinates are inferred from the supplied email templates.

**Actors and entry conditions.**

A document coordinator or renewal operator (Editor or higher, Renewals Space) previews and confirms
loop creation for one lease whose S66 snapshot is `Ready for preview` and whose owner outcome is
`approved_terms`. Execution requires S106 readiness `connected` with selected profile and template,
the exact production-allowed keys `dotloop.loop.create_from_template` and `dotloop.document.upload`,
exact preview/confirmation, and the existing approval tier for High-risk effects.

**Provider contract (official Dotloop Public API v2, reread 2026-09-10).**

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

1. **Provider implementation.** Complete and wire the existing Dotloop provider module under the integrations library, which implements `DotloopProvider`
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

**September 10 feasibility and continuation.**

The official Public API v2 was reread at https://dotloop.github.io/public-api/. OAuth, template-based
loop creation, participant/property data, folder/document upload and metadata readback are supported.
No public signature-send/status operation or document-signature completion event was found. A webhook
HMAC signature authenticates a webhook and is not an electronic signature on a lease.

Prepare all agent-owned resolver/control/recovery work now against exact fixtures. Later availability
of credentials/forms resumes that work at its specific live gate; it does not start a new project.
A document listing proves presence/name/id, not uploaded-content equality or signed completion.
Preserve exact submitted-byte evidence separately and use approved returned signed artifacts for
completion. A matching loop name after an ambiguous create cannot by itself prove app causality or
grant another create; require honest recovery and explicit reviewed adoption of an independently
verified existing loop where the owning contract supports it.

Deployment with current public capabilities can deliver packet creation/upload and Open in Dotloop
for human signature work. Full signature automation is an external capability dependency. If Dotloop
later grants a documented private/public operation, inventory exact endpoint/scopes, recipient/send
effects, consent, status/returned artifacts, idempotency and correction behavior; add focused tests and
the exact reviewed action contract before activation. Do not guess an endpoint, automate the provider
UI, or switch provider to bypass the absent capability.

The owner deferred legal-form location collection to the S113 link-entry boxes. Implement those
controls and packet preparation without waiting for supplied locations. A saved URL is not approved
artifact bytes or a participant/field mapping; only actual creation/upload remains conditional.

Current external dependencies: B-DL1 approved client credentials; B-DL2 managed consent and verified
profile/template/type/status selection; B-DL3 approved forms and mappings for the seven catalog
families. Keep unknown applicability explicit instead of requiring every family for every lease.
The supplied assisted-housing correspondence adds an applicable manual follow-up; it supplies no
legal form or agency submission authority. Exact activation patches remain governed by AGENTS.md.
Existing standing deployment authority applies after exact-key and release gates pass.

**In scope / out of scope.**

In scope: provider, executor wiring, loop link, readback, refresh, optional webhook readback, handoff
copy, and fakes. Out of scope: legal content, broad Dotloop administration, requiring webhooks, or
any signature API.

**Open questions & assumptions.**

The owner requested preparation and deployment of the feasible document end state on September 10.
S113 F5.1 records the exact current capability split and conditional continuation. Credentials and
forms remain external; normal mounted controls and source resolvers remain agent-owned.

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
  normal action uses its durable response/readback receipt and creates no second one; a mismatched template, an empty
  participant list, or a participant without a verified email blocks before any provider call; the
  loop reads back and an archived loop reads inactive; the stored link is reused for the same packet
  snapshot hash without touching the provider and marked superseded for a different hash; and the
  signature handoff shows the exact loop URL and required signers while claiming no signature state.
  The document upload resolves exact approved S21 bytes and refuses missing catalog/content. Live
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
- **AC-S34-4** — `ARCH-S34-1`: normal recovery uses the exact action's durable response/readback
  receipt without another create. A matching loop name cannot establish provider causality; an uncertain
  attempt without its own receipt remains unresolved. Legacy adapter fixtures are not normal-path proof.

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
