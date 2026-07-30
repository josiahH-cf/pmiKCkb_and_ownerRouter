<!-- spec-shape: overhaul-v1 -->

# S48 — Workflow Communications, provider Connections, task Admin, and end-state tool retirement

> New 2026-07-28. Implements D-08 and D-09, plus WS-07. There is intentionally no replacement
> “Test Lab.”
> Amended 2026-07-29 for the live production phase. Adds D61 (a “How to add a teammate” panel plus
> pre-provision-by-email on the People and access surface) and audit finding QA-50 (Connection Center
> “Set up” copy that over-promises a credential flow which only partly exists).

**Goal.** Communications contains real workflow-linked message work, Connections contains provider
setup/health/action availability, and Admin contains a small set of task-based management areas.
Operator work is not interrupted by Registry diagnostics, browser-only simulations, hard-coded
actors, no-op Sample controls, or duplicate readiness tools. Shipped Test/developer tools are
removed; automated verification, Demo environment behavior, security primitives, and real provider
seams remain.

**What it is / how it functions.**

- **Workflow-only Communications.** The index shows authorized renewal/maintenance threads and
  attention that originate from a workflow entity. Detail supports the existing bounded read,
  approved labels, governed drafts, and exact-confirmed replies. Remove browser-only simulated email
  chains, hard-coded actors, anticipatory demo drafts, generic inbox/compose, and lab-only template/
  triage/thread-summary evaluators. A useful evaluator becomes an automated test or a bounded Admin
  configuration preview only if it directly validates a retained end-state rule.
- **Provider-focused Connections.** Each provider has one setup/health area: purpose, connection
  status, connect/reconnect/revoke where authorized, reviewed generic front door, affected
  capabilities, and a plain next step. Expandable Advanced detail contains exact account/identity,
  Registry keys/readiness/evidence, endpoint/version, last proof/error, kill switch, and setup
  diagnostics. Never put credentials or secret values in rendered state.
- **Task-based Admin.** Replace the twenty-panel page with a compact dashboard and bounded subroutes:
  `People & access`; `Spaces & sources`; `Decisions & content rules`; `Notifications & support`;
  `Retention & audit`; and `Advanced`. Equivalent labels/grouping are allowed only if every current
  retained task has one owner and daily users no longer scan an all-panels page.
- **Advanced ownership.** Migration/readiness internals, model/index controls, technical action
  matrices, source health details, and compatibility instrumentation live under named Advanced
  tasks. Destructive or cost-bearing controls retain exact preview, role, cost preflight, audit, and
  rollback.
- **End-state tool classification.** For every current Test/developer control classify:
  `REMOVE_SHIPPED_UI`, `CONVERT_TO_AUTOMATED_TEST`, `KEEP_DEMO_PRODUCT_FLOW`,
  `KEEP_PROVIDER_ACTIVATION_SEAM`, `KEEP_SECURITY/ROLLBACK`, or `INVESTIGATE_S49`. No “keep in Test
  Lab” category exists.
- **Explicit removals.** Stage-one remove/hide browser-only simulated email, hard-coded actor chains,
  no-op owner/tenant preparation controls, operator action simulators, full Test handoffs, duplicate
  readiness matrices, and the disabled legacy notification sender card. Keep redirects/adapters only
  when S49 consumer proof requires them.
- **Explicit keeps.** Keep automated unit/e2e/security tests, deterministic fixtures, emulators/fake
  transports used only by tests, Demo-environment adapters/workflows, provider/OAuth implementations
  awaiting one real setup dependency, kill switches, migration/rollback tools, current Vendor TOTP,
  and exact action contracts.
- **TOTP/verification disposition.** Do not invent or expose a new self-registration/onboarding
  product in this recalibration. Existing Vendor password+TOTP remains. Test-only primitives such as
  TOTP enrollment/verification-code helpers are retained only if current security, a documented
  provider seam, or an explicitly authorized future suite owns them; otherwise S49 proves and
  deletes them. They are not shipped “Test tools.”
