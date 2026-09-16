<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-operator-hub-v1 -->

# S118 — Five-mile market comparisons with reviewed defaults and source links

> Status: IMPLEMENTED at `0223bdb1` (integrated on main); serialized release not yet performed. verify.sh, core E2E
> and both compiled renewal browser checks passed on the integrated head. Human verdict: NOT RUN — no human observer.

**Repository:** `josiahH-cf/pmiKCkb_and_ownerRouter` (`pmi-kc-kb`).  
**Canonical file:** `docs/feature-suites/renewal-market-defaults-and-sourced-comparisons.md`.  
**Authoring baseline:** `e903b68aa4efa2462f565f225d562924a57ccf8b`; re-read current main before implementation.  
**Requested execution order:** S114 → S115 → S116 → S117 → S118 → S119 → S120. This is feature 5 of 7 in this request, not the earlier September 14 batch.

**Goal.**

Make market preparation start from the lease’s actual known data, use the accepted editable rent-range defaults and five-mile search radius, and carry reviewed real comparison evidence into owner preparation and the operating Sheet without inventing a market result or approved rent.

**Current state / intended end state.**

`lib/lease-renewal/market-comp-query-basis.ts` currently defines a two-mile default, 15 requested comps and subject-attribute lookup. It derives the address, unit bedrooms/bathrooms/size and contractual rent from RentVine and explicitly omits an unmapped property type. `providers/rentcast-market-comp-provider.ts` uses RentCast’s own AVM rent/range, preserves comparable order/correlation, and returns distinct failure states without fabricated numbers. `RenewalProgressControls.tsx` already supports an operator-selected radius, and `RenewalCompPreparation.tsx` retains current-cycle observations before owner outreach.

The user requests actual filled values rather than unrelated number examples/placeholders, a five-mile default, editable comparison preparation, useful evidence/search links and downstream reuse. Accepted Q1A and Q2A below resolve the gradient, Sheet meaning and “always return a value” boundary. The captured low/high/recommendation examples are not a pricing policy or real default to apply to all leases.

**Actors and entry conditions.**

Existing authorized Renewals operators prepare and deliberately request comparisons. Preserve the current RentCast action key, quota/cache/allowance controls and pricing-approval roles. A prepared/default/returned estimate is not explicit owner approval. Only the existing authorized confirmation can update the Sheet; source evidence and current-cycle ownership are required.

**What it is / how it functions.**

### R118.1 — Accepted Q1A: exact editable starting rule

Let `r` be the current positive, usable source-backed contractual base rent in dollars, not lease total, deposit, unit-listed rent or a future offer. A missing, stale, conflicting or unresolved basis must remain labeled and cannot yield an invented authoritative default. The accepted starting percentage is:

```text
w(r) = 0.20                                      when r <= 750
w(r) = 0.20 - 0.05 × (r - 750) / 1750            when 750 < r < 2500
w(r) = 0.15                                      when r >= 2500
starting low  = r × (1 - w(r)), rounded to cents
starting high = r × (1 + w(r)), rounded to cents
```

Thus $750 yields $600–$900, $1,625 yields $1,340.63–$1,909.38 using ordinary half-up cents rounding, and $2,500 yields $2,125–$2,875. These are mathematical examples of the owner-accepted rule, not customer records. Below/above the two endpoints the percentage is clamped as shown; never let it continue declining or widen beyond the approved rule.

Fill the editable low/high fields with these actual values when no deliberate saved preparation supersedes them. Label them **Starting range from current rent — not market evidence**, with their source/basis available. The band is a preparation aid, not a filter on actual comparable listings, not an instruction to increase rent, and not a substitute for RentCast’s returned range. Do not add min-/max-rent API filtering or rewrite provider comps to fit it.

### R118.2 — Five-mile deliberate lookup from real subject data

For a new untouched lookup use **5 miles**, changing the current default of 2. Keep the existing explicit radius input and one deliberate lookup action; the operator may change the radius and request another lookup. A saved historical observation keeps its actual radius, time and result. Do not rewrite historical 2-mile evidence to 5 miles or silently replace an intentional override when refreshing; distinguish a retained observation’s query from the default for a new search.

