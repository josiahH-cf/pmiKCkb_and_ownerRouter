# Environment Handoff

Use this as the non-secret handoff registry for local, demo, staging, and production
environments. It should tell a future agent or team where values live, who owns setup,
what still requires manual approval, and how to verify the environment.

Do not put secrets, tokens, service-account key files, raw customer data, raw Gmail
content, leases, ledgers, bank data, SSNs, or full source packets in this document.

## How To Use

- Record names, owners, project IDs, domains, service-account emails, bucket names,
  data-store IDs, and status only.
- Put variable names in `.env.example`.
- Put local real values in ignored `.env.local`, `.env.production.local`, or the active
  shell.
- Put staging/production real secrets in client-approved Secret Manager, workload
  identity, impersonation, or equivalent managed secret storage.
- Prefer no downloadable service-account keys. If a key is unavoidable, record the
  owner, storage location, rotation path, and revocation path without recording the key.
- Every setup row should have a verification command or manual check before it is marked
  complete.

### Local emulator mutation boundary

Demo seed/reset/operator writes require a reachable process-level loopback Firestore emulator target before
Firebase Admin initialization. Use explicit `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` plus a non-secret emulator
namespace project id; `.env.local` may supply the same values, but the guard normalizes and propagates them before
child processes. An absent, malformed, non-local, or stopped target fails closed. Demo commands have no live mode,
do not require ADC, and must never be redirected to production. Local-demo auth also forces `IMAGE_STORE=stub`;
the Maintenance Drive action remains closed by the Action Registry even when a folder id exists.

## Non-Secret Source Artifact Registry

| Artifact source                    | Path or location                                                           | Product lane  | Status                          | Handoff note                                                                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------- | ------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy Owner Router source package | `C:\Users\josia\Documents\github-windows\pmi-kc-owner-router`              | Gmail Inbox 0 | Exists locally; no commits yet. | Source material only; map lives in `docs/legacy/owner-router-artifact-source.md`.                                                                                               |
| PMI KC source drop zone            | <https://drive.google.com/drive/folders/1arXww32LaPcIbFx_oONshbR62imiC8kq> | All lanes     | Created and shared with Dan.    | Source folders for Lease Renewals, Maintenance, Move-Out, Owner Onboarding, Gmail Inbox 0, unsure, and reference material.                                                      |
| Shared Google Sheets in Drive home | Google Drive home for `josiah@pmikcmetro.com`                              | All lanes     | Metadata visible only.          | Visible sheet names include `Tenant Move In/Out/Renewal Checklist`, `24/25/26 Rents Received 2`, and `2026 Invoices`; exact in-scope Sheets still need confirmation before use. |

## Environment Registry

