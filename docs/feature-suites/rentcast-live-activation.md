<!-- spec-shape: overhaul-v1 -->

# S59 — RentCast live activation and operational hardening

> New 2026-08-06. Opened by the post-2026-08-05 program grant in `AGENTS.md`. Owner direction (Q3):
> RentCast goes live **before** the four-lease test set runs, and must be proven "a stable,
> repeatable process" first. Owner direction (Q7): one shared company key with caching and a usage
> counter; a per-user credential subsystem is explicitly **not** built now. This suite ACTIVATES and
> HARDENS the adapter specified by **S28**; it does not re-specify the adapter itself.

**Goal.** A person on the renewal desk clicks for comparables and gets a real, current market range
from RentCast, or a clear refusal that names why. It works the same way on the tenth click as on the
first, it cannot quietly exhaust a 50-call monthly allowance, and when RentCast is slow, broken, or
out of quota the desk degrades to hand-entered numbers instead of failing or fabricating. When this
suite is done, no external dependency remains open on the comps path.

**What it is / how it functions.** The adapter at
`lib/lease-renewal/providers/rentcast-market-comp-provider.ts` is real, deterministic, unit-proven,
and correctly fails closed. It has also **never been reachable in any environment**. Activation is
five independent problems, not a switch.

- **Problem 1 — the provider selector is unset everywhere.** `MARKET_COMP_PROVIDER` is absent from
  both `.env.local` and `.env.production.local`, so `z.enum(["manual","rentcast"]).default("manual")`
  at `lib/config/server.ts:116` resolves to `manual` and the RentCast branch at
  `lib/lease-renewal/market-comp-provider.ts:99-102` is unreachable. Local dev has never exercised it
  either; every existing test uses a stubbed transport.
- **Problem 2 — the deploy wrapper drops both variables.** `readRuntimeEnv` in
  `scripts/deploy-demo-cloud-run.mjs` is a closed literal allowlist that names neither
  `MARKET_COMP_PROVIDER` nor `RENTCAST_API_KEY`, and it is emitted with a **replacing**
  `--set-env-vars` map, so anything set out of band is wiped on the next deploy. `readRuntimeSecrets`
  binds only the two RentVine secrets and otherwise emits `--clear-secrets`. A key sitting in Secret
  Manager therefore binds to nothing. This is the step that silently breaks integrations, and it
  ships in the same reviewed change as the gate.
- **Problem 3 — the gate is four fences and a pinned test, not one boolean.**
  `rentcast.rental_listings.search` is `production_allowed:false` with `readiness:"Planned"` and
  `evidence_status:"Undocumented"`. `lib/firestore/schemas.ts` refuses `production_allowed:true`
  unless readiness is `Approved for Execution` **and** evidence_status is `Documented`, and
  `lib/integrations/action-gate.ts` **re-parses the seed entry on every request**, so flipping only
  the boolean throws at runtime rather than at seed time. The key is also absent from both
  `EXECUTABLE_ALLOWLIST` copies (`scripts/seed-action-registry.ts`, `lib/admin/migration-readiness.ts`)
  and is pinned in the gated-off list in `tests/unit/action-registry-schema.test.ts`. **A
  `production_allowed` change is a D12 protected path**: this suite prepares that change as an
  isolated, reviewed patch and surfaces it. It does not push it under the standing grant.
- **Problem 4 — no cache, quota, counter, or throttle exists.** A grep across the route and both
  provider files returns zero matches for cache, quota, throttle, or rate limit. One button click is
  one uncached, unmetered call against a 50-per-month free allowance. This suite adds: a per-address
  result cache with an explicit TTL; a persisted monthly call counter; a soft warning threshold; and
  a hard stop that refuses further live calls for the period and falls back to hand entry. The
  counter is the operator-visible answer to "how many do we have left."
- **Problem 5 — the query is half-wired and one input is poisoned.** The route schema and the
  provider's URL builder both accept `bedrooms`, `bathrooms`, and `propertyType`, but the only caller
  sends none of them, so a first real call is an unfiltered two-mile search that mixes a studio and a
  four-bedroom into one min/max range. Worse, `RenewalProgressControls.tsx` posts
  `(address ?? "").trim() || "Unknown"`, so a lease with no address label sends the literal string
  `"Unknown"`, which clears the provider's blank-address guard and spends a billable call on nonsense.
  Both are fixed here: the unit attributes are passed through, and a missing address refuses locally
  before any call is made.

