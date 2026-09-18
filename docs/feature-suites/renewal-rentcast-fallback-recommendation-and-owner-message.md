<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-rentcast-fallback-v1 -->

# S121 — RentCast fallback recommendation and truthful owner-message behavior

> Status: SPECIFICATION READY; implementation/release not started. This is a future implementation handoff; authoring or importing this Markdown is not implementation, verification or release. It plans one connected feature: an actionable path when a RentCast lookup returns no usable comparable evidence, existing-logic recommendation alternatives plus custom entry, carry-through of the chosen recommendation, a truthful fallback owner-email branch, and the minimum hook for a later-supplied PMI rent-calculation methodology PDF. Human verdict: NOT RUN — no human observer.

**Repository:** `josiahH-cf/pmiKCkb_and_ownerRouter` (`pmi-kc-kb`).
**Canonical file:** `docs/feature-suites/renewal-rentcast-fallback-recommendation-and-owner-message.md`.
**Authoring baseline:** current `main` at intake (`79493458` serving). Re-read current `main` before implementation.

**Goal.**

When a RentCast lookup returns no usable comparable information, staff can complete the rental recommendation from grounded existing-logic alternatives (or a custom value) and send the owner a truthful message that states the research outcome and PMI's suggested rent with its actual basis, instead of a blank workflow, fabricated comparables, or an email that describes missing data as successful market research.

**Current state / intended end state.**

Verified present behavior:

- RentCast is integrated and fails closed and legibly. `lib/lease-renewal/providers/rentcast-market-comp-provider.ts` returns `confidence:"Needs Verification"` with no numbers and a distinguishable `reason` on every failure (`insufficient_comparables`, `too_few_comps`, `timeout`, `network_error`, `http_error`, `parse_error`, `missing_key`, `missing_address`, `out_of_allowance`, `provider_not_live`); `MarketCompFailureReason` in `lib/lease-renewal/market-comp-provider.ts` enumerates them. This integration and its usable-result rules are working and are preserved.
- `components/lease-renewal/RenewalProgressControls.tsx` (`OwnerDecisionForm`) already renders a distinct sentence per reason from `COMP_REFUSAL_COPY`, keeps manual comp entry available on every refusal, and already offers operator-changed radius recovery (the `insufficient_comparables` copy says to increase the radius and look up again, driven by the "Maximum comp search radius" input). These basic capabilities exist and are not re-created here.
- `computeStartingRange` (`lib/lease-renewal/market-starting-range.ts`) yields a band from contractual current rent and is explicitly labeled `STARTING_RANGE_LABEL` ("Starting range from current rent, not market evidence").
- `computeRentSuggestion` (`lib/lease-renewal/rent-suggestion.ts`) requires usable comparable inputs and returns `needs_verification` with a null number otherwise; `computeOwnerPolicySuggestion` applies an existing owner-policy percentage rule only with a usable current rent. Neither fabricates a number.
- `RenewalMarketBasis` (`lib/lease-renewal/renewal-progress.ts`) separates operator-typed `rangeLow`/`rangeHigh`/`pmiNumber` from the provider-retrieved `provider` block and records `rangeBasis` (`starting_rule` | `provider` | `reviewed`) and `recommendationBasis` (`provider` | `reviewed`).
- `projectMessageMarketEvidence` (`lib/lease-renewal/message-market-evidence.ts`) excludes a current-rent starting range from comparable-market evidence and distinguishes a provider point estimate (needs Admin approval of that exact number) from a staff-reviewed recommendation.
- `composeRenewalMessage` (`lib/lease-renewal/renewal-message-content.ts`) currently requires, for the owner channel, a comparable `range` and either reviewed `comps` or a reviewed `attachment`; its standard owner wording is `SUPPLIED_RENEWAL_COPY.owner.market` ("similar comps in the area ranging from ... to ...") and `owner.request` ("similar units currently available in that price range"). `lib/lease-renewal/current-renewal-message.ts` assembles those facts; `lib/lease-renewal/message-readiness.ts` (`projectMessageReadiness`) turns the content's `missing` list into the readiness items and `bodyReady` flag that gate Copy formatted body / Copy plain text in `components/lease-renewal/RenewalMessagePreparation.tsx`.

