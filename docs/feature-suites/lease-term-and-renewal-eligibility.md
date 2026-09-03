<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-completion-v1 -->

# S103 — Lease term and renewal eligibility

> Status: Specified from the 2026-09-03 owner package; not implemented. The cohort classifier already
> excludes month-to-month leases through heuristic provider keys but shows no term, records no
> review anchor, and cannot represent an explicit `needs review` term.

**Goal.**

Every lease is visibly `Fixed-term`, `Month-to-month`, or `Needs review`; fixed-term work follows the
verified end date through the existing renewal window, and month-to-month leases surface for an
annual review instead of reappearing as monthly renewals.

**Current state / intended end state.**

| Package requirement (PMI-02)                            | Classification    | Evidence                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Use the provider field when reliable                    | Partially         | `lib/lease-renewal/cohort.ts` matches `isMonthToMonth`/`leaseType`/`term`-style keys heuristically against the export row, which carries none of them; bodyless discovery on 2026-09-03 proved the lease detail (`GET /leases/{leaseID}`) carries `isMonthToMonth`, `monthToMonthStartDate`, and `hasPendingMonthToMonthConversion` |
| Visible term in lease and renewal views                 | Missing           | Desk rows carry only the cohort reason label `Month-to-month` for skipped rows (`lib/lease-renewal/desk-model.ts`); no term column, status, or workspace fact                                                                                                                                                                       |
| Dates are evidence, not the classifier                  | Partially         | `classifyRenewalCohort` routes no end date to `review`; an expired end date still classifies as out-of-window fixed-term                                                                                                                                                                                                            |
| Fixed-term enters the window from the verified end date | Already satisfied | `buildRenewalDeskWindow` (`lib/lease-renewal/desk-query.ts`) and `retentionFor` in `live-desk.ts`                                                                                                                                                                                                                                   |
| Month-to-month leaves the monthly cycle                 | Already satisfied | Skip disposition `Excluded from the renewal workflow`                                                                                                                                                                                                                                                                               |
| Annual review anchor                                    | Missing           | No review anchor, review scope, or recorded next review point                                                                                                                                                                                                                                                                       |
| Recalculate everywhere the term changes                 | Missing           | No app-owned term record exists to change                                                                                                                                                                                                                                                                                           |
| Reuse RentVine writeback if representable               | Unsupported       | S97 writes only `endDate` and `increaseEligibilityDate`; no documented term field is writable                                                                                                                                                                                                                                       |

Intended end state: one `leaseTerm` projection (`fixed_term` | `month_to_month` | `needs_review`)
derived from proven provider evidence plus one app-owned, audited term-review record when provider
evidence is absent or contradictory; the desk, workspace, and assistant show it; month-to-month rows
belong to a `Periodic review` scope with a review anchor and next review date.

**Actors and entry conditions.**

A renewal operator views term facts. A Renewals-space Editor may record or correct the app-owned
term review for one exact lease. Entry needs the current live lease generation; a stale or partial
read keeps the existing `Needs verification` behavior. No provider write is part of this suite.

**What it is / how it functions.**

1. **Provider evidence.** S102's lease-detail enrichment places `isMonthToMonth` (exact `"1"`/`"0"`
   string), `monthToMonthStartDate` (ISO date or null), and `hasPendingMonthToMonthConversion`
   (boolean) on the lease view. Replace the heuristic key list in `DEFAULT_COHORT_CONFIG.skipSignals`
   with the exact `isMonthToMonth === "1"` signal; keep the heuristic as a fixture-only compatibility
   path for flat legacy fixtures.
2. **Term projection.** `projectLeaseTerm(view, review)` returns `month_to_month` when
   `isMonthToMonth` is `"1"` or the current review record says so; `fixed_term` when
   `isMonthToMonth` is `"0"`, a current or future end date exists, and no pending conversion is
   flagged; otherwise `needs_review`. An expired end date, a missing end date, a pending
   month-to-month conversion, an unavailable detail read, or a signal that contradicts the dates
   yields `needs_review`, never a silent classification.
