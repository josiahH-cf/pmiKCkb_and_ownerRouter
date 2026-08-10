<!-- spec-shape: overhaul-v1 -->

# S34 - Dotloop e-signature activation

> New 2026-07-23 (operator note). Wave-2 seam spec for roadmap feature #8 (`docs/roadmap-unblock-2026-07-23.md` §2 row 8, §4 Wave-2, §5 owner-dep #6). The disposable decision-complete packet lives at `docs/temp/dotloop-esign-activation-plan.md` (local-only); this is the TRACKED spec the loop executes.
>
> **Approved specification amendment, 2026-08-10.** S66 owns renewal document-packet selection,
> source facts, artifact versions, conditional inclusion, and participant visibility. S34 is the
> Dotloop transport/execution contract and may consume only an approved S66 packet snapshot. This
> amendment authorizes specification edits only.

**Goal.** Today the renewal desk can only propose Dotloop work, never do it: the operator gets a "build the lease packet in Dotloop" follow-up draft (`lib/lease-renewal/dotloop-followup-draft.ts`, from `F-SPACE-DESK-1`) and the two Dotloop actions exist in the Action Registry, but every one is `production_allowed:false`, the OAuth exchanger throws by design (`NotConnectedDotloopTokenExchanger.exchangeCode`), the executor runs against a fake in-memory provider only (`lib/release/synthetic-execution.ts`), and there is NO route anywhere under `app/api/**/dotloop*` that hears back when a loop is signed. After this suite, the app builds the renewal loop from a template with the property and participant fields auto-filled, uploads the renewal document into it, and - the missing piece - hears Dotloop's completion event on a webhook and advances the renewal's own workflow state to "signed / complete" without sending anything. Everything up to the single owner step (register the Dotloop OAuth app, set the three env vars, authorize) is built to the seam: the live token exchanger, the live loop/document/status provider, and the completion webhook all land wired-but-gated, so activation is a reviewed one-line flip, not a build. No live Dotloop call happens until the connector is connected, and both Dotloop actions stay `production_allowed:false` until the owner has authorized AND the flip has been reviewed.

**What it is / how it functions.** One OAuth connection feeds two governed write actions and one inbound completion webhook; the webhook updates the renewal's app-owned progress state only and never sends. The full S25 preview / confirm / receipt / reconcile / rollback contract already wraps both Dotloop actions (`F-LEASE-V1-EXECUTION-BOUNDARY`); this suite replaces the fake provider behind it with a live one and adds the return path.

- **Packet input boundary.** Before either Dotloop write is previewed, S34 requires one immutable,
  versioned S66 packet snapshot containing the packet type, approved artifact ids/versions,
  field/value/source bindings, participant roles and visibility, missing/conflict result, and a
  deterministic content hash. S34 validates and transports that snapshot; it does not select legal
  documents, infer a missing field, classify an animal, set a charge, merge owner-only content into
  a tenant packet, or choose participant roles. A snapshot that is missing, partial, stale,
  conflicting, unapproved, or hash-mismatched blocks before provider construction.

