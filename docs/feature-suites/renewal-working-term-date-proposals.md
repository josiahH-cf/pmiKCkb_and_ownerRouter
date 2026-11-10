<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-walkthrough-2026-11-10 -->

# S263 — Propose renewal dates from the verified current term

> Status: AUTHORING READY, intake 141. Thursday fixes. Implementation and verification
> pending.

**Goal.**

Staff can see the current lease end and review a supported next-term date suggestion
without hunting for the fields or carrying guessed dates into a tenant offer.

**Current state / intended end state.**

The current lease and proposed working dates are distinct facts. S103 handles term
classification and periodic review. The existing working-date inputs feed tenant
composition, which currently marks missing dates. The walkthrough required scrolling,
finding the conflict and entering both dates, including correcting a year selection. The
intended change supplies a precise start when safe and keeps the date editor reachable
from the offer.

**Actors and entry conditions.**

A staff member opens Check the numbers or an Offer the tenant readiness item for the exact
lease and cycle. A scoped Editor may accept or enter working dates. A read-only role sees
verified facts and readiness. A disputed lease end, pending conversion, inspection-only
lease or different intended term cannot supply an automatic proposal.

**What it is / how it functions.**

Distinguish Current lease ends from Working renewal starts and Working renewal ends. Staff
follow the exact date control when the offer needs a date, review the supported suggestion
and enter any missing or exceptional date, then return to the same offer and read the
updated preview. Keep the existing Working renewal terms owner in Ask the owner and Owner
approval (`renewal-working-terms`). Use exact targets for the two existing working-record
fields, `terms_effective_date` and `terms_end_date`. Check the numbers owns the current
lease facts and their correction. Offer the tenant and Check the numbers can lead to the
appropriate working date input without mounting another editor.

Use separate exact fix names for **Verify current lease end**, **Enter renewal start
date** and **Enter renewal end date**. The first opens Check the numbers and its source
correction. The last two open the respective working field in Ask the owner. With both
working dates missing, start comes before end. Returning through **Return to tenant
offer** restores the same offer and its entered values.

### Verified lease end and the staff choice

Use a shared current lease-end fact for Check the numbers, the date proposal and the
lease-end sentence in the tenant offer. Resolve it from the exact current RentVine lease
read and the existing verified source and discrepancy decisions for that lease. A raw
provider date with unresolved contrary evidence, a stale read or an unreadable
authoritative basis is not verified. If current controls cannot resolve the source
disagreement, show **Verify current lease end** and keep only the dependent review held. A
staff-entered renewal date does not resolve a contractual source disagreement.

For an eligible fixed-term case with a verified end, an empty current-cycle start and no
recorded noncontiguous or incompatible renewal decision, show the date and **Use the day
after the current lease ends** in Working renewal terms. This is an option beside manual
entry. Explicitly choosing it and completing the existing save establishes intent to
continue without a gap for this case. The act of loading the suggestion neither saves a
date nor assumes a fixed future term. Keep any existing confirmed working start and its
basis.

Suggest an end only when exact case evidence supplies an intended duration and calendar
convention for the chosen start. When that basis is absent, as with the existing date
fields alone, **Enter renewal end date** is the ordinary path. No new duration input or
default is required for this batch. If the chosen start changes, recalculate only a
still-unsaved suggestion from current evidence. Preserve a previously saved end and
surface any resulting inconsistency for exact review.

- **R-S263-1 — Propose the next calendar day.** Offer the explicit next-day choice above
  through the existing working-date editor on an eligible verified fixed term. Use
  date-only arithmetic on the authoritative inclusive lease end. Preserve the calendar
  display convention. Save only on the case-specific deliberate choice after checking the
  active cycle, current verified end and the field revision.
- **R-S263-2 — Suggest an end only with a known term.** Propose a renewal end only when an
  authoritative intended duration and inclusive/exclusive convention determine a unique
  date for that lease and cycle. Where there is no such basis or month-end and leap rules
  make the outcome ambiguous, leave the end editable and say what is needed. Existing
  policy for valid specific dates is preserved. The walkthrough example does not establish
  a default year, day of month or term length.
- **R-S263-3 — Preserve confirmed working dates.** Use one existing lease/cycle
  working-date editor and the S262 current-cycle read and write rule. Suggest only for the
  corresponding authoritatively empty field. A staff-entered or explicitly accepted date,
  including a supported intentional gap, wins over a suggestion. A stale source basis or
  concurrent edit leaves the latest saved dates and calls for exact review. Reject invalid
  dates, inverted ranges and unsupported conflicts before dependent review.
