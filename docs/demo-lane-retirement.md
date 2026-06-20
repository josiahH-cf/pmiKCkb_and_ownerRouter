# Demo Lane Retirement

Status: **Complete (2026-06-20)** — repo side done; GCP project `pmikckb-test` deleted
(soft-delete, recoverable ~30 days) via a one-time ephemeral `cherrybridge.ai` auth this session.
Decision: owner directed "retire this completely now that we're in a live environment"
(2026-06-20). Scope chosen: **dead-references only** — neutralize every repo pointer to the dead
demo project and retire the demo _cloud_ lane, while **keeping** local-dev demo mode (deliberately
hardened) and the sanitized demo source templates (still the live KB's only approved content
corpus until real client sources land).

See also [`auth-identity-and-access-strategy.md`](auth-identity-and-access-strategy.md) §0 and
[`loop-state.md`](loop-state.md).

## What the demo lane was

- **GCP project:** `pmikckb-test` (number `800237451321`), owned by and auth-locked to the
  **`cherrybridge.ai`** org — an org `pmikcmetro.com` does **not** control.
- **Cloud Run service:** `pmi-kc-kb-demo` (in `pmikckb-test`).
- **Cloud Storage bucket:** `gs://pmikckb-test-lease-renewals-686407/`.
- **Vertex Agent Search data stores:** `kb-lease-renewals-txt`, `kb-maintenance-work-order-intake-txt`,
  `kb-move-out-deposit-disposition-txt`, `kb-owner-onboarding-txt`, and the transcript-derived
  per-Space stores (location `us`).
- **Firebase project:** `pmikckb-test` (auth domain `pmikckb-test.firebaseapp.com`).
- Possible stray sibling project `pmikckb-test-8f927` (Firebase once auto-created it).

The live product was migrated off this lane: the cheap-live KB now runs on **`pmi-kc-kb-prod`**
(org `pmikcmetro.com`), with its own bucket `pmi-kc-kb-prod-sources-558870356522` and data stores.

> ⚠️ **Name collision — do not confuse the two.** The live prod Cloud Run service is _also_ named
> `pmi-kc-kb-demo`, but it lives in **`pmi-kc-kb-prod`**
> (`https://pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app`). Every teardown command below targets
> `--project=pmikckb-test` explicitly. **Never run a delete against `pmi-kc-kb-prod`.**

## Done on the repo side (2026-06-20)

- Neutralized dead default project ids: `scripts/deploy-demo-cloud-run.mjs`
  (`DEFAULT_PROJECT_ID` → `pmi-kc-kb-prod`), `scripts/source-corpus-manifest.mjs`
  (`DEFAULT_PROJECT` → `pmi-kc-kb-prod`), `scripts/setup-windows-google-dev.ps1`
  (`$ProjectId` → `pmi-kc-kb-prod`).
- Repointed `scripts/demo-operator.mjs` / `demo-operator.ps1` hosted-URL defaults off the dead
  project-number URL (`…-800237451321…`) to the live service URL.
- Removed the `firebase:setup-demo` / `firebase:setup-auth-demo` npm scripts (they hardcoded
  `--project=pmikckb-test`); the generic `firebase:setup` / `firebase:setup-auth` remain and read
  the project from env.
- Revoked the legacy `cherrybridge.ai` gcloud credential locally (only `josiah@pmikcmetro.com`
  remains).

**Kept on purpose:** local-dev demo mode (`LOCAL_DEMO_AUTH` / `ASK_DEMO_MODE`, fenced from prod by
the `NODE_ENV` guard); the sanitized demo source templates under `docs/demo-source-templates/`
(current corpus); and the production preflight guardrails that **reject** `pmikckb-test` /
`pmi-kc-kb-demo` / `800237451321` / `cherrybridge.ai` (`scripts/preflight-production-cutover.mjs`,
`DEMO_PROJECT_IDS` / `DEMO_VALUE_PATTERNS`) — those enforce the retirement and must stay.

## Owner-side GCP teardown (must run from the `cherrybridge.ai` account)

`pmikcmetro.com` has no access to the `cherrybridge.ai` org, so this is done either in the GCP
Console signed in as the cherrybridge.ai owner, or via gcloud after
`gcloud auth login josiah.hunter@cherrybridge.ai`.

> **EXECUTED 2026-06-20 (agentic, ephemeral auth).** A one-time
> `gcloud auth login josiah.hunter@cherrybridge.ai` browser consent enabled the teardown from this
> session. Verified the target (`pmikckb-test`, number `800237451321`, ACTIVE; service
> `pmi-kc-kb-demo` URL hash `v6koysxdbq`, distinct from prod's `kq6wuvpiva`), then
> `gcloud projects delete pmikckb-test` → now **`DELETE_REQUESTED`** (recoverable ~30 days via
> `gcloud projects undelete pmikckb-test`). The stray `pmikckb-test-8f927` was already
> `DELETE_REQUESTED`. The cherrybridge credential was **revoked immediately after**; only
> `josiah@pmikcmetro.com` remains and ADC was untouched. The commands below are the record of what
> was run.

```bash
# 1. Confirm you are about to delete the RIGHT project (expect projectNumber 800237451321).
gcloud projects describe pmikckb-test --format="value(projectId,projectNumber,lifecycleState)"

# 2. (Optional) Final look at what it still holds.
gcloud run services list --project=pmikckb-test
gcloud storage ls --project=pmikckb-test
gcloud alpha discovery-engine data-stores list --project=pmikckb-test --location=us  # if the CLI surface is available

# 3. Delete the whole project — this removes Cloud Run, the bucket, Firestore, Firebase, and the
#    data stores in one step. Recoverable for ~30 days (gcloud projects undelete pmikckb-test).
gcloud projects delete pmikckb-test

# 4. If the stray sibling still exists, delete it too.
gcloud projects describe pmikckb-test-8f927 2>/dev/null && gcloud projects delete pmikckb-test-8f927

# 5. Verify — both should report lifecycleState DELETE_REQUESTED.
gcloud projects describe pmikckb-test --format="value(lifecycleState)"
```

Deleting the project also stops its billing and removes its project-scoped $10 budget alert. No
action is needed on `pmi-kc-kb-prod`.

## After teardown

- Confirm `npm test` stays green (the preflight guardrail tests intentionally still reference
  `pmikckb-test` as the _rejected_ value — that is correct and must not be removed).
- The demo ingest manifest `docs/source-corpus/demo-live-source-manifest.json` will then point at
  a deleted bucket; it is inert (not read by the live app) and kept only as the historical record
  of the demo ingest. Re-point or retire it if/when the demo source templates are re-homed.
- Update [`loop-state.md`](loop-state.md) and [`auth-identity-and-access-strategy.md`](auth-identity-and-access-strategy.md)
  §0 to mark the GCP teardown complete.
