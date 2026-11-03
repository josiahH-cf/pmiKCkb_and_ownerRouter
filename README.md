# PMI KC

PMI KC is a production Next.js application for source-backed knowledge, lease renewals,
workflow communications, approvals and staff work.

Production: [pmi-kc-app](https://pmi-kc-app-kq6wuvpiva-uc.a.run.app)

The cumulative S232–S239/S126 and scoped WSL authentication build is verified delivered at
`bc97535379dd08deab578455b00a80fc93b8d209` / `pmi-kc-app-rmvzwt7ms-00754475effd`, with 100%
canonical traffic. Run `d4c109a0-6dce-4c4d-8928-ec77e9a58c73` passed guarded candidate/promotion,
two observation checkpoints in 401,533 ms, 375 matched source/projected/rendered records and all
eleven independent readbacks. The queue is empty and permit consumed. Current source, recovery,
auth and exact remaining exceptions: [delivery evidence](docs/evidence/application-delivery-2026-11-03.md).

Staff-confirmed renewal Send/Schedule/Resume retains its exact source/target, sender/content,
role/Space, at-most-once, receipt/readback and ambiguity recovery gates. Retired maintenance,
generic/model-triggered and unapproved background sends remain unavailable. Vendoroo stays standalone.
Dotloop C00/A1 selection is settled and the existing managed account read passes; both business-write
keys stay closed and signing remains human. Client originals/maps and real staff acceptance hold
only their named effects. No customer/provider business effect was verification proof.
Production is explicit Live-only. Local rehearsal refuses persistence and provider effects.

The verified WSL operator command, from any directory, is:

```bash
bash /home/josiah/pmi-kc-work/auth-command-20261102/scripts/pmi-auth
```

It checks existing approved local identities/stores and bounded safe provider reads. The actual
post-deployment run exited 0 with the existing Admin session. Paid RentCast/AI calls remain untested;
Google challenges remain human. Espansr replacement/reinstall is a separate task.

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

From the clean registered native release pair, use Node 22 and snap gcloud:

```bash
node scripts/release-control.mjs --prepare
node scripts/release-prerequisites.mjs
node scripts/release-batch-preflight.mjs
node scripts/release-control.mjs --admit-and-watch
```

The controller recollects fresh prerequisites under the real lock, admits the exact green main
head, prepares receipt-bound recovery, builds one zero-traffic candidate and requires exact smoke,
assurance, promotion, full observation and independent readbacks. Empty queues, consumed permits
and unresolved effects cannot authorize another run. See docs/release-batch-runbook.md and
docs/environment-handoff.md.

## Safety summary

Current operation policy refuses client sends and schedules, including previously admitted schedules.
Permitted renewal notices remain reviewed unsent Gmail drafts that staff can send from Gmail.
Retired maintenance effects cannot execute. System-of-record writes require exact human confirmation and rollback proof.
Production never receives sample/test data. Secrets and client data never enter Git.
