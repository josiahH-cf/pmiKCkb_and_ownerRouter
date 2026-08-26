# Implementation pointer

Use `docs/autonomous-agent-runner.md` for the execution loop and `docs/loop-state.md` for the
current slice. Authority and safety are exclusively in `AGENTS.md`.

A new feature requires an active suite only when meaningful product behavior or external authority is
not already specified. Do not create disposable meta-prompts or duplicate plans in the active tree.
