# Product Lanes

Use this directory for product scope and `docs/loop-state.md` for the exact resume point.

| Lane                          | Read first                       | Product target                                                                                                                                         |
| ----------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PMI KC KB                     | `pmi-kc-kb.md`                   | Role-aware Console/Ask, primary non-card Spaces, exact attention ownership, decisions, task Admin, trusted content, and execution control.             |
| Lease Renewal Agent           | `lease-renewal-agent.md`         | One desk/unit flow with Live Production work, exact source/provider links, governed drafts/actions, and equivalent safe Demo rehearsal.                |
| Workflow Communications       | `gmail-inbox-zero.md`            | Workflow-linked Gmail adapter for reads, labels, drafts, and exact-confirmed replies; no general inbox, browser simulation, or autonomous client send. |
| Maintenance + external Vendor | `pmi-kc-kb.md`, then S22/S26/S47 | Focused tickets, tokenized resident intake, scoped Vendor password/TOTP work, governed provider actions, and exact Demo/Production separation.         |

## Environment and effect contract

- S40’s target is an independent Demo environment and a Live-only Production environment.
  `F-PRODUCTION-DUAL-DATA-LANES` remains current deployed truth only until S40 migrates it safely.
- Demo uses realistic invented aliases in Demo-owned stores and runs the same product behavior with
  no Live client/effect. An optional Demo Live-read-only context is explicit, never mixed with Demo
  records, and cannot mutate or receipt.
- Production accepts Live classification only and has no Demo/Test selector, seed, simulator, or
  shipped lab. Unknown/missing classification fails closed.
- Provider activation is per action, not an application-finish condition. Demo evidence proves the
  product flow; only Live receipts/readback prove a provider action.
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
- Build provider-shaped behavior fully in Demo and the Live implementation to its documented seam
  when a contract, mapping, or credential is unavailable. Never invent those values for Live.
- Keep Demo/Production and Demo/Live-read-only identities, records, assignments, actions, adapters,
  resources, and receipts structurally separate.
- Do not add autonomous sends, unreviewed external writes, secrets, or customer records to
  repository artifacts.
- Every task link opens its exact field/evidence; a supported provider always has a reviewed
  destination, but a generic front door is labeled as non-exact and never treated as evidence.
- Remove shipped simulations/no-op Sample tools in two stages while preserving tests, Demo product
  parity, provider/security seams, and rollback.
- TTL, extra indexes, and Scheduler automation are optional operational improvements; bounded
  manual cleanup is the initial safe default.
- Existing action/security acceptance truth lives in S20–S39. The controlling UI/environment target
  and execution order are S40–S50 in
  `docs/ui-ux-recalibration-implementation-program-2026-07-28.md`. Older specs remain preserved
  history and cannot override `docs/facts.md` or `docs/north-star.md`.
