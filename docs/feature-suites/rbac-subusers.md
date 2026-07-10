<!-- spec-shape: overhaul-v1 -->

# S16 — Role-scoped sub-users (maintenance-only), via an orthogonal space-scope claim

> New 2026-07-10 (operator note). Authored decision-complete. The design decision below —
> model surface restriction as an ORTHOGONAL `scopes` custom claim layered on the existing
> `role` tier, with a MISSING claim meaning ALL spaces — is the owner-default, confirm-with-default
> encoding; it is backward-compatible (no live re-claiming of Dan/Josiah) and fails safe to today's
> behavior. This suite is F-ADMIN-USERS-adjacent and preserves the route-auth-boundary invariant
> (`F-MAINT-INTAKE-PUBLIC`) by EXTENDING it, never weakening it.

**Goal.** The owner wants to hand a maintenance worker a sub-user login that opens ONLY the
Maintenance Work Order Intake surface and cannot reach lease renewal, the approval queue, or the
rest of the console. Today access is a single FLAT, monotonic capability lattice: `ROLES`
(`lib/constants.ts:30`) is `Editor`/`Approver`/`Admin`, carried in one Firebase custom claim
`role`, and `can(role, capability)` (`lib/auth/roles.ts:13-28`) is strictly additive — an `Editor`
claim reaches maintenance AND lease renewal AND everything else alike, because pages guard only on a
capability (`app/maintenance/page.tsx:16` calls `requirePageCapability("edit")`; `app/lease-renewal`
guards the same tier). There is no per-space/per-surface axis, and adding a fourth role on the SAME
axis would break the monotonic lattice. The end state: a second, orthogonal `scopes` claim narrows
WHICH spaces a principal may enter, while `role` keeps governing the capability tier WITHIN a
reachable space; a maintenance sub-user is `{ role: "Editor", scopes: ["maintenance"] }` and is
denied every renewals/approval surface at the guard, in the nav, in the Spaces directory, and in the
Console deck — with a missing `scopes` claim continuing to mean full access so nobody currently
signed in has to be re-claimed.

**What it is / how it functions.** Two independent axes. `role` (unchanged) = the capability tier
(`can()` lattice). `scopes` (new) = the set of space-scopes a principal may enter, an orthogonal
Firebase custom claim carried alongside `role`. A principal is admitted to a surface only if BOTH
its role satisfies the surface's capability AND its scopes include the surface's space-scope. The
wildcard rule is load-bearing: a principal whose `scopes` claim is ABSENT is treated as "all spaces"
(`hasSpaceAccess` returns true for every scope), so existing sessions and the demo users keep
today's reach with zero migration.

- **Scope vocabulary — `lib/constants.ts`.** A new `SPACE_SCOPES` frozen tuple (sibling of `ROLES`)
  enumerates the assignable space-scope ids (initial set: `"renewals"`, `"maintenance"`, keyed to
  the two spaces that have real operator desks today — `lib/spaces.ts:14-66` / `spaceHref`
  :71-75 — extensible additively as more spaces grow teeth). A `SPACE_SCOPE_HOME` map gives each
  scope its canonical landing href (`maintenance → /maintenance`, `renewals → /lease-renewal`).
- **Claim shape + validation — `lib/auth/session.ts`.** `AuthenticatedUser` (:16-21) gains
  `scopes?: readonly SpaceScope[]` (undefined = ALL); `AuthClaims` (:23-28) gains `scopes?: unknown`.
  `validateAuthClaims` (:206-218) parses it: absent/null/`""` → `undefined` (ALL); a present value
  MUST be a non-empty array whose every entry is in `SPACE_SCOPES`, else `AuthError(403)` — an empty
  array or an unknown scope is rejected (a zero-space or garbage principal fails loud rather than
  silently locking out or fanning open). `validateFirebaseAuthClaims` (:220-240) threads
  `scopes: claims.scopes` through exactly as it threads `role`. The `hd === allowedHd` boundary
  (:213) is untouched.
