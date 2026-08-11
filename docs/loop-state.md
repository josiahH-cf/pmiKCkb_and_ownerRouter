# Loop State

Read `docs/facts.md` first. This is the short resume pointer; history is `docs/status.md`.

Last updated: 2026-08-11 (transcript app-plane implementation pushed; authentication checkpoint next).

```yaml
last_updated: 2026-08-11
active_program: S66_S68_TRANSCRIPT_IMPLEMENTATION
program_suites: S66-S68 (+amendments to S28, S34, S43, S60, S65; S64 remains unauthorized)
spec_writing_allowed: true
loop_execution_allowed: true
loop_commit_push_allowed: true
loop_deploy_allowed: true
provider_interleave_allowed: true
spec_package_status: COMPLETE
implementation_status: S28_S60_CURRENT_TRUTH_AND_S66_S67_S68_PUSHED
next_suite: AUTHENTICATION_UNBLOCK
next_spec: docs/auth-identity-and-access-strategy.md
session_auth_status: OWNER_CHECKPOINT_OPEN_INVALID_RAPT_ADC_NOT_WSL_DISCOVERABLE_FIREBASE_CLI_UNAUTHENTICATED
active_slice: NONE_EXTERNAL_OWNER_CHECKPOINT
next_slice: OWNER_RUN_AUTH_SESSION_THEN_WSL_ADC_FIREBASE_PRODUCT_AUTH_BAILEY_DEPLOY
last_completed_slice: S68_STAFF_WORK_ASSIGNMENT_AND_ACCOUNTABILITY_B883763
runtime_action_gates_preflipped: false
```

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
- **Next:** resume only the authentication-dependent readbacks, Bailey Admin action, and routine
  deployment after the owner completes the exact managed-account checkpoint below.
- **Authentication remains independently parked:** managed gcloud account/project are correct, but
  CLI token refresh is RAPT-walled; Windows ADC has safe authorized-user/quota-project metadata but
  WSL default ADC is absent; Firebase CLI reports unauthenticated during emulator startup. Owner runs
  `npm run auth:session` in Windows PowerShell as `josiah@pmikcmetro.com`, with no `--scopes`; only
  after confirmation may the runner create the exact WSL ADC symlink and rerun each preflight.

## Prior renewal-proof evidence

S57–S63 and S65 remain complete; the D08 cohort window, resolved owner values, source measurements,
superseded MKD premise, and exact owner steps live in `docs/facts.md` and `docs/status.md`. Do not
re-ask them or treat this shorter current pointer as superseding that evidence.

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

**S57–S61 are DONE** (`F-PORTFOLIO-COMPLETE-READS` `fb57e0b`; `F-LEASE-DATA-CURRENCY` `79b820d`;
`F-RENTCAST-ACTIVATION-HARDENED` `0283773`, DEPLOYED, revision `pmi-kc-app-rmsi5llfz-8332ff9656c8`,
checkpoint `F-CURRENT-SERVING-CHECKPOINT-2026-08-06`; `F-COMP-PERSISTENCE-TRUTH` `e83f876`;
`F-RECIPIENT-FANOUT-SEPARATION` `b8e26f3`): complete paged reads (owner email 305/305, 146/305
multi-owner), the three-age currency contract with refusals on expired, the RentCast comp basis
with cache/quota-stop/health-probe and rollback proven, provider-basis persistence + the internal
10% signal, and owner-channel fan-out with structural channel separation. Known-red carried:
`test:e2e:core` fails 8 PRE-EXISTING demo-mode tests on main (`Q-E2E-DEMO-LANE-RED`). **OWNER STEP
OPEN (`Q-RENTCAST-ACCOUNT-403`)**: activate the RentCast API plan, read back the allowance
(AC-S59-14), re-run `npm run smoke:rentcast-comp`; the parked D12 flip patch
(`docs/temp/rentcast-gate-flip-d12-patch.md`) waits on that smoke evidence.

**S62 is DONE** (`F-OWNER-POLICY-PRICING`, `a1fc024`): owner-policy pricing rules keyed on
`portfolioID` (MKD = 27), Admin-only with reason + append-only audit, the policy number through
the UNCHANGED S29 approval plane with the comp median rendered beside it, stale on rule change,
sentinels forbidding any offered-rent write or outreach skip (falsified red/green). Parked D12
patch: `docs/temp/s62-firestore-rules-explicit-deny-d12-patch.md` (legibility-only; never push).

**S63 MACHINERY is DONE** (`F-TESTSET-MACHINERY`): create-only frozen baselines with a sha256
tamper witness (immutability sentinel completed to its AC-S63-3 full form and falsified),
append-only evidence records with blind-vs-informed ordering, the activity trail's first reader,
verdict logic with `not_evaluated` first-class at the decided max(±5%, $50) tolerance, the
records-generated report (writes only under gitignored `temp/test-set/`), and the corrected +
pinned transactional-send prose. **The D08 window is OPEN** (`F-TESTSET-WINDOW-OPENED`, 2026-08-07):
four sha256 baselines captured, immutability falsified by a refused re-capture, report generated
under gitignored `temp/test-set/`. Parked D12 patch: `docs/temp/s63-firestore-rules-d12-patch.md`.

**S65 is DONE** (`F-FEEDBACK-CLOSURE`): the Admin-only, audited feedback status transition, the
panel control, the pinned resolved-exclusion (falsified), and the walkthrough copy fix.

**THE PROGRAM IS COMPLETE** at the machinery level (S57–S63 + S65; S64 stays unauthorized), and
S60–S63 + S65 are DEPLOYED (`F-CURRENT-SERVING-CHECKPOINT-2026-08-07`, rollback proven both ways).
What remains is owner-only: (1) RentCast plan activation (`Q-RENTCAST-ACCOUNT-403`) + allowance
readback + `smoke:rentcast-comp`; (2) the parked D12 patches under `docs/temp/`; (3) the D57 note
send; (4) promote Bailey to Admin (`F-BAILEY-ADMIN-2026-08-06`; effective on her next sign-in).

**Correction note: DONE 2026-08-06** — the owner sent
`docs/temp/client-correction-note-2026-08-06.md`. Do not re-send it.

**Environment note:** `node_modules` in the primary tree is installed for linux-x64, so `tsx` scripts
fail in the Windows shell. Run them through WSL. The former instruction to export
`GOOGLE_APPLICATION_CREDENTIALS` is stale and conflicts with the managed identity preflight; keep
that variable unset. After the owner completes `npm run auth:session`, verify the Windows ADC safe
metadata and bridge normal WSL ADC discovery with the exact symlink described in
`docs/auth-identity-and-access-strategy.md`. Do not run `npm ci` on Windows.
