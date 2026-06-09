# Client Checklist

This checklist names what PMI KC must purchase, provision, answer, or approve before
engineering can complete production work. Do not put credentials or customer records in
this repo; record only names, owners, decisions, and non-secret identifiers.

Use `docs/environment-handoff.md` to track non-secret environment identifiers, secret
ownership, manual setup status, and verification evidence after these asks are answered.

## Current Outbound Asks

These asks were sent to Dan/PMI KC and are awaiting reply. Treat them as the current
client-side unblock thread. Do not paste credentials, source records, live Gmail
content, leases, or tool secrets into this repo when answers arrive.

| Ask                                | Exact client action                                                                                                                                                                                                      | Needed for                                         | Status                                                                                                                            | Verification after unblock                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Google Cloud billing card          | Add a card to the Google Cloud billing account at `https://console.cloud.google.com/billing`. Budget context sent: keep spend at $10 and do not spend without approval.                                                  | KB migration to client-owned cloud platform.       | Awaiting Dan.                                                                                                                     | Billing visible/enabled, then run approved setup/preflight dry-runs.                             |
| Lease Renewal walkthrough          | Provide one full start-to-finish renewal walkthrough, ideally Wednesday, June 17, 2026, 9:30-10:15 AM, with fallback windows Wednesday morning, Thursday, June 18, 2026, 11:00 AM-4:00 PM, or before 9:00 AM either day. | Lease Renewal Agent discovery and prototype scope. | Awaiting team.                                                                                                                    | Record/summarize walkthrough into source notes without raw client data in git.                   |
| Tool access spreadsheet            | Fill in tool, available access type, location, and notes for RentVine, LeadSimple, DotLoop, QuickBooks, Boom, Google Sheets including which sheets, and any missing tools.                                               | Integration capability classification.             | Partially received: RentVine both/API; LeadSimple, DotLoop, Boom, and Sheets admin/location; QuickBooks blank; Sheets scope open. | Update research backlog and environment handoff with non-secret locations/owners.                |
| RentVine credential rotation       | Rotate the RentVine API key/secret that appeared in the ignored local tool-access spreadsheet notes, then store the replacement outside this repo in the approved client secret location.                                | Future RentVine integration safety.                | Newly added ask after spreadsheet review.                                                                                         | Client confirms revocation and replacement owner/storage path without sharing the secret in git. |
| Approval notification sender       | Confirm default that approval emails can come from `kb-automation@pmikcmetro.com`.                                                                                                                                       | KB approval notification setup.                    | Awaiting exceptions; default yes was sent.                                                                                        | Sender/recipient setup recorded; no send until approved.                                         |
| Launch approvers                   | Confirm default that launch approval is Dan and Josiah only.                                                                                                                                                             | Production role and approval routing.              | Awaiting exceptions; default yes was sent.                                                                                        | Role/approver notes updated in product docs and auth setup.                                      |
| Gmail helper safe test model       | Confirm default that Gmail Inbox 0 starts with a few safe test threads before touching Dan's live inbox.                                                                                                                 | Gmail Inbox 0 safe rollout.                        | Awaiting exceptions; default yes was sent.                                                                                        | Safe-thread protocol recorded before any Gmail read/modify runtime.                              |
| Signed lease and lease-date source | Identify where signed leases and lease end dates live.                                                                                                                                                                   | Lease Renewal Agent first authoritative trigger.   | Awaiting Dan.                                                                                                                     | Source system classified as read-only/write-capable/blocked.                                     |

## Decisions To Confirm

