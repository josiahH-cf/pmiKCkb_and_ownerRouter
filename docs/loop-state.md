# Loop state

Last updated: 2026-09-14 (UTC). Read AGENTS.md and docs/facts.md first.

## Active September 14 feature

Feature 1 of six is implemented and pushed as `90bbaa0` on `codex/renewal-record-information`.
PR #83 merged it to main as `2950542dbcf9611838d6337fb0ea41db744e7ad0`.
It surfaces actual unit/contact details and current guidance and adds owner-header all-lease links.
Full local verification passed 6,528 unit tests (four skips), 201 backend tests, policy checks and build.
PR CI 34899631985 passed on failed-job retry with unchanged tests; exact main CI 34900353548 passed.
Local verification logs: `/tmp/pmi-renewal-f1-verify-gFvhmL/verification-final.log`.

Feature 1 is NOT DEPLOYED. The existing WSL watcher is running. Its current checkpoint is:
`sha=2950542dbcf9611838d6337fb0ea41db744e7ad0`, `ciRunId=34900353548`,
`phase=prepare`, `blocked=authentication_required`, `lastDeployedSha=f5faf1665121db9cacff913a57e7fdcc80513116`.
No candidate deployment, promotion or observation completed. Canonical /api/version still serves
`f5faf1665121db9cacff913a57e7fdcc80513116` / `pmi-kc-app-rmtwdl4di-4439f17911f4`.

`npm run auth:ensure` verified the approved WSL CLI refresh and GitHub; ADC identity is unverified.
Owner recovery: `npm run auth:enroll:wsl -- --attended --account=josiah@pmikcmetro.com`.
Resume the existing exact-SHA release checkpoint after enrollment; do not merge or deploy it again
through another process. No identity, IAM, claim, security policy or provider grant changed.

The Windows development checkout remains clean on the feature branch. Fetch is blocked by an
invalid pre-existing `refs/codex/turn-diffs/checkpoints/...` object. Those refs were not altered.
A clean main checkout is `/tmp/pmi-renewal-f1-integration-zbt2es`; the watcher has independent Git.
Features 2-6 have not started. Begin Feature 2 only after successful Feature 1 production completion.

## Serving S113 baseline

S113 requested F1-F5 scope is COMPLETE / DEPLOYED / ALL_GATES_GREEN.
Serving SHA: f5faf1665121db9cacff913a57e7fdcc80513116
Serving revision: pmi-kc-app-rmtwdl4di-4439f17911f4
Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app, 100% traffic.
Exact CI: 34556917662; candidate/configuration/domains, Admin browser assurance, independent reconciliation,
v4 receipt-bound promotion, 300,000 ms observation and serving/backend readback passed.

## Verified scope

One dashboard, typed corrections and supported source updates, restored operator-triggered RentCast,
supplied formatted/copyable drafts with governed Gmail recovery, audited manual progress and the
integrated journey are serving. Blank labeled insurance/form/legal-location inputs are accepted.
Both supplied v2 publications read back approved; private template evidence remains outside Git.
Staff completion remains distinct from provider effects. No fake production completion was seeded.

All 33 in-scope review findings are closed. Full local checks: 6,528 unit PASS/four existing skips,
201 backend PASS, policy/build PASS and all seven compiled browser checks PASS, including 42 guide
steps. Actual routes/Firestore/claims/receipts/readbacks use deterministic external adapters for
backend proof. Human verdict stays NOT RUN. No client send or live customer effect was used for proof.
Evidence: docs/evidence/s113-implementation-review-2026-09-10.md.

## Release and backend evidence

Current checkpoint: /home/josiah/.local/state/pmi-kc-release/checkpoint.json; Feature 1 state above.
The completed S113 receipts below remain the serving baseline.
Captured predecessor: pmi-kc-app-rmtkmhj1z-8855e4c6dbfb / d243911cb20ffb01773072c0e27c723648eeea34.
Fingerprint: sha256:a68c3459ab680b1230662f1becab6c975c5cc86f2ec349d6404ba4b5a0976282.
Older 6e77d18, 00836a8 and 297af97 checkpoints are archived as superseded, without assurance PASS claims.
The a3c1d97 checkpoint is also archived; its aggregate candidate assurance passed, but CLI preflight
refused promotion before dispatch. Its unconsumed receipt and actual outcome remain preserved.
The 919a2ae candidate passed CI 34549763928, candidate assurance and promotion, then failed final observation at 420,140 ms and verified rollback to d243911. Its consumed candidate receipt, promotion receipt, failed observation and terminal rollback checkpoint remain preserved; the failure was never rewritten as a pass.
Owner Admin passed both origins; Editor is not_run under explicit owner direction.
The exact predecessor blocked legacy reconcile exception was recorded; candidate/post-promotion
passed zero mutation attempts. No identity, IAM, claim, activation or budget changed.
Only two Sheet descriptive Registry entries were aligned with backup/CAS/readback; 48/16 unchanged.
Bodyless final logs: temp/s113-final-cloud-readback.log, temp/s113-final-serving-paths.log,
temp/s113-final-backend-readback.log and temp/s113-final-registry-metadata.log.

## Separate remaining inputs

S106/S34 normal packet preparation/approval/S20/S21/own-receipt recovery is deployed. Actual forms,
catalog/mappings, managed Dotloop connection/selection and exact-key activation remain separately
gated; no signature API or legal content is invented. Blank resource boxes do not block manual work.
S100 resident-draft still needs its exact mapped/verified input and proof; S36 remains dependent.
B-MNT1 and the separate 24-hour auth longevity proof remain unverified. S87-S95/S101 are out of scope.

## Prior S113 closure

S113 closure documentation and meeting brief record the verified serving result. Documentation-only
closure must not trigger deployment. The existing local watcher was restored after that release. No new automation was created. Final documentation formatting,
policy checks and all 462 documentation/guide tests pass; all four PDF pages were visually checked.
Evidence: temp/s113-final-docs-native-verify.log. Documentation-only commits never deploy.
