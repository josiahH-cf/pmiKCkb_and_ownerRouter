# PMI KC KB Demo Show-And-Tell Runbook

This is the operator script for showing the current PMI KC KB demo to a client or
internal reviewer. It is deliberately demo-first: four approved workflow slices, safe
records, and clear language about what is real today versus scaffolded.

## What To Say

Use this framing:

> This is the PMI KC KB: an internal, source-backed knowledge and handoff app. The demo
> uses our Cherrybridge Google Workspace and a demo Google Cloud project, not PMI KC's
> live environment. The working demo slices are Lease Renewals, Maintenance Work Order
> Intake, Move-Out + Deposit Disposition, and Owner Onboarding. They demonstrate
> sign-in, source-state behavior, editable SOPs, placeholders, approvals, and Admin
> visibility without writing to RentVine, LeadSimple, Gmail, Drive, DotLoop,
> QuickBooks, Boom, operational Sheets, or any client system of record.

For show-and-tell, keep demo mode enabled unless explicitly testing live Ask. The demo
Ask responses are safe approved-demo answers; the editable workflow writes to live
Firestore in the demo project when Firebase is configured.

## What Works Today

- Real Firebase Google sign-in for the demo Workspace account.
- Real HTTP-only Firebase session cookie in the Next.js app.
- Real Firestore-backed SOP, template, and placeholder records for four approved demo
  workflows.
- Real editable API writes for SOP Save, SOP/template approval, and placeholder
  resolution.
- Real Admin role claim for `josiah.hunter@cherrybridge.ai`.
- Demo Ask responses for Lease Renewals, Maintenance Work Order Intake, Move-Out +
  Deposit Disposition, and Owner Onboarding questions with `Verified Source`, citation,
  handling steps, and copyable draft text.
- Optional live Ask smoke for all four approved workflows through Cloud Storage `.txt`
  sources and Agent Search data stores.
- Local reset and smoke commands so the demo can be restored before and after a
  show-and-tell.

## What Is Still Demo Or Scaffolded

- Demo Ask intentionally bypasses live Vertex AI Search and Gemini while
  `ASK_DEMO_MODE=true`.
- The current deployed live Ask corpus is call-context-backed for the four approved
  demo workflows, but it is still a demo corpus in the Cherrybridge project.
- Approval Queue covers the four approved demo workflow records, not every launch
  Space.
- Admin shows basic environment/config status, not the final indexing-health dashboard.
- Public demo URL:
  <https://pmi-kc-kb-demo-800237451321.us-central1.run.app/sign-in>.
- The Owner Router is intentionally not part of this repo or app.

## One-Time Host Check

Run this when the machine has restarted or when Google tooling seems unstable:

```bash
npm run host:check
```

If the check fails, repair the Windows demo host:

```bash
npm run host:setup
```