| Ask                                                                              | Why it matters                                                         | Needed for          |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------- |
| Confirm final product names: PMI KC KB, Lease Renewal Agent, Gmail Inbox 0.      | Prevents docs and training from drifting.                              | All lanes           |
| Confirm Gmail Inbox 0 starts with Dan's whole mailbox.                           | Defines Gmail scan, label, and privacy scope.                          | Gmail Inbox 0       |
| Confirm Lease Renewal Agent integration scope.                                   | Identifies the systems, writes, and approvals needed.                  | Lease Renewal Agent |
| Name product owners and acceptance reviewers.                                    | Needed for approvals, training, and cutover signoff.                   | All lanes           |
| Confirm migration/cutover should be the next step once local readiness is green. | Prevents extra local feature loops from delaying production decisions. | All lanes           |
| Confirm later User list and process-specific approvers.                          | Determines who can use workflows and who approves edge cases.          | All lanes           |
| Confirm initial delegated approvers beyond Dan/Josiah, if any.                   | Later approver changes should be manageable in the Admin console.      | All lanes           |

## Access And Accounts

| Ask                       | Exact client action                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Google Workspace admin    | Grant or schedule admin support for auth domains, Gmail labels/filters, and Drive sharing.                                                                                     |
| GCP/Firebase project      | Create or grant access to a PMI KC-owned project with billing enabled.                                                                                                         |
| Firebase Auth             | Approve allowed Workspace domain and test users.                                                                                                                               |
| Drive source folders      | Provide approved source folder names/owners for KB and renewal material.                                                                                                       |
| Gmail Inbox 0 test access | Provide Dan-approved Dan mailbox scan/testing approach: live supervised account, safe test threads, or sanitized export.                                                       |
| Approval notifications    | Provision `kb-automation@pmikcmetro.com` for in-app/internal-email approval notifications with one email retry and Dan/Josiah escalation after retry failure.                  |
| Deployment domain         | Provide the production URL/domain or approve the Cloud Run URL.                                                                                                                |
| Secret ownership          | Name who owns production and staging Secret Manager access, API-key custody, key rotation, break-glass access, and revocation for each approved environment.                   |
| Tool credential rotation  | Rotate any API credential shared in local spreadsheet notes, starting with the RentVine API key/secret, and confirm the approved storage owner/path without posting the value. |
| Signed lease system       | Identify where signed leases live and how lease end dates can be read safely.                                                                                                  |
| Renewal walkthrough       | Provide both a recorded walkthrough and a supervised Chrome session, either as a client-led show-and-tell or by showing Josiah so he can capture workflow data.                |
| Renewal source location   | Provide a PMI KC-accessible Google Drive folder for captured workflow notes unless setup identifies a better client-accessible app-connected source.                           |
| Renewal source access     | Grant the whole PMI KC team direct edit access to the initial Lease Renewal source-of-truth folder.                                                                            |
| Renewal source curation   | Let Dan set the review cadence and test the simplest low-cost copy path for all useful source file types from Drive into Cloud Storage plus Agent Search periodic ingestion.   |
| Renewal source hygiene    | Move non-sources-of-truth out of the Lease Renewal source folder and identify where non-source, reference, or archive material should live.                                    |
| Maintenance intake source | Identify where tenant maintenance requests and phone notes live.                                                                                                               |

## Source Material

| Ask                   | Exact client action                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Approved KB sources   | Provide approved SOPs, templates, checklists, and policies by Space.                                                                         |
| Lease renewal sources | Provide video demo, client context, team notes, renewal notices, timing rules, communication examples, exception rules, and approval owners. |
| Gmail Inbox 0 sources | Provide approved reply patterns, tone examples, routing rules, label examples, and unsupported cases.                                        |
| Sensitivity review    | Mark high-sensitivity sources that must not be indexed or committed.                                                                         |
| Missing facts         | Answer open questions or explicitly approve placeholders.                                                                                    |

## Product Definition Follow-Ups