- **The teammate gap, as it actually is (D61).** `app/admin/users/page.tsx` renders the roster from
  `listAppUsers()` in `lib/admin/users.ts`, which reads `getAuth().listUsers(1000)` and then filters
  to the allowed hosted domain. A teammate who has never signed in has no Firebase Auth record, so
  they are absent from the roster; and both `setAppUserRole` and `setAppUserScopes` take a
  `targetUid`, so there is nothing to act on until that record exists. No internal surface has an
  invite or add control. The page's own copy states the consequence honestly today — a person becomes
  an Editor by signing in — but gives an Admin no way to get ahead of it. `lib/vendor/invite.ts` is
  the external Vendor path and creates a password identity with `generatePasswordResetLink`; staff
  sign in with Google Workspace, so that module is a shape to copy, never a module to reuse for staff.
- **“How to add a teammate” panel — People and access.** A short, plain panel on the users surface,
  above the roster, that states the sequence in order: an Admin pre-provisions the teammate's work
  email with a role and the spaces they need; the teammate signs in at `/sign-in` with their
  organization Google account; they land with exactly that role and those spaces; an Admin changes it
  later from the same roster. It names the allowed domain from `config.allowedHostedDomain` and names
  nothing else — no environment variable, no secret, no console URL, no provider body. It also states
  what an Admin cannot do here: creating the Google account itself stays in Google Workspace.
- **Pre-provision by email — new `lib/admin/pre-provision.ts` and a Firestore twin such as
  `lib/firestore/admin-pre-provisions.ts` (names illustrative).** An Admin enters a work email, picks
  a role from `ROLES` and a scope set from `SPACE_SCOPES` (or All spaces), and writes a plain-English
  reason. The guards are the ones `setAppUserRole` already enforces, applied before any identity
  exists: normalized lowercase address, membership in `readServerConfig().allowedHostedDomain`, a
  known role, a non-empty known scope set or an explicit All-spaces choice, and a reason of at least
  three characters. Following `lib/vendor/invite.ts`, the submit carries a confirm-preview hash so a
  changed preview is refused, writes an append-only audit record modeled on
  `recordAdminRoleChange` — which stores the operator's plain-English reason as written, Admin-read
  only, the established internal pattern — and rolls back its own partial state on failure. It writes
  a PENDING GRANT record only. It does not call `createUser`, so no staff password credential and no
  reset link ever exist, and the grant record has no field capable of holding a credential: an email
  address, a role, a scope set, an actor, a reason, and timestamps.
- **Applying the grant at first sign-in.** `createAuthenticatedSession` in `lib/auth/session.ts`
  verifies the ID token and mints the session cookie from that same token. A custom claim written
  after token issuance cannot be made durable by copying the new role into the first response. The
  apply seam is therefore a two-request, one-sign-in handshake: after the first verified token, look
  up the pending grant and apply it through `setCustomUserClaims` only when the token carries neither
  a `role` nor a `scopes` claim; mark the grant `claims_refresh_required`; return that bounded status
  **without minting a session cookie**; have the signed-in client call
  `currentUser.getIdToken(true)` and retry session creation; verify that the refreshed token contains
  exactly the granted role/scopes; then mint the cookie and mark the grant applied with the resolved
  uid. No authorization decision relies on a response-only overlay. The rule is one-way and
  non-escalating: a grant never overwrites an identity that already carries a role claim, never
  applies to an identity `isExternalVendor` recognizes, never applies to an address outside the
  allowed domain, and a malformed or unknown grant is ignored rather than defaulted. Applying is
  idempotent — a refreshed retry or later sign-in changes nothing.
- **Ordering with D59 / `F-AUTH-1` (owned by S48).** Today a signed-in staff identity with no
  claims resolves to Editor (`readFirebaseRole` returns `"Editor"` for an absent value) with every
  space (`hasSpaceAccess` returns true when `user.scopes === undefined`). D59 closes that by making an
  unassigned identity have no access. Those two changes interlock in one direction: pre-provision by
  email is what removes the lockout window D59 would otherwise open, because a teammate who was
  pre-provisioned arrives already assigned and never sees a no-access screen. Two constraints follow
  and both land in this suite. Already-provisioned users must not be locked out: before the default
  flips, every current roster member needs an explicit role and scope claim stamped, and the flip must
  be provably reversible. S48 builds a redacted roster/backfill plan and the no-access default locally;
  live claim stamping remains a separately verified managed-identity operation. And S48 must not let
  the grant path become a
  back door: it grants only what an Admin already chose, only to a claimless identity, and only inside
  the allowed domain. A shared invariant test in S48 pins both directions. Because the default and
  session seam touch protected `lib/auth/`, the change is prepared and verified as a protected-path
  review package; that activation is parked while dependency-independent slices continue.
