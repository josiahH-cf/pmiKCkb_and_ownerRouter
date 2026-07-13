# PMI KC Product Agent Router

This file is the single **runner-neutral** router for every agent runner (Codex, Claude
Code, and any other). Durable product and execution rules live here and in `docs/`; each
runner keeps only a thin pointer back to this file — see **Per-Runner Pointers** below. Keep
durable detail in `docs/`.

> ⚪ **Temporary Operating Overlay — Remote Away Mode (INACTIVE as of 2026-06-15).**
> Normal owner-present governance is back in effect. Keep doing readiness, docs,
> verification, and client-unblock work, but do not treat the old remote queue as
> standing approval for live/cloud/client actions. The durable ~$10 budget ceiling,
> security rules, human-send authority, and system-of-record write gates still apply.
> Details live in `docs/away-mode.md` and `docs/budget-and-cost-policy.md`.

## Per-Runner Pointers

This repository is **runner-neutral**: `AGENTS.md` (this file) plus `docs/` hold every
durable rule, and each agent runner keeps only a thin adapter that points back here. Do not
put durable governance in a runner-specific file — if a rule matters, it belongs in this
router or a `docs/` file both runners read.

- **Claude Code** → `CLAUDE.md` (a compatibility pointer to this router) and `.claude/`
  (slash-command wrappers, `launch.json`). `.claude/` files stay thin wrappers over a
  runner-neutral capability doc, never a second copy of the rules.
- **Codex** → no repo-tracked harness config. Codex sessions read this router and `docs/`
  directly; app/session-level settings stay outside this repo.
- **Any other runner** → read `AGENTS.md` first, then `docs/loop-state.md` and
  `docs/autonomous-agent-runner.md`. The same comprehensive loop (plan → build →
  verify + falsify → stop/reset) is invoked identically regardless of runner.

The identity, security, budget, and write/send gates in this file bind every runner equally.
Harness-level autonomy settings differ by runner and may be app/session-local; document such
differences when they matter, and never let a runner's local defaults silently widen these gates.

## Purpose

Govern and build the PMI KC three-product workstream:

- PMI KC KB: source-backed knowledge and handoff web app.
- Lease Renewal Agent: separate renewal workflow product lane; discovery before runtime.
- Gmail Inbox 0: Dan-email-first Gmail workflow, successor to Owner Router/Dan's AI
  Assistant.

The old KB-only/separate-Owner-Router direction is legacy. Preserve useful history, but
route new work through the three-product docs.

## Route Table

