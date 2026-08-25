<!-- spec-shape: overhaul-v1 -->

# S69 — Human-verification session and evidence reliability

> New 2026-08-19 from human-audit feedback `FB-HV012-001`, `FB-HV012-002`, and
> `FB-HV012-003`; amended 2026-08-20 for `FB-HVSESSION-001`–`FB-HVSESSION-008` in
> `docs/pmi-kc-human-verification-feedback-traceability-2026-08-19.md`; amended again for
> `FB-HVSESSION-009` and `FB-HVSESSION-010` after the HV-002 resume preflight falsified the
> documented runner entry point and READY banner.
> Rehearsed 2026-08-22: stale CLI plus ADC recovered through one human-controlled managed Google
> flow, independent readback, and exact shell cleanup; browser-app authentication remained separate.
> Amended for `FB-HVSESSION-011` after that app sign-in dropped the exact protected return target and
> landed on the default Renewal Desk.
> The same rehearsal withheld a bare candidate Pass when the bodyless route still identified the
> Desk; an ephemeral user-supplied image corroborated only the allowlisted heading and was not
> retained as evidence, exercising `AC-S69-8` and `AC-S69-20`.
> Amended again 2026-08-24 for `FB-HVSESSION-013` and `FB-HVSESSION-014` after adversarial
> verification falsified the effect-authority premise BEFORE any effect was attempted, and after the
> app's popup-only sign-in blocked a controlled browser. `AC-S69-32`-`AC-S69-35` specify the redirect
> fallback, the severity-aware boundary, refusal of unprovable reversals, and target-coupled evidence
> with an escalation channel. Net standing effect authority is NONE.
> Amended 2026-08-24 for `FB-HVSESSION-012`: the owner explicitly superseded the
> `FB-HVSESSION-003` controller premise and authorized an unattended lane. `AC-S69-24`–`AC-S69-31`
> specify the triage table, target readback, bodyless recorder, terminal-safe merge, effect
> boundary, proven reversal, batch packet, and clean interruption. Every credential, evidence,
> and send restriction is retained.
> A 2026-08-23 restart preserved that checkpoint and reproduced stale CLI/ADC plus unavailable normal
> control without replaying a Pass or creating a custom fallback.
> Specification only in the audit context: do not implement or deploy it until the fresh-context
> implementation launcher runs. This suite changes audit/operator procedure and progress tooling, not
> product authority.

**Goal.** Human verification uses the normal browser/computer control built into the Codex app. It
does not require a repository-owned Chrome profile controller, CDP port, Playwright wrapper, process
fingerprint, or all-day console. The facilitator visibly controls one current PMI KC audit tab or
window, verifies that exact target before relying on its authentication, survives a closed tab or
window through durable disk checkpoints, and proves the managed-domain Admin session is fresh
immediately before a Live effect. When authentication is stale, the facilitator may run the existing
interactive `npm run auth:session` command while the user is present and able to interact, then asks
for only the credential-bound action it cannot perform. It never sees or records a password, token,
cookie, TOTP, recovery code, customer value, or raw OAuth URL. Authentication visible in another
window never counts as proof for the window under control.

Every human checkpoint is presented as a self-contained, visually scannable action card. It names the
exact control and location, supplies any safe value in a copy-ready code block, explains the expected
visible result and stop condition, and ends with a simple `PASS` or `FAIL — reason` reply contract.
The action card may be detailed, but it contains only one human click, entry, choice, or judgment. The
facilitator performs every safe preparatory navigation and waits after that one action.

**What it is / how it functions.** The Codex app already supplies normal browser/computer control,
and `scripts/session-auth.ps1` already provides the documented interactive CLI/ADC refresh. The audit
HTML persists browser-local review state, while the canonical response JSON and resume document
provide cross-window and fresh-context recovery. The required result is a simple operating contract
plus the smallest progress validation/merge tooling needed to keep those artifacts consistent. No
new browser automation layer is part of S69.

- **Buildable now (audit tooling and documentation).** Maintain the paste-ready launcher, canonical
  resume-state schema, HTML-compatible response schema, stable-`HV-*` merge/readback validation,
  bodyless freshness-proof schema, redaction checks, and focused progress tests. Update the current
  model-audit HTML only if needed for compatible import/export or to expose its existing storage key;
  never reset its state. Do not add a custom browser controller, CDP/remote-debugging command,
  Playwright harness for live facilitation, profile/process lock, PID/port discovery, or browser
  keepalive. No product route, auth policy, Firebase claim, permission, Action Registry key, provider
  client, or Production data path changes.
