# Client checklist

Updated: 2026-07-15.

This is the client-facing list of inputs that improve content or activate a specific Live provider.
It is **not** a list of conditions that must all be answered before the production application can be
V1. The stable app includes side-by-side Live and isolated Test workflows; Test Lease, Maintenance,
and Vendor journeys write app-owned state to Firestore, reach Done/Closed, and contact no external
providers.

Use `docs/v1-client-unblock-checklist-2026-07-14.md` for the exact process and recommended default,
and `docs/environment-handoff.md` for non-secret project/owner/location records. Do not place
credentials, customer records, Gmail bodies, setup links, passwords, TOTP secrets, OAuth codes, or
tokens in this repository.

## Completed without another client decision

- Deploy and verify the production Live/Test application.
- Firebase Email/Password, TOTP, and the authorized production domain were verified/enabled on
  2026-07-15; run the deployed Vendor acceptance after release.
- Seed and complete the canonical Test Maintenance workflow:
  `unit:test-maple-204` (`TEST — 204 Maple Court Unit 2`).
- Create and complete a persistent Test Lease renewal with all 11 explicit action receipts and Done.
- Provision and disable the canonical Test Vendor:
  `vendor:test-summit-plumbing` (`Summit Plumbing Test Vendor`,
  `service@summit-plumbing.example.invalid`).
- Exercise app/Firestore writes and receipts through Done with zero provider calls.
- Use bounded manual retention cleanup; native TTL, extra indexes, and scheduling are optional.
- Accept the documented three Moderate dev-only dependency findings for V1 and recheck them by
  2026-08-15.

## Current client inputs

