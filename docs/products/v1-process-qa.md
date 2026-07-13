# V1 Process Q&A — Outstanding Decisions + Data Intactness

This is the Phase-1 Q&A the recalibration is built on (operator note 2026-06-30; see
`docs/temp/recalibration-plan.md`). It locks the V1 end-state processes — **lease renewal,
move-in, move-out + deposit disposition, maintenance** — before any new UI is scaffolded.

**How to use it:** each question has a recommended **confirm-with-default** and an **owner**.
Reply per question with "confirm" or your correction. Questions marked **no safe default** need
your decision before the dependent slice can be built. Recording an answer: the three questions that have a
`docs/facts.md` row (`Q-PREC-1`, `Q-WRITEBACK-METHOD`, `Q-MAINT-PHOTO-INDEX`) flip `Open`→`Verified` there;
the `OQ-*` lease-renewal items live in the lease-renewal discovery docs (`lease-renewal-build-plan.md` /
`lease-renewal-discovery-packet.md`); the move-in/move-out answers become new `F-MOVEIN-*` / `F-MOVEOUT-*`
facts when their desks are specced. The build does not invent answers.

Governance floor (unchanged, applies to every answer): no autonomous send and no system-of-record
write. The allowlisted external actions are the bounded readonly self-pilot `gmail.mailbox.read`
and the owner-approved compose-only `gmail.renewal_notice.draft_create`, which creates an UNSENT
draft and cannot send; every send/reply/mutation and other Action Registry entry stays
`production_allowed:false`. Missing facts render visible
`Needs Verification:` markers, never invented values; identity stays `pmikcmetro.com`.

---

## Lease Renewal (Phase-1 read/reconcile/draft BUILT; write-back gated)

1. **Q-PREC-1 — per-case manual precedence override?** _Default:_ YES, via the existing resolve flow
   (pick source / enter corrected value / "sheet is already right"); High-severity overrides need an
   Admin approver; a plain-English reason is mandatory + logged; no self-approval; never auto-applied.
   _Owner: client._ — **✅ ANSWERED 2026-07-01: confirmed the default (yes, via the resolve flow). Recorded as Q-PREC-1 Verified in `docs/facts.md`.**
2. **Q-WRITEBACK-METHOD — write-back method + "the math"?** (a) append-only proposal column,
   (b) cell-anchored compare-and-set, (c) RentVine-first. _**No safe default — owner must decide.**_
   Recommendation: start with (a) to earn trust at zero risk to existing cells, graduate to (b) once
   Phase-1 flag accuracy is proven. _Owner: owner._ — **✅ ANSWERED 2026-07-01: (a) append-only proposal column first; graduate to (b) after Phase-1 accuracy is proven; (c) deferred (OQ-RV-1). Recorded as Q-WRITEBACK-METHOD Verified in `docs/facts.md`.**
3. **OQ-SHEET-1 — in-scope tabs/columns + credential-tab boundary.** _Default:_ reconcile only the
   "Lease Renewal" tab for V1; Tabs 4 (PadSplit WiFi) & 7 (Platform Logins) permanently excluded; all
   other tabs read-only context until their columns are team-validated. _Owner: client._ — **✅ ANSWERED
   2026-07-01 (self-resolved from repo): confirmed the default — the credential-tab exclusion is already
   codified (`docs/products/lease-renewal-spreadsheet-map.md`); no client ask needed.**
4. **Market sourcing for the owner draft.** _Default:_ PMI Free Rental Analysis = source-of-truth
   number, Zillow = comp range; both operator-entered for V1 (no auto-fetch); missing input stays a
   `Needs Verification:` marker that blocks the owner send. _Owner: client._ — **✅ ANSWERED 2026-07-01
   (self-resolved from repo): confirmed the default; the fallback (Zillow + manual verification when the
   PMI tool is down, approval-gated) is documented in `docs/products/lease-renewal-discovery-reference.md`.**
5. **OQ-APPR-1 — secondary approver + admin-unavailable rule.** _Default:_ Dan primary, Josiah standing
   secondary; if both unavailable, High-severity items HOLD (never auto-route to a non-approver). The
   roster is **owner-owned (name the people).** _Owner: client._ — **✅ ANSWERED 2026-07-01: V1 keeps a
   simple user/admin model where APPROVING is an admin-tier function — Dan is primary approver + admin,
   Josiah is admin/dev with the same visibility. The app already implements this (Editor/Approver/Admin
   capability model; `queueActionAvailability` gates approve to Approver/Admin). Dan's nuanced per-scope
   approver delegation ("who can approve what, where") is a FUTURE admin surface, not V1. Both-out → HOLD
   stands. Recorded in `docs/facts.md` (F-RENEWAL-REVIEW-SUBTAB).**
