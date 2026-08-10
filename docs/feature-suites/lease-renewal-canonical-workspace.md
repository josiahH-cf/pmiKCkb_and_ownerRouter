<!-- spec-shape: overhaul-v1 -->

# S43 — Canonical Lease Renewal desk and per-unit workspace

> New 2026-07-28. Implements D-05, D-13, and the renewal portions of D-01/D-06/D-08/D-14.
> Execute after S40, S41, and S44 foundations are green.
>
> **Approved specification amendment, 2026-08-10.** The 2026-08-07 training transcript and the
> owner's 2026-08-10 specification approval add the identity, rent-decision, channel, and document
> handoff contracts below. This amendment authorizes specification changes only; it does not
> authorize implementation, deployment, provider activation, a send, or a system-of-record write.

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
  explicit Demo context. It shows bounded filters, the compact identity contract below, stage, next
  action, due date, blocker, source-difference indicator, and last activity. No action-readiness
  matrix or sample landing precedes the work.
- **Canonical unit workspace.** One route shape (for example
  `/lease-renewal/units/<canonical-id>`, with exact implementation chosen after discovery) owns the
  four stages: `Data check` → `Owner decision` → `Tenant offer` → `Build documents`. It also owns
  source comparison anchors, approval/decision controls, notice drafting, provider status at point
  of use, receipts, timeline, and a return link that restores desk filters/position.
- **Self-contained decisions.** Every `Needs decision` state renders the value(s), reason, source
  evidence, permitted decision actions, required reason rules, and resulting next step together.
  The user never has to find a separate reconciliation model to resolve a field shown in the unit.
- **Identity is complete and stable.** Every compact renewal row/card exposes the complete
  property/unit label, primary tenant, first owner plus `+N` when more owners exist, lease end date,
  stage, and next action. The full workspace exposes every tenant and every owner of record. If no
  reliable address exists, show `Address unavailable · Lease <lease-id>`; never guess an address or
  identify a renewal by address alone. The canonical lease id remains the stable key even when an
  address or participant changes.
- **Two explicit rent choices.** The Owner decision stage offers exactly `Keep current rent` and
  `Enter owner-approved rent`. `Keep current rent` derives the RentVine base rent and requires no
  currency input. A missing, zero, invalid, or stale base rent blocks that choice locally with the
  source and correction path visible. `Enter owner-approved rent` requires a user-entered currency
  value and accepts `$1,250`, `1,250`, `1250`, or `1250.00`; it normalizes the accepted value to
  integer cents. Blank, nonnumeric, zero, negative, excess-decimal, or out-of-supported-range values
  remain editable and block continuation without clearing other completed fields. Market comps and
  S29/S62 suggestions remain separately labeled reference or approval inputs and never silently set
  the offered rent.
- **Decision lifecycle.** A rent decision is persisted with its source, actor, time, and normalized
  cents. Repeating the same save is idempotent. Changing the choice or amount after a downstream
  preview invalidates that preview and any approval bound to it; it does not duplicate a decision,
  draft, or provider attempt. Loading disables only the affected control, an error preserves the
  user's entry and focus, refresh restores the last committed decision, and retry is explicit.
- **Compare sources.** Preserve deterministic reconciliation and authoritative-source rules. Show
  friendly field labels, RentVine value, Sheet/other value, timestamps/freshness, exact source or
  honest provider-front-door link through S44, and a stable focus anchor. Never call it “raw
  reconciliation.”
- **Access and execution.** A scoped Editor may list/open Live units, resolve permitted Low/Medium
  app decisions, and create governed drafts. Approver/Admin authority applies only where S20 or the
  action requires it. Send/write buttons appear only when their exact provider action is enabled and
  the actor may execute it; a technical Blocked state cannot be approved away.
- **Document handoff.** S66 owns packet selection, source facts, conditional artifacts, participant
  visibility, artifact versions, and document-readiness truth. S43 presents that contract inside
  `Build documents`: included and excluded artifacts with reasons, missing/conflicting facts, source
  evidence, participant visibility, template version, and the exact local blocker. A missing
  approved artifact yields `Renewal template not supplied` and blocks only output that depends on
  that artifact. Do not invent, reconstruct, or paraphrase missing legal copy.
- **Tenant channels are preparation paths.** The Tenant offer stage labels its three preparation
  choices `Email`, `RentVine chat`, and `Text message`. Each produces an editable draft or copy-ready
  text for all intended tenant recipients, with recipient/channel separation and a visible
  `Prepared — human action required` state. This suite never turns a channel choice into a direct,
  autonomous, scheduled, bulk, or model-triggered send.
- **Compatibility convergence.** Inventory landing, sample unit, runs/run detail, reconciliation,
  Live review, Live desk/unit, notices, and property history. Route every still-valid entry into the
  canonical desk/unit/field anchor; preserve HTTP/query compatibility and return state in stage one.
  Property history may remain a contextual subview if it has a distinct job.
