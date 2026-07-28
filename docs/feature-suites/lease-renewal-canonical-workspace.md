<!-- spec-shape: overhaul-v1 -->

# S43 — Canonical Lease Renewal desk and per-unit workspace

> New 2026-07-28. Implements D-05, D-13, and the renewal portions of D-01/D-06/D-08/D-14.
> Execute after S40, S41, and S44 foundations are green.

**Goal.** Renewal staff use one desk and one self-contained per-unit workspace in both environments.
Production opens Live work; Demo opens the same experience with Demo data. A unit moves visibly
through Data check, Owner decision, Tenant offer, and Build documents, with Compare sources, exact
decisions, draft/send state, evidence, provider destinations, and history in context. Editors with
the proper Space scope can open the Live desk and create drafts; provider execution and High-risk
authority remain independently enforced. The old maze of sample/run/review/notice page shapes is
redirected and then retired.

**What it is / how it functions.**

- **Canonical desk.** Make the normal Renewals destination the environment-appropriate desk: Live
  only in Production, Demo data by default in Demo, and optional Live read-only only through S40’s
  explicit Demo context. It shows bounded filters, unit/lease identity, stage, next action, owner,
  due date, blocker, source-difference indicator, and last activity. No action-readiness matrix or
  sample landing precedes the work.
- **Canonical unit workspace.** One route shape (for example
  `/lease-renewal/units/<canonical-id>`, with exact implementation chosen after discovery) owns the
  four stages: `Data check` → `Owner decision` → `Tenant offer` → `Build documents`. It also owns
  source comparison anchors, approval/decision controls, notice drafting, provider status at point
  of use, receipts, timeline, and a return link that restores desk filters/position.
- **Self-contained decisions.** Every `Needs decision` state renders the value(s), reason, source
  evidence, permitted decision actions, required reason rules, and resulting next step together.
  The user never has to find a separate reconciliation model to resolve a field shown in the unit.
- **Compare sources.** Preserve deterministic reconciliation and authoritative-source rules. Show
  friendly field labels, RentVine value, Sheet/other value, timestamps/freshness, exact source or
  honest provider-front-door link through S44, and a stable focus anchor. Never call it “raw
  reconciliation.”
- **Access and execution.** A scoped Editor may list/open Live units, resolve permitted Low/Medium
  app decisions, and create governed drafts. Approver/Admin authority applies only where S20 or the
  action requires it. Send/write buttons appear only when their exact provider action is enabled and
  the actor may execute it; a technical Blocked state cannot be approved away.
- **Template slot.** Add a versioned external renewal-template slot with artifact ID/version/status,
  validation, immutable published version, preview against redacted/test input, Admin approval,
  active pointer, and rollback. Chasity’s missing updated artifact yields
  `Renewal template not supplied` and blocks only the template-dependent output. Do not invent,
  reconstruct, or paraphrase the missing template copy.
- **Compatibility convergence.** Inventory landing, sample unit, runs/run detail, reconciliation,
  Live review, Live desk/unit, notices, and property history. Route every still-valid entry into the
  canonical desk/unit/field anchor; preserve HTTP/query compatibility and return state in stage one.
  Property history may remain a contextual subview if it has a distinct job.
- **Buildable now (app-plane).** Canonical desk/unit composition; four-stage state model; embedded
  decisions/drafting/evidence/history; scoped Editor access; point-of-use action summaries; exact
  redirects; template slot/lifecycle/refusal; responsive/a11y/task tests.
- **Build to the seam (live provider/content).** Reuse existing S25 providers and full action
  contracts; do not create a parallel executor. Bind the active validated template artifact to the
  existing notice/document composer and preserve preview/confirmation/idempotency/receipt/rollback.
  If any currently fake provider is encountered, route that activation back to S30/S34/etc.; this UI
  suite does not guess it.
- **Owner dependency (the one flip).** Chasity supplies the exact updated renewal-template artifact
  through the approved publication channel. An Admin validates/previews/approves that version; only
  template-dependent output activation waits. All other S43 behavior ships without it.

**Open questions & assumptions.**

- _Answered 2026-07-28 (D-05):_ one desk and one per-unit workspace are canonical.
- _Answered 2026-07-28:_ scoped Editors may access the Live desk and create governed drafts. This
  resolves C-01; it does not grant Admin-only High decisions or bypass provider action authority.
- _Answered 2026-07-28 (D-13):_ the missing template is an external versioned artifact, not copy for
  the model to invent.
- _Answered 2026-07-28 (D-01):_ Production has no Sample/Demo/Test renewal mode or selector. Demo
  uses the same canonical routes/components.
- _Assumption:_ property-level history remains reachable from the unit when it answers a distinct
  historical question; it must not become a second unit workspace.
- _Client-owned:_ supply and in-app approval of Chasity’s exact artifact.
- Decision-complete outside that artifact.

**Cross-product impacts.**

- Likely touchpoints span renewal route pages, desk/unit clients, reconciliation and progress models,
  decision gatherers, owner/tenant draft composers, template/publication storage, role guards, and
  redirects. Examples in the audit are evidence, not mandated file boundaries.
