<!-- spec-shape: overhaul-v1 -->

# S47 — Resident Maintenance intake and RentVine channel

> Status: Tokenized app intake exists; the preferred RentVine invitation/reply/webhook channel lacks a documented provider contract.

**Goal.**

Accept a resident issue safely and hand it to Maintenance without guessing resident identity or provider behavior.

**What it is / how it functions.**

The app intake uses bounded tokens, strict media/text limits, unit matching, staff review, and no implicit work-order creation. A RentVine channel is a separate provider activation.

**Open questions & assumptions.**

RentVine/vendor must document invitation, reply/webhook, account mapping, consent, identity, and correction semantics.

**Cross-product impacts.**

Maintenance, resident tokens, photos, unit identity, RentVine, notifications, and retention.

**Adversarial acceptance checks.**

- **AC-S47-1** — Expired, invalid, over-limit, wrong-property, or replayed intake refuses without persistence.
- **AC-S47-2** — Staff review separates submitted facts from verified unit/resident/provider facts.
- **AC-S47-3** — Missing RentVine channel details leave app intake usable and only the provider channel unavailable.

**Forbidden actions / hard gates.**

No guessed resident, autonomous owner/Vendor message, direct provider work-order creation, or unrestricted public upload.

**Ordered prompt sequence.**

1. Re-verify app intake and token boundaries.
2. Obtain official RentVine channel contract.
3. Add one reviewed provider-channel proof and correction.

**Deletion/merge recommendation.**

Keep until the provider channel is proven or explicitly not selected.
