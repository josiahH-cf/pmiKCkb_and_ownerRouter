# Loop state

Last updated: 2026-09-16 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

Renewal operator hub bundle (S114-S120) in progress. S114 is COMPLETE / DEPLOYED: implemented at
`24b0be59` (spec import `986e82eb`), released 2026-09-16 as head `b7fd04d1` / pmi-kc-app-rmu46blcc-af55ec317652
(attempt 3) after attempts 1 and 2 rolled back with verification. Feature 2 of 7, S115 plain-language section help, is implemented on local branch `s115-section-help` with its full gate, core E2E and both compiled browser checks green and is the next integration; S116-S120 have not started.
S115 branch `s115-section-help`: `97beecdc` (feature), `4f99ee91` (owner-directed auth enrollment fix,
cherry-picked from `33f7630f`), `2747c511` (journey budget), `a9540266` (watcher client fix). Nine
S115 tests (8 of 9 fail-first); preservation 88 files / 969 tests; backend 201; core E2E 8 files / 4
skips; full gate green; compiled desk and guide checks per `~/pmi-kc-work/logs/s115-smokes.log`.
Next: S115 record on the branch, push to main, exact-main CI, serialized release, readbacks, closure;
then S116 (design saved in the session scratchpad; its read-only live Sheet-row inspection needs ADC).

## Verified production

Serving SHA: b7fd04d1e74c0bf4d52401eaca8e7324b1ddf586
Serving revision: pmi-kc-app-rmu46blcc-af55ec317652, 100% traffic (tag cand-rmu46blcc-af55ec317652).
Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app.
Fingerprint: sha256:31553694b276fafdc84d021711ed576a21dfe938d16a1729330214461a61ac18.
Predecessor: pmi-kc-app-rmu2chtvy-4d3cfabf46dd / 0fe69bbe7f182e8a34ed97ebd10f7b573d088630 (fingerprint sha256:cebd1c65380ee5a8ca5e3445a07fec1ee7c4e5766b1df555b28910c195e6fae5).
Exact CI 35085676625 passed on its first run; Cloud Build c0803145-b747-4318-bbfc-dcf9082da3f8 succeeded (14:06:50Z-14:10:12Z).
Candidate receipt issued 14:52:22.384Z (one assurance_unverified retry); promotion started
14:52:35.203Z, verified 14:52:41.672Z; complete 14:59:21Z, all September 16.
Admin passed; Editor not_run under owner policy. Observation: two checkpoints, 386,902 ms / 300,000 ms.
All 311 source/projected/rendered rows matched; zero missing, unexpected, duplicate, field or
destination mismatches; source drift stable; 13 Admin routes rendered; monitoring ready, zero 5xx.
Independent readback 15:00Z: canonical and tagged /api/version, 100% traffic on rmu46blcc, revision
env (APP_COMMIT_SHA b7fd04d1, production/live, Sheet write-back true, demo false, secrets by name),
authorized domains hold only cand-rmu46blcc; no registry, gate or rules file changed since 0fe69bbe.

## Preserved failed attempts

