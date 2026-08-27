<!-- spec-shape: overhaul-v1 -->

# S75 — Renewal follow-up and property timing

> Status: Source-backed waiting-on/last-contact and versioned global/property/lease policy surfaces are complete; client timing values remain unset.

**Goal.**

Show who the renewal is waiting on, when contact last occurred, and the correct property-specific timing without auto-sending.

**What it is / how it functions.**

Gmail refresh derives waiting-on and last-contact only from the latest targeted provider thread.
Admin stores one versioned global rule plus unique property/lease overrides with deterministic
most-specific-wins. Until a client-confirmed rule exists, the UI shows “Timing policy not confirmed”
and produces no due time, reminder, work, draft, or send.

**Open questions & assumptions.**

Client must confirm editable timing fields/defaults and who may manage property/lease overrides.

**Cross-product impacts.**

Renewal desk, notifications, S31 inbound replies, assignments, Admin policy, and drafts.

**Adversarial acceptance checks.**

- **AC-S75-1** — Displayed last contact is provider/source-backed and never inferred from a button click.
- **AC-S75-2** — Most-specific current override wins deterministically and changes are audited/versioned.
- **AC-S75-3** — Due state creates attention/work only and never sends a client message.

**Forbidden actions / hard gates.**

No auto-send, hidden timer, guessed contact, retroactive history rewrite, or implicit approval expansion.

**Ordered prompt sequence.**

1. Client confirms timing values and who may set property/lease overrides.
2. Admin enters those values with the client-confirmed checkbox.
3. Review attention/work output; client messaging remains human-controlled and separately gated.

**Deletion/merge recommendation.**

Keep until the policy surface and follow-up truth are deployed.
