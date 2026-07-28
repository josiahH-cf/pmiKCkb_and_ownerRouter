# Environment handoff

Updated: 2026-07-28.

This is the non-secret handoff registry for the PMI KC production application and development
environments. Record project IDs, service identities, domains, resource IDs, setup status, and
verification evidence only. Never record secrets, tokens, password/setup links, TOTP material, OAuth
codes, raw customer data, Gmail bodies, leases, ledgers, bank data, SSNs, or full source packets.
Do not put secrets in this document, source control, command output, or release evidence.

## Environment model

S40’s target is two independently provisioned environments running the same product:

- **Demo environment** — realistic invented Demo records in Demo-owned database/namespace, storage,
  queue/topic, secrets/OAuth audience, runtime identity, effect adapters, and receipts. It may also
  expose a separately selected Live **read-only** context with a persistent banner, no mixed
  projection, and zero app/provider mutation.
- **Production environment** — Live customer/provider-backed records only. Every write identifies
  the exact action/target and requires current human authority. Missing/unknown/Demo classification
  fails closed; no Demo/Test selector, seed, simulator, or product lab ships.
- **Blue/green** — Production candidate revision at zero traffic → exact descriptor/authenticated
  smoke → deliberate traffic promotion → captured prior revision rollback. It is not the
  Demo/Production boundary.

Demo and Production must not resolve the same project/service data namespace, Firestore database,
storage target, queue/topic, Secret Manager boundary, OAuth redirect/audience, runtime identity, or
effect credential. Exact Demo identifiers are not yet supplied and must never be inferred from the
legacy Production service name.

The deployed application still contains Production Live+Test lanes and missing mode currently
resolves to Live (`F-PRODUCTION-DUAL-DATA-LANES`). That is migration input/current evidence, not the
target. S40 inventories/backups/migrates invented fixtures to Demo and removes them from Production
only through an owner-run reviewed command.

Canonical current fixtures to migrate into Demo:

| Type               | Identifier                                          | Display / address                         |
| ------------------ | --------------------------------------------------- | ----------------------------------------- |
| Unit               | `unit:test-maple-204`                               | `TEST — 204 Maple Court Unit 2`           |
| Vendor             | `vendor:test-summit-plumbing`                       | `Summit Plumbing Test Vendor`             |
| Vendor email       | —                                                   | `service@summit-plumbing.example.invalid` |
| Lease workflow run | `test-renewal-019f6599-af50-7451-88ea-e2592fc001a2` | `TEST — 204 Maple Court Unit 2`           |
| Lease              | `lease:test-maple-204-2027`                         | `Taylor Test Resident`                    |

`vendor:test-summit-plumbing` is the stable current application identity. Its Firebase UID is an
authentication-generation identifier, is not recorded here, and rotates during an Admin-confirmed
Vendor reset. Rotation preserves matching fixture tickets/assignments/mailbox/receipts while
invalidating the old password, TOTP factors, sessions, action links, and UID-bound confirmations.
After S40 this lifecycle runs only in Demo; IDs may remain compatibility keys while product copy says
Demo.

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

The currently deployed Production Test workspace is historical/current-state evidence. Do not add to
it. S40 moves equivalent behavior into Demo-owned resources; Demo executors reject Live input and
construct no Live client, while Production rejects fixture aliases.

## Environment Registry

