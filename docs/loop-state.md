# Loop State

Read `docs/facts.md` first. This is the short resume pointer; history belongs in
`docs/status.md`. When you want the prioritized "what should I do next?" list with findings,
context, and recommendations, read `docs/whats-next.md`.

## Snapshot

- Last updated: 2026-07-21.
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
- **What remains is owner-gated or infrastructure only — no autonomous code slice is queued.** The
  prioritized list with per-item findings/context/recommendations is `docs/whats-next.md`. In short:
  F-AUTH-1 onboarding (needs a deploy migration that must not lock out admins), the HIGH env item
  (Firestore backups/PITR before real client data), budget kill-switch and intake-salt provisioning,
  and two owner answers (Q-CUTOVER-POSTURE; whether the primary tenant is always `tenants[0]`, which
  would revert F-LEASE-6).
- **Production is current with `main`.** Cloud Run `pmi-kc-kb-demo` serves the deployed remediation
  build (`f4330ec`, docs-only atop the byte-identical app of `36440e9`) as revision
  `pmi-kc-kb-demo-rmruogj57-577c8d7b9d1a` at 100% traffic — owner-authorized
  `npm run deploy:demo -- --budget-confirmed` on 2026-07-21 with a fresh ADC session. Auth boundary
  HTTP-smoked green: unauth `/`→307, `/sign-in`→200, `/admin`→307, `/api/ask`→405. The retained
  rollback revision is `pmi-kc-kb-demo-rmrsg73yg-2bb353f9e7dc` (served `ead5da5`).
- **Owner self-test is the current human step.** The app is built and green; the owner now walks
  through the macro features by hand. The click-by-click guide is
  `docs/manual-qa-walkthrough-2026-07-21.md`.

## Safe Stop Boundary

- `main` and `ui-ux-overhaul` are aligned at the deployed head, pushed, working tree clean; no slice
  is half-applied and no mutation is mid-flight. Production serves this exact build.
- The seven canonical app-only Approval Test fixtures are at `Ready for Approval`; both managed
  internal staff identities are `Admin` with All-spaces access. No reusable authenticated
  restricted-role or Vendor session is retained; a clean signed-out public context is ready.
- All Test/identity baselines are restored. Resume from committed state; never replay a terminal
  mutation.

## Goal

Hold the green, clean, fully-remediated v1 baseline (already live in production) while the owner (a)
walks the macro features by hand against `docs/manual-qa-walkthrough-2026-07-21.md`, and (b) decides
the owner-gated items in `docs/whats-next.md`. Do not open a new autonomous code slice unless the
owner directs one; when directed, resume the worktree → full gate → adversarial pass → ff-merge →
build-in-primary → push-both loop.

## Next Exact Actions

1. When the owner asks "what's next?", read `docs/whats-next.md` and walk them through the top
   items as confirm-with-default decisions, asking only the irreducible questions. Do not re-derive
   the closed findings; they are done.
2. Production already serves this build (revision `pmi-kc-kb-demo-rmruogj57-577c8d7b9d1a`). A new
   deploy is needed only when the next owner-approved change lands: verify `preflight:adc` is fresh,
   run `npm run deploy:demo -- --budget-confirmed`, capture the new serving + rollback revisions,
   HTTP-smoke the auth boundary, and record the new serving checkpoint in `docs/facts.md` +
   `docs/status.md`.
3. If the owner picks up an owner-gated build (e.g. F-AUTH-1), follow its recommendation in
   `docs/whats-next.md`, preserving the stated invariant (absent `scopes` must still mean all-spaces
   for already-provisioned users; never lock out existing Admins).
4. Keep governance docs current on every change: `docs/facts.md` (Tier-0), this file, and a dated
   `docs/status.md` entry, per the Documentation Rules in `AGENTS.md`.

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
