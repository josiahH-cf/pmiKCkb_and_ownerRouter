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

| Ask                          | Exact client action                                                                                                                                                                                | Needed for                                          | Status                                                                                                                            | Verification after unblock                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Source drop zone fill        | Add process docs, notes, examples, templates, screenshots, and useful context to the shared Drive source drop zone created by Josiah.                                                              | KB production source readiness and product scoping. | Folder created/shared: <https://drive.google.com/drive/folders/1arXww32LaPcIbFx_oONshbR62imiC8kq>; awaiting team content.         | Convert approved source material into source manifests/readiness checks.          |
| Tool access spreadsheet      | Fill in tool, available access type, location, and notes for RentVine, LeadSimple, DotLoop, QuickBooks, Boom, Google Sheets including which sheets, and any missing tools.                         | Integration capability classification.              | Partially received: RentVine both/API; LeadSimple, DotLoop, Boom, and Sheets admin/location; QuickBooks blank; Sheets scope open. | Update research backlog and environment handoff with non-secret locations/owners. |
| Approval notification sender | Confirm default that approval emails can come from `kb-automation@pmikcmetro.com`.                                                                                                                 | KB approval notification setup.                     | Awaiting exceptions; default yes was sent.                                                                                        | Sender/recipient setup recorded; no send until approved.                          |
| Launch approvers             | Confirm default that launch approval is Dan and Josiah only.                                                                                                                                       | Production role and approval routing.               | Awaiting exceptions; default yes was sent.                                                                                        | Role/approver notes updated in product docs and auth setup.                       |
| Gmail helper safe test model | Confirm whether the plain-English Gmail helper model is right: organize mail first, no autonomous send, start with Waiting on Outside / Waiting on Team, then possibly Dan Decision / Draft Ready. | Gmail Inbox 0 safe rollout.                         | Explanation sent; awaiting confirmation or alternate names/categories.                                                            | Safe-thread protocol recorded before any Gmail read/modify runtime.               |

## Resolved Client Foundations

- Production cloud: `pmi-kc-kb-prod` is provisioned under `pmikcmetro.com`; billing, the
  project-scoped $10 budgets, the hard kill switch, Firebase/Firestore, and the canonical Cloud Run
  service are verified. Remaining spend-bearing deploy/import/smoke steps still need explicit
  per-step approval.
- Renewal source: executed signed leases live in Dotloop; renewal timing and lease-end read from the
  RentVine lease record (`lib/integrations/rentvine/lease-mapper.ts` → `lease_end_date`).
- Renewal walkthrough: HELD 2026-06-19 by live screen-share; source questions are captured in
  `docs/products/lease-renewal-discovery-reference.md`. A short supervised view of the exact
  RentVine renewal/rent-increase clicks is optional, not a prerequisite to repeat discovery.

## Josiah-Owned Follow-Ups

| Item                         | Action                                                                                                                                                                           | Needed for                          | Status                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| RentVine credential rotation | RESOLVED (owner decision 2026-06-20): the RentVine API key/secret that appeared in ignored local spreadsheet notes is used as-is, NOT rotated. No client action; do not ask Dan. | Future RentVine integration safety. | Josiah-owned follow-up; do not record replacement secret values in git, email drafts, or tracked docs. |

## Decisions To Confirm

| Ask                                                                                                                                            | Why it matters                                                                                                               | Needed for          |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Confirm final product names: PMI KC KB, Lease Renewal Agent, Gmail Inbox 0.                                                                    | Prevents docs and training from drifting.                                                                                    | All lanes           |
| Confirm Gmail Inbox 0 starts with Dan's whole mailbox.                                                                                         | Defines Gmail scan, label, and privacy scope.                                                                                | Gmail Inbox 0       |
| Confirm Lease Renewal Agent integration scope.                                                                                                 | Identifies the systems, writes, and approvals needed.                                                                        | Lease Renewal Agent |
| Name product owners and acceptance reviewers.                                                                                                  | Needed for approvals, training, and cutover signoff.                                                                         | All lanes           |
| Confirm migration/cutover should be the next step once local readiness is green.                                                               | Prevents extra local feature loops from delaying production decisions.                                                       | All lanes           |
| Confirm later User list and process-specific approvers.                                                                                        | Determines who can use workflows and who approves edge cases.                                                                | All lanes           |
| Confirm initial delegated approvers beyond Dan/Josiah, if any.                                                                                 | Later approver changes should be manageable in the Admin console.                                                            | All lanes           |
| Confirm whether an outside maintenance worker ever needs an authenticated login; default is no outside login and continued HMAC public intake. | The current `pmikcmetro.com` boundary permits scoped staff sub-users but intentionally excludes third-party vendor accounts. | Maintenance         |

