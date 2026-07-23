<!-- spec-shape: overhaul-v1 -->

# S33 - Ask box to live-action orchestration

> New 2026-07-23 (operator note). Wave 1 of `docs/roadmap-unblock-2026-07-23.md` (feature #7, roadmap
> row 7). Pure app-plane, no build-to-seam and no owner dependency of its own (see below). The
> disposable decision-complete packet is `docs/temp/ask-to-action-plan.md` (local-only). Owner-default
> resolved inline so this is decision-complete: Ask REUSES the desk's existing gated surface (the same
> preview, confirm, and receipt) and adds no executor, confirm, send, or write endpoint of its own.

**Goal.** Today the Console Ask box can answer a question, detect the process a question is about, start
a Test run (a simulation kept inside the app), and capture a follow-up task, but it cannot start a real
process (`components/ask/AskForm.tsx`). An operator who asks "start the renewal for 1234 Oak St" gets an
answer and, at most, a Test run; to actually begin the live renewal they must leave Ask, open the live
renewal desk, find the lease, and use the gated draft composer. After this suite, when Ask detects a
renewal or maintenance intent AND resolves an authoritative live target from the RentVine read, it
offers ONE primary "Start on the live desk" affordance that hands the operator straight into the SAME
gated action the desk already uses, opening at that action's preview. The operator still reviews the
preview, still confirms, and still gets the receipt (an unsent Gmail draft they send by hand); a human
sends and a human writes any system of record, exactly as before. Ask becomes a faster front door into
the existing gates, never a new way around them. The "safe Test run" path is untouched and stays a Test
run. Nothing here relaxes a gate, adds a provider, adds a scope, or adds an autonomous effect.

**What it is / how it functions.** One pure intent-to-action resolver plus one read-only target lookup
feed a single Ask affordance that REUSES the desk's already-gated composer surface and route. There is
no new execution path: every live action Ask can launch is one that already flows through the gated
chokepoint (`lib/external-execution/orchestrator.ts` `ExternalActionOrchestrator.prepare` /
`execute`, or the renewal and maintenance draft services that re-assert the same
`isActionExecutable` gate and the same preview-hash, confirm, and receipt contract). Ask funnels into
that chokepoint; it never re-implements it.

- **Intent resolver - new `lib/ask/action-intent.ts` (pure).** `resolveAskAction({ detected, target,
isExecutable })` maps a detected process (from the existing deterministic `detectProcess`,
  `lib/processes/intent.ts`, plus the model fallback `POST /api/processes/classify`) and an
  authoritative resolved target to an `AskActionRoute | null`. It returns a route ONLY when the mapped
  Action-Registry key is `isExecutable(key) === true` (delegating to `isActionExecutable`,
  `lib/integrations/action-gate.ts`, which reads the committed SEED). For any closed key (for example
  `gmail.renewal_notice.send`, still `production_allowed:false`) it returns `null`, so Ask never
  surfaces a live affordance for a gate that is not open. The route it returns is value-free
  (`{ actionKey, surface: "renewal-notice-draft" | "maintenance-owner-notice" | "process-test-run",
href, label }`) and carries no recipient, rent, or tenant name. Pure, deterministic, no `Date.now`,
  no I/O.
