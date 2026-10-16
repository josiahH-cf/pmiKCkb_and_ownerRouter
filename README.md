# PMI KC

PMI KC is a production Next.js application for source-backed operations, lease renewals, workflow
communications, approvals, staff work and retained maintenance history.

Current source follows the October 16 direction: custom maintenance/vendor operations are retired,
Vendoroo stays standalone, and workflow communications remain reads and unsent drafts. Existing
history, knowledge, permissions and receipt meanings are preserved. This source change is not deployed.

Production: [pmi-kc-app](https://pmi-kc-app-kq6wuvpiva-uc.a.run.app)

The public bodyless version endpoint reported commit `eb5d35991c3ec128a102e4483d3779af16106821` on
revision `pmi-kc-app-rmv3yavsf-2cece39f7605` at 2026-10-16T09:18:48Z. October 16 managed readback
confirms the same revision at 100% traffic. Approved host credentials refresh successfully; the
Admin browser profile still requires Google's human password/challenge step before release assurance.
Production is explicit Live-only. Local rehearsal may use live reads but refuses persistence and provider effects.

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

Use WSL/Linux for this workspace. Run `npm run auth:ensure` first: authentication is pre-approved
and self-repairing (`AGENTS.md`, Authentication). Keep `GOOGLE_APPLICATION_CREDENTIALS` unset and
use managed Application Default Credentials. Never commit environment files, credentials, client
exports, or customer values.

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

Current operation policy refuses client sends and schedules, including previously admitted schedules.
Permitted renewal notices remain reviewed unsent Gmail drafts that staff can send from Gmail.
Retired maintenance effects cannot execute. System-of-record writes require exact human confirmation and rollback proof.
Production never receives sample/test data. Secrets and client data never enter Git.
