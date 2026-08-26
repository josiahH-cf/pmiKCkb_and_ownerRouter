<!-- spec-shape: overhaul-v1 -->

# S53 — Exact-key activation and gate integrity

> Status: Current contract: 41 keys, seven open and 34 closed as of 2026-08-26.

**Goal.**

Make every live provider capability explicit, narrow, reviewable, and impossible to infer by category.

**What it is / how it functions.**

The committed seed is the action authority. Runtime config and provider construction are independent prerequisites; both fail closed.

**Open questions & assumptions.**

Each future activation supplies its own endpoint, mapping, identity, evidence, rollback, and owner direction when the protected path requires it.

**Cross-product impacts.**

Every provider, Admin Connections, migration readiness, release config, and action receipt.

**Adversarial acceptance checks.**

- **AC-S53-1** — Seed, runtime allowlists, Admin readiness, and tests agree on the exact key set.
- **AC-S53-2** — A closed key refuses before provider construction even when credentials/runtime flags exist.
- **AC-S53-3** — Generic/direct notice sends, RentVine renewal write, and operating-Sheet write remain closed.

**Forbidden actions / hard gates.**

No category grants, hidden allowlists, runtime-only activation, or unreviewed protected gate edit.

**Ordered prompt sequence.**

1. Name one exact action.
2. Complete its contract and dependencies.
3. Review the protected one-key change and verify every projection.

**Deletion/merge recommendation.**

Keep as the active action-activation contract.
