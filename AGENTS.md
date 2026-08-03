# PMI KC Product Agent Router

This file is the single **runner-neutral** router for every agent runner (Codex, Claude
Code, and any other). Durable product and execution rules live here and in `docs/`; each
runner keeps only a thin pointer back to this file — see **Per-Runner Pointers** below. Keep
durable detail in `docs/`.

> ⚪ **Temporary Operating Overlay — Remote Away Mode (INACTIVE as of 2026-06-15).**
> Normal owner-present governance is back in effect. Keep doing readiness, docs,
> verification, and client-unblock work, but do not treat the old remote queue as
> standing approval for live/cloud/client actions. The production cost ceiling owned by S52,
> security rules, human-send authority, and system-of-record write gates still apply.
> Details live in `docs/away-mode.md` and `docs/budget-and-cost-policy.md`.

## Go-Live Authorization (standing grant, 2026-07-19)

The owner granted send/draft and related permissions across the board and directed that the product
is LIVE. The DEFAULT posture is **ship-to-production**, not build-to-preview: a built, reviewed
feature ships, and its `production_allowed` gate is opened by a routine reviewed code change (seed
edit plus its pinned tests). "Pending" is reserved for a **genuine, named external dependency** (a
missing provider write endpoint or credential, e.g. a RentVine write endpoint or QuickBooks OAuth) —
never a governance default and never an open-ended "await cutover." Do not leave a finished feature
preview-only because a gate has not been flipped; flip the gate (with its tests) or name the exact
external dependency that blocks it. This is the durable fix for the recurring "features never go
live, always pending" pattern.

**D33 permanent direct-notice-send exclusion (2026-07-29).** The later production-phase decision
narrows this standing grant for client notice initiation: Gmail draft creation plus a human sending
from Gmail is the final renewal and maintenance workflow.
`gmail.renewal_notice.send`, `gmail.maintenance_owner_notice.send`, and generic
`gmail.message.send` stay Registry-closed. They are permanent non-targets under current authority,
not missing provider seams or finished features awaiting a routine flip. Retained typed executors,
preview schemas, and isolated Test receipts are historical contract evidence only; the committed
Registry rows themselves are `Disabled`.
Only a new explicit owner decision that supersedes D33 may change this exclusion.

These invariants PERMIT go-live and must be preserved — they never justify keeping a feature pending:

- Every send is human-initiated and exact-confirmed. No autonomous, scheduled, bulk, or
  model-triggered agent send. The app may send when a person confirms; the agent never sends on its
  own. For renewal and maintenance notice initiation, the app creates an unsent draft and the person
  sends it from Gmail; this invariant does not authorize a direct app-send path.
- Secrets, tokens, and customer data live in Secret Manager, never git.
- A Live system-of-record write uses its S25/S26 preview, confirm, receipt, and rollback contract.
- Sample/test data never becomes a real draft or send.
- Staff, agent, connector, cloud, build, and runtime identities stay `pmikcmetro.com`/service.

Recorded as `F-SEND-AUTHORIZED` in `docs/facts.md` (supersedes `F-WRITE-GATE`). Interactive
authentication, Google Workspace OAuth scope grants, IAM/billing changes, and destructive migrations
remain owner-run. Routine Cloud Run deploy, smoke, and traffic promotion follow the bounded D05 grant
below; neither class of operation is a governance reason to leave unrelated app-plane work pending.

## Roadmap Build Authorization (standing grant, 2026-07-23)

The owner directed that PMI KC is a **full suite of applications**, not a demo with a permanent
"next phase" list. Every roadmap gap is **built to its external seam or justified as a permanent
NEVER** — there is no third "deferred indefinitely" state. The scope, the ordered build waves, and
the exact owner-dependency list live in `docs/roadmap-unblock-2026-07-23.md` (suites S28–S39); read
it after `docs/facts.md` and `docs/loop-state.md`. Recorded as `F-ROADMAP-BUILD-AUTHORIZED`.

**Build to the seam.** For every roadmap suite the runner builds the app-plane, the live provider
implementation, and the full S25/S26 preview/confirm/receipt/rollback contract, and stops ONLY at the
single named owner dependency (a documented endpoint, a credential/scope, a vendor confirmation, a
billing approval). A fake/synthetic provider is a scaffold to be replaced, never a stopping point;
"named external dependency" scopes to that one flip, never to a whole feature. This is the operative
correction to the recurring "always pending" pattern — it strengthens `F-SEND-AUTHORIZED`, and it
overrides any older defer-first framing (the retired Migration-Readiness Stop Gate, "no safe slice",
or "owner AM steps" backlog language) wherever they still read as active.

