# PMI KC Demo Show-And-Tell Runbook

This is the operator script for showing the current PMI KC demo to a client or internal
reviewer. It is deliberately demo-first: four approved KB workflow slices, Gmail Inbox
0 as the Gmail-native Dan-email pitch, safe records, and clear language about what is
real today versus scaffolded.

Use `docs/demo-readiness.md` as the demo done checklist. Passing this walkthrough is
not the same as client-production cutover. Current product routing lives in
`docs/north-star.md` and `docs/products/`.

## What To Say

Use this framing at the start:

> We are showing the PMI KC KB as a practical operating layer for PMI KC Metro. The
> first part is the source-backed KB: it turns Bailey's process knowledge into cited
> answers, editable SOPs, and approval workflows. The second part is Gmail Inbox 0: the
> same source discipline applied to Dan's owner email, while staying native to Gmail and
> keeping every send human-controlled.

Security framing:

> This demo uses sanitized records and our demo environment, not PMI KC's live systems.
> The KB does not write to RentVine, LeadSimple, Gmail, Drive, DotLoop, QuickBooks, Boom,
> operational Sheets, or any system of record. Gmail Inbox 0 is shown with
> sanitized Gmail-style examples; it does not touch Dan's live Gmail during this demo.

Close framing:

> The sell is not "AI replaces the team." The sell is that the team stops rebuilding
> context from memory, email, sheets, and calls. The KB makes operating knowledge
> reusable; Gmail Inbox 0 turns Dan's highest-friction inbox work into a visible,
> source-checked queue.

For show-and-tell, keep demo mode enabled unless explicitly testing live Ask. The demo
Ask responses are safe approved-demo answers; the editable workflow writes to live
Firestore in the demo project when Firebase is configured.

## Sales Demo Spine

Target time: 25-30 minutes.

1. **Promise:** the KB is the source-backed operating layer, not a generic chatbot.
2. **KB Ask:** ask one operational question and show citations, handling steps, and the
   `Draft — Review before sending` boundary.
3. **Source Maintenance:** show Spaces so Bailey/Dan can improve the answer without
   giving the KB write access to operating systems.
4. **Approval:** show the queue so reviewed knowledge becomes approved knowledge.
5. **Gmail Inbox 0:** show how the same source-backed discipline becomes a Gmail-native
   decision queue for owner email.
6. **Admin/Cutover:** show visibility, explain what is demo versus production setup,
   then ask for the next approval step.

Use this transition after the KB Approval Queue:

> Now the important part for Dan: this same discipline does not have to live only in a
> web app. His number-one pain is email, so Gmail Inbox 0 keeps Gmail as the front door
> and adds labels, source checks, draft patterns, and a learning loop around the work he
> already does.

## What Works Today

- Real Firebase Google sign-in for the demo Workspace account.
- Real HTTP-only Firebase session cookie in the Next.js app.
- Real Firestore-backed SOP, template, and placeholder records for four approved demo
  workflows.
- Real editable API writes for SOP Save, SOP/template approval, and placeholder
  resolution.
- Real Admin role claim for the active test Admin account.
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
  demo workflows, but it is still a demo corpus in the demo project.
- Approval Queue can load records across all writable launch Spaces. The seeded demo
  records are still the four approved workflow slices unless launch skeletons are
  explicitly seeded.
- Admin shows Ask volume, queue depth, notification failures, source states, and Space
  setup health. Production observability still needs PMI KC review before cutover.
- Public demo URL:
  <https://pmi-kc-kb-demo-800237451321.us-central1.run.app/sign-in>.
- Gmail Inbox 0 is not part of the current KB app runtime. It is shown as a
  Gmail-native workflow using legacy Owner Router artifacts from
  `C:\Users\josia\Documents\github-windows\pmi-kc-owner-router` until product naming
  and migration are approved.

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

Preferred one-command rehearsal:

```powershell
.\scripts\demo-operator.ps1 -Mode TestRun -SkipInstall
```

This resets demo data, starts or reuses the local dev server, runs the local workflow
smoke, dry-runs launch skeleton seeding, and opens a small operator links page plus
the local sign-in page. If dependencies may be stale, omit `-SkipInstall`.

