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
Firestore editable-layer APIs, four approved workflow demo slices, all launch Space
shells, all-Space editable UI fallbacks, all-Space Approval Queue loading, change-log
display, Gmail send-only approval notification plumbing, Admin observability, Vertex AI
Search retrieval boundaries, Gemini JSON answer validation, Ask logging, Ask capture
tasks, source-state constants, unit/eval tests, Firestore rules tests, demo
reset/smoke scripts, and deterministic verification.

Spec 1 is not launch-complete yet. A cheap four-workflow Cloud Run demo works through
Cloud Storage-backed Agent Search data stores, approved sanitized sources, Firebase
Auth, Firestore, and Gemini. The demo can be considered done only when the smoke matrix
in `docs/demo-readiness.md` passes. The real app still needs PMI KC-owned production
source approval/import, client-production launch configuration, Gmail
sender/recipient setup or an explicit disabled decision, production observability
review, and read-only indexing of the separate Owner Router Drive package for the
Owner Email Space.

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
- `docs/demo-readiness.md`: demo done definition and smoke matrix.
- `docs/demo-cutover.md`: demo-to-client environment and cutover model.
- `docs/client-production-cutover.md`: ordered client-production rebuild runbook.
- `docs/demo-slice.md`: current approved workflow demo slices.
- `docs/demo-source-templates/`: safe source templates for current and future demos.
- `docs/google-setup.md`: live Google/Firebase/Cloud Storage/Agent Search/Gmail setup
  runbook.
- `docs/router-repo.md`: separate Owner Router repo plan.

## Next Steps

1. Keep the local four-workflow show-and-tell path and four-workflow live Ask smokes
   green.
2. Keep the deployed auth smoke and four deployed live Ask smokes green at
   <https://pmi-kc-kb-demo-800237451321.us-central1.run.app/sign-in>.
3. Use `npm run corpus:plan -- --write-temp` for demo source staging, or the
   parameterized production form in `docs/client-production-cutover.md` for client
   resources.
4. Run `npm run preflight:production -- --env-file=.env.production.local` before any
   client-production deploy, then make those values active through `.env.local` or the
   shell for seed/deploy commands.
5. Configure `KB_APPROVAL_*` and `APP_BASE_URL` only after a Gmail send-only sender
   identity and recipient list are approved.
6. Add mocked-auth Playwright e2e tests, staging Cloud Run, brand verification, and
   final A-1 through A-17 acceptance.
