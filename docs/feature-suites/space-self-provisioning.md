<!-- spec-shape: overhaul-v1 -->

# S36 — Space self-service provisioning

> Status: Fixed one-Space lifecycle is complete to the official Discovery Engine seam; execution remains closed pending one owner-approved pilot packet.

**Goal.**

Allow a qualified Admin to provision one approved Space without weakening cost, identity, source, or rollback controls.

**What it is / how it functions.**

Admin derives exactly one `kb-<space>-txt` Discovery Engine data store in project
`pmi-kc-kb-prod`, location `us`, and one isolated prefix in the existing production source bucket.
The runtime identity, eleven predecessor stores, cost controls, exact preview hash, confirmation,
durable attempt/receipt, provider readback, and isolated retirement are fixed by server code.

**Open questions & assumptions.**

One owner-approved pilot packet must name the saved Space request, the first verified JSONL object in
the displayed prefix, and the approval evidence reference. The runtime flag stays false until that
packet is reviewed.

**Cross-product impacts.**

Admin, Spaces, GCP resources, IAM, budgets, source ingestion, and environment handoff.

**Adversarial acceptance checks.**

- **AC-S36-1** — Provisioning is unavailable while its flag/gate or required reviewed resource plan is absent.
- **AC-S36-2** — One provisioned Space is read back across every created resource and can be retired without touching others.
- **AC-S36-3** — A user cannot supply arbitrary project, service account, bucket, data store, or IAM bindings.

**Forbidden actions / hard gates.**

No generic cloud-resource creation UI, personal identity, unbounded spend, or silent shared-resource deletion.

**Ordered prompt sequence.**

1. Supply the exact owner-approved pilot packet.
2. Review the generated fixed preview and literal confirmation.
3. Enable one bounded attempt, verify the receipt/readback, then prove isolated retirement.

**Deletion/merge recommendation.**

Keep until self-service provisioning is proven or explicitly descoped.
