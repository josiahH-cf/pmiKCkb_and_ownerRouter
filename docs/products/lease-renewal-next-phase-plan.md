# Lease Renewal — Next Phase: Live Calibration + First Draft Outputs

Status: **Active build plan for the next cycle** (authored 2026-06-24 after a transcript-grounded
realignment of the in-flight calibration work). This is the new "continue with feature development"
entry point for the Lease Renewal lane: a fresh session reads [`../loop-state.md`](../loop-state.md)
→ this file → the design docs, then builds the next zero-cost slice below.

> ✅ **Slices A–E BUILT + tested (2026-06-24), $0, read-only / draft-only.** All five §3 slices landed
> as pure, deterministic, unit-tested modules (full suite **638 green**; +20 new tests):
> `cohort.ts`, `rentvine-link.ts`, `rent.ts`, `owner-draft.ts`, `tenant-draft.ts`,
> `renewal-readiness.ts`, plus additive edits to `pipeline.ts` (the missing-flag suppression + the
> RentVine-id join + the base-rent downgrade), `lease-mapper.ts` (`joinId`), `live-run.ts` (optional
> cohort filter), and the Sheets hyperlink layer (`sheet-to-grids.ts` + `read-client.ts`). Every
> entry stays `production_allowed:false`; no SoR write, no send.
>
> ✅ **Live wiring landed too (2026-06-24, slice F):** the sheet's FORMULA hyperlink layer now flows
> end-to-end — `ingest.ts` threads a per-row RentVine id (`tableJoinIds` → `record.joinId`) through
> divider-drop + re-stitch; `sheet-links.ts` turns a FORMULA read into `tables` + `tableJoinIds`;
> `runFullyLiveRenewalReview({ linkJoin: true, cohortWindows })` reads the link layer, runs the exact
> id-join on real rows, and forwards the cohort filter. **Remaining (owner-gated / next):** run the
> real `--live` review (needs ADC) to confirm the live flag volume drops, expose a `--link-join` /
> `--cohort` flag on `smoke:renewal-review`, and surface the cohort / drafts / readiness on the
> `/lease-renewal/runs` page (OQ-UI-1).

It supersedes the open "calibrate the 397 flags / email Dan five questions" task. That task asked Dan
to hand-tune the reconciliation engine; the discovery transcript already answers four of those five
questions and Dan answered the fifth in detail on the 2026-06-19 show-and-tell. The §2 decisions below
fold those answers in so this phase does **not** re-ask them.

Everything here is **read-only / draft-only / approval-gated, $0**. No system-of-record write, no
autonomous send, every Action Registry entry stays `production_allowed:false`. It sits inside the
existing **Phase-1 (read + reconcile + flag, no writes)** envelope from
[`lease-renewal-build-plan.md`](lease-renewal-build-plan.md) §2 — "Phase 2" (write-back) and "Phase 3"
(backing DB) keep their existing meaning and are not touched here.

Grounds in (read for detail): [`lease-renewal-build-plan.md`](lease-renewal-build-plan.md) ·
[`lease-renewal-agent.md`](lease-renewal-agent.md) ·
[`lease-renewal-connector-design.md`](lease-renewal-connector-design.md) ·
[`lease-renewal-spreadsheet-map.md`](lease-renewal-spreadsheet-map.md) ·
[`lease-renewal-discovery-reference.md`](lease-renewal-discovery-reference.md) ·
the gitignored show-and-tell transcript at `docs/context_and_calls/lease_renewal/` (local only — holds
tenant PII; cite by timestamp, never copy tenant names/values into git).

---

## 1. Where we are (plain English)

- **Both live reads are proven, $0, read-only.** One `GET /api/manager/leases/export` returned 25 real
  leases → 25 mapped candidates (HTTP 200). The real "Lease Renewal" sheet tab reads via keyless
  domain-wide delegation (26 tabs, credential tab auto-skipped), counts-only. Wiring lives in
  [`../../lib/lease-renewal/live-run.ts`](../../lib/lease-renewal/live-run.ts).
