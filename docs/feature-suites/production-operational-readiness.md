<!-- spec-shape: overhaul-v1 -->

# S51 — Production operational readiness

> Status: Current operating contract; production is live on pmi-kc-app with exact revision release controls.

**Goal.**

Keep production observable, recoverable, identity-safe, and releaseable.

**What it is / how it functions.**

Use managed identities, bounded resources, logs/health, exact version endpoint, zero-traffic candidates, traffic readback, incident response, and rollback.

**Open questions & assumptions.**

No phase blocker. The captured 2026-08-26 rollback command should be executed in the next non-meeting release window.

**Cross-product impacts.**

Cloud Run, Firebase, Firestore, providers, budget controls, runbooks, and deployment evidence.

**Adversarial acceptance checks.**

- **AC-S51-1** — A candidate receives zero traffic until exact commit/revision smoke passes.
- **AC-S51-2** — Promotion targets one exact revision and records the current predecessor.
- **AC-S51-3** — Stable smoke and configuration readback detect traffic or runtime drift.

**Forbidden actions / hard gates.**

No to-latest promotion, personal identity, silent config replacement, or deployment with failed gates.

**Ordered prompt sequence.**

1. Run managed identity/config/budget preflights.
2. Deploy and smoke zero-traffic candidate.
3. Promote exact revision, read back, and rehearse rollback when required.

**Deletion/merge recommendation.**

Keep as the active production-release contract.
