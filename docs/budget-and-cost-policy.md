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

**The replacement values are SET as of 2026-08-01: alert `$25`, hard stop `$100`.** Cost-bearing
cloud actions now have approved headroom. Both enforcement points were moved and read back from the
live resources.

## The measured baseline

July 2026 was the first complete calendar month with the application deployed throughout, and the
policy named 2026-08-01 as the earliest date it could be used. **Measured Production spend for July
was `$0.00`.** The evidence is the `budget-guardrail` function itself: it logs the real `costAmount`
from every Cloud Billing notification (roughly every 25 minutes), and every notification across 30
days read `costAmount 0 USD`, including July's final one at `2026-07-31T23:54Z`. The decoder was
checked rather than trusted; a missing field logs the distinct string "no numeric costAmount", so
the zero is a genuinely parsed value and not a silent default.

**One caveat rides with that number.** All three budgets use `INCLUDE_ALL_CREDITS`, so `costAmount`
is net of credits, and both projects were created 2026-06-18/19, meaning a 90-day trial credit would
still be active. `$0` net therefore cannot distinguish genuine free-tier usage from real usage fully
offset by credits. This cannot be resolved later from the CLI: no BigQuery billing export exists in
either project and such exports never backfill, so July's gross figure lives only in the Console
billing report. **Re-review the ceiling at the first month reporting a non-zero `costAmount`** —
that is the real baseline moment.

Why `$100` rather than something tighter: the hard stop's only behavior is disabling billing, which
takes the resident and staff application offline, is not auto-reversible, and notifies nobody. The
asymmetry is severe, so a stop far above measured burn is the safe error. `$25` alert-only gives a
4x window to react before that happens, and against a `$0` baseline any crossing of `$25` is an
anomaly rather than growth. The per-user throttles do not bound this: `/api/ask` refills at
0.5 token/s, permitting roughly 1,800 calls per hour per user sustained, so the global ceiling is
the only real protection against a runaway loop rather than a backstop behind one.

## Applied configuration (verified by readback 2026-08-01)

| Control                                     | Value  | Scope                   | Effect                                |
| ------------------------------------------- | ------ | ----------------------- | ------------------------------------- |
| `pmi-kc-kb-prod hard stop 100USD`           | `$100` | `projects/558870356522` | Publishes to `budget-guardrail-topic` |
| `KILL_SWITCH_CAP_USD` on `budget-guardrail` | `100`  | Production project      | Effective stop is `min(100, 100)`     |
| `pmi-kc-kb-prod alert 25USD (alert only)`   | `$25`  | `projects/558870356522` | Emails both operators at 100%         |
| `Account-wide backstop 100USD (alert only)` | `$100` | Whole billing account   | Covers the second project             |

Both alert-only budgets carry Cloud Monitoring channels for `josiah@pmikcmetro.com` and
`dan@pmikcmetro.com`; see "Alert delivery" below for what is proven and what is not. The account-wide
backstop matters because the kill switch is project-scoped by construction: spend in
`adept-primacy-499822-d7` is not protected by any kill switch, and the backstop alone sees it.

**Trap when editing a threshold with gcloud — always read the value back.** The API field
`thresholdRules[].thresholdPercent` is 1.0-based, so `1.0` means 100% and `0.5` means 50%. But
`gcloud billing budgets update --add-threshold-rule=percent=N` documents `percent` as "an integer
between 0 and 100" and then passes the number straight through. Writing `percent=100` therefore
stores `100.0`, which is **10,000%** — an alert on a `$25` budget that would not fire until `$2,500`,
and would read as configured the whole time. This was actually done and caught by readback on
2026-08-01; the correct value is `percent=1`. Always compare a new rule against the untouched
`0.5; 0.9; 1.0` on the hard-stop budget before trusting it.

**Known expiry: the `budget-guardrail` function runs Node.js 20, decommissioned 2026-10-30.** If
that function stops running, the kill switch is inert while every budget still reads as configured.
Upgrade it before that date.