## Access And Accounts

| Ask                       | Exact client action                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google Workspace admin    | Grant or schedule admin support for auth domains, Gmail labels/filters, and Drive sharing.                                                                                                  |
| GCP/Firebase project      | Create or grant access to a PMI KC-owned project with billing enabled.                                                                                                                      |
| Firebase Auth             | Approve allowed Workspace domain and test users.                                                                                                                                            |
| Drive source folders      | Source drop zone is created and shared; add source material and confirm which folders/files are approved for KB and renewal material.                                                       |
| Gmail Inbox 0 test access | Provide Dan-approved Dan mailbox scan/testing approach: live supervised account, safe test threads, or sanitized export.                                                                    |
| Approval notifications    | Provision `kb-automation@pmikcmetro.com` for in-app/internal-email approval notifications with one email retry and Dan/Josiah escalation after retry failure.                               |
| Deployment domain         | Provide the production URL/domain or approve the Cloud Run URL.                                                                                                                             |
| Secret ownership          | Name who owns production and staging Secret Manager access, API-key custody, key rotation, break-glass access, and revocation for each approved environment when integrations are approved. |
| Tool credential rotation  | Josiah-owned follow-up for now; do not include in Dan's current source/walkthrough email thread.                                                                                            |
| Signed lease system       | Identify where signed leases live and how lease end dates can be read safely.                                                                                                               |
| Renewal walkthrough       | Provide both a recorded walkthrough and a supervised Chrome session, either as a client-led show-and-tell or by showing Josiah so he can capture workflow data.                             |
| Renewal source location   | Use the shared `Lease Renewals` source-drop-zone folder for captured workflow notes unless setup identifies a better client-accessible app-connected source.                                |
| Renewal source access     | Grant the whole PMI KC team direct edit access to the initial Lease Renewal source-of-truth folder.                                                                                         |
| Renewal source curation   | Let Dan set the review cadence and test the simplest low-cost copy path for all useful source file types from Drive into Cloud Storage plus Agent Search periodic ingestion.                |
| Renewal source hygiene    | Move non-sources-of-truth out of the Lease Renewal source folder and identify where non-source, reference, or archive material should live.                                                 |
| Maintenance intake source | Identify where tenant maintenance requests and phone notes live.                                                                                                                            |

## Source Material

| Ask                   | Exact client action                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approved KB sources   | Add approved SOPs, templates, checklists, and policies by Space to the shared source drop zone.                                                                             |
| Lease renewal sources | Add the walkthrough recording, client context, team notes, renewal notices, timing rules, communication examples, exception rules, and approval owners to `Lease Renewals`. |
| Gmail Inbox 0 sources | Add approved reply patterns, tone examples, routing rules, label examples, and unsupported cases to `Gmail Inbox 0`.                                                        |
| Sensitivity review    | Mark high-sensitivity sources that must not be indexed or committed.                                                                                                        |
| Missing facts         | Answer open questions or explicitly approve placeholders.                                                                                                                   |

## Product Definition Follow-Ups

