<!-- spec-shape: overhaul-v1 -->

# S28 - Market comp data provider + comp screenshot attach

> New 2026-07-23 (operator note). S28 sits under the Roadmap Build Authorization (`F-ROADMAP-BUILD-AUTHORIZED`); it implements roadmap rows #1 and #3 (`docs/roadmap-unblock-2026-07-23.md` §2), split across Wave 1 "S28a" (provider abstraction + comp screenshot, pure app-plane) and Wave 2 "S28b" (RentCast live adapter, built to the one owner key). Not started; the loop builds S28a immediately and S28b to the seam.
>
> **Approved specification amendment, 2026-08-10.** The 2026-08-07 training transcript and the
> owner's 2026-08-10 approval supersede preservation of the historical Zillow research surface.
> Zillow has no user-visible or behavioral role in the intended end state. Legacy persisted field
> names may remain only as read-only compatibility aliases. This amendment is specification-only.

**Goal.** Today the renewal flow has no complete market-data mechanism: the historical comp
affordance is an address-only third-party research link, every rent-adjacent number is typed by the
operator, and the comps screenshot is a raw text URL. After this suite the operator gets two real
capabilities in the live workspace. First, a pluggable market-comp provider: a manual/typed-entry
adapter plus a RentCast rental-listings search adapter that aggregates comparable rentals into a
range and median point estimate. The provider displays reference evidence only; it never fills or
moves the offered-rent decision, and S29/S62 remain separate approval-gated suggestion contracts.
Second, the comps screenshot becomes a real image upload to the in-boundary Drive folder, so the
owner renewal draft references a stored `drive:<id>` artifact instead of pasted text. Absent data
shows `Needs Verification`, never a fabricated value. The historical Zillow link, label, URL,
lookup, and current-source attribution are removed from the intended product behavior; live numbers
come only from the configured provider or an explicitly labeled manual entry.

**What it is / how it functions.** A market-comp provider seam plus a comp-screenshot upload seam, composed over the SAME per-lease live workspace and the SAME owner-draft composer that exist today. Nothing here writes a system of record, sends anything, or moves the rent number; RentVine and the Sheet stay read-only and the owner email stays draft-only (`production_allowed:false`, `send_allowed:false` in `buildOwnerRenewalDraft`).

