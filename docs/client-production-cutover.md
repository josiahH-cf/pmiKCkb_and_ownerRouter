# Client Production Cutover Runbook

> Current governance note, 2026-06-03: this is the PMI KC KB production rebuild
> runbook. Cross-product integration and cutover planning for PMI KC KB, Lease Renewal
> Agent, and Gmail Inbox 0 lives in `docs/integration-cutover-plan.md`.

This is the clean PMI KC-owned environment path. Do not copy demo Firestore exports,
demo OAuth clients, demo service accounts, or demo Cloud Storage buckets into
production.

When an agent or operator says "cutover to the main app," treat that as this gated
sequence: confirm local readiness, run production preflight against reviewed
non-demo values, get explicit deploy/client-environment approval, deploy, assign roles,
and complete the production smoke checklist. It does not mean seeding demo data,
touching Gmail, importing live sources, or changing client resources without the
specific approval gate named in this runbook.

## 1. Confirm Local Readiness

Run from the repo root:

```bash
npm install
npm run host:check
npm run format:check
npm run typecheck
npm test
npm run test:firestore
npm run verify
```

If these checks pass and production-specific values are still missing, record the repo
as migration-ready but client-blocked in `docs/status.md` and
`docs/environment-handoff.md`. Do not keep adding local product features as a substitute
for approved client-owned setup, production source approval, migration, or cutover.

If `host:check` fails on Windows, repair local Google tooling with:

```bash
npm run host:setup -- -ProjectId <client-project-id>
```

## 1b. Dry-Run Readiness Rehearsal (No Cloud Cost)

Before the client environment exists, rehearse the whole cutover-readiness chain against
synthetic golden fixtures:

```bash
npm run cutover:dry-run            # human-readable gate summary
npm run cutover:dry-run -- --json  # machine-readable result
```

This runs the same `buildCutoverReport` that `npm run cutover:report` runs, but feeds it the
fake `tests/fixtures/cutover/golden-production.env.fixture` and
`tests/fixtures/cutover/golden-production-source-manifest.json` (every value is an obvious
`sample-kb-fixture-*` placeholder). It is pure computation: no `gcloud`, no Application Default
Credentials, no network, and no spend against the $10 cap. A green run prints:

```text
  [ok] production env preflight
  [ok] source corpus readiness
  [ok] deploy command preview
  [ok] GCP infra ready (only the approval-gated notification send remains)
  corpus plan: 3 upload / 3 import / 3 seed commands
```

Expected residual (read this before §6): the aggregate `cutover:report` `readiness.ok` stays
`false` by design even on a perfect config. A production-valid env requires
`KB_APPROVAL_NOTIFICATIONS_ENABLED=true`, but the budget guard inside the report evaluates
without `--allow-notifications`, so it emits exactly one blocker —
`gcp: KB approval Gmail notifications are enabled (...)`. Live Gmail sends are externally visible
and stay approval-gated. The dry-run treats that single blocker as the documented, expected
residual and confirms every OTHER gate is green; it fails loudly if any additional blocker
appears. Do not "fix" it by routing `--allow-notifications` through the report — clearing it is a
real send approval, not a dry-run step.

When the real client values arrive, point `cutover:report` at the live `--env-file` and
`--manifest` (see §5/§6) and confirm the same shape: every section green with the lone
notification-send blocker as the only residual.

## 2. Create The Client Google Environment

Create or select the PMI KC-owned GCP/Firebase project, then set local env values in an
ignored file such as `.env.production.local`:

