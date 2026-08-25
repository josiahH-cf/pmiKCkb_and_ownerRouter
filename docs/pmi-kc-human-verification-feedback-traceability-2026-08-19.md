# PMI KC human-verification feedback traceability — 2026-08-19

This is the durable feedback-to-spec index for the human continuation of
`20260817T104500Z-model-audit` using
`docs/pmi-kc-model-assisted-process-validation-audit-2026-08-17.html`. It is append-only during the
audit: assign one stable `FB-*` id per distinct point, preserve the originating statement/observation,
and map every point to at least one falsifiable `AC-*`. “Specified” means the requirement is ready for
a fresh implementation model; it does not mean code changed in this audit context.

Evidence is bodyless. No customer title, address, rent, ticket body, mailbox content, provider
payload, identity address, credential, cookie, token, or raw authentication URL belongs here.

## Audit context

- Environment: Production + Live; Demo auth disabled.
- Deployed revision during HV-001/HV-012:
  `pmi-kc-app-rmsol14wb-9fe02e7af754` at 100% traffic.
- Human role: managed-domain Admin, independently reverified after sign-in.
- Source human items: HV-001 (`CONSOLE-001`, `APPROVAL-001`, `ATTENTION-X-001`) and HV-012
  (`PRE-005`).
- Current implementation evidence: `scripts/retire-production-test-records.ts`,
  `scripts/demo-firestore.mjs`, `scripts/demo-firestore-target.mjs`,
  `scripts/smoke-live-auth.mjs`, `scripts/session-auth.ps1`, the `auth:session` package command,
  `scripts/process-audit-runner.mjs`, `scripts/process-audit-cases.mjs`, the current audit HTML
  localStorage/response schema, and their focused tests.

## Matrix

