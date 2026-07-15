# V1 monitoring and rollback plan

Date: 2026-07-15. Status: **working-app operations contract**.

V1 application health and external-provider activation are monitored separately. The production app
is healthy when its signed-in surfaces, Firestore persistence, Live/Test isolation, explicit previews,
human confirmations, and recovery paths work. A provider that is not yet activated is shown as
`Unavailable` or `Test ready`; it does not make the whole application pre-release.

## Operating ownership

- Josiah is the technical operator for deployment, monitoring, action closure, reconciliation, and
  rollback. Dan validates business wording and outcomes during normal use; his signature is useful
  evidence, not a technical release lock.
- Every production record carries or resolves to `data_mode=live|test`. Missing legacy values resolve
  to `live` so old customer records can never drift into Test behavior.
- Test records are visibly labeled, write to the app/Firestore, and may reach `Done`. They must use
  only the isolated Test executor, contact no external provider, and record
  `live_proof_eligible=false`.
- Live writes show the exact action, target, material values, and correction consequence before one
  human confirmation. No autonomous, scheduled, bulk, model-triggered, or blind-retry send is allowed.

## Application monitors

Monitor the deployed revision for sign-in/session failures, authorization denial spikes, Firestore
read/write failures, queue age, stale preview rejection, one-attempt claims without terminal receipts,
ambiguous outcomes awaiting reconciliation, and Live/Test mode mismatch. Alert immediately if:

- a Test record selects a Live adapter or produces a provider reference;
- a Live record selects a Test adapter or synthetic alias;
- a Vendor can see a guessed, deassigned, disabled, cross-mode, or cross-Vendor ticket;
- a write executes without its current exact preview/confirmation; or
- an audit path attempts to store a message body, file, token, secret, or customer value.

The production Test workspace should be exercised after deployment with the canonical invented unit
`unit:test-maple-204` (`TEST — 204 Maple Court Unit 2`) and Vendor
`vendor:test-summit-plumbing` (`Summit Plumbing Test Vendor`,
`service@summit-plumbing.example.invalid`). A successful run creates app-owned receipts and reaches
Done with zero external calls.

## Per-provider monitors

Track each Live provider independently as `unavailable`, `test_ready`, `live_configured`,
`live_proven`, `enabled`, or `suspended`. For an enabled action monitor authentication/scope health,
mapping freshness, idempotency/reconciliation state, read-after-write match, and the documented
correction path. Closing one action must not disable unrelated actions.

Gmail/OAuth additionally monitors watch expiry, refresh failure, granted-scope drift, exact mailbox
binding, and revocation queue age. Live Vendor access rechecks verified email, TOTP, immutable invited
email, active assignment, and same-address OAuth before every protected operation. Test Vendor mail
is app-only and never starts OAuth.

## Retention operations

Native Firestore TTL, extra composite indexes, and a scheduler are optional operations improvements,
not V1 gates. The safe launch default is:

- keep legal holds authoritative;
- run the existing bounded cleanup manually with a limit of `500` when due;
- record counts/run IDs only and resume with a new run after failure; and
- add an index only when a production query demonstrably requires it.

Never delete a held row, overwrite a prior cleanup audit, or use an automatic retry that can duplicate
work. Native TTL or scheduling can be enabled later after a normal dry run and monitor check.

## Rollback and correction sequence

1. Close the affected exact Action Registry entry or suspend the affected app surface. Test-lane
   isolation failures close the entire Test executor until reconciled.
2. Preserve immutable execution/audit records. Mark an ambiguous Live result for reconciliation and
   do not make a second provider attempt.
3. Revoke or disable the affected OAuth grant, Vendor session/account, credential, Gmail watch, or
   job when relevant. Preserve bodyless audit history.
4. Route 100% of application traffic to the captured prior Cloud Run revision:

   ```bash
   gcloud run services update-traffic pmi-kc-kb-demo --region=us-central1 \
     --project=pmi-kc-kb-prod --to-revisions=<captured-prior-revision>=100
   ```

   Preserve the Cloud Run service and revision history. Restore reviewed rules, configuration, policy,
   and Registry versions; never use service deletion as rollback.

5. Reconcile provider state by idempotency key/provider reference and read-after-write. Apply only the
   documented correction operation; never blind-retry or erase history.
6. Verify sign-in, Live/Test separation, Maintenance Test completion, Vendor assignment denial, and
   the affected provider's closed/unavailable UI. Record the incident and result in `docs/status.md`.

## Required release rehearsal

| Rehearsal                                                                            | V1 result expected                                                                   |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Production Test Maintenance intake → assignment → activity/receipt → Done            | Firestore persists Test data; no provider call; receipt is not Live-proof eligible   |
| Test Vendor provision → password/TOTP → assigned ticket → app-only mailbox → disable | Only the assigned Test ticket is visible; OAuth cannot start; disable revokes access |
| Stale preview, duplicate click, ambiguous Live result                                | Refused, deduplicated, or held for reconciliation; never a blind second attempt      |
| Prior-revision traffic restore                                                       | Exact captured revision receives 100% traffic; service/history remain intact         |

Record commit, revision, timestamp, mode, action key, status, receipt hash, and rollback result only.
Do not store screenshots or logs containing customer records, Gmail bodies, credentials, or tokens.
