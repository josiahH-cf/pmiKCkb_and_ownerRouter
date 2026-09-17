# Loop state

Last updated: 2026-09-17 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

Renewal operator hub bundle (S114-S120) COMPLETE. S114 (`24b0be59`, head `b7fd04d1` / rmu46blcc, third
attempt), S115 (`dffc4f71`, head `3ca35870` / rmu4awn6p, second attempt), S116 (`7a19d338`, head `33ef3039`
/ rmu4eoy5u, first attempt; email-column sync waits for the two Sheet headers), S117 (`bc559602`, head
`a483c47d` / rmu4ir3hc, first attempt with cold-start retries), S118 (`0223bdb1`, head `af46ac72` /
rmu4ontao, first attempt with one slow-render assurance pass), S119 (`2c810eb1`, head `be023196` /
rmu4s6qo5, first attempt; no retries) and S120 (implemented at `e056077c`, released 2026-09-17 as head `79493458` /
pmi-kc-app-rmu4wevd9-d89996133320, first attempt; no retries) are all COMPLETE / DEPLOYED. S120 deployed: preparation
before the recorded outreach and response for both audiences; one readiness result routing each missing
input to its control and gating the final-body copy; a retained same-sender signature and a deliberate
RentVine charge fill with origin cues; the shared resource entries on Connections and the Admin task index
with a per-lease state summary; known facts in the document handoff. Next: no feature is queued from this
request; deferred live effects stay separate (S116 email-column sync until the owner adds the two Sheet
headers; Dotloop packet actions and blank shared resources until their inputs and activation exist).
Authentication: the WSL enrollment expires under nine hours; re-enroll before any new release.

## Verified production

Serving SHA: 79493458f641b9710d8c43467e872aa9acf7948e
Serving revision: pmi-kc-app-rmu4wevd9-d89996133320, 100% traffic (tag cand-rmu4wevd9-d89996133320).
Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app.
Fingerprint: sha256:d44428cbddc18208ef1422dff178fd2f24af77119465497623f02cd57c686568.
Predecessor: pmi-kc-app-rmu4s6qo5-5d81e4f12265 / be023196ef63cd4e48db8230fc8deccaedae95c8 (fingerprint sha256:93e2cbc0c2b9a5bd6f0273b91169a0cf3b2df980557874d9f46ed0000a81daaa).
Exact CI 35173497243 passed; Cloud Build b66de152-035b-47c9-8087-f001fe15d26a succeeded (02:18:07Z-02:22:50Z).
Candidate receipt issued 02:27:49Z; promotion started 02:28:00Z, verified 02:28:06Z;
complete 02:34:15Z, all September 17.
Admin passed; Editor not_run under owner policy. Observation: two checkpoints, 372,944 ms / 300,000 ms.
All 311 source/projected/rendered rows matched; zero missing, unexpected, duplicate, field or
destination mismatches; source drift stable; 13 Admin routes rendered; monitoring ready, zero 5xx.
Independent readback after completion: canonical and tagged /api/version, 100% traffic on the revision,
revision env (APP_COMMIT_SHA 79493458, production/live, Sheet write-back true, demo false, secrets by name),
authorized domains hold only the new candidate host; no registry, gate or rules file changed since be023196.

## Preserved failed attempts

S115 attempt 1: `9d6258bb` / pmi-kc-app-rmu49gnyi-9cf475eedd55 (CI 35115674480). Smoke, fingerprint,
domains, v4 candidate receipt 16:10:14Z (after three `assurance_unverified` passes) and promotion
(verified 16:10:38Z) passed. The observer reported `rollback_required` at 16:12:19Z (109,420 ms, 0
checkpoints; admin_canary_failed, browser_diagnostic: route my_work landmark_missing at 1,488 ms; 12/13
rendered; 311/311 matched; monitoring ready); rollback to rmu46blcc verified 16:13:37Z. Cause: the canary
asserted the exact heading before the work board settled and the loading panel carries its own
heading; fixed in `f3406f3d`. Evidence: `observation-pmi-kc-app-rmu49gnyi-9cf475eedd55-1789575048099.json`,
`candidate-…rmu49gnyi….json`, `promotion-…rmu49gnyi….json` and the archived terminal checkpoint.
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
ADC refresh; observed longevity under nine hours). Re-enrolled 13:59:18Z; 14:01Z `auth:ensure` READY
(gcloud, adc, env, gh; token refresh verified); the watcher's preflight and cloud reads succeeded through
16:39Z. The enrolled owner Admin profile authenticated on the candidate and canonical origins during
every S114 and S115 assurance and predecessor baseline (last 16:32:28Z); a momentary canonical session
gap at about 16:23Z (`managed_browser_enrollment_required`) was closed at 16:27:11Z by
`auth:enroll-canary` reusing the existing session (no human input). Built-in browser pane: no app
session (owner step; not required).
Watcher: native runtime holds the lock (PID 387335 since 15:51:26Z; `export PATH=/snap/google-cloud-cli/current/bin:/home/josiah/.local/opt/node-v22.23.2-linux-x64/bin:$PATH`,
`node scripts/release-watcher.mjs --watch` from the Windows checkout) running the client-lifecycle
fix. Host logs: %LOCALAPPDATA%/PMI-KC/release-watcher/native-status-s115.log and
native-errors-s115.log (earlier: `…-s114-attempt3.log`, `…-s114-resume.log`). State: checkpoint.json
complete for 3ca35870 (lastDeployedSha 3ca35870). Do not start a competing watcher;
`authentication_required` needs the owner's WSL re-enrollment; the next release should start well
inside the enrollment (expiry expected about 22:45Z).

## Working checkout and evidence

Native checkout: `~/pmi-kc-work/main` on branch `s120-downstream-ux`, squashed into main as `e056077c`
(Node 22.23.2, both reviewed ignored env files, `npm ci`), synced
from the Windows checkout by `git fetch /mnt/c/... <branch>` + `checkout -B`; logs under
`~/pmi-kc-work/logs/` (s115-verify-3.log, s115-e2e-core.log, s115-smokes.log, s115-fail-first.log,
renewal-smokes.log). The Windows checkout is the watcher SOURCE and the docs editing tree
(`pending-auth-enroll-fix` keeps the original `33f7630f`). Smoke artifacts:
`~/pmi-kc-work/main/temp/renewal-desk-browser-s82`, `…/renewal-guide-controls-s111`. Failed-candidate
diagnostics (`f3-*`, `f4-*`) and archived checkpoints remain in the watcher state directory.
Credentials/customer evidence stay outside Git.

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
