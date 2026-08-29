# Lease Renewal Agent

## Present state

The deployed renewal lane reads all RentVine lease pages (306 current rows) plus the operating renewal
Sheet, joins them by stable identities, and renders a chronological desk and lease-specific workspace.

It provides:

- complete addresses and stable lease identity;
- source reconciliation and discrepancy taxonomy;
- current-rent confidence with stale/conflict refusal;
- RentCast reference comps under allowance control;
- Admin-reviewed price suggestions;
- all-owner and all-tenant recipient separation;
- reviewed unsent Gmail drafts;
- packet-state/prefill machinery;
- work/attention/approval integration;
- a separate rehearsal-Sheet setup surface;
- a non-executable RentVine renewal preview.

## Safety

RentCast does not set offered rent. Drafts do not send themselves. The operating Sheet is not a write
target. RentVine renewal write remains closed. Missing legal/provider artifacts fail closed.

## Current input dependencies

- Distinct rehearsal Sheet.
- One designated RentVine test record.
- Approved owner/tenant wording/channel policy.
- Follow-up timing/property override rules.
- Approved lease packet/provider catalog.

## Approved next-state contract

- Six ordered renewal steps with detailed substeps, roles, completion evidence, branches, and
  downstream reopening.
- Contractual base rent as the renewal comparison/decision value; recurring charges stay separate.
- RentCast maximum two-mile radius and 15 requested comparables with provider order, no hidden
  freshness/selection filter, and reference-only output.
- Renewals-space Editor ordinary work, optional constrained AI phrasing, exact screenshot attachment,
  and narrow task-oriented Admin/Connections navigation under the active S72/S59/S80/S74/S79/S81
  suites. These are approved specifications, not deployed behavior.
