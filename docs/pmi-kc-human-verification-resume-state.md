# PMI KC human-verification resume state

This is the canonical bodyless checkpoint for resuming the human continuation of model-audit run
`20260817T104500Z-model-audit`. Update this file and the sibling human-response JSON after every
human response or interruption. It is a recovery pointer, not implementation authority.

```yaml
schema_version: pmi-kc-human-verification-resume.v1
checkpointed_at: 2026-08-23T10:55:05Z
audit_status: COMPLETE_12_OF_12_TERMINAL
human_total: 12
human_pass: 5
human_fail: 1
human_blocked: 6
human_skipped: 0
human_not_run: 0
terminal_ids: ALL_TWELVE
  - HV-001
  - HV-002
  - HV-003
  - HV-004
  - HV-005
  - HV-006
  - HV-007
  - HV-008
  - HV-009
  - HV-010
  - HV-011
  - HV-012
next_id: NONE_AUDIT_CLOSED
next_state: OWNER_ANSWERED_ALL_SEVEN_2026-08-25_REMAINING_WORK_IS_BUILD
effect_in_flight: false
authentication_state: BROWSER_APP_SIGNED_IN_2026-08-24_SESSION_EXPIRES_UNATTENDED
browser_control_mode: REPOSITORY_DRIVEN_CHROME_POPUP_ALLOWING_FB-HVSESSION-012
browser_target_state: CHROME_AUTHENTICATED_ADMIN_TARGET_VERIFIED_THEN_CLOSED_CLEAN
custom_browser_controller_allowed: true
custom_browser_controller_authority: FB-HVSESSION-012_OWNER_SUPERSEDE_2026-08-24
unattended_run_mode: ONE_OWNER_SIGN_IN_THEN_UNATTENDED
unattended_effect_authority: NONE_ALL_THREE_FALSIFIED_FB-HVSESSION-014
unattended_send_authority: NONE_HV008_REFUSED_D33
unattended_evidence_mode: BODYLESS_ALLOWLIST_ONLY_NO_SCREENSHOTS
interactive_auth_session: ALLOWED_WHEN_USER_PRESENT_AND_INTERACTABLE
human_prompt_format: ACTION_CARD_V2_EXACT_NUMBERED_COPYABLE
human_response_grammar: PASS_OR_REASONED_FAIL
application_changes_allowed_in_audit: false
audit_lane_tooling_allowed: true
prepared_verification_id: NONE
prepared_route: NONE
prepared_action: NONE_AUDIT_CLOSED
prepared_effect: NONE_NO_EFFECT_IN_FLIGHT
prepared_runtime_revision: pmi-kc-app-rmsol14wb-9fe02e7af754
```

## Controlling artifacts

- Human HTML: `docs/pmi-kc-model-assisted-process-validation-audit-2026-08-17.html`.
- Model bridge: `docs/pmi-kc-model-audit-run-2026-08-17.json`.
- Control plane: `docs/pmi-kc-model-audit-spec-2026-08-17.json`.
- Human response: `docs/pmi-kc-human-audit-response-20260817T104500Z-model-audit.json`.
- Feedback index: `docs/pmi-kc-human-verification-feedback-traceability-2026-08-19.md`.
- Specifications: S56
  (`docs/feature-suites/production-live-only-test-lane-retirement.md`) and S69
  (`docs/feature-suites/human-verification-session-and-evidence-reliability.md`).
- Paste-ready resume launcher: `docs/meta-prompts/pmi-kc-human-verification-resume.md`.
- Owner batch packet (7 decisions, awaiting answers): `docs/pmi-kc-human-audit-owner-batch-packet-2026-08-24.md`.

The 2026-08-11 comprehensive HTML is historical and must not replace the 2026-08-17 model-assisted
HTML. At this checkpoint no newer completed audit or human-response JSON existed in the repository.
Recheck that claim at every resume.

## Terminal human results

- **HV-012 — Pass.** Managed-domain Admin, exact audit-window separation, protected routes, serving
  revision, Production + Live descriptor, and Demo-auth-disabled state were verified. A dedicated
  profile was used as an ad hoc technique in that visit; it is historical evidence, not the resume
  architecture. The session is stale and does not carry into a new visit.
