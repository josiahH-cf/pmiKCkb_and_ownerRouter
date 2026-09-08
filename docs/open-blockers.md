# Open blockers

Last reconciled: 2026-09-08. Read after `docs/loop-state.md`. Each hold names its owner and the
readback needed to close it. Work independent of a hold continues; no substitute value is invented.

| Id      | Blocks                                                    | Owner    | Exact item to bring back                                                                                                                                                                                                                        | Completion evidence                                                                                                                                                                             |
| ------- | --------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-AUTH2 | Auth longevity, managed browser assurance and promotion   | owner    | Observe the required 24-hour CLI/ADC refresh proof from the existing WSL owner enrollment. Authenticate existing managed Admin and claim-less managed account (app resolves Editor) profiles on both the exact candidate and canonical origins. | Fresh-shell and paired post-reboot CLI/ADC preflights exit 0 with unchanged enrollment. The 24-hour proof, both profiles on both origins and exact candidate assurance receipt remain required. |
| B-DL1   | S106 live readiness and S34 live provider work            | external | Approved Dotloop OAuth client id and secret through the recorded Secret Manager delivery path. Requested from support@dotloop.com on 2026-09-04; no follow-up sent.                                                                             | Bound credentials exist and runtime configuration readback names no missing credential.                                                                                                         |
| B-DL2   | S106 live readiness and S34 live provider work            | owner    | Connect the managed Dotloop account; choose a verified office profile, renewal template, transaction type, and initial status.                                                                                                                  | Profile/resource probes and selected-resource readback report ready; this does not open action keys.                                                                                            |
| B-DL3   | S34 approved artifact content and packet workflow binding | owner    | Approved blank-form location and coverage of all seven artifact families, listed below.                                                                                                                                                         | Each family resolves to approved content and a verified participant/field mapping; no invented legal form.                                                                                      |
| B-S100  | Resident-reply draft proof and S36                        | owner    | One work-order identifier carrying resident chat and confirmation that the resident email is verified.                                                                                                                                          | Exact link and synchronization resolve an eligible message; then bounded draft proof, close/readback, and separate activation pass.                                                             |
| B-MNT1  | S108 live preapproval routing proof                       | owner    | Unambiguous property identifiers, one amount per property, and effective dates.                                                                                                                                                                 | Admin-confirmed property preapproval reads back with amount/effective date and applies to verified evidence.                                                                                    |

## B-AUTH2: first owner action

Use profiles for the candidate that will actually be promoted. Existing candidate:
`https://cand-rmtq71kjl-bff41bbdb5fa---pmi-kc-app-kq6wuvpiva-uc.a.run.app`.
Canonical: `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`.
Each host has its own session cookie. One Admin and one claim-less managed account are sufficient
under the current application role fallback; do not create accounts, change claims, or demote an
Admin to satisfy a check. The owner approved Editor with all Spaces for claim-less managed accounts on 2026-09-08.

Browser ADC enrollment verified the approved owner in the existing WSL store. Fresh-shell and paired
post-reboot `auth:ensure -- --unattended` exited 0 with verified refresh and unchanged enrollment.
Post-reboot app `preflight:adc`, provider configuration and GitHub authentication also passed.
The 24-hour elapsed-session proof remains pending, no earlier than 2026-09-09T12:46:45.730Z.
The owner controls the session-policy exception; browser recovery is
`npm run auth:session -- --browser`. No new account, impersonation, IAM or claim is needed or authorized.

Once both managed browser profiles are enrolled, run `--prepare-candidate-receipt --live` with the exact candidate commit,
revision, and fingerprint in `docs/loop-state.md`, following `docs/environment-handoff.md`. The
existing candidate values are commit `7b3fdadac134550c24b029034753a38f16e4096b`, revision
`pmi-kc-app-rmtq71kjl-bff41bbdb5fa`, fingerprint
`sha256:dc697873b3b384e13a631e4742bae66358f71d6f09bca564dbfd84351de1bcda`.
No promotion input is satisfied until that receipt exists. A new readiness candidate must use its
own new identity/fingerprint. Promote only the receipted revision and observe it for 300,000 ms.

## Closed verification item: B-GOLD1

