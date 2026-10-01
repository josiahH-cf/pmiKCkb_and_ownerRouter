# Open blockers

Last reconciled: 2026-10-01 (owner unblock pass); B-MNT2 added 2026-09-20 and closed 2026-10-01.
Read after `docs/loop-state.md`. Each hold names its owner and the readback needed to close it. Work
independent of a hold continues; no substitute value is invented.

| Id      | Blocks                                                    | Owner                           | Exact item to bring back                                                                                                                                                                                                                                                                           | Completion evidence                                                                                                                 |
| ------- | --------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| B-AUTH2 | Separate authentication longevity                         | release operator                | Complete the unchanged-enrollment 24-hour elapsed-session proof. A fresh-shell CLI/ADC probe runs every 15 minutes from 2026-10-01 against the 08:24:48Z enrollment; on 2026-09-16 refresh was refused about 8.8 hours after enrollment.                                                           | S113 CLI/ADC, Admin browser assurance, promotion and observation passed; longevity is not implied by those gates.                   |
| B-DL1   | S106 live readiness and S34 live provider work            | owner, then Dotloop API Support | Dotloop approved V2 API access on 2026-09-10. Owner: create the dedicated Dotloop integration account on a company role address and reply-all on the approval thread; after activation create the sandbox and production API clients and store the production client secret with the V-DL command. | Bound credentials exist and runtime configuration readback names no missing credential.                                             |
| B-DL2   | S106 live readiness and S34 live provider work            | owner                           | Connect the managed Dotloop account; choose a verified office profile, renewal template, transaction type, and initial status.                                                                                                                                                                     | Profile/resource probes and selected-resource readback report ready; this does not open action keys.                                |
| B-DL3   | S34 approved artifact content and packet workflow binding | owner                           | Approved blank-form location and coverage of all seven artifact families, listed below.                                                                                                                                                                                                            | Each family resolves to approved content and a verified participant/field mapping; no invented legal form.                          |
| B-S100  | Resident-reply draft proof and S36                        | owner                           | Owner chose RentVine work order 101756 (API id 1756) on 2026-10-01 and confirmed its resident email. Owner creates its app ticket, links id 1756 and runs one manual sync; the agent then verifies the mapping before the proof window.                                                            | Exact link and synchronization resolve an eligible message; then bounded draft proof, close/readback, and separate activation pass. |
| B-MNT1  | S108 live preapproval routing proof                       | owner                           | Owner chose RentVine's per-property maintenance limits on 2026-10-01 (30 of 121 active properties). The Admin import (`82e49596`) is released (run `98f7e743`); an Admin previews it and confirms once.                                                                                            | Admin-confirmed property preapproval reads back with amount/effective date and applies to verified evidence.                        |

## Owner unblock pass — October 1

The owner asked to unblock every hold on 2026-10-01. Read-only evidence first reduced each ask to
one decision or one owner step; the decisions below are recorded as given.

- **B-DL1.** Dotloop approved V2 API access for PMI KC on 2026-09-10 (owner-supplied email, not in
  Git). Dotloop's next steps: create a free Dotloop account dedicated to the integration on a
  generic, company-owned role address, as Dotloop asks, reply-all on the
  approval thread with that address, wait for API activation (Dotloop allows up to 3–5 business
  days), then create one sandbox and one production API client with PMI KC's company details and
  reply to Dotloop API Support so it completes each client's configuration. Each client uses the
  redirect URI `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app/api/connections/dotloop/callback` and the
  scopes `account:read`, `profile:read`, `loop:read`, `loop:write` and `template:read`.
- **B-MNT1.** RentVine stores `maintenanceLimitAmount` per property. A count-only read on 2026-10-01
  found 121 active properties, 30 with a positive limit and 15 with maintenance notes (8 of them
  with a limit). The owner chose to import those limits. The Admin import (S108 amendment,
  `82e49596`) is released (run `98f7e743`); an Admin previews it, reads the flagged notes and
  confirms once.