**Owner decisions baked in (2026-07-23, see roadmap §3):** the app MAY compute a comp-derived
_suggested_ renewal rent number that enters a draft only after an explicit per-number **Admin
approval** (supersedes the owner-rent hard-exclusion `F-NEGOTIATION-EXCLUDED`; a human still sends);
RentVine renewal-write ships once the owner provides the endpoint; the no-code page/layout builder is
in scope (S37); automated notifications to internal staff are allowed while every client-facing send
stays human-confirmed (`D-AUTOMATION-LINE`).

The safety NEVERs in `docs/roadmap-unblock-2026-07-23.md` §7 (no autonomous client-facing send, no
generic blast send, personal account never in an auth path, no PII/guessed-endpoint in git, the
S52 production cost ceiling, every live effect reversible) are preserved and are the ONLY
permanent exclusions.

## UI/UX Recalibration Authorization (standing grant, 2026-07-28)

The owner accepted all 42 findings and all nine workstreams in the UI/UX audit, settled D-01–D-14,
directed that implementation-grade specs be written for a fresh-context loop, and explicitly opened
both `spec_writing_allowed` and `loop_execution_allowed`. The controlling program is
`docs/ui-ux-recalibration-implementation-program-2026-07-28.md`; its executable suites are S40–S50
and its canonical unattended fresh-context launcher is
`docs/meta-prompts/ui-ux-recalibration-unattended-loop.md`, which incorporates
`docs/fresh-context-ui-ux-recalibration-prompt-2026-07-28.md` as the locked end-state contract.
Recorded as `F-UIUX-RECALIBRATION-AUTHORIZED`.

**Environment outcome (updated by `F-DEMO-DEFERRED-LOCAL-FIRST` and S56).** Production contains Live
data only and exposes no Demo/Test records, seeders, simulators, or product tools. Rehearsal is local:
the server-owned descriptor must resolve exactly to `environmentKind:"demo"` plus
`dataContext:"live_readonly"` with `source:"explicit"`, and every mutation/provider-effect path
must refuse. The separately hosted Demo GCP project contemplated by the original S40 program is
deferred; do not provision it or seed invented product fixtures. Blue/green remains the Production
revision-promotion/rollback procedure, not a synonym for Demo/Production. The former Production
Live+Test behavior and its receipts remain dated historical evidence only. Routine Production
deploy, smoke, exact-revision traffic promotion, and rollback follow D05; authority, cost, D12, and
destructive-migration fences remain unchanged.

**Tool-retirement target.** Delete shipped browser simulations, hard-coded actors, no-op Sample
controls, duplicate readiness matrices, and lab handoffs. Do not create a replacement Test Lab.
Preserve automated tests, deterministic test-only fixtures, emulators/fake test transports, current
security/TOTP/rollback controls, and real provider seams awaiting one documented setup dependency.
Removal is two-stage and evidence-backed; static import reachability alone is never deletion proof.

**Gate interpretation.** Opening the program loop does not preflip action-level
`production_allowed`. App-plane suites ship without an Action Registry gate. A provider action gate
opens in its owning implementation slice when its endpoint/mapping/identity and full action contract
are documented; an undocumented provider action remains closed and blocks only that activation.

## Production Phase Authorization (standing grant, 2026-07-29)

The owner completed the 64-item production-unblock audit (round 1) and directed PMI KC into a
**live production phase**. The questionnaire's browser-local selections were not exported, so the
repository's per-decision record is a sanitized provenance-labeled reconstruction and unresolved
receipt choices stay safely closed. This section is the controlling grant; the decision record is
`docs/production-phase-decision-record-2026-07-29.md`, the durable fact is
`F-PRODUCTION-PHASE-AUTHORIZED` in `docs/facts.md`, and the executable work is S51–S54.

**Live data.** PMI KC has authorized processing of live resident, owner, and lease data in
Production (D03, owner-attested from a transcribed call, 2026-07-29). Live data is no longer a
pending permission. The handling rules under Security Rules below continue to bind unchanged.

**The green light is a list of named action keys, never a category (D02).** There is no category,
readiness-tier, or "everything that is ready" grant, because `lib/integrations/action-gate.ts`
resolves a per-key seed lookup and has no category concept — a category-shaped grant would be
expanded into specific keys by the runner rather than by the owner, which is exactly the reviewed
decision the gate exists to force. Activation is per key with a one-line justification and is
owned by S53. Routing the live Sheet write-back back through its gate is a prerequisite of the
first flip.

**Loop autonomy (D04, D05, D06, D10, D12).** The runner has standing authority to:

- commit and push to `main` whenever the full local gate is green — no force-push, history
  rewrite, tag/release creation, or branch deletion;
- deploy a routine application revision to an already provisioned service, smoke it, and promote
  revision traffic when the gate, preflights, prior-revision capture, and rollback proof all pass;
