<!-- spec-shape: overhaul-v1 -->

# S22 — External Vendor portal and per-vendor Gmail

> New 2026-07-14; working-app contract revised 2026-07-15. Implements R03 account/mailbox lifecycle
> and R04. Vendor is a separate external identity lane and never weakens the `pmikcmetro.com`
> boundary for staff, cloud, DWD, or Admin.

**Implementation status — Working-app/Test lane built locally 2026-07-15.** The code includes separate
Vendor claims/session guards, record/claim `data_mode` binding, Admin Test-Vendor preview/provision/
disable actions, one-response Firebase password-setup links, TOTP-required access, assigned-ticket
list/detail authorization, an app-owned Firestore Test mailbox with exact preview/confirm reply,
production OAuth state/PKCE/scope/same-address/vault boundaries, disable/revoke lifecycle, UI, rules,
and adversarial tests. The canonical Test identity is
`vendor:test-summit-plumbing` / `service@summit-plumbing.example.invalid`. Production deployment and
Identity Platform TOTP configuration must still be verified; no Live Vendor mailbox is activated by
the Test journey.

**Goal.** An Admin can provision and disable an external Vendor, the Vendor completes Firebase password
setup plus TOTP, and the Vendor sees only assigned Maintenance tickets. The production app supports a
safe app-only Test mailbox immediately. A Live Vendor can separately connect their own Gmail/Google
Workspace mailbox and use it only inside an assigned ticket after the action-specific OAuth activation
is healthy. Every reply is exact-confirmed; no generic inbox or autonomous send exists.

**What it is / how it functions.**

- **Two explicit data lanes.** Vendor claim, Vendor record, ticket, mailbox, confirmation, and receipt
  carry server-owned `live|test` mode. Missing legacy mode resolves to Live. A Test Vendor can access
  only Test tickets and the Test mailbox; a Live Vendor can access only Live assignments and may never
  use the Test adapter as an OAuth fallback.
- **Canonical Test Vendor.** Admin chooses the allowlisted alias
  `vendor:test-summit-plumbing`, `Summit Plumbing Test Vendor`,
  `service@summit-plumbing.example.invalid`. The address is intentionally non-routable. Firebase marks
  that Test-only address verified during provisioning so the impossible email-delivery step does not
  block testing, but password setup and TOTP remain mandatory before portal detail. The setup link is
  returned once to the provisioning Admin, is never delivered externally or persisted, and is never
  Live evidence.
