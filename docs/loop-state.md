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
- 2026-06-29 (Recalibration + R1 Operations Console spine — owner-directed): locked the north star to a
  multi-process **operations console** (lease-renewal = process #1, not the app); `/ask` → an "action
  console"; Spaces is the front-door dropdown; golden-data-first dev. Shipped R1 (platform spine + IA):
  the home (`/`) is a launcher (Console entry + Spaces dropdown, renewals nested → `/lease-renewal`,
  route preserved), nav drops the flat "Renewals" tab, "Ask"→"Console". Reused the existing
  process-generic spine; no new backend; routes/role-gates preserved. Also merged the local-model
  schema-constrained structured-output fix to `main`, then shipped R2 (golden-data harness + read-only
  live capture, `F-GOLDEN-HARNESS`) and merged R1+R2 to `main`. Budget guard untouched; no SoR write.
- 2026-06-26 (Client beta deploy — owner-directed): pushed the current front end (new Renewal Desk /
  Connection Center / PMI brand UI from `feat/s2-voice-copy`) to the `pmi-kc-kb-demo` Cloud Run service on
  `pmi-kc-kb-prod` so Dan can log in and preview. Real Google auth, locked to `pmikcmetro.com`, demo-auth
  OFF; both service URLs return 200 + the real sign-in page (give Dan
  `https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app`). New `pmikcmetro.com` users default to `Editor`, so no
  pre-provisioning. Budget guard green, $10 cap intact; live renewal review stays owner-gated (preview shows
  sample data). Weekly client-status routine added as the `/friday-update` command + a Friday 6am task.
- 2026-06-25 (S3 discovery prep — solo, no build): assembled the turnkey
  `docs/products/lease-renewal-discovery-packet.md` (per-column validation template, golden-data
  archetypes, acceptance-criteria checklist, RentVine↔sheet mapping, per-gate + write-back decisions);
  registered it in the `AGENTS.md` route table. The actual validation + golden data stay team-gated.
- 2026-06-25 (S9 Local-model provider seam): added `lib/llm/model-provider.ts` (narrow `ModelProvider`
  with Gemini + local OpenAI-compatible adapters), a `MODEL_PROVIDER`/`LOCAL_MODEL_*` config switch
  fenced from prod, budget-guard awareness of the free local path, and `npm run smoke:ask-local`
  (zero-spend: local generation + injected grounding fixture). Flipped `F-LOCALMODEL-GAP` →
  `F-LOCALMODEL-SEAM`. No SoR write; no cloud spend added; budget guard green.
- 2026-06-25 (S2 Voice & Copy — Connection Center copy pass): rewrote internal jargon, deleted the
  dead "next release" control, and removed the not-live verification over-claim across the
  Connections surface (`connector-catalog`/`ConnectorCard`/`connection-status` + the page subtitle);
  added a lexicon guard test and the `F-VOICE` fact with Supersede Log rows. No SoR write; no
  env/model change; budget guard untouched.
- 2026-06-25 (governance recalibration + feature-suite scaffolding — owner-directed): stood up the
  `docs/facts.md` spine + `verify:context-freshness` gate, re-tiered context intake, truncated this
  file, and persisted feature-suite specs + meta-prompts. No product feature built. Full detail in
  `docs/status.md`.
- Prior active product context (2026-06-24): the lease-renewal review runs on REAL RentVine leases
  (25 live) and the live "Lease Renewal" sheet read works via domain-wide delegation; the read/draft
  pipeline is wired read-only, `production_allowed:false` throughout. The open calibration work is
  tuning the reconciliation/severity rules so flags are accurate at a low false-positive rate — now
  gated behind the team-validated golden data set (see `docs/feature-suites/lease-renewal.md`).
- Operating mode: Normal owner-present coordination. Remote Away Mode is INACTIVE
  (`docs/away-mode.md`). Budget cap remains a hard $10.

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

5. Maintenance Work Order Intake — IN PROGRESS (2026-06-29): foundation (`F-MAINT-INTAKE`: draft builder +
   Draft template, gated) + STT seam (`F-STT-SEAM`: Google Cloud STT / dev stub + transcribe API) done.
   Capture UX confirmed: dedicated `/maintenance` route, record-in-browser. Remaining sub-slices: capture
   UI, Drive image-store adapter, process seed. Cross-product glue (`docs/feature-suites/cross-product.md`) later.

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
