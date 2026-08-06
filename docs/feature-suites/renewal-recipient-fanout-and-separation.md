<!-- spec-shape: overhaul-v1 -->

# S61 — Renewal recipient fan-out and channel separation

> New 2026-08-06. Opened by the post-2026-08-05 program grant in `AGENTS.md`. Two client statements
> from the 2026-08-05 call drive it. Dan: "we never communicate to owners and tenants in the same
> thing so that they can see each other's contact info." Dan, on owners: "probably just all owners, I
> guess. I would think just all owners would be best." Owner direction (Q6): mirror the shipped
> tenant behavior on the owner channel. Amends **S24** (`communications-policy.md`).

**Goal.** A renewal notice reaches every person who is legally on the other side of it, and no
message ever puts an owner and a resident in each other's view. Today the tenant half is right and
the owner half is not: the tenant notice addresses the first tenant and copies the rest, while the
owner notice addresses exactly one owner. Separation is currently a convention held up by a code
comment rather than by anything that fails when it is broken.

**What it is / how it functions.** `resolveRenewalRecipient` in
`lib/lease-renewal/recipient-resolution.ts` is a discriminated union on `channel`. The tenant branch
calls `collectEmails`, takes the first authoritative address as `to` and every other distinct address
as `cc`, and attaches an index-aligned source pointer to each. The owner branch calls `findEmail`,
which returns on the **first** match and produces no `cc` at all. The docstring says so plainly: the
`cc` field is "Empty for a single-tenant lease and for the owner channel."

- **The resolver change alone does NOT fix the live path — this is the trap in this suite.**
  `ownerContainers` already enumerates `portfolio.owners[i]` and `property.owners[i]` per element, so
  swapping `findEmail` for `collectEmails` looks sufficient. It is not. The live owner draft never
  lets the resolver see that array: `app/api/lease-renewal/renewal-notice-draft/route.ts:151-154`
  resolves the owner through a separate property → portfolio → contact join and injects a single
  synthesized object, `return { ...view, owner: { email: owner.email } }`. Because `lease.owner` is
  searched before `portfolio.owners[i]`, that injected object wins and exactly one address is ever
  resolved. **Both layers must change together**, and any acceptance check that exercises only
  `recipient-resolution` will pass while the live behavior stays broken.
- **Reconcile the two owner paths and the contradiction between them.** `resolveLiveOwnerEmail`
  must return **all** authoritative owner contacts rather than a single top-`percentOwned` pick, and
  the route must inject the full set. There is also a documented contradiction to settle: the route
  comment and `lib/lease-renewal/live-owner-recipient.ts:4-5` both state that RentVine's
  `/leases/export` rows carry **no** owner email, while a live re-derivation on 2026-08-06 resolved
  the owner channel from `portfolio.owners[0].email` on every row scanned. Both cannot be current.
  The slice must determine which is true today — on the **full** portfolio, after S57, not on the
  default page — and then either delete the join in favour of the export field, or delete the stale
  comment and keep the join. Shipping a fan-out on top of an unresolved contradiction is how one
  owner silently keeps winning.
- **Ordering cannot use `percentOwned` — measured, not assumed.** A live read across the full
  portfolio on 2026-08-06 (305 leases, 95 portfolios) found that `portfolio.owners[]` entries on the
  export carry an **empty** `percentOwned`. Fifty portfolios have more than one owner, and **zero**
  have an equal-top `percentOwned` tie — because there are no positive values to tie on. So the
  greatest-`percentOwned` rule that `pickOwnerContactId` implements is not applicable on the export
  path at all, and `percentOwned` appears nowhere in `recipient-resolution.ts`.
  **Consequence:** the ordering rule must be something the data actually supports. The default taken
  is the portfolio's own owner order, which is stable across reads, with the first entry as `to` and
  the rest as `cc` — the same shape the tenant channel already uses. Any rule that depends on
  ownership percentage must first establish that the percentage exists on the path being used.
- **The tie refusal is real, but it is not the failure mode that will actually bite.**
  `pickOwnerContactId` returns null when two contacts tie on the greatest positive `percentOwned`, and
  it also returns null when there is no positive `percentOwned` at all. The 2026-08-06 live read shows
  the latter is the common case on the export path, not the former. So the risk is not "a 50/50
  portfolio refuses" — it is "**every** multi-owner portfolio refuses, for want of a field". The
  slice must establish which owner shape the join actually returns before relying on either rule, and
  must keep refusing rather than guessing when neither is available.
