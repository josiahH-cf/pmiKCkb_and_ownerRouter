<!-- spec-shape: overhaul-v1 -->

# S17 — Unified Console + attention hub + Dan's review lane

> New 2026-07-10 (operator note). Locked owner decision **D2 (2026-07-10)**: KEEP the Console as the
> at-a-glance home (`F-IA-CONSOLE-HOME`); BUILD Notifications into a superset, time-ordered hub/log that
> the same signals ALSO flow into (ADD, do not MOVE). Keep ONE shared source (`gatherNeedsDecisionInbox`)
> so counts never diverge — this extends the S13 B5 single-gather interlock, it does not replace it. The
> disposable mapping packet is `docs/temp/unified-console-and-attention-plan.md` (local-only).

**Goal.** Make the app read as ONE workflow tool, not a pile of overlapping alerts, and let Dan verify
his team without re-checking every value. Today "needs your decision" is triplicated (the Console deck
card, the `NotificationMenu` Approvals family, and `/approval-queue`), there is no `/notifications`
PAGE (only a bell dropdown), and three disjoint attention projections answer overlapping questions in
different vocabularies — `gatherNeedsDecisionInbox` (value-free state), `buildNotificationFeed` (event
records), and `buildRenewalAttention` (renewal fold). The only thing that surfaces to a supervisor is
MACHINE reconciliation flags (RentVine vs Sheet disagreements), never a review of the edits and choices
Dan's TEAM made, and alarm control is a single binary per-family mute. End state: a dedicated read-only
Notifications hub that is a true superset of the Console; the Console's three deck areas representable as
notification families; one value-free attention contract behind the bell, the deck, and the desk so
their counts and words never diverge; a low-alarm layer (per-lane severity threshold, snooze, in-app
digest) on top of the mute primitive; and a value-free, Admin-scoped, muteable REVIEW DIGEST that rolls
up high-risk overrides and self-corrections so Dan sees the exceptions, never one ping per team edit.
Every surface stays read-only or app-plane; nothing here sends, writes a system of record, or reads a
new external source.

**What it is / how it functions.** The spine is the locked D2 rule: the Console stays the home, the hub
is a superset LOG, and there is exactly ONE value-free gather (`gatherNeedsDecisionInbox`,
`lib/approval/needs-decision-gather.ts:27`) feeding the decision count everywhere. Modules named below
are the real ones read for this spec.

- **The three projections we are unifying.** `gatherNeedsDecisionInbox` returns a value-free
  `NeedsDecisionInbox {rows, counts}` (`lib/approval/needs-decision-inbox.ts:47`), deduped and
  severity-ordered; the Console deck reads it (`components/console/ConsoleView.tsx:70`) and so does the
  Ask app-state provider (`lib/ask/app-state-context.ts:41`). `buildNotificationFeed`
  (`lib/notifications/feed.ts:28`) merges persisted approval + maintenance notification RECORDS
  newest-first, drops muted families, and is served by `GET /api/notifications`
  (`app/api/notifications/route.ts:12`); the bell (`components/layout/NotificationMenu.tsx:12`) renders
  it. `buildRenewalAttention` (`lib/lease-renewal/attention.ts:82`) folds actionable leases into one
  next-action-per-lease list on the Renewal Desk (`components/lease-renewal/RenewalDesk.tsx:32`). The
  unifier is a new pure, client-safe attention contract (`lib/attention/lanes.ts`) that stamps every
  signal with a `lane` from a small closed enum (`decision | connection | coverage | renewal | review`),
  a `severity`, and only value-free display fields, so all three projections speak one vocabulary and no
  surface can invent a fourth.

