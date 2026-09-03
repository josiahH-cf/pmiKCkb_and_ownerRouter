<!-- spec-shape: overhaul-v1 -->

# S53 — Exact-key activation and gate integrity

> Status: Current contract: 48 keys, 16 open and 32 closed as of 2026-09-02.

**Goal.**

Make every live provider capability explicit, narrow, reviewable, and impossible to infer by category.

**What it is / how it functions.**

The committed seed is the action authority. Runtime config and provider construction are independent prerequisites; both fail closed.

**Open questions & assumptions.**

No product authority question remains for S97-S100. S97-S99 and the S100 chat-sync key completed
their exact proof, close/readback, protected activation, release, and final readback lifecycles. The
S100 resident-draft key remains closed until its exact runtime input and separate proof/activation
gates pass. Every other future key still requires its own exact owner direction.

**Cross-product impacts.**

Every provider, Admin Connections, migration readiness, release config, and action receipt.

**Adversarial acceptance checks.**

- **AC-S53-1** — Seed, runtime allowlists, Admin readiness, and tests agree on the exact key set.
- **AC-S53-2** — A closed key refuses before provider construction even when credentials/runtime flags exist.
- **AC-S53-3** — Preserve the present 48-key/16-open result: completed exact S97-S99 and S100-chat
  keys remain open, while generic/direct notice sends, the S100 resident-draft key, broad legacy
  RentVine/Sheet keys, and every unlisted effect remain closed. The resident-draft key may change
  only after its exact eligible live mapping, proof, mandatory close/readback, protected activation,
  release, and final readback all pass.

**Forbidden actions / hard gates.**

No category grants, hidden allowlists, runtime-only activation, or unreviewed protected gate edit.

**Ordered prompt sequence.**

1. Name one exact action.
2. Complete its contract and dependencies.
3. Review the protected one-key change and verify every projection.

**Deletion/merge recommendation.**

Keep as the active action-activation contract.