```dotenv
ALLOWED_HD=pmikcmetro.com
ASK_DEMO_MODE=false
LOCAL_DEMO_AUTH=false
GCP_PROJECT_ID=<client-project-id>
FIREBASE_PROJECT_ID=<client-project-id>
FIRESTORE_DATABASE_ID=(default)
VERTEX_AI_LOCATION=us-central1
VERTEX_SEARCH_LOCATION=us
GEMINI_MODEL_ANSWER=gemini-2.5-flash
GEMINI_MODEL_CLASSIFY=gemini-2.5-flash
NEXT_PUBLIC_FIREBASE_API_KEY=<from-client-firebase-web-app>
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<client-project-id>.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<client-project-id>
NEXT_PUBLIC_FIREBASE_APP_ID=<from-client-firebase-web-app>
SPACE_DRIVE_FOLDER_IDS={}
SPACE_VERTEX_DATA_STORE_IDS={}
MAINTENANCE_PHOTO_DRIVE_FOLDER_ID=<maintenance-photo-drive-folder-id>
APP_BASE_URL=<deployed-production-url>
KB_APPROVAL_NOTIFICATIONS_ENABLED=true
KB_APPROVAL_SENDER=<kb-automation@pmikcmetro.com>
KB_APPROVAL_RECIPIENTS=<dan-pmi-kc-account@pmikcmetro.com>,<josiah-pmi-kc-account@pmikcmetro.com>
```

Most repo scripts read process environment variables and ignored `.env.local`; only
commands that explicitly accept `--env-file` read `.env.production.local` directly.
For an unattended cutover, copy the reviewed production values into `.env.local` for
the active session or load them into the shell before running seed/deploy commands.
Keep `.env.production.local` as the reviewed preflight input if you want a separate
handoff file.

Print the full converge plan (API enablement, Firebase setup, Firestore create/deploy
commands) and the budget posture without touching the project:

```bash
npm run preflight:gcp -- --project=<client-project-id>
```

With Application Default Credentials available, verify the live project state
read-only (enabled APIs, Firestore database mode, Firebase project) before and after
running setup commands:

```bash
npm run preflight:gcp -- --project=<client-project-id> --live --json
```

Enable required APIs in the client project:

```bash
gcloud services enable aiplatform.googleapis.com discoveryengine.googleapis.com storage.googleapis.com firestore.googleapis.com datastore.googleapis.com firebase.googleapis.com identitytoolkit.googleapis.com securetoken.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com run.googleapis.com iam.googleapis.com iamcredentials.googleapis.com logging.googleapis.com monitoring.googleapis.com cloudresourcemanager.googleapis.com serviceusage.googleapis.com cloudbilling.googleapis.com --project=<client-project-id>
```

Attach Firebase and create/reuse the Firebase Web app:

```bash
npm run firebase:setup -- --project=<client-project-id> --web-app-name="PMI KC KB Production Web"
```

Enable Firebase Auth / Identity Platform Google sign-in:

```bash
npm run firebase:setup-auth -- --project=<client-project-id> --authorized-domain=<production-host>
```

If Google requires console consent, complete the Firebase/Auth console gate once, then
rerun the same command.

## 3. Create Firestore And Seed KB Records

Create Firestore Native mode, deploy rules/indexes, and seed non-secret KB records:

```bash
gcloud firestore databases create --database='(default)' --location=us-central1 --type=firestore-native --project=<client-project-id> --quiet
npm exec firebase -- deploy --only firestore:rules,firestore:indexes --project <client-project-id>
npm run seed:spaces -- --dry-run
npm run seed:spaces
npm run seed:launch-skeletons -- --dry-run
```

`seed:spaces` is idempotent: `--dry-run` prints the exact records without writing,
reruns skip existing space documents, and `--force` updates existing documents while
preserving their original `created_at`. Rollback for seeded spaces is deleting the
listed `spaces/<space-id>` documents (they are app-owned metadata, not client data).

Only omit `--dry-run` after confirming the active project and ADC target are the client
project:

```bash
npm run seed:launch-skeletons
```

Do not run `npm run seed:demo` in client production.

## 4. Prepare Production Sources

Use Cloud Storage `.txt` sources and Agent Search data stores as the default production
path unless Drive service-account retrieval is intentionally revisited.

For the Lease Renewal source-of-truth flow, the first automatic indexed-source
candidate to test is Cloud Storage plus Agent Search periodic ingestion. Drive remains
the team collaboration folder unless setup proves a stronger client-accessible source.
Assume the first Drive-to-Cloud-Storage handoff is the simplest low-cost copy automation
that works for users. Cloud costs are pass-through, so keep the first test small and do
not add extra services, duplicate stores, or large indexed corpora without an explicit
need.

