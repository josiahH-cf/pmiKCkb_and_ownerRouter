# S11 — Per-Space "teeth" (real desks, not scaffolds)

> New 2026-06-30 (operator note). Today only Lease Renewal and Maintenance have built desks; the
> other Spaces (move-in, move-out, owner onboarding, …) route to a generic detail page with no
> clarity on how to use them. This suite gives each V1 Space teeth. The `v1-process-qa.md` gate is
> ANSWERED (2026-07-01); this suite executes via S13 Wave 2 (`pre-customer-refinement.md`).

**Goal.** When the operator opens a Space (e.g. Move-In), it should be immediately clear what the
Space is for, what to do next, which tools are connected, and where the process stands — built for a
non-technical, process-oriented user: simple, elegant, intuitive, workflow-first, less reading. No
"the thing + an explanation of the thing"; show the workflow.

**What it is / how it functions.**

- **A per-Space desk pattern.** Generalize the proven Renewal Desk / Maintenance capture shape into a
  reusable per-Space desk: a clear header + what-this-is, the process steps as a workflow (not prose),
  the connected tools + their status, the actionable items, and the next action — backed by the Space's
  process definition (the engine kept from S6).
- **Move-In V1 desk.** Build the move-in process definition + desk per the confirmed Q&A answers
  (manual trigger; NO hard blocking gates in V1 — e-sign/certified-funds are tracked checklist flags
  per the owner's Q2 override in `v1-process-qa.md`; email + portal-chat welcome drafts, fees as
  "see RentVine" placeholders, deposit-posture branch, read + draft + suggest-to-sheet only). Content-key
  Tab 1 (never trust its headers). Read + checklist surface first; reconciliation/golden later.
- **Move-Out + Deposit Disposition V1 desk.** Build per the RECORDED Q&A answers (a manual "Start
  move-out" button ONLY in V1 — the automatic Renewals→Move-Out handoff is deferred, per the owner's Q1
  answer; the app DOES compute a clearly-labeled SUGGESTED deposit deduction from operator-entered
  evidence per the owner's Q3 override — owner approval required, transparent arithmetic, never posts to
  any ledger or system of record; the statutory deadline + legal language stay human-entered
  `Needs Verification:` placeholders; assemble the evidence packet + track the "disposition sent" gate;
  RentVine close-out + Rhino claim stay manual; QuickBooks read-only-at-most, out of scope for writes).
  Legal wording never invented.
- **Operator-first polish.** Apply the voice lexicon; make every Space card/desk fully clickable and
  workflow-led.

**Open questions & assumptions.**

- _Answered 2026-07-01:_ the `v1-process-qa.md` questions are ANSWERED — but several answers OVERRIDE
  or narrow the printed defaults (move-in Q2: no hard gates; move-out Q1: manual start only; move-out
  Q3: suggested deposit math), so build from that doc VERBATIM, not from remembered defaults. The desks
  are UNBLOCKED and run via S13 Wave 2. Dan-owned values (deposit ledger, dollar threshold, smart-lock
  demo) render as `Needs Verification:` placeholders, never invented.
- _Assumption:_ each Space desk renders read/draft/suggest only; all writes/sends stay gated.
- _Open:_ owner onboarding and the remaining launch Spaces get desks after move-in/move-out land.

**Cross-product impacts.** `app/spaces/*`, a reusable desk component set, `lib/spaces.ts`, new
`lib/move-in/*` + `lib/move-out/*` domain cores mirroring `lib/maintenance/*` (pure draft builders +
Draft process-definition seeds, `production_allowed:false`), and new gated Action Registry metadata
only where a process doc defines it. Reuses the connector + reconciliation philosophy (content-keyed).

**Ordered prompt sequence.**

1. _Gate (SATISFIED 2026-07-01):_ the move-in / move-out `v1-process-qa.md` answers are recorded —
   build from them verbatim (several override the printed defaults).
2. _Build:_ a reusable per-Space desk pattern from the Renewal Desk / Maintenance shape.
3. _Build:_ the Move-In domain core + Draft process-definition seed + desk (read + checklist + drafts).
4. _Build:_ the Move-Out + Deposit Disposition core + seed + evidence-packet desk + gate tracking.
5. _Context update:_ add `F-MOVEIN-*` / `F-MOVEOUT-*` facts + seeds; update `move-in-move-out-process.md`.

**Deletion/merge recommendation.** KEEP all routes. BUILD desks behind the answered Q&A; do not infer
process scope, deposit/legal rules, or the excluded-credential-tab workflows from the sheet.
