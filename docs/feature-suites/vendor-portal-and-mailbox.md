<!-- spec-shape: overhaul-v1 -->

# S22 — External Vendor portal and per-vendor Gmail

> New 2026-07-14; working-app contract revised 2026-07-15. Implements R03 account/mailbox lifecycle
> and R04. Vendor is a separate external identity lane and never weakens the `pmikcmetro.com`
> boundary for staff, cloud, DWD, or Admin.

**Implementation status — Deployed working-app/Test lane 2026-07-15; human secret-bearing acceptance
pending.** The code includes separate
Vendor claims/session guards, record/claim `data_mode` binding, Admin Test-Vendor preview/provision/
setup-link recovery/disable actions, response-only Firebase password-setup links, TOTP-required access, assigned-ticket
list/detail authorization, an app-owned Firestore Test mailbox with exact preview/confirm reply,
production OAuth state/PKCE/scope/same-address/vault boundaries, disable/revoke lifecycle, UI, rules,
and adversarial tests. Identity Platform global MFA and the TOTP provider are enabled in production
with adjacent interval `1`. The automated production Test workspace passed all 11 Vendor boundary
checks with zero Live-provider calls. The canonical Test identity is
`vendor:test-summit-plumbing` / `service@summit-plumbing.example.invalid`. Production deployment and
configuration are verified; the private password/TOTP enrollment, fresh challenge, assigned-ticket,
app-only mailbox, and disable walkthrough still requires the human operator. No Live Vendor mailbox is
activated by the Test journey.

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
  returned only to the provisioning Admin, is never delivered externally or persisted, and is never
  Live evidence. If the Admin closes or loses that response before setup completes, an exact-previewed
  recovery action may generate a replacement only for the same canonical `pending_setup` Test identity
  after its Firestore and Firebase UID/email/verification/disabled state reconcile. That recovery does
  not change identity state. A separate repeatable authentication reset/re-enable is available from
  `pending_setup`, `active`, or `disabled`: its exact preview binds the reason and current status,
  `inviteVersion`, and Firebase UID. Confirmation becomes stale if any binding changes. Execution
  disables and revokes the old identity, replaces its password with an unreturned random value, clears
  TOTP, rotates to a new UID, increments `inviteVersion`, returns the record to `pending_setup`, and
  re-enables only after Firestore/Firebase reconciliation. The stable Vendor id, Test assignments,
  ticket history, app-only mailbox, receipts, and bodyless audit remain. Each setup link is HTTPS-only,
  `no-store`, response-only, never persisted/delivered, and never Live evidence.
