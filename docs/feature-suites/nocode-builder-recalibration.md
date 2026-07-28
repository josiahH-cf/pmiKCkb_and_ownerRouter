<!-- spec-shape: overhaul-v1 -->

# S50 — S37 no-code page-builder recalibration on the stable IA

> New 2026-07-28. Implements D-11. This spec amends and executes S37 after the S40–S49 stage-one
> baseline; where S37 and S50 conflict, S50 controls.

**Goal.** Admins can build, preview, publish, version, and roll back safe app pages and bounded
layout regions without code, but only on the recalibrated environment, navigation, role, page, and
component schema. The builder cannot reintroduce retired card catalogs, duplicate attention lists,
Test tools, generic-run links, provider diagnostics in operator pages, or a parallel workflow
executor. It can arrange approved inert/read-only components and code-defined safe zones; core
transaction sequences, authority, shell hierarchy, and external effects remain code-owned.

**What it is / how it functions.**

- **Prerequisite baseline.** Do not implement S37 against the old taxonomy. Start only when S40
  environment/context, S41 shell/nav/vocabulary, S42 attention/Spaces ownership, S44 links, and the
  stage-one canonical S43/S45/S46/S48 routes/components are green. S49 need not delete every adapter,
  but its route/page/component ledger must mark the new owners as canonical.
- **Definition kinds.** Evolve S37’s `PageDefinition` into explicit safe kinds such as
  `content_page`, `reference_directory`, `read_only_summary`, and code-defined `layout_region`.
  Exact type names may differ. A definition references semantic read models and in-app routes, not
  Firestore collection paths, provider calls, executors, arbitrary queries, or environment resource
  IDs.
- **Fixed shell and route ownership.** The four daily destinations, primary Spaces placement,
  Notifications/account/More hierarchy, Vendor shell, sign-in, security, Admin role management, and
  canonical workflow route ownership are code-owned. A builder may curate allowed child pages or
  content links in code-defined slots; it cannot rename/remove/reorder the fixed shell contract or
  shadow a reserved route.
- **Approved component library.** Components are code-owned, typed, bounded, accessible, and
  side-effect-free: headings/text/callout, approved image, safe in-app link list, grouped directory,
  read-only summary/count, source/freshness, version/history, and code-defined two-column/layout
  primitives. No raw HTML/script/iframe, arbitrary CSS/JS, arbitrary external URL, Test/simulator,
  Registry/readiness matrix, message body, approval mutation, provider action, or generic data
  query.
- **Safe workflow regions.** A core desk may expose a code-defined layout region for inert help,
  summary, or source content. The builder cannot move/hide/reorder the four renewal stages, approval
  decision controls, Maintenance closeout/security controls, confirmation, evidence, receipt, or
  next-action state machine. Renderer imports no executor.
- **Environment promotion.** A page definition is an immutable validated product-config artifact.
  Demo can preview/publish within Demo. Production receives only an exact version exported/promoted
  through an Admin-reviewed, hash-bound validation step; it resolves semantic sources/routes in
  Production and cannot carry Demo record IDs, resource IDs, receipts, or external credentials.
- **Publication and authority firewall.** Reuse S21 immutable Draft→Active validation, audit,
  active pointer, rollback, current-policy revalidation, and forbidden authority fields. Reject
  role/scope/environment/gate/system-prompt/connector/action fields anywhere in structured props,
  including disguised/nested variants. Unknown components render inert/unavailable and cannot
  execute.
- **Preview parity.** Preview uses the same renderer, component schemas, role/scope/environment
  filters, breakpoints, headings, and links as Active. Admin can preview representative safe states
  without importing customer content into Demo or exposing unauthorized data.
- **Buildable now (app-plane).** All of S37 as amended: schemas/library/renderer/persistence/editor,
  validation/version/publish/rollback/promotion, fixed-slot nav integration, authority firewall,
  responsive/a11y tests, and Admin management.
- **Build to the seam (live provider).** None. Page definitions are app-plane presentation and never
  call a provider or enter the Action Registry.
- **Owner dependency (the one flip).** None. The in-app Admin publication decision is ordinary
  product use; normal owner-run deployment remains release operations.

**Open questions & assumptions.**

- _Answered 2026-07-23 (D-BUILDER-FULL):_ build the full schema-driven page/layout builder.
- _Answered 2026-07-28 (D-11):_ IA baseline first, then build S37 against it.
- _Answered 2026-07-28:_ the builder cannot preserve or recreate removed Test/developer tools or
  old page duplication.
- _Assumption:_ “full” means full authoring within a code-owned safe schema, not arbitrary code,
  HTML, database query, execution, navigation authority, or mutation layout.
- _Assumption:_ core task flows remain code-owned because changing their sequence/required controls
  would alter authority and safety, not merely layout.
- Decision-complete.

**Cross-product impacts.**

- Extends/replaces the design examples in `docs/feature-suites/nocode-page-builder.md`; reuse its
  S21 publication/firewall/scope detail unless S50 narrows it.