Use the existing server-resolved full lease/unit address and source-backed bedrooms, full/half bathrooms and size. Preserve supported zero-bedroom studio handling and half bathrooms. Include only an established property-type mapping; the current unapproved `propertyTypeID` mapping remains a named omission, not a guessed type. Do not request the same known attributes manually or substitute a building-wide area for a unit. Keep the sent/omitted attribution accessible in help/evidence.

Preserve the existing endpoint, provider ordering/correlation, minimum usable-comp rule, requested count of 15, subject-attribute lookup, cache identity, retained observations, typed errors, quota/counter and allowance stop. Apply radius to the actual request and cache identity, not only the label. Opening a page, accepting defaults, typing, navigation or saving preparation does not make a paid lookup. No automatic paid retries, radius escalation, subscription upgrade or quota increase is authorized.

### R118.3 — Successful result, reviewed recommendation and Sheet meaning

After a usable deliberate lookup, default untouched preparation fields to RentCast’s returned low/high range and initialize the **PMI recommended monthly rent** from its returned point estimate. Preserve deliberate user edits, including edits made while a request is in flight; show the new evidence without silently replacing them. The saved provider observation remains unmodified, and any staff override carries its real reviewed source. Do not retain a misleading “staff manual” label on a provider-derived figure.

Keep the estimate, provider range, reviewed PMI recommendation, current base rent and owner-approved offered rent distinct. Preserve the existing Admin approval requirement for provider-derived suggestions before their permitted draft use; populating `pmiNumber` must not bypass it. Source/retrieval/query information accompanies the selected current-cycle observation, and comparison evidence is reused by the owner message without re-entry.

The accepted **single figure for the existing Sheet `Market value` / `market_value` field is the reviewed PMI recommendation**. The low/high range remains app comparison evidence. Save/review prepares the existing typed Sheet update for that field; it does not perform a source write. Preview the current and proposed value, source and exact matched target; retain the normal Admin confirmation, claim, receipt/readback and separate correction. Do not add new range columns or overwrite `current_rent`/owner-approved rent. An unreviewed calculated fallback must not be silently stored as verified market value.

### R118.4 — Accepted Q2A: useful but honest failure/fallback

When no usable current result exists, retain previous sourced observations with their actual age/status and retain a usable starting range from R118.1. Display the actual lookup outcome—such as insufficient comparable evidence, timeout, refusal, missing source or exhausted allowance—rather than turning all failures into “no comps” or silently erasing reviewed work. When even the baseline rent is missing/unresolved, identify that input instead of making up a number. The acceptance is useful continuation, not a guarantee that RentCast will always return a valuation.

For the existing comparison-based owner message, **required sourced range and actual reviewed comps or a reviewed attachment still gate final body copy and Gmail drafting**. A starting range alone satisfies neither evidence requirement. Q2B’s no-comparison final owner message was not selected; do not silently omit the necessary comparison while retaining claims about similar available units. Truly optional content is omitted, and unrelated preparation/manual work remains available. Make the comparison area’s “optional” wording clear about this distinction: comparison work is not compulsory for every unrelated workflow action, but this particular comparison-based message requires its evidence. S120 owns the final-body-copy gate and field-specific missing-input navigation.

### R118.5 — Stable source/report/search links without fake proof

Use the provider’s documented dynamic property-report route `https://rentcast.io/s/p` with the source-resolved, correctly encoded full `address`. Map supported known subject values to documented `bedrooms`, `bathrooms` and `area`; map the selected radius to `radius` when supported. Only use `type` from an established mapping. Never clamp a source attribute to a different property just to fit a public-link parameter. Omit unsupported optional values and show the difference rather than inventing them. This link opens the actual property report/search, not the RentCast homepage or the same app page, and it remains available when the API lookup fails but the subject address is usable.

For existing area-trend evidence, the documented market-report destination is `https://rentcast.io/s/m` with the exact five-digit `zip`. A report link does not fetch its results, enroll an account or buy a plan. Public report settings/access may depend on the viewer’s RentCast subscription and can differ from the saved API result. In particular, the property report’s radius override is a Pro feature and market reports require Pro. Do not add a paid plan as an app feature prerequisite, claim website/API result equality, or append unsupported API query parameters to a public link.

