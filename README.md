# PMI KC

PMI KC is a production Next.js application for source-backed operations, lease renewals, workflow
communications, maintenance, approvals, and staff work.

Production: [pmi-kc-app](https://pmi-kc-app-kq6wuvpiva-uc.a.run.app)

Current deployed code is commit `13569183da57c419ac0da279dde5a6d6a0b0da14` on Cloud Run revision
`pmi-kc-app-rmtafuqbg-4e2e4ffe0f48`. Production is explicit Live-only. Local rehearsal may use live
reads but refuses persistence and provider effects.

## Start here

1. `AGENTS.md` — authority, safety, and truth precedence.
2. `docs/README.md` — current documentation index.
3. `docs/facts.md` — verified present truth.
4. `docs/loop-state.md` — exact resume point.
5. `docs/spec.md` — current product contract.

Historical Demo, V1, audit, and program documents were removed from the active tree on 2026-08-26.
They remain recoverable from Git at `1356918` and are not current guidance.

## Local commands

```bash
npm ci
npm run dev
npm test
npm run test:firestore
npm run test:e2e:core
bash scripts/verify.sh
```

Use WSL/Linux for this workspace. Keep `GOOGLE_APPLICATION_CREDENTIALS` unset and use managed
Application Default Credentials. Never commit environment files, credentials, client exports, or
customer values.

## Release

```bash
npm run release -- --environment=production --plan-only --budget-confirmed --allow-multiple-spaces
npm run release -- --environment=production --execute --budget-confirmed --allow-multiple-spaces
npm run smoke:release-candidate -- --base-url=<tag-url> --expected-tag=<tag> \
  --expected-service=pmi-kc-app --expected-revision=<revision> --expected-commit=<40-char-sha>
npm run release -- --environment=production --promote \
  --candidate-revision=<revision> --budget-confirmed --allow-multiple-spaces
```

The release path deploys at zero traffic, verifies exact commit/revision identity, and promotes only
the named candidate. See `docs/environment-handoff.md`.

## Safety summary

Client-facing sends are never autonomous. Renewal and maintenance notices are unsent Gmail drafts
that a human sends. System-of-record writes require exact human confirmation and rollback proof.
Production never receives sample/test data. Secrets and client data never enter Git.
