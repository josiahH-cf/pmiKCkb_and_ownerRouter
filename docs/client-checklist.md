# Client checklist

Updated: 2026-07-30.

> **Active asks for the production phase live in `docs/client-asks-2026-07-29.md`.** That file
> carries the ready-to-send drafts and marks which items are owner self-serve versus an external
> ask, following the production-phase audit and owner direction on 2026-07-29
> (`F-PRODUCTION-PHASE-AUTHORIZED`). Use this file for the durable per-provider background; use
> the asks file for what to send now.

This is the client-facing list of inputs that improve content or activate a specific Live provider.
It is **not** a list of conditions that must all be answered before the application can progress.
The current deployed app has verified Live+Test evidence; S40’s authorized target moves realistic
invented workflows into an independent Demo environment and makes Production Live-only.

Use `docs/environment-handoff.md` for current non-secret project/owner/location records and the
owning S40–S54 spec for current execution gates. The dated
`docs/v1-client-unblock-checklist-2026-07-14.md` preserves pre-S40 implementation history and is not
a current cloud/deploy runbook. Do not place credentials, customer records, Gmail bodies, setup
links, passwords, TOTP secrets, OAuth codes, or tokens in this repository.

## Completed without another client decision

- Deploy and verify the historical production Live/Test application (current baseline only).
- Firebase Email/Password, TOTP, and the authorized production domain were verified/enabled on
  2026-07-15; run the deployed Vendor acceptance after release.
- Seed and complete the canonical Test Maintenance workflow:
  `unit:test-maple-204` (`TEST — 204 Maple Court Unit 2`).
- Create and complete a persistent Test Lease renewal with all 11 explicit action receipts and Done.
- Provision, disable, and safely reset/re-enable the canonical Test Vendor:
  `vendor:test-summit-plumbing` (`Summit Plumbing Test Vendor`,
  `service@summit-plumbing.example.invalid`).
- Keep external Vendor principals out of the internal People and Access roster; they never inherit an
  internal role or the absent-scope/all-Spaces default.
- Exercise app/Firestore writes and receipts through Done with zero provider calls.
- Use bounded manual retention cleanup; native TTL, extra indexes, and scheduling are optional.
- Accept the documented three Moderate dev-only dependency findings for V1 and recheck them by
  2026-08-15.

## Current client inputs

