# Product record retention

Updated: 2026-08-26.

## Principles

- Retain the minimum app-owned metadata needed for workflow truth, audit, reconciliation, and rollback.
- Never persist raw secrets, credential bodies, setup links, TOTP material, Gmail bodies in audit,
  dictated audio, or unnecessary customer content.
- Legal hold prevents deletion.
- Retention cleanup is previewed, exact-hash confirmed, transactionally rechecked, dependency ordered,
  receipted, and reversible where the record type permits it.
- A cleanup never mutates the linked client source of truth.

## Current records

Workflow state, approvals, action receipts, support reports, renewal snapshots/resolutions, and work
tasks/sessions use their owning store contracts. Work-accountability records use the 12-month
contract in `docs/work-accountability-data-contract.md`.

Native TTL or scheduled cleanup is optional unless a specific record contract says otherwise.
