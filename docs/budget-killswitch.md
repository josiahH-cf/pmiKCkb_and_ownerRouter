# Budget Kill Switch

The hard-cap layer for the $10 cloud budget. A GCP budget **alert only notifies** — it does not stop
spend. This adds the standard programmatic kill switch so spend actually stops at the cap.

See `docs/budget-and-cost-policy.md` for the full policy and the layered model.

## The four layers (only the last truly stops spend)

1. **Structural near-zero cost** — Cloud Run `--min-instances=0` (scale-to-zero), `--max-instances=1`,
   512Mi/1cpu, Gemini Flash, single Space (`scripts/deploy-demo-cloud-run.mjs`). Idle ≈ $0.
2. **Preflight discipline** — `npm run check:budget-guard` refuses cost-bearing commands unless the
   posture is the cheap path; deploy refuses without `--budget-confirmed`. Watches _config_, not $.
3. **GCP budget alert** — emails billing admins at 50/90/100% of $10. Visible in
   Console → Billing → Budgets & alerts / Reports. **Notify-only.**
4. **Kill switch (this)** — budget → Pub/Sub → Cloud Function that disables the project's billing at
   the cap. The only layer that hard-stops spend.

## Design

```
Cloud Billing budget (billing account 01A5A3-65CA5A-614D45, scoped to pmi-kc-kb-prod)
  → publishes a notification to topic `budget-guardrail-topic` on each threshold
    → Cloud Function `budget-guardrail` (infra/budget-guardrail/, trigger-topic)
      → decode → decide vs cap → if costAmount ≥ cap AND billing enabled:
          clear billingAccountName  ⇒ billing disabled, all billable usage stops
```

- Code + tests: `infra/budget-guardrail/` (see its README). The cap is the function's own
  `KILL_SWITCH_CAP_USD` (default 10) and it uses the **smaller** of that and the budget amount, so a
  mis-set budget can't raise the real cap.
- The disable path is **proven by `tests/unit/budget-killswitch.test.mjs`** (decode → decide →
  mocked disable against the exact Cloud Billing notification payload) — no live call.

## Provisioning (owner-side, gated)

Creating the budget, deploying the function, and granting the SA billing IAM (Project Billing
Manager — project-scoped, least privilege) are billing-console + cost-bearing Hard-Stop actions.
Generate the exact commands:

```
npm run killswitch:plan
```

Run them while authenticated as `josiah@pmikcmetro.com`. The runbook also prints a **safe no-op
wiring test** (publish a $0.01 notification → the function logs "no action") that confirms the
trigger wiring against prod without disabling anything.

> **Never trip the real disable on the production project** — it takes the live KB app down. To
> verify an actual disable end-to-end, deploy and trip a throwaway project.

## After a trip — re-enabling billing

Disabling billing is deliberately not auto-reversible. To recover after the kill switch fires:

1. Investigate the spend in Console → Billing → Reports; fix the cause.
2. Re-attach billing: Console → the project → Billing → **Link a billing account**, or
   `gcloud billing projects link pmi-kc-kb-prod --billing-account=01A5A3-65CA5A-614D45`.
3. Cloud Run / Firestore resume on the next request (scale-to-zero means no backlog charge).