The runner must still not invent a dollar amount. Values change only through measured evidence plus
an owner decision, as this pair did. For the S40 Demo project, if one is ever created, the owner may
select explicit initial values with a recorded rationale, expiring after Demo's first complete
calendar month.

## Alert delivery: two routes, one of them proven

Budget email reaches operators two ways, which matters because a cost alert that reaches nobody is
the failure this whole section exists to prevent.

1. **Default IAM recipients.** `disableDefaultIamRecipients` is NOT set on any budget, so billing
   account administrators receive the notification. This route needs no verification and covers
   `josiah@pmikcmetro.com` today.
2. **The two Cloud Monitoring channels**, which additionally cover `dan@pmikcmetro.com`. Their
   `verificationStatus` is absent (unspecified) rather than `VERIFIED`, and **delivery has not been
   proven**, because proving it would require actually crossing `$25`. Treat route 2 as probable but
   unconfirmed until a real crossing or a deliberate test confirms it.

## What the current live state does and does not authorize

The kill-switch chain is armed, was reverified on 2026-07-29, and was raised to `$100` on
2026-08-01 with runtime proof: the guardrail logged `costAmount 0 USD < cap 100` at
`2026-08-01T08:52:57Z`, confirming the new ceiling reached the running function rather than only its
configuration. This IS approved spending headroom, unlike the historical `$10` posture it replaced.

Three mechanical facts control it:

1. The budgets use `calendarPeriod: MONTH`; the old word “total” was inaccurate.
2. `infra/budget-guardrail/handler.mjs` applies the smaller of the GCP budget amount and
   `KILL_SWITCH_CAP_USD`. Raising only one produces false headroom.
3. `scripts/check-budget-guard.mjs` checks posture and configuration. It does not read spend or
   enforce a dollar ceiling, so a green `npm run check:budget-guard` is never itself evidence that a
   ceiling is set or correct.

The hard-stop path disables project billing and can take the resident/staff application offline. It
must remain armed, sit above realistic burn, emit `KILL_SWITCH_FIRED` only after successful
disable/readback, emit `KILL_SWITCH_ALREADY_DISABLED` for a no-update repeat, and emit
`KILL_SWITCH_DISABLE_FAILED` for a failed read/update/readback. It is preceded by the alert-only
`COST_ALERT_THRESHOLD_CROSSED` signal reaching the operator. S51 owns the notification
channel/policies; S52 owns the values and paired enforcement.

## Three-layer cost-control model

These controls are independent. Passing one layer never satisfies another. Layer 2 now carries the
applied `$25`/`$100` pair; layers 1 and 3 still create no headroom on their own.

| Layer | Control                            | Current contract                                                                                                                                                                                         | Boundary                                                                                                                                                       |
| ----- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Configuration posture              | `npm run check:budget-guard` refuses known cost-unsafe configuration.                                                                                                                                    | It does not read spend and is not a dollar-enforcement point.                                                                                                  |
| 2     | Global billing alert and hard stop | The lower alert-only threshold warns the operator; the higher hard ceiling bounds aggregate monthly project spend through the budget/guardrail chain. Applied 2026-08-01: alert `$25`, hard stop `$100`. | It bounds total project spend, not one user's call rate.                                                                                                       |
| 3     | Per-user paid-model throttles      | `/api/ask`: capacity `15`, refill `0.5 token/s`; `/api/processes/classify`: capacity `10`, refill `0.2 token/s`. Both token buckets are keyed by the authenticated user UID.                             | They are best-effort, in-memory, per-instance burst controls. They do not coordinate across Cloud Run instances, observe spend, or replace the global ceiling. |

The third layer therefore limits how quickly one authenticated caller can reach the two paid-model
routes: Ask allows a burst of 15 and then sustains about one call every two seconds; classification
allows a burst of 10 and then sustains about one call every five seconds. These existing throttles
reduce repeatability risk, but they do not make a billed model call eligible while the global S52
cost gate is unresolved.

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

The S52 ceiling is set, so eligibility now turns on each row's own named conditions rather than on the ceiling.

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
