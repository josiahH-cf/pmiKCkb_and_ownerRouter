# Local Rehearsal Readiness

Status: **current as of 2026-08-03**. This document supersedes the former seeded/hosted Demo
readiness checklist. PMI KC does not currently operate a hosted Demo environment or a product
fixture seeder.

Production is Live-only at
<https://pmi-kc-app-kq6wuvpiva-uc.a.run.app>. Production is not a rehearsal surface, and the former
`pmi-kc-kb-demo` Cloud Run service is absent.

## Ready definition

Local rehearsal is ready only when all of these are true:

- Start it from the repository root with:

  ```bash
  npm run dev
  ```

- The server-owned descriptor resolves exactly to `environmentKind:"demo"`,
  `dataContext:"live_readonly"`, and `source:"explicit"`. The launcher supplies this contract; do
  not edit `.env.local` or `.env.production.local` to manufacture it.
- The shell identifies the context as **Live data, read only**.
- Reads stay inside the reviewed bounded Live-read providers. Local rehearsal contains no invented
  product records and seeds no fixture.
- Persistence, route mutations, server actions, uploads, drafts, sends, write-backs, and provider
  effects remain refused. Local rehearsal is for inspecting and walking through the product, not
  for changing Live state.
- The focused safety evidence is green:

  ```bash
  npm test -- tests/unit/local-rehearsal-launcher.test.mjs tests/unit/live-readonly-request-policy.test.ts tests/unit/live-readonly-route-sentinel.test.ts
  ```

These checks prove the rehearsal boundary; they do not authorize a client-facing send or a
system-of-record write.

## Operator boundaries

- Treat anything shown locally as Live client data even though the environment kind is `demo`.
  Follow the normal authenticated-domain, screen-sharing, and data-handling rules.
- Do not run `demo:reset`, `seed:demo`, `seed:launch-skeletons`, `smoke:demo-live`, or the legacy
  Demo operator flow as rehearsal setup. Those commands are not the current product workflow.
- Do not recreate a Test lane, restore a deleted Demo host, or use a zero-traffic release candidate
  as a general-purpose Demo environment.
- Stop the local server with `Ctrl+C`. No data reset or teardown mutation is needed because the
  rehearsal surface cannot persist.

## Hosted presentation posture

The separately hosted Demo GCP project contemplated by the original S40 program is deferred. If a
future requirement needs a remote surface that someone other than the operator can click, that is a
new explicitly authorized hosting slice. Until then, rehearsal stays local and no fixture seeder is
introduced.

## Historical note

Before S56, this file described seeded four-workflow records, writable Demo Firestore, Demo operator
reset/showtime commands, and hosted smoke checks. Those instructions were valid only for the earlier
dated Demo/Test programme and were retired on 2026-08-03. They are intentionally not executable from
this current-state document.