| Feedback id        | Origin and statement/observation                                                                                                                                                                                                                                                                    | Classification                                                                    | Required end state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Specification / acceptance                                                         | Status / dependency                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `FB-HV001-001`     | HV-001 backup validation: the named clone LRO reported `done` before its document data plane accepted a read; the same clone became readable later.                                                                                                                                                 | Reproducible operator-tooling defect / external consistency friction              | Control-plane completion never counts as usable backup evidence. Poll the same exact clone through identity and N/N hash-readable data-plane readiness; timeout blocks without a second clone or Production effect.                                                                                                                                                                                                                                                                                                                                  | S56 `AC-S56-10`; supporting `AC-S56-12`                                            | Specified; no external dependency                                                                            |
| `FB-HV001-002`     | HV-001 restore-drill cleanup: the first delete returned a conflict, but exact readback showed the same database still present, no `deleteTime`, and no accepted operation.                                                                                                                          | Reproducible operator-tooling defect / ambiguous-effect safety                    | Classify conflict using exact name/UID/ETag/`deleteTime`/operation readback. Same-UID presence with no delete state is no-effect; different or incomplete evidence blocks; retry only after reconciliation.                                                                                                                                                                                                                                                                                                                                          | S56 `AC-S56-11`, `AC-S56-13`                                                       | Specified; no external dependency                                                                            |
| `FB-HV001-003`     | User: “run the smoke test / validation — ensure accuracy before deletion.” The user then exact-confirmed only the sealed 78-record digest.                                                                                                                                                          | Safety/procedure requirement                                                      | Immediately before deletion, reprove managed auth, exact Production+Live revision, immutable owner and operational digests, source/backup N/N hashes, restore proof/cleanup, and zero drift. Delete through per-record CAS+journal+readback, independently verify zero and four surfaces, and retain a create-only rollback source.                                                                                                                                                                                                                  | S56 `AC-S56-9`, `AC-S56-10`, `AC-S56-12`, `AC-S56-13`; S69 `AC-S69-6`, `AC-S69-11` | Specified; interactive confirmation remains human-only                                                       |
| `FB-HV012-001`     | User repeatedly asked the facilitator to ensure it was seeing the proper window; after Chrome windows were switched, the authenticated-looking window was not the window the facilitator controlled.                                                                                                | Workflow/usability friction and audit-target identity defect                      | Use normal in-app browser control, focus and bodylessly verify the exact current target, invalidate proof after a window switch, and never infer app authentication from another window or CLI browser flow. Do not solve target identity with repository-owned profile/process/port machinery.                                                                                                                                                                                                                                                      | S69 `AC-S69-1`, `AC-S69-3`, `AC-S69-4`, `AC-S69-15`                                | Specified; managed Google checkpoint is the only external dependency                                         |
| `FB-HV012-002`     | During the long HV-001 backup/restore validation, the previously valid app session redirected to sign-in before the destructive step.                                                                                                                                                               | Reproducible session-staleness safety defect                                      | A bodyless browser proof expires at 60 seconds for Live effects and is invalidated by target/profile/revision/route changes. Reverify after exact confirmation and immediately before commit; preserve immutable operation state when reauth is needed, then rerun drift checks.                                                                                                                                                                                                                                                                     | S69 `AC-S69-6`, `AC-S69-7`, `AC-S69-11`; S56 `AC-S56-12`                           | Specified; interactive managed reauthentication when stale                                                   |
| `FB-HV012-003`     | User reported that the previous window closed and asked whether the browser already up was enough or the process needed a fresh launch. Saved audit state survived, but the app target needed fresh verification.                                                                                   | Workflow recovery / local-progress durability friction                            | Open a normal controlled app window afresh, load the canonical disk checkpoint, merge compatible HTML state, and reverify the current target. Preserve every saved `HV-*` response and never invoke reset; no old process/profile is required for recovery.                                                                                                                                                                                                                                                                                          | S69 `AC-S69-2`, `AC-S69-5`, `AC-S69-9`                                             | Specified; no external dependency unless Google presents a checkpoint                                        |
| `FB-HVSESSION-001` | User requested a fresh meta-prompt that can restart the interrupted audit in a new context. HV-002 had been prepared read-only, but the user had not judged the item or taken an action.                                                                                                            | Workflow continuity and evidence-durability requirement                           | A canonical disk checkpoint distinguishes `prepared` from terminal, merges localStorage and exported response by stable `HV-*`, preserves both passes, and resumes HV-002 without replay, reset, or invented completion.                                                                                                                                                                                                                                                                                                                             | S69 `AC-S69-5`, `AC-S69-13`                                                        | Specified; no external dependency                                                                            |
| `FB-HVSESSION-002` | User: “I am bouncing in and out of this all day when I get a minute here and there” and wants to avoid “timing out the console on the backend.”                                                                                                                                                     | Workflow/usability friction and operator-runtime reliability                      | Every visit may finish one atomic action and stop. Persist before yielding; depend on no long-lived shell, browser-control attachment, browser process, or local server. On return, reverify stale auth/runtime and reconcile any accepted operation before retry.                                                                                                                                                                                                                                                                                   | S69 `AC-S69-9`, `AC-S69-14`                                                        | Specified; interactive authentication remains human-only when stale                                          |
| `FB-HVSESSION-003` | User: “have it use the normal browser control IN THE APP — we don't need it to be complicated — we need it to be stable and easy to use.”                                                                                                                                                           | Workflow simplification and operator-usability requirement                        | The Codex app's normal browser/computer control is the primary and only default audit facilitation path. The launcher requires no CDP port, remote debugging, profile/PID fingerprint, Playwright attach, or custom controller; unavailable normal control yields one exact browser-availability action.                                                                                                                                                                                                                                             | S69 `AC-S69-1`, `AC-S69-9`, `AC-S69-15`                                            | Specified; no external dependency unless in-app control is unavailable                                       |
| `FB-HVSESSION-004` | User explicitly allowed the facilitator to “run the npm session auth, etc.” provided the user has capability to interact with it.                                                                                                                                                                   | Authentication-procedure authority clarification                                  | After safe preflights show stale CLI/ADC auth, run existing `npm run auth:session` only in a visible, user-interactable terminal/browser flow. Ask for one managed sign-in action, let the command finish, rerun preflights, and never inspect or record credential inputs or raw identity output.                                                                                                                                                                                                                                                   | S69 `AC-S69-3`, `AC-S69-4`, `AC-S69-16`                                            | Specified; interactive Google checkpoint remains human-only                                                  |
| `FB-HVSESSION-005` | User reported that prior verification instructions were not verbose, actionable, or clear enough.                                                                                                                                                                                                   | Workflow/usability friction and procedure-quality defect                          | Every checkpoint is a self-contained action card naming exact progress, route/panel, proof objective, boundary, prepared state, one human action, control label/location, expected result, stop symptoms, cleanup, feedback request, and reply choices. Generic directions are forbidden.                                                                                                                                                                                                                                                            | S69 `AC-S69-17`; supporting `AC-S69-10`, `AC-S69-19`                               | Specified; no external dependency                                                                            |
| `FB-HVSESSION-006` | User requested exact instructions for “what to insert into fields” and “what to click,” with code blocks for easy copying.                                                                                                                                                                          | Operator-efficiency requirement with evidence/privacy boundary                    | Name the exact control and location. Put a fixed non-sensitive value alone in a fenced text block with destination and replace/append/case/submit rules. Never reproduce credentials, customer/provider content, or protected manifests; instead name on-screen source and destination controls for one human transfer/judgment.                                                                                                                                                                                                                     | S69 `AC-S69-17`, `AC-S69-18`                                                       | Specified; protected values remain human-only and bodyless                                                   |
| `FB-HVSESSION-007` | User requested presentation-minded instructions using emoji and a numbered step-by-step verification process so friction is removed.                                                                                                                                                                | Readability/usability and accessibility requirement                               | Use numbered prepared steps and one numbered human action, with emoji paired to explicit text labels. Preserve screen-reader order, responsive/zoom layout, and meaning without emoji; never bundle multiple human actions merely by numbering them.                                                                                                                                                                                                                                                                                                 | S69 `AC-S69-10`, `AC-S69-17`, `AC-S69-19`                                          | Specified; no external dependency                                                                            |
| `FB-HVSESSION-008` | User requested an easy Pass/Fail response, with every failure including its reason.                                                                                                                                                                                                                 | Human-response and audit-evidence protocol requirement                            | End every card with copy-ready `PASS`, optional passing-friction, and `FAIL — reason: …` responses. A reasonless failure remains non-terminal and gets one narrow follow-up; corroborate before recording, preserve wording, and create feedback ids even for friction on a Pass.                                                                                                                                                                                                                                                                    | S69 `AC-S69-5`, `AC-S69-20`                                                        | Specified; safe corroboration remains required                                                               |
| `FB-HVSESSION-009` | HV-002 resume preflight: from the repository's WSL-root task, `npm run auth:session` exited 127 because the package command could not locate `powershell.exe`, although the documented absolute Windows PowerShell executable was present.                                                          | Reproducible operator-tooling portability defect                                  | One canonical auth entry point must either launch the approved existing script from each documented Windows/WSL runner or fail before authentication with one exact owner-shell instruction. It must not require a second auth wrapper, hidden command, PATH guess, or custom browser flow.                                                                                                                                                                                                                                                          | S69 `AC-S69-16`, `AC-S69-21`                                                       | Specified; no owner decision or credential dependency                                                        |
| `FB-HVSESSION-010` | HV-002 resume preflight: invoking the existing Windows script directly showed a blank active account and a missing `node` command, yet still printed `READY` and exited zero because its token probe alone succeeded.                                                                               | Reproducible authentication false-positive safety defect                          | `READY` requires an exact managed/service active identity, approved Production project, successful CLI token mint, and successful ADC preflight. Blank/wrong identity, missing Node, a skipped/failed ADC check, or any command-not-found state must exit nonzero and cannot be repaired by prose or a token-only pass.                                                                                                                                                                                                                              | S69 `AC-S69-16`, `AC-S69-22`                                                       | Specified; no owner decision or credential dependency                                                        |
| `FB-HVSESSION-011` | HV-002 authenticated-route checkpoint: the exact protected review link entered sign-in, but managed sign-in returned the user to `/lease-renewal/live/desk` instead of the requested `/lease-renewal/live` review.                                                                                  | Reproducible authentication-navigation and operator-usability defect              | Preserve one validated same-origin relative return target across managed sign-in and restore the exact pathname plus allowlisted query afterward. Reject external, protocol-relative, malformed, credential-bearing, and auth-material targets to the safe primary-space fallback; never create an open redirect.                                                                                                                                                                                                                                    | S69 `AC-S69-3`, `AC-S69-23`                                                        | Specified; D12 auth-path implementation is prepared for owner review                                         |
| `FB-HVSESSION-012` | Owner, 2026-08-24: “Your instruction is that later explicit instruction.” The owner explicitly superseded the `FB-HVSESSION-003` premise and authorized a repository-driven browser controller so the remaining human-only checks run unattended in one pass instead of ten-plus separate sittings. | Explicit owner supersede of a recorded audit constraint; unattended-run authority | A repository-driven browser controller is an authorized audit facilitation path. One owner sign-in starts the run; the runner then drives an authenticated Production target unattended, reads back the exact target before every item, records terminal results with bodyless evidence, stops each effect-bearing item at its confirmation boundary, and returns one batch packet holding the irreducible human residue. Every other `FB-HVSESSION-003` restriction is retained: no credential handling, no bodied evidence, no client-facing send. | S69 `AC-S69-24`–`AC-S69-31`; `F-UNATTENDED-AUDIT-CONTROLLER-2026-08-24`            | Specified; supersedes `FB-HVSESSION-003`                                                                     |
| `FB-HVSESSION-013` | 2026-08-24 unattended run: the in-app browser returned `Firebase: Error (auth/popup-blocked)` on the only sign-in control, and `components/auth/SignInPanel.tsx:124` uses `signInWithPopup` with no `signInWithRedirect` fallback and no `getRedirectResult`.                                       | Reproducible product defect and audit-path blocker                                | Any popup-blocking browser is structurally unable to sign in to the app. The sign-in path needs a redirect fallback so a controlled or embedded browser can authenticate; until then the unattended lane requires a popup-allowing browser and one human-controlled Google flow. The credential step itself stays human-only.                                                                                                                                                                                                                        | S69 `AC-S69-32`                                                                    | Specified; the auth-path patch is a D12 protected change, prepared and surfaced, never pushed from the audit |
| `FB-HVSESSION-014` | Adversarial verification of the 2026-08-24 lane falsified the premises behind the owner's Q2=C effect authority: `HV-007` and `HV-009` have no producible reversal, and `HV-002`'s confirmation boundary exists on only two of four severity paths.                                                 | Safety-critical falsification of a granted authority                              | The lane refuses to commit `HV-002`, `HV-007`, and `HV-009`, and never claims `stopped_at_boundary` where no boundary exists. Evidence cannot be written without a verified target. The three refused ids escalate to the owner batch packet so they retain a route to terminal.                                                                                                                                                                                                                                                                     | S69 `AC-S69-33`, `AC-S69-34`, `AC-S69-35`                                          | Specified; supersedes the effect-authority half of `F-UNATTENDED-AUDIT-CONTROLLER-2026-08-24`                |

