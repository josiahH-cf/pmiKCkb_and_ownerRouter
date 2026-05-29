# PMI KC KB Demo Show-And-Tell Runbook

This is the operator script for showing the current PMI KC KB demo to a client or
internal reviewer. It is deliberately demo-first: one real workflow, one safe set of
records, and clear language about what is real today versus scaffolded.

## What To Say

Use this framing:

> This is the PMI KC KB: an internal, source-backed knowledge and handoff app. The demo
> uses our Cherrybridge Google Workspace and a demo Google Cloud project, not PMI KC's
> live environment. The Lease Renewals workflow is the working slice. It demonstrates
> sign-in, source-state behavior, editable SOPs, placeholders, approvals, and Admin
> visibility without writing to RentVine, LeadSimple, Gmail, Drive, DotLoop,
> QuickBooks, Boom, or any client system of record.

For show-and-tell, keep demo mode enabled unless explicitly testing live Ask. The demo
Ask response is a safe Lease Renewals answer; the editable workflow writes to live
Firestore in the demo project.

## What Works Today

- Real Firebase Google sign-in for the demo Workspace account.
- Real HTTP-only Firebase session cookie in the Next.js app.
- Real Firestore-backed Lease Renewals SOP, template, tool, and placeholder records.
- Real editable API writes for SOP Save, SOP/template approval, and placeholder
  resolution.
- Real Admin role claim for `josiah.hunter@cherrybridge.ai`.
- Demo Ask response for Lease Renewals questions with `Verified Source`, citation,
  handling steps, and copyable draft text.
- Local reset and smoke commands so the demo can be restored before and after a
  show-and-tell.

## What Is Still Demo Or Scaffolded

- Demo Ask intentionally bypasses live Vertex AI Search and Gemini while
  `ASK_DEMO_MODE=true`.
- The Approval Queue currently covers the Lease Renewals demo records, not every future
  Space.
- Admin shows basic environment/config status, not the final indexing-health dashboard.
- There is no public Cloud Run URL in this repo state; the demo runs at localhost.
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

This checks Ask, Lease Renewals Space save/revert, Approval Queue approve/resolve,
Admin access, and then resets the demo records again. Screenshots and events are saved
under ignored `temp/live-demo-workflow-smoke`.

If Google auth has expired, refresh the live sign-in profile:

```bash
npm run smoke:auth-live -- --email=josiah.hunter@cherrybridge.ai --timeout-ms=180000 --pause-on-human
```

Complete any Google password, MFA, or consent screen in the Chrome window that opens.
When it reaches `/ask`, rerun:

```bash
npm run smoke:demo-live
```

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

3. Open [Spaces](http://localhost:3000/spaces), then open
   [Lease Renewals](http://localhost:3000/spaces/lease-renewals).

   Confirm the page says `Editable API connected.` Show the SOP, template, RentVine
   link-only tool, and open placeholder.

   Edit the SOP body by adding a small demo line, then click **Save**. Confirm it says
   `Saved to editable API.` Either remove the line and save again, or run
   `npm run demo:reset` after the demo.

   Say:

   > This is the handoff layer. It lets the team improve the source-backed workflow
   > without giving the KB write access to operational systems.

4. Open [Approval Queue](http://localhost:3000/approval-queue).

   After `npm run demo:reset`, it should show one in-review SOP, one in-review
   template, and one open placeholder. Click **Approve** for SOP/template items and
   **Resolve** for the placeholder.

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
   > Firestore data, Drive folders, and future Vertex data stores.

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

1. Add a public deployed URL so client demos are not tied to a developer machine.
2. Add sanitized real Lease Renewals call notes to the Cloud Storage source corpus,
   import the `.txt` copy into Agent Search, and rerun `npm run smoke:ask-live`.
3. Delete the unused console-created Markdown data store after confirming the working
   `kb-lease-renewals-txt` store is the only configured Lease Renewals target.
4. Expand Approval Queue beyond Lease Renewals when additional Spaces have real demo
   records.
5. Add a visible change-log panel in the Space page so save/approve/reset history is
   inspectable during show-and-tell.
6. Add a non-human-auth CI e2e path with mocked auth/session fixtures; keep live Google
   auth as a local smoke only.
