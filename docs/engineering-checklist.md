# Engineering Checklist

## Start

- Check branch/worktree and preserve user changes.
- Read `AGENTS.md`, `docs/facts.md`, `docs/loop-state.md`, and the relevant spec.
- Before live Google/GCP work: `npm run preflight:adc` and `npm run check:budget-guard`.
- Keep secrets in `.env.local`, Secret Manager, or the active shell only.

## Behavior

- Mark every new operational record Live or Test; legacy absence resolves to Live.
- Use reserved `.invalid` aliases for Test and render an always-visible Test badge.
- Prove Test paths cannot import/construct/call a Live provider.
- Let Test app records traverse the full lifecycle and reach Done.
- Keep Live failures visible; never substitute Test data.
- Show exact action, target, effect, role decision, and confirmation before a Live external write.
- Enforce one attempt, idempotency, bodyless receipt, reconciliation, and rollback.
- Never add autonomous/scheduled/bulk/model-triggered sends.

## Maintenance and Vendor

- Create canonical Test ticket through the strict server-owned seed route.
- Verify only Summit Plumbing Test Vendor can attach to a Test ticket and cannot attach to Live.
- Exercise status, assignment, note/activity, simulated actions, close, and reopen.
- Provision the canonical Test Vendor through exact preview, response-only `no-store` password link,
  TOTP enrollment, fresh password+TOTP sign-in, assigned-ticket view, Test mailbox, and
  disable/revoke.
- From `pending_setup`, `active`, and `disabled`, exact-preview a reset bound to current UID/status/
  `inviteVersion`; confirm UID rotation, fresh password/TOTP requirement, old-session and stale-mailbox-
  confirmation denial, preserved Test tickets/mailbox/receipts, and zero provider/Live effects.
- Interrupt reset at each Firebase/Firestore/link-completion boundary; verify the replacement remains
  disabled with an unreturned password, factors cleared, and sessions revoked. Verify initial winning
  claim writes bodyless `test_vendor_authentication_reset_claimed`; successful invite commit writes
  one canonical `test_vendor_authentication_reset`; failed pre-commit work retains only the claim event
  and creates no invite increment/canonical reset audit.
- Overlap two same-preview reset requests; verify one transactional lease owner performs all Firebase
  work and mints the only link, while the loser fails before auth mutation and cannot compensate the
  winner. Verify expired takeover only after the lease exceeds the deployed request timeout.
- Crash at `prepared` and reload the normal Admin page. While the lease is live, verify the original
  reason returns the same UID-free confirmation and a different reason/takeover refuses. After expiry,
  enter a fresh reason and verify the server rebinds only its hash to the validated original source
  UID/status/`inviteVersion` tuple without manual Firestore repair.
- For expired `claimed` and `prepared` takeover, verify any exact-claims abandoned Auth principal is
  hardened/revoked/deleted rather than adopted; the winner UID differs from the source UID, current
  Firestore record UID, and resolved Auth UID. Reject and delete a forbidden UID allocation. Every
  successful takeover atomically writes bodyless `test_vendor_authentication_reset_recovery_claimed`
  with actor UID/Vendor id/fresh reason hash/time. A prepared repair keeps its one invite-version increment
  and canonical reset audit without duplicating either; the recovery-claim audit is separate.
  Releasing delayed old-owner enable/completion cannot mint another link or alter/disable/delete the
  winner.
- For setup-link recovery, verify the winning claim writes bodyless
  `test_vendor_setup_link_regeneration_claimed`, successful completion writes
  `test_vendor_setup_link_regenerated`, and failed pre-completion work retains only the claim event.
  No lifecycle audit stores plaintext reason, target/replacement Firebase UID, setup link, password, or
  secret; the actor UID remains the authorized audit principal.
- Interleave Admin disable with reset. Claimed/prepared (including expired) must return 409 before
  Firebase/audit and direct the operator to recover reset first; disable-first must stale the old reset
  confirmation while a fresh disabled-state preview/reset succeeds; completed reset must not block
  disable.
- For every Test mailbox read, draft/label write, confirmation creation, and reply commit, atomically
  revalidate the current active Vendor UID, active Test assignment, Test ticket/thread/mailbox join,
  and no claimed/prepared reset. Disable, deassignment, UID rotation, or reset claim must revoke stale
  read/write authority before state changes or receipts.
- Confirm Test Vendor is rejected before OAuth/Gmail construction.
- Confirm any present `vendor`, `vendor_id`, or `data_mode` custom-claim key—even false, empty, or
  malformed—fails closed from the internal roster/Admin count, role/scope mutation, staff session,
  internal ID token, and absent-scope/all-Spaces fallback. Separately prove that Vendor auth accepts
  only the exact valid `vendor:true` + canonical `vendor_id` + matching `data_mode` triple.

## Provider Activation

- Keep action state independent from app V1.
- For each Live action verify contract, mapping, credential, target preview, authority, receipt,
  readback/reconciliation, monitoring, and kill switch.
- Do not guess undocumented endpoints; keep that action unavailable and use Test evidence meanwhile.

## Production Setup

- Verify `pmi-kc-kb-prod` identities, Firebase project, Cloud Run service, Secret Manager refs,
  Firestore, and canonical URL.
- Enable Firebase Email/Password and TOTP MFA; authorize the deployed hostname for Firebase Auth.
- Seed/update Action Registry and process definitions only against the canonical project.
- Deploy Firestore rules when they changed; add indexes only for actual required queries.
- Capture the current serving revision before deployment.

## Verification

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:firestore
npm run test:e2e:core
npm run build
bash scripts/verify.sh
```

Then run signed-in desktop/phone browser acceptance, production Test workspace, Maintenance Test to
Done, Vendor password/TOTP/assigned-ticket/reset/re-enable flow, endpoint smoke, observability check,
and rollback command verification. Record non-secret evidence in `docs/status.md` and the V1 HTML
walkthrough.
