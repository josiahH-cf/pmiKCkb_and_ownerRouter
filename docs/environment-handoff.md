# Environment handoff

Updated: 2026-08-03.

This is the non-secret handoff registry for the PMI KC production application and development
environments. Record project IDs, service identities, domains, resource IDs, setup status, and
verification evidence only. Never record secrets, tokens, password/setup links, TOTP material, OAuth
codes, raw customer data, Gmail bodies, leases, ledgers, bank data, SSNs, or full source packets.
Do not put secrets in this document, source control, command output, or release evidence.

## Environment model

The implemented environment boundary is:

- **Production** — Live customer/provider-backed records only. Every write identifies the exact
  action and target and requires current human authority. Missing or non-Live classification fails
  closed; no Demo/Test selector, seed, simulator, fixture panel, or product lab ships.
- **Local rehearsal** — `npm run dev` resolves the server-owned descriptor exactly to
  `environmentKind:"demo"`, `dataContext:"live_readonly"`, and `source:"explicit"`. It may perform
  bounded Live reads, but request-wide and direct effect fences refuse persistence and provider
  effects. It has no seeded product fixtures.
- **Hosted Demo** — the separately hosted GCP environment contemplated by the original S40 program
  is deferred under `F-DEMO-DEFERRED-LOCAL-FIRST`. Do not provision it, infer resource names for it,
  or add a fixture seeder.
- **Blue/green** — Production candidate revision at zero traffic → exact descriptor/authenticated
  smoke → deliberate traffic promotion → captured prior-revision rollback. It is a Production
  release procedure, not an environment/data selector.

S56 retired the former Production Test lane. Its backed-up migration removed exactly 90 explicit
`data_mode:"test"` records, and a fresh query proved zero across all 28 governed collections. The
named clone `s56-test-retirement-20260802-233824` remains retained and delete-protected; a one-record
restore drill matched the source hash before cleanup. Historical Test receipts and identities remain
dated evidence only. Deterministic invented fixtures now live only under automated tests/helpers and
never enter the product graph.

## Handling values

- Put variable names only in `.env.example`.
- Put local values in ignored `.env.local`, `.env.production.local`, or the active shell.
- Put production secrets in Secret Manager or an attached/workload identity path.
- Avoid downloadable service-account keys. Record owner, location label, rotation, and revocation—not
  key material.
- Every setup row needs a repeatable command or manual verification before it is marked complete.
- Use the selected provider's active feature-suite spec for its exact activation inputs. The dated
  `docs/v1-client-unblock-checklist-2026-07-14.md` is historical pre-S40 evidence, not a current
  cloud/deploy runbook. Do not turn either inventory into an all-provider application gate.

### Local rehearsal and automated-test boundary

Local product rehearsal uses the explicit Demo + Live-read-only descriptor above. It has no product
seed/reset/operator path and cannot execute a durable write or provider effect. The local server
refuses an invalid or missing descriptor rather than falling back to Production mutation authority.

Automated tests may use a loopback Firestore emulator and deterministic helpers. Emulator state and
synthetic identities remain test-only: they are not a Demo product environment and cannot target
Production. The retired Production Test workspace is historical evidence only and must not be
recreated.

## Environment Registry

