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

Status: in progress — source reconciliation, run/property review, decisions, approvals, and the
full typed Lease action graph are available; the normal Lease tab is gaining the persistent
production Test run/receipt/Done journey required by the working-app contract.

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

- Admin uses exact preview then one-time setup link; the link is never stored or emailed.
- TOTP enrollment requires a fresh password+TOTP sign-in before server session creation.
- Test principal and ticket/assignment lanes must match.
- Test principals are rejected before OAuth/Gmail construction.
- Live Vendor OAuth/vault remains a separately activated Live-provider capability.

### P8 - Production Release and Human Walkthrough

Status: in progress — code/docs are being verified, committed, merged, pushed, deployed, and
validated on the client-owned Cloud Run service.

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
