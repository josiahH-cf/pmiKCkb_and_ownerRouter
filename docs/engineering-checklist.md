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
- Provision the canonical Test Vendor through exact preview, one-time password link, TOTP enrollment,
  fresh password+TOTP sign-in, assigned-ticket view, Test mailbox, and disable/revoke.
- Confirm Test Vendor is rejected before OAuth/Gmail construction.

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
Done, Vendor password/TOTP/assigned-ticket flow, endpoint smoke, observability check, and rollback
command verification. Record non-secret evidence in `docs/status.md` and the V1 HTML walkthrough.
