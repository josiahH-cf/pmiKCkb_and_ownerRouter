<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-completion-v1 -->

# S106 — Dotloop connection and renewal readiness

> Status: COMMITTED (`af23da4`, exact-SHA CI green) AND CANDIDATE-DEPLOYED
> (`pmi-kc-app-rmtmaxi8r-f6190b47628d`, zero traffic, anonymous smoke passed); NOT PROMOTED. The closed slice is complete; the live readiness check is BLOCKED on the
> owner's OAuth application registration and a connected Dotloop account. The connection service,
> typed client, single-use state, vault-backed token refs, selection record, readiness projection,
> and health wiring are in place and proved against the provider fake. Production still shows
> Dotloop as details-provided-not-verified.

**Goal.**

An Admin connects Dotloop through the provider's OAuth 2 authorization-code flow, the app discovers
the operational profile and renewal template, tokens refresh without a person, a lost or revoked
connection reconnects cleanly, and readiness blockers are exact.

**Current state / intended end state.**

| Package requirement (PMI-05)                   | Classification    | Evidence                                                                                                                                                                                                                             |
| ---------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dotloop in the existing connections area       | Partially         | `lib/connections/connector-catalog.ts` entry `dotloop` (`method: "oauth"`, config names only); Connection Center renders it as details-provided-not-verified                                                                         |
| Provider authorization callback                | Already satisfied | `LiveDotloopTokenExchanger` posts the documented `authorization_code` grant server-side; `app/api/connections/dotloop/callback/route.ts` consumes one single-use state, stores both tokens as vault refs, and records the connection |
| Connection states                              | Partially         | `connector_connections` lifecycle `connected` → `revocation_pending` → `revoked` with receipts (`lib/firestore/connector-connections.ts`, S96); no `expired`/`refresh-needed`/`missing resources` state                              |
| Profile and template discovery and selection   | Already satisfied | `DotloopClient.listProfiles` / `listLoopTemplates` plus the Admin-gated `dotloop_renewal_settings` record, selected by stable provider id                                                                                            |
| Verify loop/participant/folder/document access | Partially         | `dotloopHealthCheckTransport` runs the four `health.dotloop.oauth_app` steps against the client; only the LIVE run waits on the owner's account                                                                                      |
| Token refresh through one project-owned path   | Already satisfied | The client refreshes exactly once on 401 through the injected token provider and reports `refresh_needed` when the refresh token is revoked                                                                                          |
| Disconnect and reconnect without losing links  | Partially         | S96 revocation store and vault destroy exist; loop links live on packet snapshots (S34)                                                                                                                                              |
| Webhook and signature capability detection     | Already satisfied | `readSubscriptionsAvailable` sets `webhooksAvailable`; `signatureApiAvailable` is always false because the official documentation lists no e-signature operation                                                                     |
| Exact readiness blockers                       | Already satisfied | `projectDotloopReadiness` names client registration, callback configuration, secure storage, account connection, compatible profile, renewal template, and loop write scope                                                          |

Intended end state: one server-owned Dotloop connection service reusing the connector store, vault,
S96 lifecycle, and health-check contract; a profile/template selection record; a readiness
projection consumed by S34 and the renewal workspace.

**Actors and entry conditions.**

A current Admin connects, selects, disconnects, or reconnects. Readiness is visible to Renewals-space
staff. Entry needs `DOTLOOP_OAUTH_CLIENT_ID`, `DOTLOOP_OAUTH_CLIENT_SECRET`, and
`DOTLOOP_OAUTH_REDIRECT_URI` bound through Secret Manager in Production; absence is the existing
`credentials_not_configured` readiness blocker.

**Provider contract (official Dotloop Public API v2, `https://dotloop.github.io/public-api/`, read 2026-09-03).**

- Authorize `GET https://auth.dotloop.com/oauth/authorize` with `response_type=code`, `client_id`,
  `redirect_uri`, `state`; token `POST https://auth.dotloop.com/oauth/token` with grant
  `authorization_code` and `refresh_token`; revoke `POST https://auth.dotloop.com/oauth/token/revoke`.
  Access tokens expire in about 12 hours and are refreshed with the refresh token.
- Base `https://api-gateway.dotloop.com/public/v2/`; `GET /account`; `GET /profile`;
  `GET /profile/{profile_id}/loop-template`; `GET /subscription`; batch pagination `batch_size`
  (max 100) and `batch_number`; 100 requests per minute per user with `X-RateLimit-*` headers.
