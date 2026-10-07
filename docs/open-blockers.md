# Unblock packet

Last reconciled: 2026-10-06 (Dotloop registered-client/Secret Manager match, live Connect refusal and current runtime readback; finalized intake 050–054; other holds retain their recorded evidence).

This is the one record of what the application waits on outside the code, and exactly how to
clear each item. Every hold blocks only the effect named in its row. No hold blocks development,
tests, merges, releases or another suite, so unattended runs do not read this file unless their task
exercises a listed effect or the owner reports a step done. When the owner reports a step, the run
performs that row's follow-up, records the readback here and removes the row. Never invent a
substitute value, identifier, credential or human verdict to clear a hold.

## Holds at a glance

| Id        | Blocks only                                                             | Owner step                                                                                                                        | Then the runner                                                                                                                  |
| --------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| B-AUTH2   | Unattended local sessions longer than about 16 hours                    | A4: session exception, then re-enroll WSL                                                                                         | Runs the fresh-shell CLI/ADC probe to 25 hours and records the result                                                            |
| B-MNT1    | Preapproval-based maintenance routing (S108)                            | A3: preview and confirm the RentVine import                                                                                       | Reads back the recorded preapprovals and their effective date                                                                    |
| B-S100    | The resident-reply draft key, so S100 and then S36 completion           | A2: ticket, link work order 1756, one sync                                                                                        | Verifies the resident mapping read-only, then runs the bounded draft proof (Q3)                                                  |
| B-TIMING  | Approved 30-day notice classifications (they read Cannot determine)     | A5: record the decided basis in Admin                                                                                             | Reads back the saved basis version                                                                                               |
| B-DL1     | Dotloop deployed credential binding (S106 readiness, S34 provider work) | Registered client is visible and matches the stored id; confirm the final consent when the app setup is delivered                 | All four runtime variables are absent; bind/read back through the implementation release process and repair the Connect redirect |
| B-DL2     | The Dotloop connection and its selected resources                       | After B-DL1: connect and select resources                                                                                         | Reads back profile/template readiness; both Dotloop keys stay closed                                                             |
| B-DL3     | Approved form content/maps and rules for the selected lease packet      | Configure approved versions, applicability, signers and fee policy through the S66/S130 controls; independent of connection setup | Eight reference types plus retained city/HOA support; only required/applicable missing inputs hold the affected output           |
| B-BROWSER | Release assurance, only when Google signs the Admin profile out         | A6: sign the Admin profile back in                                                                                                | Recollects prerequisites and continues the release                                                                               |
| B-HUMAN   | Human verdicts and real-case accuracy claims only                       | E2: observed sessions and real material                                                                                           | Records each verdict with its evidence; nothing is inferred from tests                                                           |

## Owner decisions

Recorded on 2026-10-02 (`accept all recommendations`):

- **Q1 = A (B-AUTH2).** Exempt only the Google Cloud CLI and ADC clients, for
  `josiah@pmikcmetro.com` only: an account-scoped Google Cloud session-control exception, then a
  fresh WSL enrollment (A4). Google's default Cloud session length is 16 hours and admins can set
  1–24 hours, so only the trusted-app exemption lets the 25-hour proof pass.
- **Q2 = A (B-TIMING, S125).** The 30-day notice counts to the contractual lease-end date, in
  calendar days from the notice date (target minus notice), with a 30-day threshold that exactly 30
  meets. An Admin records it (A5); the runner never records policy.
- **Q3 = A (B-S100).** After A2, the runner verifies the synchronized resident mapping and email
  read-only, releases the bounded proof window for `gmail.maintenance_resident_reply.draft_create`,
  the owner confirms one unsent reply draft in the app, and the runner closes the window and reads
  it back. Final activation waits until the owner approves that draft.
- **Q4 = A (repository).** The S152–S167 intake that another session authored uncommitted in the
  Windows checkout was parked unchanged as `ac2a12bc` (20 files) and, by owner direction later the
  same day, merged with `main` as written. The owner's execution prompt of 2026-10-02 started it;
  it is implemented and awaits one cumulative release.

Earlier decisions stand: RentVine's per-property maintenance limits are the S108 source (B-MNT1,
2026-10-01); RentVine work order 101756 (API id 1756) is the S100 target; B-MNT2 closed with
Vendoroo's agent writing into RentVine and no direct connector.

## Owner steps

**A1. Dotloop client registration and runtime binding (B-DL1).** API access for
`integrations@pmikcmetro.com` was enabled in Dotloop's 2026-10-01 correspondence. The owner supplied
an existing Client ID and Secret; their retrieval and Secret Manager migration were verified on
2026-10-06. Creating another account or manually delivering the secret is no longer an owner step.

