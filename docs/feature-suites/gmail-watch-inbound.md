<!-- spec-shape: overhaul-v1 -->

# S31 — Gmail watch continuity and follow-up

> Status: Workflow watch/read infrastructure exists; a safe watch-stop/reversal path and final follow-up-state integration remain incomplete.

**Goal.**

Make inbound reply attention current and reversible without sending client mail.

**What it is / how it functions.**

Use authenticated Gmail watch/history reads and workflow linkage to surface reply state. Follow-up fields belong to S75; watch lifecycle must have start, renewal, expiry, and stop truth.

**Open questions & assumptions.**

Confirm whether continuous watch remains operationally desired and what explicit stop/reversal evidence is acceptable.

**Cross-product impacts.**

Workflow Communications, notifications, S75 waiting-on state, Scheduler/Pub/Sub, and incident operations.

**Adversarial acceptance checks.**

- **AC-S31-1** — A watch cannot be called reversible until an authenticated stop path and readback exist.
- **AC-S31-2** — Duplicate/out-of-order Pub/Sub delivery is idempotent and cannot duplicate follow-up work.
- **AC-S31-3** — No inbound processing path sends, replies, drafts, labels, or changes a client system without its separate exact key.

**Forbidden actions / hard gates.**

No autonomous reply/send, mailbox-wide content capture, or claim that an un-stoppable watch is reversible.

**Ordered prompt sequence.**

1. Read current watch/Scheduler state and provider contract.
2. Build explicit lifecycle/stop evidence if retained.
3. Integrate only bodyless reply state with S75 and verify idempotency.

**Deletion/merge recommendation.**

Keep until watch lifecycle and S75 integration are complete or the feature is explicitly retired.
