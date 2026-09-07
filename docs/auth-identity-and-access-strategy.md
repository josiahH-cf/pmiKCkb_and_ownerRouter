# Authentication and identity

Updated: 2026-09-07.

## Identity classes

- Internal staff: verified Google identity in `pmikcmetro.com`, server-issued session, explicit role
  and optional Space scopes.
- Vendor: separate Vendor claim tuple and assignment boundary; never inherits internal defaults.
- Runtime/build/connectors: project service identities.
- Runner, attended: a managed `pmikcmetro.com` person's Cloud CLI/ADC/Firebase identity.
- Runner, unattended (S112): the automation principal `pmi-runner@pmikcmetro.com` impersonating
  `pmi-kc-automation@pmi-kc-kb-prod.iam.gserviceaccount.com`; it never signs into the app.
- Verification canaries (S112): `canary-admin@pmikcmetro.com` and `canary-editor@pmikcmetro.com`,
  signed in by the assurance harness from enrolled browser profiles; they never act.

Personal accounts and downloaded service-account keys are forbidden; the project's org policies
block key creation and upload, and every preflight refuses `GOOGLE_APPLICATION_CREDENTIALS`.

## Server boundary

Every protected route verifies the session server-side. Deny missing, malformed, expired, revoked,
wrong-domain, non-Google, stale-role, and Vendor-drift states. The browser never supplies authority.

Roles are Admin, Approver, and Editor. Per-person approval authority beyond those current rules is S64
and is not authorized.

## Local and production

- Production pins `ALLOWED_HD=pmikcmetro.com`, Production + Live, and both Demo flags false.
- Local rehearsal may use local sign-in convenience only outside Production; provider effects remain
  request-level refused.
- ADC is the only library credential. `GOOGLE_APPLICATION_CREDENTIALS` stays unset.
- Cloud Run uses its attached runtime service account.

## Unattended authentication

Authentication is pre-approved (`AGENTS.md`, Authentication). `npm run auth:ensure` is the entry
point every shell runs first; it repairs what it can without a browser and names one human step
otherwise. Each shell enrolls its own credential store once (`npm run auth:enroll` on Windows,
`npm run auth:enroll:wsl` in WSL) with the owner completing Google in a browser; the runner never
types a password, one-time code, or passkey, never completes a CAPTCHA, and never copies a person's
cookies or profile. Canary browser sessions are enrolled once per origin with
`npm run auth:enroll-canary` and re-established unattended with `npm run auth:ensure -- --need=canary`.
The contract is `docs/feature-suites/unattended-authentication.md`.

## Verification

```bash
npm run auth:ensure
npm run preflight:identity
npm run preflight:adc
```

`preflight:identity -- --unattended` passes only for the automation identity. A release additionally
reads back the Cloud Run service account, Firebase provider/domain state when changed, and the exact
deployed descriptor. Never print tokens, cookies, UIDs, or credential bodies.