| Environment                       | Purpose                                                         | Non-secret identifiers                                                                                                                                                                                                                                                                            | Secret storage                                   | Owner                             | State / verification                                                                                                                                                                    |
| --------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local development                 | Build, unit/E2E/emulator verification                           | `localhost:3000`, loopback emulator                                                                                                                                                                                                                                                               | `.env.local` / active shell                      | Implementer                       | Local-only; emulator guard required                                                                                                                                                     |
| Legacy demo                       | Historical evidence only                                        | Legacy project values                                                                                                                                                                                                                                                                             | Legacy ignored config                            | Josiah                            | Retired; no `cherrybridge.ai`/`pmikckb-test` reuse                                                                                                                                      |
| Demo (S40 target)                 | Exact product rehearsal with Demo data; optional Live read-only | **Not provisioned; do not invent.** S40 manifest must record exact independent project/service/database/storage/queue/OAuth/runtime identity                                                                                                                                                      | Separate client Secret Manager/attached identity | Josiah technical; PMI KC business | NOT STARTED; one owner provisioning/deploy dependency after green dry-run                                                                                                               |
| Provider sandbox                  | Optional provider-owned sandbox when contract requires it       | Not provisioned                                                                                                                                                                                                                                                                                   | Provider/client managed vault                    | Per provider                      | Independent from Demo; only when provider requires                                                                                                                                      |
| Production (current → S40 target) | Current serving app; target Live-only                           | Project `pmi-kc-kb-prod` (#558870356522); Cloud Run `pmi-kc-kb-demo`, `us-central1`; canonical URL `https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app`; bucket `pmi-kc-kb-prod-sources-558870356522`; search store `kb-lease-renewals-txt`; Firebase app `1:558870356522:web:c1b2473b886a6edd889953` | Secret Manager / attached identities             | Josiah technical; PMI KC business | Current commit `2bfe7d4`, revision `pmi-kc-kb-demo-rmrxpsn5q-92c1b759735e` at 100%; rollback `7663cec` / `pmi-kc-kb-demo-rmrwmk2kn-ae2beeaf9de7`. Current Live+Test migrates under S40. |

The Production service name contains `demo` for historical reasons; it is still the current
Production service. Never use that string as environment truth or derive the new Demo name from it.
The 2026-07-23 checkpoint passed the full deterministic gate and auth-boundary HTTP smoke; exact
evidence is in `F-CURRENT-SERVING-CHECKPOINT-2026-07-23`, `docs/status.md`, and
`docs/loop-state.md`.

## Production identity configuration

| Item                        | State to verify                                                                                      | Setup / verification                                                                                                                             | Rollback                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Internal Google sign-in     | Enabled; staff domain `pmikcmetro.com`                                                               | `npm run firebase:setup-auth -- --project=pmi-kc-kb-prod --authorized-domain=pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app`; allowed/wrong-domain smoke | Disable provider only for an Auth incident; preserve users/audit                        |
| Authorized domains          | Firebase default hosts plus canonical Cloud Run host                                                 | Same repository command; inspect returned domain list                                                                                            | Remove only an obsolete host after traffic is gone                                      |
| Vendor Email/Password       | Enabled; no app self-registration                                                                    | Firebase Console → Security → Authentication → Sign-in method → Email/Password → Enable                                                          | Disable new password sign-in only after Vendor sessions are revoked                     |
| Vendor TOTP                 | Global MFA enabled; TOTP provider enabled with adjacent interval `1`; current fixture proof retained | Re-run the password/TOTP/assigned-ticket/mailbox smoke in Demo after S40; Production uses real assigned Live Vendors only                        | Disable only during an Auth incident; Vendors remain denied until a safe factor returns |
| Runtime Auth administration | Current runtime SA can create/revoke sessions and provision/reset the current canonical fixture      | Attached `pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com`; S40 must not reuse this Production identity for Demo                        | Remove the role and close Vendor provisioning/session routes                            |

The current canonical invented Vendor is Firebase password + TOTP with an app-only mailbox. Admin
reset/re-enable is available only for that `.invalid` fixture from `pending_setup`, `active`, or `disabled`
after a reasoned exact preview bound to UID/status/invite version. It rotates the UID, preserves
stable fixture workflow data, returns one `no-store` setup link, and leaves any partial failure disabled.
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

Record each provider/action independently as `unavailable`, `test_ready` (internal compatibility
state; operator label Demo-ready), `live_configured`,
`live_proven`, `enabled`, or `suspended`.

| System        | App role                                     | Non-secret activation anchors                                                       | Secret owner/location                         | Safe default                                                                   |
| ------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| RentVine      | Operational reads; renewal/work-order writes | Tenant base URL, exact endpoints, property/unit/lease/Vendor/status/version mapping | Existing key/secret in Secret Manager; PMI KC | Reads when healthy; unsupported writes unavailable; Demo completes internally  |
| Gmail         | Workflow-linked communication                | DWD subject, linked recipient/thread fields, artifact/label rule                    | Keyless DWD / attached identity               | Existing enabled actions retain scope; new initiation unavailable until mapped |
| Vendor Gmail  | Assigned-ticket Vendor communication         | OAuth client/redirect/four scopes, same Vendor address, vault reference             | Per-Vendor refresh token in Secret Manager    | Demo mailbox app-only; Live OAuth off until that Vendor activates              |
| Google Sheets | Renewal checklist read/write                 | Sheet/tab/row key/column, DWD subject, conflict contract                            | Keyless reader/writer identity                | Existing approved read may run; write unavailable until atomic conflict proof  |
| Dotloop       | Lease/document package                       | Account/profile/template/participant/document mapping                               | OAuth client/secret in Secret Manager         | Unavailable; no UI endpoint inference                                          |
| LeadSimple    | Process/task workflow                        | Account plan/endpoint, stages, assignee/due rule, conditional update                | API key in Secret Manager                     | Demo receipts only until configured                                            |
| QuickBooks    | Draft Bill downstream                        | OAuth/company/Vendor/account/property mapping, draft-only permission                | OAuth/vault in Secret Manager                 | Demo draft receipt only; no post/pay path                                      |
| Boom/SMS      | Auxiliary enrollment/outreach                | Account, applicability/consent/sender/delivery/correction                           | Provider secret only after selection          | Unavailable/not-applicable; do not select by inference                         |
| Drive         | Maintenance photo append                     | In-boundary folder, ticket mapping, MIME/size/scanner policy                        | Attached Workspace/Drive identity             | Demo metadata only until Live upload configured; no replace/delete             |

An inactive row does not make the production application unready. Its exact Live action remains closed
and visibly unavailable while the Demo workflow continues. Connections also exposes a reviewed
generic provider front door; it is navigation only and never Live evidence/readiness.

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

The commands above describe the current legacy-named Production wrapper. S40 must generate separate
validated Demo/Production manifests and parameterized commands before provisioning Demo. For
Production, create the candidate at zero traffic, verify the exact descriptor and authenticated
whole-task smoke, then promote deliberately and retain the prior revision.

After S40 deploy, verify internal sign-in and wrong-domain denial; persistent environment/context
labels; Production Live-only; Demo renewal/Maintenance/Approval/Vendor completion with zero Live
provider construction; optional Demo Live-read-only mutation refusal/non-mixing; source-backed Ask/
no-source; exact provider/backlinks; Gmail hydration; resident token object authorization; and
rollback. Record only safe outcomes such as UID rotation and route/state checks—never setup links,
passwords, tokens, TOTP material, customer content, or sessions.

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
- [x] Historical canonical Test Lease reached refresh-safe Done with eleven receipts/attempts and
      zero Live calls.
- [x] Historical automated Test Vendor 11/11 and Maintenance 19/19 journeys pass with zero Live calls.
- [x] Historical Test Vendor reset/re-enable and internal-roster separation are verified/deployed.
- [x] Each provider's activation state is independent and visible in the app.
- [x] Current serving checkpoint and rollback are recorded in the Environment Registry.
- [ ] S40 owner supplies exact independent Demo resource values; green collision/dry-run packet
      precedes provisioning.
- [ ] S40 migrates invented fixtures out of Production after inventory/backup/rehearsal; Production
      Live-only and Demo parity/browser tasks pass.
- [ ] Re-run Vendor password/TOTP/assigned-ticket/mailbox/disable/reset/re-enrollment in Demo after
      migration; no secret-bearing evidence.
- [x] Rehearse historical `00025-mhw → 00024-6b2 → 00025-mhw` traffic rollback/restore.
- [x] Rehearse bounded rollback/restore between final revision
      `pmi-kc-kb-demo-rmrm9mp6v-04c897acee28` and its captured predecessor
      `pmi-kc-kb-demo-rmrm8t6y7-d250f83ddfee`.
- [x] `docs/client-checklist.md` contains only genuine client inputs, not already-settled decisions.
- [x] `docs/status.md` records verification and any exact dependent blocker.

If a value is missing, block only the dependent Live action and continue with the Demo/app-plane or
unavailable-provider default. Preserve no-autonomous-send, exact confirmation, one-attempt,
reconciliation, and rollback controls.