| Input                                                                                                                                           | Why it helps                                                  | Current safe default                                                                         | Does absence block app V1? |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------- |
| Add approved SOPs/templates/examples to the [shared source drop zone](https://drive.google.com/drive/folders/1arXww32LaPcIbFx_oONshbR62imiC8kq) | Improves KB coverage and workflow wording                     | Keep existing approved sources; unsupported questions show `No Reliable Source Found`        | No                         |
| Finish the tool-access sheet for QuickBooks and exact in-scope Sheets                                                                           | Enables account-specific Live integration planning            | Leave only the dependent provider actions unavailable                                        | No                         |
| Name authoritative tenant/owner/Vendor recipient fields                                                                                         | Activates new Live renewal/maintenance communications         | Use non-routable Test aliases in Test mode; no browser-entered address becomes authoritative | No                         |
| Provide a real Vendor mailbox when Live Vendor mail is wanted                                                                                   | Enables that Vendor's same-address OAuth connection           | Use Test Vendor password/TOTP and app-only mailbox                                           | No                         |
| Provide account API contracts/mappings for a selected provider action                                                                           | Allows that exact Live read/write to be configured and proven | Keep that action unavailable; complete the workflow in Test mode                             | No                         |
| Add approved source root/scanner policy when immediate publication is wanted                                                                    | Enables new production source publication                     | Existing approved KB remains usable; new publication fails closed                            | No                         |
| Confirm later staff roster/Space scopes                                                                                                         | Expands delegation beyond initial operators                   | Manage roles later from Admin                                                                | No                         |

R01–R09, the signed-lease location, lease-end source, renewal discovery walkthrough, risk-based
authority, human-confirmed sends, Vendor identity model, and product tab direction are already decided.
Do not ask the client to decide them again.

## Completed foundations

| Foundation                | State                                                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production cloud          | `pmi-kc-kb-prod`, billing, project-scoped budget controls, Firebase/Firestore, Cloud Run, runtime identity, and canonical host exist under `pmikcmetro.com`          |
| Internal Firebase sign-in | Managed-domain Google sign-in and initial Admin path are working; canonical host is the intended authorized domain                                                   |
| Gmail transport           | DWD readonly/compose/labels/modify, watch/Pub/Sub, and a synthetic self-thread reply were proven 2026-07-13; product use remains workflow-linked and exact-confirmed |
| Renewal system facts      | Executed leases are in Dotloop; lease timing/end date reads from RentVine `lease_end_date`                                                                           |
| Renewal discovery         | Live walkthrough held 2026-06-19; an exact-click follow-up is optional, not rediscovery                                                                              |
| Source collaboration      | Shared Drive drop zone exists and is shared; the team may add approved material over time                                                                            |
| Notifications             | In-app notifications are the V1 delivery path; legacy event-driven approval email stays disabled                                                                     |

## Provider activation requests

Ask only for the provider the client wants to turn on next. Each request should name one exact action,
not ask for broad or unnecessary access.

| Provider            | Ask for                                                                                                 | Never ask for or infer                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| RentVine            | Account endpoint/permission, exact property/unit/lease/Vendor/status mapping, conflict/version behavior | Guessed write endpoint or unconditional overwrite          |
| Google Sheets       | Sheet/tab, stable row key/column, DWD subject/permission, atomic conflict strategy                      | Customer rows in git or read-then-unconditional-write      |
| Gmail               | Authoritative linked recipient/thread fields, sender mailbox, exact approved artifact/label             | General inbox browsing, free-form compose, autonomous send |
| Vendor Google OAuth | Web client/redirect, exact four scopes, vault label, same routable Vendor mailbox                       | DWD, shared PMI mailbox, Admin consent on Vendor's behalf  |
| Dotloop             | Official/account API, profile/template/participant/document mapping, OAuth plan                         | UI/RPA endpoint inference                                  |
| LeadSimple          | Account endpoint/plan, process/stage/assignee mapping, conditional update contract                      | Guessed stages or unconditional stage overwrite            |
| QuickBooks          | OAuth/company/Vendor/account mapping and draft-only permission                                          | Post, approve, pay, bank, or ledger authority              |
| Boom/SMS            | Existing account/plan, mapping/consent/applicability and correction contract                            | Purchasing/selecting a provider by inference               |
| Drive               | Approved in-boundary photo folder, runtime permission, file/scanner policy                              | Replace/delete behavior or source-folder overreach         |

The first Live proof is one bounded, explicit, human-confirmed action with an idempotency key,
bodyless receipt, provider readback, and documented correction. A failed or ambiguous result is
reconciled before any second attempt.

## Vendor activation

The Test Vendor is part of V1 and needs only project-level Email/Password and TOTP. Admin provisioning
returns the password-setup link only in its confirmed response. If that response is closed before use,
Admin can exact-preview one replacement for the same reconciled `pending_setup` Test identity; neither
link is stored, cached, emailed, or externally delivered. The Test user then enrolls TOTP, and
assigned-ticket/app-only mailbox behavior is proved without invitation delivery or OAuth.

A **Live** Vendor additionally requires:

- a routable real Vendor mailbox and assignment;
- delivery of the one-time setup link through an approved one-time channel;
- verified email and TOTP;
- a Google OAuth client with the exact redirect/four scopes;
- Secret Manager-backed token vault; and
- one same-address connect/read/exact-confirm/revoke proof.

These items activate that Vendor's Live mailbox. They do not hold the Test Vendor or the application
V1 state open.

## Source and training follow-ups

These are normal post-launch content/operations tasks:

- add approved KB, Lease Renewal, Maintenance, Move-Out, and Owner Onboarding material;
- identify the exact in-scope operating Sheets and archive/reference folder;
- name later Editors/approvers and training attendees;
- identify the production Maintenance intake sources when connecting them; and
- choose the next provider action to activate based on actual usage.

Missing material remains visibly missing; the application must not invent property-management policy.

## Conditional activation checklist

- [ ] If managed Google auth is stale, owner completes `npm run auth:session` interactively.
- [x] Email/Password is enabled with password required; TOTP is enabled with adjacent interval `1`.
- [x] The production host is present in Firebase authorized domains; Google sign-in remains enabled.
- [ ] If a selected Live action lacks credentials/contract/mapping, leave only that action unavailable
      and request the exact missing input.
- [ ] If a real Vendor Live mailbox is selected, obtain that Vendor's consent and vault configuration.

These are conditional operations, not current application blockers. Everything else continues with
the recommended Test or unavailable-provider default. No named
acceptance signature, TTL/index/scheduler activation, or all-provider activation requirement blocks
the working production V1 application.

Any request involving raw customer records, ledgers, bank data, SSNs, full lease packets, or live
Gmail content must be handled outside git.
