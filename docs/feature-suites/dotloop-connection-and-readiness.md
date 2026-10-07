<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: dotloop-pdf-renewal-v1-2026-10 -->

# S106 — Company Dotloop connection and renewal readiness

> Intake: READY, revision 2026-10-06, intake 050. Existing connection services are deployed; the repairs and setup experience below are specified, not implemented by this authoring run. Live authorization and provider testing are deferred to a separate flow.

**Goal.**

One company-managed Dotloop connection serves authorized renewal staff. An Admin can configure, connect, select resources, recover, and disconnect it through the application without manual database repair. Staff need no individual API authorization to use it.

**Current state / intended end state.**

Starting source: `60145e926a477a35990c48b1123489d98822fe8b`; serving code for the inspected Dotloop surfaces matches `e8bc616d144c6600da8394313153e1a0c75659da` / `pmi-kc-app-rmuvf58nk-d45b8bc5347d`.

OAuth state/exchange, vault references, generation-bound refresh, selection storage, readiness and S96 cleanup exist. This does not establish a usable live connection: the Connect component ignores the returned authorization URL; the callback returns JSON; resource-selection routes have no mounted picker; runtime transport has no effective default backoff wait; failed refresh recovery needs verification and repair. Existing deterministic-provider successes are baseline evidence, not acceptance of these repairs.

On 2026-10-06 the owner-supplied Client ID and Secret were stored and exactly compared in Secret Manager, both version 1, in `pmi-kc-kb-prod`. Names are `DOTLOOP_OAUTH_CLIENT_ID` and `DOTLOOP_OAUTH_CLIENT_SECRET`; the current runtime account has a verified read grant on the latter. Cloud Run still lacks client id, secret, redirect and connector-vault configuration. See `docs/facts.md` F-DOTLOOP-DELIVERY and `docs/open-blockers.md`; never put values in this spec.

Intended end state: real navigation through company consent, a usable verified resource picker, truthful cached readiness, and recoverable token lifecycle. Local packet work remains available while the connection is absent.

**Actors and entry conditions.**

Company account: `integrations@pmikcmetro.com`, confirmed by the owner; Business+ access is owner-reported, not live-verified. Admins manage connection configuration, selection and disconnection. Renewal staff read readiness and use the shared connection through S34 under their own app identity and attribution. Staff may open Dotloop using their own existing provider access; v1 does not store per-staff OAuth tokens.

**What it is / how it functions.**

1. Reuse the existing authorization-code service. Connect navigates to its validated provider authorization URL. Do not report Connected before callback exchange, vault persistence and actual verification succeed. Callback consumes the provider's authorization code and returns to the Connections application screen with a safe result, including denial and recoverable failure; the final app URL/result does not retain the code or tokens. The public Client ID remains a required authorization parameter. Enforce the existing Admin/session and single-use state contract across navigation.
2. Discover profiles/templates through the typed client and mount selection controls. Select by stable provider id, including transaction type and initial status. Use a provider-supported individual profile with access to company templates for Loop-It; do not require an office-only profile. Business+ entitlement, matching labels, or a settings save alone does not prove access. Preserve selection history and distinguish deleted/unavailable resources from renamed ones.
3. Reuse Secret Manager and the current connection-generation model for exchange, refresh and revoke. Only one owner refreshes a given generation; concurrent calls reuse the resulting token. Failed/uncertain refresh exposes recovery. Admin disconnect/reconnect must be possible through an exact preview and receipt/readback path even for quarantined connections; do not require a database edit, destroy an unowned secret, or pretend ambiguous provider revocation succeeded.
4. Use a real wait and bounded retry policy for documented rejected requests. Coordinate the provider's shared 100-request/minute user limit across callers, respect available limit/Retry-After information, and distinguish unavailable reads from empty results. Do not blindly retry an uncertain mutating request.
5. Project readiness independently for configuration, vault capability, connection, selected resources, scope and freshness. Ordinary page renders reuse labeled observations rather than making all discovery/subscription probes each time. Explicit refresh and write admission validate required current resources. Optional webhook availability and absence of a signature API do not disable supported packet operations. A connection does not open an Action Registry key.

**In scope / out of scope.**