- **Honest Connection Center setup copy (QA-50).** The `Set up {name}` disclosure in
  `components/connections/ConnectorCard.tsx` currently tells every Admin that the connector “is set up
  securely on the server; sign-in and any credentials stay in the server setup flow,” and
  `connectorConnectLabel` renders “Sign in with Google” for a `google` connector. What the server
  actually does differs by method. For `google`, `ConnectorSetupActions` returns `null` — there is no
  per-connector sign-in at all, because those connectors authenticate through server-side domain-wide
  delegation, so the real next step is an owner configuration step, not an in-app action. For `oauth`,
  `POST /api/connections/[connectorId]/connect` returns `provider_not_available` when the required
  configuration is present and `credentials_not_configured` when it is not; it performs no redirect,
  exchanges no token, and writes no connection record. For `api_key`,
  `POST /api/connections/[connectorId]/api-key` hands the key to `resolveConnectorSecretVault()`,
  which today returns `NotConfiguredConnectorSecretVault`; `storeSecret` answers
  `{ ok: false, reason: "not_configured" }`, so the response is
  `{ stored: false, status: "storage_not_configured" }` and nothing is stored. Replace the blanket
  claim with per-method copy derived from the same values the server returns, so the card cannot drift
  from behavior again, and say plainly what stands between the current state and a working connection.
  The redaction invariant is unchanged: `requiredConfig` holds environment variable NAMES that are
  never rendered, a submitted key is never echoed or logged, and no provider response body reaches the
  page.
- **Buildable now (app-plane).** Communications cleanup, Connections structure, Admin routing,
  task ownership, progressive diagnostics, tool inventory/classification, stage-one UI retirement,
  role/a11y/browser tests, compatibility instrumentation, the teammate panel, the pre-provision record
  and its apply-at-first-sign-in seam, and the per-method Connections copy. All of it is app-plane:
  no system-of-record write, no send, no new external scope.
- **Build to the seam (live provider).** Preserve and surface each real provider activation seam in
  Connections. Provider implementations/credentials remain in their owning suites; this suite
  neither replaces them with fake tools nor blocks unrelated UI. The honest-copy work describes the
  secret-vault seam in `lib/connections/connector-secret-vault.ts` accurately; it does not implement
  it.
- **Owner dependency (split by slice).** None for S48's unprotected UI, copy, inventory, and
  stage-one retirement work. Individual provider connection steps retain their already named
  external dependencies, and secure credential storage remains the dependency of the `api_key`
  connectors rather than of the honest-copy slice. D59 activation is separate and remains closed
  until the `lib/auth/**` protected review is complete and the current managed roster/backfill plus
  claim stamping are verified reversible with the no-lockout proof. Those dependencies park only
  auth activation; the unprotected S48 work ships without waiting.

**Open questions & assumptions.**

- _Answered 2026-07-28 (D-08):_ delete Test tools that do not contribute to the end state now;
  provider setup-awaiting tools/seams are fine.
- _Answered 2026-07-28:_ do not create an Admin Test Lab to preserve removed simulations.
- _Answered 2026-07-28 (D-09):_ Admin is task-based; Connections is provider-focused.
- _Answered for this program:_ no new self-registration/onboarding UI is inferred from dormant TOTP
  or verification-code primitives. Existing Vendor TOTP remains mandatory.
- _Assumption:_ an evaluator with real value is best converted to a deterministic test unless an
  Admin must edit an approved rule; in that case only the rule preview/configuration belongs in UI.