- **Buildable now (app-plane).**
  - **B1 — the `/notifications` hub PAGE.** A new read-only server route `app/notifications/page.tsx`
    that renders `buildNotificationFeed` as a time-ordered LOG (the API and builder already exist), plus
    a "See all notifications" link from the bell popover alongside the existing "Open Approval Queue"
    (`NotificationMenu.tsx:173`). Read-gated (`requireCapability("read")`), self-scoped, non-fatal
    degrade. No new data source: it reuses the exact `/api/notifications` payload the bell already loads.
  - **B2 — connections + coverage as notification families.** Add two AVAILABLE in-app families
    `connections_setup` and `space_coverage` to `NOTIFICATION_FAMILIES` (`lib/notifications/families.ts:51`),
    sourced from `resolveConnectionsState()` / `resolveCoverageState()` (`lib/ask/app-state-context.ts:65,94`).
    These are STANDING conditions (true-now state), not event records, so the feed builder gains a
    value-free "standing signals" input alongside the persisted records; they render in a labelled
    "Set-up" section of the hub under the same mute controls. No new external call — `resolveConnectionsState`
    reads `process.env` + connector presence, `resolveCoverageState` reads the process-definition list the
    Console already gathered. This makes the hub a true superset of the Console's three deck cards
    (approvals ⇒ `approval_queue`; connections ⇒ `connections_setup`; coverage ⇒ `space_coverage`).
  - **B3 — one value-free attention contract.** `lib/attention/lanes.ts` exports `ATTENTION_LANES` +
    `toAttentionSignal(...)`; the deck, the bell/hub, and the renewal desk all derive their lane label +
    severity from this ONE table, and the "Needs your decision" integer is always
    `gatherNeedsDecisionInbox(user).counts.total` — never recomputed per surface (extends S13 B5). The
    contract copies ONLY value-free keys (`lane`, `severity`, `label`, `detail`, `href`, stable
    `signal_key`); the real values stay behind each `href` (connector design §6.1).
  - **B4 — low-alarm layer.** Extend the per-user preference record (`user_notification_preferences`,
    `lib/firestore/notification-preferences.ts:26`) and `UpdateNotificationPreferencesInputSchema`
    (`lib/firestore/schemas.ts:416`) additively with `lane_thresholds` (per-lane minimum severity),
    `snoozed_lanes` (lane → snooze-until ISO), and `digest_lanes` (roll a lane into a single digest row
    instead of individual rows). A pure resolver applies them when building the feed. App-plane
    preference writes ONLY; these shape what the IN-APP feed shows and deliver nothing. `email_enabled`
    stays the literal-`false` type.
  - **B5 — Dan's review lane (value-free, Admin-scoped, muteable DIGEST).** A new Admin-only family
    `team_review` whose signal is a rolled-up DIGEST projected over the EXISTING decision-metrics
    (`lib/lease-renewal/decision-metrics.ts:64` — `corrected`/`dismissed` counts, `F-LEARN-LOOP`), the
    per-property decision repository (`lib/lease-renewal/property-repository.ts:94` — value-free
    `{actorUid, action, timestamp, reason}` buckets, `F-RENEWAL-PROPERTY-REPO`), and the write-back
    approval Activity, thresholded to high-risk overrides (`corrected_value` resolutions at High severity)
    and self-corrections (a resolution/approval later marked stale or re-resolved). It emits ONE digest
    signal per period ("N high-risk overrides, M self-corrections"), NEVER one ping per team edit, and is
    value-free by construction (counts + lane only; no value, address, field_key, or free-text reason).
    Served only to an Admin viewer; muteable via the same mute primitive.
  - **B6 — mark-all-read + richer all-clear.** A `POST /api/notifications/mark-all-read` route (edit
    unnecessary; read-gated, self-scoped) that flips every unread event notification for the caller, and
    per-lane all-clear copy so an empty lane reads "done", not blank (reuses the deck's `emptyLabel`
    pattern, `ConsoleActionDeck.tsx:64`).
  - **B7 — lane-stamp the (S16-scoped) Console deck.** Apply the B3 attention-lane contract to the
    deck's cards/rows so the deck speaks the same vocabulary as the hub (`ConsoleActionDeck`,
    `components/console/ConsoleActionDeck.tsx:40`). This suite adds NO scope filter of its own: the
    deck's space-scope FILTERING is owned by **S16** (AC-S16-4). When S16 has landed the deck is already
    scope-filtered and B7 consumes it as-is; when S16 is absent B7 still stamps lanes over all rows.
    **This spec references the S16 scope claim and re-models neither the auth claim nor the deck
    filter.**

- **Gated (owner / vendor).**
  - **G1 — activate the Gmail-dependent families.** `rentvine_replies` + `owner_process_replies` stay
    `available:false` ("Waiting on Gmail access", `families.ts:65,72`) until the client Gmail access model
    and a Gmail READ scope (domain-wide delegation) are authorized. That is an owner + vendor decision.
  - **G2 — any email/push DELIVERY.** The framework is in-app ONLY; email is hard-off
    (`KB_APPROVAL_NOTIFICATIONS_ENABLED` false, `email_enabled` literal-false). Turning on any out-of-app
    delivery is an autonomous-send decision and stays gated.
  - **G3 — scheduled digest runs.** A cron/Cloud Scheduler job that computes the B5 digest on a cadence
    (vs. computing it on read) is gated — no Cloud Scheduler this suite.
  - **G4 — deploy.** Shipping any of the above to the `pmi-kc-kb-demo` Cloud Run service stays owner-run
    (`npm run deploy -- --budget-confirmed`).

