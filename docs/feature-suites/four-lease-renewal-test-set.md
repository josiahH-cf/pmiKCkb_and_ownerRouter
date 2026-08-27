<!-- spec-shape: overhaul-v1 -->

# S63 — Four-lease renewal operational proof

> Status: Dependency-independent machinery is proven and the ready-to-run sequence is documented; client process/rent/comp-policy decisions block the outcome.

**Goal.**

Show that the renewal product produces the correct process and defensible number on the designated four leases.

**What it is / how it functions.**

Freeze source baselines, run provider comps and process decisions separately, preserve exact lease identity, and record criteria without changing source systems.

**Open questions & assumptions.**

Client-confirmed six-step process, current-rent semantics, operator comp policy, and observation results.

**Cross-product impacts.**

S59 comps, S72 process, recipients, owner policy, drafts, evidence, and pilot reporting.

**Adversarial acceptance checks.**

- **AC-S63-1** — Each result is keyed by lease id and frozen source hash, never address alone.
- **AC-S63-2** — Process and number criteria remain distinct and show not-evaluated when input is missing.
- **AC-S63-3** — No cohort evidence sends a message or writes RentVine/Sheet.

**Forbidden actions / hard gates.**

No invented client answer, source overwrite, autonomous outreach, or broad cohort write.

**Ordered prompt sequence.**

1. Record the three client decisions named in `docs/evidence/four-lease-proof-readiness-2026-08-27.md`.
2. Capture the immutable read-only lease-id/row/source-hash baselines and append observed evidence.
3. Generate the gitignored report, review process and number criteria separately, and record factual dispositions.

**Deletion/merge recommendation.**

Keep until the four-case operational report is complete.
