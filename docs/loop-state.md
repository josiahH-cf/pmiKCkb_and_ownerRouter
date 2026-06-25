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

- Last updated: 2026-06-25
- 2026-06-25 (governance recalibration + feature-suite scaffolding — owner-directed): stood up the
  solidified-context spine `docs/facts.md` (Fact Ledger + Supersede Log + Open Questions), the
  `npm run verify:context-freshness` gate (`scripts/check-context-freshness.mjs` +
  `tests/unit/facts-ledger.test.mjs`), re-tiered the context intake (Tier 0 = facts + this file;
  Tier 1 = `AGENTS.md`, `docs/north-star.md`, the one active lane doc, `docs/plan.md`; Tier 2 =
  on-demand via the Route Table), and **truncated this file** (the ~700-line changelog tail moved to
  `docs/status.md`). Persisted feature-suite specs under `docs/feature-suites/` and three governance
  meta-prompts under `docs/meta-prompts/`. No product feature was built; no SoR write; every Action
  Registry entry stays `production_allowed:false`. Owner decisions captured as Open questions in
  `docs/facts.md`: Renewals fold under a Processes dropdown (`Q-IA-RENEWALS`); Ask drops its four
  selects and gains process-awareness + compose (`Q-ASK-RESCOPE`); renewal write-back method and
  maintenance image storage stay undecided (`Q-WRITEBACK-METHOD`, `Q-MAINT-STORAGE`).
- Prior active product context (2026-06-24): the lease-renewal review runs on REAL RentVine leases
  (25 live) and the live "Lease Renewal" sheet read works via domain-wide delegation; the read/draft
  pipeline is wired read-only, `production_allowed:false` throughout. The open calibration work is
  tuning the reconciliation/severity rules so flags are accurate at a low false-positive rate — now
  gated behind the team-validated golden data set (see `docs/feature-suites/lease-renewal.md`).
- Operating mode: Normal owner-present coordination. Remote Away Mode is INACTIVE
  (`docs/away-mode.md`). Budget cap remains a hard $10.

## Next Safe Slice Candidates

Per the approved golden next-step set (`docs/meta-prompts/golden-next.md`), in order:

1. Land the governance spine + gate (this cycle) and keep it green in CI.
2. Voice & Copy pass — read-only string fixes grounded in `docs/voice-and-audience.md`
   (`docs/feature-suites/voice-copy.md`); deletes future-promise / over-claim copy.
3. Local-model provider seam + live-data harness (`docs/feature-suites/local-model.md`) — free, fences
   from prod, de-risks later model work.
4. Lease-renewal discovery only (golden data + column meanings + process truth) — no build until the
   team validates (`docs/feature-suites/lease-renewal.md`).

Hold maintenance intake (`docs/feature-suites/maintenance-intake.md`) and the cross-product glue
(`docs/feature-suites/cross-product.md`) until S3's facts and the storage/write-back choices are
owner-approved.

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
- Owner to define the term "ABC" (`Q-ABC-1`) and confirm "Bailey Placeholder" meaning (`Q-BAILEY`).

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
2. If the trigger is "plan the next feature cycle", produce a decision-complete packet and stop. If
   the trigger authorizes running the loop, proceed unattended.
3. Pick the next slice from **Next Safe Slice Candidates** above; for lease-renewal, stay in discovery
   until the team validates the process, column meanings, and golden data.
4. Keep every Action Registry entry `production_allowed:false`; honor the stop gate and the $10 cap.
5. Update `docs/facts.md` and this file at each slice boundary; run `npm run verify:context-freshness`.
