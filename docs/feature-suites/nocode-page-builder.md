<!-- spec-shape: overhaul-v1 -->

# S37 — Governed no-code page and layout builder

> Status: Bounded read-only operational-process builder is complete and deployed.

**Goal.**

Let authorized Admins compose approved operational layouts without executable code or authority changes.

**What it is / how it functions.**

Admin can compose only heading, text, callout, checklist, and approved internal-link components for
an existing Space. Drafts, approvals, publications, receipts, and rollback history are immutable and
exact-hash bound; rendering uses React strings only.

**Open questions & assumptions.**

No product decision is required for this bounded type. Any additional page type or component is a
separate future scope decision and receives no authority from S37.

**Cross-product impacts.**

Admin, navigation, page rendering, trusted publication, roles, and source/action references.

**Adversarial acceptance checks.**

- **AC-S37-1** — Unknown component, property, route, script, style escape, or action key is rejected.
- **AC-S37-2** — Publication is versioned, exact-previewed, approved, and rollbackable.
- **AC-S37-3** — A page definition cannot change auth, roles, prompts, registry gates, provider endpoints, or secrets.

**Forbidden actions / hard gates.**

No arbitrary HTML/JS/CSS, code execution, secret fields, unreviewed external embeds, or authority mutation.

**Ordered prompt sequence.**

1. Create and preview one read-only operational process page.
2. Approve and publish the exact immutable version.
3. Use version history to roll back only that page when needed.

**Deletion/merge recommendation.**

Retain this bounded type as the active S37 contract. Any future broader no-code request must be a new
suite rather than widening this one.
