# Research Backlog

This backlog tracks missing facts and integration questions. Move an item into a product
plan only after it is answered or explicitly accepted as an assumption.

## Cross-Product

| Question                                                                                  | Product | Current status        | Owner  |
| ----------------------------------------------------------------------------------------- | ------- | --------------------- | ------ |
| What is the production launch sequence across KB, Lease Renewal Agent, and Gmail Inbox 0? | All     | Needs client decision | Client |
| Which PMI KC users approve product behavior and source wording?                           | All     | Needs names           | Client |
| What client-owned Google project, domain, and billing account will be used?               | All     | Blocked on access     | Client |
| What production monitoring and support owner will watch post-cutover issues?              | All     | Needs owner           | Client |

## PMI KC KB

| Question                                                         | Current status                     |
| ---------------------------------------------------------------- | ---------------------------------- |
| Which approved production sources feed each Space?               | Blocked on client source inventory |
| Which sources are high sensitivity and excluded from retrieval?  | Blocked on client review           |
| Will KB approval Gmail notifications launch enabled or disabled? | Needs sender/recipient decision    |
| What production domain should be authorized in Firebase Auth?    | Needs deployment decision          |
| Who receives Admin, Approver, and Editor roles?                  | Needs client user list             |

## Lease Renewal Agent

| Question                                                                                         | Current status            |
| ------------------------------------------------------------------------------------------------ | ------------------------- |
| What exact job should the agent perform that the KB Lease Renewals Space does not already cover? | Needs discovery           |
| What starts a renewal workflow: date, system event, manual request, email, or report?            | Needs discovery           |
| Which systems may be read, and are any writes ever allowed?                                      | Needs explicit approval   |
| Who approves owner-facing and tenant-facing renewal communications?                              | Needs client decision     |
| What are the non-negotiable legal, fee, notice, and exception rules?                             | Needs approved sources    |
| What counts as a successful renewal handoff?                                                     | Needs acceptance criteria |

## Gmail Inbox 0

| Question                                                                     | Current status                                     |
| ---------------------------------------------------------------------------- | -------------------------------------------------- |
| Are the nine Owner Router labels still the approved Gmail Inbox 0 v1 states? | Needs confirmation during setup                    |
| Which owner senders/domains should enter the v1 queue?                       | Needs Dan/Bailey source list                       |
| How will live Gmail testing happen safely?                                   | Needs client-approved test plan                    |
| Are Gemini Gems available in the target Workspace plan?                      | Needs Workspace verification                       |
| Who may apply labels and who may send replies?                               | Owner-email-first assumption; needs final approval |
| What owner-email cases are out of scope for v1?                              | Needs approved unsupported-case list               |
