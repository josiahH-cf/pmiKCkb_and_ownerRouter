# Product Lanes

Use this directory for product scope and `docs/loop-state.md` for the exact resume point.

| Lane                          | Read first                       | Product target                                                                                                                                         |
| ----------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PMI KC KB                     | `pmi-kc-kb.md`                   | Role-aware Console/Ask, primary non-card Spaces, exact attention ownership, decisions, task Admin, trusted content, and execution control.             |
| Lease Renewal Agent           | `lease-renewal-agent.md`         | One desk/unit flow with Live Production work, exact source/provider links, governed drafts/actions, and effect-refused local rehearsal.                |
| Workflow Communications       | `gmail-inbox-zero.md`            | Workflow-linked Gmail adapter for reads, labels, drafts, and exact-confirmed replies; no general inbox, browser simulation, or autonomous client send. |
| Maintenance + external Vendor | `pmi-kc-kb.md`, then S22/S26/S47 | Focused tickets, tokenized resident intake, scoped Vendor password/TOTP work, governed provider actions, and a Live-only Production boundary.          |

## Environment and effect contract

- Production is Live-only and has no Demo/Test selector, seed, simulator, or shipped lab. The former
  dual-data-lane implementation is dated historical evidence, not current operating guidance.
- Rehearsal is local and resolves exactly to `environmentKind:"demo"` plus
  `dataContext:"live_readonly"` with `source:"explicit"`. It may perform bounded Live reads but
  cannot mutate, create a receipt, or construct a provider effect.
- The hosted Demo GCP project is deferred under `F-DEMO-DEFERRED-LOCAL-FIRST`; do not provision it
  or seed invented product records. Deterministic invented scenarios belong in automated tests.
- Provider activation is per action, not an application-finish condition. Local refusal/read-only
  evidence proves the boundary; only Live receipts/readback prove a provider action.
- A Live write must show the exact target/effect and require the role-specific human
  confirmation or Admin decision before its single idempotent attempt.

## Lease Renewal References

- `lease-renewal-discovery-reference.md` — sanitized process reference.
- `move-in-move-out-process.md` — connected move-in/move-out lifecycles.
- `lease-renewal-connector-design.md` — connector and compare-and-set writeback design.
- `lease-renewal-spreadsheet-map.md` — semantic map; credential tabs remain excluded.
- `lease-renewal-build-plan.md` — historical design, not the current status source.

## Routing Rules

- Rentvine is the system of record; LeadSimple orchestrates; Dotloop holds documents;
  QuickBooks is accounting; Boom is auxiliary; Sheets is an exception/control surface.
- Build provider-shaped behavior in deterministic automated tests and the Live implementation to its
  documented seam when a contract, mapping, or credential is unavailable. Never invent those values
  for Live.
- Keep local `environmentKind:"demo"` + `dataContext:"live_readonly"` structurally unable to create
  Production records, assignments, actions, provider clients, or receipts.
- Do not add autonomous sends, unreviewed external writes, secrets, or customer records to
  repository artifacts.
- Every task link opens its exact field/evidence; a supported provider always has a reviewed
  destination, but a generic front door is labeled as non-exact and never treated as evidence.
- Remove shipped simulations/no-op Sample tools in two stages while preserving automated tests,
  provider/security seams, and rollback.
- TTL, extra indexes, and Scheduler automation are optional operational improvements; bounded
  manual cleanup is the initial safe default.
- Existing action/security acceptance truth lives in S20–S39. The controlling UI/environment target
  and execution order are S40–S50 in
  `docs/ui-ux-recalibration-implementation-program-2026-07-28.md`. Older specs remain preserved
  history and cannot override `docs/facts.md` or `docs/north-star.md`.