- **Buildable under the existing UI/UX program authority (app-plane).** Canonical desk/unit
  composition; four-stage state model; identity and rent-decision contracts; embedded
  decisions/drafting/evidence/history; scoped Editor access; point-of-use action summaries; exact
  redirects; S66 document-readiness presentation; responsive/a11y/task tests. The 2026-08-10 turn
  performs specification edits only and does not itself execute that standing program authority.
- **Build to the seam (live provider/content).** Reuse existing S25 providers and full action
  contracts; do not create a parallel executor. Bind the active validated template artifact to the
  existing notice/document composer and preserve preview/confirmation/idempotency/receipt/rollback.
  If any currently fake provider is encountered, route that activation back to S30/S34/etc.; this UI
  suite does not guess it.
- **External content dependency.** The approved current document artifacts and their exact field and
  participant metadata must enter through the trusted publication path defined by S66. Only the
  dependent document output waits; identity, decision, draft preparation, history, and unrelated
  workspace behavior must remain usable. This is a content dependency, not implementation authority.

**Open questions & assumptions.**

- _Answered 2026-07-28 (D-05):_ one desk and one per-unit workspace are canonical.
- _Answered 2026-07-28:_ scoped Editors may access the Live desk and create governed drafts. This
  resolves C-01; it does not grant Admin-only High decisions or bypass provider action authority.
- _Answered 2026-07-28 (D-13):_ the missing template is an external versioned artifact, not copy for
  the model to invent.
- _Answered 2026-07-28 (D-01):_ Production has no Sample/Demo/Test renewal mode or selector. Demo
  uses the same canonical routes/components.
- _Answered 2026-08-10:_ compact identity is property/unit + primary tenant + first owner `+N` +
  lease end + stage + next action; the full workspace lists all owners and tenants. The no-address
  fallback is `Address unavailable · Lease <lease-id>`.
- _Answered 2026-08-10:_ rent choice is `Keep current rent` from RentVine base rent or
  `Enter owner-approved rent` with currency normalization. Suggested values remain separate and
  never populate the choice implicitly.
- _Answered 2026-08-10:_ tenant channels are Email, RentVine chat, and Text message; each stops at an
  editable draft/copy-ready artifact controlled by a person.
- _Answered 2026-08-10:_ S66, rather than this UI suite or S34, is the document-packet truth owner.
- _Assumption:_ property-level history remains reachable from the unit when it answers a distinct
  historical question; it must not become a second unit workspace.
- _External-content owned:_ supply and in-app approval of exact current artifacts under S66.
- Decision-complete for the workspace behavior specified here.

**Cross-product impacts.**

- Likely touchpoints span renewal route pages, desk/unit clients, reconciliation and progress models,
  decision gatherers, owner/tenant draft composers, template/publication storage, role guards, and
  redirects. Examples in the audit are evidence, not mandated file boundaries.
- Reuses S20 execution authority, S21 trusted publication, S25 execution, S28/S29 comp/suggestion,
  S30/S34 provider activations, S40 environment boundary, S44 links, S61 recipient fan-out, S62
  policy suggestions, and S66 document truth. S43 presents those contracts and must not duplicate
  or reinterpret them.
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
- **AC-S43-5** — With a required S66 artifact unavailable, only document output that consumes that
  artifact is blocked with `Approved artifact unavailable: <artifact label>`; data review, owner
  decision, tenant offer preparation, history, and unrelated artifacts/actions remain usable. No
  placeholder copy is generated. _Verify:_ artifact-absent blocker-locality tests and copy scan.
- **AC-S43-6** — A validated Admin-approved S66 artifact catalog/version produces a preview bound to
  its exact artifact versions, inputs, participants, and snapshot hash; activation/rollback changes
  active pointers audibly without mutating prior snapshots/versions. Existing exact send/write
  confirmation and receipt rules remain. _Verify:_ publication/catalog version tests and action-
  contract sentinels.
- **AC-S43-7** — Every inventoried legacy renewal entry either redirects to an exact canonical
  desk/unit/anchor while preserving safe return/filter state or is proven intentionally retained;
  no redirect loop or orphan literal link exists. _Verify:_ route graph and compatibility matrix.
- **AC-S43-8** — `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run test:e2e:core`, `npm run verify:spec-traceability`, and `npm run build` pass; keep
  reconciliation, Editor authorization, action authority, publication, idempotency, redaction,
  environment, and provider-construction sentinels green.
- **AC-S43-9** — Every compact desk/card identity shows the complete property/unit label, primary
  tenant, first owner plus the correct `+N`, lease end date, stage, and next action; the full
  workspace lists all tenants and owners. With no trustworthy address it shows exactly
  `Address unavailable · Lease <lease-id>`, remains addressable by canonical lease id, and displays
  no guessed or address-only identity. _Verify:_ complete/multiple/missing identity fixtures at
  desktop and 390×844.