- Scopes include `account:read`, `profile:read`, `loop:read`, `loop:write`, `template:read`.
- The public API documents no e-signature send or signature-status operation. Signature work is a
  handoff into Dotloop (S34).

**What it is / how it functions.**

1. **Connect.** A new Dotloop connect route under the connections API mints a CSRF `state`, stores it server-side, and
   redirects to the authorize URL (existing `buildDotloopAuthorizeUrl`). The callback route exchanges
   the code server-side, stores access and refresh tokens only as `ConnectorSecretVault` refs, creates
   the `connector_connections` record through `createConnectedConnection`, and never returns a token
   to the browser. Denial or callback error records a bodyless failure and leaves no connection.
2. **Client.** A new Dotloop client module under the integrations library: typed GET/POST/PATCH with bearer token from the
   vault, automatic one-time refresh on 401, rate-limit backoff on 429, and no generic request
   function. A refresh failure marks the connection `refresh_needed`.
3. **Discovery and selection.** `GET /profile` and `GET /profile/{id}/loop-template` populate a
   selection form; the Admin selects one profile and one renewal template by stable id, stored in
   `dotloop_renewal_settings` (single current record, audited). A later display-name change does not
   change the selection.
4. **Readiness.** `projectDotloopReadiness()` returns `disconnected`, `connecting`, `connected`,
   `refresh_needed`, `unavailable`, or `missing_resources` with exact reasons (client registration,
   callback configuration, account connection, compatible profile, renewal template, loop write
   scope). `GET /subscription` readability sets `webhooksAvailable`; `signatureApiAvailable` is
   always `false` per the official documentation.
5. **Disconnect and reconnect.** Reuse the S96 cancel-first disconnect: revoke the token, destroy vault
   refs, complete revocation with a receipt; reconnect creates a new generation. Loop links on packet
   snapshots survive because they reference loop ids, not the connection generation.
6. **Health.** Wire `health.dotloop.oauth_app` steps to the client so the Connection Center check
   reports config, auth, profile probe, and subscription readability truthfully.

**In scope / out of scope.**

In scope: OAuth routes, client, vault-backed tokens, refresh, selection record, readiness, S96
integration, health check, and the provider fake. Out of scope: loop or document creation (S34),
LeadSimple, and any inferred e-signature endpoint.

**Open questions & assumptions.**

The Dotloop OAuth application registration (client id/secret/redirect) and a connected Dotloop
account are owner inputs recorded in `docs/client-checklist.md`. Their absence blocks only the live
readiness check; the provider fake proves the full lifecycle.

**Cross-product impacts.**

Connection Center, connector store and rules, Secret Manager bindings, health checks, S34 packet
lifecycle, renewal workspace blockers, `docs/integration-architecture.md`, `docs/client-checklist.md`.

**Authority and evidence map.**

| Input                                                              | Classification                   | Use and limitation                                                                  |
| ------------------------------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------- |
| `AGENTS.md`, S96 connector lifecycle, vault, committed scaffolding | Authority / implementation truth | Managed identities, receipts, no secret in Git or browser, cancel-first disconnect. |
| Official Dotloop Public API v2 documentation                       | Provider contract                | Exact URLs, grants, endpoints, scopes, limits; no signature API.                    |
| Owner package PMI-05 and 2026-09-03 direction                      | Intent evidence                  | Dotloop is the next integration; D-DOTLOOP-DEFER is superseded.                     |
| OAuth app registration and connected account                       | External dependency              | Blocks only the live check; never guessed.                                          |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S106-1** — One connection service owns exchange, refresh, revoke, and readiness; tokens exist
  only as vault refs. A fixture asserting a stored connection after callback fails today.
- **ARCH-S106-2** — Readiness is a pure projection over connection, selection, and probe results; a
  missing template yields `missing_resources` with that exact reason.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S106-1** — Authorization success, denial, callback error, expired token, refresh success,
  refresh failure, revoked access, and reconnect each produce their exact state through the fake.
- **BEH-S106-2** — An expired token is refreshed once for an interactive read and once for a
  background packet read without a person.
- **BEH-S106-3** — Webhook or signature unavailability leaves the connection usable for loops and
  documents.

**Human litmus outcome.**

### Connect Dotloop and pick the renewal template

**If this was built correctly:** An Admin clicks connect, signs in to Dotloop, and returns to the
app showing the connection as connected. They pick the office profile and the renewal template.
When Dotloop access lapses the app says so and offers reconnect, and existing renewal packets keep
their links.

