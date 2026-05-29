# PMI KC KB Implementation Runbook

## Select The Next Milestone

Open `docs/status.md`, find the next recommended task, then compare it to
`docs/plan.md`. Work on the earliest unfinished milestone unless the user explicitly
redirects.

After the M3a/M3b code foundation, the cheap Lease Renewals live Ask smoke is working
through Cloud Storage and Agent Search. The next implementation task is to add
sanitized real Lease Renewals call notes, upload/import the `.txt` copy, seed matching
`sources_meta`, rerun `npm run check:live-cost` and `npm run smoke:ask-live`, then
deploy the cheap Cloud Run demo with `npm run deploy:demo -- --budget-confirmed`.
Keep the Lease Renewals demo path working for show-and-tell, but do not treat demo Ask
as Spec 1 completion.

For demo operations, use `docs/demo-show-and-tell.md`. For production cutover
assumptions, keep `docs/demo-cutover.md` in view before adding live Google integration
or deployment code.

## Keep Changes Scoped

- Work inside the KB runtime only.
- Keep Owner Router work to `docs/router-repo.md` unless the separate
  `pmi-kc-owner-router` repo is opened.
- Prefer existing boundaries in `lib/`.
- Add a dependency only when a milestone needs it.
- Do not add product behavior not present in the specs.

## Validate After Each Meaningful Change

Use the smallest relevant check during development:

```bash
npm test
npm run test:firestore
npm run typecheck
npm run lint
```

Run `npm run test:firestore` when Firestore rules or editable-layer persistence changes
and Java JDK 11+ is installed locally. Keep it separate from `bash scripts/verify.sh`
until the Java prerequisite is available in every development and CI environment. This
command uses `vitest.firestore.config.ts`; keep the normal Vitest config excluding
emulator tests so `npm test` remains a fast non-emulator suite.

Before handing off, run:

```bash
bash scripts/verify.sh
```

## Update Status

After meaningful work, update `docs/status.md` with:

- Date.
- Files changed.
- Validation command and result.
- New decisions.
- Open questions.
- Next recommended task.

## Handle Failing Tests

1. Read the failure.
2. Decide whether the test or code conflicts with the specs.
3. Fix the code when the spec is clear.
4. Update or add tests only when behavior intentionally changes.
5. Record unresolved blockers in `docs/status.md`.

Never loosen anti-hallucination, citation validation, role checks, or no-write
boundaries to make tests pass.

## Ask For Clarification

Ask only when the answer would materially change architecture, dependencies, hosting,
database, authentication, payment handling, external APIs, UI framework, deployment,
licensing, or security posture. Minor unknowns belong in `docs/status.md`.

## Prepare Changes For Review

- Keep `AGENTS.md` as a router under 150 lines.
- Keep root docs current.
- Include tests for every behavioral change.
- Run `bash scripts/verify.sh`.
- Summarize remaining risks and open decisions.
