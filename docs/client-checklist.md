# Client Checklist

This checklist names what PMI KC must purchase, provision, answer, or approve before
engineering can complete production work. Do not put credentials or customer records in
this repo; record only names, owners, decisions, and non-secret identifiers.

Use `docs/environment-handoff.md` to track non-secret environment identifiers, secret
ownership, manual setup status, and verification evidence after these asks are answered.

## Current Outbound Asks

R01–R09 are answered. These are the remaining operational/provider inputs after the final Round 3
contract. Implementation runs from `docs/v1-gap-implementation-program-2026-07-14.md`; do not ask the
owner to reclassify settled actions. Do not paste credentials, source records, live Gmail content,
leases, or tool secrets into this repo.

| Ask                         | Exact client action                                                                                                                                                                                                                     | Needed for                                          | Status                                                                                                                            | Verification after unblock                                                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source drop zone fill       | Add process docs, notes, examples, templates, screenshots, and useful context to the shared Drive source drop zone created by Josiah.                                                                                                   | KB production source readiness and product scoping. | Folder created/shared: <https://drive.google.com/drive/folders/1arXww32LaPcIbFx_oONshbR62imiC8kq>; awaiting team content.         | Convert approved source material into source manifests/readiness checks.                                                                                     |
| Tool access spreadsheet     | Fill in tool, available access type, location, and notes for RentVine, LeadSimple, DotLoop, QuickBooks, Boom, Google Sheets including which sheets, and any missing tools.                                                              | Integration capability classification.              | Partially received: RentVine both/API; LeadSimple, DotLoop, Boom, and Sheets admin/location; QuickBooks blank; Sheets scope open. | Update research backlog and environment handoff with non-secret locations/owners.                                                                            |
| Production source policy    | For each policy, provide connector ID, exact root/folder ID, allowed launch Space IDs, sensitivity ceiling, scanner provider/key + owner, and any reductions from the built-in launch type/size defaults; do not paste content/secrets. | S21 production publication.                         | S21 app-plane is Local green; no production policy/root/scanner/import/index is configured.                                       | Create the reasoned Admin policy, prove every negative check and rollback with synthetic content, then request a separate approved-source import/index gate. |
| Vendor auth/OAuth setup     | Approve Identity Platform TOTP, invitation-delivery lane, Google OAuth consent/client/redirect, token-vault resource, and one safe Vendor acceptance account/ticket.                                                                    | S22 external Vendor portal.                         | Local app-plane/fake/emulator acceptance is green; no live Vendor principal/OAuth app is configured.                              | Prove invite→MFA→assigned ticket→OAuth→revoke before first send.                                                                                             |
| Workflow recipient mappings | Identify the authoritative runtime adapters/fields for renewal owner/tenant and maintenance owner/vendor recipients and required values.                                                                                                | S25/S26 initiation.                                 | S24 artifacts/AI policy and missing/drift blocking are Local green; browser-entered addresses remain non-authoritative.           | Wire each mapped source in its provider slice and prove missing/drifted values block before Registry promotion.                                              |
| R02/R03 provider contracts  | Provide non-secret account/plan/template/stage/folder mappings and exact credential owners for Rentvine, Dotloop, SMS, Boom, LeadSimple, QuickBooks, Drive, and Sheets.                                                                 | Every final-V1 external action.                     | Product membership is settled; several account-specific/vendor contracts are not documented or connected.                         | One adapter/action proof with preview, receipt, reconciliation, rollback.                                                                                    |
| Staged acceptance approvals | Approve each exact cloud config/deploy/live proof, then complete Dan business and Josiah technical acceptance only after S20–S27 pass.                                                                                                  | Pre-V1 stages and final V1.                         | R09 sequencing/owners are settled; no new deploy or production proof is authorized by the response.                               | Manifest stays pre-V1 until every required action and Vendor portal are accepted.                                                                            |

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
- V1/tab direction: R01–R09 finalize risk-bounded Editor execution, all-risk Admin self-approval,
  every S25/S26 action, S21 trusted publication, S23 live-provider/browser acceptance, S22 external Vendor, S24
  retention/artifacts/AI policy, all seven tab visions, no-autonomous-send, and staged acceptance.
- Operating owners: Dan owns business acceptance; Josiah owns technical go-live, monitoring, rollback,
  and manual Gmail watch/degraded-watch response.

## Josiah-Owned Follow-Ups

| Item                         | Action                                                                                                                                                                           | Needed for                          | Status                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| RentVine credential rotation | RESOLVED (owner decision 2026-06-20): the RentVine API key/secret that appeared in ignored local spreadsheet notes is used as-is, NOT rotated. No client action; do not ask Dan. | Future RentVine integration safety. | Josiah-owned follow-up; do not record replacement secret values in git, email drafts, or tracked docs. |
| Gmail transport activation   | COMPLETE 2026-07-13: DWD readonly/compose/labels/modify, Pub/Sub/watch, deployment, and self-addressed transport proof.                                                          | Workflow Communications foundation. | Evidence proves transport, not authorization for a general inbox product.                              |
| Gmail self-thread proof      | Authorized: one synthetic self-addressed message and one exact-confirmed reply; Dan/third-party delivery excluded.                                                               | Safe proof of send and threading.   | Execution/result is recorded in the S19 activation evidence.                                           |