- **R-S263-4 — Keep original, proposed and reviewed dates legible.** Keep the original
  verified source date, displayed proposal and saved working date distinguishable. Use the
  same verified current end in the offer preview, exact reviewed payload, draft export and
  send basis, including scheduled dispatch. A stale or disputed basis holds the affected
  outgoing review. Show its exact fix in Work and preserve the preparation and return
  context. A legal executed-on date and an offer follow-up date receive no value here.

**In scope / out of scope.**

One date-only proposal and a reachable working-date editor for renewal term dates. No
provider term correction, month-to-month classification change, default offer cadence or
legal-form date rule.

**Open questions & assumptions.**

- An unresolved current lease end is source pending for the proposal and the offer's
  contractual end-date statement. Staff can still enter supported working terms and
  prepare an incomplete draft.
- A case with no authoritative future duration and convention uses manual end-date entry.
  The walkthrough example establishes no shared length or day of month.

**Cross-product impacts.**

Check the numbers and Lease details, working record and exact revision, Offer the tenant
and Tenant offer and response, downstream document terms and Help. S269 and S270 consume
the exact date owner and read-only source facts.

**Authority and evidence map.**

| Input                                                                                                                                         | Classification                   | Use and limitation                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| November 10 Fathom walkthrough 39:20–42:59, plus accepted Q2                                                                                  | Demonstration and owner decision | Current end, missing dates, calendar entry and verification. The proposed start rule is limited to the supported contiguous case. |
| S103, S113, S156, S161 and S249                                                                                                               | Active contracts                 | Keep current term classification, source verification and working terms distinct from message preparation and send.               |
| `components/lease-renewal/RenewalManualWorkspace.tsx`, `lib/lease-renewal/effective-terms.ts`, `lib/lease-renewal/renewal-message-content.ts` | Committed implementation         | Existing working-term controls, current terms projection and date placeholders supply the integration points.                     |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S263-1** — One pure proposal consumes the shared verified current-end fact, its
  source fingerprint and the fixed-term eligibility. It projects into the existing editor
  without saving. The real editor's explicit choice supplies the case intent and accepts
  only that reviewed start against the current cycle and revision.
- **ARCH-S263-2** — Require explicit support for duration and convention in the same
  proposal projection. No placeholder date enters the authoritative effective-terms
  projection.
- **ARCH-S263-3** — Reuse the existing working-record save and date validation. Check both
  source basis and current revision at acceptance. Keep historical source and prior
  reviewed artifacts separate.
- **ARCH-S263-4** — The same verified end and basis feed suggestion, message composition,
  review, draft claim and initial or scheduled send. Preserve existing route and section
  anchors. A material change invalidates the dependent review while retaining saved
  working dates and historical evidence.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S263-1** — A synthetic current term ending November 30 proposes December 1.
  December 31 proposes January 1 of the next year, and leap/year cases follow the calendar
  without timezone shifts.
- **BEH-S263-2** — For a synthetic, expressly reviewed January 1 through December 31
  one-year term the full range is proposed. A shorter term, unknown duration or ambiguous
  month-end asks staff for the exact end.
- **BEH-S263-3** — On return from the offer, a permitted correction remains and the same
  preview updates. A stale suggestion cannot replace the current choice. An invalid year
  or date shows the exact field to correct.
- **BEH-S263-4** — The staff member uses the visible fix to reach the correct start or end
  field, saves and returns to the same offer. Inspection alone leaves all dates untouched.

**Human litmus outcome.**

### Verify the lease dates before reviewing the offer

**If this was built correctly:** A staff member can explain where each date came from,
accepts an applicable next-day start or enters the actual working dates, and returns to
the same tenant preview with the exact reviewed range.

- Model verdict: NOT RUN
- Human verdict: NOT RUN — no human observer

**Requirement-to-outcome traceability.**

| Requirement                                                 | Architecture outcome | Behavior outcome | Human litmus                                      | Deterministic evidence / falsification                                                 |
| ----------------------------------------------------------- | -------------------- | ---------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| R-S263-1 Propose the next calendar day                      | ARCH-S263-1          | BEH-S263-1       | Verify the lease dates before reviewing the offer | AC-S263-1. Proposal fixtures and the existing Guided and Full edit destination.        |
| R-S263-2 Suggest an end only with a known term              | ARCH-S263-2          | BEH-S263-2       | Verify the lease dates before reviewing the offer | AC-S263-2. Date proposal and missing-field output across representative term variants. |
| R-S263-3 Preserve confirmed working dates                   | ARCH-S263-3          | BEH-S263-3       | Verify the lease dates before reviewing the offer | AC-S263-3. Working revision, prepared body, exact review and refusal assertions.       |
| R-S263-4 Keep original, proposed and reviewed dates legible | ARCH-S263-4          | BEH-S263-4       | Verify the lease dates before reviewing the offer | AC-S263-4. Compiled navigation, state continuity and claim-basis preservation.         |