| Need                                  | Read                                                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Solidified facts vs assumptions       | `docs/facts.md` (Tier-0 spine; read with `docs/loop-state.md` before acting)                                           |
| Feature-suite specs (backlog)         | `docs/feature-suites/`                                                                                                 |
| New/overhaul spec template + gates    | `docs/feature-suites/TEMPLATE.md` (sentinel-gated by `feature-suite-spec-shape.test.mjs` + `verify:spec-traceability`) |
| Approval Queue mobile redesign (S14)  | `docs/feature-suites/approval-queue-mobile.md`                                                                         |
| Gmail hub — drafts/templates (S15)    | `docs/feature-suites/gmail-hub.md`                                                                                     |
| Live Gmail per user (S19)             | `docs/feature-suites/gmail-live-per-user.md`                                                                           |
| Role-scoped sub-users / scopes (S16)  | `docs/feature-suites/rbac-subusers.md`                                                                                 |
| Unified Console + notifications (S17) | `docs/feature-suites/unified-console-and-attention.md`                                                                 |
| Process auto-initiation (S18)         | `docs/feature-suites/process-auto-initiation.md`                                                                       |
| Governance meta-prompts               | `docs/meta-prompts/`                                                                                                   |
| Audience profile and copy voice       | `docs/voice-and-audience.md`                                                                                           |
| North star and product direction      | `docs/north-star.md`                                                                                                   |
| Product lane routing                  | `docs/products/README.md`, then the relevant product doc                                                               |
| Continue feature development          | `docs/products/lease-renewal-build-plan.md`                                                                            |
| Renewal / move-in / move-out flow     | `docs/products/lease-renewal-discovery-reference.md`, `docs/products/move-in-move-out-process.md`                      |
| Renewal sheet connector + conflicts   | `docs/products/lease-renewal-connector-design.md`, `docs/products/lease-renewal-spreadsheet-map.md`                    |
| V1 process Q&A and owner decisions    | `docs/products/v1-process-qa.md`                                                                                       |
| Renewal discovery validation (team)   | `docs/products/lease-renewal-discovery-packet.md`                                                                      |
| Demo lane retirement                  | `docs/demo-lane-retirement.md`                                                                                         |
| Phase plan and acceptance gates       | `docs/plan.md`                                                                                                         |
| Integration and cutover               | `docs/integration-cutover-plan.md`                                                                                     |
| Verified integration architecture     | `docs/integration-architecture.md`                                                                                     |
| Integration capability research       | `docs/research/integration-capability-2026-06.md`                                                                      |
| Environment and key handoff           | `docs/environment-handoff.md`                                                                                          |
| Product definition gaps               | `docs/product-definition-gap-plan.md`                                                                                  |
| How to work next                      | `docs/implement.md`                                                                                                    |
| Autonomous feature-cycle runner       | `docs/autonomous-agent-runner.md`                                                                                      |
| Plan, run, or continue the loop       | `docs/loop-state.md`, then `docs/autonomous-agent-runner.md`                                                           |
| Cost ceiling and budget policy        | `docs/budget-and-cost-policy.md`                                                                                       |
| Vacation / away-mode overlay          | `docs/away-mode.md`                                                                                                    |
| Local-dev stop/cutover gate           | `docs/autonomous-agent-runner.md`, `docs/implement.md`                                                                 |
| Current status and blockers           | `docs/status.md`                                                                                                       |
| Loop resume state and next slice      | `docs/loop-state.md`                                                                                                   |
| Client asks                           | `docs/client-checklist.md`                                                                                             |
| Client unblock and parallel work      | `docs/status.md`, `docs/client-checklist.md`, `docs/implement.md`                                                      |
| Engineering checklist                 | `docs/engineering-checklist.md`                                                                                        |
| AI execution workflow                 | `docs/ai-execution-workflow.md`                                                                                        |
| Research backlog                      | `docs/research-backlog.md`                                                                                             |
| Security and conventions              | `docs/engineering.md`                                                                                                  |
| Original preserved specs              | `docs/specs/`                                                                                                          |
| KB technical spec                     | `docs/spec.md`                                                                                                         |
| Legacy Owner Router split             | `docs/legacy/owner-router-separate-repo.md`                                                                            |
| Owner Router artifact source          | `docs/legacy/owner-router-artifact-source.md`                                                                          |
| Google setup details                  | `docs/google-setup.md`, `SETUP.md`                                                                                     |

## Project Map

- `app/`: current PMI KC KB Next.js App Router pages and API routes.
- `components/`: KB UI components.
- `lib/`: KB auth, source-state, retrieval, prompt, Firestore, and citation boundaries.
- `docs/facts.md`: Tier-0 solidified-context spine — verified facts, labeled assumptions, open
  questions, and the supersede log. Gated by `npm run verify:context-freshness`.
- `docs/feature-suites/`: executable specs for the discussed backlog (one file per suite).
  `TEMPLATE.md` is the shape for new/overhaul specs; the 2026-07-10 overhaul suites are S14
  (approval-queue-mobile), S15 (gmail-hub), S16 (rbac-subusers), S17 (unified-console-and-attention),
  and S18 (process-auto-initiation), plus S19 (`gmail-live-per-user`) for the 2026-07-13
  owner-approved live-per-user Gmail direction — sentinel-gated by
  `feature-suite-spec-shape.test.mjs` + `verify:spec-traceability`.
- `docs/meta-prompts/`: governance-first scaffold, golden next-step set, and the re-scaffold/cleanup
  meta-prompt.
