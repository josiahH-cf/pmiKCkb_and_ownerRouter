# Runner workflow

This is the current runner-neutral implementation loop. Authority and safety live in `AGENTS.md`.

## Intake

Read, in order:

1. `AGENTS.md`
2. `docs/facts.md`
3. `docs/loop-state.md`
4. `docs/plan.md`
5. one relevant product or active-suite file

Do not load Git history, ignored `docs/temp/`, or removed program prompts unless a specific provenance
question requires them.

## Plan

Define:

- one observable end state;
- the exact code/data surfaces in scope;
- external effects, if any;
- the falsification that would disprove success;
- tests and live readbacks;
- the safe stop for each missing external dependency.

A missing provider input parks only that action.

## Build

- Prefer production-ready code and real provider seams.
- Use deterministic synthetic fixtures only in automated tests.
- Keep Production Live-only and local rehearsal effect-refused.
- Preserve per-key Action Registry and D12 boundaries.
- Never place customer data or secrets in repository evidence.

## Verify

For a bounded slice, run focused tests and an intentional adversarial case. Before shipping code:

```bash
bash scripts/verify.sh
npm run test:e2e:core
```

Review the staged diff, production gates, secrets/PII scan, runtime environment changes, and rollback.

## Ship

The standing grant permits commit/push to `main` after the full gate is green. Code releases use:

1. print-only plan;
2. zero-traffic candidate;
3. exact commit/revision smoke;
4. exact-revision promotion;
5. traffic/config readback;
6. captured rollback, with an executed rehearsal when risk/time warrants it.

Documentation-only changes are committed and pushed after their gates but do not require an app
redeploy.

## Record

Rewrite `docs/facts.md`, `docs/status.md`, `docs/plan.md`, and `docs/loop-state.md` to the new
present truth. Do not append a competing historical narrative.

## Stop

Stop only when the requested outcome is complete, a named external/authority dependency remains, or
continuing would cross a safety boundary. Record the exact dependency and the unaffected work that
remains available.