- **Separation becomes enforceable.** Add an assertion in the draft-composition path: the resolved
  recipient set for a channel must contain no address that also resolves as an authoritative address
  on the other channel for the same lease. A violation refuses the draft and reports why. This turns
  Dan's stated absolute into something that fails loudly instead of a comment that reads well.
- **No address is ever invented.** The existing bar is preserved unchanged: an address must come from
  the lease's own authoritative record, normalized and shape-checked; when none exists the channel
  returns `Needs Verification` and the draft refuses. Fan-out widens who is addressed, never how an
  address is obtained.

Buildable now (app-plane): all of the above. Build to the seam (live provider): none. Owner
dependency (the one flip): none. `gmail.renewal_notice.draft_create` is already
`production_allowed:true` and this suite changes what goes on its `to`/`cc` lines, not whether it may
run.

**Open questions & assumptions.**

- _Open (owner, `Q-OWNER-ORDERING`):_ what orders the owner recipients. The question was originally
  framed as tie-breaking on ownership share; the 2026-08-06 measurement showed there are no ownership
  shares on the export path, so the real question is which stable key decides `to` versus `cc`.
  Documented safe default applied: **the portfolio's own owner order**, first entry to `to` and the
  rest to `cc`, matching the tenant channel's shape. Refuse rather than guess when no authoritative
  address exists at all.
- _Open (owner, `Q-CHANNEL-SEPARATION-ASSERTION`):_ whether the structural owner-versus-tenant separation assertion is required.
  Documented safe default applied: **build it and refuse on violation**, because the client stated
  separation as an absolute and a refusal is reversible while a leaked contact is not. Recorded as a
  `Q-` row so the decision is visible rather than silent.
- _Answered 2026-08-06 (`F-MKD-PORTFOLIO-IDENTIFIED`):_ **no test-cohort lease is MKD-owned.** MKD is
  `portfolioID` 27; the four leases resolve to portfolios 84, 92, 92, and 95. So the MKD case does not
  gate S63, and the owner-ordering behavior will be exercised by ordinary multi-owner portfolios
  instead — of which the live export has fifty.
- _Assumption:_ every distinct authoritative owner address should be addressed rather than filtered
  by role. Per-owner contact-by-topic routing is deferred and recorded as future work; until it
  exists, "all owners" is the honest interpretation of Dan's answer.
- _Superseded 2026-08-06:_ the premise that MKD owners need no outreach at all, stated on the
  2026-08-05 call, is withdrawn by owner direction (Q5). MKD owner communication runs through the
  normal reviewed process and is included in the test set.

**Cross-product impacts.**

- `lib/lease-renewal/recipient-resolution.ts` — owner branch fan-out, ordering, source refs.
- `lib/lease-renewal/live-owner-recipient.ts` — shared ordering rule; the two owner paths reconciled.
- `lib/lease-renewal/execution/renewal-notice-draft-service.ts` and
  `app/api/lease-renewal/renewal-notice-draft/route.ts` — the separation assertion and its refusal.
- `docs/feature-suites/communications-policy.md` (S24) — amended recipient rule.
- `docs/client-asks-2026-07-29.md` §5 (D57) — the courtesy confirmation to Dan is updated: it
  currently describes tenant addressing only and must also describe the owner fan-out.
- `docs/products/rentvine-live-field-map-2026-07-22.md` — its claim that the owner channel resolves
  0/25 is stale; the owner channel resolves live as of 2026-08-06.
- Depends on **S57** for a portfolio-wide measurement of how many leases actually carry more than one
  owner address. Feeds **S62** and **S63**.

**Adversarial acceptance checks.**

- **AC-S61-1** — A lease with multiple authoritative owner addresses produces `to` plus a `cc` entry
  for every other distinct owner address, each with its own source pointer, **on the live draft
  route** and not merely in the resolver. Before this suite the `cc` list is empty. _Verify:_
  `npm test -- renewal-notice-draft-route recipient-resolution`; a resolver-only test passing while
  the route still yields one address is a failure of this AC.
- **AC-S61-1b** — `resolveLiveOwnerEmail` returns every authoritative owner contact for a
  multi-owner portfolio, and the draft route injects the full set rather than a single synthesized
  `owner: { email }`. _Verify:_ `npm test -- live-owner-recipient renewal-notice-draft-route`.
- **AC-S61-1c** — The contradiction over whether `/leases/export` carries an owner email is resolved
  in writing against the full portfolio: either the join is removed in favour of the export field, or
  the stale source comments are corrected. No file states both. _Verify:_
  `npm run discover:rentvine-fields -- --live`, recorded as a `docs/facts.md` row.
