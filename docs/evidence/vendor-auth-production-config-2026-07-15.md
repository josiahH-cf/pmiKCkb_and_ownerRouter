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

## Locally verified Test Vendor recovery boundary

The exact current local candidate adds a repeatable authentication reset/re-enable action without
changing the production Identity Platform configuration above. It is pending deployment and human
secret-bearing acceptance.

- Only an Admin can initiate it, with a plain-English reason and an exact preview bound to the
  canonical `.invalid` Test Vendor's current Firebase UID, status, and invite version.
- It supports `pending_setup`, `active`, and `disabled`. It rotates the Firebase UID, increments the
  invite version, returns the Vendor record to `pending_setup`, clears TOTP/activation state, and
  returns one HTTPS setup link only in a `no-store` response.
- The stable Vendor id, Test tickets, assignments, mailbox history, and completed receipts persist.
  The previous password, TOTP factors, sessions, action links, and UID-bound confirmations no longer
  authorize the replacement identity.
- A random per-request transactional claim and two-minute lease fence follows `claimed → prepared →
completed`. The winning initial claim writes one bodyless
  `test_vendor_authentication_reset_claimed` audit; the successful UID-swap transaction writes one
  canonical bodyless `test_vendor_authentication_reset` audit per invite-version increment. A failure
  after claim but before the swap therefore retains claim evidence without falsely recording a
  completed reset. Overlap/completed replay stops before auth mutation, expired takeover starts only
  after the deployed request lifetime, and compensation runs only while still owned.
- After a crash at `prepared`, a normal Admin reload/re-preview binds the marker's original source
  UID/status/invite-version tuple without returning the UID. While the lease is live, only the original
  reason reproduces the same confirmation hash/effect; a different reason or takeover refuses. After
  expiry, a fresh Admin reason may rebind that validated original tuple and atomically writes one
  distinct bodyless `test_vendor_authentication_reset_recovery_claimed` audit for the takeover.
- Expired takeover hardens, revokes, and deletes an abandoned exact-claims Auth principal rather than
  adopting it. The fresh UID must differ from the source UID, Firestore record UID, and resolved Auth
  UID; a forbidden allocation is deleted and rejected. A prepared repair retains its one canonical
  reset audit and invite-version increment; its separate recovery-claim audit records the takeover,
  not a duplicate reset. Delayed old-owner enable/completion cannot mint another link or affect the
  winner. Live, arbitrary, drifted, provider-connected, or wrong-email/claim/mode identities refuse
  before mutation.
- Disable and reset use the same lifecycle transaction boundary. Claimed/prepared reset makes disable
  return 409 before Firebase/audit even after lease expiry; disable-first invalidates the old reset
  preview but permits a fresh disabled-state reset; completed reset permits later disable.
- Every Test mailbox read, draft/label write, confirmation creation, and reply commit transactionally
  revalidates the active Vendor UID, active assignment, Test ticket/thread/mailbox join, and absence of
  a claimed/prepared reset. Disable, deassignment, UID rotation, or reset claim therefore revokes stale
  access before mailbox state, message content, or receipt changes.
- Setup-link regeneration uses the same audit distinction: its winning claim writes bodyless
  `test_vendor_setup_link_regeneration_claimed`, successful completion writes bodyless
  `test_vendor_setup_link_regenerated`, and post-claim/pre-completion failure retains claim evidence
  only.
- It performs no invitation delivery, OAuth/Gmail/token-vault construction, provider call, Registry
  promotion, or Live evidence update. Live Vendor OAuth remains an independent per-Vendor activation.
- External Vendor identity class wins over email domain. Any present `vendor`, `vendor_id`, or
  `data_mode` custom-claim key—including false, empty, or malformed values—is excluded from the
  internal People and Access roster, last-Admin count, role/scope mutations, internal ID tokens, and
  internal session cookies. The separate Vendor path accepts only the exact valid `vendor:true` +
  canonical `vendor_id` + matching `data_mode` triple and its normal record/TOTP checks.

No audit or acceptance artifact contains a target/replacement Firebase UID, setup link, plaintext
reason, password, TOTP material, secret, session value, confirmation token, or mailbox/customer
content. The bodyless lifecycle audits retain only actor UID, Vendor id, action, reason hash, and time.
Human acceptance records only route outcomes, status changes, `UID rotated: yes|no`, preservation/
denial booleans, and zero-provider-call evidence.

## Change boundary and rollback

The Email/Password update mask contained only
`signIn.email.enabled,signIn.email.passwordRequired`. The corrected TOTP change used `updateMask=mfa`
with `mfa.state: ENABLED`, the single enabled TOTP provider, and one adjacent interval after verifying
no other MFA provider was present. Cloud Audit Logs record the update as
`google.cloud.identitytoolkit.admin.v2.ProjectConfigService.UpdateConfig` by
`josiah@pmikcmetro.com`; no secret material was logged or retained.

If a Vendor-auth incident requires rollback, first disable Vendor provisioning/session routes and
revoke affected sessions. For the canonical Test Vendor, the reasoned Admin reset/re-enable action is
the normal clean-generation recovery and preserves Test workflow data. Then disable the affected
provider configuration only when the project-level provider itself is implicated, using a separately
reviewed field-masked change; do not disturb staff Google sign-in or the authorized production host.

Official references:

- [Identity Platform projects.updateConfig](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/projects/updateConfig)
- [Identity Platform Config fields](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/Config)
- [Firebase TOTP MFA](https://firebase.google.com/docs/auth/web/totp-mfa)