- **Build to the seam (normal in-app browser control).** Use the ordinary browser/computer-control
  capability exposed in the Codex app to open or focus the canonical Production application and the
  audit artifact. Before each human prompt, read back the current origin/path and allowlisted controls
  from the exact visible target. If the user switches or closes windows, reacquire a normal controlled
  tab and reverify it; do not infer continuity. If the normal in-app capability is unavailable, name
  that one blocker and ask the user for one action to make a supported browser target available.
  Custom CDP, remote-debugging, profile-root, or ad hoc browser scripts are not fallback behavior
  without a new explicit user instruction.
- **Detailed human action card.** Replace terse or generic instructions with one card that includes:
  verification and action progress; workflow and exact route; what the check proves; effect/no-effect
  boundary; a numbered list of what the facilitator already prepared; one exact current human action;
  the control's visible label and location; field name plus safe input source/value; expected visible
  result; explicit stop symptoms; cleanup/return expectation; and copy-ready response choices. Never
  say only “check this,” “continue,” “fill it in,” or “let me know” when a concrete label, location,
  value source, or success state can be stated.
- **One action, numbered presentation.** Use emoji plus text labels and numbered steps for scanning,
  while never relying on emoji, color, or position alone. Number preparation separately from the one
  human action so detail does not become a bundled workflow. For example, the facilitator may report
  two completed setup steps, then direct one click and say “Stop after this click.” A later click,
  field entry, judgment, confirmation, or cleanup is a new checkpoint shown only after the prior
  response and corroboration.
- **Field-entry and copy contract.** If the human must type a fixed, non-sensitive value, show the
  exact destination label and put only that value in a fenced `text` code block. State whether to
  replace or append, whether spaces/case matter, and explicitly say not to submit if submission is a
  later action. Never place credentials, TOTP, recovery material, customer names, addresses, rents,
  ticket/mail content, provider values, or protected confirmation manifests in chat. For protected or
  customer-specific input, identify the on-screen source control and destination control without
  reproducing the value, and have the human transfer or judge it in the application as the one action.
- **Simple result grammar.** End every action card with copy-ready primary responses `PASS` and
  `FAIL — reason: …`. Also offer `PASS — friction: …` so passing friction is not lost. Offer
  `BLOCKED — reason: …` or `SKIPPED — reason: …` only when those terminal states are actually
  applicable. A bare `pass` is accepted case-insensitively. A fail/blocked/skipped response without a
  reason remains non-terminal and receives one narrow reason request. The facilitator corroborates
  the observation before recording a terminal result and splits every friction statement into stable
  feedback ids.
- **Authentication preflight and interactive recovery.** Run `npm run preflight:adc`, the documented
  active-account check, and body-suppressed access-token check before live Google/cloud reads. When
  CLI or ADC authentication is stale, `npm run auth:session` is explicitly allowed while the user is
  present and the command/browser interaction is visible and reachable to them. Run it without
  redirecting its interactive authentication commands, prepare every safe step, ask the user for one
  action to finish managed sign-in, and allow the same command to complete. Then rerun all preflights
  and reduce identity evidence to managed-domain/service-identity booleans. If the user cannot
  interact with the command or browser it opens, do not launch a hidden prompt; ask them to run the
  same command in their visible owner Windows shell as the one atomic action.
- **Protected return-target continuity.** When a signed-out user requests a safe same-origin protected
  route, carry one validated relative pathname plus allowlisted non-sensitive query through managed
  sign-in and restore it after session establishment. Reject absolute URLs, other origins,
  protocol-relative paths, encoded traversal, fragments, sign-in loops, credentials, OAuth material,
  and overlong values to the existing safe primary-Space fallback. Access checks still run on the
  destination; a return target never bypasses role or Space authorization. The smallest implementation
  likely touches D12-protected `lib/auth/**`, so it is isolated, tested, and surfaced for owner review
  rather than pushed from this audit.
- **Runner-safe entry and fail-closed readiness.** Keep one approved interactive implementation in
  `scripts/session-auth.ps1`, but make its canonical package entry work from every runner documented
  by this repository or fail before authentication with one exact visible owner-shell instruction.
  Never rely on a bare Windows executable being present on WSL PATH. Inside the script, `READY` and a
  zero exit require every independent check to have actually run and passed: managed/service active
  identity, approved Production project, non-printing CLI-token mint, and ADC token mint. A blank or
  wrong identity, missing Node, command-not-found, skipped ADC check, wrong project, or failed child
  command is red even when another token probe succeeds. The caller reruns the three canonical
  preflights after the script; the banner never substitutes for their evidence.
- **Owner dependency (the one external checkpoint).** When Google requires account selection,
  password, consent, or MFA, an existing managed `pmikcmetro.com` Admin completes that screen. The
  facilitator never requests or handles the credential. This is a per-session external checkpoint,
  not permission to create an identity, change a teammate's role, or relax product auth.
- **Controlled-window identity.** Trust only the window/tab currently selected by normal in-app
  control after readback of the canonical origin/path, visible `Admin` role, and visible authenticated
  shell. Another Chrome/Edge window, another profile, a successful gcloud browser flow, or the user's
  statement that they are signed in is not technical proof of the app target. If control moves or the
  target becomes ambiguous, pause and reselect/reverify instead of inspecting browser processes.
