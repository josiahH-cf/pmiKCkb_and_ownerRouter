# Demo Readiness

This document defines when the current PMI KC demo can be called done. It is not a
production acceptance checklist. Current product routing lives in `docs/north-star.md`
and `docs/products/`; older Owner Router/Dan's AI Assistant names in demo artifacts are
legacy source context for Gmail Inbox 0.

## Demo Done Definition

The demo environment is done when all of these are true:

- One-command local operator rehearsal passes:

```powershell
.\scripts\demo-operator.ps1 -Mode TestRun -SkipInstall
```

If Google credentials or the demo project are unavailable, the approved fallback is:

```powershell
.\scripts\demo-operator.ps1 -Mode TestRun -SkipInstall -OfflineLocal
```

This fallback proves the same four screenshare workflows from local seed records. It is
acceptable for a sales/demo call, but it is not evidence that the Google-backed editable
API or live Agent Search path is healthy.

- Gmail Inbox 0 demo artifacts are present. The current source artifacts still live in
  the old local Owner Router package until naming and migration are approved:

```powershell
C:\Users\josia\Documents\github-windows\pmi-kc-owner-router\scripts\verify-owner-router.ps1
```

This checks the Gmail-native demo package, required labels, required anti-hallucination
phrases, and absence of obvious Apps Script send/draft capabilities. It does not touch
live Gmail and does not make the old separate-repo model active again.

- Local demo reset and workflow smoke pass:

```bash
npm run demo:reset
npm run smoke:demo-live
```

- Deployed Google sign-in smoke passes against the current demo URL:

```bash
npm run smoke:auth-live -- --base-url=https://pmi-kc-kb-demo-800237451321.us-central1.run.app --pause-on-human
```

- Deployed live Ask smokes pass for the four approved workflow Spaces:

```bash
npm run smoke:ask-live -- --base-url=https://pmi-kc-kb-demo-800237451321.us-central1.run.app --browser-session --space=lease-renewals --question="When do we contact the owner versus the tenant during a renewal?"
npm run smoke:ask-live -- --base-url=https://pmi-kc-kb-demo-800237451321.us-central1.run.app --browser-session --space=maintenance-work-order-intake --question="How should maintenance intake handle missing photos and vendor assignment?"
npm run smoke:ask-live -- --base-url=https://pmi-kc-kb-demo-800237451321.us-central1.run.app --browser-session --space=move-out-deposit-disposition --question="How should move-out handling track inspections, vendor bids, and deposit-sensitive decisions?"
npm run smoke:ask-live -- --base-url=https://pmi-kc-kb-demo-800237451321.us-central1.run.app --browser-session --space=owner-onboarding --question="What owner onboarding checklist details must be confirmed before a property is ready?"
```

- Admin opens for an Admin role account and shows Ask volume, queue depth,
  notification failures, source states, and Space setup health.
- Launch skeletons are either seeded for the show or explicitly left optional:

```bash
npm run seed:launch-skeletons -- --dry-run
```

- Gmail approval notifications remain disabled unless an approved sender, recipient
  list, and deployed `APP_BASE_URL` are configured.
- The demo script clearly says Gmail Inbox 0 live Gmail setup, Lease Renewal Agent
  runtime, and the PMI KC production source corpus are out of demo scope.
- If showing Gmail Inbox 0, the demo uses sanitized owner-email scenarios from the old
  Owner Router artifact package and clearly says the KB does not own live Gmail, write
  Gmail drafts, alter labels, or send mail.
- The customer-close story uses `docs/customer-close-demo.md` so the sales pitch is
  KB first, Gmail Inbox 0 second, Lease Renewal Agent as a scoped next lane, and
  production cutover last.

## What Counts As Demo Scope

The current done demo is the four-workflow show-and-tell:

- Lease Renewals.
- Maintenance Work Order Intake.
- Move-Out + Deposit Disposition.
- Owner Onboarding.

It proves sign-in, cited Ask behavior, editable SOP/template/placeholder records,
Approval Queue actions, Admin visibility, and live Agent Search/Gemini grounding
without writing to RentVine, LeadSimple, DotLoop, QuickBooks, Boom, Gmail inboxes,
Drive folders, Sheets, or any system of record.

## What Does Not Count As Demo Done

The demo is not production-complete until separate client-production work finishes:

- PMI KC-owned project, Firebase app, OAuth client, Cloud Run service, and source
  storage.
- Approved PMI KC production sources uploaded/imported into client-owned Agent Search
  data stores.
- Gmail send-only sender/recipient approval if notifications are enabled.
- Production observability review.
- Gmail Inbox 0 Drive/source package and read-only Owner Email indexing for final KB
  owner-email verification.
- Mocked-auth Playwright e2e coverage for non-human CI.

## Current Demo Snapshot

As of 2026-05-29, `docs/status.md` records passing local demo smoke, deployed auth
smoke, deployed live Ask smokes for the four approved workflows, Firestore rules tests,
and full verification. Re-run the smoke commands above before any new show-and-tell
and record the new date/result in `docs/status.md`.

For a fast local show, use `.\scripts\demo-operator.ps1 -Mode Showtime -SkipInstall`.
When Google reauth is blocked, use
`.\scripts\demo-operator.ps1 -Mode Showtime -SkipInstall -OfflineLocal`. After the call,
run `.\scripts\demo-operator.ps1 -Mode Teardown` with the same fallback flag used for
showtime to reset records when available and stop only the dev server started by the
operator.
