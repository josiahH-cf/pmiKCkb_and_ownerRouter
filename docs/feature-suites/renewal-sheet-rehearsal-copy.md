<!-- spec-shape: overhaul-v1 -->

# S76 — Renewal Sheet rehearsal copy and reversible proof

> Status: Boundary and proof tooling are built; no distinct rehearsal Sheet is configured and no live cell proof has run.

**Goal.**

Prove the Sheet write/read/undo path on a verbatim copy without touching the operating workbook.

**What it is / how it functions.**

Admin separates operating/read-only and rehearsal-copy links. CLI proof is dry by default; live mode binds exact copy/cell/marker confirmation.

**Open questions & assumptions.**

Client/Admin must create/share the distinct copy and select a blank sacrificial cell.

**Cross-product impacts.**

Admin Connections, Sheets DWD, deployment config, receipts, and client testing.

**Adversarial acceptance checks.**

- **AC-S76-1** — Missing, malformed, inaccessible, or operating-equal rehearsal id refuses.
- **AC-S76-2** — Proof performs blank compare-and-set, exact readback, exact clear, and final blank readback.
- **AC-S76-3** — Failure attempts cleanup and reports ambiguity without treating it as success.

**Forbidden actions / hard gates.**

No operating-Sheet target, nonblank overwrite, broad range, formula destruction, unconfirmed live run, or retained marker.

**Ordered prompt sequence.**

1. Create/share/configure the distinct copy.
2. Dry-run and review exact cell/confirmation.
3. Run once, verify final blank, and retain bodyless proof.

**Deletion/merge recommendation.**

Keep until the live copy proof is complete; then merge the boundary into the Sheet product contract.
