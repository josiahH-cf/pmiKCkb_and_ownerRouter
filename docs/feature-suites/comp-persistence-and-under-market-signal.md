<!-- spec-shape: overhaul-v1 -->

# S60 — Comp persistence, owner-draft truth, and the under-market signal

> New 2026-08-06. Opened by the post-2026-08-05 program grant in `AGENTS.md`. Owner direction (N1):
> build the rent-versus-market comparison as part of the RentCast integration rather than deferring
> it. Owner direction (N7): repair the dead ±15% clamp in the same slice. Depends on **S59**; without
> it there is no provider number to persist.

**Goal.** When the app shows a market range next to a renewal, that range is the number it actually
retrieved, labeled with the source it actually came from. Today, activating RentCast without this
suite would print the operator's own hand-typed figures in the owner email under the heading
"Source: RentCast" — a false statement to a client. This suite closes that, and adds the thing Dan
asked for on the call: a signal when a rent is meaningfully below market.

**What it is / how it functions.** The lookup already returns `rangeLow`, `rangeHigh`,
`pointEstimate`, and `compCount`. **None of them is persisted.** `RenewalMarketBasis` in
`lib/lease-renewal/renewal-progress.ts` holds only operator-typed values plus two display-only
strings, and `RenewalProgressControls.tsx` submits only `compSource` and `compRetrievedAt` from a
lookup. The numbers are rendered once on screen and discarded.

- **The mislabeling, precisely.** `lib/lease-renewal/owner-draft.ts` reads the range from
  `market.zillowLow` / `market.zillowHigh` but reads the source label from `market.compSource`. So
  once `compSource` says `RentCast`, the owner email prints operator-typed numbers attributed to
  RentCast. If the operator typed nothing, the draft instead prints
  `[Needs Verification: market comp range from Zillow]` while a valid RentCast median sits on screen
  and is thrown away. Both outcomes are wrong in opposite directions.
- **Two bases, kept apart.** Extend the persisted basis with an optional `provider` block —
  `{ source, rangeLow, rangeHigh, pointEstimate, compCount, retrievedAt, radiusMiles, unitFilters,
comps[], trend }`, where `comps[]` keeps each comparable's correlation score and distance, and
  `trend` holds the month-keyed rental history returned by RentCast's `/markets` endpoint
  — beside the existing operator-typed fields. The operator's numbers are never overwritten by a
  lookup and a lookup is never overwritten by the operator; both can coexist and the draft states
  which one it used. `normalizeMarketBasis` validates the new block with the same
  never-fabricate discipline it already applies.
- **The draft tells the truth or says nothing.** `ownerDraftMarketFromBasis` prefers the provider
  block when present and labels it with the provider's own source string and retrieval date. With no
  provider block it uses the operator numbers and labels them as operator-entered. It must never
  combine one basis's numbers with the other's label. The hard-coded `"Zillow"` fallbacks in
  `owner-draft.ts` are removed; an absent basis produces a `Needs Verification` marker that names no
  provider at all.
- **Field naming.** The persisted keys `zillowLow` / `zillowHigh` are retained as the operator-typed
  basis to avoid a data migration for a cosmetic gain, but every operator-facing label changes from
  "Zillow low/high" to "Comp low/high (typed)". The Zillow deep link in
  `lib/lease-renewal/market-links.ts` stays: a human opening Zillow to sanity-check a number is a
  legitimate workflow, distinct from the app claiming Zillow as a data source. A rename of the
  persisted keys is recorded as deferred, not silently skipped.
- **The under-market signal.** Compare the authoritative current rent against the provider point
  estimate and flag when it falls materially below. The flag is **internal only**: it surfaces on the
  desk and in the operator's view, and it never enters a client draft, because a statement about
  what a property "should" rent for is exactly the owner-money territory the governance carve-out
  keeps human. It is a prompt for a person to look, not an instruction to raise rent. It computes
  only from a provider basis, never from operator-typed numbers, because comparing the operator's
  own figure against itself is meaningless.
- **The clamp repair.** `computeRentSuggestion` clamps the comp median to ±15% of current rent, but
  the sole production call site in `lib/firestore/lease-renewal-rent-suggestion-approvals.ts` omits
  `currentRent`, so the clamp branch is never entered and an outlier median runs unbounded. Pass the
  authoritative current rent at the call site and add a test that fails if it is omitted again. This
  is a live correctness defect independent of RentCast.

Buildable now (app-plane): the schema extension, the draft mapping, the labels, the clamp repair, and
the signal. Build to the seam (live provider): none beyond S59. Owner dependency (the one flip): none
— this suite adds no Action Registry key and opens none.

**Open questions & assumptions.**

- _Open (owner):_ the threshold at which a rent counts as materially under market. The owner directed
  that the logic be built but did not state a number. Implemented as a single named constant with a
  **provisional** default of 10 percent below the provider point estimate, rendered with the actual
  percentage so the reader judges rather than trusts the threshold. This default is explicitly not a
  confirmed policy and is recorded as a `Q-` row for confirmation before the signal is relied on.
- _Open (owner, `Q-COMP-TREND-PRESENTATION`, raised under Q7):_ whether historical trend data is presented as a link, an attachment, or values
  in the email body. The provider block carries what is retrieved either way; only the rendering
  waits on this answer.
- _Assumption:_ the provider point estimate is the right comparison basis rather than the range
  midpoint, matching the existing median-based suggestion method.
- _Assumption:_ retaining `zillowLow` / `zillowHigh` as persisted key names is acceptable because they
  are operator-typed values and no client-facing string derives from the key name.

**Cross-product impacts.**

- `lib/lease-renewal/renewal-progress.ts` — `RenewalMarketBasis` gains the provider block;
  `normalizeMarketBasis` validates it.
