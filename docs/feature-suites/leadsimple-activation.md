<!-- spec-shape: overhaul-v1 -->

# S35 — LeadSimple connector activation

> Status: Typed integration boundary remains closed pending an account contract, credential, and exact mappings.

**Goal.**

Read or update one selected LeadSimple workflow item through a documented, reversible action.

**What it is / how it functions.**

The connector must use official account endpoints and explicit process/stage/assignee mappings. Each read or mutation is a separate action key.

**Open questions & assumptions.**

Provider/account owner must supply endpoint/plan, credential, mappings, concurrency behavior, and rollback/correction semantics.

**Cross-product impacts.**

Processes, attention, work assignment, Action Registry, Secret Manager, and receipts.

**Adversarial acceptance checks.**

- **AC-S35-1** — Missing credential or mapping blocks only the selected LeadSimple action.
- **AC-S35-2** — A mutation refuses on stale provider state and uses exact idempotency/readback.
- **AC-S35-3** — No guessed stage, unconditional overwrite, or broad sync is possible.

**Forbidden actions / hard gates.**

No invented endpoints/stages, bulk migration, client communication, or credential in Git.

**Ordered prompt sequence.**

1. Document the selected account action and official contract.
2. Build read/preview/confirm/readback/rollback.
3. Activate only the exact proven key.

**Deletion/merge recommendation.**

Keep until one named action is proven or LeadSimple is explicitly removed from scope.