Gap this suite closes: when RentCast returns no usable comparables and staff genuinely have no comparable evidence, the only ways to complete the owner message today are to type fictional comps/range or to leave the rent-research section and the owner message unresolved. There is no truthful completion path, and the standard owner copy would assert comparable ranges and "similar units currently available" that were not found.

Intended end state: an explicit, operator-selected fallback that records the research-outcome class (not a fabricated "no comps exist"), lets staff choose a grounded existing-logic recommendation or enter their own, carries that value with its honest basis through the displays and owner-message preparation, and drives a distinct owner-email branch whose wording matches the real outcome and still gives the owner a concrete suggested rent and basis. The methodology PDF is referenced or accompanied only when a real resource exists.

**Actors and entry conditions.**

Existing authorized Renewals readers inspect. Editors retain ordinary preparation and manual recording in the current role matrix. The fallback is reachable only after a lookup returned an unusable result for this lease/cycle, or when no usable comparable evidence is present; it never auto-activates and never auto-selects a recommendation. Admin comp-suggestion approval, the separate owner rent decision, and managed-sender identity are unchanged. Entry is blocked from producing a final owner body until the operator has acknowledged the outcome and deliberately selected or entered a recommendation with its basis.

**What it is / how it functions.**

### R121.1 — Make an unusable RentCast result actionable

In the existing rent-research section of `OwnerDecisionForm` (comp preparation mode), when the most recent lookup for this lease/cycle produced no usable result, present a clear, persisted "no usable current RentCast recommendation is available" state in the same workflow, alongside the already-available manual entry and radius recovery.

Keep the reason meaningful and preserve the existing distinct per-reason copy. Classify the persisted outcome into two truthful classes derived from the existing `MarketCompFailureReason`, without adding a provider or weakening result rules:

- **Research ran, no usable comparables in scope:** `insufficient_comparables` and `too_few_comps` (RentCast answered; too few matching comparable listings within the searched scope).
- **Lookup could not run or complete:** `missing_key`, `missing_address`, `timeout`, `network_error`, `http_error` (non-400), `parse_error`, `out_of_allowance`, `provider_not_live`, and the route-level closed/suspended reasons in `COMP_REFUSAL_COPY`.

A failed request is never recorded or rendered as evidence that no comparable properties exist. The recorded outcome is the reason class only; it never carries or implies a number. This is not a new provider, a relaxation of RentCast's usable-result rules, an automatic retry, or automatic radius expansion; the operator still triggers each lookup and each radius change.

### R121.2 — Offer existing-logic alternatives and custom entry

Offer the operator three or four recommendation choices grounded in existing rental-analysis logic and actual available data, plus an explicit custom-entry option. Each choice shows its amount and its basis; unavailable choices show the limitation instead of a fabricated amount. The operator deliberately selects one; the application never silently chooses, and an unreviewed default is not the completed decision.

Grounded choices, each gated on real data that the repository already retains or computes:

| Choice | Existing logic / recorded value | Availability gate | Basis shown |
| --- | --- | --- | --- |
| Owner-policy percentage | `computeOwnerPolicySuggestion` in `lib/lease-renewal/rent-suggestion.ts` | An owner-policy percentage rule exists for the lease's portfolio (`leasePortfolioId`) and a usable current rent is available | "Owner policy: +N% of current rent" with the rule note |
| Keep current rent | The authoritative current base rent already resolved for this lease (`loadLiveOwnerCurrentRentDecision` / current-rent reconciliation) | A fresh, agreed current base rent is available | "No increase; current contractual rent" |
| Starting-range endpoint (low / midpoint / high) | `computeStartingRange` (`market-starting-range.ts`) | A positive contractual base rent yields an available band | `STARTING_RANGE_LABEL` verbatim: from current rent, not market evidence |
| Previous reviewed recommendation | The prior cycle's saved reviewed recommendation or the prior recorded owner-approved offered rent, where retained (`getPreviousMessageDrafts`, prior `RenewalOwnerDecision.offeredRent`, prior message preparation) | A prior value for this lease actually exists in the store | "Previous cycle recommendation/offer" with its recorded date |

Rules: do not invent historical records, owner policies, percentages, new pricing formulas, or additional market evidence to populate a choice. Where a choice's inputs are unavailable, show the limitation and omit the amount; custom entry remains the way to supply a value existing information cannot support. Keep the four value families accurately distinguished — current-rent estimate, historical/previous value, owner-policy calculation, and a staff-reviewed manual recommendation — and never label any of them as fresh RentCast comparable evidence. Reuse the existing pure calculation functions; add no new formula.

