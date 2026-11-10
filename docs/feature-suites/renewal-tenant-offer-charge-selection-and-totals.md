<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-walkthrough-2026-11-10 -->

# S264 — Review applicable lease charges and tenant offer totals

> Status: AUTHORING READY, intake 142. Thursday fixes. Unverified fee mappings, terms and
> policy are source pending.

**Goal.**

Staff select and explain only charges that apply to the intended renewal and review exact
recurring and one-time totals before confirming a tenant offer.

**Current state / intended end state.**

RentVine inventory has stable account and charge identities and date/status facts. Tenant
preparation supports six charge kinds and shows a buried optional picker. Existing message
composition supports individual monthly and one-time lines and an unchanged statement, but
the walkthrough needed an easier way to identify valid current lines, changes and
conditional fees and review the whole offer.

**Actors and entry conditions.**

An authorized staff member opens Offer the tenant for an exact lease and cycle with
current working terms. Read-only staff inspect allowed totals and evidence. A scoped
Editor reviews and saves the selection. Admin can review policy under existing controls.
Only current exact recipient, sender, terms and existing staff send authority admit an
effect.

**What it is / how it functions.**

Open Offer the tenant, review the upcoming base, proposed effective date and clearly
grouped charges, confirm or correct the one editable selection, then compare the exact
tenant-facing preview with the staff totals. A missing selected amount, cadence, source,
date or applicability leads to the owning fix. The tenant decision follows its existing
separate path.

Offer the tenant places **Review offer charges** directly after the ready working terms or
their exact fix. Lead with the first unresolved applicable line that needs staff entry.
Then show selected verified carry-forward lines and other new or changed lines, with each
editable inclusion or exact fix. Display one-time fees separately. A pending relevant line
names the source or approval it needs before exact review. If a configured or selected
line lacks material proof, removing it only qualifies the offer when the existing evidence
supports its inapplicability. Ended and unrelated rows are inspectable in **Verify offer
facts and delivery**. Show base, monthly and one-time amounts in the same Work review.
Empty, verified zero and incomplete states remain distinct.

- **R-S264-1 — Map exact provider lines.** Use the current inventory’s stable
  account/charge identity, exact lease, provider status and effective period, observed
  cadence, amount and approved/versioned mapping. Resolve which lines apply on the
  intended renewal date. Present verified applicable carry-forwards as proposed selected
  and expose the source. A material unmapped, conflicting or unsupported line needs an
  exact disposition before confirmation. Historical and verified inapplicable lines remain
  inspectable. Unknown is neither selected nor presumed absent. Preserve approved mappings
  and accept only versioned business-authorized additions.
- **R-S264-2 — Give selection one owner.** Put the applicable-charge selection in the
  primary tenant preparation work when it is needed. Guided and Tenant offer and response
  use the same control and saved record, retaining staff exclusions, evidence-backed
  corrections and partial data across view switches, refresh and retry. An explicit case
  entry captures amount, cadence, date and actual source. Source drift or a changed
  effective date asks for review and never silently replaces a reviewed decision.
- **R-S264-3 — Calculate and label exact totals.** Show staff the renewal base, each
  applicable recurring line by its verified cadence, the known monthly sum of base plus
  applicable monthly lines, and an independent one-time total. Use integer cents or the
  existing equivalent exact money representation. Zero and incomplete are distinct. A
  known subtotal may be shown as such when the total is incomplete. Supported non-monthly
  recurring charges keep their own cadence or an explicit review gap and never masquerade
  as monthly. Example with synthetic confirmed values is $920 base plus $45 monthly pet
  rent and $13 monthly credit reporting, giving $978 monthly, with a separate
  case-approved $35 one-time fee.
- **R-S264-4 — Compose accurate changes and continuity.** The exact tenant-facing text
  distinguishes base, new or changed applicable recurring charges and one-time fees, and
  names cadence, amount and effective date where required. Use the verified unchanged
  statement only when actual compared charges support its scope. Do not assert all charges
  are the same from typical practice or absent data. Staff review includes the full
  itemization. An outgoing aggregate is used only when the approved wording and complete
  basis support it. Use the same resolved rows and evidence versions in composition,
  review, Gmail draft claim and send. Recheck material changes before the exact claim,
  including scheduled dispatch. A mapping or source revision can invalidate review even
  when the amounts match. Retain edit, restoration and re-review semantics.