- _Answered 2026-07-29 (D61):_ add both halves — the explanatory panel and pre-provision by email —
  under this suite, on the People and access surface. This is not the self-registration product the
  TOTP disposition above rules out: only an Admin can create a grant, it grants nothing an Admin did
  not choose, and no one enrolls themselves.
- _Answered 2026-07-29 (D61 mechanism):_ pre-provisioning writes a pending grant keyed by email, not
  a Firebase Auth identity, because staff authenticate through Google Workspace and creating a
  placeholder identity would either strand a password credential or depend on an account-linking
  setting this repository cannot verify from code.
- _Answered 2026-07-29 (D59 relationship):_ S48 owns the full interlock: pre-provision-by-email,
  refreshed-token session establishment, the claimless no-access default, the current-roster backfill
  plan, and the no-lockout proof. The protected `lib/auth/` package and any live claim stamping remain
  review/managed-identity dependencies; no intermediate state may remove an already-provisioned user's
  access.
- _Answered 2026-07-29 (QA-50):_ the Connection Center setup copy is corrected to match per-method
  behavior rather than the credential flow being built to match the copy.
- _Open:_ whether a pre-provisioned teammate should also be told, in the app, that their grant is
  waiting is a nicety, not a blocker; the panel lists pending grants for the Admin either way. Record
  it as a `Q-` row rather than guessing at a notification.
- Decision-complete for product behavior; provider credentials/endpoints, protected auth review, and
  the verified live roster/backfill operation stay isolated activation dependencies.

**Cross-product impacts.**

- Likely touchpoints include Communications routes/components, simulated chain/evaluators,
  Connections cards/status/setup routes, Admin index/panels/subroutes, readiness presenters,
  navigation, notification legacy UI, and tool-owned tests.
- D61 touches `app/admin/users/page.tsx`, `components/admin/UserManagementPanel.tsx`,
  `lib/admin/users.ts`, `app/api/admin/users/route.ts` and its `[uid]` children, `lib/auth/session.ts`
  (`createAuthenticatedSession` and the claim validation path), `app/api/auth/session/route.ts`, and
  new pre-provision service plus Firestore modules. It reads `lib/vendor/invite.ts` as a shape and
  `lib/firestore/admin-role-changes.ts` as the audit pattern, and changes neither. Named tests it must
  keep green: `tests/unit/admin-users.test.ts`, `tests/unit/admin-users-route.test.ts`,
  `tests/unit/admin-user-management-panel.test.tsx`, `tests/unit/auth-session.test.ts`,
  `tests/unit/auth-session-route.test.ts`, `tests/unit/route-auth-boundary.test.ts`,
  `tests/unit/page-auth-boundary.test.ts`, and `tests/unit/vendor-auth.test.ts`.
- QA-50 touches `components/connections/ConnectorCard.tsx`,
  `components/connections/ConnectorSetupActions.tsx`, `lib/connections/connector-catalog.ts`
  (`connectorConnectLabel`), and `lib/connections/connection-status.ts` where a status label reads as
  more finished than the underlying state. Named tests: `tests/unit/connection-center-component.test.tsx`,
  `tests/unit/connection-status.test.ts`, `tests/unit/connector-connection-classify.test.ts`.
- D61 interlocks with D59 / `F-AUTH-1`, both owned here. S48 changes the claimless default in
  `readFirebaseRole` and `hasSpaceAccess` only after the pre-provision, token-refresh, roster/backfill,
  and rollback proofs are green. The shared no-lockout invariant test required by `AC-S48-12` is the
  mechanism.
- Reuses S19/S24 communications, S40 environment, S41 shell, S44 provider links, and all S28–S39
  provider seams. S49 owns stage-two code deletion.
- Supersedes S15 browser fallback/demo UI and any active “Test Lab” preservation direction, while
  retaining useful communication policy/testing evidence.

**Adversarial acceptance checks.**

- **AC-S48-1** — Communications renders only workflow-authorized threads/actions and contains no
  simulated chain, hard-coded actor, generic inbox/compose, anticipatory demo draft, or lab
  evaluator. An unrelated mailbox/thread remains undiscoverable. _Verify:_ S19 auth/query/component
  tests and rendered DOM scan.