- **HV-001 — Pass.** The owner exact-confirmed 78 records at
  `sha256:d508ece8e389366f41df1c33c55dc7449e4da604fb5fcfe43215156b4cbb3786`.
  Backup/hash/restore proof passed, all 78 update-time-CAS deletes read back absent, an independent
  process found 0/78 and zero governed markers, and the four application surfaces reconciled. The
  deletion-protected backup `s56-test-retirement-20260819-hv001-1210` remains the authorized rollback
  source through the audit window. Its later deletion is a separate exact-confirmed cleanup.

The detailed bodyless evidence, friction, and next actions are in the human-response JSON. Do not
downgrade or replay either Pass unless its dependency, evidence, deployment, or explicit human
feedback materially changes.

## Exact next checkpoint

HV-002 remains `not_run`. On 2026-08-19 the facilitator opened `/lease-renewal/live` read-only and
observed 20 unresolved High `Current rent` conflict cards, with no resolution displayed on the first
card and no request or effect. It centered the first card and asked the user whether it was genuine
normal-course work. The user did not answer that question; therefore no target was selected and no
resolution, write-back authorization, provider effect, or source-system write occurred.

That observation is stale and is not current runtime truth. After fresh authentication and deployment
readback, reproduce only the safe bodyless starting state. The next human action is one judgment:
whether the first visible conflict is a real item the user already intended to resolve. Do not press
Resolve or prefill a value/reason before that answer. If the card does not identify enough context,
record the friction instead of manufacturing a decision.

## Prepared no-effect checkpoint — 2026-08-23T08:20:26Z

- The user requested a fresh recontextualization and authentication checkpoint. Repository and
  response reconciliation still prove 2 Pass / 10 `not_run`, with HV-002 next and no product effect
  or external operation in flight.
- Fresh non-printing preflights show the managed local account and Production-project selections are
  still correct, while both the CLI token and ADC are stale with `invalid_rapt`. No token, credential,
  cookie, or raw OAuth URL was written to chat or audit evidence.
- Normal in-app computer control failed initialization, then failed once more after its required
  reset, at the named bodyless blocker `IN_APP_BROWSER_CONTROL_UNAVAILABLE`. No custom browser,
  profile, port, process, CDP, or Playwright fallback was used.
- The session-auth runner failure and false-positive READY state are recorded as
  `FB-HVSESSION-009`/`FB-HVSESSION-010` and specified by S69 `AC-S69-21`/`AC-S69-22`. The current
  WSL wrapper cannot locate bare `powershell.exe`; the approved Windows script and runtimes remain
  present. The unchanged `npm run auth:session` command is now running in a dedicated visible owner
  Windows shell. Its Google authentication window requires human control; no credential, MFA value,
  token, cookie, or raw OAuth URL was inspected or captured for audit evidence.
- The one prepared human action is to complete the managed Google authentication flow and stop when
  the visible terminal reaches `READY` or `NOT READY`. The facilitator will independently rerun CLI
  and ADC checks and close the temporary shell before any deployment or browser readback.
- After the user asked the facilitator to launch the browser/command, process readback proved the
  first prepared Windows shell was idle and had not started an authentication child. That exact
  audit-created shell was closed, and the unchanged authenticator was relaunched as the new visible
  shell's startup command. The shell is running and its terminal is queued in the Codex bottom panel;
  any Google credential or MFA interaction remains exclusively human-controlled.
- After authentication, the exact workflow checkpoint remains one direct
  `/lease-renewal/live` route acquisition. `FB-HVSESSION-011` / S69 `AC-S69-23` remains specified;
  no D12 auth-path implementation occurs in this audit.
- No product operation, workflow effect, provider write, or source-system change is in flight. The
  HV-001 deletion-protected backup remains the authorized rollback source through audit closure.

## Prepared no-effect checkpoint — 2026-08-23T09:07:42Z

- Fresh non-printing checks now prove the managed CLI and ADC tokens are current, the active project
  is Production, and no personal identity is in the checked path. The earlier authentication wait is
  resolved; no raw identity, token, credential, cookie, or OAuth URL entered audit evidence.
- Fresh Cloud Run readback proves `pmi-kc-app-rmsol14wb-9fe02e7af754` still serves 100% of
  `pmi-kc-app` traffic with a managed runtime identity, Production + Live descriptor, the managed
  allowed domain, and both Demo-auth controls off.
