# PMI KC

PMI KC is a production Next.js application for source-backed operations, lease renewals, workflow
communications, approvals, staff work and retained maintenance history.

Current source follows the October 16 direction: custom maintenance/vendor operations are retired,
Vendoroo stays standalone, and workflow communications remain reads and unsent drafts. Existing
history, knowledge, permissions and receipt meanings are preserved. Verified replacement delivery is pending after a failed observation and verified rollback.

Production: [pmi-kc-app](https://pmi-kc-app-kq6wuvpiva-uc.a.run.app)

Run `a97c579c-f11b-4d74-a366-9a7122eb58f7` built and promoted exact main
`85b7e03c5faad8fb9a9cc97f348ed973125edae6` / `pmi-kc-app-rmvc7c5lz-ec2410dd001a`, then failed
post-promotion observation: the final Notifications browser route exceeded its 30-second bound.
The failed report remains failed: one successful checkpoint, 477,992 ms elapsed, all 318 records
matched, zero discrepancies, candidate 5xx or unresolved effects. Receipt-bound rollback verified
at 2026-10-17T10:05:14.585Z. Production serves predecessor commit
`eb5d35991c3ec128a102e4483d3779af16106821` through
`pmi-kc-app-recovery-a97c579cf11b4d74` at 100%; S227-S229 delivery remains pending.
The failed run, original receipts, claims and cloud operations remain immutable outside Git.

Fresh approved CLI/ADC, GitHub and exact managed-account Admin browser checks passed October 17.
Normal managed Dotloop resource refresh succeeded. The supported individual profile returned an
empty template list; the company template read failed as unavailable, rather than proving an empty
company list. No supported renewal selection is saved. The reported active template's owning
visibility/root cause remains unestablished; do not request template recreation. Both Dotloop write
keys remain closed. Gmail reads report the expected mailbox connected with degraded sync health.
Normal connection refresh updates credential/observation metadata; no customer/provider business
write, draft, send, loop, upload or signature was verification proof.

Production is explicit Live-only. Local rehearsal refuses persistence and provider effects.

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