- **B-S100.** The owner chose RentVine work order 101756 (API id 1756, status Requested, resident
  messages present, never a proof target) and confirmed its resident email. Production holds one
  maintenance ticket and one work-order link, neither for id 1756. Owner steps in Maintenance:
  create the app ticket for this issue with its verified unit, use **Link an existing work order**
  with id `1756` (not Create work order), confirm the preview, then run **Sync resident messages**
  once and confirm its read-marker warning. The agent then verifies the synchronized resident
  mapping and email read-only before the bounded `gmail.maintenance_resident_reply.draft_create`
  proof window, which creates one unsent draft for owner review, followed by close/readback and
  separate activation.
- **B-AUTH2.** A detached probe runs the approved unattended CLI/ADC check every 15 minutes in a
  fresh shell against the 2026-10-01T08:24:48Z enrollment and stops at the first failure, an
  enrollment change, or 25 hours. If the 2026-09-16 wall repeats, the owner decides between a Google
  Workspace session-control change for the CLI/ADC clients and accepting the shorter session in the
  release contract. The runner changes no session policy.
- **B-DL2 and B-DL3** follow B-DL1. Proposed default for B-DL3: after the connection, the app's
  loop-template discovery lists PMI KC's existing Dotloop templates, and the owner confirms which
  template carries each of the seven artifact families instead of locating blank forms separately.

## Closed decision item: B-MNT2

The meeting notes' "Rue" is Vendoroo's AI agent ("ROO"). On 2026-10-01 the owner chose RentVine as
the shared record: Vendoroo's native RentVine integration writes its work-order updates and messages
into RentVine, which the app already reads. No direct connector is built and nothing is requested
from Vendoroo. A count-only read on 2026-10-01 found no Vendoroo text in 500 recent work orders or
120 recent chats, so its RentVine connection is not yet active. The S133 packet's other handoff
options stay available if the owner later wants a direct interface.

## B-AUTH2: separate longevity proof

S113 release authentication and Admin assurance passed on both exact origins using the approved
existing owner account/profile. Editor is not_run under explicit owner direction; backend role
restrictions remain. No account, IAM, claim or store location changed. The separate 24-hour unchanged-enrollment
longevity proof remains unverified and does not reopen completed S113 release acceptance.

## Closed implementation item: B-FLOW1

The complete audited manual journey and normal packet handoffs are implemented and deployed.
Fresh and underway mounted backend journeys persist actual activity/cycles and owning desk readback.
All 33 S113 review findings, all seven compiled checks and exact production release gates passed.
Staff reports remain distinct from provider receipts. Normal S106/S34 preparation, approval, exact
S21 bytes, S20 execution and own-receipt recovery passed deterministic adapter acceptance.
Actual forms/catalog, connection and closed-key activation remain B-DL1/B-DL2/B-DL3, localized to
dependent document effects. Blank labeled resource fields do not block manual work.

## Closed verification item: B-GOLD1

On 2026-09-08, live Sheet values/formulas/link metadata and the exact RentVine lease readback did
not establish the historical source association underlying one expected rent-conflict label.
The owner reviewed the private evidence and explicitly approved removing that one expectation.
The original capture and worksheet are preserved privately, all source values and the remaining
label are unchanged, and every test assertion and ambiguous-name refusal remains intact.
The golden harness passes 4/4 and the corrected full native unit suite passes 6,360 tests with four
skipped. B-GOLD1 is closed and is not a Wednesday client ask.

## Closed verification item: B-REH1

All seven applicable compiled browser checks pass on the explicit native Node 22 Demo + Live-read-only
runtime. The final R29 desk passes its full source cohort, sorting/filtering, inspection-only refusal,
active dashboard/sections, term parity, exact return/Back, keyboard/targets and layout budgets. The
42-step guide also passes. Source freshness and deadlines were not relaxed. B-REH1 is closed for
local walkthrough acceptance; exact candidate assurance remains a separate mandatory release gate.

## Wednesday inputs

B-DL3 needs approved blank forms for standard lease, renewal extension, animal agreement,
lead-based-paint disclosure, city addendum, HOA artifact, and owner acknowledgment. Bring a location
and each file's coverage, publication version and approved field/participant/signature mappings.
Approved catalog entries and participant/field mappings remain required inputs. Exact active S21
bytes and the normal packet workflow are implemented/deployed. S106 provider revoke/readback and
interrupted-refresh quarantine are deployed; ambiguous token outcomes remain explicit recovery holds. Credential arrival alone
does not complete the packet workflow or authorize either closed Dotloop key.