If Google credentials are stale or the `pmikckb-test` project is not reachable, use the
offline local fallback:

```powershell
.\scripts\demo-operator.ps1 -Mode TestRun -SkipInstall -OfflineLocal
```

This skips Google host checks and Firestore resets, starts the app in local demo mode,
runs the same four-workflow screenshare smoke against local seed records, and keeps
Admin observability demo-safe. Use this path for today's customer show if reauth is not
complete.

When it is time to present, run:

```powershell
.\scripts\demo-operator.ps1 -Mode Showtime -SkipInstall
```

This resets data, verifies the local flow, resets data again for a clean queue, and
opens the local sign-in page. During the show, click **Continue in local demo mode**.

Offline local showtime fallback:

```powershell
.\scripts\demo-operator.ps1 -Mode Showtime -SkipInstall -OfflineLocal
```

After the show, run:

```powershell
.\scripts\demo-operator.ps1 -Mode Teardown
```

If the show used `-OfflineLocal`, run:

```powershell
.\scripts\demo-operator.ps1 -Mode Teardown -OfflineLocal
```

This resets demo records and stops only the local dev server that the operator script
started. Offline local teardown skips Firestore reset and only stops the operator-started
server. If you started `npm run dev` manually, stop that terminal yourself.

Manual fallback:

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
npm run smoke:auth-live -- --email=<josiah-pmi-kc-account@pmikcmetro.com> --timeout-ms=180000 --pause-on-human
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

- Lease Renewals: shows an owner/tenant renewal answer with source-backed handling
  steps, citations, and a review-required draft.
- Maintenance Work Order Intake: shows Rentvine intake, missing photos, Google Chat
  handoff, and Dan vendor assignment.
- Move-Out + Deposit Disposition: shows deadline pressure, tenant instructions, owner
  utility reminders, inspections, vendor bids, and deposit-sensitive escalation.
- Owner Onboarding: shows the checklist-heavy handoff before a property, owner, and
  existing tenant are fully built out in Rentvine.
- Gmail Inbox 0: shows the adjacent Gmail-native owner-email workflow with sanitized
  scenarios, not live Gmail.

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
   Otherwise click **Continue in local demo mode** for the local show. Use
   **Sign in with Google** only when intentionally showing the deployed auth flow.

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

   Then say:

   > This is the KB pattern: cite the source, give the team the handling
   > steps, draft the communication, and make the human decision boundary visible.

