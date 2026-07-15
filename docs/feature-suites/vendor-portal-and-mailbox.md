<!-- spec-shape: overhaul-v1 -->

# S22 — External Vendor portal and per-vendor Gmail

> New 2026-07-14. Implements R03 account/mailbox lifecycle and R04. This is a separate external
> identity lane; it does not weaken the `pmikcmetro.com` boundary for staff, cloud, DWD, or Admin.

**Goal.** An Admin can invite a maintenance Vendor without seeing or assigning a reusable password.
After email verification, password setup, and TOTP MFA, the Vendor sees only tickets assigned to their
vendor identity. They may connect their own Gmail or Google Workspace mailbox through OAuth and use it
only for assigned-ticket communication, with AI assistance and exact human confirmation on every send.

**Implementation status — Local green 2026-07-14.** The separate Vendor claims/session, TOTP
enrollment/sign-in UI, exact-confirmed invite service and Admin preview, assigned-ticket list/detail
and thread join, OAuth state/PKCE/exact-scope/same-address callback with active invited-email
revalidation at start/callback/persist, token-vault seam and mid-flight secret cleanup, Vendor/Admin
one-attempt fake Gmail boundary, disable/session-revoke/token-revocation lifecycle, server-only
Firestore collections/rules, and adversarial tests are built. No live principal, invite, Identity
Platform setting, OAuth app/token, Gmail access/send, secret resource, deploy, or acceptance occurred.

**What it is / how it functions.**

- **Identity type.** Add a Firebase `Vendor` principal separate from internal `Editor|Approver|Admin`.
  A Vendor has no internal Space/capability inheritance. Server authorization joins the verified token's
  normalized email plus `uid → vendor_id → ticket.vendor_id`; the email must still equal the invited
  Vendor record on activation and every active-access check. List, count, notification, attachment,
  communication, and direct-id routes all use the same join and return 404 for unassigned or identity-
  drifted records.
- **Admin invite.** `manageAdmin` creates the email-only Firebase user/vendor record, assigns ticket
  boundary metadata, and generates a one-time Firebase password setup link. The approved invitation
  message is exact-confirmed by the Admin and sent to that address; no generated password is returned,
  logged, or shown. Expired/used links require a new audited invite.
