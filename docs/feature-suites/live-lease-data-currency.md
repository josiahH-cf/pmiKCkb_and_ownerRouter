<!-- spec-shape: overhaul-v1 -->

# S58 — Live lease data currency and refresh contract

> New 2026-08-06. Opened by the post-2026-08-05 program grant in `AGENTS.md`, answering the owner's
> Q10 direction: "The application cannot rely only on a one-time capture; the live-data path needs to
> refresh continually enough to remain operationally current." Depends on S57, which changes the
> shape and cost of the underlying read from 25 rows to the full portfolio.

**Goal.** An operator can always tell how old the lease data in front of them is, can force it to
refresh, and is stopped rather than misled when it is too old to act on. Today there is a silent
60-second memo with no indicator, no manual refresh, and no upper bound. After this suite, staleness
is a visible, bounded, testable property of the desk instead of an invisible implementation detail.
Separately and explicitly: the frozen evidence baseline for the four-lease test set is never touched
by any refresh.

**What it is / how it functions.** The existing cache is `lib/lease-renewal/live-lease-cache.ts`: one
global in-memory entry, `LEASE_EXPORT_TTL_MS = 60_000`, concurrent misses coalesced into one read,
failures deliberately not cached. That design is sound and is kept. What is missing is everything
around it.

- **Trigger model — lazy revalidation, never a background timer.** Production runs
  `--min-instances=0 --max-instances=1`, so the service scales to zero and a background interval
  would either not run or would hold an instance warm and spend money for nothing. Refresh is
  therefore demand-driven: a request that finds an expired entry revalidates. This is a deliberate
  choice against a cron, and it is the reason no Cloud Scheduler job is introduced here.
- **Three ages, not one.** `fresh` (age < TTL) serves from cache. `stale` (TTL <= age < hard max)
  serves the cached rows immediately and revalidates, and the UI says the data is refreshing.
  `expired` (age >= hard max) is refused for any action that composes a draft or records a decision;
  the desk renders but its action controls are disabled with a plain explanation.
- **The numbers.** Soft TTL stays 60 seconds. Hard max age is 15 minutes. Both are named constants
  in one module so they are reviewable in one place, and both are passed in rather than read from a
  clock inside the cache, preserving the existing deterministic `nowMs` discipline.
- **Page load and navigation refresh; focus refreshes conditionally.** The desk is a server
  component, so a load or a navigation already re-enters the cache read and revalidates when
  expired. Window focus is a client concern: on regaining focus, if the rendered snapshot is older
  than the soft TTL, the client requests a revalidation. Focus does **not** force an unconditional
  read, because tabbing back and forth would otherwise hammer the provider.
- **Manual refresh is explicit and bypasses the TTL.** A visible control on the desk forces a read
  and reports the outcome. It is rate-limited per operator so a held-down click cannot become a
  load generator against RentVine.
- **Invalidation on our own writes.** Any path that changes data the export reflects invalidates the
  entry rather than waiting out the TTL. Today that is the Sheet write-back only; when a RentVine
  write path exists it joins the same invalidation point. This is wired now so that a future write
  cannot ship without it.
- **Failure behavior.** A failed read is still not cached. The revalidation retries with bounded
  backoff, and while it is failing the desk keeps serving the last good rows with an explicit failed
  state and the age of what is displayed. Once the hard max age passes, serving stops being
  acceptable and actions are refused. A provider failure must never render as an empty portfolio,
  because an empty desk reads as "no renewals due" and that is a false operational statement.
- **Four visible states, always one of them.** Updated-with-an-age, Refreshing,
  Last-updated-with-an-age-and-could-not-refresh, and Data-too-old-to-act-on. The age is rendered
  from the snapshot timestamp, not from the render time.
- **The frozen baseline is a different thing and must stay different.** The S63 test-set evidence
  snapshot is a persisted, immutable record captured once per lease. It is never re-read, never
  revalidated, and never overwritten by a refresh. The live view and the baseline are separate
  reads with separate lifetimes, and a test asserts that no refresh path writes to the baseline
  store. Conflating them would destroy the comparison the test set exists to produce.

Buildable now (app-plane): all of the above. Build to the seam (live provider): none beyond S57's
read. Owner dependency (the one flip): none.

**Open questions & assumptions.**

- _Open — provisional value, no owner direction:_ the 15-minute hard max age. The owner required a
  maximum acceptable data age to be defined but supplied no number, so 15 minutes is the runner's
  provisional choice, not a confirmed policy. It matters because exceeding it **refuses operator
  work**. It is a single named constant, it is rendered to the operator so the behavior is legible,
  and it is recorded as `Q-LEASE-DATA-MAX-AGE` for confirmation. The 60-second soft TTL is not
  provisional — it is the shipped value being kept.
- _Assumption:_ RentVine reads remain free of GCP budget impact, so refresh frequency is a latency
  and provider-courtesy question rather than a cost question. The S52 ceiling is unaffected.
- _Open:_ whether the Console live projection and the maintenance unit matcher should share the same
  age thresholds as the renewal desk. Default taken: yes, one contract, because divergent staleness
  rules across surfaces are how an operator learns to distrust all of them.
- _Open:_ whether an expired snapshot should also block read-only browsing. Default taken: no. It
  blocks composing and deciding, not looking.

**Cross-product impacts.**

- `lib/lease-renewal/live-lease-cache.ts` — age classification, hard max, invalidation hook,
  snapshot timestamp exposed to callers.
