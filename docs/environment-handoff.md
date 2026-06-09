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

## Non-Secret Source Artifact Registry

| Artifact source                    | Path or location                                              | Product lane  | Status                          | Handoff note                                                                      |
| ---------------------------------- | ------------------------------------------------------------- | ------------- | ------------------------------- | --------------------------------------------------------------------------------- |
| Legacy Owner Router source package | `C:\Users\josia\Documents\github-windows\pmi-kc-owner-router` | Gmail Inbox 0 | Exists locally; no commits yet. | Source material only; map lives in `docs/legacy/owner-router-artifact-source.md`. |

## Environment Registry

| Environment       | Purpose                                    | Non-secret identifiers                  | Secret storage                          | Owner             | Status                    | Verification                                      |
| ----------------- | ------------------------------------------ | --------------------------------------- | --------------------------------------- | ----------------- | ------------------------- | ------------------------------------------------- |
| Local development | Run and test the repo on this workstation. | `localhost:3000`, approved test domain. | `.env.local` or active shell.           | Implementer       | Available.                | `npm run dev`, `npm run format:check`, `npm test` |
| Demo              | Safe demo and smoke environment.           | Demo GCP/Firebase project and demo URL. | `.env.local`, demo ADC, demo IAM.       | Josiah            | Existing demo path.       | `npm run check:live-cost`, demo smoke scripts.    |
| Staging           | Client-approved pre-production testing.    | TBD client project/domain/users.        | Client Secret Manager or impersonation. | Client/Josiah TBD | Not provisioned.          | `npm run preflight:production -- --env-file=...`  |
| Production        | PMI KC-owned live product environment.     | TBD client project/domain/source maps.  | Client Secret Manager or workload ID.   | Client TBD        | Blocked on client access. | Production preflight and cutover smoke.           |

## Current Client-Side Setup Gates

These gates come from the current outbound Dan/team communications. They are not
approval to spend, deploy, import sources, use credentials, or touch live Gmail.

The cost ceiling and free-tier-first defaults behind these gates are governed by
`docs/budget-and-cost-policy.md` (~$10 total, no spend without approval). Validate the
current cost posture with `npm run check:budget-guard`.

| Gate                              | Owner      | Current status                                                                                                                          | Record only these non-secret details after unblock                            | Verification after unblock                                               |
| --------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Google Cloud billing card         | Dan/PMI KC | Asked Dan to add a card; awaiting reply. Budget context is $10 and no spend without approval.                                           | Billing account/project names or IDs; budget/alert owner.                     | Billing is visible/enabled, then approved dry-run preflights.            |
| Tool access spreadsheet           | Dan/team   | Partially returned: RentVine both/API; LeadSimple, DotLoop, Boom, and Sheets admin/location; QuickBooks blank; Sheets scope unresolved. | Tool names, access owner, login page/shared folder label, API availability.   | Classify each tool as read-only, write-capable, unsupported, or blocked. |
| Lease Renewal walkthrough         | Dan/team   | Asked for a full renewal walkthrough around June 17-18, 2026.                                                                           | Recorded walkthrough location, source-note owner, and sanitized summary path. | Walkthrough notes captured without raw client records in git.            |
| Signed lease / lease-date source  | Dan/team   | Blank answer requested; awaiting reply.                                                                                                 | System/folder/sheet name, owner, and whether dates can be read safely.        | First authoritative renewal trigger source recorded.                     |
| Gmail helper safe-thread protocol | Dan        | Default sent: start with a few safe test threads first.                                                                                 | Approved test-thread model, exclusion rules, and rollback owner.              | Safe Gmail test protocol documented before live Gmail runtime.           |
| Approval notification sender      | Dan/PMI KC | Default sent: `kb-automation@pmikcmetro.com`; awaiting exceptions.                                                                      | Sender address, recipient group, label name, support owner.                   | Send-only notification smoke only after explicit approval.               |

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
- No secrets, client records, live Gmail content, deploys, imports, sends, or external
  writes were performed without approval.

Once recorded, future agents should keep readiness artifacts current and fix real
regressions, but should not add new local product surface until a client answer,
approved migration step, production smoke result, or accepted product decision creates a
specific need.

## Setup Inventory

### Non-Secret Tool-Access Snapshot

Recorded from the ignored local tool-access spreadsheet on 2026-06-09. Do not copy
spreadsheet notes or credentials into tracked files.

| Tool          | Non-secret access answer | Remaining handoff gap                                      |
| ------------- | ------------------------ | ---------------------------------------------------------- |
| RentVine      | Both access/API location | Rotate exposed API credential before any future use.       |
| LeadSimple    | Admin account            | Confirm Operations plan and endpoint coverage.             |
| DotLoop       | Admin account            | Confirm signing/send lifecycle before runtime integration. |
| QuickBooks    | Blank                    | Client still needs to provide access status/location.      |
| Boom          | Admin account            | Vendor endpoint contract packet still required.            |
| Google Sheets | Admin account            | Confirm exact in-scope sheets and owner.                   |

