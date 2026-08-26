<!-- spec-shape: overhaul-v1 -->

# S56 — Production Live-only and local rehearsal

> Status: Complete; this is the current environment contract.

**Goal.**

Keep Production free of product Demo/Test records and effects while preserving safe deterministic tests and local Live-read-only inspection.

**What it is / how it functions.**

Production uses Live data only. Local rehearsal resolves explicitly to Demo + Live-read-only and request-level refuses persistence/provider effects. Automated fixtures remain test-only.

**Open questions & assumptions.**

No hosted Demo environment is selected. That is not a blocker to production or local verification.

**Cross-product impacts.**

Environment descriptor, proxy/routes, Admin, Console, release, test helpers, and documentation.

**Adversarial acceptance checks.**

- **AC-S56-1** — Production never exposes a product control that seeds or simulates client records/effects.
- **AC-S56-2** — Local Live-read-only refuses every non-safe route/server action and direct provider-effect construction.
- **AC-S56-3** — Automated deterministic fixtures cannot reach Production.

**Forbidden actions / hard gates.**

No production fixture seeder, fake provider receipt, hidden Test lane, or fallback from Live failure to sample data.

**Ordered prompt sequence.**

1. Keep descriptor/refusal sentinels green.
2. Use automated fixtures only in tests.
3. Treat any production Test artifact as an incident.

**Deletion/merge recommendation.**

Keep as the active environment contract.