- **Independent authentication readback.** A passing proof binds the current controlled app target,
  canonical origin/path, managed-domain result (boolean only), visible `Admin` role and `Sign out`
  state, no visible sign-in control, HTTP 200 with no redirect for Console, Admin, Connections,
  Approval Queue, Notifications, and Maintenance, current Cloud Run service and 100%-traffic revision,
  `ENVIRONMENT_KIND=production`, `DATA_CONTEXT=live`, the managed allowed domain, and Demo auth
  disabled. CLI/ADC preflights are separate evidence and cannot substitute for the browser session.
- **Freshness lease.** A bodyless browser proof is valid for at most 60 seconds for an exact-confirmed
  Live write or destructive operation. The effect owner obtains a new proof after human confirmation
  and immediately before its first commit. Any validation older than five minutes, controlled-target
  change, window switch, app redirect, revision change, or reacquisition invalidates the prior proof.
  Reauthentication preserves the immutable operation manifest and owner confirmation, but the owning
  operation reruns drift and authorization checks before resuming.
- **Saved audit progress.** Before navigation or auth, read the canonical human-response JSON and
  resume state, then inspect the HTML's exact localStorage state through normal in-app control when
  available. Merge by stable `HV-*` id. Existing terminal responses win over `not_run` unless the
  human explicitly replaces one; conflicting terminal results block with bodyless ids/statuses and no
  guessed merge. Missing browser storage is recoverable from disk; malformed storage is a named
  blocker with an export/copy recovery path. No recovery, sign-in, import, or navigation invokes the
  HTML reset control.
- **Short-session checkpoint.** Before every human prompt, persist a bodyless `prepared` checkpoint
  naming one `HV-*` id and whether an effect has started. After each response and corroboration
  attempt, atomically update the canonical response JSON and resume document before replying in chat.
  A prepared action remains `not_run`; terminal results cannot be downgraded. A fresh context can
  resume from disk without replaying a pass or treating an opened page as completed work.
- **No console lease.** Correctness never depends on an all-day terminal, browser-control attachment,
  browser process, agent turn, or local server. Every command is bounded, including
  `npm run auth:session`; the deployed Cloud Run service is the runtime. Before yielding, persist any
  accepted external operation id, exact target, and last readback. A later context re-runs auth,
  deployment, and drift checks and reconciles that operation before retry. No browser process or
  terminal needs to stay open between the user's brief visits.
- **Bodyless browser evidence.** Allowed evidence is origin, pathname, allowlisted control/headings,
  status codes, redirects, role/domain booleans, counts, timestamps, revision, environment labels,
  controlled-target-change boolean, and error class. Do not save, attach, or cite screenshots. Do not
  record raw email, page body, customer title, address, rent, message text, Gmail content, provider
  payload, cookie, browser storage value, token, OAuth URL/query, browser command line, or profile path.
  Ephemeral visual perception used by the app's normal browser control is not audit evidence and must
  not be copied into artifacts. Redaction covers every success, failure, and retry path.
- **Forward and return direction.** Forward is acquire normal in-app target → read back target →
  prepare → one human checkpoint → verify → short-lived proof → effect owner consumes proof. Return is
  effect completion/cancellation → refresh protected routes → persist terminal `HV-*` result → close
  only audit-created tabs if useful → retain disk response and HTML state. Final cleanup removes only
  bodyless transient state; it never resets the HTML or deletes the response without explicit owner
  instruction.
- **Unavailable, denied, failure, and retry behavior.** Wrong-domain, non-Admin, denied route,
  redirect, stale revision, invalid environment, unavailable browser control, ambiguous controlled
  target, unavailable/corrupt storage, or network failure blocks and names one next action. A sign-in
  loop yields the same one human checkpoint; it does not clear cookies or try another account. A Live
  effect that loses its response follows its owning reconciliation contract before retry; refreshed
  auth never implies no-effect.

**Open questions & assumptions.**

- _Answered 2026-08-19 from user feedback:_ a browser window is not trusted merely because it appears
  authenticated. The facilitator focuses and verifies the exact target it controls.
- _Answered 2026-08-19 from observed behavior:_ closing a tab/window does not restart the audit or
  reset local review state. Disk artifacts are the recovery seam; the next normal controlled window
  is verified afresh.
- _Answered 2026-08-19 from observed behavior:_ a long backup/restore validation can outlive the app
  session. A fresh browser proof is required after exact confirmation and within 60 seconds of the
  first Production commit.
- _Answered 2026-08-20 from user feedback:_ the audit is worked in brief intervals. Each interval may
  stop after one atomic human action; the response and exact next action are persisted before yield.
  No terminal or browser keepalive is part of the contract.
