# Loop state

Last updated: 2026-09-15 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

September 14 Feature 4 (RentCast failure repair) is IMPLEMENTED / PUSHED / MERGED, but its
production release FAILED OBSERVATION and was ROLLED BACK. Features 1-3 remain deployed;
Features 5-6 have not started. Remain on Feature 4.

Implementation `32d3ab5566f4a6e4a46672c298e44491fca1a923` was pushed on
`codex/renewal-rentcast-repair` and merged through PR #89 as
`4ece4ba11e5cb35c0f6703fd19d586a423d57697`. Existing focused tests passed (65), and full local
verification passed 6,532 units, 201 backend tests, policies and production build. PR CI 34929220447
passed after two failed-job retries: different waits in the existing mounted backend journey failed
before the unchanged job passed. Exact main CI 34929736602 passed all five jobs on its first attempt.

The reported retained lookup records HTTP 400. An exact-query diagnostic returned the provider's
insufficient-comparables error. Keeping all subject attributes unchanged, 2- and 5-mile requests
failed; a 10-mile request returned HTTP 200 with 15 comparables and an estimate. Raw responses and
customer values remain outside Git. Diagnostic reads made one successful billable request; no
customer draft/send or system-of-record write ran. The adapter passed replay of both actual responses.
The repair explains this refusal and exposes an operator-selected radius, retaining that radius
through the query, cache, observation and saved market basis. Source provenance, contractual base
rent, separate recurring charges, provider order and existing quota/action controls remain intact.
Provider guidance: https://developers.rentcast.io/reference/property-valuation.

Candidate `pmi-kc-app-rmu26u6xc-9a156b302dac` passed build, smoke, configuration, domains and eventual
v4 assurance, then promotion at 05:00:16 UTC. Earlier aggregate assurance failures remain in the
watcher log; separate Admin and reconciliation diagnostics passed without establishing their cause.
Production observation failed after 417,350 ms with one successful checkpoint: Dashboard navigation
timed out at 30,006 ms, with one request failure and missing landmark. All 311 records reconciled;
monitoring reported zero candidate 5xx and unresolved effects. No auth mismatch or mutation occurred.
The existing process required rollback and verified Feature 3 restored at 100% traffic. Independent
canonical/tagged version and runtime readback confirmed that restoration at 05:09:18 UTC.

The checkpoint is terminal `rolled_back_verified`, not complete. The watcher process was stopped
between attempts to prevent documentation closure from requeuing the same failed runtime. Its
scheduled task and release lock file remain intact. Resume Feature 4 from the preserved failure;
do not start Feature 5 or clear the failed receipt/checkpoint. Automatic approved authentication works.

## Verified production

Serving SHA: a5852eaf8b19c1af48295ec8fff77814a91a10c7
Serving revision: pmi-kc-app-rmu2508wj-67ca3e173ab5
Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app, 100% traffic.
Candidate: https://cand-rmu2508wj-67ca3e173ab5---pmi-kc-app-kq6wuvpiva-uc.a.run.app.
Fingerprint: sha256:3dd4b046d1a1b00f8233801bf80605978242ef348698bd0b9cdf4268cd53b28a.
Captured predecessor: pmi-kc-app-rmu21dwpb-3ea232a8339f / e689586ffd1a8b369a86df4c1a1bffa478bd609d.
Full local verification: 6,532 units, 201 backend tests, policies/build PASS; no tests added.
PR #87 CI 34923446159 passed a failed-job retry; PR #88 CI 34925973325 and exact main CI 34926252129 passed first attempt.
Cloud Build 6aacb9db-4c13-4c5f-b539-3f3517620ffc succeeded; smoke/configuration/domains passed.
Admin passed; Editor not_run under owner policy; reconciliation matched all 311 source/projected/rendered rows.
Zero missing/unexpected/duplicate records, field mismatches or invalid destinations.
Promotion verified 2026-09-15T04:03:54.495Z. Observation passed: two checkpoints, 386,528 ms, 300,000 ms window.
Monitoring reported zero candidate 5xx and unresolved live effects. Checkpoint complete, no rollback.
Independent canonical/tagged version, traffic and runtime readback passed at 04:11:54 UTC.
Production + Live, managed runtime account, 11 Spaces, provider bindings, allowance 50 and Sheet switch remain.

