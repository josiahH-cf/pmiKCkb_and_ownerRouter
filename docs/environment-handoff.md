# Environment handoff

Updated: 2026-07-15.

This is the non-secret handoff registry for the PMI KC production application and development
environments. Record project IDs, service identities, domains, resource IDs, setup status, and
verification evidence only. Never record secrets, tokens, password/setup links, TOTP material, OAuth
codes, raw customer data, Gmail bodies, leases, ledgers, bank data, SSNs, or full source packets.
Do not put secrets in this document, source control, command output, or release evidence.

## Environment model

Production contains two explicit data lanes:

- **Live** — customer/provider-backed records. Every write identifies the exact action and target and
  requires the current human preview/confirmation.
- **Test** — reserved invented records persisted in production Firestore. Test workflows may reach
  Done but use only isolated app executors, never contact providers, and never count as Live-provider
  proof.

Legacy records without a mode resolve to Live. A Test badge must be visible wherever Test data can be
read or written. A provider can be unavailable while the application and Test workflow remain healthy.

Canonical Test records:

| Type               | Identifier                                          | Display / address                         |
| ------------------ | --------------------------------------------------- | ----------------------------------------- |
| Unit               | `unit:test-maple-204`                               | `TEST — 204 Maple Court Unit 2`           |
| Vendor             | `vendor:test-summit-plumbing`                       | `Summit Plumbing Test Vendor`             |
| Vendor email       | —                                                   | `service@summit-plumbing.example.invalid` |
| Lease workflow run | `test-renewal-019f6599-af50-7451-88ea-e2592fc001a2` | `TEST — 204 Maple Court Unit 2`           |
| Lease              | `lease:test-maple-204-2027`                         | `Taylor Test Resident`                    |

`vendor:test-summit-plumbing` is the stable application identity. Its Firebase UID is an
authentication-generation identifier, is not recorded here, and rotates during an Admin-confirmed
Test Vendor reset. Rotation preserves Test tickets/assignments/mailbox/receipts while invalidating the
old password, TOTP factors, sessions, action links, and UID-bound confirmations.

## Handling values

- Put variable names only in `.env.example`.
- Put local values in ignored `.env.local`, `.env.production.local`, or the active shell.
- Put production secrets in Secret Manager or an attached/workload identity path.
- Avoid downloadable service-account keys. Record owner, location label, rotation, and revocation—not
  key material.
- Every setup row needs a repeatable command or manual verification before it is marked complete.
- Use `docs/v1-client-unblock-checklist-2026-07-14.md` for a selected provider's exact activation
  inputs. Do not turn that inventory into an all-provider application gate.

### Local emulator boundary

