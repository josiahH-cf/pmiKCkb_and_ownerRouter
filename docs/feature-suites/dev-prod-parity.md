# S12 — Dev ↔ prod parity for live connections

> New 2026-06-30. The operator's "production end state always" emphasis makes parity a first-class
> roadmap item. Surfaced by the resync map: the deployed plane is missing the live-connection env and
> the running Cloud Run service predates the R1–R5 cycle.

**Goal.** What works on the local/demo plane (RentVine read, the renewal sheet read, the maintenance
Drive write) must work identically in deployed production — and a cutover must fail loudly if it would
ship without those connections, never silently degrade to "not connected."

**What it is / how it functions.**

- **Forward the live-connection env at deploy.** `scripts/deploy-demo-cloud-run.mjs` (`readRuntimeEnv`)
  currently forwards Firebase, model, `SPACE_*`, and `MAINTENANCE_PHOTO_DRIVE_FOLDER_ID`, but NOT
  `RENTVINE_API_BASE_URL`/`KEY`/`SECRET`, `RENEWAL_SHEET_ID`, `SHEETS_IMPERSONATE_SA`, or
  `SHEETS_DWD_SUBJECT`. So the deployed `/lease-renewal/live` review (and the maintenance Drive DWD
  identity) lose their config in prod. Forward them — **RentVine secrets via Secret Manager, never
  inline** (per the security rules); the DWD subject/SA are non-secret identifiers.
- **Require them in the cutover preflight.** `scripts/preflight-production-cutover.mjs` requires Firebase,
  the Space maps, and the maintenance photo folder, but never the RentVine/Sheet/DWD config. Add asserts
  so a green cutover guarantees the live connections are configured (mirror the existing
  `assertMaintenancePhotoFolder` pattern).
- **Redeploy current `main`.** The live service was last deployed 2026-06-19; R1–R4, the full Maintenance
  suite, and the cutover guard are merged but not deployed. A redeploy (owner/budget-gated) brings prod to
  current. This is a cost-bearing step — explicit per-step approval + `npm run check:budget-guard` + the $10 cap.
- **Verify parity.** After deploy, `npm run smoke:ask-live -- --base-url=<endpoint>` + confirm the live
  review connects, within the budget rules.

**Open questions & assumptions.**

- _Assumption:_ the live connections SHOULD run in prod (the whole point of the renewal/maintenance lanes).
- _Open:_ Secret Manager wiring for the RentVine secrets in Cloud Run (vs `--set-env-vars`); the redeploy
  is an explicit owner-approved, budget-guarded step (not autonomous).
- _Note:_ all of this preserves `production_allowed:false` — parity is about READS + the gated photo write,
  not enabling any system-of-record write.

**Cross-product impacts.** `scripts/deploy-demo-cloud-run.mjs`, `scripts/preflight-production-cutover.mjs`,
`docs/client-production-cutover.md`, `docs/environment-handoff.md`, `.env.example`. Touches no runtime
product behavior — it's deploy/cutover config + a redeploy.

**Ordered prompt sequence.**

1. _Build:_ forward `RENTVINE_*` (via Secret Manager) + `RENEWAL_SHEET_ID` + `SHEETS_*` in `readRuntimeEnv`.
2. _Build:_ add the matching requires/asserts to the cutover preflight + golden fixture + tests.
3. _Docs:_ update the cutover runbook + env-handoff + `.env.example`; record the parity contract.
4. _Gated:_ owner-approved, budget-guarded redeploy of current `main`; then live smoke + parity verify.
5. _Context update:_ record the parity facts in `docs/facts.md`; update `docs/loop-state.md`.

**Deletion/merge recommendation.** KEEP. Pure readiness/parity hardening + a gated redeploy. No new
product surface; no new write path.
