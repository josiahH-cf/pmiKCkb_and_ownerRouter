# Loop state

Last updated: 2026-09-16 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

Renewal operator hub bundle (S114-S120) in progress. S114 is implemented at `24b0be59` (spec import
`986e82eb`) and integrated on main as `b29185a3`. Its first release attempt rolled back; this record
commit resumes it on the native watcher runtime. S115-S120 have not started.
Two independent slide-out panels (Lease information; Process guide with the section navigation)
replace the expanded header summary and inline glossary. Values are separately selectable with copy
controls, one-audience "Copy all" controls, owner and tenant desk click-back links over opaque party
tokens and source-record links. The operator guide table gained the two toggles and the tenant copy
control; steps 8-10 use the serving section labels.
Gates on the exact commit: format, lint, types, 6,575 unit tests (711 files), 201 backend tests,
policy checks and build passed; core E2E passed (8 files, 4 skips); eight S114 tests fail-first.
2026-09-16 compiled checks on `b29185a3` in the native checkout both passed: renewal desk (exit 0,
first attempt) and renewal guide (45 steps). Log: `~/pmi-kc-work/logs/s114-smokes.log`. The desk
check needs a local-only rehearsal `RENEWAL_DESK_PARTY_FILTER_KEY`; nothing was relaxed.
Next: exact-main CI for this record head, the serialized native-watcher release of that exact SHA
(candidate, smoke, fingerprint, domains, assurance, promotion, 300,000 ms observation, readbacks),
then the closure record, then S115.

## Verified production

Serving SHA: 0fe69bbe7f182e8a34ed97ebd10f7b573d088630
Serving revision: pmi-kc-app-rmu2chtvy-4d3cfabf46dd, 100% traffic (restored by the S114 rollback).
Canonical: https://pmi-kc-app-kq6wuvpiva-uc.a.run.app.
Fingerprint: sha256:cebd1c65380ee5a8ca5e3445a07fec1ee7c4e5766b1df555b28910c195e6fae5.
Predecessor: pmi-kc-app-rmu2a59tx-28c0417b4693 / 82a2cf80ab0e17c9a947a54204524f7cd282eb93.
Exact CI 34940745236 passed; Cloud Build 0f7f0e13-b994-48a3-9400-6da69d4f312a succeeded.
Candidate receipt issued 07:33:14.500Z; promotion verified 07:33:32.336Z, September 15.
Admin passed; Editor not_run under owner policy. Observation: two checkpoints, 372,118 ms / 300,000 ms.
All 311 source/projected/rendered rows matched; no field or destination mismatches.
Independent serving/version/runtime readback passed 07:40:24 UTC September 15 and again after the
2026-09-16 rollback (`/api/version` commit 0fe69bbe, revision rmu2chtvy).

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
First Feature 3 candidate: 3287f8a / pmi-kc-app-rmu23j65k-ea7b9f5b8980, never promoted; its
checkpoint/reason were preserved before the corrected commit released. Feature 2's 4e1a4a0 /
rmu1zycgi-d28f58f32910 and Feature 4's 4ece4ba / rmu26u6xc-9a156b302dac failed observation and
verified rollback; their receipts and terminal checkpoints remain. No failed phase was relabeled.

## Authentication and watcher

Owner re-enrollment 2026-09-16T01:11Z; ADC digest matches the binding. 2026-09-16 08:19Z
`auth:ensure` in WSL: gcloud ok, adc ok, env ok, gh ok (READY, token refresh verified). The enrolled
owner Admin profile authenticated on the exact candidate origin and the canonical origin during the
S114 candidate assurance and predecessor baseline. The isolated built-in browser pane has no app
session (Google asks for an email; owner step, not required by the release contract).
Watcher: the task-launched process was stopped while idle at `rolled_back_verified`; the native
runtime now holds the same lock (`export PATH=/snap/google-cloud-cli/current/bin:/home/josiah/.local/opt/node-v22.23.2-linux-x64/bin:$PATH`,
`node scripts/release-watcher.mjs --watch`, PID recorded in the session log). Host logs:
%LOCALAPPDATA%/PMI-KC/release-watcher/native-status-s114-resume.log and native-errors-s114-resume.log.
The launcher `scripts/run-release-watcher.ps1` now prepends that runtime for logon starts.
State: `/home/josiah/.local/state/pmi-kc-release/checkpoint.json` (terminal for b29185a3 until the
new head appears; the next checkpoint carries the failed candidate host as supersededCandidateHost).
Do not start a competing watcher; a persistent `authentication_required` gets `auth:ensure`.

## Working checkout and evidence

Native checkout: `~/pmi-kc-work/main` (Node 22.23.2, both reviewed ignored env files, `npm ci`);
logs under `~/pmi-kc-work/logs/`. The Windows checkout is the watcher SOURCE and the docs editing
tree; local commit `33f7630f` (owner-directed `scripts/auth/**` enrollment fix) is parked on branch
`pending-auth-enroll-fix` and rides the S115 integration.
Smoke artifacts: `~/pmi-kc-work/main/temp/renewal-desk-browser-s82`, `…/renewal-guide-controls-s111`.
Failed-candidate diagnostics from September 14-15 (`f3-*`, `f4-*`) and the archived checkpoints
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
