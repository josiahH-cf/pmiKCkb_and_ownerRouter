# Vendor authentication production configuration — 2026-07-15

## Verified configuration

Read-only inspection and narrow field-masked updates were run as
`josiah@pmikcmetro.com` against `pmi-kc-kb-prod`. No token, password, setup link, TOTP seed, full
Identity Platform configuration, or customer value was printed or retained.

Final readback after the narrow MFA correction at `2026-07-15T11:03:45Z` returned:

- Email authentication enabled: `true`;
- password required: `true`;
- global MFA state: `ENABLED`;
- TOTP provider state: `ENABLED`;
- TOTP adjacent intervals: `1`;
- canonical host `pmi-kc-kb-demo-kq6wuvpiva-uc.a.run.app` authorized: `true`; and
- existing Google provider still enabled: `true`.

Email/Password and the TOTP provider were enabled first. A subsequent readback found that the
top-level MFA state was still `DISABLED`; the corrected field-masked update explicitly set both
`mfa.state: ENABLED` and the enabled TOTP provider, then read both fields back. The canonical hostname
and Google provider were already correct and were not broadly reconfigured. `ENABLED` makes MFA
available; the application still requires enrollment and challenge only at the external Vendor
boundary.

## Change boundary and rollback

The Email/Password update mask contained only
`signIn.email.enabled,signIn.email.passwordRequired`. The corrected TOTP change used `updateMask=mfa`
with `mfa.state: ENABLED`, the single enabled TOTP provider, and one adjacent interval after verifying
no other MFA provider was present. Cloud Audit Logs record the update as
`google.cloud.identitytoolkit.admin.v2.ProjectConfigService.UpdateConfig` by
`josiah@pmikcmetro.com`; no secret material was logged or retained.

If a Vendor-auth incident requires rollback, first disable Vendor provisioning/session routes and
revoke affected sessions. Then disable the affected provider configuration using a separately
reviewed field-masked change; do not disturb staff Google sign-in or the authorized production host.

Official references:

- [Identity Platform projects.updateConfig](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects/updateConfig)
- [Identity Platform Config fields](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/Config)
- [Firebase TOTP MFA](https://firebase.google.com/docs/auth/web/totp-mfa)
