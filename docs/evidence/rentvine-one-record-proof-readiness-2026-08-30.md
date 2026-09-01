# S30 one-lease RentVine proof readiness — current contract

This packet records the current closed implementation and the owner-set execution contract without
placing a lease identifier, customer value, credential, provider body, or confirmation secret in
Git. It authorizes no effect by itself. S97 is the canonical target specification.

## Current deployed boundary

- Deployed commit: `1d68c7fb0a4f3138b9d0ba410d221b44bfb5534c`.
- Serving revision: `pmi-kc-app-rmtg73suu-fe8734d35330`, receiving 100% of traffic.
- Legacy proof key: `rentvine.lease.renewal_writeback`, read back non-executable after deployment.
- Current proof shape: update only one exact existing lease `endDate`, then restore the captured
  original value through the same provider route.
- Current live-effect verdict: no RentVine proof write or rollback has run.

## Settled owner direction

- The sole proof target is owner-designated and must enter the runner through a fresh secure runtime
  packet. Its URL and provider identifiers do not belong in tracked documentation.
- The forward proof value is the fresh provider-read `endDate` plus one calendar day. The rollback
  value is the exact captured original `endDate`.
- The owner authorizes the protected gate work needed to implement and prove S97. The runner must not
  ask again whether RentVine renewal writeback is intended or whether the target may be used.
- The legacy broad key stays closed and is retired. S97 reuses its safety primitives but every live
  proof and normal product effect runs only under the corresponding narrow exact key.
- Each of S97's three exact keys requires its own serial proof window, close/readback, and separately
  qualified activation; no broad or sibling proof supplies that evidence.

These are final product decisions, not claims that the current code, registry seed, or production
readback already provides the S97 target state.

## Runtime inputs, not open product questions

At execution time the runner must resolve and read back:

1. the owner-designated target from the fresh secure prompt or gitignored runtime packet;
2. the managed `pmikcmetro.com` actor with the required renewal permission;
3. the current provider account, lease identity, and current lease dates;
4. the exact preview hash and phase-specific confirmation;
5. current registry, suspension, environment, and provider-credential state; and
6. the forward and rollback receipts plus final provider readback.

Missing or conflicting runtime evidence is a fail-closed execution condition. It is not a reason to
reopen the product decision, choose another lease, guess a value, or write identifying data to Git.

## Mandatory S97 proof sequence

1. Implement S97's exact keys, writer boundaries, durable operation record, preview, confirmation,
   reconciliation, readback, and rollback behavior while every relevant production key is closed.
2. Read the target and fresh current provider state through the verified RentVine account.
3. Generate an exact preview for `endDate = original endDate + 1 calendar day`; include the captured
   original value as the only rollback target.
4. Review and apply the protected one-key proof-window patch for
   `rentvine.lease.renewal_dates.update`, deploy it through the standard zero-traffic candidate path,
   and read back only that exact key as executable while the broad key remains closed.
5. Create a fresh phase-specific confirmation and issue exactly one forward provider attempt.
6. Require a completed bodyless receipt and exact provider readback of the proposed date. A timeout
   or ambiguous response enters reconciliation and must never trigger a blind retry.
7. Generate and confirm a separate rollback preview, then issue exactly one rollback attempt.
8. Require exact readback of the original date. Any failure to restore it is an incident and cannot
   be reported as success.
9. Close and read back the date key as non-executable and confirm the broad key remains closed.
10. In separate one-key windows, prove recurring-charge create with exact source-backed,
    staff-confirmed terms plus receipt-bound deletion/absence, and prove recurring-charge update with
    an exact reversible delta plus restoration. Close/read back each key before the next window.
11. Activate only each narrow S97 key whose own implementation, tests, live proof, reversal, closeout,
    deployment, and readback gates pass.

The existing `prove:rentvine-renewal` commands remain implementation truth until S97 replaces or
retires them. The implementation runner must inspect current code before deciding which command or
route fulfills each phase.

## Evidence boundary

RentVine provides neither atomic compare-and-set nor a provider idempotency token at this seam. The
application therefore claims one durable attempt and never retries an ambiguous response. Later
matching readback proves observed provider state, not certain causality. Receipts and tracked output
must contain only opaque references, hashes, states, timestamps, and allowlisted refusal codes.

## Readiness verdict

- Product target and direction: **SETTLED**.
- Current implementation and legacy production key: **CLOSED**.
- S97 implementation, protected gate patch, deploy, live forward proof, rollback, and successor-key
  activation: **NOT YET EXECUTED**.
- Open product questions: **NONE**.
