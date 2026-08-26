# Budget and cost policy

Live readback: 2026-08-26.

## Current controls

| Control                              |                          Current value |
| ------------------------------------ | -------------------------------------: |
| Project alert-only budget            |                                    $25 |
| Project hard-stop budget             |                                   $100 |
| Account-wide alert backstop          |                                   $100 |
| Guardrail `KILL_SWITCH_CAP_USD`      |                                    100 |
| Guardrail runtime                    |                             Node.js 22 |
| Guardrail state                      |                                 ACTIVE |
| Legacy local planning-guard fallback | $10 (conservative; not a live ceiling) |

The old claim that Production has a $10 Cloud Billing hard stop is superseded. A protected local
planning script still defaults to a conservative $10 input; that value is not the deployed budget or
guardrail cap and must never be reported as such. The Node.js 20 upgrade blocker is also superseded.

The project hard-stop budget and guardrail both enforce 100 because the function uses the smaller
applicable ceiling. The alert-only and account backstop notify the configured operators.

## Rules

- Read back budgets, notification channels, function state/runtime, and cap before a cost-bearing
  release when the state may have changed.
- Raising headroom moves the budget and guardrail together.
- Lowering/removing a control or narrowing an alert requires owner direction.
- Keep Cloud Run max instances and other bounded defaults unless a measured need changes them.
- Provider usage caps remain independent; RentCast is currently capped at 50.
- Do not use stale local multi-Space warnings to describe Production. Production intentionally has
  eleven Spaces and releases use the reviewed `--allow-multiple-spaces` path.
- Do not infer the live Cloud Billing ceiling from `AUTONOMOUS_BUDGET_CAP_USD`; live readback wins.

## Three-layer cost-control model

Passing one layer never satisfies another.

| Layer | Control                                                        | Current contract                                                                                                  | Boundary                                                       |
| ----: | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
|     1 | Configuration posture                                          | `npm run check:budget-guard` refuses known cost-unsafe local configuration.                                       | It does not read spend and is not a dollar-enforcement point.  |
|     2 | Global billing alert/hard stop                                 | The $25 alert warns operators; the $100 budget/guardrail chain bounds aggregate monthly Production project spend. | It bounds total project spend, not one user's call rate.       |
|     3 | `/api/ask`: capacity `15`, refill `0.5 token/s`                | Token bucket is keyed by authenticated user UID.                                                                  | These are best-effort, in-memory, per-instance burst controls. |
|     3 | `/api/processes/classify`: capacity `10`, refill `0.2 token/s` | Token bucket is keyed by authenticated user UID.                                                                  | These are best-effort, in-memory, per-instance burst controls. |

The paid-model throttles reduce per-user burst/repeat risk, but they do not make a billed model call
eligible and they do not coordinate across Cloud Run instances. The live cost controls and the
path-specific provider/action conditions still apply.

## Failure mode

The guardrail may disable project billing at the hard stop, causing an outage. Budget alerts are
therefore an early-warning control, not optional decoration. Incident response is
`docs/production-incident-runbook.md`.