| Area                         | Environment  | Non-secret values to record                                   | Where real secrets live                                  | Manual setup or approval required                                   | Verification                                       | Approval gate                                  |
| ---------------------------- | ------------ | ------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------- |
| Firebase web app             | Staging/Prod | Project ID, auth domain, app ID.                              | Firebase config values in ignored env/Secret Manager.    | Create web app and approved authorized domains.                     | `npm run firebase:setup -- --project=<id>`         | Client project/domain approval.                |
| Firebase Auth / Identity     | Staging/Prod | Allowed domain, OAuth client ID name.                         | OAuth client secret in Secret Manager/ignored env.       | Enable Google provider, consent if Google requires it.              | Sign-in smoke; wrong-domain rejection.             | Client Workspace/domain approval.              |
| Firestore                    | Staging/Prod | Project ID, database ID, region.                              | None for rules/index identifiers.                        | Create Native mode database and deploy rules/indexes.               | `npm run test:firestore`; production smoke.        | Client project approval.                       |
| Cloud Run                    | Staging/Prod | Service name, region, runtime service account, URL.           | Runtime env secrets in Secret Manager or shell.          | Deploy only after preflight and explicit budget/deploy approval.    | `npm run preflight:production -- --env-file=...`   | Deploy and cost approval.                      |
| Vertex AI / Gemini           | Staging/Prod | Region, model names.                                          | ADC/workload identity only.                              | Enable API and confirm model/cost choice.                           | `npm run check:live-cost`; Ask smoke.              | Cloud/API cost approval.                       |
| Agent Search                 | Staging/Prod | Location, data-store IDs, display names.                      | ADC/workload identity only.                              | Create/import only approved source corpora.                         | `npm run corpus:plan -- --dry-run`; Ask smoke.     | Source import and indexed-volume approval.     |
| Cloud Storage source buckets | Staging/Prod | Bucket names, prefixes, service-agent grants.                 | IAM/workload identity only.                              | Create buckets and upload approved source copies.                   | `npm run corpus:plan`; import dry-run.             | Source and cloud cost approval.                |
| Drive source folders         | Staging/Prod | Folder names, owners, access groups.                          | Workspace permissions, not repo secrets.                 | Client creates/shares source-of-truth folders.                      | Manual access check; source-sync test when scoped. | Client Workspace approval.                     |
| Gmail KB Approval sender     | Prod         | Sender address, recipient list, label name, app base URL.     | Gmail auth/identity in Secret Manager or approved setup. | Provision `kb-automation@pmikcmetro.com`; approve recipients.       | Notification smoke after approval.                 | Gmail sender/recipient and send-only approval. |
| Gmail Inbox 0                | Prod         | Label names, safe test model, management-page scope.          | Gmail credentials only through approved setup.           | Dan-approved mailbox scan, label/filter, and draft/reply model.     | Safe thread or supervised test.                    | Live Gmail read/modify/draft approval.         |
| External systems             | Future       | Target system, action type, readiness state, owner, rollback. | Per-system approved credential storage.                  | Future approved spec, tests, audit fields, rollback/error handling. | Deterministic API health checks.                   | Per target-system/action-type approval.        |

### External System Integration Registry

Per-vendor handoff detail for the future integrations, aligned with the verified roles in
`docs/integration-architecture.md`. None are provisioned; all writes stay gated. Action
types are catalogued in the `action_registry` collection (`production_allowed: false`).

| System        | Role                          | Event mode                | Plan/tier note                                                | Credential owner (future)          |
| ------------- | ----------------------------- | ------------------------- | ------------------------------------------------------------- | ---------------------------------- |
| Rentvine      | Operational system of record  | Polling / LeadSimple sync | Account API key + roles; rotate exposed credential before use | PMI KC; key rotation required      |
| LeadSimple    | Workflow orchestration        | LeadSimple sync           | Operations plan for Rentvine sync                             | PMI KC admin-enabled REST key      |
| Dotloop       | Document-package layer        | Webhook                   | OAuth2 approved app program                                   | PMI KC approved app registration   |
| QuickBooks    | Accounting (downstream)       | Webhook                   | Online Accounting API; blank in returned tool-access sheet    | PMI KC; access status still needed |
| Boom          | Resident services (auxiliary) | Webhook (vendor-packet)   | Endpoint contract request-only                                | PMI KC; vendor packet required     |
| Google Sheets | Exception / control plane     | Apps Script triggers      | Admin account/location returned; exact sheets still TBD       | PMI KC Workspace owner             |

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

| Manual step                      | Why manual or supervised                     | Required evidence                                | Durable doc to update                        |
| -------------------------------- | -------------------------------------------- | ------------------------------------------------ | -------------------------------------------- |
| Firebase/Auth console consent    | Google may require browser consent.          | Command rerun passes or screenshot-free note.    | `docs/status.md`, this file.                 |
| Production domain authorization  | Requires client-owned domain/project access. | Auth domain listed and sign-in smoke passes.     | `docs/client-production-cutover.md`, status. |
| Dan Gmail setup or scan approval | Touches live mailbox and privacy boundaries. | Approved test model and safe thread protocol.    | `docs/products/gmail-inbox-zero.md`, status. |
| Source folder sharing            | Client controls Workspace/Drive access.      | Folder owner/access group recorded.              | `docs/client-checklist.md`, this file.       |
| Production source import         | Indexes client data and may incur costs.     | Source approval, dry-run, import result.         | `docs/status.md`, source manifest notes.     |
| Production smoke                 | Confirms real app behavior after deployment. | Sign-in, Ask, citations, no-source, queue smoke. | `docs/client-production-cutover.md`, status. |

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

If any item is missing, a future agent should treat production/client-environment work
as blocked. Continue only with planning, documentation, tests, dry-runs, regression
fixes, and handoff work that improves readiness. If the migration-ready but
client-blocked state has been reached, stop adding local product surface and route the
next task to client unblock or cutover prep.
