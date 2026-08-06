<!-- spec-shape: overhaul-v1 -->

# S62 — Owner-policy renewal pricing rules

> New 2026-08-06. Opened by the post-2026-08-05 program grant in `AGENTS.md`. Dan, 2026-08-05: "if
> it's owned by what we call MKD... they just want to go 3.5% every renewal until told otherwise."
> Owner direction (Q4): produce an **Admin-approvable suggestion** labeled as an owner-policy rule,
> keyed on the **RentVine portfolio id**, and never set the offered rent without approval.

**Goal.** A standing pricing agreement with an owner stops living in one person's head and starts
being something the app applies consistently and visibly. When a lease belongs to a portfolio with a
standing rule, the desk proposes the number that rule implies, says which rule produced it, and still
requires an Admin to approve it before it can reach a draft. Nothing about it removes a human from
the decision.

**What it is / how it functions.** Nothing like this exists today. The string `MKD` appears in **zero
source files**. The only rule-scoping machinery in the repository is
`lib/lease-renewal/notice-rules.ts`, a real most-specific-wins engine — but its scopes are global,
property, and lease with **no owner or portfolio scope**, its values are notice-timing only with no
percentage or rent field, and the live desk does not consult it at all.

- **Where the rule lives now, and why that is not enough.** The operational MKD rule is captured live
  as free text inside one Sheet column, `Have we confirmed pricing with the owner?`, with cell values
  like `"yes, MKD, 3.5% increase"`. The connector reads it as `owner_pricing_confirmed`, the
  normalizer collapses it to a boolean and stashes the sentence in an unread `notes` array, and the
  field is absent from the reconcilable field specs, so nothing ever surfaces it. The app reads the
  rule today and throws it away. This suite does **not** parse that free text — a pricing rule
  inferred from prose is exactly the kind of guess the governance forbids. The Sheet text may be
  displayed as corroboration; it is never the source of the number.
- **A real rule store, keyed on the portfolio.** A new Admin-managed Firestore collection holds
  owner-policy rules: portfolio id, policy kind, value, effective-from date, a plain-English note,
  and the Admin who created it, with an append-only change record. The key is the RentVine
  `portfolioID` because it is a stable identifier already present on every lease view, unlike an
  owner name which is free text and unlike the Sheet token which is prose.
- **One policy kind to start.** `flat_percent_increase` — apply a fixed percentage to the
  authoritative current rent at every renewal until changed. The store is shaped so a second kind can
  be added later without a migration, but only this one is implemented, because it is the only one
  the client has actually described.
- **It produces a suggestion, never an offer.** The number enters through the **same** Admin approval
  control plane that S29 already built: the value is recomputed **server-side** at decision time and
  never accepted from the client, a changed basis makes a prior approval stale by construction, and
  the approval is bound to an exact value. `RentSuggestion.method` widens from its current
  single-value `"comp_median"` union to include an owner-policy method, and the label the operator
  and the draft see names the rule, for example "Owner policy: +3.5% (MKD)". The existing
  `decideRentSuggestionApproval` refuses when the record is not in the `suggested` state; a
  policy-derived suggestion must enter that same state so the refusal semantics are unchanged rather
  than special-cased.
- **Precedence is explicit and both numbers stay visible.** When a portfolio rule and a comp median
  both exist, the rule is the proposed number and the comp median is rendered beside it as context.
  An operator who sees a modest rule-derived increase beside a materially higher comp median is given the information
  Dan described wanting on the call, not having it hidden. Neither number is silently discarded.
- **It never writes the offered rent.** `offeredRent` remains operator-entered. A rule that moved it
  directly would land outside the S29 carve-out and inside the `owner_money` hard exclusion, which
  this suite preserves intact.

