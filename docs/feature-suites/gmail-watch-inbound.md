<!-- spec-shape: overhaul-v1 -->

# S31 — Gmail watch continuity and follow-up

> Status: Continuous watch is retired; manual refresh and source-backed follow-up state are complete and deployed.

**Goal.**

Make inbound reply attention current and reversible without sending client mail.

**What it is / how it functions.**

Use an explicit read-only manual refresh to fetch targeted linked threads and surface provider-backed
waiting-on and last-contact state. The expired watch is not renewed; its sole Pub/Sub subscription
and topic were deleted and read back absent on 2026-08-27.

**Open questions & assumptions.**

Client timing and override-policy values belong to S75. Reintroducing continuous watch would require
a new explicit owner decision plus a complete start/renew/stop/readback contract.

**Cross-product impacts.**

Workflow Communications, notifications, S75 waiting-on state, Scheduler/Pub/Sub, and incident operations.

**Adversarial acceptance checks.**

- **AC-S31-1** — A watch cannot be called reversible until an authenticated stop path and readback exist.
- **AC-S31-2** — Duplicate/out-of-order Pub/Sub delivery is idempotent and cannot duplicate follow-up work.
- **AC-S31-3** — No inbound processing path sends, replies, drafts, labels, or changes a client system without its separate exact key.

**Forbidden actions / hard gates.**

No autonomous reply/send, mailbox-wide content capture, or claim that an un-stoppable watch is reversible.

**Ordered prompt sequence.**

1. Use manual refresh for current workflow-linked thread state.
2. Keep duplicate/out-of-order cursor handling idempotent.
3. Treat a future watch as a newly reviewed activation, not an assumed continuation.

**Deletion/merge recommendation.**

Retain this file as the active source-specific operating contract until the next deliberate suite
consolidation.
