# Claude Compatibility Router

Use `AGENTS.md` as the active router for this repository.

This file exists so Claude-style runners and other agents find the same entrypoint. Keep
it as a pointer only; durable product and execution guidance belongs in `AGENTS.md` and
`docs/`.

When the user says "let's plan the next feature cycle" or similar, read
`docs/loop-state.md` and `docs/autonomous-agent-runner.md` through the `AGENTS.md` route
before planning or building. "Plan" produces a packet and stops; "run the loop",
"continue", or "build" authorizes the unattended multi-slice loop with its
verification-and-falsification and stop-and-reset rules.

Do not duplicate durable rules here. If this file appears stale, update `AGENTS.md` and
the relevant `docs/` file first, then keep this file as a short pointer.
