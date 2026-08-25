# Loop State

Read `docs/facts.md` first. This is the short resume pointer; history is `docs/status.md`.

Last updated: 2026-08-25 (human audit CLOSED 12/12 terminal; S70/S71 built; HV-004/HV-011 built).

```yaml
last_updated: 2026-08-23
active_program: S66_S68_TRANSCRIPT_IMPLEMENTATION
program_suites: S66-S68 (+amendments to S28, S34, S43, S60, S65; S64 remains unauthorized)
spec_writing_allowed: true
loop_execution_allowed: true
loop_commit_push_allowed: true
loop_deploy_allowed: true
provider_interleave_allowed: true
spec_package_status: COMPLETE
implementation_status: S28_S60_CURRENT_TRUTH_AND_S66_S67_S68_DEPLOYED
next_suite: NONE_TRANSCRIPT_PROGRAM_COMPLETE
next_spec: NONE
session_auth_status: GREEN_MANAGED_WINDOWS_CLI_ADC_WSL_ADC_FIREBASE_RUNTIME_END_USER_CONFIG_BUILD
active_slice: NONE_PROGRAM_COMPLETE
next_slice: NONE
last_completed_slice: PRODUCTION_DEPLOY_PMI_KC_APP_RMSOL14WB_9FE02E7AF754
runtime_action_gates_preflipped: false
human_audit_status: IN_PROGRESS_2_PASS_10_NOT_RUN
human_audit_next_item: HV-002_MANAGED_GOOGLE_SIGN_IN_OPEN_WAITING
human_audit_auth_status: BROWSER_APP_SIGN_IN_REQUIRED_MANAGED_CLI_ADC_GREEN
human_audit_effect_in_flight: false
human_audit_launcher: docs/meta-prompts/pmi-kc-human-verification-resume.md
```

## Active human-verification continuation — 2026-08-23

- Resume artifacts: `docs/pmi-kc-human-verification-resume-state.md`,
  `docs/pmi-kc-human-audit-response-20260817T104500Z-model-audit.json`, and
  `docs/meta-prompts/pmi-kc-human-verification-resume.md`.
- Progress: 2/12 Pass (`HV-001`, `HV-012`); 10 `not_run`; no Fail, Blocked, or Skipped result.
- Exact next item: HV-002 target selection. The 2026-08-23 restart preserves 2 Pass / 10 `not_run`.
  Fresh non-printing readback proves managed CLI and ADC are current, and the exact serving revision,
  Production + Live descriptor, managed domain, runtime identity class, and Demo-auth-off state are
  unchanged. No conflict judgment, resolution request, provider write, or product effect occurred.
- HV-002 session: a candidate Reason-entry Pass is rejected because contemporaneous readback shows
  Production `/sign-in`; unsaved form state is treated as lost. Managed CLI/ADC and Production
  project remain green. The next action is one `Sign in with Google` click, stopping at the Google
  popup; workflow controls remain untouched.
- Cleanup: the HV-001 deletion-protected backup remains authorized rollback state through audit
  closure. No external operation is in flight.
- Scope: this continuation writes audit/specification documentation only. It does not implement,
  commit, deploy, send, authorize a provider write, or change a protected path.
- Cadence: one atomic human action per brief visit; persist response/resume/spec state before yielding,
  then end cleanly. No terminal, browser-control attachment, browser process, or local server is kept
  alive merely to bridge the user's absence. Each prompt uses the detailed S69 action card: numbered
  prepared state, exact control/location and safe input guidance, expected/stop/cleanup states, then
  copy-ready `PASS` or `FAIL — reason` responses.

## Authority

- The Renewal Proof Program Authorization in `AGENTS.md` (owner, 2026-08-06) opens S57–S63, scoped to
  the four-lease test set, RentCast, recipient handling, and owner-policy rules.
- S64 is specified and **not authorized**: it falls outside all four scope items and needs an
  explicit grant extension naming it. The owner DID settle its design question (per person), recorded
  as `F-APPROVAL-RELAXATION-AXIS` independently of the spec.
- S65 is authorized narrowly by the owner's direct instruction to add feedback closure.
- All prior grants stand unchanged: D05 deploy, D12 protected paths, the Cloud Automation Grant, the
  S52 ceiling (alert `$25`, hard stop `$100`), D33 draft-only notice initiation.
- Activation remains per exact Action Registry key, never by category or inference.

## Current transcript implementation resume — 2026-08-11

- Owner session authorization opens authentication-unblock work, S66–S68 implementation, the
  affected S28/S34/S43/S60/S65 amendments, verification, push, and routine deployment under the
  existing standing gates. It does not open S64 or any D12 push, send, unconfirmed system write,
  personal identity, guessed provider/content value, or lowered control.
- S28/S60 current-truth amendment is pushed at `26422ca`: current visible/behavioral legacy market
  dependency removed; bounded legacy value read compatibility remains neutral and URL-free.
