# PMI KC Product Workstream

This repository now governs the three purchased PMI KC product lanes:

- PMI KC KB: the existing source-backed knowledge and handoff web app.
- Lease Renewal Agent: the first backend automation target after the KB production lift.
- Gmail Inbox 0: Dan-email-first Gmail workflow, successor to Owner Router/Dan's AI
  Assistant.

Older KB-only and separate Owner Router repo language is legacy. Use `AGENTS.md`,
`CLAUDE.md`, `docs/north-star.md`, `docs/products/`, and
`docs/autonomous-agent-runner.md` before older demo or spec material.

## Current Status

The PMI KC KB runtime is the only built application in this repo today. It includes
Firebase Google sign-in/session boundaries, Firestore editable-layer APIs, approved demo
workflow slices, Approval Queue behavior, Admin observability, Vertex AI Search
retrieval boundaries, Gemini answer validation, Ask logging, Ask capture tasks,
source-state constants, unit/eval tests, Firestore rules tests, demo reset/smoke
scripts, and deterministic verification.

Lease Renewal Agent and Gmail Inbox 0 are active product lanes, but external write,
Gmail read/modify, and send behavior remains blocked until requirements, permissions,
access, and acceptance gates are confirmed in their product docs.

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
- `CLAUDE.md`: compatibility pointer to the same active router.
- `docs/north-star.md`: current three-product direction and safety rules.
- `docs/products/`: product-lane docs for KB, Lease Renewal Agent, and Gmail Inbox 0.
- `docs/plan.md`: phases, milestones, acceptance gates, risks, and sequence.
- `docs/integration-cutover-plan.md`: cross-product integration and cutover plan.
- `docs/environment-handoff.md`: non-secret environment, setup, key ownership, and
  handoff registry.
- `docs/autonomous-agent-runner.md`: production feature-cycle loop, approvals, secrets,
  blockers, handoff, and commit queue.
- `docs/autonomous-feature-cycle-packet-template.md`: packet template for temporary
  cycle planning artifacts.
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
- `docs/legacy/owner-router-artifact-source.md`: local sibling Owner Router artifact
  map for Gmail Inbox 0 source-material mining only.
- `docs/temp/`: ignored scratch space for generated cycle packets and draft
  communications; durable decisions must be promoted into active docs.

## Next Steps

1. Keep the PMI KC KB verification and demo smoke path green.
2. Stand up the internal PMI KC KB production app with the first four Spaces.
3. Move Gmail Inbox 0 in tandem as a Dan Gmail pilot with approved mailbox access and a
   minimal KB-hosted management page.
4. Scope Lease Renewal as the first full backend automation after the KB production
   lift.
5. Fill the open research items in `docs/research-backlog.md`.
6. Use `docs/integration-cutover-plan.md` and `docs/client-production-cutover.md` before
   any client-owned production deployment.