- Model verdict: PASS for the closed slice - why: the whole lifecycle is proved against the provider
  fake. Authorization mints a single-use state and returns the documented authorize URL with no
  secret in it; the callback consumes that state before anything else, so a forged or replayed value
  creates nothing; a denial, a callback error, an exchange failure, or unconfigured secure storage
  each end with no connection; tokens exist only as vault refs; an expired token refreshes exactly
  once for one read and the refreshed token is reused by the next; a revoked refresh token reports
  `refresh_needed` instead of looping; a rate limit backs off once and is then surfaced; readiness
  never says connected without a profile probe success and names the exact missing resource; and
  webhook unavailability leaves loops usable while no signature API is ever claimed. The live
  readiness check is BLOCKED on the owner's OAuth application and connected account.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                          | Architecture outcome | Behavior outcome | Human litmus                                  | Deterministic evidence / falsification                     |
| ------------------------------------ | -------------------- | ---------------- | --------------------------------------------- | ---------------------------------------------------------- |
| DLCONN-01 lifecycle matrix           | `ARCH-S106-1`        | `BEH-S106-1`     | Connect Dotloop and pick the renewal template | Fake-provider contract matrix                              |
| DLCONN-02 stable ids                 | `ARCH-S106-2`        | `BEH-S106-1`     | Connect Dotloop and pick the renewal template | Display-name change fixture                                |
| DLCONN-03 readiness reasons          | `ARCH-S106-2`        | `BEH-S106-3`     | Connect Dotloop and pick the renewal template | Missing profile/template/scope fixtures                    |
| DLCONN-04 refresh without a person   | `ARCH-S106-1`        | `BEH-S106-2`     | Connect Dotloop and pick the renewal template | 401-then-refresh fixture on both call sites                |
| DLCONN-05, DLCONN-06 capability/live | `ARCH-S106-2`        | `BEH-S106-3`     | Connect Dotloop and pick the renewal template | Subscription-unavailable fixture; live check when possible |

**Preservation set.**

`tests/unit/dotloop-oauth.test.ts`, connector store, disconnect route, Connection Center, and
health-check tests stay green; Gmail DWD and RentVine connectors are unchanged.

**Adversarial acceptance checks.**

- **AC-S106-1** — `ARCH-S106-1`: no token value reaches a log, response, URL, or Git.
- **AC-S106-2** — `BEH-S106-1`: a forged or replayed `state` cannot create a connection.
- **AC-S106-3** — `ARCH-S106-2`: readiness cannot report `connected` without a live-or-fake profile
  probe success.
- **AC-S106-4** — Disconnect destroys vault refs, records a receipt, and leaves packet loop links
  intact.

**Forbidden actions / hard gates.**

No loop or document creation, no inferred signature endpoint, no token in Git or browser, no
personal Dotloop identity, no automation of a person's sign-in.

**Dependencies / sequencing.**

Independent of S102–S105; S34 requires `connected` readiness with a selected profile and template.

**Standalone delivery contract.**

- **Deliverable now:** routes, client, vault refs, refresh, selection, readiness, health wiring,
  provider fake, and the contract matrix.
- **Consumes, but does not assume:** Secret Manager bindings; absent bindings show
  `credentials_not_configured`.
- **Externally blocked effect:** the live readiness check until the owner registers the OAuth app
  and connects an account; recorded as `BLOCKED` for that check only.
- **Produces for downstream suites:** `DotloopClient`, readiness projection, selected profile and
  template ids.

**Verification and delivery contract.**

1. Freeze the connection, refresh, and readiness fixtures failing for the expected reason.
2. Run focused route, client, vault, readiness, and Connection Center checks.
3. Run `bash scripts/verify.sh` and `npm run test:e2e:core`; audit secrets and protected paths.
4. Report `ALL_GATES_GREEN` for the closed slice; `BLOCKED` names only the live account check;
   `BUDGET_EXHAUSTED` only with an explicit budget.

**Ordered prompt sequence.**

1. Re-verify the scaffolding, connector store, and vault contracts.
2. Materialize the fail-first lifecycle matrix against the provider fake.
3. Implement routes, client, refresh, selection, readiness, and health wiring.
4. Run focused and canonical checks; record the exact live limitation; update current docs.

**Deletion/merge recommendation.**

Keep until one live connect, refresh, disconnect, and reconnect have been read back; then fold the
connection contract into `docs/integration-architecture.md`.
