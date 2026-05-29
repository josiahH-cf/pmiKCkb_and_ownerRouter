# PMI KC KB

PMI KC KB is the internal, source-backed knowledge base for PMI KC Metro. The app is
intended to help the team ask operational questions, browse process Spaces, capture
missing knowledge as placeholders, review SOP/template changes, and produce copyable
drafts that are grounded in approved sources.

This repository is the KB scaffold only. The Owner Router is a separate Gmail/Drive
workflow and should be created in its own repository when ready.

## Current Status

The KB has passed the foundation, demo-slice, M3a retrieval-boundary, and M3b answer
contract milestones. It includes Firebase Google sign-in/session boundaries,
Firestore editable-layer APIs, live demo Firestore records for Lease Renewals, a Lease
Renewals editable Space UI, a live-demo Approval Queue path, Vertex AI Search
retrieval boundaries, Gemini JSON answer validation, Ask logging, Ask capture tasks,
source-state constants, unit/eval tests, Firestore rules tests, demo reset/smoke
scripts, and deterministic verification.

Spec 1 is not launch-complete yet. A cheap Lease Renewals live Ask smoke now works
through a Cloud Storage-backed Agent Search data store with safe seed sources and one
sanitized transcript-derived call-notes source, but the real app still needs deployed
Cloud Run smoke, all launch Spaces, full editable UI coverage, all-Space Approval
Queue coverage, Gmail send-only
notifications, Admin observability, and a separate Owner Router repo for the
read-only Owner Email Space.

## Prerequisites

- Node.js 20.19+; Node 24 is used in CI.
- npm 10+.
- Bash for `scripts/verify.sh`.
- Java JDK 11+ is required only for Firestore emulator rules tests.

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local` when GCP/Firebase/Vertex setup begins. Live sign-in needs the manual
Firebase setup gate in `SETUP.md`; do not add secrets to git.

## Local Development

```bash
npm run dev
```

Open the local URL shown by Next.js.

## Tests And Verification

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:firestore
npm run build
npm run check:live-cost
npm run smoke:ask-live
bash scripts/verify.sh
```

`scripts/verify.sh` is the all-in-one validation entry point for non-emulator checks.
Run `npm run test:firestore` separately when Java is available on PATH.

## Documentation Map

- `docs/spec.md`: KB technical spec copied from the original root spec.
- `docs/specs/`: all four original specs preserved.
- `docs/plan.md`: milestones, goals, risks, and validation gates.
- `docs/implement.md`: runbook for future Codex work.
- `docs/status.md`: project audit log.
- `docs/engineering.md`: conventions, security, and boundaries.
- `docs/demo-show-and-tell.md`: exact local demo commands and client walkthrough.
- `docs/demo-cutover.md`: demo-to-client environment and cutover model.
- `docs/demo-slice.md`: first working Lease Renewals demo slice.
- `docs/demo-source-templates/`: safe source templates for current and future demos.
- `docs/google-setup.md`: live Google/Firebase/Cloud Storage/Agent Search/Gmail setup
  runbook.
- `docs/router-repo.md`: separate Owner Router repo plan.

## Next Steps

1. Keep the local show-and-tell path and transcript-derived live Ask smoke green for
   Lease Renewals.
2. Deploy the cheap Cloud
   Run demo with `npm run deploy:demo -- --budget-confirmed`.
3. Create the separate `pmi-kc-owner-router` repository before final KB A-16
   verification.
4. Expand the editable Space UI and Approval Queue from Lease Renewals to all launch
   Spaces.
5. Add mocked-auth Playwright e2e tests, staging Cloud Run, brand verification, and
   final A-1 through A-17 acceptance.