- **A throwaway full live review ran end-to-end** and surfaced the problem this phase fixes: 390 sheet
  records reconciled against 25 leases → **397 flags**. That volume is **not 397 problems**. It is
  dominated by (a) sheet rows that never joined a live lease (390 vs 25 — a scope/join mismatch), and
  (b) the "missing High-severity field → flag" rule firing on blank worklist cells. The reconciliation
  engine ([`reconciliation.ts`](../../lib/lease-renewal/reconciliation.ts),
  [`severity.ts`](../../lib/lease-renewal/severity.ts),
  [`field-reconciliation-rules.ts`](../../lib/lease-renewal/field-reconciliation-rules.ts)) is correct;
  it is being fed the wrong shape and asked to flag normal worklist state.
- **The 2026-06-19 show-and-tell reset the priority order.** Dan and Jon aligned explicitly: start with
  the lowest-complexity, highest-value automations — **market value + drafting the owner/tenant emails**
  — with human approval at every step, then layer the "if-then" document logic over time
  (transcript ~01:11:07, ~01:12:02; Decisions section). The reconciliation engine is the right
  foundation (the unified source of truth Josiah pitched, ~01:11:07) but it is not the first thing Dan
  feels, and it is not something to hand-tune with him.

This phase therefore (1) feeds the engine the right shape so the noise collapses on its own, and
(2) builds the first draft outputs Dan actually asked for.

## 2. Decisions already resolved from discovery (do NOT re-ask these)

Each is answered from the product doc + the transcript. Build to these; do not send them to Dan as
open questions. The only items that still need Dan are the three confirmations-with-defaults in §4.

1. **Blank cells are normal worklist state, not data defects.** The sheet is a live worklog/dashboard
   built _from_ RentVine (~00:17:31). A blank "current rent" / "market value" just means that step is
   not done yet. The system should **fill** those blanks from RentVine, not flag them. Only an
   _actionable, joined_ row where RentVine also lacks the value warrants a flag.
2. **Precedence for the fields we read is already correct and already encoded.** RentVine is
   read-authoritative for current rent and lease dates (~00:16:23, ~00:17:31); Tab-3's renewal date
   corroborates. That is exactly what [`field-reconciliation-rules.ts`](../../lib/lease-renewal/field-reconciliation-rules.ts)
   encodes (`rentvine` > `sheet_tab3`). `PRECEDENCE_CONFIRMED=false` only gates **auto-apply**, which
   this phase does not need — suggestion-only is fine. OQ-PREC-1 is **not** a blocker here.
3. **"Current rent" is base rent, excluding the resident benefit package + insurance.** A tenant shown
   at base rent "without his RBP and insurance charge" (~00:21:50). So reconcile base-rent-to-base-rent;
   strip RBP/insurance before comparing. Most of the handful of real "conflicts" are this definitional
   mismatch, not stale data.
4. **`tenant_responded` (stay/leave) is human-maintained workflow state, not a RentVine field.** It
   lives in email + RentVine portal chat + text threads, hand-tracked on the sheet (~00:34:40–00:37:51).
   It belongs to the run/workflow record, not the field reconciliation. No Dan input needed.
5. **The join key already exists in the sheet as a RentVine hyperlink.** Sheet rows hyperlink back to
   their RentVine dashboards (~00:35:47). Join on the RentVine lease/unit ID embedded in that link
   (primary), address (fallback), tenant name (last). This also handles multi-tenant leases (two named
   tenants on one lease, ~00:58:45) that fuzzy name-matching mishandles.
6. **"Leave it the same" = keep current rent, not the market value** (~00:28:14). The owner's decision
   is one of: keep current, set to market number, or set a custom amount.
7. **Market value has two documented sources:** the franchise website rental-analysis tool gives the
   specific number Dan directs staff to use (the source-of-truth number), and Zillow rental-manager
   gives the comp range + active-listing density for justification (~00:18:28–00:33:35). The website
   tool was intermittently down/blocked during the call; Zillow is the reliable fallback for the range.
8. **The "send it every way possible" rule is a hard requirement.** Any tenant communication goes out
   by email **and** RentVine portal chat **and** text (~00:36:56). The tenant draft must be prepared for
   all three channels.
9. **The "must never miss" list is already enumerated by Dan — encode it, don't ask it.** From the
   document-build walkthrough (~00:58:45–01:19:53): inherited lease → **full document set**, not the
   extension-only renewal template; building built before 1978 → **lead-based-paint addendum**;
   Independence/KC property → the **city-specific addendum**; **security-deposit type** must be explicit
   (cash held vs. a replacement/insurance policy — never claim cash held when it is a policy);
   **pet deposit** + pet registration when a pet is present; landlord that is an LLC → the **LLC suffix**
   on the name; mid-month start → **prorated rent**. These are the exact errors Dan walked through and
   are the build-plan's Phase-1 exit milestone ("zero false all-clear on the inherited-tenant
   deposit/lead-paint/LLC failure modes").