- **Provider interface: `lib/lease-renewal/market-comp-provider.ts` (new).** The `MarketCompProvider` abstraction: a `MarketCompQuery` (in-boundary property address label plus optional bedrooms/bathrooms/property type; the address is the ONLY external datum, matching the D07/D08 boundary already documented in `market-links.ts:2-4`, never tenant PII, never a rent figure) and a `MarketCompResult` (`rangeLow?`, `rangeHigh?`, `pointEstimate?`, `compCount?`, `source` string for attribution, `retrievedAt?` ISO string, and a `confidence` of `"Likely"` or `"Needs Verification"`). A `createMarketCompProvider(config)` factory selects the adapter and is prod-fenced by config exactly like `createMaintenanceImageStore` and the `isProduction` image-store fence in `lib/config/server.ts:154-186`.
- **Manual adapter: `ManualMarketCompProvider` in the same module (new).** Reproduces today's behavior with no network call: it passes through the operator's own `RenewalMarketBasis` inputs (`lib/lease-renewal/renewal-progress.ts:32-41`) as a result tagged `source:"Manual entry"`, and returns `confidence:"Needs Verification"` with no numbers when nothing was entered. It NEVER synthesizes a value (D19 / `F-NEGOTIATION-EXCLUDED`). This adapter is the default and makes the whole suite functional on day one without any owner step.
- **Comp screenshot store: `lib/lease-renewal/comp-screenshot-action.ts` (new) reusing `lib/maintenance/image-store.ts`.** The screenshot upload reuses the proven maintenance Drive seam verbatim: `MaintenanceImageStore` / `DriveMaintenanceImageStore` (Drive v3 multipart upload, keyless domain-wide delegation as a `pmikcmetro.com` subject, `F-DRIVE-DWD`, `Q-MAINT-STORAGE` resolved) with a renewal-comp folder id. A new gate view module mirrors `lib/maintenance/photo-action.ts` exactly (`RENEWAL_COMP_SCREENSHOT_ACTION_KEY = "google_drive.renewal_comp_screenshot.store"`, an executable/closed view, and a closed-action response), so the actual upload rides its own Action Registry gate.
- **RentCast adapter: `lib/lease-renewal/providers/rentcast-market-comp-provider.ts` (new).** `RentCastMarketCompProvider` implements `MarketCompProvider` against RentCast's rental-listings SEARCH endpoint (`/listings/rental/long-term`) over an injected transport that mirrors `ImageHttpTransport` (`image-store.ts:44-78`), with the API key read only from env/Secret Manager. It queries comparable rentals by geo plus optional beds/baths within a radius, then AGGREGATES the returned listings deterministically (owner-confirmed 2026-07-23): `pointEstimate` = the MEDIAN of the comparable rents, `rangeLow`/`rangeHigh` = the min/max (or 25th/75th percentile) of the set, `compCount` = the number of comps, and the backing listings are carried for display. It FAILS CLOSED: any HTTP error, empty body, or fewer than a minimum comp count maps to `confidence:"Needs Verification"` with no numbers, never a fabricated figure. It is a read: target-labeled, one-attempt, receipted (query plus `retrievedAt` logged), health-checked, and cost-bounded; there is no mutation to roll back. Built and wired, but inert until its gate is flipped.
- **Read + upload routes: `app/api/lease-renewal/market-comps/route.ts` and `app/api/lease-renewal/comp-screenshot/route.ts` (new).** The comps route runs the configured provider for a lease and returns a DISPLAY-only result; when the live RentCast adapter is selected it is gated by `rentcast.rental_listings.search` and refuses with the closed-action response until flipped, while the manual adapter path needs no gate. The screenshot route accepts the image, uploads it through the comp-screenshot store, returns the `StoredImage` ref/url, and refuses with `error_type:"action_not_production_allowed"` when the Drive action gate is closed.
- **Owner-draft wiring: `lib/lease-renewal/owner-draft.ts` (edit).** `ownerDraftMarketFromBasis`
  maps the stored Drive screenshot ref into `compsScreenshotRef` and carries the neutral provider
  source (`"RentCast"` or `"Manual entry"`) onto the comparable-range fact. Drafts never label a
  current fact as Zillow. Both `Needs Verification` fallbacks and the
  `production_allowed:false` / `send_allowed:false` guarantees are unchanged.
- **Progress-state compatibility: `lib/lease-renewal/renewal-progress.ts` (edit).** New state uses
  `compRangeLow`, `compRangeHigh`, `compScreenshotRef`, `compSource`, and `compRetrievedAt` (exact
  final symbols may follow the existing typed model). Existing `zillowLow`, `zillowHigh`, and
  `compsUrl` values may be decoded only as legacy read aliases into neutral manual/reference facts.
  New saves, drafts, APIs, and UI state must not emit those legacy keys or treat a legacy URL as a
  current source. Compatibility decoding trims and validates values and never invents a number.
- **Workspace surface: `components/lease-renewal/RenewalProgressControls.tsx` (edit).** Replace the
  historical combined URL control with (a) a comps-screenshot file upload that stores the returned
  Drive ref and (b) `Look up market comps (reference only)`, which renders a read-only range with
  `Reference only. Does not set the rent.` The `offeredRent` input is never bound to a provider
  result. No Zillow link, label, logo, URL, lookup, or research affordance remains.