The owner now reports the client registered. The Dotloop Clients screen shows the existing company
client and account/profile/loop/contact/template permission categories; its id exactly matches the
stored Client ID. The screen does not expose the registered redirect or provider-granted token
scopes. Confirm whether API Support completed its requested verification. The intended callback is
`https://pmi-kc-app-kq6wuvpiva-uc.a.run.app/api/connections/dotloop/callback`.

Runner: use the stored credentials through the existing reviewed production configuration in a
separately authorized release, then read back the actual runtime. Current Cloud Run readback still
has none of the four Dotloop credential/vault variables configured. Storage alone does not close
runtime readiness or establish a connected account. Live verification is deferred to a separate
flow by the owner's 2026-10-06 direction.

**A2. S100 ticket, link and sync (B-S100).** In the app's Maintenance area, signed in as yourself:

1. Create the app ticket for work order 101756, with its verified unit.
2. Choose **Link an existing work order** (not Create work order), enter id `1756` and confirm the
   preview.
3. Run **Sync resident messages** once and confirm its warning. The provider marks the retrieved
   manager messages read and cannot undo that.

Done when the ticket shows work order 1756 linked and one completed sync.

Readback 2026-10-02 (after A2 was reported done): production holds no ticket for work order
101756, no link to work order 1756 and no synchronized message. Its maintenance tickets, links,
prepared actions, activity and chat records are unchanged since 2026-09-02, and no execution was
recorded that day. Redo the three steps on the production app
(`https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`) signed in as `josiah@pmikcmetro.com`, completing
each preview's confirmation. A local or demo app writes elsewhere and does not count.

**A3. S108 preapproval import (B-MNT1).** Maintenance → Import from RentVine: **Preview RentVine
maintenance limits**, read the "Left for manual review" notes, set **Effective from** (today unless
you want a later date), then **Review the import** → **Record these preapprovals**. The preview
covered 30 of 121 active properties on 2026-10-01; the records are app-owned and correctable.

**A4. Google Cloud session exception and re-enrollment (B-AUTH2, Q1 = A).** As a super admin in
admin.google.com:

