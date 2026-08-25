<!-- spec-shape: overhaul-v1 -->
<!-- cherry-bridge-notes: N5, N7, N10 -->

# S72 — Renewal step model: the team's six steps, comps first, and a form link entered once

> New 2026-08-24 from the client's "Cherry Bridge Renewal Fixes Needed" notes **N10** ("Align the
> renewal page steps with our 6 steps"), **N7** ("The comp section needs to be first — we can't email
> the owner until it's done"), and **N5** ("This link never changes — don't make us paste it each
> time"). Owner decision Q8 = **A**: six steps, stable string ids, a migration, and the existing
> 8-stage vocabulary reconciled rather than a third one added. Specification only — this suite changes
> no product code until an implementation session picks it up.

**Goal.** The renewal page follows the team's own six steps, in their order, with the work they do
first placed first — and the one link that never changes is entered once in settings instead of pasted
onto every lease. Today the page shows a four-dot stepper over a five-card layout whose fourth card
belongs to no step at all, which is the most likely direct cause of the team's "all over the place"
complaint.

**What it is / how it functions.**

_Current state, verified in-repo._ `components/lease-renewal/RenewalWorkspace.tsx` walks "the four-step
process (Data check → Owner decision → Tenant offer → Build docs)" using `RENEWAL_STEPS` from
`lib/lease-renewal/desk-model.ts`, and `stage_index` in `lib/firestore/types.ts` is a **bare integer**
index into it. A second, different vocabulary already exists: `LEASE_RENEWAL_STAGES` in
`lib/lease-renewal/constants.ts` names eight stages. Neither is the client's six.

Mapped against the client's six steps:

- **Step 1 — collect onto the sheet.** Partial and pointing the wrong way. The data check reconciles
  two fields; pet info, deposit, Rhino, insurance, and inspection are collected nowhere. Sheet
  write-back is append-only, one field, Admin-gated, and off in production.
- **Step 2 — comps, then email the owner.** Built, but mis-stepped: the owner email lives in an unnamed
  card, and steps 2 and 3 are fused into one step called "Owner decision". The client says "zillow
  comps"; S43 forbids Zillow and the app ships RentCast. That is a naming mismatch to **raise**, not to
  silently satisfy.
- **Step 3 — owner decision onto the sheet.** Half. Captured in Firestore, never written to the sheet.
- **Step 4 — draft and send to tenants.** Best covered and governance-correct: an unsent draft, sent by
  a human from Gmail. Channel labels differ from `AC-S43-13`'s required wording.
- **Step 5 — email the hand-off contact, then dotloop.** **Entirely missing, three ways.** There is no
  tenant-response capture anywhere (`tenantResponded` is hardcoded `false` in all three production
  callers), no hand-off composer, and no stage to hang either on. The template contents are already
  named in discovery docs but were never promoted to a suite.
- **Step 6 — built → reviewed → shared → notify tenant.** Mostly missing. Packet truth cannot reach
  ready (no approved artifact catalog), no review state exists, the Dotloop provider is
  `production_allowed:false`, the "docs were sent" composer **exists but is orphaned** — reachable from
  no surface — and the webhook route is not on disk.

_Card order (N7)._ The owner-decision page renders decision → offered rent → RBP/insurance → form URL →
comps → screenshot → look-up → submit. Nothing pins that visual order in code or tests — the tests query
by label — so a reorder is mechanically safe. Nothing enforces the sequencing claim either: the submit
gate is decision plus a positive offered rent, client and server, and **no comp field is required
anywhere**.

_The form link (N5)._ `infoFormUrl` is per-lease only, persisted at
`lease_renewal_progress/{leaseId}.owner_decision.info_form_url`. No default exists anywhere in the
repository. Three Admin-config precedents already exist to hold one: the transactional destination doc,
the notice-rules global/property/lease scoped rule set, and owner-policy rules. Separately, the gated
Gmail composer never sends `infoFormUrl` at all, so a default alone would still be dropped there — the
constant and the composer must be fixed together or the team will still be pasting.

_Intended end state._ Six operator-facing steps keyed on **stable string ids**, with a migration from
today's bare integer. The comp fields sit at the top of the owner-decision step. The owner-email card
belongs to a named step. The info-form URL is an Admin setting with per-lease override, and the composer
actually carries it. Steps 5 and 6 exist as real stages with explicit "not built yet" states rather than
being absent from the model.

**Open questions & assumptions.**

- **Open — `Q-S72-COMP-GATE-STRENGTH`.** The client says they _cannot_ email the owner until comps are
  done. Should the submit gate **require** a comp value, or only order the page so comps come first?
  A hard gate blocks a legitimate no-comp-available case; ordering alone does not enforce the sequence.
  Ordering ships now; the gate waits on this answer.
- **Open — `Q-S72-ZILLOW-NAMING`.** The client says "zillow comps"; S43 forbids Zillow and the app ships
  RentCast. Raise this as a naming mismatch and ask what they want the label to read, rather than
  changing providers or silently relabeling.
- **Open — `Q-S72-STEP5-CONTACT`.** Step 5's hand-off recipient and template are named in discovery
  docs but never promoted. Confirm the recipient role and the template contents before building.
- **Assumption — `A-S72-SIX-STEP-IDS`.** Stable string ids, one per client step, are the persisted key;
  the integer index becomes a derived display concern only.