**Open questions & assumptions.**

- _Assumption:_ the hub is a SUPERSET LOG and the Console stays home (D2, owner 2026-07-10); signals ADD
  to the hub, they never MOVE off the Console. The single-gather interlock (S13 B5) is extended, never
  weakened — its value-free ROW_KEYS pin (`tests/unit/needs-decision-inbox.test.ts`) carries over.
- _Assumption:_ connections + coverage are STANDING conditions (no per-event `read_at`); "mark read" is
  meaningless for them, so B6 targets event notifications only and the standing families are dismissed by
  fixing the underlying state (setting up the connector / adding the process), not by reading a row.
- _Assumption:_ the B5 review digest thresholds are `corrected_value`-at-High (override) and
  stale/re-resolved (self-correction), computed on READ from already-fetched Activity — no new Firestore
  collection, no new index, mirroring `property-repository.ts`. The exact numeric window (e.g. "this
  week") is a display default, flagged `Needs Verification:` until Dan confirms his review cadence.
- _Open:_ Dan's preferred review cadence and whether the review lane should also cover Maintenance
  overrides (not just renewals). Default: renewals-only digest, weekly window. Recorded as a `Q-` row in
  `docs/facts.md` "## Open Questions" at authoring time; confirm-with-default, not a blocker.
- _Client-owned:_ the Gmail access model + READ scope that would flip G1's two families available
  (tracked in `docs/client-checklist.md` / `docs/environment-handoff.md`); any decision to deliver
  notifications out of app (email/push). Both are confirm-with-default: stay in-app until the client says
  otherwise.
- _Assumption:_ hard gates unchanged this cycle — no autonomous send, no SoR write, no Cloud Scheduler,
  no new Google scope, no client data on GitHub, every Action Registry entry `production_allowed:false`,
  ~$10 cap. This suite adds no Action Registry entry.

**Cross-product impacts.** New: `app/notifications/page.tsx`, `lib/attention/lanes.ts`,
`lib/attention/review-lane.ts`, `app/api/notifications/mark-all-read/route.ts`. Extended:
`lib/notifications/families.ts` (two new available families + `team_review`), `lib/notifications/feed.ts`
(standing-signals input + lane stamping + low-alarm resolver), `lib/firestore/notification-preferences.ts`

- `lib/firestore/schemas.ts` (additive `lane_thresholds` / `snoozed_lanes` / `digest_lanes`),
  `components/layout/NotificationMenu.tsx` (link to the hub + mark-all-read), `components/console/ConsoleView.tsx`
- `components/console/ConsoleActionDeck.tsx` (lane contract only; deck space-scope filtering owned by S16),
  `lib/ask/app-state-context.ts` (connections/coverage projected into the contract),
  `components/lease-renewal/RenewalDesk.tsx` + `lib/lease-renewal/attention.ts` (renewal fold speaks the
  contract). Reads-only sources for B5: `lib/lease-renewal/decision-metrics.ts` (`F-LEARN-LOOP`),
  `lib/lease-renewal/property-repository.ts` (`F-RENEWAL-PROPERTY-REPO`),
  `lib/firestore/lease-renewal-writeback-approvals.ts`. Governance: `firestore.rules`
  (`user_notification_preferences` shape is unchanged as a rule — still self-scoped, client-read-only;
  new preference FIELDS need no rule change since all writes are server-side). Interacts with:
  `F-NOTIF-FRAMEWORK` (extends it), `F-CONSOLE-ACT-IN-PLACE` (deck unchanged in posture, gains lanes +
  scope), `F-APPROVAL-QUEUE-UNIFIED` + S13 B5 single-gather interlock (extended), `F-RENEWAL-ATTENTION`
  (the fold now speaks the shared contract). Depends on: **S16** (console/space scoping — the scope claim
  B7 reads; not re-modeled here). Supersedes no active fact; adds no supersede-log row.

**Adversarial acceptance checks.**

- **AC-S17-1** — `GET /notifications` returns HTTP 200 for a signed-in editor and renders a time-ordered
  list under a "Notifications" heading; unauthenticated `GET /notifications` redirects to sign-in (307);
  the bell popover shows a "See all notifications" link whose href is `/notifications`. _Verify:_
  `npm run test -- tests/unit/notification-menu-component.test.tsx`; keep `tests/unit/notifications-route.test.ts` green.
- **AC-S17-2** — the family catalog exposes exactly SEVEN families: `approval_queue`,
  `maintenance_tickets`, `connections_setup` (available), `space_coverage` (available), `team_review`
  (available, but Admin-gated at SERVE time per AC-S17-6), and `rentvine_replies` +
  `owner_process_replies` still `available:false` with detail "Waiting on Gmail access". _Verify:_
  `npm run test -- tests/unit/notification-feed.test.ts`; keep the families enum invariant green.
- **AC-S17-3** — for one fixture the "Needs your decision" integer is byte-identical on the Console deck,
  the bell badge, and `/approval-queue`, and each reads `gatherNeedsDecisionInbox(user).counts.total`
  rather than recomputing; mutating the gather moves all three together. _Verify:_
  `npm run test -- tests/unit/needs-decision-gather.test.ts`; keep `tests/unit/console-view.test.tsx` and
  `tests/unit/approval-queue-component.test.tsx` green.
- **AC-S17-4** — every attention signal on the hub, the deck, and the renewal desk carries a `lane` from
  the closed `ATTENTION_LANES` enum, and a sentinel pins the value-free key set: no address, proposed
  value, free-text reason, decider, `field_key`, or `reason_code` ever serializes onto any of the three
  surfaces. _Verify:_ `npm run test -- tests/unit/lease-renewal-attention.test.ts`; keep
  `tests/unit/needs-decision-inbox.test.ts` (ROW_KEYS pin) green.
- **AC-S17-5** — a muted lane yields zero feed rows; a lane snoozed with `snoozed_until` in the future
  yields zero rows until it expires; a signal below a lane's `lane_thresholds` severity is absent while a
  High signal on the same lane is present; a `digest_lanes` lane collapses its N rows to ONE digest row.
  _Verify:_ `npm run test -- tests/unit/notification-preferences.test.ts`; keep
  `tests/unit/notification-feed.test.ts` green.
- **AC-S17-6** — the `team_review` digest is served ONLY to an Admin: an Editor's `/api/notifications`
  payload contains no `team_review` signal, an Admin's payload contains exactly ONE value-free DIGEST
  signal (e.g. "3 high-risk overrides, 2 self-corrections this period") and never one entry per edit, and
  the signal carries no value-bearing field. _Verify:_
  `npm run test -- tests/unit/lease-renewal-decision-metrics.test.ts`; keep
  `tests/unit/lease-renewal-property-repository.test.ts` (value-free pin) green.
- **AC-S17-7** — `POST /api/notifications/mark-all-read` marks every unread EVENT notification for the
  caller read (a subsequent `GET /api/notifications?unread_only=true` returns them absent) and leaves the
  standing families untouched; an all-clear lane renders its richer empty copy (e.g. "Every connection is
  set up.") instead of a blank panel. _Verify:_ `npm run test -- tests/unit/notifications-route.test.ts`;
  keep `tests/firestore/notifications.rules.test.ts` green.
- **AC-S17-8** — building the hub payload (including B2 standing families and the B5 digest) makes ZERO
  external calls: a call-count / negative-import test shows no RentVine, Sheet, or Gmail client is
  invoked, and `resolveConnectionsState` reads only `process.env` + connector presence. _Verify:_
  `npm run test -- tests/unit/notification-feed.test.ts`; keep `tests/unit/route-auth-boundary.test.ts`
  green (every new route authed; no unauth allow-list entry added).
- **AC-S17-9** — every Console deck row carries a `lane` from the shared `ATTENTION_LANES` enum (the
  deck speaks the hub's vocabulary), stays value-free, and this suite adds NO new approve/send/write
  affordance beyond the existing A4 in-place approve (every surface stays `production_allowed:false`);
  the deck's space-scope FILTERING is asserted by S16 (AC-S16-4), not re-tested here. _Verify:_
  `npm run test -- tests/unit/console-action-deck.test.tsx`; keep `tests/unit/console-view.test.tsx`
  green.

Full-suite gate for every slice: `npm test`, `npm run typecheck`, `npm run lint`,
`npm run verify:copy-voice`, `npm run verify:context-freshness`, `npm run verify:spec-traceability`,
`npm run test:firestore`, then `bash scripts/verify.sh`.

**Forbidden actions / hard gates.** App-plane only. Every Action Registry entry stays
`production_allowed:false` and this suite adds none. No autonomous send — the notification framework is
in-app ONLY, email stays hard-off (`KB_APPROVAL_NOTIFICATIONS_ENABLED` false, `email_enabled`
literal-false), and any out-of-app delivery is a gated autonomous-send decision (G2). No system-of-record
write (RentVine / Sheet / QuickBooks / bank / client Drive). No new Google scope — the two Gmail-dependent
families stay `available:false` until the client access model + a Gmail READ scope land (G1). No Cloud
Scheduler / cron — the B5 digest is computed on read, not on a schedule (G3). No client data on GitHub —
the review lane is value-free by construction (counts + lane only; a sentinel pins the key set) and the
`verify:redaction` gate still forbids any `golden-data/` / `docs/client_docs/` file. ~$10 budget cap
holds; deploy stays owner-run (G4). Suite-specific hard stop: the review lane must NEVER emit one
notification per team edit — a per-edit ping (not a rolled-up digest) is itself a falsification of B5.

**Ordered prompt sequence.**

1. _Discovery:_ read `docs/facts.md` (`F-NOTIF-FRAMEWORK`, `F-CONSOLE-ACT-IN-PLACE`,
   `F-APPROVAL-QUEUE-UNIFIED`, `F-LEARN-LOOP`, `F-RENEWAL-PROPERTY-REPO`, `F-RENEWAL-ATTENTION`) and this
   spec; confirm the single-gather interlock and the value-free key pins before touching a surface.
2. _Build:_ B3 first — land `lib/attention/lanes.ts` (the shared contract) and re-point the deck, the
   bell/hub, and the renewal fold to derive lane + severity from it, keeping the decision count sourced
   from `gatherNeedsDecisionInbox().counts.total`. Extend, never weaken, the value-free sentinels.
3. _Build:_ B1 the `/notifications` hub page + the bell link; B2 the two standing families
   (`connections_setup`, `space_coverage`) via the feed's new standing-signals input.
4. _Build:_ B4 the low-alarm layer (additive preference fields + pure resolver) then B6 mark-all-read +
   all-clear copy.
5. _Build:_ B5 the Admin-only `team_review` digest over decision-metrics + property-repository +
   write-back Activity, thresholded to high-risk overrides / self-corrections, value-free and
   Admin-scoped; assert one digest signal, never per-edit.
6. _Build:_ B7 lane-stamp the Console deck so it speaks the shared contract. Do NOT implement a deck
   scope filter — that is S16's (AC-S16-4). Stamp lanes over whatever rows the (S16-scoped or, if S16
   has not landed, unscoped) deck yields; do not re-model auth.
7. _Owner:_ hand back the gated items — G1 (Gmail access model + READ scope), G2 (any delivery), G3
   (scheduled digest), G4 (deploy). None are performed autonomously.
8. _Verify:_ run the full gate list above; browser-walk the hub + deck + desk with an Editor session and
   an Admin session (the review digest appears only for Admin); confirm the three surfaces agree on the
   decision count.
9. _Context update:_ promote each shipped slice to a `docs/facts.md` `F-*` row (e.g.
   `F-UNIFIED-ATTENTION`) citing the `AC-S17-*` ids it satisfies (AC-S17-1..9), update `docs/loop-state.md`
   at each slice boundary under its 140-line cap, and keep `docs/status.md` honest. Record the Dan-cadence
   `Q-` row's resolution when the owner answers.

**Deletion/merge recommendation.** KEEP this suite as the tracked spec for the unified-console/attention
cycle; the `docs/temp/unified-console-and-attention-plan.md` packet stays disposable evidence. This suite
EXTENDS `F-NOTIF-FRAMEWORK` and the S13 B5 single-gather interlock rather than superseding them — do not
delete or fork those; the value-free-triage and act-on-the-run-page invariants carry over unchanged. B7
relies on S16 for console scoping: **S16 owns the deck scope filter (AC-S16-4); this suite only stamps
the shared lane contract onto the already-scoped deck** — do not duplicate S16's filter or auth model
in this file.