On 2026-09-08, live Sheet values/formulas/link metadata and the exact RentVine lease readback did
not establish the historical source association underlying one expected rent-conflict label.
The owner reviewed the private evidence and explicitly approved removing that one expectation.
The original capture and worksheet are preserved privately, all source values and the remaining
label are unchanged, and every test assertion and ambiguous-name refusal remains intact.
The golden harness passes 4/4 and the corrected full native unit suite passes 6,360 tests with four
skipped. B-GOLD1 is closed and is not a Wednesday client ask.

## B-REH1: live-source walkthrough performance

Local Node 24 development reproduced the ArrayBuffer response error and a 60-second desk load
timeout. The native built app on the existing Node 22 runtime loaded the desk, but base-rent sorting
took 23.4 seconds against a 20-second limit; the Dashboard also exceeded its 60-second navigation
limit. No deadline was widened. Maintenance blocker and intake browser checks passed. The guide's
native disclosure locator was corrected and checked in Chromium; its complete run remains separate.

The release operator owns closing this hold with the unchanged live-source browser checks on the
intended demonstration runtime/origin. The Wednesday fallback is a source-backed reading and
explanation session using the provisional October example, with no invented transaction. This hold
does not change the passing canonical unit/emulator/build gate or authorize promotion without the
existing exact candidate assurance receipt.

## Wednesday inputs

B-DL3 needs approved blank forms for standard lease, renewal extension, animal agreement,
lead-based-paint disclosure, city addendum, HOA artifact, and owner acknowledgment. Bring a location
and each file's coverage, publication version and approved field/participant/signature mappings.
The artifact catalog is currently empty. Exact active S21 publication content now has a verified
local byte resolver; catalog and participant resolution and the public packet workflow still need
approved source mappings. S106 provider revoke/readback and interrupted-refresh quarantine are
wired locally; ambiguous token outcomes remain explicit recovery holds. Credential arrival alone
does not complete the packet workflow or authorize either closed Dotloop key.

B-S100 needs a maintenance work order, not a lease. The readiness slice implements the app-owned
preview/confirmed existing-work-order link locally; it is unreleased and has not been exercised with
a live record. Imported links cannot fabricate provider creation receipts or correction authority.
The resident-draft key remains closed. Completed proof targets must not be reused.

B-MNT1 needs exact property identity as well as amount and effective date. Missing, conflicting,
not-yet-effective, or unmatched evidence never grants preapproval. The new optional ticket property
identity is server-derived; legacy records are not guessed or bulk backfilled.

## V-DL: bounded verification after credentials arrive

Trigger: B-DL1 credentials are delivered through the recorded binding path, authorized unattended
access is available, and B-DL2 connection is owner-initiated.

1. Verify the reviewed non-secret client id/redirect and Secret Manager client-secret binding;
   verify vault configuration and actual existing runtime permission without adding a grant.
2. After the authorized release, read runtime configuration and named readiness failures.
3. Let the owner complete OAuth and select verified resources. Read back profile/template readiness,
   token metadata, and the current connection generation without exposing tokens or provider bodies.
4. Check refresh/revocation/reconnect only through their existing explicit connection workflows and
   preserve S96's exact preview/confirmation/credential-removal/readback contract. Report denied
   storage or cleanup as recovery needed, never connected success.
5. Verify that both Dotloop action keys remain closed and no signature completion is inferred.

V-DL does not create a loop or upload a document. Those proofs require approved content/participants
and separately authorized exact keys, previews, confirmations, receipts, and readbacks. Credential
arrival and provider-fake tests do not grant that authority. No support follow-up is sent.

## Current administrative readbacks

Monitoring reads READY on 2026-09-08 with the existing managed alert recipient. The watcher now
configures that recipient separately from its approved CLI/ADC identity; no channel was changed.
Nine authorized domains, six managed users (three Admin and three default Editor; none disabled),
and the app's zero September RentCast counter were reread. Vendor-account usage and full readiness of the provisional
October walkthrough lease remain unverified. No comp request was made.
The existing candidate fingerprint retains its 2026-09-06 evidence date. A new candidate needs
its own fingerprint and complete assurance receipt. Client-facing asks are in
[the Wednesday decisions sheet](products/wednesday-decisions-and-inputs-2026-09-09.md).
