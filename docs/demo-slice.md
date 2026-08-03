# Historical Demo Slice Record

Status: **retired as current guidance on 2026-08-03**.

This file formerly defined seeded, editable workflow Demo slices and mock/live Demo questions. That
material belongs to the earlier Demo programme and is not an instruction to restore fixtures,
product simulators, an editable local surface, or a hosted Demo environment.

Current rehearsal is local and resolves exactly to `environmentKind:"demo"`,
`dataContext:"live_readonly"`, and `source:"explicit"`. It reads only through reviewed bounded Live
providers, and every persistence or provider-effect path must refuse. Production is Live-only on
`pmi-kc-app`; the separately hosted Demo environment and fixture seeder are deferred.

Use these current documents instead:

- `docs/demo-readiness.md` for the local safety/readiness contract.
- `docs/demo-show-and-tell.md` for the effect-fenced rehearsal walkthrough.

Deterministic invented workflows and `.invalid` identities may remain inside automated-test helpers.
They are not product records, seed instructions, or a presentation lane.