- **AC-S48-2** — Each supported provider has one Connections owner with reviewed generic front door,
  status, setup/revoke/reconnect as applicable, affected capabilities, and plain next step;
  Advanced reveals exact non-secret diagnostics. A non-Admin cannot read or invoke setup.
  _Verify:_ Connections role/URL/secret-redaction tests.
- **AC-S48-3** — Admin’s landing renders only categorized task destinations and bounded status, not
  the former twenty full panels. Every retained Admin task is reachable at one stable subroute with
  server-side role protection and a return to Admin. _Verify:_ route inventory and Admin browser
  task.
- **AC-S48-4** — Every inventoried Test/developer control has exactly one allowed disposition and
  no shipped control is left merely because a test imports its helper. Automated tests, Demo
  workflow, provider seam, security, and rollback categories remain green/reachable only in their
  proper context. _Verify:_ checked inventory plus product-route scan.
- **AC-S48-5** — Disabled legacy notification/simulation/no-op controls are absent from shipped UI;
  direct compatibility access redirects or returns the defined retired response without executing,
  and rollback can restore the prior UI during stage one. _Verify:_ compatibility route tests.
- **AC-S48-6** — Existing Vendor password/TOTP lifecycle still works and no internal self-register/
  verification-code route is introduced. Dormant primitive disposition is evidence-backed and
  handed to S49. _Verify:_ Vendor auth and route graph tests.
- **AC-S48-7** — Desktop/390×844 Admin, Connections, and Communications have one H1, usable task
  order, no horizontal overflow/overlay, correct keyboard/focus, and plain primary copy.
  _Verify:_ authenticated Admin/Editor browser tasks.
- **AC-S48-8** — `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run test:e2e:core`, `npm run verify:spec-traceability`, and `npm run build` pass; keep Gmail
  scope/send, provider gate, Admin role, Vendor TOTP, secret redaction, environment, and route-link
  sentinels green.
- **AC-S48-9** — The People and access surface renders the teammate panel with the sequence in order
  and the allowed domain named, and renders no environment variable name, secret, console URL, or
  provider body anywhere in its markup. A non-Admin request for that route receives the existing
  role refusal and the panel text appears nowhere in the response body. _Verify:_
  `npm test -- tests/unit/admin-user-management-panel.test.tsx`,
  `npm test -- tests/unit/admin-users-route.test.ts`,
  `npm test -- tests/unit/page-auth-boundary.test.ts`, `npm run verify:redaction`,
  `npm run verify:copy-voice`.
- **AC-S48-10** — Pre-provisioning creates a grant, never an identity. After an Admin submits an
  in-domain address with a role, a scope choice, a reason, and a matching preview hash, a pending
  grant exists carrying the normalized lowercase email, the chosen role and scopes, the actor uid, and
  a timestamp; an append-only audit record exists; and `createUser` was not called. Each of these is
  refused with the stated status and writes nothing: an address outside `allowedHostedDomain` (403), a
  reason under three characters (400), an empty explicit scope list (400), an unknown role (400), a
  stale preview hash (409), and a second grant for an address that already has a pending one (409). A
  non-Admin actor is refused 403 even with a valid body. _Verify:_
  `npm test -- tests/unit/admin-users.test.ts` plus the new pre-provision service and route tests;
  `npm run test:firestore` for the store.
- **AC-S48-11** — Applying a grant is one-way, non-escalating, and idempotent. A first Google sign-in
  by a pre-provisioned address first returns `claims_refresh_required` with no session cookie; after
  the client forces `getIdToken(true)`, the retry verifies exactly the granted role/scopes, mints the
  cookie from that refreshed token, and marks the grant applied with that uid. A stale-token retry
  never produces an authorized session, and a later sign-in changes neither the claims nor the grant.
  A sign-in by an identity that already carries a `role` claim leaves that claim untouched even when
  a grant exists for the address. No grant applies to an identity `isExternalVendor` recognizes, to
  an address outside the allowed domain, or from a malformed grant record — each is ignored rather
  than defaulted, and sign-in proceeds under the normal rules. _Verify:_
  `npm test -- tests/unit/auth-session.test.ts`,
  `npm test -- tests/unit/auth-session-route.test.ts`,
  `npm test -- tests/unit/vendor-auth.test.ts`, plus the new apply-seam tests.
