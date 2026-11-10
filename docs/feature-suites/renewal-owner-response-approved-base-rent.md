<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-walkthrough-2026-11-10 -->

# S262 — Record the exact base rent an owner approved

> Status: AUTHORING READY, intake 140. Thursday fixes. Implementation and verification
> pending.

**Goal.**

Staff record the exact owner-approved base once, see which terms the evidence covers, and
find that amount in the tenant preparation.

**Current state / intended end state.**

S234 records one owner outcome and binds approval coverage to current terms and evidence.
The current recommendation editor and the tenant working base both read the working rent.
The walkthrough's different approved amount exposes the need to distinguish their
meanings. The recorded response will set future working rent with the actual coverage and
preserve the proposed amount as its own fact.

**Actors and entry conditions.**

A staff member with existing case-scoped owner-outcome and working-terms capability opens
Ask the owner from its reply or existing manual response path. An owner or verified
authorized representative supplies the answer. Permitted readers inspect the recorded
source and scope.

**What it is / how it functions.**

Open the existing owner response, select the actual outcome, and enter or verify Amount
approved when the owner explicitly approved an amount. Review party, evidence, scope and
the old and new working base before saving. Reopen the response or prepare the tenant
offer from resulting working terms. When no exact amount is established, record only the
outcome the evidence supports.

Ask the owner opens **Record the owner's answer** for an eligible known answer. Put
Outcome first, then **Amount approved** for the approving branch, then the evidence source
and explicit review/save. Show old recommended base and the actual approved base in
review, with the coverage named. The same edit is reached from an eligible linked reply
and the manual response action. Working renewal dates remain their own fields in this
outcome. After a saved response, read the current working base and coverage and offer
**Continue to Offer the tenant** where available. The action opens the existing tenant
preparation and never authorizes sending.

### Recommendation, approval and offer basis

Keep `terms_rent` as the canonical working renewal base for exact tenant and document
terms. When a reviewed response sets the approved base, preserve the prior recommendation
and its provenance in the same transaction, under the exact lease/cycle. Read the
recommendation independently after the values diverge. Compare market rent remains its
only editor and Ask the owner reads that value, with a separately labeled recorded
approval where present. Prior exact owner drafts keep their original basis and bytes.

Before an independent approved or explicitly adopted working amount exists, an ordinary
staff recommendation continues to supply the working amount under the existing S156/S249
contract. On a legacy cycle where one undifferentiated working value still served both
purposes, retain that behavior. If the existing outcome proves the working value is an
approval and the earlier recommendation cannot be established, show the earlier
recommendation as unavailable. Do not copy approved rent back into it.

After an independent working amount exists, editing the recommendation alone leaves the
offer basis and any existing approval coverage intact. If an authorized staff member needs
to change the working amount outside the owner response, use **Use this amount for the
offer** next to the recommendation. Show it only for an eligible differing amount. Use the
existing working-term save and review. Recheck the reviewed proposal and working revisions
and active cycle together before applying that amount. The deliberate change updates
future working base, keeps the recorded owner answer and makes dependent coverage or
previews stale as applicable. It confers no owner approval. The applicable assisted
keep-current and verified standing-rule choices retain their own reviewed writers and the
same cycle check. The recommendation still has one editor.

### Current-cycle future terms

The existing work record is the authority for the active cycle. Bind the recommendation,
working renewal base, renewal start and renewal end to the lease ID and cycle ID in the
existing working-record path. The current rent, current lease facts and housing assistance
retain their lease-level scope. Entering the lease or reading the desk never creates a
cycle. When there is no work record, the existing explicit first-save path can establish
the lease-bound work record and bind the saved field to the resulting cycle. Preserve that
path when the source date is missing and recheck the exact identity before saving. A new
source date or month filter alone does not create a new cycle.

On reads, use a future value as current only with its exact active cycle and revision. The
shared term and recommendation projections apply this rule for the desk, Guided and Full,
draft and send composition, packet preparation, and any reviewed source-update preview
that consumes future terms. Exact claims and scheduled dispatch recheck the cycle and
basis. Restoring or continuing the same cycle preserves that cycle's terms. A genuine new
cycle starts with no current future terms until they are entered, adopted or validly
prepared for that cycle. Keep previous values and their receipts as history.

