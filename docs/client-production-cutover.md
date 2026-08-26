# Production cutover compatibility contract

Updated: 2026-08-26.

This path remains because release/preflight tests parse the required-API and smoke-checklist
contracts below. Current environment, release, rollback, and serving-revision truth lives in
`docs/environment-handoff.md`; current production status lives in `docs/status.md`. This file does
not authorize a deployment, data import, provider write, or action-gate change.

## Required APIs

The setup preflight owns this exact inventory:

```bash
gcloud services enable aiplatform.googleapis.com discoveryengine.googleapis.com storage.googleapis.com firestore.googleapis.com datastore.googleapis.com firebase.googleapis.com identitytoolkit.googleapis.com securetoken.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com iam.googleapis.com iamcredentials.googleapis.com logging.googleapis.com monitoring.googleapis.com cloudresourcemanager.googleapis.com serviceusage.googleapis.com cloudbilling.googleapis.com speech.googleapis.com --project=<project-id>
```

## Production smoke contract

Production smoke checklist:

- Allowed-domain sign-in reaches `/ask`.
- Wrong-domain sign-in is rejected.
- Admin page opens for the Admin account.
- At least one approved Space opens and shows seeded records.
- Ask returns a cited `Verified Source` answer from an approved production source.
- Ask returns `No Reliable Source Found` for an unsupported question.
- User can save or suggest editable records but cannot approve.
- Admin can approve, return, assign, snooze, and disable eligible queue items.
- Admin can inspect Approval Queue bulk controls for eligible Live items, with per-item skipped reasons visible; rehearsal does not invoke them against Production records.
- Production exposes Live records only and contains no fixture creator, rehearsal workspace, or non-Live projection.
- The Maintenance workspace persists Live intake, assignment, status, activity, and notes; provider effects remain on their separately confirmed and receipted surfaces.
- A roster-backed Live Vendor sees only its assigned Live tickets and loses access after deassignment or disable; no setup link, credential, TOTP material, or customer record value enters smoke evidence.
- Every enabled Live write names the exact action, target, and material values; requires the permitted human confirmation; emits a bodyless receipt and readback; and an unavailable action makes no provider call.

The exact-version release smoke (`/api/version`, root, sign-in, and protected-route behavior) remains
mandatory in addition to this human/product checklist.
