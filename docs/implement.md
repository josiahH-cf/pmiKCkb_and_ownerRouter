# PMI KC KB Implementation Runbook

## Select The Next Milestone

Open `docs/status.md`, find the next recommended task, then compare it to
`docs/plan.md`. Work on the earliest unfinished milestone unless the user explicitly
redirects.

For the current demo-first work, start with `docs/demo-slice.md` and keep the
environment split in `docs/demo-cutover.md` in view before adding live Google
integration code.

## Keep Changes Scoped

- Work inside the KB runtime only.
- Keep Owner Router work to `docs/router-repo.md` unless the separate repo is opened.
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
