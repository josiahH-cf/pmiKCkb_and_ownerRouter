# S13 — Pre-customer refinement (plain language, one queue, real connections, verified Dictate, learning loop)

> New 2026-07-02 (operator note). The decision-complete cycle packet with the full nine-area
> file:line mapping lives at `docs/temp/pre-customer-refinement-plan.md` (disposable, local-only).
> This suite is the TRACKED spec the loop executes. All twelve confirm-with-default decisions were
> answered **YES by the owner on 2026-07-02**, with one amendment (decision 4): renewal-notice
> timing rules are per-tenant/per-property **configurable data**, never global constants.

**Goal.** Make the app user-centric before customer contact: every screen in plain operator
English (enforced by a gate), one attention-ordered approval inbox with bulk decisions, deep links
that land on the exact item, connections that show what already works, Spaces that carry their real
processes with step-by-step desks, a governed renewal-notice engine (send stays human), Dictate
proven live, and a Dan-decisions-teach-the-model loop that never puts client data on GitHub.

**Decisions locked (owner 2026-07-02).**

1. Unified value-free "Needs your decision" default queue view; "bulk edit" = bulk DECISIONS
   (approve/return/state), never bulk field-value editing. Evolves the OQ-UI-1 tab layout; the
   value-free-triage and act-on-the-run-page invariants are preserved; apply the full
   delete-on-supersede when slice B1 ships (scope: prompt-sequence step 6).
2. Bulk write-back approvals may share ONE mandatory reason, stamped onto each of the N decision
   records + Activity rows (decider + timestamp still per record).
3. Send policy (future, spec-only this cycle): approved notice → UNSENT Gmail draft a human opens
   and clicks Send on. No auto-send.
4. **AMENDED — notice timing rules are configurable per tenant/property.** See the rule-engine
   requirement below. Global defaults: notice out by the 15th of the month before lease end;
   operator warning 3 days before the deadline; follow-up 10 calendar days after
   `renewal_letter_sent` with `tenant_responded` blank; delivered as console/queue reminders.
   All defaults flagged `Needs Verification:` until Dan confirms values.
5. The app calls itself "the app" in body copy (product name only in the header lockup); the
   packet's Connections subtitle rewrite is approved.
6. Non-Admin roles get READ-ONLY connection status; verification probes run automatically with a
   ~10-minute cache (read-only, free-tier).
7. "You have N approvals" is ONE merged, deduped number (queue items + awaiting write-backs +
   open flags).
8. Learning loop V1 is deterministic (rules + golden-set tuning, not model retraining); live
   decisions PRE-FILL golden worksheets only (never auto-verify); the enumerated reason-code taxonomy
   ships with its original six categories and S14 adds the value-free `accepted_suggestion` category;
   Josiah merges rule-tuning PRs, Dan reviews in-app.
9. Dictate must work on iPhone/mobile Safari (field use); a few-KB committed SYNTHETIC audio
   fixture is acceptable for the live smoke.
10. Per-step desk check-off persists as app-plane Firestore state (app-owned, not a
    system-of-record write).
11. The live process-definition seed also targets prod Firestore, with real Dan/Josiah uids as
    owner/approver.
12. The tenant/owner email subject rewrites (em-dash removal, plain phrasing) are approved;
    drafts remain human-send regardless.

**What it is / how it functions.** Three waves after a front-loaded owner tier; full per-slice
detail (file:line evidence, risks) is in the packet. Slice ids match the packet (A1–H4).

- _Tier 0 (owner-present, ~30 min):_ `npm run auth:session` → LIVE seed: set the
  `PROCESS_OWNER_UID` + `PROCESS_APPROVER_UID` env vars to the real Dan/Josiah uids FIRST (the
  script silently falls back to PLACEHOLDER uids without them, and correcting a live seed then
  needs `--force`), then `npm run seed:process-definitions` (flips the two built Spaces off
  "Needs a process") → Dan's prod Admin claim (`firebase:set-role`, re-sign-in) → owner-run
  `gcloud services enable speech.googleapis.com --project=pmi-kc-kb-prod` → send
  `docs/temp/client-unblock-note-draft.md` (7 confirm-with-default asks incl. the new
  notice-rule-values ask). Drive DWD is already live-verified (`F-DRIVE-DWD`); the contrary note
  in `lib/integrations/health-checks.ts` is stale (fixed in D6).
