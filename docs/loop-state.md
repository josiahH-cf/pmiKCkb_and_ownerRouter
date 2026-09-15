# Loop state

Last updated: 2026-09-15 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

September 14 Feature 4 (RentCast failure repair) is implemented on
`codex/renewal-rentcast-repair`; full verification passed. It is not yet pushed, merged or deployed.
Features 1-3 remain deployed; Features 5-6 have not started.

The retained reported lookup records HTTP 400. Replaying its exact query returned RentCast's
insufficient-comparables error. Keeping every subject attribute unchanged, 2- and 5-mile requests
failed; a 10-mile request returned HTTP 200 with 15 comparables and an estimate. Raw responses and
customer values remain outside Git. These diagnostic reads made one billable successful request;
no customer draft/send or system-of-record write ran.

The repair distinguishes that provider refusal, exposes an operator-selected positive radius and
retains the actual radius through the query/cache/observation/market basis. Each lookup remains one
operator-triggered request; no automatic radius fallback occurs. Source attributes, property-type
omission, base-rent provenance and separate recurring charges remain intact. The initial 2-mile
radius remains; historical lookup display no longer claims a fresh request occurred on page load.
Provider guidance: https://developers.rentcast.io/reference/property-valuation.
Existing focused tests passed (65); the actual private failure/success responses passed adapter replay.
Full verification passed: 6,532 unit tests, 201 backend tests, policies and production build.
The existing PR/CI/serialized production release remains to complete Feature 4.

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
The same serialized watcher runs from `/tmp/pmi-renewal-f1-integration-zbt2es` with native Node/Cloud SDK.
Node PID 955680; Windows WSL helper PID 27776. Earlier watcher stopped for safe failed-candidate supersession.
Checkpoint: `/home/josiah/.local/state/pmi-kc-release/checkpoint.json`; complete, lastDeployedSha `a5852eaf8b19c1af48295ec8fff77814a91a10c7`.
Logs: %LOCALAPPDATA%/PMI-KC/release-watcher/native-status-f3-resume.log and native-errors-f3-resume.log.
Earlier logs remain. Keep the existing lock and release mechanism; documentation-only closure does not deploy.

## Working checkout and evidence

Clean main checkout: `/tmp/pmi-renewal-f1-integration-zbt2es`; both reviewed ignored env files are present.
Original Windows checkout remains on Feature 1; its unrelated broken turn-diff ref was not altered.
Use native Node 22.23.2 and the existing Java 21 runtime for verification.
Final local verification: `/tmp/pmi-f3-assurance-verify.log`.
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
