# PMI KC current product contract

Updated: 2026-08-26.

## Application

PMI KC is one authenticated operations application with Console, Ask, Spaces, processes, approvals,
Lease Renewal, Maintenance, Workflow Communications, Admin, feedback, Vendor/resident seams, and
staff work.

Production contains Live data only. Local rehearsal can inspect bounded live reads but cannot persist
or cause provider effects.

## Console and knowledge

- Console summarizes bodyless operational state and attention.
- Ask answers from approved sources and visibly reports missing support.
- Spaces organize approved sources and process definitions.
- Workflow Communications compatibility does not appear as an unbacked normal Space.
- Admin exposes connection state, action gates, support reports, people/access, and operational setup.

## Lease renewal

- Read all RentVine lease pages and the operating renewal Sheet.
- Join by stable lease/row identity; never persist address/name as the sole key.
- Show chronological work with complete address labels.
- Classify agreement, conflict, one-sided, missing, intentional semantic difference, stale, and
  ambiguous joins.
- Verify current rent only from fresh agreement or exact current resolution.
- Use RentCast as a reference input with source link, cache, counter, and allowance stop.
- Keep offered rent Admin-approved and separate from provider estimates.
- Address all owners/tenants of record through separated channels.
- Prepare human-reviewed unsent drafts; never direct-send.
- Keep packet truth fail-closed until approved artifacts/provider mappings exist.

## Maintenance and work

- Capture and manage work with explicit unit/source context.
- Staff work uses app-owned tasks and user-started sessions.
- Track factual time and corrections without surveillance or productivity inference.
- Tasks may include job location, materials needed, and materials already bought/on hand.
- Move-out deposit disposition remains process-validation work until the client walkthrough.

## External effects

Every effect is exact-key gated and follows preview, confirm, idempotency, receipt, readback, and
rollback. Direct notice sends are out of scope. RentVine and operating-Sheet writes are currently
closed.

## Current acceptance

The production release at commit `6aea639728efcad70e3e601e7a031c2b35722e08` passed 4,678 unit
tests with four intentional skips across the complete 524-file inventory, all 115 Firestore tests,
all static/policy gates, a 104-route production build, exact candidate/stable smoke, aggregate CI,
and version-aware rollback/restoration smoke.

## Current unfinished work

Use `docs/plan.md`, `docs/client-checklist.md`, and `docs/feature-suites/README.md`. Historical
V1/Demo specifications are not part of this contract.