- _Wave 1 — plain truth + obvious queue (ungated):_ **A** copy pass v2 — A1 the two
  operator-quoted strings + connector catalog/wizard; A2 Console/Ask front door; A3 queue +
  write-back copy; A4 the "simulation → Test run" lexicon; A5 display-label split so
  "Rentvine (read-authoritative)" renders as "RentVine" with internal ids byte-identical; A6
  em-dash + email-subject pass with `DRAFT_BANNER` allowlisted; A7 `docs/voice-and-audience.md`
  v2 rules; A8 the `verify:copy-voice` gate (warn-then-fail). **B** approval queue — B1 unified
  default view as a pure value-free projection over the existing gathers; B2 bulk approve/return
  ON the run page; B3 the missing `.lr-approve-form` CSS; B4 background auto-grouping to counts;
  B5 value-free "N waiting on you" interlock onto the Space card + Console approvals answer.
  **C** deep links — C1 redirect route to un-404 the persisted reconcile `direct_link`s + flag
  scroll/highlight; C2 item-level hrefs + severity-first ordering in app-state; C3 Console
  next-right-action strip with live counts; C4 the one honest approvals number with
  `source_trigger_key` dedupe. **D** connections truth — D1 existing live probes → `verifiedIds`
  so working connectors show "Connected"; D2 `requiredConfig` truth fix for Sheets/Drive; D3
  Dotloop + LeadSimple env seams; D4 Gmail sender card; D5 Admin verify button + read-only
  non-Admin visibility; D6 stale-doc fixes (the health-contract Drive note; any remaining README
  or checklist drift found in-flight — client-checklist rows 20/25 were already reconciled in
  commit dde0fce, 2026-07-01, and are NOT part of D6).
- _Wave 2 — Spaces with teeth (executes S11):_ **E** — E1 Move-In (10 steps) + Move-Out (11
  steps) Draft definition seeds from `docs/products/move-in-move-out-process.md` honoring the
  Q&A answers VERBATIM (move-in: NO hard gates, tracked checklist flags; move-out: manual
  "Start move-out" only — Renewals-handoff deferred — and a SUGGESTED deposit deduction with
  binding guardrails; Dan-owned values as `Needs Verification:` placeholders); E2 the reusable
  per-Space desk + the two V1 desks (start-a-run via the existing simulation path, per-step
  check-off persisted app-plane, read/draft/suggest only); E3 Tenant Renewal Notice + Dotloop
  follow-up definition; E4 Owner Renewal Outreach definition; E5 owner-run live seed
  application (same env-var rule as Tier 0).
- _Wave 3 — notices, Dictate, learning loop:_ **F** — F1 the notice rule engine (below); F2
  read-only status surfacing on the live review/desk; F3 live-data drafts with the verbatim
  `DRAFT_BANNER`; F4 operator-triggered reminders via the existing queue-notifications CLI
  pattern; F5 docs-only per-action specs for `gmail.renewal_notice.draft_create` and the future
  send. **G** Dictate — G1 Google error detail in `SpeechSetupError`; G2 client robustness
  (network catch, ~55s auto-stop, empty-transcript hint, one shared recorder hook); G3
  `MediaRecorder.isTypeSupported` negotiation with an honest Safari/mp4 failure message this
  cycle; G4 new `smoke:transcribe-live` + add `speech.googleapis.com` to `REQUIRED_GCP_APIS` and
  the cutover doc in the same commit as the doc-sync test. **H** learning loop — H1 value-free
  decision-metrics card; H2 enumerated `reason_code` on both decision schemas + forms; H3
  offline decisions-to-golden distillation CLI that pre-fills worksheets; H4 rule-tuning-as-PR
  loop with a PR-template checklist + redaction check so only rules/thresholds/synthetic
  scenarios ever reach GitHub.

**Notice rule engine (decision 4, amended — the binding design requirement).**

- Timing rules are DATA, not code: a typed rule set with three scopes — global defaults,
  per-property overrides, per-lease/tenant overrides — resolved deterministically,
  most-specific-wins (lease > property > global). The resolver is pure (reference date and rule
  set are inputs; no `Date.now()`, no I/O), mirroring `lib/lease-renewal/cohort.ts`.