**Preservation set.**

- S103 fixed-term and periodic review, S248 actual evidence, and scoped S156 preparation.
- Current lease versus working dates, legacy verified manual values, and existing exact
  message/packet review, stale basis and recovery.
- Existing legal executed-on hold, notice and follow-up timing, and explicit source-write
  review.

**Adversarial acceptance checks.**

- **AC-S263-1** — In the real compiled editor, start with an ordinary fixed case, a
  verified end and no stored future term intent. The next-day action is available and
  saves only after the deliberate choice. Test year and leap transitions, date-only
  arithmetic and missing, disputed, stale, non-renewal and month-to-month sources. No
  ineligible case offers a suggestion.
- **AC-S263-2** — Exercise known exact duration and convention, short term, deliberate
  gap, leap anniversary and absent convention. With the existing date fields alone, the
  end remains a reachable manual input and no term length is assumed. Change the start
  after an end was entered and verify the saved end stays visible for review.
- **AC-S263-3** — Drive correction, explicit suggestion acceptance, old records and
  concurrent reloads. Exercise a new cycle on the same lease with the earlier dates still
  in storage. The new offer and packet cannot read them as current. No source write is
  made.
- **AC-S263-4** — Use keyboard/deep link from offer in both views with blank, valid,
  changed and unavailable dates. Inspect current lease, working terms and outreach dates
  separately. With a conflicting raw end and unresolved verification, neither the
  suggestion nor outgoing review may use that raw value. After resolving the source,
  verify the same confirmed end in the proposal and exact draft and send payload. Verify
  the exact return target and retained offer entries. Change the verified basis after
  scheduling and check refusal before the affected claim.

**Forbidden actions / hard gates.**

No fabricated duration, term conversion, provider write, approved date or automatic send.
Preserve the current S253 date hold. Existing roles, scoped effects, exact-target
authorization, claims and receipt/reconciliation gates remain in force.

**Dependencies / sequencing.**

Uses S103/S113 and existing working-record sources. S262 and S263 update distinct terms
through the same revisioned record. S264 can use an existing confirmed effective date and
the exact draft remains available with a date hold.

**Standalone delivery contract.**

- **Deliverable now.** Reachable next-day choice, verified current-end parity, date
  validation, manual end-date fallback, exact navigation, refusal, old-record
  compatibility and Help.
- **Consumes, but does not assume.** Current-cycle future fields under S262, verified
  contract end and applicable duration/convention where available. Start can be chosen
  from the verified end without a general duration rule. Otherwise use the exact manual or
  source correction path.
- **Externally blocked effect.** AC-S263-2 and AC-S263-3 hold the affected output until
  required verified dates are recorded.
- **Produces for downstream suites.** The same dated working terms for offer charges,
  message and packet readiness.

**Verification and delivery contract.**

1. Re-establish the current authorized baseline. Before editing, prove the named
   structural and behavioral failures for the expected reason. Where an assertion
   describes deployed behavior, record it as a separate preservation check.
2. Run date-only boundary tests, exact workspace/save and preparation tests, and both
   compiled offer navigation paths. Use synthetic fixtures for effects and guarded
   read-only production probes where authorized. Run the affected Help and control-map
   checks.
3. For an authorized application candidate, run `bash scripts/verify.sh` and
   `npm run test:e2e:core`, complete the scoped S271 qualification on the exact build, and
   follow the current release gates.
4. Record `ALL_GATES_GREEN` only for completed verification, `BUDGET_EXHAUSTED` only under
   an explicit budget, and `BLOCKED` for the precise unresolved effect or input. Separate
   engineering, external and observed human verdicts.

**Ordered prompt sequence.**

1. Verify the starting behavior and register fail-first or preservation checks.
2. Identify the current source and editor ownership for both date facts and capture the
   missing-date baseline.
3. Implement the supported proposal, stale protection and exact route back to the offer.
4. Run the focused and applicable cumulative checks and record the actual outcomes.

**Deletion/merge recommendation.**

Keep active until its behavior, evidence and source-dependent boundaries are represented
by verified code, tests and current facts.