| Product             | Exact client answer needed                                                                                                                                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PMI KC KB           | Which source folders feed Lease Renewals, Maintenance Work Order Intake, Move-Out + Deposit Disposition, and Owner Onboarding?                                                                                                                           |
| Lease Renewal Agent | Which starter renewal materials should go into the source-of-truth folder first?                                                                                                                                                                         |
| Lease Renewal Agent | Which Google Drive folder should captured Lease Renewal workflow notes live in first, unless setup selects a better source?                                                                                                                              |
| Lease Renewal Agent | Which people are included in the initial whole-team edit group for the Lease Renewal source-of-truth folder?                                                                                                                                             |
| Lease Renewal Agent | Which systems expose signed lease/dates, tenant/property facts, owner information, current rent/terms, and renewal timeline when integration scoping begins?                                                                                             |
| Lease Renewal Agent | Which approved edit/add-resource path should missing facts link to: in-place process edit, Drive/source folder add, or another source path?                                                                                                              |
| Lease Renewal Agent | Does a simple low-cost copy automation handle all useful source file types from Drive, with conversion or visible skips when needed?                                                                                                                     |
| Lease Renewal Agent | Where should non-source, reference, or archive material live outside the Lease Renewal source folder?                                                                                                                                                    |
| Lease Renewal Agent | Which target-system/action-type pairs can be approved for future executable external actions?                                                                                                                                                            |
| Lease Renewal Agent | Which external systems later need mirrored workflow-run state from the KB-owned central workflow record?                                                                                                                                                 |
| Lease Renewal Agent | Who, if anyone, should be added as an initial delegated approver beyond Dan and Josiah in the Admin console?                                                                                                                                             |
| Lease Renewal Agent | Which people or groups should receive internal workflow notification emails beyond the default owner/final approver and next-action assignee?                                                                                                            |
| Maintenance         | Which tools, services, connections, and chatbot/phone system should support intake when Maintenance scoping begins?                                                                                                                                      |
| Maintenance         | Who approves common issue templates and escalation rules?                                                                                                                                                                                                |
| Move-Out            | Where does the security-deposit ledger of record live (Move-Out Q4)? The V1 desk surfaces a `Needs Verification:` pointer for it until Dan confirms; deposit postings stay manual (QuickBooks read-only-at-most).                                        |
| Move-Out            | What dollar threshold requires owner approval for a repair/bid before it is deducted (Move-Out Q5)? The V1 evidence packet renders it as a `Needs Verification:` placeholder; no number is invented and the suggested deduction is owner-approval-gated. |
| Gmail Inbox 0       | What Dan mailbox scan model is approved, and may approved rules back-label historical threads?                                                                                                                                                           |
| Gmail Inbox 0       | Which Gmail draft/reply capabilities are allowed while Dan still presses Send?                                                                                                                                                                           |
| Gmail Inbox 0       | Discovery 1: When Dan opens his inbox, what 3-5 piles does he mentally sort mail into? (Defines the label taxonomy; see `docs/products/gmail-inbox-zero.md`.)                                                                                            |
| Gmail Inbox 0       | Discovery 2: Which kinds of emails does Dan reply to the same way most of the time? (Defines the first safe auto-draft templates.)                                                                                                                       |
| Gmail Inbox 0       | Discovery 3: Which emails must never be auto-touched? (Defines hard exclusions: owner-money, legal/notices, tenant disputes -> label only.)                                                                                                              |
| Gmail Inbox 0       | Discovery 4: How does Dan currently know an email is stuck waiting on someone, and on whom? (Defines follow-up/aging logic and waiting parties.)                                                                                                         |

## Testing And Training

| Ask                      | Exact client action                                                             |
| ------------------------ | ------------------------------------------------------------------------------- |
| Test users               | Use Josiah and Dan as initial Admin smoke users; add User tests when delegated. |
| Acceptance scenarios     | Provide real but safe scenarios for KB, renewals, and owner-email workflows.    |
| Training attendees       | Name who must be trained for each product.                                      |
| Production support owner | Name who watches the products after launch and reports issues.                  |

## Current Blockers

- KB production migration is waiting on Google Cloud free-trial/billing/project setup,
  approved client-owned resources, production source material in the shared drop zone,
  auth domains, role assignments, and source/data-store maps.
- Once local readiness evidence is green, the remaining KB work should move to
  client-owned migration/cutover prep rather than additional speculative local feature
  cycles.
- Lease Renewal Agent runtime scope is waiting on the full walkthrough, signed
  lease/date source location, QuickBooks access status, Google Sheets scope, and future
  approval of read/write permissions. The RentVine credential is used as-is (owner
  decision 2026-06-20; not rotated; loaded from env/Secret Manager, kept out of git).
- Gmail Inbox 0 live Gmail setup is waiting on Dan approval of the safe test-thread
  model and later Gmail access/scope decisions.
- Any request involving raw customer records, ledgers, bank data, SSNs, full lease
  packets, or live Gmail content must be handled outside git.