Retain the exact API observation/query/time in existing app evidence and label the external action as opening the property/market report, not an immutable receipt of the old result. Use real provider-returned comp/report links when supplied and verified; do not invent individual listing IDs/addresses that the current projection omits. Preserve any available real comp link when propagating the observation into owner copy. Never expose API credentials, private owner/tenant contacts or internal execution tokens in URLs; rendering a link must not auto-trigger a provider request.

**External source contract, checked 2026-09-15:** the official [rent-estimate endpoint](https://developers.rentcast.io/reference/rent-estimate-long-term), [valuation/query and website differences](https://developers.rentcast.io/reference/property-valuation), [property-report links](https://help.rentcast.io/en/articles/5535811-creating-links-to-rentcast-property-reports) and [market-report links](https://help.rentcast.io/en/articles/5535828-creating-links-to-rentcast-market-reports) establish these endpoint/link limitations. The gradient and five-mile product default come from the owner, not the provider. Recheck a changed provider contract during implementation without importing its unrelated pricing recommendations.

**In scope / out of scope.**

Own comparison defaults, deliberate query behavior, retained evidence, reviewed PMI/Sheet value mapping and relevant RentCast destinations. Do not replace RentCast’s model, filter actual comps by the starting band, invent market data, automate paid calls, change budgets/freshness, introduce new market providers or add an autonomous pricing workflow.

**Open questions & assumptions.**

Q1A and Q2A are fully incorporated above: 20% through $750 tapering linearly to 15% at $2,500, then clamped; a starting band rather than a comp filter; provider defaults without overwriting edits; the reviewed PMI recommendation for Sheet market value; retained honest fallback; and required actual comparison evidence for this owner message. No unresolved formula/output decision remains.

**Cross-product impacts.**

Owning code: `lib/lease-renewal/market-comp-query-basis.ts`, `market-comp-provider.ts`, `providers/rentcast-market-comp-provider.ts`, `rentcast-quota.ts`, `market-observation.ts`, `workspace-state.ts`, `workspace-sheet-sync.ts`, `owner-draft.ts`, `current-renewal-message.ts`; `app/api/lease-renewal/market-comps/route.ts`; `components/lease-renewal/RenewalCompPreparation.tsx`, `RenewalProgressControls.tsx`, `RentSuggestionApproval.tsx` and relevant destination/help consumers.

Existing contracts: S113 F3, `docs/products/lease-renewal-agent.md`, `docs/products/lease-renewal-spreadsheet-map.md`, current RentCast cost/source constraints, and the operator guide. Update the documented default and `market_value` semantics when implemented, without relabeling historical observations or altering unrelated source fields.

**Authority and evidence map.**

| Source                                                                                                                               | Classification                                               | Application here                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`; current committed code and actual readbacks; `docs/facts.md`                                                            | Governing repository boundaries and implementation evidence  | Re-establish current truth before implementation. The earlier September 14 features and S113 are the baseline, not work to repeat. Older contradictory “candidate-only” prose does not override current code and facts.                              |
| The owner's September 15 renewal notes, transcript, summary, mindmap and supplied 19-page application capture                        | Requested product intent and reported behavior               | The requirements below incorporate the relevant details. “Rent volume” is RentVine; the spoken “Excel” is the configured Google operating Sheet. These private source materials need not be imported or available in an implementation conversation. |
| Owner acceptance of Q1A, Q2A and Q3A                                                                                                 | Resolved specification decisions                             | Where relevant, this file states the complete accepted rule. Acceptance was not a live-write, integration-activation or send authorization.                                                                                                          |
| `docs/autonomous-agent-runner.md`, `docs/environment-handoff.md`, `docs/feature-suites/TEMPLATE.md`, `docs/feature-suites/README.md` | Existing implementation, specification and release contracts | Use the existing complete loop below. No new release process, extra independent review gate or blanket PR requirement is introduced.                                                                                                                 |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S118-1** — A deterministic owner-approved starting rule consumes usable contractual rent and remains separate from the provider observation, reviewed recommendation and approved terms.
- **ARCH-S118-2** — One existing source-resolved, operator-triggered query/observation path carries actual radius/attributes, cache/quota identity, evidence and errors without silent overwrite or automatic requests.
- **ARCH-S118-3** — Reviewed preparation supplies owner evidence and the exact typed Sheet market-value proposal; source/report links remain truthful navigation, not returned-result proof.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S118-1** — Relevant lease-derived starting values and 5 miles are filled, editable and labeled; no unrelated placeholder is passed off as a value.
- **BEH-S118-2** — Usable results update untouched defaults, preserve edits and retain real provider evidence; failures retain useful work and explain the exact missing source/action.
- **BEH-S118-3** — The reviewed recommendation can prepare the correct Sheet field, and the owner message receives sourced evidence without treating a default or pending update as approval.
- **BEH-S118-4** — The operator opens a correctly attributed source report/search on success or failure without a homepage/self-loop, leaked credentials or a claim of immutable website/API equality.

**Human litmus outcome.**

### Start a comparison with relevant values and carry the reviewed result forward

**If this was built correctly:** The operator sees a labeled rent-based starting band and a five-mile search, runs a comparison and reviews the actual results. Deliberate edits stay intact. The reviewed recommendation is the value proposed for the Sheet’s Market value, while actual comps populate owner preparation. A failed lookup leaves useful retained work and a real report link, not invented market evidence or an enabled incomplete final email.

The implementation runner records the model verdict with actual evidence. Record `Human verdict: NOT RUN — no human observer` when no observer is present; do not invent human acceptance or add it as a release gate.

**Requirement-to-outcome traceability.**

| Requirement                                               | Architecture             | Behavior / human litmus               | Evidence / falsification                                                                           |
| --------------------------------------------------------- | ------------------------ | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| R118.1 exact gradient and evidence distinction            | ARCH-S118-1              | BEH-S118-1; start/retain/carry result | Endpoint, midpoint, rounding, invalid/missing base and no comp filtering; AC-S118-1.               |
| R118.2 five-mile deliberate source-resolved lookup        | ARCH-S118-2              | BEH-S118-1, BEH-S118-2                | Actual sent radius/cache, studio/half baths/omissions and zero auto calls; AC-S118-2.              |
| R118.3 defaults, review, override and Sheet figure        | ARCH-S118-3              | BEH-S118-2, BEH-S118-3                | In-flight edits retained, provenance/approval preserved, exact `market_value` proposal; AC-S118-3. |
| R118.4 honest failure and Q2A message boundary            | ARCH-S118-2, ARCH-S118-3 | BEH-S118-2, BEH-S118-3                | Insufficient/error/quota/missing baseline and actual-evidence readiness; AC-S118-4.                |
| R118.5 real source/report links with truthful limitations | ARCH-S118-3              | BEH-S118-4                            | Correct encoded subject/query, absent optional data and no fabricated link proof; AC-S118-5.       |

**Preservation set.**

Preserve `tests/unit/market-comp-query-basis.test.ts`, `tests/unit/rentcast-market-comp-provider.test.ts`, existing quota/cache/observation and preparation tests, current-suggestion approval checks, owner-message evidence and Sheet execution tests. Update only the intentionally changed default assertions. Keep current provider failures, minimum-comp rule, ordering/correlation and cost/refusal behavior; do not make a paid request to prove the specification.

**Adversarial acceptance checks.**

- **AC-S118-1** — R118.1 / ARCH-S118-1 / BEH-S118-1: validate below $750, both endpoints, the $1,625 midpoint and above $2,500 with cents rounding. Missing/invalid/unresolved contractual rent creates no authoritative band. Provider comps/range remain unfiltered/unmodified.
- **AC-S118-2** — R118.2 / ARCH-S118-2 / BEH-S118-1,2: a new request sends 5 miles, the explicit override changes the actual request/cache basis, and historical queries keep their real radius. Real unit attributes/omissions remain accurate; page opening and field changes spend no lookup.
- **AC-S118-3** — R118.3 / ARCH-S118-3 / BEH-S118-2,3: successful results fill only untouched fields; a late result cannot overwrite edits. Provider provenance and existing suggestion approval survive auto-fill. Only reviewed PMI rent prepares `market_value`; no current-rent overwrite or unconfirmed Sheet effect occurs.
- **AC-S118-4** — R118.4 / ARCH-S118-2 / BEH-S118-2,3: insufficient comps, timeout, refusal, quota stop and missing baseline preserve actual retained work and distinct errors. A calculated fallback cannot satisfy the comparison-based final-message evidence or masquerade as verified Sheet market value.
- **AC-S118-5** — R118.5 / ARCH-S118-3 / BEH-S118-4: build and inspect actual property/zip report destinations from verified source inputs, with correct encoding/known parameters and no secrets. Missing address is explicit. Provider website access/default differences are not hidden or treated as a failed API receipt.

**Forbidden actions / hard gates.**

Preserve managed identity, Renewals Space and role checks; exact Action Registry authority; the Production + Live boundary; and the distinction between source facts, staff reports and provider-verified effects. Never add autonomous/bulk/model-triggered writes or client sends. Gmail initiation ends in an explicitly confirmed unsent draft; a person sends. A link, a saved fact, a chosen status or a checked business decision is not a provider-effect receipt.

Do not widen action keys, change protected paths without their separately required authority, manufacture customer values, use test data in production, rerun completed provider proofs, or add new accounts, dependencies, services, background processes or billing headroom. Preserve `firestore.rules`, `lib/integrations/action-gate.ts`, `lib/auth/**`, action-seed activation flags, budget guards and `scripts/auth/**` under the router's protected-path rules. Customer values, source exports, message bodies, credentials and raw live evidence remain outside Git. Use deterministic synthetic data only in automated tests.

**Dependencies / sequencing.**

Begin only after S117 completes its applicable release. Consume the current master/source facts, exact Sheet targets and typed proposal path. S120 consumes this feature’s retained observation, reviewed preparation, real links and Q2A readiness distinction; the specification embeds that contract so no earlier chat is needed. This feature does not wait for Dotloop, tenant resource URLs or a new paid provider subscription.

**Standalone delivery contract.**

**Deliverable now:** the complete deterministic default/query/preparation/link behavior, reviewed Sheet mapping and honest fallback with its own release. **Consumes, but does not assume:** usable actual lease source data and current provider/configuration allowance. **Externally blocked effect:** a per-use unavailable RentCast result, missing source/Sheet mapping or paid website access; retain explicit source/absence states and do not fabricate success. **Produces for downstream suites:** correctly attributed current-cycle comparison preparation, reviewed recommendation, stable report destinations and explicit message-evidence readiness.

**Verification and delivery contract.**

This is a future implementation handoff. Authoring or importing this Markdown is not implementation or release completion.

1. **Re-ground from a fresh context.** Read `AGENTS.md` and `docs/README.md`, then current `docs/facts.md`, `docs/loop-state.md`, `docs/open-blockers.md`, `docs/plan.md`, this file, the relevant owning contracts listed here, and `docs/environment-handoff.md`. Inspect the actual checkout, diff, current main, relevant code and read-only application state; preserve unrelated/user-owned changes. On the approved implementation host run `npm run auth:ensure` using the existing approved identity/store. A human authentication challenge pauses only its dependent phase; never substitute an identity or request secrets. Do not reuse a preceding conversation's source snapshot, lease state, release receipt, candidate or rollback revision.
2. **Establish this feature's evidence.** Record its current behavior and the smallest applicable preservation baseline. Materialize the architecture/behavior falsifications below before the implementation edit, using the existing test harnesses. A requirement already satisfied is preserved, not broken to fabricate fail-first evidence. A historical test-pass claim is not a new result. Implement only this objective, including its applicable error, partial-result and recovery paths.
3. **Run the existing gates for the changed slice.** Run focused tests and an intentional adversarial case, retaining preservation results separately. From the repository root in the documented WSL/native Node environment run:

   ```bash
   bash scripts/verify.sh
   npm run test:e2e:core
   ```

   `scripts/verify.sh` already performs the lockfile install, formatting, lint, type checks, units, Firestore/backend tests, router/falsification/context/path/spec-traceability/copy/redaction gates, budget guard and production build. Keep the documented two-worker Vitest ceiling. Exercise the existing applicable compiled renewal-desk and renewal-guide browser checks; use the existing navbar/theme coverage when this slice touches their shared controls. Do not replace or relax those checks, freshness requirements, role coverage, deadlines or failure accounting. No new blanket test or review program is required by this specification.

4. **Review and record the bounded result.** Audit the diff, secrets/PII, source destinations, exact action gates, runtime configuration, protected paths and rollback. Update only documentation made inaccurate by this feature, including its named operator/control references and the existing facts/status/plan/loop-state records. Do not claim deployed behavior before release. Keep private source captures and receipts outside Git.
5. **Integrate a green feature.** The router permits a green commit/push directly to `main`. When the actual checkout uses a feature branch, complete its applicable existing merge/integration path into `main`; do not invent a mandatory PR or bypass an applicable repository restriction. Preserve unrelated changes and never force-push, rewrite history, delete branches or create a release tag. Require successful CI for the exact integrated main SHA, not merely the branch or PR SHA.
6. **Complete this feature's serialized release.** Reuse the existing release watcher and lock described in `docs/environment-handoff.md`; do not start a competing watcher. `npm run release:watch:dry-run` is the documented print-only inspection. The existing watcher, or its documented `npm run release:watch:once` single-pass path only when it can run without competing ownership, carries the exact-main green change through the established driver. Follow that handoff's current arguments rather than inventing candidate identifiers. The required sequence is print-only plan, captured predecessor/configuration, zero-traffic Cloud Run candidate, exact commit/tag/revision anonymous smoke, authorized-domain and runtime readback, complete Admin assurance plus independent source reconciliation and monitoring, a fresh aggregate candidate-assurance receipt, then receipt-bound exact-revision promotion and 100% traffic readback. Production is project `pmi-kc-kb-prod`, region `us-central1`, service `pmi-kc-app`. Preserve its reviewed runtime identity, eleven Spaces, provider bindings, Sheet switch and allowance unless this feature explicitly changes a named business default in application code.
7. **Reach the actual completion boundary.** Complete the canonical-origin 300,000 ms observation with its immediate and end checkpoints and the bound promotion receipt. Independently read back `/api/version`, Ready state, exact serving commit/revision, traffic, runtime configuration, action state and the feature's applicable owning-page evidence. The current approved browser policy uses the enrolled owner Admin session and records Editor `not_run`; backend Editor/role tests remain required. Candidate and post-promotion assurance remain read-only with zero mutation attempts. The old exception for one exact historical predecessor is not reusable for a new failure. A required rollback must restore and verify the receipt-bound predecessor through the existing recovery path; preserve failed receipts/checkpoints and resume this same feature's loop, not the next feature. Diagnostics alone do not replace aggregate receipts or observation.
8. **Close and only then advance.** Record verified present truth in `docs/facts.md`, `docs/status.md`, `docs/plan.md`, `docs/loop-state.md` and this suite's status/evidence as applicable. Use `ALL_GATES_GREEN` only for passed applicable implementation and release gates; use `BLOCKED` for an exact unresolved required input/authority after independent fail-closed work, and `BUDGET_EXHAUSTED` only with an explicit user budget. Separately identify a resource-dependent live effect not exercised; do not call it operationally verified. A documentation-only import does not deploy an app, but the code/UI changes requested here do require their own release. Complete this feature's applicable cycle before beginning the next objective, then re-read the updated repository and project state as a fresh-context model.

**Ordered prompt sequence.**

1. Re-ground current default, source projection, quota/observation and preparation/approval paths.
2. Establish the exact accepted formula, real-request/default and no-overwrite/evidence falsifications.
3. Implement this comparison objective and its truthful report/fallback/Sheet mapping without a new pricing or retry policy.
4. Complete all applicable development/integration/release gates before re-grounding for S119.

**Deletion/merge recommendation.**

Register this file once in the existing `docs/feature-suites/README.md` when importing it; use the suite ID, canonical path and sequence given above without replacing unrelated queue rows or marking work complete. No registration or queue edit has been performed by specification authoring. After implementation and applicable release completion, follow the repository's existing retirement rule only when every remaining requirement/dependency is represented by code, tests and current facts. Do not merge these features into one implementation followed by a single final deployment.

Import registration row for the existing suite table (add once; do not replace its other rows):

```markdown
| S118 | `docs/feature-suites/renewal-market-defaults-and-sourced-comparisons.md` | SPECIFICATION READY; feature 5 of 7 in renewal-operator-hub-v1; implementation/release not started. |
```