The deeper Google/Firebase runbook is [docs/google-setup.md](google-setup.md). Official
setup references used by that runbook include
[Firebase Web setup](https://firebase.google.com/docs/web/setup),
[Firebase Google sign-in](https://firebase.google.com/docs/auth/web/google-signin), and
[Google Application Default Credentials](https://docs.cloud.google.com/docs/authentication/application-default-credentials).

## Before Every Demo

From the repo root:

```bash
npm install
npm run demo:reset
npm run dev
```

Keep the `npm run dev` terminal open. The local app should be available at
[http://localhost:3000](http://localhost:3000).

In a second terminal, run the automated confidence check:

```bash
npm run smoke:demo-live
```

This checks Ask, Space save/revert across the four approved demo workflows, Approval
Queue approve/resolve, Admin access, and then resets the demo records again.
Screenshots and events are saved under ignored `temp/live-demo-workflow-smoke`.

If Google auth has expired, refresh the live sign-in profile:

```bash
npm run smoke:auth-live -- --email=josiah.hunter@cherrybridge.ai --timeout-ms=180000 --pause-on-human
```

Complete any Google password, MFA, or consent screen in the Chrome window that opens.
When it reaches `/ask`, rerun:

```bash
npm run smoke:demo-live
```

## Optional Live Ask Check

Use this only when explicitly showing live retrieval/Gemini behavior. Keep it scoped to
configured source targets and do not upload raw transcripts.

Prerequisites:

- In the current `pmikckb-test` demo setup, approved `.txt` sources are uploaded,
  imported into Agent Search, and seeded in `sources_meta` for Lease Renewals,
  Maintenance Work Order Intake, Move-Out + Deposit Disposition, and Owner Onboarding.
- If rebuilding the demo from scratch, repeat those upload/import/seed steps before
  running this smoke.
- The local app is running with `ASK_DEMO_MODE=false`.

Run:

```bash
npm run check:live-cost
npm run smoke:ask-live -- --question="When do we contact the owner versus the tenant during a renewal?" --timeout-ms=90000
npm run smoke:ask-live -- --space=maintenance-work-order-intake --question="How should maintenance intake handle missing photos and vendor assignment?" --timeout-ms=90000
npm run smoke:ask-live -- --space=move-out-deposit-disposition --question="How should move-out handling track inspections, vendor bids, and deposit-sensitive decisions?" --timeout-ms=90000
npm run smoke:ask-live -- --space=owner-onboarding --question="What owner onboarding checklist details must be confirmed before a property is ready?" --timeout-ms=90000
```

Say:

> This answer comes from an approved sanitized source. It shows how real call context
> becomes useful while the KB still refuses to invent missing legal, fee, cadence, or
> exception details.

## Approved Demo Workflows

These are supported by approved sanitized source templates, seeded demo records, and
the current live Agent Search demo corpus.

- Maintenance Work Order Intake: shows Rentvine intake, missing photos, Google Chat
  handoff, and Dan vendor assignment.
- Move-Out + Deposit Disposition: shows deadline pressure, tenant instructions, owner
  utility reminders, inspections, vendor bids, and deposit-sensitive escalation.
- Owner Onboarding: shows the checklist-heavy handoff before a property, owner, and
  existing tenant are fully built out in Rentvine.

Good questions:

- "What should the team check when a maintenance request comes in?"
- "Why should the KB not assign a vendor by itself?"
- "What has to happen after a tenant gives move-out notice?"
- "Can the KB decide deposit disposition by itself?"
- "What details does the team track during owner onboarding?"
- "Can the KB update the onboarding sheet or Rentvine?"

## Manual Walkthrough

Use Chrome if possible. The in-app browser can be unreliable for Google sign-in.

1. Open [Sign In](http://localhost:3000/sign-in).

   If already signed in, the app may redirect to [Ask](http://localhost:3000/ask).
   Otherwise click **Sign in with Google** and use the allowed demo Workspace account.

2. Open [Ask](http://localhost:3000/ask).

   Ask:

   ```text
   What is the lease renewal process?
   ```

   Point out:
   - `Verified Source` source-state banner.
   - Direct answer.
   - Handling steps.
   - `Lease Renewals Demo SOP` citation.
   - Draft starts with `Draft — Review before sending`.

   Say:

   > The app gives a grounded answer and a draft, but it does not send anything. A
   > person still decides what to do and where to act.

3. Open [Spaces](http://localhost:3000/spaces), then open one or more approved demo
   Spaces:
   - [Lease Renewals](http://localhost:3000/spaces/lease-renewals).
   - [Maintenance Work Order Intake](http://localhost:3000/spaces/maintenance-work-order-intake).
   - [Move-Out + Deposit Disposition](http://localhost:3000/spaces/move-out-deposit-disposition).
   - [Owner Onboarding](http://localhost:3000/spaces/owner-onboarding).

   Confirm the page says `Editable API connected.` Show the SOP, template, RentVine
   or other link-only tool, and open placeholder.

   Edit the SOP body by adding a small demo line, then click **Save**. Confirm it says
   `Saved to editable API.` Either remove the line and save again, or run
   `npm run demo:reset` after the demo.

   Say:

   > This is the handoff layer. It lets the team improve the source-backed workflow
   > without giving the KB write access to operational systems.

4. Open [Approval Queue](http://localhost:3000/approval-queue).

   After `npm run demo:reset`, it should show four in-review SOPs, four in-review
   templates, and four open placeholders. Click **Approve** for SOP/template items and
   **Resolve** for placeholders.

   Confirm the messages:
   - `Approved through editable API.`
   - `Resolved through editable API.`
   - `No in-review items are present in the approval queue.`

   Say:

   > The queue is the safe path from missing or reviewed knowledge to approved
   > knowledge. It writes to the KB editable layer, not to Gmail or a system of record.

5. Open [Admin](http://localhost:3000/admin).

   Show:
   - Allowed domain.
   - Approval label.
   - Whether demo retrieval mode is active.

   Say:

   > Cutover should be mostly environment configuration: domain, Firebase project,
   > Firestore data, source locations, and Agent Search data stores.

## After Every Demo

Reset the demo records so the Approval Queue is ready for the next show:

```bash
npm run demo:reset
```

Optional confidence check:

```bash
npm run smoke:demo-live
```

## Troubleshooting

- `Local app is not reachable`: start the app with `npm run dev`.
- Redirected to `/sign-in`: run the live auth smoke with `--pause-on-human` and finish
  Google auth in Chrome.
- Approval Queue is empty before the show: run `npm run demo:reset`.
- User can sign in but cannot open Admin: set the Admin claim with
  `npm run firebase:set-role -- --email=josiah.hunter@cherrybridge.ai --role=Admin`,
  then sign out and sign back in.
- Firestore/API errors: run `npm run host:check`, then `npm run firebase:setup-auth`
  and `npm run firebase:setup-demo` only if setup state has drifted.
- Full code confidence: run `npm run verify` and `npm run test:firestore`.

## Demo Readiness Gaps

1. Delete the unused console-created Markdown data store after confirming the working
   `kb-lease-renewals-txt` store is the only configured Lease Renewals target.
2. Add a visible change-log panel in the Space page so save/approve/reset history is
   inspectable during show-and-tell.
3. Add a non-human-auth CI e2e path with mocked auth/session fixtures; keep live Google
   auth as a local smoke only.