- **Required MFA.** Email verification plus enrolled TOTP is required before any ticket detail,
  attachment, communication body, or mailbox-connect route. Enrollment uses Firebase Authentication
  with Identity Platform TOTP; recovery/reset is Admin-audited and revokes active sessions. Official
  basis: [Firebase TOTP MFA](https://firebase.google.com/docs/auth/web/totp-mfa) and
  [Admin email action links](https://firebase.google.com/docs/auth/admin/email-action-links).
- **Vendor Gmail OAuth.** V1 supports Gmail/Google Workspace only, using Google's server-side OAuth 2.0
  authorization-code flow with CSRF state, PKCE where supported, exact redirect URI, incremental scopes,
  and `access_type=offline`. DWD is never used. Official basis:
  [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server) and
  [Gmail server authorization](https://developers.google.com/workspace/gmail/api/auth/web-server).
- **Scope and token boundary.** Request only `gmail.readonly`, `gmail.compose`, `gmail.labels`, and
  `gmail.modify`, in context. Bind the granted mailbox email to the signed-in Vendor email. Store refresh
  token material server-only in Secret Manager; Firestore stores non-secret connection metadata, scope
  set, token-secret reference, status, and timestamps. OAuth start/callback, the pre-vault boundary, and
  the final connection save each recheck that the active principal still matches the immutable invited
  email. If identity drifts after vault creation, destroy that new secret and save no connection. Never
  emit tokens to browser/log/audit.
- **Communication boundary.** The OAuth client can read only an explicitly linked thread for an
  assigned ticket, draft from authorized context, apply approved labels, and exact-confirm reply. It
  cannot list/search an inbox or compose unrelated mail. Vendor or Admin may exactly confirm a send;
  From remains the OAuth mailbox and the audit records both actor and mailbox. AI output is proposal-only
  under S24.
- **Lifecycle.** Vendor may revoke their mailbox; Admin may revoke connection, disable account, remove
  assignment, or re-invite. Disable/reassignment immediately denies detail and new token use, revokes
  sessions, and queues token revocation; historical bodyless audit remains per retention/legal hold.
- **Buildable now (app-plane).** Principal/assignment schema, emulator auth guards, MFA claim/session
  checks, invite state machine with fake delivery, OAuth state/PKCE/callback/token-vault interfaces,
  fake Gmail transport, UI, rules, and adversarial tests.
- **Gated (owner / vendor).** Identity Platform/TOTP enablement, OAuth consent screen/client/secret,
  redirect URI, Secret Manager resources, external invite, real mailbox consent/read/send, deploy, and
  acceptance with a real Vendor.

**Open questions & assumptions.**

- _Answered 2026-07-14:_ Admin invite + one-time setup link; no self-registration and no Admin-visible
  reusable password.
- _Answered 2026-07-14:_ Gmail/Google Workspace via per-vendor OAuth only; Microsoft/other providers
  are after V1; MFA gates detail/mailbox access.
- _Assumption:_ TOTP is the launch second factor because it satisfies MFA without collecting Vendor
  phone data or incurring SMS cost. Identity Platform enablement is a live configuration gate.
- _Assumption:_ mailbox email must equal the verified Vendor login email for V1; aliases/delegates and
  shared mailboxes are refused and deferred.
- _Assumption:_ an Admin-confirmed vendor-mail send is allowed only inside an assigned ticket using the
  Vendor's stored OAuth grant; it grants no inbox/search visibility.
- _Client-owned:_ name the initial Vendor and assigned synthetic/approved acceptance ticket only at
  the live acceptance gate; do not put them in git.

**Cross-product impacts.** Adds Vendor-aware auth/session/page guards, Admin user/vendor management,
maintenance ticket assignments, notification filtering, workflow communication provider abstraction,
OAuth callbacks, token vault, Firestore rules/indexes, environment handoff, and S26. Supersede marker:
`MANAGED-DOMAIN-ONLY-END-USERS`. Internal Gmail DWD and Admin no-cross-mailbox rules remain intact.

**Adversarial acceptance checks.**

- **AC-S22-1** — Admin invite returns no password/token/link to ordinary UI/log/audit, creates one
  pending Vendor identity, and fake-delivers one single-use setup link; Editor/Vendor/self-registration
  attempts are denied. _Verify:_ `npm test -- vendor-invite`; `npm run test:firestore`.
- **AC-S22-2** — Unverified or non-TOTP Vendor may access only setup/MFA pages. A changed and reverified
  Firebase email still fails the invited-record email join even when uid/vendor claims are unchanged;
  every ticket list/detail, direct ID, attachment, body, notification, and OAuth route denies before
  constructing a ticket/mail/OAuth provider or making an external call; only the active-Vendor
  repository lookup runs. _Verify:_ `npm test -- vendor-auth vendor-assignment-boundary vendor-routes`.
- **AC-S22-3** — Vendor A receives 404 and zero metadata for Vendor B's ticket across list/count/search,
  guessed URL, communication, photo, and notification paths; Admin access is audited. _Verify:_ `npm
test -- vendor-assignment-boundary`; `npm run test:firestore`.
- **AC-S22-4** — OAuth start and callback recheck active invited-email equality. Callback also rejects
  wrong/expired/reused state, wrong session, missing PKCE, redirect mismatch, extra scopes, non-Gmail
  provider, or mailbox-email mismatch; it rechecks before vault persistence and connection save. A
  mid-flight identity drift destroys any just-created secret and saves no connection. _Verify:_ `npm
test -- vendor-gmail-oauth`.
- **AC-S22-5** — Browser/Firestore/log/audit snapshots contain no refresh/access token, client secret,
  raw body, or setup link. Disable/revoke denies future provider construction and is idempotent.
  _Verify:_ `npm test -- vendor-token-vault`; `npm run verify:redaction`.
- **AC-S22-6** — Assigned-thread read/draft/label/reply works with the fake vendor provider, while inbox
  list/search, arbitrary thread, arbitrary recipient, new unrelated compose, attachment fetch, and
  automatic send make zero provider calls. _Verify:_ `npm test -- vendor-gmail-boundary`.
- **AC-S22-7** — Vendor or Admin exact confirmation binds actor, Vendor mailbox, assigned ticket,
  thread, payload hash, expiry, and one attempt; drift/double-click/ambiguity cannot retry. _Verify:_
  `npm test -- vendor-gmail-send`.
- **AC-S22-8** — Account disable/reassignment revokes sessions and ticket access immediately, queues
  token revocation, and preserves only bodyless retained audit. _Verify:_ `npm test -- vendor-lifecycle`.
- **AC-S22-9** — Full checks pass: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm
test`, `npm run test:e2e:core`, `npm run test:firestore`, `npm run verify:redaction`, `npm run build`.

**Forbidden actions / hard gates.** No self-registration; no password shown to Admin; no ticket detail
before verified-email TOTP; no internal role/scope for Vendor; no DWD or Microsoft provider; no shared/
alias mailbox or changed-login-email continuation; no general inbox/search/arbitrary compose; no token in browser/Firestore/log/git; no
autonomous send; no live invite/OAuth/mailbox access/token resource/config/deploy without exact approval.
The Admin confirmation exception is ticket-linked only, never general cross-mailbox access. ~$10 cap.

**Ordered prompt sequence.**

1. _Discovery:_ inventory Firebase/session/role/rules/maintenance/Gmail boundaries and confirm current
   Identity Platform dependency/version without changing cloud state.
2. _Build:_ add Vendor principal, assignment repository, 404 authorization, and rules/tests across every
   ticket-derived surface.
3. _Build:_ add invite/setup/email-verification/TOTP-required state machine with fake action-link and
   delivery providers; expose no reusable credential.
4. _Build:_ add OAuth state/PKCE/callback, exact scope/email binding, token-vault interface, revoke/
   disable lifecycle, and fake provider.
5. _Build:_ add assigned-thread UI/AI/draft/label/reply with Vendor/Admin exact confirmation and shared
   bodyless audit/retention.
6. _Verify:_ falsify guessed IDs, stale sessions, MFA bypass, CSRF/state replay, extra scope, token leak,
   mailbox mismatch, cross-ticket access, and duplicate send; run full checks.
7. _Gate:_ produce separate approval packets for Identity Platform/TOTP, OAuth app/client/redirect,
   Secret Manager, first invite, first consent/read, first send, deploy, and production acceptance.
8. _Context update:_ add `F-VENDOR-PORTAL-BUILT` citing AC-S22-1..9 and update environment/status/plan/loop.

**Deletion/merge recommendation.** KEEP as the canonical external Vendor identity/mailbox spec. Do
not merge it into S16 managed staff; the security boundaries and providers are intentionally separate.