- continue through uncertainty: queue the question in one owner packet, apply a documented safe
  default, and keep building instead of stopping;
- interleave any S28–S39 provider seam whenever no S40–S54 slice is mid-flight, except S36/S37.

These are standing grants, not per-session permissions. They are bounded by the protected paths
below and by the safety invariants, which no grant overrides.

D05 as written did not create a service/project or mutate Pub/Sub endpoints/audiences, Firebase
authorized domains, OAuth redirects, IAM, billing, quotas, scopes, credentials, or destructive data.
**That exclusion is superseded by the Cloud Automation Grant below, except for the short fenced list
it names.** The S31 Scheduler job was the only additional cloud-resource grant before 2026-08-01.

## Cloud Automation Grant (standing grant, 2026-08-01)

The owner directed, in a recorded Q&A round, that the runner apply the production cost ceiling
directly "both here and in the future", giving as the reason that requiring per-command owner
approval "blocks automation CONSISTENTLY" and that this outcome is to be avoided going forward.
This grant exists to remove that block, and it is deliberately broad.

**The runner has standing authority to run cloud-configuration commands under the owner's managed
identity, without asking first.** This covers: billing budgets, thresholds, notification channels
and their attachment; the guardrail ceiling env when raised in lockstep with its budget; quota
requests and API enablement; Firebase authorized domains; OAuth redirect URIs; Pub/Sub topics,
subscriptions and push endpoints; IAM grants required for the application's own operation; Cloud Run
and Cloud Functions creation, deployment, tagging, promotion and retirement; and GCP project
creation when a named suite requires it.

Three preconditions apply. They are engineering requirements, not approval steps: the identity is a
managed `pmikcmetro.com` or project service identity and never a personal account; every change is
read back from the live resource and verified rather than assumed applied; and the outcome is
recorded in `docs/facts.md` with its verified values.

**What this grant does not cover.** Each of these stays fenced because its risk lands on the client
or is asymmetric, not because it is inconvenient. The owner can widen any of them by naming it:

- The D12 protected paths. The owner set that list separately and did not change it here.
- Client-facing sends and system-of-record writes. Every one stays human-initiated and
  exact-confirmed. No automation or cost argument reaches them.
- **Lowering** a safety control: reducing a budget ceiling, disabling the guardrail, removing an
  authorized domain still in use, or narrowing an alert. Raising headroom is reversible; removing a
  control that live traffic depends on is an outage, so it keeps the old asking rule.
- Destructive Production data operations, which stay two-stage with backup, dry-run and rollback.
- Anything needing a credential, secret, or vendor-side action the owner holds outside GCP.

**Protected paths (D12).** A change to any of these is prepared and surfaced for owner review rather
than pushed under the standing grant: `firestore.rules`; `lib/integrations/action-gate.ts`;
`lib/auth/**`; any `production_allowed` change in
`lib/integrations/action-registry-seed.ts`; `scripts/check-budget-guard.mjs`; and
`infra/budget-guardrail/**`. This is the six-item list selected in the audit; do not silently expand
or contract it. A protected change is isolated, verified, and parked while dependency-independent
slices continue.

Authority-bearing changes to this router or `docs/facts.md` still require explicit owner direction,
even though they are not D12 code paths. Append-only verified implementation facts, Q/A resolutions,
and Supersede Log markers may commit and push with their green slice when they do not widen an action
key, identity, safety NEVER, cost gate, protected-path list, or live-effect authority. The 2026-07-29
production-phase governance reconciliation is explicitly owner-authorized for commit and merge; that
authorization does not generalize to future authority changes or to any protected code path.

**Narrow S31 cloud grant (D37).** In addition to routine D05 application deploys, the runner may
create or update only the S31 Gmail-watch Cloud Scheduler job after S52 has a non-null verified
ceiling, auth and budget preflights pass, the exact managed OIDC service account and audience are
documented, the print-only plan is reviewed, and a rollback/delete command is captured. This is not
authority to create arbitrary cloud resources. Monitoring channels/policies, IAM, billing, secrets,
credentials, and scope grants remain owner-run.

