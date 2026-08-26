<!-- spec-shape: overhaul-v1 -->

# S75 — Renewal follow-up and property timing

> Status: Active; basic follow-up exists, but waiting-on/last-contact truth and per-property timing overrides need the final Admin surface.

**Goal.**

Show who the renewal is waiting on, when contact last occurred, and the correct property-specific timing without auto-sending.

**What it is / how it functions.**

Store explicit waiting party, last-contact source/time, next due time, and versioned global/property/lease rules with most-specific-wins.

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

1. Confirm timing/ownership policy.
2. Build Admin global/property/lease override surface.
3. Integrate source-backed contact/waiting state and attention.

**Deletion/merge recommendation.**

Keep until the policy surface and follow-up truth are deployed.