Local demo seed/reset/operator writes require
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` and a non-secret emulator project namespace before Firebase
Admin initialization. An absent, malformed, non-local, or stopped target fails closed. Local demo
commands never target production and force the stub image store.

The deployed production Test workspace is different: its records intentionally persist in production,
but every Test executor is branded and isolated. It rejects Live input, synthetic aliases cannot enter
Live, and receipts state `provider_contacted=false` and `live_proof_eligible=false`.

## Environment Registry

| Environment       | Purpose                                  | Non-secret identifiers                                                                                                                                                                                                                                                                            | Secret storage                       | Owner                             | State / verification                                                                                                                                                                                                                                        |
| ----------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local development | Build, unit/E2E/emulator verification    | `localhost:3000`, loopback emulator                                                                                                                                                                                                                                                               | `.env.local` / active shell          | Implementer                       | `npm run dev`; `npm run format:check`; `npm run typecheck`; `npm test`; `npm run test:firestore`                                                                                                                                                            |
| Legacy demo       | Historical local/cloud evidence only     | Legacy project values                                                                                                                                                                                                                                                                             | Legacy ignored config                | Josiah                            | Not reusable for production; no `cherrybridge.ai` identity/resource in the production path                                                                                                                                                                  |
| Separate staging  | Optional future provider sandbox         | Not provisioned                                                                                                                                                                                                                                                                                   | Client Secret Manager/identity       | Future                            | Not required for V1 because production has an isolated Test lane; provision only when a provider requires its own sandbox                                                                                                                                   |
| Production        | Stable PMI KC app with Live + Test lanes | Project `pmi-kc-kb-prod` (#558870356522); Cloud Run `pmi-kc-kb-demo`, `us-central1`; canonical URL `https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app`; bucket `pmi-kc-kb-prod-sources-558870356522`; search store `kb-lease-renewals-txt`; Firebase app `1:558870356522:web:c1b2473b886a6edd889953` | Secret Manager / attached identities | Josiah technical; PMI KC business | Commit `38ebcf530e3fe193547806bace91246ccea20c0b`, revision `pmi-kc-kb-demo-rmrm9mp6v-04c897acee28`, and ruleset `63b31613-59ba-495c-9ef3-455a5c593f51` are deployed. Desktop and 375px phone acceptance are green; the human Test Vendor ceremony remains. |

The current 2026-07-15 production release is commit
`38ebcf530e3fe193547806bace91246ccea20c0b`, Cloud Build
`f106ceb4-02d0-497c-b147-f716e04c0149` (`SUCCESS`), revision
`pmi-kc-kb-demo-rmrm9mp6v-04c897acee28` at 100% traffic, and image digest
`sha256:25358a99d6f4890da64db6d3cb17b0ca7d3725c7f0251390b7c6dc8b12ba8103`. Its serving
predecessor is `pmi-kc-kb-demo-rmrm8t6y7-d250f83ddfee`. Firestore ruleset
`63b31613-59ba-495c-9ef3-455a5c593f51` is released.

The final release rollback rehearsal moved 100% traffic from
`pmi-kc-kb-demo-rmrm9mp6v-04c897acee28` to captured predecessor
`pmi-kc-kb-demo-rmrm8t6y7-d250f83ddfee`. Staff and Vendor sign-in returned 200, unauthenticated
`/ask` redirected to `/sign-in`, and the existing signed-in Console remained healthy. Traffic was
restored 100% to the final revision, the same boundaries remained healthy, and the final-revision
ERROR-level log query returned no entries. The earlier `f02112d / 00025-mhw` rehearsal remains
historical evidence only.

The deployed release's clean-install verifier passed 306 unit files/2,179 tests, Firestore 17/59,
core E2E 32 passed/18 intentional prerequisite skips, all governance gates, `cutover:dry-run`, and
76/76 build pages/routes. `npm audit --omit=dev` reports zero runtime findings; the full audit's three
Moderate findings are confined to the documented development-only Firebase CLI chain.

Production browser acceptance loaded Ask, Spaces, Approval Queue, Gmail Hub, Connections, Admin,
Lease Renewal, and Maintenance directly at desktop and 375px phone widths. Every route showed the
expected H1, no horizontal overflow, and zero console errors after a delayed per-route check. This
acceptance found an Approval Queue hydration mismatch caused by implicit server/browser time zones;
the deployed formatter now explicitly uses `America/Chicago`, with a regression test pinning the
rendered result.

## Production identity configuration

| Item                        | State to verify                                                                                      | Setup / verification                                                                                                                             | Rollback                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Internal Google sign-in     | Enabled; staff domain `pmikcmetro.com`                                                               | `npm run firebase:setup-auth -- --project=pmi-kc-kb-prod --authorized-domain=pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app`; allowed/wrong-domain smoke | Disable provider only for an Auth incident; preserve users/audit                        |
| Authorized domains          | Firebase default hosts plus canonical Cloud Run host                                                 | Same repository command; inspect returned domain list                                                                                            | Remove only an obsolete host after traffic is gone                                      |
| Vendor Email/Password       | Enabled; no app self-registration                                                                    | Firebase Console → Security → Authentication → Sign-in method → Email/Password → Enable                                                          | Disable new password sign-in only after Vendor sessions are revoked                     |
| Vendor TOTP                 | Global MFA enabled; TOTP provider enabled with adjacent interval `1`; human enroll/challenge pending | Complete the human Test Vendor password/TOTP enrollment, fresh challenge, assigned-ticket, and mailbox smoke                                     | Disable only during an Auth incident; Vendors remain denied until a safe factor returns |
| Runtime Auth administration | Runtime SA can create/revoke session cookies and Admin-provision/reset the canonical Test Vendor     | Attached `pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com`; no key file                                                                 | Remove the role and close Vendor provisioning/session routes                            |

The Test Vendor is Firebase password + TOTP with an app-only mailbox. Admin reset/re-enable is
available only for the canonical `.invalid` Test Vendor from `pending_setup`, `active`, or `disabled`
after a reasoned exact preview bound to UID/status/invite version. It rotates the UID, preserves
stable Test workflow data, returns one `no-store` setup link, and leaves any partial failure disabled.
It creates no delivery, OAuth, vault, provider, Registry, or Live effect. Live Vendor OAuth is
configured per real Vendor later and never uses DWD or an internal staff role. Identity class wins
over email domain: `vendor:true` users are filtered out of People/Access and rejected by internal
role/scope/session boundaries even if an address uses the hosted domain.

## Gmail live handoff

| Item                | Current state                                                                                               | Operating action                                                                                          | Rollback                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Per-user DWD        | Client `104374162913177846911` has readonly, compose, labels, and modify; keyless mint remains domain-bound | Keep explicit `GMAIL_DWD_SA`; never use a personal identity                                               | Revoke only affected scopes and close dependent actions                      |
| Workflow read/reply | Workflow-linked read and exact-confirmed reply transport are proven; no generic inbox/compose product       | Preserve exact target/thread/artifact confirmation, one attempt, and bodyless audit                       | Close exact Registry action; delivered mail cannot be retracted              |
| Proposals/drafts    | Source-backed proposals are review-only; `gmail.draft.create` is production-closed                          | Keep proposal review separate from Gmail mutation; do not present an unsaved proposal as a provider draft | No provider rollback is needed because production creates no Gmail draft     |
| Labels              | Four governed workflow labels only                                                                          | Record identifiers/reason hash, not content                                                               | Close label action and remove an applied label if appropriate                |
| Watch/Pub/Sub       | Topic, publisher, OIDC push identity/subscription, watch, and history processing are Live-proven            | Manually renew watch before expiry and monitor health                                                     | Stop watch; remove subscription/topic only after dependent traffic is closed |

Native TTL, extra composite indexes, and a cleanup scheduler are optional. Legal holds and canonical
expiry fields remain authoritative; the launch default is bounded manual cleanup with limit `500`, a
unique run ID, counts-only audit, and no blind retry.

## Non-Secret Source Artifact Registry

| Source                      | Location                                                                                        | State / handoff                                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PMI KC source drop zone     | [Shared Drive folder](https://drive.google.com/drive/folders/1arXww32LaPcIbFx_oONshbR62imiC8kq) | Created/shared; the team adds approved content over time                                                                                                           |
| Production source bucket    | `pmi-kc-kb-prod-sources-558870356522`                                                           | Only approved, client-safe source copies; never raw context/call packets                                                                                           |
| Agent Search                | Location `us`; store `kb-lease-renewals-txt`                                                    | Existing approved corpus remains usable; add sources through reviewed manifest/import                                                                              |
| Shared Sheets metadata      | Drive home for `josiah@pmikcmetro.com`                                                          | Visible names include `Tenant Move In/Out/Renewal Checklist`, `24/25/26 Rents Received 2`, `2026 Invoices`; exact operating Sheet is a per-action activation input |
| Legacy Owner Router package | `C:\Users\josia\Documents\github-windows\pmi-kc-owner-router`                                   | Historical source material only; never a production runtime dependency                                                                                             |

Missing source content reduces answer coverage; it does not block the working app. Unsupported questions
must remain visibly unsupported rather than receive a generic answer.

## Provider activation registry

Record each provider/action independently as `unavailable`, `test_ready`, `live_configured`,
`live_proven`, `enabled`, or `suspended`.

| System        | App role                                     | Non-secret activation anchors                                                       | Secret owner/location                         | Safe default                                                                   |
| ------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| RentVine      | Operational reads; renewal/work-order writes | Tenant base URL, exact endpoints, property/unit/lease/Vendor/status/version mapping | Existing key/secret in Secret Manager; PMI KC | Reads when healthy; unsupported writes unavailable; Test completes internally  |
| Gmail         | Workflow-linked communication                | DWD subject, linked recipient/thread fields, artifact/label rule                    | Keyless DWD / attached identity               | Existing enabled actions retain scope; new initiation unavailable until mapped |
| Vendor Gmail  | Assigned-ticket Vendor communication         | OAuth client/redirect/four scopes, same Vendor address, vault reference             | Per-Vendor refresh token in Secret Manager    | Test mailbox app-only; Live OAuth off until that Vendor activates              |
| Google Sheets | Renewal checklist read/write                 | Sheet/tab/row key/column, DWD subject, conflict contract                            | Keyless reader/writer identity                | Existing approved read may run; write unavailable until atomic conflict proof  |
| Dotloop       | Lease/document package                       | Account/profile/template/participant/document mapping                               | OAuth client/secret in Secret Manager         | Unavailable; no UI endpoint inference                                          |
| LeadSimple    | Process/task workflow                        | Account plan/endpoint, stages, assignee/due rule, conditional update                | API key in Secret Manager                     | Test receipts only until configured                                            |
| QuickBooks    | Draft Bill downstream                        | OAuth/company/Vendor/account/property mapping, draft-only permission                | OAuth/vault in Secret Manager                 | Test draft receipt only; no post/pay path                                      |
| Boom/SMS      | Auxiliary enrollment/outreach                | Account, applicability/consent/sender/delivery/correction                           | Provider secret only after selection          | Unavailable/not-applicable; do not select by inference                         |
| Drive         | Maintenance photo append                     | In-boundary folder, ticket mapping, MIME/size/scanner policy                        | Attached Workspace/Drive identity             | Test metadata only until Live upload configured; no replace/delete             |

An inactive row does not make the production application unready. Its exact Live action remains closed
and visibly unavailable while the Test workflow continues.

## Manual Setup And Web-App Testing

Run session and budget checks before live Google/cloud work:

```bash
npm run preflight:adc
npm run check:budget-guard
```

If ADC is stale, the owner runs `npm run auth:session` interactively. Never substitute a personal
account.

Prepare/verify the ignored production environment:

```bash
npm run prepare:production-env -- \
  --app-base-url=https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app \
  --service-account=pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com
