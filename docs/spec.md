# PMI KC current product contract

Updated: 2026-09-02.

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
The exact S97 renewal writes, S98 operating-Sheet keys, S99 work-order operations, and S100 manual
chat sync are deployed and open only behind their exact contracts. S98's active unreleased
hardening retains normal row append but refuses fixed-row field update/delete/restore because the
current Sheets integration cannot atomically bind a logical row and expected generation; open-key
state does not override that capability boundary. The S100
resident-reply Gmail draft remains closed pending its exact eligible mapping, proof, and activation.
Direct notice sends, generic/bulk provider calls, vendor assignment, attachments, RentVine chat
posting, and autonomous/model-triggered effects remain out of scope.

## Current acceptance

Production serves commit `d243911cb20ffb01773072c0e27c723648eeea34` as revision
`pmi-kc-app-rmtkmhj1z-8855e4c6dbfb` at 100% traffic. Its captured immediate rollback is
`pmi-kc-app-rmtkgn08q-db89a37c43dc`. Live readback confirms Production + Live, eleven Spaces, the
managed runtime identity, an enabled operating-Sheet switch, and a 48-key Registry with 16 open and
32 closed. The current S82/S51/S54 remediation remains worktree behavior until its complete test,
exact-SHA CI, candidate, promotion, observation, and readback gates pass.

## Current unfinished work

Use `docs/plan.md`, `docs/loop-state.md`, and `docs/feature-suites/README.md`. Historical V1/Demo and
superseded proof specifications are not part of this contract. The original S82 delivery is
deployed, but its bounded conformance remediation plus expanded S51/S54 assurance is active and
unreleased. S97-S99 are complete and deployed. S100 chat sync is complete, proven, and open; S100
remains blocked only on the exact mapped resident/email input required for its closed unsent-draft
key. S36 is queued behind complete S100 and has not started. S87-S95 and S101 are
specification-only desired behavior, not current Dashboard AI, minimal-home, decluttering, or broad
assistant-read capability. All product decisions are closed; a missing runtime input blocks only
its dependent gate and is never permission to invent or substitute evidence.