### R121.3 — Carry the chosen recommendation through the application

Persist the operator's selected or entered recommendation through the existing preparation boundary so it becomes the value used consistently in the relevant displays and in owner-message preparation. The smallest change reuses `RenewalMarketBasis.pmiNumber` with `recommendationBasis: "reviewed"`, plus an explicit fallback marker recording which grounded basis was chosen (owner-policy, keep-current, starting-range endpoint, previous cycle, or custom) and the R121.1 research-outcome class, so downstream wording can distinguish a fallback recommendation from fresh comparable market evidence.

The rent-research section reaches a usable completed state on the fallback path without a comparable range or comps; missing comparable data alone no longer forces staff to leave the section unresolved or enter fictional comparable values. Preserve every review and approval boundary: a staff-selected recommendation is not owner approval, is not a change to contractual current rent, and is not authorization to write RentVine or the operating Sheet. The separate owner rent decision (`RenewalOwnerDecision`) and the Admin approval of a comp-derived provider number remain required exactly as today; the fallback marker never substitutes for either.

### R121.4 — Add truthful fallback owner-email behavior

Add an explicit fallback branch in owner-message preparation and rendering (`renewal-message-content.ts` `composeRenewalMessage`, the facts assembly in `current-renewal-message.ts`, the evidence projection in `message-market-evidence.ts`, and the readiness projection in `message-readiness.ts`) rather than inserting a fallback number into wording that assumes comparables were found.

- When the recorded outcome is "research ran, no usable comparables in scope," the message states that current comparable market data was researched and none was usable within the searched scope, and explains PMI's recommendation using the selected basis.
- When the recorded outcome is "lookup could not run or complete," the message uses wording appropriate to that limitation and does not claim completed market research.
- Both fallback messages still give the owner a concrete suggested rent and a clear basis for responding, and remove or replace the `owner.market` comparable-range sentence and the `owner.request` "similar units currently available" claim when those are unsupported.
- On the fallback branch, `composeRenewalMessage` must not raise the `range` and `comps`/`attachment` requirements; the normal evidence-based path keeps those requirements unchanged, and a current-rent starting range is never treated as market evidence on either path.
- The recommendation and its explanation stay consistent across the in-app preview, copied content, and the existing governed unsent Gmail draft (one deterministic content model, as today). The human-send boundary is preserved: initiation ends in an explicitly confirmed unsent draft and a person sends.

New fallback sentences are approved copy: they are added to `SUPPLIED_RENEWAL_COPY` (or its supplied v2 template pack) through the same client-approval authority that governs the existing renewal copy, not invented in application code or in this plan. Until that approved wording exists, the fallback branch surfaces the outcome and the selected recommendation as the missing-content requirement rather than emitting unapproved prose.

### R121.5 — Support the later-supplied PMI methodology PDF

Provide the minimum connection for the fallback owner message to reference or accompany the actual PMI rent-calculation methodology PDF that the team supplies through its separate process. Reuse the existing shared-resource-location mechanism (`RENEWAL_RESOURCE_FIELDS` in `lib/lease-renewal/resource-locations.ts`, stored and read back through `lib/firestore/renewal-resource-locations.ts`, resolved by `usableRenewalResourceUrl`, and configured through the S120 Connections/Admin surface): add one `information`-kind entry (for example `rent_calculation_methodology`) keyed like the insurance flyer and RBP flyer, with the same validation, verification, expected-version and readback. The fallback owner message references that link only when a real verified HTTPS entry exists; a blank or unverified entry remains a valid pending state and never becomes a customer link.

Alternatively, when the PDF is supplied as a file rather than a link, it accompanies the message through the existing reviewed-attachment/download-and-attach path (`composeRenewalMessage` already keeps attachment bytes out of copied text). The plan neither creates the PDF, invents its wording, requests the template now, nor designs a new document-generation, storage, or background-automation system. The PDF explains PMI's methodology and is not proof that fresh comparable data was found. Recommendation selection and message preparation remain usable before the template is supplied; never fabricate a resource link or claim a PDF is attached when it is not, and keep preparing or copying email text distinct from actually including a file.

**In scope / out of scope.**

