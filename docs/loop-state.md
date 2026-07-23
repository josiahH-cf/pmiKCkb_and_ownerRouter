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

(Each shipped slice below has a full `docs/facts.md` F-row — the authoritative record; these are one-line pointers. `docs/status.md` carries the S29/S32/S33 history entry; S38a/S28a/S39.1 live in their F-rows.)

- **S29** comp-informed rent suggestion, Admin-approval-gated → `F-RENT-SUGGEST-ADMIN-GATED` (supersedes
  `F-NEGOTIATION-EXCLUDED`). AC-S29-1..8; falsified clean; Turbopack green.
- **S32** KB corrections learning loop + source freshness + read-only model-config → `F-KB-CORRECTIONS-LEARNING`
  (`Q-KBCORR-1/2`). AC-S32-1..9.
- **S33** Ask box → live-action front door (reuses the desk's gated composer; no new executor/endpoint/scope/gate)
  → `F-ASK-ACTION` (resolves `Q-ASK-ACTION-SCOPE`). AC-S33-1..8.
- **S38a** maintenance owner-notice draft made REACHABLE (property-anchored owner resolve, draft-only, `.send`
  stays gated) → `F-MAINT-OWNER-DRAFT-REACHABLE`. AC-S38-1..4.
- **S28a** market-comp provider (manual default; RentCast built INERT) + comp-screenshot Drive upload,
  DISPLAY-only, two gated-OFF Registry entries → `F-MARKET-COMP-PROVIDER` (`Q-RENTCAST-ENDPOINT`). AC-S28-1..6.
- **S39.1** (notification-center half of S39) → `F-SUPPORT-NOTIFY-CENTER` (records `Q-SUPP-FOLLOWUP`). Admin-scoped
  Feedback lane on the ONE S17 machinery: new `support` lane + meta, `support_reports` family (7→8), value-free
  `gatherSupportAttention` (reads only `support_reports`, at most two count signals, `/admin` deep link only),
  hub gathers it `full && isAdmin` + serve-time Admin family filter (mirrors `team_review`), `/notifications`
  Feedback section, and the `SupportReportsPanel` badge from the SAME gather (interlock: neither recomputes;
  the hub also honors notification mute/snooze so it can intentionally show less than the authoritative panel
  badge — pinned by tests). No send. AC-S39-1/-2/-3/-8 green; 2877 tests; falsification found only that
  intended mute-layer nuance (severity low), resolved + tested.

**Wave-1 remaining — resume here (S39.2 + S39.3, the send half of the LAST Wave-1 suite; internal-only, zero owner dep):**

- **S39.2** (internal transactional executor, gated OFF) — add the internal-domain allowlist to
  `UpdateOwnerTransactionalDestinationInputSchema`; build `lib/notifications/internal-transactional.ts`
  (recipient resolved ONLY from a non-actor-gated SYSTEM read of the owner destination — never
  `readOwnerTransactionalDestination(actor)` which 403s non-Admin reporters; re-assert the domain allowlist at
  send; metadata-only payload; idempotent one-attempt keyed `support_report:{id}:filed`; receipt/health store),
  plus the gated-OFF `internal.transactional_notice.send` Registry key (`production_allowed:false`, both
  allowlists untouched). NOT wired to send yet. AC-S39-4/-5/-6.
- **S39.3** (auto-emit + in-suite flip) — emit the internal notice from `app/api/report-issue/route.ts` AFTER
  the durable queue write (a send failure never blocks the write); flip the gate the routine reviewed way (both
  `EXECUTABLE_ALLOWLIST` copies + pinned tests); DELETE the now-false "display-only"/"nothing here sends" copy
  (`TransactionalDestinationPanel`, `owner-transactional-destination.ts` header, `report-issue/route.ts`) with a
  Supersede Log marker. AC-S39-7. Then promote `F-INTERNAL-NOTIFY` (AC-S39-1..8).

Build order is `docs/roadmap-unblock-2026-07-23.md` §4; S39.2/S39.3 above are the Wave-1 remainder. Wave 2 =
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