3. **Term review record.** New app-owned collection `lease_renewal_term_reviews` (one current record per
   lease, versioned and audited like `lib/firestore/lease-renewal-resolutions.ts`) holding
   `term`, `anchorDateIso` (month-to-month start, conversion, or last review date), `reason`,
   `recordedByUid`, and the source fingerprint of the lease view the person saw. A drifted
   fingerprint marks the record stale and the term returns to `needs_review`.
4. **Eligibility.** Fixed-term leases keep the current window, retention, and cohort behavior.
   Month-to-month leases move from `skip` to a new `periodic_review` disposition with
   `anchorDateIso` = the provider `monthToMonthStartDate` when present, else the app-recorded
   anchor, and `nextReviewIso = anchorDateIso + 12 months` (owner direction 2026-09-03). Rows whose
   next review falls inside the window appear under a `Periodic review` scope; other month-to-month
   rows stay outside the active window and never enter the monthly cohort. A missing anchor shows
   `Needs review` with the term-review control as the action.
5. **Surfaces.** Desk table adds a `Lease term` value inside the existing `Renewal date` column
   cell and a `term` header filter (`fixed_term` | `month_to_month` | `needs_review`) on the
   `renewal-desk-query/v2` contract; the workspace verification phase shows term, start/end dates,
   anchor, and next review; the S110 assistant reuses the projection.

**In scope / out of scope.**

In scope: term projection, review record and route, cohort disposition, desk/workspace display,
query filter, assistant reuse, and fixtures. Out of scope: converting leases in RentVine,
fabricating dates, owner terms, or follow-up timing policy (D-TIMING-UNSET still governs
communications).

**Open questions & assumptions.**

None. The provider term fields are discovered facts. The 12-month review cadence is owner direction
recorded in `docs/facts.md`; it drives only in-app review visibility, never a draft, send, or timer.

**Cross-product impacts.**

Cohort classification, desk query v2, desk table and workspace, Firestore rules for the new
collection, S110 renewal adapters, S111 proof, and `docs/products/lease-renewal-agent.md`.

**Authority and evidence map.**

| Input                                                                                      | Classification                   | Use and limitation                                                                          |
| ------------------------------------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------- |
| `AGENTS.md`, `docs/facts.md`, committed cohort/desk code and tests                         | Authority / implementation truth | Windows, retention, and fail-closed source rules stay; no provider write is authorized.     |
| Owner package PMI-02 and the 2026-09-03 owner direction                                    | Intent evidence                  | Visible term, month-to-month exclusion, and the annual review cadence.                      |
| Lease detail `isMonthToMonth`, `monthToMonthStartDate`, `hasPendingMonthToMonthConversion` | Verified provider fact           | Discovered 2026-09-03 bodylessly; an unavailable detail read marks that row `needs_review`. |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S103-1** — One `projectLeaseTerm` function owns the term for cohort, desk, workspace, and
  assistant; a fixture with an expired end date and no signal fails today (`out_of_window`) and
  yields `needs_review` after.
- **ARCH-S103-2** — The term review record is fingerprint-bound; a drifted lease view makes a prior
  record stale in one shared check.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S103-1** — A fixed-term lease ending on a month end inside the window is `actionable`; the
  same lease with a month-to-month signal is `periodic_review` and absent from the monthly cohort in
  two consecutive months.
- **BEH-S103-2** — A month-to-month lease with anchor `2025-09-15` shows next review `2026-09-15` and
  enters `Periodic review` when that date is inside the window; without an anchor it shows `Needs
review` and the record control.
- **BEH-S103-3** — Recording or correcting the term updates the desk row, the workspace, and the
  assistant `renewal.window` result in the same load, preserving the operator's filters.

**Human litmus outcome.**

### The lease type is obvious and month-to-month leases stop reappearing