- _Answered 2026-08-20 from user direction:_ a new task may consume the canonical resume launcher and
  checkpoint, preserve terminal `HV-*` results, reverify stale external state, and continue the first
  non-terminal dependency-ready item instead of repeating the audit.
- _Answered 2026-08-20 from user direction:_ use the normal browser control in the Codex app. Do not
  build or depend on a custom CDP/Playwright/profile-process controller for human facilitation.
- _Answered 2026-08-20 from user direction:_ `npm run auth:session` may be run when the user is present
  and can interact with the visible terminal/browser flow. It remains forbidden to automate or
  inspect passwords, account-choice secrets, consent, MFA, or recovery inputs.
- _Answered 2026-08-20 from user feedback:_ prior human instructions were too terse and not
  actionable. Each checkpoint now names exactly what is already open, what control to use, what to
  enter when safe, what should appear, where to stop, and how to report the result.
- _Answered 2026-08-20 from user direction:_ presentation uses numbered steps, emoji with text labels,
  and fenced code blocks for safe copy/paste values. These aids never replace accessible text and
  never carry protected/customer/authentication data.
- _Answered 2026-08-20 from user direction:_ the primary reply contract is `PASS` or
  `FAIL — reason: …`; passing friction remains explicitly reportable and is specified even when the
  verification succeeds.
- _Answered 2026-08-20 from observed behavior:_ a WSL-root task cannot assume the bare
  `powershell.exe` name is on PATH. The canonical entry must detect its documented host or stop with
  one owner-shell action; it does not fork the approved authentication workflow.
- _Answered 2026-08-20 from observed behavior:_ a successful gcloud token probe cannot make a blank
  active identity, missing Node command, or unexecuted ADC preflight READY. Readiness is conjunctive
  and fail-closed.
- _Answered 2026-08-22 from observed behavior:_ protected app sign-in must return the user to the exact
  validated same-origin route they requested; falling through to the primary Renewal Desk loses the
  audit target and normal operator context.
- _Protected implementation boundary:_ preserving that route is expected to require a small
  `lib/auth/**` change. It is isolated and surfaced under D12 owner review while every independent S69
  documentation/progress slice continues; it never widens identity, role, scope, or route authority.
- Decision-complete: no product or owner choice remains. Only normal managed Google interaction or
  unavailable in-app browser control can park a live verification visit.

**Cross-product impacts.** The intended surfaces are
`docs/meta-prompts/pmi-kc-human-verification-resume.md`,
`docs/pmi-kc-human-verification-resume-state.md`, the HTML-compatible response schema, the existing
audit HTML import/export seam, `package.json`, `scripts/session-auth.ps1`, `docs/google-setup.md`,
`docs/products/v1-process-qa.md`, and—only if needed—the smallest pure progress-state validator and
its unit test. `FB-HVSESSION-011` additionally reaches `lib/auth/page-guards.ts`,
`app/sign-in/page.tsx`, `components/auth/SignInPanel.tsx`, and their route/return-target tests; the
`lib/auth/**` portion is a D12 protected patch. The existing
`scripts/session-auth.ps1` and `npm run auth:session` are the approved interactive CLI/ADC recovery
path; do not fork them into an audit-specific login tool. `scripts/smoke-live-auth.mjs` remains a
developer smoke utility and is not the human-audit evidence recorder because it saves screenshots and
raw browser/auth context. No repository-owned live browser controller, CDP adapter, Playwright
facilitator, profile/PID/port discovery, or Windows/WSL browser bridge is in scope.

S69 supplies the fresh bodyless browser proof consumed by S56 destructive cleanup and any
S20/S25/S26 exact-confirmed Live effect; it changes none of their effect authority. There is no
customer migration or Production write in S69. Existing
`pmi-kc-model-audit-human-response.v1` exports import without loss. Rollout is one read-only visit
using normal in-app browser control and, when stale, one user-present interactive auth refresh; no
write is rollout evidence. Rollback is reverting documentation/progress-validator changes while
leaving saved responses untouched.

**Adversarial acceptance checks.**

- **AC-S69-1** — normal in-app browser control opens or focuses one canonical PMI KC app target,
  reads back its origin/path and allowlisted shell controls, and identifies that target in the next
  human prompt without inspecting Chrome roots, PIDs, command lines, profile directories, or ports.
  Switching to another window invalidates the readback and requires reacquisition. _Verify:_ one
  read-only app-control rehearsal plus launcher/procedure review.
- **AC-S69-2** — closing the app tab/window and ending the prior task leaves a preexisting
  `HV-012:pass` intact. A fresh task opens a normal controlled window, loads the canonical JSON/resume
  state, optionally merges HTML storage, and preserves the status without requiring the old browser
  process or profile. _Verify:_ progress-state restart test plus one manual close/reopen rehearsal.
