# Budget and cost policy

This is the runner-neutral source of truth for cloud-cost eligibility and least-cost defaults. It
applies whether or not the temporary away-mode overlay is active.

## Current production cost gate

Owner decision D01 (2026-07-29) retired the flat pre-production cap. S52
(`docs/feature-suites/production-cost-governance.md`) owns its replacement:

- a hard monthly stop set above measured realistic burn;
- a lower alert-only threshold that reaches the operator before the stop;
- the GCP budget amount and the guardrail's `KILL_SWITCH_CAP_USD` moved together; and
- coverage/disposition recorded for every project on the billing account, including the dedicated
  Demo project once S40 supplies its identifiers.

The replacement values are currently **unset**. No cost-bearing cloud action has approved headroom
until S52 records a non-null alert value and hard-stop value, the owner approves them from supported
burn evidence, both enforcement points are ready to move in lockstep, and live readback verifies the
result.

The first complete calendar-month Production baseline is not available before 2026-08-01: billing
began partway through June and July is still in progress on the decision date. The runner must not
invent a bootstrap multiplier, floor, default, projection, or dollar amount. For the brand-new S40
Demo project only, once a verified full-calendar Production baseline exists, the owner may select
explicit initial Demo alert/ceiling values with a recorded rationale. That one-time bootstrap expires
after Demo's first complete calendar month and is replaced by Demo's own measured baseline. Until the
applicable owner-selected values exist, local/read-only S51/S52 work continues and billed operations
stay parked.

## What the current live state does and does not authorize

The kill-switch chain is armed and was reverified on 2026-07-29. The currently observed Production
budget/guardrail configuration still carries the historical `$10` monthly value. That is an
important description of live enforcement state, but it is **not approved spending headroom** and
must never be used to license a deploy, live eval, provider call, Scheduler job, or other billed
operation.

Three mechanical facts control the replacement:

1. The budgets use `calendarPeriod: MONTH`; the old word “total” was inaccurate.
2. `infra/budget-guardrail/handler.mjs` applies the smaller of the GCP budget amount and
   `KILL_SWITCH_CAP_USD`. Raising only one produces false headroom.
3. `scripts/check-budget-guard.mjs` checks posture and configuration. It does not read spend or
   enforce a dollar ceiling, so a green `npm run check:budget-guard` cannot make an unset S52 ceiling
   usable.

The hard-stop path disables project billing and can take the resident/staff application offline. It
must remain armed, sit above realistic burn, emit `KILL_SWITCH_FIRED` only after successful
disable/readback, emit `KILL_SWITCH_ALREADY_DISABLED` for a no-update repeat, and emit
`KILL_SWITCH_DISABLE_FAILED` for a failed read/update/readback. It is preceded by the alert-only
`COST_ALERT_THRESHOLD_CROSSED` signal reaching the operator. S51 owns the notification
channel/policies; S52 owns the values and paired enforcement.

## Per-project coverage

Cost controls are project-scoped.

- The Production project has the observed legacy budget/guardrail chain.
- `adept-primacy-499822-d7` has no verified equivalent chain; the owner must choose whether to arm it
  or unlink it from the billing account. Until a live read resolves it, its declared posture is
  `pending_verification`, which is always ineligible.
- The dedicated Demo project does not yet have owner-supplied identifiers. S40 emits its print-only
  budget/topic/guardrail provisioning plan after those values arrive; S52 supplies the reviewed
  owner-selected initial thresholds under the expiring new-Demo rule above.

No suite infers a project id, number, billing relationship, or ceiling from another project. Billing,
budget, IAM, and guardrail-enforcement mutations remain owner-run/protected-review operations.

## Least-cost defaults

Prefer, in order: local emulation → the separately provisioned Demo environment with zero Live
effects → an explicitly authorized bounded cheap-live path → any broader billed path.