The Lease Renewal source folder may contain all useful source file types, not only
Docs/text/PDF. For the first indexed test, map each useful type to direct ingestion,
conversion/summary into an indexed format, or a visible skip reason.

Keep the Lease Renewal source folder clean for production cutover. Non-sources-of-truth
should be moved out of the source folder rather than left there for the copy or indexing
path to skip. The non-source, reference, or archive destination remains TBD.

1. Create one private production source bucket or separate buckets per policy.
2. Grant the Discovery Engine service agent `roles/storage.objectViewer` on the source
   bucket.
3. Copy the manifest template to an ignored working file:

```powershell
New-Item -ItemType Directory -Force -Path temp
Copy-Item docs/source-corpus/client-production-source-manifest.template.json temp/client-production-source-manifest.json
```

4. Replace every `<client-source-bucket>`, source path, `data_store_id`, and approval
   status with approved PMI KC source details. Leave a Space out of the manifest until
   an approved source exists.
5. Run a dry plan:

```bash
npm run corpus:plan -- --manifest=temp/client-production-source-manifest.json --project=<client-project-id> --location=us --dry-run
```

Review the printed `readiness` object before continuing. `readiness.ok` must be
`true`, `readiness.blockers` must be empty, and any `readiness.warnings` must be
resolved or explicitly accepted in the cutover notes. The template is expected to
report blockers until every placeholder bucket/source path is replaced and every
source is marked `Approved`.

6. After human source approval, create `.txt` staging copies and review the printed
   upload/import/metadata commands:

```bash
npm run corpus:plan -- --manifest=temp/client-production-source-manifest.json --project=<client-project-id> --location=us --write-temp
```

7. Upload the generated `.txt` copies, import them into Agent Search, and seed
   `sources_meta` using the printed commands. For the Lease Renewal continuous-source
   test, separately validate whether the team-editable Drive source folder can feed
   Cloud Storage plus Agent Search periodic ingestion without manual refresh.

Never upload or commit raw `docs/context_and_calls/` material. Production sources must
be approved, client-safe summaries or approved client-owned operating documents.

## 5. Configure Production Environment Maps

After source prefixes and data stores exist, update the production env file:

```dotenv
SPACE_DRIVE_FOLDER_IDS={"lease-renewals":"gs://<client-source-bucket>/lease-renewals/"}
SPACE_VERTEX_DATA_STORE_IDS={"lease-renewals":"kb-lease-renewals-txt"}
MAINTENANCE_PHOTO_DRIVE_FOLDER_ID=<maintenance-photo-drive-folder-id>
```

Use one map entry per approved production Space. Leave unapproved Spaces as launch
skeletons until source material exists.

`MAINTENANCE_PHOTO_DRIVE_FOLDER_ID` is separate from the KB-source maps above: it is the
in-boundary Drive folder the maintenance photo store uploads into (a write target, not an
indexed corpus), created by `npm run maintenance:ensure-folder -- --live [--shared-drive <id>]`.
Production forces the Drive image store, so this must be a real Drive folder id (never a
`gs://` prefix). The deploy forwards it to Cloud Run; do not co-locate it in
`SPACE_DRIVE_FOLDER_IDS` (that map cross-links 1:1 with a Vertex data store, which a
photo-only folder does not need).

### Live-connection config (dev↔prod parity)

The deployed service must reach the same live connections as local — the RentVine read and
the renewal-sheet read via keyless domain-wide delegation — so a green cutover guarantees prod
connects instead of silently degrading to "not connected". Set the non-secret anchors in the
production env file:

```dotenv
RENTVINE_API_BASE_URL=https://pmikcmetro.rentvine.com/api/manager
RENEWAL_SHEET_ID=<renewal-sheet-id>
SHEETS_IMPERSONATE_SA=<reader>@<client-project-id>.iam.gserviceaccount.com
SHEETS_DWD_SUBJECT=<reader>@pmikcmetro.com
```

