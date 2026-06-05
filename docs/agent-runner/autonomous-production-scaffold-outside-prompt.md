# Outside Prompt: Autonomous Production Scaffold

Paste the prompt below into a fresh assistant or model session that has access to this
repository. It is designed to execute the production documentation and routing scaffold
for the autonomous feature-cycle loop.

## Prompt

You are a senior product-engineering agent for the PMI KC three-product workstream. Your
job is to implement the production documentation scaffold for an autonomous feature-run
cycle, not to invent new product requirements or make live client-environment changes.

Use explicit repository context first. Treat `AGENTS.md` as the routing entrypoint and
keep it concise. Durable detail belongs in `docs/`. If `CLAUDE.md` exists, keep it
functionally equivalent to `AGENTS.md`. If it does not exist, add the lightest compatible
route, preferably a symlink to `AGENTS.md` when the environment supports symlinks; if a
symlink is not practical, create a short file that points readers to `AGENTS.md` and
does not duplicate durable guidance.

Current product direction:

- PMI KC KB is the existing source-backed Next.js/Firebase/Firestore/Vertex/Gemini app
  and current production-lift lane.
- Lease Renewal Agent is a separate product lane and the first backend automation target
  after KB production, but runtime behavior must wait for approved scope, permissions,
  and acceptance gates.
- Gmail Inbox 0 is the Dan-email-first Gmail workflow and successor to Owner
  Router/Dan's AI Assistant. It preserves human send authority.

Read this context before editing:

- `AGENTS.md`
- `docs/north-star.md`
- `docs/products/README.md`
- the relevant `docs/products/*.md` files
- `docs/plan.md`
- `docs/implement.md`
- `docs/ai-execution-workflow.md`
- `docs/status.md` from the latest entry backward
- `docs/client-checklist.md`
- `docs/research-backlog.md`
- `docs/engineering.md`
- `docs/engineering-checklist.md`
- this prompt pack in `docs/agent-runner/`

Also inspect `docs/legacy/` and `docs/specs/` only to identify stale direction that
should stay out of active routing. Do not let KB-only or separate Owner Router assumptions
override the current three-product direction.

Implement the scaffold as documentation and routing only:

- Add a durable autonomous runner document under `docs/` that defines how an agent
  responds when the user says "let's plan the next feature run cycle".
- Update `AGENTS.md` to route autonomous feature-cycle work to that durable runner
  document while keeping `AGENTS.md` under 150 lines.
- Update `docs/ai-execution-workflow.md` and `docs/implement.md` so future agents know
  when to use the new feature-cycle loop.
- Add or update handoff guidance that tells an agent how to track client asks, blockers,
  setup requirements, cost approvals, verification, commit queue status, and final user
  review.
- Update `docs/client-checklist.md` or `docs/research-backlog.md` only when the scaffold
  identifies a concrete new client ask or research question.
- Update `docs/status.md` after meaningful work.

The durable runner document must specify:

- Context intake order and how to select the relevant product lane.
- How to convert roadmap/status/client-checklist information into a feature-cycle
  planning packet.
- How to front-load decisions during planning so implementation can run unattended.
- Which choices may be made autonomously from existing docs and which require explicit
  user approval.
- A strict approval gate for anything that incurs cloud/API costs, changes billing,
  touches a client environment, creates or changes API keys, deploys, imports live
  sources, reads or modifies live Gmail, sends email, or writes to external systems.
- Secrets guidance for local development, production, staging, client handoff, and team
  ownership.
- A blocker protocol: search current context first, retry if the missing answer is
  discoverable, then record a concrete blocker only when the work cannot safely continue.
- A parallel human-side track for client asks, manual setup, draft communications, and
  handoff.
- The unattended implementation loop: plan, build, verify, prepare a commit queue, then
  ask the user to verify behavior at the end instead of after every phase.
- Verification expectations and final output format.
- Cross-agent compatibility so Codex, Claude, and other code-capable models can follow
  the same loop.

Safety boundaries:

- Do not commit secrets, tokens, customer records, raw Gmail content, leases, ledgers,
  bank data, SSNs, or client-private records.
- Do not add autonomous send.
- Do not add system-of-record writes to RentVine, LeadSimple, DotLoop, QuickBooks, Boom,
  operating Sheets, banks, ledgers, or client Drive folders without a future approved
  spec, approval flow, tests, audit fields, and rollback/error handling.
- Missing sources must produce visible uncertainty, not generic property-management
  answers.
- Do not make cloud, billing, API, Gmail, deployment, import, or client-environment
  changes without explicit approval.
- Do not run mutating setup scripts, deploys, imports, or key-creation steps unless the
  user has explicitly approved that exact action.

Use the supporting docs in this prompt pack as the implementation spec:

- `docs/agent-runner/autonomous-production-scaffold-spec.md`
- `docs/agent-runner/autonomous-feature-cycle-runbook.md`
- `docs/agent-runner/autonomous-agent-handoff-template.md`

If active repo docs conflict with this prompt pack, preserve the current three-product
product facts and non-negotiable safety rules, then update the prompt-pack-derived
wording so the final durable docs are internally consistent.

Validation:

- Run the smallest relevant checks for documentation changes.
- At minimum, run format checking and the router-boundary check if available.
- Run the full verification script only if the change or repo state makes it relevant
  and practical.
- If a check cannot run, record the reason and the residual risk.

Final response:

- Name the files changed.
- Summarize the new autonomous feature-cycle route.
- State validation run and results.
- List remaining blockers or client asks.
- Do not claim production/client-environment work was completed unless it actually was.
