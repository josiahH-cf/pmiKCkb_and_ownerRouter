# Loop State

Read `docs/facts.md` first. This is the short resume pointer; history belongs in
`docs/status.md`. When you want the prioritized "what should I do next?" list with findings,
context, and recommendations, read `docs/whats-next.md`.

## Snapshot

- Last updated: 2026-07-22.
- **QUEUED NEXT (outside model): the adversarial UI/UX + browser functional pass, then the demo
  test-script rewrite** — runbook `docs/overnight-build-run-2026-07-22.md` **Slice 11** (adversarial
  browser QA of every shipped flow on emulators, read-only vs live RentVine/Sheet, fix bugs at source)
  and **Slice 12** (rewrite `docs/customer-demo-walkthrough-2026-07-21.html` into a morning test script
  with verified click-paths + expected results). The build below is done; this pass verifies it and
  produces the doc the owner walks tomorrow. After it: re-gate → ff-merge → build → push → best-effort
  deploy.
- **The 2026-07-22 overnight build cycle is COMPLETE and DEPLOYED.** All 11 slices in
  `docs/overnight-build-run-2026-07-22.md` landed and the four must-haves (comp basis + Zillow, KB
  answer transparency, maintenance owner-notice draft, add-a-Space intake) all shipped. Per-slice
  detail is in the dated `docs/status.md` entry and `F-OVERNIGHT-RUN-2026-07-22`. `main` and
  `ui-ux-overhaul` are aligned + pushed at `7663cec`; working trees clean.
- **Production serves the new build.** Cloud Run `pmi-kc-kb-demo` serves `main` at `7663cec` as
  revision `pmi-kc-kb-demo-rmrwmk2kn-ae2beeaf9de7` at 100% traffic (owner-authorized unattended
  `npm run deploy -- --budget-confirmed --allow-multiple-spaces`, fresh ADC, 2026-07-22). Verified:
  `vertex spaces:11`, `drive folders:11`, `LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED:true`,
  `ASK_DEMO_MODE:false`; auth boundary green (`/`→307, `/sign-in`→200, `/admin`→307,
  `/approval-queue`→307, `/api/ask`→405). Rollback target: `pmi-kc-kb-demo-rmrwc70pc-d5cb9815094b`.
  Full gate green pre-deploy: 2,697 tests / 373 files, typecheck, lint 0 errors (13 known warnings),
  prettier, copy-voice/falsification/context/spec, production build.
  (`F-CURRENT-SERVING-CHECKPOINT-2026-07-22`.)
- **The v1 readiness remediation is COMPLETE on every testable code front.** The 65-finding
  adversarial audit (0 Blocker, 5 High, 26 Medium, 34 Low) is fully worked: the owner ruled all 22
  decision-findings (`docs/v1-remediation-decisions-2026-07-20.md`, `F-V1-REMEDIATION-DECISIONS`),
  and every self-contained code finding is fixed and verified. A blind 15-agent adversarial re-verify
  (2026-07-21) re-checked the claimed-closed findings and challenged the scope; every closed finding
  held (CLOSED/MOOT at high confidence, including the two High findings — cross-scope access on
  editable routes and the template approval-gate), and the three buildable slices it surfaced were
  then built and shipped:
  - `aa92c38` — page auth-coverage boundary test + honest `ConsoleView` docstring.
  - `4d53418` — closed the concurrent-pending Gmail double-send race (supersede-at-mint + claim-time
    identity dedup; owner ruled keep-re-sends/close-the-race; two adversarial rounds, second all-SAFE).
  - `36440e9` — F-LEASE-6: address all authoritative co-tenants as Cc on a renewal notice (draft-only
    preserved; each Cc held to the routable + authoritative bar; adversarial pass all-SAFE).
- **A queued autonomous cycle now exists (the 2026-07-22 runbook above).** The broader owner-gated /
  infrastructure backlog with per-item findings/context/recommendations is still `docs/whats-next.md`.
  In short:
  F-AUTH-1 onboarding (needs a deploy migration that must not lock out admins), the HIGH env item
  (Firestore backups/PITR before real client data), budget kill-switch and intake-salt provisioning,
  and two owner answers (Q-CUTOVER-POSTURE; whether the primary tenant is always `tenants[0]`, which
  would revert F-LEASE-6).
- **Two items are deferred to the owner (AM).** (1) The Sheet write-back LIVE proof is deferred: the
  `smoke:sheet-write` harness is built + merged, but the live run fail-closed at the DWD write-token
  exchange (HTTP 401) because the Sheets WRITE scope (`.../auth/spreadsheets`) is not yet on the
  `lease-renewal-reader` SA's domain-wide-delegation grant. Owner step: add the scope, then
  `npm run smoke:sheet-write -- --live`. (2) The RentVine renewal-WRITE gate stays
  `production_allowed:false` pending a DOCUMENTED write endpoint (Slice 1 confirmed RentVine is
  GET-only); the executor + S25 contract are built + approved-in-principle
  (`F-RENTVINE-WRITE-APPROVED`). Dotloop OAuth is scaffolded but gated OFF until the owner registers
  the app + authorizes it. Full AM steps are in the newest `docs/status.md` entry.

