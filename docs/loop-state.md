# Loop state

Last updated: 2026-09-15 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

Feature 4 is IMPLEMENTED / PUSHED / MERGED / DEPLOYED. PR #89 merged `32d3ab5` as `4ece4ba`.
Serving SHA `2bf21ffe3821c1d2d32e3bb31cee9ccabb218e72` / `pmi-kc-app-rmu286tg6-b24d5e15315b`
completed the resumed production release. Features 1-4 are deployed; Features 5-6 have not started.

The reported retained lookup records HTTP 400. The exact query returned an insufficient-comparables
error. With subject attributes unchanged, 2- and 5-mile requests failed; 10 miles returned HTTP 200
with 15 comparables. The repair explains this refusal and allows an operator-selected radius retained
through query/cache/observation/market basis. Base rent, separate recurring charges, source provenance,
provider order, quota and action controls remain. Historical results no longer claim a fresh request.
Provider guidance: https://developers.rentcast.io/reference/property-valuation.
One successful diagnostic read was billable; raw responses/customer values remain outside Git.
No customer draft/send or system-of-record write ran.

Existing focused tests passed (65); full local verification passed 6,532 units, 201 backend tests,
policies/build. PR CI 34929220447 passed after two failed-job retries at different existing journey
waits; no code or assertions changed. Main CI 34929736602 and final CI 34931918778 passed.
The resumed release passed v4 assurance/promotion and two observation checkpoints in 378,909 ms.
Independent serving/version/runtime readback passed at 05:47:39 UTC. The watcher is active and complete.

The earlier `4ece4ba` / `pmi-kc-app-rmu26u6xc-9a156b302dac` observation failed on a 30,006 ms
Dashboard navigation timeout and verified rollback. Failed evidence remains outside Git. Aggregate
assurance failures retain their actual outcomes without an inferred cause. The existing complete
assurance function passed during a private diagnostic with the watcher paused between attempts;
no code, deadline, route assertion or release gate was weakened. The watcher then promoted the exact
receipted revision and completed observation. Feature 5 starts next from freshly inspected main.

## Verified production

Serving SHA: 2bf21ffe3821c1d2d32e3bb31cee9ccabb218e72
Serving revision: pmi-kc-app-rmu286tg6-b24d5e15315b, 100% traffic.
Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app.
Candidate: https://cand-rmu286tg6-b24d5e15315b---pmi-kc-app-kq6wuvpiva-uc.a.run.app.
Fingerprint: sha256:092e20a589aeceda9ea0dad5cd5a2727b027eef68b5dd775380eb762793e06a9.
Predecessor: pmi-kc-app-rmu2508wj-67ca3e173ab5 / a5852eaf8b19c1af48295ec8fff77814a91a10c7.
Exact CI 34931918778 passed; Cloud Build 852129e0-63c0-427e-983b-c61f9a822670 succeeded.
Candidate receipt issued 05:40:22.136Z; promotion verified 05:40:47.547Z, September 15.
Admin passed; Editor not_run under owner policy. Observation: two checkpoints, 378,909 ms / 300,000 ms.
All 311 source/projected/rendered rows matched; no field or destination mismatches.
Monitoring ready, zero candidate 5xx/unresolved effects. Checkpoint complete; no rollback.
Independent serving/version/runtime readback passed 05:47:39 UTC. Reviewed configuration remains intact.

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

Automatic approved CLI/ADC and Admin browser authentication work; no identity/IAM/claim changes.
Separate 24-hour longevity remains unverified. Source: `/tmp/pmi-renewal-f1-integration-zbt2es`.
Active native Node PID 1038352; Windows WSL helper PID 3848. Do not start a competing watcher.
State: `/home/josiah/.local/state/pmi-kc-release/checkpoint.json`; complete, lastDeployedSha 2bf21ff.
Logs: %LOCALAPPDATA%/PMI-KC/release-watcher/native-status-f4-resume.log and native-errors-f4-resume.log.
Earlier logs remain. Keep the existing lock and serialized release mechanism.

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

Successful Feature 4 observation: `observation-pmi-kc-app-rmu286tg6-b24d5e15315b-1789450852413.json`,
with matching v4 receipts in the watcher state directory. Earlier failed evidence remains unchanged.
Next: Feature 5 dark-mode readability from current main; Feature 6 waits for its production completion.
