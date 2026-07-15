# PMI KC Working-App V1 Plan

Last updated: 2026-07-15

## Release Contract

V1 is the stable production application with complete, visible Live and isolated Test
workflows. Test records use reserved aliases, make real app/Firestore writes, may reach Done,
and cannot contact an external provider or count as Live evidence. Provider activation is
reported independently per action. Live writes are explicit, target-labeled, human-confirmed,
idempotent, receipted, reconcilable, monitored, and reversible.

The following are not application release gates:

- activation of every optional provider action;
- Firestore TTL, extra composite indexes, or Scheduler automation;
- named stakeholder signoff metadata;
- replacing safe invented Test data with customer data.

They remain tracked operational/provider work where useful.

## Cross-Product Phases

Phase statuses must start with `done`, `in progress`, `blocked`, or `not started`.

### P0 - Governance and Context Spine

Status: done — runner-neutral routing, facts, loop state, safety, budget, and source rules exist.

Acceptance:

- `AGENTS.md`, `docs/facts.md`, `docs/loop-state.md`, and current specs agree.
- Superseded Pre-V1/every-provider/mandatory-TTL language is deleted from active guidance.
- Live/Test and per-action provider activation vocabulary is stable.

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

### P5 - Production Live/Test Data Model

Status: done — record lane, Console dual projection, action identity, receipts, aliases, and
Test-adapter isolation are implemented.

Acceptance:

- Legacy missing lane resolves to Live.
- Production displays Live and Test simultaneously with persistent labels.
- Test identities/records/adapters/receipts cannot cross into Live.
- The Admin full Test workspace completes Vendor, 11 Lease, and 19 Maintenance typed actions
  with zero Live-provider calls.

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

Status: in progress — Working-App V1 commit `38ebcf530e3fe193547806bace91246ccea20c0b` is
serving 100% traffic on `pmi-kc-kb-demo-rmrm9mp6v-04c897acee28`. Clean verification,
commit/push/deploy, production logs, and signed-in desktop/375px browser acceptance are complete. The
captured-prior traffic rollback/restore rehearsal is also complete. The human Test Vendor
password/TOTP lifecycle ceremony is the sole remaining acceptance.

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

Current serving release, 2026-07-15:

- Successful Cloud Build `f106ceb4-02d0-497c-b147-f716e04c0149` produced serving revision
  `pmi-kc-kb-demo-rmrm9mp6v-04c897acee28` and digest
  `sha256:25358a99d6f4890da64db6d3cb17b0ca7d3725c7f0251390b7c6dc8b12ba8103`; its captured
  serving predecessor is `pmi-kc-kb-demo-rmrm8t6y7-d250f83ddfee`. Firestore ruleset
  `63b31613-59ba-495c-9ef3-455a5c593f51` is released.
- Production Test Lease run `test-renewal-019f6599-af50-7451-88ea-e2592fc001a2` reached Done with
  eleven receipts, eleven attempts, zero Live calls, and refresh-safe persisted state.
- The Admin Test workspace passed Vendor 11/11, Lease 11/11, and Maintenance 19/19 with zero Live
  calls.
- Delayed direct signed-in loads of Ask, Spaces, Approval Queue, Gmail Hub, Connections, Admin, Lease
  Renewal, and Maintenance showed the expected H1, no horizontal overflow, and zero console errors at
  desktop and 375px phone widths. Production acceptance found Approval Queue's implicit
  server/browser time-zone hydration mismatch; the deployed formatter now explicitly uses
  `America/Chicago`, with a regression test pinning stable output.
- Global MFA and the TOTP provider are enabled. Human Test Vendor password/TOTP/assigned-ticket/
  mailbox/disable/reset acceptance remains explicit P8 work.
- Historical `f02112d / 00025-mhw` traffic was routed 100% to
  `pmi-kc-kb-demo-00024-6b2`, the auth boundary and signed-in Console were verified, and traffic was
  restored to `00025-mhw`. The final release separately moved 100% traffic from
  `pmi-kc-kb-demo-rmrm9mp6v-04c897acee28` to captured predecessor
  `pmi-kc-kb-demo-rmrm8t6y7-d250f83ddfee`; staff and Vendor sign-in returned 200,
  unauthenticated `/ask` redirected to `/sign-in`, and the signed-in Console worked. Traffic was
  restored 100% to the final revision with the same healthy boundaries and no final-revision ERROR
  log entries.
- The deployed release's clean-install all-in-one verifier passed format, lint (0 errors/8 known
  warnings), typecheck, unit (306 files/2,179 tests), Firestore (17/59), core E2E (32 passed/18 intentional prerequisite
  skips), governance/redaction/falsification, spec traceability (124 acceptance criteria/14 specs),
  `cutover:dry-run`, and the 76-of-76 production build. Full audit: three Moderate dev-only findings,
  zero High/Critical; runtime audit: zero findings.
- The deploy wrapper now creates a collision-resistant named revision and then promotes that exact
  revision to 100% traffic, so a prior
  named-revision rollback pin cannot silently leave the new revision unserved. Its public sign-in
  shell uses `--no-invoker-iam-check` without adding an `allUsers` IAM binding.

## Per-Action Provider Activation

Use these states without changing the application label:

| State           | Meaning                                                                         |
| --------------- | ------------------------------------------------------------------------------- |
| unavailable     | No usable provider contract/client is configured; Test workflow may still work. |
| test_ready      | Complete isolated Test adapter and workflow evidence exist.                     |
| live_configured | Exact Live contract, identity, mapping, and credential are configured.          |
| live_proven     | One authorized Live action/readback has durable evidence.                       |
| enabled         | Registry permits normal Live use with monitoring and rollback.                  |
| suspended       | Kill switch is active; prior evidence is retained.                              |

Activation checklist for a Live write/send:

1. documented endpoint and expected-state semantics;
2. authoritative account/template/stage/folder/recipient mapping;
3. least-privilege credential/vault reference;
4. exact target/effect preview and role decision;
5. one attempt, idempotency, bodyless receipt, readback/reconciliation;
6. monitoring, kill switch, and correction/rollback.

## Safe Operational Defaults

- Keep test data alongside Live records with persistent labels and reserved IDs.
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
evidence, and the Test workflow that remains available meanwhile.
