<!-- spec-shape: overhaul-v1 -->
<!-- feature-handoff: renewal-stabilization-v2 -->

# S30 — RentVine renewal-write activation proof

> Status: Restricted preview/client/readback/rollback seams are built; the production key is closed,
> no exact client-designated test record/field is recorded, and no live write has been attempted.

**Goal.**

Prove one human-initiated, exact-previewed, exact-confirmed, idempotent, receipted, read-back, and
reversible RentVine renewal update against one unmistakable client-designated record without making
any second record or generic provider operation reachable.

**Current state / intended end state.**

The write client exposes only documented lease-update and existing-recurring-charge POST shapes with
allowlisted fields. The app can build an exact dry preview and rollback payload but has no production
caller; `rentvine.lease.renewal_writeback` remains closed and credential write ability is not live-
proven. The intended proof temporarily opens only the reviewed exact key after all prerequisites,
executes one bounded change, verifies it, rolls it back, verifies restoration, and restores/read-backs
the key to closed immediately. Any later proposal to leave the key open is a separate owner decision
and protected change; this proof cannot authorize it.

**Actors and entry conditions.**

One Admin/owner-approved operator using a managed identity; one unmistakable client-designated Live
lease/owner; one explicitly allowed field or existing recurring charge; fresh provider state; exact
endpoint/mapping evidence; backup/current value; rollback payload; reviewed protected key change; and
an exact preview/hash/idempotency key are all mandatory. The statement that a lease is available for
workflow testing is not by itself write authorization, and no identity/value belongs in Git.

**What it is / how it functions.**

The operator selects the separately designated record through a secure runtime input. The service
reads current provider state, binds record id/current value/proposed value/actor/action/rollback into
one immutable preview, and requires exact confirmation. It claims one idempotency key, constructs only
the allowlisted request, records the provider response, re-reads the exact field, and issues a bodyless
receipt. Rollback has its own exact preview/confirmation and must restore/read back the captured prior
state. Any uncertain response enters reconciliation and forbids blind retry.

**In scope / out of scope.**

In scope: one-record proof, secure designation, exact read/preview/confirm/execute/readback/receipt,
reconciliation, rollback, action-key readback, and incident evidence. Out of scope: enabling general
renewal writes, adding endpoints/fields, using a fake record, bulk operations, deleting/creating
charges, status changes, Sheet writeback, direct communication, or inferring authorization from S72
completion.

**Open questions & assumptions.**

Client/Admin must still designate the exact record and allowed field/charge outside Git and explicitly
direct the protected closed-to-open key review. Until then only dry preview/discrepancy examples are
allowed.

**Cross-product impacts.**

S72 final substeps, RentVine client/config, external-execution ledger, Action Registry/protected seed,
Admin readiness, receipts/reconciliation/rollback, incident runbook, facts, and client checklist.

**Authority and evidence map.**