- **Buildable now (app-plane).** Adds no system-of-record write, no autonomous send, no new external scope, and stays `production_allowed:false`; the loop builds these unattended (roadmap Wave 1, "S28a").
  - **B1 Provider interface + manual adapter.** `market-comp-provider.ts` with `MarketCompProvider`, the query/result types, `ManualMarketCompProvider` reproducing today's typed behavior, and the prod-fenced `createMarketCompProvider` factory. Pure, deterministic, no network. (AC-S28-1, AC-S28-2)
  - **B2 DISPLAY-only comps surface.** The "Look up market comps (reference only)" button plus the read-only range display and the "Does not set the rent" caption in `RenewalProgressControls.tsx`, wired to `app/api/lease-renewal/market-comps` running the manual adapter. `offeredRent` never bound to the result. (AC-S28-2)
  - **B3 Comp screenshot upload.** `comp-screenshot-action.ts` mirroring `photo-action.ts`, the screenshot route, and the `RenewalMarketBasis.compScreenshotRef` wiring, reusing `DriveMaintenanceImageStore`; dev/test uses `StubMaintenanceImageStore` so the flow is provable with no Drive call. The owner draft attaches the stored ref. (AC-S28-3, AC-S28-4)
  - **B4 Owner-draft attribution + Needs-Verification preservation.** `ownerDraftMarketFromBasis` prefers the Drive ref and carries the provider `source`; both `Needs Verification` fallbacks stay exactly as today. (AC-S28-3)
- **Build to the seam (live provider).** The RentCast adapter plus the full read contract (target label, health check, cost preflight, one-attempt, receipt/`retrievedAt`, fail-closed to `Needs Verification`; no rollback because it is a read), replacing the manual-only path as the live option. The loop builds ALL of this and does NOT stop merely because the call is external; it stops only at the one owner key below (roadmap Wave 2, "S28b").
  - **B5 RentCast adapter, inert.** `rentcast-market-comp-provider.ts` behind the interface, key from env/Secret Manager, fail-closed. Unit-proven against the documented rental-listings search response shape, including the median/min-max aggregation and the min-comp-count fail-closed, over a stubbed transport; no live call in tests. (AC-S28-5, AC-S28-6)
  - **B6 Gate-flip machinery, staged OFF.** Two Action Registry seed entries authored
    `production_allowed:false`: `google_drive.renewal_comp_screenshot.store` and
    `rentcast.rental_listings.search`. Neither key is added to either `EXECUTABLE_ALLOWLIST` copy yet,
    so both are non-executable and the pinned schema tests stay green. The read action's contract is
    completed with the provider slice. The screenshot route currently uploads on its first POST and
    therefore does **not** yet satisfy its intended preview/confirm/idempotency/receipt/readback/trash
    rollback contract; S53 AC-S53-13 owns that hardening and the key stays closed until it passes.
    (AC-S28-5)
