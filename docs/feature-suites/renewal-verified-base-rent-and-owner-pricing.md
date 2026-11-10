<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-walkthrough-2026-11-10 -->

# S261 — Show verified base rent separately from lease charges

> Status: AUTHORING READY, intake 139. Thursday fixes. Implementation and verification
> pending.

**Goal.**

Staff see the same verified current base rent from the Renewal Desk through owner review
and can identify charges separately without mistaking the payment total for rent.

**Current state / intended end state.**

RentVine ingestion already distinguishes contractual base, the provider’s total and listed
rent. The S153 resolver and an authorized working correction exist. In the walkthrough an
owner-facing preview presented the amount including pet rent as current rent, and it
persisted after refresh. A staff correction produced the intended base. The demonstration
establishes a symptom to reproduce against the exact serving path. The finished workflow
uses one base-rent decision everywhere that asks for base and names other money by meaning
and source.

**Actors and entry conditions.**

An authorized staff member opens an exact lease and renewal cycle from Renewals, reviews
the numbers and checks the owner draft. A scoped editor can use the existing correction.
Read-only roles can inspect allowed evidence. Source unavailability or disagreement holds
the dependent value or effect.

**What it is / how it functions.**

Open Check the numbers, inspect the base and any discrepancy, use the existing correction
if needed, then view the comparison and owner preview. A current saved value survives a
refresh, navigation and retry. Ask the owner reads the same recommendation as Compare
market rent.

In Guided, Check the numbers shows verified **Current base rent** first among rent facts.
A conflicting or missing base promotes the existing rent-and-charges correction to Work
with the exact differing source. The payment total and recurring inventory belong in
**Verify lease numbers** except for the value needed to resolve that discrepancy. Compare
market rent keeps the one editable **Rent to recommend**. Ask the owner shows read-only
current and recommended base and a direct edit link for the recommendation. Reopening a
ready draft or comparison leads with existing work instead of a new lookup. After S262
records a different approved amount, the preserved recommendation still belongs to Compare
market rent and owner copy. The approved working base goes to the tenant. Batch and
deliberate preparation preserve the populated or newer working record under the existing
S249 empty-only and cycle guards. Use S262's current-cycle projection for the
recommendation and future working rent. An unbound legacy entry needs review before it can
support an offer or count as empty.

- **R-S261-1 — Resolve base once.** Use the existing source distinctions and authoritative
  resolver with the exact working-record correction, verified single applicable
  rent-account amount, or contract fallback as allowed by S153. Preserve provider total,
  listed rent and separate charge identities as distinct facts. Represent unavailable or
  conflicting evidence with its source and exact correction target. Subtracting a pet line
  from a payment total does not establish base.
- **R-S261-2 — Keep owner copy on base.** Ordinary owner pricing includes current and
  proposed base rent with unambiguous labels. An additional verified case-specific amount
  may appear separately through the existing reviewed staff wording path. An earlier draft
  is retained under S249 and requires review if its exact basis differs. Preserve the
  first-name greeting from the verified party, the chosen pricing route and the
  independently bound sender.
- **R-S261-3 — Keep scoped staff corrections.** Use the existing lease-specific working
  current-rent correction with its source or reason from the exact workspace. Reload
  reuses it while the lease fact is current. A change in the applicable basis shows the
  next check and retains prior evidence. Failed reads, a stale tab and re-preparation
  cannot overwrite a newer correction. The lease-level current rent and S262's
  cycle-scoped future terms have different lifetimes. Existing explicit provider
  corrections retain their own authority and review.
- **R-S261-4 — Resume prepared work.** Find already saved comparisons, suggestions and
  owner preparations by exact lease and cycle. Show the current ready, empty, unavailable
  or previously failed state before offering a new paid lookup or preparation. Keep legacy
  wording and prior sends distinguishable from current preparation. Existing explicit
  actions keep ownership and recovery.

**In scope / out of scope.**

Current base, separate charge labels, ordinary owner preview and review, and the reported
resume symptom. S262 owns actual approval and S264 owns tenant applicability and totals.
Reviewed case exceptions use the existing wording path.

**Open questions & assumptions.**

- An unresolved base needs its exact contract, charge identity or working correction
  before the dependent effect. The walkthrough amounts describe one case. The fixture is
  synthetic.
- A new owner pricing exception or fee-sharing rule needs verified authority. Existing
  case-specific reviewed wording remains available.

**Cross-product impacts.**

Renewal Desk, Check the numbers, Compare market rent, Ask the owner and existing
projections that label current base. Readback through working record and message
preparation. Update Help and synthetic screenshots for changed labels and recovery.

**Authority and evidence map.**

| Input                                                                                                                 | Classification            | Use and limitation                                                                                    |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| S102, S113, S153, S249 and S260                                                                                       | Active contracts          | Keep typed source facts, explicit correction, one preparation and read-only verification.             |
| `lib/integrations/rentvine/lease-mapper.ts`, `lib/lease-renewal/current-rent.ts` and `lib/lease-renewal/live-desk.ts` | Committed implementation  | Expose source amounts, the resolver and consumers whose parity must be tested.                        |
| November 10 Fathom walkthrough 3:35–4:44, 11:06–14:40 and 27:26–30:18                                                 | Reported and demonstrated | Resume gap reported. Owner copy used combined rent and the staff correction showed the intended base. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S261-1** — Desk, guidance, comp preparation and both views consume the same
  canonical base decision or an explicitly typed source amount. Fail-first with
  contradictory provider total and an unverified base.
- **ARCH-S261-2** — Bind calculated preview facts to the same base and working
  recommendation IDs and revisions. Exercise generated and previously saved drafts.
  Preserve old revision bytes when facts change.
