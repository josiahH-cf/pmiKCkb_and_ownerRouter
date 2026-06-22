# Budget Guardrail — hard-cap kill switch

A Cloud Function (2nd gen) that **disables the project's billing** when a Cloud Billing budget
reports cumulative cost has reached the cap. This is the only layer that can truly stop spend — a
GCP budget alert by itself only _notifies_. See `docs/budget-killswitch.md` for the full design and
`docs/budget-and-cost-policy.md` for how it fits the $10 policy.

## How it works

```
Cloud Billing budget (on the billing account, scoped to the project)
  --> publishes a notification to a Pub/Sub topic when a threshold is crossed
    --> this Cloud Function (trigger-topic) runs
      --> decode notification -> decide vs cap -> if over cap AND billing enabled:
            clear the project's billingAccountName  ==> billing disabled, spend stops
```

The kill switch's ceiling is its own `KILL_SWITCH_CAP_USD` (default 10), and it uses the **smaller**
of that and the budget's own amount — so a mis-set budget can never silently raise the real cap.

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

## Provisioning (owner-side, gated)

Creating the budget, deploying the function, and granting it billing-admin IAM are
billing-console + cost-bearing actions (a governance Hard Stop). Generate the exact, ready-to-run
commands with:

```
npm run killswitch:plan          # prints the runbook with this project's identifiers
```

Then run them while authenticated as `josiah@pmikcmetro.com`. **Never test the disable path against
the production project** (it would take the live app down) — use the safe no-op wiring test the
runbook prints, or trip a throwaway project. See `docs/budget-killswitch.md`.
