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

- Last updated: 2026-06-29
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

## Next Safe Slice Candidates

Recalibrated roadmap (owner-directed 2026-06-29 — a multi-process operations console):

1. Done (2026-06-29) — R1 platform spine + IA (`F-OPS-CONSOLE-IA`): operations-console home, Spaces
   front-door dropdown, renewals nested, "Ask"→"Console".
2. Done (2026-06-29) — R2 golden-data harness + live capture (`F-GOLDEN-HARNESS`): pure evaluator +
   false-positive metric, synthetic gate, and a read-only `npm run golden:capture` writing gitignored
   golden drafts for team labeling.
3. R3 — Lease Renewal as a real Space/Process. WIRING + LABELING + MATH DONE (2026-06-29): seed Draft at
   id `lease-renewal`; the math is tuned to owner ground truth — the sheet's "Renewal Date" is worklog,
   not RentVine's lease-end (`F-RENEWAL-DATE-SEMANTICS`), precedence set (`F-RECON-PRECEDENCE`); a live
   re-capture dropped 17→2 candidate flags (only real rent conflicts). REMAINING: the live Firestore seed
   is OWNER-GATED; Dan's per-case manual precedence override still open (`Q-PREC-1`).
4. Done (2026-06-29) — R4 action console (`F-ACTION-CONSOLE`): the four Ask selects are retired; picking a
   process makes the answer process-aware (server-resolved context) and lets an editor start a SAFE
   simulation run. Schema trim + hybrid intent-detection (`F-INTENT-DETECT`) DONE. Follow-up: richer compose.

5. Maintenance Work Order Intake — BUILT + Drive sync LIVE (2026-06-29), all gated: foundation
   (`F-MAINT-INTAKE`), STT seam (`F-STT-SEAM`), `/maintenance` capture desk (`F-MAINT-CAPTURE-UI`), photo
   store in a team Shared Drive (`F-MAINT-PHOTO`/`F-DRIVE-DWD`, round-trip-verified), seedable Draft
   (`F-MAINT-SEED`). Photo folder decoupled into MAINTENANCE_PHOTO_DRIVE_FOLDER_ID — the deploy forwards it
   and the cutover preflight now requires it. Remaining: set MAINTENANCE_PHOTO_DRIVE_FOLDER_ID in the prod
   Cloud Run env at deploy; live process seed + RentVine work-order create (owner/vendor-gated).

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

- Fired earlier: migration-readiness stop gate — local foundations are substantially complete and the
  remaining high-value work is blocked on client replies, production setup, approved sources, or
  walkthrough content.
- This cycle is governance/spec scaffolding (no new runtime surface), which is readiness-improving and
  decision-complete. Prefer client unblock / cutover / docs / regression work over new local product
  surface while blockers are client-owned.

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
