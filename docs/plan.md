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
scope, app-only mailbox, exact-confirmed reply, and disable/revoke are implemented.

Acceptance:

- Admin uses exact preview then a response-only setup link; if that response is closed before use,
  another exact preview can regenerate it only for the same reconciled pending Test identity. Links
  are `no-store`, never persisted, and never emailed.
- TOTP enrollment requires a fresh password+TOTP sign-in before server session creation.
- Test principal and ticket/assignment lanes must match.
- Test principals are rejected before OAuth/Gmail construction.
- Live Vendor OAuth/vault remains a separately activated Live-provider capability.

### P8 - Production Release and Human Walkthrough

Status: in progress — commit `f02112d9f5ea3dd5a223a46bcc76a96a5c314b97` is deployed at 100%
traffic on `pmi-kc-kb-demo-00025-mhw`; signed-in desktop/phone acceptance and rollback/restore are
complete, and the final all-in-one verifier/HTML evidence is green. Human Test Vendor acceptance
remains.

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
- Commit is merged to `main`, pushed, deployed, and production smoke/browser checks pass.

Current release checkpoint, 2026-07-15:

- Cloud Build `0be21660-bfe6-47e7-8e33-ff1b5b21bd10` produced digest
  `sha256:23e75a9dc7ee22258794814e986dece1ba8303609f7d516ca5d58148109e4625`;
  Firestore ruleset `63b31613-59ba-495c-9ef3-455a5c593f51` is released, and prior revision
  `pmi-kc-kb-demo-00024-6b2` is captured.
- Production Test Lease run `test-renewal-019f6599-af50-7451-88ea-e2592fc001a2` reached Done with
  eleven receipts, eleven attempts, zero Live calls, and refresh-safe persisted state.
- The Admin Test workspace passed Vendor 11/11, Lease 11/11, and Maintenance 19/19 with zero Live
  calls. All eight internal surfaces loaded signed-in; direct phone loads had no overflow, visible
  alerts, or reproducible console errors.
- Global MFA and the TOTP provider are enabled. Human Test Vendor password/TOTP/assigned-ticket/
  mailbox acceptance remains explicit P8 work.
- Traffic was routed 100% to `pmi-kc-kb-demo-00024-6b2`, the auth boundary and signed-in Console were
  verified, and traffic was restored 100% to `pmi-kc-kb-demo-00025-mhw`.
- The clean-install all-in-one verifier passed format, lint (0 errors/8 known warnings), typecheck,
  unit (304 files/2,089 tests), Firestore (17/59), core E2E (32 passed/18 intentional prerequisite
  skips), governance/redaction/falsification, spec traceability (124 acceptance criteria/14 specs),
  `cutover:dry-run`, and the 76-of-76 production build. Full audit: three Moderate dev-only findings,
  zero High/Critical; runtime audit: zero findings.

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