- **Assumption — `A-S72-FORM-URL-SCOPE`.** The info-form URL is global by default with a per-lease
  override, matching the notice-rules precedent rather than inventing a new scoping model.

**Cross-product impacts.** This is the suite with the widest blast radius in the Cherry Bridge set.
`stage_index` is a bare integer today, so **any** re-indexing silently relabels every live lease in
flight — the migration is the load-bearing part of this suite, not an afterthought. S43's canonical
workspace owns the surface and its channel labels. S25's execution contract and S18's process
definitions consume the stage vocabulary; reconciling the 8-stage `constants.ts` list with the six is
part of the work, not a follow-up. S34 (Dotloop) and S31 (reply watch) are the providers behind steps 5
and 6, both currently unavailable — so those steps ship as named, visible, honestly-empty stages. S75
supplies the waiting-on state that step 5 needs to become reachable at all.

**Adversarial acceptance checks.**

- **AC-S72-1** — the workspace renders exactly six named steps whose labels match the client's six, and
  the number of rendered step indicators equals the number of step-owning cards. A fixture with a card
  belonging to no step fails.
- **AC-S72-2** — the owner-email composer card is rendered inside a named step. A fixture asserting the
  card's containing step id is non-empty fails today and passes after the change.
- **AC-S72-3** — persisted renewal state keys its step by a stable string id, not a positional integer.
  A fixture that reorders the step list leaves every existing record pointing at the same step.
- **AC-S72-4** — the migration maps every pre-existing integer `stage_index` to its correct string id,
  and a lease mid-flight before the migration reads the same operator-visible step after it. A fixture
  covering each legacy index value asserts no lease silently changes step.
- **AC-S72-5** — on the owner-decision step, the comp fields render **above** the decision and
  offered-rent fields. This is asserted on rendered order, not by label lookup, so the current
  label-only tests cannot mask a regression.
- **AC-S72-6** — an Admin-set info-form URL is applied to a lease that has no per-lease value, a
  per-lease value overrides the Admin default, and clearing the per-lease value falls back to the
  default. No lease requires the URL to be pasted to reach a complete owner decision.
- **AC-S72-7** — the gated Gmail composer carries the resolved info-form URL into the draft. A fixture
  with a default set and no per-lease value asserts the URL is present in the composed draft body;
  today it is dropped, which is the regression guard.
- **AC-S72-8** — steps 5 and 6 exist in the model and render an explicit, readable not-built-yet state
  naming what is missing. A fixture asserts they are neither hidden nor rendered as complete.
- **AC-S72-9** — `markRenewalComplete` refuses a lease that has no drafted offer. A fixture with an
  owner decision recorded and no offer drafted fails to complete, closing today's gap where a renewal
  can be marked complete having never drafted an offer or seen a signature.
- **AC-S72-10** — exactly one stage vocabulary is reachable from the renewal surfaces. A test asserts
  the 8-stage `constants.ts` list and the operator-facing six are reconciled to a single source, so a
  third vocabulary cannot be added by accident.
- **AC-S72-11** — the tenant-facing channel labels match `AC-S43-13`'s required wording exactly.

**Forbidden actions / hard gates.** No autonomous, scheduled, bulk, or model-triggered client-facing
send. Step 4 keeps its governance shape: an **unsent** draft that a human sends from Gmail — this suite
reorders and renames steps, it never adds a send path. No step re-indexing may ship without the
migration and `AC-S72-4` green; relabeling live leases mid-flight is the one failure this suite exists
to avoid. Do not adopt "Zillow" as a label or a provider to satisfy `Q-S72-ZILLOW-NAMING`; S43 forbids
it and the app ships RentCast. Do not add a hard comp gate before `Q-S72-COMP-GATE-STRENGTH` is
answered. Steps 5 and 6 render honest empty states; they must never render as complete or as available
while their providers are `production_allowed:false`. The Sheet write-back stays append-only and
Admin-gated; this suite does not widen it.

**Ordered prompt sequence.**

1. Define the six stable string step ids and reconcile them with `LEASE_RENEWAL_STAGES`.
2. Write the integer→string migration and prove `AC-S72-4` on every legacy index value.
3. Re-point the workspace stepper and cards at the string ids; give the owner-email card a named step.
4. Reorder the owner-decision step so comp fields render first; pin the order with a rendered-order test.
5. Add the Admin info-form-URL setting with per-lease override.
6. Carry the resolved URL into the gated Gmail composer.
7. Add steps 5 and 6 as named stages with explicit not-built-yet states.
8. Tighten `markRenewalComplete` to require a drafted offer.
9. Align channel labels to `AC-S43-13`.
10. Raise `Q-S72-ZILLOW-NAMING`, `Q-S72-COMP-GATE-STRENGTH`, and `Q-S72-STEP5-CONTACT` to the client as
    confirm-with-default questions.

**Deletion/merge recommendation.** Keep as its own suite and treat it as the largest of the six. Do not
merge into S43 — S43 is the canonical workspace surface contract; this is the step model beneath it, and
merging would bury the migration. Once `Q-S72-STEP5-CONTACT` resolves, the hand-off composer may be
split into its own suite rather than growing this one. Retire `A-S72-SIX-STEP-IDS` and
`A-S72-FORM-URL-SCOPE` into `docs/facts.md` after the migration ships green.
