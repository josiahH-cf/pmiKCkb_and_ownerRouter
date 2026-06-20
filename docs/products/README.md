# Product Lanes

This directory is the active product routing layer for the purchased PMI KC workstream.
Use it before older demo docs or preserved specs.

## Active Lanes

| Product lane        | Read first               | Current state                                                                |
| ------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| PMI KC KB           | `pmi-kc-kb.md`           | Existing source-backed web app runtime and demo                              |
| Lease Renewal Agent | `lease-renewal-agent.md` | Separate product track; discovery required before runtime work               |
| Gmail Inbox 0       | `gmail-inbox-zero.md`    | Dan-email-first Gmail workflow, successor to Owner Router/Dan's AI Assistant |

### Lease Renewal lane — sub-docs

- [`lease-renewal-build-plan.md`](lease-renewal-build-plan.md) — **build-ready roadmap / "continue with feature development" entry point**: done-state, the zero-cost Phase-1 units, the open-questions & blockers register, and the two-track prod-cutover plan.
- [`lease-renewal-discovery-reference.md`](lease-renewal-discovery-reference.md) — sanitized renewal process reference (end-to-end).
- [`move-in-move-out-process.md`](move-in-move-out-process.md) — tenant move-in / move-out lifecycles + how they connect.
- [`lease-renewal-connector-design.md`](lease-renewal-connector-design.md) — read-only sheet connector + conflict reconciliation + admin-enabled, suggest-then-button-press write-back (§4.0).
- [`lease-renewal-spreadsheet-map.md`](lease-renewal-spreadsheet-map.md) — semantic map of the operational tracking sheet (credential tabs 4 & 7 hard-excluded).

## Rules

- Treat these docs as the current client-purchased direction.
- For external-tool roles, event model, build order, and the Action Registry, read
  `docs/integration-architecture.md`. Tools are not interchangeable: Rentvine is the
  system of record, LeadSimple orchestrates, Dotloop holds documents, QuickBooks is
  downstream accounting, Boom is auxiliary resident services, and Sheets is an exception
  surface. Maintenance Work Order Intake is the first executable-write target; Rentvine
  lease-renewal writeback is undocumented and stays gated.
- Preserve original specs in `docs/specs/`, but do not let older repo-boundary language
  override the monorepo governance in `docs/north-star.md`.
- Do not build runtime code for Lease Renewal Agent or Gmail Inbox 0 until their
  requirements, permissions, and acceptance gates are confirmed in the product doc.
- Stop local product-surface expansion once the remaining blockers are client-owned
  migration, production setup, approved sources, or real product decisions; keep only
  readiness, verification, docs, and regression-fix work moving.
- Keep all three lanes free of secrets, raw customer records, and unsupported
  system-of-record writes.