In scope: the persisted research-outcome class and its rent-research surface; the grounded recommendation chooser plus custom entry; carry-through of the selected recommendation with its honest basis through displays and owner-message preparation; the truthful fallback owner-email branch and its readiness/final-copy behavior; and the minimum shared-resource/attachment hook for the methodology PDF. Out of scope and unchanged: replacing RentCast, adding another data provider, weakening usable-result rules, automatic retries or automatic radius expansion, the Admin comp-approval and owner-decision boundaries, any RentVine/Sheet write, any send or autonomous effect, any new document-generation/storage system, and inventing the PDF or its copy.

**Open questions & assumptions.**

Resolved from repository evidence without new questions: the two outcome classes are derived from the existing `MarketCompFailureReason` set; the grounded choices reuse `computeOwnerPolicySuggestion`, `computeStartingRange`, the resolved current base rent, and retained previous values, each gated on real data; the fallback recommendation persists as a reviewed `pmiNumber` plus a fallback marker on the existing `RenewalMarketBasis`. Assumption (labeled, not fact): the exact approved fallback sentences are supplied through the existing client-approval authority for `SUPPLIED_RENEWAL_COPY`; until then the fallback branch reports the outcome and selected recommendation as a content requirement rather than emitting unapproved wording. Assumption (labeled): the methodology PDF arrives later through the team's separate process as an HTTPS resource or a reviewed file; its absence disables only the link/attachment reference, not the fallback recommendation or message preparation.

**Cross-product impacts.**

Owning components: `components/lease-renewal/RenewalProgressControls.tsx` (`OwnerDecisionForm` rent-research surface, `COMP_REFUSAL_COPY`, radius recovery, figure origins), `components/lease-renewal/RenewalMessagePreparation.tsx` (readiness list, Copy formatted/plain gate). Owning data/services: `lib/lease-renewal/renewal-progress.ts` (`RenewalMarketBasis`, `normalizeMarketBasis`, `RenewalOwnerDecision`), `lib/lease-renewal/rent-suggestion.ts`, `lib/lease-renewal/market-starting-range.ts`, `lib/lease-renewal/market-comp-provider.ts`, `lib/lease-renewal/providers/rentcast-market-comp-provider.ts`, `lib/lease-renewal/message-market-evidence.ts`, `lib/lease-renewal/current-renewal-message.ts`, `lib/lease-renewal/renewal-message-content.ts`, `lib/lease-renewal/message-readiness.ts`, `lib/lease-renewal/renewal-message-preparation.ts`, `lib/lease-renewal/resource-locations.ts`, `lib/firestore/renewal-resource-locations.ts`, `lib/lease-renewal/owner-draft.ts`. Routes: `app/api/lease-renewal/market-comps`, `app/api/lease-renewal/message-preparation`, `app/api/lease-renewal/renewal-progress`. Documentation to reconcile during implementation: `docs/products/lease-renewal-agent.md`, `docs/products/renewal-operator-guide.md` (its step-to-control table is read by `npm run smoke:renewal-guide-controls-browser`), and the current renewal walkthrough. This feature reconciles with S118 (market defaults/comparisons; comp preparation and evidence projection) and S120 (downstream communications, readiness, shared resources); it consumes their contracts and must not weaken them.

**Authority and evidence map.**

