# Loop State

Read `docs/facts.md` first. This is the short resume pointer; history belongs in
`docs/status.md`.

## Snapshot

- Last updated: 2026-07-19.
- GO-LIVE (owner grant 2026-07-19, `F-SEND-AUTHORIZED`): the default posture is ship-to-production,
  not preview-only-pending. Opening a built action's `production_allowed` is a routine reviewed change;
  "pending" now means only a genuine named external dependency. The safety invariants below (Locked
  Safety) are retained because they permit go-live, not because they block it.
- The validated audit-remediation implementation was integrated through protected PR #76, the
  Vendor-handoff regression repair through PR #77, and the Approval route-selection repair through
  PR #79 as product commit `f6d5ddbce8b250b64df3bc58c81398f09e33b869`.
- Product commit `ead5da5` (main) is serving at 100% on Cloud Run revision
  `pmi-kc-kb-demo-rmrsg73yg-2bb353f9e7dc` (owner-authorized `--budget-confirmed` deploy 2026-07-19,
  run non-interactively while the session CLI login was fresh). It carries the F-SEND-AUTHORIZED
  go-live posture, the activated `gmail.renewal_notice.draft_create` gate, the complete live
  renewal-notice draft feature, and the finalization pass (below). Live-verified over HTTP: unauth
  `/`→307 `/sign-in`, `/sign-in`→200, `/admin`→307, `/api/ask` GET→405 (POST-only route). The retained
  rollback revision is the prior `pmi-kc-kb-demo-rmrrv992z-a2cc59bb11db` (served `c87f54d`).
- The live renewal-notice draft feature now deployed in `ead5da5` (built as `b8c6963`):
  the library core (Slices A/B/C + hardening: `LiveRenewalGmailDraftProvider`, `resolveRenewalRecipient`,
  `buildRenewalNoticeDraftAction`/`executeRenewalNoticeDraft`), the property→owner join (D), the
  preview/compose core (E), the in-app route + UI — `POST /api/lease-renewal/renewal-notice-draft`
  (`prepareRenewalNoticeDraft`) plus the two-step `RenewalNoticeDraftComposer` (F/G) — and the
  Admin-gated live renewal-notices desk `/lease-renewal/live/notices` (H) that lists the actionable live
  RentVine cohort and mounts the composer per REAL lease id (degrading to a connect-RentVine panel when
  not connected). Proven end-to-end by the owner-run `smoke:renewal-draft-live -- --live` (25/25 tenant
  resolution, one real self-addressed unsent draft created + deleted). Draft-only and safe: the recipient
  is resolved server-side from the authoritative live RentVine lease and is never client-controllable; the
  draft lands only in the signed-in user's own mailbox; `confirm:true` is required to create; the
  production gate + authoritative-recipient guard are re-asserted on every create, so sample/test data and
  `.send` actions can never produce a real draft. A comprehensive multi-agent adversarial audit of the
  whole feature confirmed the safety model holds (security dimension found nothing); its 8 verified
  findings — 2 major (owner-rent extraction wrongly gated on tenant name; a null export row crashed the
  read) and 6 minor ($0-rent, CR/LF-in-address, export-scan perf, three test gaps) — are all fixed and
  re-verified (`b8c6963`), including a shared short-TTL export cache. Now DEPLOYED and HTTP-smoke-verified
  (2026-07-19, revision `rmrsg73yg-2bb353f9e7dc`). Remaining owner-gated: a live click-through of the desk
  in a RentVine-connected env to mint a real draft end-to-end (local dev SSR/renderer was unresponsive
  this session, so automated coverage rests on unit tests + typecheck + the production build).
- Finalization pass (2026-07-19): a 13-domain adversarial spec audit (ticket-icon + UI/UX-overhaul +
  compass) verified every "implemented" claim against code; the honest coverage backlog is in
  `docs/status.md`. The operator-UI em-dash purge cleared all 60 warnings and `verify:copy-voice` now
  hard-fails operator-UI em dashes and runs inside `scripts/verify.sh`. Gate reconciliation (part 2):
  nothing built-and-connected is stuck behind a governance default (the four Gmail actions are live;
  every other `production_allowed:false` is a genuine external/vendor/unbuilt-contract dependency).
  OWNER DECISION PENDING `Q-CUTOVER-POSTURE`: spec §B ("remove test/simulation/demo") conflicts with
  the standing Test-lane-as-safety governance; surfaced, not acted on unilaterally.
- The clean integrated verifier passed from `f6d5ddb`: 322 test files / 2,290 tests, format,
  typecheck, router/falsification/context/spec/redaction, production build, Firestore 59/59, and core
  E2E 32 passed / 18 intentional prerequisite skips. Lint had zero errors and eight known warnings;
  the runtime dependency audit had zero findings.