| Product             | Exact client answer needed                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PMI KC KB           | Which source folders feed Lease Renewals, Maintenance Work Order Intake, Move-Out + Deposit Disposition, and Owner Onboarding?                                |
| Lease Renewal Agent | Which starter renewal materials should go into the source-of-truth folder first?                                                                              |
| Lease Renewal Agent | Which Google Drive folder should captured Lease Renewal workflow notes live in first, unless setup selects a better source?                                   |
| Lease Renewal Agent | Which people are included in the initial whole-team edit group for the Lease Renewal source-of-truth folder?                                                  |
| Lease Renewal Agent | Which systems expose signed lease/dates, tenant/property facts, owner information, current rent/terms, and renewal timeline when integration scoping begins?  |
| Lease Renewal Agent | Which approved edit/add-resource path should missing facts link to: in-place process edit, Drive/source folder add, or another source path?                   |
| Lease Renewal Agent | Does a simple low-cost copy automation handle all useful source file types from Drive, with conversion or visible skips when needed?                          |
| Lease Renewal Agent | Where should non-source, reference, or archive material live outside the Lease Renewal source folder?                                                         |
| Lease Renewal Agent | Which target-system/action-type pairs can be approved for future executable external actions?                                                                 |
| Lease Renewal Agent | Which external systems later need mirrored workflow-run state from the KB-owned central workflow record?                                                      |
| Lease Renewal Agent | Who, if anyone, should be added as an initial delegated approver beyond Dan and Josiah in the Admin console?                                                  |
| Lease Renewal Agent | Which people or groups should receive internal workflow notification emails beyond the default owner/final approver and next-action assignee?                 |
| Maintenance         | Which tools, services, connections, and chatbot/phone system should support intake when Maintenance scoping begins?                                           |
| Maintenance         | Who approves common issue templates and escalation rules?                                                                                                     |
| Move-Out            | Which tools, services, connections, natural triggers, and approvers apply when Move-Out scoping begins?                                                       |
| Gmail Inbox 0       | What Dan mailbox scan model is approved, and may approved rules back-label historical threads?                                                                |
| Gmail Inbox 0       | Which Gmail draft/reply capabilities are allowed while Dan still presses Send?                                                                                |
| Gmail Inbox 0       | Discovery 1: When Dan opens his inbox, what 3-5 piles does he mentally sort mail into? (Defines the label taxonomy; see `docs/products/gmail-inbox-zero.md`.) |
| Gmail Inbox 0       | Discovery 2: Which kinds of emails does Dan reply to the same way most of the time? (Defines the first safe auto-draft templates.)                            |
| Gmail Inbox 0       | Discovery 3: Which emails must never be auto-touched? (Defines hard exclusions: owner-money, legal/notices, tenant disputes -> label only.)                   |
| Gmail Inbox 0       | Discovery 4: How does Dan currently know an email is stuck waiting on someone, and on whom? (Defines follow-up/aging logic and waiting parties.)              |

## Testing And Training

| Ask                      | Exact client action                                                             |
| ------------------------ | ------------------------------------------------------------------------------- |
| Test users               | Use Josiah and Dan as initial Admin smoke users; add User tests when delegated. |
| Acceptance scenarios     | Provide real but safe scenarios for KB, renewals, and owner-email workflows.    |
| Training attendees       | Name who must be trained for each product.                                      |
| Production support owner | Name who watches the products after launch and reports issues.                  |

## Current Blockers

- KB production migration is waiting on Google Cloud billing/card setup, approved
  client-owned resources, production sources, auth domains, role assignments, and
  source/data-store maps.
- Once local readiness evidence is green, the remaining KB work should move to
  client-owned migration/cutover prep rather than additional speculative local feature
  cycles.
- Lease Renewal Agent runtime scope is waiting on the full walkthrough, signed
  lease/date source location, QuickBooks access status, Google Sheets scope, RentVine
  credential rotation, and future approval of read/write permissions.
- Gmail Inbox 0 live Gmail setup is waiting on Dan approval of the safe test-thread
  model and later Gmail access/scope decisions.
- Any request involving raw customer records, ledgers, bank data, SSNs, full lease
  packets, or live Gmail content must be handled outside git.