For a legacy value without a cycle binding, reuse it only if existing evidence ties its
exact field revision and purpose to the active cycle. For example, an exact existing
review that binds the lease, cycle and working field revisions can establish the future
terms it reviewed. A review that did not record a recommendation cannot establish one. If
the value is unbound, show it as an earlier or unverified value. The existing field owner
can explicitly confirm or replace it for the current cycle with a fresh revision check.
Until then it is neither a current fact nor proof of an empty field for batch preparation.
A value proven to belong to an earlier cycle cannot populate the new cycle. A valid new
proposal can fill an authoritatively empty current-cycle field under the existing S249
rules. Preserve earlier accepted and uncertain operations under their original IDs. Unsent
work using unverified legacy terms needs an exact current review.

- **R-S262-1 — Capture an explicit approved base.** Expose one Amount approved field on
  the approving response branch. Use existing USD cents validation. Never silently copy
  the recommendation, payment total or a number parsed from unverified text. An exact
  amount matching the recommendation can be explicitly affirmed. Decline, counterproposal,
  no response and unsupported amounts retain their supported outcomes without an
  approved-rent update.
- **R-S262-2 — Save the outcome and future rent together.** Explicit reviewed save commits
  the response and app-owned future base to the exact lease and cycle with the working,
  proposal and outcome revisions checked. Preserve the recommendation through the distinct
  projection above. The usual working-terms projection carries the approved value into
  tenant preview and exact review. Keep the current lease, historical drafts, separately
  entered dates and provider records. Legacy records keep their actual previous coverage.
- **R-S262-3 — Keep approval scope truthful.** Use amount-only approval when evidence
  covers only base. Record broader scope only to the extent the evidence supports it. Full
  offer-charge coverage requires the exact S264 offer snapshot that the owner approved,
  including the resulting approved base. The existing S234 packet economics approval
  remains scoped to its calculated or approved packet facts. An unchanged packet hash
  cannot establish approval of different offer charges. An amount-only approval covers
  only its exact current-cycle working-base revision. A later base revision makes it
  earlier evidence. A date or charge change never expands that scope. Legacy records
  retain their actual covered facts. Existing independent S156/S161 preparation and send
  paths retain their own gates.
- **R-S262-4 — Preserve communications evidence.** Show an unresolved provider send with
  its own reconciliation action before retry. Staff-recorded outreach and responses retain
  actual provenance and use the same editor from linked verified replies or the manual
  path. Tenant decision and signatures remain distinct.
- **R-S262-5 — Read and save future terms in the exact cycle.** Apply the current-cycle
  rule above to recommendation, working base and working dates, including first-save,
  legacy and rollover. Only the authoritative current-cycle projection feeds a new review
  or effect. An unresolved source or unbound value holds its dependent operation.
  Historical evidence and separately usable lease facts remain accessible.

**In scope / out of scope.**

Exact owner response, future working base and downstream approval scope. No new automatic
approval extraction, reply-triggered drafts, standing coverage, provider rent writes or
sends.

**Open questions & assumptions.**

- An amount-only reply leaves the owner’s position on dates and other charges
  unestablished. Use existing coverage review for any dependent action.
- Previous responses retain their actual scope and are not backfilled with a supposed
  approved amount.

**Cross-product impacts.**

Ask the owner and Owner approval, linked reply, working terms and owner outcome
transaction, Offer the tenant, exact packet readiness, and Help and control map.

**Authority and evidence map.**

