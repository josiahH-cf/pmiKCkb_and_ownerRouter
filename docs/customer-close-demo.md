# PMI KC Customer Close Demo

Use this as the concise screenshare sequence. The detailed operator runbook remains
`docs/demo-show-and-tell.md`.

## Core Pitch

PMI KC KB is the source-backed operating layer for PMI KC Metro. It is not a generic
chatbot and not autonomous operations. It turns the team's knowledge into cited answers,
reviewable SOPs, approved drafts, and visible gaps.

Gmail Inbox 0 is the owner-email extension of the same idea. It stays in Gmail, uses
labels and approved reply patterns, drafts safely, and keeps Dan/Bailey in control of
every send.

Lease Renewal Agent is the dedicated renewal lane. In this demo, the Lease Renewals KB
workflow is reference material; the standalone agent still needs scope confirmation.

## Run Order

1. Start the local demo:

```powershell
.\scripts\demo-operator.ps1 -Mode Showtime -SkipInstall -OfflineLocal
```

2. Open [http://localhost:3000/sign-in](http://localhost:3000/sign-in) and click
   **Continue in local demo mode**.
3. Ask:

```text
What is the lease renewal process?
```

4. Show:
   - verified source banner;
   - citation;
   - handling steps;
   - `Draft — Review before sending`.
5. Open Spaces and show how Bailey/Dan can maintain the source-backed workflow.
6. Open Approval Queue and show the safe path from draft/missing knowledge to approved
   knowledge.
7. Transition to Gmail Inbox 0:

> Now we apply the same source discipline to Dan's highest-friction workflow: owner
> email. The email workflow stays in Gmail; Gmail Inbox 0 adds a labeled decision queue,
> approved reply patterns, and safe drafts.

8. Open
   `C:\Users\josia\Documents\github-windows\pmi-kc-owner-router\tests\dry-run-historical-threads\demo-safe-scenarios.md`.
9. Show the sanitized owner-email scenarios. The current artifact labels still use the
   old Owner Router names until Gmail Inbox 0 naming is approved:
   - Renewal Follow-Up routes to `Owner Router / Bailey Review`.
   - Maintenance Approval routes to `Owner Router / Dan Decision`.
   - Accounting / Disbursement routes to `Owner Router / Needs Verification`.
10. Open Admin in the KB and close with cutover:

> The demo shows the pattern. Production cutover is configuration plus approved source
> content: PMI KC-owned Google project, source folders, renewal requirements, Gmail
> Inbox 0 labels/testing, and approved Drive source files.

## What The Demo Proves

- PMI KC knowledge can become reusable, cited operating memory.
- The team can improve workflows without writing to RentVine, LeadSimple, Gmail,
  DotLoop, QuickBooks, Boom, or Sheets.
- Gmail Inbox 0 does not require a new inbox or autonomous sending.
- Lease Renewal Agent should be scoped as its own lane, not assumed complete from a KB
  demo Space.
- AI is used for summary and drafting; humans keep decision, approval, send, and system
  of record authority.

## Close Ask

Ask for approval on the next concrete step:

> If this is the right direction, the next step is to approve the production cutover and
> discovery package: source folders, renewal-agent requirements, Gmail Inbox 0
> label/testing decisions, Workspace configuration, and the first live pilot categories.
