# PMI KC current product contract

Updated: 2026-08-31.

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

The production release at commit `353a0a9de81459d5271dcff0e6c2bae3d11cc188` passed 564 unit files
with one intentional file skip (5,186 tests and four skips), 26 Firestore files/119 tests, every
static/policy gate, core E2E, a real Chromium theme matrix, and the 107-route build. Exact-SHA
aggregate CI run `33496148515` passed. Zero-traffic revision
`pmi-kc-app-rmtiii4il-dcf1708c88b8` then passed exact identity, bounded-route, theme-markup, and
normalized-configuration readback before promotion and repeated stable 100% traffic readback.
Revision `pmi-kc-app-rmtic5vib-8774cfecd0c8` is the immediate rollback target; the earlier
predecessor chain retains its recorded version-aware rollback/restoration rehearsal.

## Current unfinished work

Use `docs/plan.md`, `docs/loop-state.md`, and `docs/feature-suites/README.md`. Historical V1/Demo and
superseded proof specifications are not part of this contract. S36 and S82-S100 are desired-state
contracts, not deployed behavior. S96 and S85 are complete and deployed; S86 is the active suite. S97 later
consumes S30's safety primitives and replaces the proof-only
route with the exact renewal product contract. All product decisions are closed; missing fresh
provider values or managed sessions are fail-closed runtime inputs, not permission to invent them.
