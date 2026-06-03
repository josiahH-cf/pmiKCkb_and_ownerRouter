# Client Checklist

This checklist names what PMI KC must purchase, provision, answer, or approve before
engineering can complete production work. Do not put credentials or customer records in
this repo; record only names, owners, decisions, and non-secret identifiers.

## Decisions To Confirm

| Ask                                                                         | Why it matters                                              | Needed for          |
| --------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------- |
| Confirm final product names: PMI KC KB, Lease Renewal Agent, Gmail Inbox 0. | Prevents docs and training from drifting.                   | All lanes           |
| Confirm Gmail Inbox 0 v1 is owner-email-first.                              | Defines Gmail labels, filters, examples, and access.        | Gmail Inbox 0       |
| Confirm Lease Renewal Agent v1 scope.                                       | Prevents reusing the KB demo as a product spec by accident. | Lease Renewal Agent |
| Name product owners and acceptance reviewers.                               | Needed for approvals, training, and cutover signoff.        | All lanes           |
| Confirm go-live sequencing.                                                 | Determines which access and tests are critical first.       | All lanes           |

## Access And Accounts

| Ask                       | Exact client action                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Google Workspace admin    | Grant or schedule admin support for auth domains, Gmail labels/filters, and Drive sharing.                  |
| GCP/Firebase project      | Create or grant access to a PMI KC-owned project with billing enabled.                                      |
| Firebase Auth             | Approve allowed Workspace domain and test users.                                                            |
| Drive source folders      | Provide approved source folder names/owners for KB and renewal material.                                    |
| Gmail Inbox 0 test access | Provide Dan/Bailey-approved test approach: live supervised account, safe test threads, or sanitized export. |
| Sender/recipient decision | Approve whether KB approval notifications use Gmail send-only or remain disabled.                           |
| Deployment domain         | Provide the production URL/domain or approve the Cloud Run URL.                                             |

## Source Material

| Ask                   | Exact client action                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Approved KB sources   | Provide approved SOPs, templates, checklists, and policies by Space.                                                  |
| Lease renewal sources | Provide renewal notices, timing rules, owner/tenant communication examples, exception rules, and approval owners.     |
| Gmail Inbox 0 sources | Provide approved owner-email reply patterns, tone examples, routing rules, owner sender rules, and unsupported cases. |
| Sensitivity review    | Mark high-sensitivity sources that must not be indexed or committed.                                                  |
| Missing facts         | Answer open questions or explicitly approve placeholders.                                                             |

## Testing And Training

| Ask                      | Exact client action                                                          |
| ------------------------ | ---------------------------------------------------------------------------- |
| Test users               | Name Admin, Approver, Editor, and Viewer-style users for smoke tests.        |
| Acceptance scenarios     | Provide real but safe scenarios for KB, renewals, and owner-email workflows. |
| Training attendees       | Name who must be trained for each product.                                   |
| Production support owner | Name who watches the products after launch and reports issues.               |

## Current Blockers

- No Lease Renewal Agent runtime scope is approved yet.
- Gmail Inbox 0 live Gmail setup needs Dan/Bailey approval and a safe testing plan.
- KB production still needs PMI KC-owned project access, production sources, auth
  domains, role assignments, and source/data-store maps.
- Any request involving raw customer records, ledgers, bank data, SSNs, full lease
  packets, or live Gmail content must be handled outside git.