| Source | Classification | Application here |
| --- | --- | --- |
| `AGENTS.md`, `docs/README.md`, current committed code and readbacks, `docs/facts.md` | Governing repository boundaries and implementation truth | Re-establish current truth before implementation. RentCast integration, comp-approval, owner-decision, send and provider boundaries are preserved. |
| The user's request describing the RentCast outcome and desired fallback | Requested product intent and user-provided context | Incorporated below. The reported lookup is user-provided context, not an independently verified live event; no live lookup is run to plan this. |
| The later-supplied PMI methodology PDF and its separate supply process | External dependency (owner/team) | Names the exact reference/attachment behavior; absence disables only that reference, never the recommendation or message preparation. |
| `docs/feature-suites/TEMPLATE.md`, `docs/feature-suites/README.md`, `docs/environment-handoff.md`, `docs/autonomous-agent-runner.md` | Existing specification, registration and release contracts | Use the existing loop and native format. No new release process or review program is introduced. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S121-1** — The persisted rent-research outcome carries a truthful class ("research ran, no usable comparables" vs "lookup could not run/complete") derived only from the existing `MarketCompFailureReason`, never a number and never a "no comps exist" claim; a failed lookup does not erase a prior provider basis.
- **ARCH-S121-2** — The fallback recommendation is one reviewed value on the existing `RenewalMarketBasis` (`pmiNumber` + `recommendationBasis:"reviewed"` + a fallback-basis marker), computed only by the existing pure functions or taken from an actually retained value, and kept distinct from provider comparable evidence and from the owner decision.
- **ARCH-S121-3** — One owner-message model governs both paths: on the fallback branch `composeRenewalMessage` does not require comparable `range`/`comps`/`attachment` and does not render unsupported comparable claims; the normal evidence-based path and the starting-range-is-not-evidence rule are unchanged; preview, copy and Gmail draft share the one deterministic content.
- **ARCH-S121-4** — The methodology PDF reference reuses the existing shared-resource store/verification/readback (or the existing reviewed-attachment path); an absent, blank or unverified resource never becomes a customer link or a claimed attachment.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S121-1** — After an unusable lookup, the operator sees the truthful outcome, keeps manual entry and radius recovery, and reaches a completable rent-research state without fabricating comparables.
- **BEH-S121-2** — The operator is offered three or four grounded choices plus custom entry; each shows amount and basis, unavailable choices show the limitation with no amount, and the operator must deliberately select or enter one.
- **BEH-S121-3** — The selected recommendation appears consistently in the relevant displays and owner-message preparation with its honest basis, while owner approval, contractual rent and provider writes remain separately gated.
- **BEH-S121-4** — The owner message matches the real outcome: it states researched-but-unusable or could-not-complete, gives a concrete suggested rent and basis, drops unsupported comparable-range and "similar units available" claims, and stays consistent across preview, copy and unsent draft.
- **BEH-S121-5** — The methodology PDF is referenced or attached only when a real verified resource or reviewed file exists; otherwise its absence is stated and the rest of preparation proceeds, with copying text never claiming a file was included.

**Human litmus outcome.**

### Complete a recommendation and owner email when the market lookup found nothing usable

**If this was built correctly:** A staff member runs the market lookup and it comes back with nothing usable. Instead of a dead end, they see that the research found no usable comparable data (or could not complete), and they are offered a few grounded options — an owner-policy figure, keeping the current rent, a starting-range figure clearly labeled as not market evidence, or a previous recommendation — plus a box to type their own. They pick one, and it flows into the owner email, which now honestly explains the research outcome and states PMI's suggested rent and why, without pretending comparable listings were found. If the PMI methodology PDF has been provided, the email references or includes it; if not, the email is still complete and nothing false is claimed.

The implementation runner records the model verdict with actual evidence. Record `Human verdict: NOT RUN — no human observer` when no observer is present; do not invent human acceptance or add it as a release gate.

**Requirement-to-outcome traceability.**

| Requirement | Architecture | Behavior / human litmus | Evidence / falsification |
| --- | --- | --- | --- |
| R121.1 actionable, truthful unusable-result state | ARCH-S121-1 | BEH-S121-1; litmus | Outcome class per reason, no number, manual entry and radius preserved, no "no comps exist" claim; AC-S121-1. |
| R121.2 grounded alternatives plus custom entry | ARCH-S121-2 | BEH-S121-2 | Each choice's source function/value, availability gates, unavailable-shows-limitation, deliberate selection; AC-S121-2. |
| R121.3 carry-through with preserved boundaries | ARCH-S121-2 | BEH-S121-3 | Reviewed `pmiNumber`+marker reaches displays/message; owner-approval, contractual rent, provider writes still gated; AC-S121-3. |
| R121.4 truthful fallback owner email | ARCH-S121-3 | BEH-S121-4 | Fallback branch waives comparable requirements, drops unsupported claims, keeps normal path and preview/copy/draft parity; AC-S121-4. |
| R121.5 methodology PDF hook | ARCH-S121-4 | BEH-S121-5 | Shared-resource/attachment reuse, blank/unverified never a link, no fabricated attachment, usable before the PDF exists; AC-S121-5. |

**Preservation set.**

