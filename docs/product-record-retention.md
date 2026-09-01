# Product record retention

Updated: 2026-08-31.

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

## Specified future record

S100 specifies `rentvine_work_order_chat_messages` under the existing
`communications-retention:v1.0` `workflow_link` class: 365 days from immutable first successful
local import, with existing legal-hold and confirmed cleanup behavior. Duplicate sync, view, mapping
review, and draft creation do not refresh that anchor. This is a target contract, not a claim that
the collection or writer exists in current production.