- **AC-S61-2** — Owner `cc` entries are deduplicated: the same address listed twice on the portfolio
  is addressed once. _Verify:_ `npm test -- recipient-resolution`.
- **AC-S61-3** — A single-owner lease produces exactly one recipient and an empty `cc`, unchanged
  from today. _Verify:_ `npm test -- recipient-resolution`.
- **AC-S61-4** — The `to` slot is the owner with the greatest positive `percentOwned`; the rest are
  `cc` in a deterministic order, evaluated on the path that actually carries `percentOwned`. Two runs
  over the same lease produce the identical recipient list. _Verify:_
  `npm test -- live-owner-recipient renewal-notice-draft-route`.
- **AC-S61-5** — An equal-`percentOwned` tie refuses the owner draft with an explicit reason and
  addresses nobody. It never picks arbitrarily. _Verify:_ `npm test -- live-owner-recipient`.
- **AC-S61-6** — A lease with no authoritative owner address returns `Needs Verification` and the
  draft refuses. No address is synthesized from a name, a portfolio, or a domain. _Verify:_
  `npm test -- recipient-resolution renewal-notice-draft-route`.
- **AC-S61-7** — Composing a tenant draft whose recipient set contains an address that also resolves
  as an authoritative owner address for that lease refuses and reports the collision, and the reverse
  case refuses too. Deliberately crafting such a lease turns the test red without the assertion.
  _Verify:_ `npm test -- renewal-notice-draft-route`.
- **AC-S61-8** — No generated owner draft contains any tenant address and no generated tenant draft
  contains any owner address, across a fixture set including multi-owner and multi-tenant leases.
  _Verify:_ `npm test -- lease-renewal-owner-draft renewal-notice-draft-route`.
- **AC-S61-9** — Portfolio-wide owner coverage is measured after S57 and recorded: how many leases
  carry one owner address, more than one, and none. _Verify:_
  `npm run discover:rentvine-fields -- --live`, recorded as a `docs/facts.md` row.

Keep green: `tests/unit/renewal-notice-draft-route.test.ts`,
`tests/unit/lease-renewal-owner-draft.test.ts`, `feature-suite-spec-shape.test.mjs`.

**Forbidden actions / hard gates.** No autonomous client-facing send; every send stays
human-initiated and exact-confirmed; renewal and maintenance notice initiation stays draft-only under
D33 and this suite does not touch that; generic non-workflow `gmail.message.send` stays
Registry-closed; no personal account in any auth path; no secret, token, PII, or guessed endpoint in
git; the S52 production cost ceiling stands. No address may be invented, inferred from a name or a
domain, carried over from another lease, or taken from anywhere but the lease's own authoritative
record. Widening recipients must not widen send authority: this suite changes who a draft is
addressed to, never who may send it. An owner address must never appear on a tenant draft or the
reverse, and a tie must refuse rather than guess.

**Ordered prompt sequence.**

1. _Discovery:_ re-read the tenant and owner branches of `resolveRenewalRecipient` and both owner
   resolution paths; confirm the `findEmail` versus `collectEmails` asymmetry.
2. _Understanding:_ confirm live owner coverage and multi-owner frequency after S57 lands.
3. _Build:_ owner fan-out through `collectEmails` with per-element source refs.
4. _Build:_ the shared ordering rule; reconcile the two owner paths.
5. _Build:_ the cross-channel separation assertion and its refusal.
6. _Verify:_ falsify with a crafted lease whose owner and tenant addresses collide, observing the
   refusal, then remove the collision and observe a normal draft.
7. _Gate:_ `format:check`, `lint`, `typecheck`, `npm test`, `test:e2e:core`,
   `verify:falsification`, `verify:context-freshness`, `verify:spec-traceability`, `npm run build`.
8. _Owner:_ send the updated D57 confirmation to Dan describing both tenant and owner addressing.
9. _Context update:_ amend S24; correct the stale field-map claim; `docs/facts.md` `F-` row citing
   AC-S61-1 through AC-S61-9 plus `Q-` rows for the tie and the separation assertion; update
   `docs/loop-state.md` and `docs/status.md`.

**Deletion/merge recommendation.** KEEP as its own file rather than folding into S24. S24 owns the
communications policy; this file owns the recipient resolution contract and its refusals. Disposable
packet: `docs/temp/renewal-recipient-fanout-and-separation-plan.md`.
