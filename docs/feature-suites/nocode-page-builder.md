<!-- spec-shape: overhaul-v1 -->

# S37 — Governed no-code page and layout builder

> Status: Product backlog; current process/template editing is not a full governed page/layout builder.

**Goal.**

Let authorized Admins compose approved operational layouts without executable code or authority changes.

**What it is / how it functions.**

Use a strict component/schema catalog, versioned drafts, preview, approval, publication, rollback, and references to approved data sources/actions.

**Open questions & assumptions.**

Choose the first supported page type and final component/property catalog.

**Cross-product impacts.**

Admin, navigation, page rendering, trusted publication, roles, and source/action references.

**Adversarial acceptance checks.**

- **AC-S37-1** — Unknown component, property, route, script, style escape, or action key is rejected.
- **AC-S37-2** — Publication is versioned, exact-previewed, approved, and rollbackable.
- **AC-S37-3** — A page definition cannot change auth, roles, prompts, registry gates, provider endpoints, or secrets.

**Forbidden actions / hard gates.**

No arbitrary HTML/JS/CSS, code execution, secret fields, unreviewed external embeds, or authority mutation.

**Ordered prompt sequence.**

1. Select one bounded page type.
2. Define schema/catalog and render-only preview.
3. Add approval/publication/rollback and adversarial escape tests.

**Deletion/merge recommendation.**

Keep until the full governed builder is deployed or the owner explicitly removes it from scope.
