# PMI KC Working-App V1 Plan

Last updated: 2026-08-03

## Release Contract

The deployed application is a stable full-suite product. Production is Live-only. Rehearsal happens
locally with the server-owned descriptor resolving exactly to `environmentKind:"demo"` plus
`dataContext:"live_readonly"` and `source:"explicit"`; it permits bounded Live reads but no durable
write, receipt, or provider effect. The separately hosted Demo GCP project is deferred under
`F-DEMO-DEFERRED-LOCAL-FIRST`. Provider activation remains independent per action. Live writes are
explicit, target-labeled, human-confirmed, idempotent, receipted, reconcilable, monitored, and
reversible.

P0–P8 below preserve verified working-app/deployment history, including the former Production
Live+Test implementation. P9 records the current Live-only/local-rehearsal environment outcome and
the remaining S41–S50 acceptance work.

The following are not application release gates:

- activation of every optional provider action;
- Firestore TTL, extra composite indexes, or Scheduler automation;
- named stakeholder signoff metadata;
- replacing deterministic test fixtures with customer data.

They remain tracked operational/provider work where useful.

## Cross-Product Phases

Phase statuses must start with `done`, `in progress`, `blocked`, or `not started`.

### P0 - Governance and Context Spine

Status: done — runner-neutral routing, facts, loop state, safety, budget, and source rules exist.

Acceptance:

- `AGENTS.md`, `docs/facts.md`, `docs/loop-state.md`, and current specs agree.
- Superseded Pre-V1/every-provider/mandatory-TTL language is deleted from active guidance.
- The historical Live/Test implementation vocabulary and per-action provider activation record are
  stable; P9 owns the current Production Live-only/local-rehearsal vocabulary.

### P1 - Application Foundation

Status: done — production Next.js/Cloud Run, Firebase staff auth, roles/scopes, Firestore,
source-backed Ask, Spaces/processes, approvals, Console, Admin, and observability are built.

Acceptance:

- Authenticated staff use the app through `pmikcmetro.com` identities.
- Missing sources are visible; secrets/customer data do not enter repository evidence.
- App-plane decisions and audit/activity state persist.

### P2 - Lease Renewal Workflow

Status: done — source reconciliation, run/property review, decisions, approvals, the full typed
Lease action graph, and the persistent production Test run/receipt/Done journey are available in
the normal Lease tab.

Acceptance:

- Live Rentvine/Sheet reads degrade visibly without Test fallback.
- The normal Lease tab persists invented Test runs, explicit actions, bodyless non-Live receipts,
  refresh-safe progress, and Done.
- Each Live Lease provider action has an independent activation state/checklist.

### P3 - Workflow Communications

Status: done — workflow-linked Gmail transport, scoped reads, governed labels, review-only
source-backed proposals, exact-confirmed replies, Pub/Sub attention, retention policy, and legal
hold are built. The weaker unused draft mutation is Test-ready and production-closed.

Acceptance:

- No general inbox, generic compose, autonomous send, or cross-mailbox Admin access.
- Confirmation binds actor, mailbox, recipient, thread, exact content, artifact, and sources.
- Bounded manual cleanup is sufficient for V1; automation is optional.

### P4 - Execution Authority and Trusted Publication

Status: done — S20 authority/ledger and S21 validated publication/version/rollback boundaries
are implemented.

Acceptance:

- Low/Medium/High/Blocked behavior is immutable and role-scoped.
- High approval binds the exact preview; technical blockers cannot be waived.
- Published content cannot alter roles, prompts, Registry state, or execution authority.

### P5 - Historical Production Live/Test Data Model

Status: done — record lane, Console dual projection, action identity, receipts, aliases, and
Test-adapter isolation are implemented as the deployed baseline that S40 will migrate.

Acceptance:

- Legacy missing lane resolves to Live.
- Production displays Live and Test simultaneously with persistent labels.
- Test identities/records/adapters/receipts cannot cross into Live.
- The Admin full Test workspace completes Vendor, 11 Lease, and 19 Maintenance typed actions
  with zero Live-provider calls.
- This phase proves current state; it is not the post-S40 target.

### P6 - Maintenance Working Workflow

Status: done — Live in-app tickets and the persistent canonical Maintenance Test workflow are
implemented.

Acceptance:

- Canonical Test ticket uses `unit:test-maple-204` only.
- It supports assignment, Summit Plumbing Test Vendor, statuses, notes/activity, explicit
  simulated actions, close, and reopen.
