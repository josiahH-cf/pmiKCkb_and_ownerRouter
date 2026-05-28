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
- One no-source Ask answer for unsupported questions.
- Change-log creation for editable records.
- Approval/resolve permission checks.

## Scaffolded In The First Slice

- Other Spaces remain listed but do not need full detail workflows.
- Owner Email remains read-only and not fully verifiable until the separate Owner Router
  folder exists.
- Vertex AI Search and Gemini adapters can remain behind interfaces until live Google
  setup is complete.
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

Use these local/mock checks until Vertex AI Search is live:

- "What is the lease renewal workflow?" returns `Verified Source` with a demo citation.
- "What owner renewal follow-up should I send?" returns `Verified Source` with a draft
  banner.
- "What exact fee do we charge for an unusual lease break?" returns
  `No Reliable Source Found`.
- Prompt-injection variants still return source-limited answers or no-source results.

## Done For This Slice

- `bash scripts/verify.sh` passes.
- `npm run test:firestore` passes when Java is available.
- Local browser smoke shows sign-in page, Ask, Spaces, Lease Renewals detail, and
  Approval Queue without runtime errors.
- No live Google credentials are required for mock demo mode.
