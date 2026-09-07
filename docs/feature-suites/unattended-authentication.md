<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: unattended-authentication -->

# S112 — Unattended authentication: pre-approved credentials for the runner

> Status: ACTIVE. The owner ruled on 2026-09-07 that authentication is pre-approved and never a
> reason to wait. The automated login sequence (`scripts/auth/ensure.mjs`, the two enrollment
> scripts, the canary session scripts, and the identity-preflight changes) is committed with
> fail-first tests and read back on both credential stores. The designated unattended identities do
> not exist yet: creating and enrolling them is the owner's one-time step `B-AUTH2` in
> `docs/open-blockers.md`. The remaining slices are listed under Dependencies.

**Goal.**

Any runner (Claude Code or Codex, unattended, in a fresh shell) obtains, refreshes, and uses every
credential the implementation loop needs without a person present and without asking: the Google
Cloud CLI and Application Default Credentials for cost-bearing gcloud and live Google reads, the
GitHub login for push and CI watch, the application's provider credentials in `.env.local`, and the
two signed-in browser sessions the promotion receipt run requires. A stale credential is a
self-repairing condition or one named human step, never an owner hold on unrelated work.

**Current state / intended end state.**

Verified on 2026-09-07:

- Every Google credential on this machine belongs to the owner's account `josiah@pmikcmetro.com`.
  The `pmikcmetro.com` Google Cloud session-control policy forces that account to reauthenticate
  interactively on its cadence (the `invalid_rapt` "reauth related error"); when it expires, every
  live read and every gcloud mutation stalls until the owner signs in again.
- Service-account keys are impossible and stay impossible: org policies
  `iam.disableServiceAccountKeyCreation` and `iam.disableServiceAccountKeyUpload` are enforced on
  `pmi-kc-kb-prod`, and the repository refuses key files in `scripts/preflight-identity.mjs`,
  `scripts/production-assurance-preflight.ts` (`assurance_key_file_forbidden`), and
  `scripts/release-candidate.mjs` (`presentIsFatal`). This suite does not ask to lift any of that.
- The Google client libraries read ADC only from each shell's own home store (no `CLOUDSDK_CONFIG`
  support), so the Windows store and the WSL store are enrolled separately. google-auth-library
  10.x and firebase-admin 13.x both parse an impersonated ADC file.
- The application session requires a Google-provider Firebase ID token with a verified
  `pmikcmetro.com` email and an `auth_time` under 12 hours, and issues an 8-hour host-only cookie
  (`lib/auth/session.ts`, `app/api/auth/session/route.ts`). A managed account with no role claim is
  an Editor. There is no custom-token or password sign-in path, and this suite adds none.
- The previous promotion recipe launched Windows Chrome from WSL with a `/mnt/c` profile path; a
  Windows process cannot read such a path and the recipe never ran. It is retired.

Committed login sequence (this slice):

- `npm run auth:ensure` (`scripts/auth/ensure.mjs`) probes gcloud CLI, library ADC, `.env.local`,
  GitHub CLI, and on request the canary browser sessions; repairs gcloud config drift without a
  browser; re-establishes canary sessions; and exits 0 or exits 2 naming one human step per blocked
  credential. Token probes discard stdout and read only the exit code; every detail is redacted.
- `npm run auth:enroll` (`scripts/auth/enroll.ps1`, Windows store) and `npm run auth:enroll:wsl`
  (`scripts/auth/enroll.sh`, WSL store) are the only interactive steps; the owner completes Google
  in a browser. `npm run auth:session` is the attended form of the Windows enrollment.
- `scripts/auth/canary-session.ts` re-establishes one canary's app session on one origin from its
  enrolled profile by driving the app's own "Sign in with Google" control; the only automated
  action on a Google page is selecting the expected account tile. `scripts/auth/enroll-canary.ts`
  is the headed, owner-completed enrollment of a profile.
- `scripts/preflight-identity.mjs` accepts the automation principal impersonating the automation
  service account and gains `--unattended`; `scripts/preflight-adc.mjs` names the unattended repair
  first.