## Requirement detail and reproducible states

### FB-HV001-001 — clone control plane versus data plane

- Preconditions: managed cloud identity; pinned Production project/database/location; exact private
  manifest; named PITR clone request accepted and persisted.
- Reproduction: poll the clone LRO to `done:true`, then make the first batch document read return a
  transient availability response while database identity is already readable; a later read of the
  same destination succeeds.
- Current behavior observed: the audit continuation safely waited, but this behavior is not pinned as
  a permanent S56 state-machine acceptance test.
- Required forward state: `CLONE_CONTROL_READY` → `CLONE_DATA_PENDING` → `CLONE_VERIFIED`; the first
  two states cannot authorize restore or delete.
- Failure/retry: bounded poll of the same operation/destination only; unavailable stays named, timeout
  blocks, and no second clone request is made.
- Return/cleanup: a timed-out or failed clone remains an exact named resource for reconciled cleanup;
  it is never silently abandoned or deleted by a broad prefix.

### FB-HV001-002 — delete conflict classification

- Preconditions: exact disposable database name and UID, fresh ETag, known restored-record hash, and
  cleanup intent persisted.
- Reproduction: delete returns 409; readback returns the same UID with no `deleteTime` and no operation.
- Current behavior observed: an older helper's wording treated conflict as “already absent or
  deleting”; the audit corrected that by reading back, classifying exact no-effect, then retrying the
  same UID once and proving absence.