- **R-S264-5 — Keep conditional policy source-bound.** Treat pet rent, credit reporting,
  utilities such as verified water or sewer, RBP and insurance as candidate charge
  families. Verify actual identity, dates and terms. Rhino or other guarantor coverage
  remains a distinct obligation unless the evidence establishes an applicable charge.
  Renewal processing and pet processing are separate one-time cases. Apply a one-time fee
  only with exact authorized per-case evidence or approved versioned policy. Do not infer
  an eligible pet, agreement count, deposit or assistance rule from recurring pet rent.
  Insurance transition language and any phased RBP change require actual case
  applicability and current effective terms.
- **R-S264-6 — Keep charge coverage with the answer.** Freeze the offer snapshot below
  with exact review and existing authorization. Attach the snapshot an owner decision or
  tenant acceptance actually answered, for the terms its evidence covers. A change in
  selected charges can make an earlier decision inapplicable while base and dates stay the
  same. Preserve earlier receipts and independent preparation and send paths.
- **R-S264-7 — Resolve material transition decisions before release.** For a selected
  applicable insurance charge or a verified transition trigger, require the exact case
  choice of applies or does not apply and its source. Unknown stays source pending and
  holds the affected outgoing review, including a Gmail export or queued send. For a
  relevant RBP charge whose change status governs the flyer, resolve unchanged, new or
  changed. Unknown cannot qualify as unchanged. A verified no or inapplicable case needs
  no transition flyer. Draft preparation stays available.

### Mapping owner and row identity

Use **Admin → Renewal packet policy → Offer charge mappings** as the intake for approved
shared mappings. Add this distinct section to the existing Admin surface at
`/admin#admin-renewal-packet-policy` using its current Admin authorization. The mapping
has its own version, review, compare-and-save and readback. Record the exact stable
RentVine account or charge type, verified display label, offer family, supported cadence,
applicability scope and approval evidence. If the account cannot distinguish the type,
require a more specific stable source or leave it pending. The mapping supplies meaning.
Actual amount, applicability and case policy still need their own evidence. Keep the
existing packet policy, calculator and approved form outputs separate.

Record a verified case-specific fee or classification in **Offer the tenant → Review offer
charges** through the existing scoped preparation save, with its exact case evidence. A
case entry cannot publish a shared mapping or rate. A shared rate or rule outside existing
policy controls requires its own authority. Unverified amounts remain source pending. The
mapping path can be tested using synthetic approval evidence while actual mappings are
pending.

Carry each RentVine account/charge identity, or an independently identified authorized
staff entry, as its own row from selection through storage, comparison, itemization,
totals and exact outbound text. Family classifies the row. Two distinct verified active
rows in the same family may both apply. Reject a repeated source identity or conflicting
duplicate before counting. Legacy family-only entries remain inspectable. They need an
exact verified row or deliberate case disposition to count as current evidence. Preserve
earlier authorized content and receipts.

### Offer snapshot and decisions

An exact offer snapshot binds lease and cycle, the reviewed working base and dates, and
the canonical set of applicable selected charge rows with their identities, amounts,
cadences, effective periods and conditions. Bind the reviewed selection, mapping and
source versions at the existing review and claim boundary. Retain the immutable snapshot
revision with the authorized content and any accepted occurrence.

Bind offer charges to an owner decision only when actual evidence approves those exact
rows and terms. An amount-only response stays amount-only. For a tenant acceptance, use
the exact offer the response answers, identified by the linked confirmed communication or
an independently verified external offer reference reviewed by staff. The newest unsent
draft cannot supply that basis. If a response cannot be attributed to one exact offer,
record the response with its actual scope and show that current acceptance needs
verification. A human reply pause is still separate from a tenant decision.

Recheck coverage wherever the app displays or consumes the decision. After a charge-only
edit, a decision that covered the earlier offer cannot cover the changed charges. Keep the
earlier evidence and the separately scoped amount approval. Packet policy economics retain
their separate approval. If an exact packet action relies on the same accepted charge,
verify parity with the covered offer row and identify any discrepancy for that output. Use
the existing packet-specific authority for other legal or form charges.

### Charge mapping and treatment

