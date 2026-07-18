# Loop State

Read `docs/facts.md` first. This is the short resume pointer; history belongs in
`docs/status.md`.

## Snapshot

- Last updated: 2026-07-18.
- The validated audit-remediation implementation was integrated through protected PR #76. The
  deployed Vendor-handoff regression repair was then integrated through protected PR #77 as product
  commit `618602020599104e601b89fb59d2d53a959c9e6d`.
- Product commit `6186020` is serving at 100% on Cloud Run revision
  `pmi-kc-kb-demo-rmrqihw0o-e78cdaa5b501`, image digest
  `sha256:b3be8782bc12461d9018d3272fef238dc07d830b0794084e7fe3fe51c1c2b8e7`. Cloud Build
  `aaeecd4a-3fe0-4454-b0e9-ac8ce3510066` built that exact source. The retained rollback revision is
  `pmi-kc-kb-demo-rmrqf0ce6-ac7fc4d500ea`.
- The clean integrated verifier passed from `6186020`: 322 test files / 2,289 tests, format,
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
  has 20 terminal cases: 17 pass, three expected denials, 261 pending, and zero in progress. The four
  completed approval mutations are approve, return, snooze, and assign. Each has an exact intent,
  effect, bodyless DOM evidence, and terminal result; none contacted a provider.
- The pass-two ledger still maps all 137 pass-one findings and the capability matrix still maps all
  281 stable cases. Their last durable sidecar reconciliation is revision 17; the three newly
  terminal approval actions still need later ledger/matrix reconciliation with the remaining cases.
  Auth-preflight revision 2 truthfully records the current session posture.

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

1. Confirm the pass-two status remains `20 completed / 261 pending / 0 in progress` and inspect the
   permanent evidence before any new mutation. `APPROVAL-ACT-005` is the first unstarted approval
   mutation; then prove the execute and bulk-execute guards as expected denials for
   `APPROVAL-ACT-006` and `APPROVAL-ACT-007`.
2. Complete the remaining Approval read cases from the same deployed fixture suite. If another reset
   is required after mutation, temporarily narrow the secondary staff actor through the supported
   Admin UI, restore the seven fixtures, and immediately restore both staff identities to Admin / All
   spaces again.
3. Continue the remaining Lease, Maintenance, Spaces, Communications, Console, Notifications,
   Connections, Admin, intake, publication, cross-surface, and audit-integrity cases. Provision
   isolated role or Vendor sessions only for the bounded cases that require them, then sign out or
   disable them at the next safe boundary.
4. Reconcile every terminal result into the 137-row ledger and 281-row matrix, update auth readiness,
   restore all Test baselines, finalize and validate the run, execute the full repository validation,
   integrate the final tracked changes, deploy the exact integrated commit, and rerun affected
   deployed evidence before reporting completion.

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