6. **OQ-TMPL-1 — approved owner/tenant/build-out email templates.** _Default:_ keep building against the
   transcript scaffold; swap approved templates in on arrival (content swap, no re-architecture).
   _Owner: client (deliver files)._ — **✅ ANSWERED 2026-07-01: confirmed the default — build against the
   transcript scaffold for now; swap approved templates in later as a content swap. No approved template
   files exist in the repo yet.**
7. **OQ-UI-1 — renewal review surface: extend the Approval Queue, or build a renewal run page?**
   _**No safe default — product call.**_ This is the gate where Dan reviews Phase-1 accuracy. _Owner:
   owner/design._ — **✅ ANSWERED 2026-07-01: renewal review lives _inside_ the Approval Queue (the built approve/return/assign machinery, its own logically-organized view for Dan, NOT a standalone run page and NOT un-organized into the general queue). Presentation evolved 2026-07-09 (F-APPROVAL-QUEUE-UNIFIED, Slice 4a): it moved from a peer "Renewals" tab to one of the "Other views" behind the unified urgent-first "Needs your decision" list; the value-free-triage and resolve-on-the-run-page invariants are unchanged.**
8. **OQ-RV-1 — RentVine renewal/field-write endpoint.** _**No safe default — vendor-gated.**_ V1 ends at
   "approved renewal package + non-executable RentVine flag"; the RentVine entry stays a human step.
   _Owner: vendor._

## Move-In (Space scaffold only — no desk; greenfield V1 definition)

1. **Trigger + owner.** _Default:_ manual start by a team member when a tenant is approved/onboarding;
   owner = Dan, default approver = Dan + Dan-settable secondary. Auto-detect from RentVine is later.
   _Owner: owner._ — **✅ ANSWERED 2026-07-01: confirmed the default (manual start; Dan owns; auto-detect later).**
2. **Which steps are hard gates vs checklist flags.** _Default:_ hard gates = (a) e-signature complete
   (Dotloop) and (b) certified funds received; everything else is a tracked checklist flag. _Owner: owner._
   — **✅ ANSWERED 2026-07-01 (overrides the default): NO hard blocking gates in V1 — EVERY move-in step is a
   tracked checklist flag; the operator judges readiness. (Revisit hard gates after V1 usage.)**
3. **Welcome comms channels.** _Default:_ email + RentVine Portal Chat (what Tab 1 records); SMS only if
   you confirm. Drafts only; human sends. _Owner: client._ — **✅ ANSWERED 2026-07-01 (self-resolved from
   repo): confirmed — email + RentVine Portal Chat; SMS stays off unless confirmed
   (`docs/products/move-in-move-out-process.md`).**
4. **Smart-lock / key provisioning workflow.** _**No safe default — the only source is in the excluded
   credential tabs.**_ V1 = manual key-handoff checklist step pointing at the Key Tracker; needs an
   owner/admin demo. _Owner: client._
5. **Inspection workflow + move-in cadence/SLA.** _Default:_ V1 does NOT invent an SLA — ordered checklist,
   flag only missing prerequisites; inspection step = add to Inspection Tracker + record the zInspector
   link. _Owner: client._
6. **Variable fees + deposit-replacement (Rhino/Guarantors) setup.** _Default:_ every fee is a "see
   RentVine/system" placeholder (never hard-coded); deposit posture is a conditional flag (cash deposit
   — Missouri = 2× rent — vs deposit-replacement) that drives the Dotloop doc set. _Owner: client._ —
   **✅ ANSWERED 2026-07-01 (self-resolved from repo): confirmed; Missouri deposit = 2× rent is codified
   in `docs/products/lease-renewal-discovery-reference.md`.**
7. **Write boundary.** _Default:_ V1 is strictly READ RentVine + DRAFT (Dotloop package, welcome) +
   suggest-to-sheet; no app-executable RentVine/Dotloop/Gmail write. _Owner: client._ — **✅ ANSWERED
   2026-07-01 (self-resolved from repo): confirmed; matches the connector's read-only + suggest-to-sheet
   posture (`docs/products/move-in-move-out-process.md`) and the governance write-gate.**
