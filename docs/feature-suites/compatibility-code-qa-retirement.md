<!-- spec-shape: overhaul-v1 -->

# S49 — Compatibility retirement, code decomposition, documentation, and QA migration

> New 2026-07-28. Implements D-12 and WS-08. This is a multi-slice proof-and-delete suite; it must
> never become an automated dead-code sweep.

**Goal.** The recalibrated product replaces old routes and controls without breaking saved links,
roles, workflows, providers, security, or rollback. Stage one hides/moves UI, redirects compatible
routes, instruments real consumers, and proves the new tasks. Stage two deletes only a bounded,
named candidate whose consumers and fallback have been disproved. Large mixed components are
decomposed along behavior boundaries while behavior is pinned. Facts, guides, manual QA, and loop
state describe the shipped product rather than historical clutter.

**What it is / how it functions.**

- **Required retirement ledger.** Maintain a checked, versioned row for each candidate: UI/route/
  module identifier; owner suite; present behavior; replacement; runtime imports/dynamic imports/
  route literals/scripts/jobs/tests/docs; roles/scopes/environments; provider/security/rollback
  ownership; stage-one treatment; instrumentation; rollback; stage-two proof; final disposition.
- **Stage one — retire UI, preserve safe compatibility.** Remove the destination from normal
  navigation/rendering, route valid legacy entry to the exact new destination or return a clear
  retired response, add bounded hit/error instrumentation without content/PII, and retain the old
  component/module behind a reversible code path only where rollback needs it. No redirect may
  weaken auth, change environment, or lose the exact item anchor.
- **Proof packet.** Before deletion, prove all static and dynamic consumers, route literals,
  Next.js conventions, scripts/CLI/jobs, Firestore rules/indexes, tests, docs, provider Registry,
  environment manifests, and rollback. Run authenticated Admin/Editor/Vendor task coverage, literal
  link graph, build bundling, and stage-one compatibility hit review across at least one deployed
  release boundary and owner walkthrough. Static import reachability alone is never enough.
- **Stage two — bounded deletion.** Delete one coherent candidate set only when replacement behavior
  is green, all required consumers are migrated, stage-one evidence shows no required legacy use,
  rollback is captured, and the facts/docs claim is updated. If usage evidence is unavailable or
  ambiguous, keep the redirect/adapter; lack of evidence is not deletion proof.
- **Known candidate dispositions.**
  - Sample renewal no-op preparation controls and browser-only Communications simulation:
    `RETIRE_UI`, then delete after consumer/link proof.
  - Duplicate Approval/Console/Notifications projections and old renewal page shells:
    redirect/adapt to canonical owner, then delete after exact-link and role proof.
  - Disabled legacy notification sender card: retire, preserve no executable sender path, delete UI
    after route/import proof.
  - `lib/console/snippet.ts`: delete only after proving no runtime/script consumer and updating stale
    facts that describe snippet behavior.
  - Dotloop/RentVine/LeadSimple/other provider bridges: KEEP and label owner suite/activation even if
    page-unreachable; a provider seam is not dead code.
  - Vendor TOTP and security/verification helpers: KEEP if current security/tests or an authorized
    suite owns them. Do not build self-registration. Delete an unowned primitive only with explicit
    security-path and future-suite proof.
- **Behavior-first decomposition.** For each 400–830-line mixed component touched by S40–S48, first
  pin public behavior and mutation boundaries, then extract cohesive state/action/presenter units.
  Do not split by arbitrary line count or rewrite business services during a visual move.
- **QA migration.** Add authenticated desktop and 390×844 task tests for shell height, first
  actionable control, fixed-overlay collision, whole renewal unit, one-card approval, Maintenance
  progress, exact evidence/provider links/return, role/scope/environment denial, keyboard/focus,
  headings, redirects, and negative send/write/provider construction.
- **Documentation migration.** At each bounded deletion update `docs/facts.md` and its Supersede Log,
  `docs/loop-state.md`, status, product/feature-suite status, app guide, manual QA walkthrough,
  environment handoff, and provider activation references. Historical audit packets remain history.
- **Buildable now (app-plane).** Ledger, instrumentation, redirects/retired responses, stage-one
  removals, behavior tests, decomposition, bounded stage-two deletions whose proof exists, and docs.
- **Build to the seam (deployed proof).** Prepare compatibility counters/log queries and browser
  walkthrough for the candidate revision. The owner-run deploy supplies the one release-boundary
  observation; stage-two can then proceed candidate by candidate where proof is affirmative.
- **Owner dependency (the one flip).** None as a product dependency. Production deploy/traffic and
  walkthrough remain normal owner-run release operations. An ambiguous candidate stays
  compatibility-retained rather than blocking the rest of S49.

**Open questions & assumptions.**

- _Answered 2026-07-28 (D-12):_ two-stage retirement with proof is mandatory.
- _Answered 2026-07-28 (D-08):_ obsolete shipped Test tools should be removed; automated tests and
  end-state seams remain.
- _Answered 2026-07-28:_ E-02 is generated by this suite’s ledger/instrumentation; no user is asked
  to remember module consumers.
- _Answered for this program:_ dormant onboarding primitives do not authorize a new onboarding
  feature. Preserve current Vendor TOTP; keep or delete other primitives only by proof.
- _Assumption:_ one deployed release boundary plus authenticated owner walkthrough and complete
  automated consumer/task evidence is sufficient to delete an internal-only compatibility UI. For
  externally bookmarkable/public routes with no reliable usage evidence, retain the safe redirect.