- Each Test action shows target/effect confirmation and writes a no-provider/non-Live receipt.
- Live tickets reject Test aliases and Test simulation.

### P7 - External Vendor Authentication and Work

Status: done — canonical Test Vendor provisioning, password setup, mandatory TOTP, assignment
scope, app-only mailbox, exact-confirmed reply, disable/revoke, and repeatable authentication
reset/re-enable are implemented.

Acceptance:

- Admin uses exact preview then a response-only setup link; if that response is closed before use,
  another exact preview can regenerate it only for the same reconciled pending Test identity. Links
  are `no-store`, never persisted, and never emailed.
- TOTP enrollment requires a fresh password+TOTP sign-in before server session creation.
- Test principal and ticket/assignment lanes must match.
- Test principals are rejected before OAuth/Gmail construction.
- From `pending_setup`, `active`, or `disabled`, an Admin reason plus exact current preview can reset
  only the canonical `.invalid` Test identity. Reset rotates the Firebase UID and invalidates its
  password, TOTP factors, sessions, action links, and UID-bound confirmations while preserving the
  stable Vendor id, Test tickets, assignments, mailbox history, and completed receipts.
- A partial reset remains disabled/fail-closed; a successful reset returns one `no-store` setup link
  and leaves the Vendor `pending_setup` until a fresh password/TOTP journey succeeds.
- A prepared-crash Admin reload binds the original source without returning UID. While the lease is
  live, only the original reason returns the same preview and takeover refuses. After expiry, a fresh
  reason may rebind that source, atomically record the distinct recovery-claim audit, and recover
  through a UID distinct from every abandoned source/record/Auth UID. Prepared repair retains one
  invite increment/canonical reset audit, and delayed old-owner work cannot touch the winner.
- Reset and setup-link regeneration record bodyless winning-claim events separately from successful
  commit/completion events. A failed pre-completion attempt truthfully retains only its claim event;
  actor UID/Vendor id/reason hash/time are allowed, but target/replacement Firebase UID, link, plaintext
  reason, and secret are forbidden.
- Disable cannot bypass claimed/prepared reset; reset recovery completes first. Disable-first stales
  the old reset confirmation but permits a fresh disabled-state reset, and completed reset permits
  later disable.
- Every Test mailbox read/write/confirmation/reply commit transactionally revalidates active current
  UID, assignment, Test ticket/thread/mailbox, and no claimed/prepared reset. Disable, deassignment,
  rotation, and reset claim revoke stale access before content/state/receipt changes.
- Identity class wins over email domain: any present `vendor`, `vendor_id`, or `data_mode` key—even
  false/empty/malformed—fails closed from internal People/Access, Admin count, role/scope mutation,
  ID-token/session authority, and absent-scope/all-Spaces. Vendor auth separately requires the exact
  valid three-claim tuple.
- Live Vendor OAuth/vault remains a separately activated Live-provider capability.

### P8 - Production Release and Human Walkthrough

Status: in progress — the application is built and the v1 readiness remediation is complete on every
testable code front. `main` = `36440e9` (2,555 tests green, gate clean); the 65-finding audit is fully
worked (all 22 owner decisions ruled, every self-contained code finding fixed and adversarially
verified, a blind 15-agent re-verify held every closed finding). The remediation is now live in production: `main` was deployed to Cloud Run `pmi-kc-kb-demo` on
2026-07-21 (revision `pmi-kc-kb-demo-rmruogj57-577c8d7b9d1a`, 100% traffic, auth boundary HTTP-smoked
green), with the prior `pmi-kc-kb-demo-rmrsg73yg-2bb353f9e7dc` (`ead5da5`) retained as the rollback
target. One P8 gate remains, a human step rather than code: the signed-in by-hand human walkthrough of
every macro feature, guided by `docs/manual-qa-walkthrough-2026-07-21.md`. The
prioritized owner-gated/infra backlog with recommendations is `docs/whats-next.md`.

Acceptance:

- Clean install/audit inventory, format, lint, typecheck, unit, Firestore, core E2E, build,
  governance, redaction, and falsification checks pass.
- Firebase Email/Password, TOTP MFA, and the deployed Auth domain support the Test Vendor.
- Serving revision and rollback revision are captured; traffic rollback is rehearsed or its
  exact command is verified.