- **AC-S48-12** — Nobody is locked out by the D59 interlock. With the claimless default set to
  no-access, every identity in the roster snapshot that carried working access before the change still
  resolves to a role and a space set afterward, and a pre-provisioned teammate signing in for the
  first time reaches their assigned destinations after the bounded token refresh rather than a
  refusal. The protected default change cannot be marked activation-ready until a redacted roster
  migration plan proves every existing identity has explicit claims and supplies a reversible
  rollback. _Verify:_
  `npm test -- tests/unit/auth-session.test.ts`,
  `npm test -- tests/unit/route-auth-boundary.test.ts`,
  `npm test -- tests/unit/page-auth-boundary.test.ts`, plus the new shared no-lockout invariant
  test this suite authors.
- **AC-S48-13** — Connection Center copy matches server behavior per method. A `google` connector's
  card offers no sign-in control and its setup text names the server configuration step rather than an
  in-app sign-in. An `oauth` connector's Connect press renders the message corresponding to the
  returned `provider_not_available` or `credentials_not_configured` status, and the card's status does
  not become Connected. An `api_key` connector's submitted key produces the `storage_not_configured`
  message, no connection record, and no Connected status. No rendered string on any card claims a
  completed credential flow the server did not perform. _Verify:_
  `npm test -- tests/unit/connection-center-component.test.tsx`,
  `npm test -- tests/unit/connection-status.test.ts`,
  `npm test -- tests/unit/connector-connection-classify.test.ts`.
- **AC-S48-14** — Redaction holds across every new surface: no `requiredConfig` environment variable
  name, no submitted API key, and no provider response body appears in rendered HTML, server logs, or
  test output for any card or panel state, and a pre-provision grant record contains no field capable
  of holding a credential — an email address, role, scopes, actor, reason, and timestamps only.
  _Verify:_ `npm run verify:redaction`; `npm run verify:copy-voice`;
  `npm test -- tests/unit/connection-center-component.test.tsx` plus the pre-provision store schema
  test.

**Forbidden actions / hard gates.** Removing Test UI must not remove tests, Demo parity, provider
implementations, security, receipts, kill switches, or rollback. Do not expose secrets/provider
bodies in Connections. Do not turn Communications into a general inbox or generic compose/send.
Do not create self-registration from dormant code. Never weaken server auth because navigation is
cleaner. External provider setup, send, and writes retain their owning confirmation/gate/evidence;
no undocumented gate flips here. Preserve managed identity, no personal account in any auth path, no
secret, PII, or guessed endpoint in git, no autonomous CLIENT-facing send (internal-staff
notification auto-send is permitted per `D-AUTOMATION-LINE`), generic non-workflow
`gmail.message.send` staying Registry-closed, every live effect one-attempt, idempotent, receipted,
and reversible, and every client-facing send or system-of-record write staying human-confirmed. Live
effects stay inside the production cost ceiling defined by S52.
D61-specific stops: pre-provisioning is Admin-only and never becomes self-service — no route lets a
signed-in user grant, request, or elevate their own role or scopes, and no dormant TOTP or
verification-code primitive is revived to support it. Never create a staff Firebase Auth identity, a
staff password credential, or a staff reset link from this suite. A grant never overwrites an existing
`role` claim, never reaches a Vendor identity, and never reaches an address outside
`allowedHostedDomain`; a malformed grant fails closed and is ignored rather than treated as a default.
Never send an invitation email from this suite — the teammate is told out of band, and the app's job
is to have their access ready. Never ship the D59 default flip and this grant path in a state where an
already-provisioned user loses access; if the interlock cannot be proven green, stop and hand it back.
Never mint a session cookie from the stale token used to write a custom claim, and never treat a
response-only role/scopes overlay as durable authorization. `lib/auth/` is protected: prepare and
verify the auth/default/backfill package for owner review, park its activation, and continue independent
work.
QA-50-specific stops: never write copy asserting a credential flow, a stored secret, or a completed
sign-in the server did not perform; never render a `requiredConfig` variable name, a submitted key, or
a provider response body; and never change a connector's status to Connected on the strength of copy
rather than a real connection record or a passed verification.

