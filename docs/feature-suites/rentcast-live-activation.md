<!-- spec-shape: overhaul-v1 -->

# S59 — RentCast reference-comp activation

> Status: Complete and deployed; exact read key is open with allowance 50.

**Goal.**

Provide bounded, source-linked market reference data without setting the offered rent.

**What it is / how it functions.**

The provider uses Secret Manager, cache, usage counter, hard allowance stop, validated responses, and exact read gating.

**Open questions & assumptions.**

Client/Admin must still confirm search radius and comparable-count policy.

**Cross-product impacts.**

Lease Renewal comps, pricing suggestions, owner-draft evidence, usage Admin, and cost controls.

**Adversarial acceptance checks.**

- **AC-S59-1** — Missing key, closed gate, exhausted allowance, provider failure, or invalid response fails closed.
- **AC-S59-2** — Returned reference data carries provider/source/time and cannot populate offered rent.
- **AC-S59-3** — Usage is counted and bounded across requests.

**Forbidden actions / hard gates.**

No key in Git/logs, unbounded calls, invented comp, provider estimate as approved offer, or system write.

**Ordered prompt sequence.**

1. Preserve current live activation and cap.
2. Obtain operator search policy.
3. Verify policy changes with deterministic/provider-bound tests.

**Deletion/merge recommendation.**

Keep until the operator policy is confirmed, then merge the durable contract into the renewal product doc.
