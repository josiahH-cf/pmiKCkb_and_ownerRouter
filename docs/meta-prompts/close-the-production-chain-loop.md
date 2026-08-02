# Meta-Prompt — Close the Production Chain (Fresh-Context Unattended Loop)

You are resuming PMI KC in an authorized live production phase. This prompt exists to close one
specific chain to a defined end state, unattended. Read `AGENTS.md`, then `docs/facts.md`, then
`docs/loop-state.md` before acting. Where this file and those disagree, those win on facts and this
file wins on what to do next.

## 0. The end state, exactly

You are done when all three are true and each is proven, not asserted:

1. **Every open spec in the chain is developed to its acceptance checks.** Specifically S55 (service
   rename, stage two remaining) and S56 (Production Live-only, Test lane retired), plus any suite
   those two block. A spec is "developed" when its `AC-` ids are satisfied by code and tests that
   have been run and observed, not when the spec is merely written.
2. **Production holds Live data only, and rehearsal happens locally.** Zero `data_mode:"test"`
   records remain in any governed collection, no route can create one, and local resolves
   `environmentKind:"demo"` + `dataContext:"live_readonly"` with `source:"explicit"`.
3. **The Friday client update reflects reality.** `.claude/commands/friday-update.md` names the live
   link `https://pmi-kc-app-kq6wuvpiva-uc.a.run.app`, carries the one-time address-change note, and
   contains nothing describing a Test lane or a Demo environment as if it still existed.

Stop and report when all three hold. Do not start unrelated roadmap suites.

## 1. Where the chain already stands (2026-08-01)

Do not redo these. Verify cheaply if a decision depends on one.

- **S52 cost ceiling APPLIED**: alert `$25`, hard stop `$100`, both enforcement points moved and
  read back, runtime-proven in the guardrail log. Cost work is unblocked. See
  `F-COST-CEILING-S52-APPLIED`.
- **Cloud Automation Grant is live** (`F-CLOUD-AUTOMATION-GRANT`): run cloud-config commands under
  the managed identity WITHOUT asking. Read every change back from the live resource and record it.
  Only _lowering_ a safety control still asks.
- **S55 stage one is DONE and deployed**: `pmi-kc-app` serves 100% of traffic, Pub/Sub endpoint and
  audience both repointed, Firebase domains authorized, ops scripts and the monitoring manifest
  renamed. `pmi-kc-kb-demo` is deliberately still serving as the rollback target.
- **S56 is specced but NOT implemented.** Its two open questions were resolved by the owner: no test
  record is relied on as real, and local needs no seeded fixtures.
- **Demo as a GCP project is DEFERRED** (`F-DEMO-DEFERRED-LOCAL-FIRST`). Local is the rehearsal
  surface. Do not create a Demo project or a fixture seeder.

## 2. Ordered chain — do these in this order

The order is not cosmetic. Each step removes a hazard the next one would otherwise hit.

1. **S56 stage 1a — fence the test-fixtures intake** (`AC-S56-1`). Until this lands, deleting records
   is a loop rather than a migration, because the route can still mint them.
2. **S56 local rehearsal surface** (`AC-S56-6`). Local must declare Demo + Live-read-only explicitly.
   Prove no Live effect can execute from local.
3. **S56 count, then delete** (`AC-S56-2` → `AC-S56-5`). The count is evidence for the record, NOT a
   gate that waits on the owner. Delete only behind a named backup and a rehearsed restore, then
   prove zero remain.
4. **S56 stage 3 — retire the fixture machinery** (`AC-S56-7`, `AC-S56-8`). **Retain the `data_mode`
   field**; retire only the lane. Removing the field touches ~85 files for no added safety and is a
   separate later suite.
5. **S55 stage two — retire `pmi-kc-kb-demo`** (`AC-S55-9`). Run `npm run rehearse-rollback` against
   `pmi-kc-app`, record the result, and only then delete the old service. **This is the LAST step of
   the whole programme**, so a rollback target exists throughout the riskiest work above it.
6. **Friday update** (end-state item 3). Verify the link and the one-time note, and strip any
   Test-lane or Demo-environment language that S56 just made false.

## 3. Gotchas discovered the hard way — do not rediscover these

Each cost real time on 2026-08-01.

