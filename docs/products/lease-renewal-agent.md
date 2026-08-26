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

- Client-confirmed six renewal steps.
- Definition of current rent.
- Distinct rehearsal Sheet.
- One designated RentVine test record.
- Approved tenant wording/channel policy.
- Follow-up timing/property override rules.
- Approved lease packet/provider catalog.