## Decisions To Confirm

| Ask                                                            | Why it matters                                                            | Needed for |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------- |
| Confirm later Editor/Approver roster and space scopes.         | Determines internal delegation; it does not change settled S20 authority. | All lanes  |
| Confirm initial delegated approvers beyond Dan/Josiah, if any. | Later approver changes should be manageable in the Admin console.         | All lanes  |

## Access And Accounts

| Ask                        | Exact client action                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google Workspace admin     | COMPLETE: DWD client `104374162913177846911` has readonly, compose, labels, and modify; `mail.google.com` remains absent.                                                                   |
| GCP/Firebase project       | COMPLETE: `pmi-kc-kb-prod`, billing, budgets/kill switch, Firebase/Firestore, and Cloud Run exist under the managed domain.                                                                 |
| Firebase Auth              | COMPLETE for the managed domain and initial Admin path; confirm only the final operator roster/roles.                                                                                       |
| External Vendor Auth       | S22 is Local green; it still needs approved Identity Platform TOTP, invite delivery, OAuth app/redirect, token vault, and first acceptance account.                                         |
| Drive source folders       | Source drop zone is created and shared; add source material and confirm which folders/files are approved for KB and renewal material.                                                       |
| Gmail workflow test access | Use fake transport or a synthetic self-addressed thread linked to an authorized test workflow; never scan an inbox for acceptance.                                                          |
| Approval notifications     | Use in-app notifications. Do not provision an event-driven sender unless a future approved spec replaces the disabled legacy lane.                                                          |
| Deployment domain          | COMPLETE: the canonical Cloud Run URL is the authorized production host.                                                                                                                    |
| Secret ownership           | Name who owns production and staging Secret Manager access, API-key custody, key rotation, break-glass access, and revocation for each approved environment when integrations are approved. |
| Tool credential rotation   | Josiah-owned follow-up for now; do not include in Dan's current source/walkthrough email thread.                                                                                            |
| Signed lease system        | COMPLETE: executed leases are in Dotloop; lease end reads from the Rentvine lease record.                                                                                                   |
| Renewal walkthrough        | COMPLETE for initial discovery: live walkthrough held 2026-06-19; an exact-click follow-up is optional, not a rediscovery blocker.                                                          |
| Renewal source location    | Use the shared `Lease Renewals` source-drop-zone folder for captured workflow notes unless setup identifies a better client-accessible app-connected source.                                |
| Renewal source access      | Grant the whole PMI KC team direct edit access to the initial Lease Renewal source-of-truth folder.                                                                                         |
| Renewal source curation    | Let Dan set the review cadence and test the simplest low-cost copy path for all useful source file types from Drive into Cloud Storage plus Agent Search periodic ingestion.                |
| Renewal source hygiene     | Move non-sources-of-truth out of the Lease Renewal source folder and identify where non-source, reference, or archive material should live.                                                 |
| Maintenance intake source  | Identify where tenant maintenance requests and phone notes live.                                                                                                                            |

## Source Material

| Ask                            | Exact client action                                                                                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approved KB sources            | Add approved SOPs, templates, checklists, and policies by Space to the shared source drop zone.                                                                             |
| Lease renewal sources          | Add the walkthrough recording, client context, team notes, renewal notices, timing rules, communication examples, exception rules, and approval owners to `Lease Renewals`. |
| Workflow communication sources | Add approved renewal/maintenance recipient sources, templates, label rules, unsupported categories, and review owners.                                                      |
| Sensitivity review             | Mark high-sensitivity sources that must not be indexed or committed.                                                                                                        |
| Missing facts                  | Answer open questions or explicitly approve placeholders.                                                                                                                   |

## Product Definition Follow-Ups