| Environment      | Purpose                                             | Non-secret identifiers                                                                                                                                                                                                                                                                    | Secret storage                       | Owner                             | State / verification                                                                                                                                                                              |
| ---------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local rehearsal  | Product rehearsal with bounded Live reads           | `localhost:3000`; exact descriptor `environmentKind:"demo"` + `dataContext:"live_readonly"` + `source:"explicit"`                                                                                                                                                                         | `.env.local` / active shell          | Implementer                       | Explicit Live-read-only; no seeded product fixture, persistence, or provider-effect authority                                                                                                     |
| Automated tests  | Unit/E2E/emulator verification with invented values | Loopback emulator and deterministic helpers under test-only paths                                                                                                                                                                                                                         | Test process / ignored local values  | Implementer                       | Synthetic records and identities never enter the product graph or Production                                                                                                                      |
| Legacy demo      | Historical evidence only                            | Legacy project values                                                                                                                                                                                                                                                                     | Legacy ignored config                | Josiah                            | Retired; no `cherrybridge.ai`/`pmikckb-test` reuse                                                                                                                                                |
| Hosted Demo      | Deferred                                            | **Not provisioned; do not invent.**                                                                                                                                                                                                                                                       | None                                 | Josiah technical; PMI KC business | Deferred by `F-DEMO-DEFERRED-LOCAL-FIRST`; do not request resources or create a fixture seeder                                                                                                    |
| Provider sandbox | Optional provider-owned sandbox when required       | Not provisioned                                                                                                                                                                                                                                                                           | Provider/client managed vault        | Per provider                      | Independent from local rehearsal; create only when an exact provider contract requires it                                                                                                         |
| Production       | Serving Live-only application                       | Project `pmi-kc-kb-prod` (#558870356522); Cloud Run `pmi-kc-app`, `us-central1`; canonical URL `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`; bucket `pmi-kc-kb-prod-sources-558870356522`; search store `kb-lease-renewals-txt`; Firebase app `1:558870356522:web:c1b2473b886a6edd889953` | Secret Manager / attached identities | Josiah technical; PMI KC business | Revision `pmi-kc-app-rmsd5ux3l-0b445f0442ea` serves 100%; captured predecessor `pmi-kc-app-rmsc62q55-dbcbe2db4927`. Live-only readback passed; legacy service `pmi-kc-kb-demo` is deleted/absent. |

The legacy service `pmi-kc-kb-demo` and its old URL are dated rename/rollback evidence only. The
canonical Production service and client address are now `pmi-kc-app` and
`https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`. The exact serving, rollback, forward-restore, and
old-service absence evidence is recorded in `F-S55-SERVICE-RENAME-COMPLETE`, `docs/status.md`, and
`docs/loop-state.md`.

## Production identity configuration

| Item                        | State to verify                                                         | Setup / verification                                                                                                                         | Rollback                                                                                |
| --------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Internal Google sign-in     | Enabled; staff domain `pmikcmetro.com`                                  | `npm run firebase:setup-auth -- --project=pmi-kc-kb-prod --authorized-domain=pmi-kc-app-kq6wuvpiva-uc.a.run.app`; allowed/wrong-domain smoke | Disable provider only for an Auth incident; preserve users/audit                        |
| Authorized domains          | Firebase default hosts plus canonical Cloud Run host                    | Same repository command; inspect returned domain list                                                                                        | Remove only an obsolete host after traffic is gone                                      |
| Vendor Email/Password       | Enabled; no app self-registration                                       | Firebase Console → Security → Authentication → Sign-in method → Email/Password → Enable                                                      | Disable new password sign-in only after Vendor sessions are revoked                     |
| Vendor TOTP                 | Global MFA enabled; TOTP provider enabled with adjacent interval `1`    | Prove password/TOTP/assigned-ticket/mailbox behavior for each activated real Live Vendor                                                     | Disable only during an Auth incident; Vendors remain denied until a safe factor returns |
| Runtime Auth administration | Production runtime identity supports the governed Auth/session boundary | Attached `pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com`; local rehearsal cannot invoke it for a mutation                         | Remove the role and close Vendor provisioning/session routes                            |

Only real, assigned Live Vendor identities are valid product records. Their password/TOTP and
optional same-address Gmail OAuth lifecycle never uses DWD or an internal staff role. Synthetic
Vendor identities, mailbox adapters, tickets, and receipts are deterministic automated-test
fixtures only. Identity class wins over email domain: `vendor:true` users are filtered out of
People/Access and rejected by internal role/scope/session boundaries even if an address uses the
hosted domain.

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

Record each provider/action independently as `unavailable`, legacy `test_ready` (an internal
compatibility value only, never a Production lane), `live_configured`,
`live_proven`, `enabled`, or `suspended`.

| System        | App role                                     | Non-secret activation anchors                                                       | Secret owner/location                         | Documented quota / terms                                                                                                                                                                                                                                                                                                                                                                                                         | Safe default                                                                                                            |
| ------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| RentVine      | Operational reads; renewal/work-order writes | Tenant base URL, exact endpoints, property/unit/lease/Vendor/status/version mapping | Existing key/secret in Secret Manager; PMI KC | Needs Verification                                                                                                                                                                                                                                                                                                                                                                                                               | Reads when healthy; unsupported writes unavailable; local rehearsal refuses effects and automated tests cover contracts |
| RentCast      | Market comps and rent estimates              | Active API plan, request budget, response attribution/storage/display policy        | API key in Secret Manager; PMI KC             | [API terms](https://www.rentcast.io/terms-api) generally permit storage, display, and distribution; [billing guidance](https://developers.rentcast.io/reference/billing-and-pricing) says request limits and overages vary by plan. Exact PMI plan and applicable third-party-data permission for storing/caching comps and displaying them to a property owner: Needs Verification. S28b activation is blocked until confirmed. | Unavailable; manual comp entry remains usable                                                                           |
| Gmail         | Workflow-linked communication                | DWD subject, linked recipient/thread fields, artifact/label rule                    | Keyless DWD / attached identity               | [Official limits](https://developers.google.com/workspace/gmail/api/reference/quota): new-project limits are 1,200,000 units/min/project and 6,000 units/min/user/project, with an 80,000,000-unit/day billing threshold; `drafts.send` and `messages.send` cost 100 units. This project may retain its pre-May-2026 quotas; exact Console quota and intended-volume fit: Needs Verification.                                    | Existing enabled actions retain scope; new initiation unavailable until mapped                                          |
| Vendor Gmail  | Assigned-ticket Vendor communication         | OAuth client/redirect/four scopes, same Vendor address, vault reference             | Per-Vendor refresh token in Secret Manager    | [Official Gmail API limits](https://developers.google.com/workspace/gmail/api/reference/quota) apply by OAuth project and user. Exact OAuth project quota, mailbox sending limits, plan terms, and intended-volume fit: Needs Verification.                                                                                                                                                                                      | Live OAuth off until that real Vendor activates; synthetic mailboxes are test-only                                      |
| Google Sheets | Renewal checklist read/write                 | Sheet/tab/row key/column, DWD subject, conflict contract                            | Keyless reader/writer identity                | [Official limits](https://developers.google.com/workspace/sheets/api/limits): 300 read and 300 write requests/min/project, 60/min/user/project, and no daily request cap within the per-minute quotas. Google notes project quotas can differ; exact production quota and intended-volume fit: Needs Verification.                                                                                                               | Existing approved read may run; write unavailable until atomic conflict proof                                           |
| Dotloop       | Lease/document package                       | Account/profile/template/participant/document mapping                               | OAuth client/secret in Secret Manager         | Needs Verification                                                                                                                                                                                                                                                                                                                                                                                                               | Unavailable; no UI endpoint inference                                                                                   |
| LeadSimple    | Process/task workflow                        | Account plan/endpoint, stages, assignee/due rule, conditional update                | API key in Secret Manager                     | Needs Verification                                                                                                                                                                                                                                                                                                                                                                                                               | Unavailable until configured; deterministic receipts remain test-only                                                   |
| QuickBooks    | Draft Bill downstream                        | OAuth/company/Vendor/account/property mapping, draft-only permission                | OAuth/vault in Secret Manager                 | Needs Verification                                                                                                                                                                                                                                                                                                                                                                                                               | Unavailable until configured; deterministic draft receipts are test-only; no post/pay path                              |
| Boom/SMS      | Auxiliary enrollment/outreach                | Account, applicability/consent/sender/delivery/correction                           | Provider secret only after selection          | Needs Verification                                                                                                                                                                                                                                                                                                                                                                                                               | Unavailable/not-applicable; do not select by inference                                                                  |
| Drive         | Maintenance photo append                     | In-boundary folder, ticket mapping, MIME/size/scanner policy                        | Attached Workspace/Drive identity             | [Official limits](https://developers.google.com/workspace/drive/api/guides/limits): 1,000,000 units/min/project, 325,000 units/min/user/project, and 1 TB/day/project egress. This project may retain its pre-May-2026 quotas; exact Console quota, Workspace storage terms, and intended-volume fit: Needs Verification.                                                                                                        | Live upload unavailable until configured; test metadata remains test-only; no replace/delete                            |

An inactive row does not make the production application unready. Its exact Live action remains
closed and visibly unavailable while app-plane behavior is covered by local Live-read-only refusal
and deterministic automated tests. Connections also exposes a reviewed generic provider front door;
it is navigation only and never Live evidence/readiness.

## Manual Setup And Web-App Testing

Run session, cost, and environment checks before live Google/cloud work:

```bash
npm run preflight:adc
npm run check:budget-guard
```

If ADC is stale, the owner runs `npm run auth:session` interactively. Never substitute a personal
account. S52 is applied and read back at a `$25` alert threshold and `$100` hard stop, with both
enforcement points aligned. Re-read the live controls before a cost-bearing change; never lower a
safety control without the required owner approval.

Prepare/verify the ignored production environment:

```bash
npm run prepare:production-env -- \
  --app-base-url=https://pmi-kc-app-kq6wuvpiva-uc.a.run.app \
  --service-account=pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com \
  --approval-sender="$KB_APPROVAL_SENDER"
```

The helper forces `ENVIRONMENT_KIND=production` plus `DATA_CONTEXT=live`, requires exactly one
managed `KB_APPROVAL_SENDER` even while the unrelated legacy digest flag is false, and carries
`SPACE_PROVISIONING_ENABLED` as an explicit fail-closed boolean. It copies only the non-secret
maintenance-intake Secret Manager ids/versions: both
`MAINTENANCE_INTAKE_TOKEN_SECRET_SECRET_ID` and
`MAINTENANCE_INTAKE_IP_HASH_SALT_SECRET_ID` activate together, while a partial pair, plaintext-only
configuration, or reuse of one Secret Manager id is refused. The two referenced values must live
under different ids and be distinct, generated high-entropy values of at least 32 UTF-8 bytes. Do not
put either secret value in the generated file. Production release reads
`.env.production.local`, not `.env.local`. Confirm that every intended non-secret value reached the
release command's `MERGED` map:

```bash
npm run release -- --environment=production --service=pmi-kc-app --plan-only
```

The release path runs its own production preflight against that merged map. A standalone
`npm run preflight:production` reads the ambient shell and is not release-path evidence. After the
full local gate, fresh managed auth, current guardrail readback, prior-revision capture, and reviewed
plan, execute only against the already provisioned service:

```bash
npm run release -- \
  --environment=production \
  --service=pmi-kc-app \
  --execute \
  --budget-confirmed
```

The release creates a candidate at zero traffic. Smoke the exact tagged revision, promote it
deliberately, read back exact traffic, and retain the captured predecessor for revision-level
rollback.

`firestore.rules` is D12-protected: a changed ruleset is isolated and surfaced for owner review, not
pushed or deployed under the unattended grant. Deploy `firestore:indexes` separately only when an
actual production query requires one of the declared composite indexes; index creation is a cloud
resource mutation, not part of D05.

After a Production deploy, verify internal sign-in and wrong-domain denial; the Production + Live
descriptor; zero product Test routes or fixtures; source-backed Ask/no-source; exact
provider/backlinks; Gmail hydration; resident-token object authorization; exact-revision traffic;
and rollback. Separately verify local `environmentKind:"demo"` +
`dataContext:"live_readonly"` + `source:"explicit"` and mutation/provider-effect refusal. Record
only safe route/state outcomes—never setup links, passwords, tokens, TOTP material, customer
content, or sessions.

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
- [x] Historical Production Test Lease, Vendor, and Maintenance journeys remain dated evidence; their
      deterministic equivalents remain under automated tests/helpers only.
- [x] Exactly 90 explicit Test records were removed behind a named, retained backup and a successful
      one-record restore drill; zero remain across all 28 governed collections.
- [x] Local rehearsal resolves the exact explicit Demo + Live-read-only descriptor and refuses
      durable writes and provider effects.
- [x] Each provider's activation state is independent and visible in the app.
- [x] Current serving checkpoint and rollback are recorded in the Environment Registry.
- [x] Hosted Demo provisioning and fixture seeding are explicitly deferred; no resource request is
      open for them.
- [x] Rehearse bounded rollback/restore between final revision
      `pmi-kc-app-rmsd5ux3l-0b445f0442ea` and captured predecessor
      `pmi-kc-app-rmsc62q55-dbcbe2db4927`, then restore the final revision to 100%.
- [x] Delete legacy service `pmi-kc-kb-demo` only after forward restore and smoke; direct describe
      and service-list readbacks prove it absent.
- [x] `docs/client-checklist.md` contains only genuine client inputs, not already-settled decisions.
- [x] `docs/status.md` records verification and any exact dependent blocker.

If a value is missing, block only the dependent Live action and continue with the local
Live-read-only/app-plane or unavailable-provider default. Preserve no-autonomous-send, exact
confirmation, one-attempt, reconciliation, and rollback controls.
