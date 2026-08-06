# RentCast setup runbook

Date: 2026-08-06. Owns the "explicit setup instructions" the owner required (Q3) before the
four-lease test set runs. Companion to `docs/feature-suites/rentcast-live-activation.md` (S59), which
owns the code. This file is the operator procedure.

**Nothing here echoes a key.** The API key never appears in a file, a command line, a log, a test
fixture, or this repository. Every step below either prompts for it or reads it back by name only.

## 1. Account and plan

1. Create the account at `rentcast.io` and generate an API key on the intended plan.
2. **Read back the plan's real numbers** and record them: the monthly request allowance, the overage
   price per request, and the published rate limit. Do not rely on the figures quoted on the
   2026-08-05 call — that call is not committed to this repository and
   `docs/client-checklist.md` records the allowance as plan-specific and unverified. S59's hard quota
   stop refuses operator work when it fires, so it must be sized off the real number
   (`AC-S59-14`).
3. Confirm the plan's terms on **storing/caching** responses and **displaying them to a property
   owner**. This is tracked as `Q-RENTCAST-PLAN-TERMS` and is a real gate, not a formality: S59 adds
   caching and S60 shows the numbers to an owner.

## 2. Place the key in Secret Manager

Owner-run. Safe to rerun — it creates the container only when absent, then adds a new version. Paste
the key at the prompt and press **Ctrl-D**; it never touches disk.

```bash
gcloud secrets describe RENTCAST_API_KEY --project=pmi-kc-kb-prod >/dev/null 2>&1 || gcloud secrets create RENTCAST_API_KEY --project=pmi-kc-kb-prod --replication-policy=automatic
gcloud secrets versions add RENTCAST_API_KEY --project=pmi-kc-kb-prod --data-file=-
gcloud secrets add-iam-policy-binding RENTCAST_API_KEY --project=pmi-kc-kb-prod --member=serviceAccount:pmi-kc-kb-runtime@pmi-kc-kb-prod.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor
```

Read back that it exists and has a version, without revealing the value:

```bash
gcloud secrets versions list RENTCAST_API_KEY --project=pmi-kc-kb-prod --limit=1
```

Report completion as "RentCast key is in Secret Manager" — never the value. If the key was ever
pasted into a chat, a ticket, or an email, roll it in the RentCast dashboard after setup and repeat
this section; rolling costs nothing.

## 3. The paired code change — required, not optional

Placing the key is necessary and **not sufficient**. `scripts/deploy-demo-cloud-run.mjs` builds a
closed allowlist of runtime env vars and emits it as a **replacing** `--set-env-vars` map, and binds
a fixed list of runtime secrets. Neither `MARKET_COMP_PROVIDER` nor `RENTCAST_API_KEY` is named in
either list today, so a key in Secret Manager binds to nothing and anything set out of band is wiped
on the next deploy. This is the step that silently breaks integrations when it is skipped.

The same reviewed change must:

- add `MARKET_COMP_PROVIDER` to the runtime env allowlist and set it to `rentcast` in the production
  env file;
- add `RENTCAST_API_KEY` to the runtime secret bindings;
- carry the D12 protected-path seed patch (see section 5).

## 4. Connectivity, authentication, and the controlled smoke

Run the read-only smoke before proposing the gate patch. It makes exactly one live call against one
known address, prints the resolved range, comp count, and source, and writes nothing durable. Its
output is the `evidence_status: "Documented"` justification.

An operator-run smoke calling RentCast while the action is still gated off is deliberate and is not a
bypass: the Action Registry governs what the **application** does on a user's behalf. This mirrors the
existing `smoke:rentvine-read` pattern.

Expected outcomes, all of which are acceptable results to record:

| Outcome                          | What it means                                           |
| -------------------------------- | ------------------------------------------------------- |
| A range, point estimate, count   | Working. Record all three plus the source string.       |
| `Needs Verification`, no numbers | The adapter failed closed. Record which reason fired.   |
| Auth failure                     | Key not bound, or not readable by the runtime identity. |
| Timeout                          | Recorded as a timeout, never as "no comps found".       |

## 5. Open the gate — a reviewed change, not a switch

`lib/integrations/action-registry-seed.ts` is a **D12 protected path**. The patch is prepared,
isolated, and surfaced for owner review; it is never pushed under the standing grant. It must change
three fields together — `readiness` to `Approved for Execution`, `evidence_status` to `Documented`,
and `production_allowed` to `true` — because the schema refuses the boolean alone and the gate
re-parses the seed entry on **every request**, so a partial edit throws at runtime rather than at seed
time. It must also add the key to both `EXECUTABLE_ALLOWLIST` copies and update the pinned schema test.

## 6. Verify the deployed revision

After deploy, read back that both values actually reached the running service:

```bash
gcloud run services describe pmi-kc-app --project=pmi-kc-kb-prod --region=us-central1 --format=json
```

Confirm `MARKET_COMP_PROVIDER` appears in the env list and `RENTCAST_API_KEY` appears as a bound
secret. A revision missing either is not activated, regardless of what Secret Manager contains.

## 7. Confirm nothing remains blocked

The comps path is live only when all of these are true, and each is reported explicitly rather than
assumed:

- [ ] key in Secret Manager, readable by the runtime service account
- [ ] both variables forwarded by the deploy wrapper and present on the serving revision
- [ ] the reviewed seed patch merged and `production_allowed` reading `true` on readback
- [ ] one live call proven by the controlled smoke, with its numbers recorded
- [ ] the quota counter incrementing, with the stop sized off the real plan allowance
- [ ] `Q-RENTCAST-PLAN-TERMS` resolved, and `docs/client-checklist.md`,
      `docs/environment-handoff.md`, and the S52 cost-control fact updated to match

Until every box is checked, S63's number criterion stays `not_evaluated`. That is the intended
behavior, not a failure.