**If this was built correctly:** The renewal table says whether each lease is fixed-term or
month-to-month. Month-to-month leases are not in the monthly renewal list; they show up once a year
for review with the date that review is due. Anything unclear says it needs review and offers one
control to record the answer.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with cohort, desk,
  workspace, and rehearsal-browser evidence.
- Human verdict: NOT RUN — no human observer.

**Requirement-to-outcome traceability.**

| Requirement                      | Architecture outcome | Behavior outcome | Human litmus                                                         | Deterministic evidence / falsification                        |
| -------------------------------- | -------------------- | ---------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| TERM-01 fixed-term enters window | `ARCH-S103-1`        | `BEH-S103-1`     | The lease type is obvious and month-to-month leases stop reappearing | Existing window fixture plus term assertion                   |
| TERM-02, TERM-03 month-to-month  | `ARCH-S103-1`        | `BEH-S103-2`     | The lease type is obvious and month-to-month leases stop reappearing | Two-month cohort fixture and anchor arithmetic fixture        |
| TERM-04 contradictory dates      | `ARCH-S103-1`        | `BEH-S103-2`     | The lease type is obvious and month-to-month leases stop reappearing | Expired/missing date fixtures fail first                      |
| TERM-05 consistent recalculation | `ARCH-S103-2`        | `BEH-S103-3`     | The lease type is obvious and month-to-month leases stop reappearing | Route + projection test across desk, workspace, and assistant |

**Preservation set.**

`tests/unit/live-desk.test.ts`, `s82-desk-query-v2.test.ts`, `s82-renewal-desk-table.test.tsx`,
`renewal-workspace-live.test.tsx`, and the cohort fixtures stay green; existing skip reasons
`owner_authorized` and `program` keep their behavior.

**Adversarial acceptance checks.**

- **AC-S103-1** — `ARCH-S103-1`: no code path classifies a term from dates alone when a signal or
  date contradiction exists.
- **AC-S103-2** — `BEH-S103-1`/`BEH-S103-2`: a month-to-month lease cannot enter the monthly cohort
  and cannot be silently converted to fixed-term.
- **AC-S103-3** — `ARCH-S103-2`: a stale term review cannot drive eligibility after the lease view
  changes.
- **AC-S103-4** — The review route refuses non-Editors, other Spaces, and an unknown lease id, and
  writes no provider effect.

**Forbidden actions / hard gates.**

No RentVine or Sheet write, no fabricated end date, no follow-up timer, draft, or send derived from
the review date, and no term inferred from a customer name or address.

**Dependencies / sequencing.**

Consumes S102's lease view. S104, S105, S110, and S111 consume the term projection.

**Standalone delivery contract.**

- **Deliverable now:** projection, disposition, review record/route/rules, surfaces, filter, tests.
- **Consumes, but does not assume:** S102's enriched lease view; an unavailable detail read keeps
  that row `needs_review`.
- **Externally blocked effect:** none.
- **Produces for downstream suites:** `leaseTerm`, `periodic_review` disposition, `nextReviewIso`.

**Verification and delivery contract.**

1. Freeze cohort, projection, and record fixtures failing for the expected reason.
2. Run focused desk, workspace, query, route, rules, and assistant checks plus the rehearsal-browser
   desk smoke.
3. Run `bash scripts/verify.sh` and `npm run test:e2e:core`; audit the diff.
4. Report `ALL_GATES_GREEN`, `BUDGET_EXHAUSTED` only with an explicit budget, or `BLOCKED` (not
   expected).

**Ordered prompt sequence.**

1. Re-verify the S102 enriched view and the discovered term fields.
2. Materialize fail-first cohort and projection fixtures.
3. Implement projection, record, disposition, and surfaces.
4. Run focused and canonical checks; update current docs.

**Deletion/merge recommendation.**

Fold into the S82 contract once the term projection and periodic review scope are deployed and read
back.
