# PMI KC current plan

Last updated: 2026-08-26.

## Release contract

Production is Live-only. Local rehearsal is explicit Demo + Live-read-only and effect-refused.
Provider effects activate per exact key. A system-of-record write requires human preview,
confirmation, receipt, readback, and rollback. Direct renewal and maintenance sends do not exist;
the product creates an unsent Gmail draft for human sending.

## Cross-Product Phases

Phase statuses start with `done`, `in progress`, `blocked`, or `not started`.

### P0 - Governance and context

Status: done — the present-truth reset and its adversarial verification are complete.

Acceptance:

- One authority router and one current documentation index.
- Facts, status, plan, and loop state contain no superseded active claim.
- Historical context remains in Git, not the active read path.
- Machine gates reject missing evidence, stale loop state, broken active links, and undocumented specs.

### P1 - Production foundation

Status: done — Cloud Run, Firebase auth, Firestore, managed identities, eleven Spaces, source-backed
Ask, Admin, Console, processes, and release controls are live.

Acceptance:

- Production + Live descriptor and managed runtime identity.
- Exact commit/revision endpoint and zero-traffic candidate release.
- $25 alert, $100 project hard stop, $100 account backstop, active guardrail cap 100.

### P2 - Lease renewal core

Status: done — complete RentVine/Sheet reads, chronological desk, identity/address truth, reconciliation,
current-rent confidence, comps, pricing suggestions, recipients, reviewed drafts, and packet-state
machinery are built.

Acceptance:

- 306-lease complete read.
- Conflict/staleness never receives a Verified badge.
- RentCast is reference-only and allowance-bounded.
- Drafts never send themselves.

### P3 - Workflow communications

Status: done — workflow-linked Gmail read, reply, label, and unsent renewal/maintenance draft paths are
built under exact gates.

Acceptance:

- No general inbox or generic compose/send.
- Exact mailbox, thread, recipient, content, and source confirmation.
- Client notice send remains a human Gmail action.

### P4 - Operations and staff work

Status: done — Maintenance, feedback, resident intake seam, Vendor seam, approvals, notifications, and
staff work accountability are present.

Acceptance:

- Explicit user-started work sessions and factual time records.
- Job location and material details round-trip.
- No surveillance, productivity ranking, or HR inference.

### P5 - Meeting-readiness release

Status: done — commit `1356918` is deployed on exact revision
`pmi-kc-app-rmtafuqbg-4e2e4ffe0f48`.

Acceptance:

- Full canonical gate and bounded browser suite green.
- Candidate and stable exact-version smoke green.
- Agenda and client action center complete.
- No RentVine or operating-Sheet mutation.

### P6 - Client process validation

Status: blocked — waits on the named client inputs in `docs/client-checklist.md`.

Acceptance:

- Six renewal steps and owners confirmed.
- Current-rent semantics confirmed.
- Move-out disposition workflow captured.
- Exact wrong-resident lease retested.
- RentCast operator policy confirmed.

### P7 - Controlled write proofs and remaining provider seams

Status: blocked — waits on a distinct rehearsal Sheet, a designated RentVine test record, approved S66
catalog/provider mappings, and provider-specific credentials/contracts.

Acceptance:

- Rehearsal Sheet blank-cell write/read/clear/final-blank proof.
- RentVine one-record preview/confirm/readback/rollback before any gate activation.
- Dotloop, LeadSimple, resident, Vendor, and packet actions stay unavailable unless their exact seam is
  complete.
- S64 remains unimplemented until explicitly authorized.

## Order

1. Capture client process answers without changing source systems.
2. Run the rehearsal-copy proof only after a distinct copy exists.
3. Prepare (but do not infer) the one-record RentVine proof.
4. Implement S72, S74, and S75 from confirmed process decisions.
5. Advance one provider seam at a time.
