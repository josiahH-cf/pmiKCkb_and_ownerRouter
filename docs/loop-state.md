# Loop state

Last updated: 2026-09-15 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

All six September 14 feature sets are implemented, pushed, merged and deployed in their
requested order. Feature 6 completed through PR #91; its production release is complete.

The shared navigation now describes each destination's purpose. The Dashboard and renewal table
explain where to start; lease sections name the work they contain and explain their inputs and saved
destinations. Market estimates, charge frequency, source notes and staff activity fields use plain
wording. Existing field identifiers, source provenance, value routing and draft/write boundaries remain.

The global Admin navigation previously loaded request rows and the managed-user directory just to
show a pending count. It now calls the existing count query after the same current-Admin check.
Independent Dashboard and shared decision-summary reads run together, retaining scope filtering,
source freshness and independent failure handling. No cache lifetime, policy or runtime setting changed.
These are observed code-path improvements; no numerical response-time claim is made.

Existing label assertions are aligned with the new copy. The release reader requires the captured
Feature 5 commit's old section labels and the candidate's new labels, preserving all section,
destination, visibility and safety checks. Full verification passed: 6,532 unit tests, 201 backend
tests, formatting, lint, types, policy checks and production build. Existing selectors were corrected
for the renamed sections; no test or deadline was added or weakened. Unit results are retained in
`/tmp/pmi-f6-verify-final.log`, backend results in `/tmp/pmi-f6-backend-rerun.log`, and remaining policy
and build results in `/tmp/pmi-f6-policy-build.log`. PR CI 34940379104 passed on its first attempt.
Exact-main CI 34940745236 passed on its third attempt after two existing backend journey waits failed
at different points; their failures remain recorded. Candidate assurance passed, promotion was verified
at 07:33:32 UTC, and both production observation checkpoints passed. Independent serving/version/
configuration readback passed at 07:40:24 UTC. No client message was sent or unconfirmed live record written.

## Verified production

Serving SHA: 0fe69bbe7f182e8a34ed97ebd10f7b573d088630
Serving revision: pmi-kc-app-rmu2chtvy-4d3cfabf46dd, 100% traffic.
Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app.
Candidate: https://cand-rmu2chtvy-4d3cfabf46dd---pmi-kc-app-kq6wuvpiva-uc.a.run.app.
Fingerprint: sha256:cebd1c65380ee5a8ca5e3445a07fec1ee7c4e5766b1df555b28910c195e6fae5.
Predecessor: pmi-kc-app-rmu2a59tx-28c0417b4693 / 82a2cf80ab0e17c9a947a54204524f7cd282eb93.
Exact CI 34940745236 passed; Cloud Build 0f7f0e13-b994-48a3-9400-6da69d4f312a succeeded.
Candidate receipt issued 07:33:14.500Z; promotion verified 07:33:32.336Z, September 15.
Admin passed; Editor not_run under owner policy. Observation: two checkpoints, 372,118 ms / 300,000 ms.
All 311 source/projected/rendered rows matched; no field or destination mismatches.
Monitoring ready, zero candidate 5xx/unresolved effects. Checkpoint complete; no rollback.
Independent serving/version/runtime readback passed 07:40:24 UTC. Reviewed configuration remains intact.

## Preserved failed attempts

First Feature 3 candidate: 3287f8a / pmi-kc-app-rmu23j65k-ea7b9f5b8980, never promoted.
Admin passed; 311 records/fields matched; five invalid destinations reflected the old internal-only
verification reader. Existing reconciliation now validates external badges against independent source URLs.
After the last read-only retry was interrupted, candidate zero traffic and unchanged predecessor
version/100% traffic were verified. Its checkpoint/reason were preserved before queuing the corrected
commit through the same watcher. No failed phase was relabeled as passed.
Feature 2's earlier 4e1a4a0 / rmu1zycgi-d28f58f32910 failed observation and verified rollback remain preserved.
Its missing-report recovery uses exact durable rollback. The earlier pre-dispatch env refusal remains recorded.

Feature 4 first release 4ece4ba / rmu26u6xc-9a156b302dac failed observation and verified rollback.
Its failed receipts and terminal checkpoint remain; the resumed 2bf21ff release completed successfully.

## Authentication and watcher

Automatic approved CLI/ADC and Admin browser authentication work; no identity/IAM/claim changes.
Separate 24-hour longevity remains unverified. Source: `/tmp/pmi-renewal-f1-integration-zbt2es`.
Active native Node PID 1038352; Windows WSL helper PID 3848. Do not start a competing watcher.
State: `/home/josiah/.local/state/pmi-kc-release/checkpoint.json`; complete, lastDeployedSha 0fe69bb.
Logs: %LOCALAPPDATA%/PMI-KC/release-watcher/native-status-f4-resume.log and native-errors-f4-resume.log.
Earlier logs remain. Keep the existing lock and serialized release mechanism.

## Working checkout and evidence

Main checkout: `/tmp/pmi-renewal-f1-integration-zbt2es`; both reviewed ignored env files are present.
Original Windows checkout remains on Feature 1; its unrelated broken turn-diff ref was not altered.
Use native Node 22.23.2 and the existing Java 21 runtime for verification.
Feature 6 verification uses the three logs above; focused checks are retained in `/tmp/pmi-f6-focused-final.log`,
`/tmp/pmi-f6-desk-focused.log` and `/tmp/pmi-f6-follow-up-focused.log`.
Observation: `observation-pmi-kc-app-rmu2chtvy-4d3cfabf46dd-1789457618406.json` under the watcher state directory.
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
All six requested standalone feature cycles are complete. No requested implementation or release remains.