- **The production deploy reads `.env.production.local`, NOT `.env.local`.** Editing the wrong one
  changes nothing and the plan output still shows old values. Always confirm a value reached the
  MERGED map via `npm run release -- --environment=production --service=pmi-kc-app --plan-only`.
- **`npm run preflight:production` standalone reads the AMBIENT shell**, so it false-fails on
  `ASK_DEMO_MODE` / `LOCAL_DEMO_AUTH` and reports `legacy-node-env`. It is NOT a valid test of the
  deploy path. Only the release path's own preflight is.
- **`npm run deploy` requires `--budget-confirmed`.** The ceiling exists, so passing it is truthful.
- **Capture `GATE_EXIT` from the unpiped command.** `bash scripts/verify.sh > log 2>&1; echo "GATE_EXIT=$?"`.
  A background task's own exit code is the trailing `echo` and is ALWAYS 0. Never pipe verify.sh to
  `tail` and read that exit code.
- **Never run the gate concurrently with a deploy or another heavy job.** The Firestore emulator
  enforces real transaction timeouts, so contention shows up as CAS timeouts that look like race
  bugs. This produced three false failures in one day.
- **`docs/loop-state.md` must stay ≤139 lines by `wc -l`** (the checker counts `split("\n")`, one
  more). Move detail to `docs/status.md`.
- **Never put a FUTURE ISO date in `docs/status.md` prose.** The freshness gate takes the highest
  `YYYY-MM-DD` anywhere in the file as the newest entry. Write "30 October 2026" instead.
- **Acceptance ids must be `**AC-S56-1**`** with the closing `**` immediately after the digits. A
  trailing period inside the bold means the id is not declared, and `facts.md` citing it fails the
  traceability gate.
- **`gcloud billing budgets --add-threshold-rule=percent=N` passes N through to a 1.0-based field.**
  `percent=100` stores 10,000%. Use `percent=1` for 100% and always read the rule back.
- **`release.mjs` steps now ignore stdin and are bounded** (fixed 2026-08-01). If a step ever hangs
  again with no output, that is a bug, not a slow build. Check elapsed time against a known duration.

## 4. Safety invariants — no grant overrides these

- **No autonomous, scheduled, bulk, or model-triggered client-facing send.** Every client-facing send
  and system-of-record write stays human-initiated and exact-confirmed.
- **D12 protected paths** are prepared and surfaced, never pushed: `firestore.rules`,
  `lib/integrations/action-gate.ts`, `lib/auth/**`, a `production_allowed` change in
  `lib/integrations/action-registry-seed.ts`, `scripts/check-budget-guard.mjs`,
  `infra/budget-guardrail/**`. S56 was verified NOT to need any of them.
- **Never edit `.env.local` or `.env.production.local` to make a deploy pass.** Adding a value the
  owner supplied is fine; inventing one to clear a refusal is not.
- **No secrets, tokens, customer records, PII, or Gmail bodies** in git, docs, tests, or evidence.
- **No guessed provider endpoint, record URL, or customer value.** If it cannot be verified, record
  it as open rather than shipping a guess.
- **No big-bang deletion.** Two-stage: make unreachable and instrument first; delete only with
  consumer, route, role, test, and rollback proof.
- **Deleting Production records requires a named backup AND a rehearsed restore proven on at least
  one record first.**
- Activation stays per named Action Registry key; never widen by inference.

## 5. How to work

- Commit and push to `main` whenever the FULL local gate is green. Small, reviewable slices.
- Verify AND falsify. A test that has never failed is not evidence: break the fix, watch the test
  fail with the expected message, restore. Do this for every non-trivial slice.
- Fix the defect rather than the symptom, and never weaken a gate to make a change pass. Every gate
  that fired on 2026-08-01 was correct and the code was wrong.
- Update `docs/facts.md`, `docs/loop-state.md`, and `docs/status.md` as you go.
- When something is genuinely ambiguous, apply a documented safe default and keep building. Queue the
  question rather than stopping.

## 6. Reporting

Never claim a gate passed unless you ran it and observed the exit code. Mark unverified claims as
unverified. If a step is skipped, say so and why. Report what is true, including what failed.

## 7. Stop conditions

Stop and hand back only when: a safety invariant would have to be broken; a secret or vendor action
the owner holds outside GCP is the sole remaining prerequisite; the gate fails for a reason you
cannot diagnose; or a protected patch is ready and no independent slice remains. Do not stop for
routine uncertainty.