S114 attempt 1: `b29185a3` / pmi-kc-app-rmu30993m-11abc72f1702 (CI 35005955673). Smoke,
fingerprint sha256:c9b60fa76d15321b333e503586aafdbb3c5975d770325ac09fe7d5f3569d1c89, domains,
v4 candidate receipt 08:37:35Z and promotion (verified 08:44:51Z) passed. The post-promotion
observer emitted its deadline report at 08:50:27Z (420,122 ms, 0 checkpoints, every route unread,
sources unavailable); rollback to rmu2chtvy verified (`rolled_back_verified`, terminal checkpoint).
Cloud Run logs show no page request on the canonical origin between the promotion readback and the
deadline: the observer stalled locally. Cause measured: the task-launched watcher used the Windows
Cloud SDK through interop (26-44 s per gcloud read; snap 1-2 s). The candidate revision remains at
0% traffic. Evidence: `observation-pmi-kc-app-rmu30993m-11abc72f1702-1789548454830.json`,
`candidate-…rmu30993m….json`, `promotion-…rmu30993m….json` in the watcher state directory.
S114 attempt 2: `b5aeba0e` / pmi-kc-app-rmu3wxi74-644c5bfde591 (CI 35080191970). Smoke, fingerprint
sha256:55709690aa3959af01987ddd3faddb8fc795109975c66353240df700731ac77a, domains, v4 candidate
receipt 09:58:45Z (one `assurance_unverified` retry) and promotion (verified 09:59:07Z) passed. The
observer rendered all 13 Admin routes and matched 311/311 records, then reported `rollback_required`
at 10:01:35Z (156,605 ms, 0 checkpoints; traffic_mismatch, configuration_unverified,
monitoring_unavailable) because its own cloud reads failed as the enrollment expired. Rollback to
rmu2chtvy executed 14:01Z and verified 14:05:12Z (`rolled_back_verified`) after re-enrollment. Evidence:
`observation-pmi-kc-app-rmu3wxi74-644c5bfde591-1789552752587.json`, `candidate-…rmu3wxi74….json`,
`promotion-…rmu3wxi74….json`.
First Feature 3 candidate: 3287f8a / pmi-kc-app-rmu23j65k-ea7b9f5b8980, never promoted; its
checkpoint/reason were preserved before the corrected commit released. Feature 2's 4e1a4a0 /
rmu1zycgi-d28f58f32910 and Feature 4's 4ece4ba / rmu26u6xc-9a156b302dac failed observation and
verified rollback; their receipts and terminal checkpoints remain. No failed phase was relabeled.

## Authentication and watcher

Owner enrollment 2026-09-16T01:11Z expired at about 10:01Z (Google reauthentication for gcloud and
ADC refresh; observed longevity under nine hours). Re-enrolled 13:59:18Z; 14:01Z `auth:ensure`: gcloud
ok, adc ok, env ok, gh ok (READY, token refresh verified). The enrolled owner Admin profile
authenticated on the candidate and canonical origins during every S114 assurance and predecessor
baseline (last 14:50:18Z). Built-in browser pane: no app session (owner step; not required).
Watcher: native runtime holds the lock (PID 334650 since 14:41:32Z; `export PATH=/snap/google-cloud-cli/current/bin:/home/josiah/.local/opt/node-v22.23.2-linux-x64/bin:$PATH`,
`node scripts/release-watcher.mjs --watch` from the Windows checkout). The previous process kept a
memoized Identity Platform client with the expired refresh token, so `domains` failed each pass after
re-enrollment until the same-lock relaunch; fix `a9540266` on the S115 branch. Host logs:
%LOCALAPPDATA%/PMI-KC/release-watcher/native-status-s114-attempt3.log and native-errors-s114-attempt3.log
(earlier attempts: `…-s114-resume.log`). State: checkpoint.json complete for b7fd04d1 (lastDeployedSha
b7fd04d1). Do not start a competing watcher; `authentication_required` needs the owner's WSL re-enrollment.

## Working checkout and evidence

Native checkout: `~/pmi-kc-work/main` on branch `s115-section-help` (Node 22.23.2, both reviewed
ignored env files, `npm ci`); logs under `~/pmi-kc-work/logs/` (s115-verify-3.log, s115-e2e-core.log,
s115-smokes.log, s115-fail-first.log). The Windows checkout is the watcher SOURCE and the docs editing
tree; branch `s115-section-help` carries S115 and the parked auth fix (`pending-auth-enroll-fix` keeps
the original `33f7630f`). Smoke artifacts: `~/pmi-kc-work/main/temp/renewal-desk-browser-s82`,
`…/renewal-guide-controls-s111`. Failed-candidate diagnostics (`f3-*`, `f4-*`) and archived checkpoints
remain in the watcher state directory. Credentials/customer evidence stay outside Git.

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