- **Guards — `lib/auth/session.ts` + `lib/auth/page-guards.ts`.** Pure `hasSpaceAccess(user, scope)`
  (undefined scopes ⇒ true). `requireSpaceAccess(scope)` and a combined
  `requireCapabilityInSpace(capability, scope)` mirror `requireCapability` (:196-204) and throw
  `AuthError(403)` on a scope miss (observable JSON 403 on API routes). `requirePageSpaceAccess(scope)`
  mirrors `requirePageCapability` (:10-18) but on a scope-denial redirects the (already
  authenticated) principal to `primarySpaceHref(user)` — their in-scope landing — NOT to `/sign-in`
  (a signed-in user is never bounced to the sign-in page for an in-app scope miss;
  `handlePageAuthError` :28-35 keeps its 401→`/sign-in`, 403→`/sign-in?error=forbidden` mapping for
  true auth failures).
- **Surface wiring.** `/maintenance` adds `requirePageSpaceAccess("maintenance")` beside its existing
  `requirePageCapability("edit")`; `/lease-renewal` (+ `/lease-renewal/**`) and `/approval-queue` add
  `requirePageSpaceAccess("renewals")`; the maintenance and lease-renewal/approval API routes add
  `requireCapabilityInSpace(...)`. The public HMAC intake (`app/api/maintenance/intake/public`) stays
  UNSCOPED and unauthenticated (the external-reporter path; see the gate below).
- **Nav filter — `components/layout/AppShell.tsx:12-16`.** Each `navItems` entry declares an optional
  `scope`; items whose scope the principal lacks are dropped (a maintenance-only principal loses the
  "Approval Queue" link). Console / Spaces / Connections stay (cross-cutting, content-filtered); the
  Admin link keeps its `manageAdmin` gate (:41).
- **Directory + Console filter — `app/spaces/page.tsx:44-66`, `components/console/ConsoleView.tsx:74-126`.**
  The Spaces directory renders only cards whose space is in scope; `/spaces/[spaceId]` for an
  out-of-scope space is denied. The Console action deck rows and process strip
  (`ConsoleActionDeck`/`ConsoleProcessStrip`) drop out-of-scope rows so a maintenance principal never
  sees a renewals row or chip.
- **Enumerating invariant extension — `tests/unit/route-auth-boundary.test.ts`.** A new assertion adds
  a curated `SCOPED_ROUTE_SCOPE` map (route prefix → required space-scope) and fails if any route under
  a scoped prefix omits `requireSpaceAccess`/`requireCapabilityInSpace`, EXTENDING the existing
  every-route-is-authed check (:54-63) and its 3-entry `ALLOW_UNAUTHENTICATED` (:41-45) untouched.
- **Admin scope editor — `lib/admin/users.ts`, `components/admin/UserManagementPanel.tsx`.**
  `setAppUserScopes` is the sibling of `setAppUserRole` (:96-172): manageAdmin-gated, same
  pmikcmetro.com domain boundary, same mandatory ≥3-char reason, merged onto the existing claims via
  `setCustomUserClaims` so the `role` claim is preserved untouched, and an append-only audit written to
  a new `admin_scope_changes` twin collection (`recordAdminScopeChange`, mirroring
  `lib/firestore/admin-role-changes.ts:26-32`). The panel gains a per-user space-scope multi-select +
  an "All spaces" (clear the claim) toggle + reason.