Preserve the RentCast integration, its usable-result rules, attribution and operator-triggered lookup; the existing per-reason `COMP_REFUSAL_COPY` and radius recovery; `computeStartingRange`, `computeRentSuggestion` and `computeOwnerPolicySuggestion` no-invented-number behavior; `projectMessageMarketEvidence`'s starting-range and provider-recommendation rules; the normal evidence-based owner-message requirements; the Admin comp-approval and owner-decision boundaries; the S120 readiness model for the non-fallback path; recipient separation, signature-actor binding, source-fingerprint/dirty-edit review, and Gmail exact-attempt/reconciliation contracts. Do not weaken any of these to enable the fallback branch.

**Adversarial acceptance checks.**

- **AC-S121-1** — R121.1 / ARCH-S121-1 / BEH-S121-1: each unusable reason maps to the correct outcome class; the persisted state carries no number and never asserts comparables do not exist; manual entry and radius recovery remain on every refusal; a prior provider basis survives a later failed lookup.
- **AC-S121-2** — R121.2 / ARCH-S121-2 / BEH-S121-2: with and without an owner-policy rule, a usable current rent, a positive base rent, and a retained previous value, the offered choices appear or show their limitation with no fabricated amount; no choice is auto-selected; custom entry is always available.
- **AC-S121-3** — R121.3 / ARCH-S121-2 / BEH-S121-3: a selected fallback recommendation reaches the relevant displays and owner-message preparation as a reviewed value with its basis; it does not set the owner decision, change contractual rent, satisfy Admin comp-approval, or trigger any RentVine/Sheet write.
- **AC-S121-4** — R121.4 / ARCH-S121-3 / BEH-S121-4: on the fallback branch the owner body omits the comparable-range and "similar units available" claims, states the correct outcome, includes the suggested rent and basis, and reaches final-copy readiness without comparable evidence; the normal path still requires range and comps/attachment; preview, copy and unsent draft stay identical; a starting range is never rendered as market evidence.
- **AC-S121-5** — R121.5 / ARCH-S121-4 / BEH-S121-5: with the methodology resource blank, unverified, and set to a real verified HTTPS value, the message respectively omits it, omits it, and references it; a supplied file attaches only through the reviewed path; copied text never claims the PDF was included; preparation is usable before the PDF exists.

**Forbidden actions / hard gates.**

Preserve managed identity, Renewals Space and role checks; exact Action Registry authority (including the `rentcast.rental_listings.search` read key and the closed comp-approval/write keys); the Production + Live boundary; and the distinction between source facts, staff selections and provider-verified effects. Never add a data provider, automatic retry, automatic radius expansion, autonomous/bulk/model-triggered write, or client send. Gmail initiation ends in an explicitly confirmed unsent draft; a person sends. A selected recommendation, a chosen basis, or a resource link is not owner approval, a contractual-rent change, an Admin comp-approval, or a provider receipt. Do not invent comparable evidence, historical records, owner policies, percentages, the methodology PDF or its wording. Preserve `firestore.rules`, `lib/integrations/action-gate.ts`, `lib/auth/**`, action-seed activation flags, budget guards and `scripts/auth/**` under the router's protected-path rules. Customer values, source exports, message bodies, credentials and raw live evidence stay outside Git; use deterministic synthetic data only in automated tests.

**Dependencies / sequencing.**

Consumes the deployed S118 comp preparation/evidence projection and S120 message-preparation, readiness and shared-resource contracts; source code and stored state, not earlier conversations, are the dependencies. The methodology PDF and its supply process are an external input that blocks only its own reference/attachment. No suite is a prerequisite to the independently implementable fail-closed behavior here.

**Standalone delivery contract.**

- **Deliverable now:** the truthful unusable-result surface, the grounded recommendation chooser plus custom entry, carry-through with honest basis, the fallback owner-email branch and its readiness/final-copy behavior, and the shared-resource/attachment hook, all reaching `ALL_GATES_GREEN` without the PDF.
- **Consumes, but does not assume:** a resolved current base rent, an owner-policy rule, retained previous values, the approved fallback copy, and a supplied methodology resource; each absence is represented as an unavailable choice, a content requirement, or an omitted reference, never a fabricated value.
- **Externally blocked effect:** only the methodology PDF reference/attachment (until the resource or file is supplied) and the exact approved fallback sentences (until supplied through the copy-approval authority); the corresponding acceptance rows remain `BLOCKED` while unrelated work proceeds.
- **Produces for downstream suites:** a persisted research-outcome class and a reviewed fallback recommendation basis that downstream displays and messages can consume without re-deriving them.

