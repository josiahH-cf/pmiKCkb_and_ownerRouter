<!-- spec-shape: overhaul-v1 -->

# S38 - Maintenance owner-notice: governed Gmail draft

> Status (amended 2026-07-29 by owner decision D33): BUILT. The route, service, authoritative
> recipient resolution, and per-ticket control create an unsent Gmail draft. That draft plus a human
> sending from Gmail is the final client-facing workflow. The former direct-send seam and owner flip
> are retired; `gmail.maintenance_owner_notice.send` stays closed.

**Goal.** An operator opens a persisted maintenance ticket, resolves the property owner from the
authoritative RentVine mapping, previews the notice, and creates a real UNSENT Gmail draft that a
human reviews and sends from Gmail, mirroring the renewal-notice flow. The app does not expose or
build toward a direct owner-notice send. D33 records draft-into-Gmail plus a human Gmail send as the
end state, not an interim seam.

**What it is / how it functions.**

- **Draft composer - components/maintenance/MaintenanceOwnerNoticeDraftComposer.tsx (new).** A per-ticket control that mirrors `components/lease-renewal/RenewalNoticeDraftComposer.tsx`: a two-step Preview then "Create Gmail draft" flow. The recipient and property facts come from the server (never the form); the operator only confirms. A blocked result lists the exact reasons (unverified owner recipient, unmatched unit) and never invents a recipient.
- **Ticket surface - components/maintenance/MaintenanceQueue.tsx.** The composer is surfaced on the persisted ticket (edit-gated, exactly like the existing per-ticket assignee picker), because the draft binds `ticket_ref === workflowId` and therefore needs a real created ticket, not the pre-persist capture buffer. The existing read-only `buildOwnerNoticeDraft` preview at `components/maintenance/MaintenanceCapture.tsx:161` stays as a pre-persist informational preview; it is not the reachable draft action.
- **Draft-create route - app/api/maintenance/owner-notice-draft/route.ts (new).** POST mirroring `app/api/lease-renewal/renewal-notice-draft/route.ts`: `requireCapabilityInSpace("edit", "maintenance")`, a strict zod body `{ ticketRef, confirm }`, build the live RentVine config, load the persisted ticket, resolve the owner recipient, compose via `buildOwnerNoticeDraft`, and either return the preview (`confirm:false`) or create a real unsent Gmail draft (`confirm:true`). Returns the same `{status:"blocked"|"preview"|"created"}` shape as the renewal route.
- **Route-facing service - lib/maintenance/execution/owner-notice-draft-service.ts (new).** Mirrors `lib/lease-renewal/execution/renewal-notice-draft-service.ts`: dependencies `loadTicket`, `resolveOwner`, and `createGmailClient` are injected so the logic is unit-tested without RentVine or Gmail. It re-asserts the `gmail.maintenance_owner_notice.draft_create` production gate and the authoritative-recipient guard before any draft is created, and it never sends.
- **Owner recipient resolution - lib/lease-renewal/live-owner-recipient.ts (extend) + lib/maintenance/owner-notice-draft.ts (reuse).** The unit index recovers the ticket unit's live RentVine `propertyId` from `/leases/export`. `resolveOwnerContactFromPropertyId` then runs the implemented read-only tail: `getProperty(propertyId) -> getPortfolio(portfolioId) -> greatest positive percentOwned contact -> getContact(contactId).email`. There is no `getUnit` hop and no direct `portfolio.owners[].email` read in this route. A missing hop, invalid email, or tie for greatest ownership returns null, so the draft blocks with a visible `Needs Verification: owner name/contact` marker (the marker `buildOwnerNoticeDraft` already emits), never a guessed address. `F-MAINT-OWNER-DRAFT-LIVE` remains historical mapping evidence; `F-MAINT-OWNER-DRAFT-REACHABLE` records the implemented resolver.
- **Draft transport - lib/gmail-runtime/client.ts + lib/lease-renewal/execution/live-gmail-draft-provider.ts.** Reuses the proven Gmail DWD draft grant already used by the renewal draft. The output is an unsent draft id; code never calls send in the S38a path.

- **Built app-plane end state.** The composer, ticket-surface button, draft-create route,
  route-facing service, and owner-recipient resolver are shipped. All behavior is draft-into-Gmail
  only, with no new external scope, behind the open
  `gmail.maintenance_owner_notice.draft_create` gate. Sample or Test tickets, and any ticket whose
  owner does not resolve authoritatively, yield a preview or a blocked result only, never a real
  draft.
- **No direct-send seam.** `gmail.maintenance_owner_notice.send` is explicitly not granted by D33
  and stays `production_allowed:false`, absent from both executable allowlists, and unreachable from
  a production route or control. The existing `MaintenanceOwnerEmailExecutor` is inactive
  historical contract evidence, not an S38 activation target.
