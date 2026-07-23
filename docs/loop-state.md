# Loop State

Read `docs/facts.md` first. This is the short resume pointer; history belongs in `docs/status.md`.
The prioritized "what to build next" list is `docs/roadmap-unblock-2026-07-23.md` (the full-suite build
program); the owner-unblock asks are compiled in `docs/client-unblock-guide-2026-07-23.md`.

## Snapshot

- Last updated: 2026-07-23.
- **Wave 1 of the full-suite build program is COMPLETE and merged.** All six pure-app-plane suites
  shipped in the `ui-ux-overhaul` worktree and ff-merged to `main` (Wave 1 completed at `ceb6bea`;
  `main` is now `2bfe7d4` after the docs cycle), each with a green full gate and an independent
  multi-skeptic adversarial falsification pass. Each has an authoritative
  `docs/facts.md` F-row (the record of truth); `docs/status.md` carries the narrative history.
- **A documentation + handoff cycle then ran (2026-07-23, docs only, no app code).** It produced three
  client deliverables — `docs/client-unblock-guide-2026-07-23.md` (every owner-unblock ask),
  `docs/pmi-kc-app-guide-2026-07-23.html` (full plain-language capabilities guide, folded in from the
  walkthrough), and `docs/pmi-kc-roadmap-2026-07-23.html` (what is live / next / open, client-facing) —
  and rewrote `docs/customer-demo-walkthrough-2026-07-21.html` into Say / Do / Process test rows.
- **Deployed 2026-07-23.** Production serves `2bfe7d4` (main — completed Wave 1 plus the
  documentation-and-handoff docs) on revision `pmi-kc-kb-demo-rmrxpsn5q-92c1b759735e` at 100%
  (`F-CURRENT-SERVING-CHECKPOINT-2026-07-23`); rollback `pmi-kc-kb-demo-rmrwmk2kn-ae2beeaf9de7`
  (`7663cec`). Config verified: `vertex spaces:11`, `LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED:true`,
  `ASK_DEMO_MODE:false`, `NODE_ENV:production`; auth boundary green. Run deploys from the PRIMARY tree:
  its `.env.local` carries the writeback flag; the worktree `.env.local` does not (an initial
  worktree-run deploy shipped the flag off and was corrected by redeploying from the primary tree).
- **The four owner Q&A decisions (2026-07-23)** remain in force (`F-ROADMAP-BUILD-AUTHORIZED`, roadmap
  §3): D-RENT-SUGGEST, D-RENTVINE-ENDPOINT, D-BUILDER-FULL, D-AUTOMATION-LINE.

## Wave 1 — shipped (one-line pointers; the F-row is authoritative)

- **S29** comp-informed rent suggestion, Admin-approval-gated → `F-RENT-SUGGEST-ADMIN-GATED` (supersedes
  `F-NEGOTIATION-EXCLUDED`). `73f6b41`.
- **S32** KB corrections learning loop + source freshness + read-only model-config →
  `F-KB-CORRECTIONS-LEARNING` (`Q-KBCORR-1/2`). `538cc87`.
- **S33** Ask box → live-action front door (reuses the desk's gated composer) → `F-ASK-ACTION` (resolves
  `Q-ASK-ACTION-SCOPE`). `db601ae`.
- **S38a** maintenance owner-notice draft made reachable (property-anchored resolve; draft-only) →
  `F-MAINT-OWNER-DRAFT-REACHABLE`. `2bc11d7`.
- **S28a** market-comp provider (manual default; RentCast inert) + comp-screenshot upload, display-only →
  `F-MARKET-COMP-PROVIDER` (`Q-RENTCAST-ENDPOINT`). `5c03c06`.
- **S39** internal transactional notifications + Admin Feedback center, internal-only auto
  (`D-AUTOMATION-LINE`) → `F-SUPPORT-NOTIFY-CENTER` (`e32587a`) → `F-INTERNAL-NOTIFY-EXECUTOR`
  (`9cca3b1`) → `F-INTERNAL-NOTIFY` (`ceb6bea`; Supersede Log `SUPPORT-INTAKE-NO-EMAIL`).

## Next work — Wave 2 (seam built; each waits on one named owner step)