- Required states: `ABSENT` passes; `SAME_UID_DELETING` waits; `SAME_UID_NO_EFFECT` may bounded-retry;
  `DIFFERENT_UID`, `MISSING_ETAG`, `CONTRADICTORY`, and `UNAVAILABLE` block.
- Forbidden: conflict alone can never advance cleanup, delete another database, or justify retry.

### FB-HV001-003 — accuracy-before-deletion contract

- Preconditions: owner-confirmed count and digest; private N-record manifest; named protected backup;
  successful create-only restore rehearsal and exact drill absence; current managed Admin browser and
  cloud identities.
- Required forward workflow: current inventory/source hashes → backup identity/data hashes → browser
  and deployment context → exact confirmation → one-record update-time CAS → immediate absence →
  durable journal → independent zero → bodyless four-surface counts/marker/network readback.
- Required return workflow: create-only restore from the protected clone for missing destinations only;
  occupied/changed destinations block and never overwrite. Final backup deletion is separately exact-
  confirmed after the rollback window.
- Observed terminal state: 78/78 exact records absent; zero governed markers; Console, Approval Queue,
  and Notifications agree on one remaining genuine decision; Maintenance has zero ticket cards; zero
  alert states and failed same-origin resources on the four pages; backup retained.

### FB-HV012-001 — exact audit-window identity

- Preconditions: another browser window may be open or the user may switch windows while normal
  in-app control still points somewhere else.
- Reproduction: complete Google or app authentication in one window, then place another window in
  front before the facilitator checks the Production route.
- Current behavior observed: human and facilitator could refer to different windows. Process/CDP
  inspection was used as an ad hoc recovery during the audit, but the user rejected that complexity as
  the durable workflow.
- Required visible state: normal in-app browser control focuses one target and bodylessly verifies its
  origin/path, authenticated shell, managed-domain boolean, Admin role, and protected routes before it
  prints a human action. Another window is never inferred to share the state.
- Failure: unavailable control, a closed/switched target, or ambiguous focus invalidates the proof and
  yields one browser-availability/reselection action; it never triggers profile/PID/port inspection.

### FB-HV012-002 — session freshness at the effect boundary

- Preconditions: a read-only validation may take minutes; app server sessions can expire independently
  of gcloud and ADC.
- Reproduction: complete validation, then have a protected route redirect to sign-in before commit.
- Current behavior observed: cloud/ADC remained valid while the browser app session was stale.
- Required behavior: browser, CLI, and ADC each have separate current proofs. A stale browser proof
  blocks the effect, focuses one managed sign-in action, preserves the immutable manifest, then
  rechecks role/domain/routes/revision/environment and all operation drift before resume.