| Input                                                                                                                                          | Classification                  | Use and limitation                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------- |
| November 10 Fathom walkthrough 30:45–34:41 and 35:45–39:00, plus accepted Q1                                                                   | Observed gap and owner decision | Record the actual approval and keep manual outreach distinct from an uncertain attempt. |
| S234, S248, S249, S156 and S161                                                                                                                | Active contracts                | Owner coverage, evidence, preparation independence and exact effects.                   |
| `lib/firestore/renewal-workspace.ts`, `lib/lease-renewal/owner-approval-coverage.ts` and `components/lease-renewal/RenewalManualWorkspace.tsx` | Committed implementation        | One existing outcome and transaction plus the shared response editor.                   |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S262-1** — Extend S234’s one outcome with the explicit reviewed amount and
  source. Reuse the existing party, channel, timestamp and evidence boundaries and support
  older records.
- **ARCH-S262-2** — Extend the existing S234 transaction and idempotency/readback. A
  concurrent edit or partial failure cannot leave just one new value.
- **ARCH-S262-3** — Use typed scope at the approval boundary. Exact-term and packet
  admission distinguish amount-only from a hash covering exact terms and charges.
- **ARCH-S262-4** — Maintain S248/S189 effect and outcome records and existing verified
  reply binding. The response save creates no mail operation or provider receipt.

- **ARCH-S262-5** — Reuse the existing work and working-record boundaries. Validate the
  scope of a field before any consumer can read it as current. Save against the same
  authoritative cycle and revisions, including the exact recommendation basis on adoption.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S262-1** — For a synthetic $1,850 recommendation and $1,875 approval, review names
  both and saves $1,875 as approved. An ambiguous or nonapproving response cannot populate
  it.
- **BEH-S262-2** — Reopening both views and the tenant draft shows the same new working
  base. A newer staff edit rejects the old save with the exact recovery. A lost
  acknowledgement resolves that save before another attempt.
- **BEH-S262-3** — An owner reply approving only $1,875 reads as amount-only. Changing a
  date cannot make it approval of that date. A verified full reply follows existing
  review.
- **BEH-S262-4** — Staff see the same unconfirmed attempt and how to check it. They can
  record independently known facts with their source without marking the attempted send as
  confirmed.

- **BEH-S262-5** — On reopening the same lease in a new cycle, staff see prior future
  terms as history and can enter current terms. A legacy value with proven current scope
  remains usable. An unbound one asks for deliberate confirmation in its owner.

**Human litmus outcome.**

### Enter the owner’s actual answer once

**If this was built correctly:** A staff member enters the different approved base, sees
what the reply covers, then opens a tenant draft using that amount without retyping it or
assuming the whole offer was approved.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                            | Architecture outcome | Behavior outcome | Human litmus                         | Deterministic evidence / falsification                                               |
| ------------------------------------------------------ | -------------------- | ---------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| R-S262-1 Capture an explicit approved base             | ARCH-S262-1          | BEH-S262-1       | Enter the owner’s actual answer once | AC-S262-1. Rendered review and persisted amount and evidence.                        |
| R-S262-2 Save the outcome and future rent together     | ARCH-S262-2          | BEH-S262-2       | Enter the owner’s actual answer once | AC-S262-2. Atomic revision pair and exact tenant preview with no unrelated mutation. |
| R-S262-3 Keep approval scope truthful                  | ARCH-S262-3          | BEH-S262-3       | Enter the owner’s actual answer once | AC-S262-3. Coverage matrix and dependent refusal with independent paths preserved.   |
| R-S262-4 Preserve communications evidence              | ARCH-S262-4          | BEH-S262-4       | Enter the owner’s actual answer once | AC-S262-4. Guarded browser and ledger readback with effects counted.                 |
| R-S262-5 Read and save future terms in the exact cycle | ARCH-S262-5          | BEH-S262-5       | Enter the owner’s actual answer once | AC-S262-5. Active-cycle and legacy readback through actual consumers.                |

**Preservation set.**

- S234 one outcome, conflict behavior and exact coverage, plus S250 verified standing
  agreements.
- S249 recommendation owner, S261 current base, S224 sender and S163 greeting.
- S156 independent preparation and S248/S189 distinction between observed work, attempted
  mail and confirmed receipt.

**Adversarial acceptance checks.**