8. **Reconcile + golden data for move-in?** _Default:_ V1 = read + checklist surface, content-keyed (never
   trust Tab 1 headers — "Move in date" holds emails); a move-in golden set comes only after Tab 1 column
   meanings are team-validated. _Owner: owner/design._ — **✅ ANSWERED 2026-07-01: confirmed the default
   (read + checklist only for V1; content-keyed; golden set only after Tab 1 columns are team-validated).**

## Move-Out + Deposit Disposition (Space scaffold + demo seed; no desk)

1. **Trigger.** _Default:_ Renewals→Move-Out "decided to move out" handoff + a manual "Start move-out"
   button; eviction/abandonment branches flagged for separate handling. _Owner: client._ — **✅ ANSWERED
   2026-07-01 (narrows the default): a manual "Start move-out" button ONLY for V1 — no automatic
   Renewals→Move-Out handoff yet (add later). Eviction/abandonment still branch for separate handling.**
2. **Deposit-disposition deadline rule (clock-start + statutory window).** _**No safe default — legal,
   owner.**_ Surface a `Needs Verification:` placeholder; never hard-code a statutory deadline or generate
   legal deposit language. _Owner: client._ — **✅ ANSWERED 2026-07-01 (binding rule, self-resolved): stays
   a legal-gated `Needs Verification:` placeholder — the app NEVER hard-codes the statutory deadline or
   generates legal deposit language, even though Missouri deposit = 2× rent is known. Genuinely legal;
   routed to legal/owner.**
3. **Deposit AMOUNT computation/itemization.** _Default:_ V1 = human-entered/owner-approved (no app math);
   the app assembles the evidence packet (inspection, vendor bids, RentVine ledger refs, lock-change/4265
   charges) and tracks the "disposition sent" gate. _Owner: client._ — \*\*✅ ANSWERED 2026-07-01 (overrides
   the default): the app DOES compute a SUGGESTED deposit deduction from the operator-entered evidence
   (inspection charges, vendor bids, ledger refs, lock-change/4265). GUARDRAILS (binding): the number is a
   clearly-labeled SUGGESTION, never final; it requires owner approval before use; the app shows the evidence
   - the arithmetic transparently; it NEVER posts to a ledger/bank/QuickBooks (no SoR write) and NEVER invents
     statutory deposit language or the deadline (Q2 stays a legal-gated `Needs Verification:` placeholder).\*\*
4. **QuickBooks dependency for deposit accounting.** _**No safe default — QB access is a standing
   blocker.**_ Default posture: QB read-only-at-most, out of scope for V1 writes; deposit ledger postings
   are manual. Confirm where the deposit ledger of record sits. _Owner: client._ — **⏳ PARTIAL 2026-07-01:
   owner unsure where the deposit ledger of record lives → the move-out packet surfaces a `Needs
Verification:` pointer for it; the ledger location is a genuine Dan question (routed to Dan). V1 posture
   (QB read-only-at-most, out of V1 write scope, manual postings) confirmed.**
