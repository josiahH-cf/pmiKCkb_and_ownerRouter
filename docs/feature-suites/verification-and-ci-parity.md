<!-- spec-shape: overhaul-v1 -->

# S54 — Verification and CI parity

> Status: Complete; local canonical verification and CI run the same policy/static lanes.

**Goal.**

Prevent a change from being green locally and red remotely, or vice versa.

**What it is / how it functions.**

The canonical verifier covers clean install, format, lint, typecheck, unit, Firestore, router, falsification, context, spec, copy, redaction, budget, and production build. Core E2E is separately bounded.

**Open questions & assumptions.**

No current blocker; update both lanes and parity tests whenever a gate changes.

**Cross-product impacts.**

Every merge and release.

**Adversarial acceptance checks.**

- **AC-S54-1** — Local and CI command inventories stay parity-tested.
- **AC-S54-2** — Unit/Firestore/E2E setup and teardown are time-bounded and fail with a named error.
- **AC-S54-3** — A release candidate cannot pass without exact version identity.

**Forbidden actions / hard gates.**

No skipped gate by environment, unbounded browser/emulator wait, or success on partial/truncated output.

**Ordered prompt sequence.**

1. Add behavior/falsification tests.
2. Run focused lanes then canonical verification.
3. Run bounded core E2E and exact release smoke.

**Deletion/merge recommendation.**

Keep as the current verification contract.