- **Buildable now (app-plane).** No system-of-record write, no autonomous send, no new Google scope,
  `production_allowed:false`, not an Action Registry entry (an app-plane auth op like F-ADMIN-USERS).
  The loop may build all of the below unattended:
  - The `SPACE_SCOPES` + `SPACE_SCOPE_HOME` vocabulary in `lib/constants.ts` and the `SpaceScope` type.
  - The orthogonal `scopes` field on `AuthClaims`/`AuthenticatedUser` + parsing/rejection in
    `validateAuthClaims`/`validateFirebaseAuthClaims`, unit-tested via `setAuthResolverForTest`
    (`lib/auth/session.ts:67-73`) — including the wildcard (absent ⇒ ALL), empty-array reject, and
    unknown-scope reject paths.
  - `hasSpaceAccess` + `requireSpaceAccess` + `requireCapabilityInSpace` (session) + `requirePageSpaceAccess`
    - `primarySpaceHref` (page-guards), with the maintenance ALLOW / lease-renewal + approval-queue +
      out-of-scope-space DENY wiring.
  - Nav (`AppShell`), Spaces directory (`app/spaces/page.tsx`), `/spaces/[spaceId]`, and Console
    deck/process-strip (`ConsoleView`) scope filtering.
  - The `tests/unit/route-auth-boundary.test.ts` scoped-route extension.
  - `setAppUserScopes` + `PATCH /api/admin/users/[uid]/scopes` + the `admin_scope_changes` twin +
    `firestore.rules` (server-write-only, Admin-read, mirroring `admin_role_changes`) + the
    `UserManagementPanel` scope editor.
  - The missing design section in `docs/auth-identity-and-access-strategy.md`.
  - (Optional, for local exercisability) a `local-demo:{role}:{scope,scope}` demo-cookie extension in
    `readLocalDemoSessionRole` so a scoped principal is drivable with a plain `npm run dev`; primary
    testing stays through `setAuthResolverForTest`.
- **Gated (owner / vendor).** The loop STOPS at each of these:
  - Live claim assignment: minting each real maintenance sub-user is owner-run — create the
    `pmikcmetro.com` Firebase Auth account, then set `{ role, scopes }` via the manageAdmin scope
    editor (or the break-glass `firebase:set-role`-style path). The loop never assigns a live claim.
  - The EXTERNAL-worker "Submitter" identity/onboarding — a CLIENT-owned access/identity decision. The
    `hd === pmikcmetro.com` boundary (`lib/auth/session.ts:213`) forbids outside Google accounts, so a
    third-party vendor cannot be a scoped sub-user under the current policy; outside reporters keep using
    the anonymous HMAC public intake (`F-MAINT-INTAKE-PUBLIC`). Widening identity to admit external
    workers is out of scope here and needs the client's decision.
  - Deploy stays owner-run.

**Open questions & assumptions.**

- _Assumption:_ the initial `SPACE_SCOPES` set is exactly `["renewals", "maintenance"]` — the two
  spaces with real operator desks (`lib/spaces.ts` / `spaceHref`). Other launch spaces
  (owner-email, inbox, onboarding, …) open the generic space-detail page and are not separately
  scope-gated this cycle; they become scope ids additively when they grow teeth. Adding a scope id is
  backward-compatible (existing wildcard principals keep ALL).
- _Assumption:_ the Approval Queue is `renewals`-scoped, because today it holds only renewal reviews,
  write-back proposals, and the renewal-centric needs-decision inbox — a maintenance-only principal has
  nothing to decide there. When a maintenance approval flow exists, split the queue's scope check per
  section rather than widening the maintenance principal.
- _Assumption:_ an absent `scopes` claim = ALL spaces (owner-default), and an empty-array claim is
  INVALID (rejected 403), so "no access" is never expressible by accident — a real sub-user always
  carries ≥1 explicit scope. This fails safe to today's behavior and needs no re-claim of Dan/Josiah.
- _Assumption:_ scopes NARROW; they never grant beyond `role`. A maintenance `Editor` still cannot
  approve inside maintenance (no `approve` capability); the space axis only subtracts reach.
- _Open:_ whether a scope-denied page request should land the sub-user on their primary space
  (`primarySpaceHref`, the default encoded here) or a dedicated "not available for your access" page.
  Default chosen; revisit only if the owner wants an explicit denial screen. (Record as `Q-RBAC-1` in
  `docs/facts.md` "## Open Questions".)
- _Client-owned:_ the external-worker "Submitter" identity model — whether/how a non-`pmikcmetro.com`
  worker ever gets an authenticated login vs. staying on the anonymous public intake. Route to
  `docs/client-checklist.md` as confirm-with-default (default: no outside logins; the HMAC intake
  remains the only external ingress). Tracked alongside the existing intake access asks.
- _Assumption:_ hard gates unchanged this cycle — no autonomous send, no SoR write, no new Google
  scope, no Cloud Scheduler, no client data on GitHub, every Action Registry entry
  `production_allowed:false`, ~$10 cap; deploy owner-run.

