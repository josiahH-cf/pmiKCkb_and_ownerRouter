# Loop State

Read `docs/facts.md` first. This is the short resume pointer; history belongs in `docs/status.md`.
The prioritized "what to build next" list is `docs/roadmap-unblock-2026-07-23.md` (the full-suite
build program); the older owner-gated backlog with findings/context is `docs/whats-next.md`.

## Snapshot

- Last updated: 2026-07-23.
- **The full-suite build program is DEFINED and AUTHORIZED.** Owner directive 2026-07-23
  (`F-ROADMAP-BUILD-AUTHORIZED`) removed the defer-first posture: every roadmap gap is built to its
  external seam or justified as a permanent NEVER, with no third "deferred indefinitely" state.
  Scope, ordered waves (S28–S39), and the exact owner-dependency list are in
  `docs/roadmap-unblock-2026-07-23.md`. Governance was opened to match: the runner's
  Migration-Readiness Stop Gate became a Build-to-Seam Gate, and `AGENTS.md`,
  `docs/autonomous-agent-runner.md`, and `docs/feature-suites/TEMPLATE.md` now say "build the live
  provider plus the full contract; stop only at the one named owner dependency."
- **Four owner Q&A decisions (2026-07-23)** are baked in (`F-ROADMAP-BUILD-AUTHORIZED`, roadmap §3):
  D-RENT-SUGGEST (the app computes a comp-derived SUGGESTED rent number behind explicit per-number
  Admin approval; S29 supersedes `F-NEGOTIATION-EXCLUDED`), D-RENTVINE-ENDPOINT (owner provides the
  endpoint, the loop builds all else plus the flip), D-BUILDER-FULL (full no-code page/layout
  builder, S37), D-AUTOMATION-LINE (auto internal notifications plus read-only watch auto-renew are
  OK; every client-facing send stays human-confirmed).
- **The prior cycles are COMPLETE and verified.** The 2026-07-22 overnight build (Slices 1–10) plus
  the adversarial browser QA and demo test-script pass (Slices 11–12) all shipped and PASSED
  (`F-OVERNIGHT-RUN-2026-07-22`, `F-OVERNIGHT-QA-2026-07-22`). `main` = `ui-ux-overhaul`, pushed.
- **Production serves the QA-verified build.** Cloud Run `pmi-kc-kb-demo` serves commit `7663cec`
  as revision `pmi-kc-kb-demo-rmrwmk2kn-ae2beeaf9de7` at 100%
  (`F-CURRENT-SERVING-CHECKPOINT-2026-07-22`). Rollback: `pmi-kc-kb-demo-rmrwc70pc-d5cb9815094b`.
- **Audited code-state (2026-07-23):** the RentVine / LeadSimple / Dotloop / maintenance executors
  plus full contracts are already BUILT and wired to FAKE providers; the gap is a live provider plus
  one external credential each. That is exactly what the build-to-seam program closes.

## Roadmap program — next work

**Shipped this cycle (2026-07-23, worktree `ui-ux-overhaul`, ff-merged to `main`):**

- **S29** comp-informed rent suggestion (Admin-approval-gated) → `F-RENT-SUGGEST-ADMIN-GATED` (supersedes
  `F-NEGOTIATION-EXCLUDED`). Pure `computeRentSuggestion` (comp median), Admin-only approval FSM +
  Firestore control plane + route, `RentSuggestionApproval` on the live desk, `buildOwnerRenewalDraft`
  approved-suggestion channel wired end-to-end (live-desk preview + the owner Gmail send-draft, server-set),
  and the narrow server-set `draft-safety.ts` owner_money carve-out. AC-S29-1..8 green; 5-skeptic
  adversarial falsification found no safety violation; Turbopack build green on main.
- **S32** KB corrections learning loop + source freshness + read-only model-config → `F-KB-CORRECTIONS-LEARNING`.
  `ask_corrections` Proposed-only writer + route + AskForm "Suggest a correction" control; pure
  `propose.ts` (Draft KB / redaction-required eval / re-rank hints, all Proposed); Admin review lane
  (`KbCorrectionsPanel` + decide route → `createPlaceholder`); pure `computeSourceFreshness` + citation
  chip; read-only `ModelConfigPanel`. AC-S32-1..9 green. `Q-KBCORR-1/2` recorded.
- **S33** Ask box → live-action front door → `F-ASK-ACTION` (resolves `Q-ASK-ACTION-SCOPE`). Pure
  `resolveAskAction` (gate-respecting, value-free route) + pure strict `matchRenewalTarget` + read-only
  `POST /api/ask/live-target` (server-side gate check) + AskForm affordance that REUSES the desk's gated
  `RenewalNoticeDraftComposer` pre-seeded with the resolved lease. No new executor/endpoint/scope/gate;
  Action Registry untouched; Test-run/capture unchanged. AC-S33-1..8 green.

**Wave-1 remaining — resume here (pick any; all pure app-plane, zero owner dep):**

