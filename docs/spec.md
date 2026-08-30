# PMI KC current product contract

Updated: 2026-08-29.

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

Every effect is exact-key gated and follows preview, confirm, idempotency, receipt, readback, and
rollback. Direct notice sends are out of scope. RentVine and operating-Sheet writes are currently
closed.

## Current acceptance

The production release at commit `d2dfbcc2a865af1f92103083c2a49714c2dc3977` passed 528 unit files
with one intentional file skip (4,795 tests and four skips), all 115 Firestore tests, every
static/policy gate, a zero-vulnerability production audit, and the 104-page build. Exact-SHA aggregate
CI run `33280384474` passed. Zero-traffic revision `pmi-kc-app-rmtf01asj-4b3665ad072f` then passed
exact identity, bounded-route, and configuration readback before promotion and stable 100% traffic
readback. S59 revision `pmi-kc-app-rmtew9a2z-46a2353b6491` is the captured rollback target; the
earlier predecessor chain retains its recorded version-aware rollback/restoration rehearsal.

## Current unfinished work

Use `docs/plan.md`, `docs/client-checklist.md`, and `docs/feature-suites/README.md`. Historical
V1/Demo specifications are not part of this contract. S72 is implemented as a repository candidate;
its canonical gate is green and exact CI plus production release/readback remain pending.