- Decision-complete; each candidate’s evidence determines KEEP vs DELETE without reopening product
  direction.

**Cross-product impacts.**

- S49 touches only candidates named by S40–S48 ledgers plus their tests/docs. It may inspect all
  app/component/lib/script/rule/docs paths but cannot expand into unrelated cleanup.
- Preserves all S20–S26 authority/security/provider contracts, S28–S39 activation seams, S40
  environment boundary, and S44 link safety.
- Supersede Log updates are mandatory for S14/S15/S17/S23/current dual-lane and other claims only
  when their replacement behavior actually ships; do not rewrite historical evidence.

**Adversarial acceptance checks.**

- **AC-S49-1** — Every candidate has a complete ledger row and no deletion proceeds when a runtime,
  dynamic, route, script/job, rule/index, test, docs, provider, security, environment, or rollback
  owner is `unknown`. _Verify:_ checked ledger schema/test and review.
- **AC-S49-2** — Every stage-one legacy route either preserves auth/context/item/field/return state
  into the canonical destination or returns an explicit retired response; redirect loops, open
  redirects, privilege widening, and Demo↔Production crossing are refused. _Verify:_ compatibility
  route matrix/security tests.
- **AC-S49-3** — Compatibility instrumentation records route/module identifier, outcome, role class,
  environment, and time without URL tokens, message bodies, customer fields, or secret values; its
  absence/ambiguity cannot be treated as zero use. _Verify:_ instrumentation/redaction tests.
- **AC-S49-4** — A stage-two deletion is a bounded candidate set with replacement tests green,
  consumer proof complete, deployed-boundary evidence reviewed, prior revision captured, and facts/
  docs updated in the same change. Reverting the change restores compatibility without data loss.
  _Verify:_ per-candidate packet and rollback test.
- **AC-S49-5** — Static “unreachable” provider/security/script modules are retained when their ledger
  owner is valid; the deletion mechanism cannot accept import-graph output as its sole proof.
  _Verify:_ sentinel fixtures for provider bridge, dynamic import, CLI script, and security helper.
- **AC-S49-6** — Component decomposition preserves public task, state, mutation, focus, and error
  behavior, and no extracted presenter imports an executor or weakens a guard. _Verify:_ pre/post
  behavior contract and action/auth sentinels.
- **AC-S49-7** — Authenticated Admin/Editor/Vendor desktop/390×844 tasks cover the new shell,
  renewal, approval, Maintenance, Communications/Connections/Admin, exact links, redirects, first
  action, overlays, headings, focus, and negative effects. _Verify:_ named browser suite.
- **AC-S49-8** — Active facts, product docs, app guide, manual QA, environment handoff, suite
  statuses, and loop state contain no known claim contradicted by shipped behavior; historical docs
  remain labeled historical. _Verify:_ context freshness, spec traceability, and targeted copy scan.
- **AC-S49-9** — `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run test:firestore`, `npm run test:e2e:core`, `npm run verify:falsification`,
  `npm run verify:spec-traceability`, `npm run verify:context-freshness`, and `npm run build` pass;
  keep route-link, auth, environment, provider, action, redaction, rollback, and release sentinels
  green.

**Forbidden actions / hard gates.** No bulk “delete unused,” no deletion from import reachability or
line count alone, no destructive live-data migration, no historical-doc rewrite, and no removal of
provider/security/rollback code merely because it is not page-imported. Stage one must precede stage
two. Unknown usage means retain compatibility. Never weaken auth, environment, exact link, send/
write confirmation, idempotency, receipt, monitoring, or rollback to simplify code. No secrets/PII
in instrumentation/evidence, no personal auth, no autonomous client send, no guessed endpoint, and
no unrelated action gate flip.

**Ordered prompt sequence.**

1. _Discovery:_ aggregate candidate ledgers from S40–S48; inspect runtime/dynamic imports, routes,
   link literals, scripts/jobs, rules/indexes, tests, docs, Registry/provider owners, security,
   environments, and rollback for one bounded candidate set.
2. _Understanding:_ pin replacement behavior and choose KEEP, stage-one RETIRE_UI/REDIRECT, or
   stage-two DELETE_AFTER_PROOF. If any proof field is unknown, choose stage one/KEEP.
3. _Build:_ add replacement tests, stage-one route/UI treatment, redacted instrumentation, and
   rollback; decompose only the owning mixed component along behavior boundaries.
4. _Verify:_ run focused and full gates plus authenticated role/environment/browser tasks; produce
   the non-sensitive candidate proof packet.
5. _Owner:_ include the candidate in the next normal owner-run blue/green deploy and walkthrough;
   capture the serving/prior revisions and compatibility outcomes.
6. _Build:_ only after affirmative proof, delete the bounded code/assets/tests that solely assert
   retired behavior; preserve replacement/security/compatibility redirects where required.
7. _Gate:_ confirm all unrelated Registry entries/allowlists are unchanged and no provider seam was
   removed. A deletion never authorizes an action.
8. _Context update:_ add one fact/Supersede Log row per completed candidate set, update all active
   guidance and the manual task matrix, then advance `docs/loop-state.md` to the next S49 candidate
   or S50.

**Deletion/merge recommendation.** KEEP this spec as the durable retirement protocol. DELETE only
the individually proven candidates it governs. Disposable candidate proof packets may be removed
after their safe outcome, commit, tests, and rollback reference are captured in facts/status.
