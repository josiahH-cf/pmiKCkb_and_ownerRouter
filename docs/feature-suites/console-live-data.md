<!-- spec-shape: overhaul-v1 -->

# S23 — Console live-data and test-data boundary

> New 2026-07-14. Implements R08 and the Round 2 full-authorized-detail direction.

**Status.** Local green 2026-07-14. AC-S23-1..7 pass with fake/synthetic providers, full unit and core
E2E verification. Production provider wiring, approved-record browser acceptance, deployment, and
every live customer/Gmail read remain gated.

**Goal.** Console is a trustworthy live operational front door: authorized users see current property,
tenant, rent, workflow, and bounded communication context, can open full message bodies only inside the
authorized workflow panel, and can immediately tell when a source is unavailable. Production can never
silently substitute fixture/demo data.

**What it is / how it functions.**

- **Source contract.** Rentvine supplies authorized property/unit/lease/tenant/rent facts; app stores
  workflow/attention/approval state; Gmail supplies sender, recipients, timestamp, subject, bounded
  snippet and on-demand full body for an already authorized workflow link. Each field carries source,
  observed-at, freshness, and unavailable/needs-review state.
- **Console projection.** Cards may render property/unit, tenant label, lease/rent facts, workflow
  state, and message sender/recipients/time/subject/snippet. A bounded snippet is plain inert text,
  capped by characters and lines, with no attachment/body HTML.
- **Full body boundary.** Full content is fetched on demand only after entity/Space/mailbox authorization
  in S19/S22 and appears only in the workflow communication panel. It is not included in the Console
  loader, notification, URL, server component props, analytics, or persisted projection.
- **Environment mode.** Production mode is derived server-side from deployment configuration and uses
  live providers only. Fixture providers compile/run only in local, emulator, test, or explicitly named
  non-production test deployments and render a persistent “Test data” badge. Provider failure in
  production renders named unavailable/stale state and retry guidance; no fallback occurs.
- **Authorization/minimization.** Existing internal Space scope applies to all rows and counts. Vendor
  uses S22 assigned-ticket projection only and never sees general Console. Values are not logged or put
  in bodyless notifications/audits.
- **Buildable now (app-plane).** Provider interfaces, field provenance/freshness schema, fixture build
  fence, scoped projection, snippets, detail-panel fetch seam, failure states, and fake-provider tests.
- **Gated (owner / vendor).** Live source reads, production provider configuration, deploy, and browser
  acceptance with approved records.

**Open questions & assumptions.**

- _Answered 2026-07-14:_ inline metadata is sender, recipients, timestamp, subject, bounded snippet;
  full body is in the authorized workflow communication panel.
- _Answered 2026-07-14:_ production uses live sources only and fails visibly; fixtures exist only in
  local/emulator/explicit non-production test with an obvious badge.
- _Assumption:_ launch snippet bound is 240 Unicode characters and three visual lines; Admin cannot
  expand it in production without a code-reviewed policy change.
- _Assumption:_ “full authorized detail” does not mean full lease packets, attachment bodies, bank/
  screening data, or unrelated mailbox content; existing security exclusions remain.
- _Client-owned:_ none for local implementation. Business acceptance selects approved test records at
  the live gate without committing their values.

**Cross-product impacts.** Touches Console loaders/components, anticipation projection, Rentvine read
models, workflow/notification joins, S19/S22 communication panels, environment config, redaction/logging,
and browser acceptance. Supersede marker: `PRODUCTION-FIXTURE-FALLBACK`.

**Adversarial acceptance checks.**

- **AC-S23-1** — Authorized internal Console renders live-provider fields with source/observed-at and
  exact bounded metadata; wrong Space omits row and count. _Verify:_ `npm test -- console-live-data`.
- **AC-S23-2** — Initial Console request makes zero full-body/attachment calls and its serialized DOM/
  props contain no message body; opening the authorized panel makes one targeted body call. _Verify:_
  `npm test -- console-message-boundary gmail-hub-live-routes`.
- **AC-S23-3** — Snippet is inert plain text and at most 240 Unicode characters/three lines under HTML,
  script, bidi, huge, and malformed MIME fixtures. _Verify:_ `npm test -- console-snippet`.
- **AC-S23-4** — Production provider failure renders the named source unavailable/stale and never
  constructs fixture/demo providers. _Verify:_ `npm test -- console-environment-boundary`; keep the
  production demo-mode guard green.
- **AC-S23-5** — Local/emulator/explicit test mode shows a persistent “Test data” badge and no live
  provider call; a forged browser flag cannot switch modes. _Verify:_ `npm test --
console-environment-boundary`.
- **AC-S23-6** — Logs, notifications, URLs, metrics, and audits contain no property/tenant/rent/message
  values; full body is transient and unrelated thread IDs fail before Gmail construction. _Verify:_
  `npm run verify:redaction`; `npm test -- console-message-boundary`.
- **AC-S23-7** — Full checks pass: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm
test`, `npm run test:e2e:core`, `npm run verify:router-boundary`, `npm run build`.

**Forbidden actions / hard gates.** No live customer/Gmail read in the local slice; no production
fixture fallback or browser mode switch; no inline full body; no attachment fetch; no cross-Space/
cross-mailbox data; no values in logs/notifications/audit/git; no deployment or production smoke without
approval. This suite is read-only and adds no external write. ~$10 cap.

**Ordered prompt sequence.**

1. _Discovery:_ map Console data loaders, projections, demo-mode guards, S19 panels, logs, and current
   tests; list every value-bearing field and source.
2. _Build:_ define server-only provider mode, typed provenance/freshness/unavailable fields, and fixture
   build fence.
3. _Build:_ project scoped live fields and bounded inert snippets; preserve value-free notifications.
4. _Build:_ ensure full body is an on-demand targeted panel call after authorization and is not
   serialized/persisted elsewhere.
5. _Build:_ add production failure states and obvious non-production badge; forbid browser switching.
6. _Verify:_ falsify wrong scope, provider outage, fixture env leak, malicious MIME, unrelated thread,
   and body/log leakage; run full checks.
7. _Gate:_ stop before live source reads/deploy; prepare source-by-source browser acceptance cases.
8. _Context update:_ add `F-CONSOLE-LIVE-BOUNDARY-BUILT` citing AC-S23-1..7 and update status/plan/loop.

**Deletion/merge recommendation.** KEEP as the canonical Console data-boundary spec. MERGE its shipped
behavior into S17/current Console facts; retain S23 for production/fixture regression coverage.