3. Open [Spaces](http://localhost:3000/spaces), then open one or more approved demo
   Spaces:
   - [Lease Renewals](http://localhost:3000/spaces/lease-renewals).
   - [Maintenance Work Order Intake](http://localhost:3000/spaces/maintenance-work-order-intake).
   - [Move-Out + Deposit Disposition](http://localhost:3000/spaces/move-out-deposit-disposition).
   - [Owner Onboarding](http://localhost:3000/spaces/owner-onboarding).

   In the normal API-backed path, confirm the page says `Editable API connected.` In
   offline local fallback, it may say `Using local demo records until Firebase setup is
complete.` Show the SOP, template, RentVine or other link-only tool, and open
   placeholder.

   Edit the SOP body by adding a small demo line, then click **Save**. Confirm it says
   `Saved to editable API.` Either remove the line and save again, or run
   `npm run demo:reset` after the demo.

   Say:

   > This is the handoff layer. It lets the team improve the source-backed workflow
   > without giving the KB write access to operational systems.

   Sales point:

   > This is where Bailey's judgment becomes reusable. The value is not one answer; it
   > is reducing the next interruption and making the next handoff cleaner.

4. Open [Approval Queue](http://localhost:3000/approval-queue).

   It should show four in-review SOPs, four in-review templates, and four open
   placeholders for the approved demo workflows. Click **Approve** for SOP/template
   items and **Resolve** for placeholders.

   Confirm the messages:
   - `Approved through editable API.`
   - `Resolved through editable API.`
   - `No in-review items are present in the approval queue.`

   Offline local fallback may show `Updated local demo queue.` instead of the editable
   API messages. That is expected when Google credentials are unavailable.

   Say:

   > The queue is the safe path from missing or reviewed knowledge to approved
   > knowledge. It writes to the KB editable layer, not to Gmail or a system of record.

   Transition:

   > Once the operating knowledge is approved, we can apply it to a workflow Dan already
   > lives in: owner email.

5. Open [Admin](http://localhost:3000/admin).

   Show:
   - Allowed domain.
   - Approval label.
   - Whether demo retrieval mode is active.
   - Ask volume, queue depth, notification failures, and Space setup health.

   Say:

   > Cutover should be mostly environment configuration: domain, Firebase project,
   > Firestore data, source locations, and Agent Search data stores.

## Gmail Inbox 0 Segment

Use this after the KB Approval Queue. It is a core part of the sales story, not an
afterthought. This is not a KB app feature and does not use live Gmail.

Open these local artifacts:

- `C:\Users\josia\Documents\github-windows\pmi-kc-owner-router\docs\demo-runbook.md`
- `C:\Users\josia\Documents\github-windows\pmi-kc-owner-router\docs\positioning.md`
- `C:\Users\josia\Documents\github-windows\pmi-kc-owner-router\tests\dry-run-historical-threads\demo-safe-scenarios.md`
- `C:\Users\josia\Documents\github-windows\pmi-kc-owner-router\gem-and-prompt-pack\owner-router-prompt-pack.md`

Say:

> That same source discipline powers Gmail Inbox 0, but the email workflow stays in
> Gmail. This is not another inbox and it is not autonomous sending. It is a labeled
> decision queue, approved reply patterns, and human-reviewed drafts.

Sell:

> This is where we simplify instead of overbuilding. Gmail already has labels, filters,
> search, templates, mobile, and Gemini drafting. We are not asking Dan to adopt another
> inbox. We are turning his existing inbox into a visible workflow: new owner email,
> Dan decision, draft ready, needs verification, waiting, closed.

Show:

1. The nine current `Owner Router / *` labels as legacy Gmail state names. Say these are
   expected to be confirmed, renamed, or aliased for Gmail Inbox 0.
2. The Multiple Inbox queries for `New`, `Dan Decision`, `Draft Ready`, and
   `Needs Verification`.
3. The sanitized renewal follow-up scenario routing from `New` to `Bailey Review`.
4. The prompt-pack draft starting with `Draft — Review before sending`.
5. The maintenance approval scenario routing to `Dan Decision`.
6. The accounting scenario using `Needs Verification: <fact>` instead of inventing a
   dollar or ledger answer.
7. The learning loop: Dan edits once; Bailey updates Reply Patterns, Voice Examples,
   Routing Rules, or Open Gaps; future drafts improve from approved documents.

Customer close language:

> The real leverage is not automatic sending. The leverage is that Dan's preferences stop
> living only in Dan's head. Every correction can become an approved pattern, a routing
> rule, or an open gap. That is how the assistant gets better without risking the
> business record.

Fallback language:

> This part is intentionally demo-safe. We are showing the operating workflow with
> sanitized owner email. The production version uses Dan's Gmail labels and approved
> Drive files, but it still does not send automatically or write into RentVine,
> LeadSimple, DotLoop, QuickBooks, or Sheets.

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
- User can sign in but cannot open Admin: set the Admin claim for the active PMI KC test
  account with
  `npm run firebase:set-role -- --email=<josiah-pmi-kc-account@pmikcmetro.com> --role=Admin`,
  then sign out and sign back in.
- Firestore/API errors: run `npm run host:check`, then `npm run firebase:setup-auth-demo`
  and `npm run firebase:setup-demo` only if setup state has drifted.
- Full code confidence: run `npm run verify` and `npm run test:firestore`.

## Demo Readiness Notes

1. Confirm the demo done checklist in `docs/demo-readiness.md` before any client show.
2. Seed launch skeletons only when the show needs all writable launch Spaces visible in
   Firestore-backed Approval Queue:

```bash
npm run seed:launch-skeletons -- --dry-run
```

After reviewing the dry-run output, omit `--dry-run` only in the intended demo
Firestore environment.

3. Add a non-human-auth CI e2e path with mocked auth/session fixtures; keep live Google
   auth as a local smoke only.