- **Owner dependency (the one flip).** A single credential: a RentCast rental-listings-search API
  key, read by the built adapter from `RENTCAST_API_KEY` (name-only in `.env.example`; the value lives
  in Secret Manager) — the exact pickup point for the **read provider**, so dropping the key plus the
  one reviewed read-action flip is all that remains (roadmap §5 owner-dependency #2). It activates the
  S28b adapter: the routine reviewed change then sets `rentcast.rental_listings.search` to
  `readiness:"Approved for Execution"` + `evidence_status:"Documented"` +
  `production_allowed:true`, adds the key to both `EXECUTABLE_ALLOWLIST` copies
  (`scripts/seed-action-registry.ts` and `lib/admin/migration-readiness.ts`), and updates the pinned
  tests (`action-registry-schema.test.ts`, `seed-action-registry-allowlist.test.ts`). The comp
  screenshot reuses the authorized Drive identity and folder configuration, but that removes only an
  external credential dependency; its independent S53 action-contract defect still keeps it closed.

**Open questions & assumptions.**

- _Answered 2026-07-23 (owner):_ the provider is RentCast's rental-listings SEARCH (`/listings/rental/long-term`), and the adapter aggregates the returned comps (MEDIAN = point estimate); RentCast has no usable rent-estimate endpoint, so the app builds the comp logic. If the owner later swaps to a different search/listings API, only the adapter behind `MarketCompProvider` changes; the app-plane, the routes, and the owner-draft/progress wiring are unaffected.
- _Answered 2026-08-10:_ remove every user-visible and behavioral Zillow dependency. Historical
  stored keys may be read as compatibility aliases only; they receive a neutral manual/reference
  label and are never written by a new save.
- _Assumption:_ the comp-screenshot upload reuses the existing maintenance Drive image-store seam
  (`lib/maintenance/image-store.ts`, keyless DWD, `F-DRIVE-DWD`, `Q-MAINT-STORAGE` resolved) with a
  renewal-comp folder id, rather than a new upload path. The Drive scope is already authorized
  (2026-06-29), so the screenshot has no new owner credential dependency. This does not authorize a
  flip: S53 AC-S53-13 must first replace upload-on-first-POST with the full immutable
  preview/exact-confirm/idempotency/receipt/readback/reconcile/trash-rollback contract.
- _Assumption:_ the provider read is DISPLAY-only for S28. The comp-derived SUGGESTED renewal number that auto-computes and enters a draft after explicit per-number Admin approval is OUT of scope here and owned by S29 (`D-RENT-SUGGEST`, roadmap §3). S28 deliberately PRESERVES the no-app-suggested-number BEHAVIOR (governed by `F-NEGOTIATION-EXCLUDED` until S29 ships, then by S29's `F-RENT-SUGGEST-ADMIN-GATED`) while building the reference display and the data seam that S29 will consume.
- _Open:_ the exact RentCast tier + rate limits for `/listings/rental/long-term` (free tier is ~50 calls/mo) and the search parameters (radius, minimum comp count) that yield a defensible comp set. The endpoint (rental-listings search) and the MEDIAN aggregation are owner-confirmed (2026-07-23); only the tier/rate-limit detail rides with owner-dependency #2 (roadmap §5). The adapter is built against the documented listings-search response and stays inert until the key lands. The build step records this as a `Q-RENTCAST-ENDPOINT` row in `docs/facts.md`.
- _Assumption (authoring boundary):_ this pass authors ONLY this spec file. The `Q-`/`A-` rows and the shipped-work `F-*` promotion the template calls for are performed by the BUILD steps below (Context update), not by this authoring pass, and the README plus AGENTS.md registration rows are handed back for the operator to apply.

**Cross-product impacts.** New `lib/lease-renewal/market-comp-provider.ts`,
`lib/lease-renewal/providers/rentcast-market-comp-provider.ts`,
`lib/lease-renewal/comp-screenshot-action.ts`,
`app/api/lease-renewal/market-comps/route.ts`, and
`app/api/lease-renewal/comp-screenshot/route.ts`. Edits include the owner-draft and progress models,
the renewal controls, action seed/config, and name-only environment declarations described above.
`lib/lease-renewal/market-links.ts` and every consumer are retirement candidates: retain code only
if it is proven necessary for bounded legacy decoding, never as a UI or request producer. S60 owns
persisted comp truth and must apply the same neutral compatibility boundary. S28 feeds S29/S60/S62;
none may restore a removed research link or silently set the offered rent. The Drive, cost, gate,
and draft-only invariants remain unchanged.

**Adversarial acceptance checks.** Falsifiable Done-when states, each with a stable id and a Verify command.

- **AC-S28-1** The manual adapter performs no network call: given operator-entered comp low/high
  plus PMI number, `ManualMarketCompProvider.lookup()` returns exactly those numbers with
  `source:"Manual entry"` and `confidence:"Likely"`; given no inputs it returns no numeric fields
  and `confidence:"Needs Verification"`, and it never synthesizes a value. _Verify:_
  `npm test -- market-comp-provider`; keep `tests/unit/comp-basis-and-market.test.ts` green.
- **AC-S28-2** Reference-only, no auto-select: after a comp lookup returns a range, the owner-decision form shows the range as read-only reference text with the "Does not set the rent." caption AND the `offeredRent` input value is unchanged (never set from the result), and no POST to `/api/lease-renewal/renewal-progress` carries an app-derived rent figure. _Verify:_ `npm test -- renewal-progress-controls`; keep `tests/unit/comp-basis-and-market.test.ts` green.
- **AC-S28-3** Absent comp data renders `Needs Verification`, never fabricated: when the provider returns no estimate (empty or error), `buildOwnerRenewalDraft` emits the `Needs Verification: market comp range` marker, adds it to `missingInputs`, and no numeric range string appears in the draft body. _Verify:_ `npm test -- owner-draft`, `npm test -- market-comp-provider`.
- **AC-S28-4** The comps screenshot is a Drive ref, not a pasted string: uploading an image via the screenshot control stores it through the Drive image-store seam and the owner draft's screenshot fact resolves to a `StoredImage` ref (`drive:<id>` or its webViewLink), not the operator's typed text; when the Drive action gate is closed the route returns `error_type:"action_not_production_allowed"` and the draft still renders the `Needs Verification: paste comps screenshot` marker. _Verify:_ `npm test -- comp-screenshot`, `npm test -- image-store`.
- **AC-S28-5** The RentCast adapter is built but inert: `rentcast.rental_listings.search` is `production_allowed:false` and absent from both `EXECUTABLE_ALLOWLIST` copies, so `isActionExecutable` returns false and the live comps route refuses with the closed-action response; the adapter fails closed so any HTTP error or empty body yields a `Needs Verification` result with no numbers. _Verify:_ `npm test -- rentcast-market-comp-provider`, `npm test -- action-registry-schema`; keep `tests/unit/seed-action-registry-allowlist.test.ts` green.
- **AC-S28-6** No key or PII enters git: the RentCast key is read only from env/Secret Manager,
  `.env.example` names it with no value, and the provider query contains only approved property
  facts. No runtime request fetches, scrapes, redirects to, or constructs a Zillow URL. No
  user-visible UI, draft, API response, analytics label, or current source attribution contains
  Zillow. _Verify:_ secrets scan plus static/runtime request and rendered-copy sentinels.
- **AC-S28-7** A record containing legacy `zillowLow`, `zillowHigh`, or `compsUrl` can be opened
  without data loss: valid numeric values appear only as neutral legacy/manual reference facts and
  a URL is not rendered or followed. The next save emits only the current comp schema. A newly
  created record contains none of those keys. _Verify:_ legacy fixture read/migrate-on-save and new
  record serialization tests.

_Verify (whole suite):_ `npm run typecheck`, `npm run lint`, `npm test`, `npm run verify:spec-traceability`, `npm run verify:context-freshness`, and `bash scripts/verify.sh`. Named sentinels to keep green throughout: `tests/unit/comp-basis-and-market.test.ts` (D19 no-invented-number invariant), `tests/unit/action-registry-schema.test.ts` and `tests/unit/seed-action-registry-allowlist.test.ts` (gate/allowlist integrity), and `tests/unit/feature-suite-spec-shape.test.mjs` (this spec's shape gate).

**Forbidden actions / hard gates.** The safety NEVERs from roadmap §7 apply and a violation of any is
itself a falsification: no autonomous client-facing send (the owner email stays draft-only,
`send_allowed:false`; internal-staff notifications may auto-send per `D-AUTOMATION-LINE`, which this
suite does not use); generic non-workflow `gmail.message.send` stays Registry-closed; the personal
`josiah.abernathy@gmail.com` account never enters any auth path (Drive upload runs as a
`pmikcmetro.com` DWD subject); no secrets, customer PII, or guessed provider endpoint in git (the
RentCast key lives in Secret Manager, `.env.example` names only; the stored screenshot is a
`drive:<id>` ref, never the binary; the query carries only the property address, never tenant PII or
a rent figure). The verified non-null S52 production cost ceiling applies and every live RentCast
lookup respects the billing kill switch and `check:live-cost` preflight; if the ceiling is unset,
cost-bearing/live/cloud work is closed while local/app-plane work continues. Every live effect is
one-attempt, idempotent, receipted, and reversible where it mutates (the read has nothing to roll
back; the Drive upload rolls back by trashing the file). Routine release follows D05: after the full
local gate, auth and budget preflights, prior-revision capture, and a captured rollback command are
green, the runner may deploy; it must smoke the new revision successfully before promoting traffic.
Interactive authentication,
credentials/scopes, IAM, billing/quota, provider inputs, and destructive operations remain owner-run.
This suite MAY build the live RentCast adapter and the gated Drive upload to the seam and stage their
gate flips, but it does NOT set `production_allowed:true` for either action until the named owner
dependency (the RentCast key; the renewal-comp folder id for the screenshot action) is documented, at
which point the flip updates both `EXECUTABLE_ALLOWLIST` copies plus the pinned schema tests.
Suite-specific hard stops: (a) the provider is DISPLAY-only reference and MUST NOT auto-select,
auto-fill, or otherwise move the `offeredRent` number; the comp-derived SUGGESTED number is S29
(Admin-approval-gated), never S28. (b) Absent comp data renders `Needs Verification`, never a
fabricated number (`F-NEGOTIATION-EXCLUDED` preserved). (c) Zillow is neither a current source nor
a research surface: no visible label, link, URL, logo, redirect, lookup, fetch, scrape, new stored
field, or behavioral dependency is allowed. Legacy persisted names are read-only compatibility
aliases and cannot escape into UI, drafts, provider requests, analytics, or new writes.

**Ordered prompt sequence.**

1. _Discovery (on a later execution turn under the suite's existing authority):_ inventory
   `market-links.ts` and every legacy-key/link consumer, owner-draft/progress serialization,
   renewal controls, the image-store/action seam, provider config, and the existing gate contract.
   Prove which legacy fields require bounded read compatibility before editing product code.
2. _Build:_ B1 first (pure core) - `market-comp-provider.ts` with the interface, query/result types, `ManualMarketCompProvider` reproducing today's typed behavior, and the prod-fenced factory. Golden-data-first unit tests for every branch, including the empty-input `Needs Verification` path (AC-S28-1).
3. _Build:_ B2 - the reference-only comps route plus the DISPLAY-only surface and "Does not set the rent." caption in `RenewalProgressControls.tsx`, with `offeredRent` never bound to a result (AC-S28-2).
4. _Build:_ B3 - `comp-screenshot-action.ts` mirroring `photo-action.ts`, the screenshot route reusing `DriveMaintenanceImageStore` (Stub in dev/test), and the `RenewalMarketBasis.compScreenshotRef` wiring (AC-S28-4).
5. _Build:_ B4 - `ownerDraftMarketFromBasis` prefers the Drive ref and carries the provider `source`, with both `Needs Verification` fallbacks preserved verbatim (AC-S28-3).
6. _Build:_ B5 - `rentcast-market-comp-provider.ts` behind the interface, key from env/Secret Manager, fail-closed, unit-proven against a documented response shape and a stubbed transport (AC-S28-5, AC-S28-6).
7. _Gate:_ B6 - author the two Action Registry seed entries `production_allowed:false`, add neither key to the `EXECUTABLE_ALLOWLIST` copies, and confirm `action-registry-schema.test.ts` + `seed-action-registry-allowlist.test.ts` stay green (AC-S28-5).
8. _Owner:_ hand back at the one seam - the RentCast API key `RENTCAST_API_KEY` in Secret Manager
   (owner-dependency #2). Once provided, apply the gate-flip recipe to
   `rentcast.rental_listings.search` (both allowlists + pinned tests); the comp-screenshot Drive action
   flips the same routine way once the renewal-comp folder id is set (Drive scope already
   authorized). The subsequent routine deploy, smoke, and traffic promotion follow D05 after its
   full gate is green.
9. _Verify:_ run AC-S28-1 through AC-S28-7, including legacy-read/new-write and rendered/runtime
   no-Zillow falsification, then the normal type/lint/test/full-verifier gates.
10. _Context update:_ after later execution under the existing authority, promote only verified shipped behavior and
    update the loop at slice boundaries; specification approval alone creates no shipped fact.

**Deletion/merge recommendation.** KEEP this file as the tracked S28 contract. It is the shared spec for BOTH Wave-1 "S28a" (provider abstraction plus comp screenshot, app-plane) and Wave-2 "S28b" (RentCast live adapter); do not fork S28a/S28b into separate files. The disposable `docs/temp/market-comp-data-plan.md` packet, if authored, stays local-only evidence and is deleted when the suite ships. Do NOT merge S28 into S29: S29 is the separate, Admin-approval-gated comp-derived rent SUGGESTION that consumes this provider; S28 is the reference display plus the data and screenshot seam that stays strictly non-suggesting.
