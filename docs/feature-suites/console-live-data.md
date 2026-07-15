<!-- spec-shape: overhaul-v1 -->

# S23 — Console Live and Test data lanes

> New 2026-07-14; working-app contract revised 2026-07-15. Implements R08 and the Round 2
> full-authorized-detail direction.

**Status — Deployed and browser-accepted 2026-07-15.** The Console server loads distinct
Live and Test projections in production, renders persistent mode badges, uses the bounded Rentvine Live
read provider when configured, keeps the production Test workspace provider-free, and shows named
source unavailable states instead of crossing lanes. Scoped/provenanced projection, bounded message
metadata, on-demand body boundary, environment tests, and live-provider mapping tests exist. The
serving `00025-mhw` revision passed signed-in desktop/phone acceptance; the Admin Test workspace passed
Vendor 11/11, Lease 11/11, and Maintenance 19/19 with zero Live calls. A missing Live connection does
not make the application Pre-V1.

**Goal.** Console is a trustworthy operational front door where authorized users can see both current
Live operations and invented Test workflow records without confusing them. Live panels use only
configured real sources. Test panels use only isolated Test records/adapters. Each source reports
provenance, freshness, health, and a clear unavailable state, and full communication content remains
inside the authorized workflow panel.

**What it is / how it functions.**

- **Two server-owned modes.** Production renders a `LIVE` operations panel and a visibly labeled
  `TEST` workspace panel. Mode is chosen on the server from the record/provider contract, never a
  browser flag. A missing/malformed legacy record mode resolves to Live so old customer data cannot
  silently enter Test.
- **No cross-lane fallback.** Live provider outage shows the named source unavailable/stale and leaves
  its Live panel empty or partial. It never constructs a Test provider. Test data may anticipate and
  exercise workflow state but performs zero external calls and never claims Live freshness or proof.
- **Live source contract.** Configured Rentvine read supplies authorized property/unit/lease/tenant/
  rent facts; app storage supplies workflow/attention/approval state; configured Gmail supplies sender,
  recipients, timestamp, subject, bounded snippet, and targeted full body for an already authorized
  workflow link. Each field carries source, observed-at, freshness, and unavailable/needs-review state.
- **Test source contract.** Invented app-owned rows use reserved Test identifiers, including
  `unit:test-maple-204` displayed as `TEST — 204 Maple Court Unit 2`. Test rows and counts are marked
  `liveEvidenceEligible:false`; they may reach normal workflow states, including `Done`, without any
  provider access.
- **Console projection.** Cards may render property/unit, tenant label, lease/rent facts, workflow
  state, and message sender/recipients/time/subject/snippet. A snippet is inert text capped at 240
  Unicode characters and three visual lines; no attachment or body HTML is serialized.
- **Full body boundary.** Full content is fetched on demand only after entity/Space/mailbox
  authorization in S19/S22 and appears only in the workflow communication panel. It is absent from the
  Console loader, notification, URL, server component props, analytics, and persisted projection.
- **Authorization/minimization.** Internal Space scope applies to every row and count. Vendor uses the
  S22 assigned-ticket projection and never sees general Console. Values are not written to bodyless
  notifications, logs, metrics, or audits.
- **Activation model.** Console application readiness requires both panels, isolation, health states,
  and Test workflow coverage. Each Live source is activated and monitored separately. An unavailable
  Rentvine or Gmail source is an explicit connection item, not a reason to replace the panel with
  fixtures or downgrade the complete application.

**Open questions & assumptions.**

- _Answered 2026-07-14:_ inline message metadata is sender, recipients, timestamp, subject, bounded
  snippet; full body stays in the authorized workflow communication panel.
- _Answered 2026-07-15:_ production deliberately contains both visibly isolated Live and Test lanes;
  Test records are valid application evidence but never Live-provider evidence.
- _Default:_ launch snippet bound is 240 Unicode characters and three visual lines; expansion requires
  a reviewed policy/code change.
- _Default:_ “full authorized detail” excludes full lease packets, attachment bodies, bank/screening
  data, and unrelated mailbox content.