- The exact Production `/lease-renewal/live` route and the local 2026-08-17 audit HTML were launched
  in the normal Windows browser at the user's explicit request. A browser process is present, but a
  process is not authentication, route, DOM, or saved-state evidence.
- Codex's normal in-app computer control again failed initialization and its required reset/retry at
  `IN_APP_BROWSER_CONTROL_UNAVAILABLE`. No custom CDP, Playwright, profile, PID, or port controller
  was attached. The queued Codex browser tab and the externally launched normal browser are not
  treated as a supported controlled target until normal control exposes one.
- The one next action is to expose the exact Production tab as a supported browser target. Until its
  origin, path, managed Admin session, and visible first conflict are bodylessly read back, no
  `HV-002` judgment or workflow control is authorized.
- No product operation, workflow effect, provider write, or source-system change is in flight. The
  HV-001 deletion-protected backup remains the authorized rollback source through audit closure.

## Prepared no-effect checkpoint — 2026-08-23T09:19:05Z

- The user replied `pass`, but the contemporaneous bodyless in-app browser readback showed the
  Production origin at pathname `/`, not the required `/lease-renewal/live`. The candidate Pass is
  therefore a failed setup action, not an `HV-002` result; totals remain 2 Pass / 10 `not_run`.
- A normal Codex request to open the exact Production route queued instead of navigating the visible
  tab. Normal Computer Use again failed before initialization at
  `IN_APP_BROWSER_CONTROL_UNAVAILABLE`; no custom CDP, Playwright, profile, PID, port, or browser
  controller was attached.
- The one prepared human action is to enter the exact Production `/lease-renewal/live` URL in the
  existing in-app browser and report whether the resulting pathname is exactly
  `/lease-renewal/live`. This is read-only target acquisition; no Resolve, Skip, source, value,
  reason, or confirmation control is part of the action.
- No product operation, workflow effect, provider write, or source-system change is in flight. The
  HV-001 deletion-protected backup remains the authorized rollback source through audit closure.

## Prepared no-effect checkpoint — 2026-08-23T09:33:03Z

- The user replied `pass` to the route-correction action, and contemporaneous bodyless in-app browser
  readback corroborated the exact Production origin and pathname `/lease-renewal/live`. This closes
  route acquisition only; `HV-002` remains `not_run` and totals remain 2 Pass / 10 `not_run`.
- Two in-app browser tabs are present, but tab count and route alone do not establish managed Admin
  state, saved HTML state, current DOM contents, or the first visible conflict. Normal Computer Use
  again failed before initialization at `IN_APP_BROWSER_CONTROL_UNAVAILABLE`; no custom browser
  controller was attached.
- The one prepared human action is the required read-only judgment on the first visible unresolved
  conflict: determine only whether it is genuine normal-course work already intended for resolution.
  If the page instead shows sign-in, access denial, the Desk, no unresolved conflict, or an unclear
  first card, stop and report that reason. Do not click Resolve, Skip, or any source, value, reason,
  or confirmation control.
- No product operation, workflow effect, provider write, or source-system change is in flight. The
  HV-001 deletion-protected backup remains the authorized rollback source through audit closure.

## Prepared no-effect checkpoint — 2026-08-23T09:41:59Z

- The user affirmatively judged the first visible unresolved conflict to be genuine normal-course
  work already intended for resolution. This selects the operational target without recording a
  resolution, authorizing write-back, or changing either source system; `HV-002` remains `not_run`.
- Current implementation exposes three bodyless resolution-kind labels: `Pick a source`,
  `Enter a corrected value`, and `Flag is wrong / sheet is right`. Selecting one only changes local
  form state; the POST is not issued until a later Resolve/Save action and High/Blocked work has a
  separate confirmation dialog.
- Normal Computer Use again failed before initialization at
  `IN_APP_BROWSER_CONTROL_UNAVAILABLE`. No custom controller was attached and no current customer
  value, address, resident, provider payload, or authentication material entered durable evidence.
- The one prepared human action is to choose the intended option in the first card's `Resolution`
  dropdown and stop. Do not choose a source, enter a corrected value or reason, click Resolve/Save,
  confirm a dialog, approve write-back, or execute a provider effect.
