# Authentication-Identity & Migration Strategy — PMI KC Monorepo

Status: Draft for review (2026-06-20). Produced by a multi-agent audit of every auth surface
in the repo + adversarial review, then reconciled against live findings this session.
Owner action items are at the end.

2026-07-14 Gmail update: S19 retains a per-user Gmail transport whose Firebase user
identity, DWD authorization, and Pub/Sub service identity remain three separate checks.
The product surface is workflow-bounded: transport scope does not authorize general inbox
browsing, generic compose, or background interpretation. See §2.3.

> **Why this exists.** A "blocked on access" failure (Claude's Drive connector couldn't read
> the `pmikcmetro.com` renewal sheet because it was authed to a personal Google account)
> exposed that this project had no single, enforced identity policy. This doc defines the
> policy, the per-surface mechanisms, the migration plan, and guardrails so it cannot recur
> silently. See also [`environment-handoff.md`](environment-handoff.md) and
> [`client-production-cutover.md`](client-production-cutover.md).

## 0. Current State (2026-06-20)

| Surface                    | State                                                                                                                                                                        | Remaining                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| (a) Claude Drive connector | ✅ `pmikcmetro.com` — renewal sheet readable                                                                                                                                 | Revoke the old personal grant at `myaccount.google.com/permissions` (Google-side)          |
| (b) Human gcloud / ADC     | ✅ `josiah@pmikcmetro.com` active on `pmi-kc-kb-prod`; ADC present + pmikcmetro; **legacy `cherrybridge.ai` gcloud credential REVOKED 2026-06-20** (only pmikcmetro remains) | Confirm `billing/quota_project`; overwrite stale registry vars via `host:setup`            |
| (c) Runtime SA             | ✅ `pmi-kc-kb-runtime@…` attached, no keys                                                                                                                                   | Pin role inventory in handoff; add `storage.objectViewer`; Secret-Manager `kb-automation@` |
| (d) Firebase end-user auth | ✅ pmikcmetro-locked; **`NODE_ENV=production` demo-flag footgun fix landed** in `deploy-demo-cloud-run.mjs`                                                                  | Add a runtime startup demo-flag assertion (§5.3)                                           |
| (e) Firebase CLI           | ⛔ not logged in                                                                                                                                                             | `firebase login` as pmikcmetro → deploy `firestore:rules`/`:indexes`                       |
| (f) Cloud Build SA         | ❓ unaudited                                                                                                                                                                 | Identify + record the `--source=.` build SA                                                |

