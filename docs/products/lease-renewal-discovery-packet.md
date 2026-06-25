# Lease Renewal — Discovery Validation Packet

**Status: team-fillable. DISCOVERY-GATED — nothing builds from this until the team validates it**
(`docs/feature-suites/lease-renewal.md`, S3 step 6). This is the single artifact to walk the PMI KC
team through so the validation is turnkey: it consolidates the open decisions and gives one fill-in
template per area. It does **not** restate the discovery docs — it points at them and captures only the
answers we still need.

## 0. How to use this packet

- Read alongside the existing discovery docs (already settled — do **not** re-answer what they cover):
  process truth `docs/products/lease-renewal-discovery-reference.md`; column/tab structure
  `docs/products/lease-renewal-spreadsheet-map.md`; the read-only connector + reconciliation rules
  `docs/products/lease-renewal-connector-design.md`; move-in/out `docs/products/move-in-move-out-process.md`;
  the canonical column keys `lib/lease-renewal/headers.ts`; the live read posture `docs/facts.md`
  (`F-SHEET-TAB`, `F-SHEET-DWD`, `F-RENTVINE-AUTH`).
- Fill the `[team]` / blank cells with the team. Where a **default/recommendation** is shown, it is
  cited from an existing doc — confirm it or correct it; we are not asking you to start from scratch.
- **Data governance (`A-DATA-GOV`):** the golden data set (§3) is assembled **in-boundary and kept out
  of git** — put real records in `docs/client_docs/` (gitignored), never in this file. This packet holds
  only definitions, templates, and expected outcomes, never real tenant/owner/rent values.
- This packet changes no code and authorizes no build. When §1–§7 are validated and the owner picks the
  write-back method (§7), S3 resumes at its post-gate build steps and the validated answers become
  `Verified` rows in `docs/facts.md`.

## 1. Decisions still needed (confirm-with-default)

Each row is an existing open item; the default is cited. Mark the team's decision; leave blank if still
open. Detail/history live in `docs/products/lease-renewal-build-plan.md` §7 and `docs/research-backlog.md`.

| id                   | decision needed                                                    | current default / recommendation (source)                                                                                                                                      | team decision |
| -------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| Q-WRITEBACK-METHOD   | Write-back method (how PMI changes land in the sheet/RentVine)     | **A — append-only "PMI proposal" column/tab**, design B behind approval, revisit after golden data (`docs/feature-suites/lease-renewal.md`)                                    |               |
| Q-PREC-1 / OQ-PREC-1 | Source precedence when sheet and RentVine disagree, per field type | RentVine authoritative for lease dates/rent; sheet is the control plane (`docs/products/lease-renewal-connector-design.md` §3.4 — shipped as suggestions pending confirmation) |               |
| Q-ABC-1              | Define the term "ABC"                                              | undefined in repo; owner must define (`docs/facts.md`)                                                                                                                         |               |
| OQ-APPR-1            | Secondary approver(s) + admin-unavailable rule                     | default launch approvers Dan + Josiah (`docs/loop-state.md`); beyond that TBD                                                                                                  |               |
| OQ-SHEET-1           | Exact in-scope sheet IDs + tabs                                    | "Lease Renewal" tab confirmed (`F-SHEET-TAB`); full in-scope list open                                                                                                         |               |
| OQ-LEX-1             | Staff lexicon for embedded-assignee extraction                     | partially known (Leah) (`docs/products/lease-renewal-connector-design.md` §7)                                                                                                  |               |
| OQ-TMPL-1            | Approved owner / tenant / build-out templates                      | awaited (~2026-06-23) (`docs/products/lease-renewal-discovery-reference.md` §8)                                                                                                |               |
| OQ-RV-1              | RentVine lease-renewal **write** endpoint                          | undocumented in public API → write-back stays non-executable until vendor-confirmed (`docs/facts.md` `F-MAINT-FIRST-WRITE`)                                                    |               |

## 2. Per-column validation — "Lease Renewal" tab

Canonical field keys are `RENEWAL_TAB_SCHEMAS.Renewals` in `lib/lease-renewal/headers.ts` (each carries
the verbatim `headerPhrases` it resolves and an `expectedShape`); current documented meanings are in
`docs/products/lease-renewal-spreadsheet-map.md` §2. For each field, confirm the meaning and fill the
source/precedence/gating cells. (Do not paste real cell values here — use §3 for golden data.)

| field key (headers.ts)      | meaning correct? (map §2) — correct if not | source of truth: RentVine / sheet / both | if both, which wins | actionable when | gates which step / approver | edge cases |
| --------------------------- | ------------------------------------------ | ---------------------------------------- | ------------------- | --------------- | --------------------------- | ---------- |
| owner_pricing_confirmed     |                                            |                                          |                     |                 |                             |            |
| renewal_letter_sent         |                                            |                                          |                     |                 |                             |            |
| tenant_name                 |                                            |                                          |                     |                 |                             |            |
| renewal_date                |                                            |                                          |                     |                 |                             |            |
| current_rent                |                                            |                                          |                     |                 |                             |            |
| market_value                |                                            |                                          |                     |                 |                             |            |
| renewal_completed           |                                            |                                          |                     |                 |                             |            |
| tenant_responded            |                                            |                                          |                     |                 |                             |            |
| info_form_sent              |                                            |                                          |                     |                 |                             |            |
| form_returned               |                                            |                                          |                     |                 |                             |            |
| lease_docs_sent             |                                            |                                          |                     |                 |                             |            |
| rhino_renewed               |                                            |                                          |                     |                 |                             |            |
| pet_registered              |                                            |                                          |                     |                 |                             |            |
| esign_complete              |                                            |                                          |                     |                 |                             |            |
| additional_insured_verified |                                            |                                          |                     |                 |                             |            |
| recurring_charge_added      |                                            |                                          |                     |                 |                             |            |
| added_to_inspection_sheet   |                                            |                                          |                     |                 |                             |            |
| air_filter_setup            |                                            |                                          |                     |                 |                             |            |
| utility_proof               |                                            |                                          |                     |                 |                             |            |