- Signed-in desktop/phone walkthrough covers every primary tab plus Maintenance Test and Vendor
  Test journeys.
- The final HTML report explains features, tabs, evidence, provider activation, genuine
  remaining activations, and the historical verification language in plain English.
- Human Vendor acceptance proves password/TOTP, assigned-ticket/mailbox isolation, disable denial,
  reset from a terminal lifecycle state, UID rotation with Test workflow preservation, and fresh
  password/TOTP access after reset without exposing secret-bearing values.
- Commit is merged to `main`, pushed, deployed, and production smoke/browser checks pass.

Current serving release, 2026-07-18:

- The 2026-07-19 owner-approved go-live deploy advanced the serving checkpoint to product commit
  `c87f54d` on revision `pmi-kc-kb-demo-rmrrv992z-a2cc59bb11db` (digest
  `sha256:6d373fd726c1386b9d6282d6ece391d90b5316dac4e80029ae57025f1be24d54`), retaining the prior
  `pmi-kc-kb-demo-rmrqntfvs-4ebadb1e34a5` as the rollback target. The earlier `f6d5ddb` remediation
  deploy (Cloud Build `1e7d0f07-1e45-4256-99c6-44aed1d3d250`) is retained as historical evidence.
- Production Test Lease run `test-renewal-019f6599-af50-7451-88ea-e2592fc001a2` reached Done with
  eleven receipts, eleven attempts, zero Live calls, and refresh-safe persisted state.
- The Admin Test workspace passed Vendor 11/11, Lease 11/11, and Maintenance 19/19 with zero Live
  calls.
- The 2026-07-18 deployed process-audit pass mapped all 32 guide reviewer items into 281 stable cases
  and completed every reachable case: 222 completed, 59 blocked with exact unblock actions, and 137
  normalized findings. Its Test-only mutations produced no Live provider effects. Audit findings are
  evidence for a separately authorized repair pass and do not change this phase status.
- Delayed direct signed-in loads of Ask, Spaces, Approval Queue, Gmail Hub, Connections, Admin, Lease
  Renewal, and Maintenance showed the expected H1, no horizontal overflow, and zero console errors at
  desktop and 375px phone widths. Production acceptance found Approval Queue's implicit
  server/browser time-zone hydration mismatch; the deployed formatter now explicitly uses
  `America/Chicago`, with a regression test pinning stable output.
- Global MFA and the TOTP provider are enabled. Deployed pass two proved the canonical Test Vendor
  password/TOTP, assigned-ticket isolation, mailbox actions, disable/reset, stale-session denial, and
  fresh authentication lifecycle without retaining secret-bearing evidence; its reusable session is
  intentionally not retained at the current stop boundary.
- Historical `f02112d / 00025-mhw` traffic was routed 100% to
  `pmi-kc-kb-demo-00024-6b2`, the auth boundary and signed-in Console were verified, and traffic was
  restored to `00025-mhw`. The final release separately moved 100% traffic from
  `pmi-kc-kb-demo-rmrm9mp6v-04c897acee28` to captured predecessor
  `pmi-kc-kb-demo-rmrm8t6y7-d250f83ddfee`; staff and Vendor sign-in returned 200,
  unauthenticated `/ask` redirected to `/sign-in`, and the signed-in Console worked. Traffic was
  restored 100% to the final revision with the same healthy boundaries and no final-revision ERROR
  log entries.
- The current product commit's clean integrated all-in-one verifier passed format, lint (0 errors/8
  known warnings), typecheck, unit (322 files/2,289 tests), Firestore 59/59, core E2E 32 passed / 18
  intentional prerequisite skips, governance/redaction/falsification/spec/context gates, and the
  production build. Runtime audit: zero findings.
- The deploy wrapper now creates a collision-resistant named revision and then promotes that exact
  revision to 100% traffic, so a prior
  named-revision rollback pin cannot silently leave the new revision unserved. Its public sign-in
  shell uses `--no-invoker-iam-check` without adding an `allUsers` IAM binding.

### P9 - UI/UX Recalibration and Environment Separation (S40–S50)

Status: in progress — Production is Live-only and the product Test lane/fixture machinery is retired.
Local rehearsal resolves explicitly to Demo + Live-read-only and refuses durable writes/provider
effects. The hosted Demo GCP project is deferred; do not provision it or seed invented product data.
The remaining S41–S50 product acceptance work stays governed by its owning suites.

Program:

