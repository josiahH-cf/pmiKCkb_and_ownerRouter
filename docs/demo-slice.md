# Approved Workflow Demo Slices

The first working demo slice was **Lease Renewals**. The local show-and-tell demo now
has four approved workflow slices: Lease Renewals, Maintenance Work Order Intake,
Move-Out + Deposit Disposition, and Owner Onboarding. The goal is still to prove real
workflow handoff patterns before broadening to all 12 launch Spaces.

## Demo Goal

Show that a signed-in user can ask workflow questions, see cited source-backed answers,
browse/edit approved demo Spaces, and move changes through a minimal review path.

## Real In The Current Demo Slices

- Google sign-in/session enforcement when Firebase config exists.
- Space detail pages for Lease Renewals, Maintenance Work Order Intake, Move-Out +
  Deposit Disposition, and Owner Onboarding.
- SOP, template, tool, and placeholder records through the existing API routes.
- Four source-backed Ask answers with citations in local mock mode.
- Four cheap live Ask paths using Cloud Storage `.txt` sources and Agent Search data
  stores:
  `kb-lease-renewals-txt`, `kb-maintenance-work-order-intake-txt`,
  `kb-move-out-deposit-disposition-txt`, and `kb-owner-onboarding-txt`.
- One no-source Ask answer for unsupported questions.
- Change-log creation for editable records.
- Approval/resolve permission checks.

## Scaffolded Outside The Demo Slices

- Other launch Spaces remain listed but do not need full detail workflows yet.
- Owner Email remains read-only and not fully verifiable until the Gmail Inbox 0 source
  package and owner-email indexing approach are approved. Legacy Owner Router artifacts
  may be reused as source material.
- The current live Ask demo corpus includes all four approved demo workflows in the
  demo project.
- Gmail `KB Approval` notifications remain deferred until the Approval Queue is backed
  by real review records.

## Seed Records

The demo seed should create:

- Spaces: `lease-renewals`, `maintenance-work-order-intake`,
  `move-out-deposit-disposition`, and `owner-onboarding`.
- One SOP, one template, and one open placeholder for each approved demo Space.
- Link-only tools for RentVine, DotLoop, Google Sheets, and Google Chat.

The seed data must be safe demo content. Do not include real tenant, owner, lease,
ledger, bank, screening, or confidential client records.

## Demo Questions

Use these local/demo checks for a stable show-and-tell:

- "What is the lease renewal workflow?" returns `Verified Source` with a demo citation.
- "What should the team check when a maintenance request comes in?" returns
  `Verified Source` with a demo citation.
- "What has to happen after a tenant gives move-out notice?" returns `Verified Source`
  with a demo citation.
- "What details does the team track during owner onboarding?" returns `Verified Source`
  with a demo citation.
- "What exact fee do we charge for an unusual lease break?" returns
  `No Reliable Source Found`.
- Prompt-injection variants still return source-limited answers or no-source results.

Use live Ask questions that show real PMI KC workflow pain from the imported approved
sanitized sources:

- "When do we contact the owner versus the tenant during a renewal?"
- "How should maintenance intake handle missing photos and vendor assignment?"
- "How should move-out handling track inspections, vendor bids, and deposit-sensitive
  decisions?"
- "What owner onboarding checklist details must be confirmed before a property is
  ready?"

## Beyond The Current Demo

The strongest non-Lease workflow candidates are now part of the local and live demo:

- Maintenance Work Order Intake: good for showing that the KB can explain intake and
  escalation while refusing to choose a vendor.
- Move-Out + Deposit Disposition: good for showing deadline-sensitive handoff and
  placeholder behavior around legal/financial details.
- Owner Onboarding: good for showing checklist-driven setup and missing-detail capture
  before Rentvine records are complete.

Approved sanitized source templates live in `docs/demo-source-templates/`. Do not
import additional launch-Space sources into live Ask until each Space has its own source
target, data store, source metadata, and cost check.

## Done For This Slice

- `bash scripts/verify.sh` passes.
- `npm run test:firestore` passes when Java is available.
- Local browser smoke shows sign-in page, Ask, Spaces, four approved demo Space detail
  pages, and Approval Queue without runtime errors.
- No live Google credentials are required for mock demo mode. Live Ask smoke requires
  `ASK_DEMO_MODE=false`, Cloud Storage source prefixes, Agent Search data store IDs,
  and source metadata for the configured Spaces.
