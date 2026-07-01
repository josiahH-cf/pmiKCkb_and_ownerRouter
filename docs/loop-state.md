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

- Last updated: 2026-07-01
- Where we are: the multi-process operations console is the north star (lease-renewal = process #1). The
  2026-06-29 cycle shipped + merged R1–R5 (spine+IA, golden harness+labeling, renewal math, action console +
  intent-detect, and the full Maintenance Work Order Intake incl. live Drive photo sync). Full detail is in
  `docs/status.md` + `docs/facts.md` (`F-*` rows). All gates green on every merge.
- Production-plane fence verified (`F-PROD-CLOUD-MODEL`): prod forces Gemini + Drive; the local model,
  demo auth, and the STT/image stubs are dev/test-only (NODE_ENV-fenced), never a prod dependency.
- Earlier context (full history in `docs/status.md`): client beta deployed on the `pmi-kc-kb-demo` Cloud
  Run service (`pmi-kc-kb-prod`); real Google auth locked to `pmikcmetro.com`; live RentVine (25 leases) +
  Sheet (DWD) reads work; `production_allowed:false` throughout.
- Operating mode: Normal owner-present coordination. Remote Away Mode INACTIVE (`docs/away-mode.md`); hard
  $10 budget cap.
- Recalibration 2026-06-30 (operator note): UI/UX + process-governance re-aim — Console-as-home, Spaces ⊇
  Processes, per-Space "teeth", dev↔prod parity; Q&A-first (`A-IA-V2`). See Next Safe Slice Candidates +
  `docs/products/v1-process-qa.md` + `docs/temp/recalibration-plan.md`.
- 2026-06-30 build cycle (this loop run, S12→S6→S10): ALL THREE SHIPPED — S12 dev↔prod parity
  (`F-DEVPROD-PARITY`; REDEPLOYED 2026-07-01, prod demo-auth fence HTTP-verified), S6 IA rework (`F-IA-CONSOLE-HOME`, supersedes
  F-OPS-CONSOLE-IA: Console-as-home, Processes nav retired/engine kept, real clickable Space cards, Process
  sub-tab), S10 Console app-state brain (`F-CONSOLE-APP-STATE`: read-only approvals/connections/coverage +
  command buttons + Console STT). Loop then STOPPED — no unblocked safe slice remains (see Stop-Condition State).
- 2026-07-01 build cycle (this loop run): SHIPPED the write-back proposal APPROVAL control plane (`F-WRITEBACK-APPROVAL`,
  Admin-only audited approve/return/revoke; non-executing) + two read-only, non-executing follow-ons: the cross-run
  value-free "Write-back queue" tab (`F-WRITEBACK-QUEUE`) + the run-page approval AUDIT TRAIL. 913 tests, gates green.

## Next Safe Slice Candidates

Recalibrated 2026-06-30 (operator note → `docs/temp/recalibration-plan.md`; specs:
`docs/feature-suites/{ui-ia,console-app-state,space-teeth,dev-prod-parity}.md`; Q&A:
`docs/products/v1-process-qa.md`). R1–R5 (spine+IA, golden harness, renewal math, action console, full
Maintenance) are DONE + merged (history in the Snapshot + `docs/status.md`). **Q&A FIRST: do not scaffold
the move-in/move-out UI before the V1 process answers land** (the note's RISK; teeth before scaffolding).

0. Owner Q&A — BLOCKING for the process desks. Answer the V1 questions (lease renewal, move-in, move-out,
   maintenance) in `docs/products/v1-process-qa.md`; record answers as facts (flip the `Q-` rows in
   `docs/facts.md`; `OQ-*` items live in the lease-renewal discovery docs).
1. Dev↔prod parity (`dev-prod-parity.md`, S12) — DONE 2026-06-30 (`F-DEVPROD-PARITY`); REDEPLOYED 2026-07-01: current
   `main` (incl. the write-back follow-ons) is live on `pmi-kc-kb-demo`, RentVine key/secret wired via Secret Manager;
   the prod demo-auth fence is HTTP-verified (unauth `/`→sign-in 307; demo cookie `/api/ask`→401). REMAINING: the
   owner's signed-in check that the live renewal review pulls real Sheet + RentVine data against the deployed endpoint.
2. IA rework (`ui-ia.md`, S6, `A-IA-V2`) — DONE 2026-06-30 (`F-IA-CONSOLE-HOME`, supersedes F-OPS-CONSOLE-IA):
   Console-as-home (`/`+`/ask`), Processes nav retired (engine+routes kept), fully-clickable Space cards with
   real state, per-Space Process sub-tab, "Process space" copy. Routes + `smoke:*` preserved. Maintenance stays
   its own edit-gated Space (folding it under Admin would regress Editor access).
3. Console app-state brain (`console-app-state.md`, S10) — DONE 2026-06-30 (`F-CONSOLE-APP-STATE`): read-only
   app-state provider (approvals / connection gaps / Space coverage) via `/api/ask/app-state` + visible command
   buttons + Console STT (`/api/ask/transcribe`); advisory + deep-linked, never executes.
4. Per-Space teeth (`space-teeth.md`, S11) — a reusable per-Space desk; build the Move-In + Move-Out V1 desks
   AFTER their Q&A answers land (operator-first, read/draft/suggest only).
5. Lease-renewal Phase-2 — review sub-tab + append-only write-back PROPOSAL + the proposal APPROVAL control plane are
   all SHIPPED (`F-RENEWAL-REVIEW-SUBTAB`, `F-WRITEBACK-PROPOSAL`, `F-WRITEBACK-APPROVAL` 2026-07-01): an Admin-only
   audited approve/return/revoke over the QUEUED proposals; non-executing by construction; value-free awaiting/approved
   counts on the review sub-tab (detail in `docs/facts.md` + `docs/status.md`). NEXT (all gated/blocked): the gated
   Sheet write execution needs an approved per-action spec (`F-WRITE-GATE`); RentVine renewal write vendor-gated
   (`OQ-RV-1`); the cross-run "ready-to-write" queue (`F-WRITEBACK-QUEUE`) + run-page audit-trail follow-ons are SHIPPED.

Carried owner/vendor-gated: prod `MAINTENANCE_PHOTO_DRIVE_FOLDER_ID` + live process seed; RentVine
work-order create.

## Active Blockers And Exact Client Asks

All client-owned (tracked in `docs/client-checklist.md` and `docs/research-backlog.md`):

- A PMI KC production project id (create/select + link billing + $10 budget alert) and explicit
  per-step approval for each cost-bearing migration step; the $10 guard stays binding. (Billing card
  PROVISIONED 2026-06-19.)
- Lease Renewal walkthrough recording → source notes, open questions, acceptance scenarios.
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

- Fired earlier: migration-readiness stop gate — local foundations complete; high-value work blocked on
  client replies, production setup, and approved sources.
- Fired 2026-06-30 (this build cycle, after S12→S6→S10): "no safe slice remains" + an approval gate. All three
  unblocked slices shipped (parity, IA rework, Console app-state brain); merged to `main` via PR #19.
- Owner-present cycle 2026-07-01: Working Order added (`F-WORKING-ORDER`). SHIPPED: renewal review sub-tab
  (`F-RENEWAL-REVIEW-SUBTAB`), write-back PROPOSAL generator (`F-WRITEBACK-PROPOSAL`, card links to its approval path),
  maintenance unit matcher (`F-MAINT-UNIT-MATCHER`, M-4) WIRED to the capture desk (`F-MAINT-MATCH-UNIT-LIVE`,
  browser-verified live), owner-notice DRAFT + vendor-assignment SUGGESTION (`F-MAINT-NOTICE-VENDOR`, M-5) SURFACED in the
  desk; 878 tests. Maintenance V1 UI COMPLETE.
- Owner-present cycle 2026-07-01 (this loop run): SHIPPED the write-back proposal APPROVAL control plane
  (`F-WRITEBACK-APPROVAL`) + two read-only non-executing follow-ons — the cross-run "Write-back queue" tab
  (`F-WRITEBACK-QUEUE`) + the run-page approval AUDIT TRAIL; 913 tests green. S12 REDEPLOY DONE 2026-07-01 (`main` live
  on `pmi-kc-kb-demo`, RentVine via Secret Manager, prod fence HTTP-verified 401/307). Remaining: gated SoR write spec.

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