- Retry: refreshing auth never classifies an already-attempted effect; the effect's own readback and
  reconciliation remain mandatory.

### FB-HV012-003 — closed-window recovery and saved review state

- Preconditions: audit localStorage contains at least one terminal response; the app tab/window closes.
- Reproduction: the old target or whole browser exits; a later task starts with only the canonical
  response/resume files and may encounter empty or stale HTML localStorage.
- Required behavior: acquire a normal app-controlled window, load disk checkpoint first, merge
  matching HTML state, and reverify auth/runtime. Preserve all results and exported fields. Missing
  browser state recovers from disk; corrupt/conflicting terminal state blocks with export recovery.
- Cleanup: no browser keepalive or controller lock exists. Response/checkpoint and compatible HTML
  state remain until the user explicitly requests reset. Recovery never clears cookies or changes
  roles.

### FB-HVSESSION-001 — fresh-context restart without replay

- Preconditions: at least one terminal human result exists; another `HV-*` may have a prepared UI
  state but no user action or request; the prior chat or process is unavailable.
- Current observation: HV-001 and HV-012 are Pass. HV-002 was opened and its first card centered, but
  the user supplied no target judgment and no resolution request occurred; its durable state remains
  `not_run`.
- Required behavior: the canonical response JSON and resume document are updated atomically around
  every human checkpoint. A new context reads them before the HTML, then merges the HTML's persistent
  state without downgrading terminal results. `prepared` is never translated into Pass, Fail, Blocked,
  or an app effect.
- Conflict behavior: exact matching results merge; a terminal/non-terminal discrepancy blocks and
  reports ids/statuses only; only explicit human direction may replace a terminal result.
- Return path: the fresh context reproduces the one prepared read-only page state after current auth
  and deployment verification, then prints one action. It never resets or re-runs a completed item.

### FB-HVSESSION-002 — intermittent sessions without console dependence

- Preconditions: the human may leave after any atomic step and the controlled browser or terminal may
  be absent when they return.
- Required behavior: commands are bounded and persist intent/readback before yielding. The deployed
  service, repository checkpoint, response JSON, and exact external operation identifiers are the
  recovery seams; a process or control attachment staying alive is not one.
- Safe stop: if no external effect began, record `prepared_no_effect` and end cleanly. If an external
  operation was accepted, record its exact target/id and last readback, then the next context
  reconciles it before retry. Never use a keepalive to bridge human absence.
- User cadence: default to one atomic human action per visit. Authentication is rechecked at every
  visit and again at a Live-effect boundary; a stale session yields exactly one managed sign-in action.

### FB-HVSESSION-003 — normal in-app browser control

- Preconditions: the Codex app exposes its ordinary browser/computer-control capability and the old
  audit task may have used a custom Chrome profile, remote-debugging port, or process inspection.
- Current direction: the normal in-app control is simpler and is the required durable workflow. The
  old profile/port/CDP approach remains historical audit evidence only.
- Required behavior: open or focus the Production route and audit artifact with normal in-app control,
  verify the exact visible target, and reacquire it after a switch/close. Do not build, require, or
  silently fall back to repository CDP/Playwright/profile-process control.
- Unavailable behavior: name `IN_APP_BROWSER_CONTROL_UNAVAILABLE`, prepare every safe setup step, and
  ask the user for one action to expose a supported browser target. Continue after fresh readback.
- 2026-08-20, 2026-08-22, and 2026-08-23 rehearsals: after sign-in or a fresh restart, the facilitator reacquired
  the audit task but normal control exposed no supported browser target; the later reset/retry failed
  at the same bodyless initialization boundary. Both visits stopped without a custom fallback or
  workflow effect.
- Compatibility/cleanup: existing disk/HTML progress survives regardless of browser window/profile;
  delete or decline any proposed controller-specific transient plan. No application data changes.

### FB-HVSESSION-004 — user-present interactive session auth

- Preconditions: the three documented auth preflights run first and show stale CLI and/or ADC auth;
  the user confirms they can interact with the terminal/browser flow.
- Current implementation: `npm run auth:session` runs `scripts/session-auth.ps1`, tests freshness,
  enables prompts only for required reauthentication, opens Google in the browser, and performs
  post-login checks. Redirecting its interactive commands breaks that contract.
- Required behavior: launch that existing command visibly, ask the user for one managed sign-in action,
  wait for the bounded command to finish, then rerun all preflights and independently verify the app
  target. Record only managed/service booleans; never copy identity output into audit artifacts/chat.
- Unavailable/return behavior: if the user cannot reach the prompt/browser, do not launch or leave a
  command waiting. Ask them to run the exact command in their visible owner Windows shell. Cancel or
  failure changes no audit status or app/provider state; after success, browser app auth is still
  independently verified.