- Consumes all S40–S49 canonical environment, shell, ownership, route, link, component, and
  retirement ledgers. Likely implementation spans page schema/library/renderer/editor, publication,
  Admin pages, safe nav slots, Firestore rules, and promotion tooling.
- Does not supersede S20/S21 authority, S25/S26 actions, S40 separation, S41 fixed shell, or S43/
  S45/S46 workflow state machines.

**Adversarial acceptance checks.**

- **AC-S50-1** — The build refuses to start/merge if the canonical prerequisite ledger lacks S40/
  S41/S42/S44 and stage-one S43/S45/S46/S48 owners; no builder schema references retired routes,
  cards, Test tools, or duplicate attention presenters. _Verify:_ prerequisite/schema trace test.
- **AC-S50-2** — An Admin can create/edit/reorder/preview/publish/rollback every allowed page kind
  through one typed library; Editor/Approver/Vendor/out-of-scope/read-only-space callers are refused
  server-side and write nothing. _Verify:_ page builder, Firestore, role/scope tests.
- **AC-S50-3** — Definitions containing raw HTML/script/iframe/CSS/JS, arbitrary URL/query/provider,
  action/Registry/executor, role/scope/environment/secret/system-prompt, message body, or hidden
  nested authority fields are rejected before version/Active pointer creation. _Verify:_ authority
  firewall and property/fuzz tests.
- **AC-S50-4** — Builder content cannot rename/remove/reorder the four daily destinations or Spaces,
  shadow reserved/security/Vendor/Admin routes, duplicate owning collections, or move/hide required
  renewal/approval/Maintenance controls. _Verify:_ reserved-route, fixed-shell, safe-zone tests.
- **AC-S50-5** — Preview and Active render the same validated definition at desktop/390×844 with one
  H1, correct focus/keyboard/zoom, safe links, role/scope filtering, and no external request/effect.
  Unknown/retired components render inert and auditable. _Verify:_ renderer/browser/a11y tests.
- **AC-S50-6** — Demo→Production promotion binds the exact immutable hash/version and current policy,
  carries no Demo IDs/resources/data, requires Admin review, and can roll back without deleting
  later history. A stale or policy-invalid version is refused. _Verify:_ promotion/publication/
  environment tests.
- **AC-S50-7** — Renderer and authored pages import/call no executor/provider/action gate, create no
  Action Registry key, and cannot change `production_allowed`; Action Registry seeds/allowlists are
  byte-for-byte behaviorally unchanged. _Verify:_ import boundary and action-gate sentinels.
- **AC-S50-8** — `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run test:firestore`, `npm run test:e2e:core`, `npm run verify:falsification`,
  `npm run verify:spec-traceability`, `npm run verify:context-freshness`, and `npm run build` pass;
  keep S21, auth/scope, environment, fixed-shell, route-link, action, redaction, and rollback
  sentinels green.

**Forbidden actions / hard gates.** Never implement arbitrary code/HTML/JS/CSS/iframe/query/external
URL or an authored action/provider/Registry component. Never let page config alter environment,
identity, role/scope, system prompt, connector policy, fixed shell, reserved routes, or required
workflow controls. Never share Demo config/data directly with Production; promotion is exact,
validated, reviewed, and reversible. The renderer makes no external effect and has no
`production_allowed` gate. Preserve no autonomous client send, generic-send closure, managed
identity, secrets/PII exclusion, source uncertainty, and cost cap.

**Ordered prompt sequence.**

1. _Discovery:_ read S37, S40–S49 facts/specs/route ledgers and current publication/auth/scope/page/
   nav code; fail the slice if the prerequisite canonical owners are not landed.
2. _Understanding:_ define the page kinds, fixed shell/reserved routes, safe layout regions,
   semantic read models, approved component schemas, forbidden fields, and Demo→Production artifact
   promotion contract before coding.
3. _Build:_ implement schema/library/renderer/persistence/Admin editor against the canonical routes
   and fixed safe slots; reuse S21 validation/version/audit/rollback.
4. _Build:_ add current-policy authority firewall, environment-safe promotion, preview parity,
   inert unknown handling, and optional curated child links without changing the shell hierarchy.
5. _Verify:_ run AC-S50-1 through AC-S50-8 and fuzz authority smuggling, reserved-route shadowing,
   unsafe props, workflow-control hiding, cross-environment IDs, role leakage, preview drift, and
   provider/executor imports.
6. _Gate:_ no action gate exists or may be created. Confirm Registry seeds and both executable
   allowlists are unchanged.
7. _Owner:_ none beyond the normal owner-run deployment. Admin author/publish/rollback is an in-app
   capability.
8. _Context update:_ add the verified page-builder fact with S37/S50 AC trace, mark S37 implemented
   as amended, update guide/manual QA/loop state, and close the S40–S50 program only when all suite
   completion conditions are true.

**Deletion/merge recommendation.** KEEP S50 as the controlling amendment and KEEP S37 as the full
design history. MERGE implementation into one page-builder system; do not build parallel S37/S50
renderers. Update S37’s status banner to point here and delete any disposable pre-baseline builder
prototype after S49 proof.
