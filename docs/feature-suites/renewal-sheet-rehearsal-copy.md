<!-- spec-shape: overhaul-v1 -->

# S76 — Renewal Sheet rehearsal copy and reversible proof

> Status: Admin paste/save configuration and proof tooling are complete; no distinct rehearsal Sheet is configured and no live cell proof has run.

**Goal.**

Prove the Sheet write/read/undo path on a verbatim copy without touching the operating workbook.

**What it is / how it functions.**

Admin accepts a Google Sheet URL or id, canonicalizes it server-side, refuses invalid or
operating-equal values, records an audit entry, and never reads Sheet contents or starts the proof.
The CLI consumes the Admin-saved id without an environment deployment, is dry by default, and binds
live mode to the exact copy/cell/confirmation.

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
