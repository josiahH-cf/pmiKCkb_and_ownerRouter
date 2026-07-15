# Product Lanes

This directory is the active product routing layer for the purchased PMI KC workstream.
Use it before older demo docs or preserved specs.

## Active Lanes

| Product lane            | Read first               | Current state                                                     |
| ----------------------- | ------------------------ | ----------------------------------------------------------------- |
| PMI KC KB               | `pmi-kc-kb.md`           | S20–S24 green; S25–S27 local boundaries Gated                     |
| Lease Renewal Agent     | `lease-renewal-agent.md` | Read/review plus S25 local graph/fakes; real proofs pending       |
| Workflow Communications | `gmail-inbox-zero.md`    | Workflow-linked Gmail adapter; S22/S24 green; S25/S26 fakes Gated |

### Lease Renewal lane — sub-docs

- [`lease-renewal-build-plan.md`](lease-renewal-build-plan.md) — historical Phase-1 engine design;
  its old status/test counts/blocker register are not the current resume point. Start from
  `docs/loop-state.md`, `docs/plan.md`, and the current product/spec docs.
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
- Do not add a new runtime action or widen an existing one for Lease Renewal Agent or Workflow
  Communications until that exact action's requirements, permissions, and acceptance gates are
  confirmed. Preserve the already-built, separately gated app-plane/runtime foundations.
- The final owner contract is R01–R09. Run implementation from
  `docs/v1-gap-implementation-program-2026-07-14.md` and S20–S27; do not reopen resolved product
  choices or treat them as standing live-action authority.
- Stop local product-surface expansion once the remaining blockers are client-owned
  migration, production setup, approved sources, or real product decisions; keep only
  readiness, verification, docs, and regression-fix work moving.
- Keep all three lanes free of secrets, raw customer records, and unsupported
  system-of-record writes.
