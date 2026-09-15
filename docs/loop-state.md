# Loop state

Last updated: 2026-09-15 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

Features 1 and 2 remain sequential. Feature 1 is deployed; Feature 2 is implemented/pushed/merged
but NOT DEPLOYED after verified rollback. Features 3-6 have not started.
Feature 2 branch: `codex/renewal-process-glossary`, based on current main `4e1a4a0`.
PRs #84/#85 merged glossary/guidance and deferred hidden entries until first expansion. Full local
verification passed 6,528 unit tests/four skips, 201 backend tests, policy/build. Exact main CI
34917214663 passed on a failed-job retry; earlier failed async UI waits retain their outcomes.
Candidate `pmi-kc-app-rmu1zycgi-d28f58f32910` passed build/smoke/config/domains/Admin assurance
and promotion. First observation had no report; retry failed `checkpoint_schedule_invalid` after
317,523 ms and one checkpoint. Monitoring reported zero 5xx/unresolved live effects. Cause of the
missing report is not established. The watcher verified rollback to Feature 1 and recorded terminalFailure.
The same watcher was stopped while idle after verified rollback; no lock/checkpoint/receipt was deleted.
Repair its missing-report path to use existing durable exact-predecessor rollback immediately.
Finish verification, push, merge and a fresh complete serialized release of Feature 2 before Feature 3.

## Verified production

Serving SHA: 2950542dbcf9611838d6337fb0ea41db744e7ad0
Serving revision: pmi-kc-app-rmu1rxk29-9d8d576379d9
Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app, 100% traffic.
Candidate origin: https://cand-rmu1rxk29-9d8d576379d9---pmi-kc-app-kq6wuvpiva-uc.a.run.app.
Fingerprint: sha256:ab8796108228a075ec3cdff0dfc836bfd5ae8041c165a9156a9f96e683008979.
Captured predecessor: pmi-kc-app-rmtwdl4di-4439f17911f4 / f5faf1665121db9cacff913a57e7fdcc80513116.
Full local verification: 6,528 units/four existing skips, 201 backend tests, policy/build PASS.
PR CI 34899631985 passed on failed-job retry; exact main CI 34900353548 passed on its first attempt.
Cloud Build acdc3d48-cc1e-4b7d-80d0-c97c523f3619, smoke, configuration and domain checks passed.
An earlier aggregate assurance reported unverified; the unchanged retry passed. The failure was
not relabeled as a pass. Admin passed; Editor not_run under owner policy. Reconciliation matched.
Receipt-bound promotion and 300,000 ms observation passed; actual observation elapsed 378,690 ms.
All 311 source/projected/rendered records matched, with zero field mismatches/invalid destinations.
Independent traffic/version/runtime/serving-API/backend/Registry reads passed; no business writes ran.
Production + Live, managed runtime account, 11 Spaces, provider secrets, allowance 50, Sheet switch
and 48 Registry keys/16 open remain. Both message publications remain approved. Backend reads show
one workspace/cycle, no saved message preparations or draft heads/snapshots, and zero resource links.

## Authentication and release continuation

September 15 `auth:session -- --browser` completed automatically using the approved account's
existing browser session. It verified and rebound ADC; CLI/ADC readiness is READY. The enrolled
Admin browser authenticated on canonical and candidate origins. No password/code/passkey/CAPTCHA
was entered and no account, policy or permission scope changed. The former ADC binding mismatch
is resolved. Do not repeat enrollment without a fresh failure. The separate longevity proof is unverified.
The serialized watcher is stopped after the verified Feature 2 rollback. Its checkpoint is
`/home/josiah/.local/state/pmi-kc-release/checkpoint.json`, phase observe, blocked rolled_back_verified,
terminalFailure true; lastDeployedSha remains `2950542dbcf9611838d6337fb0ea41db744e7ad0`.
Restart the same watcher from the updated clean checkout with native Node/Cloud SDK PATH after the repair.
Host logs: %LOCALAPPDATA%/PMI-KC/release-watcher/native-status.log and native-errors.log.
Candidate/promotion v4 receipts and observation report are under `/home/josiah/.local/state/pmi-kc-release`.
Observation: observation-pmi-kc-app-rmu1rxk29-9d8d576379d9-1789432240908.json.
Use the existing watcher and lock; do not create competing deployments. Documentation-only closure does not deploy.

## Working checkout

Clean main checkout: `/tmp/pmi-renewal-f1-integration-zbt2es`.
The original Windows checkout remains on the Feature 1 branch. Fetch has a broken existing
`refs/codex/turn-diffs/checkpoints` ref; those unrelated refs were not altered. The watcher has independent Git.
Feature 2 local verification log: `/tmp/pmi-f2-verify-final.log`.
Failed observation: `observation-pmi-kc-app-rmu1zycgi-d28f58f32910-1789436833060.json`.
Private sources, customer evidence, provider configuration and credentials remain outside Git.

## Preserved boundaries

S113 is deployed. Staff-recorded progress remains distinct from provider receipts and signatures.
Source writes retain exact preview/confirmation, claims, receipts/readback and correction contracts.
Client-facing messages remain unsent drafts. Existing S97-S100 proofs are not rerun.
S106/S34 still requires actual forms/catalog/mappings, managed Dotloop connection/selection and
exact activation gates. Blank resource inputs remain accepted. No signature API or legal content is invented.
S100 resident-draft still needs exact mapped/verified input; S36 remains dependent. Other suites are out of scope.
