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
- Where we are (2026-06-29 owner-present build cycle): the multi-process operations console is the north
  star (lease-renewal = process #1). Shipped + merged to `main` this cycle: R1 spine+IA
  (`F-OPS-CONSOLE-IA`), R2 golden harness (`F-GOLDEN-HARNESS`) + labeling round-trip (`F-GOLDEN-LABELING`),
  R3 reconciliation math tuned to owner ground truth (`F-RENEWAL-DATE-SEMANTICS`, `F-RECON-PRECEDENCE`;
  live re-capture 17->2 flags), R4 action console (`F-ACTION-CONSOLE`) + hybrid intent-detection
  (`F-INTENT-DETECT`) + the audience/channel/urgency schema trim, "Bailey Placeholder"->"Open Placeholder"
  (`F-OPEN-PLACEHOLDER`), and the full Maintenance Work Order Intake (`F-MAINT-INTAKE`, `F-STT-SEAM`,
  `F-MAINT-CAPTURE-UI`, `F-MAINT-PHOTO`, `F-MAINT-SEED`, `F-DRIVE-DWD`). Maintenance photo capture -> team
  Shared Drive sync is LIVE + round-trip-verified (keyless DWD as josiah@pmikcmetro.com, least-privilege
  drive.file). The cutover preflight now guards the maintenance photo Drive folder (decoupled into
  MAINTENANCE_PHOTO_DRIVE_FOLDER_ID; the deploy forwards it). 806 tests; all gates green on every merge.
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
  (`F-DEVPROD-PARITY`; redeploy QUEUED owner/budget-gated), S6 IA rework (`F-IA-CONSOLE-HOME`, supersedes
  F-OPS-CONSOLE-IA: Console-as-home, Processes nav retired/engine kept, real clickable Space cards, Process
  sub-tab), S10 Console app-state brain (`F-CONSOLE-APP-STATE`: read-only approvals/connections/coverage +
  command buttons + Console STT). Loop then STOPPED — no unblocked safe slice remains (see Stop-Condition State).

## Next Safe Slice Candidates

Recalibrated 2026-06-30 (operator note → `docs/temp/recalibration-plan.md`; specs:
`docs/feature-suites/{ui-ia,console-app-state,space-teeth,dev-prod-parity}.md`; Q&A:
`docs/products/v1-process-qa.md`). R1–R5 (spine+IA, golden harness, renewal math, action console, full
Maintenance) are DONE + merged (history in the Snapshot + `docs/status.md`). **Q&A FIRST: do not scaffold
the move-in/move-out UI before the V1 process answers land** (the note's RISK; teeth before scaffolding).

0. Owner Q&A — BLOCKING for the process desks. Answer the V1 questions (lease renewal, move-in, move-out,
   maintenance) in `docs/products/v1-process-qa.md`; record answers as facts (flip the `Q-` rows in
   `docs/facts.md`; `OQ-*` items live in the lease-renewal discovery docs).
1. Dev↔prod parity (`dev-prod-parity.md`, S12) — DONE 2026-06-30 (`F-DEVPROD-PARITY`): the deploy forwards the
   four live-connection non-secrets + delivers the RentVine key/secret via Secret Manager; the cutover preflight
   requires them. REMAINING (queued, owner/budget-gated): the redeploy of current `main` (live service predates
   this cycle) + `npm run smoke:ask-live --base-url=<endpoint>` parity check.
2. IA rework (`ui-ia.md`, S6, `A-IA-V2`) — DONE 2026-06-30 (`F-IA-CONSOLE-HOME`, supersedes F-OPS-CONSOLE-IA):
   Console-as-home (`/`+`/ask`), Processes nav retired (engine+routes kept), fully-clickable Space cards with
   real state, per-Space Process sub-tab, "Process space" copy. Routes + `smoke:*` preserved. Maintenance stays
   its own edit-gated Space (folding it under Admin would regress Editor access).
3. Console app-state brain (`console-app-state.md`, S10) — DONE 2026-06-30 (`F-CONSOLE-APP-STATE`): read-only
   app-state provider (approvals / connection gaps / Space coverage) via `/api/ask/app-state` + visible command
   buttons + Console STT (`/api/ask/transcribe`); advisory + deep-linked, never executes.
4. Per-Space teeth (`space-teeth.md`, S11) — a reusable per-Space desk; build the Move-In + Move-Out V1 desks
   AFTER their Q&A answers land (operator-first, read/draft/suggest only).
5. Lease-renewal Phase-2 — NOW PARTLY UNBLOCKED (owner Q&A 2026-07-01): write-back = append-only proposal
   column (`Q-WRITEBACK-METHOD`), review surface = a renewal SUB-TAB inside the Approval Queue (`OQ-UI-1`),
   manual precedence override via the resolve flow (`Q-PREC-1`). BUILDABLE now: the renewal review sub-tab +
   generating the append-only write-back PROPOSAL for human approval (read/draft/suggest/queue only). STILL
   GATED: executing the write to the operating Sheet needs an approved per-action spec (SoR write); the
   RentVine renewal write stays vendor-gated (`OQ-RV-1`).

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
- Owner Q&A 2026-07-01: the lease-renewal + maintenance decisions landed (Q-WRITEBACK-METHOD, Q-PREC-1,
  Q-MAINT-PHOTO-INDEX, OQ-UI-1 → facts flipped). This UNBLOCKS a renewal Phase-2 slice — the review sub-tab in
  the Approval Queue + the append-only write-back PROPOSAL (executing the Sheet write still needs an approved
  action spec). Still gated: the move-in/move-out desks (S11) wait on their Dan/client Q&A; the S12 redeploy on
  owner/budget approval. Recommended next: the renewal review sub-tab; route move-in/move-out Q&A to Dan; or the redeploy.

## Security Note

`docs/client_docs/` is gitignored and must never be committed (client spreadsheets, ledgers,
invoices, tool-access records). The returned tool-access spreadsheet holds live RentVine credentials
in a notes cell; per owner decision 2026-06-20 they are used as-is, not rotated, and must be loaded
only from env/Secret Manager, never committed. Record only non-secret references in tracked docs.

## Resume Here

1. Read `docs/facts.md`, then this file, then `docs/autonomous-agent-runner.md` and the latest
   `docs/status.md` entry.
2. **ADC preflight — before any live Google read:** if the plan touches a live Sheets/Firestore/Vertex
   read, run `npm run preflight:adc`; if it fails, the owner must reauth (`gcloud auth application-default
   login`, josiah@pmikcmetro.com, NO --scopes) BEFORE building — a stale ADC token stalls the run mid-step.
3. If the trigger is "plan the next feature cycle", produce a decision-complete packet and stop. If
   the trigger authorizes running the loop, proceed unattended.
4. Pick the next slice from **Next Safe Slice Candidates** above; for lease-renewal, stay in discovery
   until the team validates the process, column meanings, and golden data.
5. Keep every Action Registry entry `production_allowed:false`; honor the stop gate and the $10 cap.
6. Update `docs/facts.md` and this file at each slice boundary; run `npm run verify:context-freshness`.
