# Product Lanes

Use this directory for product scope and `docs/loop-state.md` for the exact resume point.

| Lane                          | Read first                   | Working V1 state                                                                                                                             |
| ----------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| PMI KC KB                     | `pmi-kc-kb.md`               | Production application for Console, source-backed Ask, Spaces/processes, approvals, roles, administration, attention, and execution control. |
| Lease Renewal Agent           | `lease-renewal-agent.md`     | Live read/reconcile/review plus a complete isolated Test action journey; each Live provider action activates independently.                  |
| Workflow Communications       | `gmail-inbox-zero.md`        | Workflow-linked Gmail adapter for reads, labels, drafts, and exact-confirmed replies; no general inbox or autonomous send.                   |
| Maintenance + external Vendor | `pmi-kc-kb.md`, then S22/S26 | Live in-app tickets plus a complete persistent Test workflow and password/TOTP assigned-ticket Vendor portal.                                |

## Live/Test Contract

- Live and Test records coexist in production and are always labeled.
- Test records use reserved invented aliases, make real app/Firestore writes, and can reach
  Done. Test adapters contain no Live client and cannot call an external provider.
- Provider activation is a per-action operational state, not a condition for calling the
  stable application V1.
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
- Implement provider-shaped behavior with the isolated Test lane when a Live contract,
  mapping, or credential is unavailable. Never invent those values for Live.
- Keep Test/Live identities, assignments, actions, adapters, and receipts structurally
  separate.
- Do not add autonomous sends, unreviewed external writes, secrets, or customer records to
  repository artifacts.
- TTL, extra indexes, and Scheduler automation are optional operational improvements; bounded
  manual cleanup is the initial safe default.
- Current acceptance truth lives in S20–S27 and the working-app program. Older specs remain
  preserved history and cannot override `docs/facts.md` or `docs/north-star.md`.
