# Budget guardrail

This second-generation Cloud Function can disable project billing when a Cloud Billing notification
reaches the effective hard ceiling. Disabling billing also takes the application down, so the
project's lower alert-only budget is an essential early-warning control.

Live readback on 2026-08-26 verified:

- function `budget-guardrail` is ACTIVE on Node.js 22;
- `KILL_SWITCH_CAP_USD=100`;
- the project hard-stop budget is $100;
- the project alert-only budget is $25; and
- the account alert backstop is $100.

The repository's legacy local planning guard may still use a stricter fallback. It is not the live
Cloud Billing ceiling. Never redeploy this function without explicitly preserving the verified live
cap and reading the function plus budgets back.

## How it works

```
Cloud Billing budget (on the billing account, scoped to the project)
  --> publishes a notification to a Pub/Sub topic when a threshold is crossed
    --> this Cloud Function (trigger-topic) runs
      --> decode notification -> decide vs cap -> if over cap AND billing enabled:
            clear the project's billingAccountName  ==> billing disabled, spend stops
```

The function uses the **smaller** of `KILL_SWITCH_CAP_USD` and the budget notification's amount.
This prevents either configuration from silently raising the effective ceiling.

## Files

- `decide.mjs` — pure: decode the Pub/Sub budget notification + the cap decision. No GCP SDK, no I/O.
- `handler.mjs` — `handleBudgetEvent(event, deps)`; the billing client is injected so the whole path
  is testable. Disables billing only when over cap **and** billing is still enabled (idempotent).
- `index.mjs` — the functions-framework entrypoint (`budgetGuardrail`). Imports the GCP SDK; tests
  do not import this file.
- `package.json` — this function's own deps (`@google-cloud/billing`, functions-framework). They are
  installed at deploy time by the buildpack and are **not** part of the main app.

## Tested locally

`tests/unit/budget-killswitch.test.mjs` (runs under `npm test`) exercises decode → decide → disable
against the exact JSON Cloud Billing publishes, with an injected mock billing client. It proves the
disable call fires with `billingAccountName: ""` over the cap, no-ops below it, and no-ops when
billing is already disabled — with zero live calls.

## Change procedure

Generate a print-only plan with:

```
npm run killswitch:plan          # prints the runbook with this project's identifiers
```

Apply changes only under the cloud authority and protected-path rules in `AGENTS.md`, using a managed
identity. Read back budgets, channels, function runtime/state, service identity, and environment.

**Never test the disable path against the production project.** Use the print-only/no-op wiring proof
or an isolated throwaway project. Current policy and incident response live in
`docs/budget-and-cost-policy.md` and `docs/production-incident-runbook.md`.