**Errors, timeouts, and fallback.** The adapter already fails closed on missing key, blank address,
non-2xx, parse error, and fewer than three usable comps, returning `Needs Verification` with no
numbers. This suite makes the failure _legible_: each refusal reason is distinguishable in the UI, a
timeout is reported as a timeout rather than as "no comps found", and every failure path leaves the
operator able to type the numbers by hand. The manual provider remains the fallback, not a
deprecated path.

**Validation and the controlled smoke test.** A read-only smoke script performs exactly one live
RentCast call against one known address, prints the resolved range, comp count, and source, and
writes nothing durable. It runs against a real key before the gate flip is proposed, so the flip is
backed by observed behavior rather than by unit tests over a stub. Its output is the
`evidence_status: "Documented"` justification.

**What RentCast actually offers, and which endpoint we should be calling.** Researched against the
published API reference on 2026-08-06. This changes the design: the adapter currently calls the wrong
endpoint for the job.

| Endpoint                     | Returns                                                                 | Use here                 |
| ---------------------------- | ----------------------------------------------------------------------- | ------------------------ |
| `/avm/rent/long-term`        | A rent estimate plus `rentRangeLow` / `rentRangeHigh` plus scored comps | **The comp basis**       |
| `/listings/rental/long-term` | Raw rental listings in an area                                          | What we call today       |
| `/markets`                   | Aggregate rental statistics for one zip, with month-by-month history    | **The historical trend** |

- **Switch the comp basis to `/avm/rent/long-term`.** It returns `rent`, `rentRangeLow`, and
  `rentRangeHigh` directly, plus a `comparables[]` array in which each entry carries a `correlation`
  score from 0 to 1 and the array is **sorted by correlation descending**. Every comp also carries
  distance in miles, bedrooms, bathrooms, square footage, days on market, and how recently it was
  seen. Today's adapter pulls raw listings and computes its own median — which is reimplementing
  RentCast's own model, badly, and is exactly why an unfiltered two-mile search would mix a studio
  with a four-bedroom. The AVM endpoint solves relevance natively.
- **The parameters that fix the relevance problem already exist:** `propertyType`, `bedrooms`,
  `bathrooms`, `squareFootage`, `maxRadius`, `daysOld`, and `compCount` (5 to 25, default 15). Passing
  the unit attributes is not an enhancement; without them the estimate is for a generic property at
  that address.
- **Historical trend data is real and is one call.**
  `/markets?zipCode=<zip>&dataType=Rental&historyRange=<months>` returns current rental statistics
  plus a `history` object keyed `YYYY-MM`. Each month carries average and median rent, rent per square
  foot, average and median days on market, new and total listing counts, and breakdowns by property
  type and by bedroom count. History is available from April 2020, with gaps where a month had too few
  listings to be statistically valid. This is the thing the client asked for on the call, and it was
  previously recorded as an unknown build.

**Cost, stated exactly.** One billable request is one HTTP call returning 200 with a body; the
response size is irrelevant and **error responses are not billed**. The quota resets at the end of the
billing period and **does not roll over**. The hard rate limit is 20 requests per second per key on
every plan. The free Developer plan includes 50 requests per month; paid tiers step up from there.

**The number that matters for the quota stop:** a renewal that uses both the AVM comp basis and the
trend history costs **two** requests. At the roughly 10 to 15 renewals a month the client described,
that is 20 to 30 requests — inside the free allowance with headroom, and the four-lease test set costs
about eight.

**The risk that makes the hard stop load-bearing.** Exceeding the quota does **not** fail closed at
RentCast: overage is charged automatically per additional request, and large accumulations can trigger
a mid-cycle invoice. So the application's own counter and hard stop are the only thing standing
between a loop bug and a surprise bill. Size the stop at the plan's real allowance, and treat it as a
cost control rather than a nicety.