1. Directory → Organizational units: create a child of your current unit (for example "Release
   automation") and move `josiah@pmikcmetro.com` into it.
2. Security → Access and data control → API controls → Manage third-party app access: mark
   **Google Cloud SDK** (`32555940559.apps.googleusercontent.com`) and **Google Auth Library**
   (`764086051850-6qr4p6gpi6hn506pt8ejuq83di341hur.apps.googleusercontent.com`) Trusted for that unit.
3. Security → Access and data control → Google Cloud session control: select that unit, choose
   Override, keep Require reauthentication, tick **Exempt Trusted apps**, save. Changes usually
   apply within minutes and can take up to 24 hours.
4. When no release is running, re-enroll in WSL:

```bash
cd ~/pmi-kc-work/main && npm run auth:enroll:wsl -- --attended --account=josiah@pmikcmetro.com
```

Done when the command ends READY for WSL CLI and ADC. The Cloud console in a browser still asks
for sign-in on its own schedule.

Readback 2026-10-02 18:17Z: the WSL CLI refresh failed on Google's reauthentication wall while ADC
still refreshed. A deploy needs both, so the next release waits for this command (step 4) even
before the session exception exists.

Readback 2026-10-02 19:43Z: after the owner signed in again, an unattended `auth:ensure` returned
READY with verified token refresh for the WSL CLI and ADC, so releases proceed. The 25-hour
fresh-shell probe follows once the session exception (steps 1–3) is in place.

**A5. Record the notice timing basis (B-TIMING, Q2 = A).** Admin → notice timing basis: target
**contractual lease-end date**, counting rule calendar days (target minus notice, exactly the
threshold satisfies it), threshold **30**, and a review note naming who confirmed it and where.
Save. Until then every notice timing reads Cannot determine.

**A6. Sign the release Admin profile back in (B-BROWSER).** Needed only when a release
prerequisite reports `admin_browser: blocked` because Google signed the profile out. In WSL:

```bash
cd ~/pmi-kc-work/main && npm run auth:ensure -- --need=canary --origins=https://pmi-kc-app-kq6wuvpiva-uc.a.run.app --admin-profile=/home/josiah/pmi-assurance/owner-admin --admin-email=josiah@pmikcmetro.com
```

A Chrome window opens for the sign-in. Done when the canary line reads ok for admin and the
command ends READY. The runner never types a password, code or passkey.

Readback 2026-10-02 (after A6 was reported done): the unattended, headless canary check reads the
Admin profile signed in as Admin on the canonical origin (existing session); READY.

**A7. Phone same-tab sign-in redirect (optional, S165).** Only if staff report that the Google
pop-up cannot open on a phone or in-app browser. In the Google Cloud console for
`pmi-kc-kb-prod`: APIs & Services, Credentials, the OAuth 2.0 web client that Firebase Auth's
Google provider uses, Authorized redirect URIs, add
`https://pmi-kc-app-kq6wuvpiva-uc.a.run.app/__/auth/handler`. Then tell the runner, who sets
`NEXT_PUBLIC_FIREBASE_SAME_ORIGIN_AUTH_HOST=pmi-kc-app-kq6wuvpiva-uc.a.run.app` in the reviewed
production env and releases. Order matters: the key before the URI breaks sign-in on that host.
Until then phones use the pop-up, which the S152–S167 release already repairs.

## External and waiting

**E1. Dotloop stored client and remaining setup (B-DL1 → B-DL2 → B-DL3).**

1. Confirm the existing client's callback matches the canonical callback in A1 and the requested
   scopes are `account:read`, `profile:read`, `loop:read`, `loop:write` and `template:read`.
2. Confirm Dotloop API Support has verified the client; reply on its existing thread if still needed.
   This is an owner step; no support message has been sent by the runner.
3. Credential storage is complete, as recorded below. Additional test clients are outside this
   cycle; live testing is deferred to a separate owner-directed flow.
4. In a separately authorized release, bind the non-secret client id and verified redirect in the
   reviewed production env file, the client-secret Secret Manager reference, and the connector
   vault project. Read back the deployed configuration and named readiness failures.
5. During the separate connection flow, the owner completes consent and selects a verified,
   supported individual profile with access to the company's renewal template, plus the template,
   transaction type and initial status. The owner reports Business+ access; live resource access
   remains unverified. Do not require an office-only profile selection.
6. Feature scope is finalized in intake 050–054. The S66/S130 configuration path will accept the
   actual approved legal versions, applicability, field/signer mappings and versioned fee policy.
   Confirm those production inputs before their affected customer-ready output; do not invent
   amounts, signer identities or legal approval from acceptance of the feature recommendations.
   Eight static references are available in `docs/dotloop_template_references/`; they are not
   published forms or complete maps. Approval/configuration can proceed independently of B-DL2.
   Stable Drive access is deferred and does not hold this specification cycle or local filling.

**Next developer step:** deliver the stored credential/vault bindings and the S106 Connect
navigation repair through the existing implementation/release process. The registered client is
visible and matches the stored id; no new client or repeated secret delivery is needed. The
registered redirect remains owner-reported, and actual granted scopes must be checked after consent.
Support verification and selected resource ids remain separately unverified.

Both Dotloop action keys stay closed until a separate exact-key proof and activation is authorized.
Signature completion is never inferred. The current work is specification authoring plus the
explicitly requested credential migration and later connection-initiation check; no application
implementation or live provider business-effect proof is started.

**E2. Human verdicts and real material (B-HUMAN).** These change verdicts, not code, and none blocks
delivery: a human observer for screen-reader, desktop full-page zoom and batch 004 usability
checks; a consented walkthrough with one or two real leases; the Rhino policy wording and
applicability review with reviewed lease evidence; and a staff accuracy review of a real customer
draft (recipients, sender, charges and terms). Live Gmail or provider effects from Focus and live
staff-record saves stay unverified until a person performs them.

## V-DL: credential delivery, connection attempt and remaining verification

**Storage verified 2026-10-06.** The owner-supplied Client ID and Secret were read from the selected
1Password item and copied to Secret Manager in `pmi-kc-kb-prod`:

- `DOTLOOP_OAUTH_CLIENT_ID`, version `1`, `ENABLED`, created at `2026-10-06T10:16:33.822022Z`.
- `DOTLOOP_OAUTH_CLIENT_SECRET`, version `1`, `ENABLED`, created at `2026-10-06T10:17:05.981956Z`.

Both secret readbacks exactly matched the source bytes in memory. Values were not printed or
written into the repository. The existing runtime service account
`pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com` has a read-back
`roles/secretmanager.secretAccessor` binding on the client-secret resource. Fresh CLI and ADC
refreshes passed for the approved `josiah@pmikcmetro.com` WSL identity.

Cloud Run readback on `pmi-kc-app-rmuvf58nk-d45b8bc5347d` has no configured
`DOTLOOP_OAUTH_CLIENT_ID`, `DOTLOOP_OAUTH_CLIENT_SECRET`, `DOTLOOP_OAUTH_REDIRECT_URI` or
`CONNECTOR_SECRET_VAULT_PROJECT_ID`. No revision was deployed or changed. Registered client
callback/scopes and API Support verification remain unverified. Credential storage is complete;
B-DL1 remains scoped to runtime binding and client setup, and B-DL2 remains connection/selection.

**Connection initiation attempted 2026-10-06.** The owner's later request to run the callback/API
scope authorizes the narrow connection check. Managed Admin sign-in completed, but the live
Connect control refused before OAuth with missing registration/callback configuration. An
independent Cloud Run readback confirms all four variables above still absent on the same serving
revision. The stored Client ID exactly matches the registered client. Fresh WSL CLI/ADC refreshes
passed; earlier bounded tool timeouts are not current authentication failures. No Dotloop callback,
consent, token exchange, loop creation or upload completed, and no cloud mutation occurred.

Completing the flow requires the app's configuration release and Connect repair; the implementation
queue/permit remain in their completed state. This check does not execute the newly authored
feature batch. Other live token-lifecycle/provider acceptance, demo and activation work remains
deferred. After the required setup delivery, within the authorized connection flow:

1. Verify the reviewed client id/redirect and the Secret Manager client-secret binding; verify
   vault configuration and existing runtime permissions without adding a grant during verification.
2. After the authorized release, read runtime configuration and named readiness failures.
3. Let the owner complete OAuth and select verified resources. Read back profile/template
   readiness, token metadata and connection generation without exposing tokens or provider bodies.
4. Leave live refresh/revocation/reconnect testing to its separately directed lifecycle flow.
   That flow must preserve S96's preview/confirmation/credential-removal/readback contract;
   denied storage or cleanup means recovery needed, not connected.
5. Verify both Dotloop action keys remain closed and no signature completion is inferred.

The reviewed deployment configuration must supply the non-secret `DOTLOOP_OAUTH_CLIENT_ID`,
verified `DOTLOOP_OAUTH_REDIRECT_URI`,
`DOTLOOP_OAUTH_CLIENT_SECRET_SECRET_ID=DOTLOOP_OAUTH_CLIENT_SECRET`, the selected secret version,
and `CONNECTOR_SECRET_VAULT_PROJECT_ID=pmi-kc-kb-prod`. Storing the Client ID in Secret Manager
also preserves its source; the existing wrapper consumes its non-secret value through the env map.
V-DL creates no loop and uploads no document. Provider writes still require approved content and
separately authorized exact keys, previews, confirmations, receipts and readbacks.

## Runner follow-ups (not holds)

These are engineering tasks with no owner step; none blocks a release.

- **Message review window (owner decision candidate).** S124 binds a saved message review to the
  admitted lease generation, and the draft preview admits a new generation once the 60 s soft TTL
  has passed. So a preview more than 60 s after the last source read asks staff to save the review
  again even when no source term changed. The S113 fix made that request accurate (it used to read
  as a safety conflict). Binding reviews to the notice facts instead of the generation counter would
  remove the extra save but relaxes the deliberate generation binding, so it stays as built unless
  the owner decides otherwise. Draft claims keep their exact generation binding either way.
- **Assurance session lifetime.** The app's session cookie lasts eight hours, and release
  prerequisites only prove the Admin assurance profile is signed in when they run. Run 05c177b9's
  session expired inside its final observation checkpoint, so it rolled back verified. Before
  admitting a run, refresh it unattended (`npm run auth:ensure -- --need=canary --unattended`
  with the Admin profile and canonical origin); it re-signs through the profile's Google session
  without a person. Only a Google sign-out needs the owner (A6). `auth:ensure` keeps a session that
  is still valid, so also confirm the canonical session has more than an hour left; run 01efe066
  was admitted with under half an hour left and rolled back verified when it expired.
- **Four emulator-only E2E suites.** `approval-queue`, `capture`, `process-definitions` and
  `work-accountability` fail with 409 when run with the Firestore emulator because the harness
  runs `demo` + `live_readonly`, which refuses writes by design. They run in no gate. The repair is
  a second harness pass under the existing `demo` + `demo` descriptor, not a guard change.

- **Uncertain Sheet field update (owner decision candidate).** A field update whose response is
  lost stays `ambiguous`: the Sheet may hold the new value, the app cannot prove which attempt
  wrote it, and that lease accepts no further Sheet proposal, replacement or discard until the
  runner clears the record from its receipt. This is the S113 contract (fail-closed, at most one
  attempt per target), live again with S159. Candidate change: let a staff member archive an
  ambiguous field generation, since the per-target claim already refuses a second write to the
  same cell. Until decided, a lease in this state needs a runner readback and a manual clear.
- **Document packet terms source (owner decision candidate).** The document packet still takes
  its rent and dates from terms recorded with the owner response (`lib/lease-documents/live-input.ts`),
  and the S156 owner response records the answer only; the terms now live in Working renewal terms.
  Until decided, a packet evaluation for newly worked leases shows no approved terms, and the lease
  page says so. Candidate change: with a recorded owner approval, let the packet read the working
  renewal terms. It changes what fills a legal document, so it waits for the owner. No packet can
  execute today either way (B-DL1 to B-DL3, both Dotloop keys closed).
- **Promotion routing skew.** Run 175fee1d's immediate observation checkpoint failed because, for up
  to 46 s after promotion started, Cloud Run still routed some canonical requests to the
  predecessor, which (with no traffic and no tag) answered them with instant 500s; the candidate
  served zero 5xx. The run rolled back verified. Replacement run 0eb2cfeb passed with the
  predecessor still tagged (a retry's new recovery clone takes the rolled-back candidate's tag) and
  zero 5xx from any revision. If it recurs, the owner chooses between a longer immediate-checkpoint
  grace with a routing-convergence wait and static-asset skew protection; the 60 s grace and canary
  thresholds are owner decisions, so the runner does not change them.
- **Cold recovery verification.** A rollback's verification reads the version on a target that may
  be cold (32.4 s against a 30 s timeout in run 175fee1d). Warm the target with
  `~/pmi-kc-work/scripts/diag-canary-phase.sh <label> <canonical origin> <commit> <revision>
<fingerprint> rollback` until it passes, then `release-control.mjs --resume`.
- **Cold first requests on new revisions (owner decision candidate).** All three fresh runs on
  2026-10-05 (5d1b4e3a, 7753e5f5, 61659874) paused at recovery preparation: a new recovery instance
  took 43.2, 33.0 and 48.1 s for its first Dashboard render against the 30-second route bound, with
  every request answered 200. Run 61659874 also paused at the candidate smoke: the zero-traffic
  candidate answered its first request, the correct sign-in redirect, in 43.8 s against the
  30-second probe timeout (11.1 s on the two earlier candidates), in a window where a new instance
  of already-released code took 15.6 s for its first version read against 4.7 and 6.4 s earlier.
  Each time the request log confirmed the cause, read-only diagnostics passed on the then-warm
  target and the same run resumed with nothing redispatched. Candidate change: have the runner send
  one warm-up request to a new revision before its bounded checks. That changes what the 30-second
  checks measure, and the bounds are owner decisions, so the runner changes neither. Until decided,
  expect about ten minutes per pause: read the revision's request log, run
  `~/pmi-kc-work/scripts/diag-recovery-canary.sh` or the candidate smoke by hand, then
  `release-control.mjs --resume`.
- **Observation margin.** Run 61659874's observation decided at 415,448 ms against the 420,000 ms
  evidence deadline (390,684 ms in run 7753e5f5 the same day), with every route, all 318 records
  and both checkpoints passing; its final thirteen-route check took 92.7 s against 82.8 s. Past the
  deadline a healthy candidate rolls back. The deadline is an owner decision, so the runner does
  not change it.

## Closed

- **Release-check margin (2026-10-02).** Not a hold. Batch 004 made the canary's renewal desk wait
  out an admitted lease refresh started by the Dashboard; PR #119 restored the Dashboard's plain
  stale revalidation. Run 175fee1d's candidate rendered the desk in 4,524 ms (15.5 to 28.7 s in
  batch 004's releases), and replacement run 0eb2cfeb's observation decided at 396,284 ms against
  the 420,000 ms evidence deadline, with a 4,838 ms renewal desk check.
- **B-MNT2 (2026-10-01).** Vendoroo's agent ("ROO") writes work-order updates into RentVine, which
  the app already reads; no connector is built and nothing is requested from Vendoroo.
- **B-FLOW1, B-GOLD1 and B-REH1.** The audited manual journey, the golden-label correction and the
  local walkthrough acceptance are complete; Git history keeps their evidence.
- **Tenant resource links (S113).** The owner deferred source collection. Labeled link boxes accept
  real entries when supplied and never export placeholders or stand in for approved legal content.
