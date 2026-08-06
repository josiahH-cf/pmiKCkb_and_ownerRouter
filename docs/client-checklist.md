# Client checklist

Updated: 2026-08-03.

> **Active asks for the production phase live in `docs/client-asks-2026-07-29.md`.** That file
> carries the ready-to-send drafts and marks which items are owner self-serve versus an external
> ask, following the production-phase audit and owner direction on 2026-07-29
> (`F-PRODUCTION-PHASE-AUTHORIZED`). Use this file for the durable per-provider background; use
> the asks file for what to send now.

This is the client-facing list of inputs that improve content or activate a specific Live provider.
It is **not** a list of conditions that must all be answered before the application can progress.
The deployed Production application is Live-only at
`https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`. Rehearsal is local, resolves explicitly to Demo +
Live-read-only, and cannot execute persistence or provider effects. A hosted Demo project and product
fixture seeder are deferred and are not client asks.

Use `docs/environment-handoff.md` for current non-secret project/owner/location records and the
owning S40–S56 spec for current execution gates. The dated
`docs/v1-client-unblock-checklist-2026-07-14.md` preserves pre-S40 implementation history and is not
a current cloud/deploy runbook. Do not place credentials, customer records, Gmail bodies, setup
links, passwords, TOTP secrets, OAuth codes, or tokens in this repository.

## Completed without another client decision

- Deploy and verify Production Live-only on Cloud Run service `pmi-kc-app`, revision
  `pmi-kc-app-rmsd5ux3l-0b445f0442ea`; the old `pmi-kc-kb-demo` service is deleted and absent.
- Firebase Email/Password and TOTP were verified/enabled on 2026-07-15. The `pmi-kc-app` authorized
  domains were added and read back during S55 stage one on 2026-08-01; run deployed acceptance only
  for a selected real Live Vendor.
- Preserve the former Production Test Lease, Maintenance, and Vendor journeys as dated historical
  contract evidence; deterministic invented equivalents remain under automated tests/helpers only.
- Fence every former Test intake, remove exactly 90 explicit Test records behind a named backup and
  one-record restore drill, and independently prove zero across all 28 governed collections.
- Verify local rehearsal resolves exactly to `environmentKind:"demo"`,
  `dataContext:"live_readonly"`, and `source:"explicit"`, with durable writes and provider effects
  refused.
- Keep external Vendor principals out of the internal People and Access roster; they never inherit an
  internal role or the absent-scope/all-Spaces default.
- Keep synthetic Vendor identities, mailboxes, tickets, and receipts test-only; the product accepts
  real assigned Live Vendor identities only.
- Use bounded manual retention cleanup; native TTL, extra indexes, and scheduling are optional.
- Accept the documented three Moderate dev-only dependency findings for V1 and recheck them by
  2026-08-15.

## Current client inputs