- **AC-S262-1** — Try wrong party, stale or unlinked evidence, invalid precision, missing
  amount and explicit different/same amount through the route. In Guided and Full, verify
  Outcome, conditional Amount approved, evidence and review/save order. Inspect the
  outcome.
- **AC-S262-2** — Run Firestore cases for concurrent edits, partial failure, replay and
  wrong cycle. Confirm prior receipts and recommendation/current lease/source bytes are
  preserved. On a synthetic different-amount approval, inspect the recommendation and
  approved working base in both views. Edit the recommendation and prove the offer stays
  on the approved basis. Then explicitly adopt the revised working amount, prove exact
  stale-coverage handling and retain the earlier answer. Verify legacy and empty-only S249
  preparation paths separately.
- **AC-S262-3** — Falsify with amount-only, full terms, later changes, standing authority,
  earlier revision evidence and conflicting outcomes. Change only a selected offer charge
  with the same working base and dates and the same legal packet policy. The earlier owner
  decision retains its actual scope and cannot cover the new charges. Preserve independent
  preparation and its existing admission.
- **AC-S262-4** — Inject uncertain send, independently known response and stale response
  revision. Verify no duplicate attempt or manufactured sent state.

- **AC-S262-5** — Complete one cycle, open a real new cycle for the same lease, and leave
  its previous recommendation, approved rent and dates in storage. Assert the desk, both
  views, exact tenant review, scheduled send and packet read each reject those values as
  current. Enter new terms through the real owners and verify only those flow. Include a
  same-cycle restore, first saved work with no dated basis, a proved current legacy field,
  an unbound legacy field, and a late edit or retry from the prior cycle. An adoption
  against a changed proposal revision must refuse even when the existing working-base
  revision is unchanged. Preserve earlier evidence and lease-level facts.

**Forbidden actions / hard gates.**

No authority inferred from forwarded or unmatched mail, uncertain sends, newly edited
terms or amount-only replies. No provider write or automatic dispatch. Existing roles,
scoped effects, exact-target authorization, claims and receipt/reconciliation gates remain
in force.

**Dependencies / sequencing.**

Reuse S234 and the current work and working-record boundaries. S263 and S264 consume the
same current-cycle future terms. Before S264 is available, record only the evidenced owner
scope available to this slice. Use exact synthetic offer evidence to test the shared
decision boundary and prove refusal without it. Existing packet-only approval retains its
own coverage. S269 positions the fields through the same owners.

**Standalone delivery contract.**

- **Deliverable now.** Shared response UI, atomic amount and coverage, current-cycle
  projection and legacy refusal across actual consumers, tenant preview, conflict recovery
  and Help.
- **Consumes, but does not assume.** Existing verified response and working revisions. An
  unverified amount stays unset.
- **Externally blocked effect.** AC-S262-3 holds exact-term-dependent approval readiness
  where only an amount is approved.
- **Produces for downstream suites.** Auditable approved base and evidence scope for offer
  and packet consumers.

**Verification and delivery contract.**

1. Re-establish the current authorized baseline. Before editing, prove the named
   structural and behavioral failures for the expected reason. Where an assertion
   describes deployed behavior, record it as a separate preservation check.
2. Run owner approval, effective terms, Firestore transaction and compiled owner-to-tenant
   cases. Use synthetic fixtures for effects and guarded read-only production probes where
   authorized. Run the affected Help and control-map checks.
3. For an authorized application candidate, run `bash scripts/verify.sh` and
   `npm run test:e2e:core`, complete the scoped S271 qualification on the exact build, and
   follow the current release gates.
4. Record `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` for the precise unresolved effect or input. Separate
   engineering, external and observed human verdicts.

**Ordered prompt sequence.**

1. Verify the starting behavior and register fail-first or preservation checks.
2. Establish exact amount and coverage fixtures on the current transaction.
3. Build the single reviewed field and atomic carry-forward, then test stale saves, old
   records and dependent previews.
4. Run the focused and applicable cumulative checks and record the actual outcomes.

**Deletion/merge recommendation.**

Keep active until its behavior, evidence and source-dependent boundaries are represented
by verified code, tests and current facts.
