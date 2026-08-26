<!-- spec-shape: overhaul-v1 -->

# S66 — Lease document packet truth and prefill

> Status: Deterministic truth/snapshot/binding machinery is built; approved catalog and live provider mapping are missing.

**Goal.**

Prepare the correct lease packet from approved facts without inventing legal content or provider mappings.

**What it is / how it functions.**

A versioned exact-hash snapshot separates required artifacts, participants, fields, signatures, sources, and readiness. Provider binding accepts only a complete current snapshot.

**Open questions & assumptions.**

Client must approve the artifact/field/participant/signature/form-family/rule catalog and Dotloop mapping. Boom is not assumed as a document-fact source.

**Cross-product impacts.**

Lease Renewal workspace, trusted sources, Dotloop S34, Drive artifacts, recipients, and audit.

**Adversarial acceptance checks.**

- **AC-S66-1** — Missing catalog/source/participant/signature requirements keep readiness blocked.
- **AC-S66-2** — Snapshot creation is immutable/idempotent by exact source hash and conflict-safe.
- **AC-S66-3** — Provider binding rejects incomplete, stale, mismatched, or locally asserted completion.

**Forbidden actions / hard gates.**

No invented legal copy, guessed provider fact, forged completion, autonomous send, or Dotloop execution without S34.

**Ordered prompt sequence.**

1. Publish approved catalog through trusted sources.
2. Recompute and review exact packet snapshot.
3. Activate S34 only after provider mapping/OAuth proof.

**Deletion/merge recommendation.**

Keep until approved catalog and one live provider packet proof are complete.