- **AC-S69-3** — signed-out state uses normal in-app control to activate only the app's safe sign-in
  entry point, then gives the human one instruction to finish managed sign-in. Password, account
  chooser, consent, MFA, recovery, and setup-link values are never read, filled, copied, logged, or
  retained. Cancel leaves saved audit progress unchanged. _Verify:_ read-only interactive rehearsal
  or fake auth UI plus progress readback.
- **AC-S69-4** — verification passes only when the exact controlled app target has a managed-domain
  boolean, Admin shell, sign-out state, six protected-route 200/no-redirect results, exact serving
  revision, Production+Live descriptor, and Demo-auth-disabled readback. Wrong domain, Editor, one
  302/403/5xx, another window, a revision mismatch, Live-read-only, or Demo auth enabled each produces
  a distinct blocker and no proof. _Verify:_ bodyless unit matrix plus one read-only Production smoke.
- **AC-S69-5** — audit progress load/import/write merges all stable `HV-*` ids, preserves every
  terminal response, round-trips evidence/friction/next-action fields, and never invokes reset.
  Missing browser storage recovers from canonical disk state; malformed/conflicting terminal storage
  blocks and offers export recovery; unknown compatible fields are retained. _Verify:_ focused pure
  progress-state tests.
- **AC-S69-6** — a session proof is bodyless, schema-versioned, and bound to controlled target,
  origin/path, role/domain booleans, revision/environment, protected-route result hash, and
  `verified_at`. An effect boundary accepts it at 59 seconds and refuses it at 60 seconds or after any
  controlled-target, role, origin, route, revision, or descriptor change. Exact confirmation does not
  bypass re-verification. _Verify:_ fake clock/state tests and the S56 proof-consumer test.
- **AC-S69-7** — a protected-route redirect during long validation marks browser auth stale,
  preserves the immutable operation manifest, and blocks every commit. After one human-managed
  sign-in action, a new proof is issued only after all AC-S69-4 checks and the effect owner reruns
  drift/backup checks. _Verify:_ fake effect-boundary test with session expiry before commit.
- **AC-S69-8** — success, denial, timeout, retry, corrupt-state, and exception artifacts contain only
  bodyless allowlisted evidence. Seeding an email, cookie, bearer token, OAuth query, profile path,
  customer-like address, currency value, page body, or saved screenshot makes the redaction test fail
  without echoing the fixture. _Verify:_ `npm run verify:redaction` and focused progress/evidence tests.
- **AC-S69-9** — unavailable normal browser control, a closed controlled window, a user window switch,
  a killed terminal, and a fresh Codex task each stop or recover through the documented states without
  a keepalive or custom browser fallback. Cleanup leaves no audit-owned process/lock while preserving
  response/checkpoint files and any HTML review state. _Verify:_ restart matrix plus one app-control
  rehearsal with every transient process closed between checkpoints.
- **AC-S69-10** — the one-action prompt and any progress/import surface remain keyboard reachable,
  visibly identify the controlled route, announce signed-out/stale/verified states without color
  alone, and do not overflow at 390 CSS pixels or 200% zoom. Existing app sign-in and audit HTML
  landmark/focus tests remain green. _Verify:_ browser accessibility/responsive task plus existing
  sign-in/shell tests.
- **AC-S69-11** — S56 and a fake exact-confirmed Live-effect owner refuse to construct a commit
  client without a fresh AC-S69-6 proof; with a valid proof they still require their own preview,
  exact confirmation, drift, receipt, reconciliation, and rollback gates. Auth refresh never
  generates or replays an effect. _Verify:_ S56 operator-script tests and a pure S20 boundary test.
- **AC-S69-12** — formatting, redaction, context freshness, spec traceability, focused progress tests,
  one normal app-control rehearsal, and the full gate pass. Deliberately trusting a different window,
  aging a proof, deleting one saved human result, introducing a custom CDP fallback, or logging a raw
  OAuth URL makes the named check or procedure review fail. _Verify:_ documentation gates, focused
  tests, then `bash scripts/verify.sh` alone when implementation occurs.
- **AC-S69-13** — after `HV-001:pass` and `HV-012:pass`, a prepared-but-unsubmitted HV-002 action is
  checkpointed as `not_run`. A fresh task with no browser/terminal process reports 2/12 Pass and
  HV-002 next, never replays HV-001, downgrades either pass, or claims HV-002 occurred. Conflicting
  terminal fields block with bodyless diagnostics before another prompt. _Verify:_ clean, stale,
  prepared-only, conflict, and crash-between-writes progress fixtures.
- **AC-S69-14** — after any atomic human step, closing the terminal, controlled browser window, and
  task leaves the canonical response and exact next action recoverable. The next task performs fresh
  CLI/ADC/browser/deployment checks without a local server or keepalive. An accepted fake external
  operation is reconciled by exact id/target before retry; otherwise the prepared action remains
  no-effect. _Verify:_ isolated restart test plus one full close-and-resume rehearsal.