## 3. The slices (build in order; each is zero-cost, pure, synthetic-fixture-tested)

Each slice = pure functions + rule tables, tested with synthetic/sanitized committable fixtures, no
live calls in testable code (inject the existing fakes), no credentials, no spend, no SoR write,
`production_allowed:false` preserved. Update [`../loop-state.md`](../loop-state.md) at each slice
boundary and append to [`../status.md`](../status.md). Verification gate in §6.

### Slice A — Candidate detection + skip-classification (mirror Dan's manual filter)

- **Why:** Dan opens RentVine, filters leases by end date, and by eye sets aside the ones that should
  not be auto-worked — no end date, month-to-month, owner-authorized hold, program lease — and rescues
  off-cycle dates that fall outside the monthly batch (he has missed those before) (~00:14:12–00:16:23).
- **Build:** pure `classifyRenewalCohort(leaseViews, { window })` →
  `{ actionable: [...], skip: [{ leaseRef, reason }], needsReview: [...] }`. Reason enum:
  `no_end_date | month_to_month | owner_authorized | program | off_cycle_date`. Conservative: anything
  it cannot confidently classify → `needsReview` (never silently actioned, never silently dropped).
  Selection by end-date window mirrors the Aug/Sep-style monthly batches.
- **Files:** `lib/lease-renewal/cohort.ts` (pure) + `tests/unit/lease-renewal-cohort.test.ts`. Surface a
  counts-only cohort summary (actionable N; skip N by reason; needsReview N) on the run result.
- **Note:** `month_to_month` / `owner_authorized` / `program` may need a RentVine lease status/type
  field not yet captured by `leaseViewsFromExport` — if so, extend the export view (read-only) and the
  field map; if the signal is absent, classify `needsReview`, not `actionable`.

### Slice B — Auto-fill the worklist + join on the RentVine ID (collapses the 397-flag noise)

- **Why:** §2.1/§2.2/§2.5 — fill blanks from RentVine instead of flagging them, and join on the stable
  embedded RentVine ID instead of fuzzy names.
- **Build:**
  1. `lib/lease-renewal/rentvine-link.ts` (pure) — parse the lease/unit ID out of a RentVine dashboard
     URL.
  2. Extend the Sheets reader to surface each row's RentVine hyperlink (read-only): fetch the link layer
     via `valueRenderOption=FORMULA` (read `=HYPERLINK(...)`) or `spreadsheets.get` with
     `includeGridData` — whichever is least data. Keep counts-only/redacted output discipline.
  3. Extend [`join.ts`](../../lib/lease-renewal/join.ts) to key on RentVine ID first (address, then name
     as fallbacks). Stay match-only — no auto-merge.
  4. For an **actionable, joined** row, fill `current_rent` (base) + `renewal_date` from RentVine when
     the cell is blank, rather than emitting a `missing` flag.
  5. Reconcile base-rent-to-base-rent: strip RBP + insurance before comparing (§2.3).
  6. A `missing`/`conflict` flag is raised only for an actionable, joined row where RentVine genuinely
     lacks the value or genuinely disagrees.
- **Files:** `rentvine-link.ts`, edits to `lib/google-sheets/{read-client,sheet-to-grids}.ts` and
  `lib/lease-renewal/join.ts` + the `live-run.ts` wiring, with tests for each. Expected outcome on the
  real sample: flag count drops from ~397 to a small set of genuine, actionable conflicts.

### Slice C — Owner renewal-email draft (the #1 client ask, draft-only)

- **Why:** the lowest-complexity, highest-value automation Dan named (~01:11:07); product doc "first
  outputs: owner communication draft" + the `Verified/Likely/Needs Review` confidence + traceable-source
  discipline.
- **Build:** pure `buildOwnerRenewalDraft({ candidate, market, template })` → a draft carrying address,
  current rent (← RentVine, `Verified`), comp range (← Zillow range input), the specific market number
  (← website-tool input) and a screenshot placeholder, each fact tagged with source + confidence. Market
  inputs are **parameters** (operator-provided for now); any missing input renders a visible
  `Needs Verification:` placeholder, never an invented number. No send — emits an approval-package item
  (`production_allowed:false`) for Dan. Scaffold the template body from the transcript's owner template
  structure now; swap in Chassity's current template when OQ-TMPL-1 lands.
