<!-- spec-shape: overhaul-v1 -->

# S15 — Gmail hub (drafts, templates, summaries) built to-the-gate

> Historical shipped scope. S19 (`docs/feature-suites/gmail-live-per-user.md`) supersedes D3 as the
> Gmail Hub final-state direction on 2026-07-13. Keep S15's pasted-text tools and browser-only chain as
> the clearly separated fallback; do not use this historical no-read cycle fence to block the S19 local
> runtime build or to authorize any live Gmail action.
>
> New 2026-07-10 (operator note). Owner decision **D3 (2026-07-10)**: build the Gmail workflow HUB
> app-plane **TO-THE-GATE** now, and do NOT request any Gmail READ scope this cycle. Every
> live-mailbox action renders as a gated "Waiting on Gmail access" affordance. The disposable
> decision-complete packet is `docs/temp/gmail-hub-plan.md` (local-only); this file is the tracked spec.
>
> Additive owner direction **D4 (2026-07-13)**: demonstrate reply chaining with a clearly labeled,
> browser-only synthetic thread inside the hub. It must never call Gmail, an app route, or persistence,
> and must not imply that delivery occurred.

**Goal.** Reframe the app one level up as a Gmail workflow tool: a single "Gmail hub" home where an
operator drafts replies, manages reply templates and triage rules, and summarizes a thread — all
before any mailbox is connected. The two verified-but-invisible engines are given their first
user-facing surface: the anticipatory AI composer (`composeAnticipatoryReplyDraft`, F-GMAIL-DRAFT-COMPOSER)
and the Inbox-0 triage/template engine (`evaluateInboxTriage` + `buildReplyDraft` + `ReplyTemplate`,
F-GMAIL-DRAFT-COMPOSER's spine). Today those modules have ZERO non-test importers — the only place
that touches `@/lib/gmail-inbox-zero/*` outside tests is the static `app/admin/gmail-inbox-zero/page.tsx`,
and it imports the vocabulary constants only, never the engines. This suite surfaces them over
PASTED/sanitized text through the `ModelProvider` seam (local model in dev, Gemini in prod), reuses the
existing `buildTenantNoticeDraftRequest` for a tenant "Prepare tenant email" button that mirrors the
owner button, and turns the reframed Owner Email space into the hub's front door. The end-state: an
operator can do real draft/template/summary work in the app with zero mailbox access. Every
inbox-reading feature is visibly one owner/vendor grant away and is never represented as live; the
separate demo-chain fixture is explicitly labeled synthetic and browser-only.

**What it is / how it functions.**

- **Anticipatory draft composer — `components/gmail-hub/AnticipatoryDraftComposer.tsx` +
  `app/api/gmail-hub/anticipatory-draft/route.ts`.** An edit-gated route that builds the injected
  provider via `createModelProvider(config)` (`lib/llm/model-provider.ts:185`, prod-fenced to Gemini)
  and calls `composeAnticipatoryReplyDraft` (`lib/gmail-inbox-zero/anticipatory-draft.ts:137`) over an
  Approved `ReplyTemplate` + a pasted `TriageMessageFacts`. The deterministic `buildReplyDraft` spine
  (`lib/gmail-inbox-zero/drafts.ts:35`) runs FIRST, so an unapproved template or a hard-excluded
  category (`Owner money` / `Legal/notices` / `Tenant disputes`, `constants.ts:32`) refuses with
  `refusedBeforeModel:true` and the model is never invoked. The response carries the banner-bearing
  `draft` + `usedModel`. One model call per thread (on-demand, under the $10 cap); NO Gmail call.
- **Template + triage workspace — `components/gmail-hub/TemplateWorkspace.tsx` (replaces the static
  `app/admin/gmail-inbox-zero/page.tsx:18`).** Renders `LabelRule`/`ReplyTemplate` sets and runs
  `evaluateInboxTriage` (`lib/gmail-inbox-zero/rules.ts:89`) + `buildReplyDraft` over PASTED/sanitized
  `TriageMessageFacts`, showing the suggested label + rule reason and a banner-bearing draft preview.
  The rollout-phase / hard-exclusion / Approved-only invariants are surfaced, not weakened.
- **Thread summary — `components/gmail-hub/ThreadSummaryPanel.tsx` +
  `app/api/gmail-hub/thread-summary/route.ts` + new `lib/gmail-inbox-zero/thread-summary.ts`.** A pure
  composer (injected `ModelProvider`, mirrors the anticipatory-draft DI + degrade contract) that turns
  PASTED thread text into a structured `{ summary, waiting_on, suggested_next_action }` object. No
  mailbox read; any throw / non-JSON / empty output degrades non-fatally; empty paste is a typed 400.
- **Hub IA shell — `app/gmail-hub/page.tsx` + `components/gmail-hub/GmailHubHome.tsx`.** One workflow
  home presenting drafts + templates + summaries + the in-app notification families
  (`lib/notifications/families.ts`) together. The two Gmail-dependent families (`rentvine_replies`,
  `owner_process_replies`) already render `available:false` with the literal "Waiting on Gmail access"
  (`families.ts:49`); the hub reuses that exact posture for its "read my inbox" affordance.
- **Synthetic demo chain — `components/gmail-hub/SimulatedEmailChain.tsx`.** A client-state-only
  fixture starts with one synthetic message and lets an operator append or reset clearly labeled
  simulated replies under one subject. It calls no route, Gmail runtime, mailbox, or persistence;
  refresh resets it, and its action is "Add simulated reply", never Send.
- **Tenant prepare-email — `components/lease-renewal/PrepareTenantEmailButton.tsx` +
  `app/api/lease-renewal/tenant-notice-draft/route.ts`.** A structural twin of the owner button
  (`PrepareOwnerEmailButton.tsx`) and its route (`app/api/lease-renewal/owner-notice-draft/route.ts`):
  builds the addressed UNSENT draft via `buildTenantNoticeDraftRequest` (`notice-send-policy.ts:81`,
  literal `production_allowed:false` + `send_allowed:false`, verbatim `DRAFT_BANNER`), checks
  `isActionExecutable` (`lib/integrations/action-gate.ts:25`) against the SAME pre-approved
  `gmail.renewal_notice.draft_create` key (the seed entry already covers "owner email or tenant offer
  email", `action-registry-seed.ts:662`), and returns the same typed refusal / draft-preview posture.
  No new registry entry; no send method reachable.
- **Owner Email → hub front door — `lib/launch/content.ts:135` + `app/spaces/[spaceId]/page.tsx:191`.**
  The reframed per-user Owner Email space (F-GMAIL-PER-USER) links into `/gmail-hub` and drops any copy
  implying live reading is available; the read-only-sources list stays honest.

- **Buildable now (app-plane).** (no system-of-record write, no autonomous send, no new Google scope,
  no live execution in the app-plane, and NO gate flip — Slice 5 reuses the one pre-approved
  compose-only entry `gmail.renewal_notice.draft_create` (`production_allowed:true`) but only to return
  an UNSENT draft preview; every OTHER touched Action Registry entry stays `production_allowed:false`):
  - Slice 1 — the anticipatory-draft edit-gated route + composer component (runs the `ModelProvider`
    seam; makes NO Gmail call; spine-refuses hard-excluded/unapproved before the model).
  - Slice 2 — the template + triage workspace replacing the static admin page (surfaces
    `evaluateInboxTriage` + `ReplyTemplate` over pasted facts).
  - Slice 3 — the thread-summary route + panel + `thread-summary.ts` (ModelProvider over pasted text).
  - Slice 4 — the `/gmail-hub` IA shell presenting drafts + templates + summaries + in-app
    notifications, with every live-mailbox affordance gated as "Waiting on Gmail access".
  - Slice 5 — the tenant "Prepare tenant email" button + route reusing `buildTenantNoticeDraftRequest`
    with the owner button's `production_allowed:false`/`send_allowed:false`/needs-Gmail-access posture.
  - Slice 6 — the Owner Email space polish (`launch/content.ts`, `spaces/[spaceId]/page.tsx`) into the
    hub entry point.
  - Additive demo slice — the browser-only synthetic chain inside Gmail Hub. This changes no Gmail
    scope, registry entry, execution gate, mailbox state, or stored app state.
- **Gated (owner / vendor).**
  - Any mailbox READ / true inbox integration: the client Gmail access model + a NEW DWD read-scope
    grant. The `gmail.readonly`/`gmail.modify` scope literals are code-FORBIDDEN by
    `npm run verify:router-boundary` (`lib/gmail-runtime/scopes.ts:6`) and stay forbidden this cycle.
  - Live send-and-receive + reply notifications; autonomous send (PERMANENT ceiling: a human presses
    Send — `GmailRuntimeClient` has `createDraft` only, no send method, `client.ts:48`).
  - Live PROD use of `gmail.renewal_notice.draft_create`: owner-run deploy of the flipped seed +
    `GMAIL_DWD_SA` wired (`npm run deploy -- --budget-confirmed`; `npm run smoke:gmail-draft-live`).
  - The two Planned Inbox-0 registry actions (`gmail.label.apply` seed:557, `gmail.draft.create`
    seed:603) — no runtime, stay `Planned`/`production_allowed:false`.
  - Deploy itself stays owner-run.

**Open questions & assumptions.**

- _Answered 2026-07-10 (D3):_ build the hub app-plane TO-THE-GATE; do NOT request any Gmail READ scope
  this cycle; every live-mailbox action renders as a gated "Waiting on Gmail access" affordance.
- _Client-owned:_ the Gmail access model + a NEW domain-wide-delegation read-scope grant
  (`gmail.readonly`/`gmail.modify`) required for true inbox integration, and the safe test-thread
  protocol (already an open client ask in `docs/loop-state.md` / `docs/client-checklist.md`). Route as
  confirm-with-default: the hub ships read-gated until both land.
- _Open:_ whether the tenant renewal email keeps the SAME `gmail.renewal_notice.draft_create` key or
  gets its own. Default (decision-complete): reuse the existing key — the seed entry already scopes
  "owner email or tenant offer email" (`action-registry-seed.ts:662`); this adds NO new entry and flips
  NO gate, so `tests/unit/action-registry-schema.test.ts` stays green.
- _Assumption:_ the thread-summary output schema (`summary` + `waiting_on` + `suggested_next_action`)
  is app-owned and ships without owner sign-off; the local model stands in for Gemini in dev/test and
  prod is forced to Gemini by `lib/config/server.ts` (`model-provider.ts:4`).
- _Assumption:_ replacing the static `app/admin/gmail-inbox-zero/page.tsx` preserves its gated posture
  and its honest "not connected" status; the workspace operates over PASTED/sanitized `TriageMessageFacts`
  only, never live Gmail content (the `rules.ts` domain model is already fixture-only).
- _Assumption:_ hard gates unchanged. The ONE pre-approved executable entry
  (`gmail.renewal_notice.draft_create`, compose-only, F-GMAIL-RENEWAL-DRAFT-LIVE) is REUSED, never
  re-approved, and its live prod use stays owner-gated behind deploy + `GMAIL_DWD_SA`.

**Cross-product impacts.** New: `app/gmail-hub/page.tsx`, `app/api/gmail-hub/anticipatory-draft/route.ts`,
`app/api/gmail-hub/thread-summary/route.ts`, `app/api/lease-renewal/tenant-notice-draft/route.ts`,
`lib/gmail-inbox-zero/thread-summary.ts`, `components/gmail-hub/*` (GmailHubHome, AnticipatoryDraftComposer,
TemplateWorkspace, ThreadSummaryPanel), `components/lease-renewal/PrepareTenantEmailButton.tsx`. Reuses
(no behavior change): `lib/gmail-inbox-zero/anticipatory-draft.ts`, `rules.ts`, `drafts.ts`,
`constants.ts`, `lib/llm/model-provider.ts`, `lib/lease-renewal/notice-send-policy.ts`,
`lib/integrations/action-gate.ts`, `lib/notifications/families.ts`. Replaces `app/admin/gmail-inbox-zero/page.tsx`
(the static read-only v1) — updates, not weakens, the F-ADMIN-IA file reference. Touches
`lib/launch/content.ts` + `app/spaces/[spaceId]/page.tsx` (Owner Email → hub link) and the AppShell nav.
Interacts with facts F-GMAIL-DRAFT-COMPOSER, F-GMAIL-RUNTIME-GATED, F-GMAIL-RENEWAL-DRAFT-LIVE,
F-GMAIL-PER-USER, F-NOTIF-FRAMEWORK, F-PRECUST-CYCLE; supersedes none — it builds the missing SURFACE
for engines those facts already verify.

**Adversarial acceptance checks.**

- **AC-S15-1** — `POST /api/gmail-hub/anticipatory-draft` at the `edit` capability, given an Approved
  template + pasted `TriageMessageFacts`, returns HTTP 200 with `{ ok:true, usedModel:<bool> }` and a
  `draft` whose first line is the verbatim `DRAFT_BANNER`; wired against a fake `ModelProvider` it makes
  ZERO Gmail-runtime calls (the route module imports no `@/lib/gmail-runtime/*`, pinned by a
  negative-import assertion). Unauthenticated → 401. _Verify:_ `npm test`, `npm run typecheck`; keep
  `tests/unit/gmail-inbox-zero-anticipatory-draft.test.ts` green.
- **AC-S15-2** — The same route, given an unapproved template OR a hard-excluded category
  (`Owner money`/`Legal/notices`/`Tenant disputes`), returns `refusedBeforeModel:true` and the injected
  fake provider's `generateText` call count is exactly 0 (the model never sees excluded mail). _Verify:_
  `npm test`; keep `tests/unit/gmail-inbox-zero-anticipatory-draft.test.ts` +
  `tests/unit/gmail-inbox-zero.test.ts` green.
- **AC-S15-3** — The template/triage workspace, given a pasted `TriageMessageFacts` that matches an
  Approved `LabelRule`, renders the suggested label text + the rule reason (from `evaluateInboxTriage`)
  AND a `buildReplyDraft` preview whose body contains `DRAFT_BANNER`; the retired static string
  "Read-only v1. Gmail runtime is client-gated" no longer renders; no Send control is present in the DOM.
  _Verify:_ `npm test`, `npm run lint`; keep `tests/unit/gmail-inbox-zero.test.ts` green.
- **AC-S15-4** — `POST /api/gmail-hub/thread-summary` (edit-gated) over pasted text returns HTTP 200
  with a structured summary object; an empty/whitespace paste returns HTTP 400 with a typed error (never
  a mailbox read); the route imports no `@/lib/gmail-runtime/*` (negative-import pinned). _Verify:_
  `npm test`, `npm run typecheck`.
- **AC-S15-5** — The `/gmail-hub` home renders the drafts, templates, and summary tools together with
  the in-app notification families, and every live-mailbox affordance — the `rentvine_replies` +
  `owner_process_replies` families and any "read my inbox" control — renders disabled carrying the exact
  literal string `Waiting on Gmail access`; no control on the page issues a Gmail read or send. _Verify:_
  `npm test`, `npm run lint`; keep `tests/unit/route-auth-boundary.test.ts` green.
- **AC-S15-6** — `POST /api/lease-renewal/tenant-notice-draft` (edit-gated) returns a `request` object
  with `channel:"tenant"`, `production_allowed:false` and `send_allowed:false` (both literally false) and
  a `body` beginning with the verbatim `DRAFT_BANNER`; `PrepareTenantEmailButton` renders the draft in a
  copyable box and exposes NO Send control; unauthenticated → 401. _Verify:_ `npm test`; keep
  `tests/unit/lease-renewal-notice-send-policy.test.ts` + `tests/unit/route-auth-boundary.test.ts` green.
- **AC-S15-7** — After this suite ships, `isActionExecutable` returns `true` for EXACTLY one key
  (`gmail.renewal_notice.draft_create`) and `false` for `gmail.label.apply` + `gmail.draft.create`;
  `npm run verify:router-boundary` passes (no `gmail.readonly`/`gmail.modify` scope literal was
  introduced); the executable allow-list is unchanged (S15 adds no new `production_allowed:true` entry).
  _Verify:_ `npm run verify:router-boundary`, `npm test`; keep
  `tests/unit/action-registry-schema.test.ts` + `tests/unit/action-gate.test.ts` green.
- **AC-S15-8** — The hub renders a "Simulated email chain" marked "Browser only"; adding a simulated
  reply increments the messages-under-one-thread count without calling `fetch`, Gmail runtime,
  Firestore, or browser storage; reset/refresh returns the seed fixture; and no Send control is
  introduced. _Verify:_ `npm test`, `npm run lint`; keep
  `tests/unit/gmail-hub-simulated-email-chain.test.tsx` green.

_Verify command list (all green before promote):_ `npm test`, `npm run typecheck`, `npm run lint`,
`npm run verify:router-boundary`, `npm run verify:copy-voice`, `npm run verify:spec-traceability`,
`npm run verify:context-freshness`, `npm run build`. Named sentinels to keep green:
`tests/unit/gmail-inbox-zero-anticipatory-draft.test.ts`, `tests/unit/gmail-inbox-zero.test.ts`,
`tests/unit/gmail-hub-simulated-email-chain.test.tsx`,
`tests/unit/action-gate.test.ts`, `tests/unit/action-registry-schema.test.ts`,
`tests/unit/owner-notice-draft-route.test.ts`, `tests/unit/lease-renewal-notice-send-policy.test.ts`,
`tests/unit/route-auth-boundary.test.ts`, and the `scripts/check-router-boundary.mjs` boundary gate.

**Forbidden actions / hard gates.** App-plane only. This suite introduces NO new executable Action
Registry entry and flips NO gate: every entry it touches stays `production_allowed:false`, and it REUSES
(never re-approves) the one pre-approved compose-only entry `gmail.renewal_notice.draft_create`. No
autonomous send — the ceiling is an UNSENT draft a human presses Send on (`GmailRuntimeClient.createDraft`
only; no send method, no `gmail.send` scope). No system-of-record write (RentVine / Sheet / QuickBooks /
bank / client Drive). No new Google scope — the `gmail.readonly`/`gmail.modify` literals stay
code-forbidden by `verify:router-boundary`. No Cloud Scheduler. No client mailbox content on GitHub
(the composer/workspace operate on sanitized/pasted `TriageMessageFacts` only). ~$10 budget cap
(single-thread on-demand model calls). Deploy and the DWD grant stay owner-run.

**2026-07-13 audit hardening (QA-004).** Draft categories are stable ids, never presentation-label
comparisons. `draft-safety.ts` normalizes approved aliases and deterministically scans the untrusted category,
subject, and pasted fact names before the route reads model config or constructs a provider; the pure composer
repeats the check before invocation. Unknown/blank categories, the three excluded ids, and obvious excluded
intent all return `refusedBeforeModel:true`. Canonical and alias exclusions are table-tested with provider and
model call counts fixed at zero. The UI uses closed selects; pasted/mailbox/no-send boundaries are unchanged.

**2026-07-13 phone containment (QA-005).** The hub has one page-content wrapper; nested grids, panels,
fields, controls, pasted facts, refusals, summaries, buttons, and draft previews use shrinkable tracks and wrap
long content. The correction targets actual Gmail descendants and does not hide document overflow or clip
review-before-send / Waiting on Gmail access guidance.

**Ordered prompt sequence.**

1. _Discovery:_ Confirm the invisible-engine claim — grep that `composeAnticipatoryReplyDraft` +
   `evaluateInboxTriage` have zero non-test importers, and read `lib/llm/model-provider.ts` +
   `app/api/lease-renewal/owner-notice-draft/route.ts` as the DI + gate templates to copy.
2. _Build:_ Slice 1 — `app/api/gmail-hub/anticipatory-draft/route.ts` (edit-gated, injects
   `createModelProvider`, calls `composeAnticipatoryReplyDraft`, no `@/lib/gmail-runtime` import) +
   `AnticipatoryDraftComposer.tsx`. Falsify: spine-refuses-before-model (call count 0), banner exactly
   once, 401 unauth, negative-import test.
3. _Build:_ Slice 2 — replace `app/admin/gmail-inbox-zero/page.tsx` with the `TemplateWorkspace` that
   runs `evaluateInboxTriage` + `buildReplyDraft` over pasted facts; retire the static "Read-only v1"
   copy. Falsify: matched Approved rule renders label+reason; preview carries the banner; no Send control.
4. _Build:_ Slice 3 — `lib/gmail-inbox-zero/thread-summary.ts` + `app/api/gmail-hub/thread-summary/route.ts`
   - `ThreadSummaryPanel.tsx` (ModelProvider over pasted text; empty paste → typed 400; non-fatal degrade).
5. _Build:_ Slice 4 — `app/gmail-hub/page.tsx` + `GmailHubHome.tsx` presenting drafts/templates/summaries
   - the notification families; wire the AppShell nav entry. Falsify: live-mailbox affordances render the
     exact "Waiting on Gmail access" literal and cannot trigger a read/send.
6. _Build:_ Slice 5 — `app/api/lease-renewal/tenant-notice-draft/route.ts` (twin of the owner route,
   reusing `buildTenantNoticeDraftRequest` + the same `gmail.renewal_notice.draft_create` gate check) +
   `PrepareTenantEmailButton.tsx`. Falsify: request invariants both literal false; banner present; 401
   unauth; route in the auth-boundary allow-list-EXCLUDED set (must be authed).
7. _Build:_ Slice 6 — polish `lib/launch/content.ts` + `app/spaces/[spaceId]/page.tsx` so the per-user
   Owner Email space links into `/gmail-hub` and drops any live-reading implication.
8. _Verify:_ Run the full Verify command list above; keep every named sentinel green; adversarial
   4-lens falsification per `docs/autonomous-agent-runner.md`.
9. _Gate:_ STOP before any live-mailbox read, any new DWD read-scope grant, and any prod deploy of the
   flipped renewal-draft seed — hand back to the owner.
10. _Owner:_ (out of loop) the Gmail read access model + read-scope DWD grant; the
    `npm run deploy -- --budget-confirmed` + `smoke:gmail-draft-live` for live renewal-draft use.
11. _Context update:_ Promote the shipped app-plane surface to a `docs/facts.md` `F-GMAIL-HUB` row citing
    AC-S15-1..AC-S15-7, note that it builds the surface for F-GMAIL-DRAFT-COMPOSER and updates (not
    weakens) the F-ADMIN-IA `app/admin/gmail-inbox-zero/page.tsx` reference, and update
    `docs/loop-state.md` (Snapshot + Next Safe Slice) within the 140-line cap.

**Deletion/merge recommendation.** KEEP as the tracked spec for the Gmail-hub reframe;
`docs/temp/gmail-hub-plan.md` stays disposable evidence. Do NOT merge into S13
(`pre-customer-refinement.md`) — that cycle is shipped; this is a new user-facing surface over engines
S13 and the deferred cycle already built. When Slice 2 removes the static admin page, record the
supersede marker for the retired "Read-only v1 … makes no Gmail call" placeholder copy in the
`docs/facts.md` Supersede Log and re-point the F-ADMIN-IA file reference; do not append the old copy
beside the new workspace.
