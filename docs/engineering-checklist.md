# Engineering Checklist

## Start

- Check branch/worktree and preserve user changes.
- Read `AGENTS.md`, `docs/facts.md`, `docs/loop-state.md`, and the relevant spec.
- Before live Google/GCP work: `npm run preflight:adc`, `npm run check:budget-guard`, and verify
  S52's applied `$25` alert and `$100` hard stop remain live-confirmed in lockstep. A green posture
  check alone is not cost headroom.
- Keep secrets in `.env.local`, Secret Manager, or the active shell only.

## Behavior

- Production operational records are Live only. Keep the retained `data_mode` decoder fail-closed so
  restored non-Live state is identified and refused; never create a new `data_mode:"test"` record.
- Run local rehearsal only with the exact server-owned descriptor
  `environmentKind:"demo"`, `dataContext:"live_readonly"`, and `source:"explicit"`.
- Prove local rehearsal can perform only bounded Live reads and refuses every durable write,
  provider effect, draft, send, execution claim, and receipt.
- Keep deterministic invented fixtures, `.invalid` aliases, fake transports, and synthetic receipts
  under automated tests/helpers only. They are not product records or Live-provider evidence.
- Do not provision a hosted Demo project or fixture seeder; that path is deferred.
- Keep Live failures visible; never substitute fixture data.
- Show exact action, target, effect, role decision, and confirmation before a Live external write.
- Enforce one attempt, idempotency, bodyless receipt, reconciliation, and rollback.
- Never add autonomous/scheduled/bulk/model-triggered sends.

## Maintenance and Vendor

- Exercise ordinary Live ticket status, assignment, note/Activity, close, reopen, and exact provider
  readiness without creating a synthetic Production ticket or assignment.
- Keep the Live Vendor boundary separate: Admin invitation, verified email, TOTP, active assigned-ticket
  join, same-address OAuth/vault where activated, exact confirmation, and immediate disable/revocation.
- Revalidate current Vendor identity, assignment, ticket, thread, and mailbox ownership at every read,
  claim, confirmation, and commit; stale or disabled joins fail before provider construction.
- Prove no Production route, component, store, or session boundary can create or operate a Test Vendor,
  Test mailbox, Test ticket, or simulated provider receipt.
- Keep Vendor lifecycle, mailbox, concurrency, and recovery scenarios as deterministic automated tests
  under `tests/helpers`; those scenarios must construct no Live provider and cannot count as Live proof.
- Confirm any present `vendor`, `vendor_id`, or `data_mode` custom-claim key—even false, empty, or
  malformed—fails closed from the internal roster/Admin count, role/scope mutation, staff session,
  internal ID token, and absent-scope/all-Spaces fallback. Separately prove that Vendor auth accepts
  only the exact valid `vendor:true` + canonical `vendor_id` + Live `data_mode` triple.

## Provider Activation

- Keep action state independent from app V1.
- For each Live action verify contract, mapping, credential, target preview, authority, receipt,
  readback/reconciliation, monitoring, and kill switch.
- Do not guess undocumented endpoints; keep that action unavailable. Deterministic automated tests may
  prove the contract logic, but only lane-correct Live readback proves the provider action.

## Production Setup

- Verify `pmi-kc-kb-prod` identities, Firebase project, Secret Manager refs, Firestore, Cloud Run
  service `pmi-kc-app`, and canonical URL
  `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`; verify `pmi-kc-kb-demo` remains absent.
- Firebase Email/Password, TOTP, and provider enablement remain separately governed Auth
  configuration. The Cloud Automation Grant permits an in-scope Firebase authorized-domain change
  under the managed identity with live readback; removing a domain still in use is a lowering of a
  safety control and still asks.
- Seed/update Action Registry and process definitions only against the canonical project.
- `firestore.rules` is D12-protected: isolate a changed ruleset for owner review and never include it
  in an unattended push/deploy. Index creation is a separate cloud-resource mutation and occurs only
  for an actual required query.
- Use `npm run release` for plan-only review, zero-traffic tagged candidate creation, candidate smoke,
  and a separate deliberate exact-revision promotion. Capture the current `pmi-kc-app` revision and
  exact rollback command before deployment; never target the retired service or floating `LATEST`.

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

Then run signed-in desktop/phone acceptance against Production Live-only behavior, the exact local
Live-read-only descriptor/refusal checks, canonical endpoint smoke, observability checks, and exact
revision rollback verification. Run deterministic workflow/Vendor fixtures only through the automated
test suites. Record non-secret evidence in `docs/status.md` and the current walkthrough.