- **S38a** (surface the maintenance owner-notice draft) — NOT a clean mirror of the renewal flow. BLOCKER
  found 2026-07-23: its authoritative owner-resolution keys on the ticket's `unit.unitId`, but the RentVine
  client has NO `getUnit` hop and ticket unitIds are app-internal (`unit:demo-*`), not RentVine keys. Needs a
  deliberate unit→RentVine-property (or unit→live-lease→owner via `resolveLiveOwnerEmail`) mapping design
  before the composer/route/service can resolve an authoritative owner. Do this design first, then build.
- **S39** (internal transactional notifications + notification center) — decision-complete, pure app-plane,
  internal-only (D-AUTOMATION-LINE), gate flip authorized WITHIN the suite. LARGE (~13 files): extends the S17
  attention machinery (`lib/attention/lanes.ts`, `lib/notifications/{families,feed,hub}.ts`, new
  `support-lane.ts`) + a new gated internal-transactional executor + `internal.transactional_notice.send` key
  - the flip. Best started with fresh context; read the S17 single-gather + value-free-six-key contract first.
- **S28a** (comp data provider + screenshot upload) — pure app-plane, feeds S29; `MarketCompProvider` +
  manual adapter + display-only comps surface + comp-screenshot Drive upload (reuse the maintenance image-store
  seam) + RentCast adapter built inert + two gated-OFF Action Registry entries. S28b (RentCast key) is Wave 2.

Build order is `docs/roadmap-unblock-2026-07-23.md` §4; the three above are the Wave-1 remainder. Wave 2 =
the live-provider seams, one owner step each (S30 RentVine write, S31 Gmail watch, S28b RentCast, S35
LeadSimple, S34 Dotloop, S36 Space provisioning, S38b maintenance send); Wave 3 = S37 no-code builder. The
suite specs S28–S39 live under `docs/feature-suites/` (spec-shape sentinel plus README rows); each is
decision-complete.

## Safe Stop Boundary

- `main` and `ui-ux-overhaul` are aligned, pushed, working tree clean; no slice is half-applied and
  no mutation is mid-flight. Production serves this exact build.
- The seven canonical app-only Approval Test fixtures are at `Ready for Approval`; both managed
  internal staff identities are `Admin` with All-spaces access. No reusable authenticated
  restricted-role or Vendor session is retained; a clean signed-out public context is ready.
- All Test/identity baselines are restored. Resume from committed state; never replay a terminal
  mutation.

## Goal

Execute the full-suite build program (`docs/roadmap-unblock-2026-07-23.md`) build-to-seam: build each
roadmap suite's app-plane plus live provider plus full contract, ship the pure-app-plane suites, and
stop only at each suite's one named owner dependency (roadmap §5). Do not defer a whole feature at the
seam. Preserve the safety NEVERs (roadmap §7).

## Next Exact Actions

1. Start at roadmap §4 Wave 1. For each suite: read its spec under `docs/feature-suites/`, author a
   `docs/temp/<slug>-plan.md` packet, build the app-plane, verify and falsify, ff-merge, and promote
   to a `docs/facts.md` `F-*` row citing its `AC-` ids.
2. Interleave Wave 2 as owner dependencies (roadmap §5) land. Build each live provider to the seam
   now; flip its gate (both `EXECUTABLE_ALLOWLIST` copies plus pinned tests) once the dependency is
   documented.
3. The owner dependencies (roadmap §5) are the only external blockers: RentVine endpoint (being
   provided), RentCast key, Gmail Pub/Sub topic plus Scheduler, Sheets WRITE scope on the reader
   SA's DWD grant, LeadSimple key plus vendor confirm, Dotloop OAuth app, Space-provisioning billing
   plus create identity, maintenance-send owner-mapping evidence, kill-switch arming, per-session
   `npm run auth:session` plus owner `npm run deploy`.
4. Optional: align the serving commit — `npm run auth:session` then
   `npm run deploy -- --budget-confirmed --allow-multiple-spaces` (verify `vertex spaces:11`, capture
   the rollback revision). Production is already QA-verified, so this only advances the deployed label.

## Locked Safety

- No autonomous, scheduled, bulk, or model-triggered CLIENT-facing send. Every client-facing send is
  human-initiated and exact-confirmed. Internal-staff notifications and read-only Gmail-watch renewal
  may auto-run (`D-AUTOMATION-LINE`).
- No guessed provider endpoint/value or customer data in git/evidence.
- Every Live external effect stays target-labeled, one-attempt, idempotent, receipted, reconcilable,
  monitored, and reversible; every client-facing send OR system-of-record write is additionally
  human-confirmed (internal-staff notifications and read-only ops may auto-run per `D-AUTOMATION-LINE`).
- Test receipts never claim Live activation. Staff/cloud identities remain `pmikcmetro.com` or
  `pmi-kc-kb-prod`; no personal account may enter an auth path.
- The approximately $10 total cost ceiling remains binding.

## Resume

Read `AGENTS.md`, `docs/facts.md`, this file, `docs/roadmap-unblock-2026-07-23.md`, then the target
suite spec under `docs/feature-suites/`. The prior cycles are done and verified; the open work is the
authorized full-suite build program. Do not re-verify closed findings unless new evidence contradicts
them, and do not reopen a genuinely SETTLED decision — but the roadmap suites (S28–S39) are
AUTHORIZED new scope, not settled-closed, so build them.