**Owner communication is unchanged and is explicitly not skipped.** On the 2026-08-05 call it was
suggested that MKD owners need no outreach at all. **That premise is withdrawn by owner direction
(Q5) on 2026-08-06:** MKD owner recipients are emailed through the normal reviewed process and are
included in the test set. This suite therefore adds **no** outreach-skip path, no auto-recorded owner
decision, and no skipped-outreach evidence field. Any spec, note, or comment implying otherwise is
corrected as part of this slice.

Buildable now (app-plane): the rule store, the Admin surface, the resolver, the method widening, the
precedence rendering. Build to the seam (live provider): none. Owner dependency (the one flip): the
**MKD portfolio id and its ownership structure**, which only the client can supply (`Q-MKD-PORTFOLIO-ID`). Everything
else is built and tested against fixtures; a rule cannot be created without a real portfolio id.

**Open questions & assumptions.**

- _Client-owned (`Q-MKD-PORTFOLIO-ID`):_ which RentVine portfolio id is MKD, and whether its owners hold equal
  percentages. The second half matters beyond this suite: an equal tie refuses the owner draft under
  **S61**, and MKD owners now receive outreach, so a tie would stop an MKD renewal during the test
  set.
- _Client-owned:_ whether "3.5% every renewal until told otherwise" applies to every property in the
  portfolio without exception, or has carve-outs. Default taken: portfolio-wide with a per-lease
  override slot available but unused.
- _Assumption:_ the percentage applies to the authoritative current rent from RentVine, not to the
  Sheet's listed rent. These differ in the live data — lease 297 reads a zero current rent in
  RentVine against a non-zero Sheet figure — so the rule must refuse rather than compute from a zero
  or missing base.
- _Assumption:_ a rule is Admin-managed in-app rather than seeded in code, so a change does not
  require a deploy.
- _Open:_ whether an expired or future-dated rule should render at all. Default taken: only rules
  whose effective-from date has passed are applied, and a future-dated rule is visible to Admins only.

**Cross-product impacts.**

- New Firestore collection plus its append-only change record; `firestore.rules` declarations are a
  **D12 protected path** and are prepared and surfaced rather than pushed.
- `lib/lease-renewal/rent-suggestion.ts` — `method` union widened; a pure policy computation added
  beside `computeRentSuggestion`.
- `lib/firestore/lease-renewal-rent-suggestion-approvals.ts` — the policy resolver as a sibling of
  `resolveLeaseRentSuggestion`, sharing the server-side recompute and stale-on-change binding.
- `components/lease-renewal/RenewalProgressControls.tsx` and the rent-suggestion approval component —
  rule label, precedence rendering, both numbers visible.
- A new Admin surface for managing rules, following the `/admin/users` precedent: Admin-only, a
  required plain-English reason, and an append-only audit.
- `lib/lease-renewal/live-desk.ts` — expose `portfolioID` on the lease view if it is not already
  carried through to the desk.
- Depends on **S60** for a real comp basis to render beside the rule. Interacts with **S29**
  (`rent-suggestion-admin-gated.md`), whose approval semantics are reused unchanged, and with **S61**
  (the tie).

**Adversarial acceptance checks.**

- **AC-S62-1** — A lease whose portfolio has an active `flat_percent_increase` rule produces a
  suggestion equal to the authoritative current rent increased by the rule percentage, rounded by the
  existing convention. _Verify:_ `npm test -- rent-suggestion`.
- **AC-S62-2** — The suggestion is labeled with the rule that produced it, and the label names the
  policy rather than reading as a comp-derived number. _Verify:_
  `npm test -- rent-suggestion-approval-component`.
- **AC-S62-3** — A policy-derived number requires the same Admin approval as a comp-derived one, is
  recomputed server-side at decision time, and is never accepted from the client. _Verify:_
  `npm test -- rent-suggestion-approval-route rent-suggestion-approval-plan`.
- **AC-S62-4** — Changing the rule after an approval makes the prior approval stale, exactly as a
  changed comp basis does. _Verify:_ `npm test -- rent-suggestion-approval-plan`.
