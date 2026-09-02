# PMI KC current product contract

Updated: 2026-09-01.

## Application

PMI KC is one authenticated operations application with the Dashboard (the Console/Ask surface),
My Work, Internal Processes (the Spaces collection), processes, approvals, Lease Renewal,
Maintenance, Workflow Communications, Admin, feedback, Vendor/resident seams, and staff work.
Primary navigation renders three actor-filtered disclosure groups — My Work, Operations, and Admin —
with descriptive destination rows; routes and internal Console/Space contracts are unchanged.

Production contains Live data only. Local rehearsal can inspect bounded live reads but cannot persist
or cause provider effects.

## Dashboard and knowledge

- The Dashboard (internally the Console surface) summarizes bodyless operational state and
  attention.
- Ask answers from approved sources and visibly reports missing support.
- Internal Processes (internally Spaces) organize approved sources and process definitions.
- Workflow Communications compatibility does not appear as an unbacked normal Space.
- Admin exposes connection state, action gates, support reports, people/access, and operational setup.

## Lease renewal

- Read all RentVine lease pages and the operating renewal Sheet.
- Join by stable lease/row identity; never persist address/name as the sole key.
- Land renewal work on one sortable, filterable table with per-lease identity, RentVine renewal
  date and current base rent, deterministic status/verification states, and direct blocker links;
  the guided workspace shows a six-phase rail, one next action, and one selected phase.
- Classify agreement, conflict, one-sided, missing, intentional semantic difference, stale, and
  ambiguous joins.
- Verify current rent only from fresh agreement or exact current resolution.
- Use RentCast as a reference input with source link, cache, counter, and allowance stop.
- Keep offered rent Admin-approved and separate from provider estimates.
- Pin new renewal work to the immutable six-step `renewal-v1` process; derive substep state from exact
  evidence, preserve historical legacy meaning, and reopen only affected downstream work.
- Let Renewals-space Editors read and perform ordinary app-owned work; keep Approver reconciliation,
  Admin pricing/source approvals and configuration, and exact action readiness as independent terms.
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

Every effect is exact-key gated and follows preview, exact confirmation, one bounded attempt or
provider idempotency, receipt, readback, ambiguity recovery, and separate reversal/correction. S100's
manual chat sync is the sole specified non-reversible stateful-read exception: its explicit warning
states that RentVine marks retrieved manager messages read and documents no unread restoration.
RentVine renewal and Maintenance writes, operating-Sheet writes, manual resident chat sync, and the
resident-reply Gmail draft are approved desired behavior under S97-S100 but remain closed and
undeployed today. Direct notice sends, generic/bulk provider calls, vendor assignment, RentVine chat
posting, and autonomous/model-triggered effects remain out of scope.

## Current acceptance

The production release at commit `f2153b00087516cf06c4f9776f2fc3562e146c83` passed 600 unit files
with one intentional file skip (5,515 tests and four skips), 26 Firestore files/119 tests, every
static/policy gate, core E2E, and the complete production build. Exact-SHA aggregate CI run
`33583463885` passed. Zero-traffic revision `pmi-kc-app-rmtjhew5f-125876b4ff5b` then passed exact
identity, bounded-route, and normalized-configuration readback, excluding only image and exact
`APP_COMMIT_SHA`, before promotion and repeated stable 100% traffic readback. The committed Action
Registry is 44 keys with seven open; the three exact S97 writeback keys and the retired broad
identifier read back closed. Revision `pmi-kc-app-rmtjd24ee-17d334db377f` is the immediate
rollback target; the earlier predecessor chain retains its recorded rollback rehearsal.

## Current unfinished work

Use `docs/plan.md`, `docs/loop-state.md`, and `docs/feature-suites/README.md`. Historical V1/Demo and
superseded proof specifications are not part of this contract. The remaining S36,
S87-S95, and S97-S100 suites are desired-state contracts, not deployed behavior. S96, S85, S86, S83,
S84, and S82 are complete and deployed; S97 is the active suite. S97 later consumes S30's safety primitives
and replaces the proof-only route with the exact renewal product contract. All product decisions are
closed; missing fresh provider values or managed sessions are fail-closed runtime inputs, not
permission to invent them.