- **Connect surface - `lib/connections/dotloop-oauth.ts` + `lib/connections/connector-catalog.ts`.** The auth-code scaffold already builds the authorize URL (`buildDotloopAuthorizeUrl`), reads config by env NAME presence (`readDotloopOAuthConfig`), and exposes connect/revoke hooks (`beginDotloopConnect` / `revokeDotloopConnection`) that make NO live call and never return a secret. The connector card (`connector-catalog.ts` id `dotloop`) already declares `method:"oauth"`, `healthCheckRef:"health.dotloop.oauth_app"`, the three `requiredConfig` NAMES, and the honest `setupNote`. This surface is DONE; the live exchanger plugs in behind the existing `resolveDotloopTokenExchanger()` seam.
- **Two write actions - `lib/lease-renewal/execution/providers.ts` + `lib/integrations/action-registry-seed.ts`.** `DotloopRenewalExecutor` (providers.ts ~line 488) already validates and executes `dotloop.loop.create_from_template` (requires `workflow_context`, `template_ref`, non-empty `participant_refs`) and `dotloop.document.upload` (requires `loop_ref`, `document_ref`, `document_type`, `content_hash`), keys idempotency via `externalActionIdempotencyKey`, and returns a bodyless `receipt`. Both seed entries (seed ~line 258) are `readiness:"Needs Permission"`, `evidence_status:"Documented"`, `event_ingestion_mode:"Webhook"`, `connection_health_check_ref:"health.dotloop.oauth_app"`, `production_allowed:false`. The executor and contract are BUILT; only the provider behind the `DotloopProvider` interface is fake.
- **Completion webhook (the missing piece) - new `app/api/webhooks/dotloop/route.ts` + new pure `lib/connections/dotloop-webhook.ts`.** Modeled exactly on the Gmail Pub/Sub push route (`app/api/gmail-hub/pubsub/route.ts`): service-auth FIRST (validate the request before decoding the body), then a gate check, then process, then JSON. Critically, the inbound payload is treated as a TRIGGER only, never as authoritative: on a loop/document status event the handler re-fetches the loop and document status from Dotloop through the authenticated live provider (the authenticated read is the source of truth), maps it with the pure `mapDotloopCompletion(event, run)` reducer, and calls the renewal-progress transition to mark the "build" stage documents-signed / complete (`lib/lease-renewal/renewal-progress.ts` core, persisted via `lib/firestore/lease-renewal-progress.ts`) and/or reconciles the execution record (`lib/firestore/external-action-executions.ts`). It updates workflow state ONLY - it invokes no Gmail draft/send executor and no external system-of-record write. Until the connector is connected the route is gated closed (mirrors `isActionExecutable(...)` in the pubsub route) and no-ops fail-closed.
- **Health + Test lane - `lib/integrations/health-checks.ts` + `lib/release/synthetic-execution.ts`.** `health.dotloop.oauth_app` already defines config-presence, token-validation, profile-probe, and webhook-subscription-readable steps; the live exchanger/provider make those probes real. The isolated Test lane keeps its fake `dotloopProvider` (synthetic-execution.ts ~line 552) and stays non-routable: Test never contacts Dotloop and its receipts stay `provider_contacted:false` (`F-LEASE-WORKING-V1`).

- **Buildable now (app-plane).** No new external scope, no live call, every action stays `production_allowed:false`; the loop builds these unattended.
  - **Slice 1 - webhook route scaffold, gated closed.** `app/api/webhooks/dotloop/route.ts` exists and is reachable, verifies the request before body decode, and - because the connector is not connected and the actions are not executable - refuses / no-ops fail-closed exactly like the pubsub gate; it never mutates state from an unauthenticated payload. New `tests/unit/dotloop-webhook-route.test.ts`.
  - **Slice 2 - pure completion reducer.** `lib/connections/dotloop-webhook.ts` exporting a pure `mapDotloopCompletion(input)` (event + current run state in, next renewal-progress transition out; no `Date.now`, no I/O) that only ever advances/annotates the app-owned "build" stage and returns a no-op for unrelated events. New `tests/unit/dotloop-webhook.test.ts` (determinism + "never emits a send/draft/SoR-write intent").
  - **Slice 3 - honest connect + health copy.** Confirm the connector card's "authorize" state, the `credentials_not_configured` connect result (returns the three missing NAMES), and the health card read as not-yet-verified until authorized. Copy passes `verify:copy-voice`.
- **Build to the seam (live provider).** The live implementations, wired behind the existing seams, still `production_allowed:false`.
  - **Live token exchanger** implementing `DotloopTokenExchanger`, plugged in behind `resolveDotloopTokenExchanger()`: it POSTs to `DOTLOOP_OAUTH_TOKEN_URL` server-side with the client secret, and stores the result as OPAQUE vault refs (`DotloopTokenSet.accessTokenRef` / `refreshTokenRef`) via `ConnectorSecretVault` - never a raw token in a response, log, or git. The OAuth callback handler calls it to complete `beginDotloopConnect`.
  - **Live `DotloopProvider`** (new `lib/connections/dotloop-live-provider.ts`) implementing `createLoop` (from template, with property + participant fields auto-filled), `uploadDocument` (multipart into the loop folder), and `reconcile` (by idempotency key) against the DOCUMENTED Dotloop API v2 (loops, templates, participants, document upload, webhooks), replacing the fake provider in the LIVE executor resolution only. It carries one-attempt idempotency, receipt/readback, and the archive/delete rollback the seed `rollback_note` names.
  - **Live webhook handler** completing Slice 1/2: verify (optional documented subscription-secret NAME, presence-only defense in depth) -> authenticated re-fetch via the live provider -> `mapDotloopCompletion` -> renewal-progress transition / execution-record reconcile. Idempotent and replay-safe (a repeated event does not double-advance).
