<!-- spec-shape: overhaul-v1 -->

# S30 — RentVine renewal-write activation

> Status: Restricted preview/client seam is built; production key is closed and no live write has been attempted.

**Goal.**

Prove one client-designated renewal update and rollback without risking any other RentVine record.

**What it is / how it functions.**

The write client exposes only documented lease-update and existing recurring-charge POSTs with allowlisted fields. The current product produces an exact dry preview and rollback payload, but has no production caller.

**Open questions & assumptions.**

Client must designate one unmistakable test lease/owner and confirm which field/charge may be changed. Credential write ability is owner-attested, not live-proven.

**Cross-product impacts.**

Lease Renewal, Action Registry, provider receipts, client action center, and incident rollback.

**Adversarial acceptance checks.**

- **AC-S30-1** — With the key closed, every production execution attempt refuses before provider construction.
- **AC-S30-2** — One-record proof binds lease id, current provider state, proposed payload, actor, confirmation, idempotency, readback, receipt, and rollback.
- **AC-S30-3** — No generic route, delete, new-charge, status-change, bulk action, or second-record write is reachable.

**Forbidden actions / hard gates.**

No write before the exact test record and protected per-key review. No guessed id, endpoint, field, or client value.

**Ordered prompt sequence.**

1. Confirm the designated record and fresh provider state.
2. Review the exact preview/rollback and protected gate change.
3. Execute once, read back, roll back, read back, then decide whether the gate remains open.

**Deletion/merge recommendation.**

Keep until the one-record proof is complete and the durable action contract is represented in code/tests/facts.
