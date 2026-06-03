# PMI KC Product Workstream

This repository now governs the three purchased PMI KC product lanes:

- PMI KC KB: the existing source-backed knowledge and handoff web app.
- Lease Renewal Agent: a separate renewal workflow product track that still needs
  discovery before runtime work.
- Gmail Inbox 0: owner-email-first Gmail workflow, successor to Owner Router/Dan's AI
  Assistant.

Older KB-only and separate Owner Router repo language is legacy. Use `AGENTS.md`,
`docs/north-star.md`, and `docs/products/` before older demo or spec material.

## Current Status

The PMI KC KB runtime is the only built application in this repo today. It includes
Firebase Google sign-in/session boundaries, Firestore editable-layer APIs, approved demo
workflow slices, Approval Queue behavior, Admin observability, Vertex AI Search
retrieval boundaries, Gemini answer validation, Ask logging, Ask capture tasks,
source-state constants, unit/eval tests, Firestore rules tests, demo reset/smoke
scripts, and deterministic verification.

Lease Renewal Agent and Gmail Inbox 0 are active product lanes, but runtime work remains
blocked until requirements, permissions, access, and acceptance gates are confirmed in
their product docs.

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

- `AGENTS.md`: active agent routing.
- `docs/north-star.md`: current three-product direction and safety rules.
- `docs/products/`: product-lane docs for KB, Lease Renewal Agent, and Gmail Inbox 0.
- `docs/plan.md`: phases, milestones, acceptance gates, risks, and sequence.
- `docs/integration-cutover-plan.md`: cross-product integration and cutover plan.
- `docs/client-checklist.md`: client-owned asks, access, source, and training needs.
- `docs/engineering-checklist.md`: engineering tasks after admin access.
- `docs/ai-execution-workflow.md`: daily AI workflow and blocked-work protocol.
- `docs/research-backlog.md`: unanswered questions and research items.
- `docs/implement.md`: operating runbook for future Codex work.
- `docs/status.md`: project audit log and next recommended task.
- `docs/engineering.md`: conventions, security, and boundaries.
- `docs/spec.md`: KB technical spec, interpreted through the current north star.
- `docs/specs/`: original preserved specs.
- `docs/client-production-cutover.md`: KB production rebuild runbook.
- `docs/google-setup.md`: Google/Firebase/Cloud Storage/Agent Search/Gmail setup notes.
- `docs/legacy/`: superseded context, including the old separate Owner Router plan.

## Next Steps

1. Keep the PMI KC KB verification and demo smoke path green.
2. Collect client answers from `docs/client-checklist.md`.
3. Fill the open research items in `docs/research-backlog.md`.
4. Do not build Lease Renewal Agent runtime until `docs/products/lease-renewal-agent.md`
   has approved v1 scope and acceptance gates.
5. Convert Owner Router/Dan's AI Assistant artifacts into the Gmail Inbox 0 lane only
   after label naming, Gmail access, and testing approach are approved.
6. Use `docs/integration-cutover-plan.md` and `docs/client-production-cutover.md` before
   any client-owned production deployment.