- **Live Vendor identity.** Admin provisions the exact routable invited address; email verification,
  password setup, and enrolled TOTP are required before ticket detail, attachment, communication body,
  or mailbox-connect routes. Recovery/reset is audited and revokes sessions. Official basis:
  [Firebase TOTP MFA](https://firebase.google.com/docs/auth/web/totp-mfa) and
  [Admin email action links](https://firebase.google.com/docs/auth/admin/email-action-links).
- **Assigned-ticket authorization.** Server authorization joins the verified token's normalized email
  plus `uid → vendor_id → ticket.vendor_id`, and also requires matching data mode. List, count,
  notification, attachment, communication, direct-id, and guessed-id routes share the join and return
  404 for unassigned, cross-mode, disabled, or identity-drifted records. Vendor never inherits an
  internal role, Space, DWD grant, or cross-mailbox capability.
- **Test mailbox.** For an assigned Test ticket, the app stores a simulated thread, bounded draft,
  approved label, exact-confirmation record, and reply receipt in app-owned Firestore. It performs no
  OAuth/Gmail/provider call. The reply binds actor, Vendor, ticket, thread, message id, body hash, and
  expiry; duplicate confirmation is idempotent and ambiguity requires reconciliation. Every response
  is visibly `dataMode:test`, `liveEvidenceEligible:false`.
- **Live Vendor Gmail OAuth.** Gmail/Google Workspace uses Google's server-side authorization-code flow
  with CSRF state, PKCE, exact redirect URI and scopes, `access_type=offline`, and no DWD. The granted
  mailbox email must equal the active verified Vendor login email at start, callback, vault, and save.
  Official basis: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
  and [Gmail server authorization](https://developers.google.com/workspace/gmail/api/auth/web-server).
- **Scope and token boundary.** Request only `gmail.readonly`, `gmail.compose`, `gmail.labels`, and
  `gmail.modify` in context. Store refresh token material server-only in Secret Manager; Firestore keeps
  only non-secret connection metadata, scope set, token reference, state, and timestamps. Identity drift
  after vault creation destroys the new secret and saves no connection. Tokens never enter browser,
  log, audit, Firestore, or git.
- **Communication boundary.** Live OAuth reads only an explicitly linked assigned-ticket thread,
  creates an authorized draft, applies governed labels, and exact-confirms a reply. It cannot list or
  search an inbox, fetch unrelated attachments, or compose unrelated mail. AI output is proposal-only
  under S24. From remains the Vendor OAuth mailbox; audit records actor and mailbox identity without
  content.
- **Lifecycle.** Vendor may revoke their Live mailbox. Admin may remove assignment, disable either mode,
  or revoke a connection. Disable/deassign denies detail and new provider construction immediately,
  revokes Firebase sessions, queues token revocation for Live, and preserves bodyless audit.
- **Activation model.** Firebase password/TOTP and the Test mailbox are application V1. OAuth consent,
  client/redirect/vault and first mailbox proof are a separate Live-provider activation for each
  Vendor. An inactive Live mailbox is shown as unavailable and does not downgrade the application.

**Open questions & assumptions.**

- _Answered 2026-07-14:_ Admin setup link; no self-registration or Admin-visible reusable password.
- _Answered 2026-07-14:_ per-Vendor Gmail/Workspace OAuth only; Microsoft and shared/alias mailbox
  support are after V1; MFA gates detail and mailbox access.
- _Answered 2026-07-15:_ invented Test identity is part of the production app and uses Firebase
  password + TOTP with an app-only assigned-ticket mailbox; it never sends an email or proves OAuth.
- _Default:_ TOTP is the launch second factor, avoiding phone collection and SMS cost.
- _Default:_ Live mailbox email must equal the verified Vendor login email; aliases/delegates are
  refused until a separate reviewed contract exists.
- _Operational input, not a product blocker:_ the first Live Vendor's routable address and assigned
  approved ticket are supplied only when that Vendor's OAuth activation is run; neither belongs in git.

**Cross-product impacts.** Adds Vendor-aware Firebase/session/page guards, Admin Vendor management,
Maintenance assignment, data-mode isolation, Test mailbox persistence, notification filtering,
workflow communication provider abstraction, OAuth callbacks, token vault, Firestore rules/indexes,
environment handoff, and S26. Supersede markers: `MANAGED-DOMAIN-ONLY-END-USERS` and
`VENDOR-LIVE-OAUTH-AS-V1-APP-GATE`. Internal Gmail DWD and Admin no-cross-mailbox rules remain.

**Adversarial acceptance checks.**

- **AC-S22-1** — Admin preview and exact confirmation provision only the allowlisted Test alias, create
  one Firebase user/record, return one password-setup link only in that Admin response, persist/deliver
  no link or password, and mark all evidence Test/non-Live. Editor/Vendor/self-registration attempts
  are denied. _Verify:_ `npm test -- vendor-test-identity vendor-test-admin-route vendor-invite`.
- **AC-S22-2** — A Test Vendor must complete password setup and TOTP before detail; an unverified or
  non-TOTP Live Vendor is limited to setup/MFA. Changed email, claim/record mode mismatch, disabled
  state, and missing assignment fail before ticket/mail/OAuth provider construction. _Verify:_ `npm
test -- vendor-auth vendor-assignment-boundary vendor-routes vendor-test-workspace-components`.
- **AC-S22-3** — Vendor A receives 404 and zero metadata for Vendor B or cross-mode tickets across list,
  count, guessed URL, communication, photo, and notifications; Admin access remains audited. _Verify:_
  `npm test -- vendor-assignment-boundary`; `npm run test:firestore`.
- **AC-S22-4** — Live OAuth start/callback rejects wrong/reused state, session, PKCE, redirect, scope,
  provider, mailbox address, disabled identity, or mid-flight drift; a just-created secret is destroyed
  and no connection saved. A Test principal is rejected before OAuth/provider construction. _Verify:_
  `npm test -- vendor-gmail-oauth`.
- **AC-S22-5** — Browser/Firestore/log/audit snapshots contain no OAuth token, client secret, raw Live
  body, reusable password, or persisted setup link. Disable/revoke denies future provider construction
  and is idempotent. _Verify:_ `npm test -- vendor-token-vault`; `npm run verify:redaction`.
- **AC-S22-6** — The Test mailbox persists assigned-thread read/draft/label/exact-reply and receipts
  with zero external calls; inbox search, arbitrary ticket/thread/recipient, cross-mode access,
  attachment fetch, and automatic send are impossible. _Verify:_ `npm test -- vendor-test-mailbox
vendor-test-mailbox-route vendor-gmail-boundary`.
- **AC-S22-7** — Test and Live reply confirmation bind actor, Vendor, mailbox/lane, assigned ticket,
  thread, payload hash, expiry, and one attempt. Drift, double-click, or ambiguity never produces a
  second provider attempt. _Verify:_ `npm test -- vendor-test-mailbox vendor-gmail-send`.
- **AC-S22-8** — Assignment removal/disable revokes sessions and access immediately, queues Live token
  revocation when applicable, closes Test mailbox access without external calls, and preserves only
  bodyless audit. _Verify:_ `npm test -- vendor-lifecycle vendor-test-identity`.
- **AC-S22-9** — Full checks pass: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm
test`, `npm run test:e2e:core`, `npm run test:firestore`, `npm run verify:redaction`, `npm run build`.

**Forbidden actions / hard gates.** No self-registration, reusable password display, detail before
password/TOTP, Vendor internal role, DWD, cross-ticket/cross-mode access, shared/alias Live mailbox,
general inbox/search/arbitrary compose, token in browser/Firestore/log/git, autonomous send, or blind
retry. Test identity/email/mailbox must never contact a provider or be cited as Live. Live OAuth stays
unavailable until its exact consent/client/redirect/vault/identity checks are healthy. The Admin
confirmation exception is ticket-linked only, never general cross-mailbox authority. ~$10 cap.

**Ordered prompt sequence.**

1. _Build/verify Test identity:_ provision the canonical alias through Admin preview/confirmation,
   complete Firebase password setup and TOTP, and prove claim/record/ticket mode isolation.
2. _Build/verify Test workflow:_ seed/assign the canonical Maintenance Test ticket and exercise
   assigned-ticket list/detail plus Test mailbox read/draft/label/reply and disable/revoke.
3. _Configure application prerequisite:_ enable and verify Identity Platform TOTP in the production
   project; this is required for both Test and Live Vendor sign-in.
4. _Activate Live OAuth when used:_ configure consent/client/redirect/vault for the exact routable
   Vendor; verify same-address scope and one bounded assigned-ticket read/reply. Do not block unrelated
   V1 workflows while this activation is unavailable.
5. _Verify:_ falsify guessed IDs, stale sessions, MFA bypass, mode drift, CSRF replay, extra scope,
   token leakage, mailbox mismatch, cross-ticket access, and duplicate confirmation; run full checks.
6. _Context update:_ record application acceptance separately from each Vendor's Live OAuth activation
   and update environment/status/plan/loop without treating inactive OAuth as Pre-V1.

**Deletion/merge recommendation.** KEEP as the canonical external Vendor identity/mailbox spec. Do
not merge it into S16 managed staff; the identity, mode, assignment, and provider boundaries are
intentionally separate.
