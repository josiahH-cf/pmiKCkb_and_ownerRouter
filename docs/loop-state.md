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

- Last updated: 2026-07-10
- Where we are: the multi-process operations console is the north star (lease-renewal = process #1). The
  2026-06-29 cycle shipped + merged R1–R5 (spine+IA, golden harness+labeling, renewal math, action console +
  intent-detect, and the full Maintenance Work Order Intake incl. live Drive photo sync). Full detail is in
  `docs/status.md` + `docs/facts.md` (`F-*` rows). All gates green on every merge.
- **2026-07-10 overhaul foundation + specs MERGED (PR #65); owner APPROVED; S14 app-plane tier BUILT locally.**
  Runner-neutral governance, adversarial/freshness/spec-traceability CI gates, and specs S14–S18 are on main
  (`F-RUNNER-AGNOSTIC`, `F-ADVERSARIAL-CI-GATE`, `F-SPEC-TRACEABILITY`). S14 now supplies the phone-first
  one-card renewal decider, exact D1 conditional reasons, distinct one-tap write-back authorization, same-session
  per-user Skip progress, and actor-safe inline queue approval (`F-RENEWAL-DECIDER-MOBILE`; AC-S14-1..9).
  Adversarial review closed state bleed, over-broad code-only approval, indefinite Skip hiding, tuple-key
  collisions, and stale governance claims. Full `scripts/verify.sh` + production build are green; no live action.
  The loop then CONTINUED into **S16 rbac-subusers** (orthogonal `scopes` claim + `requireSpaceAccess` guards +
  admin scope editor + tests) but was interrupted before its verification boundary; it is now green after an
  owner-run fix of an overlooked step-checks route test-mock gap (+ a scope-denial test). Committed + merged
  (PR #68), then VERIFIED 2026-07-10 (`F-RBAC-SUBUSERS`, AC-S16-1..9). The loop then built + verified **S17
  unified-console-and-attention** (`F-UNIFIED-ATTENTION`, AC-S17-1..9): the `/notifications` superset hub + one
  value-free attention-lane contract + low-alarm layer + Admin-only review digest; adversarial + browser-verified.
  Then **S15 gmail-hub** shipped app-plane TO-THE-GATE (`F-GMAIL-HUB`, AC-S15-1..7): `/gmail-hub` surfaces the invisible draft/triage/summary engines over pasted text, a tenant prepare-email twin reuses the one pre-approved compose gate, the admin page runs the live workspace, and Owner Email opens the hub — NO Gmail read scope; 1473 tests + all gates + prod build green. Then **S18 process-auto-initiation** (`F-ANTICIPATION-LANE`, AC-S18-1..9) shipped the Console's read-only "Anticipated work" lane — a pure value-free projection folding the renewal cohort + notice planners, each family one click from a test run (no scheduler, no send, no SoR write) — COMPLETING the S14–S18 overhaul; 1484 tests + all gates + prod build green.
- Production-plane fence verified (`F-PROD-CLOUD-MODEL`): prod forces Gemini + Drive; the local model,
  demo auth, and the STT/image stubs are dev/test-only (NODE_ENV-fenced), never a prod dependency.
- Earlier context (full history in `docs/status.md`): client beta deployed on the `pmi-kc-kb-demo` Cloud
  Run service (`pmi-kc-kb-prod`); real Google auth locked to `pmikcmetro.com`; live RentVine (25 leases) +
  Sheet (DWD) reads work; external execution stays gated except the documented unsent renewal-draft action.
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
  Deferred cycle COMPLETE (all 7 app-plane slices merged, PRs #56-#62); no safe app-plane slice remains, so
  the next work was then owner/vendor-gated (SUPERSEDED 2026-07-10 — the overhaul reopened S14–S18; see below).
- **Deferred cycle COMPLETE (2026-07-09), 7 slices merged (PRs #56-#62):** 2a/1b/1c/3a/3b/A4/4a + 2c/3c/A5/2d/2b shipped app-plane, each adversarially verified then PR -> CI -> merge. Full narrative in `docs/status.md`; decision spec in `docs/temp/deferred-remaining-slices.md`.

## Next Safe Slice — NONE: S14–S18 overhaul COMPLETE (remaining work owner/vendor-gated)

All five overhaul pillars are DONE + verified: `F-RENEWAL-DECIDER-MOBILE` (S14, AC-S14-1..9), `F-RBAC-SUBUSERS`
(S16, AC-S16-1..9), `F-UNIFIED-ATTENTION` (S17, AC-S17-1..9), `F-GMAIL-HUB` (S15, AC-S15-1..7), and
`F-ANTICIPATION-LANE` (S18, AC-S18-1..9 — the Console's read-only Anticipated-work lane; no scheduler, no send).
No safe app-plane slice remains; the app is migration-ready but every next step is owner/vendor-gated (below).
Cycle packet `docs/temp/ui-ux-overhaul-plan.md` is now DELETABLE (all `F-*` facts landed).

Carried owner/vendor-gated (unchanged): prod `MAINTENANCE_PHOTO_DRIVE_FOLDER_ID` + live process seed;
RentVine work-order create; Sheet-write EXECUTION (`F-WRITE-GATE`, `OQ-RV-1`); the Gmail renewal-draft prod
deploy (`npm run deploy -- --budget-confirmed`); the 3b Gmail-dependent notification families + Gmail runtime
(client Gmail access model + DWD); wiring the A4 act-in-place / 3a anticipatory composer into a live surface.

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

- 2026-07-10: S14 + S16 + S17 + S15 + S18 all passed their adversarial boundaries (`F-RENEWAL-DECIDER-MOBILE`,
  `F-RBAC-SUBUSERS`, `F-UNIFIED-ATTENTION`, `F-GMAIL-HUB`, `F-ANTICIPATION-LANE`). The S14–S18 overhaul is COMPLETE;
  "No safe slice remains" now fires — external writes, deploy, Gmail read scope, live feeds, and cost-bearing actions are owner/vendor-gated.
- 2026-07-09: the 7-slice deferred cycle shipped + merged (PRs #56-#62); superseded as the active stop by the
  2026-07-10 cycle above.
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
4. Pick the next slice from **Next Safe Slice** above — the S14–S18 overhaul is COMPLETE, so no safe
   app-plane slice remains; route to client-unblock / owner-gated cutover prep, not a new local feature.
   For lease-renewal writeback specifically, stay in discovery until the team validates process, columns, and
   golden data.
5. Preserve the existing executable allowlist exactly; do not flip another registry entry. Honor all gates + cap.
6. Update `docs/facts.md` and this file at each slice boundary; run `npm run verify:context-freshness`.