- 2026-08-22 rehearsal: both CLI and ADC were stale after restart; one human-controlled Google flow
  was followed by independent green CLI/ADC checks, current Production deployment readback, and exact
  auth-shell cleanup. Browser-app authentication correctly remained a separate unproven checkpoint.
- 2026-08-23 restart: the same local identity/project selections remained valid while CLI and ADC
  were again stale with `invalid_rapt`; the saved 2/12 audit state and return-target finding survived
  intact before a new visible human authentication checkpoint was prepared.

### FB-HVSESSION-005 — detailed and actionable checkpoint card

- Preconditions: the facilitator has read the current `HV-*`, inspected code/runtime, prepared the
  exact safe state, and is ready to request one human action.
- Current issue: prior prompts could state the general goal and expected outcome without identifying
  the exact visible control, location, state, or stopping point, forcing the user to infer mechanics.
- Required behavior: render every action-card field from AC-S69-17. State completed preparation as a
  numbered list and make the one human action unmistakable. Include effect boundary and cleanup so the
  user knows what can and cannot happen.
- Failure behavior: if exact labels/location/current state cannot be established, do not substitute
  generic prose. Continue read-only preparation or name the exact missing-context blocker.
- Regression: authentication, judgment, field entry, reversible mutation, exact confirmation, and
  cleanup checkpoints all use the same card grammar without exposing the remaining queue.

### FB-HVSESSION-006 — exact click and safe field-entry instructions

- Preconditions: the current action genuinely requires one human click or one field entry; the
  facilitator has already focused/opened the destination and classified the value.
- Fixed safe value: name the destination label and location, say replace/append, state case/spacing,
  show the exact value alone in a `text` fence, and say whether to stop before submission.
- Protected/customer-specific value: never copy it into chat or evidence. Name the visible source and
  destination controls, keep them available in the app, and direct one human transfer or judgment.
- Click: use the exact button/menu/option label, describe its containing panel/card/heading, and say
  “click once” plus the specific controls that remain untouched.
- Failure/cleanup: missing label, unexpected prefilled value, conflicting source, disabled control, or
  unexpected effect triggers the card's stop rule. No submit/confirm occurs as an implied second action.

### FB-HVSESSION-007 — presentation and numbered flow

- Required visual order: progress → route/workflow → proof/boundary → numbered prepared state → one
  numbered action → expected/stop/cleanup → copy-ready response choices.
- Emoji contract: use familiar emoji as scanning aids only when immediately paired with a text label;
  stripping emoji must leave the card complete and unambiguous.
- Numbering contract: numbered preparation is already completed by the facilitator. The human section
  contains one semantic action; “click, type, submit” cannot be made atomic by numbering it 1–3.
- Accessibility/responsive: keyboard/screen-reader order matches the visual order, status is not
  color/emoji-only, and the card fits a narrow viewport and 200% zoom without losing code-block values
  or response choices.

### FB-HVSESSION-008 — simple reasoned Pass/Fail response

- Primary responses: a copy-ready bare `PASS`, `PASS — friction: …`, and
  `FAIL — reason: …`. Blocked/Skipped appear only when applicable and also require a reason.
- Parsing: accept case-insensitive Pass. Preserve the user's statement verbatim in sanitized form; do
  not infer a reason or terminal failure from an empty `FAIL`.
- Corroboration: the response is a human observation, not technical proof. Use bodyless DOM/network/
  readback evidence where safe before recording the terminal status; contradiction blocks advancement.
- Feedback: every friction clause on a Pass or Fail becomes a separate stable feedback candidate and
  maps to a specification/acceptance criterion before the next independent audit item closes.

### FB-HVSESSION-009 — runner-safe session-auth entry point

- Preconditions: the repository is opened through a WSL-root Codex task; Windows PowerShell exists
  at its standard absolute executable path but is not exported as `powershell.exe` on the WSL PATH.
- Reproduction: run the documented package command unchanged. The package script attempts the bare
  executable name and exits 127 before the approved authentication script begins.
- Required behavior: one repository-owned entry point detects the supported runner, invokes the same
  `scripts/session-auth.ps1` without redirecting its interactive commands, and keeps the user-visible
  browser/terminal checkpoint intact. If the documented host cannot launch it, fail before any auth
  action and print exactly one instruction to run the canonical command in the visible owner Windows
  shell.
- Forbidden: a second audit-specific login script, shell-PATH guessing after an auth attempt, a
  hidden pending command, or a custom browser/profile/CDP flow.
- Return path: cancellation or launch failure leaves all audit progress and app/provider state
  unchanged; successful completion is still followed by the three independent preflights.

### FB-HVSESSION-010 — session-auth must fail closed