**The controlled smoke and the closed gate.** The smoke script makes a live RentCast call while
`rentcast.rental_listings.search` is still `production_allowed:false`. That is deliberate and it is
not a bypass: the script is an operator-run CLI, not a product request path, and it follows the same
pattern as the existing `smoke:rentvine-read`. The Action Registry governs what the **application**
may do on a user's behalf; a reviewed operator script is how the `evidence_status: "Documented"`
justification is produced in the first place. Stated explicitly here because the two facts sitting
side by side otherwise read as a contradiction.

Buildable now (app-plane): the cache, counter, quota stop, query pass-through, address refusal,
failure legibility, and the smoke script. Build to the seam (live provider): the deploy-wrapper
binding, the config wiring, and the health probe behind `health.rentcast.api_key`, whose contract
already declares a `rentcast.rate_limit` step with no implementation.

**Owner dependencies — there are TWO, not one.**

1. `RENTCAST_API_KEY` present in Secret Manager on `pmi-kc-kb-prod` and readable by the runtime
   service account. Owner-run; the procedure is `docs/rentcast-setup-runbook.md`.
2. The reviewed **D12 protected-path patch** that opens `rentcast.rental_listings.search`. This suite
   prepares it and surfaces it; it does not push it. Until it lands the route correctly refuses, so
   the comps path is not live no matter what else is done.

The third item that was previously open here is **resolved** (`Q-RENTCAST-PLAN-TERMS`). RentCast's
published API Terms of Use grant a limited right to "use and/or store the API Data", expressly
including the right "to sublicense, disclose, display, resell and distribute the API Data to third
parties" and "to incorporate and store the API Data within your internal systems". Caching,
persistence, and showing a comp to a property owner are all permitted; attribution is expressly not
required; no retention limit is stated. The only relevant duty is to prevent unauthorized parties
from scraping the data through our own application. `docs/client-checklist.md` and
`docs/environment-handoff.md` still carry the old gate wording and must be corrected in this slice.

**Open questions & assumptions.**

- _Answered 2026-08-06 (owner, Q7):_ one shared company key. The per-user credential subsystem is
  deferred and must not be built here. Today no user identity reaches the comps request at all: the
  request schema is strict and carries no credential field.
- _Open (owner, `Q-COMP-TREND-PRESENTATION`, raised under Q7):_ how historical trend data is presented to the owner — a link, an attachment,
  or values rendered in the email body. This does not block activation; it blocks the owner-draft
  presentation, which lives in **S60**. Recorded as a `Q-` row.
- _Open:_ RentCast's published rate limit and whether its terms permit one free account per team
  member. The second question only matters if Q7 is revisited. Neither blocks this suite.
- _Answered 2026-08-06 (vendor documentation):_ the free Developer plan includes 50 requests per
  month; paid tiers step up from there. A billable request is one 200 response with a body; errors are
  not billed; the quota does not roll over; the hard rate limit is 20 requests per second per key on
  every plan. The $0.20 overage figure from the 2026-08-05 call is NOT confirmed by the published
  documentation, which states only that overage is charged automatically per additional request.
  AC-S59-14 still requires reading the exact allowance and overage price back from the live account
  before the hard stop constant is set, because that stop refuses operator work when it fires and
  because overage bills silently.
- _Open (`Q-RENTCAST-PLAN-TERMS`):_ whether the active plan and third-party-data terms permit storing
  or caching comp responses and displaying them to a property owner. This suite adds the caching and
  S60 adds the owner-facing display, so it is squarely in scope and is not resolved here.
- _Open (`Q-COMP-TREND-PRESENTATION`) — the SOURCE is now known; only the presentation is open._
  `/markets?zipCode=&dataType=Rental&historyRange=` returns month-keyed rental history from April
  2020, so the retrieval is a known one-call build rather than an unknown. What remains genuinely open
  is how it reaches the owner: a link, an attachment, or values rendered in the email body. It costs
  one extra billable request per renewal.
- _Assumption:_ the counter and thresholds stay named constants so a corrected allowance is a one-line
  change rather than a redesign.
- _Assumption:_ on the AVM endpoint the defaults become `compCount` (5 to 25, default 15) plus an
  explicit `maxRadius`, with the unit attributes always passed. The three-comp fail-closed floor is
  retained. Review these against the four test properties before comps are shown to any owner.

**Cross-product impacts.**

