# PMI KC Local Rehearsal Runbook

Status: **the former Demo Show-And-Tell runbook is retired as of 2026-08-03**. Its hosted Demo,
seed/reset, writable workflow, and invented-record instructions no longer describe the product.

Current rehearsal is local only. Production is Live-only at
<https://pmi-kc-app-kq6wuvpiva-uc.a.run.app>, and the former `pmi-kc-kb-demo` service is absent.
There is no hosted Demo environment and no product fixture seeder.

## Before rehearsal

From the repository root, start the app with:

```bash
npm run dev
```

The launcher fixes the server-owned context to:

```text
environmentKind:"demo"
dataContext:"live_readonly"
source:"explicit"
```

Do not override those values in an env file. Confirm the shell says **Live data, read only** before
continuing.

For code-level proof of the boundary, run:

```bash
npm test -- tests/unit/local-rehearsal-launcher.test.mjs tests/unit/live-readonly-request-policy.test.ts tests/unit/live-readonly-route-sentinel.test.ts
```

## Rehearsal framing

Use this truthful opening:

> This is a local rehearsal of the Production product using bounded Live reads. The rehearsal
> context is explicitly read-only: it cannot persist a record or execute a provider effect.
> Production itself contains Live data only.

Walk through only the authenticated views needed for the review. The goal is to inspect navigation,
read-only projections, evidence, and operator context. The local surface reads real Live data, so
normal client-data handling and audience controls apply.

Do not attempt or represent any of these as rehearsal capabilities:

- editing or approving a record;
- creating a workflow run, ticket, fixture, draft, or support report;
- uploading a file or storing a photo;
- applying a Gmail label, creating or sending mail, or initiating any other provider effect;
- writing back to a Sheet, RentVine, or another system of record;
- resetting, seeding, or manufacturing invented product data.

The request-wide policy and direct effect fences refuse those paths in local rehearsal. An effect
refusal is the expected safety result, not a cue to change environment variables or use Production.

## What to say about environments

Use this wording when environment posture matters:

> PMI KC Production is Live-only. Rehearsal happens locally in an explicit Demo plus Live-read-only
> context, with persistence and provider effects disabled. A separately hosted Demo environment and
> fixture seeder are deferred because no remote presentation surface is currently required.

Do not describe Production as having a Test lane, describe local as containing sanitized or seeded
Demo records, or advertise a public Demo URL.

## After rehearsal

Stop `npm run dev` with `Ctrl+C`. There is no reset step: the local surface has no persistence
authority and creates no rehearsal records.

## Historical show-and-tell record

The prior runbook covered a four-workflow seeded show, writable SOP and Approval Queue examples,
Gmail Inbox 0 artifacts, Demo operator showtime/reset commands, and live smokes against now-retired
hosts. That material was created during the May-June 2026 Demo phase and remained historical
programme evidence after the legacy `pmikckb-test` project was retired on 2026-06-20. S56 retired
the remaining Production Test machinery on 2026-08-03, so none of those commands or presentation
claims is current or executable guidance.

If a future client-facing remote show is needed, define and authorize that hosting/data boundary as
a new slice. Do not restore a deleted host, seed fixtures, or widen local effect authority by
inference.
