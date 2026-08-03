# Demo Lane Retirement

Status: **complete; current posture reconciled 2026-08-03**.

This record covers two completed retirements:

1. The legacy `cherrybridge.ai` / `pmikckb-test` hosted Demo project was retired on 2026-06-20.
2. The historically named Production Cloud Run service `pmi-kc-kb-demo` was deleted on 2026-08-03,
   after `pmi-kc-app` passed rollback and forward-restore rehearsal.

Neither identifier is a current environment or rollback target.

## Current topology

- **Production:** project `pmi-kc-kb-prod`, Cloud Run service `pmi-kc-app`, Live data only, at
  <https://pmi-kc-app-kq6wuvpiva-uc.a.run.app>.
- **Local rehearsal:** `npm run dev`, resolving exactly to `environmentKind:"demo"`,
  `dataContext:"live_readonly"`, and `source:"explicit"`.
- **Local authority:** bounded Live reads only. Persistence and provider effects are refused.
- **Hosted Demo:** deferred. No separate Demo GCP project is provisioned.
- **Fixtures:** no product fixture seeder or persisted Test lane. Deterministic fixtures remain only
  in automated tests.

Blue/green release candidates and captured Production revisions remain deployment verification and
rollback mechanisms. They are not Demo environments.

## Do not restore or recreate

- Do not undelete or reuse `pmikckb-test`, its project number, Firebase identity, storage bucket,
  Agent Search stores, `cherrybridge.ai` credential, or any other resource from that retired lane.
- Do not recreate `pmi-kc-kb-demo` in `pmi-kc-kb-prod` or use its deleted URL.
- Do not provision a replacement hosted Demo project or fixture seeder unless a later named suite
  explicitly reopens that work.
- Do not treat `data_mode` as removable cleanup. S56 retained the field so restored non-Live state
  can be identified and refused.
- Do not remove rejection sentinels merely because they contain retired identifiers. Tests and
  production preflights may name those values specifically to prove they stay rejected.

## Historical record: 2026-06-20

The retired legacy lane used GCP project `pmikckb-test` (project number `800237451321`) under the
uncontrolled `cherrybridge.ai` organization. It included a Cloud Run service, Firebase, storage,
and Agent Search resources. The project and a stray sibling were placed in `DELETE_REQUESTED`, and
the one-time external credential was revoked immediately afterward.

The original teardown commands are intentionally omitted here so this current-state document cannot
be mistaken for an executable deletion or recovery runbook. Dated evidence remains in repository
history and `docs/status.md`.

## Historical record: 2026-08-03

S55 renamed the serving Production service to `pmi-kc-app`. The exact rollback rehearsal first
routed the captured predecessor to 100 percent and passed its smoke checks, then restored the final
revision to 100 percent and passed the same checks. Only then was the old `pmi-kc-kb-demo` service
deleted, with direct describe and service-list readbacks proving absence.

S56 separately retired the Production Test lane after a named backup and one-record restore drill.
Independent readback found zero explicit Test records across every governed collection. Local
rehearsal now uses bounded Live reads without persistence or provider effects, and no hosted Demo or
fixture seeder was introduced.

## Current operator route

Use [`demo-readiness.md`](demo-readiness.md) for the local readiness contract and
[`demo-show-and-tell.md`](demo-show-and-tell.md) for the local rehearsal script. Use
[`facts.md`](facts.md) and [`loop-state.md`](loop-state.md) for the verified Production checkpoint.
