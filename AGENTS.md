# PMI KC Product Agent Router

This file routes future Codex sessions. Keep it under 150 lines; put durable detail in
`docs/`.

## Purpose

Govern and build the PMI KC three-product workstream:

- PMI KC KB: source-backed knowledge and handoff web app.
- Lease Renewal Agent: separate renewal workflow product lane; discovery before runtime.
- Gmail Inbox 0: Dan-email-first Gmail workflow, successor to Owner Router/Dan's AI
  Assistant.

The old KB-only/separate-Owner-Router direction is legacy. Preserve useful history, but
route new work through the three-product docs.

## Route Table

| Need                             | Read                                                     |
| -------------------------------- | -------------------------------------------------------- |
| North star and product direction | `docs/north-star.md`                                     |
| Product lane routing             | `docs/products/README.md`, then the relevant product doc |
| Phase plan and acceptance gates  | `docs/plan.md`                                           |
| Integration and cutover          | `docs/integration-cutover-plan.md`                       |
| Environment and key handoff      | `docs/environment-handoff.md`                            |
| Product definition gaps          | `docs/product-definition-gap-plan.md`                    |
| How to work next                 | `docs/implement.md`                                      |
| Autonomous feature-cycle runner  | `docs/autonomous-agent-runner.md`                        |
| Current status and blockers      | `docs/status.md`                                         |
| Client asks                      | `docs/client-checklist.md`                               |
| Engineering checklist            | `docs/engineering-checklist.md`                          |
| AI execution workflow            | `docs/ai-execution-workflow.md`                          |
| Research backlog                 | `docs/research-backlog.md`                               |
| Security and conventions         | `docs/engineering.md`                                    |
| Original preserved specs         | `docs/specs/`                                            |
| KB technical spec                | `docs/spec.md`                                           |
| Legacy Owner Router split        | `docs/legacy/owner-router-separate-repo.md`              |
| Owner Router artifact source     | `docs/legacy/owner-router-artifact-source.md`            |
| Google setup details             | `docs/google-setup.md`, `SETUP.md`                       |

## Project Map

- `app/`: current PMI KC KB Next.js App Router pages and API routes.
- `components/`: KB UI components.
- `lib/`: KB auth, source-state, retrieval, prompt, Firestore, and citation boundaries.
- `docs/products/`: active product-lane docs for KB, Lease Renewal Agent, and Gmail
  Inbox 0.
- `docs/autonomous-agent-runner.md`: production feature-cycle runner and approval
  gates.
- `docs/environment-handoff.md`: non-secret environment, setup, and key ownership
  registry.
- `docs/legacy/`: retired or superseded context kept for history.
- `docs/legacy/owner-router-artifact-source.md`: local sibling Owner Router package
  map for Gmail Inbox 0 source-material mining only.
- `docs/specs/`: preserved original spec set.
- `docs/temp/`: disposable planning packets and draft communications only.
- `tests/`: unit, eval, Firestore, and future e2e tests.
- `scripts/verify.sh`: all-in-one deterministic validation.

## Commands

- Install: `npm install`
- Local app: `npm run dev`
- Format check: `npm run format:check`
- Lint: `npm run lint`
- Typecheck: `npm run typecheck`
- Test: `npm test`
- Reset demo data: `npm run demo:reset`
- Demo operator: `npm run demo:operator`
- Live cost preflight: `npm run check:live-cost`
- Seed source metadata: `npm run seed:source-meta`
- Live demo smoke: `npm run smoke:demo-live`
- Live Ask smoke: `npm run smoke:ask-live`
- Demo deploy: `npm run deploy:demo`
- Build: `npm run build`
- Full verification: `bash scripts/verify.sh`

## Conventions

- Use TypeScript with strict types and small boundary modules.
- Source states and shared vocabulary are constants; do not rename them casually.
- Enforce anti-hallucination in code before model calls.
- Keep runtime changes scoped to the relevant product lane.
- Add tests with any behavior change.
- Do not build Lease Renewal Agent or Gmail Inbox 0 runtime behavior until their
  product docs define scope, permissions, and acceptance gates.

## Security Rules

- No secrets, tokens, customer data, raw screening records, ledgers, bank data, SSNs,
  full lease packets, or live Gmail thread content in git.
- Use `.env.example` for names only.
- Preserve human send authority; no autonomous send.
- Do not add system-of-record write paths to RentVine, LeadSimple, DotLoop, QuickBooks,
  Boom, operating Sheets, banks, or client Drive folders without a future approved spec.
- Missing sources produce visible uncertainty, not generic property-management answers.

## Documentation Rules

- Update `docs/status.md` after meaningful work.
- Update `docs/plan.md` only when phases, milestones, or acceptance criteria change.
- Update `docs/implement.md` when the operating workflow changes.
- Update `docs/products/*.md` when product scope changes.
- Preserve all original specs in `docs/specs/`.
- Mark or move stale docs as legacy instead of leaving contradictory active guidance.
- Keep `CLAUDE.md` as a short pointer to this router.

## Definition of Done

- Code compiles, lint passes, tests pass, and `bash scripts/verify.sh` passes when
  relevant and available.
- Docs reflect the change and future agents know the next step.
- Blockers are concrete client asks or research questions.
- No product requirement is invented beyond confirmed sources and approved direction.

## Do Not

- Do not preserve KB-only or separate-Owner-Router assumptions as active guidance.
- Do not produce generic property-management answers for missing PMI KC sources.
- Do not add autonomous send or system-of-record writes.
- Do not commit secrets, customer records, or raw Gmail/customer source material.
- Do not skip tests for source-state, citation, permission, prompt, or cutover behavior.