| Input                                                                                                                                       | Why it helps                                       | Current safe default                                                                    | Absence blocks                 |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------ |
| Chasity’s exact updated renewal-template artifact through the approved publication channel                                                  | Activates S43 template-dependent output            | Build the versioned slot; show `Renewal template not supplied`; invent no copy          | Template-dependent output only |
| RentVine resident portal/text interactive invitation, reply/webhook semantics, and account mapping                                          | Activates S47’s preferred resident channel         | Complete tokenized web intake/staff review and adapter seam; guess no endpoint          | RentVine resident channel only |
| Verified exact provider record URL contracts where available                                                                                | Enhances S44 exact backlinks                       | Use reviewed generic provider front doors labeled `Exact record link unavailable`       | Exact-link enhancement only    |
| Approved SOPs/templates/examples in the [shared source drop zone](https://drive.google.com/drive/folders/1arXww32LaPcIbFx_oONshbR62imiC8kq) | Improves KB/workflow wording                       | Keep approved sources; unsupported questions say `No Reliable Source Found`             | No                             |
| Finished tool-access sheet for QuickBooks and exact in-scope Sheets                                                                         | Enables account-specific Live integration planning | Leave only dependent provider actions unavailable                                       | Selected action only           |
| Authoritative tenant/owner/Vendor recipient fields                                                                                          | Activates Live communications                      | Leave the action unavailable; browser-entered or test addresses are never authoritative | Selected action only           |
| Real Vendor mailbox when Live Vendor mail is wanted                                                                                         | Enables that Vendor’s same-address OAuth           | Keep that Live mailbox action unavailable; synthetic mailboxes remain test-only         | That Vendor mailbox only       |
| Account API contract/mapping for a selected provider action                                                                                 | Allows that exact Live action to be proven         | Keep that action unavailable; use local effect refusal and automated contract tests     | Selected action only           |
| Approved source root/scanner policy when immediate publication is wanted                                                                    | Enables a new production source                    | Existing approved KB remains usable; new publication fails closed                       | New source only                |
| Later staff roster/Space scopes                                                                                                             | Expands delegation                                 | Manage roles later from Admin                                                           | No                             |

R01–R09, the signed-lease location, lease-end source, renewal discovery walkthrough, risk-based
authority, human-confirmed sends, Vendor identity model, and product tab direction are already decided.
Do not ask the client to decide them again.

## Completed foundations

| Foundation                | State                                                                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Production cloud          | `pmi-kc-kb-prod`, billing, project-scoped budget controls, Firebase/Firestore, runtime identity, and Live-only Cloud Run service `pmi-kc-app` exist under `pmikcmetro.com`; canonical host is `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app` |
| Internal Firebase sign-in | Managed-domain Google sign-in and initial Admin path are working; the canonical `pmi-kc-app` host is authorized                                                                                                                            |
| Gmail transport           | DWD readonly/compose/labels/modify, watch/Pub/Sub, and a synthetic self-thread reply were proven 2026-07-13; product use remains workflow-linked and exact-confirmed                                                                       |
| Renewal system facts      | Executed leases are in Dotloop; lease timing/end date reads from RentVine `lease_end_date`                                                                                                                                                 |
| Renewal discovery         | Live walkthrough held 2026-06-19; an exact-click follow-up is optional, not rediscovery                                                                                                                                                    |
| Source collaboration      | Shared Drive drop zone exists and is shared; the team may add approved material over time                                                                                                                                                  |
| Notifications             | In-app notifications are the V1 delivery path; legacy event-driven approval email stays disabled                                                                                                                                           |

## Provider activation requests

Ask only for the provider the client wants to turn on next. Each request should name one exact action,
not ask for broad or unnecessary access.

| Provider            | Ask for                                                                                                                                                                                                  | Never ask for or infer                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| RentVine            | Account endpoint/permission, exact property/unit/lease/Vendor/status mapping, conflict/version behavior; resident portal/text invitation plus interactive reply/webhook semantics                        | Guessed write/resident endpoint or unconditional overwrite                            |
| RentCast            | Exact active API plan and its real monthly allowance/overage read back from the account (the published API Terms already permit caching, storage, and owner-facing display, `Q-RENTCAST-PLAN-TERMS`); an ACTIVE API subscription — the placed key answers 403 until the plan is activated in the dashboard (`Q-RENTCAST-ACCOUNT-403`)                                | Sizing the hard quota stop from assumed figures, or the gate flip before a working smoke |
| Google Sheets       | Sheet/tab, stable row key/column, DWD subject/permission, atomic conflict strategy                                                                                                                       | Customer rows in git or read-then-unconditional-write                                 |
| Gmail               | Authoritative linked recipient/thread fields, sender mailbox, exact approved artifact/label                                                                                                              | General inbox browsing, free-form compose, autonomous send                            |
| Vendor Google OAuth | Web client/redirect, exact four scopes, vault label, same routable Vendor mailbox                                                                                                                        | DWD, shared PMI mailbox, Admin consent on Vendor's behalf                             |
| Dotloop             | Official/account API, profile/template/participant/document mapping, OAuth plan                                                                                                                          | UI/RPA endpoint inference                                                             |
| LeadSimple          | Account endpoint/plan, process/stage/assignee mapping, conditional update contract                                                                                                                       | Guessed stages or unconditional stage overwrite                                       |
| QuickBooks          | OAuth/company/Vendor/account mapping and draft-only permission                                                                                                                                           | Post, approve, pay, bank, or ledger authority                                         |
| Boom/SMS            | Existing account/plan, mapping/consent/applicability and correction contract                                                                                                                             | Purchasing/selecting a provider by inference                                          |
| Drive               | Approved in-boundary photo folder, runtime permission, file/scanner policy                                                                                                                               | Replace/delete behavior or source-folder overreach                                    |

RentCast, resolved 2026-08-06 (`Q-RENTCAST-PLAN-TERMS`): the published
[API Terms of Use](https://www.rentcast.io/terms-api) expressly grant the right to store, cache,
display, and distribute the API data, with no attribution requirement and no stated retention
limit, so S59's caching and S60's owner-facing display are permitted. What remains owner-confirmed
at the account: an ACTIVE API subscription (the placed key answers 403 until the plan is activated
in the dashboard, `Q-RENTCAST-ACCOUNT-403`) and the plan's real allowance and overage figures
(AC-S59-14), which size the app-side hard quota stop. Until then the RentCast action stays gated;
manual comp entry continues.

The first Live proof is one bounded, explicit, human-confirmed action with an idempotency key,
bodyless receipt, provider readback, and documented correction. A failed or ambiguous result is
reconciled before any second attempt.

## Vendor activation

The former invented Product Test Vendor lifecycle is dated implementation evidence, not a current
product identity. Synthetic Vendor users, mailboxes, ticket assignments, and receipts now exist only
in deterministic automated tests/helpers. Do not provision or reset one in Production or create a
hosted Demo environment for it.

The Live Vendor seam accepts only a real, assigned Vendor identity, but its invite,
assignment-change, and disable keys remain Production-closed until a named Vendor and protected
per-key activation review. When activated, Admin exact-previews and confirms the invite; it uses a
deterministic Firebase identity, exact Gmail Message-ID/recipient readback, a one-time
fragment-to-body setup challenge, and generation-bound reissue/recovery. Setup challenges,
passwords, TOTP material, OAuth codes, and mailbox content never enter git or evidence. A failed
lifecycle remains fail-closed and cannot inherit internal staff access.

A **Live** Vendor additionally requires:

- a routable real Vendor mailbox and assignment;
- delivery through the exact governed Gmail invite action;
- verified email and TOTP;
- a Google OAuth client with the exact redirect/four scopes;
- Secret Manager-backed token vault; and
- one same-address connect/read/exact-confirm/revoke proof.

These items activate that Vendor's Live mailbox. They do not hold the application or another
provider action open.

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
- [x] Production is Live-only; the retired Test records are zero across the governed catalog and no
      serving route can recreate them.
- [x] Local rehearsal is explicit Demo + Live-read-only and effect-refused. Hosted Demo resources and
      a fixture seeder are deferred; do not request or provision them.
- [ ] For S43 template activation, Chasity supplies the exact updated artifact through the approved
      publication channel.
- [ ] For S47 RentVine-channel activation, vendor/owner confirms the exact interactive endpoint,
      webhook/reply semantics, and account mapping.
- [ ] If a selected Live action lacks credentials/contract/mapping, leave only that action unavailable
      and request the exact missing input.
- [ ] If a real Vendor Live mailbox is selected, obtain that Vendor's consent and vault configuration.

These are conditional operations, not broad application blockers. Everything else continues with
the local Live-read-only/app-plane or unavailable-provider default. No named
acceptance signature, TTL/index/scheduler activation, or all-provider activation requirement blocks
the working production V1 application.

Any request involving raw customer records, ledgers, bank data, SSNs, full lease packets, or live
Gmail content must be handled outside git.
