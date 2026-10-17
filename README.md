# PMI KC

PMI KC is a production Next.js application for source-backed operations, lease renewals, workflow
communications, approvals, staff work and retained maintenance history.

Production follows the October 16 direction: custom maintenance/vendor operations are retired,
Vendoroo stays standalone, and communications preserve linked reads and permitted unsent drafts.
Records, knowledge, permissions and receipt meanings are preserved. Client sends, schedules,
Resume and worker dispatch are refused.

Production: [pmi-kc-app](https://pmi-kc-app-kq6wuvpiva-uc.a.run.app)

Run `d33c7174-23b1-4126-ac11-657738b1864f` released S227-S229 plus the scoped Notifications latency repair at
`a7bce0981badc7523a6498949b6ea5f2effb198e` / `pmi-kc-app-rmvc9kmq6-1c2699db16f8` with 100% canonical traffic. One application build
`0983c589-af35-4219-9f5f-1bc1018f4043` succeeded at 2026-10-17T10:50:56.561207Z. Candidate receipt
`5b8ba2f6-8531-4936-86d6-5d01d85db110` issued 2026-10-17T10:58:13.931Z; promotion verified
2026-10-17T10:58:38.332Z. Full observation passed two checkpoints in 434,351 ms
against the 300,000 ms minimum and 480,000 ms deadline. All 318 source/projected/rendered
records matched with zero discrepancies, candidate 5xx or unresolved effects. Eleven independent
readback sections matched at 2026-10-17T11:06:16Z. The checkpoint is complete and permit consumed.
Tag `cand-rmvc9kmq6-1c2699db16f8`; fingerprint `sha256:dcbcdd544dd0c6d4d9a294748997aa324aaf2a09008dc1baf0c2aa060dbb1095`.

Captured predecessor: `pmi-kc-app-recovery-a97c579cf11b4d74` / `eb5d35991c3ec128a102e4483d3779af16106821`, Sheet=true.
Run-bound recovery `pmi-kc-app-recovery-d33c717423b14126`, receipt `07b55751-a159-4b01-bb4c-068178f8815b`, reference
`sha256:d376fa106048928a155fc69da5d8588071a1f9c0e45fb3c3ad83a834d418042c`, preserves that actual image/configuration. Its fingerprint
is `sha256:6e57b2a65a60f8e6a218c0b4b0e4cb8db791bad0a8a45a2322457a030393da2c`. The previously authorized tag was separately captured
as bound to `pmi-kc-app-rmvc7c5lz-ec2410dd001a`; canonical serving traffic was not substituted for it.
No traffic rollback was used in this successful run.

Normal managed Dotloop resource refresh succeeded on production. The supported individual
template list is empty; the company-template read failed as unavailable, which does not prove an
empty company list. No supported renewal selection is saved. The reported active template's owning
visibility/root cause remains unestablished; no template recreation is requested. The live UI
distinguishes failed and empty reads and excludes unsupported profiles from selection. Both Dotloop
write keys remain closed. Gmail's provider profile read succeeded for the expected managed mailbox;
sync health reports degraded. No customer draft/send, loop, upload, signature, paid comp request or
production test record was verification proof. Normal connection refresh updates only its existing
credential/observation metadata; it is separate from guarded read-only release assurance.
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