- _Operational input, not a product blocker:_ Live provider credentials/mappings are configured per
  source. Until then, the corresponding Live panel says unavailable while Test remains usable.

**Cross-product impacts.** Touches Console loaders/components, anticipation projection, Rentvine read
models, Test records, workflow/notification joins, S19/S22 communication panels, environment config,
redaction/logging, provider health, release reporting, and browser acceptance. Supersede markers:
`PRODUCTION-FIXTURE-FALLBACK` and `PRODUCTION-TEST-DATA-FORBIDDEN`.

**Adversarial acceptance checks.**

- **AC-S23-1** — Authorized production Console renders separate Live and Test panels, each with an
  always-visible badge, source/observed-at/freshness, exact bounded metadata, and scope-filtered counts.
  The canonical Test unit is visibly invented. _Verify:_ `npm test -- console-live-data console-view
console-rentvine-live-provider`.
- **AC-S23-2** — Initial Console request makes zero full-body/attachment calls and serialized DOM/props
  contain no message body; opening an authorized workflow panel makes one targeted body call in that
  record's matching lane. _Verify:_ `npm test -- console-message-boundary gmail-hub-live-routes`.
- **AC-S23-3** — Snippet is inert plain text and at most 240 Unicode characters/three lines under HTML,
  script, bidi, huge, and malformed MIME inputs. _Verify:_ `npm test -- console-snippet`.
- **AC-S23-4** — Live provider failure renders that source unavailable/stale and constructs no Test
  provider; Test provider failure cannot invoke Live. Legacy/malformed mode resolves to Live. _Verify:_
  `npm test -- console-environment-boundary console-live-data`.
- **AC-S23-5** — Production Test workspace is server-selected, persistently labeled, uses invented
  records, and makes zero external provider calls. A forged browser flag, query, cookie, or record id
  cannot switch modes or make Test evidence Live-eligible. _Verify:_ `npm test --
console-environment-boundary data-mode`.
- **AC-S23-6** — Logs, notifications, URLs, metrics, and audits contain no property/tenant/rent/message
  values; full body is transient and unrelated/cross-mode thread IDs fail before Gmail construction.
  _Verify:_ `npm run verify:redaction`; `npm test -- console-message-boundary`.
- **AC-S23-7** — Full checks pass: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm
test`, `npm run test:e2e:core`, `npm run verify:router-boundary`, `npm run build`.

**Forbidden actions / hard gates.** No browser-selected mode, Live-to-Test or Test-to-Live fallback,
fixture presented as Live, Test external call, inline full body, attachment fetch, cross-Space/
cross-mailbox/cross-mode data, or customer values in logs/notifications/audit/git. This suite is a read
projection and grants no external write. Live reads require the corresponding configured provider;
unconfigured sources remain visibly unavailable. ~$10 cap.

**Ordered prompt sequence.**

1. _Build/verify mode contract:_ keep `live|test` server-owned at provider, record, projection, and UI
   boundaries; default legacy absence to Live and label both panels.
2. _Build/verify sources:_ map bounded Rentvine Live fields and invented Test rows with provenance,
   freshness, and explicit unavailable states; never share provider construction.
3. _Build/verify communication detail:_ keep snippets bounded and full body on one authorized targeted
   workflow call only.
4. _Verify:_ falsify wrong scope, provider outage, mode forgery, cross-lane identifiers, malicious MIME,
   unrelated thread, and body/log leakage; run full checks.
5. _Deploy/accept:_ validate both panels, Live unavailable/configured states, and canonical Test rows at
   desktop and phone widths; record application acceptance separately from Live-source activation.
6. _Context update:_ record S23 application evidence and per-source activation/health in
   facts/status/plan/loop without returning to a Pre-V1 all-source gate.

**Deletion/merge recommendation.** KEEP as the canonical Console lane/data-boundary spec. MERGE its
shipped behavior into S17/current Console facts while retaining S23 for production isolation and
provider-failure regression coverage.
