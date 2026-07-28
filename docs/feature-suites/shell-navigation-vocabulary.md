<!-- spec-shape: overhaul-v1 -->

# S41 — Role-aware shell, navigation, and operator vocabulary

> New 2026-07-28. Implements D-02, D-04, and D-14; consumes S40’s environment vocabulary.

**Goal.** An internal operator immediately sees where daily work lives without scrolling through
setup and diagnostics. Console, Renewals, Maintenance, and Approvals are the four daily
destinations; Spaces remains a first-class knowledge destination; role-appropriate utilities live
under a compact More/account area. Phone navigation consumes little vertical space, Feedback never
covers a task, and daily copy describes the work rather than the implementation.

**What it is / how it functions.**

- **Information hierarchy.** Treat the four daily destinations as one `Work` group. Treat Spaces as
  a separate, persistent primary `Knowledge` destination—not an Admin catalog and not a fifth daily
  queue. Notifications is an icon/badge that opens event history. Communications, Connections, and
  Admin appear in a role-aware More/utility area.
- **Desktop shell.** Show the product/environment identity, the four daily links, visibly separated
  Spaces, Notifications, and the account/More control without wrapping at supported desktop widths.
  Current location uses both visual and semantic state. Long role/environment labels do not push
  actions to another row.
- **Mobile shell.** At 390×844, render a compact header plus four daily shortcuts and one disclosure,
  or an equivalent pattern that leaves the first task control above the fold. Spaces is the first
  non-daily primary destination in the disclosure. Notifications/account/role-aware utilities are
  reachable within one disclosure, keyboard and screen-reader operable, focus-trapped while open,
  and restored to the trigger on close.
- **Role and scope filtering.** Internal Editors/Approvers/Admins see only destinations allowed by
  capability and Space scope. Connections and Admin remain Admin-only. Communications appears only
  for a workflow/mailbox-authorized internal user. A Vendor never receives the internal shell and
  remains in the assigned-ticket portal.
- **Feedback placement.** Remove the fixed control from task content on narrow screens or reserve
  measured safe space. Mobile Feedback belongs in the utility disclosure unless an equivalent
  non-overlapping treatment is proven.
- **Plain-language map.** Operator surfaces say `Compare sources`, `Needs decision`,
  `Ready to send`, `Sent`, `Source unavailable`, `Open RentVine`, `Demo environment`, and
  `Production`. Registry keys, `production_allowed`, readiness enums, “raw reconciliation,”
  “bodyless,” “persistent Test,” and “Final-V1 external execution” live only in expandable
  Connections/Admin diagnostics.
- **Buildable now (app-plane).** Shared navigation model, role/scope filter, desktop/mobile shell,
  focus behavior, Feedback relocation, route labels, copy helpers, responsive tokens, and tests.
- **Build to the seam (live provider).** None. Navigation and vocabulary have no provider effect.
- **Owner dependency (the one flip).** None. This is app-plane and ships after verification; the
  normal owner-run deploy is not a feature-specific dependency.

**Open questions & assumptions.**

- _Answered 2026-07-28 (D-02):_ four daily destinations are Console, Renewals, Maintenance, and
  Approvals; utilities are role-aware.
- _Answered 2026-07-28 (D-04):_ Spaces remains primary. “Primary” means a first-class Knowledge
  destination in the IA and persistent desktop shell; on mobile it is pinned first in the compact
  disclosure so the four daily shortcuts remain usable.
- _Answered 2026-07-28 (D-14):_ daily operator copy uses the plain-language map above.
- _Assumption:_ the executor may select bottom navigation, compact tabs, or an equivalent accessible
  mobile pattern after measuring the existing shell; the observable hierarchy and content-height
  requirements are fixed.
- Decision-complete: no visual-pattern approval is required if all acceptance behavior holds.

**Cross-product impacts.**

- Likely touchpoints include `components/layout/AppShell.tsx`, primary/mobile navigation helpers,
  role/capability route definitions, Feedback, notification badge, and responsive tokens. Exact
  extraction boundaries are executor-owned.
- All internal routes consume this shell. S42 owns destination contents, S43/S45/S46 own task
  surfaces, and S48 owns the utility destinations.
- Supersedes older S17/S14 coexistence assumptions only where they require all links or duplicate
  views to remain equally primary. Add the applicable Supersede Log marker when code ships.

**Adversarial acceptance checks.**

- **AC-S41-1** — An authorized desktop user sees exactly four items in the Daily work group,
  Spaces as a separately labeled primary Knowledge destination, Notifications, and role-filtered
  utilities; an Editor cannot discover an Admin/Connections href through rendered DOM, keyboard
  navigation, or serialized nav data. _Verify:_ shell and route-auth tests.
- **AC-S41-2** — At 390×844 the shell does not wrap into the task viewport, Feedback covers no
  actionable control, the first task control remains visible without scrolling past navigation, and
  opening/closing the disclosure traps/restores focus correctly. _Verify:_ authenticated mobile
  browser task and overlay-collision assertions.
- **AC-S41-3** — A scoped internal user sees only allowed Renewals/Maintenance/Spaces destinations;
  the external Vendor receives no internal nav model even when its email uses an internal-looking
  domain. _Verify:_ role/scope/identity-class tests.
- **AC-S41-4** — Daily pages contain none of the forbidden engineering terms, while Advanced
  diagnostics retain the exact gate/provider values needed for support. _Verify:_ rendered-copy
  scan plus diagnostics assertions.
- **AC-S41-5** — Active-route semantics, keyboard order, accessible names, escape/outside close,
  heading hierarchy, and 200% zoom remain usable on phone and desktop. _Verify:_ component a11y and
  browser checks.
- **AC-S41-6** — `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run test:e2e:core`, `npm run verify:spec-traceability`, and `npm run build` pass; keep auth
  boundary, route-link graph, and responsive-shell sentinels green.

**Forbidden actions / hard gates.** Do not weaken server authorization because a link is hidden.
Do not expose internal nav to any Vendor identity. Do not fork the product shell by environment
beyond labels/effect-safe context. Do not use a browser flag for environment or role. No external
send/write, Action Registry change, credential, or new scope belongs here. Preserve managed
identity, no secrets/PII, no autonomous client send, generic-send closure, reversible live effects,
and the cost cap.

**Ordered prompt sequence.**

1. _Discovery:_ inventory shell/nav/Feedback/notification/role/scope code and measure desktop plus
   390×844 header height, wrapping, focus order, and first actionable control on every primary route.
2. _Understanding:_ write one route-to-group/role/scope table and one old-copy-to-new-copy map;
   identify which strings must remain in Advanced diagnostics.
3. _Build:_ create one shared navigation model and render the desktop and mobile treatments with
   role/scope filters, Spaces hierarchy, notification state, account utilities, and Feedback safety.
4. _Build:_ replace daily engineering copy across the shell and shared labels; do not mechanically
   alter code keys, logs, tests, or Advanced diagnostics.
5. _Verify:_ falsify wrapping, overlay, inaccessible disclosure, hidden-link leakage, Vendor shell
   access, wrong scope, and forbidden-copy regressions; run AC-S41-1 through AC-S41-6.
6. _Gate:_ no action gate exists; confirm Action Registry and provider factories are unchanged.
7. _Context update:_ record the shipped shell fact with AC references, update manual QA and the app
   guide, then advance `docs/loop-state.md` to S42.

**Deletion/merge recommendation.** KEEP this spec. MERGE duplicate desktop/mobile nav declarations
into one typed model. RETIRE the wrapping full-link mobile header and fixed overlapping Feedback
treatment with a one-release rollback path; delete obsolete CSS/components under S49 proof.