- **Owner dependency.** None for a direct maintenance send. The former owner-mapping evidence remains
  useful to resolve the draft recipient safely; it does not authorize a gate flip. A future change
  would require a new explicit owner decision that supersedes D33.

**Open questions & assumptions.**

- _Verified by the shipped S38 path:_ the maintenance ticket's `unit.unitId` resolves through the
  cached `/leases/export` unit index to a live `propertyId`; the resolver then calls
  `getProperty -> getPortfolio -> greatest positive percentOwned contact -> getContact.email`. A
  missing property/portfolio/contact/email, non-positive ownership set, or top-ownership tie blocks
  the draft with `Needs Verification: owner name/contact` rather than guessing.
- _Assumption:_ the draft-create action surfaces on the persisted ticket (MaintenanceQueue), not the pre-persist capture buffer, because the executor binds `ticket_ref === workflowId`. The pre-persist `buildOwnerNoticeDraft` preview in MaintenanceCapture is informational only and is left in place.
- _Assumption:_ the built draft path reuses the existing Gmail DWD draft grant and needs no new
  scope.
- _Answered 2026-07-29 (D33):_ draft-into-Gmail with a human sending from Gmail is the final
  maintenance owner-notice workflow. There is no open direct-send artifact or flip.

**Cross-product impacts.**

- Mirrors and reuses the renewal wiring: `app/api/lease-renewal/renewal-notice-draft/route.ts`, `lib/lease-renewal/execution/renewal-notice-draft-service.ts`, `components/lease-renewal/RenewalNoticeDraftComposer.tsx`, `lib/lease-renewal/execution/live-gmail-draft-provider.ts`, and `lib/gmail-runtime/client.ts`.
- Touches maintenance code paths: `components/maintenance/MaintenanceCapture.tsx`, `components/maintenance/MaintenanceQueue.tsx`, `app/maintenance/page.tsx`, `lib/maintenance/owner-notice-draft.ts`, `lib/maintenance/execution/providers.ts`.
- Registry and governance: `lib/integrations/action-registry-seed.ts` (the open
  `gmail.maintenance_owner_notice.draft_create` entry and deliberately closed `...send` entry),
  `lib/admin/migration-readiness.ts`, `scripts/seed-action-registry.ts`.
- Recipient resolution: `lib/lease-renewal/live-owner-recipient.ts`, `lib/lease-renewal/recipient-resolution.ts`.
- Facts: builds directly on `F-MAINT-OWNER-DRAFT-LIVE` and is completed by
  `F-MAINT-OWNER-DRAFT-REACHABLE`. D33 supersedes the former S38 direct-send-seam target. This suite
  does not reopen S26 (`docs/feature-suites/maintenance-execution.md`) or make its inactive send
  executor reachable.

**Adversarial acceptance checks.**

