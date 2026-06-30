# S6 — UI / IA architecture (recalibrated 2026-06-30)

> **History.** R1 (2026-06-29, `F-OPS-CONSOLE-IA`) shipped a launcher home + a Spaces front-door
> dropdown + Renewals nested + "Ask"→"Console". The operator note (2026-06-30) recalibrates the
> target IA below. `F-OPS-CONSOLE-IA` still describes the CURRENT built state; this spec is the
> target the loop builds toward (it will supersede `F-OPS-CONSOLE-IA` when shipped). The earlier
> R1 spec text is in git history. See `docs/temp/recalibration-plan.md` and the operator note.

**Goal.** Make the app feel like a mature, workflow-first operations console for a non-technical,
process-oriented operator: the **Console is the front door**, **Spaces carry their processes**
(Processes stops being a separate tab), every Space card is fully clickable, and Maintenance lives
in the sub-tabs. Less reading, more workflow.

**What it is / how it functions.**

- **Console = home/landing.** Hitting `/` (PMI) lands on the Console, not a launcher of cards. The
  current `OperationsConsoleHome` launcher is replaced; Spaces are reached from a nav dropdown / sub-tabs.
  (The Console's new app-state-aware brain is `console-app-state.md` / S10.)
- **Spaces ⊇ Processes.** The standalone **Processes** nav tab is retired and each process definition
  is surfaced **alongside its Space** (a Space and its process live together, via a dropdown / set of
  sub-tabs). KEEP the process-definition ENGINE (definitions, lifecycle, simulation runs, the seeders) —
  only the separate nav/IA is removed. `/processes` content folds under Spaces.
- **Spaces reflect the REAL spaces + processes.** Replace the generic tile grid with cards that mirror
  the actual spaces and their process state (has-a-process / needs-a-process / connections-needed). The
  **whole card is clickable** (not just an "Open Space" link).
- **Maintenance into sub-tabs.** Fold the Maintenance entry into the sub-tabs (likely under Admin; its
  own tab only if needed). `/maintenance` route preserved.
- **Plain-language copy.** Finish the S2 lexicon migration on Space surfaces (drop "KB-owned process" etc.).

**Open questions & assumptions.**

- _Assumption (owner-directed 2026-06-30, `A-IA-V2`):_ Console-as-home + Spaces⊇Processes + clickable
  cards + Maintenance-in-sub-tabs is the chosen IA.
- _Open:_ Maintenance under Admin vs its own tab — confirm. Slash-command discoverability approach
  (visible buttons vs command menu) — see S10. Per-Space "teeth" depth — see `space-teeth.md` / S11.
- _Open:_ preserve every working route (`/lease-renewal`, `/maintenance`, deep links, `smoke:*`) as nav moves.

**Cross-product impacts.** Touches `app/page.tsx`, `components/home/*`, `components/layout/AppShell.tsx`,
`app/spaces/*`, `app/processes/*`, `lib/spaces.ts`. Must not regress role gates (Connections/Admin),
the edit-gate on `/maintenance`, or the simulation-only posture. Pairs with S10 (Console brain) and
S11 (per-Space teeth).

**Ordered prompt sequence.**

1. _Discovery:_ map every nav entry, route, role gate, and test asserting the current IA.
2. _Understanding:_ design the Console-as-home shell + the Spaces-with-sub-tabs structure (process beside Space).
3. _Build:_ Console becomes `/`; retire the launcher; preserve routes.
4. _Build:_ retire the Processes nav tab; surface each process under its Space; fold Maintenance into sub-tabs.
5. _Build:_ real, fully-clickable Space cards reflecting process/connection state; finish S2 copy.
6. _Context update:_ supersede `F-OPS-CONSOLE-IA` in `docs/facts.md` (Supersede Log marker); update nav/role tests.

**Deletion/merge recommendation.** MERGE Processes into Spaces (retire the tab + `/processes` nav, keep
the engine + routes). REPLACE the launcher home with the Console. Preserve all URLs and `smoke:*`.
