<!-- spec-shape: overhaul-v1 -->

# S52 — Production cost governance

> Status: Complete and live-verified: $25 alert, $100 project hard stop, $100 account backstop, Node.js 22 guardrail cap 100.

**Goal.**

Detect spend early and preserve a verified hard ceiling without stale local assumptions.

**What it is / how it functions.**

Cloud Billing budgets provide alert/backstop controls; the active guardrail applies the project hard stop using the lower applicable ceiling.

**Open questions & assumptions.**

No current blocker. Re-verify after budget, billing account, runtime, function, or notification changes.

**Cross-product impacts.**

All cost-bearing cloud/provider work and incident response.

**Adversarial acceptance checks.**

- **AC-S52-1** — Budget amounts, channels, function ACTIVE state/runtime, and cap are read back rather than inferred.
- **AC-S52-2** — Raising headroom changes budget and guardrail together.
- **AC-S52-3** — Removing/lowering a safety control is never treated as routine automation.

**Forbidden actions / hard gates.**

No claim that the legacy local $10 planning fallback is the live ceiling, disabled guardrail,
narrowed alert, or unbounded cost-bearing release.

**Ordered prompt sequence.**

1. Read current budgets and guardrail.
2. Compare against committed policy.
3. Stop on drift and reconcile before cost-bearing work.

**Deletion/merge recommendation.**

Keep as the active cost contract.