The RentVine **api key and secret are delivered via Secret Manager**, never as plaintext env.
Before the redeploy, create the two secrets and grant the runtime service account access:

```bash
printf %s "$RENTVINE_API_KEY"    | gcloud secrets create RENTVINE_API_KEY    --data-file=- --project=<client-project-id>
printf %s "$RENTVINE_API_SECRET" | gcloud secrets create RENTVINE_API_SECRET --data-file=- --project=<client-project-id>
gcloud secrets add-iam-policy-binding RENTVINE_API_KEY    --member="serviceAccount:<runtime-service-account-email>" --role="roles/secretmanager.secretAccessor" --project=<client-project-id>
gcloud secrets add-iam-policy-binding RENTVINE_API_SECRET --member="serviceAccount:<runtime-service-account-email>" --role="roles/secretmanager.secretAccessor" --project=<client-project-id>
```

The deploy wires them via `--set-secrets` automatically when `RENTVINE_API_BASE_URL` is set.
The Secret Manager secret id defaults to the env var name; override with `RENTVINE_API_KEY_SECRET_ID`
/ `RENTVINE_API_SECRET_SECRET_ID` (and `*_SECRET_VERSION`, default `latest`) if the secrets are
named differently. To deploy without RentVine, leave `RENTVINE_API_BASE_URL` unset.

Run the production preflight:

```bash
npm run preflight:production -- --env-file=.env.production.local
```

The preflight must pass before deploy. It rejects demo project IDs, demo buckets,
unreplaced placeholders, non-HTTPS or local `APP_BASE_URL`, `ASK_DEMO_MODE=true`,
`LOCAL_DEMO_AUTH=true`, missing source/data-store maps, missing `APP_BASE_URL`, missing
Firebase public config, a missing or `gs://`-typed maintenance photo Drive folder, and — for
dev↔prod parity — a missing/wrong-tenant `RENTVINE_API_BASE_URL`, missing `RENEWAL_SHEET_ID`,
a non-service-account `SHEETS_IMPERSONATE_SA`, or a non-`pmikcmetro.com` `SHEETS_DWD_SUBJECT`.

## 6. Deploy Cloud Run

Before any deploy, generate the consolidated machine-readable cutover report and confirm
every section is green with only the expected notification-send residual described in §1b
(it composes the GCP setup plan, production env preflight, budget posture, corpus
readiness, deploy command preview, rollback plan, and the §7 smoke checklist; blockers are
prefixed with their failing section). For a compliant production env
(`KB_APPROVAL_NOTIFICATIONS_ENABLED=true`) the budget guard holds back the approval-gated
Gmail send, so that one `gcp:` blocker is expected; the live send is approved separately and
is not a deploy blocker:

```bash
npm run cutover:report -- --manifest=temp/client-production-source-manifest.json --env-file=.env.production.local --json
```

The Admin migration console at `/admin/migration` mirrors this report read-only in-app
(environment, production env, corpus-template, budget, Action Registry, and notification
posture with owner-side blocker labeling); the deploy gate above still requires the CLI
report against the real manifest and env file.

Create or choose the runtime service account, then grant only the roles needed by the
KB runtime:

- `roles/datastore.user`
- `roles/discoveryengine.user`
- `roles/aiplatform.user`
- `roles/firebaseauth.admin` (Identity Platform session-cookie create + revocation lookup)
- `roles/iam.serviceAccountTokenCreator` on the runtime SA itself (sign session cookies via ADC
  `signBlob`; required when the runtime SA has no downloadable key)
- `roles/secretmanager.secretAccessor` on the `RENTVINE_API_KEY` + `RENTVINE_API_SECRET` secrets
  (the deploy wires them via `--set-secrets`; see the live-connection config in §5)
