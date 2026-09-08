# Authentication and identity

Updated: 2026-09-08.

## Identity classes

- Internal staff: verified Google identity in `pmikcmetro.com`, server-issued session, explicit role
  and optional Space scopes.
- Vendor: separate Vendor claim tuple and assignment boundary; never inherits internal defaults.
- Runtime/build/connectors: project service identities.
- Local runner, attended or unattended (S112): only the approved `josiah@pmikcmetro.com` account
  using its existing WSL CLI/ADC store. No impersonation, new identity, claim or IAM grant.
- Verification canaries (S112): `canary-admin@pmikcmetro.com` and `canary-editor@pmikcmetro.com`,
  signed in by the assurance harness from enrolled browser profiles; they never act.

Personal accounts and downloaded service-account keys are forbidden; the project's org policies
block key creation and upload, and every preflight refuses `GOOGLE_APPLICATION_CREDENTIALS`.

## Server boundary

Every protected route verifies the session server-side. Deny missing, malformed, expired, revoked,
wrong-domain, non-Google, stale-role, and Vendor-drift states. The browser never supplies authority.

Roles are Admin, Approver, and Editor. Per-person approval authority beyond those current rules is S64
and is not authorized. Claim-less managed accounts remain Editor with all Spaces by owner ruling.
Verification accounts retain their displayed roles while server boundaries refuse business effects;
authentication, logout and genuine reads remain available. Local Demo cookies use their existing
server-gated rehearsal path only outside Production, after the request-level effect refusal.

## Local and production

- Production pins `ALLOWED_HD=pmikcmetro.com`, Production + Live, and both Demo flags false.
- Local rehearsal may use local sign-in convenience only outside Production; provider effects remain
  request-level refused.
- ADC is the only library credential. `GOOGLE_APPLICATION_CREDENTIALS` stays unset.
- Cloud Run uses its attached runtime service account.

## Unattended authentication

Authentication is pre-approved (`AGENTS.md`, Authentication). `npm run auth:ensure` is the entry
point for local work. It verifies the exact identity/store before ordinary token probes;
`auth:status` inspects only and never calls unprobed freshness ready. All enrollment commands
(`auth:session`, `auth:enroll`, `auth:enroll:wsl`) target WSL; PowerShell delegates there.
The owner applies the account-scoped Cloud session-policy exception and completes Google enrollment.
ADC's blank account field requires locally bound enrollment evidence before its token probe.
The runner never changes that policy, types a password/code/passkey, completes a CAPTCHA or copies
a person's cookies/profile. A human hold pauses only dependent work with one recovery command.

Existing canary profiles enroll on both exact origins through `npm run auth:enroll-canary` and
reuse sessions through `npm run auth:ensure -- --need=canary`. After a challenge the local release
watcher waits for a new attended enrollment marker; it does not repeat browser login attempts.
The contract is `docs/feature-suites/unattended-authentication.md`.

## Verification

```bash
npm run auth:ensure
npm run preflight:identity
npm run preflight:adc
```

`preflight:identity -- --unattended` accepts only the approved local account. `preflight:adc`
delegates to the same identity/store guard and emits bodyless failures. Browser ADC enrollment,
fresh-shell and paired post-reboot refresh, and the app ADC preflight passed as the approved account
on 2026-09-08. The reboot proof reused unchanged enrollment without login or browser. An unavailable
Google identity lookup gets one bounded retry, then stays blocked without discarding the binding.
`auth:session -- --browser` uses Google's callback without copying a code. The required 24-hour
elapsed-session proof remains pending. A release additionally
reads back the Cloud Run service account, Firebase provider/domain state when changed, and the exact
deployed descriptor. Never print tokens, cookies, UIDs, or credential bodies.
