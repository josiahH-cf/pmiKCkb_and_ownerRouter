<!-- spec-shape: overhaul-v1 -->

# S{n} — {Title}

> Status: state the present implementation/authority/dependency in one sentence.

**Goal.**

State one observable outcome.

**What it is / how it functions.**

Describe current behavior and the smallest missing change.

**Open questions & assumptions.**

Name exact inputs. Label assumptions; never hide them as facts.

**Cross-product impacts.**

Name affected surfaces, stores, providers, gates, and documentation.

**Adversarial acceptance checks.**

- **AC-S{n}-1** — State a falsifiable behavior or refusal.
- **AC-S{n}-2** — State the evidence/readback.
- **AC-S{n}-3** — State the safety/non-regression boundary.

**Forbidden actions / hard gates.**

List sends, writes, identities, data, or protected paths that remain forbidden.

**Ordered prompt sequence.**

1. Re-verify current code/live state.
2. Build the bounded behavior and refusal paths.
3. Falsify, run tests, update current docs, and ship only when authorized.

**Deletion/merge recommendation.**

Remove the suite from the active tree when its remaining dependency and acceptance checks are fully
represented by code, tests, and current facts.