| Input                                                                                                                                       | Why it helps                                       | Current safe default                                                                     | Absence blocks                 |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------ |
| Exact independent Demo project/service/database/storage/queue/OAuth/runtime identity values                                                 | Activates S40 environment separation               | Build a validated parameterized manifest; never infer from the Production service name   | Demo provisioning/cutover only |
| Chasity’s exact updated renewal-template artifact through the approved publication channel                                                  | Activates S43 template-dependent output            | Build the versioned slot; show `Renewal template not supplied`; invent no copy           | Template-dependent output only |
| RentVine resident portal/text interactive invitation, reply/webhook semantics, and account mapping                                          | Activates S47’s preferred resident channel         | Complete tokenized web intake/staff review and adapter seam; guess no endpoint           | RentVine resident channel only |
| Verified exact provider record URL contracts where available                                                                                | Enhances S44 exact backlinks                       | Use reviewed generic provider front doors labeled `Exact record link unavailable`        | Exact-link enhancement only    |
| Approved SOPs/templates/examples in the [shared source drop zone](https://drive.google.com/drive/folders/1arXww32LaPcIbFx_oONshbR62imiC8kq) | Improves KB/workflow wording                       | Keep approved sources; unsupported questions say `No Reliable Source Found`              | No                             |
| Finished tool-access sheet for QuickBooks and exact in-scope Sheets                                                                         | Enables account-specific Live integration planning | Leave only dependent provider actions unavailable                                        | Selected action only           |
| Authoritative tenant/owner/Vendor recipient fields                                                                                          | Activates Live communications                      | Use non-routable Demo aliases in Demo; browser-entered addresses are never authoritative | Selected action only           |
| Real Vendor mailbox when Live Vendor mail is wanted                                                                                         | Enables that Vendor’s same-address OAuth           | Use Demo Vendor password/TOTP and Demo-owned mailbox after S40                           | That Vendor mailbox only       |
| Account API contract/mapping for a selected provider action                                                                                 | Allows that exact Live action to be proven         | Keep that action unavailable; complete the product workflow in Demo                      | Selected action only           |
| Approved source root/scanner policy when immediate publication is wanted                                                                    | Enables a new production source                    | Existing approved KB remains usable; new publication fails closed                        | New source only                |
| Later staff roster/Space scopes                                                                                                             | Expands delegation                                 | Manage roles later from Admin                                                            | No                             |

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

| Provider            | Ask for                                                                                                                                                                                                  | Never ask for or infer                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| RentVine            | Account endpoint/permission, exact property/unit/lease/Vendor/status mapping, conflict/version behavior; resident portal/text invitation plus interactive reply/webhook semantics                        | Guessed write/resident endpoint or unconditional overwrite                            |
| RentCast            | Exact active API plan, monthly request allowance/overage, and confirmation that applicable plan and third-party-data terms permit storing/caching comp responses and displaying them to a property owner | Account-specific permission from public terms, or S28b activation before confirmation |
| Google Sheets       | Sheet/tab, stable row key/column, DWD subject/permission, atomic conflict strategy                                                                                                                       | Customer rows in git or read-then-unconditional-write                                 |
| Gmail               | Authoritative linked recipient/thread fields, sender mailbox, exact approved artifact/label                                                                                                              | General inbox browsing, free-form compose, autonomous send                            |
| Vendor Google OAuth | Web client/redirect, exact four scopes, vault label, same routable Vendor mailbox                                                                                                                        | DWD, shared PMI mailbox, Admin consent on Vendor's behalf                             |
| Dotloop             | Official/account API, profile/template/participant/document mapping, OAuth plan                                                                                                                          | UI/RPA endpoint inference                                                             |
| LeadSimple          | Account endpoint/plan, process/stage/assignee mapping, conditional update contract                                                                                                                       | Guessed stages or unconditional stage overwrite                                       |
| QuickBooks          | OAuth/company/Vendor/account mapping and draft-only permission                                                                                                                                           | Post, approve, pay, bank, or ledger authority                                         |
| Boom/SMS            | Existing account/plan, mapping/consent/applicability and correction contract                                                                                                                             | Purchasing/selecting a provider by inference                                          |
| Drive               | Approved in-boundary photo folder, runtime permission, file/scanner policy                                                                                                                               | Replace/delete behavior or source-folder overreach                                    |

RentCast confirm-with-default: the public [API terms](https://www.rentcast.io/terms-api) generally
permit storage, display, and distribution, while the
[billing guidance](https://developers.rentcast.io/reference/billing-and-pricing) makes the request
allowance and overage plan-specific. The exact PMI subscription and any applicable third-party-data
conditions for owner-facing storage/display/caching remain Needs Verification. Until confirmed,
S28b remains unavailable; manual comp entry and dependency-independent app-plane work continue.

The first Live proof is one bounded, explicit, human-confirmed action with an idempotency key,
bodyless receipt, provider readback, and documented correction. A failed or ambiguous result is
reconciled before any second attempt.

## Vendor activation

The canonical invented Vendor is verified current behavior and moves to Demo under S40. It needs only
Demo-project Email/Password and TOTP. Admin returns the password-setup link only in its confirmed
response. If that response is closed before use, Admin can exact-preview one replacement for the
same reconciled `pending_setup` Demo identity; neither link is stored, cached, emailed, or externally
delivered. The Demo user then enrolls TOTP, and assigned-ticket/app-mailbox behavior is proved
without invitation delivery or OAuth.

No client decision or provider approval is needed to reset this canonical Demo identity. From
`pending_setup`, `active`, or `disabled`, an Admin supplies a reason and exact-confirms the current
UID/status/invite-version preview. The app rotates the Firebase UID, invalidates the old password,
TOTP factors, sessions, action links, and UID-bound confirmations, while preserving the stable Vendor
id, Demo tickets, assignments, mailbox history, and receipts. It returns one response-only setup link
and leaves the Vendor `pending_setup` until a fresh password/TOTP journey succeeds. Any partial failure
stays disabled; the reset makes no Live, delivery, OAuth, vault, provider, or Registry change.

A **Live** Vendor additionally requires:

- a routable real Vendor mailbox and assignment;
- delivery of the one-time setup link through an approved one-time channel;
- verified email and TOTP;
- a Google OAuth client with the exact redirect/four scopes;
- Secret Manager-backed token vault; and
- one same-address connect/read/exact-confirm/revoke proof.

These items activate that Vendor's Live mailbox. They do not hold the Demo Vendor or the application
open.

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
- [ ] For S40 activation, owner supplies/approves exact independent Demo resource identifiers and
      runs the green project/service/Auth/IAM/billing and destructive-migration packet. After those
      resources exist, the runner performs the routine revision deploy, candidate smoke,
      exact-revision promotion, and rollback under D05.
- [ ] For S43 template activation, Chasity supplies the exact updated artifact through the approved
      publication channel.
- [ ] For S47 RentVine-channel activation, vendor/owner confirms the exact interactive endpoint,
      webhook/reply semantics, and account mapping.
- [ ] If a selected Live action lacks credentials/contract/mapping, leave only that action unavailable
      and request the exact missing input.
- [ ] If a real Vendor Live mailbox is selected, obtain that Vendor's consent and vault configuration.

These are conditional operations, not broad application blockers. Everything else continues with
the recommended Demo/app-plane or unavailable-provider default. No named
acceptance signature, TTL/index/scheduler activation, or all-provider activation requirement blocks
the working production V1 application.

Any request involving raw customer records, ledgers, bank data, SSNs, full lease packets, or live
Gmail content must be handled outside git.