| Family                                          | Current typed slot                           | Condition for offer treatment                                                                                                                                         |
| ----------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renewal base                                    | Working renewal rent                         | Resolve separately from RentVine payment totals and other charge accounts. Use the exact current offer basis.                                                         |
| Pet rent                                        | `pet`                                        | The applicable, verified recurring charge identity and actual cadence, amount and dates. Its existence proves no one-time fee or animal classification.               |
| Credit reporting                                | No current typed slot                        | Support a distinct staff-reviewed mapped line after the business verifies its exact source identity, name and treatment. It stays source pending otherwise.           |
| Utilities                                       | `utilities`, currently labeled Water / sewer | Use verified covered utility identities and names. An unrelated utility cannot use the Water / sewer label or an assumed amount.                                      |
| RBP and insurance                               | `rbp` and `insurance`                        | Verify each charge and its change status. Verify the actual transition conditions and apply S265 link requirements independently.                                     |
| Renewal processing and pet processing           | `renewal_processing` and `pet_processing`    | Separate one-time selections with approved policy or authorized case source, stated trigger and exact amount. No provider absence or recurrence proves applicability. |
| Guarantor, assistance and other unmatched lines | No inferred charge slot                      | Preserve their actual separate requirement or show a mapping gap. Only verified applicable charges feed the total.                                                    |

If a pending row is needed for this offer's complete terms, show the precise missing fact
before exact confirmation. A historical or independently inapplicable row does not block
another otherwise eligible offer.

**In scope / out of scope.**

Tenant selection, stable mapping, exact totals and changed/unchanged wording under
existing offer admission. No RentVine charge create/edit, global fee default, newly
determined legal or assistance policy, or automated outreach. S265 owns audience-safe
links.

**Open questions & assumptions.**

- Source pending for exact stable IDs/names and approval for each mapped charge family,
  applicability, amount, cadence, effective date and any exceptions. Current approved
  readback found no published shared charge policy. Recheck exact state at implementation
  intake.
- The $100 renewal-processing rule reported in the meeting needs an approved trigger,
  amount, exceptions and authority. S253 records the $50 pet-processing amount with
  unresolved unit and policy. Separate pet deposits and assistance-animal rules need their
  exact source.
- Insurance and RBP transition scope, effective period, charge amounts and conditions
  require case/policy evidence. A numeric phrase near the tenant-offer example is unclear
  in the transcript and supplies no rate.

**Cross-product impacts.**

RentVine read-only charge inventory, exact working terms and existing message preparation,
Offer the tenant, Full review, charge policy and packet boundaries, Help and control map.
Links are supplied by S265.

**Authority and evidence map.**

| Input                                                                                                                                                                                                          | Classification                                    | Use and limitation                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| November 10 Fathom walkthrough 42:59–47:42 and 53:21–56:03, plus accepted Q3 and Q4                                                                                                                            | Demonstration, suggested rule and confirmed scope | Review current recurring and changed charges, fee applicability, transition wording and useful review totals. Spoken fee examples do not publish policy. |
| S66, S102, S153, S161, S189, S249 and S253, plus the November 10 settings readback                                                                                                                             | Authority and verified baseline                   | Typed inventory and exact offer gates. S253 is the existing pet fee/deposit authority boundary. The shared policy was absent on readback.                |
| `lib/lease-renewal/writeback/charge-inventory.ts`, `lib/lease-renewal/current-renewal-message.ts`, `lib/lease-renewal/renewal-message-content.ts` and `components/lease-renewal/RenewalMessagePreparation.tsx` | Committed implementation                          | Inventory, existing typed selection/composition and the tenant editor are the seams.                                                                     |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S264-1** — One tenant charge projection reads the approved offer mapping revision
  and dated source rows. Carry distinct row identities through the saved preparation and
  composer. The existing Admin entry provides versioned mapping review and readback.
  Preserve legacy evidence and the separate packet policy.
- **ARCH-S264-2** — Bind saved choice to exact working/preparation revisions, lease,
  cycle, source/mapping basis and existing save/readback. Support legacy message charge
  records without assigning false verification.
- **ARCH-S264-3** — Share the same computed breakdown between selection and exact review.
  Calculation uses selected applicable complete rows and excludes base-like totals,
  unselected/inactive rows and one-time charges from the monthly total.
- **ARCH-S264-4** — Use the shared derived selection and evidence versions in composition,
  exact review, draft and send claims. Changed material rows or evidence versions
  invalidate the affected review or authorization. Preserve prior evidence.
- **ARCH-S264-5** — Keep charge mapping, amount/applicability and legal packet policy
  distinct, reusing existing verified charge policy/readiness without copying it. Model
  source pending and explicit exclusions without fake zeroes.