- Reuses S20 execution authority, S21 trusted publication, S25 execution, S28/S29 comp/suggestion,
  S30/S34 provider activations, S40 environment boundary, and S44 links.
- Supersedes the Sample-first normal entry, parallel Live review/desk/notices navigation, S14/S17
  generic-run renewal links, and the Admin-only desk interpretation. Add exact Supersede Log markers
  when behavior ships.

**Adversarial acceptance checks.**

- **AC-S43-1** — The Renewals destination opens one desk: Live-only records in Production and Demo
  records in Demo. No Production DOM, nav model, route index, or action exposes Sample/Test/Demo
  renewal controls. _Verify:_ environment route/browser tests.
- **AC-S43-2** — A unit can complete each of the four stages without leaving its canonical
  workspace; every decision shows values, evidence, controls, reason requirements, and next state
  together, and refresh restores the current stage and timeline. _Verify:_ canonical unit end-to-end
  task at desktop and 390×844.
- **AC-S43-3** — A scoped Editor can list/open Live units and create a governed draft, but cannot
  perform an Admin-only decision, disabled provider action, unconfirmed send, or out-of-scope unit.
  Each refusal occurs before provider construction and writes nothing. _Verify:_ role/scope/action
  matrix tests.
- **AC-S43-4** — Each source conflict opens the exact Compare sources field, accurately labels exact
  vs generic provider destinations, and returns to the originating filtered desk state. A stale or
  cross-unit anchor fails safely. _Verify:_ S44 contract consumer and browser-focus tests.
- **AC-S43-5** — With no active Chasity artifact, only template-dependent Build documents/output is
  blocked with `Renewal template not supplied`; data review, owner decision, tenant offer
  preparation, history, and unrelated actions remain usable. No placeholder copy is generated.
  _Verify:_ template-absent negative tests and copy scan.
- **AC-S43-6** — A validated Admin-approved template version produces a preview bound to its version
  and inputs; activation/rollback changes the active pointer audibly without mutating prior versions.
  Existing exact send/write confirmation and receipt rules remain. _Verify:_ publication/template
  version tests and action-contract sentinels.
- **AC-S43-7** — Every inventoried legacy renewal entry either redirects to an exact canonical
  desk/unit/anchor while preserving safe return/filter state or is proven intentionally retained;
  no redirect loop or orphan literal link exists. _Verify:_ route graph and compatibility matrix.
- **AC-S43-8** — `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run test:e2e:core`, `npm run verify:spec-traceability`, and `npm run build` pass; keep
  reconciliation, Editor authorization, action authority, publication, idempotency, redaction,
  environment, and provider-construction sentinels green.

**Forbidden actions / hard gates.** Never invent the template, rent, owner/tenant fact, provider
URL, or missing source. Never make a generic provider front door look like record evidence. Never
grant access or execution merely by rendering a route. Client-facing send and system-of-record write
remain human-initiated, exact-confirmed, one-attempt, idempotent, receipted, reconciled, monitored,
and reversible. Demo cannot call providers; Production cannot load Demo data. Generic Gmail send
stays closed; personal identity, secrets/PII, and guessed endpoints stay out; the cost cap remains.
Do not flip a provider action gate in this UI suite unless that action’s existing documented
dependency and full pinned contract are already satisfied and the owning provider spec authorizes
the routine reviewed flip.

**Ordered prompt sequence.**

1. _Discovery:_ inventory every renewal route/page shape, link producer, data model, decision path,
   draft/send path, access guard, and template source. Build a route/consumer/access matrix before
   editing.
2. _Understanding:_ map all current states into the four canonical stages and identify the canonical
   unit key, exact conflict anchor, desk filter/return state, and template-dependent actions.
3. _Build:_ compose one shared desk/unit experience for S40 contexts; move decisions, Compare
   sources, drafts, receipts, and history into the unit and add scoped Editor access with negative
   guards.
4. _Build:_ create the versioned template slot and exact missing-artifact refusal; bind it to the
   existing composer without inventing content or a new executor.
5. _Build:_ stage-one redirect every compatible legacy route/link to the exact desk/unit/anchor and
   hide redundant surfaces; retain rollback components for S49.
6. _Verify:_ run AC-S43-1 through AC-S43-8 and falsify cross-scope access, stale confirmations,
   missing template, generic-link evidence claims, Demo provider calls, wrong-environment data,
   refresh loss, and redirect loops.
7. _Gate:_ preserve existing action gates. If the Chasity artifact arrives, activate its published
   content version in-app; content activation is not an Action Registry permission.
8. _Owner:_ request only the exact Chasity artifact and its normal Admin review. Do not ask about
   already settled route, role, environment, or stage decisions.
9. _Context update:_ record S43’s shipped fact/ACs and C-01 resolution, update facts/guide/manual QA,
   then advance the loop to S45 (or the next dependency-ready suite).

**Deletion/merge recommendation.** KEEP this spec. MERGE valid renewal behavior into the canonical
desk/unit. RETIRE_UI the sample landing, separate review/notices/reconciliation shells, and no-op
prepare controls in stage one; S49 deletes code only after consumer and redirect proof.