- **AC-S69-15** — the canonical resume launcher says to use the normal browser/computer control in the
  Codex app as the primary and only default facilitation path. It contains no required profile leaf,
  loopback port, PID/process fingerprint, CDP/remote-debugging launch, Playwright attach, or custom
  controller. When normal control is unavailable it asks for one browser-availability action and
  stops rather than improvising a hidden automation path. _Verify:_ launcher text sentinel plus a
  read-only fresh-task rehearsal.
- **AC-S69-16** — after a stale CLI or ADC preflight, and only while the user can interact with the
  visible terminal/browser flow, the facilitator may run `npm run auth:session` unchanged. It does not
  redirect interactive login, asks the user for one managed sign-in action, waits for command
  completion, reruns all three auth preflights, and records only managed/service booleans. When the
  user cannot interact, it does not leave the command waiting and instead asks the user to run that
  exact command visibly. _Verify:_ fake stale/fresh script branches plus one owner-present rehearsal;
  never capture credential input or raw identity output.
- **AC-S69-17** — every human checkpoint renders the required action-card fields: `HV-*` and overall
  progress, exact workflow/route, proof objective, effect boundary, numbered prepared state, one
  current action, exact control label/location, field/value guidance when relevant, expected visible
  result, stop symptoms, return/cleanup expectation, feedback request, and response choices. Removing
  any field or replacing exact labels with generic “continue/check/fill” copy fails the prompt
  sentinel. _Verify:_ launcher/action-card shape test plus representative read-only, field-entry,
  judgment, reversible mutation, and exact-confirmation fixtures.
- **AC-S69-18** — a fixed non-sensitive field value is rendered alone in a fenced `text` block with
  destination label, replace/append rule, case/spacing rule, and submit/no-submit instruction. A
  customer value, credential, TOTP, OAuth material, mail/ticket content, protected manifest, or raw
  provider value is never rendered in that block; its fixture makes redaction fail, and the safe card
  instead names on-screen source and destination controls without reproducing the value. _Verify:_
  action-card privacy matrix plus `npm run verify:redaction`.
- **AC-S69-19** — action cards use numbered steps and emoji paired with explicit text labels, remain
  understandable with emoji stripped, expose one human action only, preserve keyboard/screen-reader
  reading order, and fit at 390 CSS pixels and 200% zoom. A fixture containing two clicks, a click plus
  entry, or entry plus submit in one card is rejected. _Verify:_ prompt-lint unit test and
  accessibility/responsive browser review.
- **AC-S69-20** — every action card ends with copy-ready `PASS`, `PASS — friction: …`, and
  `FAIL — reason: …` examples; applicable cards may add reasoned Blocked/Skipped. `pass` records a
  candidate Pass, while fail/blocked/skipped without a reason triggers one narrow follow-up and does
  not advance. The facilitator corroborates before terminal write, preserves the user's wording, and
  emits separate feedback ids for every friction point. _Verify:_ response-parser/state fixtures for
  casing, punctuation, missing reason, compound friction, contradiction, and corroboration failure.
- **AC-S69-21** — the canonical `auth:session` entry invokes the same approved
  `scripts/session-auth.ps1` from each repository-documented Windows and WSL runner without assuming a
  bare Windows executable is on WSL PATH. A fake WSL host with the standard absolute Windows
  PowerShell executable present starts that script with interactive streams intact; an unsupported or
  missing host exits nonzero before gcloud/browser work and emits one exact visible owner-Windows-shell
  instruction. No second auth script, PATH mutation, hidden wait, or browser controller is created.
  _Verify:_ `npm test -- tests/unit/session-auth-entrypoint.test.mjs`; keep
  `tests/unit/preflight-adc.test.mjs` green.
- **AC-S69-22** — `scripts/session-auth.ps1` exits zero and prints `READY` only when a captured result
  proves a managed/service active identity, approved Production project, successful non-printing CLI
  token mint, and an actually executed successful ADC preflight. Fake blank/personal identity,
  wrong/blank project, missing Node, command-not-found, stale CLI, stale ADC, and a successful token
  probe paired with any failed check each exit nonzero and never print READY. Output exposes only
  managed/service, project-approved, and check-status booleans. _Verify:_
  `npm test -- tests/unit/session-auth-entrypoint.test.mjs tests/unit/preflight-adc.test.mjs`.