- Deployed `VENDOR-PORTAL-011` now passes. Maintenance projects the exact canonical Test assignment,
  current Complete state, bounded Waiting to Complete history, two simulated replies, and the next
  internal closeout action without exposing a body, provider, Gmail, OAuth, credential, or Live
  effect. Finding `FND-VENDOR-PORTAL-011-01` is resolved and capability
  `CAP-VENDOR-PORTAL-011` is pass.
- The resumable deployed pass-two run is
  `artifacts/process-audit/20260718T101933Z-remediation-pass2/`. It is intentionally still running and
  has 35 terminal cases: 29 pass, five expected denials, one honest `not_reachable` empty state, 246
  pending, and zero in progress. All seven Approval action cases are terminal: approve, return,
  snooze, assign, and disable pass in isolated Test app state; approval-and-execute and bulk Execute
  stop before provider construction as expected denials. Eleven Approval read cases pass and the
  empty write-back projection is honestly `not_reachable` without inventing a row.
- `APPROVAL-012` exposed one real same-page selection regression: clicking a different `?item_id=`
  link changed the URL while the preserved client component retained the prior detail until refresh.
  The integrated repair reconciles route-owned selection when streamed server props change. Its
  focused 12/12 suite and full integrated validation pass; deployed proof shows URL, active link,
  detail, Activity, All/Renewal/Write-back views, Ready filter, and refresh state remain synchronized,
  with zero browser-console errors and no mutation or provider effect.
- The pass-two ledger still maps all 137 pass-one findings and the capability matrix still maps all
  281 stable cases. Approval reconciliation advanced both sidecars to revision 18: nine applicable
  Approval findings are resolved, the prior documentation-only row remains evidence-excluded, and
  all 19 Approval capabilities have terminal pass-two outcomes. Auth-preflight revision 3 truthfully
  records the restored role/fixture baseline and retained-session posture.

## Safe Stop Boundary

- All seven canonical app-only Approval Test fixtures are restored to `Ready for Approval`.
- Both managed internal staff identities are restored to `Admin` with All spaces access. The
  secondary actor was temporarily narrowed only to seed and restore the isolated approval fixtures.
- The isolated Editor/Renewals-only browser session was signed out. Its earlier deployed role and
  scope evidence remains attached to `ADMIN-003` and `ADMIN-004`; reprovision it only when another
  restricted-role check requires it.
- The primary Admin session remains ready. A distinct secondary Admin exists, but no separate
  authenticated secondary-Admin session is retained. The canonical Test Vendor lifecycle was proven,
  but no reusable authenticated Vendor session is retained. A clean signed-out public context is
  ready.
- No mutation case is left in progress. Resume from runner state and never replay a terminal mutation.

## Goal

Resolve or evidence-exclude all 137 pass-one findings, terminalize all 281 capability rows, preserve
every security/identity/cost/Live-effect/human-confirmation boundary, run the final verifier, integrate
and deploy the exact final `main` commit, complete deployed browser pass two, restore every Test and
identity baseline, and publish the final pass-one-versus-pass-two report.

## Next Exact Actions

1. Continue the remaining Lease, Maintenance, Spaces, Communications, Console, Notifications,
   Connections, Admin, intake, publication, cross-surface, and audit-integrity cases. Provision
   isolated role or Vendor sessions only for the bounded cases that require them, then sign out or
   disable them at the next safe boundary.
2. Reconcile each newly terminal surface into the 137-row ledger and 281-row matrix from revision 18,
   update auth readiness when a bounded session is provisioned or retired, and never replay the 35
   existing terminal cases.
3. Restore all Test and identity baselines at every mutation boundary; keep Live provider actions,
   sends, customer-data writes, and unsupported positive paths evidence-excluded unless their exact
   existing governance contract and human confirmation make them independently reachable.
4. When all 281 cases are terminal, restore all Test baselines, finalize and validate the run,
   execute the full repository validation, integrate the final tracked changes, deploy the exact
   integrated commit, and rerun affected deployed evidence before reporting completion.

## Locked Safety

- No autonomous, scheduled, bulk, or model-triggered send.
- No guessed provider endpoint/value or customer data in git/evidence.
- Every Live external effect remains target-labeled, human-confirmed, one-attempt, idempotent,
  receipted, reconcilable, monitored, and reversible.
- Test receipts never claim Live activation. Staff/cloud identities remain `pmikcmetro.com` or
  `pmi-kc-kb-prod`; no personal account may enter an auth path.
- The approximately $10 total cost ceiling remains binding.

## Resume

Read `AGENTS.md`, `docs/facts.md`, this file, the newest `docs/status.md` entry, and the relevant
feature-suite spec. Preserve concurrent user work, adopt the existing pass-two events and evidence,
and continue at the first incomplete Next Exact Action without reopening settled Working-App V1
decisions.