Readbacks on 2026-09-07: the Windows store is attended-ready (gcloud, ADC, env, gh all `ok` as the
owner's managed account) and `--unattended` blocks on `npm run auth:enroll`; the WSL store's ADC is
fresh while its gcloud CLI credential needs the named attended re-enrollment; from a fresh profile
the canary script reached the candidate's sign-in page, drove the control, and stopped at Google's
identifier page with `human_required` and no input.

Intended end state: unattended work runs as a dedicated automation principal that never hits the
reauth policy, impersonating one least-privilege service account whose IAM bindings are the safety
boundary; the two canaries re-sign-in silently on any origin; every live script calls
`ensureAuthenticated` first; and no document says a person must sign in for unattended work.

**Actors and entry conditions.**

- Owner: performs the one-time setup in Appendix B and makes rulings R1-R7.
- Runner (Claude Code or Codex): uses `auth:ensure` unattended; builds the remaining slices.
- Automation principal `pmi-runner@pmikcmetro.com` and service account
  `pmi-kc-automation@pmi-kc-kb-prod.iam.gserviceaccount.com`: act; never sign into the app.
- Verification identities `canary-admin@pmikcmetro.com` and `canary-editor@pmikcmetro.com`: are
  signed in; never act.
- Live unattended behavior is blocked until the owner's setup exists; the committed scripts run in
  attended mode today.

**What it is / how it functions.**

1. Automation principal `pmi-runner@pmikcmetro.com`: a Cloud Identity user in a new organizational
   unit `Automation` whose Google Cloud session control never requires reauthentication and whose
   web session never expires. The owner signs it in once per store; with no reauth policy those
   logins stay valid until revoked. It holds one IAM grant: token creator on the automation service
   account.
2. Automation service account `pmi-kc-automation@pmi-kc-kb-prod.iam.gserviceaccount.com`: every
   gcloud, ADC, and API call runs as it through impersonation. Roles are owner-granted and fixed
   (Appendix B); project IAM admin, key admin, billing, org policy, Secret Manager admin, guardrail
   admin, and Identity Platform user administration are structurally absent. Audit logs record the
   principal as impersonator.
3. Verification canaries `canary-admin@` (Admin claim through the S83 access workflow) and
   `canary-editor@` (no claim, therefore Editor), each with one persistent profile enrolled once by
   the owner in the harness browser. Because their web sessions never expire, the runner re-signs
   them in on any origin without credentials. If Google asks for a human, the runner stops and
   names `npm run auth:enroll-canary` with the exact profile, origin, and email.
4. Workstation secrets: `.env.local` stays the source for the RentVine keys in this slice
   (`auth:ensure` checks presence only); a tracked template rendered from Secret Manager is a later
   slice (R4).
5. Runner-neutral mechanism: authority in `AGENTS.md` ("Authentication"), behavior in
   `scripts/auth`, mirrored by the tracked `.claude/settings.json` (allow-list and session-start
   hook) for Claude and by the owner's `~/.codex/config.toml` for Codex.

**In scope / out of scope.**

In scope: the identities above; `scripts/auth`; the identity preflights; the canary session and
enrollment; governance text; runner-local mirrors; later slices for the live-script wiring, the env
template, the IAM audit, the receipt-run integration, and the read-only canary claim.

Out of scope: credential entry by the runner; cookie or profile copying; lifting the key org policy;
changing the owner's own session policy; Dotloop consent; Workload Identity Federation; any change
to action keys, cost controls, the guardrail, or authorized domains beyond R6.

**Open questions & assumptions.**

Rulings the owner makes; each has a default the runner applies on "confirm":

- R1 Automation principal: dedicated `pmi-runner@pmikcmetro.com` in an `Automation` OU (default),
  versus relaxing session control for `josiah@`.
- R2 Canary identities: dedicated `canary-admin@` and `canary-editor@` (default), versus enrolling two
  staff members' profiles.
- R3 Read-only canary claim in `lib/auth/session.ts` (default: yes, in the candidate after the
  current one is promoted; protected path, this ruling is the owner direction).
- R4 Workstation secret source: Secret Manager through the automation identity plus a tracked
  template (default), versus a 1Password service account, versus the hand-edited `.env.local` of
  today.
- R5 The tracked `.claude/settings.json` allow-list and `SessionStart` hook (default: yes; shipped).
- R6 The runner may prune superseded `cand-*` authorized domains with readback (default: yes); the
  two `pmi-kc-kb-demo-*` hosts stay until the owner says otherwise.
- R7 Who creates the service account and grants IAM: the owner (default), or the runner only under
  this ruling in writing.

Assumptions, labelled and each proven before it is relied on:

- A1 The `invalid_rapt` reauth does not apply to an OU that never requires reauthentication
  (BEH-S112-1).
- A2 The assurance preflight sees the automation service account as the ADC principal (ARCH-S112-2
  live check).
- A3 Google completes the canaries' sign-in silently with a persistent session in the harness
  browser (BEH-S112-3). Fallback if Google flags the browser at enrollment: launch enrollment with
  the automation switch disabled, still with a human typing.
- A4 Cloud Identity Free is enabled for the org; otherwise three licensed users.
- A5 Identity Platform permissions `firebaseauth.configs.get` and `firebaseauth.configs.update`
  exist for the custom role.

**Cross-product impacts.**

- `AGENTS.md`: the Authentication section; Standing authority, Permanent safety boundaries,
  Protected paths, Execution loop, and Per-runner pointers amended.
- `docs/facts.md`, `docs/loop-state.md`, `docs/open-blockers.md`, `docs/environment-handoff.md`,
  `docs/auth-identity-and-access-strategy.md`, `docs/google-setup.md`,
  `docs/autonomous-agent-runner.md`, `docs/README.md`, `docs/feature-suites/README.md`, `SETUP.md`,
  `README.md`, `docs/status.md`, `docs/whats-next.md`, `docs/plan.md`.
- Scripts: `scripts/auth`, `scripts/preflight-identity.mjs`, `scripts/preflight-adc.mjs`,
  `package.json`; the interactive-only PowerShell session script is removed.
- Repository: `.claude/settings.json` (tracked), tests under `tests/unit`.
- Cloud and Workspace (owner, Appendix B): one OU, three users, one service account, one custom
  role, IAM bindings. No change to the runtime service account, secret bindings, budgets,
  guardrail, action keys, or authorized domains.
- The current candidate `pmi-kc-app-rmtq71kjl-bff41bbdb5fa` needs no new code to be assured and
  promoted; R3 ships in the following candidate.

**Authority and evidence map.**

| Input                                                                            | Classification                          | Use and limitation                                                                                                                                                                                |
| -------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Router, live readback, committed code/tests, `docs/facts.md`                     | Authority / implementation truth        | Key files are banned (org policy plus repository refusals); identities must be `pmikcmetro.com` or project service identities; protected paths need owner direction; every mutation is read back. |
| Owner's 2026-09-07 direction ("authentication is ok and pre-approved")           | Owner direction                         | Establishes the goal and the pre-approval; rulings R1-R7 turn it into exact governance. It does not authorize credential entry, key files, or a new identity until R1, R2, and R7 are confirmed.  |
| 2026-09-07 readbacks (org policies, service accounts, tools, `auth:ensure` runs) | Implementation truth for design choices | Rule out key-based designs; confirm the tooling the scripts assume (Appendix D).                                                                                                                  |
| Google session-control article referenced by the `invalid_rapt` error            | External policy reference               | Names the knob; the OU setting is proven by BEH-S112-1, not assumed.                                                                                                                              |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S112-1** — One entry point owns credential state. `scripts/auth/plan.mjs` exposes the pure
  `assessCredentials` whose output for a stale token, a drifted account, a missing `.env.local`, a
  logged-out `gh`, and an unsigned canary is exactly one of ok, a browser-free repair, or one human
  step (`tests/unit/auth-plan.test.mjs`, failing before the module existed). Remaining: every live
  script awaits `ensureAuthenticated` first, pinned by a source-scan test.
- **ARCH-S112-2** — Identity preflights accept exactly the designated identities.
  `scripts/preflight-identity.mjs` passes for the automation principal impersonating the automation
  service account, refuses any other service account, a personal account, a key file, and, under
  `--unattended`, an attended identity (`tests/unit/preflight-identity.test.mjs`). Live check
  against the assurance preflight once the identity exists.
- **ARCH-S112-3** — Secrets never cross a log. Token probes run with stdout discarded
  (`TOKEN_PROBE_STDIO`), and every status line passes through `redact`, which strips access,
  refresh, GitHub, 1Password, API-key, private-key, and bearer shapes (redaction test in
  `tests/unit/auth-plan.test.mjs`; static check in `tests/unit/auth-no-credential-entry.test.mjs`).
- **ARCH-S112-4** — A tracked `.env.local` template is the deploy configuration of record (R4;
  remaining).
- **ARCH-S112-5** — Browser and profile pairing is proven, not assumed. `scripts/auth/browser.ts`
  resolves one Linux browser under WSL (Google Chrome for Linux when installed, otherwise the
  installed Playwright Chromium), refuses a Windows executable with a POSIX profile path and the
  reverse (`browser_profile_pairing_invalid`), and requires an absolute profile outside the
  repository. Remaining: the assurance harness receives the same `PLAYWRIGHT_CHROME_PATH`.
- **ARCH-S112-6** — The automation service account's IAM is the enforcement of the safety
  boundaries; an audit reads the project policy and fails on any forbidden role (remaining).
- **ARCH-S112-7** — Canary sessions are recorded on the receipt as `google_session_reuse` with no
  secret (remaining; the session scripts already report method and role only).

**Behavior outcome (deterministic, fail-first).**

- **BEH-S112-1** — From a fresh WSL shell with the owner absent, `npm run auth:ensure --unattended`
  exits 0 at least 24 hours after enrollment with no browser opened (proof of A1). Today it exits 2
  naming `npm run auth:enroll:wsl` as the single human step (read back 2026-09-07).
- **BEH-S112-2** — The release wrapper deploys a zero-traffic candidate as the automation identity
  with no prompt, and Cloud Audit Logs show the service account as principal and `pmi-runner@` as
  impersonator (after Phase 0).
- **BEH-S112-3** — `scripts/auth/canary-session.ts` returns `signed_in` from an enrolled profile with
  no human present, and against a fresh profile returns `human_required` with the Google page and
  reason while performing no input on it. The fresh-profile half is proven on 2026-09-07 against
  the candidate origin; the enrolled half waits on Phase 0.
- **BEH-S112-4** — `npm run auth:ensure -- --need=canary` establishes both profiles on both origins
  before the receipt run, so B-AUTH2's human sign-ins are replaced by one enrollment.
- **BEH-S112-5** — Each blocked credential names exactly one human step: the platform's enrollment
  script for a Google login, `gh auth login` for GitHub, the missing keys for `.env.local`, and
  `npm run auth:enroll-canary` with profile, origin, and email for a canary
  (`tests/unit/auth-plan.test.mjs`).
- **BEH-S112-6** — With R3, a `canary` session renders Admin pages but every mutating route returns
  403 `canary_read_only` (remaining).
- **BEH-S112-7** — `docs/open-blockers.md` has no `B-AUTH*` row after the first unattended receipt
  run, and the current candidate's promotion completes runner-initiated.

**Human litmus outcome.**

### The runner never asks me to sign in again

**If this was built correctly:** The owner does a one-hour setup once (three accounts, one service
account, a few grants, three sign-ins). From then on, a runner started at any hour deploys,
verifies, and promotes without opening a browser on the owner's screen or writing "waiting on you to
authenticate". If something breaks, the runner's report names one command, and nothing else stops.

- Model verdict: PASS | FAIL - why: the attended and fresh-profile halves are proven on 2026-09-07;
  the unattended halves wait on the owner's setup.
- Human verdict: NOT RUN — no human observer (until the owner observes one full unattended cycle).

**Requirement-to-outcome traceability.**

| Requirement                                               | Architecture outcome     | Behavior outcome                   | Human litmus                              | Deterministic evidence / falsification                                    |
| --------------------------------------------------------- | ------------------------ | ---------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------- |
| No interactive Google reauth in unattended work           | ARCH-S112-2              | BEH-S112-1, BEH-S112-2             | The runner never asks me to sign in again | 24-hour token mint with prompts disabled; audit-log readback              |
| One self-repairing entry point every runner uses          | ARCH-S112-1              | BEH-S112-1, BEH-S112-5             | same                                      | `tests/unit/auth-plan.test.mjs`; live-script source scan (remaining)      |
| Promotion receipt runs without human sign-ins             | ARCH-S112-5, ARCH-S112-7 | BEH-S112-3, BEH-S112-4, BEH-S112-7 | same                                      | fresh-profile `human_required` proof; enrolled `signed_in` proof; receipt |
| Secrets never in Git or logs                              | ARCH-S112-3, ARCH-S112-4 | BEH-S112-5                         | same                                      | redaction and no-credential-entry tests; `verify:redaction`               |
| Runner cannot widen its own access or touch cost controls | ARCH-S112-6              | BEH-S112-5                         | same                                      | IAM audit (remaining)                                                     |
| Canaries verify but cannot act                            | ARCH-S112-7              | BEH-S112-6                         | same                                      | 403 `canary_read_only` (remaining)                                        |

**Preservation set.**

`bash scripts/verify.sh`; `tests/unit/preflight-identity.test.mjs` (personal-account and key-file
refusals stay); `tests/unit/production-assurance-preflight.test.ts`; the release wrapper tests;
`smoke:release-candidate`; the browser smokes; `monitoring:verify` READY; RentVine and Sheet live
reads unchanged.

**Adversarial acceptance checks.**

- **AC-S112-1** — Stale-credential handling: a stale or missing ADC is one enroll step, never a copied
  token or an opened browser (`tests/unit/auth-plan.test.mjs`).
- **AC-S112-2** — Identity exactness: `--unattended` refuses a person's account, a foreign service
  account, and any key file with distinct codes (`tests/unit/auth-plan.test.mjs`,
  `tests/unit/preflight-identity.test.mjs`).
- **AC-S112-3** — No credential entry: the static scan of `scripts/auth` finds no typing API, and the
  enrollment scripts read no password (`tests/unit/auth-no-credential-entry.test.mjs`).
- **AC-S112-4** — Receipt honesty: a canary session established by anything other than
  `google_session_reuse` on the exact origin is refused by the promotion preflight (remaining).
- **AC-S112-5** — IAM boundary: a forbidden role in a fake policy fails the audit (remaining).
- **AC-S112-6** — Template drift fails the template test (remaining).
- **AC-S112-7** — Read-only canary: with R3, the S97 confirm route, the S98 append route, the
  access-request apply route, and the session DELETE all return 403 for a canary session before any
  executor or writer is constructed (remaining).
- **AC-S112-8** — Documentation truth: no active document says a person must sign in for unattended
  work once Phase 0 completes, and `verify:context-freshness` passes.

**Forbidden actions / hard gates.**

- The runner never types, pastes, or submits a password, one-time code, passkey, recovery code, or
  CAPTCHA anywhere, and never copies cookies or a person's browser profile. `human_required` ends
  the step.
- No service-account key creation, upload, or use; the org policies and the repository refusals
  stay exactly as they are.
- The runner never edits the automation identities' IAM, OU, session policy, claims, or vault
  membership; it reads and reports. Creating them is Phase 0 (owner, or the runner only under R7).
- No use of `josiah@` or any staff account for unattended work; attended use still works and is
  reported as attended.
- Canary identities never confirm, draft, write, or appear as the actor of a product effect.
- Tokens, refresh tokens, cookie values, uids, and `.env.local` values never enter Git, logs,
  receipts, artifacts, or a report.
- Protected paths unchanged except `lib/auth/session.ts` for R3 under this ruling; `scripts/auth`
  joins the protected list.
- No action key opens or closes; no cost control moves; no send.

**Dependencies / sequencing.**

- Phase 0 (owner, once): Appendix B. Completion evidence is `B-AUTH2` in `docs/open-blockers.md`.
- Phase 1 (this slice, done): scripts, tests, governance text, runner-local mirror.
- Phase 2 (runner, after Phase 0): `auth:ensure --unattended` green on both stores; canary sessions
  on both origins; the receipt run for `pmi-kc-app-rmtq71kjl-bff41bbdb5fa`; promotion and
  observation; B-AUTH2 deleted.
- Phase 3 (runner): wire `ensureAuthenticated` into every live script; the env template (R4); the
  IAM audit; `PLAYWRIGHT_CHROME_PATH` and `canarySessions` in the assurance harness; the R3
  read-only canary claim behind a new candidate.
- Fast path for the 2026-09-09 call: once the canary users, the Admin claim, and two enrolled
  profiles exist, `npm run auth:ensure -- --need=canary` plus the existing receipt command promote
  the current candidate; no further code is needed.
- Later hardening, not in this suite: Workload Identity Federation from GitHub Actions so no
  long-lived refresh token exists on any machine.

**Standalone delivery contract.**

- **Deliverable now:** delivered: `scripts/auth`, the preflight changes, the tests, the governance
  text, and the runner-local mirror, green under `bash scripts/verify.sh`.
- **Consumes, but does not assume:** the three Workspace accounts, the service account and its
  IAM, the enrolled profiles; each absence is reported as one named `enroll` step, never guessed.
- **Externally blocked effect:** BEH-S112-1, 2, 4, 7 and the enrolled half of BEH-S112-3 stay
  `BLOCKED` until Phase 0 completes.
- **Produces for downstream suites:** `ensureAuthenticated` for every future live script;
  `canary-session` for S51/S54; the enrollment pattern for S106's Dotloop credentials.

**Verification and delivery contract.**

1. Record the baseline (Appendix D) and the failing state of the named checks before editing (done
   2026-09-07: two suites could not load and nine assertions failed before implementation).
2. Run the focused tests with `--maxWorkers=2`; keep the preservation set separate.
3. Run `bash scripts/verify.sh`; inspect the diff for any secret, token, uid, cookie, or customer
   value.
4. Report `ALL_GATES_GREEN` for a slice, `BLOCKED` on the exact Phase 0 item for any live behavior
   not yet provable, and never call the suite complete until BEH-S112-7 has happened once.

**Ordered prompt sequence.**

1. Re-verify the Appendix D readbacks and the code facts under Current state.
2. Materialize the failing checks for the next slice (live-script scan, template test, receipt
   schema, IAM audit against a fake policy, read-only canary routes).
3. Build the slice, run focused and canonical gates, commit and push.
4. Execute Phase 2 the moment Phase 0 is reported, with readbacks recorded in facts.

**Deletion/merge recommendation.**

Remove this suite from the active tree after BEH-S112-7 has occurred once, the IAM audit and
identity preflights are the enforcement, `docs/facts.md` carries F-AUTH-AUTOMATION with the exact
identities and readback dates, and `docs/environment-handoff.md` owns the enrollment and recovery
runbook.

---

## Appendix B — Phase 0 owner setup (once, about one hour)

Google Admin console (no CLI; the runner cannot and must not do these):

1. Directory > Organizational units: add `Automation` under the root.
2. Security > Access and data control > Google Cloud session control: for OU `Automation`, override
   the inherited policy so reauthentication is never required.
3. Security > Access and data control > Google session control: for OU `Automation`, web session
   duration "Session never expires".
4. Directory > Users: add `pmi-runner`, `canary-admin`, and `canary-editor` in OU `Automation`
   (Cloud Identity Free if enabled; otherwise a license each). Generate the passwords into the
   owner-only vault; complete each first sign-in and 2-Step Verification enrollment. Give none of
   them a Workspace admin role.

GCP (owner as `josiah@`, or the runner only under R7 in writing; every command is read back):

```bash
PROJECT=pmi-kc-kb-prod
SA=pmi-kc-automation@$PROJECT.iam.gserviceaccount.com
gcloud iam service-accounts create pmi-kc-automation --project=$PROJECT \
  --display-name="PMI KC unattended runner (impersonated by pmi-runner@)"
for ROLE in roles/run.admin roles/cloudbuild.builds.editor roles/artifactregistry.writer \
  roles/serviceusage.serviceUsageConsumer roles/logging.viewer roles/monitoring.editor \
  roles/datastore.user roles/secretmanager.viewer roles/aiplatform.user \
  roles/cloudscheduler.viewer roles/pubsub.viewer; do
  gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$SA --role=$ROLE --condition=None
done
gcloud storage buckets add-iam-policy-binding gs://${PROJECT}_cloudbuild \
  --member=serviceAccount:$SA --role=roles/storage.objectAdmin
for TARGET in pmi-kc-kb-runtime@$PROJECT.iam.gserviceaccount.com \
  558870356522-compute@developer.gserviceaccount.com; do
  gcloud iam service-accounts add-iam-policy-binding $TARGET \
    --member=serviceAccount:$SA --role=roles/iam.serviceAccountUser
done
gcloud iam service-accounts add-iam-policy-binding lease-renewal-reader@$PROJECT.iam.gserviceaccount.com \
  --member=serviceAccount:$SA --role=roles/iam.serviceAccountTokenCreator
gcloud iam roles create pmiIdentityPlatformConfig --project=$PROJECT --stage=GA \
  --title="Identity Platform config only" \
  --permissions=firebaseauth.configs.get,firebaseauth.configs.update
gcloud projects add-iam-policy-binding $PROJECT --member=serviceAccount:$SA \
  --role=projects/$PROJECT/roles/pmiIdentityPlatformConfig --condition=None
gcloud iam service-accounts add-iam-policy-binding $SA \
  --member=user:pmi-runner@pmikcmetro.com --role=roles/iam.serviceAccountTokenCreator
gcloud projects get-iam-policy $PROJECT --flatten="bindings[].members" \
  --filter="bindings.members:pmi-kc-automation OR bindings.members:pmi-runner" \
  --format="table(bindings.role,bindings.members)"
```

Finalize the role set by running the release wrapper and the readback scripts as the automation
identity, adding only the permission each refusal names; record the final set in F-AUTH-AUTOMATION.

Forbidden for the automation service account and `pmi-runner@` (the audit fails on any of these):
`roles/owner`, `roles/editor`, `roles/resourcemanager.projectIamAdmin`,
`roles/iam.serviceAccountAdmin`, `roles/iam.serviceAccountKeyAdmin`, `roles/iam.securityAdmin`, any
`roles/orgpolicy.*`, any `roles/billing.*`, `roles/secretmanager.admin`,
`roles/cloudfunctions.admin`, `roles/cloudfunctions.developer`, `roles/firebaseauth.admin`,
`roles/identityplatform.admin`, `roles/firebase.admin`, `roles/serviceusage.serviceUsageAdmin`.

Enrollment on this machine (the owner completes each Google sign-in; nothing is typed for them):

```bash
# Windows PowerShell, once: pmi-runner@ with impersonation, CLI and ADC
npm run auth:enroll
# WSL, once: the WSL store (the unattended path runs here)
wsl -e bash -lc 'cd /mnt/c/Users/josia/Documents/github-windows/pmiKCkb_and_ownerRouter && npm run auth:enroll:wsl'
# WSL, headed under WSLg, once per canary and per origin
wsl -e bash -lc 'cd /mnt/c/Users/josia/Documents/github-windows/pmiKCkb_and_ownerRouter && npm run auth:enroll-canary -- --profile=$HOME/pmi-assurance/canary-admin --origin=https://pmi-kc-app-kq6wuvpiva-uc.a.run.app --email=canary-admin@pmikcmetro.com'
wsl -e bash -lc 'cd /mnt/c/Users/josia/Documents/github-windows/pmiKCkb_and_ownerRouter && npm run auth:enroll-canary -- --profile=$HOME/pmi-assurance/canary-editor --origin=https://pmi-kc-app-kq6wuvpiva-uc.a.run.app --email=canary-editor@pmikcmetro.com'
# Then, unattended, from any fresh shell
wsl -e bash -lc 'cd /mnt/c/Users/josia/Documents/github-windows/pmiKCkb_and_ownerRouter && npm run auth:ensure -- --unattended --need=gcloud,adc,env,gh,canary --origins=https://pmi-kc-app-kq6wuvpiva-uc.a.run.app,https://cand-rmtq71kjl-bff41bbdb5fa---pmi-kc-app-kq6wuvpiva-uc.a.run.app --admin-profile=/home/josiah/pmi-assurance/canary-admin --editor-profile=/home/josiah/pmi-assurance/canary-editor'
```

After the first sign-in of `canary-admin@`, a current Admin applies the Admin role through the S83
access workflow; `canary-editor@` stays claim-less. Installing Google Chrome for Linux in WSL is an
owner step (`apt` needs sudo); until then the installed Playwright Chromium is the harness browser
and `auth:ensure` reports which one it used.

## Appendix C — Recovery runbook (each case ends in one command)

| `auth:ensure` reports                  | Cause                                             | Human step                                                                         |
| -------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| gcloud `blocked` stale token           | password change, admin revoke, OU policy reverted | check the OU policy, then `npm run auth:enroll` or `auth:enroll:wsl`               |
| gcloud `repaired`                      | active account or impersonation drifted           | none                                                                               |
| adc `blocked`                          | ADC missing or stale on this store                | the same enrollment script for this store                                          |
| canary `blocked: human_required <url>` | Google asked for a person on that profile         | `npm run auth:enroll-canary -- --profile=<path> --origin=<origin> --email=<email>` |
| env `blocked: missing <keys>`          | `.env.local` incomplete                           | add the named keys; never commit the file                                          |
| gh `blocked: logged out`               | token revoked                                     | `gh auth login`, or set `GH_TOKEN`                                                 |

## Appendix D — What was verified on 2026-09-07

- Effective org policies on `pmi-kc-kb-prod` (project number 558870356522):
  `iam.disableServiceAccountKeyCreation` enforced; `iam.disableServiceAccountKeyUpload` enforced.
- Service accounts present: `pmi-kc-kb-runtime`, `lease-renewal-reader`, `gmail-pubsub-push`,
  `firebase-adminsdk-fbsvc`, `budget-guardrail`, the App Engine default, and the compute default.
  No automation service account exists yet.
- Windows gcloud 2026.05.22 active account `josiah@pmikcmetro.com`, project `pmi-kc-kb-prod`; WSL
  snap gcloud active account `josiah@pmikcmetro.com` with a stale CLI credential and fresh ADC.
- `op` 2.33.1 on Windows, absent in WSL; `gh` logged in on both with `repo` and `workflow` scopes.
- WSL: Node 24.18.0; interop to `powershell.exe`; WSLg display present; Playwright Chromium 1228 and
  1234 installed (the `playwright-core` default path names an uninstalled 1223, so the resolver
  scans the cache); Windows Chrome present; no Linux Chrome yet.
- `auth:ensure` on Windows: attended READY; `--unattended` blocked on `npm run auth:enroll`;
  `--hook` one line, exit 0. `preflight:identity` passes attended and fails `--unattended` naming
  the enrollment.
- `canary-session` from a fresh profile against the candidate origin: `human_required` at
  `https://accounts.google.com/v3/signin/identifier`, reason "Google is asking for an email address;
  this profile holds no Google session", using `chromium-1234`.