**Ordered prompt sequence.**

1. _Discovery:_ inventory every Communications simulation/evaluator, Connections card/setup/health
   path, Admin panel/task, Test/developer control, dormant auth primitive, and their runtime/test/
   script consumers.
2. _Understanding:_ produce the one-owner task map and required tool-disposition ledger. Pin retained
   Gmail, provider, Admin, Vendor, security, and rollback behavior with tests.
3. _Build:_ reduce Communications to workflow-linked work; convert useful lab evaluators to tests or
   bounded approved-rule previews.
4. _Build:_ restructure Connections and Admin into provider/task owners with role guards,
   progressive Advanced detail, safe links, and secret redaction.
5. _Build:_ stage-one remove the explicit obsolete controls and add compatibility instrumentation/
   redirects required by S49; preserve allowed infrastructure categories.
6. _Understanding:_ before touching the Connections copy, write the per-method behavior table —
   method, what control renders, what the server route actually returns, what is stored, and what the
   real next step is — from `ConnectorSetupActions`, the three `/api/connections/[connectorId]`
   routes, `resolveConnectorSecretVault`, and `classifyConnector`. The new copy is generated from that
   table, not from intent.
7. _Build:_ replace the blanket `Set up {name}` claim with per-method copy and correct
   `connectorConnectLabel` where it names an action the page does not offer. Keep every secret,
   variable name, and provider body out of rendered state.
8. _Discovery:_ read `lib/admin/users.ts`, `lib/auth/session.ts`, `app/api/auth/session/route.ts`,
   and `lib/vendor/invite.ts`, and confirm the current claimless defaults and the exact point in
   `createAuthenticatedSession` where a grant can be applied, the stale token refused for cookie
   minting, and the refreshed token verified. Inventory the current roster/backfill seam for D59.
9. _Build:_ add the pre-provision service, its Firestore store with a schema that cannot hold a
   credential, the Admin-only route with preview-hash confirmation and append-only audit, the
   two-request refreshed-token apply-at-first-sign-in seam, the claimless no-access default, the
   redacted reversible roster/backfill plan, the shared no-lockout proof, and the teammate panel with
   its pending-grant list. Isolate the protected `lib/auth/` portion for review.
10. _Verify:_ run AC-S48-1 through AC-S48-14 and falsify general mailbox access, secret exposure,
    non-Admin setup, orphan Admin tasks, hidden simulator routes, security-helper deletion,
    environment leakage, a self-service grant path, a grant overwriting an existing role claim, a
    grant reaching a Vendor or out-of-domain address, a duplicate grant, a replayed preview hash, a
    locked-out existing user under the D59 default, and copy that outruns what the server returned.
11. _Gate:_ no aggregate gate flip. Provider actions remain independently activated by their owner
    specs; finished configured actions are shown normally, not as a Test tool. Confirm the Action
    Registry, provider factories, and secret-vault resolution are unchanged.
12. _Context update:_ record S48’s fact and disposition ledger with the AC ids it satisfies, note the
    D61 grant contract and S48's D59 interlock ownership, distinguish BUILT_TO_SEAM from the protected
    auth/backfill activation, update guide/manual QA/facts, and advance
    `docs/loop-state.md` to S49.

**Deletion/merge recommendation.** KEEP this spec. MERGE provider status/setup under Connections and
Admin tasks under subroutes, and MERGE the teammate panel and pre-provision control into the existing
People and access surface rather than adding a separate Invite destination. RETIRE_UI all named
obsolete tools now; S49 performs bounded code deletion only after proof. Retire the blanket
`Set up {name}` claim outright — it has no honest variant. Keep `lib/vendor/invite.ts` untouched as
the external Vendor path; it is a shape to copy, not a module to share. Preserve historical S15 as
evidence, not active product direction. The disposable
`docs/temp/admin-connections-tool-retirement-plan.md` packet carries the per-method behavior table and
the tool-disposition working notes and is deleted once their outcomes are recorded durably.
