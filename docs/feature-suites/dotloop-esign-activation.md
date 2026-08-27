<!-- spec-shape: overhaul-v1 -->

# S34 — Dotloop e-signature activation

> Status: Exact packet binding, preview/confirmation, idempotency, readback, receipt, reconciliation, and rollback seams are complete; official account inputs are missing.

**Goal.**

Create and reconcile one exact lease packet through documented Dotloop APIs.

**What it is / how it functions.**

S66 produces a current exact-hash packet snapshot. Activation maps only an approved artifact catalog, participants, fields, signatures, and template/profile to a typed provider request.

**Open questions & assumptions.**

Client/provider must supply one approved S66 catalog plus OAuth and the exact account/profile,
template, participant, field, signature, webhook/re-fetch, correction, and rollback mappings. No
provider action becomes executable until those references are official and configured.

**Cross-product impacts.**

S66 packet truth, Lease Renewal, Drive artifacts, Action Registry, receipts, and rollback.

**Adversarial acceptance checks.**

- **AC-S34-1** — An incomplete or stale S66 snapshot cannot create a provider request.
- **AC-S34-2** — One confirmed request is idempotent and provider-read-back before completion is claimed.
- **AC-S34-3** — No guessed legal copy, participant, signature placement, template, profile, or webhook authentication is accepted.

**Forbidden actions / hard gates.**

No UI/RPA automation, guessed API, unsigned legal content, autonomous send, or production flip without the exact provider contract.

**Ordered prompt sequence.**

1. Publish the approved S66 catalog.
2. Configure OAuth and exact Dotloop mappings.
3. Run one preview/confirm/create/readback/correction proof before gate review.

**Deletion/merge recommendation.**

Keep until a live one-packet proof and correction path are complete.
