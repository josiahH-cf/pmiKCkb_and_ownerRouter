<!-- spec-shape: overhaul-v1 -->

# S33 - Ask box to live-action orchestration

> New 2026-07-23 (operator note). Wave 1 of `docs/roadmap-unblock-2026-07-23.md` (feature #7, roadmap
> row 7). Pure app-plane, no build-to-seam and no owner dependency of its own (see below). The
> disposable decision-complete packet is `docs/temp/ask-to-action-plan.md` (local-only). Owner-default
> resolved inline so this is decision-complete: Ask REUSES the desk's existing gated surface (the same
> preview, confirm, and receipt) and adds no executor, confirm, send, or write endpoint of its own.
>
> **Live-only continuation 2026-08-03.** S56 retired the Production Test lane and its `/test-runs`
> route. The process-context control now starts one ordinary, human-initiated Live app-plane run through
> `POST /api/process-definitions/{id}/runs`. That run persists app workflow state only: it constructs no
> provider, sends nothing, and writes no external system of record. The former Production Test fallback
> is historical evidence, not a current product path.

**Goal.** The Console Ask box answers a question, detects its process, can start an ordinary app-plane
workflow run, and can capture a follow-up task (`components/ask/AskForm.tsx`). When Ask detects a renewal
or maintenance intent AND resolves an authoritative Live target from the RentVine read, it also offers
ONE primary "Start on the live desk" affordance that hands the operator straight into the SAME gated
action the desk already uses, opening at that action's preview. The operator still reviews the preview,
still confirms, and still gets the receipt (an unsent Gmail draft they send by hand); a human sends and
a human writes any system of record, exactly as before. The ordinary run and the provider-action
affordance are separate: the former records human-started app workflow progress, while the latter keeps
the existing action gate and preview/confirm/receipt contract. Nothing here relaxes a gate, adds a
provider, adds a scope, or adds an autonomous effect.

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
  (`{ actionKey, surface: "renewal-notice-draft" | "maintenance-owner-notice",
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
  primary control beside the existing "Get answer" and ordinary "Start run" controls. For the renewal
  route it REUSES the exact desk component `components/lease-renewal/RenewalNoticeDraftComposer.tsx`,
  pre-seeded with the resolved `leaseId`, so the operator runs Preview (`confirm:false`) then Create
  (`confirm:true`) against the unchanged gated route `POST /api/lease-renewal/renewal-notice-draft`
  (key `gmail.renewal_notice.draft_create`) and gets the receipt (an unsent draft id) exactly as on the
  desk. A secondary link opens the full lease workspace
  (`/lease-renewal/live/desk/lease/{leaseId}`) for complete context. Ask itself posts to no execute,
  confirm, send, or writeback route.
- **Maintenance parallel - reuse S38a's gated surface, else the ordinary run.** A detected
  `maintenance-work-order-intake` intent routes, when the S38a maintenance owner-notice surface is
  present (`lib/maintenance/owner-notice-draft.ts`, key
  `gmail.maintenance_owner_notice.draft_create`, already `production_allowed:true`), to that same
  preview / confirm / receipt draft surface. When that separate provider-action affordance is not
  available, the operator may still start the ordinary maintenance app-plane run through `/runs`;
  there is no Test executor or Test fallback. S33 does not depend on S38a landing first.
- **High-risk stays on the full surface - mirror `components/console/ConsoleApproveButton.tsx`.** As
  with the Console in-place Approve, Ask cannot approve away a consequential decision: if a routed
  action is High-risk it is refused server-side by the gated surface, and Ask surfaces that refusal and
  points to the full surface for the exact Admin decision. In practice S33 only routes to already-open
  draft actions, while ordinary app-plane runs execute no provider action, so a High-risk live route
  never materializes; the invariant is asserted,
  not merely assumed.
- **Honest empty and unavailable states.** No intent match, no authoritative target, a non-permitted
  role, or unconnected live sources all resolve to NO live affordance: Ask shows the answer plus the
  ordinary process-run and capture controls, and, when Live sources are simply not connected, a
  Connection Center link that mirrors the desk's `not_configured` panel. Ask never invents a lease, a
  recipient, or a startable item.

- **Implementation state (built app-plane).** The suite adds no system-of-record write, no autonomous
  send, no new external scope, and flips no gate; it reads the already-authorized live RentVine data
  and routes into the already-open `gmail.renewal_notice.draft_create` (and, when present,
  `gmail.maintenance_owner_notice.draft_create`) draft surfaces plus the ordinary human-started process
  run. Its implemented slices are:
  - Slice 1 - `lib/ask/action-intent.ts` (pure `resolveAskAction`, gate-respecting, value-free route)
    plus `tests/unit/ask-action-intent.test.ts`.
  - Slice 2 - `lib/ask/renewal-target.ts` (pure strict address/unit match over injected live views)
    plus the read-only `POST /api/ask/live-target` route (read-only, live-config gated) plus
    `tests/unit/ask-renewal-target.test.ts` and `tests/unit/ask-live-target-route.test.ts`.
  - Slice 3 - `components/ask/AskForm.tsx` renders the single live affordance, REUSING
    `RenewalNoticeDraftComposer` pre-seeded with the resolved lease; role-gated and live-availability
    gated; honest empty states; new copy passes `verify:copy-voice`. Extend `tests/unit/ask-form.test.tsx`.
  - Slice 4 - maintenance parallel route (to the S38a draft surface when present, with the ordinary
    app-plane run remaining independently available) plus the High-risk-refused-server-side invariant
    test.
- **Build to the seam (live provider).** None. S33 introduces no provider and no new action key. It
  routes only into actions that already exist at their own seams. D33 makes the closed
  `gmail.renewal_notice.send` and `gmail.maintenance_owner_notice.send` keys permanent
  non-targets: draft-into-Gmail plus a human Gmail send is the final client-facing flow. The
  `rentvine.lease.renewal_writeback` and Gmail-watch work remain owned by S30 and S31 and stay
  deliberately out of Ask's reach. Because Ask only ever routes to an `isActionExecutable` key,
  there is nothing here to build to a seam.
- **Owner dependency (the one flip).** None specific to this suite. S33 flips no gate and needs no
  endpoint, credential, or scope: it reuses the already-authorized live RentVine read and the
  already-open draft-create gate. Interactive `npm run auth:session` remains owner-run. Routine
  release follows D05: after the full local gate, auth and budget preflights, a verified non-null S52
  production cost ceiling, prior-revision capture, and a captured rollback command are green, the
  runner may deploy; it must smoke the new revision successfully before promoting traffic. Neither is
  an S33-specific dependency.

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
  Cloud Scheduler. The verified non-null S52 production cost ceiling applies; if it is unset,
  cost-bearing/live/cloud work is closed while local/app-plane work continues. Routine deployment
  follows D05; interactive auth, credentials/scopes, IAM, billing/quota, provider inputs, and
  destructive operations remain owner-run.
- _Known implementation gap:_ S38 has landed its governed maintenance owner-notice draft route and
  control, but Ask still passes `maintenanceDraftAvailable:false`; the ordinary maintenance app-plane
  run remains available independently. No owner decision is pending. A dependency-independent
  follow-up may route an authoritative maintenance target to the existing S38 preview surface without
  introducing an executor, send, or gate flip.
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
(S38a), plus the ordinary `POST /api/process-definitions/{id}/runs` app-plane path. Extends the Console front door
(S10 `F-CONSOLE-APP-STATE`) and the anticipation lane (S18) with a start-into-the-gate affordance. It
interacts with, and does NOT supersede: `F-SEND-AUTHORIZED` (human-initiated exact-confirmed send
preserved), `F-ROADMAP-BUILD-AUTHORIZED` (this is its Wave-1 row 7), `D-AUTOMATION-LINE` (no
client-facing auto-send introduced), S25 / S26 (the execution contracts it routes into, unchanged),
S29 (a comp-suggested rent still enters a draft only behind its own Admin approval; Ask does not
shortcut it), S30 / S31 (the write and watch seams it stays clear of), and D33 (the closed direct
client-send keys are final, not future S38 work). Additive; no suite-specific Supersede Log entry.
New tests `tests/unit/ask-action-intent.test.ts`,
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
  match returns `no_match` and Ask offers NO provider-action route (the answer, ordinary app-plane run,
  and capture controls remain available), never a fabricated or best-guess lease id. _Verify:_ `npm test -- tests/unit/ask-renewal-target.test.ts`,
  `npm test -- tests/unit/ask-live-target-route.test.ts`.
- **AC-S33-5** - High-risk refused server-side (mirrors `ConsoleApproveButton`). A routed action that
  is High-risk is refused by the gated surface server-side (a 4xx refusal), and Ask renders that
  refusal and the pointer to the full surface; Ask never completes a High-risk action in place.
  _Verify:_ `npm test -- tests/unit/ask-form.test.tsx`; keep `tests/unit/console-approve-button.test.tsx`
  green.
- **AC-S33-6** - The ordinary process-run path is human-started and effect-free. "Get answer + Start
  run" issues exactly `POST /api/process-definitions/{id}/runs`; it persists an app-plane workflow run
  but constructs no provider, sends nothing, and writes no external system of record. The gated Live
  affordance is a SEPARATE, additional control that never replaces or auto-fires the ordinary run; no
  provider action runs without an explicit operator preview and confirmation. _Verify:_ `npm test --
tests/unit/ask-form.test.tsx`; keep `tests/e2e/ask.e2e.test.mjs` green.
- **AC-S33-7** - Role and live-availability gating are honest. A principal who cannot reach the gated
  surface, or a context where live sources are not connected, renders ZERO live affordance; Ask shows
  the answer plus ordinary-run/capture controls and, for the unconnected case, the Connection Center
  link that mirrors the desk `not_configured` panel. All new copy passes the voice gate (plain
  language, "Start run", "the app", no em dash). _Verify:_ `npm test -- tests/unit/ask-form.test.tsx`;
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
`rentvine.lease.renewal_writeback` stay `production_allowed:false` and out of reach. D33 makes the two
client-send keys final non-targets; S30 owns the separately gated write-back seam.
High-risk actions are refused server-side; Ask cannot approve them away. The former "safe Test run"
is retired; only the ordinary human-started app-plane `/runs` path remains, and it cannot construct a
provider or external effect. No new Google scope, no Cloud Scheduler or cron or timer that starts a run, no
personal account in any auth path, no secrets or customer PII or guessed endpoint in git or evidence,
the verified non-null S52 production cost ceiling applies, and an unset ceiling closes
cost-bearing/live/cloud work while local/app-plane work continues. Routine deploy, smoke, and traffic
promotion follow D05 only after its full gate is green; interactive auth, credentials/scopes, IAM,
billing/quota, provider inputs, and destructive operations remain owner-run. This suite MAY NOT set
any `production_allowed:true`; it adds no registry entry at all. A violation of any of these is itself
a falsification.

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
   `tests/unit/ask-form.test.tsx` (AC-S33-3, 5, 6, 7). Keep the ordinary-run and capture controls
   independent from the gated provider affordance.
6. _Verify:_ `npm test` (new tests plus the named sentinels), `npm run typecheck`, `npm run lint`,
   `npm run verify:copy-voice`, `npm run verify:spec-traceability`; confirm AC-S33-8 with an empty
   `git diff --stat` over the registry paths; then `bash scripts/verify.sh`. Browser-drive Ask as a
   permitted role AND a non-permitted role: confirm one click opens the composer at its preview, a
   second explicit confirm creates the unsent draft receipt, nothing sends or writes, and the
   non-permitted role sees no live affordance.
7. _Gate:_ STOP before any send key, any writeback, any new registry entry or gate flip, any Cloud
   Scheduler, and any live route to a non-executable key. There is no owner dependency to hand back for
   this suite. Interactive `npm run auth:session` remains owner-run; routine deployment follows D05
   after the full gate is green.
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
