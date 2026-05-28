# PMI KC KB

PMI KC KB is the internal, source-backed knowledge base for PMI KC Metro. The app is
intended to help the team ask operational questions, browse process Spaces, capture
missing knowledge as placeholders, review SOP/template changes, and produce copyable
drafts that are grounded in approved sources.

This repository is the KB scaffold only. The Owner Router is a separate Gmail/Drive
workflow and should be created in its own repository when ready.

## Current Status

The scaffold is ready for app development. It includes a minimal Next.js app, Firebase
Google sign-in/session boundaries, Firestore editable-layer API boundaries, source state
constants, a no-source Ask API for the empty Phase A state, unit/eval tests,
documentation, and deterministic verification.

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
- `docs/google-setup.md`: live Google/Firebase/Drive/Vertex/Gmail setup runbook.
- `docs/router-repo.md`: separate Owner Router repo plan.

## Next Steps

1. Use `docs/demo-show-and-tell.md` for the current local client walkthrough.
2. Use the Lease Renewals slice in `docs/demo-slice.md` as the first working demo.
3. Complete live setup gates in `docs/google-setup.md` when real Google services are
   needed.
4. Add Vertex AI Search and Gemini adapters behind the existing interfaces.
5. Add Playwright e2e tests for the critical flows once auth fixtures are present.
6. Create the separate `pmi-kc-owner-router` repository when ready.