| Environment       | Purpose                                    | Non-secret identifiers                                                                                        | Secret storage                          | Owner                    | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Verification                                      |
| ----------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Local development | Run and test the repo on this workstation. | `localhost:3000`, approved test domain.                                                                       | `.env.local` or active shell.           | Implementer              | Available.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `npm run dev`, `npm run format:check`, `npm test` |
| Demo              | Safe demo and smoke environment.           | Demo GCP/Firebase project and demo URL.                                                                       | `.env.local`, demo ADC, demo IAM.       | Josiah (cherrybridge.ai) | cherrybridge.ai-owned (auth-locked to cherrybridge.ai); not reusable for pmikcmetro.com.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `npm run check:live-cost`, demo smoke scripts.    |
| Staging           | Client-approved pre-production testing.    | TBD client project/domain/users.                                                                              | Client Secret Manager or impersonation. | Client/Josiah TBD        | Not provisioned.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `npm run preflight:production -- --env-file=...`  |
| Production        | PMI KC-owned live product environment.     | pmi-kc-kb-prod (#558870356522); bucket pmi-kc-kb-prod-sources-558870356522; data store kb-lease-renewals-txt. | Client Secret Manager or workload ID.   | Client TBD               | Provisioned 2026-06-19 under org pmikcmetro.com: billing linked + $10 budget alert, 19 APIs, Firestore + 12 spaces, Firebase web app 1:558870356522:web:c1b2473b886a6edd889953, bucket pmi-kc-kb-prod-sources-558870356522, Agent Search kb-lease-renewals-txt (3 docs). Live smoke:ask-live PASS. DEPLOYED to Cloud Run https://pmi-kc-kb-demo-558870356522.us-central1.run.app (sign-in locked to pmikcmetro.com). Auth loop fixed 2026-06-19 (build NEXT_PUBLIC_FIREBASE_PROJECT_ID corrected; dedicated runtime SA pmi-kc-kb-runtime@ least-privilege; sign-in via signInWithPopup; authorized the canonical Cloud Run host in Firebase). Canonical URL https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app (both run.app hosts authorized). Pending: Firestore rules deploy (needs firebase login). | Production preflight and cutover smoke.           |

Latest verified production release: the verified working tree based on commit `b24c67d`, plus the uncommitted
browser-only Gmail Hub simulator slice, deployed 2026-07-13 as revision `pmi-kc-kb-demo-00014-cwq` with 100%
traffic. Direct production checks passed for the simulator's append/reset/refresh behavior, 390px containment,
disabled live-mailbox access, absence of a Send control, and an empty browser warning/error log. Revision
`pmi-kc-kb-demo-00013-gm4` remains the clean-commit baseline that passed the broader authentication, phone
renewal, Console/Notifications, Gmail Hub draft/summary, anticipated-work, Maintenance-readiness, and cited-Ask
walkthrough earlier that day.

### Gmail S19 live handoff (production activation authorized 2026-07-13)

| Item                          | Current state                                                                                                     | Owner action before use                                                  | Rollback                                                                   |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Per-user DWD                  | Client `104374162913177846911` has readonly, compose, labels, and modify; keyless mint remains domain-bound.      | Set explicit `GMAIL_DWD_SA`; no rollout mailbox allowlist.               | Revoke only the scopes being rolled back.                                  |
| Bounded mailbox read          | `gmail.mailbox.read` is Approved for Execution for each signed-in user's own mailbox.                             | Keep queries bounded and subject server-derived.                         | Set the action false, revoke readonly, and redeploy.                       |
| Exact-confirmation send/reply | New-message and threaded-reply actions are Approved for Execution; arbitrary reviewed recipients are supported.   | Preserve exact preview, one-time confirmation, and no ambiguous retry.   | Flip send/reply false and redeploy; delivered email is not retractable.    |
| Gmail labels                  | User-label discovery/creation and selected-thread application are approved under labels/modify.                   | Store only label/thread identifiers in evidence.                         | Flip label action false; remove applied labels if appropriate.             |
| Gmail watch / Pub/Sub         | Topic, Gmail publisher, dedicated OIDC push identity/subscription, watch, and history processing are live-proven. | Renew the watch before its expiration; retain identifiers-only evidence. | Stop watch and delete subscription/topic/push identity.                    |
| Production                    | Revision `pmi-kc-kb-demo-00020-24d` serves 100% traffic; bounded synthetic production proof passed.               | Preserve exact confirmation and monitor value-free sync health.          | Route traffic to the prior verified revision and disable the five actions. |

Tracked evidence may contain Gmail message/thread identifiers, counts, timestamps, and
status only. It must never contain token values, subjects/bodies, raw MIME, attachment
content, or mailbox thread content.

## Current Client-Side Setup Gates

These gates come from the current outbound Dan/team communications. Remote Away Mode is
inactive as of 2026-06-15, so answered gates unblock normal owner-coordinated setup and
migration prep when the budget guard passes and identifiers are recorded here. They are
not approval for unbounded spend, autonomous sends, raw data handling, destructive
changes, or system-of-record writes.

The cost ceiling and free-tier-first defaults behind these gates are governed by
`docs/budget-and-cost-policy.md` (~$10 total, no spend without approval). Validate the
current cost posture with `npm run check:budget-guard`.

| Gate                             | Owner        | Current status                                                                                                                                                                                                                                                                                                                                        | Record only these non-secret details after unblock                                          | Verification after unblock                                                |
| -------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Google Cloud billing card        | Dan/PMI KC   | PROVISIONED 2026-06-19: production project `pmi-kc-kb-prod` (#558870356522), billing account 01A5A3-65CA5A-614D45 (org 584930494337), account budget id 82962d7e-b340-4253-8348-38caff16e88a, project-scoped $10 budgets, and hard kill switch are verified. Remaining: session auth when stale and explicit per-step approval for cost-bearing work. | Billing account/project names or IDs; budget/guard owner.                                   | Run the read-only budget/preflight checks before each approved live step. |
| Tool access spreadsheet          | Dan/team     | Partially returned: RentVine both/API; LeadSimple, DotLoop, Boom, and Sheets admin/location; QuickBooks blank; Sheets scope unresolved.                                                                                                                                                                                                               | Tool names, access owner, login page/shared folder label, API availability.                 | Classify each tool as read-only, write-capable, unsupported, or blocked.  |
| Lease Renewal walkthrough        | Dan/team     | HELD 2026-06-19 by live screen-share; the sanitized process reference is captured in `docs/products/lease-renewal-discovery-reference.md`. Optional remainder: a short supervised view of the exact RentVine renewal/rent-increase clicks.                                                                                                            | Optional click-path confirmation only; no raw client records in git.                        | Update the vendor/click-path notes if the optional view occurs.           |
| Signed lease / lease-date source | Dan/team     | RESOLVED 2026-06-20: executed signed leases are in Dotloop; renewal timing and lease-end read from the RentVine lease record.                                                                                                                                                                                                                         | No further client value required for the read-only trigger.                                 | Mapper and discovery-reference remain the evidence.                       |
| Gmail live self-thread proof     | Josiah/owner | Authorized 2026-07-13: one synthetic self-addressed message and one exact-confirmed reply; Dan and third parties excluded from proof.                                                                                                                                                                                                                 | DWD scope evidence, Gmail message/thread IDs, counts/statuses, rollback owner (no content). | Two messages share one thread id; label and watch status verified.        |
| Approval notification sender     | Dan/PMI KC   | Default sent: `kb-automation@pmikcmetro.com`; awaiting exceptions.                                                                                                                                                                                                                                                                                    | Sender address, recipient group, label name, support owner.                                 | Send-only notification smoke only after explicit approval.                |

## Migration-Ready But Client-Blocked State

Use this state when local work is no longer the limiting factor. Record it before
stopping local feature loops.

Required evidence:

- Latest relevant local checks pass, or failures are documented as environment-only or
  client-blocked.
- Production preflight, source manifest, cutover, and handoff inputs are either
  prepared with placeholders or blocked only on client-owned values.
- `docs/client-checklist.md` names the exact client actions needed next.
- `docs/status.md` says what local feature ideas were deferred and why.
- No secrets or client records were committed. The 2026-07-13 Gmail activation explicitly
  authorizes its deploy, synthetic self-send/reply, label, watch, and Pub/Sub resources;
  other deploys, imports, sends, or external writes remain separately gated.

Once recorded, future agents should keep readiness artifacts current and fix real
regressions, but should not add new local product surface until a client answer,
approved migration step, production smoke result, or accepted product decision creates a
specific need.

## GCP Setup Preflight

`npm run preflight:gcp -- --project=<client-project-id>` prints the full converge plan
(required APIs, Firebase setup commands, Firestore create/rules-deploy commands, budget
posture) without credentials. With Application Default Credentials, add `--live` for a
read-only check of enabled APIs, Firestore database mode, and the Firebase project, and
`--json` for a machine-readable readiness report (`readiness.ok` / `blockers` /
`warnings`). Record the non-secret report output here after each owner-side run.

- 2026-06-11: plan mode verified locally (no credentials in the remote container); live
  mode degrades to a structured credentials blocker as designed. No owner-side live run
  recorded yet.
- 2026-06-19: client billing provisioned — account `01A5A3-65CA5A-614D45`, org
  `584930494337`, budget id `82962d7e-b340-4253-8348-38caff16e88a` (PM-created). No owner-side
  `--live` preflight run yet: gcloud is installed but `npm run host:check` reports
  `pmikckb-test` not accessible, so `gcloud auth login` + `gcloud auth application-default login`
  are required first. Keep the durable $10 guard; create a project-scoped $10 budget alert on
  the production project before any deploy (`docs/budget-and-cost-policy.md`).

## Setup Inventory

### Non-Secret Tool-Access Snapshot

Recorded from the ignored local tool-access spreadsheet on 2026-06-09. Do not copy
spreadsheet notes or credentials into tracked files.

| Tool          | Non-secret access answer                                                                                                                         | Remaining handoff gap                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| RentVine      | Both access/API location                                                                                                                         | Credential used as-is (owner decision 2026-06-20; not rotated) — load from env/Secret Manager, never commit. |
| LeadSimple    | Admin account                                                                                                                                    | Confirm Operations plan and endpoint coverage.                                                               |
| DotLoop       | Admin account                                                                                                                                    | Confirm signing/send lifecycle before runtime integration.                                                   |
| QuickBooks    | Blank                                                                                                                                            | Client still needs to provide access status/location.                                                        |
| Boom          | Admin account                                                                                                                                    | Vendor endpoint contract packet still required.                                                              |
| Google Sheets | Admin account; visible shared Sheets metadata includes `Tenant Move In/Out/Renewal Checklist`, `24/25/26 Rents Received 2`, and `2026 Invoices`. | Confirm exact in-scope sheets and owner before use.                                                          |

| Area                         | Environment  | Non-secret values to record                                                                                                                                                                      | Where real secrets live                                                                                                                                                      | Manual setup or approval required                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Verification                                                                                  | Approval gate                                                          |
| ---------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Firebase web app             | Staging/Prod | Project ID, auth domain, app ID.                                                                                                                                                                 | Firebase config values in ignored env/Secret Manager.                                                                                                                        | Create web app and approved authorized domains.                                                                                                                                                                                                                                                                                                                                                                                                                                             | `npm run firebase:setup -- --project=<id>`                                                    | Client project/domain approval.                                        |
| Firebase Auth / Identity     | Staging/Prod | Allowed domain, OAuth client ID name.                                                                                                                                                            | OAuth client secret in Secret Manager/ignored env.                                                                                                                           | Enable Google provider, consent if Google requires it.                                                                                                                                                                                                                                                                                                                                                                                                                                      | Sign-in smoke; wrong-domain rejection.                                                        | Client Workspace/domain approval.                                      |
| Firestore                    | Staging/Prod | Project ID, database ID, region.                                                                                                                                                                 | None for rules/index identifiers.                                                                                                                                            | Create Native mode database and deploy rules/indexes.                                                                                                                                                                                                                                                                                                                                                                                                                                       | `npm run test:firestore`; production smoke.                                                   | Client project approval.                                               |
| Cloud Run                    | Staging/Prod | Service name, region, runtime service account, URL. Live-connection non-secrets: `RENTVINE_API_BASE_URL` (pmikcmetro tenant), `RENEWAL_SHEET_ID`, `SHEETS_IMPERSONATE_SA`, `SHEETS_DWD_SUBJECT`. | Runtime env secrets in Secret Manager or shell. RentVine `RENTVINE_API_KEY`/`RENTVINE_API_SECRET` in Secret Manager (runtime SA needs `roles/secretmanager.secretAccessor`). | Scale-to-zero deploys may proceed in Remote Away Mode when budget-guarded and rollback is recorded. Set `MAINTENANCE_PHOTO_DRIVE_FOLDER_ID` to the in-boundary Drive folder id (prod forces the Drive image store); the deploy forwards it and the production preflight requires it. Dev↔prod parity: the deploy forwards the four live-connection non-secrets and wires the RentVine key/secret via `--set-secrets` when the base URL is set; the preflight requires the four non-secrets. | `npm run preflight:production -- --env-file=...`                                              | Cost cap and rollback gate.                                            |
| Vertex AI / Gemini           | Staging/Prod | Region, model names.                                                                                                                                                                             | ADC/workload identity only.                                                                                                                                                  | Enable API and confirm model/cost choice.                                                                                                                                                                                                                                                                                                                                                                                                                                                   | `npm run check:live-cost`; Ask smoke.                                                         | Cloud/API cost approval.                                               |
| Agent Search                 | Staging/Prod | Location, data-store IDs, display names.                                                                                                                                                         | ADC/workload identity only.                                                                                                                                                  | Create/import only approved source corpora; keep imports bounded by budget guard.                                                                                                                                                                                                                                                                                                                                                                                                           | `npm run corpus:plan -- --dry-run`; Ask smoke.                                                | Source, cost, and rollback gate.                                       |
| Cloud Storage source buckets | Staging/Prod | Bucket names, prefixes, service-agent grants.                                                                                                                                                    | IAM/workload identity only.                                                                                                                                                  | Create buckets and upload approved source copies when reversible and budget-bounded.                                                                                                                                                                                                                                                                                                                                                                                                        | `npm run corpus:plan`; import dry-run.                                                        | Source and cloud cost gate.                                            |
| Drive source folders         | Staging/Prod | Folder names, owners, access groups.                                                                                                                                                             | Workspace permissions, not repo secrets.                                                                                                                                     | Source drop zone created/shared; client/team adds approved source material and confirms scope.                                                                                                                                                                                                                                                                                                                                                                                              | Manual access check; source-sync test when scoped.                                            | Client Workspace approval.                                             |
| Gmail KB Approval sender     | Prod         | Sender address, recipient list, label name, app base URL.                                                                                                                                        | Gmail auth/identity in Secret Manager or approved setup.                                                                                                                     | Provision `kb-automation@pmikcmetro.com`; approve recipients.                                                                                                                                                                                                                                                                                                                                                                                                                               | Notification smoke after approval.                                                            | Gmail sender/recipient and send-only approval.                         |
| Gmail Inbox 0 / S19 per-user | Prod         | DWD client `104374162913177846911`; `GMAIL_DWD_SA`; `GMAIL_PUBSUB_TOPIC`; `GMAIL_PUBSUB_AUDIENCE`; `GMAIL_PUBSUB_PUSH_SERVICE_ACCOUNT`.                                                          | Keyless attached-SA/DWD and IAM only; no key file or browser token.                                                                                                          | Four exact Gmail scopes and five Inbox 0 actions are owner-approved. Gmail publisher gets one topic; push uses a dedicated no-key OIDC identity and exact audience.                                                                                                                                                                                                                                                                                                                         | Full fake-transport suite plus synthetic self-send/reply/label/watch proof; identifiers only. | Approved 2026-07-13; exact confirmation and no-autonomous-send remain. |
| External systems             | Future       | Target system, action type, readiness state, owner, rollback.                                                                                                                                    | Per-system approved credential storage.                                                                                                                                      | Future approved spec, tests, audit fields, rollback/error handling.                                                                                                                                                                                                                                                                                                                                                                                                                         | Deterministic API health checks.                                                              | Per target-system/action-type approval.                                |

### External System Integration Registry

Per-vendor handoff detail for the future integrations, aligned with the verified roles in
`docs/integration-architecture.md`. None are provisioned; all writes stay gated. Action
types are catalogued in the `action_registry` collection (`production_allowed: false`).

| System        | Role                          | Event mode                | Plan/tier note                                                                          | Credential owner (future)            |
| ------------- | ----------------------------- | ------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------ |
| Rentvine      | Operational system of record  | Polling / LeadSimple sync | Account API key + roles; credential used as-is (owner decision 2026-06-20, not rotated) | PMI KC; load from env/Secret Manager |
| LeadSimple    | Workflow orchestration        | LeadSimple sync           | Operations plan for Rentvine sync                                                       | PMI KC admin-enabled REST key        |
| Dotloop       | Document-package layer        | Webhook                   | OAuth2 approved app program                                                             | PMI KC approved app registration     |
| QuickBooks    | Accounting (downstream)       | Webhook                   | Online Accounting API; blank in returned tool-access sheet                              | PMI KC; access status still needed   |
| Boom          | Resident services (auxiliary) | Webhook (vendor-packet)   | Endpoint contract request-only                                                          | PMI KC; vendor packet required       |
| Google Sheets | Exception / control plane     | Apps Script triggers      | Admin account/location returned; exact sheets still TBD                                 | PMI KC Workspace owner               |

## Key And Secret Ownership

| Secret or credential class       | Preferred storage                      | Repo record allowed                  | Owner needed before production? | Rotation/revocation note                                    |
| -------------------------------- | -------------------------------------- | ------------------------------------ | ------------------------------- | ----------------------------------------------------------- |
| Firebase/OAuth client secrets    | Secret Manager or ignored env.         | Variable name and OAuth client name. | Yes.                            | Rotate in Google Cloud/Firebase and update Secret Manager.  |
| Service account runtime identity | Workload identity / attached account.  | Service account email and roles.     | Yes.                            | Remove IAM roles or disable service account.                |
| Service account key file         | Avoid; approved secure storage only.   | Owner, purpose, storage path label.  | Yes, plus explicit exception.   | Rotate and revoke immediately after replacement.            |
| Gmail sender authority           | Approved Google Workspace/Gmail setup. | Sender address and scope.            | Yes.                            | Revoke Gmail/API grant; disable notification config.        |
| External-system API keys         | Client-approved secret store.          | Target system, action type, owner.   | Yes.                            | Rotate at provider; disable action type in Admin surface.   |
| Local developer credentials      | `.env.local`, ADC, or active shell.    | Variable names only.                 | No for local; yes for handoff.  | Delete local file/session; reauth through approved account. |

## Manual Setup And Web-App Testing

Record manual setup here or in `docs/status.md` when it becomes concrete:

| Manual step                                  | Why manual or supervised                     | Required evidence                                | Durable doc to update                        |
| -------------------------------------------- | -------------------------------------------- | ------------------------------------------------ | -------------------------------------------- |
| Firebase/Auth console consent                | Google may require browser consent.          | Command rerun passes or screenshot-free note.    | `docs/status.md`, this file.                 |
| Production domain authorization              | Requires client-owned domain/project access. | Auth domain listed and sign-in smoke passes.     | `docs/client-production-cutover.md`, status. |
| Historical Gmail scan / automatic processing | Exceeds bounded user-invoked mailbox use.    | Separate safe scan/model protocol.               | `docs/products/gmail-inbox-zero.md`, status. |
| Source folder sharing                        | Client controls Workspace/Drive access.      | Folder owner/access group recorded.              | `docs/client-checklist.md`, this file.       |
| Production source import                     | Indexes client data and may incur costs.     | Source approval, dry-run, import result.         | `docs/status.md`, source manifest notes.     |
| Production smoke                             | Confirms real app behavior after deployment. | Sign-in, Ask, citations, no-source, queue smoke. | `docs/client-production-cutover.md`, status. |

## Handoff Checklist

Before a handoff is considered simple enough for a new team:

- `README.md` points to this file and the active runner.
- `.env.example` contains names only for required variables.
- Each environment row above has an owner and status.
- Each live secret has a named storage location, owner, rotation path, and revocation
  path.
- Each manual setup item has a verification method and status note.
- `docs/client-checklist.md` names client-owned asks that remain open.
- `docs/research-backlog.md` names unresolved setup questions that are not yet client
  asks.
- `docs/status.md` records the latest successful verification and remaining blockers.

If a required owner/client value is missing, a future agent should treat only the
dependent step as blocked. Continue with planning, documentation, tests, dry-runs,
regression fixes, and handoff work that improves readiness. Remote Away Mode is inactive;
live/cloud/client actions need the normal approval path and budget guard.
