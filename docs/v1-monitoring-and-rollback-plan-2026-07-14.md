# Final-V1 monitoring and rollback plan

Date: 2026-07-14. Status: **pre-V1 / local plan only**. This plan grants no deploy, provider, or
production authority.

## Release controls

- Josiah owns revision/config/Action Registry/policy promotion, monitoring, rollback, Gmail/OAuth
  watch, and incident handoff. Dan owns business result, source, workflow, and template acceptance.
- A release manifest pins commit and revision, environment, rules/index versions, Registry hash,
  communications artifact/retention versions, migrations, smoke cases, per-action evidence,
  monitoring, rollback, and both named acceptances.
- Every required external action remains independently closed until its documented account contract,
  approved connection and mapping, code review, separately authorized proof, bodyless receipt, monitor,
  and correction path exist. An approval or receipt never transfers to another action.
- Immediately before any separately authorized cost-bearing step run `npm run check:budget-guard`; before
  a live Google read run `npm run preflight:adc`. A stale token requires the owner to run
  `npm run auth:session` interactively. Never substitute a personal identity.

## Monitor contract

For each promoted action, alert on provider health failure, authentication/scope drift, stale mapping,
Registry/manifest drift, one-attempt claim without a terminal receipt, ambiguous outcome awaiting
reconciliation, read-after-write mismatch, cross-scope denial, and queue age. Gmail/OAuth additionally
monitors watch expiry, refresh failure, granted-scope drift, same-mailbox binding, and revocation queue
age. Monitoring records identifiers, timestamps, state, and hashes only—never customer values, message
bodies, files, tokens, or secrets.

## Rollback and correction sequence

1. Stop traffic to the affected action by setting that exact Registry entry closed; do not disable an
   unrelated provider action.
2. Preserve the immutable execution/audit record. Mark ambiguous results for reconciliation and make
   no automatic second attempt.
3. Revoke or disable the affected OAuth grant, Vendor session/account, provider credential, watch, or
   scheduled job as applicable. Do not delete bodyless audit.
4. Route application traffic to the prior verified revision and restore the pinned configuration,
   rules/indexes, Registry hash, publication policy, and retention/artifact versions.
5. Reconcile provider state by idempotency/provider reference and read-after-write. Apply the separately
   reviewed correction contract (correction message, compare-and-set reversal, provider reversal,
   archive/supersede, or draft deletion); never blind-retry or erase history.
6. Verify the prior revision, source/failure states, auth boundaries, and action closure. Record a
   non-secret incident/evidence reference and hand off to Josiah; Dan re-accepts any changed business
   result.

## Rehearsal ledger

| Rehearsal                                                 | Local evidence                             | Production state                                |
| --------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------- |
| Registry drift/missing proof refuses V1                   | `tests/unit/v1-release-manifest.test.ts`   | Pending separately authorized deployment proof  |
| Stale preview, duplicate claim, ambiguous provider result | S20/S25/S26 orchestrator tests             | Pending per-action bounded proof                |
| Vendor disable/deassign/token revocation                  | `tests/unit/vendor-lifecycle.test.ts`      | Pending Identity Platform/OAuth setup and proof |
| Prior revision/config/policy restore                      | This runbook plus existing cutover tooling | Pending authorized dry run                      |

No production rollback rehearsal, deployment, cloud configuration, credential use, or provider call was
performed in the 2026-07-14 local implementation run.