- Preconditions: Windows PowerShell can start the approved script, but its gcloud configuration has
  no active account; `gcloud auth print-access-token` happens to return success; and `node` is absent
  so the ADC preflight command cannot execute.
- Reproduction: invoke the script under that environment. It reports the blank identity and the Node
  command-not-found error, then prints `READY` and exits zero.
- Required behavior: readiness is a conjunction of a managed/service active identity, the approved
  Production project, a successful non-printing CLI-token mint, and an actually executed successful
  ADC preflight. Each check has a captured status; command-not-found is failure. No single passing
  token probe can override another missing or failed check.
- Evidence boundary: emit only the managed/service and approved-project booleans plus check status;
  never record the address, token, credential path, or raw auth output.
- Retry/return: a failed check exits nonzero before workflow/cloud work and requests the one applicable
  visible owner action. After success, rerun the caller's canonical preflights rather than trusting the
  script's banner alone.

### FB-HVSESSION-011 — protected return target survives managed sign-in

- Preconditions: a signed-out managed user opens an exact safe same-origin protected pathname, such
  as `/lease-renewal/live`, with no credential or customer value in the URL.
- Reproduction: the page guard redirects to `/sign-in` without the requested target; after successful
  managed sign-in the app follows its default landing behavior and reaches `/lease-renewal/live/desk`
  rather than returning to the requested Live review.
- Required behavior: carry one normalized relative pathname and allowlisted non-sensitive query
  through sign-in, then replace history with that exact target after session establishment. A direct
  signed-in visit remains unchanged and a forbidden/invalid target falls back to the user's safe
  primary Space.
- Security/failure matrix: reject absolute URLs, another origin, protocol-relative paths, encoded
  traversal, fragments, sign-in loops, credentials, OAuth material, and overlong values. Wrong role
  or scope still follows the existing forbidden/primary-space boundary rather than bypassing access.
- Return/rollback: cancellation leaves the user on sign-in with no app mutation. The implementation
  patch is isolated because `lib/auth/**` is D12-protected; reverting it restores the current safe
  default landing without changing sessions, roles, data, or provider state.
- Corroboration rehearsal: a later bare Pass could not advance because the ambient pathname still
  identified the Desk. The facilitator preserved it as a candidate and requested one exact heading
  judgment. A user-supplied current-page image then corroborated only the allowlisted `Renewals`
  heading; the image itself was neither retained nor cited as evidence. The setup action was marked
  failed while HV-002 remained `not_run`, exercising S69 `AC-S69-8` and `AC-S69-20`.

### FB-HVSESSION-012 — owner-authorized unattended browser controller

- Originating instruction, preserved verbatim: “The constraint you are superseding is narrow and was
  written to be superseded. S69's hard gate reads: ‘Do not build or invoke a repository
  CDP/remote-debugging/Playwright/profile-process controller as a fallback unless a later explicit user
  instruction supersedes `FB-HVSESSION-003`.’ Your instruction is that later explicit instruction.”
- Premise superseded: `FB-HVSESSION-003` held that the Codex app's normal in-app browser control is the
  primary **and only** default facilitation path, and that unavailable normal control yields one exact
  browser-availability action rather than a fallback controller. That premise stands as history. It no
  longer governs, because it produced four consecutive sessions stuck on `HV-002` at the named blocker
  `IN_APP_BROWSER_CONTROL_UNAVAILABLE`, during which three candidate Passes had to be reconciled away
  as failed setup actions.
- Required behavior: exactly one owner-controlled sign-in starts the run. Thereafter a
  repository-driven controller may acquire and drive the authenticated Production target without a
  further human action per item. Before every item the runner reads back origin, pathname,
  managed-domain boolean, visible Admin role, and Demo-auth-off state, and refuses to proceed on a
  mismatch. A target on `/` or `/sign-in` is a **named blocker, never a candidate Pass**.
- Retained restrictions — unchanged by this supersede: the runner never requests, views, types,
  copies, stores, or logs a password, token, cookie, TOTP, recovery code, setup link, raw OAuth URL, or
  personal account; never saves bodies, provider payloads, customer values, or screenshots as evidence;
  never performs an autonomous, scheduled, bulk, or model-triggered client-facing send; and never
  clears browser state, resets the HTML, changes a real role, or creates a test identity.
- Effect authority under this supersede: app-owned effects (`HV-002` fixture write, `HV-007`
  create-and-clean) and the one Gmail push-watch provider mutation (`HV-009`) may be committed
  unattended, each with a reversal proven by readback in the same run. `HV-008` is refused outright.
  No invented record enters Production.
- Unavailable behavior: if controller attachment fails, emit **one** named blocker and exit cleanly —
  no keepalive, no browser process, no local server, no shell held open.
- Compatibility/cleanup: the checkpoint files, terminal results, and one-action action-card contract
  survive unchanged. `HV-001` and `HV-012` are never replayed or downgraded. The one-atomic-human-action
  loop remains the contract for `owner_decision` items; it is replaced by batch delivery, not by
  unattended answering.

