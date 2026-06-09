# Away Mode (Temporary Overlay)

This is a **temporary, reversible overlay** on top of the normal governance in `AGENTS.md`
and `docs/autonomous-agent-runner.md`. It tightens cost/cloud/external autonomy while the
owner is on vacation and unreachable, then is removed to restore the fully open agentic
development loop. It does **not** replace or weaken any existing safety rule; it only adds
a more conservative posture for a defined window.

<!-- The line below is machine-readable. scripts/check-budget-guard.mjs parses it. -->
<!-- Set it to INACTIVE (see the Return Checklist) to lift the overlay. -->

AWAY_MODE_STATUS: ACTIVE

## Status

- Status: **ACTIVE**
- Activated: 2026-06-09
- Expected return: ~2026-06-16 (owner away about one week)
- Review-by: 2026-06-20 (do not auto-expand after this date; see Expiry Handling)
- Budget cap during this window: **$10 total**, and effectively $0 of live cloud spend
  because billing is not yet provisioned (see `docs/budget-and-cost-policy.md`).

## Why This Exists

The owner is away for about a week with minimal availability to approve or supervise. The
local agentic loop runs fully unattended (`.codex/config.toml` keeps
`approval_policy = "never"` and `sandbox_mode = "danger-full-access"` — intentionally
preserved so the development loop stays open). With no human in the approval path, the
guardrail has to be the agent's own discipline plus the executable gates. Away mode makes
that discipline explicit: keep doing safe local work, spend nothing, and queue anything
that needs a human for the owner's return instead of pinging.

## Operating Posture While Away

### Allowed unattended (unchanged from the normal safe loop)

- Read and inspect the repo.
- Local code, docs, tests, lint, typecheck, build, and dry-run/preflight scripts.
- Regression fixes and doc/status alignment within the active product lane.
- Prepare a commit queue and commit/push to the current `work/` branch.
- Update `docs/loop-state.md` and `docs/status.md`.

### Blocked while away — queue for return, do not attempt

Everything already listed in the Approval Gates of `docs/autonomous-agent-runner.md`, and
specifically:

- Any cloud/API spend, deploy, live import, or indexing.
- Setting `ASK_DEMO_MODE=false` to run live Gemini/Vertex commands, or any
  `smoke:*-live` / `deploy:*` run, unless it was already explicitly approved before the
  owner left.
- The Pro model, extra Spaces, or enabling Gmail notifications (the budget guard refuses
  the `--allow-*` overrides while away).
- Gmail read/modify/draft/send, external-system writes, key creation/rotation/use.
- Sending any client communication or external message.
- Merging to `main` or any production/staging change.

When the next safe step would require any of the above, **do not raise a per-item approval
request** (the owner cannot act on it). Instead add it to the On-Return Review Queue in
`docs/loop-state.md` and continue with the next safe local slice, or stop cleanly if none
remains.

### Minimal-visibility rule

Batch everything that needs the owner into the On-Return Review Queue rather than emitting
approval prompts or notifications during the window. A clean stop with a current
`docs/loop-state.md` is a successful outcome.

## Daily Self-Check

While away mode is active, run `npm run check:budget-guard` before any borderline action
and at least once per unattended session. It confirms the cost posture is safe and refuses
cost-bearing overrides while the overlay is active.

## Expiry Handling

If today is on or after the Review-by date and this file is still `ACTIVE`, **do not
auto-expand autonomy**. The fuzzy "about a week" return means lapsing the window must stay
conservative, not open up on its own. Instead:

1. Record in `docs/loop-state.md` that the away-mode window has lapsed without an explicit
   return.
2. Keep the conservative posture (treat the overlay as still active for cost/cloud/external
   actions).
3. Wait for the owner to run the Return Checklist below. Restoring full openness is always
   a deliberate human action, never automatic.

## Return Checklist (restore full openness)

When the owner is back, lift the overlay in three steps. Each step is an additive removal,
so the repo returns to its exact prior, fully open governance with no residue:

1. In this file, change `AWAY_MODE_STATUS: ACTIVE` to `AWAY_MODE_STATUS: INACTIVE`, and
   set Status to **INACTIVE** (or delete this file entirely — the budget guard treats a
   missing file as not-active).
2. In `AGENTS.md`, delete the fenced "Temporary Operating Overlay — Away Mode" block near
   the top.
3. In `docs/loop-state.md`, revert the `Operating mode:` line in the Snapshot and clear the
   On-Return Review Queue after the owner has reviewed it.

After these three edits, the loop is "completely open" again: the unattended multi-slice
loop, `.codex` openness, and all existing approval gates remain exactly as before. The
durable budget policy (`docs/budget-and-cost-policy.md`), the `check:budget-guard` script,
the CI guard step, and the `.gitignore` hardening intentionally **stay** — they are not
part of this overlay and improve safety in open mode too.

## What Is Intentionally Not Changed

- `.codex/config.toml` (`approval_policy = "never"`, `danger-full-access`, network access)
  is left as-is so the unattended development loop keeps working.
- No existing approval gate, security rule, or product-lane boundary is relaxed.
- No runtime app config (`lib/config/server.ts`) is changed; away mode is a process/governance
  overlay plus a read-only guard, not a runtime feature flag.