- `components/lease-renewal/RenewalDesk.tsx` and the per-lease workspace — the four states, the age
  display, the manual refresh control, disabled actions on expired.
- `app/api/lease-renewal/renewal-notice-draft/route.ts`, `.../renewal-progress/route.ts` — refuse on
  an expired snapshot rather than composing from it.
- `lib/lease-renewal/sheet-writeback-service.ts` — invalidation on a successful write.
- `lib/console/rentvine-live-provider.ts`, `lib/maintenance/live-unit-source.ts` — same contract.
- Depends on **S57**. Feeds **S59** (a comp lookup must not run against expired lease data) and
  **S63** (baseline immutability).

**Adversarial acceptance checks.**

- **AC-S58-1** — With a snapshot aged under the soft TTL, a second request performs no provider read.
  _Verify:_ `npm test -- live-lease-cache`.
- **AC-S58-2** — With a snapshot aged between the soft TTL and the hard max, the cached rows are
  served immediately and a revalidation is issued. The response is not delayed by the revalidation.
  _Verify:_ `npm test -- live-lease-cache`.
- **AC-S58-3** — With a snapshot aged beyond the hard max, `renewal-notice-draft` and
  `renewal-progress` refuse with an explicit expired-data reason and create nothing. _Verify:_
  `npm test -- renewal-notice-draft-route renewal-progress-route`.
- **AC-S58-4** — When the provider read fails, the desk renders the last good rows with a failed
  state and a visible age. It never renders an empty portfolio and never renders a fresh state.
  _Verify:_ `npm test -- RenewalDesk`.
- **AC-S58-5** — Repeated failures retry with increasing backoff and do not issue one provider read
  per request. _Verify:_ `npm test -- live-lease-cache`.
- **AC-S58-6** — The manual refresh control bypasses the TTL, and repeated activation inside the
  rate-limit window performs exactly one provider read. _Verify:_ `npm test -- RenewalDesk`.
- **AC-S58-7** — Regaining window focus with a snapshot older than the soft TTL triggers exactly one
  revalidation; regaining focus with a fresh snapshot triggers none. _Verify:_
  `npm test -- RenewalDesk`.
- **AC-S58-8** — A successful Sheet write-back invalidates the entry, so the next read is a provider
  read rather than a cache hit. _Verify:_ `npm test -- sheet-writeback-service`.
- **AC-S58-9** — Exactly one of the four states is rendered at all times, and the displayed age is
  derived from the snapshot timestamp rather than render time. _Verify:_ `npm test -- RenewalDesk`.
- **AC-S58-10** — A forward constraint, not a same-slice assertion. The S63 baseline store does not
  exist yet when S58 runs, so this AC ships as a **named boundary test with no baseline collection to
  guard** — it asserts that the refresh module exposes no write capability at all, which is
  independently checkable today. Its full form, asserting a real baseline is unmutated across a
  refresh cycle, is `AC-S63-3` and lands with S63. Recording it this way prevents a vacuously green
  sentinel from being mistaken for proof. _Verify:_
  `npm test -- testset-baseline-immutability-boundary`.

Keep green: `tests/unit/lease-renewal-progress.test.ts`, `tests/unit/renewal-progress-route.test.ts`,
`feature-suite-spec-shape.test.mjs`, `npm run verify:context-freshness`.

**Forbidden actions / hard gates.** No autonomous client-facing send; generic non-workflow
`gmail.message.send` stays Registry-closed; no personal account in any auth path; no secret, token,
PII, or guessed endpoint in git; the S52 production cost ceiling stands; every live effect stays
one-attempt, idempotent, receipted, and reversible, with client-facing sends and system-of-record
writes human-confirmed. This suite must not introduce a Cloud Scheduler job, cron, background timer,
or any always-on process; refresh is demand-driven by design. It must not cache a failed read as if
it were data, must not render an empty portfolio on provider failure, must not raise
`--min-instances` above zero, and must not write to or invalidate the S63 frozen baseline.

**Ordered prompt sequence.**

1. _Discovery:_ re-read `live-lease-cache.ts` and every consumer; confirm the deterministic `nowMs`
   contract and the read-only shared-entry rule.
2. _Understanding:_ confirm the desk and the draft routes both resolve through the same cache.
3. _Build:_ age classification, hard max age, snapshot timestamp, invalidation hook.
4. _Build:_ refuse expired snapshots in the draft and progress routes.
5. _Build:_ the four UI states, age display, manual refresh with rate limit, focus revalidation.
6. _Build:_ invalidation on Sheet write-back; architecture sentinel for baseline immutability.
7. _Verify:_ falsify by pointing a refresh path at the baseline store and observing AC-S58-10 fail,
   then remove it and observe it pass.
8. _Gate:_ `format:check`, `lint`, `typecheck`, `npm test`, `test:e2e:core`, `verify:falsification`,
   `verify:context-freshness`, `verify:spec-traceability`, `npm run build`.
9. _Context update:_ promote a `docs/facts.md` `F-` row citing AC-S58-1 through AC-S58-10; update
   `docs/loop-state.md` and `docs/status.md`.

**Deletion/merge recommendation.** KEEP. The staleness contract is durable operator-facing behavior.
The disposable cycle packet `docs/temp/live-lease-data-currency-plan.md` is CREATED AT SLICE START, not by this spec.