| Lever                               | Safe default                                | Reason                                                             |
| ----------------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| Local compatibility `ASK_DEMO_MODE` | `true`                                      | Avoids Vertex/Gemini calls before S40 Demo exists.                 |
| Answer model                        | `gemini-2.5-flash`                          | The approved bounded eval model; Pro requires a separate decision. |
| Active knowledge stores             | One named store or none                     | Bounds indexing/query exposure.                                    |
| Cloud Run scaling                   | `--min-instances=0 --max-instances=1`       | Scale-to-zero and pilot capacity bound.                            |
| Client-facing notifications         | Disabled unless exact workflow gate applies | Prevents autonomous/bulk send.                                     |
| Firestore tests                     | Local emulator                              | No live database mutation.                                         |
| Service-account keys                | Avoid                                       | Use ADC/workload identity; no downloaded long-lived credential.    |

These defaults reduce expected cost; they do not replace the S52 eligibility gate.

## Cost-bearing path inventory

Every row below remains ineligible while the S52 ceiling is null.

| Path                           | Trigger                                 | Additional eligibility after S52                                                                                                                   |
| ------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloud Run deploy/promotion     | `npm run deploy` / legacy `deploy:demo` | Full local gate; fresh managed ADC/CLI auth; budget/live-cost/environment preflights; sanitized env; prior revision; rollback; bounded smoke; D05. |
| Live Gemini answer/classify    | `ASK_DEMO_MODE=false`                   | Flash model, bounded cases/queries, one approved store, no sensitive output, fresh live-cost check.                                                |
| S54 bounded live eval          | `npm run eval:live`                     | Exactly one run, at most 50 cases, no retries, fresh auth and live-verified ceiling, sanitized summary only.                                       |
| Vertex AI Search create/import | import/provision commands               | Print/dry-run first, approved corpus, exact project/store, estimated usage, rollback/delete path.                                                  |
| Cloud Storage source upload    | corpus plan / `gcloud storage cp`       | Approved low-sensitivity source and target, dry-run manifest, no customer data in git.                                                             |
| S31 Gmail-watch Scheduler      | named S31 job                           | Narrow D37 grant, exact managed OIDC identity/audience, print-only plan reviewed, rollback/delete captured.                                        |
| S51 monitoring resources       | monitoring plan                         | Owner-supplied operator destination; owner-run channel/policy/log-retention/IAM changes; live verifier.                                            |
| Provider smoke/read            | provider-specific command               | Documented contract, named action/config gate, bounded read, no guessed endpoint, readback evidence.                                               |
| Client-facing send / SoR write | product confirmation path               | Human exact confirmation plus S25/S26 preview/receipt/reconcile/rollback and named executable action key; never an unattended agent action.        |

## Required preflights

Before any live read, run `npm run preflight:adc`. The active CLI account must also be a managed
`pmikcmetro.com` identity or documented service identity, and
`gcloud auth print-access-token >/dev/null` must succeed without printing the token. If auth is
stale, the owner runs `npm run auth:session` interactively. Independent local work may continue; no
personal-account workaround is allowed.

Before any cost-bearing operation, additionally run:

```bash
npm run check:budget-guard
npm run check:live-cost
```

Both are necessary and neither proves numeric headroom. The operation also requires S52's non-null
live-verified ceiling and its path-specific conditions above.

## Authority and escalation

- The runner may perform a routine application deploy, bounded read-only smoke, rollback rehearsal,
  and traffic promotion under D05 only after every eligibility condition passes.
- The owner performs interactive auth and supplies/changes credentials, scopes, IAM, billing,
  budgets, threshold values, operator destinations, destructive migrations/deletions, and other
  external decisions.
- D12 protects `scripts/check-budget-guard.mjs` and `infra/budget-guardrail/**`; prepare and verify
  those changes for owner review. A protected cost patch parks only that activation while independent
  work continues.
- Remote Away Mode, if explicitly activated later, never creates numeric headroom or waives S52,
  auth, protected-path, send/write, or destructive-operation boundaries.
- If an operation's cost cannot be bounded or the live enforcement state cannot be verified, leave
  it inert and add one exact item to the consolidated owner packet. Do not substitute the observed
  legacy amount.

## Related

- `docs/feature-suites/production-cost-governance.md` — executable S52 contract.
- `docs/budget-killswitch.md` — observed hard-stop chain and operational history.
- `docs/autonomous-agent-runner.md` — slice, auth, protected-path, and D05 rules.
- `docs/away-mode.md` — currently inactive overlay.
- `docs/environment-handoff.md` — non-secret project/identity ownership registry.
