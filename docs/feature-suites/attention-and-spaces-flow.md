<!-- spec-shape: overhaul-v1 -->

# S42 — Attention ownership and non-card Spaces flow

> New 2026-07-28. Implements D-03 and D-04, superseding rendered-list duplication from the older
> S17 posture while preserving shared aggregation logic.

**Goal.** Every item has one obvious owning surface. Console answers “what should I do now,”
Approvals owns decisions, Notifications owns event history/unread state, Connections owns provider
setup, and each workflow desk owns its work status. Spaces remains primary but becomes a calm,
searchable knowledge directory and source-management flow rather than twelve equal cards that
duplicate desks and setup.

**What it is / how it functions.**

- **Ownership contract.** One shared gather may calculate canonical counts/links, but only the owner
  renders the full actionable collection: Console = Ask + compact Work now; Approvals = decision
  cards; Notifications = chronological events/unread; Connections = setup/health; Renewals and
  Maintenance = workflow status and next actions.
- **Console.** Keep Ask prominent. `Work now` renders a bounded group of counts/short summaries with
  exact links to owning surfaces, never embedded queue tables, provider matrices, event histories,
  anticipated-work catalogs, or Demo operations.
- **Notifications.** Render event type, plain summary, occurred time, read/unread state, and exact
  owning link. It may show shallow filters and mark-read behavior; it does not re-render decisions,
  connection setup, Space coverage, or Test handoffs.
- **Spaces directory, not cards.** Replace the equal-weight card grid with a searchable, grouped
  list/directory. Suggested groups are operational playbooks, policies/reference, onboarding/
  training, and archived/retired; current content determines membership. Each row has name,
  one-line purpose, content/source freshness, and an `Open` action. A linked working desk is a
  separate explicit link, not inferred from whether a process definition exists.
- **Space detail.** Use one H1 and a stable sequence: purpose; active guidance/processes; sources and
  freshness; related workflow destinations; version/change history; role-gated edit/publication
  controls. Separate `Workflow available`, `Source configured`, and `Process documentation
complete`; never collapse them into “Needs a process.”
- **Progressive management.** Normal readers see knowledge first. Editor/Admin source publication,
  configuration, health, and diagnostics appear in contextual actions or an expandable management
  section without duplicating the workflow desk.
- **Buildable now (app-plane).** Ownership-aware projections, bounded Console summary, event-only
  Notifications, grouped Spaces directory, single-heading detail, distinct status vocabulary,
  exact links, and responsive/a11y tests.
- **Build to the seam (live provider).** None. Existing source reads continue under their current
  gates; this suite adds no provider effect.
- **Owner dependency (the one flip).** None.

**Open questions & assumptions.**

- _Answered 2026-07-28 (D-03):_ ownership is split by job, not a superset copied across pages.
- _Answered 2026-07-28 (D-04):_ Spaces remains primary, but the card schema is retired.
- _Assumption:_ group labels may be adjusted from actual Space metadata and audience research; the
  required interaction is a grouped searchable list, not another equal-card grid.
- _Assumption:_ shared gatherers may continue to return normalized items for counts and links, but a
  destination-specific presenter must discard fields it does not own.
- Decision-complete: the executor does not need a design selection if the stated information and
  ownership contracts are met.

**Cross-product impacts.**

- Likely touchpoints include Console gather/view components, attention aggregators, Notifications,
  Spaces index/detail, process/source metadata, and shared link models.
- S41 provides the shell; S44 provides exact item/evidence links; S48 moves provider diagnostics;
  S50 uses the new Space/page taxonomy.
- Supersedes D2/S17’s “Notifications is a rendered superset” direction. Preserve historical S17 and
  add a Supersede Log entry when the new behavior ships.

**Adversarial acceptance checks.**

- **AC-S42-1** — A canonical decision appears in full only in Approvals; Console shows at most a
  shallow count/summary link and Notifications shows only its event. Shared counts agree and every
  link opens the same owning item. _Verify:_ aggregator/presenter tests.
- **AC-S42-2** — Console’s first authenticated viewport contains Ask and a bounded Work now summary;
  it contains no full decision list, provider readiness matrix, Space catalog, event history, or
  Demo-operation control. _Verify:_ Admin/Editor desktop and 390×844 browser assertions.
- **AC-S42-3** — Notifications renders chronological unread/event state and exact owner links, but
  no connection setup, Space coverage, decision controls, or Test handoffs. Mark-read changes only
  notification state. _Verify:_ route/component tests.
- **AC-S42-4** — Spaces renders a searchable grouped list with no equal-card catalog. A Space with a
  working desk and incomplete process documentation shows both truths separately and never says the
  workflow is unavailable. _Verify:_ Spaces fixtures and copy assertions.
- **AC-S42-5** — Space detail has one H1, knowledge before management, correct reader/editor/Admin
  controls, and no duplicate primary navigation. Keyboard focus lands on the requested source or
  section when deep-linked. _Verify:_ a11y and browser tasks.
- **AC-S42-6** — `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run test:e2e:core`, `npm run verify:spec-traceability`, and `npm run build` pass; keep
  attention-count, publication, Space-scope, and route-link sentinels green.

**Forbidden actions / hard gates.** Do not copy complete collections into multiple destinations.
Do not change a decision or workflow state from Console/Notifications unless the user opens the
owning surface and passes its authority contract. Do not equate missing documentation with missing
product capability. Do not turn Spaces into an execution-authority or connector-config surface.
No new send/write/gate/scope belongs here. Preserve no autonomous client send, managed identity,
secrets/PII exclusion, source uncertainty, and reversible live effects.

**Ordered prompt sequence.**

1. _Discovery:_ inventory all Console, Approval, Notification, Connection, workflow, and Space
   gatherers/presenters; map each repeated list and the canonical item/link ID.
2. _Understanding:_ write and test an ownership matrix before changing rendering. Identify shared
   calculation that should remain and presentation duplication that must go.
3. _Build:_ reduce Console and Notifications to their defined jobs while preserving canonical
   counts and exact links.
4. _Build:_ replace the Spaces grid with the grouped directory and rebuild detail hierarchy/status
   semantics with role-gated management.
5. _Verify:_ falsify duplicated decisions, divergent counts, generic links, misleading “Needs a
   process,” duplicate H1s, role leakage, mobile overflow, and keyboard traps.
6. _Gate:_ no action gate. Confirm no workflow mutation or provider construction moved into a
   summary/event presenter.
7. _Context update:_ add the shipped attention/Spaces fact and S17 Supersede Log marker, update
   guide/manual QA, and advance `docs/loop-state.md` to S44.

**Deletion/merge recommendation.** KEEP this spec. MERGE shared aggregation, not rendered lists.
Stage-one retire duplicated Console/Notifications/Spaces panels; S49 deletes their compatibility
components only after route/role/test proof.