- **Owner dependency (the one flip).** Register the Dotloop OAuth application, set `DOTLOOP_OAUTH_CLIENT_ID`, `DOTLOOP_OAUTH_CLIENT_SECRET`, and `DOTLOOP_OAUTH_REDIRECT_URI` (Secret Manager / runtime env; NAMES only in git), and complete authorization once (roadmap §5 #6). The Dotloop API v2 endpoints are already `Documented`, so this is the ONLY blocker - there is no undocumented-endpoint gap. After it lands, the reviewed one-line flip on BOTH `dotloop.loop.create_from_template` and `dotloop.document.upload`: set `readiness:"Approved for Execution"` + `evidence_status:"Documented"` + `production_allowed:true`, add both keys to BOTH `EXECUTABLE_ALLOWLIST` copies (`scripts/seed-action-registry.ts` and `lib/admin/migration-readiness.ts`), and update the pinned tests (`tests/unit/action-registry-schema.test.ts`, `tests/unit/seed-action-registry-allowlist.test.ts`, `tests/unit/dotloop-renewal-executor.test.ts`). The loop hands back only here.

**Open questions & assumptions.**

- _Assumption:_ the completion webhook advances the app's OWN renewal-progress state machine (`renewal-progress.ts` "build" stage), not a Dotloop-owned record; RentVine and the Sheet stay read-only, consistent with the Phase-A progress design and `F-LEASE-WORKING-V1`. It never sends or drafts anything.
- _Assumption:_ the inbound webhook payload is a trigger only; the authenticated re-fetch of loop/document status via the live provider is the authoritative source, so a forged or replayed delivery cannot advance state on its own. This keeps the owner dependency at the three named OAuth env vars and adds no guessed credential.
- _Open:_ whether Dotloop's documented webhook delivery exposes a per-subscription signing secret. If it does, it is consumed as a presence-only env NAME (e.g. `DOTLOOP_WEBHOOK_SECRET`) for defense in depth; if not, the authenticated re-fetch stands alone. Recorded as a `Q-DOTLOOP-WEBHOOK-AUTH` row in `docs/facts.md` at authoring time; either way no secret VALUE enters git.
- _Assumption:_ `dotloop.loop.create_from_template` and `dotloop.document.upload` are governed at the S25 High-risk exact-preview Admin-approval tier - an approval bound to the payload hash plus the displayed target/participants/source context (`F-LEASE-V1-EXECUTION-BOUNDARY`). Loop creation builds a legal document set with named participants, so it is not lowered below exact Admin approval by this suite.
- _Superseded 2026-08-10:_ S34 no longer asks an operator to choose a template or accepts a
  confirm-with-default participant mapping. S66's trusted, approved artifact catalog and participant
  rules supply the exact packet snapshot. Missing catalog metadata is a local S66 blocker, not a
  value S34 may default.
- _Assumption:_ hard gates unchanged this cycle - no autonomous send, the completion webhook writes
  app state only, and the Test lane provider stays fake and non-routable. The verified non-null S52
  production cost ceiling applies; if it is unset, cost-bearing/live/cloud work is closed while
  local/app-plane work continues. OAuth registration and interactive authorization remain owner-run;
  routine deployment follows D05 after its full gate is green.

**Cross-product impacts.** Extends the already-built Dotloop surfaces:
`lib/connections/dotloop-oauth.ts`, `lib/connections/connector-catalog.ts`, the renewal execution
providers/follow-up, Action Registry and health definitions, plus the webhook/live-provider paths
described above. S66 becomes the required upstream packet contract; S43 presents its readiness and
S25 binds its content hash to preview/confirmation. The Dotloop adapter must not maintain a second
template catalog, field-truth model, or participant-rule table. The Test lane keeps its fake provider
unchanged. This remains additive to the connector/execution boundary and does not authorize S66 or
the Dotloop gate.

**Adversarial acceptance checks.**

- **AC-S34-1** - With the three `DOTLOOP_OAUTH_*` NAMES absent, `beginDotloopConnect(...)` returns `{status:"credentials_not_configured", missing:[all three NAMES]}` and `resolveDotloopTokenExchanger().exchangeCode(...)` REJECTS (the `NotConnectedDotloopTokenExchanger` throw); no request is made to `auth.dotloop.com` and no token string appears in any return value or log. _Verify:_ `npm test -- tests/unit/dotloop-oauth.test.ts`; keep `tests/unit/dotloop-renewal-executor.test.ts` green.
- **AC-S34-2** - Both `dotloop.loop.create_from_template` and `dotloop.document.upload` remain `production_allowed:false` and are on NEITHER `EXECUTABLE_ALLOWLIST` copy; `npm run seed:action-registry -- --dry-run` reports zero Dotloop keys executable, and flipping either `production_allowed:true` without adding it to the allow-list makes the seed REFUSE. _Verify:_ `npm run seed:action-registry -- --dry-run`; `npm test -- tests/unit/seed-action-registry-allowlist.test.ts tests/unit/action-registry-schema.test.ts`.
- **AC-S34-3** - `mapDotloopCompletion(...)` is pure and returns deep-equal output on two consecutive calls for the same input, only ever yields a renewal-progress "build"-stage transition or a no-op, and its serialized result contains NO Gmail/draft/send/SoR-write intent key (a `Date.now`, a network/fs import, or a send-intent in the output fails the check). _Verify:_ `npm test -- tests/unit/dotloop-webhook.test.ts`; `npm run typecheck`.
- **AC-S34-4** - `POST /app/api/webhooks/dotloop` verifies the request BEFORE decoding the body and, on a well-formed but unauthenticated or unconnected request, returns a 4xx / gated no-op and mutates NO renewal-progress record (mirrors the pubsub gate); a valid connected event advances state only after an authenticated re-fetch, and the response body carries no token or loop PII. _Verify:_ `npm test -- tests/unit/dotloop-webhook-route.test.ts`; browser/curl-drive the route and confirm an unsigned POST is refused and writes nothing.
- **AC-S34-5** - The live token exchanger stores tokens as opaque vault refs only: `DotloopTokenSet` returned to any caller exposes `accessTokenRef`/`refreshTokenRef` (vault handles), never a raw token, and a repo scan finds no committed Dotloop credential and no client secret placed on a URL query string. _Verify:_ `npm test -- tests/unit/dotloop-live-provider.test.ts`; `rg -n "DOTLOOP_OAUTH_CLIENT_SECRET\s*=\s*[\"']|access_token[\"']?\s*:\s*[\"']ey" -- lib app` returns nothing.
- **AC-S34-6** - The live `DotloopProvider` is one-attempt and reconcilable: a duplicate `dotloop.loop.create_from_template` execute with the same `externalActionIdempotencyKey` does not create a second loop (the claim returns `duplicate` via `FirestoreExternalExecutionStore`), and a replayed completion webhook does not double-advance the renewal-progress stage. _Verify:_ `npm test -- tests/unit/dotloop-live-provider.test.ts tests/unit/dotloop-webhook.test.ts`; keep `tests/unit/external-execution-boundary.test.ts` green.
- **AC-S34-7** - The gate-flip is staged, not applied: until the owner authorizes, `isActionExecutable("dotloop.loop.create_from_template")` is false and the desk's Dotloop follow-up renders "authorize in the morning" rather than an execute control; applying the documented one-line flip (both actions -> `Approved for Execution` + `Documented` + `production_allowed:true`, both allow-lists, pinned tests) is the ONLY change that turns them executable. _Verify:_ `npm test -- tests/unit/action-registry-schema.test.ts`; `npm run verify:spec-traceability`; keep `tests/unit/feature-suite-spec-shape.test.mjs` green.
- **AC-S34-8** - An exact approved S66 snapshot produces a Dotloop preview whose artifact versions,
  fields, participant roles, visibility, and content hash match byte-for-byte. A missing, partial,
  stale, conflicting, unapproved, or hash-mismatched snapshot refuses before constructing the
  provider. The tenant packet contains no owner-only acknowledgment; that acknowledgment can be
  created only as the separate post-execution S66 artifact for all owners of record. _Verify:_ S66
  consumer fixtures, payload-hash tests, provider-construction spy, and tenant/owner leakage tests.

**Forbidden actions / hard gates.** No live Dotloop call until the connector is connected -
`NotConnectedDotloopTokenExchanger` stays the default until the live exchanger is wired AND the three
OAuth NAMES are present. Both Dotloop actions stay `production_allowed:false` until the owner has
authorized AND the flip is reviewed; a flip flips BOTH `EXECUTABLE_ALLOWLIST` copies plus the pinned
schema/allow-list tests in the same reviewed change. `dotloop.loop.create_from_template` and
`dotloop.document.upload` execute only under the S25 High-risk exact-preview Admin-approval path
(approval bound to the payload hash + displayed target/participants/source). The completion webhook
updates the app-owned renewal workflow state ONLY - it never sends, never drafts, never writes an
external system of record - and it never trusts the inbound payload as authoritative (authenticated
re-fetch is the source of truth). No client secret on a URL, in a log, or in git; tokens live only as
opaque vault refs; no guessed Dotloop endpoint or credential is committed. The isolated Test-lane
Dotloop provider stays fake and never contacts Dotloop (`provider_contacted:false`). Standard NEVERs
hold (roadmap §7): no autonomous client-facing send, generic non-workflow
`gmail.message.send` stays Registry-closed, `josiah.abernathy@gmail.com` never enters an auth path,
and every live effect is one-attempt / idempotent / receipted / reversible. The verified non-null S52
production cost ceiling applies; an unset ceiling closes cost-bearing/live/cloud work while
local/app-plane work continues. Routine release follows D05: after the full local gate, auth and
budget preflights, prior-revision capture, and a captured rollback command are green, the runner may
deploy; it must smoke the new revision successfully before promoting traffic. OAuth registration,
interactive authorization,
credentials/scopes, IAM, billing/quota, provider inputs, and destructive operations remain owner-run.
A violation of any of these is itself a falsification. S34 must not infer or default a packet type,
artifact, legal fact, field binding, participant, signature, charge, or conditional document; it
must not contact Dotloop from anything except the exact approved S66 snapshot bound to S25.

**Ordered prompt sequence.**

1. _Discovery (on a later execution turn under S34's existing authority):_ read S66 first, then inspect
   Dotloop OAuth/catalog/provider/executor/seed/health/follow-up and webhook patterns; prove both
   actions remain closed and inventory the exact packet-to-provider mapping.
2. _Understanding:_ fix the S66 snapshot schema and S25 payload-hash boundary before any provider
   mapping; confirm completion targets app-owned renewal progress, not a provider record.
3. _Build:_ Slice 1+2+3 (app-plane) - the gated webhook route, the pure `mapDotloopCompletion` reducer, and the honest connect/health copy; add `tests/unit/dotloop-webhook-route.test.ts` + `tests/unit/dotloop-webhook.test.ts` (AC-S34-1/3/4). Lint/typecheck/test + a falsification pass; nothing becomes executable.
4. _Build:_ seam - the live `DotloopTokenExchanger` behind `resolveDotloopTokenExchanger`, the live `DotloopProvider` (`lib/connections/dotloop-live-provider.ts`) against documented Dotloop API v2, and the live webhook re-fetch; `tests/unit/dotloop-live-provider.test.ts` (AC-S34-5/6). Keep both seed entries `production_allowed:false`.
5. _Gate:_ STOP before setting `production_allowed:true`. Do NOT register the OAuth app, do not add either key to an allow-list. Hand back to the owner with the exact three env NAMES and the flip recipe.
6. _Owner:_ register the Dotloop OAuth app, set `DOTLOOP_OAUTH_CLIENT_ID` /
   `DOTLOOP_OAUTH_CLIENT_SECRET` / `DOTLOOP_OAUTH_REDIRECT_URI` (Secret Manager), and complete
   authorization. Once those inputs and the full D05 gate are green, the runner may perform the
   routine deploy, smoke, and traffic promotion.
7. _Gate:_ the reviewed one-line flip - both actions to `Approved for Execution` + `Documented` + `production_allowed:true`, add both keys to `scripts/seed-action-registry.ts` and `lib/admin/migration-readiness.ts` allow-lists, update `tests/unit/action-registry-schema.test.ts` + `tests/unit/seed-action-registry-allowlist.test.ts` + `tests/unit/dotloop-renewal-executor.test.ts` (AC-S34-2/7).
8. _Verify:_ run AC-S34-1 through AC-S34-8, including partial/stale packet and participant-leakage
   falsification, then the normal test/type/lint/copy/spec/dry-run/full-verifier gates. Browser-drive
   the closed and, only under separate authority, connected paths.
9. _Context update:_ promote the shipped work to a `docs/facts.md` `F-DOTLOOP-ESIGN` row citing AC-S34-1 .. AC-S34-7 (and resolve `Q-DOTLOOP-WEBHOOK-AUTH`), and update `docs/loop-state.md` at the slice boundary.

**Deletion/merge recommendation.** KEEP this suite as the tracked spec; the `docs/temp/dotloop-esign-activation-plan.md` packet stays disposable local evidence. It EXTENDS the already-built Dotloop scaffold (OAuth + executor + seed + follow-up draft) and the S25 execution boundary rather than replacing them, and supersedes no fact. If the Wave-2 connector-activation seams (S30 RentVine, S35 LeadSimple, S34 Dotloop) are later consolidated, this may MERGE into a shared "connector activation" family as the Dotloop section; until then keep it standalone.