- `docs/voice-and-audience.md`: audience profile and client-facing copy voice rules.
- `docs/products/`: active product-lane docs for KB, Lease Renewal Agent, and Gmail
  Inbox 0.
- `docs/integration-architecture.md`: verified tool-role map, event model, build order,
  and the Action Registry model for external integrations.
- `docs/research/`: durable, citable research findings (e.g. integration capability).
- `docs/autonomous-agent-runner.md`: production feature-cycle runner and approval
  gates.
- `docs/loop-state.md`: single-read resume state for the unattended loop; update it at
  each slice boundary.
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
- E2E flow tests: `npm run test:e2e` (emulator) / `npm run test:e2e:core` (no emulator)
- Falsification preflight: `npm run verify:falsification`
- Reset demo data: `npm run demo:reset`
- Demo operator: `npm run demo:operator`
- Live cost preflight: `npm run check:live-cost`
- Session auth preflight (OWNER, interactive): `npm run auth:session` — run at the START of each new session, before the agent touches a live read. Refreshes the gcloud CLI login + ADC only when stale, then confirms the RentVine env. The AGENT cannot do this (org reauth is interactive-only); the agent only CHECKS with `preflight:adc` and asks the owner to run `auth:session` if it fails.
- ADC freshness preflight: `npm run preflight:adc` — the read-only check the agent runs FIRST (new session / planning) before any live Google read (Sheets/Firestore/Vertex); if it reports a stale token, the owner reauths via `npm run auth:session` (or scope-free `gcloud auth application-default login`) before building. See loop-state Resume Here.
- Golden-data capture (read-only, in-boundary): `npm run golden:capture -- --live` — writes a gitignored draft (counts-only stdout)
- Maintenance Drive folder (in-boundary, keyless DWD as a pmikcmetro.com user): `npm run maintenance:ensure-folder -- --live [--shared-drive <id>]` — find-or-creates the photo folder (in a team Shared Drive when `--shared-drive` is given, else the subject's My Drive) + prints the id for SPACE_DRIVE_FOLDER_IDS. The Drive scope is authorized + the Drive API enabled (2026-06-29). Uploads use supportsAllDrives, so Shared Drives work.
- Golden-data labeling: `npm run golden:worksheet` (build a reviewer worksheet from a draft) → team reviews → `npm run golden:apply-labels -- --worksheet <path>` (write the `labelsVerified:true` set the harness gates on). In-boundary only; never invent labels.
- GCP setup preflight: `npm run preflight:gcp -- --project=<id>` (`--live` for read-only state)
- Prepare the ignored production preflight env safely from `.env.local` (allowlisted identifiers only;
  no secrets/emulator/local-model settings):
  `npm run prepare:production-env -- --app-base-url=<canonical-production-url> --service-account=<runtime-sa>`
- Cutover report: `npm run cutover:report -- --manifest=<path> --env-file=<path> --json`
- Seed source metadata: `npm run seed:source-meta`
- Live demo smoke: `npm run smoke:demo-live`
- Live Ask smoke: `npm run smoke:ask-live`
- Queue notifications dry-run: `npm run queue:notifications -- --dry-run --date=YYYY-MM-DD`
- Demo deploy: `npm run deploy:demo`
- Deployed endpoint: https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app (Cloud Run `pmi-kc-kb-demo` on `pmi-kc-kb-prod`). Verify app/UI changes against this endpoint via `npm run smoke:ask-live -- --base-url=<endpoint>`; a local dev server is a preview only, not the deployed reality.
- Build: `npm run build`
- Full verification: `bash scripts/verify.sh`

## Conventions

- Use TypeScript with strict types and small boundary modules.
- Source states and shared vocabulary are constants; do not rename them casually.
- Enforce anti-hallucination in code before model calls.
- Keep runtime changes scoped to the relevant product lane.
- External-tool roles and per-action readiness live in the Action Registry and
  `docs/integration-architecture.md`; Maintenance Work Order Intake is the first
  executable write, and Rentvine lease-renewal writeback stays gated as undocumented.
- Add tests with any behavior change.
- Do not build Lease Renewal Agent or Gmail Inbox 0 runtime behavior until their
  product docs define scope, permissions, and acceptance gates. S19 defines and activates the
  per-user Gmail runtime; its approved actions, scopes, Pub/Sub resources, and exact-confirmation
  boundary live in the Action Registry, product spec, and production evidence artifact.

## Working Order

How a session sequences and sources its work. Owner-present time is the scarce resource;
spend it on what only a human can clear, and never hand the client a question we could
answer ourselves.

- **Front-load the human-gated, unblocking work.** At the start of an owner-present session
  (typically earlier in the day) do the manual steps first — secrets/Secret Manager,
  provisioning, credential and answer capture, approvals, reauth — so the downstream
  unattended model work stays unblocked. Clear the human bottlenecks while the human is
  here; batch the autonomous build behind them. Do not stall an easy manual unblock to keep
  coding.
- **Session-start auth — ANTICIPATE it, do not wait for a stall.** On this managed org, Google
  reauth is interactive-only, so the agent's non-interactive shell can never refresh a stale gcloud
  login or ADC — it silently stalls a live read mid-run. So, PROACTIVELY: at the start of any session
  whose work will touch a live Google read (Sheets/Firestore/Vertex) or gcloud, the agent runs the
  read-only `npm run preflight:adc` itself FIRST; and before any cost-bearing gcloud. If it is stale
  (or before continuing into work that needs it), the agent STOPS and hands the owner the exact
  command to run in their own terminal — spelled in full, with the `npm run` prefix (the bare
  `auth:session` / `run auth:session` fails in PowerShell):

      npm run auth:session

  The owner runs it (interactive; it refreshes CLI login + ADC only when stale). The agent never
  works around a stale token with a personal account. See `F-SESSION-AUTH` +
  [[gcloud-reauth-blocks-agent-shell]].

- **Self-answer before you ask.** Before routing any question to the client, exhaust what the
  repo and the developer already know: mine the transcript, `docs/` (especially the discovery
  and reference docs), and code first. The developer holds substantial context — ask the
  developer before the client. Present what you resolved as confirm-with-default; reserve
  actual client/vendor/legal contact for the irreducible decisions only (client-operational
  reality, vendor endpoints, statutory/legal rules). This is the
  `anticipate-solve-not-ask-open-questions` discipline: a drafted client note is the last
  resort, not the first move.

## Security Rules

- No secrets, tokens, customer data, raw screening records, ledgers, bank data, SSNs,
  full lease packets, or live Gmail thread content in git.
- Real client data (e.g. the renewal tracking spreadsheet) MAY be read and used as
  test/training input to improve deterministic rules and models, and for read-only
  follow-up queries — provided it stays out of git, stays out of user-facing or model
  outputs without human approval, and access stays within the authenticated
  `pmikcmetro.com` boundary. Training/testing on real data is permitted; emitting it or
  acting on it autonomously is not. The no-customer-data-in-git rule and human-send
  authority above remain in force, and approval-gated write-back (e.g. to the spreadsheet)
  still requires a per-action spec.
- Use `.env.example` for names only.
- Preserve human send authority; no autonomous send.
- Do not add system-of-record write paths to RentVine, LeadSimple, DotLoop, QuickBooks,
  Boom, operating Sheets, banks, or client Drive folders without a future approved spec.
- Missing sources produce visible uncertainty, not generic property-management answers.

## Identity Rules

- This project always uses a `pmikcmetro.com` Google identity. The personal
  `josiah.abernathy@gmail.com` account must never appear in any auth path.
- Six identity systems are separate and do NOT cascade: (a) the agent runner's file/Drive
  connector (Claude Code's MCP Drive/Workspace connector today; not applicable under Codex),
  (b) local gcloud/ADC, (c) the Cloud Run runtime service account, (d) Firebase
  end-user auth, (e) the Firebase CLI login, (f) the Cloud Build/buildpack identity. All must be
  `pmikcmetro.com` (human/connector/firebase-CLI) or a `pmi-kc-kb-prod` service identity
  (runtime/build). `gcloud auth` does NOT change the runner's file/Drive connector, and vice-versa.
- No `cherrybridge.ai` / `pmikckb-test` (legacy demo) in any production path. No downloadable
  key files — ADC (local human) and attached service account (runtime) only. The legacy demo
  cloud lane is being retired (repo pointers neutralized 2026-06-20; GCP teardown is owner-side) —
  see `docs/demo-lane-retirement.md`. Local-dev demo mode is kept but fenced from prod by the
  `NODE_ENV` guard.
- "Blocked on access" is raised as an explicit blocker, never worked around with a personal
  account or a demo-mode fallback.
- In-app role management (console overhaul 2026-07-08, `F-ADMIN-USERS`): `/admin/users` lets an Admin change a
  teammate's role via `setCustomUserClaims` — an app-plane privilege-escalation surface previously reachable only through
  the `firebase:set-role` break-glass script. It is Admin-only (`manageAdmin`), requires a plain-English reason, enforces
  the pmikcmetro.com domain boundary, writes an append-only `admin_role_changes` audit, and has a best-effort last-Admin
  guard (NOT concurrency-safe; the break-glass script recovers). Per-user domain-wide Gmail
  (`F-GMAIL-PER-USER`, evolved by S19) acts AS each signed-in user's own mailbox via DWD. The
  production runtime uses the four approved Gmail scopes and five separately governed Inbox 0 actions;
  the rollout-only pilot allowlist is removed. Every send remains
  exact-message, human-confirmed, action-gated, and audited. Firebase authentication
  and Gmail DWD authorization are separate systems.
- Full strategy, per-surface mechanisms, and migration plan:
  `docs/auth-identity-and-access-strategy.md`.

## Documentation Rules

- Read `docs/facts.md` and `docs/loop-state.md` first (Tier 0). When a fact is verified, an
  assumption is confirmed, or a question is resolved, update `docs/facts.md` with evidence and an ISO
  date. `npm run verify:context-freshness` enforces this and keeps `docs/loop-state.md` a short pointer.
- Delete-on-supersede: when new direction replaces an old gate, path, copy string, or requirement,
  delete the old text from the active doc (do not append next to it) and record it in the
  `docs/facts.md` Supersede Log with a unique marker. The freshness gate fails if a superseded rule
  still reads as active.
- Update `docs/loop-state.md` at the start of a cycle and at each slice boundary.
- Update `docs/status.md` after meaningful work.
- Update `docs/plan.md` in the same slice whenever a phase's `Status:`
  (`done`/`in progress`/`blocked`/`not started`), milestones, or acceptance criteria change —
  not only `docs/loop-state.md`/`docs/status.md`. A `blocked` phase names what it waits on;
  `tests/unit/plan-status-sync.test.mjs` enforces a valid Status on every phase.
- Update `docs/implement.md` when the operating workflow changes.
- Update `docs/products/*.md` when product scope changes.
- Preserve all original specs in `docs/specs/`.
- Mark or move stale docs as legacy instead of leaving contradictory active guidance.
- Keep `CLAUDE.md` as a short pointer to this router.

## Definition of Done

- Code compiles, lint passes, tests pass, and `bash scripts/verify.sh` passes when
  relevant and available.
- Docs reflect the change and future agents know the next step.
- `docs/plan.md` phase `Status:` lines reflect current reality when the slice moved a phase
  forward or hit a blocker.
- Blockers are concrete client asks or research questions.
- No product requirement is invented beyond confirmed sources and approved direction.

## Do Not

- Do not preserve KB-only or separate-Owner-Router assumptions as active guidance.
- Do not produce generic property-management answers for missing PMI KC sources.
- Do not add autonomous send or system-of-record writes.
- Do not commit secrets, customer records, or raw Gmail/customer source material.
- Do not skip tests for source-state, citation, permission, prompt, or cutover behavior.