In scope: connection UX repairs, picker, typed transport, refresh/recovery, shared rate handling, health/readiness and the existing configuration delivery path. Out of scope: per-user API connections, Drive connection work, credential rotation/deletion of the 1Password source, live consent/proof/demo in this cycle, provider UI automation, signing, action activation and an implementation/release run triggered by this spec.

**Open questions & assumptions.**

No feature decision remains open. Registered callback/scopes, API Support verification, selected provider ids/type/status, and vault runtime permissions are setup inputs to verify in the separate live flow. Do not invent them. Secret storage is complete; it is not runtime binding or provider acceptance. The public API remains the capability ceiling unless a documented provider change is separately scoped.

**Cross-product impacts.**

Verified owners: `components/connections/ConnectorSetupActions.tsx`; `app/api/connections/dotloop/connect`, `app/api/connections/dotloop/callback`, `app/api/connections/dotloop/selection` routes; `lib/connections/dotloop-runtime.ts`, `dotloop-readiness.ts`, `dotloop-connection-service.ts`, `dotloop-revocation.ts`; `lib/firestore/dotloop-renewal-settings.ts`; `lib/integrations/dotloop/client.ts`; `scripts/deploy-demo-cloud-run.mjs`. Consume S96 cleanup and S34; expose scoped readiness to S66/S130/S182.

**Authority and evidence map.**

