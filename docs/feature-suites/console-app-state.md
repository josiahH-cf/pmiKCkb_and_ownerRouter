# S10 — Console as the app-state-aware front door

> New 2026-06-30 (operator note). Pairs with `ui-ia.md` (S6, Console-as-home). The Console today
> (`F-ACTION-CONSOLE`) gives grounded answers + a safe simulation; this extends it into the
> operator's single front door for running and configuring the app.

**Goal.** Pipe the app's own operational state through the Console so the operator can ask, in plain
language, "what are my approvals?", "what connections still need setup?", "which Spaces don't have a
process yet?", "how do I configure X in this Space?" — and get a grounded, actionable answer. Plus
make the Console's input affordances obvious (visible commands, voice).

**What it is / how it functions.**

- **App-state context (read-only).** A server-resolved, in-boundary context provider surfaces the app's
  OWN state to the answer path: approval-queue items for the user, connector setup gaps (from the
  config-presence model), Spaces-without-a-process and processes-without-connections, and per-Space
  configuration status. Resolved server-side like the existing process context — never client-supplied,
  never a citation, never a system-of-record write. Read-only: the Console reports state + the next
  action + a deep link; it does not execute approvals/sends/writes (those stay in their gated surfaces).
- **Visible slash-commands.** Today's slash-commands aren't self-evident — surface them as visible
  buttons / an obvious command menu in the Console (e.g. "Approvals", "Connections to set up", "Start a
  simulation"), each mapping to the app-state queries above.
- **Speech-to-text in the Console.** Reuse the prod-fenced STT seam (`F-STT-SEAM`, today maintenance-only)
  so the operator can dictate a Console question. Prod = Google STT; dev = the free stub. Edit-gated,
  size-capped, no autonomous action.

**Open questions & assumptions.**

- _Assumption:_ app-state answers are read-only/advisory — they point to the gated surface, never act.
- _Open:_ which app-state queries ship in V1 (approvals, connection gaps, space/process coverage,
  configure-X) vs later; how much of the answer is deterministic (state lookup) vs model-phrased.
- _Open:_ slash-command surface = button row vs `/`-menu vs both.

**Cross-product impacts.** `app/ask/*`, `components/ask/AskForm.tsx`, `lib/ask/*`, `lib/llm/prompt.ts`,
a new app-state context module, the STT route/seam. Must not leak client data into model output without
approval, must keep citation discipline (app-state is context, not a cited source), and must not add an
execute path (no approvals/sends from the Console).

**Ordered prompt sequence.**

1. _Discovery:_ inventory the app-state already queryable (approval queue, connector-presence, spaces,
   process definitions) and the existing server-side context-resolution seam.
2. _Build:_ a read-only app-state context provider + the prompt wiring (advisory, deep-linked, no execute).
3. _Build:_ visible slash-command/button affordances mapped to the app-state queries.
4. _Build:_ wire the STT seam into the Console input (prod-fenced).
5. _Context update:_ extend `F-ACTION-CONSOLE` / `F-STT-SEAM` notes in `docs/facts.md`; add tests.

**Deletion/merge recommendation.** EXTEND the existing Console (no new surface). Keep approvals/sends/
writes in their own gated surfaces — the Console answers and links, it does not execute.