- `lib/firestore/types.ts`, `lib/firestore/lease-renewal-progress.ts` — persisted shape.
- `lib/lease-renewal/owner-draft.ts` — truthful mapping; removal of the `"Zillow"` fallbacks.
- `components/lease-renewal/RenewalProgressControls.tsx` — submit the provider block; relabel typed
  fields; render the under-market signal.
- `lib/lease-renewal/rent-suggestion.ts`,
  `lib/firestore/lease-renewal-rent-suggestion-approvals.ts` — clamp repair.
- `lib/lease-renewal/market-links.ts` — unchanged, documented as a human convenience link.
- Depends on **S59**. Feeds **S62** (an owner-policy number is compared against a real market basis)
  and **S63** (the test set's number comparison needs a persisted provider figure to compare).
  Interacts with **S29** (`rent-suggestion-admin-gated.md`), whose Admin approval path is unchanged.

**Adversarial acceptance checks.**

- **AC-S60-1** — After a live lookup, `rangeLow`, `rangeHigh`, `pointEstimate`, and `compCount`
  survive a page reload on the persisted record. Before this suite all four are lost. _Verify:_
  `npm test -- lease-renewal-progress renewal-progress-route`.
- **AC-S60-2** — With a provider block present, the owner draft prints the provider's numbers with
  the provider's source label and retrieval date. _Verify:_ `npm test -- lease-renewal-owner-draft`.
- **AC-S60-3** — With operator-typed numbers and `compSource` set to a provider name, the draft never
  attributes the typed numbers to that provider. This is the exact current defect and must fail
  before the fix and pass after. _Verify:_ `npm test -- lease-renewal-owner-draft`.
- **AC-S60-4** — With no basis at all, the draft renders a `Needs Verification` marker that names no
  provider. The literal string `Zillow` appears nowhere in any generated owner draft. _Verify:_
  `npm test -- lease-renewal-owner-draft`.
- **AC-S60-5** — Operator-typed values and provider values coexist on one record; neither write
  clears the other. _Verify:_ `npm test -- lease-renewal-progress`.
- **AC-S60-6** — No operator-facing label reads "Zillow low" or "Zillow high". _Verify:_
  `npm test -- RenewalProgressControls`.
- **AC-S60-7** — The signal is a pure function of the configured threshold: given any threshold value,
  a rent below it renders an under-market signal showing the actual percentage, and a rent above it
  renders none. The test is parameterised over the threshold rather than pinned to the provisional
  10 percent, so confirming a different number is a constant change and not a test rewrite. _Verify:_
  `npm test -- comp-basis-and-market`.
- **AC-S60-8** — The under-market signal never appears in any client-facing draft body, owner or
  tenant. Deliberately rendering it into a draft turns the test red. _Verify:_
  `npm test -- lease-renewal-owner-draft renewal-notice-draft-route`.
- **AC-S60-9** — The under-market signal is computed only from a provider basis; an operator-only
  basis produces no signal. _Verify:_ `npm test -- comp-basis-and-market`.
- **AC-S60-10** — `resolveLeaseRentSuggestion` passes the authoritative current rent, and a comp
  median more than 15 percent from current rent is clamped on the live path. A call site that omits
  current rent fails the test. _Verify:_ `npm test -- rent-suggestion`.

Keep green: `tests/unit/rent-suggestion-approval-route.test.ts`,
`tests/unit/rent-suggestion-approval-plan.test.ts`, `tests/unit/renewal-comp-screenshot.test.ts`,
`feature-suite-spec-shape.test.mjs`.

**Forbidden actions / hard gates.** No autonomous client-facing send; generic non-workflow
`gmail.message.send` stays Registry-closed; no personal account in any auth path; no secret, token,
PII, or guessed endpoint in git; the S52 production cost ceiling stands; every live effect stays
one-attempt, idempotent, receipted, and reversible, with client-facing sends and system-of-record
writes human-confirmed. This suite must not put the under-market signal, or any statement about what
a property should rent for, into a client-facing draft. It must not let a provider label attach to
operator-typed numbers or the reverse. It must not fabricate a range when the provider refused. It
must not open or prepare any Action Registry key, and it must not weaken the S29 Admin approval that
governs a comp-derived suggested number entering a draft.

**Ordered prompt sequence.**

1. _Discovery:_ re-read `RenewalMarketBasis`, `normalizeMarketBasis`, `ownerDraftMarketFromBasis`,
   and the submit path in `RenewalProgressControls.tsx`; confirm the label-versus-value split.
2. _Build:_ extend the basis with the provider block and validate it.
3. _Build:_ persist the provider block from a lookup; keep operator values independent.
4. _Build:_ truthful owner-draft mapping; remove the `"Zillow"` fallbacks.
5. _Build:_ relabel operator-facing comp fields.
6. _Build:_ the internal under-market signal with its named threshold constant.
7. _Build:_ the clamp repair plus a test that fails when current rent is omitted.
8. _Verify:_ falsify by setting `compSource` to a provider name with only typed numbers present and
   observing AC-S60-3 fail before the fix and pass after.
9. _Gate:_ `format:check`, `lint`, `typecheck`, `npm test`, `test:firestore`,
   `verify:falsification`, `verify:context-freshness`, `verify:spec-traceability`, `npm run build`.
10. _Context update:_ `docs/facts.md` `F-` row citing AC-S60-1 through AC-S60-10; `Q-` rows for the
    under-market threshold and the trend presentation; update `docs/loop-state.md` and
    `docs/status.md`.

**Deletion/merge recommendation.** KEEP. This is the record of why the owner draft can be trusted to
name its own source. The disposable cycle packet `docs/temp/comp-persistence-and-under-market-signal-plan.md` is CREATED AT SLICE START, not by this spec.