- **AC-S69-23** — a signed-out request for `/lease-renewal/live` reaches sign-in with one normalized
  relative return target and, after successful managed session establishment, returns to exactly
  `/lease-renewal/live` rather than the default `/lease-renewal/live/desk`. An allowlisted query such
  as a bodyless flag key round-trips; absolute, cross-origin, protocol-relative, traversal, fragment,
  credential-bearing, OAuth-material, sign-in-loop, and overlong fixtures each fall back to the safe
  primary Space. The destination reruns ordinary role/Space guards, cancellation changes no app data,
  and no return value enters logs or evidence. _Verify:_ focused page-guard/sign-in return-target
  matrix plus `tests/unit/page-guards.test.ts`, `tests/unit/auth-session-route.test.ts`, and
  `tests/unit/route-auth-boundary.test.ts`.

- **AC-S69-24** — the lane declares an HV triage table covering all twelve `HV-*` ids, each assigned
  exactly one class from `browser_executable_no_effect`, `owner_decision`, `second_party_required`,
  `hardware_required`, `effect_gated`, `terminal`. A fixture that omits an id, adds an unknown id, or
  assigns two classes to one id fails by naming that id. _Verify:_
  `tests/unit/audit-unattended-lane.test.mjs`.
- **AC-S69-25** — before any per-item work the runner reads back the exact controlled target and
  refuses unless origin, pathname, managed-domain boolean, visible Admin role, and Demo-auth-off all
  match the expected target. A readback on `/` or `/sign-in` yields a named blocker and never a
  candidate Pass, reproducing the four-session `HV-002` failure as a test rather than a session.
  _Verify:_ `tests/unit/audit-unattended-lane.test.mjs`.
- **AC-S69-26** — the bodyless evidence recorder accepts only the allowlisted field set (origin,
  pathname, allowlisted control/heading text, status code, redirect, role and domain booleans, counts,
  timestamps, revision, environment label, target-change boolean, error class). A record carrying an
  email, cookie, token, OAuth query, street address, currency value, page body, or screenshot path is
  rejected, and the rejection names the offending field key **without echoing its value**. _Verify:_
  `tests/unit/audit-unattended-lane.test.mjs` and `npm run verify:redaction`.
- **AC-S69-27** — the response writer merges by stable `HV-*` id and never downgrades a terminal
  result. `HV-001` at `pass` fed an incoming `HV-001` at `not_run` blocks with a bodyless diagnostic
  naming the id and both states; it does not overwrite, silently keep, or average them. _Verify:_
  `tests/unit/audit-unattended-lane.test.mjs`.
- **AC-S69-28** — an `effect_gated` item advances to its confirmation boundary and stops. A fixture in
  which the confirmation control is present and enabled still yields `stopped_at_boundary`, never
  `confirmed`. `HV-008` yields `refused` citing `D33` / `F-DIRECT-NOTICE-SEND-NEVER` under every
  fixture, flag, and prompt. _Verify:_ `tests/unit/audit-unattended-lane.test.mjs`.
- **AC-S69-29** — every committed effect carries a reversal proven by readback inside the same run.
  `HV-007`'s created record reads back absent after cleanup, and `HV-009`'s Gmail push-watch reads back
  stopped. A fixture whose reversal readback still shows the effect present yields a failure, not a
  pass. _Verify:_ `tests/unit/audit-unattended-lane.test.mjs`.
- **AC-S69-30** — the four `owner_decision` ids (`HV-004`, `HV-005`, `HV-010`, `HV-011`) are emitted as
  one batch packet, each entry carrying the question, prepared findings, a recommended answer, and the
  effect of each choice. A packet missing any of the four, or splitting them across more than one
  emission, fails. _Verify:_ `tests/unit/audit-unattended-lane.test.mjs`.
- **AC-S69-31** — interrupting the run mid-item leaves the response JSON and resume state readable and
  reconcilable, with the interrupted id still `not_run`, no invented completion, and no terminal Pass
  replayed on resume. If controller attachment fails, the run emits exactly one named blocker and exits
  without a keepalive, browser process, local server, or held-open shell. _Verify:_
  `tests/unit/audit-unattended-lane.test.mjs`.

- **AC-S69-32** — the sign-in path establishes a managed session in a browser that blocks popups. A
  popup-blocked fixture reaches an authenticated session through a redirect fallback that preserves
  the validated return target, rather than rendering a terminal `auth/popup-blocked` state on
  `/sign-in`. Until that fallback exists, an unattended run in a popup-blocking browser emits the
  named blocker `AUTH_POPUP_BLOCKED` and does not retry. _Verify:_ focused sign-in fallback matrix
  plus `tests/unit/audit-unattended-lane.test.mjs`.
- **AC-S69-33** — the lane never claims a stop boundary where none exists. For any effect-bearing
  control whose severity path has no confirmation dialog, the outcome is `no_safe_boundary` and the
  runner does not approach the control; when severity is unknown the lane assumes no boundary rather
  than the convenient case. A fixture at Low or Medium severity that returns `stopped_at_boundary`
  fails. _Verify:_ `tests/unit/audit-unattended-lane.test.mjs`.
