<!-- spec-shape: overhaul-v1 -->

# S72 — Client-confirmed six-step renewal model

> Status: Active; waits on the client's six steps, order, owner, and completion proof.

**Goal.**

Make the renewal workspace follow the actual client process, with comps first and reusable form configuration where confirmed.

**What it is / how it functions.**

Represent six named steps with ownership, prerequisites, evidence, completion state, and lease-specific progress. Configuration is versioned; existing leases do not silently inherit changed meaning.

**Open questions & assumptions.**

Client process expert must supply the exact six steps, order, owner, completion proof, and form-link behavior.

**Cross-product impacts.**

Renewal desk/workspace, attention, assignments, forms, packet truth, drafts, and reporting.

**Adversarial acceptance checks.**

- **AC-S72-1** — UI labels/order/ownership exactly match the approved process version.
- **AC-S72-2** — A missing or changed process definition is visible and cannot mark work complete.
- **AC-S72-3** — Comps and provider/reference data remain separate from an approved offered rent.

**Forbidden actions / hard gates.**

No runner-invented steps, hidden auto-completion, source write, or client communication.

**Ordered prompt sequence.**

1. Capture and confirm the process in plain language.
2. Version the definition and migration/default behavior.
3. Build workspace/progress tests and client walkthrough.

**Deletion/merge recommendation.**

Keep until the client-validated six-step model is deployed and current facts/product docs carry it.
