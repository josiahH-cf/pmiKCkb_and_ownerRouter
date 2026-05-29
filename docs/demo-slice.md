# Simplest Viable Demo Slice

The first working demo slice is **Lease Renewals**. The goal is to prove one real
workflow end-to-end before broadening to all 12 launch Spaces.

## Demo Goal

Show that a signed-in user can ask a renewal question, see a cited source-backed answer,
browse/edit the Lease Renewals Space, and move a change through a minimal review path.

## Real In The First Slice

- Google sign-in/session enforcement when Firebase config exists.
- Lease Renewals Space detail page.
- SOP, template, tool, and placeholder records through the existing API routes.
- One source-backed Ask answer with citations in local mock mode.
- One cheap live Ask path for Lease Renewals using Cloud Storage `.txt` sources and
  Agent Search data store `kb-lease-renewals-txt`, including one sanitized
  transcript-derived call-notes source.
- One no-source Ask answer for unsupported questions.
- Change-log creation for editable records.
- Approval/resolve permission checks.

## Scaffolded In The First Slice

- Other Spaces remain listed but do not need full detail workflows.
- Owner Email remains read-only and not fully verifiable until the separate Owner Router
  folder exists.
- The current live Ask corpus includes a sanitized transcript-derived Lease Renewals
  source, but that source remains review-required until Bailey/Dan approve final SOP
  wording.
- Gmail `KB Approval` notifications remain deferred until the Approval Queue is backed
  by real review records.

## Seed Records

The demo seed should create:

- Space: `lease-renewals`.
- SOP: `Lease Renewals Demo SOP`, status `In Review` or `Approved` depending on actor.
- Template: `Owner Renewal Follow-Up`, channel `Gmail`, audience `Owner`.
- Tool: `RentVine`, integration status `Link only`.
- Placeholder: one open renewal timing or approval-detail gap.

The seed data must be safe demo content. Do not include real tenant, owner, lease,
ledger, bank, screening, or confidential client records.

## Demo Questions

Use these local/demo checks for a stable show-and-tell:

- "What is the lease renewal workflow?" returns `Verified Source` with a demo citation.
- "What owner renewal follow-up should I send?" returns `Verified Source` with a draft
  banner.
- "What exact fee do we charge for an unusual lease break?" returns
  `No Reliable Source Found`.
- Prompt-injection variants still return source-limited answers or no-source results.

Use live Ask questions that show real PMI KC workflow pain from the imported
transcript-derived Lease Renewals source:

- "When do we contact the owner versus the tenant during a renewal?"
- "What sources does the team check before emailing an owner about renewal pricing?"
- "What happens after a tenant agrees to renew?"
- "Why should a renewal answer create a placeholder instead of guessing?"

## Next Demo Slices To Consider

The next strongest transcript-backed demo candidates are:

- Maintenance Work Order Intake: good for showing that the KB can explain intake and
  escalation while refusing to choose a vendor.
- Move-Out + Deposit Disposition: good for showing deadline-sensitive handoff and
  placeholder behavior around legal/financial details.
- Owner Onboarding: good for showing checklist-driven setup and missing-detail capture
  before Rentvine records are complete.

First-pass source templates live in `docs/demo-source-templates/`. Do not import them
into live Ask until each Space has its own source target, data store, and cost check.

## Done For This Slice

- `bash scripts/verify.sh` passes.
- `npm run test:firestore` passes when Java is available.
- Local browser smoke shows sign-in page, Ask, Spaces, Lease Renewals detail, and
  Approval Queue without runtime errors.
- No live Google credentials are required for mock demo mode. Live Ask smoke requires
  `ASK_DEMO_MODE=false`, the Cloud Storage source prefix, and the Agent Search data
  store ID.