- Rule fields (initial): notice deadline (day-of-month + which month relative to lease end),
  operator warning lead days, follow-up interval days, and an enabled flag per scope.
- V1 storage: a seedable app-plane config record (KB-owned Firestore, not a system of record),
  with the EFFECTIVE rule for each lease displayed read-only on the desk/review ("Notice due by
  Jun 15 — property rule" / "— default"). An Admin edit surface is a named follow-on slice, not a
  V1 blocker; until it lands, overrides enter via the seed/config record.
- Every default value renders `Needs Verification:` until Dan confirms it; golden-data-first
  tests must cover override precedence (lease beats property beats global) and the boundary days.

**Open questions & assumptions.**

- _Client-owned:_ deposit ledger location, repair sign-off dollar threshold, Sheets in-scope
  list, QuickBooks access (all in the unblock note); approval-sender + Gmail access model
  confirmation and the Dotloop OAuth app registration (tracked in `docs/client-checklist.md` /
  `docs/environment-handoff.md`); per-lease/per-property notice-rule values (NEW — added to the
  unblock note as ask 7 with a confirm-with-default: global defaults apply everywhere until Dan
  supplies exceptions).
- _Assumption:_ the unified queue view is an EVOLUTION of OQ-UI-1 (owner-directed 2026-07-02);
  its invariants (value-free triage surfaces, decisions on the run page, Admin-only write-back
  decisions, mandatory reasons) carry over unchanged and their sentinel tests are extended, never
  weakened.
- _Assumption:_ hard gates unchanged this cycle — no autonomous send, no Sheet/SoR write
  execution (`F-WRITE-GATE`), no Cloud Scheduler, no Gmail runtime, no client data on GitHub,
  every Action Registry entry `production_allowed:false`, ~$10 cap.

**Cross-product impacts.** `lib/connections/*`, `components/connections/*`, `components/console/*`,
`components/ask/*`, `components/approval/*`, `components/lease-renewal/*`, `app/globals.css`
(the `lr-*` forms), `app/lease-renewal/runs/*` (redirect route), `lib/ask/app-state-context.ts`,
`lib/space-card-state.ts`, new `lib/move-in/*` + `lib/move-out/*` + a new notice-rule module under
`lib/lease-renewal/*`, `lib/speech/stt-provider.ts` + one shared recorder hook, both decision
schemas (additive `reason_code`), new `scripts/check-copy-voice.mjs` + new
`scripts/smoke-transcribe-live.mjs`, `docs/voice-and-audience.md`,
`docs/client-production-cutover.md` + `scripts/preflight-gcp-setup.mjs` (Speech API), and the
golden labeling/distillation scripts.

**Ordered prompt sequence.**

1. _Owner:_ Tier-0 steps (front-load; none block Wave 1).
2. _Build:_ Wave 1 in slice order A → B → C → D (each slice: lint/typecheck/test + falsification
   pass; extend — never weaken — the value-free sentinel tests; golden harness green after A5).
3. _Build:_ Wave 2 E1 → E2 → E3 → E4, then the owner-run live seed (E5).
4. _Build:_ Wave 3 F (rule engine first), G, H in packet order.
5. _Verify end-of-cycle:_ `bash scripts/verify.sh`; owner-approved redeploy; `smoke:ask-live` +
   new `smoke:transcribe-live` against the deployed endpoint; browser walkthrough of the unified
   queue + desks with Dan's Admin session.
6. _Context update:_ promote shipped slices to `docs/facts.md` rows. At B1, apply the full
   delete-on-supersede for the OQ-UI-1 tab layout: the supersede-log row, AND amend the OQ-UI-1
   answer in `docs/products/v1-process-qa.md`, AND update the tab-layout wording inside the
   `F-RENEWAL-REVIEW-SUBTAB` / `F-WRITEBACK-QUEUE` claims. Update `docs/loop-state.md` at every
   slice boundary (keep headroom under its 140-line cap), keep `docs/plan.md` phase statuses
   honest.

**Deletion/merge recommendation.** KEEP this suite as the cycle's tracked spec; the `docs/temp`
packet stays disposable evidence. S2 (voice) and S11 (space-teeth) are executed THROUGH this
suite's Waves 1–2 rather than separately; do not run them as parallel tracks.
