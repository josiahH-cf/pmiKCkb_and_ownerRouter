# Lease Renewal Agent Product Lane

## Product target and current transition

The Lease Renewal Agent is a working part of the deployed app. Current code already provides bounded
Live RentVine/Sheet reads, deterministic reconciliation, decisions, drafts/actions, and a complete
isolated Test action graph. S40/S43 now change the product shape without discarding that proven
business/security behavior:

- Production opens one Live-only renewal desk.
- Demo opens the same desk/unit components with realistic invented Demo records and zero
  Live-provider effects; optional Live data in Demo is explicitly read-only and never mixed.
- One per-unit workspace owns Data check → Owner decision → Tenant offer → Build documents.
- Compare sources, exact decisions, notice drafting, evidence, provider destinations, receipts, and
  history stay in that unit context.
- Scoped Editors can access Live desk/unit work and create governed drafts; provider send/write and
  High-risk authority remain independently enforced.

`F-PRODUCTION-DUAL-DATA-LANES` and the existing Test journey remain accurate deployed evidence until
S40 migration. They are no longer the target Product IA.

## Source authority

- RentVine is read-authoritative for renewal candidates, lease dates, contacts, property, and owner
  context.
- The renewal Sheet is an exception/control source and is reconciled rather than trusted blindly.
- Dotloop holds signed leases and renewal document packages.
- LeadSimple may orchestrate provider work; Boom is conditional auxiliary enrollment.
- The app owns workflow state, decisions, approvals, evidence, exact item anchors, receipts, and
  verified provider backlinks.

Conflicting or missing facts remain visible and cannot become a confident action through a model
guess. Customer data stays out of git and durable release evidence.

## Canonical experience

The desk shows only actionable summary: unit/lease, stage, next action, owner, due date, blocker,
source-difference signal, and last activity. It does not begin with Sample controls, action Registry
matrices, or parallel Live review/notices links.

The unit workspace is self-contained:

1. **Data check:** authoritative fields, source freshness, and exact Compare sources differences.
2. **Owner decision:** evidence, comp/suggested-rent context where allowed, exact decision/reason,
   and resulting next step.
3. **Tenant offer:** approved terms, governed template/draft preview, recipient/source state, and
   permitted human-confirmed communication.
4. **Build documents:** validated active template version, Dotloop/document state, execution
   receipts, and follow-up.

Every decision card opens the exact field and source evidence and returns to the prior desk filter/
position. A verified provider record URL is preferred; otherwise the reviewed provider front door
is labeled `Exact record link unavailable`. Generic provider navigation is never evidence.

Chasity’s updated renewal template is a versioned external artifact. The app builds its validated
slot, immutable version, preview, Admin approval, active pointer, and rollback without inventing
copy. Its absence blocks only the template-dependent output and says `Renewal template not
supplied`.

## Environment behavior

- Production accepts/renders Live renewal records only; missing/unknown/Demo classification fails
  closed and no Sample/Demo/Test selector or seeder ships.
- Demo uses Demo-owned data/adapters/receipts and the exact product UI. Demo provider-shaped actions
  never construct a Live client or prove Live activation.
- Demo Live-read-only is a separately selected, persistently labeled context that refuses all app/
  provider mutations and never contributes to Demo counts/decisions/receipts.

## Human and provider authority

- A scoped Editor may use the Live desk, resolve permitted Low/Medium app decisions, and create a
  governed draft.
- Consequential High work uses the exact Admin decision/preview hash.
- Technical Blocked conditions cannot be approved away.
- Gmail/SMS/portal sends remain human-initiated and exact-confirmed. No scheduled, bulk,
  model-triggered, autonomous, or ambiguous retry is permitted.
- Every provider attempt has canonical identity, one claim, idempotency, value-minimized receipt,
  readback/reconciliation, monitoring, and correction/rollback.

The existing S25 action groups remain authoritative:

1. governed Gmail draft/send/reply/label;
2. renewal Sheet compare-and-set writeback;
3. RentVine renewal writeback;
4. Dotloop loop creation/document upload;
5. RentVine portal message;
6. SMS renewal message with authoritative consent; and
7. conditional Boom enrollment.

No action silently substitutes another provider or reports channel success without a receipt.
LeadSimple/QuickBooks actions remain Maintenance-owned.

## Activation and unavailable states

For each Live provider action, confirm endpoint/expected-state/idempotency, authoritative account/
template/recipient/consent mapping, least-privilege credential, exact preview and S20 authority, one
Live receipt/readback, monitoring/kill switch, and correction/rollback. When the exact dependency is
documented, open its `production_allowed` gate, both executable allowlists, and pinned tests in the
owning slice rather than leaving a finished feature preview-only.

An undocumented provider method blocks that one Live action. It does not block the canonical desk,
Demo product workflow, or unrelated actions. Never substitute browser automation or a guessed
endpoint.

## Retirement

Legacy landing, sample unit, runs/run detail, reconciliation, Live review/desk/unit/notices, and
property-history page shapes are inventoried. Valid entries redirect to the exact canonical desk/
unit/field in stage one. Parallel shells, no-op prepare controls, and operator readiness matrices are
deleted only after S49 consumer/role/route/task/deployed-boundary/rollback proof. Property history
may remain as a contextual subview when it has a distinct historical job.

## Acceptance

- Production opens one Live desk; Demo opens the same product with Demo data and zero Live provider
  construction.
- A scoped Editor can complete permitted work and create a draft, but cannot cross scope, perform an
  Admin-only decision, use a disabled action, or send/write without exact authority.
- A unit completes all four stages in one refresh-safe workspace with exact evidence/backlinks and
  history.
- Missing Chasity artifact blocks only template-dependent output and produces no invented copy.
- Legacy routes preserve safe exact context during stage one and no generic-run link replaces an
  item/field anchor.
- Desktop/390×844 whole-task, keyboard/focus, environment, auth, reconciliation, action, receipt,
  redaction, and rollback tests remain green.