| Input                                                                                                                               | Classification                | Use and limitation                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` current action inventory, protected paths, live-write policy, and exact-effect rules                                    | Authority                     | The RentVine renewal-write key is closed; a live proof needs a separately explicit record/field and owner-directed protected review, and must be previewed, confirmed, idempotent, receipted, read back, reversible, and restored closed. |
| `docs/facts.md` and live read-only action/config readback                                                                           | Present authority/truth       | No designated proof record or live write proof exists; credentials being bound or reads working does not prove write authority.                                                                                                           |
| RentVine write client/executor, writeback contract/proposal/execution ledger, route/service tests, and reconciliation/rollback code | Verified implementation truth | Narrow documented request shapes and dry seams exist; no production caller may bypass the exact one-record lifecycle.                                                                                                                     |
| Writeback safety/route/approval/executor/provider and action-inventory tests                                                        | Verification baseline         | They anchor closed-key and narrow-shape behavior; any new secure designation/caller/readback/rollback orchestration must fail first without widening the seam.                                                                            |
| Meeting property/test-record discussion                                                                                             | Intent evidence only          | It shows desire to prove the seam but is not exact write authorization and cannot supply a fake identity, record id, field, or value.                                                                                                     |
| Exact client designation and explicit protected owner direction                                                                     | External authority/input      | Their absence terminally blocks only the live effect. No identity/value may be committed to this spec or Git.                                                                                                                             |

**Architecture outcome (deterministic, fail-first).**

- **ARCH-S30-1** — The executable boundary exposes only the two documented request shapes and exact
  allowlisted fields; static/schema tests reject generic method/path/body, delete, create-charge,
  status, bulk, and second-record operations.
- **ARCH-S30-2** — One execution identity binds actor, exact record/field, fresh before-state,
  proposed payload, preview hash, idempotency, provider receipt/readback, and rollback target; uncertain
  effects reconcile by exact identity rather than retry.
- **ARCH-S30-3** — Closed key, runtime suspension, missing designation, stale state, or unmatched
  confirmation refuses before provider construction; protected-path and action-inventory checks stay
  exact-key scoped.

**Behavior outcome (deterministic, fail-first).**

- **BEH-S30-1** — With current closed authority, every preview may remain dry but every execution
  attempt returns the exact closed-action refusal and performs zero provider writes.
- **BEH-S30-2** — In a controlled provider-bound test, confirming the unchanged preview performs at
  most one write, reads back the exact value, records a receipt, and duplicate confirmation returns
  the same outcome without a second write.
- **BEH-S30-3** — Exact rollback restores and re-reads the captured prior value. Timeout/ambiguous
  response blocks new execution and exposes reconciliation/recovery instead of declaring success.
- **BEH-S30-4** — A changed record/value/state/actor/payload, wrong account, missing backup, unsupported
  field, or second target invalidates confirmation and writes nothing.

**Human litmus outcome.**

### Prove and reverse one exact RentVine update

**If this was built correctly:** After separately authorizing one unmistakable record and field, the
operator sees the exact before/change/rollback, confirms once, sees provider proof of the change, then
confirms rollback and sees the original value restored. No other record can be selected or changed.

- Model verdict: PASS | FAIL - why: completed by the implementation runner with evidence.
- Human verdict: PASS | FAIL - why:

**Requirement-to-outcome traceability.**

| Requirement                                                        | Architecture outcome       | Behavior outcome         | Human litmus                                                       | Deterministic evidence / falsification                                                                                                              |
| ------------------------------------------------------------------ | -------------------------- | ------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| No generic, second-record, or unsupported write is reachable       | `ARCH-S30-1`, `ARCH-S30-3` | `BEH-S30-1`, `BEH-S30-4` | Prove and reverse one exact RentVine update                        | Static/schema/provider-spy tables reject every method/path/field/target expansion and prove closed authority stops before construction.             |
| One exact confirmed attempt has complete evidence                  | `ARCH-S30-2`               | `BEH-S30-2`              | Operator sees before, proposed change, receipt, and exact readback | Contract tests bind actor/record/field/before/after/hash/idempotency/receipt/readback and prove duplicate confirmation returns the same result.     |
| Uncertain effect reconciles without blind retry                    | `ARCH-S30-2`, `ARCH-S30-3` | `BEH-S30-3`, `BEH-S30-4` | Uncertainty produces recovery, not a second change                 | Timeout/ambiguous/stale/wrong-account/wrong-actor fixtures prove no new provider call and exact reconciliation state.                               |
| Rollback restores provider state and the action key returns closed | `ARCH-S30-2`, `ARCH-S30-3` | `BEH-S30-3`              | Original value and closed action are both read back                | Controlled proof evidence requires before/change/readback/rollback/readback plus post-proof exact-key closed readback; either missing result fails. |

**Preservation set.**

Current closed production key, exact account/managed identity, allowed method/path/field tests, dry
preview, runtime suspension, external-execution idempotency/reconciliation, secret/PII redaction,
Sheet/send prohibitions, and all read-only renewal paths remain green as a separate gate.

**Adversarial acceptance checks.**

- **AC-S30-1** — `ARCH-S30-1/3` and `BEH-S30-1` prove current Production cannot construct a write.
- **AC-S30-2** — `ARCH-S30-2` and `BEH-S30-2` bind one attempt to exact before/after/readback evidence
  and prove duplicate confirmation cannot duplicate the effect.
- **AC-S30-3** — `BEH-S30-3` proves rollback restores the exact prior provider state and ambiguous
  outcomes cannot be overwritten by retry.
- **AC-S30-4** — `BEH-S30-4` proves stale/mismatched/unsupported/second-record variants all refuse.
- **AC-S30-5** — Any `production_allowed` change is separately owner-directed, reviewed, read back,
  and handled under the protected-path rule; this suite alone never authorizes it.

**Forbidden actions / hard gates.**

No write before exact designation and protected review; no guessed id/endpoint/field/value, fake or
sample record, broad route, delete, new charge, status change, bulk/second-record write, blind retry,
personal identity, operating-Sheet write, or client send.

**Dependencies / sequencing.**

The dry/fail-closed portions are independently implementable and testable. A live proof is terminally
blocked until the external designation and exact protected owner direction exist. S72 may prepare a
write preview but can never treat process completion as S30 authority.

**Standalone delivery contract.**

- **Deliverable now:** exact one-record secure-input contract, allowlisted caller boundary, dry
  preview/hash/confirmation, idempotency ledger, provider readback/reconciliation, rollback preview,
  mandatory post-proof closed-gate protocol, closed/suspended/missing-input refusals, and deterministic
  fixtures can reach implementation `ALL_GATES_GREEN` while Production remains closed.
- **Consumes, but does not assume:** S72 may hand off an exact reviewed proposal; S30 independently
  re-reads provider state and authority and never trusts process completion as confirmation.
- **Externally blocked effect:** AC-S30-2/3 and the live human litmus remain `BLOCKED` until one exact
  client-designated record/field/value, secure operator input, fresh backup, proven endpoint/mapping,
  and explicit protected owner direction exist. Missing any one prerequisite forbids the live attempt.
- **Produces for downstream operation:** a review-ready protected one-key patch, exact proof/rollback
  runbook, bodyless receipt/readback format, incident/reconciliation path, and mandatory closed-state
  readback. It does not produce general write authority.

**Verification and delivery contract.**

1. Before editing, read back current closed action/config and make secure-caller/designation/
   orchestration tests fail only for their missing code; freeze narrow-shape, closed-key, idempotency,
   reconciliation, rollback, read-only, and send/Sheet preservation.
2. Run `npm run test:direct -- tests/unit/rentvine-renewal-executor.test.ts tests/unit/lease-renewal-writeback-safety.test.ts tests/unit/lease-renewal-writeback-route.test.ts tests/unit/lease-renewal-writeback-approvals.test.ts tests/unit/lease-renewal-execution.test.ts` plus new one-record/gate-restoration tests, then `bash scripts/verify.sh`.
3. Audit the diff/protected paths, secrets/PII, method/path/field allowlist, target cardinality,
   idempotency, before/after values, backup, rollback, logs, action readback, and every unrelated source/
   send boundary. Keep all record/value evidence outside Git.
4. Report implementation `ALL_GATES_GREEN` separately from live proof. Use `BUDGET_EXHAUSTED` only
   for an explicit budget. Until every external prerequisite exists, report the live ACs `BLOCKED` and
   stop before provider construction; after proof, failure to restore/read back closed is an incident,
   not completion.

**Ordered prompt sequence.**

1. Re-read live config/action state and obtain the exact designation/field through the secure
   operator channel; stop if any prerequisite is absent.
2. Freeze closed-key, schema, idempotency, reconciliation, read-only, and rollback preservation.
3. Build/review the one-record preview and protected one-key patch without executing it.
4. Only under separate explicit direction, open/read back the exact key, execute/verify/rollback/
   verify once, restore/read back **closed**, and record only non-secret bodyless facts. Any proposal
   for later activation is a new separately authorized change.

**Deletion/merge recommendation.**

Remove only after the one-record live proof and rollback are complete, the exact key is restored and
read back closed, and the durable write contract is represented in code, tests, facts, and incident/
provider documentation.