- **AC-S43-10** — Owner decision exposes only `Keep current rent` and `Enter owner-approved rent`.
  The first commits the valid current RentVine base rent without a manual amount; missing, zero,
  invalid, or stale source rent blocks it. The second accepts `$1,250`, `1,250`, `1250`, and
  `1250.00` as the same 125000-cent value and rejects blank, text, zero, negative, excess-decimal,
  and out-of-range input without clearing other fields. _Verify:_ decision component, parser, and
  source-state tests.
- **AC-S43-11** — A comp, policy suggestion, or preapproved recommendation can be displayed beside
  the rent decision but cannot populate or change the committed offered rent without the user's
  explicit choice. Loading locks only the affected control; an error preserves entry and focus;
  refresh restores committed state; retry cannot duplicate the decision. _Verify:_ browser state,
  focus, refresh, and idempotency tests.
- **AC-S43-12** — Changing a committed rent choice or amount invalidates every downstream preview
  and approval bound to the old decision before another draft/provider attempt is possible. An
  unchanged repeated save is a no-op with one audit result. _Verify:_ snapshot/hash and stale-preview
  negative tests.
- **AC-S43-13** — Tenant offer labels are exactly `Email`, `RentVine chat`, and `Text message`; each
  prepares editable/copy-ready content for the complete S61 tenant recipient set and stops at
  `Prepared — human action required`. Selecting, retrying, or refreshing a channel sends nothing.
  _Verify:_ channel/recipient matrix plus zero-provider-effect tests.
- **AC-S43-14** — Build documents consumes one S66 versioned readiness snapshot and exposes included
  and excluded artifacts, reasons, sources, participant visibility, and local blockers. Missing one
  artifact blocks only its dependent output; no document preview can be represented as ready from a
  partial, stale, or conflicting snapshot. _Verify:_ S66 consumer contract and blocker-locality tests.

**Forbidden actions / hard gates.** Never invent an address, template, rent, owner/tenant fact,
charge, animal classification, provider URL, or missing source. Never make a generic provider front
door look like record evidence. Never expose Zillow as a current source, control, link, label, or
behavioral dependency. Never
grant access or execution merely by rendering a route. Client-facing send and system-of-record write
remain human-initiated, exact-confirmed, one-attempt, idempotent, receipted, reconciled, monitored,
and reversible. Demo cannot call providers; Production cannot load Demo data. Generic Gmail send
stays closed; personal identity, secrets/PII, and guessed endpoints stay out; the cost cap remains.
Do not flip a provider action gate in this UI suite unless that action’s existing documented
dependency and full pinned contract are already satisfied and the owning provider spec authorizes
the routine reviewed flip.

**Ordered prompt sequence.**

1. _Discovery (on a later execution turn under the suite's existing authority):_ inventory every renewal
   route/page shape, compact/full identity consumer, rent parser and decision path, link producer,
   draft/channel path, access guard, and S66 snapshot consumer. Build a
   route/consumer/access/source matrix before editing product code.
2. _Understanding:_ map all current states into the four canonical stages and identify the canonical
   lease key, identity fallbacks, exact conflict anchor, desk filter/return state, rent invalidation
   boundary, and document-dependent actions.
3. _Build:_ compose one shared desk/unit experience for S40 contexts; move decisions, Compare
   sources, drafts, receipts, and history into the unit and add scoped Editor access with negative
   guards.
4. _Build:_ consume S66's versioned packet snapshot and exact missing-artifact refusal; bind it to
   the existing composer without inventing content, duplicating document truth, or adding an executor.
5. _Build:_ stage-one redirect every compatible legacy route/link to the exact desk/unit/anchor and
   hide redundant surfaces; retain rollback components for S49.
6. _Verify:_ run AC-S43-1 through AC-S43-14 and falsify incomplete identity, invalid currency,
   implicit suggestion selection, downstream stale previews, cross-scope access, stale confirmations,
   missing template, generic-link evidence claims, Demo provider calls, wrong-environment data,
   refresh loss, and redirect loops.
7. _Gate:_ preserve existing action gates. Activate an S66 artifact version only through S21's
   validated publication/approval path; content activation is not an Action Registry permission.
8. _Owner:_ request only exact missing artifacts/metadata named by S66 and their normal Admin review.
   Do not ask about already settled route, role, environment, stage, or packet-selection decisions.
9. _Context update:_ record S43’s shipped fact/ACs and C-01 resolution, update facts/guide/manual QA,
   then advance the loop to S45 (or the next dependency-ready suite).

**Deletion/merge recommendation.** KEEP this spec. MERGE valid renewal behavior into the canonical
desk/unit. RETIRE_UI the sample landing, separate review/notices/reconciliation shells, and no-op
prepare controls in stage one; S49 deletes code only after consumer and redirect proof.