- **ARCH-S261-3** — Inject a race between stale refresh or preparation and an exact
  correction. Read the working revision and receipt/attempt ledger after both complete.
- **ARCH-S261-4** — Use S249’s existing stored preparation and attempt state across
  navigation and reload. Keep distinct durable evidence for a saved draft, a provider send
  and a receipt-less attempt.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S261-1** — Given $900 verified base and $40 verified pet rent, Check the numbers
  reads $900 and shows $40 separately if applicable. With only the $940 payment total or
  ambiguous candidate rent accounts, the dependent field says what to verify.
- **BEH-S261-2** — After refresh the ordinary owner preview shows $900 current base and
  the exact saved proposed base. An older preview derived from $940 cannot qualify for the
  current exact review without staff review.
- **BEH-S261-3** — Staff can resolve the discrepancy once and reopen the same correction
  and owner draft. A conflicting tab shows the current revision with its exact recovery.
- **BEH-S261-4** — On return, staff see the saved comparison and owner draft or the exact
  reason one is unavailable. Opening the lease starts no new preparation.

**Human litmus outcome.**

### Check the numbers and reopen the owner draft

**If this was built correctly:** A staff member can explain the base and separate charge
at a glance, resolve an unclear base on the lease and return to the same accurate draft
and saved comparison later.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                            | Architecture outcome | Behavior outcome | Human litmus                                 | Deterministic evidence / falsification                                             |
| -------------------------------------- | -------------------- | ---------------- | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| R-S261-1 Resolve base once             | ARCH-S261-1          | BEH-S261-1       | Check the numbers and reopen the owner draft | AC-S261-1. Resolver fixtures and desk, Guided and Full assertions on one lease.    |
| R-S261-2 Keep owner copy on base       | ARCH-S261-2          | BEH-S261-2       | Check the numbers and reopen the owner draft | AC-S261-2. Compiled owner preview, saved preparation and exact review.             |
| R-S261-3 Keep scoped staff corrections | ARCH-S261-3          | BEH-S261-3       | Check the numbers and reopen the owner draft | AC-S261-3. Exact working revision and absence of unintended effects.               |
| R-S261-4 Resume prepared work          | ARCH-S261-4          | BEH-S261-4       | Check the numbers and reopen the owner draft | AC-S261-4. Persisted readback and browser guard around reopen, refresh and switch. |

**Preservation set.**

- S102 and S153 source labels, inventory filters and exact-account matching.
- S246 click-only paid batch, S249 empty-only suggestion and one owner, S250 verified
  standing coverage, and S163 greeting and S224 sender contracts.
- November 9 S260 evidence and the separation of preparation, staff-recorded work and
  confirmed provider sends.

**Adversarial acceptance checks.**

- **AC-S261-1** — Render the real data path with provider total, conflicting listed rent,
  zero or multiple candidate rent accounts, and a source timeout. A guessed amount or
  divergent base fails. Verify the correction leads in the discrepant case and that a
  ready case keeps the total and inventory in Verification, with the recommendation
  editable only in Compare market rent.
- **AC-S261-2** — Assert the visible preview, exact review payload and saved draft reopen.
  Exercise the deliberately reviewed exception without putting it in the base slot.
- **AC-S261-3** — Correct one lease and try stale edits on that lease and a different
  cycle. Confirm no RentVine or Sheet mutation on ordinary correction and no overwrite of
  the recommendation.
- **AC-S261-4** — Seed a usable comparison, saved suggestion and draft for one cycle and
  prior-send evidence for another. Reenter both views under a zero-effect guard, including
  an unresolved attempt.

**Forbidden actions / hard gates.**

No inferred contract rent, automatic paid lookup, provider write or dispatched message as
evidence. Existing roles, scoped effects, exact-target authorization, claims and
receipt/reconciliation gates remain in force.

**Dependencies / sequencing.**

Use the deployed S102/S153/S249 behavior. S262 and S264 can consume the canonical base
through independent fixtures while this slice is built.

**Standalone delivery contract.**

- **Deliverable now.** Canonical base through the actual preview and review, persisted
  resume, precise refusal and Help.
- **Consumes, but does not assume.** Compatible working records and legacy drafts, with
  explicit unavailable states.
- **Externally blocked effect.** AC-S261-1 leaves outgoing basis blocked where the exact
  base remains unverified.
- **Produces for downstream suites.** A source-labeled base and preparation state for
  approval and offer composition.

**Verification and delivery contract.**

1. Re-establish the current authorized baseline. Before editing, prove the named
   structural and behavioral failures for the expected reason. Where an assertion
   describes deployed behavior, record it as a separate preservation check.
2. Run resolver, lease projection, working-record concurrency, and compiled owner-preview
   and revisit checks. Use synthetic fixtures for effects and guarded read-only production
   probes where authorized. Run the affected Help and control-map checks.
3. For an authorized application candidate, run `bash scripts/verify.sh` and
   `npm run test:e2e:core`, complete the scoped S271 qualification on the exact build, and
   follow the current release gates.
4. Record `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` for the precise unresolved effect or input. Separate
   engineering, external and observed human verdicts.

**Ordered prompt sequence.**

1. Verify the starting behavior and register fail-first or preservation checks.
2. Trace the demonstration symptom to the active consumer and its resolver use.
3. Correct parity, preserve preparation ownership and exercise conflicting-source and
   stale-record paths.
4. Run the focused and applicable cumulative checks and record the actual outcomes.

**Deletion/merge recommendation.**

Keep active until its behavior, evidence and source-dependent boundaries are represented
by verified code, tests and current facts.