**Cross-product impacts.** `lib/constants.ts` (new `SPACE_SCOPES`/`SPACE_SCOPE_HOME`);
`lib/auth/session.ts` (claim + validation + `hasSpaceAccess`/`requireSpaceAccess`/
`requireCapabilityInSpace`); `lib/auth/page-guards.ts` (`requirePageSpaceAccess`/`primarySpaceHref`);
`app/maintenance/page.tsx`, `app/lease-renewal/**`, `app/approval-queue/page.tsx` (page guards);
`app/api/maintenance/**` (except `intake/public`), `app/api/lease-renewal/**`, `app/api/approval-queue/**`
(route guards); `components/layout/AppShell.tsx` (nav filter); `app/spaces/page.tsx`,
`app/spaces/[spaceId]/page.tsx`, `lib/spaces.ts` (directory filter); `components/console/ConsoleView.tsx`,
`components/console/ConsoleActionDeck.tsx`, `components/console/ConsoleProcessStrip.tsx` (deck/strip
filter); `lib/admin/users.ts` + `app/api/admin/users/[uid]/scopes/route.ts` +
`components/admin/UserManagementPanel.tsx` (scope editor); `lib/firestore/admin-scope-changes.ts` +
`firestore.rules` (audit twin); `tests/unit/route-auth-boundary.test.ts` (invariant extension);
`docs/auth-identity-and-access-strategy.md` (design section). Interacts with `F-ADMIN-USERS`
(sibling setter/audit pattern), `F-MAINT-ASSIGNEE` (the assignee roster in `lib/maintenance/assignees.ts`
already mirrors the domain-boundary defense-in-depth), and PRESERVES `F-MAINT-INTAKE-PUBLIC` (the
enumerating route-auth-boundary invariant) by extending it. Supersedes no active guidance.

**Adversarial acceptance checks.** Falsifiable, observable states. Verify command list at the end.

- **AC-S16-1** — `validateAuthClaims({ …, scopes: ["maintenance"] })` returns an `AuthenticatedUser`
  whose `scopes` deep-equals `["maintenance"]`; with `scopes` absent it returns `scopes === undefined`
  (the ALL wildcard); with `scopes: []` or `scopes: ["nope"]` it THROWS `AuthError` status `403`.
  _Verify:_ `npm test -- tests/unit/auth-session.test.ts`; keep `tests/unit/roles.test.ts` green.
- **AC-S16-2** — a maintenance-scoped principal (`role:"Editor", scopes:["maintenance"]`, injected via
  `setAuthResolverForTest`) that calls a `renewals`-scoped API route (e.g. any
  `app/api/lease-renewal/**` or `app/api/approval-queue/**`) receives HTTP `403` with a JSON `{error}`
  body; the same principal calling an in-scope `app/api/maintenance/**` route is NOT rejected by the
  space guard (passes to its capability check). _Verify:_ `npm test -- tests/unit/space-scope.test.ts`.
- **AC-S16-3** — the same principal requesting the `/lease-renewal` or `/approval-queue` PAGE is
  redirected (Next `redirect()` is invoked) to `primarySpaceHref(user)` = `/maintenance` and the target
  surface never renders; requesting `/maintenance` renders (no redirect). A truly unauthenticated request
  still redirects to `/sign-in`. _Verify:_ `npm test -- tests/unit/page-guards.test.ts`.
- **AC-S16-4** — the Spaces directory rendered for `scopes:["maintenance"]` contains ONLY the
  Maintenance space card (renewal + other cards absent from the DOM), and `ConsoleView` for that
  principal emits deck rows and a process strip with NO renewals row/chip. A wildcard principal
  (`scopes: undefined`) renders every card/row unchanged. _Verify:_
  `npm test -- tests/unit/console-view.test.tsx`; keep `tests/unit/space-card-state.test.ts` green.