- **Live Vendor identity.** Admin provisions the exact routable invited address; email verification,
  password setup, and enrolled TOTP are required before ticket detail, attachment, communication body,
  or mailbox-connect routes. Recovery/reset is audited and revokes sessions. Official basis:
  [Firebase TOTP MFA](https://firebase.google.com/docs/auth/web/totp-mfa) and
  [Admin email action links](https://firebase.google.com/docs/auth/admin/email-action-links).
- **Assigned-ticket authorization.** Server authorization joins the verified token's normalized email
  plus `uid → vendor_id → ticket.vendor_id`, and also requires matching data mode. List, count,
  notification, attachment, communication, direct-id, and guessed-id routes share the join and return
  404 for unassigned, cross-mode, disabled, or identity-drifted records. Vendor never inherits an
  internal role, Space, DWD grant, or cross-mailbox capability. Internal identity surfaces reject any
  principal carrying a `vendor`, `vendor_id`, or `data_mode` claim key—even false/empty/malformed—while
  this separate Vendor path requires the exact valid `vendor:true` + canonical `vendor_id` + matching
  `data_mode` tuple before its record/TOTP/assignment checks.
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
- **Lifecycle.** Vendor may revoke their Live mailbox. Admin may remove assignment, disable either
  mode, or revoke a connection. Disable/deassign denies detail and new provider construction
  immediately, revokes Firebase sessions, queues token revocation for Live, and preserves bodyless
  audit. Disable is not terminal for the canonical Test identity: Admin may exact-preview and confirm
  the reset/re-enable lifecycle without deleting its Test records. Old-UID sessions and previously
  issued Test-mailbox confirmations remain unusable. A reset refuses any OAuth connection or identity
  drift and makes zero provider/Live calls. Disable and reset serialize on the same Vendor lifecycle
  record: `claimed` or `prepared` reset state makes disable fail 409 before Firebase/audit regardless
  of lease age, so the operator recovers reset first. If disable wins first, the stale status-bound
  reset confirmation fails and a fresh `disabled` preview works. `completed` does not block disable.
- **Fail-closed reset recovery.** Authentication reset stages the replacement Firebase identity
  disabled, with a random unreturned password and no enrolled factors. The Firestore identity rotation
  and its canonical bodyless reason-hash audit are transactional. A per-request claim plus a two-minute
  lease transitions `claimed → prepared → completed`; only the active owner can touch Firebase or mint
  the link. The initial winning claim atomically records `test_vendor_authentication_reset_claimed`;
  successful invite-increment commit records one canonical `test_vendor_authentication_reset`. A
  failed post-claim/pre-commit attempt retains only the claim event. Overlap/completed replay stops
  before auth mutation. After a crash at `prepared`, a normal Admin page reload/re-preview uses the
  marker's original source UID/status/`inviteVersion` tuple without exposing the UID. While the lease
  is live, the original reason reproduces the same hash/effect and a different reason/takeover refuses.
  After expiry, a fresh Admin reason may rebind that validated source tuple. A successful takeover
  atomically records one distinct `test_vendor_authentication_reset_recovery_claimed` audit with the
  recovery actor, fresh reason hash, and timestamp. It never adopts the abandoned Auth or Firestore
  UID, even if the abandoned Firebase principal has the exact canonical claims: it hardens, revokes,
  and deletes that principal, then requires a freshly allocated UID distinct from the source UID,
  current Firestore record UID, and email-resolved Auth UID; a provider allocation of any forbidden
  UID is deleted and refused. A claimed takeover later creates the normal canonical reset audit when
  it commits the invite increment. If the abandoned request already committed `prepared`, the winner
  repairs only the UID and preserves that one canonical invite increment/reset audit; the separate
  recovery-claim audit records the takeover, not a duplicate reset. Every lifecycle audit contains
  actor UID/Vendor id/reason hash/time and never plaintext reason, target/replacement Firebase UID,
  link, password, or secret. The old
  owner renews ownership after external enable and before mint/completion; once stale it cannot mint a
  second link, complete the winner, or compensate against the winner. If
  identity reconciliation, re-enable, action-link creation, or completion marking fails, the owned
  replacement is disabled and sessions are revoked; no usable link, external delivery, provider call,
  or Live evidence is produced.
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
  one Firebase user/record, and return its password-setup link only in that Admin response. While the
  record is still `pending_setup`, a separately previewed recovery may return a replacement only after
  canonical Firestore/Firebase UID, email, verification, enabled-state, and Test-lane reconciliation.
  From `pending_setup`, `active`, or `disabled`, the distinct authentication-reset preview binds the
  exact current UID, status, `inviteVersion`, and reason; confirmation after any drift is denied. A
  successful reset rotates UID, increments `inviteVersion`, and returns `pending_setup` plus one setup
  link. Expired takeover must allocate a UID distinct from the source, Firestore-record, and resolved
  Auth UIDs rather than adopt an abandoned exact-claims principal. A prepared takeover changes only
  that staged UID and creates no second invite-version increment or canonical reset audit; it records
  the distinct recovery-claim audit. A fresh Admin preview after `prepared` binds the original marker
  source without disclosing UID. Before lease expiry, only the original reason returns the same
  hash/effect and a different reason/takeover refuses. After expiry, a fresh reason may bind that
  source tuple and is hashed into the atomic recovery-claim audit. All link responses are
  `no-store`; no link or password is persisted/delivered, and all evidence remains Test/non-Live.
  Noncanonical, OAuth-connected, mismatched, Editor, Vendor, and self-registration attempts are
  denied. _Verify:_ `npm test -- vendor-test-identity
vendor-test-admin-route vendor-test-admin-runtime vendor-invite`.
- **AC-S22-2** — A Test Vendor must complete password setup and TOTP before detail; an unverified or
  non-TOTP Live Vendor is limited to setup/MFA. Changed email, claim/record mode mismatch, disabled
  state, missing assignment, an old UID/session after reset, and a reset identity without fresh TOTP
  fail before ticket/mail/OAuth provider construction. Any partial Vendor claim key fails closed from
  internal roster/session/role/scope authority, and only the exact valid Vendor claim tuple enters this
  external path. The rotated identity can regain access only by completing the new password/TOTP
  journey. _Verify:_ `npm test -- vendor-auth admin-users auth-session
vendor-assignment-boundary vendor-routes vendor-test-workspace-components`.
- **AC-S22-3** — Vendor A receives 404 and zero metadata for Vendor B or cross-mode tickets across list,
  count, guessed URL, communication, photo, and notifications; Admin access remains audited. _Verify:_
  `npm test -- vendor-assignment-boundary`; `npm run test:firestore`.
- **AC-S22-4** — Live OAuth start/callback rejects wrong/reused state, session, PKCE, redirect, scope,
  provider, mailbox address, disabled identity, or mid-flight drift; a just-created secret is destroyed
  and no connection saved. A Test principal is rejected before OAuth/provider construction. _Verify:_
  `npm test -- vendor-gmail-oauth`.
- **AC-S22-5** — Browser/Firestore/log/audit snapshots contain no OAuth token, client secret, raw Live
  body, reusable password, or persisted setup link. The HTTPS action link appears only in its
  `Cache-Control: no-store` Admin response. Reset audit/evidence remains bodyless and distinguishes
  initial claim (`test_vendor_authentication_reset_claimed`), canonical committed reset
  (`test_vendor_authentication_reset`), and each expired takeover
  (`test_vendor_authentication_reset_recovery_claimed`). Setup-link recovery likewise distinguishes
  winning claim (`test_vendor_setup_link_regeneration_claimed`) from successful completion
  (`test_vendor_setup_link_regenerated`). A failed post-claim/pre-completion attempt retains only its
  honest claim event. Every event contains only actor UID/Vendor id/reason hash/time—never plaintext
  reason, target/replacement Firebase UID, link, password, or secret. Disable/revoke denies future
  provider construction and is idempotent.
  A partial reset leaves the staged identity disabled, factor-free, and session-revoked. Expired
  takeover quarantines instead of adopting an abandoned generation, rejects a reused/forbidden UID,
  and prevents the delayed old owner from enabling, completing, or compensating against the winner; it
  never exposes the random password or creates a Live/provider effect. _Verify:_ `npm test --
vendor-token-vault vendor-test-identity vendor-test-admin-route`; `npm run verify:redaction`.
- **AC-S22-6** — The Test mailbox persists assigned-thread read/draft/label/exact-reply and receipts
  with zero external calls; inbox search, arbitrary ticket/thread/recipient, cross-mode access,
  attachment fetch, and automatic send are impossible. _Verify:_ `npm test -- vendor-test-mailbox
vendor-test-mailbox-route vendor-test-mailbox-transaction-boundary vendor-gmail-boundary`.
- **AC-S22-7** — Test and Live reply confirmation bind actor, Vendor, mailbox/lane, assigned ticket,
  thread, payload hash, expiry, and one attempt. Drift, double-click, or ambiguity never produces a
  second provider attempt. _Verify:_ `npm test -- vendor-test-mailbox vendor-gmail-send`.
- **AC-S22-8** — Assignment removal/disable revokes sessions and access immediately, queues Live token
  revocation when applicable, closes Test mailbox access without external calls, and preserves only
  bodyless audit. Canonical Test reset/re-enable rotates UID, clears TOTP, invalidates old sessions and
  outstanding mailbox confirmations, preserves Test tickets/mailbox/receipts, and can be repeated from
  `pending_setup`, `active`, or `disabled` with zero OAuth/provider/Live effects. An expired prepared
  takeover preserves one invite increment and its one canonical reset audit while adding the distinct
  bodyless recovery-claim audit and moving to a fresh non-abandoned UID; a delayed old owner cannot
  touch the winning generation. Disable refuses every claimed/prepared reset
  before Firebase/audit even when its lease is expired; disable-first stales the old reset preview but
  permits a fresh disabled-state reset, while completed reset does not block disable. _Verify:_ `npm
test -- vendor-lifecycle vendor-test-identity vendor-test-authentication-reset-store
vendor-test-mailbox vendor-test-mailbox-transaction-boundary`.
- **AC-S22-9** — Full checks pass: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm
test`, `npm run test:e2e:core`, `npm run test:firestore`, `npm run verify:redaction`, `npm run build`.

**Forbidden actions / hard gates.** No self-registration, reusable password display, detail before
password/TOTP, Vendor internal role, DWD, cross-ticket/cross-mode access, shared/alias Live mailbox,
general inbox/search/arbitrary compose, token in browser/Firestore/log/git, autonomous send, or blind
retry. No reset from a loose alias, stale preview, changed UID/status/`inviteVersion`, unexpected OAuth
connection, or identity drift; no deletion of canonical Test tickets/mailbox/receipts as an auth-reset
shortcut, and no disable mutation may bypass a claimed/prepared reset—recover it first. Test identity/
email/mailbox/reset must never contact a provider or be cited as Live. Live
OAuth stays unavailable until its exact consent/client/redirect/vault/identity checks are healthy and
remains an optional per-Vendor activation. The Admin confirmation exception is ticket-linked only,
never general cross-mailbox authority. ~$10 cap.

**Ordered prompt sequence.**

1. _Build/verify Test identity:_ provision the canonical alias through Admin preview/confirmation;
   if its response is closed before use, exact-preview one safe pending-setup link replacement. Then
   exercise the repeatable exact-previewed reset/re-enable from active and disabled states: bind current
   UID/status/`inviteVersion`, rotate UID, preserve Test records, deny old sessions/confirmations, and
   prove fail-closed retry after each staged partial failure. Expire both claimed and prepared owners;
   reload the normal Admin UI and prove the original reason reproduces the same UID-free confirmation
   while the lease is live and a different reason refuses. After expiry, use a fresh reason to rebind
   the validated original source tuple without manual record repair. Prove takeover quarantines every
   abandoned UID, allocates a distinct fresh UID, preserves exactly one prepared invite increment and
   canonical reset audit, atomically appends one bodyless recovery-claim audit for each successful
   takeover, and remains unchanged when the delayed old owner resumes. Separately prove setup-link and
   reset initial claim events persist when post-claim work fails, while completion events appear only
   after success. Complete fresh Firebase password setup and TOTP after reset, and prove claim/record/
   ticket mode isolation. Interleave disable with claimed,
   prepared, completed, and disable-first reset states to prove deterministic recovery without a
   Firebase/audit race.
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