- No product operation, workflow effect, provider write, or source-system change is in flight. The
  HV-001 deletion-protected backup remains the authorized rollback source through audit closure.

## Prepared no-effect checkpoint — 2026-08-23T09:48:19Z

- The user returned a bare candidate Pass and said the site updated based on “dropdowns / toggles.”
  Exact in-app browser readback still corroborates `/lease-renewal/live`, but the response did not
  identify which required `Resolution` option is selected and the plural wording leaves it unclear
  whether only the permitted control changed.
- The candidate remains nonterminal. It does not establish a chosen resolution kind, a saved
  resolution, a request outcome, write-back authorization, or a source-system effect; `HV-002`
  remains `not_run` and totals remain 2 Pass / 10 `not_run`.
- The one prepared human action is a read-only label report without touching the page: name the exact
  currently selected `Resolution` label, or report that another control also changed. Do not include
  a source/value, rent, address, resident, reason, provider payload, or authentication detail.
- No product operation, confirmed request, provider write, or source-system change is in flight. The
  HV-001 deletion-protected backup remains the authorized rollback source through audit closure.

## Prepared no-effect checkpoint — 2026-08-23T09:52:48Z

- An ephemeral user-supplied current-page image bodylessly corroborated the allowlisted form state:
  `Resolution` is `Enter a corrected value`, `Reason code` is `A source is out of date`, both required
  text fields remain empty, `Resolve` is available, and no confirmation dialog is open. The image,
  its path, and every customer value visible in it are not retained or cited as audit evidence.
- The reason-code choice was an extra local selection beyond the one-action Resolution checkpoint.
  The user said the shown state looks right, so both allowlisted selections are preserved as current
  intended form state instead of being undone. The procedural overrun is recorded; it did not issue
  a request or create an app, provider, write-back, or source-system effect.
- `HV-002` remains `not_run` and totals remain 2 Pass / 10 `not_run`. The next action is one field
  entry: transfer the authoritative operational value into `Corrected value` without reproducing it
  in chat, then stop without touching `Reason`, `Resolve`, `Skip`, confirmation, or write-back.
- No product operation, confirmed request, provider write, or source-system change is in flight. The
  HV-001 deletion-protected backup remains the authorized rollback source through audit closure.

## Prepared no-effect checkpoint — 2026-08-23T09:56:03Z

- The user returned `pass` for the one-field `Corrected value` entry. Exact ambient route readback
  still corroborates `/lease-renewal/live`; the value itself is neither requested in chat nor stored
  in audit evidence. This accepts a nonblank local-field checkpoint only, not value correctness or a
  submitted resolution.
- No click on `Resolve`, `Skip`, confirmation, approval, or provider execution is inferred. No modal,
  saved-result, network-request outcome, write-back authorization, or source-system change is
  claimed; `HV-002` remains `not_run` and totals remain 2 Pass / 10 `not_run`.
- The one prepared human action is to enter the real plain-English operational rationale in `Reason`
  and stop without submitting. The rationale must come from the user's normal-course decision and
  must not be reproduced in chat or durable audit evidence.
- No product operation, confirmed request, provider write, or source-system change is in flight. The
  HV-001 deletion-protected backup remains the authorized rollback source through audit closure.

## Prepared no-effect checkpoint — 2026-08-23T10:55:05Z

- The user returned `pass` for the `Reason` entry, but contemporaneous in-app browser readback showed
  Production `/sign-in`, not `/lease-renewal/live`. The candidate Pass is rejected as a session-loss
  interruption rather than an `HV-002` result; the unsaved Resolution, reason-code, corrected-value,
  and reason form state is treated as lost until safely reacquired and re-entered.
- Fresh non-printing preflights prove the managed account selection, Production project, CLI token,
  and ADC token are current. Only the browser-app session requires authentication. No raw identity,
  token, credential, cookie, OAuth URL, or customer value entered audit evidence.
- Normal Computer Use again failed before initialization at
  `IN_APP_BROWSER_CONTROL_UNAVAILABLE`; no custom controller was attached and authentication will not
  be automated. Current implementation exposes `Sign in with Google`, requests account selection,
  and returns a completed session to `/`, so the exact review route must be reacquired afterward.
- The one prepared human action is to click `Sign in with Google` and stop when the Google popup or
  account chooser appears. Do not select an account, enter credentials, dismiss a warning, or touch
  any workflow control in this action.
