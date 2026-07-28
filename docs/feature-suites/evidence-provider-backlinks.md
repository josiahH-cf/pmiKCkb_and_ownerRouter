<!-- spec-shape: overhaul-v1 -->

# S44 — Exact evidence, provider destinations, and return backlinks

> New 2026-07-28. Implements D-06. This foundation runs before S43/S45/S46 consumers.

**Goal.** Every actionable item opens the exact disputed field, evidence snapshot, and next step,
and every supported provider offers a truthful outbound destination. When a verified record/deep
link exists, the user opens that record. When it does not, the user can still open the provider’s
allowlisted front door, clearly told that the exact record link is unavailable. The user can return
to the originating filtered list without losing place. No URL is guessed and no generic navigation
is represented as source evidence.

**What it is / how it functions.**

- **Canonical item link.** Define one typed, serializable internal contract containing owning
  surface, item/entity ID, optional field/decision ID, stable focus anchor, safe return route,
  bounded filter/sort/cursor state, and environment/data context. Aggregators preserve it end to
  end instead of replacing it with a generic run href.
- **Exact focus behavior.** The destination validates entity/field/context, loads the authoritative
  item, moves focus to the field/decision heading without unexpected scroll traps, briefly
  highlights it, and exposes evidence plus the next permitted action. Missing/stale/cross-entity
  anchors land on the entity summary with an honest message.
- **Provider destination resolver.** Add one code-owned provider catalog/resolver. Destination
  priority is verified exact record URL, verified source artifact URL, reviewed generic provider
  front door, then Connections for an unsupported/unregistered provider. All production-supported
  providers must register an HTTPS front door and allowed host; arbitrary record fields cannot
  supply an executable URL.
- **Truthful labels.** Exact links say `Open this lease/ticket/thread in <Provider>` or equivalent.
  Generic links say `Open <Provider>` plus `Exact record link unavailable`. Source artifact links
  identify the artifact. Generic links never carry an evidence/provenance icon, exact-record
  accessible name, or completion claim.
- **Outbound safety.** External links use validated HTTPS/allowlisted hosts, safe new-tab semantics
  where appropriate, and no customer value in the URL unless the provider’s documented resolver
  requires and permits it. Never concatenate guessed paths or pass a provider response URL without
  validation.
- **Return state.** Encode only allowlisted list state, preferably in a signed/server-validated
  token or bounded query schema. Reject open redirects, arbitrary URLs, cross-environment returns,
  stale cursors, and secrets/PII. Provide a visible `Back to <owning list>` action.
- **Buildable now (app-plane).** Link types/schema, focus/return helpers, provider catalog, generic
  front doors, safe outbound component, consumers’ adapter, and route/browser/security tests.
- **Build to the seam (exact provider resolvers).** Implement an exact resolver only when official
  provider documentation or an observed verified URL contract exists. Missing exact URL evidence
  does not block the generic front door or internal exact anchor.
- **Owner dependency (the one flip).** None for S44 completion. Exact record links for a provider
  are independently enhanced when verified documentation lands; no unsafe runtime gate is needed.

**Open questions & assumptions.**

- _Answered 2026-07-28 (D-06):_ always provide a provider destination for supported providers, using
  the generic front end when an exact record URL is unavailable.
- _Answered 2026-07-28:_ generic provider navigation is not evidence and must say the exact link is
  unavailable.
- _Assumption:_ the provider catalog may store reviewed public front doors in code because they are
  non-secret navigation constants; per-account/record patterns remain configuration/documentation
  driven.
- _Assumption:_ Connections is the fallback only for a provider the product does not yet support or
  whose reviewed front door is absent. Supported provider cards cannot ship without one.
- Decision-complete: E-01 affects only exact-link enhancement, not this suite’s end state.

**Cross-product impacts.**

- Likely shared code includes decision/attention link types, route helpers, external-link validation,
  provider catalog/connection metadata, and focus/return hooks. Consumers span Console,
  Notifications, Approvals, Renewals, Maintenance, Communications, and Connections.
- Works with S40 to bind links/return state to environment and context, S42 attention ownership,
  S43/S45/S46 task surfaces, and S48 Connections.
- Supersedes generic-run aggregation links and in-app anchors presented as provider evidence. Record
  exact markers in facts when shipped.

**Adversarial acceptance checks.**

- **AC-S44-1** — A renewal/maintenance/approval item gathered through every summary/event path keeps
  the same entity+field link and focuses the exact disputed field with evidence and next step.
  _Verify:_ gatherer serialization tests and authenticated browser focus tasks.
- **AC-S44-2** — A documented exact resolver renders an exact-record label and only an allowlisted
  HTTPS host; an undocumented resolver cannot synthesize a path and falls back to the registered
  provider front door. _Verify:_ URL allowlist and guessed-pattern negative tests.
- **AC-S44-3** — A generic link visibly says `Exact record link unavailable`, carries no
  exact/evidence semantics, and still opens the reviewed provider front door even when credentials
  are not configured. _Verify:_ component/accessibility assertions.
- **AC-S44-4** — Return restores the owning route and bounded filters/position; tampered,
  cross-environment, cross-role, expired, external, or oversized return state is discarded without
  redirecting off-app or exposing data. _Verify:_ return-token/query security tests.
- **AC-S44-5** — Unknown item/field, stale decision, or denied scope never focuses another record and
  never leaks its existence; the user gets an honest safe destination. _Verify:_ route-auth and
  object-level authorization tests.
- **AC-S44-6** — `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run test:e2e:core`, `npm run verify:spec-traceability`, and `npm run build` pass; keep URL,
  open-redirect, route-link, scope, environment, and redaction sentinels green.

**Forbidden actions / hard gates.** Never guess provider record URLs, trust an arbitrary external
href, place secrets/tokens/PII in return state, or call a generic front door “evidence.” A link never
confers authorization or provider activation. Demo links must not carry Production record IDs.
Opening an external provider is navigation only and cannot itself mutate/send. Preserve human
confirmation for all effects, managed identity, generic-send closure, no secrets/customer content
in git, and the cost cap.

**Ordered prompt sequence.**

1. _Discovery:_ inventory every link producer/consumer and current exact/generic provider URL;
   classify each URL as documented exact, verified artifact, reviewed front door, in-app only, or
   guessed/unknown.
2. _Understanding:_ define the canonical internal item-link and provider-destination schemas,
   allowed return fields, environment/context binding, focus fallback, and truthful copy matrix.
3. _Build:_ implement shared serialization/validation/focus/return helpers and migrate gatherers
   without changing their owning business rules.
4. _Build:_ implement the provider catalog/resolver and safe outbound component; register reviewed
   front doors for every currently supported provider.
5. _Verify:_ run AC-S44-1 through AC-S44-6 and falsify guessed paths, hostile hrefs, cross-record
   anchors, open redirects, stale return state, wrong labels, and environment leakage.
6. _Gate:_ no Action Registry change. An exact link resolver is not provider execution authority.
7. _Context update:_ record the shipped link contract and exact-provider gaps as enhancements, update
   docs/manual QA, and advance `docs/loop-state.md` to S43.

**Deletion/merge recommendation.** KEEP this spec and MERGE route/provider-link helpers into one
contract. Stage-one deprecate generic-run links and unvalidated hrefs; S49 deletes old helpers only
after all literal/link consumers are migrated.