- S66 is pushed at `9f9ec55` (`F-LEASE-DOCUMENT-PACKET-TRUTH`): deterministic packet truth,
  immutable snapshots, S43 presentation, and exact S34 binding are built. Exact external content
  blocker: publish the approved artifact/field/participant/signature/form-family/rule catalog through
  S21. Boom is not a document-fact source on current evidence. Dotloop activation remains separate.
- S67 is pushed at `77c757c` (`F-FEEDBACK-DICTATION-INTAKE`): optional feedback dictation reuses the
  recorder and configured Google STT seam, appends editable text without truncation, aborts/discards
  raw audio on every exit, and leaves the S65 report shape/lifecycle unchanged.
- S68 is pushed at `b883763` (`F-WORK-ACCOUNTABILITY`): app-owned tasks, explicit user-started work
  sessions, factual My work/Admin Team work surfaces, idle/correction/expectation/concurrency truth,
  and the 12-month retention contract are built without provider actions, content surveillance, or
  HR inference.
- Authentication is unblocked (`F-AUTH-UNBLOCKED-2026-08-11`): managed Windows gcloud CLI and ADC
  tokens are fresh; WSL discovers the exact Windows ADC through a non-copying symlink with
  `GOOGLE_APPLICATION_CREDENTIALS` unset; the managed Windows gcloud/Firebase stores are usable from
  WSL through their explicit config roots; provider/domain/runtime/build identity readbacks passed.
- Bailey's authorized Admin action is complete (`F-BAILEY-ADMIN-COMPLETE-2026-08-11`): one exact
  managed roster match has the Admin claim, an audited Admin-surface transition, and a later sign-in.
- S28/S60 plus S66-S68 are deployed on `pmi-kc-app-rmsol14wb-9fe02e7af754` at 100% traffic
  (`F-CURRENT-SERVING-CHECKPOINT-2026-08-11`). Exact-candidate and stable smoke passed; rollback to
  `pmi-kc-app-rmsisg7di-1f914cfeae0d` and forward restoration were executed and read back.
- The model-assisted process audit of this revision is finalized (`F-MODEL-PROCESS-AUDIT-2026-08-17`):
  180/180 terminal, 49 findings, 12 human-only checks, zero residue, two fixes landed. Bridge and
  human handoff: `docs/pmi-kc-model-audit-run-2026-08-17.json` plus its sibling HTML.
- **Next:** no dependency-independent transcript-program work remains; S66's approved-artifact catalog
  and Dotloop activation stay named external dependencies. Top audit follow-ups: retire the residual
  demo-lane Production records (owner-gated) and deploy the parked responsive fix.

## Prior renewal-proof evidence

S57–S63 and S65 remain complete. Their D08 window, resolved owner values, measurements, superseded MKD
premise, and exact owner steps live in `docs/facts.md` and `docs/status.md`; this shorter pointer never
supersedes that evidence, so do not re-ask it.

## Locked safety

- No autonomous, scheduled, bulk, or model-triggered client-facing send.
- Renewal and maintenance notice initiation stays draft-only under D33.
- Nothing in this program sends to an owner or a resident.
- No guessed endpoint, record URL, identity, or customer value.
- No personal account in an auth path; managed organization or service identities only.
- No secret, token, PII, Gmail body, customer content, or photo in git or evidence.
- The RentCast key lives in Secret Manager only; never a file, command line, log, or fixture.
- D12 protected changes (the RentCast `production_allowed` flip, new `firestore.rules` declarations,
  any `lib/auth/**` edit) are prepared and surfaced, never pushed.

## Resume

**Fresh-context launcher:** `docs/meta-prompts/renewal-proof-unattended-loop.md`. Hand that whole file
to a new session to run this program unattended.

**2026-08-25:** Human audit CLOSED, 12/12 terminal. S70/S71 built; HV-004 credential entry removed;
HV-011 finalization relaxed. Open builds: HV-010 property overrides, HV-007/HV-009 reversal controls.

**Renewal-proof status:** S57–S63 and S65 are complete at the machinery level; S64 remains
unauthorized. Verified evidence, commits, deployment/rollback proof, D08 state, and the known core-E2E
red live in `docs/facts.md` and `docs/status.md`. Owner-only work remains the RentCast plan activation
and allowance readback plus `smoke:rentcast-comp`, the named parked D12 patches, and the D57 note send.
Bailey's Admin action is complete. The 2026-08-06 correction note was sent; do not re-send it.

**Environment note:** `node_modules` in the primary tree is installed for linux-x64, so `tsx` scripts
fail in the Windows shell. Run them through WSL and keep `GOOGLE_APPLICATION_CREDENTIALS` unset. WSL
ADC uses the verified exact symlink; gcloud CLI and Firebase CLI use the explicit managed Windows
config roots documented in `docs/auth-identity-and-access-strategy.md`. Do not run `npm ci` on
Windows.