5. **Final approver + repair/bid owner-approval thresholds.** _Default:_ approver = Dan; the dollar
   threshold is **owner-owned (state it).** _Owner: client._ — **⏳ PARTIAL 2026-07-01: approver = Dan
   (admin) confirmed; the dollar threshold is Dan's business rule → surface it as a `Needs Verification:`
   placeholder (no invented number renders as final) and route the exact amount to Dan. WORKING DEFAULT
   set 2026-07-03 (Josiah, unblock-note #5): a PROVISIONAL $500 sign-off threshold is now wired into the
   Move-Out evidence packet (`PROVISIONAL_REPAIR_SIGNOFF_THRESHOLD_CENTS`) — any deduction line ≥ $500
   flags "Needs owner sign-off"; the threshold itself renders `Needs Verification` and is overridable
   (`repairSignoffThresholdCents` + `repairSignoffThresholdVerified`) the moment Dan confirms a number.**
6. **RentVine close-out steps (auto-charge off, credit-reporting off, lease close).** _Default:_ all stay
   manual/recorded in V1 (`production_allowed:false`); capture the click-path in the admin-led demo.
   _Owner: client._
7. **Tenant move-out / owner utility / deposit-letter templates + channels.** _Default:_ drafts requiring
   human review/send; channels = email + RentVine Portal Chat, SMS unconfirmed. _Owner: client._
8. **Rhino/Guarantors claim workflow.** _Default:_ branch the run by the move-in deposit posture; the claim
   submission stays a manual escalated step until the portal/evidence/timeline is documented. _Owner: client._
   — **✅ ANSWERED 2026-07-01 (self-resolved from repo): confirmed the default; the end-to-end claim portal
   detail is a later Dan input (`docs/products/move-in-move-out-process.md`).**
9. **Relisting / unit-turn steps + move-out SLAs.** _Default:_ V1 ends at the "everything finalized?" gate;
   relisting is a downstream handoff (out of scope) until turn steps are confirmed. _Owner: client._
10. **Lock-change owner-charge + smart-lock reset.** _Default:_ owner-billing checklist item routed for
    owner approval; reset detail never derived from the excluded credential tabs. _Owner: client._

## Maintenance Work Order Intake (capture/draft/photo BUILT; RentVine create gated)

1. **Q-MAINT-PHOTO-INDEX — keep tenant photos out of any indexed corpus.** _Default:_ YES, binding rule —
   photos go to a write-only Drive folder with NO Vertex data store; SOPs index from a SEPARATE approved
   low-sensitivity source only. _Owner: owner/design._ — **✅ ANSWERED 2026-07-01: confirmed as a binding rule. Recorded as Q-MAINT-PHOTO-INDEX Verified in `docs/facts.md`.**
2. **Production `MAINTENANCE_PHOTO_DRIVE_FOLDER_ID`.** _Default:_ set it in the Cloud Run env to the
   already-created in-boundary Shared Drive folder id; deploy forwards it, preflight requires it.
   _Owner: owner._ — **✅ ANSWERED 2026-07-01 (self-resolved): not a question — the folder already exists;
   this folds into the owner/budget-gated redeploy (set the env var at deploy; the S12 deploy forwards it
   and the cutover preflight requires it).**
3. **RentVine work-order create — vendor/spec.** _**No safe default — owner/vendor.**_ Needs a
   work-order-write-role key, the create payload + priority enum, and an approved per-action spec before
   `production_allowed` flips. _Owner: vendor._
4. **Emergency-keyword list + location→unit matcher validation.** _Default:_ auto-priority stays a
   human-overridable suggestion; the team reviews the keyword list once; build the read-only RentVine
   unit matcher before enabling the create (so unit confidence is real, not user-typed). _Owner: owner._
   — **✅ ANSWERED 2026-07-01: confirmed the default (human-overridable priority suggestion; build the read-only
   RentVine unit matcher BEFORE enabling any work-order create).**
5. **Owner-notice + Vendor-assignment stages in V1 scope?** _Default:_ V1 = human-reviewed work-order draft
   (photos in Drive); Owner notice + Vendor assignment stay non-executable planned stages, clearly marked
   "planned, not built." _Owner: owner._ — **✅ ANSWERED 2026-07-01 (overrides the default): BUILD both stages
   in V1 as draft/suggest surfaces — an owner-notice DRAFT and a vendor-assignment SUGGESTION. Governance floor
   still binds: both stay non-executable (no autonomous send, no system-of-record write); the RentVine
   work-order create + any owner send remain human-approved/gated.**

---

## Data Intactness (confirm before building on figures)

- **RentVine live read (25 leases)** — intact + pertinent; read-only, free. Review-by 2026-07-24. Re-run
  `npm run smoke:rentvine-read -- --live` before relying on specific counts/rent (the account drifts).
- **Renewal sheet via DWD ("Lease Renewal" tab)** — intact for renewals; **Tab 1 (move-in) / Tab 2
  (move-out) are only highlight-level mapped, NOT team-validated** (known header/data mismatches). The
  sheet is a live worklog — re-read via `npm run smoke:sheet-read -- --live` before any run.
- **Captured golden set (`golden-data/captured/r3-postfix.json`)** — valid as a regression fixture for the
  reconciliation math (2 verified current_rent flags); **re-capture** (`golden:capture --live` →
  `golden:worksheet` → team review → `golden:apply-labels`) before treating its flags as a current picture.
  No move-in / move-out golden data exists.
- **ADC freshness** — **mandatory**: run `npm run preflight:adc` before ANY live Sheets/Firestore/Vertex
  read; if stale, owner reauths (`gcloud auth application-default login`, josiah@pmikcmetro.com, no
  `--scopes`) before building.
- **Gitignored client data** (`docs/client_docs/`, `docs/context_and_calls/`) — the live DWD read is the
  source of truth; the local `.xlsx` copies (dated 2026-06-08) are stale artifacts, not the read path.
- **Doc-freshness drift** — `lease-renewal-build-plan.md` and `lease-renewal-next-phase-plan.md` predate the
  R1–R5 operations-console cycle and carry stale test counts (387 / 638 vs the current 806). `docs/facts.md`
  - `docs/loop-state.md` are the authoritative spine; those two lane docs are being re-anchored/marked.