## 3. Golden data set — archetypes to assemble (in-boundary, out of git)

Assemble round-1 records across RentVine + the sheet + Dotloop + maintenance, kept in
`docs/client_docs/` (gitignored). For each record capture: the field values, the flags the connector
**should** raise, the approvals required, and the expected outcome — so the reconciliation rules can be
calibrated against ground truth. Target at least one of each archetype:

| #   | archetype                | must demonstrate                                                                            | expected flags / outcome                                                                 |
| --- | ------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --- |
| 1   | Simple renewal           | all fields filled, current_rent → market_value, no conflicts                                | clean; owner-draft-ready                                                                 |     |
| 2   | Inherited-tenant renewal | full document set; pre-1978 lead-paint; LLC vs personal owner name                          | required-doc / name-mismatch flags caught (`discovery-reference.md` §4)                  |
| 3   | Conflict                 | a field where sheet vs RentVine (or active lease) disagree, e.g. lawn-care Owner/Tenant/HOA | `Conflict` blocks owner-facing draft until resolved (`connector-design.md` §3)           |
| 4   | Missing fact             | form sent, tenant_responded blank, deadline approaching                                     | `Needs Review` / missing-fact, not "un-started" (`docs/feature-suites/lease-renewal.md`) |
| 5   | Edge / "the math"        | mid-cycle proration, deposit/fee delta, off-month renewal_date                              | formula surfaced for sign-off, never auto-applied (Q-WRITEBACK-METHOD / "the math")      |

## 4. Acceptance criteria — failure modes the connector MUST catch

Phase-1 exit milestone (`docs/products/lease-renewal-connector-design.md` §5, `…build-plan.md` §2):
"catches what the team missed, flags Dan finds accurate, **zero false all-clear**, acceptable
false-positive rate." Confirm each failure mode below maps to a golden record (§3) and add any missing:

- [ ] Inherited-tenant renewal in a pre-1978 building — lead-paint disclosure required but missing.
- [ ] Owner name mismatch — personal name vs LLC/legal entity.
- [ ] Deposit amount wrong or blank vs the expected rule.
- [ ] Off-cycle `renewal_date` (not month-end) that could be missed by the cadence.
- [ ] `tenant_responded` blank after `info_form_sent` with the deadline approaching.
- [ ] Source conflict (e.g. lawn-care responsibility) — must `Conflict`-block, never pick a winner.
- [ ] (team adds) …

## 5. RentVine ↔ sheet field mapping (confirm)

Pre-filled rows are the mappings the read-only pipeline already performs
(`lib/integrations/rentvine/lease-mapper.ts`, `DEFAULT_RENTVINE_LEASE_FIELD_MAP`); confirm the
source-of-truth and reconciliation rule, and add any fields the team relies on.

| sheet field key                    | RentVine source (as mapped in code)                   | source of truth | reconciliation rule on mismatch | team confirms |
| ---------------------------------- | ----------------------------------------------------- | --------------- | ------------------------------- | ------------- |
| renewal_date                       | lease end/renewal date (mapped)                       |                 |                                 |               |
| current_rent                       | lease rent amount (mapped)                            |                 |                                 |               |
| tenant_name                        | lease tenant (join key)                               |                 |                                 |               |
| (property year built → lead-paint) | RentVine property attribute (Property Attributes tab) |                 |                                 |               |
| (team adds)                        |                                                       |                 |                                 |               |

## 6. Per-approval-gate spec (team fills)

Gates named in `docs/products/lease-renewal-spreadsheet-map.md` §6. For each, the team sets the
approver, the evidence the approver must see, and what action unblocks the next step (see OQ-APPR-1).

| approval gate            | approver | secondary approver / unavailable rule | evidence required | unblock action |
| ------------------------ | -------- | ------------------------------------- | ----------------- | -------------- |
| Owner pricing confirmed  |          |                                       |                   |                |
| E-signature complete     |          |                                       |                   |                |
| Certified funds received |          |                                       |                   |                |
| Deposit disposition sent |          |                                       |                   |                |
| Owner inspection charge  |          |                                       |                   |                |
| "Everything finalized?"  |          |                                       |                   |                |

## 7. Write-back method (owner decision — `Q-WRITEBACK-METHOD`)

Pick one; default recommendation is **A** (`docs/feature-suites/lease-renewal.md`):

- [ ] **A — append-only "PMI proposal" column/tab** the team copies over (least invasive; recommended now).
- [ ] **B — cell-anchored compare-and-set** by row signature, read-after-write verify, per-action approval
      (`connector-design.md` §4; higher automation, higher risk on a freeform sheet).
- [ ] **C — RentVine-first write** where documented (blocked: no documented renewal-write endpoint, `OQ-RV-1`).

"The math" (rent change, proration, term, fee/deposit deltas) is defined **after** the golden set,
presented for sign-off, and never auto-applied.

## 8. Exit / decision gate

"Validated" means: §1 decisions made, §2 column meanings + source/precedence confirmed, §3 golden set
assembled and outcomes agreed, §4 failure modes each backed by a golden record, §5 mapping confirmed,
§6 gates assigned, §7 write-back method chosen. **Only then** does S3 resume at its post-gate build
steps (`docs/feature-suites/lease-renewal.md` steps 7–9), read-only refinements first and any write-back
last, behind per-action approval. Record each validated answer as a `Verified` row (with evidence + ISO
date) in `docs/facts.md`.