- **Files:** `lib/lease-renewal/owner-draft.ts` + template constant + `tests/unit/lease-renewal-owner-draft.test.ts`
  (asserts source/confidence tagging, `Needs Verification` on missing market input, no send path, no PII
  in any counts-only manifest).

### Slice D — Tenant offer draft + multi-channel (draft-only)

- **Why:** §2.8 hard multi-channel rule + product doc tenant-intake stage.
- **Build:** pure `buildTenantOfferDraft({ candidate, ownerDecision, template })`, produced only after an
  owner decision is recorded. Encodes the stay/leave ask, the possible charges (RBP, insurance), and the
  Google-form link. Returns ONE message rendered for THREE channels —
  `{ email, portal_chat, text }` (text is the short form) — each a separate human-approved,
  non-executable draft. No send.
- **Files:** `lib/lease-renewal/tenant-draft.ts` + `tests/unit/lease-renewal-tenant-draft.test.ts`
  (asserts all three channels present, charges sourced, no autonomous send, no PII leak).

### Slice E — "Must never miss" renewal-readiness checklist (anticipate + solve)

- **Why:** §2.9 — turn Dan's enumerated failure modes into deterministic pre-flight checks that surface
  on the approval package **before** anything goes to the build-out step. This is the literal
  "anticipate and solve the client's problem."
- **Build:** pure `evaluateRenewalReadiness(packet)` rule table returning flags:
  - inherited lease → require full document set (not extension-only) → High if the renewal template was
    selected
  - building pre-1978 → lead-based-paint addendum required
  - Independence / Kansas City property → city addendum required
  - security-deposit type explicit; replacement-policy must not claim cash held → High/financial
  - pet present → pet deposit + registration addendum
  - landlord is an LLC → name carries the LLC suffix
  - mid-month start → prorated rent computed
    Any input the check needs but cannot confirm (inherited?, year built, city, pet, LLC, deposit type)
    returns `needs_input` (a `Blocked` flag naming the missing fact) — **never a false all-clear**. Inputs
    come from the RentVine building/lease level where available (read-only).
- **Files:** `lib/lease-renewal/renewal-readiness.ts` + rule table +
  `tests/unit/lease-renewal-renewal-readiness.test.ts` with one synthetic fixture per failure mode plus
  a `needs_input`-not-all-clear case.

## 4. Residual that genuinely needs Dan — confirmations with defaults, not open questions

Surface these as one short confirmation message (pre-filled answers), not a five-question survey. None
block Slices A–E.

1. **Precedence + sources:** "RentVine wins on current rent + lease dates; market value = your website
   tool (the number) + Zillow (the range); current rent compares as base rent excluding RBP/insurance —
   correct?" Default: **yes** (from the call).
2. **Current templates (OQ-TMPL-1):** already pending from Chassity; build against the transcript
   versions and swap on arrival. No new ask.
3. **The compliance ruleset beyond batch 1:** by design it grows over time (~01:12:02). Seed batch 1
   (§3 Slice E) and extend as new if-then rules are confirmed.

## 5. Governance self-check (must stay true every slice)

- No secret value, no tenant PII, and no raw transcript content in any tracked file. Cite the transcript
  by timestamp; describe failure modes generically.
- No system-of-record write, no autonomous send. Owner/tenant drafts are non-executable approval-package
  items; every Action Registry entry stays `production_allowed:false`.
- Identity stays within `pmikcmetro.com` / `pmi-kc-kb-prod`. RentVine reads are free (no GCP budget);
  Sheets reads are free quota. No deploy, no cost-bearing step in this phase.
- Real client data may be read as in-boundary test/training input only; outputs stay counts-only /
  redacted unless human-approved (AGENTS.md Security Rules).

## 6. Verification (run before claiming any slice done; record results in loop-state + status)

```
npm run format:check
npm run lint
npm run typecheck
npm test
npm run verify:falsification
```

Plus, when a slice touches the live path, the free owner-gated proofs:
`npm run smoke:rentvine-read -- --live`, `npm run smoke:sheet-read -- --live`, and
`npm run smoke:renewal-review` (counts-only) to confirm the flag volume drops as Slice B lands.