- No product operation, confirmed request, provider write, or source-system change is in flight. The
  HV-001 deletion-protected backup remains the authorized rollback source through audit closure.

## Prepared no-effect checkpoint — 2026-08-24 unattended run

- Managed CLI and ADC are current (`preflight:adc` OK, account `josiah@pmikcmetro.com`, project
  `pmi-kc-kb-prod`). Cloud Run readback proves `pmi-kc-app-rmsol14wb-9fe02e7af754` still serves 100% of
  traffic with `ENVIRONMENT_KIND=production`, `ASK_DEMO_MODE=false`, `LOCAL_DEMO_AUTH=false`, and a
  managed runtime service account. No token, credential, cookie, or raw OAuth URL entered evidence.
- The in-app browser could NOT sign in: the only control returned `auth/popup-blocked`, and
  `components/auth/SignInPanel.tsx:124` uses `signInWithPopup` with no redirect fallback. Recorded as
  `FB-HVSESSION-013` / `AC-S69-32`. Control moved to an owner-selected popup-allowing Chrome.
- A direct request for `/lease-renewal/live` redirected to `/sign-in` with an EMPTY query string in
  both browsers — live corroboration of `FB-HVSESSION-011` / `AC-S69-23` (the protected return target
  is dropped). Per `AC-S69-25` this was recorded as a named blocker, never a candidate Pass.
- The Google account flow opened as a separate window outside the controller's tab group and is
  awaiting the one human-controlled action. No credential was requested, viewed, typed, or recorded.
- BEFORE any effect was attempted, adversarial verification falsified the Q2=C effect-authority grant
  for all three ids. `HV-002`'s confirmation dialog is severity-dependent and absent on Low/Medium,
  where the primary Resolve control commits directly; `HV-007` has no reversal control on four of five
  legs and two legs touch real Live operational records; `HV-009` has no watch-stop path anywhere in
  the product, making its reversal readback unproducible. Recorded as `FB-HVSESSION-014` /
  `AC-S69-33`–`AC-S69-35`. Net standing effect authority is NONE.
- No product operation, workflow effect, provider write, or source-system change is in flight, and
  none was attempted. Totals remain 2 Pass / 10 `not_run`. The HV-001 deletion-protected backup
  remains the authorized rollback source through audit closure.

## Verified read-only observations — 2026-08-24 authenticated run

The owner completed one managed Google sign-in. Every observation below is bodyless: pathnames,
control labels, counts, and booleans only. No resident name, address, rent figure, mailbox content,
provider payload, credential, cookie, or raw OAuth URL was requested, viewed, or recorded.

**Target verification (`AC-S69-25`), passed.** Origin is the deployed Production origin; pathname is
exactly `/lease-renewal/live`; `h1` reads `Live renewal review`; `Sign out` and `Admin` are both
present, establishing an authenticated managed-domain Admin session. Cloud Run readback independently
proves `pmi-kc-app-rmsol14wb-9fe02e7af754` at 100% traffic with `ENVIRONMENT_KIND=production`,
`ASK_DEMO_MODE=false`, and `LOCAL_DEMO_AUTH=false`.

**`FB-HVSESSION-011` corroborated three times.** A direct request for `/lease-renewal/live` redirected
to `/sign-in` with an EMPTY query string in both browsers, and the completed sign-in returned to `/`
(`h1` = `Console`) rather than the requested review route. The protected return target is dropped.

**HV-002 read-only state.** The review route renders `20` `Resolve` controls and the line
`20 items need a human decision`, matching the 2026-08-19 observation. Severity scan returns High
present and Medium, Low, and Blocked all absent, so every currently open item carries the
confirmation dialog. No card renders a resolution line and no `Re-resolve` or `Skip` control is
present, so LEASE-LIVE-005's "every rendered flag is unresolved" observation still holds on this
revision. NOTHING WAS PRESSED. No `Resolve`, no dialog, no confirmation, no write-back. Zero non-GET
requests were issued by this run.