- **Target resolver - new `lib/ask/renewal-target.ts` (pure match) + read-only route.** The target
  lease id is resolved from the AUTHORITATIVE live RentVine read the desk already uses
  (`loadLiveRenewalDesk` / `getLiveLeaseViews`, `lib/lease-renewal/live-desk.ts` +
  `lib/lease-renewal/live-lease-cache.ts`), matched strictly to an address or unit parsed from the
  question. A new read-only `POST /api/ask/live-target` (gated `requireCapabilityInSpace("edit",
"renewals")` and `buildLiveRentVineConfig`, mirroring the draft route's guards) returns
  `{ status: "ok", leaseId, addressLabel }`, `{ status: "no_match" }`, or
  `{ status: "not_configured" }`. It performs NO external effect: it reads only. When the live read is
  ambiguous or empty, it returns `no_match` and Ask offers NO live action rather than guessing a lease.
- **Ask affordance - extend `components/ask/AskForm.tsx`.** When (a) the resolver yields a route, (b)
  the principal can reach that gated surface, and (c) live sources are connected, Ask renders one
  primary control beside the existing "Get answer" and "start a Test run" controls. For the renewal
  route it REUSES the exact desk component `components/lease-renewal/RenewalNoticeDraftComposer.tsx`,
  pre-seeded with the resolved `leaseId`, so the operator runs Preview (`confirm:false`) then Create
  (`confirm:true`) against the unchanged gated route `POST /api/lease-renewal/renewal-notice-draft`
  (key `gmail.renewal_notice.draft_create`) and gets the receipt (an unsent draft id) exactly as on the
  desk. A secondary link opens the full lease workspace
  (`/lease-renewal/live/desk/lease/{leaseId}`) for complete context. Ask itself posts to no execute,
  confirm, send, or writeback route.
- **Maintenance parallel - reuse S38a's gated surface, else the Test run.** A detected
  `maintenance-work-order-intake` intent routes, when the S38a maintenance owner-notice surface is
  present (`lib/maintenance/owner-notice-draft.ts`, key
  `gmail.maintenance_owner_notice.draft_create`, already `production_allowed:true`), to that same
  preview / confirm / receipt draft surface; until then it routes to the existing maintenance process
  Test run. Either way Ask reuses an existing surface and its gate. S33 does not depend on S38a
  landing first.
- **High-risk stays on the full surface - mirror `components/console/ConsoleApproveButton.tsx`.** As
  with the Console in-place Approve, Ask cannot approve away a consequential decision: if a routed
  action is High-risk it is refused server-side by the gated surface, and Ask surfaces that refusal and
  points to the full surface for the exact Admin decision. In practice S33 only routes to already-open
  draft actions and Test runs, so a High-risk live route never materializes; the invariant is asserted,
  not merely assumed.
- **Honest empty and unavailable states.** No intent match, no authoritative target, a non-permitted
  role, or unconnected live sources all resolve to NO live affordance: Ask shows the answer plus the
  existing Test-run and capture controls, and, when live sources are simply not connected, a Connection
  Center link that mirrors the desk's `not_configured` panel. Ask never invents a lease, a recipient,
  or a startable item.

- **Buildable now (app-plane).** The whole suite. It adds no system-of-record write, no autonomous
  send, no new external scope, and flips no gate; it reads the already-authorized live RentVine data
  and routes into the already-open `gmail.renewal_notice.draft_create` (and, when present,
  `gmail.maintenance_owner_notice.draft_create`) draft surfaces plus the existing process Test run. The
  loop builds all of it unattended. Slices:
  - Slice 1 - `lib/ask/action-intent.ts` (pure `resolveAskAction`, gate-respecting, value-free route)
    plus `tests/unit/ask-action-intent.test.ts`.
  - Slice 2 - `lib/ask/renewal-target.ts` (pure strict address/unit match over injected live views)
    plus the read-only `POST /api/ask/live-target` route (read-only, live-config gated) plus
    `tests/unit/ask-renewal-target.test.ts` and `tests/unit/ask-live-target-route.test.ts`.
  - Slice 3 - `components/ask/AskForm.tsx` renders the single live affordance, REUSING
    `RenewalNoticeDraftComposer` pre-seeded with the resolved lease; role-gated and live-availability
    gated; honest empty states; new copy passes `verify:copy-voice`. Extend `tests/unit/ask-form.test.tsx`.
  - Slice 4 - maintenance parallel route (to the S38a draft surface when present, else the maintenance
    Test run) plus the High-risk-refused-server-side invariant test.
- **Build to the seam (live provider).** None. S33 introduces no provider and no new action key. It
  routes only into actions that already exist at their own seams; the closed send and writeback
  siblings (`gmail.renewal_notice.send`, `gmail.maintenance_owner_notice.send`,
  `rentvine.lease.renewal_writeback`, the RentVine and Gmail-watch work) belong to S30, S38b, and S31
  and stay deliberately out of Ask's reach. Because Ask only ever routes to an `isActionExecutable`
  key, there is nothing here to build to a seam.
- **Owner dependency (the one flip).** None specific to this suite. S33 flips no gate and needs no
  endpoint, credential, or scope: it reuses the already-authorized live RentVine read and the
  already-open draft-create gate. The only owner steps are the standing per-session ones that gate any
  live work (`npm run auth:session` for ADC freshness, and the owner-run `npm run deploy`); they are
  not S33 dependencies and unblock nothing S33-specific.

**Open questions & assumptions.**

- _Assumption:_ "Ask kicks off a live process" means Ask opens the SAME gated action surface the desk
  uses, at its preview, pre-seeded with an authoritatively resolved target. It does not mean Ask
  executes, sends, or writes. This is the owner-default confirm-with-default recorded in this suite's
  operator note; it is the entire scope of S33 and nothing here relaxes it.
- _Assumption:_ Ask REUSES the existing gated composer component and route rather than building a
  parallel launcher. This is the strongest no-bypass posture (Ask has no executor to audit) and is the
  resolved owner-default. Deep-linking to the desk workspace is retained as the secondary path.
- _Assumption:_ target resolution is strict and authoritative-only. A live route appears only on an
  unambiguous single-lease match from the live RentVine read; ambiguous or absent matches yield no
  live route. Confirm-with-default: strict match, never a best-guess lease.
- _Assumption:_ hard gates unchanged this cycle. No Action Registry entry is added or flipped (both
  `EXECUTABLE_ALLOWLIST` copies and the pinned schema tests are untouched), no new Google scope, no
  Cloud Scheduler, the ~$10 cap holds, and deploy stays owner-run.
- _Open:_ whether the owner later wants Ask to reach the maintenance owner-notice draft even before
  S38a formally lands its route and button. Default until answered: route maintenance to the existing
  process Test run, and light up the draft surface automatically once S38a is present. Routed to
  `docs/client-checklist.md` as a confirm-with-default (default: Test run until S38a lands).
- _Note on facts.md:_ the `Q-ASK-ACTION-SCOPE` open row and the final `F-ASK-ACTION` promotion are
  recorded in `docs/facts.md` at BUILD time (this authoring pass creates only the spec file per its
  charter); the assumptions above are decision-complete so a builder needs no further owner input.

**Cross-product impacts.** New `lib/ask/action-intent.ts` and `lib/ask/renewal-target.ts`; new
read-only `app/api/ask/live-target/route.ts`; edits to `components/ask/AskForm.tsx` (one added
affordance, existing controls unchanged). Consumes, without changing: `lib/processes/intent.ts`
(`detectProcess`) and `POST /api/processes/classify`; `lib/integrations/action-gate.ts`
(`isActionExecutable`); `lib/lease-renewal/live-desk.ts` + `lib/lease-renewal/live-lease-cache.ts` +
`lib/lease-renewal/live-config.ts` (the same authoritative live read the desk uses);
`components/lease-renewal/RenewalNoticeDraftComposer.tsx` and its gated route
`app/api/lease-renewal/renewal-notice-draft/route.ts` (key `gmail.renewal_notice.draft_create`); and,
for maintenance, `lib/maintenance/owner-notice-draft.ts` / `components/maintenance/MaintenanceCapture.tsx`
(S38a) or the existing `POST /api/process-definitions/{id}/test-runs`. Extends the Console front door
(S10 `F-CONSOLE-APP-STATE`) and the anticipation lane (S18) with a start-into-the-gate affordance. It
interacts with, and does NOT supersede: `F-SEND-AUTHORIZED` (human-initiated exact-confirmed send
preserved), `F-ROADMAP-BUILD-AUTHORIZED` (this is its Wave-1 row 7), `D-AUTOMATION-LINE` (no
client-facing auto-send introduced), S25 / S26 (the execution contracts it routes into, unchanged),
S29 (a comp-suggested rent still enters a draft only behind its own Admin approval; Ask does not
shortcut it), S30 / S38b / S31 (the closed send and write seams it stays clear of). Additive; no
Supersede Log entry. New tests `tests/unit/ask-action-intent.test.ts`,
`tests/unit/ask-renewal-target.test.ts`, `tests/unit/ask-live-target-route.test.ts`, and extensions to
`tests/unit/ask-form.test.tsx`.

**Adversarial acceptance checks.**

- **AC-S33-1** - `resolveAskAction(...)` returns a live route ONLY for a key where `isActionExecutable`
  is true. Given a closed key (for example `gmail.renewal_notice.send`, `production_allowed:false`) it
  returns `null` and Ask renders NO live affordance for it; given the open `gmail.renewal_notice.draft_create`
  and an authoritative target it returns a route. The function is deterministic (two consecutive calls
  are deep-equal; a `Date.now` or a network/fs import fails the check). _Verify:_ `npm test --
tests/unit/ask-action-intent.test.ts`; keep `tests/unit/action-gate.test.ts` green.
- **AC-S33-2** - No-bypass structural invariant. A repo scan of `components/ask/**` and `lib/ask/**`
  finds NO fetch/post to any execute, confirm, send, or writeback endpoint; Ask's only live-action
  affordances are the reused gated composer (posting solely to the unchanged
  `/api/lease-renewal/renewal-notice-draft`) and navigations to an existing gated surface. The new
  `/api/ask/live-target` route contains no provider write call and returns read-only status only.
  _Verify:_ `rg -n "renewal-notice-draft|writeback|/send|\\.execute\\(" components/ask lib/ask` shows
  only the reused draft route and no execute/send/writeback path; `npm test -- tests/unit/ask-live-target-route.test.ts`.
- **AC-S33-3** - Preview, confirm, receipt preserved end to end. Launching the renewal action from Ask
  opens the composer whose FIRST call is `POST /api/lease-renewal/renewal-notice-draft` with
  `confirm:false` (a preview payload), and only an explicit Create issues `confirm:true`, whose
  response is `status:"created"` with a `draftId` receipt; no `...send` route is ever called and the
  draft is unsent. _Verify:_ browser-drive Ask to the renewal action and confirm the two network calls
  and the created receipt; `npm test -- tests/unit/renewal-notice-draft-route.test.ts`; keep
  `tests/unit/renewal-notice-draft-service.test.ts` green.
- **AC-S33-4** - Authoritative target only. Given a fixture live RentVine read, a question whose
  address matches exactly one lease resolves that `leaseId`; a question with no match or an ambiguous
  match returns `no_match` and Ask offers NO live route (it falls back to answer plus Test run), never
  a fabricated or best-guess lease id. _Verify:_ `npm test -- tests/unit/ask-renewal-target.test.ts`,
  `npm test -- tests/unit/ask-live-target-route.test.ts`.
- **AC-S33-5** - High-risk refused server-side (mirrors `ConsoleApproveButton`). A routed action that
  is High-risk is refused by the gated surface server-side (a 4xx refusal), and Ask renders that
  refusal and the pointer to the full surface; Ask never completes a High-risk action in place.
  _Verify:_ `npm test -- tests/unit/ask-form.test.tsx`; keep `tests/unit/console-approve-button.test.tsx`
  green.
- **AC-S33-6** - The Test-run path is unchanged. "Get answer + start a Test run" still issues
  `POST /api/process-definitions/{id}/test-runs` and remains simulation-only; the live affordance is a
  SEPARATE, additional control that never replaces the Test run and never auto-fires (no live action
  runs without an explicit operator click on the preview and then confirm). _Verify:_ `npm test --
tests/unit/ask-form.test.tsx`; keep `tests/e2e/ask.e2e.test.mjs` green.
- **AC-S33-7** - Role and live-availability gating are honest. A principal who cannot reach the gated
  surface, or a context where live sources are not connected, renders ZERO live affordance; Ask shows
  the answer plus Test-run/capture controls and, for the unconnected case, the Connection Center link
  that mirrors the desk `not_configured` panel. All new copy passes the voice gate (plain language,
  "Test run" not "simulation", "the app", no em dash). _Verify:_ `npm test -- tests/unit/ask-form.test.tsx`;
  `npm run verify:copy-voice`.
- **AC-S33-8** - The Action Registry is untouched. This suite adds and flips NO registry entry: a
  `git diff` shows no change to `lib/integrations/action-registry-seed.ts`, to either
  `EXECUTABLE_ALLOWLIST` copy (`scripts/seed-action-registry.ts`, `lib/admin/migration-readiness.ts`),
  or to the pinned schema tests, and every entry Ask can route to is already `production_allowed:true`.
  _Verify:_ `git diff --stat` is empty for those paths; keep `tests/unit/action-registry-schema.test.ts`
  and `tests/unit/seed-action-registry-allowlist.test.ts` green; `npm run typecheck`, `npm run lint`.

**Forbidden actions / hard gates.** App-plane only. Ask NEVER bypasses an Action-Registry gate: it can
launch only actions where `isActionExecutable` is already true, and it re-uses the existing gated
surface and route rather than defining an executor of its own. Every routed action keeps its
preview / confirm / receipt (the unsent draft the operator sends by hand). No autonomous send and no
system-of-record write are introduced: the renewal and maintenance SEND keys and
`rentvine.lease.renewal_writeback` stay `production_allowed:false` and out of reach (S30 / S38b / S31).
High-risk actions are refused server-side; Ask cannot approve them away. The existing "safe Test run"
stays a Test run. No new Google scope, no Cloud Scheduler or cron or timer that starts a run, no
personal account in any auth path, no secrets or customer PII or guessed endpoint in git or evidence,
~$10 budget cap, deploy owner-run. This suite MAY NOT set any `production_allowed:true`; it adds no
registry entry at all. A violation of any of these is itself a falsification.

**Ordered prompt sequence.**

1. _Discovery:_ re-read `components/ask/AskForm.tsx`, `lib/processes/intent.ts` (`detectProcess`) and
   `POST /api/processes/classify`, `lib/integrations/action-gate.ts` (`isActionExecutable`),
   `lib/external-execution/orchestrator.ts`, the gated draft path
   (`app/api/lease-renewal/renewal-notice-draft/route.ts` +
   `components/lease-renewal/RenewalNoticeDraftComposer.tsx` +
   `lib/lease-renewal/execution/renewal-notice-draft-service.ts`), the live read
   (`lib/lease-renewal/live-desk.ts` + `lib/lease-renewal/live-lease-cache.ts` +
   `lib/lease-renewal/live-config.ts`), and `components/console/ConsoleApproveButton.tsx`. Confirm the
   draft-create keys are already `production_allowed:true` and the send/writeback siblings are false.
2. _Understanding:_ write `docs/temp/ask-to-action-plan.md` mapping each detectable intent to exactly
   one already-open action key and its existing gated surface; confirm no closed key is reachable and
   no new endpoint is required beyond the read-only target lookup.
3. _Build:_ Slice 1 - `lib/ask/action-intent.ts` (pure, gate-respecting, value-free route) plus
   `tests/unit/ask-action-intent.test.ts` (AC-S33-1). Lint, typecheck, test, falsification pass.
4. _Build:_ Slice 2 - `lib/ask/renewal-target.ts` (pure strict match) plus the read-only
   `app/api/ask/live-target/route.ts` (live-config and role gated, read-only) plus
   `tests/unit/ask-renewal-target.test.ts` and `tests/unit/ask-live-target-route.test.ts`
   (AC-S33-4, and the read-only half of AC-S33-2).
5. _Build:_ Slice 3 + 4 - extend `components/ask/AskForm.tsx` to render the single live affordance that
   REUSES `RenewalNoticeDraftComposer` pre-seeded with the resolved lease, role and live gated, honest
   empty states; add the maintenance parallel and the High-risk-refused invariant; extend
   `tests/unit/ask-form.test.tsx` (AC-S33-3, 5, 6, 7). Keep the Test-run and capture controls unchanged.
6. _Verify:_ `npm test` (new tests plus the named sentinels), `npm run typecheck`, `npm run lint`,
   `npm run verify:copy-voice`, `npm run verify:spec-traceability`; confirm AC-S33-8 with an empty
   `git diff --stat` over the registry paths; then `bash scripts/verify.sh`. Browser-drive Ask as a
   permitted role AND a non-permitted role: confirm one click opens the composer at its preview, a
   second explicit confirm creates the unsent draft receipt, nothing sends or writes, and the
   non-permitted role sees no live affordance.
7. _Gate:_ STOP before any send key, any writeback, any new registry entry or gate flip, any Cloud
   Scheduler, and any live route to a non-executable key. There is no owner dependency to hand back for
   this suite; only the standing per-session `npm run auth:session` and owner-run `npm run deploy`.
8. _Context update:_ promote the shipped suite to a `docs/facts.md` `F-ASK-ACTION` row citing
   AC-S33-1 through AC-S33-8, resolve `Q-ASK-ACTION-SCOPE`, and update `docs/loop-state.md` at the
   slice boundary (keep it under its line cap).

**Deletion/merge recommendation.** KEEP this suite as the tracked Wave-1 spec; the
`docs/temp/ask-to-action-plan.md` packet stays disposable local evidence and is deleted once
`F-ASK-ACTION` lands. It EXTENDS the Console front door (S10 `F-CONSOLE-APP-STATE`) and the S18
anticipation lane with a start-into-the-gate affordance rather than replacing them, and it does NOT
supersede S25 / S26 (it routes into those unchanged execution contracts). If the Console app-state and
anticipation suites are later consolidated, S33 may MERGE into that family as the "Ask launches the
gated action" section; until then keep it standalone.
