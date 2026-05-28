# PMI KC KB Agent Router

This file routes future Codex sessions. Keep it under 150 lines; put durable detail in
`docs/`.

## Purpose

Build the PMI KC KB: an internal, source-backed knowledge and handoff web app for PMI
KC Metro. This repo is KB-only. The Owner Router is a separate future repo and remains
Gmail/Drive configuration, not runtime code here.

## Route Table

| Need                                   | Read                               |
| -------------------------------------- | ---------------------------------- |
| Product source of truth                | `docs/spec.md`, then `docs/specs/` |
| Milestones and acceptance gates        | `docs/plan.md`                     |
| How to work next                       | `docs/implement.md`                |
| Current audit log and open items       | `docs/status.md`                   |
| Engineering conventions and boundaries | `docs/engineering.md`              |
| Client demo walkthrough                | `docs/demo-show-and-tell.md`       |
| Demo and cutover model                 | `docs/demo-cutover.md`             |
| First working demo slice               | `docs/demo-slice.md`               |
| Separate Owner Router repo setup       | `docs/router-repo.md`              |
| Google setup details                   | `docs/google-setup.md`, `SETUP.md` |

## Project Map

- `app/`: Next.js App Router pages and API routes.
- `components/`: UI components.
- `lib/`: source-state, auth, retrieval, prompt, Firestore, and citation boundaries.
- `styles/tokens.css`: PMI navy/gold tokens; verify against the brand site during setup.
- `tests/`: unit and eval tests; e2e tests are added when auth/integration mocks exist.
- `scripts/verify.sh`: all-in-one deterministic validation.
- `docs/specs/`: preserved original four-spec set.

## Commands

- Install: `npm install`
- Local app: `npm run dev`
- Format check: `npm run format:check`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Test: `npm test`
- Reset demo data: `npm run demo:reset`
- Live demo smoke: `npm run smoke:demo-live`
- Live Ask smoke: `npm run smoke:ask-live`
- Build: `npm run build`
- Full verification: `bash scripts/verify.sh`

## Conventions

- Use TypeScript with strict types and small boundary modules.
- Source states and shared vocabulary are constants; do not rename them.
- Enforce anti-hallucination in code before model calls.
- Keep this repo free of Router runtime code, Gmail label automation, or shared services.
- Add tests with any behavior change.

## Security Rules

- No secrets, tokens, customer data, raw screening records, ledgers, bank data, SSNs, or
  full lease packets in git.
- Use `.env.example` for names only.
- KB may use `drive.readonly` and `gmail.send` only. No Gmail read/modify/compose scope.
- Never add write paths to RentVine, LeadSimple, DotLoop, QuickBooks, Boom, Sheets, or
  the Owner Router Drive folder.

## Documentation Rules

- Update `docs/status.md` after meaningful work.
- Update `docs/plan.md` only when milestones or acceptance criteria change.
- Update `docs/implement.md` when the operating workflow changes.
- Preserve all original specs in `docs/specs/`.

## Definition of Done

- Code compiles, lint passes, tests pass, and `bash scripts/verify.sh` passes.
- Docs reflect the change.
- No product requirement is invented beyond the specs.

## Do Not

- Do not build the Owner Router in this repo.
- Do not merge the KB and Owner Router runtimes.
- Do not produce generic property-management answers for missing PMI KC sources.
- Do not add autonomous send or system-of-record writes.
- Do not skip tests for source-state, citation, permission, or prompt behavior.