**HV-004 factual half verified read-only.** `/connections` renders exactly `2` API-key inputs and `2`
`Save API key` buttons. All four safety properties the audit named hold on the live deployment: every
input is `type=password`, every input is empty on load, every input carries `autocomplete="off"`, and
every Save button is disabled while its input is empty. Both inputs sit OUTSIDE any disclosure
element, which FALSIFIES the audit prefill's claim that the model had to expand a panel to find them
— they are more prominent than the finding reported. Other rendered controls: `Verify connection`,
`Connect with Dotloop`, `Connect with QuickBooks`. Only the owner's decision remains open.

**No status changed.** Totals remain 2 Pass / 10 `not_run`. No item was advanced to terminal, because
every remaining item needs either an owner answer, a second party, a microphone, or an effect the
lane refuses to commit. Recording these observations here rather than in the human-response JSON keeps
the canonical terminal record untouched.

**Clean exit.** The browser tab opened for this run was closed. No keepalive, browser process, local
server, or shell is held open. The app session will expire on its own and is not relied upon by
anything left running.

## Resume and pause contract

1. Begin every visit from repository state, not from a presumed running terminal or browser.
2. Re-read `AGENTS.md`, `docs/facts.md`, and `docs/loop-state.md`; inspect current git state and preserve
   unrelated work.
3. Recheck for a newer audit, source changes, a newer deployment, this response JSON, and the HTML's
   persistent local state. Merge by stable `HV-*`; a terminal mismatch blocks rather than guessing.
4. Run all managed-auth preflights before Google/cloud reads. A repository-driven browser
   controller is authorized by `FB-HVSESSION-012`; it starts from exactly one owner-controlled sign-in
   and never automates a credential step. Before every item, read back origin, pathname,
   managed-domain boolean, visible Admin role, and Demo-auth-off, and refuse on any mismatch — a
   readback on `/` or `/sign-in` is a named blocker, never a candidate Pass. If CLI/ADC is stale,
   `npm run auth:session` is allowed only while the user can interact with its visible
   terminal/browser flow; rerun preflights afterward. Never reset HTML review state.
5. Run unattended within one visit. Work every `browser_executable_no_effect` item to terminal
   without asking; advance every `effect_gated` item to its confirmation boundary and stop there;
   terminate `second_party_required` and `hardware_required` items with their exact preconditions
   stated rather than as fails. Collect all four `owner_decision` items (`HV-004`, `HV-005`, `HV-010`,
   `HV-011`) into ONE batch packet — question, prepared findings, recommended answer, effect of each
   choice — instead of one sitting each. Persist `prepared_no_effect` before any boundary stop, and
   update the response JSON, this state file, feedback index, and smallest applicable feature-suite
   spec before replying. Retain the action-card contract (exact control label/location, numbered
   preparation, safe copy-ready input, expected/stop/cleanup states, `PASS` / `FAIL — reason`) for the
   batch entries.
6. Do not keep a shell, browser-control attachment, browser process, local server, or agent turn alive
   merely to bridge the user's absence. The Production app is already deployed. End cleanly after the
   checkpoint is durable.
7. If an external operation was accepted, persist its exact bodyless operation id, target, and last
   readback before yielding; the next context reconciles it before any retry. At this checkpoint no
   operation is in flight.
8. Do not implement or deploy application changes in the human-audit context. Audit-lane tooling
   (`scripts/audit-unattended-lane.mjs` and its focused tests) is not an application change and is
   authorized by `FB-HVSESSION-012`; it touches no provider effect, Action Registry gate,
   `firestore.rules`, IAM, billing, scope, credential, or destructive operation. `HV-002`'s write is
   exercised against seeded test data on the NON-Production plane; Production stops at the
   confirmation boundary, because no invented record may enter Production (S56,
   `F-WORKING-APP-V1-LIVE-ONLY`). The controlling launcher is
   `docs/meta-prompts/cherry-bridge-and-unattended-audit-implementation.md`.

## Documentation verification at this checkpoint

- Feature-suite shape passed: 225/225 assertions.
- Spec traceability passed at 568 acceptance ids across 56 overhaul specs, including
  `AC-S69-1`–`AC-S69-23`.
- Context freshness, redaction, and router-boundary gates passed with only named historical review-date
  warnings from context freshness.
- The touched documentation passed focused Prettier and `git diff --check` after mechanical formatting.

The application working tree was not changed by this audit phase. Documentation changes are
uncommitted, and unrelated user-owned untracked files must remain untouched.