- Authority/order: `docs/ui-ux-recalibration-implementation-program-2026-07-28.md`.
- Canonical unattended fresh context:
  `docs/meta-prompts/ui-ux-recalibration-unattended-loop.md`.
- Locked end-state contract: `docs/fresh-context-ui-ux-recalibration-prompt-2026-07-28.md`.
- Flags: `spec_writing_allowed:true`, `loop_execution_allowed:true`,
  `runtime_action_gates_preflipped:false`.
- Order: S40 → S41 → S42 → S44 → S43 → S45 → S46 → S47 → S48 → S49 → S50.

Acceptance:

- Production accepts Live only; local rehearsal resolves to `environmentKind:"demo"` plus
  `dataContext:"live_readonly"` with `source:"explicit"`, cannot mutate or receipt, and Production
  delivery uses exact candidate promotion plus captured rollback.
- S41–S42 deliver four daily destinations plus primary Spaces, compact role-aware mobile/desktop
  shell, plain vocabulary, one owner per attention type, and a grouped non-card Spaces flow.
- S44 supplies exact field/evidence/return links and truthful provider destinations: verified exact
  record URL or reviewed generic front door labeled non-exact, never guessed/evidence-mislabeled.
- S43 supplies one Renewal desk/unit/four-stage flow, scoped Editor Live-desk/draft access, exact
  redirects, and a versioned Chasity template slot whose missing artifact blocks only dependent
  output.
- S45 supplies one-card phone/desktop decisions with secondary filters/selection and unchanged
  reason/version/risk authority.
- S46–S47 supply a focused Maintenance workspace and secure no-second-login resident intake; the
  RentVine interactive endpoint blocks only S47 channel activation.
- S48 supplies workflow-only Communications, provider Connections, task Admin, and no replacement
  Test Lab. Shipped simulations/no-op Sample tools leave; automated tests, local refusal/read-only
  proof, security/TOTP, rollback, and real provider seams remain.
- S49 uses hide/move/redirect/instrument before bounded deletion and proves consumers, roles,
  routes, scripts, tests, provider/security ownership, deployed usage, and rollback. Static
  reachability alone never deletes.
- S50 implements S37 only against the canonical baseline with inert typed components/safe regions;
  page config cannot change shell/routes/environment/roles/gates/required controls or execute.
- Authenticated Admin/Editor/Vendor/resident desktop and 390×844 whole-task coverage, exact-link/
  focus/overlay checks, negative environment/role/effect tests, deterministic full gate, serving
  revision, smoke, prior revision, and rollback evidence are recorded.

### P10 - Live Production Phase (S51–S54)

Status: in progress — the owner directed PMI KC into a live production phase on 2026-07-29 and
authorized unattended development across the full spec flow. The sanitized D01–D64 reconstruction
records its provenance and does not invent the unavailable browser-local response export. Governance
is reconciled; the four suites are specified; S54 slice 1 and S53.1–S53.5 are locally complete;
S52-I/J and its fail-closed print-only planner prerequisite are locally complete; S51's close-only
kernel plus the unprotected store, Admin route/panel, value-free audit, execution-path wiring, and
provider/script refusal sentinels are locally complete. S51's explicit A2 logger plus print-only
four-policy/one-channel monitoring bundle and GET-only verifier are also locally complete. The
reply/watch A2 seam, rollback rehearsal, incident/fallback contract, six-collection product-record
retention, six-flag pilot capacity pin, and checked log-hygiene/monitoring owner packet complete
S51's dependency-safe local specification. The protected Firestore Rules hunk, owner-run cloud
application, and fresh live rehearsal remain parked. The exact remaining Gmail portfolio work —
`gmail.label.apply`, `gmail.renewal_notice.draft_create`, and
`gmail.maintenance_owner_notice.draft_create` — is transferred to those actions' canonical
one-attempt contract slices. No provider capability has been activated.

Program:

- Authority: the Production Phase Authorization in `AGENTS.md`; `F-PRODUCTION-PHASE-AUTHORIZED`.
- Suites: S51 operational readiness, S52 cost governance, S53 green-light activation and gate
  integrity, S54 verification/CI parity.
- Flags: `loop_commit_push_allowed:true`, `loop_deploy_allowed:true`,
  `provider_interleave_allowed:true`, `runtime_action_gates_preflipped:false`.