Resume at **Wave 2** — the live-provider seams. The executor plus full S25/S26 contract are already built
and wired to fake providers; each needs the live provider built to the seam plus one owner dependency to
flip: S30 RentVine write (endpoint), S31 Gmail watch (Pub/Sub topic + Scheduler JOB), S28b RentCast (API
key), S35 LeadSimple (key + vendor confirm), S34 Dotloop (OAuth app), S36 Space provisioning (billing +
create identity), S38b maintenance send (owner-mapping evidence — CONFIRMED, flip is a reviewed change
after S38a). **Wave 3** = S37 no-code builder (pure app-plane, no owner dep). Build order and the full
owner-dependency list: `docs/roadmap-unblock-2026-07-23.md` §4/§5; the client-facing asks are in
`docs/client-unblock-guide-2026-07-23.md`. Per suite: build the live provider to the seam, then flip its
gate (both `EXECUTABLE_ALLOWLIST` copies + pinned tests) once the named dependency is documented.

## Safe Stop Boundary

- `main` and `ui-ux-overhaul` are aligned at `2bfe7d4`, pushed, working tree clean; no slice is
  half-applied and no mutation is mid-flight. Production serves `2bfe7d4` on `rmrxpsn5q`; the rollback
  target is the QA-verified `7663cec` / `rmrwmk2kn`.
- The seven canonical app-only Approval Test fixtures are at `Ready for Approval`; both managed internal
  staff identities are `Admin` with All-spaces access. No reusable authenticated restricted-role or
  Vendor session is retained; a clean signed-out public context is ready.
- All Test/identity baselines are restored. Resume from committed state; never replay a terminal mutation.

## Goal

Execute the full-suite build program (`docs/roadmap-unblock-2026-07-23.md`) build-to-seam: build each
roadmap suite's app-plane plus live provider plus full contract, ship the pure-app-plane suites, and stop
only at each suite's one named owner dependency (roadmap §5). Do not defer a whole feature at the seam.
Preserve the safety NEVERs (roadmap §7).

## Next Exact Actions

1. Wave 1 + the handoff docs are deployed (`2bfe7d4` on `rmrxpsn5q`, 2026-07-23). Future deploys run
   from the PRIMARY tree after `npm run auth:session`:
   `npm run deploy -- --budget-confirmed --allow-multiple-spaces` (verify `vertex spaces:11` +
   `LEASE_RENEWAL_SHEET_WRITEBACK_ENABLED:true`, capture the rollback revision, HTTP-smoke the auth
   boundary).
2. Interleave Wave 2 as owner dependencies (roadmap §5) land. Build each live provider to the seam now;
   flip its gate (both `EXECUTABLE_ALLOWLIST` copies + pinned tests) once the dependency is documented.
3. Or start **Wave 3 / S37** (the no-code builder) — pure app-plane, no owner dependency — under the same
   worktree → gate → falsify → ff-merge → F-row discipline.

## Locked Safety

- No autonomous, scheduled, bulk, or model-triggered CLIENT-facing send. Every client-facing send is
  human-initiated and exact-confirmed. Internal-staff notifications and read-only Gmail-watch renewal may
  auto-run (`D-AUTOMATION-LINE`).
- No guessed provider endpoint/value or customer data in git/evidence.
- Every Live external effect stays target-labeled, one-attempt, idempotent, receipted, reconcilable,
  monitored, and reversible; every client-facing send OR system-of-record write is additionally
  human-confirmed (internal-staff notifications and read-only ops may auto-run per `D-AUTOMATION-LINE`).
- Test receipts never claim Live activation. Staff/cloud identities remain `pmikcmetro.com` or
  `pmi-kc-kb-prod`; no personal account may enter an auth path.
- The approximately $10 total cost ceiling remains binding.

## Resume

Read `AGENTS.md`, `docs/facts.md`, this file, `docs/roadmap-unblock-2026-07-23.md`, then the target suite
spec under `docs/feature-suites/`. Wave 1 and the prior cycles are done and verified; the open work is
Wave 2 (owner-gated seams) and Wave 3 (S37). Do not re-verify closed findings unless new evidence
contradicts them; do not reopen a genuinely SETTLED decision. The roadmap suites (S28–S39) are AUTHORIZED
scope, not settled-closed.
