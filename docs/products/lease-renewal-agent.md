# Lease Renewal Agent Product Lane

## Working V1

The Lease Renewal Agent is a working part of the production app. It provides:

- bounded Live Rentvine and renewal-Sheet reads;
- deterministic reconciliation, conflict flags, run/property review, resolutions, and
  append-only writeback authorization;
- desktop and mobile decision surfaces with source/provenance state;
- workflow-linked owner/tenant communication boundaries;
- a complete typed Test journey for all eleven S25 actions.

The user does not need every provider activated to use the renewal desk. The Test journey proves
the application/action behavior with invented aliases and no external calls. Each Live action is
activated separately once its exact contract, mapping, identity, confirmation, receipt, monitoring,
and rollback are ready.

## Source Authority

- Rentvine is read-authoritative for renewal candidate discovery, lease dates, contacts,
  property, and owner context.
- The renewal Sheet is an exception/control surface and is reconciled rather than trusted blindly.
- Dotloop holds signed leases and renewal document packages.
- LeadSimple may orchestrate provider work; Boom is conditional auxiliary enrollment.
- The app owns workflow state, decisions, approvals, evidence, and provider backlinks.

Conflicting or missing facts remain visible and cannot be converted into a confident action by an
AI guess. Customer data stays out of git and durable release evidence.

## Live and Test

- Live reads never fall back to samples.
- Test runs are visibly labeled and use `.invalid` recipients and invented IDs.
- Test actions run against no-client adapters, produce bodyless `dataMode:test` receipts, and are
  ineligible for Live-provider proof.
- A missing or undocumented Live provider method means that one action remains unavailable. It does
  not erase the working desk or complete Test workflow.

## S25 Action Groups

The app contains exact previews/adapters for:

1. governed Gmail draft, send, reply, and label;
2. renewal Sheet compare-and-set writeback;
3. Rentvine renewal writeback;
4. Dotloop loop creation and document upload;
5. Rentvine portal message;
6. SMS renewal message with authoritative consent;
7. conditional Boom enrollment.

No action may silently substitute another provider or report channel success without a receipt.
LeadSimple and QuickBooks actions belong to Maintenance, not this lane.

## Human Authority

- Enabled Low/Medium work can execute for an in-scope internal user after its required exact
  confirmation.
- Consequential High work uses the exact Admin decision/preview hash.
- Technical Blocked conditions cannot be approved away.
- Gmail/SMS/portal sends remain human-initiated. No scheduled, bulk, model-triggered, or ambiguous
  retry is permitted.
- Each provider attempt has canonical identity, one claim, idempotency, bodyless receipt,
  reconciliation, and correction/rollback.

## Workflow Experience

Each run shows current status, next action, blocker, owner, due date, source conflict state,
decisions, approvals, provider receipts, and activity. Approval Queue triage is value-minimized and
deep-links to the value-bearing run. Missing approver/assignee/connection becomes a specific Blocked
item; the app does not guess a person or provider value.

AI may propose an assignee, risk, summary, or next action from source-backed fields, but it cannot
approve, execute, close, override permissions, or invent a policy fact.

## Live Activation Checklist

For each provider action:

1. confirm endpoint/expected-state and idempotency semantics;
2. bind authoritative account/template/recipient/consent values;
3. store least-privilege credentials outside Firestore/browser/git;
4. show exact target/effect preview and enforce S20 authority;
5. capture one Live receipt plus readback/reconciliation;
6. verify monitoring, kill switch, and correction/rollback;
7. mark only that action Live-proven/enabled.

Rentvine lease-renewal mutation stays unavailable until its actual supported contract is known; the
Test adapter remains the safe working default. No browser automation or endpoint guessing may
substitute for a provider contract.

## Acceptance

- Live read/reconcile errors are visible and contain no secret/provider body.
- Test action graph completes all eleven actions with one receipt/attempt each and zero Live calls.
- Drift, duplicates, wrong workflow dependencies, schema/risk lowering, and cross-lane execution
  fail before a provider attempt.
- Signed-in desktop/phone users can understand and progress renewal work.
- Enabled Live actions have lane-correct durable evidence and a tested rollback path.