- `roles/iam.serviceAccountTokenCreator` on the DWD **reader** SA (`SHEETS_IMPERSONATE_SA`, e.g.
  `lease-renewal-reader@<project>.iam.gserviceaccount.com`) — REQUIRED for the live renewal review's keyless
  Sheet read: the runtime SA impersonates the reader SA via `iamcredentials.signJwt`. This is a SEPARATE grant
  from the self-`signBlob` binding above and from `secretAccessor`; without it the deployed live review fails
  with `auth_error` even though RentVine + the env are correct (verified live 2026-07-01 — a local reader works
  because the human ADC already holds Token Creator on the reader SA; the runtime SA needs the same in prod):
  `gcloud iam service-accounts add-iam-policy-binding <SHEETS_IMPERSONATE_SA> --member="serviceAccount:<runtime-sa>" --role="roles/iam.serviceAccountTokenCreator" --project=<project>`
- Gmail send-only authority for `kb-automation@pmikcmetro.com`
- Grant each launch operator the **Admin** role AFTER their first sign-in: `npm run firebase:set-role --
  --email=<user@pmikcmetro.com> --role=Admin` (targets `FIREBASE_PROJECT_ID`/`GCP_PROJECT_ID`). A Firebase user
  with no `role` custom claim defaults to **Editor** (`lib/auth/session.ts` `readFirebaseRole`), so Admin-gated
  surfaces (the live renewal review, the write-back approval decisions) redirect to home until the claim is set.
  Custom claims only refresh on a fresh sign-in, so the operator must sign out + back in after the grant.

Deploy with production flags:

```bash
npm run deploy -- --project=<client-project-id> --service=pmi-kc-kb --region=us-central1 --search-location=us --budget-confirmed --allow-multiple-spaces --service-account=<runtime-service-account-email>
```

Add the generated Cloud Run host or custom production domain to Firebase Auth
authorized domains:

```bash
npm run firebase:setup-auth -- --project=<client-project-id> --authorized-domain=<production-host>
```

Set `APP_BASE_URL` to the final deployed URL and rerun:

```bash
npm run preflight:production -- --env-file=.env.production.local
```

## 7. Assign Roles And Smoke Production

After the first allowed-domain user signs in, assign roles from a trusted Admin SDK
context:

```bash
npm run firebase:set-role -- --email=<admin@pmikcmetro.com> --role=Admin
```

Production smoke checklist:

- Allowed-domain sign-in reaches `/ask`.
- Wrong-domain sign-in is rejected.
- Admin page opens for the Admin account.
- At least one approved Space opens and shows seeded records.
- Ask returns a cited `Verified Source` answer from an approved production source.
- Ask returns `No Reliable Source Found` for an unsupported question.
- User can save or suggest editable records but cannot approve.
- Admin can approve, return, assign, snooze, and disable eligible queue items.
- Admin can run Approval Queue bulk actions against real or explicitly approved test
  queue items, with per-item skipped reasons visible. Do not seed demo queue records in
  production just to test this path.
- The app does not write to RentVine, LeadSimple, DotLoop, QuickBooks, Boom, Sheets,
  Gmail inboxes, Drive folders, or Gmail Inbox 0/legacy Owner Router source artifacts.

## Rollback

`npm run cutover:report -- --json` emits the ordered rollback plan with concrete
commands when a manifest is provided: (1) delete or re-route the Cloud Run service,
(2) delete imported Agent Search data stores (the delete script refuses stores still
mapped in `SPACE_VERTEX_DATA_STORE_IDS`), (3) remove uploaded `.txt` staging copies
from Cloud Storage, (4) delete seeded app-owned Firestore metadata (`sources_meta`
entries and `spaces/<id>` documents), and (5) redeploy the previous
`firestore.rules`/`firestore.indexes.json` from git history if they changed. Original
client sources are never modified by the pipeline, so rollback never touches them.

## Production Blockers

Production cannot be declared complete until:

- PMI KC-approved production source files are uploaded/imported and seeded in
  `sources_meta`.
- The source/data-store maps point only at client-owned resources.
- `kb-automation@pmikcmetro.com` and Dan/Josiah notification recipients are configured.
- Gmail Inbox 0 source package exists, with any reused legacy Owner Router artifacts
  renamed or clearly mapped, and is indexed read-only by the KB Owner Email Space for
  final owner-email verification.
- Final smoke results and any exceptions are recorded in `docs/status.md`.