**Legacy demo cloud lane** (`pmikckb-test` project / `pmi-kc-kb-demo` service, in the
`cherrybridge.ai` org) is **retired**. Repo pointers to the dead project were neutralized
2026-06-20 (deploy/setup/source-corpus default project ids, the `firebase:setup-*demo` npm
scripts, demo-operator's old project-number URL); the live cheap-live KB runs on `pmi-kc-kb-prod`
and is unaffected. The GCP project was **deleted 2026-06-20** (`DELETE_REQUESTED`, recoverable
~30 days) via a one-time ephemeral `cherrybridge.ai` auth — see
[`demo-lane-retirement.md`](demo-lane-retirement.md).

## 1. Goals & the Single-Identity Principle

**Owner mandate:** every auth surface uses a `pmikcmetro.com` Google identity; the personal
`josiah.abernathy@gmail.com` account is never in any auth path (Drive/Sheets/Gmail,
gcloud/GCP, deploys, source ingestion, runtime).

- **One organizational domain everywhere.** All human, connector, and machine identities
  resolve to `pmikcmetro.com` (org `584930494337`, prod project `pmi-kc-kb-prod`
  `558870356522`). No `cherrybridge.ai` (legacy demo `pmikckb-test` / `800237451321`) and no
  `gmail.com`/`googlemail.com` in any production path.
- **Least privilege per machine identity.** The runtime SA
  `pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com` holds only needed roles; **build
  identity and runtime identity stay distinct** — the buildpack build runs under a Cloud Build
  SA (§2f), a separate identity that must be named and audited, not just asserted.
- **No downloadable key files anywhere.** ADC (local human) and attached SA / workload
  identity (runtime) only. `GOOGLE_APPLICATION_CREDENTIALS=*.json` is banned.
- **Fail loud, never silent.** "Blocked on access" must surface as an explicit, attributable
  error — never a fallback to demo mode or a personal account.

**Critical correctness point the rest of this doc depends on:** there are **six independent
identity systems** (four runtime/end-user + two CLI/build). They are configured in different
places and do **not** cascade. The most dangerous misconception is that
`gcloud auth login josiah@pmikcmetro.com` fixes the Drive connector. **It does not.**

## 2. Target Auth Mechanism — Per Surface (Six Distinct Identity Systems)

| #   | Identity system                          | Authenticates                                           | Configured at                                                                        | Changing it affects                                                                      |
| --- | ---------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| (a) | **Claude MCP Drive/Workspace connector** | _Claude_, reading Drive/Sheets for you                  | claude.ai → Settings → Connectors (OAuth)                                            | Only what Claude can read in Drive. Nothing else.                                        |
| (b) | **Human gcloud user / ADC**              | _You_, at a terminal/scripts                            | `gcloud auth login` / `application-default login`; ADC at `%APPDATA%/gcloud/...json` | Local CLI, deploys, seed scripts, `preflight:gcp`.                                       |
| (c) | **App runtime service account**          | _The deployed Cloud Run app_                            | `--service-account=` on `gcloud run deploy`                                          | Prod reads of Firestore, Discovery Engine, Storage, Gmail-send.                          |
| (d) | **Firebase end-user auth**               | _Your end users_ signing into the web app               | Firebase Google OAuth + `ALLOWED_HD`, validated at `/api/auth/session`               | Who may log into the web UI.                                                             |
| (e) | **Firebase CLI auth**                    | _You_, deploying Firestore rules/indexes                | `npm exec firebase login`                                                            | `firebase deploy --only firestore:rules`/`:indexes`. Currently **blocking** per handoff. |
| (f) | **Cloud Build / buildpack identity**     | _The buildpack build_ on `gcloud run deploy --source=.` | Cloud Build default/per-project build SA                                             | Whether source builds; which registry/image it writes.                                   |

> **Load-bearing rule for every agent and human: these systems share no token, no consent
> grant, and no config file.** gcloud auth (b) is separate from the Claude connector (a);
> firebase CLI (e) and Cloud Build (f) are their own logins. Each must be migrated and
> verified independently.

### (a) Claude's MCP Drive/Workspace connector — the primary blocker (NOW RESOLVED)

- **Was:** OAuth'd to personal `josiah.abernathy@gmail.com`; could not see `pmikcmetro.com`
  domain files (renewal sheet lookup returned "not found").
- **Now:** reconnected to `josiah@pmikcmetro.com` (2026-06-20) — the renewal sheet
  ("Tenant Move In/Out/Renewal Checklist", owner `dan@pmikcmetro.com`) is now readable, and
  the semantic map was built ([`products/lease-renewal-spreadsheet-map.md`](products/lease-renewal-spreadsheet-map.md)).
- **Follow-up:** revoke the old Claude grant from the personal account at
  `myaccount.google.com/permissions` (disconnecting in Claude does not revoke Google's side).

### (b) Human gcloud user / ADC

- **Today:** `gcloud auth login` active as `josiah@pmikcmetro.com` (org-correct), project
  `pmi-kc-kb-prod` — verified this session. The legacy `cherrybridge.ai` account was also
  credentialed locally but has been **revoked (2026-06-20)**; only `josiah@pmikcmetro.com`
  remains. **ADC is present and resolves to `josiah@pmikcmetro.com`** (verified via
  `npm run preflight:identity`). An earlier "missing" reading was a wrong-path check — on
  Windows ADC lives under `%APPDATA%\gcloud`, not `~/.config/gcloud`.
- **Target:** `gcloud auth application-default login` as `josiah@pmikcmetro.com`;
  `gcloud config set project pmi-kc-kb-prod`; `gcloud config set billing/quota_project pmi-kc-kb-prod`;
  no JSON keys. Revoke the `cherrybridge.ai` account locally **only after** ADC is minted under
  pmikcmetro (revoking first can break local `applicationDefault()`). Verify via
  `npm run host:setup` / `npm run host:check` — note that script persists user env vars into the
  Windows registry, so stale `cherrybridge`/`pmikckb-test` values must be overwritten.

### (c) App runtime service account

- **Today:** `pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com`, attached to Cloud Run
  (no keys): `datastore.user`, `discoveryengine.user`, `aiplatform.user`, `firebaseauth.admin`,
  `iam.serviceAccountTokenCreator` (self). Local dev uses human ADC via `applicationDefault()`.
- **Target:** keep attached-SA model; always deploy with `--service-account=pmi-kc-kb-runtime@...`
  (never fall back to default compute SA). **Pin the role inventory in the repo** (today it
  lives only in the console) and add `storage.objectViewer` on
  `pmi-kc-kb-prod-sources-558870356522`. Verify the Discovery Engine service agent has Storage
  Object Viewer on the sources bucket (indexing fails silently otherwise). **Gmail send:** a
  dedicated `kb-automation@pmikcmetro.com`, scope `gmail.send` **only**, credentials in **Secret
  Manager** (never a key, never a personal account). Prefer SA **impersonation**
  (`--impersonate-service-account`) over raw human ADC for prod-equivalent local dev.

### (d) Firebase end-user auth (already at target)

- Firebase Google OAuth `signInWithPopup` with `hd` set before popup; `/api/auth/session`
  validates `email_verified===true`, `hd===ALLOWED_HD`, `sign_in_provider=google.com`,
  `auth_time` freshness; httpOnly/`secure`(prod)/`sameSite=lax`/8h session cookie verified with
  revocation check. Keep `LOCAL_DEMO_AUTH=false` and `ASK_DEMO_MODE=false` in production.
- **Demo-mode footgun (NODE_ENV fix LANDED 2026-06-20):** `lib/config/server.ts:113` computes
  `localDemoAuth = LOCAL_DEMO_AUTH && NODE_ENV !== "production"`. `scripts/deploy-demo-cloud-run.mjs`
  `readRuntimeEnv` now sets **`NODE_ENV: "production"` explicitly** (alongside `ASK_DEMO_MODE`/
  `LOCAL_DEMO_AUTH` false), so the prod demo-auth lockout no longer depends solely on the
  `LOCAL_DEMO_AUTH=false` override surviving every deploy. Remaining hardening: a **runtime startup
  assertion** that fails fast if a demo flag is truthy while `NODE_ENV==="production"` (§5.3).

### 2.1 Role-scoped sub-users — orthogonal space access

Firebase end-user authorization has two independent axes:

- `role` remains the monotonic capability tier (`Editor` → `Approver` → `Admin`). It answers what a
  user may do and is never widened by a space scope.
- `scopes` is an optional custom-claim array that narrows where the user may work. The initial
  assignable values are `renewals` and `maintenance`. `{ role: "Editor", scopes: ["maintenance"] }`
  is the maintenance-only staff principal; the role still denies approval actions.

A missing `scopes` claim is the backward-compatible ALL-spaces wildcard, so existing Dan/Josiah and
demo sessions need no claim migration. A present claim must be a non-empty array of known values;
empty or unknown arrays are rejected with 403 instead of silently locking the user out or fanning
access open. Page and API entry requires both the existing capability check and the matching space
scope. An authenticated scope miss redirects to that user's primary in-scope desk; an unauthenticated
request still goes to sign-in. Navigation, Spaces cards, and Console rows/process chips use the same
scope predicate, while server guards remain authoritative.

Admins may edit scopes through the in-app user-management surface. Scope changes preserve the target's
existing role claim, require a plain-English reason, stay inside `pmikcmetro.com`, and append an
`admin_scope_changes` audit record. "All spaces" clears the optional claim and restores wildcard
behavior. Creating a real user or assigning a live scope remains owner-run; this implementation does
not mint or alter any live account autonomously.

The hosted-domain boundary is unchanged in current code and remains binding for internal staff and
every PMI KC cloud/admin/runtime identity. R04 creates one narrow V1 exception: an Admin-invited external
Vendor receives a one-time password-setup link, completes email verification and TOTP MFA before ticket
detail, sees only tickets joined to their `vendor_id`, and connects the same verified Gmail/Google
Workspace address through server-side per-vendor OAuth. It never uses DWD or receives staff roles,
Spaces, cloud/admin/connector authority, shared/alias mailbox inference, or general inbox access. S22 is
Local green in code with separate session, TOTP UI, assigned-ticket joins, OAuth/token-vault seams, and
fake-provider acceptance; no live Vendor principal, Identity Platform setting, OAuth grant, or token
resource exists. Outside reporters continue using
the separate HMAC-token public maintenance intake; it is not the authenticated Vendor portal.

### 2.2 App-side Drive access — decide before any direct app Drive read

Distinct from connector (a) (which is _Claude's_ surface). For the app (c) reading Drive:

- **OAuth user consent** (connector / `kb-automation@`): per-account token; can't read domain
  files it isn't shared into. Right for the connector and Gmail-send, not a general solution.
- **Domain-Wide Delegation:** broad (reads every user's Drive) — contradicts least-privilege;
  treat as an exception requiring explicit owner approval.
- **Shared Drive + SA-as-member (RECOMMENDED):** put source files in a Shared Drive, add the
  runtime/reader SA as a content member, use the SA's own credentials — no DWD, no key, no
  impersonation. Cleanest fit for no-keys + least-privilege + single-domain.

The §3 "pre-copy Drive → GCS" path sidesteps live Drive auth for indexing; the moment the app
reads Drive directly, make this decision explicitly.

### 2.3 Per-user Gmail live access — separate from Firebase and notification sender

S19 (`docs/feature-suites/gmail-live-per-user.md`) uses the attached runtime service
identity to sign a keyless DWD JWT, then acts as the signed-in app user's own mailbox. The
Firebase session proves who is using the app; it does not itself grant Gmail. Conversely,
DWD's technical ability to impersonate domain users never grants a UI user cross-mailbox
access.

- The DWD `sub` is always the server-verified Firebase email. Request bodies and query
  strings cannot supply `userEmail`, `mailbox`, `subjectUser`, or any equivalent.
- `normalizeGmailSubject` enforces `pmikcmetro.com`; there is no rollout-only mailbox allowlist.
  The token mint independently allows exactly `gmail.readonly`, `gmail.compose`, `gmail.labels`,
  and `gmail.modify`; `mail.google.com` is denied.
- `gmail.readonly` is for bounded profile/thread/history/watch calls. The existing
  `gmail.compose` grant is send-capable; S19 safety is implemented by separate capability
  and Action Registry gates, authenticated-From enforcement, an exact-payload one-time
  confirmation, transactional idempotency, bodyless audit, and no ambiguous retry.
- Technical scope is not product authority. A route must validate a strict renewal or maintenance
  workflow context and the actor's matching space access before constructing a Gmail client. Reads
  target an already-linked opaque thread; the primary UI has no recent inbox or arbitrary search.
- Current read/edit/send authority is separate: S20 gives an internal Editor `sendEmail` only for an
  enabled Medium action that passed the strict workflow context, scope, artifact, exact preview, and
  one-time confirmation route. Consequential High actions require Admin and Admin may self-approve with
  a reason and current preview. Admin does not gain general/cross-mailbox browsing. Generic new-message
  sending remains disabled and permanently blocked by the S20 policy; S25/S26 add only
  workflow-specific initiation keys.
- Pub/Sub push uses a dedicated no-key service account and OIDC audience validation before
  body decoding. The Gmail API publisher is only
  `gmail-api-push@system.gserviceaccount.com`; notification email must be a server-verified
  domain mailbox with registered watch state. Push processing may match IDs against existing
  workflow links and create value-free attention; it does not fetch unrelated bodies, invoke AI,
  or send.
- Rollback: disable the workflow-facing Gmail registry keys,
  remove the four Gmail scopes from DWD client `104374162913177846911` as
  appropriate, disable the push subscription/topic, and redeploy the prior revision. No
  Cloud Scheduler is authorized.

The legacy `kb-automation@pmikcmetro.com` notification-sender design is a different application
identity and action lane. That sender is hard-disabled in current code; in-app notifications are
the default. Reintroducing email notification delivery requires a future human-confirmed draft or
other separately approved spec. Per-user DWD never authorizes notification campaigns.

## 3. Migration Plan — Ordered, Per Surface

**(a) Claude connector — DONE 2026-06-20.** Reconnected as `josiah@pmikcmetro.com`; sheet
readable. Remaining: revoke old personal grant at `myaccount.google.com/permissions`; this doc

- the discovery reference now record the connector identity as pmikcmetro.

**(b) Human gcloud/ADC:** `gcloud auth application-default login` as `josiah@pmikcmetro.com`
(ADC already present + pmikcmetro, verified via `npm run preflight:identity`); set project +
`billing/quota_project` to `pmi-kc-kb-prod`; overwrite
stale registry env vars via `npm run host:setup`; `npm run host:check`. The `cherrybridge.ai`
gcloud credential is **revoked locally (done 2026-06-20)**, after ADC was confirmed under pmikcmetro.

**(c) Runtime SA & ingestion:** confirm/trim `pmi-kc-kb-runtime@` roles to the least-privilege
list and **document bindings** in `environment-handoff.md`. Build the missing **Drive → Cloud
Storage** copy stage — note the GCS → Agent Search importer **already exists**
(`scripts/import-agent-search-documents.mjs`, consumes `--gcs-uri=gs://...`); only the Drive→GCS
half is missing, and `SPACE_DRIVE_FOLDER_IDS` is **misnamed** (it consumes `gs://` URIs, not
Drive folder IDs — rename/clarify). Move `kb-automation@` send creds to Secret Manager; scope
`gmail.send` only.

**(e) Firebase CLI:** log in as `josiah@pmikcmetro.com`, then deploy `firestore:rules` /
`firestore:indexes` via `npm exec firebase` — handoff lists this as the pending blocker.

**(f) Cloud Build:** audit the build SA used by `gcloud run deploy --source=.`; confirm it's a
`pmi-kc-kb-prod` machine identity with only build/push roles; record in `environment-handoff.md`.

**(d) Firebase end-user:** `npm run preflight:production` must pass (`ALLOWED_HD=pmikcmetro.com`,
demo flags false, `KB_APPROVAL_SENDER`/`KB_APPROVAL_RECIPIENTS` all `@pmikcmetro.com`); deploy
with `NODE_ENV=production` set explicitly + `--service-account=pmi-kc-kb-runtime@...`. **After
deploy, before declaring cutover done:** verify the live serving host is in Firebase Auth
authorized domains — a new service hash or `APP_BASE_URL` change breaks `signInWithPopup` with
`auth/unauthorized-domain` (the auth-loop class already fixed in commits `90d2714`, `aa4dd1f`).

**Resilience (all surfaces):** stand up a backup `pmikcmetro.com` admin/ops account with
equivalent gcloud/ADC/billing/firebase-CLI/Drive access to remove the single-person dependency
on `josiah@pmikcmetro.com`; record in a "Credential Delegation" section of `environment-handoff.md`.

## 4. Immediate Unblock — Read the Renewal Sheet (RESOLVED + interim options)

The sheet is now readable via the reconnected connector (option i, done). For reference, the
three options, each touching a **different** identity system:

- **(i) Reconnect Claude's Drive connector to pmikcmetro — system (a). DONE / RECOMMENDED.**
  Durable target; no personal account; lets Claude read Drive directly.
- **(ii) Share the sheet to the personal account — Drive ACL only. DISCOURAGED.** Puts a
  personal account back in the data path; security antipattern; use only as a last resort with
  an explicit revert.
- **(iii) Read via gcloud-ADC + Sheets API — system (b). Compliant interim.** Requires ADC minted
  **with the Sheets scope explicitly** (the plain `application-default login` omits it, which is
  why the earlier attempt hit Google's "This app is blocked" — and note your Workspace blocks the
  Cloud SDK client from sensitive Drive/Sheets scopes, so this path can itself be policy-blocked):
  ```
  gcloud auth application-default login \
    --scopes=openid,https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/spreadsheets.readonly
  ```
  Reuse the `GoogleAuth`/ADC pattern from `scripts/preflight-gcp-setup.mjs` (lines 182-186). Do
  **not** cite `scripts/check-live-cost.mjs` (it does no Google auth). Per `AGENTS.md`, real data
  may be read into memory but must stay out of git and out of outputs without approval.

## 5. Enforcement / Guardrails — so "blocked on access" never recurs silently

1. **`npm run preflight:identity` (implemented — `scripts/preflight-identity.mjs`, live-probing):** asserts
   `gcloud config get-value account` is `*@pmikcmetro.com`; asserts the **resolved ADC
   principal** (the email the ADC token resolves to, not just the quota project) is
   `*@pmikcmetro.com`; asserts `GOOGLE_APPLICATION_CREDENTIALS` unset; prints, for all **six**
   systems, the resolved identity + Claude-connector status as a manual checklist line — so a
   missing login is a loud line, not a silent "not found." Keep it separate from the pure
   `validateProductionCutoverConfig` (which must stay import-safe/testable — no subprocess calls).
2. **Extend `scripts/preflight-production-cutover.mjs` with an `assertIdentity` positive
   allowlist:** require every account-shaped value to match `*@pmikcmetro.com` or the runtime SA
   email (mirroring the existing `assertPmikcmetroEmailList`); reject `cherrybridge.ai` (extend
   `DEMO_VALUE_PATTERNS`, which already covers `pmikckb-test`/`pmi-kc-kb-demo`/`800237451321`). A
   `gmail.com` denylist alone misses `googlemail.com`, other personal domains, a personal
   `client_email` in a key JSON, and a personal ADC account/quota.
3. **Runtime startup demo-flag guard (not `next.config.ts` alone):** fail-fast if
   `ASK_DEMO_MODE`/`LOCAL_DEMO_AUTH` is truthy in production **and** assert
   `NODE_ENV==="production"` at runtime. Also set `NODE_ENV=production` explicitly in
   `readRuntimeEnv` so the demo lockout no longer depends solely on the `LOCAL_DEMO_AUTH=false`
   override surviving every deploy. (`.env.example` defaults both demo flags to `true`.)
4. **AGENTS.md "Identity Rules" section** stating the six systems are separate and do not
   cascade, all must be `pmikcmetro.com` (human/connector/firebase-CLI) or a `pmi-kc-kb-prod`
   service identity (runtime/build), `gcloud auth` does not change the Claude connector, the
   personal account never appears, and "blocked on access" is raised as a blocker — with a
   `CLAUDE.md` pointer. (Added alongside this doc.)
5. **Sensitive-pointer hygiene (corrected):** the local client docs and live sheet URLs live in
   `docs/client_docs/` and the raw transcript in `docs/context_and_calls/` — **both are
   gitignored**, so they are correctly out of version control (the earlier "URLs committed to
   git" concern was a false alarm; `git ls-files` shows nothing tracked there). Residual risk is
   local-disk only. Optionally redact the public Firebase web app ID
   (`1:558870356522:web:...`, low sensitivity) from tracked docs, and add a
   `docs/credential-rotation-policy.md` with a "Last Rotated" field per secret class — especially
   relevant given §finding below.

> **SECURITY FINDING (real, still standing): plaintext credentials inside the operational
> spreadsheet.** The sheet contains tabs with plaintext **WiFi network names + passwords** and
> **platform logins / passwords / PINs** (TTLock, thermostats, Section 8 portal, Zillow, Gmail,
> HOA/health-dept portals, office WiFi). This is independent of git (the sheet is in Workspace).
> Two actions: (1) any connector ingesting the sheet must **hard-exclude** those tabs and never
> echo them; (2) recommend to Dan that these move to a password manager / Secret Manager out of a
> shared sheet. Tracked in the spreadsheet map and discovery reference.

## 6. Risks & Rollback (summary)

- **Conflating the six identity systems** → silent block. Mitigation: §5.1 probe + §5.4 rule.
- **Demo-mode lockout depends on an env override, not `NODE_ENV`** → a manual deploy could
  re-enable demo auth in prod. Mitigation: §5.3.
- **Two-org bleed** (`cherrybridge.ai`/`pmikckb-test` in registry or stale `.env.local` shadowing)
  → wrong project. Mitigation: overwrite registry via `host:setup`; `DEMO_VALUE_PATTERNS` reject.
- **Runtime SA over/under-privilege** (bindings only in console). Mitigation: pin in docs; verify
  via `preflight:gcp --live`.
- **Cloud Build identity unaudited.** Mitigation: §3 (f) audit + record.
- **Ingestion half-missing** (Drive→GCS copy; misnamed env var). Mitigation: gate real imports
  behind the `AGENTS.md` approval rule; record approved file list in `status.md`.
- **Single-person dependency** on `josiah@pmikcmetro.com`. Mitigation: backup ops account.
- **Authorized-domain breakage on redeploy** → `signInWithPopup` fails. Mitigation: post-deploy
  domain check (safe failure: "users can't sign in," no data exposure).
- **Write-back corruption** (future approval-gated Sheets writes): no deterministic cell map /
  read-after-write yet. Mitigation: keep write-back gated; phase-1 read+reconcile+flag only.

**Rollback:** (a) reconnect prior connector account (reversible, no code). (b) `gcloud auth login`
restores a prior account; ADC re-mintable (document the `--scopes=...` form). (c) Cloud Run keeps
prior revisions — `gcloud run services update-traffic --to-revisions=PRIOR=100`; IAM reversible.
(d) Firebase auth changes are env/config and revert by redeploying the prior revision (failure
mode "users can't sign in" is safe). (e) `firebase login`/`firebase use` to restore; rules/indexes
roll back via the prior committed files. (f) revert build-SA IAM; prior images remain. **Hard cost
stop:** the $10 budget alert is a warning, not a cap — treat unexpected spend as a halt signal.

## Immediate next actions for Josiah

1. **Revoke the old Claude grant** from the personal account at `myaccount.google.com/permissions`
   (connector already reconnected to pmikcmetro — done).
2. **Confirm ADC + finish cleanup:** ADC is present + pmikcmetro (verified via
   `npm run preflight:identity`); set project + quota project to `pmi-kc-kb-prod` and run
   `npm run host:setup` / `host:check`. The `cherrybridge.ai` gcloud credential is already
   **revoked (2026-06-20)**.
3. **Demo-mode footgun — NODE_ENV part DONE:** `readRuntimeEnv` now sets `NODE_ENV=production`
   explicitly. Remaining: add a runtime demo-flag startup assertion (fail fast if a demo flag is
   truthy while `NODE_ENV==="production"`).
4. **Log in the Firebase CLI** as pmikcmetro and deploy `firestore:rules`/`firestore:indexes`
   (pending blocker).
5. **Move the spreadsheet's plaintext credentials** out of the shared sheet into a password
   manager / Secret Manager (security finding above).
6. **After the next deploy:** confirm the live host is in Firebase Auth authorized domains.
7. **Pin the runtime SA role inventory + audit the Cloud Build SA** in `environment-handoff.md`;
   stand up a backup `pmikcmetro.com` ops account.
8. **Optional hardening I can implement:** the `preflight:identity` probe and the positive-allowlist
   `assertIdentity` extension to the production preflight.