- **AC-S16-5** — `AppShell` rendered for `scopes:["maintenance"]` emits NO "Approval Queue" nav link
  (the `renewals`-scoped item is filtered out); a wildcard principal renders all of Console / Spaces /
  Approval Queue / Connections exactly as today, and the Admin link still appears only under
  `manageAdmin`. _Verify:_ `npm test -- tests/unit/app-shell.test.tsx`.
- **AC-S16-6** — `tests/unit/route-auth-boundary.test.ts` fails if any route under a mapped scoped
  prefix (maintenance except `intake/public`, lease-renewal, approval-queue) omits
  `requireSpaceAccess`/`requireCapabilityInSpace`; the pre-existing "every route is authed" check, its
  3-entry `ALLOW_UNAUTHENTICATED` (`auth/session`, `auth/demo`, `maintenance/intake/public`), and the
  public-intake negative-import assertions all stay green (invariant EXTENDED, not weakened). _Verify:_
  `npm test -- tests/unit/route-auth-boundary.test.ts`.
- **AC-S16-7** — a manageAdmin actor `PATCH /api/admin/users/:uid/scopes` with `{ scopes:["maintenance"],
reason:"maintenance sub-user" }` persists via `setCustomUserClaims` merged so the target's existing
  `role` claim is UNCHANGED, and appends exactly ONE `admin_scope_changes` record carrying
  `previous_scopes`/`new_scopes`/`reason`/actor/target; a target outside `@pmikcmetro.com` → status `403`,
  a `reason` under 3 chars → `400`, an empty/unknown `scopes` array → `400`, and a caller lacking
  `manageAdmin` → `403`. _Verify:_ `npm test -- tests/unit/admin-scopes.test.ts tests/unit/admin-scopes-route.test.ts`;
  keep `tests/unit/admin-users.test.ts` and `tests/unit/admin-users-route.test.ts` green.
- **AC-S16-8** — backward-compat: a principal with a `role` claim and NO `scopes` claim reaches every
  surface exactly as before — `validateAuthClaims` yields `scopes === undefined`, `hasSpaceAccess`
  returns `true` for every scope, and every page/route/nav/directory/deck check admits them; no live
  re-claiming of Dan/Josiah is required. _Verify:_ `npm test -- tests/unit/space-scope.test.ts`.
- **AC-S16-9** — the external boundary is unchanged: `validateAuthClaims` with an out-of-domain `hd`
  still throws `403` regardless of scopes (a scoped sub-user is still a `pmikcmetro.com` account), and
  `maintenance/intake/public` remains in `ALLOW_UNAUTHENTICATED` and carries NO space guard, so outside
  reporters keep the anonymous HMAC intake. _Verify:_ `npm test -- tests/unit/route-auth-boundary.test.ts tests/unit/auth-session.test.ts`.

_Verify (full):_ `npm test`, `npm run typecheck`, `npm run lint`, then `npm run verify`
(`bash scripts/verify.sh`); `npm run verify:spec-traceability` and `npm run verify:context-freshness`
at the promote step. NAMED sentinels to keep green throughout: `tests/unit/route-auth-boundary.test.ts`
(the F-MAINT-INTAKE-PUBLIC invariant — extend only), `tests/unit/roles.test.ts`,
`tests/unit/auth-session.test.ts`, `tests/unit/page-guards.test.ts`, `tests/unit/admin-users.test.ts`,
`tests/unit/admin-users-route.test.ts`, `tests/unit/console-view.test.tsx`,
`tests/unit/space-card-state.test.ts`.

**Forbidden actions / hard gates.** App-plane only; every Action Registry entry
`production_allowed:false` (this suite adds NO registry entry — it is an app-plane auth op, like
F-ADMIN-USERS); no autonomous send; no system-of-record write (RentVine / Sheet / QuickBooks / bank /
client Drive); no new Google scope; no Cloud Scheduler; no client data on GitHub; ~$10 budget cap;
deploy stays owner-run. Suite-specific hard stops, each a falsification if violated: (1) the
`hd === pmikcmetro.com` boundary must NOT be widened to admit outside accounts — the external
"Submitter" stays gated and outside reporters keep the anonymous HMAC intake. (2) scopes may only
NARROW reach; a scope check must never grant a capability the `role` lattice denies. (3) the missing
`scopes` wildcard fails safe to CURRENT behavior (ALL spaces, still bounded by role) — it must never
fail open to MORE than role allows. (4) the route-auth-boundary invariant is EXTENDED, never weakened:
do not add a `Space` alternative to the base `AUTH_GUARD` regex in a way that lets an unauthenticated
route pass, and the public intake stays the app's only unauthenticated route. (5) the loop never
assigns a LIVE scope claim — real sub-user minting is owner-run behind `manageAdmin`.