| Input                                                                           | Classification              | Use and limitation                                                                                                    |
| ------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| AGENTS.md, current source and original S106 tests                               | Authority / baseline        | Managed identities, generation ownership, vault refs, cleanup receipts; historical test results do not prove live UX. |
| Owner answers and acceptance, 2026-10-06                                        | Confirmed intent            | One company connection, Business+, staff collaboration, live tests deferred.                                          |
| F-DOTLOOP-DELIVERY readbacks                                                    | Verified configuration fact | Stored pair and secret read permission; deployed configuration absent.                                                |
| [Public API](https://dotloop.github.io/public-api/) and provider correspondence | Provider evidence           | OAuth, supported resources, scopes/limits; activation email is not consent or client verification.                    |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S106-1** — Existing connection/vault/generation owners remain authoritative through navigation, refresh and S96 cleanup; two-caller and ambiguous-outcome tests preserve ownership.
- **ARCH-S106-2** — One typed resource/readiness contract drives picker, health and renewal consumers; stale/renamed/missing selections and optional-probe outages are distinguishable.
- **ARCH-S106-3** — Runtime transport uses an actual bounded scheduler and shared request accounting; controlled-time tests expose the current no-op wait and competing-call behavior.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S106-1** — Connect reaches consent and callback returns to usable app feedback through a controlled provider; denial, forged/replayed state and persistence failure never look connected.
- **BEH-S106-2** — One eligible selected profile/template survives renaming; missing resources and absent configuration show exact next actions without blocking local preparation.
- **BEH-S106-3** — Concurrent expiry, rejected requests, quarantined refresh, revoke and reconnect recover without token leakage, duplicate refresh or manual database repair.

**Human litmus outcome.**

### Set up the company connection once

**If this was built correctly:** An Admin connects and selects company resources; a second staff member sees the shared readiness without reconnecting. If access expires or is lost, the Admin sees and completes a supported recovery, while staff continue preparing forms.

- Model verdict: NOT RUN — specification authoring only.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                                     | Architecture outcome | Behavior outcome | Human litmus                       | Falsification                                                                          |
| ----------------------------------------------- | -------------------- | ---------------- | ---------------------------------- | -------------------------------------------------------------------------------------- |
| Consent navigation and vault/state protection   | ARCH-S106-1          | BEH-S106-1       | Set up the company connection once | AC-S106-1, AC-S106-2, AC-S106-5; redirect, denial, replay and store-failure cases.     |
| Shared supported selection and honest readiness | ARCH-S106-2          | BEH-S106-2       | Set up the company connection once | AC-S106-3, AC-S106-6, AC-S106-9; two staff, rename, wrong profile and optional outage. |
| Refresh, disconnect and recovery                | ARCH-S106-1          | BEH-S106-3       | Set up the company connection once | AC-S106-4, AC-S106-7; concurrency, revoked/uncertain token and cleanup failure.        |
| Real transport timing and request coordination  | ARCH-S106-3          | BEH-S106-3       | Set up the company connection once | AC-S106-8; controlled clock and concurrent caller tests.                               |

**Preservation set.**

Existing `dotloop-oauth`, `s106-dotloop-connection`, connector cleanup/revocation, and client-secret-binding checks; S96 cancellation/receipt/readback; packet loop links; managed identity; unchanged exact keys and current reviewed runtime switches. Already-correct cases are preservation checks, not manufactured new failures.

**Adversarial acceptance checks.**

- **AC-S106-1** — No client secret or access/refresh token reaches logs, browser payloads, URLs or Git. The authorization code is consumed only by the callback and is absent from logs, stored app results and the final app URL. The public Client ID may appear in the required authorization request; vault refs remain owned by the current generation (ARCH-S106-1).
- **AC-S106-2** — Forged, expired or replayed state and wrong actor cannot establish a connection (BEH-S106-1).
- **AC-S106-3** — Connected/resource-ready requires valid scoped profile/template observations; missing configuration, unavailable probes and missing selection remain distinct (ARCH-S106-2).
- **AC-S106-4** — Disconnect honors S96 cancellation, exact confirmation, owned credential cleanup and receipt/readback; loop links survive. Uncertain revoke is labeled accurately (ARCH-S106-1).
- **AC-S106-5** — The mounted Connect control navigates to the returned validated authorization URL, and success/denial callbacks return to app feedback rather than JSON (BEH-S106-1).
- **AC-S106-6** — Admin-only picker persists verified stable ids/type/status; unsupported or inaccessible profiles/templates are refused; ordinary staff see the same connection without an OAuth prompt (BEH-S106-2).
- **AC-S106-7** — Two simultaneous expiries produce one generation-owned refresh. Failed refresh permits supported disconnect/reconnect; cleanup failure remains recoverable and cannot claim destruction (BEH-S106-3).
- **AC-S106-8** — 429 handling actually waits, bounded retries respect provider limits across callers, and an uncertain create/upload is not automatically redispatched (ARCH-S106-3).
- **AC-S106-9** — Cached freshness is visible; repeated page renders do not repeat all discovery probes. Explicit refresh updates scoped observations. Webhook/signature absence does not disable supported work (ARCH-S106-2).

**Forbidden actions / hard gates.**

No actual provider consent/test from this authoring request; no invented endpoint, personal runtime identity, secret exposure, per-staff impersonation, generic request executor, key activation or signature operation. Protected-path implementation changes require the existing explicit execution/delivery contract. Do not change claims or make staff Admins to share the connection.

**Dependencies / sequencing.**

Reuse S96 and existing credential delivery. S34 consumes this connection; S66/S130 are independently usable without it. S182 defines ordinary staff operation access, while connection administration stays Admin. Stable Drive setup and live demonstration are separate future work.

**Standalone delivery contract.**

- **Deliverable now:** complete UI/service/client repair and failure/recovery behavior with deterministic provider/vault adapters; documentation accurately separates stored from bound/connected credentials.
- **Consumes, but does not assume:** actual registered client and verified resources; unset/failed inputs are explicit readiness states.
- **Externally blocked effect:** real consent, lifecycle proof and company resource verification require the separate live flow; defer those outcomes, not engineering completion.
- **Produces for downstream suites:** shared connection-generation and resource-readiness contracts, with exact recovery information and no implicit action authority.

**Verification and delivery contract.**

An implementation runner records current baseline, fail-first navigation/picker/wait/recovery checks and separate preservation results; runs focused service, route, emulator and compiled-browser checks, then repository verification for an explicitly authorized delivery. Report engineering results separately from deferred live acceptance. This ready spec is not execution, commit, deployment, demo or activation authority.

**Ordered prompt sequence.**

1. Recheck source, stored configuration and exact current connection/selection boundaries.
2. Establish fail-first controls, callback, picker, timing/concurrency and recovery checks.
3. Repair the existing owners; wire safe navigation, selection, truthful readiness and owned recovery.
4. Validate all declared outcomes and preservation; record runtime/live gaps without performing the deferred flow.

**Deletion/merge recommendation.**

Keep the revised contract until new outcomes are owned by verified code/tests and the separately deferred live acceptance is recorded. Original deployment evidence retains its original scope.
