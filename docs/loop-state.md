# Loop State

Read `docs/facts.md` first. This is the short resume pointer; history belongs in
`docs/status.md`. When you want the prioritized "what should I do next?" list with findings,
context, and recommendations, read `docs/whats-next.md`.

## Snapshot

- Last updated: 2026-07-22.
- **QUEUED: the 2026-07-22 overnight build cycle.** A decision-complete runbook is locked at
  `docs/overnight-build-run-2026-07-22.md` (owner-ruled via the Round-1 decision packet
  `docs/audit-2026-07-22.html`). It runs 11 ordered slices (comp capture + Zillow link, KB answer
  transparency, KB freshness, maintenance owner-notice **draft** go-live, add-a-Space request intake,
  cost-gated re-index button, RentVine write executor **gated OFF pending a documented endpoint**,
  Dotloop OAuth scaffolding gated OFF, plus the Sheet-write live proof and RentVine field discovery),
  then full gate → ff-merge → build-in-primary → push → **best-effort unattended deploy** (owner
  authorized D01; gated on a fresh `preflight:adc`, else deferred to the morning). The owner runs
  `npm run auth:session` before departure to open the live/deploy window. Read the runbook first.
- **Baseline is green, clean, and live in production.** `main` (the v1 remediation plus the
  governance/QA doc realignment) is deployed to Cloud Run, working tree clean, `main` and the
  `ui-ux-overhaul` branch aligned and pushed. Full gate passes: 2,555 tests across 353 files,
  typecheck clean, lint 0 errors (13 known warnings), `verify:copy-voice` clean (0 jargon, 0
  operator-UI em dashes), falsification/context/spec gates green, production build green.
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
- **Production is current with `main` (includes the two shipped QA fixes).** Cloud Run `pmi-kc-kb-demo`
  serves `main` at `8243b88` (the browser-QA pass: the P3.2 friendly sign-in refusal copy + the P6.3
  server-enforced reason for single High-risk approvals, plus the annotated walkthrough and the
  unconfirmed/blocked companion doc) as revision `pmi-kc-kb-demo-rmrv6motb-be0e1c7937a4` at 100% traffic —
  owner-authorized `npm run deploy:demo -- --budget-confirmed` on 2026-07-21 with a fresh ADC session.
  Auth boundary HTTP-smoked green: unauth `/`→307, `/sign-in`→200, `/admin`→307, `/approval-queue`→307,
  `/api/ask`→405; demo auth confirmed OFF in prod (`POST /api/auth/demo`→403, no demo button). The
  retained rollback revision is `pmi-kc-kb-demo-rmruogj57-577c8d7b9d1a` (served the prior `f4330ec` build).
- **Owner self-test is the current human step.** The app is built, green, and deployed; the owner now
  walks the macro features by hand. The click-by-click guide is `docs/manual-qa-walkthrough-2026-07-21.md`
  (now annotated with the automated `model-result` per process); the short list of items the automated
  pass could not confirm (real providers / human inputs / prod config) plus how to verify the two fixes
  is `docs/manual-qa-unconfirmed-and-blocked-2026-07-21.md`.

## Overnight run 2026-07-22 — live progress (worktree `ui-ux-overhaul`)

Building per `docs/overnight-build-run-2026-07-22.md`. Baseline `ca8fd44`. ADC fresh at run start.
Each slice: worktree build → targeted tests + adversarial falsification → commit. Single ff-merge at
close-out. Live slices sequenced first (token freshest).

- **Slice 1 (RentVine field discovery) — DONE** (`5e60658`). Live read of 25 leases. Confirmed:
  tenant `tenants[].email` (25/25) + rent `unit.rent` + date `endDate`; **owner email at
  `portfolio.owners[].email` (25/25)** — `resolveRenewalRecipient` misses it today (checks singular
  `portfolio.owner`), Slice 6 wires it; Slice 3 address `property.streetName/address/city` (25/25).
  D18 write endpoint NOT probed (GET-only) — Slice 9 stays gated; flagged for AM. Map:
  `docs/products/rentvine-live-field-map-2026-07-22.md`.
- **Slice 2 (Sheet write-back live proof) — HARNESS DONE, live proof DEFERRED** (`6fdd7e4`). Added
  `smoke:sheet-write` + `createSpreadsheet`. Live run fail-closed at the DWD write-token exchange
  (HTTP 401 unauthorized_client): **Sheets WRITE scope not on the lease-renewal-reader SA's DWD
  grant** (documented dependency). Executor already unit-proven. AM owner step: grant the
  `spreadsheets` scope, re-run `npm run smoke:sheet-write -- --live`.

## Safe Stop Boundary

- `main` and `ui-ux-overhaul` are aligned at the deployed head, pushed, working tree clean; no slice
  is half-applied and no mutation is mid-flight. Production serves this exact build.
- The seven canonical app-only Approval Test fixtures are at `Ready for Approval`; both managed
  internal staff identities are `Admin` with All-spaces access. No reusable authenticated
  restricted-role or Vendor session is retained; a clean signed-out public context is ready.
- All Test/identity baselines are restored. Resume from committed state; never replay a terminal
  mutation.

## Goal

Run the 2026-07-22 overnight build cycle to completion per `docs/overnight-build-run-2026-07-22.md`:
land the four must-have slices (comp capture, KB answer transparency, maintenance owner-notice draft,
add-a-Space intake) plus the approved remainder, keep every safety invariant, then gate → ff-merge →
build-in-primary → push → best-effort unattended deploy (gated on a fresh `preflight:adc`). Preserve
the green baseline: nothing half-merged, no autonomous send/live-write, RentVine write stays
`production_allowed:false` pending a documented endpoint.

## Next Exact Actions

1. Read `docs/overnight-build-run-2026-07-22.md` (the decision-complete runbook) and
   `docs/audit-2026-07-22.html` (the owner rulings) before touching code. Follow the slice order:
   live-read/live-write work first (RentVine field discovery, Sheet-write proof), then the build
   slices, then close-out.
2. Confirm `npm run preflight:adc` is fresh (the owner runs `npm run auth:session` before leaving). If
   stale, do the offline slices and defer every live read + the deploy, flagging them for the morning.
3. Per slice: worktree build → tests → smallest relevant checks → adversarial falsification pass →
   update `docs/loop-state.md` at the boundary. On a genuine blocker, record it and skip to the next
   safe slice (never halt, never guess a live external effect).
4. Close-out: full gate → ff-merge to `main` → build in primary → push both → `check:live-cost` →
   `preflight:adc` → deploy (`--budget-confirmed --allow-multiple-spaces`, verify `vertex spaces: 11`)
   or defer. Capture serving + rollback revisions. Update `docs/facts.md` (Tier-0), this file, and a
   dated `docs/status.md` entry, then write the morning report.

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