- **AC-S38-1** - POST `/api/maintenance/owner-notice-draft` with `confirm:false` for a persisted ticket whose owner resolves authoritatively returns HTTP 200 with `{status:"preview"}`, a server-resolved recipient the form never supplied, and a body containing the review-before-sending banner; no Gmail send occurs. _Verify:_ `npm test -- tests/unit/maintenance-owner-notice-draft.test.ts`; keep `tests/unit/action-registry-schema.test.ts` green.
- **AC-S38-2** - A ticket with no authoritative owner email (or a sample/test ticket) returns `{status:"blocked", reasons:[...]}` naming the missing owner fact, and never returns `preview` or `created` with an invented recipient. _Verify:_ `npm test -- tests/unit/maintenance-owner-notice-draft.test.ts`.
- **AC-S38-3** - POST with `confirm:true` on a resolving ticket creates an UNSENT Gmail draft (a `draftId` is returned) through the injected Gmail client, the service re-asserts the `gmail.maintenance_owner_notice.draft_create` gate, and the send path is never invoked. _Verify:_ `npm test -- tests/unit/maintenance-owner-notice-draft.test.ts` (assert the injected client's send is never called).
- **AC-S38-4** - The per-ticket "Owner notice: draft" control renders on the MaintenanceQueue ticket for an edit-capable user and is absent for a read-only user; Preview then Create post to `/api/maintenance/owner-notice-draft`. _Verify:_ `npm test -- tests/unit/maintenance-owner-notice-composer.test.tsx`.
- **AC-S38-5** - `gmail.maintenance_owner_notice.send`,
  `gmail.renewal_notice.send`, and generic `gmail.message.send` remain
  `production_allowed:false`; the maintenance send key is absent from both executable allowlists,
  and no S38 gate-flip step exists. _Verify:_
  `npm test -- tests/unit/action-registry-schema.test.ts tests/unit/seed-action-registry-allowlist.test.ts tests/unit/migration-readiness.test.ts`.
- **AC-S38-6** - The reachable route and service invoke the createDraft-only provider and never the
  inactive `MaintenanceOwnerEmailExecutor`; confirming the S38 control returns an unsent draft
  receipt, never a sent-message receipt. _Verify:_
  `npm test -- tests/unit/maintenance-owner-notice-draft.test.ts`.
- **AC-S38-8** - This spec keeps the spec-shape and traceability gates green (every required section present, one `AC-` id, a README row, unique S38-numbered ids). _Verify:_ `npm test -- tests/unit/feature-suite-spec-shape.test.mjs`; `npm run verify:spec-traceability`.

**Forbidden actions / hard gates.** Draft-into-Gmail is the final S38 app effect: the route and
composer create unsent Gmail drafts and never call send. A human reviews and sends from Gmail.
`gmail.maintenance_owner_notice.send`, `gmail.renewal_notice.send`, and generic
`gmail.message.send` stay Registry-closed; S38 adds no direct-send route, control, provider wiring,
or prepared gate flip. Internal-staff notifications may auto-send per `D-AUTOMATION-LINE`, but an
owner is not staff. The owner recipient always resolves from the authoritative property-anchored
RentVine mapping
(`getProperty -> getPortfolio -> greatest positive percentOwned contact -> getContact.email`), never
guessed; an unresolved or tied owner blocks with a visible `Needs Verification` marker. The
personal `josiah.abernathy@gmail.com` account never enters any auth path. No secrets, customer PII, or
guessed provider endpoints in git or evidence. The verified non-null S52 production cost ceiling
applies; if it is unset, cost-bearing/live/cloud work is closed while local/app-plane work continues.
Every live effect stays target-labeled, one-attempt, idempotent, receipted, reconcilable, monitored,
and reversible. Routine release follows D05: after the full local gate, auth and budget preflights,
prior-revision capture, and a captured rollback command are green, the runner may deploy; it must
smoke the new revision successfully before promoting traffic. Interactive authentication,
credentials/scopes, IAM, billing/quota, provider inputs, and destructive operations remain owner-run.
Suite-specific hard stop: the draft body must be composed by `buildOwnerNoticeDraft`
from ticket facts; no free-typed owner body bypasses the source-tagged, `Needs Verification`-marking
composer.

**Ordered prompt sequence.**

1. _Discovery:_ re-read the renewal wiring (`app/api/lease-renewal/renewal-notice-draft/route.ts`, `lib/lease-renewal/execution/renewal-notice-draft-service.ts`, `components/lease-renewal/RenewalNoticeDraftComposer.tsx`) and the maintenance pieces (`lib/maintenance/owner-notice-draft.ts`, `lib/maintenance/execution/providers.ts:493`, `components/maintenance/MaintenanceQueue.tsx`).
2. _Understanding:_ confirm the executor binding contract (`ticket_ref === workflowId`, `template_ref === "maintenance-owner:v1.0"`, `recipient_source_ref`, `mailbox_source_ref`) and the implemented property-anchored resolution in `F-MAINT-OWNER-DRAFT-REACHABLE`.
3. _Build:_ recover the live `propertyId` for the ticket's `unit.unitId` from the `/leases/export`
   unit index, then use `resolveOwnerContactFromPropertyId`; return null on any missing hop, invalid
   email, non-positive ownership set, or greatest-ownership tie.
4. _Build:_ add `lib/maintenance/execution/owner-notice-draft-service.ts` (inject `loadTicket`, `resolveOwner`, `createGmailClient`; preview then confirm; re-assert the draft-create gate; never send).
5. _Build:_ add `app/api/maintenance/owner-notice-draft/route.ts` (edit-in-maintenance capability, strict zod body, live RentVine config, blocked/preview/created outcomes).
6. _Build:_ add `components/maintenance/MaintenanceOwnerNoticeDraftComposer.tsx` and surface it per-ticket in `MaintenanceQueue` (edit-gated); leave the MaintenanceCapture preview informational.
7. _Verify:_ prove AC-S38-1..6 and AC-S38-8 (route + service + composer tests, closed-send
   assertions, spec shape, and traceability).
8. _Gate:_ keep the maintenance, renewal, and generic client-send keys closed. Do not prepare or
   request a direct-send flip under S38.
9. _Context update:_ maintain `F-MAINT-OWNER-DRAFT-REACHABLE` as the completed product fact and
   record D33's retirement of the former direct-send target in the Supersede Log.

**Deletion/merge recommendation.** KEEP. This is the standing S38 product contract for the
maintenance owner-notice draft workflow and is referenced by the README table and the AGENTS.md Route
Table. Do not MERGE into `docs/feature-suites/maintenance-execution.md` (S26): S38 owns the
app-plane draft reachability, while S26's inactive send executor is not an activation target under
D33.