- Order: S53 gate/environment refusal → S53 immutable Sheet and comp-screenshot action contracts →
  S53 sender/config integrity → S53 Admin-reachable Vendor lifecycle seam → S52 read-only
  baseline/prerequisites → S51 close-only kernel → S51 store/route/audit and gated-effect
  execution-path readiness → S51 A2/monitoring definitions → S51
  reply/watch A2 plus incident/retention/rehearsal/capacity/log-hygiene local completion →
  S25's canonical Gmail label action contract (DONE 2026-07-31), then the renewal/maintenance
  draft action contracts →
  activate S52/S51 infrastructure when their named dependencies are satisfied → land
  S40's environment-parameterized zero-traffic candidate/smoke/promotion release-safety slice →
  routine deploy/live verification when auth and cost gates are green → continue the remaining
  dependency-ready suite flow. Protected-path changes are parked for
  owner review while independent work continues.

Acceptance:

- The gate that licenses an unattended push is the full one, with `test:firestore` wired into
  `scripts/verify.sh` and CI (S54, D23). Local falsification and the widened full gate are recorded;
  GitHub Actions run `30510068990` passed the pushed S54.1 checkpoint, including the Firestore job.
- The live Sheet write-back consults its Action Registry gate and carries an
  environment-descriptor fence; no path writes to a client system of record outside its gate
  (S53, D32/D02).
- No capability reports as active while its value is unforwarded by the deploy wrapper; the
  cutover guard is keyed so a silent inert activation cannot recur (S53, D29).
- Three operational alert policies plus the separate kill-switch-outcome policy (four total) and
  one attached human-reaching notification channel exist before live-data cutover; a close-only
  runtime suspend can stop every Registry-gated live effect without a deploy. It is deliberately
  not a disconnect for the always-on read-only Product sources (S51, D13/D09).
- The cost ceiling is set from a measured burn baseline, with the budget amount and
  `KILL_SWITCH_CAP_USD` moved in lockstep and covered per project (S52, D01).
- Live operation runs as a bounded pilot with a stated abort trigger (D08, `F-PILOT-ROLLOUT`).

## Per-Action Provider Activation

Use these states without changing the application label:

| State           | Meaning                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------- |
| unavailable     | No usable Live provider contract/client is configured; app-plane/test work may still continue.       |
| test_ready      | Internal compatibility enum for deterministic non-Live test evidence; it is not a product data lane. |
| live_configured | Exact Live contract, identity, mapping, and credential are configured.                               |
| live_proven     | One authorized Live action/readback has durable evidence.                                            |
| enabled         | Registry permits normal Live use with monitoring and rollback.                                       |
| suspended       | Kill switch is active; prior evidence is retained.                                                   |

Activation checklist for a Live write/send:

1. documented endpoint and expected-state semantics;
2. authoritative account/template/stage/folder/recipient mapping;
3. least-privilege credential/vault reference;
4. exact target/effect preview and role decision;
5. one attempt, idempotency, bodyless receipt, readback/reconciliation;
6. monitoring, kill switch, and correction/rollback.

## Safe Operational Defaults

- Keep Production Live-only; never add another Production Test/Demo intake or product surface.
- Rehearse locally only with explicit Demo + Live-read-only resolution. It has no invented records,
  durable writes, receipts, or provider effects; the hosted Demo GCP project remains deferred.
- Use bounded on-demand communications cleanup until measured volume justifies automation.
- Do not create optional indexes without a query that requires them.
- Preserve in-app notifications as the default; no event-driven approval email.
- Keep external sends human-initiated and exact-confirmed.
- Treat the three Moderate `firebase-tools`-chain audit findings as documented dev-only
  dependency inventory unless severity or runtime reachability changes.

## Genuine Remaining Activations

These do not prevent code/documentation/deployment completion:

- Firebase Email/Password, TOTP MFA, and deployed hostname authorization are complete as of
  2026-07-15; only deployed Vendor enrollment/challenge acceptance remains in P8.
- Live external Vendor mailbox: routable Vendor, same-address OAuth client/redirect, secret vault.
- Live provider actions: exact provider-specific contracts, credentials, and mappings where not
  already documented/configured.
- Optional operations: TTL, Scheduler, or additional indexes if later volume warrants them.

Each item must be reported with the exact action affected, recommended setup process, verification
evidence, and the app-plane/tests/local read-only rehearsal that remain available meanwhile. Do not
label an entire feature pending when only one external activation is missing.
