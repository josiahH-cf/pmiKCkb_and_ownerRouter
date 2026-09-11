# S112 — Local authentication and release continuity

Status: RELEASE VERIFIED / SEPARATE LONGEVITY OPEN. Owner-approved revision: 2026-09-08. Existing login implementation
at `30d21482e3f0fee5cb516f3f6b83c92b1e1f350a` is preserved and revised by the explicit local-host
plan. Implementation is not evidence of enrollment, long-session survival, deployment or promotion.

## Problem and outcome

Long verification and release runs lose CLI/ADC authentication. The Windows sign-in command
previously refreshed a different store from the WSL app. The owner chose the existing managed
account and this host, with exact identity checks, one recovery command, independent work during
human holds, and automatic exact-SHA delivery through the existing release gates.

## Authority and scope

The owner's 2026-09-08 decisions supersede the earlier automation-user, service-account
impersonation, separate secret-template, IAM-audit, federation and private-runner proposal:

- Use `josiah@pmikcmetro.com` for local unattended development and release in WSL.
- The owner applies an account-scoped Google Cloud session-policy exception and fresh enrollment.
- Preserve the existing ignored provider configuration and WSL home credential store.
- Keep claim-less managed accounts Editor with all Spaces. No runner-created identity or claim.
- Verification accounts retain their displayed role while the server refuses business effects.
- Use this host for the local release watcher, including catch-up after login/restart.
- Do not edit client deliverables until the foundation passes.

Human confirmation, exact open action keys, one-attempt claims, receipts, readback, correction,
closed sends, protected paths and cost controls remain in force. The runner never enters a person's
password, code, passkey or CAPTCHA. A canary verifies and never performs a business effect.

## Current implementation and external seams

`scripts/auth/ensure.mjs` separates status inspection from ordinary library refresh. Local
identity/store inspection precedes token probes; an unresolved identity cannot pass. gcloud's ADC
file has an empty account field, so interactive enrollment reads Google's identity and binds the
exact ADC bytes beside the WSL credential store. That local evidence and all credentials stay out
of Git, uploads, logs and reports. `auth:session`, `auth:enroll` and `auth:enroll:wsl` target WSL;
the PowerShell compatibility script delegates to WSL.

Server enforcement is in `lib/auth/canary-policy.ts`, `lib/auth/session.ts` and `proxy.ts`.
Authentication and logout remain available. Reviewed read-only POST queries remain available;
stateful GET reconciliation and OAuth callback are effects. Local rehearsal applies its
request-level effect refusal first and accepts only its existing server-gated Demo session path;
Production never enables that exception. The corrected path passed 77 focused tests and the
31-test core E2E run with 18 emulator-dependent skips and refused external sources. The request boundary covers page
server actions as well as APIs. No role is rewritten to impose verification restrictions.

The delivery implementation uses `scripts/release-watcher-plan.mjs` and
`scripts/release-watcher.mjs`. A clean isolated checkout, exact-SHA push CI, serialized durable
checkpoint, exact candidate readbacks, assurance receipt, promotion and observation each have
separate outcomes. An uncertain provider result never authorizes a second deployment or promotion.

The existing limited interactive-user task `PMI KC release watcher` retains its logon/catch-up/
one-instance contract. The real serialized driver completed SHA `f5faf1665121db9cacff913a57e7fdcc80513116` / `pmi-kc-app-rmtwdl4di-4439f17911f4` after exact
CI 34556917662, candidate/readback/domain gates, Admin assurance, v4 receipt-bound promotion and 300,000 ms
observation. Older unfinished candidates were archived honestly. No new identity, claim or store
was created. Monitoring configuration retains its existing managed recipient independently of login.
Fresh-shell and paired post-reboot CLI/ADC refresh passed as the approved account using unchanged
enrollment, without login or browser. The post-reboot app ADC preflight exited 0. An unavailable
Google identity lookup gets one bounded retry and stays blocked with accurate guidance if it fails;
61 focused auth tests pass. The required 24-hour elapsed-session acceptance remains pending.
B-AUTH2 remains only the separate 24-hour longevity proof; exact candidate/canonical Admin
assurance passed under the owner-approved policy. Editor remains not_run with backend restrictions preserved. B-GOLD1 closed after owner-reviewed live
source evidence and one expected-label correction; the original capture, all source values and
all assertions are preserved. The watcher separately configures the existing managed monitoring
recipient, refusing missing/conflicting values without changing the approved local identity.

## Architecture outcome (deterministic, fail-first)

- **ARCH-S112-1** — One credential planner reports ready, blocked or unverified. Status performs no
  token refresh, config repair or browser operation. Development/release and later assurance phases
  preflight independently; a human hold preserves the phase and independent work continues.
- **ARCH-S112-2** — CLI/ADC accept only the approved local managed identity. Unknown identity,
  another managed account, a personal account, impersonation, wrong store and key files refuse
  before cloud work. Environment overrides cannot widen the identity policy.
- **ARCH-S112-3** — Token probes discard output and provider errors reduce to closed error codes.
  Credential material never enters logs, Git, receipts or reports.
- **ARCH-S112-4** — Reuse ignored provider configuration. Private verified golden captures are read
  from their original excluded location in native and direct runs, never copied into CI or uploads.
- **ARCH-S112-5** — Enrollment, browser smokes and assurance share the Linux browser resolver.
  A Windows executable cannot be used with a WSL profile. Profiles stay outside the repository.
- **ARCH-S112-6** — The runner never changes IAM, identities, claims, organizational placement or
  session policy. The local watcher does not grant itself access to satisfy any phase.