**Ordered prompt sequence.**

1. _Discovery:_ confirm the two-axis model against `lib/auth/roles.ts` + `lib/auth/session.ts` +
   `lib/auth/page-guards.ts` and the guard call-sites (`app/maintenance/page.tsx:16`, the lease-renewal
   and approval-queue pages, the maintenance/lease-renewal API routes); list every scoped route prefix.
2. _Build:_ add `SPACE_SCOPES`/`SPACE_SCOPE_HOME` + `SpaceScope` to `lib/constants.ts`; thread the
   `scopes` claim + validation into `lib/auth/session.ts` (wildcard, empty-array reject, unknown reject);
   unit-test via `setAuthResolverForTest`. (Satisfies AC-S16-1, AC-S16-8, AC-S16-9 claim path.)
3. _Build:_ add `hasSpaceAccess`/`requireSpaceAccess`/`requireCapabilityInSpace` (session) +
   `requirePageSpaceAccess`/`primarySpaceHref` (page-guards); wire the maintenance ALLOW and
   lease-renewal/approval-queue/out-of-scope-space DENY on pages and API routes. (AC-S16-2, AC-S16-3.)
4. _Build:_ filter the nav (`AppShell`), the Spaces directory (`app/spaces/page.tsx` +
   `/spaces/[spaceId]`), and the Console deck/process-strip (`ConsoleView`). (AC-S16-4, AC-S16-5.)
5. _Build:_ EXTEND `tests/unit/route-auth-boundary.test.ts` with the scoped-route map; prove the
   existing every-route-authed check and `ALLOW_UNAUTHENTICATED` stay green. (AC-S16-6.)
6. _Build:_ add `setAppUserScopes` + `PATCH /api/admin/users/[uid]/scopes` + the `admin_scope_changes`
   twin + `firestore.rules` + the `UserManagementPanel` scope editor; unit-test the domain/reason/empty
   guards + the single-audit-record + manageAdmin gate. (AC-S16-7.)
7. _Build:_ write the "Role-scoped sub-users (orthogonal space-scope claim)" section into
   `docs/auth-identity-and-access-strategy.md`, documenting both axes, the wildcard, the guard, and the
   external-Submitter gate; add `Q-RBAC-1` to `docs/facts.md` Open Questions.
8. _Verify:_ run the full command list above; falsification pass (attempt each denial and each
   backward-compat path); confirm every named sentinel stays green.
9. _Gate / Owner:_ STOP. Hand back for owner-run live claim assignment (mint one real maintenance
   sub-user account + set `{ role:"Editor", scopes:["maintenance"] }`) and the client decision on the
   external Submitter; deploy owner-run.
10. _Context update:_ promote the shipped app-plane work to a `docs/facts.md` `F-RBAC-SUBUSERS` row
    citing AC-S16-1..9, and update `docs/loop-state.md` (Next Safe Slice + Stop-Condition State) at the
    slice boundary; run `npm run verify:context-freshness` and `npm run verify:spec-traceability`.

**Deletion/merge recommendation.** KEEP as this suite's tracked spec; the disposable
`docs/temp/rbac-subusers-plan.md` packet (if a builder writes one) stays local-only evidence. Do NOT
merge into S4 (Maintenance intake) or S13 — this is a cross-cutting AUTH primitive (a new access axis)
that maintenance is merely the first consumer of; folding it into a process suite would hide the
app-wide invariant. Once built, F-RBAC-SUBUSERS supersedes any implicit "role is the only access axis"
assumption in `docs/auth-identity-and-access-strategy.md`; record that in the facts Supersede Log.