- **AC-S69-34** — an effect whose reversal cannot be produced by a shipped control is refused, not
  committed. A fixture asserting commit authority for an item with no reversal path still yields
  `refused`, and the refusal names the missing reversal. This holds even when a standing authority
  document grants the commit. _Verify:_ `tests/unit/audit-unattended-lane.test.mjs`.
- **AC-S69-35** — evidence cannot be recorded without a verified target, and an item the lane refuses
  to commit still reaches the owner. A record offered without a prior successful target verification
  is rejected; a refused effect-gated id is admissible to the batch packet under the same four-field
  bar as an owner-decision id, so refusing to commit never strands an item without a route to
  terminal. _Verify:_ `tests/unit/audit-unattended-lane.test.mjs`.

**Forbidden actions / hard gates.** No autonomous, scheduled, bulk, or model-triggered client-facing
send. No client-facing effect or Live system-of-record write without its owning human initiation,
exact confirmation, preview, receipt, reconciliation, and rollback contract. Never request, view,
type, copy, store, or log a password, token, cookie, TOTP, recovery code, setup link, raw OAuth URL,
or personal account. Never save Gmail bodies, provider payloads, customer values, screenshots, or raw
browser/auth output as evidence. Never trust another window, clear browser state to fix sign-in,
reset the HTML, change a real role, or create a test identity. A repository-driven browser controller is authorized for the
unattended lane by `FB-HVSESSION-012`; it starts from exactly one owner-controlled sign-in, never
automates a credential step, and never treats an unverified target as a Pass. No Product Demo or invented record enters Production. No
S69 code may touch no provider effect, Action Registry gate, `firestore.rules`, IAM, billing, scopes,
credentials, or destructive operation. The one `FB-HVSESSION-011` return-target patch that reaches
`lib/auth/**` is isolated, fully verified, and surfaced for D12 owner review rather than pushed from
the audit. The S52 ceiling and all send/write safety invariants remain unchanged.
Never put a protected/customer/authentication value in a copy block, and never disguise two human
actions as numbered substeps. Emoji never substitutes for an accessible text label. A bare failure
without a reason is not silently converted into a terminal audit result. Never accept a session-auth
`READY` banner when any required child check did not execute or pass; a token mint alone is not
identity, project, or ADC proof.

**Ordered prompt sequence.**

1. _Discovery:_ read the feedback index, audit HTML storage/response schema, `package.json`, existing
   `scripts/session-auth.ps1`, auth facts/runbook, process-audit auth cases, and current progress tests.
   Reproduce the documented Windows/WSL entry matrix and conjunctive readiness checks. Confirm the
   normal in-app browser-control capability; do not design another controller.
2. _Understanding:_ define bodyless controlled-target readback, the 60-second effect proof, canonical
   disk checkpoint, stable-`HV-*` merge rules, action-card schema, sensitive-value classification, and
   result grammar. Treat window/process continuity as untrusted.
3. _Build:_ implement only missing progress-state validation/import/readback and documentation
   sentinels. Keep reset unavailable and preserve all compatible response fields.
4. _Build:_ document normal in-app navigation and one-action app sign-in preparation. Reuse
   `npm run auth:session` for user-present CLI/ADC recovery; create no audit-specific login command.
   Prepare and falsify the validated return-target patch separately under the D12 review boundary.
5. _Build:_ add exact action-card examples and prompt sentinels for clicks, field entry, judgment,
   reversible mutation, exact confirmation, failure reason, and passing friction. Reject bundled
   actions and protected values in copy blocks.
6. _Build:_ integrate bodyless managed/Admin/protected-route/revision/environment freshness proof at
   S56 and fake Live-effect boundaries without widening those effects.
7. _Falsify:_ exercise wrong controlled window, closed window, unavailable in-app control, wrong
   domain/role, redirect/5xx, expired proof, auth-session fresh/stale/cancel branches, WSL without a
   bare PowerShell PATH entry, blank/wrong identity or project, missing Node, a token-only false pass,
   corrupt storage, forbidden evidence, vague instructions, bundled clicks/entries, missing failure
   reason, revision drift, task termination, and external-operation reconciliation.
8. _Verify:_ run focused progress/action-card/auth-doc/accessibility/responsive/redaction tests, then
   the full gate alone. Run one read-only Production visit with normal in-app control; perform no
   effect as rollout evidence.
9. _Context update:_ update feedback traceability and append a verified fact only after permanent
   progress tooling/docs and read-only rehearsal pass. Never present the earlier custom profile/CDP
   workaround as the S69 target architecture.

**Deletion/merge recommendation.** KEEP as the durable contract for interactive human-audit browser,
progress, auth recovery, and freshness reliability. Prefer deletion or non-creation of any proposed
custom browser controller, profile/port control record, or audit-specific auth wrapper. The audit
launcher consumes this suite; disposable plans are deleted after a terminal verified implementation.