- **ARCH-S112-7** — Canary evidence reports the actual session method and role. Exact managed
  profile/origin coverage and server refusal of business effects precede promotion.

## Behavior outcome (deterministic, fail-first)

- **BEH-S112-1** — Fresh-shell and reboot checks pass with the approved local credentials. Normal
  library refresh succeeds beyond the former session boundary, including a 24-hour elapsed proof.
  Until actually observed, these checks remain pending. Google may still require human enrollment.
- **BEH-S112-2** — The local watcher deploys only runtime/served-asset changes after successful push
  CI for that exact main SHA, from a clean isolated checkout. The development worktree is unchanged.
- **BEH-S112-3** — Enrolled browser profiles regain app sessions without credential entry. A fresh
  or challenged profile stops at `human_required` with one enrollment command.
- **BEH-S112-4** — The existing owner Admin profile authenticates on both exact candidate and canonical
  origins under the September 10 owner amendment. Editor browser is not required and is recorded
  not run; backend Editor authorization remains tested. The complete receipt passes before promotion.
- **BEH-S112-5** — An auth failure names one recovery command, stops only the dependent phase and
  does not loop interactive login or restart a comprehensive run.
- **BEH-S112-6** — Canary reads and displayed roles remain intact; business effects return 403
  `canary_read_only` before route/executor/writer execution. Login and logout remain available.
- **BEH-S112-7** — Exact candidate smoke, configuration fingerprint, domain replacement, unchanged
  traffic, receipt, promotion and 300,000 ms observation have independent verified outcomes.
  Remove a blocker only after its actual completion evidence exists.

## Adversarial acceptance checks

- **AC-S112-1** — Missing/stale credentials preserve the checkpoint and give one WSL recovery
  command. No unattended browser login attempt, credential copying or repeated comprehensive run.
- **AC-S112-2** — Reject wrong identity, unknown ADC identity, another store, impersonation and keys.
  The specifically approved local account passes unattended after verified enrollment.
- **AC-S112-3** — No credential typing, capture or logging. No automation-account setup or grant.
- **AC-S112-4** — Exact profile/origin and receipt identity are required. Report actual session
  methods (`existing_session`, `google_session_reuse`, `human_completed`), never invent reuse.
- **AC-S112-5** — Failed/wrong-SHA CI, duplicate release, missing auth or assurance receipt cannot
  dispatch an effect. Restart reconciles an uncertain exact revision before any repeat attempt.
- **AC-S112-6** — Native and direct golden coverage agree. B-GOLD1's existing assertion and
  ambiguous-join refusal remain unchanged; source provenance or a human-reviewed label resolves it.
- **AC-S112-7** — S97, S98, access application, drafts, stateful reads and page server actions refuse
  canary effects. **Owner-approved correction:** session DELETE clears the cookie and succeeds;
  the old requirement that logout return 403 was contradictory and is superseded explicitly.
- **AC-S112-8** — Current governance and blockers describe actual checks and pending enrollment,
  reboot, elapsed-time and release proof. No claim that a written procedure makes auth unblocked.

## Requirement-to-outcome traceability

| Requirement                             | Architecture             | Behavior               | Deterministic evidence                                                                                |
| --------------------------------------- | ------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------- |
| Exact local identity before refresh     | ARCH-S112-1, ARCH-S112-2 | BEH-S112-1, BEH-S112-5 | auth-plan, auth-local-foundation, auth-probe-order, auth-identity-lookup and preflight-identity tests |
| No secret or identity-grant side effect | ARCH-S112-3, ARCH-S112-6 | BEH-S112-5             | auth-no-credential-entry and credential-store tests; protected-path audit                             |
| Consistent isolated verification        | ARCH-S112-4, ARCH-S112-5 | BEH-S112-2, BEH-S112-3 | golden-capture-location, unit-test-runner, shared-browser-resolver tests                              |
| Read-only verification accounts         | ARCH-S112-7              | BEH-S112-4, BEH-S112-6 | canary-request-boundary and auth-session tests; live browser proof pending                            |
| Safe automatic delivery and recovery    | ARCH-S112-1, ARCH-S112-6 | BEH-S112-2, BEH-S112-7 | release-watcher and existing release/assurance tests; actual S113 exact release proof passed          |

## Human litmus outcome

**If this was built correctly:** after owner enrollment, a local run can finish without repeatedly
asking for sign-in. When Google requires a person, the app's delivery phase stays at its checkpoint,
independent work continues and the owner receives one recovery command. Business effects retain
all their recorded human controls.

- Model verdict: pending complete foundation checks and external proof.
- Human verdict: NOT RUN. Machine-observed paired post-reboot CLI/ADC refresh passed with unchanged
  enrollment. The 24-hour elapsed-session proof remains unverified; S113 exact release acceptance passed.

## Owner recovery and preservation

In WSL at the repository, run `npm run auth:session -- --browser` for Google's direct callback,
or `npm run auth:session` for the manual code flow. Keep that command running while completing
Google sign-in; return only readiness status. The account-scoped session-policy change is an owner action under Google's
[Cloud session-control documentation](https://knowledge.workspace.google.com/admin/security/set-session-length-for-google-cloud-services).
A policy change can take up to 24 hours and does not prove indefinite token validity.

Preserve `bash scripts/verify.sh`, full golden assertions, core E2E deadlines, all seven browser
smokes, monitoring readback and the existing release/rollback gates. No documentation-only deploy,
identity grant, action-key activation, autonomous send or cost-control change is part of this suite.
