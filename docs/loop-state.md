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

- Last updated: 2026-07-02
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
- **RESUME — next / waiting-on (2026-07-02):** ALL 12 pre-customer refinement decisions LOCKED (owner 2026-07-02;
  notice rules per-tenant/property CONFIGURABLE — `F-PRECUST-CYCLE`). Tracked spec: S13
  `docs/feature-suites/pre-customer-refinement.md`; mapping packet: `docs/temp/pre-customer-refinement-plan.md`.
  IN PROGRESS on branch `s13-wave1-precustomer` (local, NOT pushed): slice A DONE + adversarially verified
  (copy v2 + `verify:copy-voice` gate + RentVine display seam, `F-VOICE-2`, 72bb7a7); B3 DONE (`.lr-approve-form`
  reason-box CSS, 5ffffba). NEXT: B1 unified value-free "Needs your decision" inbox (pure projection over the
  3 gathers the approval-queue page already does — items + renewalBoard + writebackQueue; extend the value-free
  sentinel tests, add no Firestore reads) → B2 bulk approve/return on the run page → B4 collapse terminal items
  to counts → B5 Space-card + Console "N waiting" interlock → C deep-link 404 + counts → D connections truth →
  Wave 2 desks → Wave 3. TIER-0 OWNER STEPS
  (front-load, none block Wave 1): (1) `npm run auth:session`; (2) LIVE seed — set `PROCESS_OWNER_UID` +
  `PROCESS_APPROVER_UID` env FIRST (silent placeholder fallback), then `npm run seed:process-definitions`;
  (3) Dan's prod Admin claim; (4) `gcloud services enable speech.googleapis.com --project=pmi-kc-kb-prod`;
  (5) SEND `docs/temp/client-unblock-note-draft.md`; (6) golden-labeling review → `npm run golden:apply-labels`.
  GATED unchanged: Sheet write EXECUTION (`F-WRITE-GATE`), Gmail runtime, Cloud Scheduler.

## Next Safe Slice Candidates

Recalibrated 2026-06-30 (`docs/temp/recalibration-plan.md`) and again 2026-07-02: the pre-customer
refinement packet `docs/temp/pre-customer-refinement-plan.md` now SEQUENCES these candidates (Wave 1
copy/queue/deep-links/connections → Wave 2 move-in/move-out desks → Wave 3 notices/Dictate/learning loop).
R1–R5 DONE + merged. Move-in/move-out Q&A self-resolved to confirmed defaults; Dan-owned values stay
Needs Verification placeholders (teeth before scaffolding is satisfied).

0. Owner Q&A — ANSWERED 2026-07-01/02 (`docs/products/v1-process-qa.md` + `F-PRECUST-CYCLE`); several answers
   OVERRIDE the printed defaults — build from that doc VERBATIM. Dan-owned values stay Needs Verification.
1. Dev↔prod parity (`dev-prod-parity.md`, S12) — DONE 2026-06-30 (`F-DEVPROD-PARITY`); REDEPLOYED + FULLY VERIFIED
   2026-07-01: current `main` live on `pmi-kc-kb-demo`; prod demo-auth fence HTTP-verified (401/307) AND the live
   renewal review pulls the real 25 RentVine leases + Sheet DWD against the DEPLOYED endpoint (2 real conflicts,
   production_allowed:false). Surfaced+fixed 2 prod-setup gaps: operator Admin claim + runtime-SA tokenCreator on reader SA (cutover doc).
2. IA rework (`ui-ia.md`, S6, `A-IA-V2`) — DONE 2026-06-30 (`F-IA-CONSOLE-HOME`, supersedes F-OPS-CONSOLE-IA):
   Console-as-home (`/`+`/ask`), Processes nav retired (engine+routes kept), fully-clickable Space cards with
   real state, per-Space Process sub-tab, "Process space" copy. Routes + `smoke:*` preserved. Maintenance stays
   its own edit-gated Space (folding it under Admin would regress Editor access).
3. Console app-state brain (`console-app-state.md`, S10) — DONE 2026-06-30 (`F-CONSOLE-APP-STATE`): read-only
   app-state provider (approvals / connection gaps / Space coverage) via `/api/ask/app-state` + visible command
   buttons + Console STT (`/api/ask/transcribe`); advisory + deep-linked, never executes.
4. Per-Space teeth (`space-teeth.md`, S11) — runs via S13 Wave 2 (Q&A answered): reusable desk + the Move-In +
   Move-Out V1 desks (operator-first, read/draft/suggest only).
5. Lease-renewal Phase-2 — ALL SHIPPED + prod-verified: review sub-tab (`F-RENEWAL-REVIEW-SUBTAB`), write-back
   PROPOSAL (`F-WRITEBACK-PROPOSAL`), APPROVAL control plane + queue + audit trail (`F-WRITEBACK-APPROVAL`,
   `F-WRITEBACK-QUEUE`). GATED next: Sheet write EXECUTION (`F-WRITE-GATE` + golden ground-truth); RentVine write (`OQ-RV-1`).

Carried owner/vendor-gated: prod `MAINTENANCE_PHOTO_DRIVE_FOLDER_ID` + live process seed; RentVine
work-order create.

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

- Fired earlier + 2026-06-30: migration-readiness / "no safe slice" stops — foundations + the S12→S6→S10 slices
  shipped + merged; high-value work blocked on client replies, prod setup, approved sources (`docs/status.md`).
- Owner-present cycles 2026-07-01: Working Order added (`F-WORKING-ORDER`); shipped the renewal review sub-tab,
  write-back proposal + APPROVAL control plane + queue tab + audit trail, maintenance unit matcher wired live,
  owner-notice draft + vendor suggestion (`F-RENEWAL-REVIEW-SUBTAB` … `F-MAINT-NOTICE-VENDOR`); Maintenance V1 UI
  COMPLETE; 913 tests; S12 REDEPLOY DONE (`main` live on `pmi-kc-kb-demo`, prod fence HTTP-verified 401/307).
  Remaining: the gated SoR write spec.

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