B-S100 needs a maintenance work order, not a lease. The readiness slice implements the app-owned
preview/confirmed existing-work-order link in production; no new live link proof was run. Imported links cannot fabricate provider creation receipts or correction authority.
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

Owner delivery command for the production client secret, run in WSL as the approved account. It
reads the secret without echo, so it never enters a shell history, chat or Git, and adds the same
per-secret accessor binding the four existing runtime secrets carry:

```bash
read -rs DOTLOOP_SECRET && printf '%s' "$DOTLOOP_SECRET" | gcloud secrets create DOTLOOP_OAUTH_CLIENT_SECRET --project=pmi-kc-kb-prod --replication-policy=automatic --data-file=- && unset DOTLOOP_SECRET && gcloud secrets add-iam-policy-binding DOTLOOP_OAUTH_CLIENT_SECRET --project=pmi-kc-kb-prod --member=serviceAccount:pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor
```

The non-secret `DOTLOOP_OAUTH_CLIENT_ID`, `DOTLOOP_OAUTH_REDIRECT_URI` and
`DOTLOOP_OAUTH_CLIENT_SECRET_SECRET_ID=DOTLOOP_OAUTH_CLIENT_SECRET` then go in the reviewed
production env file, and the next authorized release binds them.

V-DL does not create a loop or upload a document. Those proofs require approved content/participants
and separately authorized exact keys, previews, confirmations, receipts, and readbacks. Credential
arrival and provider-fake tests do not grant that authority. No support follow-up is sent.

## Current administrative readbacks

Exact S113 release `f5faf1665121db9cacff913a57e7fdcc80513116` / `pmi-kc-app-rmtwdl4di-4439f17911f4` passed monitoring, authorized-domain and runtime
configuration checks. Managed alert recipient, runtime identity, eleven Spaces and action authority
remain unchanged. Current individual directory inventory and vendor-account RentCast usage are not
inferred from those checks; no paid comp request was made. See current release evidence.

## S113 unblock result — September 10

The new private email PDFs clear the missing-source-template input: six pages were visually read,
with hashes and normalized material preserved in the ignored source pack. They do not supply blank
legal forms, the separately mentioned analysis file or machine-readable flyer/form destinations.
Resolve existing runtime resources before requesting any missing link. Per-lease amounts and
charge applicability stay sourced inputs, not invented global defaults.

S113 F2.4–F5.1 closes agent-owned handoff ambiguity around RentVine scope, pending Sheet updates,
RentCast repair, copy/Gmail separation, template formatting, cycle isolation and applicable completion.
These features are deployed with mounted backend verification. Full units pass 6,528 tests
(four existing skips), all 201 backend tests pass, and all compiled browser/review/release gates passed. Current approved WSL CLI/ADC refresh passes.

B-DL1/B-DL2/B-DL3 still constrain actual Dotloop activation; current local client configuration is
absent. S106/S34 now owns a concrete prepare/upload/open-provider/returned-artifact end state and
its conditional deployment path. Full signature execution is separately unavailable in the current
public API. A provider-issued documented signature capability would need exact endpoint/scopes,
recipient effects, completion evidence and correction review; its absence does not block packet
implementation or S113 manual completion. No credential, form, grant or provider effect was invented.

### B-S113-LINKS — tenant resource destinations

The PDF insurance-flyer URL returned 404 on HEAD and GET; its RBP flyer returned 200 with PDF
content type. The transcribed information-form URL returned 404, but image-only source prevents
asserting an exact id/deletion. A bounded official-site search found no verified replacement.
Owner disposition: source collection is deferred. Implement persistent labeled link-entry boxes
for the insurance flyer, information form and approved legal-form locations. Empty pending-team
values are accepted for S113 implementation/release. Validate real entries when supplied; never
export placeholders or use a location box as approved legal content. Only dependent final copy/
packet effects wait for actual resources. No further Q1/Q2 request is needed.
