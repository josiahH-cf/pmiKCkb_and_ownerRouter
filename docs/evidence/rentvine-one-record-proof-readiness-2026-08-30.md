# S30 one-lease RentVine proof readiness - 2026-08-30

This packet records implementation readiness without naming a lease, person, date value, credential,
or provider body. It is not live-write authorization.

## Deployed boundary

- Commit: `1d68c7fb0a4f3138b9d0ba410d221b44bfb5534c`
- Revision: `pmi-kc-app-rmtg73suu-fe8734d35330`, 100% traffic
- Exact action: `rentvine.lease.renewal_writeback`, reread non-executable after promotion
- Rollback target: `pmi-kc-app-rmtfzwn77-8153d75d1cd5`
- CI: aggregate exact-SHA run `33330420327`, passed
- Canonical gate: 559 unit files passed plus one intentional skip; 5,064 tests passed plus four
  skips; 26 Firestore files/119 tests; 107-route build; production dependency audit zero
- Live effects: none. No proof packet, writer construction, RentVine mutation, rollback, client-data
  write, Gmail draft/message, or action-key change occurred.

## Exact supported proof

The runner supports one operation shape only: update the `endDate` of one exact existing lease through
the documented lease-update POST, then restore the captured prior value through the same shape.

The separate recurring-charge write client is not reachable from this proof. It cannot become
reachable until the provider's exact recurring-charge readback contract is independently verified.
No generic request, custom path/body, second record, create/delete charge, status change, or bulk
operation is accepted.

## Inputs still required outside Git

The owner/client must supply all of the following through a secure channel:

1. one unmistakable existing lease and its observed identity field;
2. exact current start/end dates, one proposed end date, and rollback equal to the original end date;
3. one enabled managed `pmikcmetro.com` Firebase Admin with Renewals scope;
4. bodyless references for client designation, endpoint/mapping evidence, backup, and a separately
   explicit protected gate direction;
5. an exact authorization expiry; and
6. fresh provider account/state readback at execution time.

Copy the invalid templates into a new gitignored `temp/s30/<opaque-proof-ref>/` directory and fill
them there. Never edit the tracked templates into executable packets. Set:

- `S30_RENTVINE_PROOF_RUNTIME_CONFIG_PATH` to the secure runtime packet; and
- `S30_RENTVINE_PROOF_CONFIRMATION_PATH` to the phase-specific confirmation packet only after
  reviewing the generated packet.

The command surface is:

```bash
npm run prove:rentvine-renewal -- preview
npm run prove:rentvine-renewal -- status
npm run prove:rentvine-renewal -- execute
npm run prove:rentvine-renewal -- reconcile
npm run prove:rentvine-renewal -- rollback-preview
npm run prove:rentvine-renewal -- rollback
npm run prove:rentvine-renewal -- rollback-reconcile
npm run prove:rentvine-renewal -- closeout
```

Terminal output contains only opaque refs, hashes, states, and allowlisted refusal codes. Review
packets stay under gitignored `temp/`; no client values or provider bodies enter Git.

## Mandatory live sequence

1. Read back the exact managed actor, production descriptor, account, committed seed, live action,
   runtime suspension, endpoint/mapping evidence, and current lease state.
2. Run `preview` while the key is closed. Review the one-lease before/proposed/rollback object and
   generated forward execution id/hash. Do not execute.
3. Obtain a separate exact owner direction for the protected one-key patch. Review and apply only that
   patch, then read back the exact action executable. This suite and packet do not grant that
   direction.
4. Create a fresh exact forward confirmation. Run `execute` once. The service rereads source and
   revalidates actor/action/runtime/confirmation after each provider read immediately before writer
   construction.
5. Require a completed bodyless forward receipt and exact observed provider readback. On timeout or
   ambiguity, stop. After the bounded running window, `reconcile` may observe state but cannot retry
   or claim causality.
6. Run `rollback-preview`, review a new rollback id/hash, create a new rollback confirmation, and
   run `rollback` once.
7. Require the original value's exact readback. On ambiguity, stop and use
   `rollback-reconcile`; never issue another write.
8. Restore the protected exact key to closed and read it back non-executable.
9. Run `closeout`. It must refuse unless forward and rollback outcomes exist, the committed seed is
   false, and live action readback is non-executable.

Failure to prove the original value restored or the exact action closed is an incident. It is never
reported as completion.

## Provider limitation and consequence

The verified RentVine seam provides no atomic compare-and-set and no provider idempotency token. The
application therefore claims one durable attempt and never retries an ambiguous response. A later
matching readback proves only observed provider state; it cannot prove that this application caused
the state. A live reviewer must accept that evidence boundary explicitly and must not substitute a
second mutation for missing causality.

## Current verdict

- Closed implementation: **ALL_GATES_GREEN**
- Production gate/readback: **PASS - non-executable**
- Live forward/rollback proof: **BLOCKED** on the exact secure designation and separate protected
  owner direction
- Human litmus: blank until the owner performs it