### FB-HVSESSION-013 — popup-only sign-in blocks a controlled browser

- Reproduction: open the deployed Production origin in a browser that blocks popups, press the only
  control (`Sign in with Google`), and observe `Firebase: Error (auth/popup-blocked)` rendered on
  `/sign-in`. The page never leaves `/sign-in` and no session is established.
- Code grounding: `components/auth/SignInPanel.tsx:124` calls `signInWithPopup`. A repository-wide
  search finds no `signInWithRedirect` and no `getRedirectResult`, so there is no fallback path.
- Required forward state: the sign-in path offers a redirect fallback when a popup is unavailable,
  preserving the `FB-HVSESSION-011` return target across the redirect. The credential step itself
  stays human-controlled in every variant.
- Audit-path consequence: an unattended run must use a popup-allowing browser and must budget for
  exactly one human-controlled Google flow. A popup-blocked browser is a named blocker, not a retry.
- Boundary: this touches `components/auth/**` and is therefore a D12 protected change. Prepare and
  surface it for owner review; never push it from the audit context.

### FB-HVSESSION-014 — granted effect authority falsified before use

- Origin: adversarial verification of the lane produced by `FB-HVSESSION-012`, run before any effect
  was attempted. Three independent lenses (triage, safety boundary, evidence) each returned blockers.
- What was falsified:
  - `HV-002`'s confirmation dialog is SEVERITY-DEPENDENT. `requiresAdmin` is true only for High and
    Blocked flags; on a Low or Medium flag `requestSubmit` falls through to `performSubmit`, which
    POSTs the resolve endpoint. On those cards the primary `Resolve` control IS the commit, so
    "advance to the confirmation boundary and stop" would have written a durable decision about a
    real client lease with nothing to stop at.
  - `HV-007`'s "app-owned create-and-clean cycle; reversal proven by readback" is false on four of
    five legs — the shipped UI exposes no reversal control (forward-only ticket lifecycle, no
    placeholder removal, no un-resolve, no mark-unread) — and two legs operate on real Live
    operational records rather than disposable fixtures.
  - `HV-009` is not "only a Gmail push-watch". One confirmation produces an app-plane claim written
    BEFORE the provider call and consumed even on failure, the provider mutation itself, and an
    ongoing external push channel. No watch-stop path exists anywhere in the product, so the
    `AC-S69-29` reversal readback is unproducible; the item's own expected pass state (watch active)
    directly contradicts the reversal state the lane requires (stopped).
  - `HV-008` remains correctly refused, but citing `D33` alone as the grounds was too narrow to be
    accurate. The grounds are the blanket no-autonomous/scheduled/bulk/model-triggered
    client-facing-send invariant, plus an irreversible durable Production association created before
    any send.
  - The evidence recorder and the target check shared no state, so an evidence record could be
    written while the browser sat on `/sign-in` — the exact mechanism behind four sessions of false
    candidate Passes, reproduced against the lane's own shipped module.
- Required forward state: the lane refuses to commit `HV-002`, `HV-007`, and `HV-009`; it returns
  `no_safe_boundary` rather than `stopped_at_boundary` wherever no confirmation control stands
  between the action and the durable write, and assumes the worst when severity is unknown; evidence
  cannot be recorded without a verified target; and the three refused ids escalate into the owner
  batch packet so they retain a route to terminal.
- Governance note: a granted authority that rests on a false premise is not exercised and then
  reported — it is refused, and the falsification is recorded for the owner to re-decide against the
  corrected facts.

## Specification files

- Amended: `docs/feature-suites/production-live-only-test-lane-retirement.md` (S56,
  `AC-S56-9`–`AC-S56-13`).
- New: `docs/feature-suites/human-verification-session-and-evidence-reliability.md` (S69,
  `AC-S69-1`–`AC-S69-23`).
- Indexed by: `docs/feature-suites/README.md` and the `AGENTS.md` Route Table/Project Map.

## Unresolved dependencies

No owner product decision is open for these seventeen requirements. The only normal external dependency
is the interactive Google checkpoint when managed authentication is stale; a visit also parks on the
exact named blocker if normal in-app browser control is unavailable. Neither dependency may be
automated, replaced by a personal account, or worked around with custom browser control. Protected or
customer-specific field values remain human-handled in the application and bodyless in evidence; that
is a safety invariant, not an open design question. The runner-entry and false-positive defects are
internal S69 implementation work, not reasons to weaken authentication or ask for another owner
decision. `FB-HVSESSION-011` has one protected D12 implementation boundary: prepare and verify the
smallest auth-path patch, then surface it for owner review rather than pushing it from the audit.
S56's eventual retained-backup cleanup remains an exact human-confirmed destructive cleanup step
after the rollback window.