## Overnight run 2026-07-22 — build progress

All 11 build slices landed from baseline `ca8fd44` (per-slice commits + detail in the dated
`docs/status.md` entry). Deferred: Slice 2 Sheet write-back live proof (needs the Sheets WRITE scope
on the `lease-renewal-reader` SA's DWD grant); Slice 9 RentVine write gate stays `false` pending a
documented endpoint; Slice 10 Dotloop gated OFF pending the owner's OAuth app.

## Safe Stop Boundary

- `main` and `ui-ux-overhaul` are aligned at the deployed head, pushed, working tree clean; no slice
  is half-applied and no mutation is mid-flight. Production serves this exact build.
- The seven canonical app-only Approval Test fixtures are at `Ready for Approval`; both managed
  internal staff identities are `Admin` with All-spaces access. No reusable authenticated
  restricted-role or Vendor session is retained; a clean signed-out public context is ready.
- All Test/identity baselines are restored. Resume from committed state; never replay a terminal
  mutation.

## Goal

The 2026-07-22 overnight BUILD cycle is COMPLETE and deployed (`7663cec`, revision `rmrwmk2kn`); all
four must-have slices plus the approved remainder shipped and every safety invariant held. The QUEUED
next work (outside model) is the **adversarial UI/UX + browser functional pass then the demo
test-script rewrite** — runbook Slices 11–12 — verifying the shipped app in a browser (read-only vs
live data), fixing any bug at source, and producing the morning test-script walkthrough. After that
pass: re-gate → ff-merge → build in primary → push → best-effort deploy. The deferred owner AM steps
(Sheets write scope, RentVine endpoint, Dotloop auth) remain owner-gated; the broader backlog is
`docs/whats-next.md`.

## Next Exact Actions

0. **Run the adversarial + demo-script pass (outside model, QUEUED).** Follow runbook
   `docs/overnight-build-run-2026-07-22.md` Slice 11 (adversarial browser QA on emulators — Firestore
   :8090, Auth :9099 REQUIRED; read-only vs live RentVine/Sheet; fix bugs at source via worktree →
   gate → ff-merge) and Slice 12 (rewrite `docs/customer-demo-walkthrough-2026-07-21.html` into a
   verified morning test script). Then re-gate → ff-merge → build in primary → push → `preflight:adc`
   → deploy if fresh, else defer.

The remaining items are owner AM steps (the unattended run left them for a human).

1. **Verify + optionally roll back the deploy.** Production serves `7663cec` on revision
   `pmi-kc-kb-demo-rmrwmk2kn-ae2beeaf9de7`. Spot-check the new surfaces (comp basis on a live renewal,
   the Ask "Answered by … · N sources" line + per-source review dates, the maintenance owner-notice
   draft, Admin → Spaces → Request a new Space, Admin → Re-index Sources). One-step rollback if needed:
   `gcloud run services update-traffic pmi-kc-kb-demo --region us-central1 --project pmi-kc-kb-prod --to-revisions pmi-kc-kb-demo-rmrwc70pc-d5cb9815094b=100`.
2. **Unblock the Sheet write-back live proof.** Add the Sheets WRITE scope
   (`https://www.googleapis.com/auth/spreadsheets`) to the `lease-renewal-reader` SA's domain-wide
   delegation grant (Admin console → Security → API controls → Domain-wide delegation), then
   `npm run auth:session` + `npm run smoke:sheet-write -- --live`.
3. **RentVine write (optional).** To move `rentvine.lease.renewal_writeback` off
   `production_allowed:false`, provide the DOCUMENTED RentVine renewal-write endpoint + semantics; the
   executor + S25 contract are built and owner-approved-in-principle (`F-RENTVINE-WRITE-APPROVED`), so
   the flip is a one-line reviewed change once the endpoint is confirmed.
4. **Dotloop (optional).** Register the Dotloop OAuth app, set `DOTLOOP_OAUTH_CLIENT_ID/SECRET/
REDIRECT_URI` in `.env.local`, then authorize. Every Dotloop action stays `production_allowed:false`
   until connected + reviewed.
5. To start the NEXT cycle, follow the runner route (`AGENTS.md` → `docs/facts.md` → this file →
   `docs/whats-next.md`) and plan the next packet.

## Locked Safety

- No autonomous, scheduled, bulk, or model-triggered send. Every send is human-initiated and
  exact-confirmed.
- No guessed provider endpoint/value or customer data in git/evidence.
- Every Live external effect remains target-labeled, human-confirmed, one-attempt, idempotent,
  receipted, reconcilable, monitored, and reversible.
- Test receipts never claim Live activation. Staff/cloud identities remain `pmikcmetro.com` or
  `pmi-kc-kb-prod`; no personal account may enter an auth path.
- The approximately $10 total cost ceiling remains binding.

## Resume

Read `AGENTS.md`, `docs/facts.md`, this file, `docs/whats-next.md`, and the newest `docs/status.md`
entry. The v1 remediation is done on every testable front; the open work is owner-gated/infra. Do
not reopen settled Working-App V1 decisions or re-verify the closed findings unless new evidence
contradicts them.
