# Demo Readiness

This document defines when the current PMI KC KB demo can be called done. It is not a
production acceptance checklist.

## Demo Done Definition

The demo environment is done when all of these are true:

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
- The demo script clearly says Owner Router and the PMI KC production source corpus are
  out of demo scope.

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
- Owner Router Drive package and read-only Owner Email indexing for final A-16.
- Mocked-auth Playwright e2e coverage for non-human CI.

## Current Demo Snapshot

As of 2026-05-29, `docs/status.md` records passing local demo smoke, deployed auth
smoke, deployed live Ask smokes for the four approved workflows, Firestore rules tests,
and full verification. Re-run the smoke commands above before any new show-and-tell
and record the new date/result in `docs/status.md`.