## Preserved failed attempts

First Feature 3 candidate: 3287f8a / pmi-kc-app-rmu23j65k-ea7b9f5b8980, never promoted.
Admin passed; 311 records/fields matched; five invalid destinations reflected the old internal-only
verification reader. Existing reconciliation now validates external badges against independent source URLs.
After the last read-only retry was interrupted, candidate zero traffic and unchanged predecessor
version/100% traffic were verified. Its checkpoint/reason were preserved before queuing the corrected
commit through the same watcher. No failed phase was relabeled as passed.
Feature 2's earlier 4e1a4a0 / rmu1zycgi-d28f58f32910 failed observation and verified rollback remain preserved.
Its missing-report recovery uses exact durable rollback. The earlier pre-dispatch env refusal remains recorded.

## Authentication and watcher

Automatic CLI/ADC and enrolled Admin browser authentication passed; no password/code/passkey/CAPTCHA,
account, policy, claim or permission change. Separate 24-hour longevity remains unverified.
The serialized watcher source remains `/tmp/pmi-renewal-f1-integration-zbt2es` with native Node/Cloud SDK.
Node PID 955680 and its Windows WSL helper have stopped after verified rollback; no release child remains.
Do not restart it merely to redeploy unchanged Feature 4 code after documentation closure.
Checkpoint: `/home/josiah/.local/state/pmi-kc-release/checkpoint.json`; Feature 4 terminal rollback, lastDeployedSha `a5852eaf8b19c1af48295ec8fff77814a91a10c7`.
Logs: %LOCALAPPDATA%/PMI-KC/release-watcher/native-status-f3-resume.log and native-errors-f3-resume.log.
Earlier logs remain. Keep the existing lock and release mechanism; documentation-only closure does not deploy.

## Working checkout and evidence

Clean main checkout: `/tmp/pmi-renewal-f1-integration-zbt2es`; both reviewed ignored env files are present.
Original Windows checkout remains on Feature 1; its unrelated broken turn-diff ref was not altered.
Use native Node 22.23.2 and the existing Java 21 runtime for verification.
Feature 4 local verification: `/tmp/pmi-f4-verify.log` (passed); focused output: `/tmp/pmi-f4-focused.log`.
Observation: `observation-pmi-kc-app-rmu2508wj-67ca3e173ab5-1789445039261.json` under the watcher state directory.
Failed-candidate diagnostics: `f3-canary-diagnostic.json` and `f3-reconciliation-diagnostic.json`.
Archived checkpoint: `checkpoint-3287f8a0874f939abfa2df7260b523b97545e14b-superseded-by-a5852eaf8b19c1af48295ec8fff77814a91a10c7.json` plus `.reason.json`.
Feature 2 failure/rollback and preflight-refusal evidence remain. Credentials/customer evidence stay outside Git.

## Preserved boundaries

Staff-recorded progress remains separate from provider receipts/signatures. Source writes retain exact
preview/confirmation, claims, receipts/readback and correction. Messages remain unsent drafts.
Completed S97-S100 proofs are not rerun. S106/S34 still requires actual forms/catalog/mappings,
managed Dotloop connection/selection and exact activation gates. Blank resource inputs remain accepted.
S100 resident-draft still needs exact mapped/verified input; S36 remains dependent. Other suites are out of scope.

Feature 4 private evidence (watcher state directory):

- `observation-pmi-kc-app-rmu26u6xc-9a156b302dac-1789448425956.json` (failed, rollback required).
- `candidate-pmi-kc-app-rmu26u6xc-9a156b302dac.json` and matching `promotion-...` v4 receipt.
- `f4-canary-diagnostic.json`, `f4-reconciliation-diagnostic.json` (passed diagnostics).
- `f4-rentcast-rejection.json`, `f4-rentcast-radius-5.json`, `f4-rentcast-radius-10.json` (private provider evidence).
- `checkpoint-4ece4ba11e5cb35c0f6703fd19d586a423d57697-rolled-back.json` preserves the terminal checkpoint.

Feature 4 Cloud Build `4393a9ee-a5b4-458f-b170-f44487a12404` succeeded. Its failed-release fingerprint
is `sha256:72ebf49f248c6c409fab424ab24cd1f9153c0d32b96d64185bfd0b1099c8a3da`.