**Cost ceiling (D01).** The former flat cloud-cost cap is superseded. It was wired to a kill
switch whose only behavior is to disable billing on the production project — a self-inflicted
outage with no operator notification — and it was a per-calendar-month limit widely misdescribed
as a lifetime total. S52 owns the replacement: a hard stop set above realistic monthly burn, kept
armed, plus a mid-level alert-only threshold that reaches the operator directly. Both enforcement
points (the budget amount and the guardrail's own `KILL_SWITCH_CAP_USD`) move together, because
the function applies the smaller of the two. Until S52 sets its value, no cost-bearing step may
assume the retired figure.

**Rollout (D08).** Live operation begins as a bounded pilot — a named property set or the next
renewal cohort, two to four weeks, with a stated abort trigger — not a simultaneous
everything-on cutover.

**Unchanged by this grant.** Every safety invariant in the Go-Live Authorization above and in
roadmap §7 survives intact: no autonomous, scheduled, bulk, or model-triggered client-facing
send; secrets in Secret Manager, never git; a Live system-of-record write keeps its
preview/confirm/receipt/rollback contract; sample data never becomes a real draft or send;
managed `pmikcmetro.com`/service identities only; no guessed provider endpoint; every live effect
reversible. A green light activates a documented capability — it never relaxes one of these.

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
- Lease Renewal Agent: working renewal workflow product lane; the prior Production Test journey is
  historical implementation evidence, while current rehearsal is local, explicit Demo +
  Live-read-only and effect-refused. Each Live provider action continues to activate independently.
- Workflow Communications: Gmail-backed communication adapter and evidence source for
  renewal and maintenance workflows; compatibility routes retain the old Gmail Hub name.

The old KB-only/separate-Owner-Router direction is legacy. Preserve useful history, but
route new work through the three-product docs.

## Route Table

| Need                                    | Read                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Solidified facts vs assumptions         | `docs/facts.md` (Tier-0 spine; read with `docs/loop-state.md` before acting)                                           |
| Feature-suite specs (backlog)           | `docs/feature-suites/`                                                                                                 |
| New/overhaul spec template + gates      | `docs/feature-suites/TEMPLATE.md` (sentinel-gated by `feature-suite-spec-shape.test.mjs` + `verify:spec-traceability`) |
| Approval Queue mobile redesign (S14)    | `docs/feature-suites/approval-queue-mobile.md`                                                                         |
| Gmail hub — drafts/templates (S15)      | `docs/feature-suites/gmail-hub.md`                                                                                     |
| Live Gmail per user (S19)               | `docs/feature-suites/gmail-live-per-user.md`                                                                           |
| V1 gap implementation program           | `docs/v1-gap-implementation-program-2026-07-14.md`, then S20–S27                                                       |
| Full-suite build program (S28–S39)      | `docs/roadmap-unblock-2026-07-23.md` (scope, waves, owner deps; read after facts + loop-state)                         |
| UI/UX implementation program (S40–S50)  | `docs/ui-ux-recalibration-implementation-program-2026-07-28.md` (controlling target + order)                           |
| Unattended fresh-context UI/UX loop     | `docs/meta-prompts/ui-ux-recalibration-unattended-loop.md` (canonical launcher; auth/blockers first)                   |
| UI/UX execution end-state contract      | `docs/fresh-context-ui-ux-recalibration-prompt-2026-07-28.md`                                                          |
| Market comp provider + screenshot (S28) | `docs/feature-suites/market-comp-data.md`                                                                              |
| Comp-informed rent suggestion (S29)     | `docs/feature-suites/rent-suggestion-admin-gated.md`                                                                   |
| RentVine write activation (S30)         | `docs/feature-suites/rentvine-write-activation.md`                                                                     |
| Gmail reply-watch + follow-up (S31)     | `docs/feature-suites/gmail-watch-inbound.md`                                                                           |
| KB corrections learning loop (S32)      | `docs/feature-suites/kb-corrections-learning.md`                                                                       |
| Ask to action orchestration (S33)       | `docs/feature-suites/ask-to-action.md`                                                                                 |
| Dotloop e-sign activation (S34)         | `docs/feature-suites/dotloop-esign-activation.md`                                                                      |
| LeadSimple connector activation (S35)   | `docs/feature-suites/leadsimple-activation.md`                                                                         |
| Space self-service provisioning (S36)   | `docs/feature-suites/space-self-provisioning.md`                                                                       |
| No-code page/layout builder (S37)       | `docs/feature-suites/nocode-page-builder.md`                                                                           |
| Maintenance notice activation (S38)     | `docs/feature-suites/maintenance-notice-activation.md`                                                                 |
| Internal notifications + center (S39)   | `docs/feature-suites/internal-notifications.md`                                                                        |
| Demo/Production separation (S40)        | `docs/feature-suites/environment-deployment-separation.md`                                                             |
| Shell/navigation/vocabulary (S41)       | `docs/feature-suites/shell-navigation-vocabulary.md`                                                                   |
| Attention + Spaces flow (S42)           | `docs/feature-suites/attention-and-spaces-flow.md`                                                                     |
| Canonical Renewal workspace (S43)       | `docs/feature-suites/lease-renewal-canonical-workspace.md`                                                             |
| Evidence/provider backlinks (S44)       | `docs/feature-suites/evidence-provider-backlinks.md`                                                                   |
| Approval one-card flow (S45)            | `docs/feature-suites/approval-queue-consolidation.md`                                                                  |
| Maintenance operator workspace (S46)    | `docs/feature-suites/maintenance-operator-workspace.md`                                                                |
| Resident Maintenance intake (S47)       | `docs/feature-suites/resident-maintenance-intake.md`                                                                   |
| Admin/Connections/tool retirement (S48) | `docs/feature-suites/admin-connections-tool-retirement.md`                                                             |
| Compatibility/code/QA retirement (S49)  | `docs/feature-suites/compatibility-code-qa-retirement.md`                                                              |
| S37 builder recalibration (S50)         | `docs/feature-suites/nocode-builder-recalibration.md`                                                                  |
| **Unattended production-phase loop**    | `docs/meta-prompts/production-phase-unattended-loop.md` (canonical fresh-context launcher, runner-neutral)             |
| Production operational readiness (S51)  | `docs/feature-suites/production-operational-readiness.md`                                                              |
| Production cost governance (S52)        | `docs/feature-suites/production-cost-governance.md`                                                                    |
| Green-light activation + gates (S53)    | `docs/feature-suites/greenlight-activation-and-gate-integrity.md`                                                      |
| Verification and CI parity (S54)        | `docs/feature-suites/verification-and-ci-parity.md`                                                                    |
| Production decision record              | `docs/production-phase-decision-record-2026-07-29.md`                                                                  |
| Client/vendor asks for this phase       | `docs/client-asks-2026-07-29.md`                                                                                       |
| V1 execution authority (S20)            | `docs/feature-suites/execution-authority.md`                                                                           |
| Immediate trusted publication (S21)     | `docs/feature-suites/trusted-publication.md`                                                                           |
| External Vendor + Gmail OAuth (S22)     | `docs/feature-suites/vendor-portal-and-mailbox.md`                                                                     |
| Console live/test boundary (S23)        | `docs/feature-suites/console-live-data.md`                                                                             |
| Communications policy (S24)             | `docs/feature-suites/communications-policy.md`                                                                         |
| Lease external execution (S25)          | `docs/feature-suites/lease-renewal-execution.md`                                                                       |
| Maintenance external execution (S26)    | `docs/feature-suites/maintenance-execution.md`                                                                         |
| V1 working-app acceptance (S27)         | `docs/feature-suites/v1-release-acceptance.md`                                                                         |
| Role-scoped sub-users / scopes (S16)    | `docs/feature-suites/rbac-subusers.md`                                                                                 |
| Unified Console + notifications (S17)   | `docs/feature-suites/unified-console-and-attention.md`                                                                 |
| Process auto-initiation (S18)           | `docs/feature-suites/process-auto-initiation.md`                                                                       |
| Governance meta-prompts                 | `docs/meta-prompts/`                                                                                                   |
| Audience profile and copy voice         | `docs/voice-and-audience.md`                                                                                           |
| North star and product direction        | `docs/north-star.md`                                                                                                   |
| Product lane routing                    | `docs/products/README.md`, then the relevant product doc                                                               |
| Continue feature development            | `docs/loop-state.md`, `docs/plan.md`, then the relevant current product/spec doc                                       |
| What to do next (open decisions)        | `docs/whats-next.md` (findings + context + recommendations; read after `docs/facts.md` + `docs/loop-state.md`)         |
| Hand-test the built app (manual QA)     | `docs/manual-qa-walkthrough-2026-07-21.md` (click-by-click walkthrough of every macro feature)                         |
| Browser QA audit-and-fix meta-prompt    | `docs/meta-prompts/qa-audit-and-fix.md` (hand to a browser+repo agent to test, fix, and annotate the walkthrough)      |
| Renewal / move-in / move-out flow       | `docs/products/lease-renewal-discovery-reference.md`, `docs/products/move-in-move-out-process.md`                      |
| Renewal sheet connector + conflicts     | `docs/products/lease-renewal-connector-design.md`, `docs/products/lease-renewal-spreadsheet-map.md`                    |
| V1 process Q&A and owner decisions      | `docs/products/v1-process-qa.md`                                                                                       |
| Renewal discovery validation (team)     | `docs/products/lease-renewal-discovery-packet.md`                                                                      |
| Demo lane retirement                    | `docs/demo-lane-retirement.md`                                                                                         |
| Phase plan and acceptance gates         | `docs/plan.md`                                                                                                         |
| Integration and cutover                 | `docs/integration-cutover-plan.md`                                                                                     |
| Verified integration architecture       | `docs/integration-architecture.md`                                                                                     |
| Integration capability research         | `docs/research/integration-capability-2026-06.md`                                                                      |
| Environment and key handoff             | `docs/environment-handoff.md`                                                                                          |
| Product definition gaps                 | `docs/product-definition-gap-plan.md`                                                                                  |
| How to work next                        | `docs/implement.md`                                                                                                    |
| Autonomous feature-cycle runner         | `docs/autonomous-agent-runner.md`                                                                                      |
| Plan, run, or continue the loop         | `docs/loop-state.md`, then `docs/autonomous-agent-runner.md`                                                           |
| Fresh-context final-V1 continuation     | `docs/fresh-context-v1-implementation-prompt-2026-07-14.md`                                                            |
| Cost ceiling and budget policy          | `docs/budget-and-cost-policy.md`                                                                                       |
| Vacation / away-mode overlay            | `docs/away-mode.md`                                                                                                    |
| Local-dev stop/cutover gate             | `docs/autonomous-agent-runner.md`, `docs/implement.md`                                                                 |
| Current status and blockers             | `docs/status.md`                                                                                                       |
| Loop resume state and next slice        | `docs/loop-state.md`                                                                                                   |
| Current app functionality walkthrough   | `docs/pmi-kc-current-app-walkthrough.html`; dated V1/demo guides remain historical evidence                            |
| Client asks                             | `docs/client-checklist.md`                                                                                             |
| Client unblock and parallel work        | `docs/status.md`, `docs/client-checklist.md`, `docs/implement.md`                                                      |
| Engineering checklist                   | `docs/engineering-checklist.md`                                                                                        |
| AI execution workflow                   | `docs/ai-execution-workflow.md`                                                                                        |
| Research backlog                        | `docs/research-backlog.md`                                                                                             |
| Security and conventions                | `docs/engineering.md`                                                                                                  |
| Original preserved specs                | `docs/specs/`                                                                                                          |
| KB technical spec                       | `docs/spec.md`                                                                                                         |
| Legacy Owner Router split               | `docs/legacy/owner-router-separate-repo.md`                                                                            |
| Owner Router artifact source            | `docs/legacy/owner-router-artifact-source.md`                                                                          |
| Google setup details                    | `docs/google-setup.md`, `SETUP.md`                                                                                     |

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
  owner-approved live-per-user Gmail direction. The working V1 contract is executable as
  S20–S27 (execution authority, trusted publication, Vendor portal/OAuth, Console data, communications
  policy, Lease actions, Maintenance actions, and release acceptance) through
  `docs/v1-gap-implementation-program-2026-07-14.md`. S40–S50 execute the 2026-07-28 environment,
  IA, workflow, retirement, and page-builder recalibration through
  `docs/ui-ux-recalibration-implementation-program-2026-07-28.md`. All overhaul specs are
  sentinel-gated by `feature-suite-spec-shape.test.mjs` + `verify:spec-traceability`.
- `docs/meta-prompts/`: governance-first scaffold, golden next-step set, and the re-scaffold/cleanup
  meta-prompt.
- `docs/voice-and-audience.md`: audience profile and client-facing copy voice rules.
- `docs/products/`: active product-lane docs for KB, Lease Renewal Agent, and Workflow
  Communications.
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
  map for historical source-material mining only.
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
- Local rehearsal: `npm run dev` resolves `environmentKind:"demo"` +
  `dataContext:"live_readonly"` with `source:"explicit"`; it has no seeded product fixtures and no
  mutation/provider-effect authority.
- Live cost preflight: `npm run check:live-cost`
- Session auth preflight (OWNER, interactive): `npm run auth:session` — run at the START of each new session, before the agent touches a live read. Refreshes the gcloud CLI login + ADC only when stale, then confirms the RentVine env. The AGENT cannot do this (org reauth is interactive-only); the agent only CHECKS with `preflight:adc` and asks the owner to run `auth:session` if it fails.
- ADC freshness preflight: `npm run preflight:adc` — the read-only check the agent runs FIRST (new
  session / planning) before any live Google read (Sheets/Firestore/Vertex); if it reports a stale
  token, the exact owner remediation is `npm run auth:session`. Park live reads and cloud mutations
  until it passes, while independent local/app-plane building continues. See loop-state Resume Here.
- Golden-data capture (read-only, in-boundary): `npm run golden:capture -- --live` — writes a gitignored draft (counts-only stdout)
- Maintenance Drive folder (in-boundary, keyless DWD as a pmikcmetro.com user): `npm run maintenance:ensure-folder -- --live [--shared-drive <id>]` — find-or-creates the photo folder (in a team Shared Drive when `--shared-drive` is given, else the subject's My Drive) + prints the id for SPACE_DRIVE_FOLDER_IDS. The Drive scope is authorized + the Drive API enabled (2026-06-29). Uploads use supportsAllDrives, so Shared Drives work.
- Golden-data labeling: `npm run golden:worksheet` (build a reviewer worksheet from a draft) → team reviews → `npm run golden:apply-labels -- --worksheet <path>` (write the `labelsVerified:true` set the harness gates on). In-boundary only; never invent labels.
- GCP setup preflight: `npm run preflight:gcp -- --project=<id>` (`--live` for read-only state)
- Prepare the ignored production preflight env safely from `.env.local` (allowlisted identifiers only;
  no secrets/emulator/local-model settings):
  `npm run prepare:production-env -- --app-base-url=<canonical-production-url> --service-account=<runtime-sa>`
- Cutover report:
  `npm run cutover:report -- --manifest=<path> --env-file=<path> --prior-revision=<captured-serving-revision> --json`
- Seed source metadata: `npm run seed:source-meta`
- Live Ask smoke: `npm run smoke:ask-live`
- Queue notifications dry-run: `npm run queue:notifications -- --dry-run --date=YYYY-MM-DD`
- Production release plan: `npm run release -- --environment=production --service=pmi-kc-app --plan-only`
- Current Production endpoint: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app (Cloud Run
  `pmi-kc-app` on `pmi-kc-kb-prod`). Verify current app/UI changes against this endpoint via
  `npm run smoke:ask-live -- --base-url=<endpoint>`.
- Build: `npm run build`
- Full verification: `bash scripts/verify.sh`

## Conventions

- Use TypeScript with strict types and small boundary modules.
- Source states and shared vocabulary are constants; do not rename them casually.
- Enforce anti-hallucination in code before model calls.
- Keep runtime changes scoped to the relevant product lane.
- External-tool roles and per-action activation live in the Action Registry and
  `docs/integration-architecture.md`. Production contains Live data only. Safe rehearsal runs locally
  as explicit `environmentKind:"demo"` + `dataContext:"live_readonly"` and refuses durable writes
  and provider effects. The retired Production Test lane is historical evidence only. A feature is
  Live when its reviewed gate is flipped; local rehearsal never blocks or delays that Live action.
- Add tests with any behavior change.
- Build every roadmap suite (S28–S39, indexed by `docs/roadmap-unblock-2026-07-23.md`) to its
  external seam per the Roadmap Build Authorization above — the app-plane, the live provider, and the
  full action contract — stopping only at the one named owner dependency, never at a fake provider or
  a frozen "V1 done" line. The roadmap doc plus the feature-suite specs ARE the scope; "beyond the
  docs" means beyond THAT set. S19 preserves the proven per-user Gmail transport restricted to
  authorized workflow-linked communications. Preserve the safety NEVERs: no autonomous client-facing
  send, generic non-workflow compose/send stays Registry-closed, and unrelated mailbox browsing is
  not a product capability.
- Execute S40–S50 in the dependency order from the 2026-07-28 program. Meet the hyper-specific
  observable end state while treating named files/components in a suite as examples after discovery.
  Do not reopen D-01–D-14. Do not start S37/S50 against the pre-recalibration IA. At each bounded
  slice, test, falsify, update facts/loop state, and perform two-stage retirement rather than a
  big-bang deletion.

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
  while the owner is present, the agent stops before the live/cloud step and hands the owner the exact
  command to run in their own terminal — spelled in full, with the `npm run` prefix (the bare
  `auth:session` / `run auth:session` fails in PowerShell):

      npm run auth:session

  The owner runs it (interactive; it refreshes CLI login + ADC only when stale). During an unattended
  run, stale auth parks live reads and cloud mutations while independent local/app-plane slices continue
  with every live gate closed; it does not authorize a personal-account workaround or a fabricated live
  result. See `F-SESSION-AUTH` +
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
- A Live system-of-record write to RentVine, LeadSimple, DotLoop, QuickBooks, Boom, operating
  Sheets, banks, or client Drive must use its exact S25/S26 action contract, documented provider
  semantics, least-privilege identity, authoritative mapping, target/effect preview, human
  confirmation, one-attempt/idempotency guard, receipt/readback, monitoring, and rollback. An
  unavailable contract blocks that Live action only. Local rehearsal may exercise bounded Live
  reads and refusal behavior, while deterministic automated tests cover invented scenarios; neither
  creates a Live receipt or substitutes for exact Live proof.
- Missing sources produce visible uncertainty, not generic property-management answers.

## Identity Rules

- PMI KC staff, agent, connector, cloud, admin, runtime, build, and delegated-Workspace access always
  use a `pmikcmetro.com` or `pmi-kc-kb-prod` identity. The personal
  `josiah.abernathy@gmail.com` account must never appear in any auth path. V1 has a separately scoped
  external Vendor principal: Admin invite, password setup, verified-email TOTP before ticket detail,
  and assigned-ticket-only authorization. Product Test/Demo Vendor provisioning is retired; local
  Live-read-only rehearsal cannot create, reset, assign, authenticate, or operate a Vendor. A Live
  Vendor uses the Vendor's own same-address Gmail/Google Workspace mailbox through
  per-vendor server-side OAuth; its OAuth client/vault is an optional per-Vendor Live activation. It
  never uses DWD or gains PMI KC cloud, admin, connector, internal Space, or cross-mailbox authority.
  Identity class wins over email domain: any Firebase principal carrying a `vendor`, `vendor_id`, or
  `data_mode` custom-claim key is excluded from internal People/Access and last-Admin accounting,
  cannot receive internal role/scope claims, and cannot establish an internal staff session even when
  a claim is false/empty/malformed or the address uses `pmikcmetro.com`. The separate Vendor path
  requires the exact valid `vendor:true` + canonical `vendor_id` + matching `data_mode` tuple.
- Six identity systems are separate and do NOT cascade: (a) the agent runner's file/Drive
  connector (Claude Code's MCP Drive/Workspace connector today; not applicable under Codex),
  (b) local gcloud/ADC, (c) the Cloud Run runtime service account, (d) Firebase
  end-user auth, (e) the Firebase CLI login, (f) the Cloud Build/buildpack identity. All must be
  `pmikcmetro.com` (internal human/connector/firebase-CLI) or a `pmi-kc-kb-prod` service identity
  (runtime/build). The S22 external Vendor Firebase/OAuth principal is the only scoped exception
  and cannot be reused for any of those six systems. `gcloud auth` does NOT change the runner's
  file/Drive connector, and vice-versa.
- No `cherrybridge.ai` / `pmikckb-test` (legacy demo) in any production path. Hosted Demo GCP
  provisioning is deferred under `F-DEMO-DEFERRED-LOCAL-FIRST`; do not infer or create Demo cloud
  resource names. No downloadable key files — ADC (local human) and attached service account
  (runtime) only. Rehearsal is local and must carry the exact explicit Demo + Live-read-only typed
  descriptor; it is not a cloud environment and cannot fall back to Production mutation authority.
  Historical legacy-cloud retirement evidence remains in `docs/demo-lane-retirement.md`.
- "Blocked on access" is raised as an explicit blocker, never worked around with a personal
  account or a demo-mode fallback.
- In-app role management (console overhaul 2026-07-08, `F-ADMIN-USERS`): `/admin/users` lets an Admin change a
  teammate's role via `setCustomUserClaims` — an app-plane privilege-escalation surface previously reachable only through
  the `firebase:set-role` break-glass script. It is Admin-only (`manageAdmin`), requires a plain-English reason, enforces
  the pmikcmetro.com domain boundary, writes an append-only `admin_role_changes` audit, and has a best-effort last-Admin
  guard (NOT concurrency-safe; the break-glass script recovers). Per-user domain-wide Gmail
  (`F-GMAIL-PER-USER`, evolved by S19) acts AS each signed-in user's own mailbox via DWD. The
  production transport uses the four approved Gmail scopes and separately governed actions;
  the rollout-only pilot allowlist is removed. The application exposes workflow-linked reads,
  governed labels, review-only source-backed proposals, exact-confirmed replies, and — per the
  2026-07-19 go-live grant — the authorized Gmail notice draft-into-Gmail actions (renewal
  owner/tenant, maintenance owner), each cleared to activate through its reviewed seed gate. Generic
  non-workflow new-message sending stays permanently off under current authority (no arbitrary
  blast). D33 also makes renewal and maintenance direct-notice-send keys permanent non-targets; only
  a new explicit owner decision that supersedes D33 may change either exclusion. Every activated
  linked-thread reply or draft remains exact-message, human-confirmed, action-gated, and audited.
  Firebase authentication and Gmail DWD authorization are separate systems.
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
- No product requirement is invented beyond confirmed sources and approved direction. Where a
  point is genuinely undecided, the runner records it in the single owner packet, applies a
  documented safe default, and continues; an undecided point is not by itself a stop condition
  (D06, Production Phase Authorization).

## Do Not

- Do not preserve KB-only or separate-Owner-Router assumptions as active guidance.
- Do not produce generic property-management answers for missing PMI KC sources.
- Do not add autonomous sends or Live external writes that bypass the exact action preview,
  confirmation, receipt, reconciliation, and rollback boundary.
- Do not commit secrets, customer records, or raw Gmail/customer source material.
- Do not skip tests for source-state, citation, permission, prompt, or cutover behavior.
