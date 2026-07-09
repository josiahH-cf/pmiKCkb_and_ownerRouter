# Loop State

Single-read resume pointer for the unattended feature loop. Read `docs/facts.md` (the solidified
Tier-0 spine) and this file first. This file is the always-current pointer; `docs/status.md` is the
append-only history. If the two disagree, `docs/status.md` wins and this file is corrected.

Keep this file short, non-secret, and current — a pointer, not a changelog. `npm run
verify:context-freshness` caps its length so the changelog never regrows here; the full narrative
history lives in `docs/status.md`. Update it at the start of a cycle, at each slice boundary, and
whenever a blocker, approval gate, or stop-and-reset condition changes. See
`docs/autonomous-agent-runner.md` for the loop, verification/falsification, continuation, and
stop-and-reset rules.

## Snapshot

- Last updated: 2026-07-09
- Where we are: the multi-process operations console is the north star (lease-renewal = process #1). The
  2026-06-29 cycle shipped + merged R1–R5 (spine+IA, golden harness+labeling, renewal math, action console +
  intent-detect, and the full Maintenance Work Order Intake incl. live Drive photo sync). Full detail is in
  `docs/status.md` + `docs/facts.md` (`F-*` rows). All gates green on every merge.
- Production-plane fence verified (`F-PROD-CLOUD-MODEL`): prod forces Gemini + Drive; the local model,
  demo auth, and the STT/image stubs are dev/test-only (NODE_ENV-fenced), never a prod dependency.
- Earlier context (full history in `docs/status.md`): client beta deployed on the `pmi-kc-kb-demo` Cloud
  Run service (`pmi-kc-kb-prod`); real Google auth locked to `pmikcmetro.com`; live RentVine (25 leases) +
  Sheet (DWD) reads work; `production_allowed:false` throughout.
- Operating mode: normal owner-present; Remote Away Mode INACTIVE (`docs/away-mode.md`); hard $10 budget cap.
- Recalibrations: 2026-06-30 (`A-IA-V2` — Console-as-home, Spaces ⊇ Processes, teeth, parity; shipped as S12→S6→S10:
  `F-DEVPROD-PARITY`/`F-IA-CONSOLE-HOME`/`F-CONSOLE-APP-STATE`) and 2026-07-02 (S13 pre-customer refinement, see RESUME).
- 2026-07-01 cycle: SHIPPED the write-back APPROVAL control plane (`F-WRITEBACK-APPROVAL`) + "Write-back queue" tab
  (`F-WRITEBACK-QUEUE`) + run-page audit trail; 913 tests; ALL PROVEN LIVE in prod (detail in `docs/status.md`).
- 2026-07-08/09 CONSOLE OVERHAUL cycle SHIPPED + merged to `main` (PRs #41–#44): A action-first Console (deck + process
  strip + prominent Dictate; `F-CONSOLE-APP-STATE` amended); B color-coded Space cards (`F-SPACE-CARD-COLOR`); C Renewal
  needs-attention fold (`F-RENEWAL-ATTENTION`); D Admin re-section + in-app user/role management with audit (`F-ADMIN-IA`,
  `F-ADMIN-USERS`); E persisted Maintenance ticket queue + lifecycle (`F-MAINT-TICKETS`); F per-user Gmail representation
  - Owner-Email reframe (`F-GMAIL-PER-USER`). App-plane only, `production_allowed:false` throughout, no SoR write/send;
    adversarially reviewed + remediated (transaction safety, attention filter, audit degradation); 1100+ tests, all gates
    green. Facts are UNIT-verified, not live-run (stale ADC this cycle). DEFERRED / not built: renewal owner-email send
    affordance + live-review actionability; maintenance external-worker Submitter auth + universal
    unit type-ahead DB + delegable ownership; per-user Gmail RUNTIME (reading / AI replies / notifications / reminders,
    gated on the client Gmail access model + DWD auth); Approval-Queue action-first rebuild.
- **RESUME — next / waiting-on (2026-07-09):** S13 pre-customer refinement COMPLETE + **GO-LIVE done 2026-07-07** (waves
  1–3 merged PRs #35–#39; `F-PRECUST-CYCLE`/`-NOTICE-ENGINE`/`-DICTATE-VERIFIED`/`-LEARN-LOOP`; Cloud Run
  `pmi-kc-kb-demo-00010-sgt` 100% traffic; two Admins confirmed; live Dictate proven; $10 kill switch armed — full
  narrative in `docs/status.md`). The 2026-07-08/09 console overhaul (bullet above) shipped on top. REMAINING client-owned:
  Dan's Admin walkthrough + 2nd sign-in to activate his claim; QuickBooks access tier + official deposit-accounting home.
  GATED unchanged: Sheet-write EXECUTION (`F-WRITE-GATE`), Gmail runtime (client access model + DWD), Cloud Scheduler.
  Next buildable slice: Approval-Queue action-first rebuild (see the console-overhaul DEFERRED list above).
- **Deferred cycle IN PROGRESS (2026-07-09):** shipped app-plane 2c/3c (`F-DEFCYCLE-APPPLANE-1`); the per-user Gmail draft
  runtime + action-gate built TO THE GATE + renewal Prepare-owner-email button (`F-GMAIL-RUNTIME-GATED`); A5 the HMAC-token
  PUBLIC intake → quarantine via a no-actor writer + a route-auth-boundary invariant (`F-MAINT-INTAKE-PUBLIC`); 2d the edit-gated
  triage that promotes/dismisses it (`F-MAINT-INTAKE-REVIEW`); the Gmail renewal-notice draft FLIPPED executable on the committed
  DWD grant + live smoke (`F-GMAIL-RENEWAL-DRAFT-LIVE`; gmail.compose only, no send; owner deploy pending); 2b the edit-gated
  assignee picker + Assigned-to-me filter (`F-MAINT-ASSIGNEE`); 2a the edit-gated unit type-ahead over a cached RentVine unit index + optional confirm-on-promote (`F-MAINT-UNIT-TYPEAHEAD`); 1b made the live renewal review actionable (reused resolve + approve/return/revoke controls; the resolve route rebuilds the live run) (`F-RENEWAL-LIVE-ACTIONABLE`); 1c the per-property lease-renewal decision repo + manageAdmin page (`F-RENEWAL-PROPERTY-REPO`); 3a the anticipatory AI draft-text composer via the ModelProvider seam, deterministic spine first, no Gmail call (`F-GMAIL-DRAFT-COMPOSER`). Remaining 3 slices are decision-complete in
  `docs/temp/deferred-remaining-slices.md` (see Next Safe Slice Candidates).

## Next Safe Slice Candidates

The remaining deferred-cycle slices are DECISION-COMPLETE in `docs/temp/deferred-remaining-slices.md` — one
section each: objective, in/out scope, exact files, EXACT governance pin/fact/supersede edits, guardrails,
verify list, done-definition. All 7 are loop-executable + app-plane; build ONE per branch → PR → CI `verify`
→ merge, governance (A4/4a) LAST:

1. **2a** unit type-ahead, maintenance (`F-MAINT-UNIT-TYPEAHEAD`).
2. **1b** lease-renewal live-review actionable + fix the live-review resolve 404 (new fact).
3. **1c** per-property lease-renewal repository, manageAdmin + value-free (`F-RENEWAL-PROPERTY-REPO`).
4. **3a** anticipatory AI draft-TEXT composer, no Gmail call (new fact).
5. **3b** in-app notification framework; email hard-off, Gmail families stubbed (`F-NOTIF-FRAMEWORK`).
6. **A4** Console act-in-place — GOVERNANCE, owner-opted-in: supersede F-CONSOLE-APP-STATE →
   F-CONSOLE-ACT-IN-PLACE, scope F-PRECUST-WAVE1, relax the ROW_KEYS + console-view + console-action-deck pins
   (KEEP the SECRET no-leak asserts). Exact edits in the packet.
7. **4a** Approval-Queue presentation rebuild — GOVERNANCE: unified urgent-first list + "Other views";
   `F-APPROVAL-QUEUE-UNIFIED` + OQ-UI-1-TAB-LAYOUT supersede marker; ROW_KEYS pin UNCHANGED.

The packet header carries the cross-cutting rules (no registry flip; authed routes; keep loop-state ≤140
lines; no `[bracket]` paths in fact evidence; client-safe types; demo-aware live reads). A4/4a relax pinning
tests DELIBERATELY — the exact assertion changes are pre-specified and recorded as facts + supersede markers.

Carried owner/vendor-gated (unchanged): prod `MAINTENANCE_PHOTO_DRIVE_FOLDER_ID` + live process seed;
RentVine work-order create; Sheet-write EXECUTION (`F-WRITE-GATE`, `OQ-RV-1`); the Gmail renewal-draft prod
deploy (`npm run deploy -- --budget-confirmed`).

## Active Blockers And Exact Client Asks

All client-owned (tracked in `docs/client-checklist.md` and `docs/research-backlog.md`):

- A PMI KC production project id (create/select + link billing + $10 budget alert) and explicit
  per-step approval for each cost-bearing migration step; the $10 guard stays binding. (Billing card
  PROVISIONED 2026-06-19.)
- Lease Renewal acceptance scenarios (the walkthrough was HELD 2026-06-19; source notes captured; signed-lease/lease-end RESOLVED).
- Google Sheets exact in-scope sheet list and owner confirmation.
- QuickBooks access status/location (blank in the returned tool-access spreadsheet).
- RentVine lease-renewal-write endpoint confirmation — undocumented in the public API; vendor
  confirmation required before any renewal writeback (`docs/integration-architecture.md`).
- Source-vocabulary normalization — freeze canonical stage/system/record-ID/approval names before any
  live connector work.
- Gmail Inbox 0 safe test-thread protocol confirmation.
- Approval sender (`kb-automation@pmikcmetro.com`) and launch approver defaults (Dan + Josiah).
- Owner to define the term "ABC" (`Q-ABC-1`).

Resolved and kept as facts: RentVine credential used as-is, not rotated (load from env/Secret
Manager); signed leases live in Dotloop, lease-end reads from the RentVine lease record.

## Pending Approval Gates

Cost-bearing steps stay behind explicit per-step approval (each must also pass
`npm run check:budget-guard` and stay under the $10 cap): cheap-live Ask demo; production infra setup
(`gcloud services enable …`, Firestore create + rules/index deploy, source import, deploy, production
smoke). Hard stops still require explicit approval and will not be performed autonomously:
billing/cap changes, Pro model usage, autonomous sends, destructive changes, raw client
data/secrets, Gmail mailbox access, or unapproved system-of-record writes.

## Stop-Condition State

- Prior stop-conditions (2026-06-30 migration-readiness / "no safe slice"; 2026-07-01 owner-present cycles) are
  cleared and archived in `docs/status.md` (2026-07-09 entry).

## Security Note

`docs/client_docs/` is gitignored and must never be committed (client spreadsheets, ledgers,
invoices, tool-access records). The returned tool-access spreadsheet holds live RentVine credentials
in a notes cell; per owner decision 2026-06-20 they are used as-is, not rotated, and must be loaded
only from env/Secret Manager, never committed. Record only non-secret references in tracked docs.

## Resume Here

1. Read `docs/facts.md`, then this file, then `docs/autonomous-agent-runner.md` and the latest
   `docs/status.md` entry.
2. **Auth first (org reauth is interactive-only):** the OWNER runs `npm run auth:session` at session start to
   refresh the gcloud CLI login + ADC when stale. Before any live Sheets/Firestore/Vertex read the agent runs the
   read-only `npm run preflight:adc`; if it fails, ask the owner to run `auth:session` (`F-SESSION-AUTH`) — a stale token stalls mid-step.
3. If the trigger is "plan the next feature cycle", produce a decision-complete packet and stop. If
   the trigger authorizes running the loop, proceed unattended.
4. Pick the next slice from **Next Safe Slice Candidates** above; for lease-renewal, stay in discovery
   until the team validates the process, column meanings, and golden data.
5. Keep every Action Registry entry `production_allowed:false`; honor the stop gate and the $10 cap.
6. Update `docs/facts.md` and this file at each slice boundary; run `npm run verify:context-freshness`.