- `lib/config/server.ts`, `.env.example`, `.env.production.local` — provider selector and key.
- `scripts/deploy-demo-cloud-run.mjs` — `readRuntimeEnv` and `readRuntimeSecrets` bindings.
- `lib/lease-renewal/providers/rentcast-market-comp-provider.ts` — query pass-through, failure
  legibility, timeout classification.
- `app/api/lease-renewal/market-comps/route.ts` — cache, counter, quota stop, address refusal.
- `components/lease-renewal/RenewalProgressControls.tsx` — send unit attributes; stop sending
  `"Unknown"`; render the distinct refusal reasons and the remaining-calls figure.
- `lib/integrations/health-checks.ts` — implement the declared `rentcast.rate_limit` step.
- `lib/integrations/action-registry-seed.ts` — **D12 protected**; prepared and parked, not pushed.
- Extends **S28** (`docs/feature-suites/market-comp-data.md`), which keeps its adapter ACs. Feeds
  **S60** (persistence and the owner draft) and **S63** (the test set's number comparison). Depends on
  **S58** for the refusal to run comps against expired lease data.

**Adversarial acceptance checks.**

- **AC-S59-1** — With the provider selector set to `rentcast` and a valid key, one desk lookup
  performs exactly one live call and renders a range, a point estimate, and a comp count. _Verify:_
  the controlled smoke script, output recorded.
- **AC-S59-2** — A deployed revision reports both `MARKET_COMP_PROVIDER` and a bound
  `RENTCAST_API_KEY` secret in its describe readback. A deploy that drops either fails the check.
  _Verify:_ `gcloud run services describe pmi-kc-app --format=json` read back after deploy.
- **AC-S59-3** — Repeating the same address inside the cache TTL performs **zero** additional live
  calls and returns the identical range. _Verify:_ `npm test -- market-comp-provider`.
- **AC-S59-4** — The monthly counter increments only on a real live call, never on a cache hit and
  never on a refusal that made no request. _Verify:_ `npm test -- market-comps-route`.
- **AC-S59-5** — At the hard quota stop the route refuses with an explicit out-of-allowance reason,
  makes no call, and the desk still permits hand-entered comps. _Verify:_
  `npm test -- market-comps-route`.
- **AC-S59-6** — A lease with no address label refuses locally and makes **no** call. The literal
  string `"Unknown"` is never sent. _Verify:_ `npm test -- RenewalProgressControls`.
- **AC-S59-7** — Bedrooms, bathrooms, and property type reach the provider URL when known. _Verify:_
  `npm test -- rentcast-market-comp-provider`.
- **AC-S59-8** — Timeout, non-2xx, parse failure, and fewer-than-three-comps each render a
  distinguishable reason. None renders as a number, and none renders as the same generic message.
  _Verify:_ `npm test -- rentcast-market-comp-provider market-comps-route`.
- **AC-S59-9** — With the action gated off, the route refuses before parsing the body and makes no
  call. This is the pre-flip state and must hold until the reviewed flip lands. _Verify:_
  `npm test -- market-comps-route`.
- **AC-S59-10** — `health.rentcast.api_key` executes a real probe and reports authentication and rate
  limit as observed values rather than as contract metadata. _Verify:_
  `npm test -- health-checks` plus one live run.
- **AC-S59-11** — The prepared `production_allowed` patch changes `readiness`, `evidence_status`, and
  the boolean together, adds the key to both `EXECUTABLE_ALLOWLIST` copies, and updates the pinned
  schema test. Changing the boolean alone throws at request time. _Verify:_
  `npm test -- action-registry-schema`, plus a deliberate boolean-only edit observed to fail.
- **AC-S59-12** — Everything this suite owns is readable back from the running system: a
  `gcloud run services describe` on the serving revision shows `MARKET_COMP_PROVIDER` set and
  `RENTCAST_API_KEY` bound as a secret, the controlled smoke recorded one live call with its range
  and comp count, and the quota counter reads a non-zero value afterwards. _Verify:_ the describe
  output and the smoke output, both recorded.
- **AC-S59-13** — The two owner dependencies are reported as **explicitly open or explicitly closed**,
  never as absent: the Secret Manager key placement, and the reviewed D12 patch that opens the action.
  While either is open, the comps path reports itself as not live and S63's number criterion stays
  `not_evaluated`. _Verify:_ `npm test -- market-comps-route`, plus a seed readback of
  `production_allowed`.
- **AC-S59-14** — The RentCast plan allowance and overage are read back from the real account and
  recorded before the hard quota-stop constant is set. Shipping the stop against the assumed figures
  fails this AC. _Verify:_ recorded in `docs/facts.md`, and `npm test -- market-comps-route` pinned to
  the recorded value.

- **AC-S59-15** — The comp basis comes from `/avm/rent/long-term`: the persisted range is the
  provider's own `rentRangeLow`/`rentRangeHigh` and the point estimate is its `rent`, not a median the
  app computed from raw listings. _Verify:_ `npm test -- rentcast-market-comp-provider`.
- **AC-S59-16** — Every request carries the unit attributes that are known for the lease
  (`propertyType`, `bedrooms`, `bathrooms`, `squareFootage`) plus an explicit `maxRadius` and
  `compCount`. A request built without them fails the test. _Verify:_
  `npm test -- rentcast-market-comp-provider`.
- **AC-S59-17** — Comparables are retained in provider order with their `correlation` scores intact, so
  an operator can see how similar each comp actually is. _Verify:_
  `npm test -- rentcast-market-comp-provider`.
- **AC-S59-18** — A trend lookup calls `/markets` once with `dataType=Rental` and an explicit
  `historyRange`, and the month-keyed history is returned intact. It is a separate billable request and
  increments the counter separately. _Verify:_ `npm test -- market-comps-route`.

Keep green: `tests/unit/market-comp-provider.test.ts`,
`tests/unit/rentcast-market-comp-provider.test.ts`, `tests/unit/action-registry-schema.test.ts`,
`tests/unit/environment-handoff-provider-table.test.mjs`.

**Forbidden actions / hard gates.** No autonomous client-facing send; generic non-workflow
`gmail.message.send` stays Registry-closed; no personal account in any auth path; no secret, token,
PII, or guessed endpoint in git; the S52 production cost ceiling stands; every live effect stays
one-attempt, idempotent, receipted, and reversible. The RentCast key is **never** written to a file,
a command line, a log, a test fixture, or this repository; it lives in Secret Manager and reaches the
runtime only through the deploy wrapper's secret binding. This suite must **not** push the
`production_allowed` change: `lib/integrations/action-registry-seed.ts` is a D12 protected path, so
the patch is prepared, isolated, and surfaced for owner review while the rest of the suite continues.
It must not build a per-user credential store. It must not fabricate a comp number, and a refusal
must never be rendered as a range. Overage spend beyond the free allowance requires an explicit owner
decision before the hard stop is raised.

**Ordered prompt sequence.**

1. _Discovery:_ confirm the selector is absent from both env files and that the deploy wrapper names
   neither variable.
2. _Build:_ cache, monthly counter, soft warning, hard stop, and the operator-visible remaining count.
3. _Build:_ query pass-through and the missing-address local refusal.
4. _Build:_ failure legibility, including timeout classification.
5. _Build:_ the read-only controlled smoke script.
6. _Build:_ implement the declared `rentcast.rate_limit` health step.
7. _Owner:_ confirm `RENTCAST_API_KEY` is in Secret Manager and readable by the runtime identity.
8. _Build:_ deploy-wrapper env and secret bindings; set the selector in the production env file.
9. _Verify:_ run the controlled smoke against the live API; record range, comp count, and source.
10. _Gate:_ prepare the isolated D12 seed patch (readiness + evidence_status + boolean + both
    allowlists + pinned test) and **surface it for owner review**; do not push it.
11. _Verify:_ full gate, then deploy and read back the revision's env and secret bindings.
12. _Context update:_ `docs/facts.md` `F-` row citing AC-S59-1 through AC-S59-12; `Q-` row for the
    open trend-presentation choice; update `docs/loop-state.md` and `docs/status.md`.

**Deletion/merge recommendation.** KEEP, and cross-reference from S28 rather than merging. S28 owns
the adapter contract; this file owns activation and operational behavior. The disposable cycle packet `docs/temp/rentcast-live-activation-plan.md` is CREATED AT SLICE START, not by this spec.