**Verification and delivery contract.**

This is a future implementation handoff. Authoring or importing this Markdown is not implementation or release completion.

1. **Re-ground from a fresh context.** Read `AGENTS.md` and `docs/README.md`, then current `docs/facts.md`, `docs/loop-state.md`, `docs/open-blockers.md`, `docs/plan.md`, this file, the S118/S120 owning contracts, and `docs/environment-handoff.md`. Inspect the actual checkout, diff, current `main`, the cited code and read-only application state; preserve unrelated/user-owned changes. Run `npm run auth:ensure` with the approved identity; a human challenge pauses only its dependent phase.
2. **Establish this feature's evidence.** Record current behavior and the smallest preservation baseline. Materialize the ARCH/BEH/AC falsifications before the first implementation edit using the existing harnesses; a requirement already satisfied is preserved, not broken to fabricate fail-first evidence.
3. **Run the existing gates for the changed slice.** Run focused tests and an intentional adversarial case, keeping preservation results separate. From the repository root in the documented WSL/native Node environment run `bash scripts/verify.sh` and `npm run test:e2e:core`, keeping the two-worker Vitest ceiling, and exercise the applicable compiled renewal-desk and renewal-guide browser checks when this slice touches their controls. Do not relax those checks.
4. **Review and record the bounded result.** Audit the diff, secrets/PII, source destinations, exact action gates, runtime configuration, protected paths and rollback. Update only documentation this feature makes inaccurate, including the operator guide's step-to-control references and the facts/status/plan/loop-state records. Do not claim deployed behavior before release.
5. **Integrate a green feature.** The router permits a green commit/push directly to `main`; complete the applicable merge path when a feature branch is used. Require successful CI for the exact integrated `main` SHA.
6. **Complete the serialized release.** Reuse the existing release watcher and lock in `docs/environment-handoff.md`; do not start a competing watcher. Carry the exact-main green change through the established candidate/smoke/promotion/readback contract; preserve the reviewed runtime identity, eleven Spaces, provider bindings, Sheet switch and allowance unless this feature explicitly changes a named business default in application code.
7. **Reach the actual completion boundary.** Complete the canonical-origin observation with its checkpoints and bound promotion receipt, and independently read back version, traffic, runtime configuration, action state and this feature's owning-page evidence under the current approved browser policy. A required rollback restores and verifies the receipt-bound predecessor; preserve failed receipts/checkpoints.
8. **Close and only then advance.** Record verified present truth in `docs/facts.md`, `docs/status.md`, `docs/plan.md`, `docs/loop-state.md` and this suite's status. Use `ALL_GATES_GREEN` only for passed applicable gates; `BLOCKED` only for the exact unresolved methodology-PDF or approved-copy input after independent fail-closed work; `BUDGET_EXHAUSTED` only with an explicit user budget. Separately identify the resource-dependent references not exercised; do not call them operationally verified.

**Ordered prompt sequence.**

1. Re-ground the current RentCast, comp-preparation, evidence-projection, message and shared-resource code and the S118/S120 contracts.
2. Materialize the outcome-class, grounded-chooser, carry-through, fallback-email and resource-hook falsifications and the preservation baseline before the first edit.
3. Implement the persisted outcome class, the grounded recommendation chooser plus custom entry, carry-through with honest basis, the truthful fallback owner-email branch, and the minimum methodology-PDF hook — no new provider, formula, send, or document system.
4. Falsify, run focused and canonical/backend/core and applicable browser checks, update current documentation, and integrate/release only when authorized; record only actual completion.

**Deletion/merge recommendation.**

Register this file once in the existing `docs/feature-suites/README.md` suite table with an inert `SPECIFICATION READY` state; do not add it to the ordered execution queue, change unrelated rows, priorities or completion records, or mark any work complete. After implementation and applicable release, follow the repository's retirement rule only when every remaining requirement and dependency is represented by code, tests and current facts.

Import registration row for the existing suite table (add once; do not replace its other rows):

```markdown
| S121  | `docs/feature-suites/renewal-rentcast-fallback-recommendation-and-owner-message.md` | SPECIFICATION READY; RentCast unusable-result fallback recommendation and truthful owner message; implementation/release not started. |
```
