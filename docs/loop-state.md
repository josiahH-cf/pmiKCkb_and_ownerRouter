# Loop state

Last updated: 2026-09-18 (UTC). Read AGENTS.md and docs/facts.md first.

## Current resume point

S128 (F08, pause operating-Sheet writes) is IMPLEMENTED and CI-GREEN but its production RELEASE is
BLOCKED by an external billing incident. Code head `31bc9072` (branch main) closes the enforcement,
proactive UI pause, server-owned `isOperatingSheetWritebackPaused` accessor and the owner-approved
rollback-safety guard (the watcher never rolls back onto a writeback-enabled revision; candidate,
promoted and rollback readbacks assert the flag reads back false). Full local gate passed (6762 unit,
213 backend, build, e2e:core) and exact-SHA CI 35342904192 passed. The runtime flag is set false in
`.env.production.local` and `.env.local` (host config, uncommitted), staged for the next deploy.

**PRODUCTION INCIDENT (owner action required):** billing is DISABLED on GCP project `pmi-kc-kb-prod`
(read back 2026-09-18 ~12:5xZ; `billingEnabled=false`, account `01A5A3-65CA5A-614D45` still linked).
Cloud Run cannot run compute, so the canonical endpoint returns 503 and every `gcloud run deploy`
fails `BILLING_DISABLED` (Artifact Registry/Cloud Build need billing). This is likely the $100
project hard-stop kill switch; the owner must review spend and re-enable billing. The runner does not
change billing (financial/system setting). Serving revision on record stays `pmi-kc-app-rmu4wevd9-
d89996133320` / 79493458 but it is not actually serving while billing is off.

Recovery once billing is re-enabled: the wedged watcher checkpoint was reset to idle (phase=complete;
backup at `~/.local/state/pmi-kc-release/checkpoint.wedged-s128-billing-*.json`) and the watcher is
STOPPED. Start the `PMI KC release watcher` scheduled task (native snap gcloud) OR re-run the release;
it will deploy the flag-false `31bc9072` candidate `pmi-kc-app-rmu6x3d7a-...` (fresh suffix on a clean
cycle), smoke, assure, promote, observe 300000 ms and read back the flag false. The rollback guard and
observe flag-false assertions ship in that release. The AC-S128-7 live rollback drill was not run
(traffic-bearing); the guard is proven by the driver unit tests.

After S128 releases, the ordered renewal meeting-readiness bundle continues:
S123 -> S124 -> S134 -> S122 -> S125 -> S126 -> S127 -> S131 -> S129 -> S130 -> S132; S133 independent;
S121 when scheduled. Every later suite must preserve the S128 pause. Authentication: the WSL enrollment
expires under nine hours; re-enroll before any new release.

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

The failed-attempt receipts, observation reports and terminal checkpoints for the S114-S120 release
cycle (S114 attempts 1-2, S115 attempt 1, and the earlier Feature 2/3/4 candidates) are preserved
outside Git in the watcher state directory; none was relabeled as a pass. Their per-attempt detail was
retired from this file on 2026-09-18 and remains recoverable in Git history at d61eecf3.

## Authentication and watcher

Re-enroll the WSL CLI/ADC for josiah@pmikcmetro.com before any new release (observed longevity under
nine hours; owner-only enrollment). Run the native watcher with the snap gcloud on PATH
(/snap/google-cloud-cli/current/bin), never the interop Windows SDK, and never start a competing
watcher; authentication_required pauses only the dependent phase. The built-in browser pane holds no
app session and the release contract does not need it.

## Working checkout and evidence

Native checkout: ~/pmi-kc-work/main, synced from the Windows checkout by git fetch + checkout -B; logs
under ~/pmi-kc-work/logs/. The Windows checkout is the watcher source and the docs editing tree.
Credentials and customer evidence stay outside Git; failed-candidate diagnostics remain in the watcher
state directory.

## Preserved boundaries

Staff-recorded progress remains separate from provider receipts/signatures. Source writes retain exact
preview/confirmation, claims, receipts/readback and correction. Messages remain unsent drafts.
Completed S97-S100 proofs are not rerun. S106/S34 still requires actual forms/catalog/mappings,
managed Dotloop connection/selection and exact activation gates. Blank resource inputs remain accepted.
S100 resident-draft still needs exact mapped/verified input; S36 remains dependent. Other suites are out of scope.