- **ARCH-S264-6** — Bind immutable offer economics to the applicable existing owner and
  tenant outcome records. Keep reviewed offer and legal packet economics separate. Reread
  decision scope and the covered rows where dependent effects use them.
- **ARCH-S264-7** — Include material insurance applicability and RBP change decisions in
  the same readiness basis used for composition and the actual outgoing guards.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S264-1** — Staff see a verified active pet line and a prior ended line with
  distinct dispositions. The ended line and an unmapped lookalike cannot silently change
  the total.
- **BEH-S264-2** — Staff select the exact lines once and see the same selection in Full
  and the preview. Concurrent edits or changed source produce an exact review task.
- **BEH-S264-3** — Staff can explain $978 monthly and $35 one time. With one selected
  amount unresolved they see the named gap and any labeled known subtotal, with the
  current incomplete-offer hold.
- **BEH-S264-4** — Staff can see which charges changed and which were verified to stay the
  same. If only one line is verified, wording does not imply all others are unchanged.
- **BEH-S264-5** — An unverified $100 renewal fee never appears as a default. The
  previously accepted $50 processing amount cannot auto-charge without its applicable unit
  and other verified conditions. Staff can enter a different synthetic case amount under
  an authorized case source.

- **BEH-S264-6** — An owner approval or tenant answer retains the exact charges it
  covered. After a charge-only change staff see why the answer is earlier. They can record
  an ambiguous response without claiming it accepted the current offer.
- **BEH-S264-7** — Preparation remains available while a required transition decision is
  pending. Verified No can proceed. Verified Yes shows the exact link requirement. A
  relevant RBP change that is unknown keeps its review task.

**Human litmus outcome.**

### Explain the tenant offer’s charges before confirming it

**If this was built correctly:** A staff member can show each applicable charge and why it
appears, distinguish monthly and one-time money, and spot a missing fact or changed charge
before the tenant receives anything.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                   | Architecture outcome | Behavior outcome | Human litmus                                            | Deterministic evidence / falsification                                                       |
| ------------------------------------------------------------- | -------------------- | ---------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| R-S264-1 Map exact provider lines                             | ARCH-S264-1          | BEH-S264-1       | Explain the tenant offer’s charges before confirming it | AC-S264-1. Inventory and projection matrix including dated source resolution.                |
| R-S264-2 Give selection one owner                             | ARCH-S264-2          | BEH-S264-2       | Explain the tenant offer’s charges before confirming it | AC-S264-2. Compiled Guided/Full walkthrough and exact saved selection readback.              |
| R-S264-3 Calculate and label exact totals                     | ARCH-S264-3          | BEH-S264-3       | Explain the tenant offer’s charges before confirming it | AC-S264-3. Calculation fixtures and compiled reviewed amounts and admission.                 |
| R-S264-4 Compose accurate changes and continuity              | ARCH-S264-4          | BEH-S264-4       | Explain the tenant offer’s charges before confirming it | AC-S264-4. Exact text and claim/receipt protection against stale terms and charge revisions. |
| R-S264-5 Keep conditional policy source-bound                 | ARCH-S264-5          | BEH-S264-5       | Explain the tenant offer’s charges before confirming it | AC-S264-5. Fixture matrix and readback of no fee/policy changes or fabricated amounts.       |
| R-S264-6 Keep charge coverage with the answer                 | ARCH-S264-6          | BEH-S264-6       | Explain the tenant offer’s charges before confirming it | AC-S264-6. Exact decision snapshot, charge-only drift and affected packet checks.            |
| R-S264-7 Resolve material transition decisions before release | ARCH-S264-7          | BEH-S264-7       | Explain the tenant offer’s charges before confirming it | AC-S264-7. Material yes, no and unknown branches through actual outgoing guards.             |

**Preservation set.**

- S161 prep with incomplete facts and exact effect refusal, S189 one initial send, held
  follow-ups, tenant human reply pause and separate tenant decision.
- S153 base/inventory distinction, S234 approval coverage, S253 policy boundaries and
  unchanged existing action registry.
- Persisted wording, approved terms and earlier draft, send and receipt evidence across
  retries.

**Adversarial acceptance checks.**

