# Client, owner, and provider actions

Updated: 2026-08-29.

The application is internally complete to each boundary below. Missing input blocks only the named
capability; it is not an unfinished engineering dependency.

## Decisions recorded on 2026-08-29

- S72 carries the approved six-step process with detailed substeps, roles, evidence, branches, and
  reopening rules.
- Contractual base rent is the renewal comparison/decision value; recurring charges stay separate.
- RentCast requests a two-mile maximum radius and 15 comparables, preserves provider order, applies
  no hidden freshness/selection filter, and remains reference-only.
- RentCast radius, comp count, freshness/selection policy: the first two are approved above; any
  future freshness or selection rule stays unset until explicitly approved and versioned.
- Renewals-space Editors may perform ordinary app-owned work and exact-confirm unsent drafts; stronger
  approval/Admin/action/write boundaries remain separate.

| Priority | Owner                 | Exact input required                                                             | Completed seam waiting on it                                              | Next action                                                         |
| -------: | --------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
|        1 | Client/Admin          | Distinct verbatim Sheet copy, managed sharing, blank cell                        | Admin URL/id save plus copy-only CAS/read/clear proof                     | Save the copy in Admin, dry-run, then confirm once                  |
|        2 | Client/Admin          | One unmistakable RentVine test lease/owner and allowed field                     | Two restricted POST shapes, exact preview/rollback/readback; gate closed  | Review the designated-record proof and protected gate separately    |
|        3 | Client process expert | Move-out deposit-disposition walkthrough and date                                | Report acknowledged and current workflow kept non-invented                | Complete walkthrough, then disposition the report                   |
|        4 | Client                | Exact lease behind wrong-resident report                                         | Address/lease identity remains fail-closed                                | Identify and verify that one lease                                  |
|        5 | Client                | Approved owner/tenant wording, locked copy, and channel-evidence rules           | Versioned templates, constrained AI, editable drafts, honest status       | Approve exact copy and contacted/sent evidence                      |
|        6 | Client/Admin          | Waiting-on timing values and override authority                                  | Source-backed contact state plus versioned global/property/lease rules    | Enter client-confirmed values in Admin                              |
|        7 | Client/Admin          | Any future RentCast freshness or selection/rejection rule beyond provider order  | Transparent two-mile/15-request reference search                          | Leave unset or approve an explicit versioned rule                   |
|        8 | Owner/client          | Exact end-of-September commitment                                                | Scope remains unasserted                                                  | Record the agreed deliverable and evidence                          |
|        9 | Client/provider       | Approved S66 artifacts, fields, participants, signatures, form rules             | Immutable packet truth and exact Dotloop binding                          | Publish the approved catalog                                        |
|       10 | Provider/client       | Dotloop OAuth plus exact account/profile/template/webhook/correction mappings    | Preview/confirm/idempotency/readback/receipt/reconcile/rollback lifecycle | Configure one official adapter and prove one packet                 |
|       11 | Provider/client       | One LeadSimple action, official account contract, credential, mappings           | CAS/readback/idempotency/receipt/reconcile/rollback lifecycle             | Configure and prove only that action                                |
|       12 | RentVine/client       | Invitation/reply/webhook/auth/identity/correction/rollback contract              | Verified-resident channel lifecycle; app intake remains usable            | Configure official adapter; keep provider channel closed until then |
|       13 | Owner                 | One saved Space request, first JSONL object in its isolated prefix, approval ref | Fixed official Discovery Engine lifecycle and isolated retirement         | Review packet, then enable one bounded pilot attempt                |
|       14 | Owner                 | Explicit S64 authority decision                                                  | No S64 implementation or implied authority                                | Keep current role rules unless separately authorized                |

## Live support state

- Work details: resolved after the deployed location/material behavior was verified.
- Connections: acknowledged; completed portions were separated from Dotloop/LeadSimple external inputs.
- Move-out: acknowledged and intentionally unresolved until the client walkthrough.
- Reporter display uses the managed-user directory lookup; the UI does not infer a person's name from
  an unverified identifier.

## What the team can use now

- Complete RentVine and operating-Sheet reads, renewal reconciliation, RentCast reference comps, and
  lease-specific workspaces.
- Governed Gmail workflow reads, labels, replies, and unsent renewal/maintenance drafts where the
  exact key is open; a person sends from Gmail.
- Manual Workflow Communications refresh with source-backed waiting-on/last-contact.
- Console, 11 Spaces, processes, approvals, Admin, Maintenance, feedback, tokenized resident intake,
  Vendor boundaries, work accountability, and the bounded operational-page builder after deployment.

## Rehearsal-copy proof

1. Make and share a verbatim copy; never reuse the operating workbook.
2. Paste its URL/id into Admin. Saving performs no Sheet API call.
3. Choose one blank sacrificial cell and run the dry proof to obtain the exact confirmation token.
4. Confirm once: blank → synthetic marker → readback → exact clear → final blank.
5. Retain only the bodyless receipt; if final blank cannot be proven, treat the result as ambiguous.

## Safety statement

No live RentVine or operating-Sheet write is authorized by this checklist. No app path autonomously
sends a client notice. No test identity, credential, or client evidence belongs in Git.
