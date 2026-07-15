# Vendor authentication production configuration — 2026-07-15

## Verified configuration

Read-only inspection and narrow field-masked updates were run as
`josiah@pmikcmetro.com` against `pmi-kc-kb-prod`. No token, password, setup link, TOTP seed, full
Identity Platform configuration, or customer value was printed or retained.

Safe verification at 2026-07-15T05:12-05:00 returned:

- Email authentication enabled: `true`;
- password required: `true`;
- TOTP provider state: `ENABLED`;
- TOTP adjacent intervals: `1`;
- canonical host `pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app` authorized: `true`; and
- existing Google provider still enabled: `true`.

Both Email/Password and TOTP changed from disabled to enabled. The canonical hostname and Google
provider were already correct and were not broadly reconfigured. Project-wide mandatory MFA was not
enabled; the application requires TOTP only at the external Vendor boundary.

## Change boundary and rollback

The Email/Password update mask contained only
`signIn.email.enabled,signIn.email.passwordRequired`. The TOTP change used the documented `mfa`
provider configuration with one adjacent interval after verifying no other MFA provider was present.

If a Vendor-auth incident requires rollback, first disable Vendor provisioning/session routes and
revoke affected sessions. Then disable the affected provider configuration using a separately
reviewed field-masked change; do not disturb staff Google sign-in or the authorized production host.

Official references:

- [Identity Platform projects.updateConfig](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects/updateConfig)
- [Identity Platform Config fields](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/Config)
- [Firebase TOTP MFA](https://firebase.google.com/docs/auth/web/totp-mfa)
