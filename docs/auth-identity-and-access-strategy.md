# Authentication and identity

Updated: 2026-08-26.

## Identity classes

- Internal staff: verified Google identity in `pmikcmetro.com`, server-issued session, explicit role
  and optional Space scopes.
- Vendor: separate Vendor claim tuple and assignment boundary; never inherits internal defaults.
- Runtime/build/connectors: project service identities.
- Runner: managed `pmikcmetro.com` Cloud CLI/ADC/Firebase identity.

Personal accounts and downloaded service-account keys are forbidden.

## Server boundary

Every protected route verifies the session server-side. Deny missing, malformed, expired, revoked,
wrong-domain, non-Google, stale-role, and Vendor-drift states. The browser never supplies authority.

Roles are Admin, Approver, and Editor. Per-person approval authority beyond those current rules is S64
and is not authorized.

## Local and production

- Production pins `ALLOWED_HD=pmikcmetro.com`, Production + Live, and both Demo flags false.
- Local rehearsal may use local sign-in convenience only outside Production; provider effects remain
  request-level refused.
- ADC is preferred. `GOOGLE_APPLICATION_CREDENTIALS` stays unset.
- Cloud Run uses its attached runtime service account.

## Verification

```bash
npm run preflight:identity
npm run preflight:adc
```

A release additionally reads back the Cloud Run service account, Firebase provider/domain state when
changed, and the exact deployed descriptor. Never print tokens, cookies, UIDs, or credential bodies.