- **AC-S62-5** — A lease whose authoritative current rent is zero, missing, or non-numeric produces
  **no** policy suggestion and an explicit refusal reason. It never computes a percentage of zero.
  _Verify:_ `npm test -- rent-suggestion`.
- **AC-S62-6** — With both a rule and a comp median present, the rule is the proposed number and the
  comp median is still rendered. Neither is hidden. _Verify:_
  `npm test -- rent-suggestion-approval-component`.
- **AC-S62-7** — No code path lets a rule write `offeredRent`. Deliberately wiring one turns an
  architecture test red. _Verify:_ `npm test -- offered-rent-writer-boundary lease-renewal-progress`.
- **AC-S62-8** — Rule creation and modification are Admin-only, require a reason, and append an audit
  record. A non-Admin attempt is refused. _Verify:_ `npm test -- owner-policy-rules`.
- **AC-S62-9** — No outreach-skip path exists: there is no code by which an owner draft is suppressed
  or an owner decision auto-recorded because a portfolio rule exists. _Verify:_
  `npm test -- mkd-outreach-skip-sentinel renewal-notice-draft-route`.
- **AC-S62-10** — The Sheet's free-text pricing column is never parsed into a number or a percentage.
  _Verify:_ `npm test -- comp-basis-and-market`.
- **AC-S62-11** — A rule cannot be created without a portfolio id that resolves against a live lease
  view. A rule keyed on a free-text owner name is refused. _Verify:_
  `npm test -- owner-policy-rules`.

Keep green: `tests/unit/rent-suggestion.test.ts`, `tests/unit/rent-suggestion-approval-route.test.ts`,
`tests/unit/action-registry-schema.test.ts`, `feature-suite-spec-shape.test.mjs`.

**Forbidden actions / hard gates.** No autonomous client-facing send; every send stays
human-initiated and exact-confirmed; generic non-workflow `gmail.message.send` stays Registry-closed;
no personal account in any auth path; no secret, token, PII, or guessed endpoint in git; the S52
production cost ceiling stands; every live effect stays one-attempt, idempotent, receipted, and
reversible. A rule must never set the offered rent, never auto-record an owner decision, never
suppress an owner draft, and never enter a client-facing draft without the S29 per-number Admin
approval — the `owner_money` exclusion survives this suite intact. No rule may be created from parsed
prose, from an owner name, or from any identifier the client has not confirmed. `firestore.rules`
changes are D12 protected and are prepared and surfaced, never pushed under the standing grant.

**Ordered prompt sequence.**

1. _Discovery:_ confirm `portfolioID` reaches the lease view and the desk; confirm the current
   `method` union and the approval FSM's state guard.
2. _Understanding:_ confirm the Sheet pricing column's normalization discards the rule text, and
   record that this suite does not change that.
3. _Build:_ the rule store, its append-only audit, and the Admin surface with a required reason.
4. _Build:_ the pure policy computation and the `method` widening.
5. _Build:_ the resolver sibling, sharing server-side recompute and stale-on-change binding.
6. _Build:_ precedence rendering with both numbers visible.
7. _Build:_ architecture sentinels for no-offer-write and no-outreach-skip.
8. _Gate:_ prepare the `firestore.rules` declarations as an isolated D12 patch and surface it.
9. _Owner:_ obtain the MKD portfolio id and ownership structure (`Q-MKD-PORTFOLIO-ID`).
10. _Verify:_ full gate including `test:firestore`; falsify by wiring a rule to `offeredRent` and
    observing AC-S62-7 fail, then removing it.
11. _Context update:_ `docs/facts.md` `F-` row citing AC-S62-1 through AC-S62-11, `Q-` rows for the
    client-owned items, and correction of any note implying MKD outreach is skipped; update
    `docs/loop-state.md` and `docs/status.md`.

**Deletion/merge recommendation.** KEEP. This is the first per-owner policy mechanism in the product
and the record of why it suggests rather than decides. The disposable cycle packet `docs/temp/owner-policy-renewal-pricing-plan.md` is CREATED AT SLICE START, not by this spec.
