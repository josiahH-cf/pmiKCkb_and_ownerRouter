# S11 — Per-Space "teeth" (real desks, not scaffolds)

> New 2026-06-30 (operator note). Today only Lease Renewal and Maintenance have built desks; the
> other Spaces (move-in, move-out, owner onboarding, …) route to a generic detail page with no
> clarity on how to use them. This suite gives each V1 Space teeth. Gated on `v1-process-qa.md`.

**Goal.** When the operator opens a Space (e.g. Move-In), it should be immediately clear what the
Space is for, what to do next, which tools are connected, and where the process stands — built for a
non-technical, process-oriented user: simple, elegant, intuitive, workflow-first, less reading. No
"the thing + an explanation of the thing"; show the workflow.

**What it is / how it functions.**

- **A per-Space desk pattern.** Generalize the proven Renewal Desk / Maintenance capture shape into a
  reusable per-Space desk: a clear header + what-this-is, the process steps as a workflow (not prose),
  the connected tools + their status, the actionable items, and the next action — backed by the Space's
  process definition (the engine kept from S6).
- **Move-In V1 desk.** Build the move-in process definition + desk per the confirmed Q&A defaults
  (manual trigger, e-sign + certified-funds hard gates, email + portal-chat welcome drafts, fees as
  "see RentVine" placeholders, deposit-posture branch, read + draft + suggest-to-sheet only). Content-key
  Tab 1 (never trust its headers). Read + checklist surface first; reconciliation/golden later.
- **Move-Out + Deposit Disposition V1 desk.** Build per the confirmed Q&A defaults (Renewals-handoff +
  manual trigger; deposit deadline + amount = human-entered with a `Needs Verification:` placeholder, no
  app math; assemble the evidence packet + track the "disposition sent" gate; RentVine close-out + Rhino
  claim stay manual; QuickBooks read-only-at-most, out of scope for writes). Legal wording never invented.
- **Operator-first polish.** Apply the voice lexicon; make every Space card/desk fully clickable and
  workflow-led.

**Open questions & assumptions.**

- _Blocked-until-answered:_ the move-in and move-out desks cannot be built to a defined end-state until
  their `v1-process-qa.md` questions are answered (trigger/owner, gates, deadlines, deposit math, QB,
  templates, the excluded-credential-tab items). This is the note's own RISK — teeth before scaffolding.
- _Assumption:_ each Space desk renders read/draft/suggest only; all writes/sends stay gated.
- _Open:_ owner onboarding and the remaining launch Spaces get desks after move-in/move-out land.

**Cross-product impacts.** `app/spaces/*`, a reusable desk component set, `lib/spaces.ts`, new
`lib/move-in/*` + `lib/move-out/*` domain cores mirroring `lib/maintenance/*` (pure draft builders +
Draft process-definition seeds, `production_allowed:false`), and new gated Action Registry metadata
only where a process doc defines it. Reuses the connector + reconciliation philosophy (content-keyed).

**Ordered prompt sequence.**

1. _Gate:_ confirm the move-in / move-out `v1-process-qa.md` answers (do not build before this).
2. _Build:_ a reusable per-Space desk pattern from the Renewal Desk / Maintenance shape.
3. _Build:_ the Move-In domain core + Draft process-definition seed + desk (read + checklist + drafts).
4. _Build:_ the Move-Out + Deposit Disposition core + seed + evidence-packet desk + gate tracking.
5. _Context update:_ add `F-MOVEIN-*` / `F-MOVEOUT-*` facts + seeds; update `move-in-move-out-process.md`.

**Deletion/merge recommendation.** KEEP all routes. BUILD desks behind the answered Q&A; do not infer
process scope, deposit/legal rules, or the excluded-credential-tab workflows from the sheet.
