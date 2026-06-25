# S3 — Lease-renewal process maturation (DISCOVERY-GATED — do not build yet)

**Goal.** Reach a team-validated, 100%-correct understanding of the actual renewal process, the meaning
of every spreadsheet column, and a golden/test data set — before building anything, and before locking
a write-back method or "the math."

**What it is / how it functions.** A multi-round discovery: assemble a golden data set from RentVine,
the spreadsheet, Dotloop, and maintenance work; align on the true process; define each column;
distinguish move-in vs move-out vs renewal; surface assumptions, unknowns, edge cases; design the
two-way sync. The existing read-only pipeline (`lib/lease-renewal/pipeline.ts`) and the per-tab header
map (`lib/lease-renewal/headers.ts`) are the starting truth, not the finished spec.

**Two-way sync — write-back method UNDECIDED (`Q-WRITEBACK-METHOD`; options, no lock):**

- **A — append-only "PMI proposal" column/tab** the team copies over. Least invasive, zero risk to the
  live worklog, easiest to trust. _(Conservative recommendation.)_
- **B — cell-anchored compare-and-set write-back by row signature** (the `MockSheet` writeback-safety
  design prototypes this): re-anchor by row, read-after-write verify, per-action approval. More
  automated, higher risk on a freeform sheet.
- **C — RentVine-first write where documented, sheet mirrors.** Blocked: RentVine has no documented
  lease-renewal-write endpoint, so it stays non-executable.
- _Recommend A now, design B behind approval, revisit after golden data. Decide with the team._

**"The math" (UNDECIDED).** Rent change, proration, renewal term length, fee/deposit deltas depend on
column meanings and the team's real practice. Define only after the golden set; present the formulas for
sign-off; never auto-apply.

**Open questions & assumptions (labeled).**

- _Explain (not delete):_ **DWD** — the Sheets reader has a service account sign a JWT impersonating a
  `pmikcmetro.com` user (keyless) so it can read a sheet the managed domain blocks; no key file,
  in-boundary, read-only. See `lib/google-sheets/read-client.ts`.
- _Explain (not delete):_ **frequent lease-end-date conflict flags** — the sheet is a live worklog, so
  the pipeline only flags a field when a sheet value conflicts with an authoritative RentVine match (a
  blank cell with no match is "un-started," not a defect). Frequent flags most likely come from
  freeform/edited values and date-format drift — **validate frequency against golden data before
  trusting it**; do not assume the rule is wrong.
- _Unknown:_ **"ABC"** — undefined in repo; owner must define (`Q-ABC-1`).
- _Open:_ per-column canonical meaning; which columns are authoritative vs worklog; renewal vs move-in
  vs move-out ownership of shared fields (`Q-PREC-1`).
- _Assumption:_ the sheet stays variable/freeform/constantly-edited — the design must tolerate that.

**Cross-product impacts.** Feeds the Approval Queue, the renewal non-response notifications (S7), Dotloop
doc build, and Connection Center health. Any write-back is the gated, last-built integration.

**Ordered prompt sequence.**

1. _Discovery:_ with the team, capture the real end-to-end renewal process (who does what, when, why).
2. _Discovery:_ build round-1 golden data set across RentVine + sheet + Dotloop + maintenance; expect
   several rounds; keep it in-boundary, out of git (data-governance rules apply).
3. _Understanding:_ define every column's meaning + authority; document move-in vs move-out vs renewal.
4. _Understanding:_ enumerate edge cases and conflict types against golden data; calibrate flag rules.
5. _Understanding:_ write the two-way-sync options doc (A/B/C) + "the math" formula set for sign-off.
6. _Decision gate:_ team validates process, columns, golden set; owner picks write-back method. **Stop
   here until validated — do not build.**
7. _Build (post-gate):_ implement agreed reconciliation refinements read-only first.
8. _Build (post-gate):_ implement the chosen write-back behind per-action approval + read-after-write.
9. _Context update:_ register validated facts and the chosen method in `docs/facts.md`.

**Deletion/merge recommendation.** KEEP, gated. No merge. Add "validated-with-team" facts to
`docs/facts.md` so a later model cannot build on unvalidated assumptions.
