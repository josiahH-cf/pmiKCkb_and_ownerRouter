# Voice and audience

Updated: 2026-08-26.

## Audience

- PMI KC operators and property managers are operational experts, not engineers. They need a clear
  next action, trustworthy status, and no ambiguity about whether a control is real.
- Admins manage connections, policy, approvals, and rollback. Show useful technical detail only when
  it supports a decision.
- Vendors see only their assigned work and need plain scope/status language.
- Residents use a short, calm, mobile-first intake flow that never implies diagnosis, liability, or
  an automatic charge.
- Owner, resident, and Vendor communication must read like a careful property manager wrote it and
  preserve human review.

## Copy rules

- Use plain, confident, present-tense sentences that say what is true now.
- In body copy, call the product “the app.” Reserve product names for navigation/header context.
- Say what a control reads, checks, drafts, or changes. Avoid abstract value language.
- Remove unavailable/dead controls instead of promising a future release.
- Make uncertainty explicit and actionable: use Needs Verification and name the missing input.
- Never imply that a credential, connection, or button grants write/send authority.
- Renewal and maintenance notices say `Draft — Review before sending` and never imply they were sent.
- Use no em dash in operator/client copy except the required draft banner. An en dash is acceptable
  for numeric ranges.
- Errors and empty states describe the safe next step without raw stack/provider jargon.
- Use the provider spelling `RentVine`.

## Operator-language map

| Internal term                            | Operator wording                               |
| ---------------------------------------- | ---------------------------------------------- |
| source of truth                          | leases, tenants, rent, or the named source     |
| `production_allowed` / Registry eligible | Available / Review connection                  |
| raw reconciliation                       | Compare sources                                |
| bodyless receipt                         | Activity record                                |
| system-of-record write                   | the exact provider change                      |
| Demo/Test mode                           | Local rehearsal                                |
| synthetic fixture                        | automated-test data (never show in Production) |
| control plane                            | say what the page reads, checks, or changes    |

Technical values may appear in Admin diagnostics when they are necessary to investigate a problem.
They do not belong in the daily operator, Vendor, resident, or client-facing surface.