| Product                 | Exact client answer needed                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PMI KC KB               | Which source folders feed Lease Renewals, Maintenance Work Order Intake, Move-Out + Deposit Disposition, and Owner Onboarding?                                                                                                                                |
| Lease Renewal Agent     | Which starter renewal materials should go into the source-of-truth folder first?                                                                                                                                                                              |
| Lease Renewal Agent     | Which Google Drive folder should captured Lease Renewal workflow notes live in first, unless setup selects a better source?                                                                                                                                   |
| Lease Renewal Agent     | Which people are included in the initial whole-team edit group for the Lease Renewal source-of-truth folder?                                                                                                                                                  |
| Lease Renewal Agent     | Which systems expose signed lease/dates, tenant/property facts, owner information, current rent/terms, and renewal timeline when integration scoping begins?                                                                                                  |
| Lease Renewal Agent     | Which approved edit/add-resource path should missing facts link to: in-place process edit, Drive/source folder add, or another source path?                                                                                                                   |
| Lease Renewal Agent     | Does a simple low-cost copy automation handle all useful source file types from Drive, with conversion or visible skips when needed?                                                                                                                          |
| Lease Renewal Agent     | Where should non-source, reference, or archive material live outside the Lease Renewal source folder?                                                                                                                                                         |
| Lease Renewal Agent     | Which target-system/action-type pairs can be approved for future executable external actions?                                                                                                                                                                 |
| Lease Renewal Agent     | Which external systems later need mirrored workflow-run state from the KB-owned central workflow record?                                                                                                                                                      |
| Lease Renewal Agent     | Who, if anyone, should be added as an initial delegated approver beyond Dan and Josiah in the Admin console?                                                                                                                                                  |
| Lease Renewal Agent     | Which people should receive in-app workflow attention beyond the default owner/final approver and next-action assignee? Out-of-app delivery is deferred.                                                                                                      |
| Maintenance             | Which tools, services, connections, and chatbot/phone system should support intake when Maintenance scoping begins?                                                                                                                                           |
| Maintenance             | Who approves common issue templates and escalation rules?                                                                                                                                                                                                     |
| Move-Out                | Where does the security-deposit ledger of record live (Move-Out Q4)? The V1 desk surfaces a `Needs Verification:` pointer for it until Dan confirms; deposit postings stay manual (QuickBooks read-only-at-most).                                             |
| Move-Out                | What dollar threshold requires owner approval for a repair/bid before it is deducted (Move-Out Q5)? The V1 evidence packet renders it as a `Needs Verification:` placeholder; no number is invented and the suggested deduction is owner-approval-gated.      |
| Workflow Communications | S24 Local green: 10m/30d confirmation, 7d dedupe, 90d sync, 365d link, 7y bodyless audit, no persisted V1 AI facts, legal hold, three v1.0 artifacts, and transient source-backed AI reply. Separately approve TTL/scheduler activation and S25/S26 mappings. |
| Workflow Communications | Which configured runtime adapters/fields supply authoritative owner/tenant/maintenance recipients and required values? Base templates are already approved v1.0.                                                                                              |
| Workflow Communications | When is a maintenance owner notice required, and which system supplies the verified owner recipient?                                                                                                                                                          |
| Workflow Communications | RESOLVED for V1: keep the current exclusions—owner money, legal/notices, and tenant disputes—with no additions.                                                                                                                                               |
| Workflow Communications | RESOLVED: Josiah manually renews mailbox watches and responds to degraded watch health; no scheduler is assumed.                                                                                                                                              |
| Workflow Communications | RESOLVED identity: Admin invite, one-time setup, verified-email TOTP, assigned-ticket-only, same Gmail/Workspace address via per-vendor OAuth, exact Vendor/Admin send confirmation. Implement S22.                                                           |

## Testing And Training

| Ask                      | Exact client action                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| Test users               | Use Josiah and Dan as initial Admin smoke users; add scoped Editor/Approver tests when delegated. |
| Acceptance scenarios     | Provide real but safe scenarios for KB, renewals, and owner-email workflows.                      |
| Training attendees       | Name who must be trained for each product.                                                        |
| Production support owner | Name who watches the products after launch and reports issues.                                    |

## Current Blockers

- **No product-decision blocker remains from the audit.** S20–S27 safe local boundaries are built.
  Use the pre-release ledger to unblock one exact provider/action proof at a time; do not repeat R01–R09.
- **Launch content:** approve production files/folders, sensitivity, and source/data-store maps for
  the first launch Spaces. Cloud/Firebase/billing/domain setup is already complete.
- **Workflow Communications promotion:** separately activate the Local-green S24 TTL/cleanup policy,
  then configure authoritative S25/S26 recipient/value adapters. AI exclusions and watch ownership are resolved.
- **Lease Renewal operational acceptance:** confirm the exact production Sheet scope and safe
  acceptance/golden scenarios. Signed-lease location, lease-end source, precedence, read transport,
  and the initial walkthrough are resolved.
- **External provider gates:** account-specific contracts/mappings/credentials plus separate approvals
  for TOTP/OAuth/token vault, first Vendor invite/consent/send, and each S25/S26 first live action.
- **Release action gate:** the local candidate and later pre-V1 stages need explicit deploy/smoke
  approval. Final V1 also requires every action/Vendor E2E plus Dan/Josiah acceptance.

Final-V1 blockers until real-provider proof and acceptance: QuickBooks draft bill, LeadSimple, Dotloop,
Boom, Sheet writeback, Rentvine renewal/portal and Maintenance create/assign/update/close, Drive photo,
SMS, workflow Gmail initiation, Vendor auth/OAuth/mail, and all other S25/S26 rows. Their local graphs
and fakes are built; none is live-authorized. Generic Gmail inbox/compose,
autonomous send, extra delegated approvers, and event-driven approval email remain outside V1.

- Any request involving raw customer records, ledgers, bank data, SSNs, full lease
  packets, or live Gmail content must be handled outside git.
