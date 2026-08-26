<!-- spec-shape: overhaul-v1 -->

# S36 — Space self-service provisioning

> Status: Provisioning remains closed; current Production already has eleven configured Spaces.

**Goal.**

Allow a qualified Admin to provision one approved Space without weakening cost, identity, source, or rollback controls.

**What it is / how it functions.**

A preview must name storage/search resources, service identity, source boundary, cost effect, and deletion/rollback. Provisioning is not ordinary content editing.

**Open questions & assumptions.**

Select the exact provisioning product shape and required GCP resources/IAM/cost policy for a new Space.

**Cross-product impacts.**

Admin, Spaces, GCP resources, IAM, budgets, source ingestion, and environment handoff.

**Adversarial acceptance checks.**

- **AC-S36-1** — Provisioning is unavailable while its flag/gate or required reviewed resource plan is absent.
- **AC-S36-2** — One provisioned Space is read back across every created resource and can be retired without touching others.
- **AC-S36-3** — A user cannot supply arbitrary project, service account, bucket, data store, or IAM bindings.

**Forbidden actions / hard gates.**

No generic cloud-resource creation UI, personal identity, unbounded spend, or silent shared-resource deletion.

**Ordered prompt sequence.**

1. Choose one concrete Space/resource plan.
2. Build exact preview/confirm/provision/readback/rollback.
3. Pilot one Space under cost and identity controls.

**Deletion/merge recommendation.**

Keep until self-service provisioning is proven or explicitly descoped.
