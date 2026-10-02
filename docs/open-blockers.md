# Unblock packet

Last reconciled: 2026-10-02 (owner unblock pass; decisions Q1–Q4 and the A2, A4 and A6 readbacks
recorded below; the S113 notice-safety race is fixed and queued for release).

This is the one record of what the application waits on outside the code, and exactly how to
clear each item. Every hold blocks only the effect named in its row. No hold blocks development,
tests, merges, releases or another suite, so unattended runs do not read this file unless their task
exercises a listed effect or the owner reports a step done. When the owner reports a step, the run
performs that row's follow-up, records the readback here and removes the row. Never invent a
substitute value, identifier, credential or human verdict to clear a hold.

## Holds at a glance

| Id        | Blocks only                                                         | Owner step                                  | Then the runner                                                                 |
| --------- | ------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| B-AUTH2   | Unattended local sessions longer than about 16 hours                | A4: session exception, then re-enroll WSL   | Runs the fresh-shell CLI/ADC probe to 25 hours and records the result           |
| B-MNT1    | Preapproval-based maintenance routing (S108)                        | A3: preview and confirm the RentVine import | Reads back the recorded preapprovals and their effective date                   |
| B-S100    | The resident-reply draft key, so S100 and then S36 completion       | A2: ticket, link work order 1756, one sync  | Verifies the resident mapping read-only, then runs the bounded draft proof (Q3) |
| B-TIMING  | Approved 30-day notice classifications (they read Cannot determine) | A5: record the decided basis in Admin       | Reads back the saved basis version                                              |
| B-DL1     | Dotloop credentials (S106 readiness, S34 provider work)             | A1: integration account, reply-all          | After activation and the V-DL secret command, binds and verifies the client     |
| B-DL2     | The Dotloop connection and its selected resources                   | After B-DL1: connect and select resources   | Reads back profile/template readiness; both Dotloop keys stay closed            |
| B-DL3     | Approved Dotloop form content for seven artifact families           | After B-DL2: confirm a template per family  | Verifies each family's mapping; no invented legal form                          |
| B-BROWSER | Release assurance, only when Google signs the Admin profile out     | A6: sign the Admin profile back in          | Recollects prerequisites and continues the release                              |
| B-HUMAN   | Human verdicts and real-case accuracy claims only                   | E2: observed sessions and real material     | Records each verdict with its evidence; nothing is inferred from tests          |

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
  same day, merged with `main` as written. It starts only from the owner's execution prompt.

Earlier decisions stand: RentVine's per-property maintenance limits are the S108 source (B-MNT1,
2026-10-01); RentVine work order 101756 (API id 1756) is the S100 target; B-MNT2 closed with
Vendoroo's agent writing into RentVine and no direct connector.

## Owner steps

**A1. Dotloop integration account (B-DL1).** Create a free Dotloop account on a company-owned role
address, not a person's mailbox. Reply-all on Dotloop's 2026-09-10 approval thread with that
address. Dotloop then activates API access, which can take 3–5 business days (E1 continues).

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

## External and waiting

**E1. Dotloop after activation (B-DL1 → B-DL2 → B-DL3).**

1. Create one sandbox and one production API client with PMI KC's company details. Each uses the
   redirect URI `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app/api/connections/dotloop/callback` and
   the scopes `account:read`, `profile:read`, `loop:read`, `loop:write` and `template:read`.
2. Reply to Dotloop API Support so it completes each client's configuration.
3. Store the production client secret with the V-DL command below. It reads the secret without echo.
4. The runner binds the non-secret client id and redirect in the reviewed production env file; the
   next authorized release carries them (V-DL).
5. Connect the managed account in Connections and choose a verified office profile, renewal
   template, transaction type and initial status (B-DL2).
6. For each of the seven artifact families (standard lease, renewal extension, animal agreement,
   lead-based-paint disclosure, city addendum, HOA artifact, owner acknowledgment), confirm which
   existing Dotloop template carries it, or supply the approved blank form with its version and
   field, participant and signature mappings (B-DL3).

Both Dotloop action keys stay closed until a separate exact-key proof and activation is authorized.
Signature completion is never inferred.

**E2. Human verdicts and real material (B-HUMAN).** These change verdicts, not code, and none blocks
delivery: a human observer for screen-reader, desktop full-page zoom and batch 004 usability
checks; a consented walkthrough with one or two real leases; the Rhino policy wording and
applicability review with reviewed lease evidence; and a staff accuracy review of a real customer
draft (recipients, sender, charges and terms). Live Gmail or provider effects from Focus and live
staff-record saves stay unverified until a person performs them.

## V-DL: bounded verification after credentials arrive

Trigger: B-DL1 credentials are delivered through the recorded binding path, authorized unattended
access is available, and the owner starts the B-DL2 connection.

1. Verify the reviewed non-secret client id/redirect and the Secret Manager client-secret binding;
   verify vault configuration and the existing runtime permission without adding a grant.
2. After the authorized release, read runtime configuration and named readiness failures.
3. Let the owner complete OAuth and select verified resources. Read back profile/template
   readiness, token metadata and the connection generation without exposing tokens or provider
   bodies.
4. Check refresh, revocation and reconnect only through their existing explicit workflows and keep
   S96's preview/confirmation/credential-removal/readback contract. Report denied storage or
   cleanup as recovery needed, never as connected.
5. Verify both Dotloop action keys remain closed and no signature completion is inferred.

Owner delivery command for the production client secret, run in WSL as the approved account:

```bash
read -rs DOTLOOP_SECRET && printf '%s' "$DOTLOOP_SECRET" | gcloud secrets create DOTLOOP_OAUTH_CLIENT_SECRET --project=pmi-kc-kb-prod --replication-policy=automatic --data-file=- && unset DOTLOOP_SECRET && gcloud secrets add-iam-policy-binding DOTLOOP_OAUTH_CLIENT_SECRET --project=pmi-kc-kb-prod --member=serviceAccount:pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor
```

The non-secret `DOTLOOP_OAUTH_CLIENT_ID`, `DOTLOOP_OAUTH_REDIRECT_URI` and
`DOTLOOP_OAUTH_CLIENT_SECRET_SECRET_ID=DOTLOOP_OAUTH_CLIENT_SECRET` then go in the reviewed
production env file. V-DL creates no loop and uploads no document; those need approved content and
separately authorized exact keys, previews, confirmations, receipts and readbacks. No support
follow-up is sent by the runner.

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
  without a person. Only a Google sign-out needs the owner (A6).
- **Four emulator-only E2E suites.** `approval-queue`, `capture`, `process-definitions` and
  `work-accountability` fail with 409 when run with the Firestore emulator because the harness
  runs `demo` + `live_readonly`, which refuses writes by design. They run in no gate. The repair is
  a second harness pass under the existing `demo` + `demo` descriptor, not a guard change.

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
