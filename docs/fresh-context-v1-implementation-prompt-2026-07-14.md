# Fresh-context prompt — operate and extend the working PMI KC V1

> Rewritten 2026-07-15. This file supersedes the 2026-07-14 all-providers-live/Pre-V1 continuation
> prompt. Tier-0 facts and `docs/loop-state.md` remain authoritative when the repository advances.

Continue the PMI KC stable working-application V1 goal. Do not reopen Round 1–3 or ask the owner to
re-answer R01–R09. The choices are settled: production contains separate Live and visibly labeled
Test lanes; Test records make real application/Firestore writes and may reach Done; Test never calls
an external provider or proves Live; Maintenance and the external Vendor experience are V1 features;
and each Live provider action is activated independently.

Read, in order:

1. `AGENTS.md`
2. `docs/facts.md`
3. `docs/loop-state.md`
4. the newest entry in `docs/status.md`
5. `docs/v1-gap-implementation-program-2026-07-14.md`
6. the relevant S20–S27 feature suites
7. `docs/client-checklist.md` and `docs/environment-handoff.md` for the exact remaining activation
   item, if any

Then inspect the current branch, worktree, recent commits, and deployed revision. Preserve user work.
Run `npm run verify:context-freshness`, and run `npm run preflight:adc` before any live Google read or
cloud change. If managed reauthentication is stale, ask the owner to run the exact Windows command in
`docs/environment-handoff.md`; never substitute a personal account.

## Working V1 contract

- The app is V1 when the deployed authenticated product and its complete isolated Test workflows are
  stable. A missing optional provider credential does not rename the app Pre-V1.
- Production carries Live and Test together. Every record, identity, adapter, idempotency key, audit,
  and receipt is lane-bound. Legacy or malformed records resolve Live and never gain Test privileges.
- Test may persist realistic records and complete full workflows. Canonical aliases use
  `example.invalid`; Test adapters are branded no-client adapters; every receipt says no provider was
  contacted and is structurally ineligible for Live evidence.
- Live reads use real configured sources and fail visibly when unavailable; they never fall back to
  Test fixtures.
- Every Live external effect names the exact action, target, connection/account, and material values;
  requires the permitted human confirmation or approval; makes one idempotent attempt; captures a
  bodyless receipt/readback; reconciles ambiguity before correction; and has an action-level disable
  and rollback path.
- No autonomous, scheduled, bulk, or model-triggered send is permitted. No guessed recipient, value,
  contract, endpoint, mailbox, or provider success may be presented as Live.
- Vendor access is separate from internal access: Admin-provisioned Email/Password, verified email,
  TOTP, recent auth, immutable Vendor/email/mode join, assigned-ticket-only authorization, and exact
  disable/session revocation. The canonical Test Vendor uses an app-only mailbox; a real Vendor uses
  that Vendor's own OAuth mailbox only when separately activated.
- Native TTL, extra indexes, and Scheduler automation are optional operational improvements. The V1
  default is bounded manual cleanup, holds, counts-only audit, and bodyless/minimized storage.
- Dan/Josiah signoff is useful advisory metadata. It does not determine whether observed application
  behavior works.

## How to continue

Choose the smallest falsifiable slice from `docs/loop-state.md`. Use invented aliases and persistent
production Test data whenever a real provider is unavailable. For code changes, add boundary and
cross-lane negative tests, run focused tests, then run the full verification stack. For an external
activation, use the exact row in `docs/v1-client-unblock-checklist-2026-07-14.md`: configure one real
contract/credential/mapping, check health, preview exact effect, perform one human-confirmed bounded
proof, capture bodyless readback/monitor/correction evidence, and enable only that action.

Do not turn these into whole-app blockers:

- an inactive or future provider;
- optional source expansion;
- native TTL, unused composite indexes, or Scheduler;
- pending named signatures; or
- the three documented Moderate dev-only `firebase-tools` dependency-chain findings while their
  time-bounded disposition remains current and no High/Critical/runtime-reachable finding appears.

When finishing a slice, update `docs/facts.md` for verified or superseded context,
`docs/loop-state.md`, the newest `docs/status.md` entry, `docs/plan.md`, the affected product/spec docs,
and the human V1 HTML report when the deployed state changed. Commit intentionally, merge/push only
after verification, deploy only with captured rollback and managed identity, and validate the actual
deployed desktop/phone application rather than treating a local render as production proof.

Stop only when the selected outcome is complete or when a genuine blocker remains. A genuine blocker
must name the exact failed step, evidence, owner, smallest safe default, exact command or information
needed, and the independently useful work completed meanwhile.