npm run preflight:production -- --env-file=.env.production.local
```

Deploy rules and application after capturing the prior revision:

```bash
gcloud run services describe pmi-kc-kb-demo --region=us-central1 \
  --project=pmi-kc-kb-prod --format="value(status.traffic[0].revisionName)"
npm exec firebase -- deploy --only firestore:rules --project pmi-kc-kb-prod
npm run deploy -- --project=pmi-kc-kb-prod --service=pmi-kc-kb-demo \
  --region=us-central1 --search-location=us --budget-confirmed \
  --allow-multiple-spaces \
  --service-account=pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com
```

After revision creation succeeds, the wrapper routes 100% traffic to the exact collision-resistant
revision created by that invocation, so a prior named-revision rollback pin cannot strand the
candidate and a concurrent deploy cannot redirect this invocation through floating `LATEST`. It uses
`--no-invoker-iam-check` for the public sign-in shell; it does not add an `allUsers` binding or relax
application auth.

Deploy `firestore:indexes` separately only when an actual production query requires one of the
declared composite indexes. Unused index creation is not a V1 step.

After deploy, record the candidate revision and prior revision, then verify internal sign-in,
allowed/wrong-domain behavior, Live/Test Console, canonical Maintenance Test completion, persistent
Lease Test completion (`SIMULATE LEASE TEST ACTION`, eleven receipts/attempts, refresh-safe Done),
Test Vendor password/TOTP/assignment/mailbox/disable/reset/re-enrollment, source-backed Ask/no-source
behavior, Gmail hydration, and rollback. Record only whether the UID rotated and expected route/state
checks passed; never retain setup links, passwords, TOTP material, or session values.

## Key And Secret Ownership

| Credential class             | Preferred storage                            | Repo record allowed                  | Revocation                                                  |
| ---------------------------- | -------------------------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| Firebase/OAuth client secret | Secret Manager / ignored env                 | Variable and client name only        | Rotate provider secret and update Secret Manager            |
| Runtime/build identity       | Attached service account / workload identity | Service account email and role names | Remove IAM role or disable identity                         |
| Vendor refresh token         | Secret Manager keyed per Vendor              | Vault reference/health only          | Revoke grant, destroy secret, disable Vendor session        |
| External API key             | Secret Manager                               | System/action/owner/location label   | Close action; rotate at provider                            |
| Local developer auth         | ADC / `.env.local` / active shell            | Variable names only                  | Revoke session/delete ignored value; reauth managed account |

## Handoff Checklist

- [x] Environment row has an owner and current revision/state.
- [x] Every configured Live secret has a location label, owner, rotation, and revocation path.
- [x] Firebase Email/Password, global MFA/TOTP, and authorized-domain state are recorded.
- [x] Canonical Test Lease reached refresh-safe Done with eleven receipts/attempts and zero Live calls.
- [x] Automated Test Vendor 11/11 and Maintenance 19/19 journeys pass with zero Live calls.
- [x] Canonical Test Vendor reset/re-enable and internal-roster separation are verified and deployed.
- [x] Each provider's activation state is independent and visible in the app.
- [x] Rewalk signed-in desktop/375px routes on final revision
      `pmi-kc-kb-demo-rmrm9mp6v-04c897acee28`, including the fixed Approval Queue hydration path.
- [ ] Complete the human Test Vendor password/TOTP/assigned-ticket/mailbox/disable/reset/re-enrollment
      journey on the deployed release.
- [x] Rehearse historical `00025-mhw → 00024-6b2 → 00025-mhw` traffic rollback/restore.
- [x] Rehearse bounded rollback/restore between final revision
      `pmi-kc-kb-demo-rmrm9mp6v-04c897acee28` and its captured predecessor
      `pmi-kc-kb-demo-rmrm8t6y7-d250f83ddfee`.
- [x] `docs/client-checklist.md` contains only genuine client inputs, not already-settled decisions.
- [x] `docs/status.md` records verification and any exact dependent blocker.

If a value is missing, block only the dependent Live action and continue with the Test or unavailable-
provider default. Preserve no-autonomous-send, exact confirmation, one-attempt, reconciliation, and
rollback controls.