- **AC-S264-1** — Drive the actual Admin mapping review, save and readback with an
  approved synthetic account mapping. Verify stale-version and wrong-role refusal. Use two
  distinct active source lines of one family with the same display label. Both survive
  selection, storage, total and exact reviewed text. Refuse a duplicate source ID. Also
  exercise expired and future-inapplicable lines, missing mapping or cadence,
  contradictory amounts and a legacy family-only record.
- **AC-S264-2** — Exercise current choices, legacy values, concurrency, explicit exclusion
  and refresh while saving. Start in Guided with disclosures closed and assert the exact
  actionable charge and separate totals before the preview. One owner and one effectful
  save path are observable.
- **AC-S264-3** — Check cent rounding, zeros, unsupported cadence, invalid money, missing
  amounts and a stale preview. Verify the separate totals and exact outgoing values.
- **AC-S264-4** — Test unchanged, mixed changes, policy transition, missing comparison and
  modified wording through preparation and exact review. Change a selected row's mapping
  or source version at the same amount after review. Refuse the stale draft export or send
  before claim, including scheduled dispatch. Reconcile an uncertain earlier attempt
  before any new action.
- **AC-S264-5** — Falsify normal, no-pet, ordinary multi-pet, assistance animal, insurance
  transition/no transition and unknown-policy paths. Verify no hidden default, charge
  write or change to unrelated preparation.

- **AC-S264-6** — Record an owner decision covering an exact offer and acceptance of its
  confirmed send. Change one applicable charge while keeping working base, dates and
  packet-policy version unchanged. The old answers and original message remain intact and
  cannot cover the changed charge. Repeat with amount-only approval, ambiguous reply, a
  verified external offer and a packet relying on a conflicting shared charge. Preserve
  existing independent preparation and send paths.
- **AC-S264-7** — Test selected insurance with unknown, verified No and verified Yes. For
  Yes, require the S265 flyer and case wording. For unknown, prove refusal through exact
  review, draft export and scheduled send while the draft is editable. Repeat for RBP
  unknown versus verified unchanged, new or changed, and a case where neither transition
  is relevant.

**Forbidden actions / hard gates.**

No global fee from speech or historic examples, guessed charge label or amount, provider
charge mutation, or live send as verification. Exact link and fee evidence stays source
pending until confirmed. Existing roles, scoped effects, exact-target authorization,
claims and receipt/reconciliation gates remain in force.

**Dependencies / sequencing.**

Consumes existing confirmed future base and renewal date, with S261–S263 supplying
corrected facts. S265 can be verified with exact synthetic link-applicability facts. S269
puts the active charge inputs first and S270 owns optional disclosure treatment.

**Standalone delivery contract.**

- **Deliverable now.** Shared selection and versioned Admin mapping, exact rows and
  totals, charge-aware decision coverage, conditional review/refusal and Help using
  verified or synthetic evidence.
- **Consumes, but does not assume.** Provider inventory and approved mapping/policy when
  available. Unresolved rows remain visible with their exact pending source.
- **Externally blocked effect.** AC-S264-5 leaves unverified actual fee treatment and its
  affected send or packet output blocked until exact case/policy evidence.
- **Produces for downstream suites.** The exact itemized offer snapshot and material
  transition decisions for owner/tenant evidence, links, affected packet review and S271
  qualification.

**Verification and delivery contract.**

1. Re-establish the current authorized baseline. Before editing, prove the named
   structural and behavioral failures for the expected reason. Where an assertion
   describes deployed behavior, record it as a separate preservation check.
2. Run inventory/mapping, arithmetic and composition checks, exact save/claim-basis
   fixtures and compiled tenant charge review. Use synthetic fixtures for effects and
   guarded read-only production probes where authorized. Run the affected Help and
   control-map checks.
3. For an authorized application candidate, run `bash scripts/verify.sh` and
   `npm run test:e2e:core`, complete the scoped S271 qualification on the exact build, and
   follow the current release gates.
4. Record `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` for the precise unresolved effect or input. Separate
   engineering, external and observed human verdicts.

**Ordered prompt sequence.**

1. Verify the starting behavior and register fail-first or preservation checks.
2. Baseline current selection and preparation on mixed-date and unmapped fixtures.
3. Add one selection and shared totals, then prove wording, conditional policy refusal and
   exact offer review.
4. Run the focused and applicable cumulative checks and record the actual outcomes.

**Deletion/merge recommendation.**

Keep active until its behavior, evidence and source-dependent boundaries are represented
by verified code, tests and current facts.
